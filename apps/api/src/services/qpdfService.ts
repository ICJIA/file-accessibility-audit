import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ANALYSIS } from '#config'

const QPDF_BIN = process.env.QPDF_PATH || (() => {
  try { execFileSync('qpdf', ['--version'], { stdio: 'ignore' }); return 'qpdf' } catch {}
  try { execFileSync('/opt/homebrew/bin/qpdf', ['--version'], { stdio: 'ignore' }); return '/opt/homebrew/bin/qpdf' } catch {}
  try { execFileSync('/usr/local/bin/qpdf', ['--version'], { stdio: 'ignore' }); return '/usr/local/bin/qpdf' } catch {}
  return 'qpdf'
})()

export interface ListAnalysis {
  itemCount: number
  hasLabels: boolean
  hasBodies: boolean
  isWellFormed: boolean
  nestingDepth: number
}

export interface TableAnalysis {
  hasHeaders: boolean
  headerCount: number
  dataCellCount: number
  hasScope: boolean
  scopeMissingCount: number
  hasRowStructure: boolean
  rowCount: number
  hasNestedTable: boolean
  hasCaption: boolean
  hasConsistentColumns: boolean | null
  columnCounts: number[]
  hasHeaderAssociation: boolean
}

export interface QpdfResult {
  hasStructTree: boolean
  hasLang: boolean
  lang: string | null
  hasOutlines: boolean
  outlineCount: number
  outlineTitles: string[]
  hasAcroForm: boolean
  formFields: Array<{ hasTU: boolean; name?: string }>
  images: Array<{ ref: string; hasAlt: boolean; altText?: string }>
  headings: Array<{ level: string; tag: string }>
  tables: TableAnalysis[]
  lists: ListAnalysis[]
  paragraphCount: number
  hasMarkInfo: boolean
  isMarkedContent: boolean
  hasRoleMap: boolean
  roleMapEntries: string[]
  tabOrderPages: number
  totalPageCount: number
  langSpans: Array<{ lang: string; tag: string }>
  fonts: Array<{ name: string; embedded: boolean }>
  structTreeDepth: number
  contentOrder: number[] // MCIDs in structure tree order
  error: string | null
}

/**
 * Decode a QPDF-encoded string.  QPDF prefixes Unicode strings with "u:" and
 * byte strings with "b:" (hex-encoded).  For "b:" strings we attempt to decode
 * the hex as UTF-16BE (common PDF encoding for /Alt values), falling back to
 * the raw hex if decoding fails.
 */
function decodeQpdfString(raw: string): string {
  if (raw.startsWith('u:')) return raw.slice(2)
  if (raw.startsWith('b:')) {
    const hex = raw.slice(2)
    try {
      // Convert hex to bytes
      const bytes = Buffer.from(hex, 'hex')
      // Check for UTF-16BE BOM (fe ff)
      if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        // UTF-16BE needs byte-swapping for Node's utf16le decoder
        const content = bytes.slice(2)
        const swapped = Buffer.alloc(content.length)
        for (let i = 0; i < content.length - 1; i += 2) {
          swapped[i] = content[i + 1]
          swapped[i + 1] = content[i]
        }
        const decoded = swapped.toString('utf16le').replace(/\0+$/, '')
        return decoded || raw
      }
      // Try plain UTF-8
      const decoded = bytes.toString('utf8')
      // If most chars are printable, use it
      const printable = decoded.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '').length
      if (decoded.length > 0 && printable / decoded.length > 0.5) {
        return decoded.replace(/\0+$/, '')
      }
    } catch {
      // Fall through to return raw
    }
    return raw // Keep "b:..." so detectSuspiciousAltText can flag it
  }
  return raw
}

