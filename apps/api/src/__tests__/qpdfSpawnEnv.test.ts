import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// RB3-2 [HIGH, pre-existing — surfaced by the pre-merge re-audit]:
// qpdfService.ts spawns the qpdf binary (memory-unsafe C++, parsing
// ATTACKER-CONTROLLED PDF bytes, running IN the main Express process) at TWO
// sites — analyzeWithQpdf's execFileSync and analyzeWithQpdfAsync's execFile
// — with NO `env:` option, so qpdf inherits the FULL process.env, including
// every secret (JWT_SECRET, API_PRIVILEGED_TOKEN, SMTP creds, ...). This is
// the exact exposure services/childSpawnEnv.ts (RB2-d) already closes for
// the OOXML worker (ooxmlRunner.ts) and the remediation worker
// (routes/remediate.ts) — qpdf was simply missed.
//
// This is a pure unit test of the two ACTUAL call sites, mirroring the seam
// pattern RB2-d used for remediate.ts/ooxmlRunner.ts (remediate-spawn-env.test.ts,
// ooxmlWorker.test.ts's "RB2-d: OOXML worker spawn env" block): mock
// node:child_process so the exact `env` option passed to execFileSync/
// execFile can be inspected, plant a secret in process.env, and assert it
// does not survive into the child's env while PATH does.
//
// child_process is mocked WITHOUT calling through to the real qpdf binary
// (unlike the OOXML test, which spawns a real child) — qpdfParser.test.ts
// already established this exact mocking shape (execFileSync as a bare
// vi.fn()) to unit-test qpdfService without requiring qpdf to be installed
// in the test environment; this file extends that shape to also cover
// execFile (analyzeWithQpdfAsync) and to inspect the env option specifically.
// ---------------------------------------------------------------------------

const { execFileSyncMock, execFileMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  execFileMock: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
  execFile: execFileMock,
}))

vi.mock('node:fs', () => ({
  default: {
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}))

import { analyzeWithQpdf, analyzeWithQpdfAsync } from '../services/qpdfService.js'

// Minimal but valid qpdf --json output: parseQpdfJson tolerates an object
// with no `objects`/`qpdf` key (falls back to `{}`), so this is enough to
// exercise a full analyzeWithQpdf(Async) call without a real qpdf binary.
const MINIMAL_QPDF_JSON = JSON.stringify({})

/** Find the "--json" invocation among a mock's recorded calls (skips the
 *  module-load-time "--version" probe(s), if any survive a given test's
 *  mock reset) and return its options (3rd positional arg). */
function findJsonCallOptions(
  calls: unknown[][],
): { env?: Record<string, string | undefined> } | undefined {
  const call = calls.find((c) => Array.isArray(c[1]) && (c[1] as string[]).includes('--json'))
  return call?.[2] as { env?: Record<string, string | undefined> } | undefined
}

describe('qpdfService subprocess env excludes API secrets (RB3-2)', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset()
    execFileMock.mockReset()
    execFileSyncMock.mockReturnValue(MINIMAL_QPDF_JSON)
    execFileMock.mockImplementation(
      (_bin: string, _args: string[], _options: unknown, cb: (err: unknown, stdout: string, stderr: string) => void) => {
        cb(null, MINIMAL_QPDF_JSON, '')
      },
    )
  })

  it('analyzeWithQpdf (execFileSync) passes a spawn env that omits a planted secret but keeps PATH', () => {
    const prev = process.env.API_PRIVILEGED_TOKEN
    process.env.API_PRIVILEGED_TOKEN = 'unit-test-privileged-token-probe'
    try {
      analyzeWithQpdf(Buffer.from('fake pdf bytes'))

      const options = findJsonCallOptions(execFileSyncMock.mock.calls)
      expect(options?.env).toBeDefined()
      expect(options!.env!.API_PRIVILEGED_TOKEN).toBeUndefined()
      // Essentials survive so qpdf can actually run.
      expect(options!.env!.PATH).toBe(process.env.PATH)
    } finally {
      if (prev === undefined) delete process.env.API_PRIVILEGED_TOKEN
      else process.env.API_PRIVILEGED_TOKEN = prev
    }
  })

  it('analyzeWithQpdfAsync (execFile) passes a spawn env that omits a planted secret but keeps PATH', async () => {
    const prev = process.env.API_PRIVILEGED_TOKEN
    process.env.API_PRIVILEGED_TOKEN = 'unit-test-privileged-token-probe'
    try {
      await analyzeWithQpdfAsync(Buffer.from('fake pdf bytes'))

      const options = findJsonCallOptions(execFileMock.mock.calls)
      expect(options?.env).toBeDefined()
      expect(options!.env!.API_PRIVILEGED_TOKEN).toBeUndefined()
      expect(options!.env!.PATH).toBe(process.env.PATH)
    } finally {
      if (prev === undefined) delete process.env.API_PRIVILEGED_TOKEN
      else process.env.API_PRIVILEGED_TOKEN = prev
    }
  })

  it('other secret families (JWT_SECRET, SMTP_PASS) are also stripped from both spawn sites', async () => {
    const prevJwt = process.env.JWT_SECRET
    const prevSmtp = process.env.SMTP_PASS
    process.env.JWT_SECRET = 'unit-test-jwt-secret-probe'
    process.env.SMTP_PASS = 'unit-test-smtp-pass-probe'
    try {
      analyzeWithQpdf(Buffer.from('fake pdf bytes'))
      await analyzeWithQpdfAsync(Buffer.from('fake pdf bytes'))

      const syncOptions = findJsonCallOptions(execFileSyncMock.mock.calls)
      const asyncOptions = findJsonCallOptions(execFileMock.mock.calls)
      for (const options of [syncOptions, asyncOptions]) {
        expect(options!.env!.JWT_SECRET).toBeUndefined()
        expect(options!.env!.SMTP_PASS).toBeUndefined()
      }
    } finally {
      if (prevJwt === undefined) delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = prevJwt
      if (prevSmtp === undefined) delete process.env.SMTP_PASS
      else process.env.SMTP_PASS = prevSmtp
    }
  })
})
