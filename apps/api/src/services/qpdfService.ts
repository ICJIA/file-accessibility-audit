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

export interface QpdfResult {
  hasStructTree: boolean
  hasLang: boolean
  lang: string | null
  hasOutlines: boolean
  outlineCount: number
  hasAcroForm: boolean
  formFields: Array<{ hasTU: boolean }>
  images: Array<{ ref: string; hasAlt: boolean }>
  headings: Array<{ level: string; tag: string }>
  tables: Array<{ hasHeaders: boolean }>
  structTreeDepth: number
  contentOrder: number[] // MCIDs in structure tree order
  error: string | null
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
      hasAcroForm: false,
      formFields: [],
      images: [],
      headings: [],
      tables: [],
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
    hasAcroForm: false,
    formFields: [],
    images: [],
    headings: [],
    tables: [],
    structTreeDepth: 0,
    contentOrder: [],
    error: null,
  }

  try {
    const objects = json.objects || json.qpdf?.[1] || {}

    // Walk all objects looking for key structures
    for (const [ref, obj] of Object.entries(objects)) {
      if (!obj || typeof obj !== 'object') continue
      const o = obj as any

      // Check for StructTreeRoot
      if (o['/Type'] === '/StructTreeRoot' || o['/StructTreeRoot']) {
        result.hasStructTree = true
      }

      // Check catalog for StructTreeRoot, Lang, Outlines
      if (o['/Type'] === '/Catalog') {
        if (o['/StructTreeRoot']) result.hasStructTree = true
        if (o['/Lang']) {
          result.hasLang = true
          result.lang = typeof o['/Lang'] === 'string' ? o['/Lang'] : null
        }
        if (o['/Outlines']) result.hasOutlines = true
        if (o['/AcroForm']) result.hasAcroForm = true
      }

      // Count outline entries
      if (o['/Type'] === '/Outlines' || (o['/First'] && o['/Last'] && !o['/Parent'])) {
        result.outlineCount = countOutlineEntries(o, objects)
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
          const hasHeaders = hasTableHeaders(o, objects)
          result.tables.push({ hasHeaders })
        }
        // Figures with alt text
        if (tag === '/Figure') {
          const alt = o['/Alt']
          const hasAlt = alt !== undefined && alt !== null && alt !== ''
          // Try to match to an image
          if (result.images.length > 0) {
            // Mark the most recent unmatched image as having alt
            const unmatched = result.images.find(img => !img.hasAlt)
            if (unmatched && hasAlt) {
              unmatched.hasAlt = true
            }
          }
          // Also add as a standalone figure check
          if (!result.images.some(img => img.ref === ref)) {
            result.images.push({ ref, hasAlt })
          }
        }

        // Collect MCIDs for reading order
        collectMCIDs(o, result.contentOrder)
      }

      // Form fields
      if (o['/Type'] === '/Annot' && o['/Subtype'] === '/Widget') {
        result.formFields.push({ hasTU: !!o['/TU'] })
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

function countOutlineEntries(outline: any, objects: any): number {
  let count = 0
  let current = outline['/First']
  const visited = new Set<string>()
  while (current && typeof current === 'string' && !visited.has(current)) {
    visited.add(current)
    count++
    const entry = objects[current] as any
    if (!entry) break
    current = entry['/Next']
  }
  return count
}

function hasTableHeaders(tableObj: any, objects: any): boolean {
  // Look through children for /TH tags
  const kids = tableObj['/K']
  if (!kids) return false

  const checkForTH = (node: any, depth: number): boolean => {
    if (depth > 10) return false
    if (Array.isArray(node)) {
      return node.some(n => checkForTH(n, depth + 1))
    }
    if (typeof node === 'string') {
      const obj = objects[node] as any
      if (obj?.['/S'] === '/TH') return true
      return checkForTH(obj?.['/K'], depth + 1)
    }
    if (node && typeof node === 'object') {
      if (node['/S'] === '/TH') return true
      return checkForTH(node['/K'], depth + 1)
    }
    return false
  }

  return checkForTH(kids, 0)
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
          measure(objects[kid] as any, depth + 1)
        } else if (kid && typeof kid === 'object') {
          measure(kid, depth + 1)
        }
      }
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