export function analyzeWithQpdf(buffer: Buffer): QpdfResult {
  const tmpDir = process.env.TMP_DIR || '/tmp'
  const tmpPath = path.join(tmpDir, `${randomUUID()}.pdf`)

  try {
    fs.writeFileSync(tmpPath, buffer)

    const stdout = execFileSync(QPDF_BIN, ['--json', tmpPath], {
      timeout: ANALYSIS.QPDF_TIMEOUT_MS,
      maxBuffer: ANALYSIS.QPDF_MAX_BUFFER,
      encoding: 'utf-8',
    })

    const json = JSON.parse(stdout)
    return parseQpdfJson(json)
  } catch (err: any) {
    // Check for password-protected PDF
    if (err.stderr?.includes('encrypted') || err.message?.includes('encrypted')) {
      throw new Error('encrypted')
    }
    // Check for timeout
    if (err.killed || err.signal === 'SIGTERM') {
      const error = new Error('QPDF timeout') as any
      error.killed = true
      throw error
    }
    // Return partial result with error
    return {
      hasStructTree: false,
      hasLang: false,
      lang: null,
      hasOutlines: false,
      outlineCount: 0,
      outlineTitles: [],
      hasAcroForm: false,
      formFields: [],
      images: [],
      headings: [],
      tables: [],
      lists: [],
      paragraphCount: 0,
      hasMarkInfo: false,
      isMarkedContent: false,
      hasRoleMap: false,
      roleMapEntries: [],
      tabOrderPages: 0,
      totalPageCount: 0,
      langSpans: [],
      fonts: [],
      structTreeDepth: 0,
      contentOrder: [],
      error: 'QPDF parsing failed',
    }
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }
}

