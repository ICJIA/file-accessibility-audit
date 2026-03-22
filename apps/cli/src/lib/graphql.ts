import { readFileSync } from 'node:fs'

const GRAPHQL_URL = 'https://agency.icjia-api.cloud/graphql'
const PAGE_SIZE = 500

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

  // Filter to PDF-only
  return unique.filter(p => p.fileURL && p.fileURL.toLowerCase().endsWith('.pdf'))
}

export function loadPublicationsFromFile(filePath: string): Publication[] {
  const raw = readFileSync(filePath, 'utf-8')
  const data = JSON.parse(raw)

  const pubs: Publication[] = Array.isArray(data) ? data : data.publications ?? data.data?.publications ?? []

  // Filter to PDF-only
  return pubs.filter(p => p.fileURL && p.fileURL.toLowerCase().endsWith('.pdf'))
}
