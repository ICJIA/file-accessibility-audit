import { Router, Request, Response, type IRouter } from 'express'
import crypto from 'node:crypto'
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware.js'
import { reportsLimiter } from '../middleware/rateLimiter.js'
import { analyzePDF } from '../services/pdfAnalyzer.js'
import { gateIdentity, recordAudit, sha256Hex } from '../services/auditLog.js'
import { safeFetch, SafeFetchError } from '../services/safeFetch.js'
import { validateUrlForFetch } from './analyze-url.js'
import { SHARED_REPORTS } from '#config'
import db from '../db/sqlite.js'

const router: IRouter = Router()

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_INVENTORY_BYTES = 5 * 1024 * 1024  // 5 MB NDJSON cap
const MAX_PDF_BYTES = 15 * 1024 * 1024        // match ANALYSIS.MAX_FILE_SIZE_MB
const MAX_FILES_PER_REQUEST = 100             // cap to keep requests reasonable
const FETCH_TIMEOUT_MS = 30_000               // matches SCHEDULED_CHECKS.FETCH_TIMEOUT_MS

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InventoryEntry {
  path: string
  filename: string
  category: string
  publicUrl?: string
  sha256?: string
}

interface BulkResult {
  sha256?: string
  path: string
  publicUrl?: string
  overallScore?: number
  grade?: string
  reportId?: string
  reportUrl?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// v1.20.1 SECURITY FIX (red/blue team finding P1.4): the previous
// implementation used a private `fetchWithTimeout` here with NO host
// allowlist and NO private-IP rejection. Authenticated callers with
// a PAT could submit an inventory containing arbitrary URLs —
// including internal addresses — and the server would dutifully
// fetch them, returning the response body and timing through the
// per-entry result. That's a textbook SSRF vector even though the
// endpoint required auth.
//
// Replaced with the centralized SSRF-hardened safeFetch + the same
// allowlist (validateUrlForFetch) used by /api/analyze-url and
// /api/audit-url. DNS resolution + private-IP rejection happens on
// every hop including redirects.

function parseInventory(
  inventoryText: string,
  filterCategory: string,
): { entries: InventoryEntry[]; totalLineCount: number } {
  const lines = inventoryText.split('\n').filter((l) => l.trim().length > 0)
  const entries: InventoryEntry[] = []
  let publicUrlBase: string | undefined

  for (const line of lines) {
    let parsed: any
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }

    // filecap header record carries publicUrlBase in metadata
    if (typeof parsed.kind === 'string' && parsed.kind.endsWith('-header')) {
      publicUrlBase = parsed.metadata?.publicUrlBase
      continue
    }

    // skip footer records
    if (typeof parsed.kind === 'string' && parsed.kind.endsWith('-footer')) continue

    if (parsed.category !== filterCategory) continue

    // Resolve publicUrl: use entry value first, then construct from header base + path
    let publicUrl: string | undefined = parsed.publicUrl
    if (!publicUrl && publicUrlBase) {
      const cleanBase = publicUrlBase.replace(/\/+$/, '')
      const cleanPath = (parsed.path ?? '').replace(/^\/+/, '')
      if (cleanPath) {
        publicUrl = `${cleanBase}/${cleanPath}`
      }
    }

    if (!publicUrl) continue

    entries.push({
      path: parsed.path ?? '',
      filename: parsed.filename ?? parsed.path ?? 'unnamed.pdf',
      category: parsed.category,
      publicUrl,
      sha256: parsed.sha256,
    })

    if (entries.length >= MAX_FILES_PER_REQUEST) break
  }

  return { entries, totalLineCount: lines.length }
}

// ---------------------------------------------------------------------------
// POST /api/bulk-from-inventory
// ---------------------------------------------------------------------------
// Accepts a filecap NDJSON inventory, iterates PDF entries, fetches each
// file server-side, runs the existing analyzePDF pipeline, persists results
// via shared_reports, and returns a manifest with per-file scores/grades.
//
// Auth required (authMiddleware). The reportsLimiter is reused; a dedicated
// bulk rate-limit class may be warranted once traffic patterns are known.
//
// Processing is serial to respect the existing 2-at-a-time semaphore in
// pdfAnalyzer.ts. For inventories with many PDFs this endpoint is slow by
// design — a background job model is the long-term answer for large fleets.
// ---------------------------------------------------------------------------