function parseQpdfJson(json: any): QpdfResult {
  const result: QpdfResult = {
    hasStructTree: false,
    hasLang: false,
    lang: null,
    hasOutlines: false,
    outlineCount: 0,
    outlineTitles: [],
    hasAcroForm: false,
    formFields: [],
    images: [],
    headings: [],
    tables: [],
    lists: [],
    paragraphCount: 0,
    hasMarkInfo: false,
    isMarkedContent: false,
    hasRoleMap: false,
    roleMapEntries: [],
    tabOrderPages: 0,
    totalPageCount: 0,
    langSpans: [],
    fonts: [],
    structTreeDepth: 0,
    contentOrder: [],
    error: null,
  }

  try {
    const rawObjects = json.objects || json.qpdf?.[1] || {}

    // QPDF v2 JSON wraps objects as { value: {...}, stream?: {...} }
    // Normalize so we always work with the inner value.
    const objects: Record<string, any> = {}
    for (const [ref, raw] of Object.entries(rawObjects)) {
      if (!raw || typeof raw !== 'object') continue
      objects[ref] = (raw as any).value ?? raw
    }

    // Walk all objects looking for key structures
    for (const [ref, obj] of Object.entries(objects)) {
      if (!obj || typeof obj !== 'object') continue
      const o = obj as any

      // Check for StructTreeRoot
      if (o['/Type'] === '/StructTreeRoot' || o['/StructTreeRoot']) {
        result.hasStructTree = true
      }

      // Check catalog for StructTreeRoot, Lang, Outlines, MarkInfo, RoleMap
      if (o['/Type'] === '/Catalog') {
        if (o['/StructTreeRoot']) result.hasStructTree = true
        if (o['/Lang']) {
          result.hasLang = true
          // Strip QPDF "u:" Unicode prefix (e.g., "u:EN-US" → "EN-US")
          const rawLang = typeof o['/Lang'] === 'string' ? o['/Lang'] : null
          result.lang = rawLang?.replace(/^u:/, '') ?? null
        }
        if (o['/Outlines']) result.hasOutlines = true
        if (o['/AcroForm']) result.hasAcroForm = true
        // MarkInfo — indicates document distinguishes marked content from artifacts
        if (o['/MarkInfo']) {
          result.hasMarkInfo = true
          const markInfo = typeof o['/MarkInfo'] === 'string'
            ? resolveRef(o['/MarkInfo'], objects) : o['/MarkInfo']
          if (markInfo?.['/Marked'] === true) {
            result.isMarkedContent = true
          }
        }
        // RoleMap — custom tag role mappings to standard PDF tags
        if (o['/RoleMap'] || (o['/StructTreeRoot'] && typeof o['/StructTreeRoot'] === 'string')) {
          // RoleMap may be on catalog or on StructTreeRoot
          const roleMap = o['/RoleMap']
          if (roleMap && typeof roleMap === 'object') {
            result.hasRoleMap = true
            result.roleMapEntries = Object.keys(roleMap)
              .filter(k => k.startsWith('/'))
              .map(k => `${k.slice(1)} → ${typeof roleMap[k] === 'string' ? roleMap[k].slice(1) : '?'}`)
          }
        }
      }

      // Check StructTreeRoot for RoleMap (often lives here rather than catalog)
      if (o['/Type'] === '/StructTreeRoot' && o['/RoleMap']) {
        const roleMap = o['/RoleMap']
        if (typeof roleMap === 'object' && !result.hasRoleMap) {
          result.hasRoleMap = true
          result.roleMapEntries = Object.keys(roleMap)
            .filter(k => k.startsWith('/'))
            .map(k => `${k.slice(1)} → ${typeof roleMap[k] === 'string' ? roleMap[k].slice(1) : '?'}`)
        }
      }

      // Page objects — check for /Tabs (tab order) and count pages
      if (o['/Type'] === '/Page') {
        result.totalPageCount++
        if (o['/Tabs']) {
          result.tabOrderPages++
        }
      }

      // Font descriptors — check embedding
      if (o['/Type'] === '/FontDescriptor') {
        const fontName = typeof o['/FontName'] === 'string'
          ? o['/FontName'].replace(/^\//, '').replace(/^u:/, '') : 'Unknown'
        const embedded = !!(o['/FontFile'] || o['/FontFile2'] || o['/FontFile3'])
        result.fonts.push({ name: fontName, embedded })
      }

      // Count outline entries and collect titles
      if (o['/Type'] === '/Outlines' || (o['/First'] && o['/Last'] && !o['/Parent'])) {
        const titles: string[] = []
        result.outlineCount = countOutlineEntries(o, objects, titles)
        result.outlineTitles = titles
      }

      // Image XObjects
      if (o['/Subtype'] === '/Image' || o['/Subtype'] === '/Form') {
        if (o['/Subtype'] === '/Image') {
          result.images.push({ ref, hasAlt: false })
        }
      }

      // Structure elements (headings, tables, figures with alt)
      if (o['/S']) {
        const tag = o['/S']
        // Headings
        if (tag === '/H' || tag === '/H1' || tag === '/H2' || tag === '/H3' ||
            tag === '/H4' || tag === '/H5' || tag === '/H6') {
          result.headings.push({ level: tag.replace('/', ''), tag })
        }
        // Tables
        if (tag === '/Table') {
          result.tables.push(analyzeTable(o, objects))
        }
        // Lists
        if (tag === '/L') {
          result.lists.push(analyzeList(o, objects))
        }
        // Paragraphs
        if (tag === '/P') {
          result.paragraphCount++
        }
        // Language spans — structure elements with their own /Lang
        if (o['/Lang'] && tag !== '/Document') {
          const spanLang = typeof o['/Lang'] === 'string' ? o['/Lang'].replace(/^u:/, '') : null
          if (spanLang) {
            result.langSpans.push({ lang: spanLang, tag: tag.slice(1) })
          }
        }
        // Figures with alt text
        if (tag === '/Figure') {
          const rawAlt = o['/Alt']
          const altText = typeof rawAlt === 'string' ? decodeQpdfString(rawAlt) : undefined
          const hasAlt = altText !== undefined && altText !== ''
          // Try to match to an image
          if (result.images.length > 0) {
            const unmatched = result.images.find(img => !img.hasAlt)
            if (unmatched && hasAlt) {
              unmatched.hasAlt = true
              unmatched.altText = altText
            }
          }
          // Also add as a standalone figure check
          if (!result.images.some(img => img.ref === ref)) {
            result.images.push({ ref, hasAlt, altText })
          }
        }

        // Collect MCIDs for reading order
        collectMCIDs(o, result.contentOrder)
      }

      // Form fields
      if (o['/Type'] === '/Annot' && o['/Subtype'] === '/Widget') {
        const name = typeof o['/T'] === 'string' ? o['/T'].replace(/^u:/, '') : undefined
        result.formFields.push({ hasTU: !!o['/TU'], name })
      }
    }

    // Also check for form fields via AcroForm
    if (result.hasAcroForm) {
      for (const [_ref, obj] of Object.entries(objects)) {
        const o = obj as any
        if (o?.['/AcroForm']?.['/Fields']) {
          const fieldRefs = o['/AcroForm']['/Fields']
          if (Array.isArray(fieldRefs)) {
            // If we didn't find fields via widget annotations, count from AcroForm
            if (result.formFields.length === 0) {
              for (const fieldRef of fieldRefs) {
                const fieldKey = typeof fieldRef === 'string' ? fieldRef : fieldRef?.toString()
                const field = objects[fieldKey] as any
                if (field) {
                  result.formFields.push({ hasTU: !!field['/TU'] })
                }
              }
            }
          }
        }
      }
    }

    // Calculate structure tree depth
    if (result.hasStructTree) {
      result.structTreeDepth = calculateTreeDepth(objects)
    }

  } catch (err) {
    console.error('QPDF JSON parse error:', err)
    result.error = 'Failed to parse QPDF structure data'
  }

  return result
}

// Resolve a ref like "9 0 R" to its object, trying both "obj:9 0 R" and "9 0 R" key formats
function resolveRef(ref: string, objects: any): any {
  if (!ref || typeof ref !== 'string') return null
  return objects[ref] ?? objects[`obj:${ref}`] ?? null
}

function countOutlineEntries(outline: any, objects: any, titles: string[]): number {
  let count = 0
  const visited = new Set<string>()

  const walk = (node: any, depth: number) => {
    let current = node['/First']
    while (current && typeof current === 'string' && !visited.has(current)) {
      visited.add(current)
      count++
      const entry = resolveRef(current, objects)
      if (!entry) break
      const title = typeof entry['/Title'] === 'string' ? entry['/Title'].replace(/^u:/, '') : ''
      if (title && titles.length < 50) {
        titles.push('  '.repeat(depth) + title)
      }
      // Count nested children recursively
      if (entry['/First']) walk(entry, depth + 1)
      current = entry['/Next']
    }
  }

  walk(outline, 0)
  return count
}

function analyzeTable(tableObj: any, objects: any): TableAnalysis {
  const result: TableAnalysis = {
    hasHeaders: false,
    headerCount: 0,
    dataCellCount: 0,
    hasScope: false,
    scopeMissingCount: 0,
    hasRowStructure: false,
    rowCount: 0,
    hasNestedTable: false,
    hasCaption: false,
    hasConsistentColumns: null,
    columnCounts: [],
    hasHeaderAssociation: false,
  }

  const kids = tableObj['/K']
  if (!kids) return result

  // Resolve a node that may be a ref string or inline object
  const resolve = (node: any): any => {
    if (typeof node === 'string') return resolveRef(node, objects)
    return node && typeof node === 'object' ? node : null
  }

  // Get the tag of a node
  const getTag = (node: any): string | null => {
    const resolved = resolve(node)
    return resolved?.['/S'] || null
  }

  // Check if a TH node has a /Scope attribute
  const hasNodeScope = (node: any): boolean => {
    const resolved = resolve(node)
    if (!resolved) return false
    const attrs = resolved['/A']
    if (!attrs) return false
    // /A can be a single dict, a ref, or an array
    const checkAttr = (a: any): boolean => {
      const r = resolve(a)
      return r?.['/Scope'] === '/Column' || r?.['/Scope'] === '/Row'
    }
    if (Array.isArray(attrs)) return attrs.some(checkAttr)
    return checkAttr(attrs)
  }

  // Check if a TD node has /Headers association
  const hasNodeHeaders = (node: any): boolean => {
    const resolved = resolve(node)
    if (!resolved) return false
    if (resolved['/Headers']) return true
    const attrs = resolved['/A']
    if (!attrs) return false
    const checkAttr = (a: any): boolean => {
      const r = resolve(a)
      return !!r?.['/Headers']
    }
    if (Array.isArray(attrs)) return attrs.some(checkAttr)
    return checkAttr(attrs)
  }

  // Count cells in a TR row
  const countRowCells = (trNode: any): number => {
    const resolved = resolve(trNode)
    const rowKids = resolved?.['/K']
    if (!rowKids) return 0
    const items = Array.isArray(rowKids) ? rowKids : [rowKids]
    let count = 0
    for (const item of items) {
      const tag = getTag(item)
      if (tag === '/TH' || tag === '/TD') count++
    }
    return count
  }

  // Walk the table subtree collecting all signals in a single pass
  const walk = (node: any, depth: number): void => {
    if (depth > 15 || !node) return
    const resolved = resolve(node)
    if (!resolved) return
    const tag = resolved['/S']

    if (tag === '/TH') {
      result.headerCount++
      if (hasNodeScope(resolved)) {
        result.hasScope = true
      } else {
        result.scopeMissingCount++
      }
    }
    if (tag === '/TD') {
      result.dataCellCount++
      if (hasNodeHeaders(resolved)) {
        result.hasHeaderAssociation = true
      }
    }
    if (tag === '/Table' && depth > 0) {
      result.hasNestedTable = true
    }
    if (tag === '/Caption') {
      result.hasCaption = true
    }

    // Recurse into children
    const childKids = resolved['/K']
    if (!childKids) return
    const items = Array.isArray(childKids) ? childKids : [childKids]
    for (const item of items) {
      if (typeof item === 'number' || (item && typeof item === 'object' && item['/MCID'] !== undefined)) continue
      walk(item, depth + 1)
    }
  }

  // Walk the entire table subtree
  walk(tableObj, 0)

  result.hasHeaders = result.headerCount > 0
  // hasScope is true only when ALL TH have scope
  if (result.headerCount > 0 && result.scopeMissingCount === 0) {
    result.hasScope = true
  } else {
    result.hasScope = false
    if (result.headerCount === 0) result.scopeMissingCount = 0
  }

  // Check row structure: direct children of table should be TR (or THead/TBody/TFoot containing TR)
  const directKids = Array.isArray(kids) ? kids : [kids]
  let trCount = 0
  let sectionCount = 0
  for (const kid of directKids) {
    const tag = getTag(kid)
    if (tag === '/TR') trCount++
    if (tag === '/THead' || tag === '/TBody' || tag === '/TFoot') {
      sectionCount++
      // Check for TR inside section
      const sectionResolved = resolve(kid)
      const sectionKids = sectionResolved?.['/K']
      if (sectionKids) {
        const sItems = Array.isArray(sectionKids) ? sectionKids : [sectionKids]
        for (const s of sItems) {
          if (getTag(s) === '/TR') trCount++
        }
      }
    }
  }
  result.rowCount = trCount
  result.hasRowStructure = trCount > 0

  // Column consistency: count cells per TR
  const countTRCells = (trNode: any): void => {
    result.columnCounts.push(countRowCells(trNode))
  }

  // Gather all TRs (from direct children or inside THead/TBody/TFoot)
  for (const kid of directKids) {
    const tag = getTag(kid)
    if (tag === '/TR') {
      countTRCells(kid)
    } else if (tag === '/THead' || tag === '/TBody' || tag === '/TFoot') {
      const sectionResolved = resolve(kid)
      const sectionKids = sectionResolved?.['/K']
      if (sectionKids) {
        const sItems = Array.isArray(sectionKids) ? sectionKids : [sectionKids]
        for (const s of sItems) {
          if (getTag(s) === '/TR') countTRCells(s)
        }
      }
    }
  }

  if (result.columnCounts.length > 0) {
    const first = result.columnCounts[0]
    result.hasConsistentColumns = result.columnCounts.every(c => c === first)
  }

  return result
}

function analyzeList(listObj: any, objects: any): ListAnalysis {
  const result: ListAnalysis = {
    itemCount: 0,
    hasLabels: false,
    hasBodies: false,
    isWellFormed: false,
    nestingDepth: 0,
  }

  const resolve = (node: any): any => {
    if (typeof node === 'string') return resolveRef(node, objects)
    return node && typeof node === 'object' ? node : null
  }

  let maxNesting = 0
  let itemsWithLabel = 0
  let itemsWithBody = 0

  const walk = (node: any, depth: number, isCountingNesting: boolean): void => {
    if (depth > 15 || !node) return
    const resolved = resolve(node)
    if (!resolved) return
    const tag = resolved['/S']

    if (tag === '/LI') {
      result.itemCount++
      // Check children for /Lbl and /LBody
      let hasLbl = false
      let hasLBody = false
      const kids = resolved['/K']
      if (kids) {
        const items = Array.isArray(kids) ? kids : [kids]
        for (const kid of items) {
          const kidResolved = resolve(kid)
          if (kidResolved?.['/S'] === '/Lbl') { hasLbl = true; result.hasLabels = true }
          if (kidResolved?.['/S'] === '/LBody') { hasLBody = true; result.hasBodies = true }
        }
      }
      if (hasLbl) itemsWithLabel++
      if (hasLBody) itemsWithBody++
    }

    if (tag === '/L' && isCountingNesting) {
      maxNesting = Math.max(maxNesting, depth)
    }

    const childKids = resolved['/K']
    if (!childKids) return
    const items = Array.isArray(childKids) ? childKids : [childKids]
    for (const item of items) {
      if (typeof item === 'number' || (item && typeof item === 'object' && item['/MCID'] !== undefined)) continue
      walk(item, depth + 1, true)
    }
  }

  walk(listObj, 0, false)
  result.nestingDepth = maxNesting
  result.isWellFormed = result.itemCount > 0 && itemsWithLabel === result.itemCount && itemsWithBody === result.itemCount

  return result
}

function collectMCIDs(obj: any, mcids: number[]): void {
  const kids = obj['/K']
  if (kids === undefined) return
  if (typeof kids === 'number') {
    mcids.push(kids)
    return
  }
  if (Array.isArray(kids)) {
    for (const kid of kids) {
      if (typeof kid === 'number') {
        mcids.push(kid)
      } else if (kid && typeof kid === 'object') {
        if (kid['/MCID'] !== undefined) {
          mcids.push(kid['/MCID'])
        }
        collectMCIDs(kid, mcids)
      }
    }
  }
}

function calculateTreeDepth(objects: any): number {
  let maxDepth = 0

  const measure = (node: any, depth: number): void => {
    if (depth > 50) return // safety limit
    maxDepth = Math.max(maxDepth, depth)
    const kids = node?.['/K']
    if (!kids) return
    if (Array.isArray(kids)) {
      for (const kid of kids) {
        if (typeof kid === 'string') {
          const child = resolveRef(kid, objects)
          if (child) measure(child, depth + 1)
        } else if (kid && typeof kid === 'object') {
          measure(kid, depth + 1)
        }
      }
    } else if (typeof kids === 'string') {
      const child = resolveRef(kids, objects)
      if (child) measure(child, depth + 1)
    }
  }

  for (const obj of Object.values(objects)) {
    if ((obj as any)?.['/Type'] === '/StructTreeRoot') {
      measure(obj, 0)
      break
    }
  }

  return maxDepth
}
