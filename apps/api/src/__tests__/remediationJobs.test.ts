import { describe, it, expect, beforeAll } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Characterization tests for the remediation job store — the subsystem that
// mints single-use download tokens (hash-only at rest), drives job status
// transitions, and enforces the per-user concurrency count. It had zero
// direct coverage despite being irreversible-action-adjacent.
//
// The db singleton reads DB_PATH at import time and remediationJobs prepares
// its statements at import time — so the env var MUST be set before the
// dynamic import below. Each vitest file has its own module registry, so
// this isolated DB never leaks into other test files.
// ---------------------------------------------------------------------------
const tmpDir = mkdtempSync(join(tmpdir(), 'remediation-jobs-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')

let jobs: typeof import('../services/remediationJobs.js')

beforeAll(async () => {
  jobs = await import('../services/remediationJobs.js')
})

function makeJob(email = 'user@example.com') {
  return jobs.createJob({
    email,
    inputFilename: 'report.pdf',
    originalFilename: 'FY 22 Report (final).pdf',
    contentHash: 'abc123',
    pageCount: 12,
  })
}

describe('createJob', () => {
  it('creates a pending job and returns a one-time token, storing only its hash', () => {
    const { job, downloadToken } = makeJob()
    expect(job.status).toBe('pending')
    expect(job.progressPct).toBe(0)
    expect(job.originalFilename).toBe('FY 22 Report (final).pdf')
    expect(job.expiresAt).toBeGreaterThan(job.createdAt)
    // token is NOT stored raw
    expect(job.downloadTokenHash).not.toBe(downloadToken)
    const expected = createHash('sha256').update(downloadToken).digest('hex')
    expect(job.downloadTokenHash).toBe(expected)
  })

  it('round-trips through getJob; unknown ids return null', () => {
    const { job } = makeJob()
    expect(jobs.getJob(job.id)?.id).toBe(job.id)
    expect(jobs.getJob('nonexistent-id')).toBeNull()
  })
})

describe('status transitions', () => {
  it('pending → running → stepped → complete refreshes expiry and clears step', () => {
    const { job } = makeJob()
    jobs.setRunning(job.id)
    expect(jobs.getJob(job.id)?.status).toBe('running')
    expect(jobs.getJob(job.id)?.progressPct).toBe(5)

    jobs.setStep(job.id, 'tagging', 40)
    expect(jobs.getJob(job.id)?.step).toBe('tagging')
    expect(jobs.getJob(job.id)?.progressPct).toBe(40)

    jobs.setScores(job.id, 42, 96, true)
    const scored = jobs.getJob(job.id)!
    expect(scored.inputScore).toBe(42)
    expect(scored.outputScore).toBe(96)
    expect(scored.outputValid).toBe(true)

    const before = jobs.getJob(job.id)!.expiresAt
    jobs.setComplete(job.id, '/tmp/out.pdf')
    const done = jobs.getJob(job.id)!
    expect(done.status).toBe('complete')
    expect(done.step).toBeNull()
    expect(done.progressPct).toBe(100)
    expect(done.outputPath).toBe('/tmp/out.pdf')
    expect(done.completedAt).not.toBeNull()
    expect(done.expiresAt).toBeGreaterThanOrEqual(before)
  })

  it('setFailed records the reason; setExpired clears the output path', () => {
    const a = makeJob().job
    jobs.setFailed(a.id, 'worker timeout')
    expect(jobs.getJob(a.id)?.status).toBe('failed')
    expect(jobs.getJob(a.id)?.failureReason).toBe('worker timeout')

    const b = makeJob().job
    jobs.setComplete(b.id, '/tmp/out.pdf')
    jobs.setExpired(b.id)
    const expired = jobs.getJob(b.id)!
    expect(expired.status).toBe('expired')
    expect(expired.outputPath).toBeNull()
  })
})

describe('audit JSON round-trip', () => {
  it('stores and parses input/output audit payloads', () => {
    const { job } = makeJob()
    jobs.setInputAudit(job.id, JSON.stringify({ overallScore: 42 }))
    jobs.setOutputAudit(job.id, JSON.stringify({ overallScore: 96 }))
    const pair = jobs.getJobAuditPair(job.id)
    expect(pair.inputAudit).toEqual({ overallScore: 42 })
    expect(pair.outputAudit).toEqual({ overallScore: 96 })
  })

  it('returns nulls for a job with no stored audits', () => {
    const { job } = makeJob()
    expect(jobs.getJobAuditPair(job.id)).toEqual({
      inputAudit: null,
      outputAudit: null,
    })
  })
})

describe('countActiveJobsForEmail', () => {
  it('counts only pending/running jobs for that email', () => {
    const email = `active-${process.pid}@example.com`
    const p = makeJob(email).job // pending
    const r = makeJob(email).job
    jobs.setRunning(r.id) // running
    const f = makeJob(email).job
    jobs.setFailed(f.id, 'x') // terminal — not counted
    makeJob('other@example.com') // different user — not counted
    expect(jobs.countActiveJobsForEmail(email)).toBe(2)
    expect(p.id).not.toBe(r.id)
  })
})

describe('verifyDownloadToken', () => {
  it('accepts the issued token and rejects tampered/empty/hashless inputs', () => {
    const { job, downloadToken } = makeJob()
    expect(jobs.verifyDownloadToken(job, downloadToken)).toBe(true)
    expect(
      jobs.verifyDownloadToken(job, downloadToken.slice(0, -1) + 'x'),
    ).toBe(false)
    expect(jobs.verifyDownloadToken(job, '')).toBe(false)
    expect(
      jobs.verifyDownloadToken(
        { ...job, downloadTokenHash: null },
        downloadToken,
      ),
    ).toBe(false)
  })

  it('never accepts a different job\'s token', () => {
    const a = makeJob()
    const b = makeJob()
    expect(jobs.verifyDownloadToken(a.job, b.downloadToken)).toBe(false)
    expect(jobs.verifyDownloadToken(b.job, a.downloadToken)).toBe(false)
  })
})
