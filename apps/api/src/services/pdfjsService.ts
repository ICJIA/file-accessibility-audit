export interface PdfjsResult {
  pageCount: number
  hasText: boolean
  textLength: number
  title: string | null
  author: string | null
  subject: string | null
  lang: string | null
  hasOutlines: boolean
  outlineCount: number
  links: Array<{ url: string; text: string }>
  error: string | null
}

export async function analyzeWithPdfjs(buffer: Buffer): Promise<PdfjsResult> {
  // Dynamic import since pdfjs-dist is ESM-heavy
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const result: PdfjsResult = {
    pageCount: 0,
    hasText: false,
    textLength: 0,
    title: null,
    author: null,
    subject: null,
    lang: null,
    hasOutlines: false,
    outlineCount: 0,
    links: [],
    error: null,
  }

  try {
    const data = new Uint8Array(buffer)
    const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise

    result.pageCount = doc.numPages

    // Metadata
    const metadata = await doc.getMetadata()
    const info = metadata?.info as any
    if (info) {
      result.title = info.Title || null
      result.author = info.Author || null
      result.subject = info.Subject || null
      result.lang = info.Language || null
    }

    // Check if title looks like a filename (not useful for accessibility)
    if (result.title) {
      const t = result.title.toLowerCase()
      if (t.endsWith('.pdf') || t.endsWith('.docx') || /^[a-z0-9_-]+$/.test(t)) {
        result.title = null // Treat filename-like titles as absent
      }
    }

    // Outlines/bookmarks
    try {
      const outline = await doc.getOutline()
      if (outline && outline.length > 0) {
        result.hasOutlines = true
        result.outlineCount = outline.length
      }
    } catch {}

    // Extract text and links from all pages
    let totalText = ''
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)

      // Text content
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ')
      totalText += pageText + ' '

      // Link annotations
      try {
        const annotations = await page.getAnnotations()
        for (const annot of annotations) {
          if (annot.subtype === 'Link' && annot.url) {
            // Find the text content near this link's position
            const linkText = findLinkText(annot, textContent.items) || annot.url
            result.links.push({ url: annot.url, text: linkText })
          }
        }
      } catch {}
    }

    result.textLength = totalText.trim().length
    result.hasText = result.textLength > 50 // Minimum meaningful text

    await doc.destroy()
  } catch (err) {
    console.error('pdfjs-dist error:', err)
    result.error = 'pdfjs-dist parsing failed'
  }

  return result
}

function findLinkText(annot: any, textItems: any[]): string {
  if (!annot.rect || !textItems) return ''

  const [x1, y1, x2, y2] = annot.rect
  const matchingTexts: string[] = []

  for (const item of textItems) {
    if (!item.transform) continue
    const tx = item.transform[4]
    const ty = item.transform[5]

    // Check if text item overlaps with link rect (with some tolerance)
    if (tx >= x1 - 5 && tx <= x2 + 5 && ty >= y1 - 5 && ty <= y2 + 5) {
      if (item.str?.trim()) {
        matchingTexts.push(item.str.trim())
      }
    }
  }

  return matchingTexts.join(' ')
}