router.post(
  '/bulk-from-inventory',
  authMiddleware,
  reportsLimiter,
  // Use text/plain body parsing with an expanded 5 MB limit for the inventory
  // payload. The global express.json({ limit: '1mb' }) does not cover this
  // route because the Content-Type here is text/plain, not application/json.
  // Callers should send: Content-Type: text/plain  (or multipart — TBD).
  // For the initial implementation the caller can also send JSON with an
  // `inventory` string field; see parsing logic below.
  async (req: AuthRequest, res: Response) => {
    try {
      // Support two intake modes:
      //   1. JSON body: { inventory: "<NDJSON>", filterCategory?: "pdf" }
      //   2. Raw text/plain body: the NDJSON content directly
      //      (requires the caller to set Content-Type: text/plain)
      let inventoryText: string | undefined
      let filterCategory = 'pdf'

      const contentType = req.get('content-type') ?? ''

      if (contentType.includes('application/json')) {
        // Mode 1: JSON body — inventory field carries the NDJSON text
        inventoryText = req.body?.inventory
        if (typeof req.body?.filterCategory === 'string') {
          filterCategory = req.body.filterCategory
        }
      } else if (contentType.includes('text/plain')) {
        // Mode 2: raw text body — entire body is the NDJSON
        // express.text() middleware must be mounted above this route for this
        // to work. See index.ts for the mount.
        inventoryText = req.body
      } else {
        // Fallback: try JSON body field for curl --data-binary use
        inventoryText = req.body?.inventory
      }

      if (typeof inventoryText !== 'string' || inventoryText.length === 0) {
        res.status(400).json({
          error: 'Missing inventory. Send { "inventory": "<NDJSON>" } as JSON, or send the NDJSON directly as text/plain.',
        })
        return
      }

      if (inventoryText.length > MAX_INVENTORY_BYTES) {
        res.status(413).json({
          error: `Inventory too large. Maximum is ${MAX_INVENTORY_BYTES} bytes (${MAX_INVENTORY_BYTES / 1024 / 1024} MB).`,
        })
        return
      }

      // Parse the NDJSON and filter to the target category
      const { entries, totalLineCount } = parseInventory(inventoryText, filterCategory)

      if (entries.length === 0) {
        res.status(400).json({
          error: `Inventory contains no ${filterCategory} entries with a resolvable public URL.`,
          details: 'Each entry needs either a publicUrl field, or a publicUrlBase in the inventory header so the URL can be constructed from the path.',
        })
        return
      }

      // Process each entry serially: fetch → validate → analyze → persist
      const results: BulkResult[] = []

      for (const entry of entries) {
        const result: BulkResult = {
          sha256: entry.sha256,
          path: entry.path,
          publicUrl: entry.publicUrl,
        }

        try {
          // SSRF-hardened fetch — allowlist + DNS-rebinding + redirect
          // chain mitigations (v1.20.1+). Errors propagate as a
          // SafeFetchError which we map to a per-entry error string.
          let fetched
          try {
            fetched = await safeFetch(entry.publicUrl!, {
              timeoutMs: FETCH_TIMEOUT_MS,
              maxBytes: MAX_PDF_BYTES,
              validateUrl: validateUrlForFetch,
            })
          } catch (e) {
            if (e instanceof SafeFetchError) {
              result.error = `${e.code}: ${e.message}`
              results.push(result)
              continue
            }
            throw e
          }

          if (!fetched.ok) {
            result.error = `fetch failed: ${fetched.status} ${fetched.statusText}`
            results.push(result)
            continue
          }

          const buf = fetched.buffer

          // Magic bytes check
          const header = buf.subarray(0, 5).toString('ascii')
          if (header !== '%PDF-') {
            result.error = `not a valid PDF (header bytes: ${header})`
            results.push(result)
            continue
          }

          const contentHash = sha256Hex(buf)
          const analysis = await analyzePDF(buf, entry.filename)

          result.overallScore = analysis.overallScore
          result.grade = analysis.grade

          // Persist to shared_reports for a stable shareable URL
          const id = crypto.randomBytes(16).toString('hex')
          const expiresAt = new Date()
          expiresAt.setDate(expiresAt.getDate() + SHARED_REPORTS.EXPIRY_DAYS)

          db.prepare(
            'INSERT INTO shared_reports (id, email, filename, report_json, content_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(
            id,
            req.user!.email,
            entry.filename,
            JSON.stringify(analysis),
            contentHash,
            expiresAt.toISOString(),
          )

          // Canonical audit-log write so each bulk-audited entry
          // counts for the remediation gate (v1.20.1+).
          recordAudit({
            eventType: 'bulk-from-inventory',
            email: gateIdentity(req.user?.email ?? null, req.ip),
            filename: entry.filename,
            score: analysis.overallScore,
            grade: analysis.grade,
            contentHash,
            ipAddress: req.ip ?? null,
            userAgent: req.get('user-agent') ?? null,
          })

          result.reportId = id
          result.reportUrl = `/api/reports/${id}`
        } catch (err: any) {
          // Distinguish specific error types for better diagnostics
          if (err?.name === 'AbortError') {
            result.error = `fetch timed out after ${FETCH_TIMEOUT_MS}ms`
          } else if (err?.status === 503) {
            result.error = 'server busy — analysis queue full, try again'
          } else if (err?.message?.includes('encrypted') || err?.message?.includes('password')) {
            result.error = 'PDF is password-protected and cannot be analyzed'
          } else {
            result.error = err?.message ?? String(err)
          }
        }

        results.push(result)
      }

      const analyzed = results.filter((r) => r.overallScore !== undefined).length
      const failed = results.filter((r) => r.error !== undefined).length
      const skipped = totalLineCount - entries.length

      res.json({
        summary: {
          total: entries.length,
          analyzed,
          failed,
          skipped,
        },
        results,
      })
    } catch (err: any) {
      console.error('Bulk-from-inventory error:', err)
      res.status(500).json({
        error: 'Internal error during bulk processing.',
        details: err?.message,
      })
    }
  }
)

export default router
