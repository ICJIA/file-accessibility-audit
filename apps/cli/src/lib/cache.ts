import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { AnalysisResult } from '../../../api/src/services/pdfAnalyzer.js'
import type { Publication } from './graphql.js'

export interface CachedRow {
  file_url: string
  title: string | null
  publication_date: string | null
  pub_type: string | null
  overall_score: number | null
  grade: string | null
  text_extractability_score: number | null
  text_extractability_grade: string | null
  text_extractability_severity: string | null
  title_language_score: number | null
  title_language_grade: string | null
  title_language_severity: string | null
  heading_structure_score: number | null
  heading_structure_grade: string | null
  heading_structure_severity: string | null
  alt_text_score: number | null
  alt_text_grade: string | null
  alt_text_severity: string | null
  bookmarks_score: number | null
  bookmarks_grade: string | null
  bookmarks_severity: string | null
  table_markup_score: number | null
  table_markup_grade: string | null
  table_markup_severity: string | null
  link_quality_score: number | null
  link_quality_grade: string | null
  link_quality_severity: string | null
  form_accessibility_score: number | null
  form_accessibility_grade: string | null
  form_accessibility_severity: string | null
  reading_order_score: number | null
  reading_order_grade: string | null
  reading_order_severity: string | null
  supplementary_score: number | null
  supplementary_grade: string | null
  supplementary_severity: string | null
  critical_findings: string | null
  page_count: number | null
  summary: string | null
  tags: string | null
  status: string
  error_message: string | null
  audited_at: string | null
}

const CATEGORY_IDS = [
  'text_extractability',
  'title_language',
  'heading_structure',
  'alt_text',
  'bookmarks',
  'table_markup',
  'link_quality',
  'form_accessibility',
  'reading_order',
  'supplementary',
] as const

const SCHEMA = `
CREATE TABLE IF NOT EXISTS publist_cache (
  file_url TEXT PRIMARY KEY,
  title TEXT,
  publication_date TEXT,
  pub_type TEXT,
  overall_score INTEGER,
  grade TEXT,
  text_extractability_score INTEGER,
  text_extractability_grade TEXT,
  text_extractability_severity TEXT,
  title_language_score INTEGER,
  title_language_grade TEXT,
  title_language_severity TEXT,
  heading_structure_score INTEGER,
  heading_structure_grade TEXT,
  heading_structure_severity TEXT,
  alt_text_score INTEGER,
  alt_text_grade TEXT,
  alt_text_severity TEXT,
  bookmarks_score INTEGER,
  bookmarks_grade TEXT,
  bookmarks_severity TEXT,
  table_markup_score INTEGER,
  table_markup_grade TEXT,
  table_markup_severity TEXT,
  link_quality_score INTEGER,
  link_quality_grade TEXT,
  link_quality_severity TEXT,
  form_accessibility_score INTEGER,
  form_accessibility_grade TEXT,
  form_accessibility_severity TEXT,
  reading_order_score INTEGER,
  reading_order_grade TEXT,
  reading_order_severity TEXT,
  supplementary_score INTEGER,
  supplementary_grade TEXT,
  supplementary_severity TEXT,
  critical_findings TEXT,
  page_count INTEGER,
  summary TEXT,
  tags TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  audited_at TEXT DEFAULT (datetime('now'))
);
`

export function initCache(cacheDir?: string): Database.Database {
  const dir = cacheDir ?? join(homedir(), '.a11y-audit')
  mkdirSync(dir, { recursive: true })
  const dbPath = join(dir, 'cache.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  // Migrate: add columns if missing (safe to run repeatedly)
  try { db.exec('ALTER TABLE publist_cache ADD COLUMN summary TEXT') } catch {}
  try { db.exec('ALTER TABLE publist_cache ADD COLUMN tags TEXT') } catch {}
  return db
}

export function getCached(db: Database.Database, fileURL: string): CachedRow | undefined {
  // Consider both success and permanent errors (404, etc.) as cached
  return db.prepare('SELECT * FROM publist_cache WHERE file_url = ? AND (status = ? OR status = ?)').get(fileURL, 'success', 'permanent_error') as CachedRow | undefined
}

export function upsertResult(db: Database.Database, pub: Publication, result: AnalysisResult): void {
  const catMap: Record<string, { score: number | null; grade: string | null; severity: string | null }> = {}
  for (const cat of result.categories) {
    catMap[cat.id] = { score: cat.score, grade: cat.grade, severity: cat.severity }
  }

  // Collect critical findings
  const criticalFindings: string[] = []
  for (const cat of result.categories) {
    if (cat.severity === 'Critical') {
      for (const f of cat.findings) {
        criticalFindings.push(f)
      }
    }
  }

  const cols = [
    'file_url', 'title', 'publication_date', 'pub_type',
    'overall_score', 'grade',
  ]
  const vals: any[] = [
    pub.fileURL, pub.title, pub.publicationDate, pub.pubType,
    result.overallScore, result.grade,
  ]

  for (const catId of CATEGORY_IDS) {
    const c = catMap[catId]
    cols.push(`${catId}_score`, `${catId}_grade`, `${catId}_severity`)
    vals.push(c?.score ?? null, c?.grade ?? null, c?.severity ?? null)
  }

  cols.push('critical_findings', 'page_count', 'summary', 'tags', 'status', 'error_message', 'audited_at')
  vals.push(
    criticalFindings.length > 0 ? criticalFindings.join('; ') : null,
    result.pageCount,
    pub.summary ?? null,
    pub.tags ? JSON.stringify(pub.tags) : null,
    'success',
    null,
    new Date().toISOString(),
  )

  const placeholders = cols.map(() => '?').join(', ')
  const sql = `INSERT OR REPLACE INTO publist_cache (${cols.join(', ')}) VALUES (${placeholders})`
  db.prepare(sql).run(...vals)
}

export function upsertError(db: Database.Database, pub: Publication, errorMessage: string, permanent = false): void {
  const status = permanent ? 'permanent_error' : 'error'
  db.prepare(`
    INSERT OR REPLACE INTO publist_cache (file_url, title, publication_date, pub_type, summary, tags, status, error_message, audited_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(pub.fileURL, pub.title, pub.publicationDate, pub.pubType, pub.summary ?? null, pub.tags ? JSON.stringify(pub.tags) : null, status, errorMessage)
}

export function getAllSuccessful(db: Database.Database): CachedRow[] {
  return db.prepare('SELECT * FROM publist_cache WHERE status = ? ORDER BY title ASC').all('success') as CachedRow[]
}

export function getErrorCount(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM publist_cache WHERE status = ?').get('error') as { cnt: number }
  return row.cnt
}

export function backfillMetadata(db: Database.Database, pubs: Publication[]): number {
  const stmt = db.prepare('UPDATE publist_cache SET summary = ?, tags = ? WHERE file_url = ? AND summary IS NULL')
  let count = 0
  const pubMap = new Map(pubs.map(p => [p.fileURL, p]))
  const rows = db.prepare('SELECT file_url FROM publist_cache WHERE summary IS NULL AND status = ?').all('success') as { file_url: string }[]
  for (const row of rows) {
    const pub = pubMap.get(row.file_url)
    if (pub) {
      stmt.run(pub.summary ?? null, pub.tags ? JSON.stringify(pub.tags) : null, row.file_url)
      count++
    }
  }
  return count
}

export function clearCache(db: Database.Database): void {
  db.prepare('DELETE FROM publist_cache').run()
}
