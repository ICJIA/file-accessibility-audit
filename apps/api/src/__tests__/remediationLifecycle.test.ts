import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Characterization tests for the remediation lifecycle log (append-only
// compliance events, delete-and-verify semantics) and the cleanup sweep
// (TTL expiry with file deletion, stuck-job failure, idempotency). This is
// the code that performs irreversible filesystem deletes — previously the
// least-tested, highest-consequence corner of the API.
//
// DB_PATH must be set before the dynamic imports (db + prepared statements
// are created at import time); vitest gives each file its own module graph.
// ---------------------------------------------------------------------------
const tmpDir = mkdtempSync(join(tmpdir(), 'remediation-lifecycle-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')

let jobs: typeof import('../services/remediationJobs.js')
let events: typeof import('../services/remediationEvents.js')
let cleanup: typeof import('../services/remediationCleanup.js')
let db: (typeof import('../db/sqlite.js'))['default']

beforeAll(async () => {
  jobs = await import('../services/remediationJobs.js')
  events = await import('../services/remediationEvents.js')
  cleanup = await import('../services/remediationCleanup.js')
  db = (await import('../db/sqlite.js')).default
})

function makeJob() {
  return jobs.createJob({
    email: 'user@example.com',
    inputFilename: 'r.pdf',
    contentHash: 'h',
    pageCount: 1,
  }).job
}

describe('remediationEvents', () => {
  it('records and returns events in order, with details round-tripped', () => {
    const job = makeJob()
    events.recordEvent(job.id, 'received', { bytes: 123 })
    events.recordEvent(job.id, 'processing_started')
    const log = events.getEventsForJob(job.id)
    expect(log.map((e) => e.event)).toEqual(['received', 'processing_started'])
    expect(log[0].details).toEqual({ bytes: 123 })
    expect(log[1].details).toBeNull()
  })

  it('verifyAbsent: true + verified_absent on ENOENT; false + verify_failed if present', async () => {
    const job = makeJob()
    const missing = join(tmpDir, 'never-existed.pdf')
    expect(await events.verifyAbsent(job.id, missing)).toBe(true)

    const present = join(tmpDir, 'still-here.pdf')
    writeFileSync(present, 'x')
    expect(await events.verifyAbsent(job.id, present)).toBe(false)

    const names = events.getEventsForJob(job.id).map((e) => e.event)
    expect(names).toContain('verified_absent')
    expect(names).toContain('verify_failed')
  })

  it('deleteAndVerify removes the file, records output_deleted + verified_absent, and never exposes the raw path', async () => {
    const job = makeJob()
    const target = join(tmpDir, 'output.pdf')
    writeFileSync(target, 'pdf-bytes')
    expect(await events.deleteAndVerify(job.id, target, 'ttl_expired')).toBe(
      true,
    )
    expect(existsSync(target)).toBe(false)

    const log = events.getEventsForJob(job.id)
    const del = log.find((e) => e.event === 'output_deleted')!
    expect(del.details?.trigger).toBe('ttl_expired')
    // compliance log stores a path hash, not the path itself
    expect(JSON.stringify(del.details)).not.toContain('output.pdf')
    expect(log.some((e) => e.event === 'verified_absent')).toBe(true)
  })

  it('deleteAndVerify on an already-absent file still verifies absent (idempotent)', async () => {
    const job = makeJob()
    const missing = join(tmpDir, 'gone.pdf')
    expect(await events.deleteAndVerify(job.id, missing, 'cleanup')).toBe(true)
    const del = events
      .getEventsForJob(job.id)
      .find((e) => e.event === 'output_deleted')!
    expect(del.details?.note).toBe('already absent at delete time')
  })
})

describe('remediationCleanup.runCleanup', () => {
  it('expires a complete job past its TTL: deletes the output, flips status, records events', async () => {
    const job = makeJob()
    const out = join(tmpDir, `${job.id}-output.pdf`)
    writeFileSync(out, 'x')
    jobs.setComplete(job.id, out)
    // force the TTL into the past
    db.prepare('UPDATE remediation_jobs SET expires_at = ? WHERE id = ?').run(
      Date.now() - 1000,
      job.id,
    )

    const result = await cleanup.runCleanup()
    expect(result.expiredOutputs).toBeGreaterThanOrEqual(1)
    expect(existsSync(out)).toBe(false)
    expect(jobs.getJob(job.id)?.status).toBe('expired')
    expect(jobs.getJob(job.id)?.outputPath).toBeNull()
    const names = events.getEventsForJob(job.id).map((e) => e.event)
    expect(names).toContain('expired')
    expect(names).toContain('output_deleted')
    expect(names).toContain('verified_absent')
  })

  it('marks pending/running jobs stuck for >10min as failed', async () => {
    const job = makeJob()
    jobs.setRunning(job.id)
    db.prepare('UPDATE remediation_jobs SET created_at = ? WHERE id = ?').run(
      Date.now() - 11 * 60_000,
      job.id,
    )
    const result = await cleanup.runCleanup()
    expect(result.stuckJobs).toBeGreaterThanOrEqual(1)
    const j = jobs.getJob(job.id)!
    expect(j.status).toBe('failed')
    expect(j.failureReason).toContain('stuck')
  })

  it('is idempotent — a second sweep finds nothing new and reports no errors', async () => {
    const again = await cleanup.runCleanup()
    expect(again.errors).toEqual([])
    expect(again.expiredOutputs).toBe(0)
    expect(again.stuckJobs).toBe(0)
  })

  it('start/stopCleanupInterval are safe to call regardless of the feature flag', () => {
    // With REMEDIATION.ENABLED false (the default when REMEDIATION_ENABLED
    // is unset), startCleanupInterval is a documented no-op; either way the
    // pair must not throw or leave a live timer behind.
    cleanup.startCleanupInterval()
    cleanup.stopCleanupInterval()
  })
})
