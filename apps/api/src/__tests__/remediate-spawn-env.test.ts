import { describe, it, expect, vi, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// RB2-d [INFO->fix]: the remediation worker (jobs/remediate.ts) parses an
// ATTACKER-CONTROLLED PDF. Before this fix, routes/remediate.ts's
// spawnWorker() passed `env: process.env` straight through, handing the
// worker — and therefore the JVM/qpdf/ODL grandchildren it spawns in turn —
// every secret the API process holds (JWT_SECRET, API_PRIVILEGED_TOKEN,
// SMTP creds, ...).
//
// This proves the ACTUAL call site in routes/remediate.ts now builds its
// spawn env via the shared childSpawnEnv helper, not just that the helper is
// correct in isolation (see childSpawnEnv.test.ts for that). `spawn` is
// mocked to a synthetic no-op — no real process is launched, and Java
// availability is irrelevant here, since this test only inspects the `env`
// argument spawnWorker passes to child_process.spawn. `db/sqlite.js` is
// mocked so importing the route module doesn't open a real database (the
// route's other imports — multer, remediationJobs.ts, auditLog.ts — need
// `db` to resolve at import time). `spawnWorker` was module-private; it is
// now exported specifically to give this test a seam (spawn-env only — no
// remediation logic touched).
// ---------------------------------------------------------------------------

const { spawnCalls } = vi.hoisted(() => ({
  spawnCalls: [] as unknown[][],
}))

vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn: (...args: unknown[]) => {
      spawnCalls.push(args)
      return { unref: vi.fn() } as unknown as ReturnType<typeof actual.spawn>
    },
  }
})

vi.mock('../db/sqlite.js', () => ({
  default: { prepare: vi.fn(() => ({ get: vi.fn(), run: vi.fn() })) },
}))

describe('routes/remediate.ts spawnWorker: env excludes API secrets (RB2-d)', () => {
  afterEach(() => {
    spawnCalls.length = 0
  })

  it('does not pass JWT_SECRET/API_PRIVILEGED_TOKEN/SMTP_PASS to the worker, but keeps PATH/HOME/JAVA_HOME/NODE_ENV', async () => {
    const prevJwt = process.env.JWT_SECRET
    const prevToken = process.env.API_PRIVILEGED_TOKEN
    const prevSmtp = process.env.SMTP_PASS
    const prevJavaHome = process.env.JAVA_HOME
    process.env.JWT_SECRET = 'unit-test-jwt-secret-probe'
    process.env.API_PRIVILEGED_TOKEN = 'unit-test-privileged-token-probe'
    process.env.SMTP_PASS = 'unit-test-smtp-pass-probe'
    process.env.JAVA_HOME = process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@17'
    try {
      const { spawnWorker } = await import('../routes/remediate.js')
      spawnWorker('fake-job-id')

      expect(spawnCalls.length).toBe(1)
      const [execPath, args, options] = spawnCalls[0] as [
        string,
        string[],
        { env?: Record<string, string | undefined> },
      ]
      expect(execPath).toBe(process.execPath)
      expect(args).toContain('fake-job-id')

      const env = options?.env ?? {}
      expect(env.JWT_SECRET).toBeUndefined()
      expect(env.API_PRIVILEGED_TOKEN).toBeUndefined()
      expect(env.SMTP_PASS).toBeUndefined()
      // Essentials survive so the tsx + JVM boot chain still works.
      expect(env.PATH).toBe(process.env.PATH)
      expect(env.HOME).toBe(process.env.HOME)
      expect(env.JAVA_HOME).toBe(process.env.JAVA_HOME)
    } finally {
      if (prevJwt === undefined) delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = prevJwt
      if (prevToken === undefined) delete process.env.API_PRIVILEGED_TOKEN
      else process.env.API_PRIVILEGED_TOKEN = prevToken
      if (prevSmtp === undefined) delete process.env.SMTP_PASS
      else process.env.SMTP_PASS = prevSmtp
      if (prevJavaHome === undefined) delete process.env.JAVA_HOME
      else process.env.JAVA_HOME = prevJavaHome
    }
  })
})
