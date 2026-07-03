import { readFileSync } from 'node:fs'

const GRAPHQL_URL = 'https://agency.icjia-api.cloud/graphql'
const PAGE_SIZE = 500

// Document types the accessibility scoring engine can audit end-to-end via
// analyzeDocument's content-sniffing dispatcher (apps/api/src/services/
// analyzer.ts) — the same four-extension allowlist apps/cli/src/commands/
// audit.ts applies to direct file arguments. The ICJIA publications API has
// historically returned only PDFs in practice, but a publication's fileURL
// may point to any of these, so publist audits whichever it actually is
// instead of hard-filtering to `.pdf`.
export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.xlsx'] as const

/**
 * True if fileURL ends with one of the four supported document extensions
 * (case-insensitive). Exported so the filter can be unit-tested directly,
 * without a live GraphQL call.
 */
export function hasSupportedExtension(fileURL: string | null | undefined): boolean {
  if (!fileURL) return false
  const lower = fileURL.toLowerCase()
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export interface Publication {
  id: string
  title: string
  slug: string
  fileURL: string | null
  publicationDate: string | null
  pubType: string | null
  summary: string | null
  tags: string[] | null
}

export async function fetchPublications(): Promise<Publication[]> {
  const all: Publication[] = []
  let offset = 0

  while (true) {
    const query = `query {
      publications(limit: ${PAGE_SIZE}, start: ${offset}, sort: "published_at:desc") {
        id
        title
        slug
        fileURL
        publicationDate
        pubType
        summary
        tags
      }
    }`

    const resp = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!resp.ok) {
      throw new Error(`GraphQL API returned HTTP ${resp.status}`)
    }

    const json = await resp.json() as { data?: { publications?: Publication[] }, errors?: { message: string }[] }

    if (json.errors?.length) {
      throw new Error(`GraphQL error: ${json.errors[0].message}`)
    }

    const pubs = json.data?.publications ?? []
    all.push(...pubs)

    if (pubs.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // Dedup by id
  const unique = [...new Map(all.map(p => [p.id, p])).values()]

  // Filter to supported document types: PDF, Word (.docx), PowerPoint
  // (.pptx), or Excel (.xlsx) — see SUPPORTED_EXTENSIONS above.
  return unique.filter(p => hasSupportedExtension(p.fileURL))
}

export function loadPublicationsFromFile(filePath: string): Publication[] {
  const raw = readFileSync(filePath, 'utf-8')
  const data = JSON.parse(raw)

  const pubs: Publication[] = Array.isArray(data) ? data : data.publications ?? data.data?.publications ?? []

  // Filter to supported document types: PDF, Word (.docx), PowerPoint
  // (.pptx), or Excel (.xlsx) — see SUPPORTED_EXTENSIONS above.
  return pubs.filter(p => hasSupportedExtension(p.fileURL))
}
