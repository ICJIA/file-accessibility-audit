/**
 * Builds the `env` passed to child processes that parse ATTACKER-CONTROLLED
 * bytes: the OOXML analysis worker (services/ooxmlRunner.ts, parsing a
 * docx/pptx/xlsx) and the PDF remediation worker (routes/remediate.ts,
 * parsing a PDF via qpdf/ODL/veraPDF). Both need enough of the parent's
 * environment to boot — PATH, HOME, NODE_* / TSX_* for the `node --import tsx`
 * launch, JAVA_* / PATH for the remediation worker's JVM child, plus
 * LANG, LC_*, TMPDIR, TERM for well-behaved subprocess/locale/tooling behavior
 * — but must NOT receive the API's own secrets. If a parser bug in either
 * child is ever exploited into reading or exfiltrating its own environment,
 * a denylisted env means there is nothing sensitive to find.
 *
 * DENYLIST, not allowlist: a `--import tsx` child and the Java remediation
 * worker are fragile to boot under a tight allowlist (an undocumented env
 * need surfaces as an opaque startup failure, not a clear "missing X"), so
 * this starts from a full copy of the parent's env and deletes only keys
 * that match a known-sensitive pattern. Nothing a legitimate boot needs is
 * ever accidentally omitted.
 *
 * Secret families stripped (see audit.config.ts + a grep of
 * `process.env.` across apps/api/src for the enumeration):
 *   - JWT_SECRET                     — signs/verifies session JWTs (authMiddleware.ts)
 *   - API_PRIVILEGED_TOKEN           — the privileged-tier bearer token (rateLimiter.ts)
 *   - SMTP_* / SMTP2GO_* / MAILGUN_* — mail relay credentials (mailer.ts); the
 *     whole families are dropped (not just *_USER/*_PASS) since neither
 *     child ever sends email
 *   - ADMIN_*                        — admin-email allowlist (authMiddleware.ts /
 *     auth.ts); neither child makes authorization decisions
 *   - generic *_SECRET / *_TOKEN / *_PASSWORD / *_PASS / *_KEY suffixes —
 *     catches the families above again plus anything added later without a
 *     matching rule here (including hosting/CI-injected vars this app
 *     doesn't define itself, e.g. a stray *_API_KEY)
 *
 * Explicitly never stripped by any of the rules above (this is *why* a
 * denylist is safe here, not an assertion enforced in code): NODE_*, PATH,
 * HOME, TSX_*, JAVA_*, LANG, LC_*, TMPDIR, TERM, and non-secret operational
 * config such as DB_PATH — a filesystem path, not a credential, that the
 * remediation worker genuinely needs in order to open the SAME sqlite file
 * as the parent process (see services/remediationJobs.ts).
 */

const DENY_EXACT = new Set(["JWT_SECRET", "API_PRIVILEGED_TOKEN"]);
const DENY_PREFIXES = ["SMTP_", "SMTP2GO_", "MAILGUN_", "ADMIN_"];
const DENY_SUFFIXES = ["_SECRET", "_TOKEN", "_PASSWORD", "_PASS", "_KEY"];

function isSensitiveEnvKey(key: string): boolean {
  const upper = key.toUpperCase();
  if (DENY_EXACT.has(upper)) return true;
  if (DENY_PREFIXES.some((prefix) => upper.startsWith(prefix))) return true;
  if (DENY_SUFFIXES.some((suffix) => upper.endsWith(suffix))) return true;
  return false;
}

/**
 * Returns a copy of `source` (defaults to `process.env`) with every
 * sensitive key removed. Pure — never mutates `source`. Suitable to pass
 * directly as `child_process.spawn(...)`'s `env` option.
 */
export function buildChildSpawnEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (isSensitiveEnvKey(key)) continue;
    env[key] = value;
  }
  return env;
}
