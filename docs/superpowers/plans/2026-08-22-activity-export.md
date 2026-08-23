# Activity Export & Failure Record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record failed audits in `audit_log` with a one-word reason, write one derived CSV of `audit_log` per complete Chicago day into `logs/` at the repository root (365-day window, server disk only), trim two noisy log sites, and ship it as v1.88.0 with the data-retention policy at v1.12.

**Architecture:** A pure classifier (`services/auditFailure.ts`) maps the errors the five audit routes already catch onto a closed reason set; a new writer (`recordAuditFailure`) stores `<type>-failed` rows (migration 13 adds `audit_log.reason`). The export is three small modules — day arithmetic (`activityDays.ts`), CSV formatting (`activityCsv.ts`), and the file runner (`activityExport.ts`) — invoked as step 8 of the existing retention sweep (`runCleanup`). Nothing is served; the policy page, README and a runbook describe the new artifact.

**Tech Stack:** TypeScript (ESM, `tsx`, no emit), Express 4, better-sqlite3 (WAL, numbered migrations on `PRAGMA user_version`), vitest, Nuxt 4 / Vue 3 (web), Prettier + ESLint. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-22-activity-export-design.md` — read it first; every task below cites the section it implements.

## Global Constraints

- Node ≥ 22. No new npm dependencies anywhere.
- Run every root script FROM THE REPO ROOT: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`. (`pnpm build` does NOT typecheck apps/web — `pnpm typecheck` does. `pnpm lint` does NOT run `format:check` — run both.)
- API tests: `pnpm --filter api exec vitest run <file>`; web tests: `pnpm --filter web exec vitest run <file>` (web test files must live under `apps/web/app/__tests__/`).
- Prettier: semicolons, double quotes, 2-space indent, 100-col wrap. After editing any `.vue` file run `pnpm exec prettier --write <file>` before `pnpm format:check`.
- Event-type and reason strings are EXACT: `analyze-failed`, `analyze-url-failed`, `audit-url-failed`, `audit-url-page-failed`, `bulk-from-inventory-failed`; reasons `unreadable`, `timeout`, `fetch-failed`, `navigation-failed`, `internal`; CSV tiers `trusted-tool`, `public`, `unknown`.
- Policy/README copy must never contain "no personal data/information/details", "no PII", "anonymous"/"anonymised", or the word "strong" (user rule: product copy is Trump-free — say "high").
- Nothing new is logged that carries an IP, a token, a user agent, or a request body.
- Commit messages: plain, no `Co-Authored-By` or any AI trailer. Commit after every task.
- Retention is ONE number: `SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS`. Do not introduce another.

---

## File map

| File | Responsibility |
|---|---|
| `audit.config.ts` | `STATUS.FAILURE_EVENT_TYPES`, `DEPLOY.LOCAL_TIME_ZONE`, new `ACTIVITY_EXPORT` block |
| `apps/api/src/db/migrations.ts` | migration 13: `audit_log.reason TEXT` |
| `apps/api/src/services/auditFailure.ts` (new) | `AUDIT_FAILURE_REASONS`, `AuditFailureReason`, `classifyAuditFailure(err)` |
| `apps/api/src/services/auditLog.ts` | `reason` in the INSERT; `recordAuditFailure()` |
| `apps/api/src/services/urlAuditPipeline.ts` | records `fetch-failed` for URL audits (the only place fetch errors are caught) |
| `apps/api/src/routes/{analyze,analyze-url,audit-url,audit-url-page,bulk-from-inventory}.ts` | call the classifier + writer in their catch blocks; page route's noise trim |
| `apps/api/src/middleware/errorHandler.ts` (new) | the global error handler, extracted from `index.ts`; 4xx one-liner |
| `apps/api/src/services/dataDir.ts` (new) | `defaultDataDir()` (moved out of status.ts, re-exported there), `repoRoot()`, `activityLogDir()` (`<repo-root>/logs`, `ACTIVITY_LOG_DIR` override) |
| `apps/api/src/services/sqliteTime.ts` (new) | `sqliteUtcToIso()` (moved out of status.ts, re-exported there) |
| `apps/api/src/services/activityDays.ts` (new) | local-date arithmetic, export window, file-name encode/parse |
| `apps/api/src/services/activityCsv.ts` (new) | column allow-list, field quoting/injection guard, BOM, row formatting |
| `apps/api/src/services/activityExport.ts` (new) | `runActivityExport()` — write missing complete days, prune by filename date |
| `apps/api/src/services/remediationCleanup.ts` | step 8 + two result fields (Task 10); error-log pruning + a third field (Task 14) |
| `apps/api/src/services/errorLog.ts` (new, Task 14) | `installErrorLogTee()` — tees `console.error`/`console.warn` into `logs/errors-YYYY-MM-DD.log`; `pruneErrorLogs()` |
| `apps/web/app/components/dataRetention/Section{07,08,08a,14}*.vue`, `apps/web/app/pages/data-retention.vue` | policy v1.12 |
| `docs/activity-export.md` (new), `docs/process-supervision.md`, `README.md` | runbook, gzip correction, README |
| `CHANGELOG.md`, 6× `package.json`, `apps/web/app/data/securityAudits.ts`, `audit.config.ts` (`ANNOUNCEMENTS`) | release v1.88.0 |

---

### Task 1: Config constants + migration 13 (spec § 1.1, § 1.2, § 2.1)

**Files:**
- Modify: `audit.config.ts` (STATUS block ~L1598–1640; DEPLOY block after `BIND_HOST` ~L790; new block after the `SHARED_REPORTS` block closes, just before the STATUS banner ~L1525)
- Modify: `apps/api/src/db/migrations.ts` (append after the `version: 12` entry, ~L345)
- Test: `apps/api/src/__tests__/failureEventTypes.test.ts`

**Interfaces:**
- Produces: `STATUS.FAILURE_EVENT_TYPES` (readonly tuple of 5 strings), `DEPLOY.LOCAL_TIME_ZONE: "America/Chicago"`, `ACTIVITY_EXPORT.{DIR_NAME: "activity", FILE_PREFIX: "activity-", GRACE_MINUTES: 5}`, `audit_log.reason TEXT` at `user_version` 13.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/__tests__/failureEventTypes.test.ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { ACTIVITY_EXPORT, DEPLOY, STATUS } from "#config";
import { MIGRATIONS, runMigrations } from "../db/migrations.js";

describe("STATUS.FAILURE_EVENT_TYPES", () => {
  it("is exactly the '-failed' twin of every document and page event type", () => {
    const expected = [...STATUS.DOCUMENT_EVENT_TYPES, ...STATUS.PAGE_EVENT_TYPES].map(
      (t) => `${t}-failed`,
    );
    expect([...STATUS.FAILURE_EVENT_TYPES].sort()).toEqual(expected.sort());
  });

  it("overlaps no other event-type list, so the allow-list counters exclude it by construction", () => {
    const others = new Set<string>([
      ...STATUS.DOCUMENT_EVENT_TYPES,
      ...STATUS.PAGE_EVENT_TYPES,
      ...STATUS.REJECTION_EVENT_TYPES,
    ]);
    for (const t of STATUS.FAILURE_EVENT_TYPES) expect(others.has(t)).toBe(false);
  });
});

describe("migration 13: audit_log.reason", () => {
  it("a fresh database has a nullable TEXT reason column and lands at version 13", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const cols = db.pragma("table_info(audit_log)") as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    const reason = cols.find((c) => c.name === "reason");
    expect(reason).toBeDefined();
    expect(reason!.type).toBe("TEXT");
    expect(reason!.notnull).toBe(0);
    expect(db.pragma("user_version", { simple: true })).toBe(13);
    expect(MIGRATIONS[MIGRATIONS.length - 1].version).toBe(13);
  });

  it("is safe to re-run on a database that already has the column", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const m13 = MIGRATIONS.find((m) => m.version === 13)!;
    expect(() => m13.up(db)).not.toThrow();
  });
});

describe("export configuration", () => {
  it("names a real IANA zone and sane export settings", () => {
    expect(
      () => new Intl.DateTimeFormat("en-US", { timeZone: DEPLOY.LOCAL_TIME_ZONE }),
    ).not.toThrow();
    expect(DEPLOY.LOCAL_TIME_ZONE).toBe("America/Chicago");
    expect(ACTIVITY_EXPORT.DIR_NAME).toBe("activity");
    expect(ACTIVITY_EXPORT.FILE_PREFIX).toBe("activity-");
    expect(ACTIVITY_EXPORT.GRACE_MINUTES).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api exec vitest run src/__tests__/failureEventTypes.test.ts`
Expected: FAIL — `ACTIVITY_EXPORT` has no export / `FAILURE_EVENT_TYPES` undefined / user_version is 12.

- [ ] **Step 3: Add the config constants**

In `audit.config.ts`, inside `STATUS`, directly after the `REJECTION_EVENT_TYPES: ["rejected-upload"],` line:

```ts
  /**
   * audit_log.event_type values for an audit the tool ATTEMPTED and could not
   * complete (v1.88.0): one "-failed" twin per DOCUMENT_EVENT_TYPES and
   * PAGE_EVENT_TYPES entry, pinned by failureEventTypes.test.ts.
   *
   * DO NOT add these to DOCUMENT_EVENT_TYPES or PAGE_EVENT_TYPES. A failed
   * audit has no score and no grade, so counting it would inflate
   * documents_audited and dump rows into the grade distribution's 'ungraded'
   * bucket — the same reasoning as REJECTION_EVENT_TYPES. Every counting
   * helper in services/status.ts is an allow-list, so these rows are
   * excluded by construction; status.test.ts pins that anyway.
   *
   * Failure rows are written with content_hash NULL (recordAuditFailure), so
   * a failure can never satisfy the remediation audit-gate — identical to the
   * rejection reasoning above. Their one-word `reason` column is a closed set
   * (services/auditFailure.ts), never error text.
   *
   * SAFE TO CHANGE: Only alongside recordAuditFailure's FailureEventBase type.
   */
  FAILURE_EVENT_TYPES: [
    "analyze-failed",
    "analyze-url-failed",
    "audit-url-failed",
    "audit-url-page-failed",
    "bulk-from-inventory-failed",
  ],
```

Inside `DEPLOY`, directly after the `BIND_HOST: "127.0.0.1",` line:

```ts

  /**
   * The IANA time zone used wherever the service renders an instant for a
   * human reader — /status's *_chicago fields and the daily activity export's
   * file boundaries and timestamp_chicago column. The database stays UTC.
   *
   * SAFE TO CHANGE: Yes, to the zone the service's readers live in. Changing
   * it after activity files exist re-cuts future days on the new zone; the
   * existing files keep their old boundaries (see docs/activity-export.md).
   */
  LOCAL_TIME_ZONE: "America/Chicago",
```

Immediately after the `} as const;` that closes `SHARED_REPORTS` (before the `// STATUS` banner comment), add:

```ts

// ---------------------------------------------------------------------------
// DAILY ACTIVITY EXPORT (v1.88.0)
// ---------------------------------------------------------------------------
// One CSV per complete local calendar day, derived from audit_log by the
// retention sweep (services/activityExport.ts). Design:
// docs/superpowers/specs/2026-08-22-activity-export-design.md

export const ACTIVITY_EXPORT = {
  /**
   * Subdirectory of the data directory (the directory holding the SQLite
   * database — DB_PATH's parent, the same volume the /status disk probe
   * watches) where the daily files are written.
   *
   * SAFE TO CHANGE: Yes. Existing files are not moved; delete the old
   * directory by hand after changing this.
   */
  DIR_NAME: "activity",

  /**
   * File name prefix: `<prefix>YYYY-MM-DD.csv`. Pruning deletes ONLY names of
   * exactly this shape, so nothing a human drops into the directory is ever
   * touched.
   *
   * SAFE TO CHANGE: Yes, but files written under the old prefix will never
   * be pruned — rename them by hand.
   */
  FILE_PREFIX: "activity-",

  /**
   * Minutes after local midnight before the previous day counts as complete
   * and is written. Rows are insert-only with server-set timestamps, so the
   * only thing this guards is a request that straddles midnight.
   *
   * Retention is deliberately NOT a setting here: the files reuse
   * SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS so a file exists exactly when its
   * rows do. SAFE TO CHANGE: Yes.
   */
  GRACE_MINUTES: 5,
} as const;
```

- [ ] **Step 4: Add migration 13**

In `apps/api/src/db/migrations.ts`, after the `version: 12` object (before the closing `];` of `MIGRATIONS`):

```ts
  {
    version: 13,
    // One-word reason on a FAILED audit (v1.88.0): an audit the tool attempted
    // and could not complete now leaves a `<type>-failed` row — same fields as
    // a successful audit, score/grade/content_hash NULL — plus this code.
    // Closed set (services/auditFailure.ts): unreadable, timeout, fetch-failed,
    // navigation-failed, internal. Never error text: messages can embed a file
    // name, a URL, or a library path, and the data-retention page describes
    // this column as a fixed code. NULL on every non-failure row.
    // Probe-before-ALTER so a crashed re-run is safe.
    name: "add audit_log.reason (one-word failure code on a failed audit)",
    up(db) {
      if (!hasColumn(db, "audit_log", "reason")) {
        db.exec(`ALTER TABLE audit_log ADD COLUMN reason TEXT;`);
      }
    },
  },
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter api exec vitest run src/__tests__/failureEventTypes.test.ts src/__tests__/migrations.test.ts src/__tests__/statusPrivacy.test.ts`
Expected: all PASS (migrations.test.ts derives `LATEST_VERSION` from the array, so it follows).

- [ ] **Step 6: Commit**

```bash
git add audit.config.ts apps/api/src/db/migrations.ts apps/api/src/__tests__/failureEventTypes.test.ts
git commit -m "feat(config): failure event types, local time zone, activity-export block; migration 13 adds audit_log.reason"
```

---

### Task 2: The failure classifier (spec § 1.4)

**Files:**
- Create: `apps/api/src/services/auditFailure.ts`
- Test: `apps/api/src/__tests__/auditFailureClassifier.test.ts`

**Interfaces:**
- Consumes: `SafeFetchError` from `apps/api/src/services/safeFetch.ts` (class with `readonly code`).
- Produces: `export const AUDIT_FAILURE_REASONS = ["unreadable","timeout","fetch-failed","navigation-failed","internal"] as const`, `export type AuditFailureReason = (typeof AUDIT_FAILURE_REASONS)[number]`, `export function classifyAuditFailure(err: unknown): AuditFailureReason | null`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/__tests__/auditFailureClassifier.test.ts
/**
 * classifyAuditFailure maps whatever an audit route catches onto a CLOSED set
 * of one-word reasons (or null = "not an audit failure, record nothing").
 * The reason is stored in audit_log.reason and exported to the daily activity
 * CSV, so it must never be error text — messages embed file names, URLs and
 * library paths. Every rule of the spec's § 1.4 table is pinned here against
 * the real error shapes the routes see today.
 */
import { describe, it, expect } from "vitest";
import { SafeFetchError } from "../services/safeFetch.js";
import { AUDIT_FAILURE_REASONS, classifyAuditFailure } from "../services/auditFailure.js";

const withCode = (code: string, message = "x") => Object.assign(new Error(message), { code });

describe("classifyAuditFailure — the closed reason set", () => {
  it("a SafeFetchError is fetch-failed whatever its code or message says", () => {
    expect(classifyAuditFailure(new SafeFetchError("dns_failed", "getaddrinfo ENOTFOUND"))).toBe(
      "fetch-failed",
    );
    // Its own code set has a lowercase "timeout" — still a fetch outcome.
    expect(classifyAuditFailure(new SafeFetchError("timeout", "fetch timed out"))).toBe(
      "fetch-failed",
    );
    expect(classifyAuditFailure(new SafeFetchError("oversized", "too large"))).toBe("fetch-failed");
  });

  it("capacity is not an outcome: status 503 records nothing", () => {
    expect(classifyAuditFailure(Object.assign(new Error("busy"), { status: 503 }))).toBeNull();
  });

  it("refusals record nothing here (rejected-upload already covers them)", () => {
    for (const code of ["UNSUPPORTED_FILE_TYPE", "DOCX_DISABLED", "PPTX_DISABLED", "XLSX_DISABLED"]) {
      expect(classifyAuditFailure(withCode(code)), code).toBeNull();
    }
  });

  it("a parser that could not read the bytes is unreadable", () => {
    for (const code of ["PDF_PARSE_FAILED", "DOCX_PARSE_FAILED", "PPTX_PARSE_FAILED", "XLSX_PARSE_FAILED"]) {
      expect(classifyAuditFailure(withCode(code)), code).toBe("unreadable");
    }
    expect(classifyAuditFailure(new Error("PDF is encrypted"))).toBe("unreadable");
    expect(classifyAuditFailure(new Error("password required to open"))).toBe("unreadable");
  });

  it("timeouts in every shape the engines produce are timeout", () => {
    expect(classifyAuditFailure(withCode("ETIMEDOUT"))).toBe("timeout");
    expect(classifyAuditFailure(Object.assign(new Error("killed"), { killed: true }))).toBe("timeout");
    expect(classifyAuditFailure(Object.assign(new Error("slow"), { name: "TimeoutError" }))).toBe(
      "timeout",
    );
    expect(classifyAuditFailure(new Error("Navigation timeout of 30000 ms exceeded"))).toBe("timeout");
    expect(classifyAuditFailure(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(
      "timeout",
    );
  });

  it("a Chromium navigation error is navigation-failed", () => {
    expect(
      classifyAuditFailure(new Error("net::ERR_ABORTED at https://example.gov/files/brief.pdf")),
    ).toBe("navigation-failed");
    // "TIMED_OUT" is not "timeout": the navigation rule wins over the fallback.
    expect(classifyAuditFailure(new Error("net::ERR_CONNECTION_TIMED_OUT at https://x"))).toBe(
      "navigation-failed",
    );
  });

  it("everything else — including non-Error throwables — is internal", () => {
    expect(classifyAuditFailure(new Error("boom"))).toBe("internal");
    expect(classifyAuditFailure("a string")).toBe("internal");
    expect(classifyAuditFailure(undefined)).toBe("internal");
    expect(classifyAuditFailure(null)).toBe("internal");
    expect(classifyAuditFailure(42)).toBe("internal");
  });

  it("never returns anything outside the closed set, and never the message", () => {
    const secret = "xyzzy-/srv/app/chromium/profile-9f3ac";
    const samples: unknown[] = [
      new Error(secret),
      withCode("PDF_PARSE_FAILED", secret),
      new Error(`net::ERR_FAILED at ${secret}`),
      new SafeFetchError("network_error", secret),
      Object.assign(new Error(secret), { status: 503 }),
    ];
    for (const s of samples) {
      const r = classifyAuditFailure(s);
      if (r === null) continue;
      expect(AUDIT_FAILURE_REASONS).toContain(r);
      expect(r).not.toContain("xyzzy");
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api exec vitest run src/__tests__/auditFailureClassifier.test.ts`
Expected: FAIL — cannot resolve `../services/auditFailure.js`.

- [ ] **Step 3: Write the classifier**

```ts
// apps/api/src/services/auditFailure.ts
/**
 * Classifies an error caught by an audit route into ONE of a closed set of
 * reasons — or null, meaning "this was not an audit failure; record nothing".
 *
 * The reason is persisted (audit_log.reason, migration 13) and exported to the
 * daily activity CSV, and the data-retention policy describes it as a fixed
 * one-word code. So this function is the whole vocabulary: nothing derived
 * from err.message ever leaves it — messages embed file names, URLs and
 * library paths. Pinned by auditFailureClassifier.test.ts.
 *
 * Checks run in order; the first match wins (spec § 1.4):
 *   1. SafeFetchError → fetch-failed (its own codes include "timeout")
 *   2. status 503 (analysis semaphore, PageAuditBusyError) → null: capacity
 *   3. refusal codes → null: rejected-upload already records those
 *   4. parse codes, or an encrypted/password-protected document → unreadable
 *   5. ETIMEDOUT / killed / TimeoutError / AbortError / "timeout" → timeout
 *   6. Chromium "net::ERR_*" → navigation-failed
 *   7. anything else, including non-Error throwables → internal
 */
import { SafeFetchError } from "./safeFetch.js";

export const AUDIT_FAILURE_REASONS = [
  "unreadable",
  "timeout",
  "fetch-failed",
  "navigation-failed",
  "internal",
] as const;

export type AuditFailureReason = (typeof AUDIT_FAILURE_REASONS)[number];

/** Not audit failures: the tool refused the file (recorded as rejected-upload
 *  by the route) or the format is switched off on this server. */
const REFUSAL_CODES = new Set([
  "UNSUPPORTED_FILE_TYPE",
  "DOCX_DISABLED",
  "PPTX_DISABLED",
  "XLSX_DISABLED",
]);

const PARSE_CODES = new Set([
  "PDF_PARSE_FAILED",
  "DOCX_PARSE_FAILED",
  "PPTX_PARSE_FAILED",
  "XLSX_PARSE_FAILED",
]);

interface ErrorShape {
  status?: unknown;
  code?: unknown;
  killed?: unknown;
  name?: unknown;
  message?: unknown;
}

export function classifyAuditFailure(err: unknown): AuditFailureReason | null {
  if (err instanceof SafeFetchError) return "fetch-failed";

  const e: ErrorShape = typeof err === "object" && err !== null ? (err as ErrorShape) : {};
  if (e.status === 503) return null;

  const code = typeof e.code === "string" ? e.code : "";
  if (REFUSAL_CODES.has(code)) return null;
  if (PARSE_CODES.has(code)) return "unreadable";

  const message = typeof e.message === "string" ? e.message : "";
  if (/encrypted|password/i.test(message)) return "unreadable";

  if (
    code === "ETIMEDOUT" ||
    e.killed === true ||
    e.name === "TimeoutError" ||
    e.name === "AbortError" ||
    /timeout/i.test(message)
  ) {
    return "timeout";
  }

  if (/net::ERR_/.test(message)) return "navigation-failed";

  return "internal";
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter api exec vitest run src/__tests__/auditFailureClassifier.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/auditFailure.ts apps/api/src/__tests__/auditFailureClassifier.test.ts
git commit -m "feat(api): classifyAuditFailure — closed reason set for failed audits"
```

---

### Task 3: The failure writer + /status immunity (spec § 1.3, § 1.1, § 6)

**Files:**
- Modify: `apps/api/src/services/auditLog.ts` (imports L1–4; `insertStmt` L41–45; `recordAudit` L101–110; new function after `recordRejectedUpload` ~L150)
- Modify: `apps/api/src/__tests__/status.test.ts` (append a describe block at the end)
- Test: `apps/api/src/__tests__/auditLogFailure.test.ts`

**Interfaces:**
- Consumes: `AuditFailureReason`, `AUDIT_FAILURE_REASONS` (Task 2); `STATUS.FAILURE_EVENT_TYPES` (Task 1).
- Produces: `export type FailureEventBase = "analyze" | "analyze-url" | "audit-url" | "audit-url-page" | "bulk-from-inventory"`, `export interface RecordAuditFailureInput { eventType: FailureEventBase; privileged: boolean; filename: string; reason: AuditFailureReason }`, `export function recordAuditFailure(input: RecordAuditFailureInput): void`.

- [ ] **Step 1: Write the failing writer test**

```ts
// apps/api/src/__tests__/auditLogFailure.test.ts
/**
 * recordAuditFailure (v1.88.0): a failed audit leaves a `<type>-failed` row —
 * the same fields as a successful audit, score/grade/content_hash NULL, and a
 * one-word reason. Exercised against a REAL migrated ":memory:" database via
 * the same singleton mock auditLogTier.test.ts uses, so the actual INSERT runs.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../db/sqlite.js", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { runMigrations } = await import("../db/migrations.js");
  const db = new Database(":memory:");
  runMigrations(db);
  return { default: db };
});

const db = (await import("../db/sqlite.js")).default as unknown as {
  prepare: (sql: string) => { get: (...a: unknown[]) => unknown };
  exec: (sql: string) => void;
};
const { STATUS } = await import("#config");
const { recordAudit, recordAuditFailure, recordRejectedUpload } = await import(
  "../services/auditLog.js"
);

interface Row {
  event_type: string;
  filename: string;
  score: number | null;
  grade: string | null;
  content_hash: string | null;
  privileged: number | null;
  reason: string | null;
}

function rowFor(filename: string): Row {
  return db
    .prepare(
      `SELECT event_type, filename, score, grade, content_hash, privileged, reason
         FROM audit_log WHERE filename = ?`,
    )
    .get(filename) as Row;
}

describe("recordAuditFailure", () => {
  it("writes <base>-failed with NULL score/grade/hash, the tier and the reason", () => {
    recordAuditFailure({
      eventType: "analyze",
      privileged: true,
      filename: "broken.pdf",
      reason: "unreadable",
    });
    expect(rowFor("broken.pdf")).toEqual({
      event_type: "analyze-failed",
      filename: "broken.pdf",
      score: null,
      grade: null,
      content_hash: null,
      privileged: 1,
      reason: "unreadable",
    });
  });

  it("every FailureEventBase lands in STATUS.FAILURE_EVENT_TYPES", () => {
    const bases = ["analyze", "analyze-url", "audit-url", "audit-url-page", "bulk-from-inventory"] as const;
    for (const base of bases) {
      recordAuditFailure({ eventType: base, privileged: false, filename: `f-${base}`, reason: "internal" });
      expect(STATUS.FAILURE_EVENT_TYPES as readonly string[]).toContain(rowFor(`f-${base}`).event_type);
    }
  });

  it("sanitises a FILE name (basename, one line, allowed characters) like the other writers", () => {
    recordAuditFailure({
      eventType: "analyze",
      privileged: false,
      filename: "../../tmp/evil\nname<b>.pdf",
    reason: "internal",
    });
    const stored = db
      .prepare(`SELECT filename FROM audit_log WHERE event_type = 'analyze-failed' ORDER BY id DESC LIMIT 1`)
      .get() as { filename: string };
    expect(stored.filename).not.toContain("/");
    expect(stored.filename).not.toContain("\n");
    expect(stored.filename).not.toContain("<");
  });

  it("keeps a URL intact for the URL-bearing events (only newlines collapse, length clamps)", () => {
    const url = "https://example.gov/files/a%20b.pdf?x=1";
    recordAuditFailure({ eventType: "audit-url-page", privileged: false, filename: url, reason: "navigation-failed" });
    expect(rowFor(url).event_type).toBe("audit-url-page-failed");

    const long = "https://example.gov/" + "a".repeat(600);
    recordAuditFailure({ eventType: "audit-url", privileged: false, filename: long, reason: "fetch-failed" });
    const stored = db
      .prepare(`SELECT filename FROM audit_log WHERE event_type = 'audit-url-failed' ORDER BY id DESC LIMIT 1`)
      .get() as { filename: string };
    expect(stored.filename.length).toBe(512);

    recordAuditFailure({ eventType: "analyze-url", privileged: false, filename: "https://x.gov/a\nb.pdf", reason: "timeout" });
    expect(rowFor("https://x.gov/a b.pdf").event_type).toBe("analyze-url-failed");
  });

  it("a reason outside the closed set is stored as 'internal', never as given", () => {
    recordAuditFailure({
      eventType: "analyze",
      privileged: false,
      filename: "odd.pdf",
      reason: "<script>alert(1)</script>" as unknown as "internal",
    });
    expect(rowFor("odd.pdf").reason).toBe("internal");
  });

  it("recordAudit and recordRejectedUpload leave reason NULL", () => {
    recordAudit({ eventType: "analyze", filename: "ok.pdf", score: 90, grade: "A", privileged: false });
    recordRejectedUpload({ filename: "refused.csv", privileged: false });
    expect(rowFor("ok.pdf").reason).toBeNull();
    expect(rowFor("refused.csv").reason).toBeNull();
  });

  it("never throws when the insert fails — the HTTP response must not change", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.exec("DROP TABLE audit_log");
    expect(() =>
      recordAuditFailure({ eventType: "analyze", privileged: false, filename: "x.pdf", reason: "internal" }),
    ).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api exec vitest run src/__tests__/auditLogFailure.test.ts`
Expected: FAIL — `recordAuditFailure is not a function`.

- [ ] **Step 3: Implement the writer**

In `apps/api/src/services/auditLog.ts`:

Replace the import block at the top (L1–4) with:

```ts
import crypto from "node:crypto";
import path from "node:path";
import db from "../db/sqlite.js";
import { FILENAME, STATUS } from "#config";
import { AUDIT_FAILURE_REASONS, type AuditFailureReason } from "./auditFailure.js";
```

Replace `insertStmt` (L41–45) with:

```ts
const insertStmt = db.prepare(
  `INSERT INTO audit_log
     (event_type, filename, score, grade, content_hash, privileged, reason)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
```

In `recordAudit`, add a seventh argument after the `input.privileged ? 1 : 0,` line:

```ts
      // reason belongs to failed audits only (recordAuditFailure); NULL here.
      null,
```

Append after `recordRejectedUpload` (before the `hasRecentAudit` comment block):

```ts
/** The audit paths that can fail. The writer appends "-failed" itself, so a
 *  call site cannot misspell the twin; auditLogFailure.test.ts pins that every
 *  result is in STATUS.FAILURE_EVENT_TYPES. */
export type FailureEventBase =
  | "analyze"
  | "analyze-url"
  | "audit-url"
  | "audit-url-page"
  | "bulk-from-inventory";

export interface RecordAuditFailureInput {
  eventType: FailureEventBase;
  privileged: boolean;
  /** The uploaded file's name, or the URL for the URL / page audits. */
  filename: string;
  reason: AuditFailureReason;
}

/** Events whose `filename` is a real file name and gets the full sanitiser.
 *  The others carry a URL, which sanitizeStoredFilename would mangle
 *  (basename, `:` and `/` stripped) — they get single-line + clamp only. */
const FILE_NAME_EVENTS: ReadonlySet<FailureEventBase> = new Set(["analyze", "bulk-from-inventory"]);

/**
 * Records an audit the tool ATTEMPTED and could not complete (v1.88.0) as a
 * `<type>-failed` row: the same fields as a successful audit, score / grade /
 * content_hash NULL, plus a one-word reason from the closed set in
 * services/auditFailure.ts. Failure event types are outside every counting
 * allow-list in services/status.ts, so they inflate nothing; the NULL hash
 * means a failure can never satisfy the remediation audit-gate (same reasoning
 * as recordRejectedUpload). Capacity (503) and refusals are not failures —
 * classifyAuditFailure answers null for them and callers record nothing.
 *
 * Best-effort like the other writers: a logging failure never changes the
 * HTTP response.
 */
export function recordAuditFailure(input: RecordAuditFailureInput): void {
  // Belt and braces on top of the type: the column is described to readers as
  // a fixed code, so an unexpected value degrades to "internal", never to text.
  const reason: AuditFailureReason = (AUDIT_FAILURE_REASONS as readonly string[]).includes(
    input.reason,
  )
    ? input.reason
    : "internal";
  const filename = FILE_NAME_EVENTS.has(input.eventType)
    ? sanitizeStoredFilename(input.filename)
    : input.filename.replace(/\s/g, " ");
  try {
    insertStmt.run(
      `${input.eventType}-failed`,
      clamp(filename, MAX_FILENAME_CHARS) ?? "",
      null,
      null,
      null,
      input.privileged ? 1 : 0,
      reason,
    );
  } catch (err) {
    console.error("audit_log failure write failed:", err);
  }
}
```

- [ ] **Step 4: Run the writer test**

Run: `pnpm --filter api exec vitest run src/__tests__/auditLogFailure.test.ts src/__tests__/auditLogTier.test.ts src/__tests__/auditLogSanitize.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing /status immunity test**

Append to `apps/api/src/__tests__/status.test.ts`:

```ts
describe("failed audits are invisible to every public count (v1.88.0)", () => {
  it("seeding every failure event type changes nothing in the payload's aggregates", () => {
    const db = freshDb();
    seedAudit(db, { eventType: "analyze", filename: "ok.pdf", privileged: 0 });
    seedAudit(db, { eventType: "rejected-upload", filename: "no.csv", grade: null, privileged: 0 });
    const before = collectAggregates(db, T0);

    for (const t of STATUS.FAILURE_EVENT_TYPES) {
      seedAudit(db, { eventType: t, filename: `${t}.pdf`, grade: null, privileged: 1, agoMs: 60_000 });
    }
    const after = collectAggregates(db, T0);

    expect(after.documents_audited).toEqual(before.documents_audited);
    expect(after.privileged_audits).toEqual(before.privileged_audits);
    expect(after.documents_rejected).toEqual(before.documents_rejected);
    // A failure is not "the last audit".
    expect(after.last_audit_at).toEqual(before.last_audit_at);
    expect(after.database).toBe("ok");
  });
});
```

- [ ] **Step 6: Run it**

Run: `pnpm --filter api exec vitest run src/__tests__/status.test.ts`
Expected: PASS — the allow-lists already exclude the new types. (If any assertion fails, the counting helper it names filters on something other than the event-type allow-list; fix the helper to use `STATUS.DOCUMENT_EVENT_TYPES` — do not weaken the test.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/auditLog.ts apps/api/src/__tests__/auditLogFailure.test.ts apps/api/src/__tests__/status.test.ts
git commit -m "feat(api): recordAuditFailure writes <type>-failed rows with a closed-set reason; /status counts pinned immune"
```

---

### Task 4: Wire the five routes + the URL pipeline; page-audit noise trim (spec § 1.5, § 1.6, § 4)

**Files:**
- Modify: `apps/api/src/services/urlAuditPipeline.ts` (`RunUrlAuditInput` ~L41–54; the `safeFetch` catch ~L93–99; the `!fetched.ok` branch ~L101–106)
- Modify: `apps/api/src/routes/analyze.ts` (imports L7–12; catch ~L72–73)
- Modify: `apps/api/src/routes/analyze-url.ts` (imports L1–5; `runUrlAudit` call ~L37; catch ~L58)
- Modify: `apps/api/src/routes/audit-url.ts` (imports L1–11; `runUrlAudit` call ~L110; catch ~L218)
- Modify: `apps/api/src/routes/audit-url-page.ts` (imports L1–9; inner catch ~L138–165)
- Modify: `apps/api/src/routes/bulk-from-inventory.ts` (imports L1–10; SafeFetchError branch ~L268–280; per-entry analysis catch ~L356)
- Modify: `apps/api/src/__tests__/analyzeVeraPdf.test.ts` (the `../services/auditLog.js` mock factory, ~L36–44)
- Modify: `apps/api/src/__tests__/audit-url-page.test.ts` (append a describe block)
- Test: `apps/api/src/__tests__/auditFailureWiring.test.ts`

**Interfaces:**
- Consumes: `classifyAuditFailure` (Task 2); `recordAuditFailure`, `FailureEventBase` (Task 3); `isPrivilegedRequest(req)` from `../middleware/rateLimiter.js` (existing, pure function of the request).
- Produces: `RunUrlAuditInput.eventType: "analyze-url" | "audit-url"` (new required field).

- [ ] **Step 1: Write the failing wiring tests**

```ts
// apps/api/src/__tests__/auditFailureWiring.test.ts
/**
 * THE WIRING, not the logic: each audit path must actually call
 * recordAuditFailure with its own event type when the audit throws, and must
 * NOT call it for capacity (503). Each route module is imported for real and
 * its handler invoked directly (the extractHandler pattern audit-url.test.ts
 * and audit-url-page.test.ts use); collaborators are mocked per case.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

function makeRes() {
  const res: any = {
    _status: 200,
    _json: null as any,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: any) {
      res._json = body;
      return res;
    },
  };
  return res;
}

function makeReq(overrides: Record<string, unknown> = {}): any {
  return { body: {}, query: {}, headers: {}, ip: "203.0.113.5", get: vi.fn(() => undefined), ...overrides };
}

function extractHandler(router: unknown, path: string): (req: any, res: any) => Promise<void> {
  const stack = (router as { stack: any[] }).stack;
  const layer = stack.find((l) => l.route?.path === path);
  if (!layer) throw new Error(`extractHandler: no route registered for ${path}`);
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle;
}

const withCode = (code: string, message = "x") => Object.assign(new Error(message), { code });

/** Common mocks: no real DB, a spy-able audit log, permissive rate limiter. */
function mockCommon(privileged: boolean) {
  const recordAuditFailure = vi.fn();
  vi.doMock("../db/sqlite.js", () => ({
    default: { prepare: vi.fn(() => ({ get: vi.fn(() => undefined), run: vi.fn(), all: vi.fn(() => []) })) },
  }));
  vi.doMock("../services/auditLog.js", () => ({
    recordAudit: vi.fn(),
    recordAuditFailure,
    recordRejectedUpload: vi.fn(),
    sanitizeStoredFilename: (s: string) => s,
    sha256Hex: vi.fn(() => "hash"),
    hasRecentAudit: vi.fn(() => false),
  }));
  vi.doMock("../middleware/rateLimiter.js", () => ({
    analyzeLimiter: (_req: any, _res: any, next: () => void) => next(),
    reportsLimiter: (_req: any, _res: any, next: () => void) => next(),
    isPrivilegedRequest: () => privileged,
  }));
  return { recordAuditFailure };
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("../db/sqlite.js");
  vi.doUnmock("../services/auditLog.js");
  vi.doUnmock("../middleware/rateLimiter.js");
  vi.doUnmock("../middleware/uploadMiddleware.js");
  vi.doUnmock("../services/analyzer.js");
  vi.doUnmock("../services/veraPdfBuffer.js");
  vi.doUnmock("../services/urlAuditPipeline.js");
  vi.doUnmock("../services/urlPolicy.js");
  vi.doUnmock("../services/safeFetch.js");
  vi.doUnmock("../services/pageAuditor.js");
});

describe("POST /api/analyze records analyze-failed", () => {
  async function load(privileged: boolean, analyzeError: unknown) {
    vi.resetModules();
    const m = mockCommon(privileged);
    vi.doMock("../middleware/uploadMiddleware.js", () => ({
      uploadMiddleware: { single: () => (_req: any, _res: any, next: () => void) => next() },
    }));
    vi.doMock("../services/analyzer.js", () => ({
      analyzeDocument: vi.fn(async () => {
        throw analyzeError;
      }),
      detectFileType: vi.fn(async () => "pdf"),
      detectLegacyFormat: vi.fn(() => null),
    }));
    vi.doMock("../services/veraPdfBuffer.js", () => ({ runVeraPdfOnBuffer: vi.fn(async () => null) }));
    const { default: router } = await import("../routes/analyze.js");
    return { handler: extractHandler(router, "/analyze"), ...m };
  }

  it("an unreadable upload → analyze-failed / unreadable, with the tier", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler, recordAuditFailure } = await load(true, withCode("PDF_PARSE_FAILED"));
    await handler(makeReq({ file: { originalname: "broken.pdf", buffer: Buffer.from("%PDF-") } }), makeRes());
    expect(recordAuditFailure).toHaveBeenCalledWith({
      eventType: "analyze",
      privileged: true,
      filename: "broken.pdf",
      reason: "unreadable",
    });
  });

  it("server busy (503) records nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler, recordAuditFailure } = await load(false, Object.assign(new Error("busy"), { status: 503 }));
    const res = makeRes();
    await handler(makeReq({ file: { originalname: "a.pdf", buffer: Buffer.from("%PDF-") } }), res);
    expect(res._status).toBe(503);
    expect(recordAuditFailure).not.toHaveBeenCalled();
  });
});

describe("POST /api/analyze-url and /api/audit-url record their own failed twin", () => {
  async function loadUrlRoute(file: "analyze-url" | "audit-url", analyzeError: unknown) {
    vi.resetModules();
    const m = mockCommon(false);
    vi.doMock("../services/urlAuditPipeline.js", () => ({
      runUrlAudit: vi.fn(async () => ({
        ok: true,
        buf: Buffer.from("%PDF-"),
        filename: "remote.pdf",
        fileType: "pdf",
        contentHash: "hash",
      })),
    }));
    vi.doMock("../services/analyzer.js", () => ({
      analyzeDocument: vi.fn(async () => {
        throw analyzeError;
      }),
      detectFileType: vi.fn(async () => "pdf"),
    }));
    vi.doMock("../services/urlPolicy.js", () => ({ isAllowedUrl: vi.fn(() => ({ ok: true })) }));
    const { default: router } = await import(`../routes/${file}.js`);
    return { handler: extractHandler(router, `/${file}`), ...m };
  }

  it("analyze-url: an engine timeout → analyze-url-failed / timeout with the URL as filename", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler, recordAuditFailure } = await loadUrlRoute("analyze-url", withCode("ETIMEDOUT"));
    await handler(makeReq({ body: { url: "https://example.gov/slow.pdf" } }), makeRes());
    expect(recordAuditFailure).toHaveBeenCalledWith({
      eventType: "analyze-url",
      privileged: false,
      filename: "https://example.gov/slow.pdf",
      reason: "timeout",
    });
  });

  it("audit-url: a corrupt Word file → audit-url-failed / unreadable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler, recordAuditFailure } = await loadUrlRoute("audit-url", withCode("DOCX_PARSE_FAILED"));
    await handler(makeReq({ body: { url: "https://example.gov/bad.docx", force: true } }), makeRes());
    expect(recordAuditFailure).toHaveBeenCalledWith({
      eventType: "audit-url",
      privileged: false,
      filename: "https://example.gov/bad.docx",
      reason: "unreadable",
    });
  });
});

describe("runUrlAudit records fetch-failed for the route that called it", () => {
  async function loadPipeline(safeFetchImpl: () => Promise<unknown>) {
    vi.resetModules();
    const m = mockCommon(false);
    vi.doMock("../services/safeFetch.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("../services/safeFetch.js")>();
      return { ...orig, safeFetch: vi.fn(safeFetchImpl) };
    });
    const { runUrlAudit } = await import("../services/urlAuditPipeline.js");
    const { SafeFetchError } = await import("../services/safeFetch.js");
    return { runUrlAudit, SafeFetchError, ...m };
  }

  it("a SafeFetchError (DNS) → <caller>-failed / fetch-failed, and the early-exit response still goes out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loaded = await loadPipeline(async () => {
      throw new loaded.SafeFetchError("dns_failed", "getaddrinfo ENOTFOUND example.gov");
    });
    const res = makeRes();
    const outcome = await loaded.runUrlAudit({
      url: "https://example.gov/missing.pdf",
      privileged: false,
      res,
      eventType: "audit-url",
    });
    expect(outcome.ok).toBe(false);
    expect(res._status).toBeGreaterThanOrEqual(400);
    expect(loaded.recordAuditFailure).toHaveBeenCalledWith({
      eventType: "audit-url",
      privileged: false,
      filename: "https://example.gov/missing.pdf",
      reason: "fetch-failed",
    });
  });

  it("an upstream HTTP error status → fetch-failed too", async () => {
    const loaded = await loadPipeline(async () => ({ ok: false, status: 404, statusText: "Not Found" }));
    const res = makeRes();
    await loaded.runUrlAudit({ url: "https://example.gov/gone.pdf", privileged: true, res, eventType: "analyze-url" });
    expect(res._status).toBe(502);
    expect(loaded.recordAuditFailure).toHaveBeenCalledWith({
      eventType: "analyze-url",
      privileged: true,
      filename: "https://example.gov/gone.pdf",
      reason: "fetch-failed",
    });
  });
});

describe("POST /api/bulk-from-inventory records bulk-from-inventory-failed per entry", () => {
  function inventory(entries: object[]): string {
    return entries.map((e) => JSON.stringify(e)).join("\n");
  }
  const bulkReq = (inv: string) =>
    makeReq({
      body: { inventory: inv, filterCategory: "pdf" },
      get: vi.fn((h: string) => (h.toLowerCase() === "content-type" ? "application/json" : undefined)),
    });
  const ENTRY = { path: "a.pdf", filename: "a.pdf", category: "pdf", publicUrl: "https://example.com/a.pdf" };

  async function loadBulk(opts: { safeFetch: () => Promise<unknown>; analyzeError?: unknown }) {
    vi.resetModules();
    const m = mockCommon(true);
    vi.doMock("../services/safeFetch.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("../services/safeFetch.js")>();
      return { ...orig, safeFetch: vi.fn(opts.safeFetch) };
    });
    vi.doMock("../services/urlPolicy.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("../services/urlPolicy.js")>();
      return { ...orig, validateUrlForFetch: vi.fn(() => undefined) };
    });
    vi.doMock("../services/analyzer.js", () => ({
      analyzeDocument: vi.fn(async () => {
        throw opts.analyzeError ?? new Error("unused");
      }),
      detectFileType: vi.fn(async () => "pdf"),
    }));
    const { default: router } = await import("../routes/bulk-from-inventory.js");
    const { SafeFetchError } = await import("../services/safeFetch.js");
    return { handler: extractHandler(router, "/bulk-from-inventory"), SafeFetchError, ...m };
  }

  it("a per-entry fetch failure → fetch-failed, and the batch continues", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loaded = await loadBulk({
      safeFetch: async () => {
        throw new loaded.SafeFetchError("network_error", "connect ECONNREFUSED 10.0.0.1:443");
      },
    });
    const res = makeRes();
    await loaded.handler(bulkReq(inventory([ENTRY])), res);
    expect(res._json.results).toHaveLength(1);
    expect(loaded.recordAuditFailure).toHaveBeenCalledWith({
      eventType: "bulk-from-inventory",
      privileged: true,
      filename: "a.pdf",
      reason: "fetch-failed",
    });
  });

  it("a per-entry analysis failure → the classified reason", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loaded = await loadBulk({
      safeFetch: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        buffer: Buffer.from("%PDF-1.4"),
        finalUrl: "https://example.com/a.pdf",
        resolvedIp: "93.184.216.34",
      }),
      analyzeError: withCode("PDF_PARSE_FAILED"),
    });
    const res = makeRes();
    await loaded.handler(bulkReq(inventory([ENTRY])), res);
    expect(loaded.recordAuditFailure).toHaveBeenCalledWith({
      eventType: "bulk-from-inventory",
      privileged: true,
      filename: "a.pdf",
      reason: "unreadable",
    });
  });
});
```

Append to `apps/api/src/__tests__/audit-url-page.test.ts` (it already has `loadRouterWith`, `extractHandler`, `makeReq`, `makeRes`; its db mock's `run` is the shared `dbRun`, which is what `recordAuditFailure`'s prepared INSERT calls):

```ts
describe("audit-url-page: failed page audits are recorded, and expected failures log one line (v1.88.0)", () => {
  it("net::ERR_ABORTED → audit-url-page-failed / navigation-failed row, one warn line, no stack", async () => {
    const dbRun = vi.fn();
    const router = await loadRouterWith({
      auditPageImpl: async () => {
        throw new Error("net::ERR_ABORTED at https://example.gov/files/brief.pdf");
      },
      dbRunImpl: dbRun,
    });
    const handler = extractHandler(router, "/audit-url-page");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await handler(makeReq({ body: { url: "https://example.gov/files/brief.pdf" } }), makeRes());

    expect(dbRun).toHaveBeenCalledWith(
      "audit-url-page-failed",
      "https://example.gov/files/brief.pdf",
      null,
      null,
      null,
      0,
      "navigation-failed",
    );
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0].map(String).join(" ");
    expect(line).toContain("navigation-failed");
    expect(line).not.toMatch(/\n\s+at /);
    expect(error.mock.calls.map((c) => c.map(String).join(" ")).join("\n")).not.toContain("net::ERR_ABORTED");
    warn.mockRestore();
    error.mockRestore();
  });

  it("an unclassified failure keeps the full error log and is recorded as internal", async () => {
    const dbRun = vi.fn();
    const router = await loadRouterWith({
      auditPageImpl: async () => {
        throw new Error("Protocol error (Page.navigate): Target closed");
      },
      dbRunImpl: dbRun,
    });
    const handler = extractHandler(router, "/audit-url-page");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await handler(makeReq({ body: { url: "https://example.gov/page" } }), makeRes());

    expect(dbRun).toHaveBeenCalledWith("audit-url-page-failed", "https://example.gov/page", null, null, null, 0, "internal");
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  it("server busy records nothing", async () => {
    const dbRun = vi.fn();
    const router = await loadRouterWith({
      auditPageImpl: async () => {
        const err: any = new Error("busy");
        err.status = 503;
        throw err;
      },
      dbRunImpl: dbRun,
    });
    const handler = extractHandler(router, "/audit-url-page");
    await handler(makeReq({ body: { url: "https://example.gov/page" } }), makeRes());
    expect(dbRun).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter api exec vitest run src/__tests__/auditFailureWiring.test.ts src/__tests__/audit-url-page.test.ts`
Expected: FAIL — `recordAuditFailure` never called; `eventType` unknown on `RunUrlAuditInput`.

- [ ] **Step 3: URL pipeline — record fetch failures**

In `apps/api/src/services/urlAuditPipeline.ts`:

Change the import from `./auditLog.js` to:

```ts
import { sha256Hex, recordRejectedUpload, recordAuditFailure } from "./auditLog.js";
```

Add to `RunUrlAuditInput` (after `privileged`):

```ts
  /**
   * Which route is calling (v1.88.0). A fetch that fails is recorded as
   * `<eventType>-failed` / fetch-failed here — this is the only place fetch
   * errors are caught, so the routes' own catch blocks never see them.
   */
  eventType: "analyze-url" | "audit-url";
```

Change the destructuring to `const { url, privileged, res, eventType } = input;` and replace the `safeFetch` catch + the `!fetched.ok` branch with:

```ts
  } catch (err) {
    if (err instanceof SafeFetchError) {
      recordAuditFailure({ eventType, privileged, filename: url, reason: "fetch-failed" });
      sendSafeFetchError(res, err);
      return { ok: false };
    }
    throw err;
  }

  if (!fetched.ok) {
    recordAuditFailure({ eventType, privileged, filename: url, reason: "fetch-failed" });
    res.status(502).json({
      error: `fetch returned ${fetched.status} ${fetched.statusText}`,
    });
    return { ok: false };
  }
```

In `apps/api/src/routes/analyze-url.ts` change the call to `runUrlAudit({ url, privileged, res, eventType: "analyze-url" })`; in `apps/api/src/routes/audit-url.ts` to `runUrlAudit({ url, privileged, res, eventType: "audit-url" })`. Confirm with `grep -rn "runUrlAudit(" apps/api/src --include='*.ts' | grep -v __tests__` that these are the only two callers.

- [ ] **Step 4: analyze.ts**

Replace the `../services/auditLog.js` import block with:

```ts
import {
  recordAudit,
  recordAuditFailure,
  recordRejectedUpload,
  sanitizeStoredFilename,
  sha256Hex,
} from "../services/auditLog.js";
import { classifyAuditFailure } from "../services/auditFailure.js";
```

Replace the first two lines of the catch block (`} catch (err: any) {` / `console.error("Analysis error:", err);`) with:

```ts
    } catch (err: any) {
      console.error("Analysis error:", err);

      // v1.88.0: an audit the tool attempted and could not complete leaves a
      // row of its own — same fields as a successful one, no score/grade/hash,
      // a one-word reason. The classifier answers null for capacity (503) and
      // for refusals, which the UNSUPPORTED_FILE_TYPE branch below records as
      // rejected-upload instead.
      const failure = classifyAuditFailure(err);
      if (failure && req.file) {
        recordAuditFailure({
          eventType: "analyze",
          privileged,
          filename: req.file.originalname,
          reason: failure,
        });
      }
```

- [ ] **Step 5: analyze-url.ts and audit-url.ts**

In both files change the `../services/auditLog.js` import to include `recordAuditFailure` and add `import { classifyAuditFailure } from "../services/auditFailure.js";`. Replace the opening line of each route's catch (`} catch (err: any) {`) with (use `"analyze-url"` in analyze-url.ts and `"audit-url"` in audit-url.ts):

```ts
  } catch (err: any) {
    // v1.88.0: record the failed audit. `url` and `privileged` are declared
    // inside the try, so read them from the request again here; the classifier
    // returns null for capacity (503), which records nothing.
    const failure = classifyAuditFailure(err);
    if (failure && typeof req.body?.url === "string") {
      recordAuditFailure({
        eventType: "analyze-url",
        privileged: isPrivilegedRequest(req),
        filename: req.body.url,
        reason: failure,
      });
    }
```

- [ ] **Step 6: audit-url-page.ts — record + noise trim**

Change the import to `import { recordAudit, recordAuditFailure } from "../services/auditLog.js";` and add `import { classifyAuditFailure } from "../services/auditFailure.js";`. Replace the inner catch around `auditPage` (from `} catch (err: any) {` through the `res.status(502).json({...}); return;` that follows it) with:

```ts
    } catch (err: any) {
      if (err?.status === 503) {
        res.status(503).json({
          error: "Server busy",
          details: "Too many page audits are in progress. Please retry shortly.",
        });
        return;
      }
      // v1.88.0: record the failed page audit (null = capacity, recorded nowhere).
      const failure = classifyAuditFailure(err);
      if (failure) {
        recordAuditFailure({ eventType: "audit-url-page", privileged, filename: url, reason: failure });
      }
      // Log the detail server-side only — never echo raw err.message to
      // the client (it can leak library internals / paths, e.g. a
      // Chromium profile path or an internal stack fragment). Mirrors
      // audit-url.ts's generic-500 pattern; `msg` is still used below to
      // classify the failure, just never returned verbatim.
      //
      // v1.88.0: a classified navigation failure or timeout is an EXPECTED
      // condition — a fleet page URL that turns out to be a download, a slow
      // host — and used to fill the error log with identical stack traces
      // (315 on 2026-08-19). One line, no stack. Anything else keeps the
      // full error.
      const msg = err?.message ?? String(err);
      if (failure === "navigation-failed" || failure === "timeout") {
        console.warn(`[audit-url-page] page audit failed (${failure}): ${msg}`);
      } else {
        console.error("audit-url-page: page audit failed:", err);
      }
      if (/timeout|Timeout|net::ERR_/i.test(msg)) {
        res.status(504).json({
          error: "Page navigation timed out",
          details:
            "The page took too long to load or render. Try again, or verify the URL is reachable.",
        });
        return;
      }
      res.status(502).json({
        error: "Page audit failed",
        details:
          "The page could not be rendered or audited. It may be blocking automated access or returning an unexpected error.",
      });
      return;
    }
```

(Keep the `return;` exactly as the existing code has it after the 502 — check the current file; the existing block already returns there.)

- [ ] **Step 7: bulk-from-inventory.ts**

Change the import to `import { recordAudit, recordAuditFailure, sha256Hex } from "../services/auditLog.js";` and add `import { classifyAuditFailure } from "../services/auditFailure.js";`.

In the inner `if (e instanceof SafeFetchError) {` block, directly after the `console.error(...)` call that logs the fetch error, add:

```ts
              // v1.88.0: a URL the tool could not fetch is a failed audit of
              // that inventory entry.
              recordAuditFailure({
                eventType: "bulk-from-inventory",
                privileged,
                filename: entry.filename,
                reason: "fetch-failed",
              });
```

In the per-entry analysis catch (the one whose chain starts with `if (err?.name === "AbortError")`), add as its FIRST statements:

```ts
          // v1.88.0: record the failed audit before mapping the error to the
          // per-entry message. null = capacity (503), recorded nowhere.
          const failure = classifyAuditFailure(err);
          if (failure) {
            recordAuditFailure({
              eventType: "bulk-from-inventory",
              privileged,
              filename: entry.filename,
              reason: failure,
            });
          }
```

- [ ] **Step 8: Keep the existing auditLog mock complete**

In `apps/api/src/__tests__/analyzeVeraPdf.test.ts`, add `recordAuditFailure: vi.fn(),` to the `vi.mock("../services/auditLog.js", ...)` factory (after `recordRejectedUpload: vi.fn(),`). Then run `grep -rln 'services/auditLog.js"' apps/api/src/__tests__` and add the same line to any other factory that stubs that module without it.

- [ ] **Step 9: Run the wiring tests and every route test**

Run: `pnpm --filter api exec vitest run src/__tests__/auditFailureWiring.test.ts src/__tests__/audit-url-page.test.ts src/__tests__/audit-url.test.ts src/__tests__/analyze-url.test.ts src/__tests__/bulk-from-inventory.test.ts src/__tests__/analyzeVeraPdf.test.ts src/__tests__/pageAuditGuard.test.ts`
Expected: PASS. Then `pnpm --filter api exec tsc --noEmit` — zero errors (the `eventType` field is required, so a missed `runUrlAudit` caller fails here).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/services/urlAuditPipeline.ts apps/api/src/routes apps/api/src/__tests__/auditFailureWiring.test.ts apps/api/src/__tests__/audit-url-page.test.ts apps/api/src/__tests__/analyzeVeraPdf.test.ts
git commit -m "feat(api): every audit path records its failed twin; page-audit navigation failures log one line"
```

---

### Task 5: Global error handler — one line for 4xx, stack for 5xx (spec § 4)

**Files:**
- Create: `apps/api/src/middleware/errorHandler.ts`
- Modify: `apps/api/src/index.ts` (the `app.use((err: any, _req ...` block, ~L108–125; imports)
- Test: `apps/api/src/__tests__/errorHandler.test.ts`

**Interfaces:**
- Produces: `export function statusOf(err: unknown): number`, `export function logHandledError(err: unknown, req: { method: string; path: string }): void`, `export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/__tests__/errorHandler.test.ts
/**
 * The global Express error handler, extracted from index.ts (v1.88.0) so it
 * can be tested: a client-side outcome (4xx, incl. multer's LIMIT_FILE_SIZE →
 * 413) logs ONE line; a server fault (5xx) keeps the full error with stack.
 * Responses are byte-identical to before. Neither line carries an IP, a
 * token, a user agent or a body.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { ANALYSIS } from "#config";
import { errorHandler, logHandledError, statusOf } from "../middleware/errorHandler.js";

function makeRes() {
  const res: any = {
    _status: 200,
    _json: null as any,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: any) {
      res._json = body;
      return res;
    },
  };
  return res;
}
const req: any = {
  method: "POST",
  path: "/api/analyze",
  ip: "198.51.100.7",
  headers: { authorization: "Bearer leaky-token", "user-agent": "SecretAgent/9" },
  body: { url: "https://private.example/doc.pdf" },
};

afterEach(() => vi.restoreAllMocks());

describe("statusOf", () => {
  it("maps LIMIT_FILE_SIZE to 413, a 4xx/5xx status through, and everything else to 500", () => {
    expect(statusOf({ code: "LIMIT_FILE_SIZE" })).toBe(413);
    expect(statusOf({ status: 400 })).toBe(400);
    expect(statusOf({ status: 503 })).toBe(503);
    expect(statusOf({ status: 200 })).toBe(500);
    expect(statusOf(new Error("boom"))).toBe(500);
    expect(statusOf(undefined)).toBe(500);
  });
});

describe("logHandledError", () => {
  it("a 413 logs one warn line naming status, code, method and path — and nothing about the caller", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logHandledError(Object.assign(new Error("File too large"), { code: "LIMIT_FILE_SIZE" }), req);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0].map(String).join(" ");
    expect(line).toBe("[api] 413 LIMIT_FILE_SIZE POST /api/analyze");
    expect(line).not.toContain("198.51.100.7");
    expect(line).not.toContain("leaky-token");
    expect(line).not.toContain("SecretAgent");
    expect(line).not.toContain("private.example");
    expect(error).not.toHaveBeenCalled();
  });

  it("a 5xx keeps the full error (with stack) on console.error", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    logHandledError(err, req);
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(err);
  });
});

describe("errorHandler responses are unchanged", () => {
  it("LIMIT_FILE_SIZE → 413 with the size-reduction guidance", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = makeRes();
    errorHandler({ code: "LIMIT_FILE_SIZE" }, req, res, vi.fn());
    expect(res._status).toBe(413);
    expect(res._json.error).toBe(
      `This file is too large. The maximum upload size is ${ANALYSIS.MAX_FILE_SIZE_MB} MB.`,
    );
    expect(res._json.details).toMatch(/Reduced Size PDF/);
  });

  it("an error with a status echoes its message; a bare error is a generic 500", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r1 = makeRes();
    errorHandler(Object.assign(new Error("URL not allowed"), { status: 400 }), req, r1, vi.fn());
    expect(r1._status).toBe(400);
    expect(r1._json).toEqual({ error: "URL not allowed" });

    const r2 = makeRes();
    errorHandler(new Error("disk on fire at /srv/secret"), req, r2, vi.fn());
    expect(r2._status).toBe(500);
    expect(r2._json).toEqual({ error: "Internal server error" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api exec vitest run src/__tests__/errorHandler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the handler**

```ts
// apps/api/src/middleware/errorHandler.ts
/**
 * Global Express error handler — never leak internals. Extracted from
 * index.ts in v1.88.0 so its logging can be tested.
 *
 * Logging (v1.88.0): an expected client-side outcome — a 4xx, including
 * multer's LIMIT_FILE_SIZE → 413 — logs ONE line: status, code, method, path.
 * It used to log the full error with stack, so an over-sized upload filled
 * the error log exactly like a crash. A server fault (5xx) keeps the full
 * error. Neither line carries an IP, a token, a user agent or a body
 * (req.path has no query string), the same constraint the [rate-limit] lines
 * are tested for.
 */
import type { NextFunction, Request, Response } from "express";
import { ANALYSIS } from "#config";

interface ErrorShape {
  status?: unknown;
  code?: unknown;
  name?: unknown;
  message?: unknown;
}

function shape(err: unknown): ErrorShape {
  return typeof err === "object" && err !== null ? (err as ErrorShape) : {};
}

/** The HTTP status this error will be answered with. */
export function statusOf(err: unknown): number {
  const e = shape(err);
  if (e.code === "LIMIT_FILE_SIZE") return 413;
  const s = Number(e.status);
  return Number.isInteger(s) && s >= 400 && s <= 599 ? s : 500;
}

export function logHandledError(err: unknown, req: { method: string; path: string }): void {
  const status = statusOf(err);
  if (status < 500) {
    const e = shape(err);
    const label =
      typeof e.code === "string" ? e.code : typeof e.name === "string" ? e.name : "error";
    console.warn(`[api] ${status} ${label} ${req.method} ${req.path}`);
  } else {
    console.error(err);
  }
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  logHandledError(err, req);

  // Multer file size error
  if (err?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({
      error: `This file is too large. The maximum upload size is ${ANALYSIS.MAX_FILE_SIZE_MB} MB.`,
      details:
        "Large PDFs are often inflated by uncompressed images. To reduce file size: (1) In Adobe Acrobat, use File → Save As Other → Reduced Size PDF; (2) Use File → Save As Other → Optimized PDF to downsample images; (3) Split the document into smaller sections (File → Organize Pages → Split) and analyze each part separately.",
    });
    return;
  }

  const status = err?.status || 500;
  res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message,
  });
}
```

Before writing, diff the 413 `details` string against the one currently in `index.ts` — it must be character-identical (copy it from there if this plan's copy has drifted).

- [ ] **Step 4: Use it in index.ts**

Replace the whole `app.use((err: any, _req: express.Request, ...) => { ... });` block with:

```ts
// Global error handler — never leak internals (middleware/errorHandler.ts).
app.use(errorHandler);
```

Add `import { errorHandler } from "./middleware/errorHandler.js";` next to the other middleware imports. If `ANALYSIS` is now unreferenced in `index.ts`, remove it from the `#config` import (`grep -n "ANALYSIS" apps/api/src/index.ts`).

- [ ] **Step 5: Run the test and typecheck**

Run: `pnpm --filter api exec vitest run src/__tests__/errorHandler.test.ts && pnpm --filter api exec tsc --noEmit`
Expected: PASS, zero type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/errorHandler.ts apps/api/src/index.ts apps/api/src/__tests__/errorHandler.test.ts
git commit -m "refactor(api): extract the global error handler; 4xx responses log one line, 5xx keep the stack"
```

---

### Task 6: `dataDir.ts`, `sqliteTime.ts`, the shared time zone — and the export directory at `<repo-root>/logs/` (spec § 2.1, § 2.2)

> **Ruling 2026-08-22 (user request, recorded in the SDD ledger):** the activity files live in **`logs/` at the repository root**, not in `<dataDir>/activity/`. Task 1 shipped `ACTIVITY_EXPORT.DIR_NAME: "activity"`; this task changes it to `"logs"` and adds the path helper. `logs/` is already in `.gitignore`; `rebuild.sh` never `git clean`s.

**Files:**
- Create: `apps/api/src/services/dataDir.ts`
- Create: `apps/api/src/services/sqliteTime.ts`
- Modify: `apps/api/src/services/status.ts` (imports ~L24–30; `chicagoTime` ~L277–293; `sqliteUtcToIso` ~L294–302; `defaultDataDir` ~L1077–1089)
- Modify: `audit.config.ts` (`ACTIVITY_EXPORT.DIR_NAME` value + its doc comment)
- Modify: `apps/api/src/__tests__/failureEventTypes.test.ts` (the `DIR_NAME` expectation)
- Test: `apps/api/src/__tests__/dataDir.test.ts`; append to `apps/api/src/__tests__/status.test.ts`

**Interfaces:**
- Produces: `defaultDataDir(): string` (from `./dataDir.js`, still re-exported by `./status.js`), `repoRoot(): string` (the checkout root, derived from the module's own location), `activityLogDir(): string` (`process.env.ACTIVITY_LOG_DIR` if set, else `path.join(repoRoot(), ACTIVITY_EXPORT.DIR_NAME)`), `sqliteUtcToIso(value: unknown): string | null` (from `./sqliteTime.js`, still re-exported by `./status.js`), `chicagoTime()` reading `DEPLOY.LOCAL_TIME_ZONE`, `ACTIVITY_EXPORT.DIR_NAME === "logs"`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/__tests__/dataDir.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { ACTIVITY_EXPORT } from "#config";
import { activityLogDir, defaultDataDir, repoRoot } from "../services/dataDir.js";
import { defaultDataDir as reExported } from "../services/status.js";

const originalDb = process.env.DB_PATH;
const originalLogDir = process.env.ACTIVITY_LOG_DIR;
afterEach(() => {
  if (originalDb === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = originalDb;
  if (originalLogDir === undefined) delete process.env.ACTIVITY_LOG_DIR;
  else process.env.ACTIVITY_LOG_DIR = originalLogDir;
});

describe("defaultDataDir", () => {
  it("is the database file's directory when DB_PATH is set", () => {
    process.env.DB_PATH = "/srv/audit/data/audit.db";
    expect(defaultDataDir()).toBe("/srv/audit/data");
  });
  it("falls back to ./data, exactly as db/sqlite.ts derives the database path", () => {
    delete process.env.DB_PATH;
    expect(defaultDataDir()).toBe("./data");
  });
  it("is the same function status.ts re-exports (the disk probe and the export agree)", () => {
    expect(reExported).toBe(defaultDataDir);
  });
});

describe("repoRoot / activityLogDir", () => {
  it("repoRoot is the checkout root, found from the module's own location, not the cwd", () => {
    expect(isAbsolute(repoRoot())).toBe(true);
    expect(existsSync(join(repoRoot(), "pnpm-workspace.yaml"))).toBe(true);
    expect(existsSync(join(repoRoot(), "audit.config.ts"))).toBe(true);
  });
  it("the activity log directory defaults to <repo-root>/logs", () => {
    delete process.env.ACTIVITY_LOG_DIR;
    expect(ACTIVITY_EXPORT.DIR_NAME).toBe("logs");
    expect(activityLogDir()).toBe(join(repoRoot(), "logs"));
  });
  it("ACTIVITY_LOG_DIR overrides it (tests, containers)", () => {
    process.env.ACTIVITY_LOG_DIR = "/var/tmp/audit-logs";
    expect(activityLogDir()).toBe("/var/tmp/audit-logs");
  });
});
```

Append to `apps/api/src/__tests__/status.test.ts`:

```ts
describe("local time comes from DEPLOY.LOCAL_TIME_ZONE (v1.88.0)", () => {
  it("chicagoTime renders in the configured zone", async () => {
    const { DEPLOY } = await import("#config");
    expect(DEPLOY.LOCAL_TIME_ZONE).toBe("America/Chicago");
    expect(chicagoTime(Date.UTC(2026, 0, 15, 18, 0, 0))).toBe("Jan 15, 2026, 12:00:00 PM CST");
    expect(chicagoTime(Date.UTC(2026, 6, 15, 17, 0, 0))).toBe("Jul 15, 2026, 12:00:00 PM CDT");
  });
  it("status.ts no longer hard-codes the zone", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../services/status.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/timeZone:\s*"America\/Chicago"/);
  });
});
```

Add `chicagoTime` to the existing `import { ... } from "../services/status.js"` list at the top of `status.test.ts`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter api exec vitest run src/__tests__/dataDir.test.ts src/__tests__/status.test.ts`
Expected: FAIL — `../services/dataDir.js` not found; the source-text assertion fails.

- [ ] **Step 3: Create the two modules**

```ts
// apps/api/src/services/dataDir.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACTIVITY_EXPORT } from "#config";

/**
 * The directory whose free space matters to this service: where the SQLite
 * database lives and where a PDF's short-lived qpdf temp copy is written.
 *
 * Derived the same way db/sqlite.ts derives the database path (DB_PATH, else
 * ./data/audit.db) so the two cannot point at different volumes — measuring a
 * disk the service does not actually use would be worse than not measuring
 * one, because it would report reassuring numbers about the wrong thing.
 */
export function defaultDataDir(): string {
  return path.dirname(process.env.DB_PATH || "./data/audit.db");
}

/**
 * The root of the checkout, found from this module's own location (four
 * levels up from apps/api/src/services) — the same derivation
 * defaultBackupStatusFile() uses. Never the process cwd: PM2 starts the API
 * with cwd apps/api, the dev server and the tests start it elsewhere.
 */
export function repoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../..");
}

/**
 * Where the daily activity export writes its files (v1.88.0): `logs/` at the
 * repository root — one `ls` from the application root, which is the
 * requirement — unless ACTIVITY_LOG_DIR names another absolute path (tests,
 * containerised deploys). `logs/` is git-ignored and the deploy script never
 * `git clean`s, so the files survive deploys. Nothing serves this directory.
 */
export function activityLogDir(): string {
  return process.env.ACTIVITY_LOG_DIR || path.join(repoRoot(), ACTIVITY_EXPORT.DIR_NAME);
}
```

```ts
// apps/api/src/services/sqliteTime.ts
/** SQLite CURRENT_TIMESTAMP stores "YYYY-MM-DD HH:MM:SS" in UTC with no zone
 *  marker. Naively handing that to `new Date()` is parsed as LOCAL time by
 *  some engines, silently shifting every timestamp by the server's offset.
 *  Returns an ISO-8601 string with an explicit Z, or null for anything that
 *  is not a non-empty string. */
export function sqliteUtcToIso(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return normalized.endsWith("Z") ? normalized : `${normalized}Z`;
}
```

- [ ] **Step 3b: Point the config at the repo-root `logs/` directory**

In `audit.config.ts`, inside `ACTIVITY_EXPORT`, replace the `DIR_NAME` entry and its doc comment with:

```ts
  /**
   * Directory, AT THE REPOSITORY ROOT, where the daily files are written —
   * `<checkout>/logs/activity-YYYY-MM-DD.csv`, so they are one `ls` from the
   * application root (services/dataDir.ts: activityLogDir(); the
   * ACTIVITY_LOG_DIR env var overrides the whole path for tests and
   * containerised deploys). Already git-ignored; rebuild.sh never `git clean`s,
   * so deploys leave it alone. Nothing serves it.
   *
   * SAFE TO CHANGE: Yes. Existing files are not moved; delete the old
   * directory by hand after changing this.
   */
  DIR_NAME: "logs",
```

In `apps/api/src/__tests__/failureEventTypes.test.ts` change `expect(ACTIVITY_EXPORT.DIR_NAME).toBe("activity");` to `expect(ACTIVITY_EXPORT.DIR_NAME).toBe("logs");`.

- [ ] **Step 4: Rewire status.ts**

In `apps/api/src/services/status.ts`:
1. Change `import { REMEDIATION, STATUS } from "#config";` to `import { DEPLOY, REMEDIATION, STATUS } from "#config";`.
2. Add below it: `import { defaultDataDir } from "./dataDir.js";` and `import { sqliteUtcToIso } from "./sqliteTime.js";` followed by `export { defaultDataDir, sqliteUtcToIso };`.
3. Delete the `export function sqliteUtcToIso(...) { ... }` definition and its doc comment (the internal call in `lastAuditAt` now uses the import).
4. Delete the `export function defaultDataDir(): string { ... }` definition and its doc comment (keep `defaultBackupStatusFile`, which still needs `path`).
5. In `chicagoTime`, replace `timeZone: "America/Chicago",` with `timeZone: DEPLOY.LOCAL_TIME_ZONE,`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter api exec vitest run src/__tests__/dataDir.test.ts src/__tests__/status.test.ts src/__tests__/statusPrivacy.test.ts src/__tests__/backupStatus.test.ts src/__tests__/failureEventTypes.test.ts && pnpm --filter api exec tsc --noEmit`
Expected: PASS, zero type errors (`routes/status.ts` still imports both names from `../services/status.js`).

- [ ] **Step 6: Commit**

```bash
git add audit.config.ts apps/api/src/services/dataDir.ts apps/api/src/services/sqliteTime.ts apps/api/src/services/status.ts apps/api/src/__tests__/dataDir.test.ts apps/api/src/__tests__/status.test.ts apps/api/src/__tests__/failureEventTypes.test.ts
git commit -m "refactor(api): dataDir (repo-root logs/ for the activity export), sqliteTime, local time zone from DEPLOY.LOCAL_TIME_ZONE"
```

---

### Task 7: Day arithmetic — `activityDays.ts` (spec § 2.2, § 2.4)

**Files:**
- Create: `apps/api/src/services/activityDays.ts`
- Test: `apps/api/src/__tests__/activityDays.test.ts`

**Interfaces:**
- Consumes: `ACTIVITY_EXPORT.FILE_PREFIX` (Task 1).
- Produces: `localDate(ms, timeZone): string` ("YYYY-MM-DD"), `localStamp(ms, timeZone): string` ("YYYY-MM-DD HH:mm:ss CDT"), `addDays(day, n): string`, `dayBefore(day): string`, `daysAfter(fromExclusive, toInclusive): string[]`, `exportWindow(nowMs, { retentionDays, graceMinutes, timeZone }): { cutoffDay, lastCompleteDay }`, `activityFileName(day): string`, `parseActivityFileName(name): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/__tests__/activityDays.test.ts
/**
 * Calendar arithmetic for the daily activity export. A row belongs to the
 * file for the LOCAL (America/Chicago) date of its UTC timestamp; DST is
 * handled by Intl, not by offset math. Day strings are "YYYY-MM-DD", so
 * string comparison is chronological.
 */
import { describe, it, expect } from "vitest";
import {
  activityFileName,
  addDays,
  datedFileName,
  dayBefore,
  daysAfter,
  exportWindow,
  localDate,
  localStamp,
  parseActivityFileName,
  parseDatedFileName,
} from "../services/activityDays.js";

const TZ = "America/Chicago";

describe("localDate / localStamp", () => {
  it("cuts days at LOCAL midnight, in summer (UTC-5) and winter (UTC-6)", () => {
    expect(localDate(Date.UTC(2026, 7, 20, 4, 59, 59), TZ)).toBe("2026-08-19"); // 23:59:59 CDT
    expect(localDate(Date.UTC(2026, 7, 20, 5, 0, 0), TZ)).toBe("2026-08-20"); // 00:00:00 CDT
    expect(localDate(Date.UTC(2026, 0, 16, 5, 59, 59), TZ)).toBe("2026-01-15"); // 23:59:59 CST
    expect(localDate(Date.UTC(2026, 0, 16, 6, 0, 0), TZ)).toBe("2026-01-16"); // 00:00:00 CST
  });

  it("renders a sortable 24-hour local stamp with the zone abbreviation", () => {
    expect(localStamp(Date.UTC(2026, 7, 19, 14, 3, 22), TZ)).toBe("2026-08-19 09:03:22 CDT");
    expect(localStamp(Date.UTC(2026, 0, 15, 18, 0, 0), TZ)).toBe("2026-01-15 12:00:00 CST");
    expect(localStamp(Date.UTC(2026, 7, 20, 5, 0, 0), TZ)).toBe("2026-08-20 00:00:00 CDT");
  });

  it("follows the 2026 DST transitions", () => {
    // Spring forward: 2026-03-08 02:00 CST → 03:00 CDT
    expect(localStamp(Date.UTC(2026, 2, 8, 7, 59, 59), TZ)).toBe("2026-03-08 01:59:59 CST");
    expect(localStamp(Date.UTC(2026, 2, 8, 8, 0, 0), TZ)).toBe("2026-03-08 03:00:00 CDT");
    // Fall back: 2026-11-01 — 01:30 happens twice
    expect(localStamp(Date.UTC(2026, 10, 1, 6, 30, 0), TZ)).toBe("2026-11-01 01:30:00 CDT");
    expect(localStamp(Date.UTC(2026, 10, 1, 7, 30, 0), TZ)).toBe("2026-11-01 01:30:00 CST");
    expect(localDate(Date.UTC(2026, 10, 1, 7, 30, 0), TZ)).toBe("2026-11-01");
  });

  it("an unknown zone throws instead of silently falling back to UTC", () => {
    expect(() => localDate(0, "Not/AZone")).toThrow();
  });
});

describe("day arithmetic", () => {
  it("crosses month, year and leap-day boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });
  it("daysAfter is exclusive at the start, inclusive at the end, ascending", () => {
    expect(daysAfter("2026-08-01", "2026-08-03")).toEqual(["2026-08-02", "2026-08-03"]);
    expect(daysAfter("2026-08-03", "2026-08-03")).toEqual([]);
    expect(daysAfter("2026-08-05", "2026-08-03")).toEqual([]);
  });
  it("rejects a string that is not a calendar day", () => {
    expect(() => addDays("2026-8-1", 1)).toThrow();
  });
});

describe("exportWindow", () => {
  const opts = { retentionDays: 365, graceMinutes: 5, timeZone: TZ };
  it("the previous local day becomes complete only after the grace period", () => {
    // 2026-08-22 00:03 CDT — inside the grace window: Aug 21 is not complete yet.
    expect(exportWindow(Date.UTC(2026, 7, 22, 5, 3, 0), opts).lastCompleteDay).toBe("2026-08-20");
    // 2026-08-22 00:06 CDT — Aug 21 is complete.
    expect(exportWindow(Date.UTC(2026, 7, 22, 5, 6, 0), opts).lastCompleteDay).toBe("2026-08-21");
  });
  it("the cutoff day is the local day containing (now − retention)", () => {
    expect(exportWindow(Date.UTC(2026, 7, 22, 5, 6, 0), opts).cutoffDay).toBe("2025-08-22");
    expect(exportWindow(Date.UTC(2026, 7, 22, 5, 6, 0), { ...opts, retentionDays: 3 }).cutoffDay).toBe(
      "2026-08-19",
    );
  });
});

describe("file names", () => {
  it("encodes and parses the activity-YYYY-MM-DD.csv shape, and nothing else", () => {
    expect(activityFileName("2026-08-19")).toBe("activity-2026-08-19.csv");
    expect(parseActivityFileName("activity-2026-08-19.csv")).toBe("2026-08-19");
    expect(parseActivityFileName("activity-2026-08-19.csv.tmp")).toBeNull();
    expect(parseActivityFileName("activity-2026-02-30.csv")).toBeNull();
    expect(parseActivityFileName("notes.txt")).toBeNull();
    expect(parseActivityFileName("activity-2026-08-19.CSV")).toBeNull();
    expect(parseActivityFileName("old-activity-2026-08-19.csv")).toBeNull();
  });
  it("the generic codec serves any prefix/extension pair (the error log uses errors-*.log)", () => {
    expect(datedFileName("errors-", "2026-08-19", ".log")).toBe("errors-2026-08-19.log");
    expect(parseDatedFileName("errors-2026-08-19.log", "errors-", ".log")).toBe("2026-08-19");
    expect(parseDatedFileName("errors-2026-08-19.log", "activity-", ".csv")).toBeNull();
    expect(parseDatedFileName("errors-2026-08-19.log.1", "errors-", ".log")).toBeNull();
    expect(parseDatedFileName("errors-2026-13-01.log", "errors-", ".log")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api exec vitest run src/__tests__/activityDays.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/services/activityDays.ts
/**
 * Calendar arithmetic for the daily activity export (v1.88.0).
 *
 * A row belongs to the file for the LOCAL calendar date of its UTC timestamp
 * (DEPLOY.LOCAL_TIME_ZONE, America/Chicago in production — the way the
 * service already renders time to humans). The local date comes from
 * Intl.DateTimeFormat parts, so DST needs no library and no offset math.
 * Day strings are "YYYY-MM-DD": string comparison is chronological, and the
 * arithmetic below is pure calendar math on Date.UTC, no zone involved.
 *
 * An unknown zone makes Intl throw. That is deliberate: the export must fail
 * loudly (into the sweep's error list) rather than silently cut UTC days that
 * disagree with every file written before.
 */
import { ACTIVITY_EXPORT } from "#config";

const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function parts(ms: number, timeZone: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) out[p.type] = p.value;
  return out;
}

/** "YYYY-MM-DD" — the calendar date of `ms` in `timeZone`. */
export function localDate(ms: number, timeZone: string): string {
  const p = parts(ms, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "YYYY-MM-DD HH:mm:ss ZZZ" — sortable, 24-hour, zone-abbreviated. */
export function localStamp(ms: number, timeZone: string): string {
  const p = parts(ms, timeZone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}`;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `day` ± n calendar days. Throws on anything that is not "YYYY-MM-DD". */
export function addDays(day: string, n: number): string {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`not a YYYY-MM-DD day: ${day}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + n * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

export function dayBefore(day: string): string {
  return addDays(day, -1);
}

/** Every day d with fromExclusive < d <= toInclusive, ascending; [] when empty. */
export function daysAfter(fromExclusive: string, toInclusive: string): string[] {
  const out: string[] = [];
  for (let d = addDays(fromExclusive, 1); d <= toInclusive; d = addDays(d, 1)) out.push(d);
  return out;
}

/** A real calendar day (rejects 2026-02-30, which addDays would normalise). */
function isCalendarDay(s: string): boolean {
  return DAY_RE.test(s) && addDays(s, 0) === s;
}

export interface ExportWindow {
  /** The local day containing the instant (now − retention). Files for this
   *  day and earlier are pruned; it is never written — so a file exists only
   *  for days fully inside the window. */
  cutoffDay: string;
  /** The newest local day that is complete: the day before the local date of
   *  (now − grace). */
  lastCompleteDay: string;
}

export function exportWindow(
  nowMs: number,
  opts: { retentionDays: number; graceMinutes: number; timeZone: string },
): ExportWindow {
  return {
    cutoffDay: localDate(nowMs - opts.retentionDays * DAY_MS, opts.timeZone),
    lastCompleteDay: dayBefore(localDate(nowMs - opts.graceMinutes * 60_000, opts.timeZone)),
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `<prefix>YYYY-MM-DD<ext>` — the one shape every dated file in logs/ has. */
export function datedFileName(prefix: string, day: string, ext: string): string {
  return `${prefix}${day}${ext}`;
}

const parsers = new Map<string, RegExp>();

/** The day a dated file name encodes, or null for any other name — pruning
 *  deletes only what this recognises (a real calendar day, exact prefix and
 *  extension, nothing appended such as `.tmp`). */
export function parseDatedFileName(name: string, prefix: string, ext: string): string | null {
  const key = `${prefix}\u0000${ext}`;
  let re = parsers.get(key);
  if (!re) {
    re = new RegExp(`^${escapeRegExp(prefix)}(\\d{4}-\\d{2}-\\d{2})${escapeRegExp(ext)}$`);
    parsers.set(key, re);
  }
  const m = re.exec(name);
  if (!m) return null;
  return isCalendarDay(m[1]) ? m[1] : null;
}

export function activityFileName(day: string): string {
  return datedFileName(ACTIVITY_EXPORT.FILE_PREFIX, day, ".csv");
}

export function parseActivityFileName(name: string): string | null {
  return parseDatedFileName(name, ACTIVITY_EXPORT.FILE_PREFIX, ".csv");
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter api exec vitest run src/__tests__/activityDays.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/activityDays.ts apps/api/src/__tests__/activityDays.test.ts
git commit -m "feat(api): activityDays — local-day arithmetic, export window, file-name codec"
```

---

### Task 8: CSV formatting — `activityCsv.ts` (spec § 2.3, § 3)

**Files:**
- Create: `apps/api/src/services/activityCsv.ts`
- Test: `apps/api/src/__tests__/activityCsv.test.ts`

**Interfaces:**
- Consumes: `localStamp` (Task 7), `sqliteUtcToIso` (Task 6).
- Produces: `ACTIVITY_CSV_COLUMNS` (readonly tuple, the allow-list), `interface ActivityRow { id; created_at; event_type; filename; score; grade; content_hash; privileged; reason }`, `tierLabel(privileged)`, `csvField(value)`, `CSV_BOM`, `activityCsvLine(row, timeZone)`, `formatActivityCsv(rows, timeZone): string`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/__tests__/activityCsv.test.ts
/**
 * The daily activity CSV: a fixed column allow-list (adding a column is a
 * policy change), RFC 4180 quoting, a formula-injection guard (managers open
 * these in Excel), a UTF-8 BOM, LF line endings (CRLF shows as ^M in less),
 * and the policy page's tier vocabulary.
 */
import { describe, it, expect } from "vitest";
import {
  ACTIVITY_CSV_COLUMNS,
  CSV_BOM,
  activityCsvLine,
  csvField,
  formatActivityCsv,
  tierLabel,
  type ActivityRow,
} from "../services/activityCsv.js";

const TZ = "America/Chicago";

/** A minimal RFC 4180 reader, so round-trips are checked by a parser and not
 *  by eye. Handles quoted fields, doubled quotes, and embedded newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  id: 48213,
  created_at: "2026-08-19 14:03:22",
  event_type: "analyze",
  filename: "Annual Report, FY24.pdf",
  score: 72,
  grade: "C",
  content_hash: "9f2c",
  privileged: 0,
  reason: null,
  ...over,
});

describe("the column allow-list", () => {
  it("is exactly these ten columns, in this order — changing it is a policy change", () => {
    expect([...ACTIVITY_CSV_COLUMNS]).toEqual([
      "id",
      "timestamp_utc",
      "timestamp_chicago",
      "event",
      "filename",
      "score",
      "grade",
      "content_hash",
      "tier",
      "reason",
    ]);
  });
});

describe("csvField", () => {
  it("quotes commas, quotes and line breaks; doubles inner quotes", () => {
    expect(csvField("plain.pdf")).toBe("plain.pdf");
    expect(csvField("a, b.pdf")).toBe('"a, b.pdf"');
    expect(csvField('say "hi".pdf')).toBe('"say ""hi"".pdf"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("cr\rhere")).toBe('"cr\rhere"');
  });
  it("neutralises formula injection for every trigger character", () => {
    expect(csvField("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("-x")).toBe("'-x");
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField("\tx")).toBe("'\tx");
  });
  it("numbers pass through untouched; NULL and undefined are empty", () => {
    expect(csvField(72)).toBe("72");
    expect(csvField(0)).toBe("0");
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });
});

describe("tierLabel", () => {
  it("uses the policy page's vocabulary, never 'anonymous'", () => {
    expect(tierLabel(1)).toBe("trusted-tool");
    expect(tierLabel(0)).toBe("public");
    expect(tierLabel(null)).toBe("unknown");
    expect(tierLabel(undefined)).toBe("unknown");
  });
});

describe("activityCsvLine", () => {
  it("renders both timestamps from the SQLite UTC text, and the tier and reason columns", () => {
    expect(activityCsvLine(row(), TZ)).toBe(
      '48213,2026-08-19T14:03:22Z,2026-08-19 09:03:22 CDT,analyze,"Annual Report, FY24.pdf",72,C,9f2c,public,',
    );
    expect(
      activityCsvLine(
        row({
          id: 48214,
          created_at: "2026-08-19 14:04:01",
          event_type: "audit-url-page-failed",
          filename: "https://example.gov/files/brief.pdf",
          score: null,
          grade: null,
          content_hash: null,
          privileged: 1,
          reason: "navigation-failed",
        }),
        TZ,
      ),
    ).toBe(
      "48214,2026-08-19T14:04:01Z,2026-08-19 09:04:01 CDT,audit-url-page-failed,https://example.gov/files/brief.pdf,,,,trusted-tool,navigation-failed",
    );
  });
});

describe("formatActivityCsv", () => {
  it("starts with the BOM, then the header, LF endings only, trailing newline", () => {
    const text = formatActivityCsv([row()], TZ);
    expect(text.startsWith(CSV_BOM)).toBe(true);
    expect(text).not.toContain("\r");
    expect(text.endsWith("\n")).toBe(true);
    const lines = text.slice(CSV_BOM.length).split("\n");
    expect(lines[0]).toBe(ACTIVITY_CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(3); // header, row, trailing ""
  });
  it("an empty day is a header-only file", () => {
    expect(formatActivityCsv([], TZ)).toBe(`${CSV_BOM}${ACTIVITY_CSV_COLUMNS.join(",")}\n`);
  });
  it("a hostile filename round-trips through a CSV parser with exactly ten fields", () => {
    const hostile = '=cmd|"calc"!A1, "quoted"\nsecond line';
    const text = formatActivityCsv([row({ filename: hostile })], TZ).slice(CSV_BOM.length);
    const parsed = parseCsv(text);
    expect(parsed[0]).toEqual([...ACTIVITY_CSV_COLUMNS]);
    expect(parsed[1]).toHaveLength(10);
    expect(parsed[1][4]).toBe(`'${hostile}`); // the guard's leading quote survives, the rest is intact
    expect(parsed).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api exec vitest run src/__tests__/activityCsv.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/services/activityCsv.ts
/**
 * Formats audit_log rows as the daily activity CSV (v1.88.0).
 *
 * ACTIVITY_CSV_COLUMNS is the column ALLOW-LIST: what a file can hold is
 * exactly what the data-retention page says it holds. Adding a column is a
 * policy change and must touch that page in the same release
 * (activityCsv.test.ts pins the list).
 *
 * Safety: RFC 4180 quoting; a leading apostrophe on any text field that
 * starts with = + - @ TAB or CR (OWASP CSV-injection mitigation — a user can
 * name a file "=HYPERLINK(...)" and a manager will open this in Excel); a
 * UTF-8 BOM so Excel on Windows reads non-ASCII file names; LF line endings
 * (Excel and Numbers read them; CRLF would show as ^M in `less`).
 */
import { localStamp } from "./activityDays.js";
import { sqliteUtcToIso } from "./sqliteTime.js";

export const ACTIVITY_CSV_COLUMNS = [
  "id",
  "timestamp_utc",
  "timestamp_chicago",
  "event",
  "filename",
  "score",
  "grade",
  "content_hash",
  "tier",
  "reason",
] as const;

/** One audit_log row, as SELECTed by activityExport.ts. */
export interface ActivityRow {
  id: number;
  /** SQLite CURRENT_TIMESTAMP text: "YYYY-MM-DD HH:MM:SS", UTC. */
  created_at: string;
  event_type: string;
  filename: string | null;
  score: number | null;
  grade: string | null;
  content_hash: string | null;
  /** 1 = trusted-tool tier, 0 = public, NULL = row predates migration 12. */
  privileged: number | null;
  reason: string | null;
}

export type TierLabel = "trusted-tool" | "public" | "unknown";

/** The policy page's own vocabulary for the request tier. */
export function tierLabel(privileged: number | null | undefined): TierLabel {
  if (privileged === 1) return "trusted-tool";
  if (privileged === 0) return "public";
  return "unknown";
}

export const CSV_BOM = "\uFEFF";

export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function activityCsvLine(row: ActivityRow, timeZone: string): string {
  const iso = sqliteUtcToIso(row.created_at);
  const ms = iso === null ? Number.NaN : Date.parse(iso);
  const utc = Number.isNaN(ms) ? "" : new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const local = Number.isNaN(ms) ? "" : localStamp(ms, timeZone);
  return [
    row.id,
    utc,
    local,
    row.event_type,
    row.filename ?? "",
    row.score,
    row.grade,
    row.content_hash,
    tierLabel(row.privileged),
    row.reason,
  ]
    .map(csvField)
    .join(",");
}

/** BOM + header + one line per row, LF-terminated. An empty day is a
 *  header-only file: an explicit "nothing happened". */
export function formatActivityCsv(rows: ActivityRow[], timeZone: string): string {
  const lines = [ACTIVITY_CSV_COLUMNS.join(","), ...rows.map((r) => activityCsvLine(r, timeZone))];
  return `${CSV_BOM}${lines.join("\n")}\n`;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter api exec vitest run src/__tests__/activityCsv.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/activityCsv.ts apps/api/src/__tests__/activityCsv.test.ts
git commit -m "feat(api): activityCsv — column allow-list, RFC 4180 quoting, injection guard, BOM"
```

---

### Task 9: The export runner — `activityExport.ts` (spec § 2.4, § 2.5)

**Files:**
- Create: `apps/api/src/services/activityExport.ts`
- Test: `apps/api/src/__tests__/activityExport.test.ts`

**Interfaces:**
- Consumes: `formatActivityCsv`, `ActivityRow` (Task 8); `activityFileName`, `addDays`, `daysAfter`, `exportWindow`, `localDate`, `parseActivityFileName` (Task 7); `sqliteUtcToIso` (Task 6).
- Produces: `interface ActivityExportDb { prepare(sql: string): { all(...params: unknown[]): unknown[] } }`, `interface ActivityExportOptions { db; dir; nowMs; retentionDays; graceMinutes; timeZone }`, `interface ActivityExportResult { written: number; pruned: number; days: string[] }`, `rowsForDay(db, day, timeZone): ActivityRow[]`, `runActivityExport(opts): ActivityExportResult`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/__tests__/activityExport.test.ts
/**
 * The export runner against a real migrated ":memory:" database and a temp
 * directory. The file's existence is the only state: every run writes each
 * complete local day inside the window that has no file, never rewrites one,
 * and prunes only names it would have written whose date is at or before
 * the cutoff day.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../db/migrations.js";
import { CSV_BOM, ACTIVITY_CSV_COLUMNS } from "../services/activityCsv.js";
import { runActivityExport, rowsForDay } from "../services/activityExport.js";

type DB = InstanceType<typeof Database>;
const TZ = "America/Chicago";
// 2026-08-22 07:00 CDT. Retention 3 days → cutoffDay 2026-08-19; last complete day 2026-08-21.
const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);
const OPTS = { nowMs: NOW, retentionDays: 3, graceMinutes: 5, timeZone: TZ };

let db: DB;
let dir: string;

function seed(createdAtUtc: string, filename: string, eventType = "analyze"): void {
  db.prepare(
    `INSERT INTO audit_log (event_type, filename, score, grade, content_hash, privileged, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(eventType, filename, 80, "B", "hash", 0, null, createdAtUtc);
}

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
  dir = join(mkdtempSync(join(tmpdir(), "activity-export-")), "activity");
});
afterEach(() => rmSync(join(dir, ".."), { recursive: true, force: true }));

const fileText = (day: string) => readFileSync(join(dir, `activity-${day}.csv`), "utf8");
const dataLines = (day: string) => fileText(day).slice(CSV_BOM.length).trimEnd().split("\n").slice(1);

describe("rowsForDay", () => {
  it("buckets rows by their LOCAL date, across the UTC midnight", () => {
    seed("2026-08-20 14:00:00", "noon-aug20.pdf"); // 09:00 CDT Aug 20
    seed("2026-08-21 04:30:00", "late-aug20.pdf"); // 23:30 CDT Aug 20
    seed("2026-08-21 12:00:00", "aug21.pdf"); // 07:00 CDT Aug 21
    expect(rowsForDay(db, "2026-08-20", TZ).map((r) => r.filename)).toEqual(["noon-aug20.pdf", "late-aug20.pdf"]);
    expect(rowsForDay(db, "2026-08-21", TZ).map((r) => r.filename)).toEqual(["aug21.pdf"]);
  });
});

describe("runActivityExport", () => {
  it("writes every complete day inside the window and nothing outside it", () => {
    seed("2026-08-19 12:00:00", "cutoff-day.pdf"); // the boundary day: never written
    seed("2026-08-20 14:00:00", "aug20.pdf");
    seed("2026-08-21 04:30:00", "aug20-late.pdf");
    seed("2026-08-22 06:00:00", "today.pdf"); // 01:00 CDT Aug 22: today, not complete

    const result = runActivityExport({ db, dir, ...OPTS });

    expect(result).toEqual({ written: 2, pruned: 0, days: ["2026-08-20", "2026-08-21"] });
    expect(readdirSync(dir).sort()).toEqual(["activity-2026-08-20.csv", "activity-2026-08-21.csv"]);
    expect(dataLines("2026-08-20")).toHaveLength(2);
    expect(dataLines("2026-08-20")[1]).toContain("aug20-late.pdf");
    // Aug 21 had no rows: header-only, an explicit "nothing happened".
    expect(fileText("2026-08-21")).toBe(`${CSV_BOM}${ACTIVITY_CSV_COLUMNS.join(",")}\n`);
  });

  it("is idempotent and never rewrites a complete day's file", () => {
    seed("2026-08-20 14:00:00", "aug20.pdf");
    runActivityExport({ db, dir, ...OPTS });
    writeFileSync(join(dir, "activity-2026-08-20.csv"), "hand-edited");
    seed("2026-08-20 15:00:00", "late-arrival.pdf"); // cannot happen in production; proves the rule

    const again = runActivityExport({ db, dir, ...OPTS });

    expect(again.written).toBe(0);
    expect(fileText("2026-08-20")).toBe("hand-edited");
  });

  it("prunes only activity files dated at or before the cutoff day, and touches nothing else", () => {
    runActivityExport({ db, dir, ...OPTS }); // creates the directory
    writeFileSync(join(dir, "activity-2026-08-18.csv"), "old");
    writeFileSync(join(dir, "activity-2026-08-19.csv"), "cutoff");
    writeFileSync(join(dir, "activity-2026-08-18.csv.tmp"), "stale tmp");
    writeFileSync(join(dir, "notes.txt"), "a human's file");
    writeFileSync(join(dir, "activity-2026-02-30.csv"), "not a real day");

    const result = runActivityExport({ db, dir, ...OPTS });

    expect(result.pruned).toBe(2);
    expect(readdirSync(dir).sort()).toEqual([
      "activity-2026-02-30.csv",
      "activity-2026-08-18.csv.tmp",
      "activity-2026-08-20.csv",
      "activity-2026-08-21.csv",
      "notes.txt",
    ]);
  });

  it("writes atomically with private permissions and leaves no .tmp behind", () => {
    seed("2026-08-20 14:00:00", "aug20.pdf");
    runActivityExport({ db, dir, ...OPTS });
    expect(readdirSync(dir).some((n) => n.endsWith(".tmp"))).toBe(false);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, "activity-2026-08-20.csv")).mode & 0o777).toBe(0o600);
  });

  it("overwrites a stale .tmp from a crashed run for a day that still has no file", () => {
    seed("2026-08-20 14:00:00", "aug20.pdf");
    runActivityExport({ db, dir, ...OPTS, nowMs: Date.UTC(2026, 7, 20, 12, 0, 0) }); // writes Aug 18–19 (both later pruned); Aug 20 not yet complete
    writeFileSync(join(dir, "activity-2026-08-20.csv.tmp"), "half-written");
    const result = runActivityExport({ db, dir, ...OPTS });
    expect(result.days).toContain("2026-08-20");
    expect(existsSync(join(dir, "activity-2026-08-20.csv.tmp"))).toBe(false);
    expect(dataLines("2026-08-20")).toHaveLength(1);
  });

  it("fails loudly when the directory cannot be created (a file is in the way)", () => {
    writeFileSync(dir, "not a directory");
    expect(() => runActivityExport({ db, dir, ...OPTS })).toThrow();
  });

  it("fails loudly on an unknown time zone rather than cutting UTC days", () => {
    expect(() => runActivityExport({ db, dir, ...OPTS, timeZone: "Not/AZone" })).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api exec vitest run src/__tests__/activityExport.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/services/activityExport.ts
/**
 * Daily activity export (v1.88.0): one CSV per complete local calendar day,
 * DERIVED from audit_log — never a second source of truth.
 *
 * Per run (spec § 2.4):
 *   cutoffDay       = local day containing (now − retention)
 *   lastCompleteDay = the day before the local date of (now − grace)
 *   for each day d, cutoffDay < d <= lastCompleteDay, with no file yet:
 *       write activity-d.csv from the rows whose LOCAL date is d
 *   prune every activity-YYYY-MM-DD.csv whose date <= cutoffDay
 *
 * Consequences, all deliberate: the first run after deploy materialises the
 * whole retention window from the rows still in the DB; a missed midnight
 * self-heals (the file's existence is the only state); a complete day's file
 * is never rewritten (delete it to regenerate); an empty day is a header-only
 * file; the boundary day is excluded, so a file exists only for days fully
 * inside the window the rows share; pruning deletes ONLY names this module
 * would have written. Writes are tmp + rename. Any failure throws — the
 * caller (the retention sweep) records it; nothing here falls back silently.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatActivityCsv, type ActivityRow } from "./activityCsv.js";
import {
  activityFileName,
  addDays,
  daysAfter,
  exportWindow,
  localDate,
  parseActivityFileName,
} from "./activityDays.js";
import { sqliteUtcToIso } from "./sqliteTime.js";

/** The slice of better-sqlite3's Database this module needs. */
export interface ActivityExportDb {
  prepare(sql: string): { all(...params: unknown[]): unknown[] };
}

export interface ActivityExportOptions {
  db: ActivityExportDb;
  /** Absolute or cwd-relative directory; created 0700 if missing. */
  dir: string;
  nowMs: number;
  retentionDays: number;
  graceMinutes: number;
  timeZone: string;
}

export interface ActivityExportResult {
  written: number;
  pruned: number;
  /** The days written this run, ascending. */
  days: string[];
}

// A local day spans at most [d−1, d+2) in UTC for any zone; the filter below
// does the exact cut. created_at is "YYYY-MM-DD HH:MM:SS" (UTC), so string
// comparison against the same shape is chronological.
const SELECT_WINDOW = `
  SELECT id, created_at, event_type, filename, score, grade, content_hash, privileged, reason
    FROM audit_log
   WHERE created_at >= ? AND created_at < ?
   ORDER BY id`;

export function rowsForDay(db: ActivityExportDb, day: string, timeZone: string): ActivityRow[] {
  const from = `${addDays(day, -1)} 00:00:00`;
  const to = `${addDays(day, 2)} 00:00:00`;
  const rows = db.prepare(SELECT_WINDOW).all(from, to) as ActivityRow[];
  return rows.filter((r) => {
    const iso = sqliteUtcToIso(r.created_at);
    if (iso === null) return false;
    const ms = Date.parse(iso);
    return !Number.isNaN(ms) && localDate(ms, timeZone) === day;
  });
}

export function runActivityExport(opts: ActivityExportOptions): ActivityExportResult {
  const { cutoffDay, lastCompleteDay } = exportWindow(opts.nowMs, opts);
  mkdirSync(opts.dir, { recursive: true, mode: 0o700 });

  const days: string[] = [];
  for (const day of daysAfter(cutoffDay, lastCompleteDay)) {
    const final = join(opts.dir, activityFileName(day));
    if (existsSync(final)) continue;
    const csv = formatActivityCsv(rowsForDay(opts.db, day, opts.timeZone), opts.timeZone);
    const tmp = `${final}.tmp`;
    writeFileSync(tmp, csv, { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, final);
    days.push(day);
  }

  let pruned = 0;
  for (const name of readdirSync(opts.dir)) {
    const day = parseActivityFileName(name);
    if (day !== null && day <= cutoffDay) {
      rmSync(join(opts.dir, name), { force: true });
      pruned++;
    }
  }

  return { written: days.length, pruned, days };
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter api exec vitest run src/__tests__/activityExport.test.ts`
Expected: PASS (8 tests). If the permission assertions fail on macOS because of the umask, they still must pass on Linux CI — `mode: 0o600`/`0o700` are explicit, so investigate rather than loosen.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/activityExport.ts apps/api/src/__tests__/activityExport.test.ts
git commit -m "feat(api): runActivityExport — write missing complete days, prune by file-name date"
```

---

### Task 10: Wire the export into the retention sweep (spec § 2.4 "When it runs")

**Files:**
- Modify: `apps/api/src/services/remediationCleanup.ts` (header comment L1–25; imports L26–31; `CleanupResult` ~L75–86; `runCleanup` result init ~L88–98; append step 8 before `return result;` ~L240)
- Test: `apps/api/src/__tests__/activityExportWiring.test.ts`

**Interfaces:**
- Consumes: `runActivityExport` (Task 9), `activityLogDir` (Task 6 — `<repo-root>/logs`, `ACTIVITY_LOG_DIR` override), `ACTIVITY_EXPORT`, `DEPLOY`, `SHARED_REPORTS` (Task 1 / existing).
- Produces: `CleanupResult.activityFilesWritten: number`, `CleanupResult.activityFilesPruned: number`, error step name `"activityExport"`. (If `ACTIVITY_EXPORT` ends up unreferenced in `remediationCleanup.ts` after this change, drop it from the import — `tsc`/ESLint will say.)

- [ ] **Step 1: Write the failing wiring test**

```ts
// apps/api/src/__tests__/activityExportWiring.test.ts
/**
 * THE WIRING: runCleanup() must actually run the activity export as step 8,
 * against the real data directory (DB_PATH's parent), and report what it
 * did. Same file-backed pattern as sharedReportsPurge.test.ts — DB_PATH is
 * set before the dynamic imports because the singleton binds at import.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "activity-wiring-"));
process.env.DB_PATH = join(tmpDir, "test.db");
// The export writes to <repo-root>/logs by default; point it at the temp dir so
// the test never touches the real checkout.
process.env.ACTIVITY_LOG_DIR = join(tmpDir, "logs");
process.env.REMEDIATION_ENABLED = "false";

let cleanup: typeof import("../services/remediationCleanup.js");
let db: (typeof import("../db/sqlite.js"))["default"];
let days: typeof import("../services/activityDays.js");
let DEPLOY: (typeof import("#config"))["DEPLOY"];
const LOG_DIR = process.env.ACTIVITY_LOG_DIR!;

beforeAll(async () => {
  ({ DEPLOY } = await import("#config"));
  cleanup = await import("../services/remediationCleanup.js");
  db = (await import("../db/sqlite.js")).default;
  days = await import("../services/activityDays.js");
});
afterAll(() => {
  cleanup.stopCleanupInterval();
  rmSync(tmpDir, { recursive: true, force: true });
});

const DAY = 86_400_000;
const sqliteStamp = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

describe("retention sweep step 8: daily activity export", () => {
  it("writes the file for a complete day into <dataDir>/activity and reports it", async () => {
    const twoDaysAgo = Date.now() - 2 * DAY;
    db.prepare(
      `INSERT INTO audit_log (event_type, filename, score, grade, privileged, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("analyze", "wired.pdf", 80, "B", 0, sqliteStamp(twoDaysAgo));

    const result = await cleanup.runCleanup();

    const day = days.localDate(twoDaysAgo, DEPLOY.LOCAL_TIME_ZONE);
    expect(result.errors.filter((e) => e.step === "activityExport")).toEqual([]);
    expect(result.activityFilesWritten).toBeGreaterThanOrEqual(1);
    expect(result.activityFilesPruned).toBe(0);
    expect(existsSync(join(LOG_DIR, days.activityFileName(day)))).toBe(true);
  });

  it("the next sweep writes nothing new", async () => {
    const result = await cleanup.runCleanup();
    expect(result.activityFilesWritten).toBe(0);
  });

  it("a failing export is reported under step 'activityExport' and blocks nothing else", async () => {
    rmSync(LOG_DIR, { recursive: true, force: true });
    writeFileSync(LOG_DIR, "a file where the directory should be");

    const result = await cleanup.runCleanup();

    expect(result.errors.map((e) => e.step)).toEqual(["activityExport"]);
    expect(result.activityFilesWritten).toBe(0);
    rmSync(LOG_DIR, { force: true });
    expect(readdirSync(tmpDir)).not.toContain("logs");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api exec vitest run src/__tests__/activityExportWiring.test.ts`
Expected: FAIL — `activityFilesWritten` undefined, no file written.

- [ ] **Step 3: Wire step 8**

In `apps/api/src/services/remediationCleanup.ts`:

Header comment: change "Does seven things, in order:" to "Does eight things, in order:" and add after the step-7 paragraph:

```
 *   8. Write the daily activity export — one CSV per complete local day of
 *      audit_log rows, into <repo-root>/logs — and prune files past
 *      AUDIT_LOG_RETENTION_DAYS, the same window step 6 purges (v1.88.0,
 *      services/activityExport.ts). Runs after step 6 so both see one cutoff.
```

Imports — replace `import { REMEDIATION, SHARED_REPORTS } from "#config";` with:

```ts
import { ACTIVITY_EXPORT, DEPLOY, REMEDIATION, SHARED_REPORTS } from "#config";
import { runActivityExport } from "./activityExport.js";
import { activityLogDir } from "./dataDir.js";
```

`CleanupResult` — add after `purgedSharedReports: number;`:

```ts
  /** v1.88.0: daily activity files written / pruned by step 8. */
  activityFilesWritten: number;
  activityFilesPruned: number;
```

`runCleanup` result init — add `activityFilesWritten: 0,` and `activityFilesPruned: 0,` after `purgedSharedReports: 0,`.

Before `return result;` at the end of `runCleanup`, add:

```ts
  /* 8. Daily activity export (v1.88.0): one CSV per complete local day,
   *    derived from audit_log; pruned on the same 365-day window as step 6.
   *    The directory is logs/ at the repository root (activityLogDir —
   *    ACTIVITY_LOG_DIR overrides), which on the production host shares the
   *    volume the /status disk probe watches. Any failure — including a
   *    missing ICU zone — is recorded here rather than falling back silently. */
  try {
    const r = runActivityExport({
      db,
      dir: activityLogDir(),
      nowMs: now,
      retentionDays: SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS,
      graceMinutes: ACTIVITY_EXPORT.GRACE_MINUTES,
      timeZone: DEPLOY.LOCAL_TIME_ZONE,
    });
    result.activityFilesWritten = r.written;
    result.activityFilesPruned = r.pruned;
  } catch (e) {
    result.errors.push({ step: "activityExport", message: (e as Error).message });
  }
```

- [ ] **Step 4: Run the wiring test, the other sweep tests, and typecheck**

Run: `pnpm --filter api exec vitest run src/__tests__/activityExportWiring.test.ts src/__tests__/sharedReportsPurge.test.ts src/__tests__/remediationLifecycle.test.ts && pnpm --filter api exec tsc --noEmit`
Expected: PASS, zero type errors. (If `remediationLifecycle.test.ts` constructs a `CleanupResult` literal, add the two new fields there.)

- [ ] **Step 5: Run the whole API suite**

Run: `pnpm --filter api test`
Expected: all green. Note the total and per-file counts for the new files (needed for README in Task 12).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/remediationCleanup.ts apps/api/src/__tests__/activityExportWiring.test.ts
git commit -m "feat(api): retention sweep step 8 writes and prunes the daily activity export"
```

---

### Task 11: Data-retention policy v1.12 (spec § 5)

**Files:**
- Modify: `apps/web/app/pages/data-retention.vue` (`const POLICY_VERSION = "1.11";` ~L46)
- Modify: `apps/web/app/components/dataRetention/Section07RetentionTable.vue` (usage-log row ~L84–94; sweep paragraph ~L171–182)
- Modify: `apps/web/app/components/dataRetention/Section08Stored.vue` (the "Stored (metadata only)" list, after the refused-upload `<li>` ~L12–16)
- Modify: `apps/web/app/components/dataRetention/Section08aStorageVerification.vue` (`audit_log` row's third cell ~L71–74; the `CREATE TABLE audit_log` block ~L110–121)
- Modify: `apps/web/app/components/dataRetention/Section14ChangeLog.vue` (prepend an `<li>` at the top of the list ~L8)
- Test: `apps/web/app/__tests__/activityExportPolicy.test.ts`

**Interfaces:** none (copy + a source-reading test).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/__tests__/activityExportPolicy.test.ts
/**
 * Policy v1.12 (tool v1.88.0): failed audits are recorded with a one-word
 * reason, and a daily activity CSV derived from the usage log lives on the
 * server for the same 365 days. Like backupsExplained.test.ts this reads the
 * section sources — the page cannot be mounted under plain vitest — and
 * pins the claims a reader relies on, plus the overclaim guard on the NEW
 * copy only (older copy is covered elsewhere).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const WEB_ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), "utf8");
const visible = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/** The text between two markers, so assertions land on the new copy only. */
const between = (text: string, start: string, end: string) => {
  const i = text.indexOf(start);
  expect(i, `marker "${start}"`).toBeGreaterThan(-1);
  const j = text.indexOf(end, i + start.length);
  expect(j, `end marker "${end}"`).toBeGreaterThan(-1);
  return text.slice(i, j);
};

const s07 = read("app/components/dataRetention/Section07RetentionTable.vue");
const s08 = read("app/components/dataRetention/Section08Stored.vue");
const s08a = read("app/components/dataRetention/Section08aStorageVerification.vue");
const s14 = read("app/components/dataRetention/Section14ChangeLog.vue");
const page = read("app/pages/data-retention.vue");

const REASONS = ["unreadable", "timeout", "fetch-failed", "navigation-failed", "internal"];

describe("data-retention policy v1.12: failed audits + daily activity files", () => {
  it("§ 7 lists the activity files: usage-log window, on-server, outside backups, one setting", () => {
    const row = visible(between(s07, "Daily activity files", "</tr>"));
    expect(row).toMatch(/logs\/ at the application's root/);
    expect(row).toMatch(/365 days — the usage log's window/);
    expect(row).toMatch(/not part of the nightly backup/);
    expect(row).toMatch(/SHARED_REPORTS\.AUDIT_LOG_RETENTION_DAYS \(shared with the usage log/);
  });

  it("§ 7's usage-log row and the sweep paragraph include failed audits and the export step", () => {
    const t = visible(s07);
    expect(t).toMatch(/Usage log — audits, failed audits, and refused-upload attempts/);
    expect(t).toMatch(/eight tasks/);
    expect(t).toMatch(/write the previous day's activity file/);
    expect(t).not.toMatch(/seven tasks/);
  });

  it("§ 8 says what a failed-audit row holds — the closed reason set, never error text — and describes the files", () => {
    const failed = visible(between(s08, "For a failed audit", "</li>"));
    for (const r of REASONS) expect(failed).toContain(r);
    expect(failed).toMatch(/never the error text/);
    expect(failed).toMatch(/no score, no grade, no content hash/);
    const files = visible(between(s08, "Daily activity files", "</li>"));
    expect(files).toMatch(/same fields/);
    expect(files).toMatch(/file name is the one field that can carry personal information/);
    expect(files).toMatch(/Deleted after 365 days/);
    expect(files).toMatch(/not downloadable/);
  });

  it("§ 8a shows the migration-13 schema with the reason column", () => {
    expect(s08a).toContain("shape after migration 13");
    expect(s08a).not.toContain("shape after migration 12");
    expect(s08a).toMatch(/reason TEXT/);
    expect(visible(s08a)).toMatch(/one-word reason code/);
  });

  it("§ 14 has the v1.12 entry and the header constant agrees", () => {
    expect(s14).toMatch(/<strong>v1\.12 · 2026-08-22<\/strong>/);
    expect(page).toContain('const POLICY_VERSION = "1.12"');
    const entry = visible(between(s14, "v1.12 · 2026-08-22", "</li>"));
    expect(entry).toMatch(/no change to any retention period/i);
    expect(entry).toMatch(/not part of the nightly backup/);
  });

  it("§ 7 and § 8 describe the application error log: what it holds, 30 days, not backed up, never served", () => {
    const row = visible(between(s07, "Application error log", "</tr>"));
    expect(row).toMatch(/error message and stack trace/);
    expect(row).toMatch(/30 days/);
    expect(row).toMatch(/ACTIVITY_EXPORT\.ERROR_LOG_RETENTION_DAYS/);
    expect(row).toMatch(/not part of the nightly backup; never served/);
    const bullet = visible(between(s08, "Application error log", "</li>"));
    expect(bullet).toMatch(/never writes an IP address, a token or a browser identifier/);
    expect(bullet).toMatch(/Kept 30 days/);
    expect(visible(between(s14, "v1.12 · 2026-08-22", "</li>"))).toMatch(/Application error log/);
    expect(visible(s07)).toMatch(/error-log files past their 30-day window/);
  });

  it("the new copy never overclaims", () => {
    const fresh = [
      between(s07, "Daily activity files", "</tr>"),
      between(s07, "Application error log", "</tr>"),
      between(s08, "For a failed audit", "</li>"),
      between(s08, "Daily activity files", "</li>"),
      between(s08, "Application error log", "</li>"),
      between(s14, "v1.12 · 2026-08-22", "</li>"),
    ].map(visible);
    for (const t of fresh) {
      expect(t).not.toMatch(/no personal (data|information|details)/i);
      expect(t).not.toMatch(/(contains|holds) no PII/i);
      expect(t).not.toMatch(/anonymous|anonymi[sz]ed/i);
      expect(t).not.toMatch(/\bstrong\b/i);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run app/__tests__/activityExportPolicy.test.ts`
Expected: FAIL on every assertion.

- [ ] **Step 3: Edit the sections**

`apps/web/app/pages/data-retention.vue`: `const POLICY_VERSION = "1.12";`

`Section07RetentionTable.vue` — change the usage-log row's category cell text to:

```
              Usage log — audits, failed audits, and refused-upload attempts (no file content)
```

and insert this row directly after that row's closing `</tr>`:

```html
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-medium">
              Daily activity files — one CSV per calendar day (Central time), derived from the usage
              log and holding the same fields (no file content)
            </td>
            <td class="py-2.5 pr-4">
              On the same server, in <code class="font-mono">logs/</code> at the application's
              root — beside the code, outside the web root, unreachable from the web; not part of
              the nightly backup
            </td>
            <td class="py-2.5 pr-4">365 days — the usage log's window</td>
            <td class="py-2.5">
              Yes — <code class="font-mono">SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS</code> (shared
              with the usage log; there is no separate setting)
            </td>
          </tr>
```

Directly after that new row, add the error-log row:

```html
          <tr class="border-b border-[var(--border)]/40">
            <td class="py-2.5 pr-4 font-medium">
              Application error log — what the service writes to its own error output: a
              timestamp, the operation that failed, the error message and stack trace (no file
              content)
            </td>
            <td class="py-2.5 pr-4">
              On the same server, in <code class="font-mono">logs/</code> at the application's
              root, one file per day; not part of the nightly backup; never served
            </td>
            <td class="py-2.5 pr-4">30 days</td>
            <td class="py-2.5">
              Yes — <code class="font-mono">ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS</code>
            </td>
          </tr>
```

In the sweep paragraph, change "It performs seven tasks idempotently:" to "It performs eight tasks idempotently:" and change the tail "…and delete `shared_reports` rows roughly 30 days after their link expires. Source:" to:

```
      <code class="text-xs font-mono">audit_log</code> rows past their 365-day retention; delete
      <code class="text-xs font-mono">shared_reports</code> rows roughly 30 days after their link
      expires; and write the previous day's activity file, deleting activity files past the same
      365-day window, and delete application error-log files past their 30-day window (tool
      v1.88.0+). Source:
```

`Section08Stored.vue` — after the refused-upload `<li>…</li>`, add:

```html
          <li>
            For a failed audit (tool v1.88.0+): the file name or page address it was attempted on
            (sanitized), a timestamp, the request tier, and a one-word reason code —
            <code class="font-mono">unreadable</code>, <code class="font-mono">timeout</code>,
            <code class="font-mono">fetch-failed</code>,
            <code class="font-mono">navigation-failed</code> or
            <code class="font-mono">internal</code> — never the error text; no score, no grade, no
            content hash
          </li>
          <li>
            Daily activity files (tool v1.88.0+): the usage log's rows for one calendar day, written
            to a CSV file in <code class="font-mono">logs/</code> on the server so a day can be
            reviewed without querying the database — the same fields as the rows above and nothing
            more. The file name is the one field that can
            carry personal information, if a person put it there. Deleted after 365 days; not part of
            the nightly backup; not downloadable from this site
          </li>
```

After the daily-activity-files bullet, add:

```html
          <li>
            Application error log (tool v1.88.0+): one text file per day in
            <code class="font-mono">logs/</code> on the server holding what the service writes to
            its own error output — a timestamp, which operation failed, and the error message and
            stack trace. A message or stack can name a file, a page address or a library path; the
            service never writes an IP address, a token or a browser identifier to it. Kept 30 days
            for diagnosing faults; not part of the nightly backup; not downloadable
          </li>
```

`Section08aStorageVerification.vue` — the `audit_log` row's third cell becomes:

```html
            <td class="py-2.5">
              filename (sanitized, 512-char clamp), content hash, request tier (trusted-tool vs
              public — a property of the shared service token, not an identity), and on a failed
              audit a one-word reason code (never error text)
            </td>
```

and the schema block becomes:

```
CREATE TABLE audit_log (          -- shape after migration 13
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  filename TEXT,
  score INTEGER,
  grade TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  content_hash TEXT,
  privileged INTEGER,  -- request tier: 1 = trusted-tool (fleet), 0 = public,
                       -- NULL = row predates the column. A property of the
                       -- shared service token, never an identity.
  reason TEXT          -- failed audits only (v1.88.0): one of five fixed codes —
                       -- unreadable, timeout, fetch-failed, navigation-failed,
                       -- internal. NULL otherwise. Never error text.
);
```

`Section14ChangeLog.vue` — insert as the FIRST `<li>` of the list:

```html
      <li>
        <strong>v1.12 · 2026-08-22</strong> — Two additions, no change to any retention period.
        <em>Failed audits are now recorded</em> in the usage-metadata table: an audit the tool
        attempted and could not complete leaves a row with the same fields as a successful one, no
        score or grade, no content hash, and a one-word reason code
        (<code class="text-xs font-mono">unreadable</code>,
        <code class="text-xs font-mono">timeout</code>,
        <code class="text-xs font-mono">fetch-failed</code>,
        <code class="text-xs font-mono">navigation-failed</code>,
        <code class="text-xs font-mono">internal</code>) — never the error text. § 8a shows the new
        <code class="text-xs font-mono">audit_log.reason</code> column. <em>Daily activity files</em>:
        each night the server writes the previous day's usage-log rows to a CSV file so auditors and
        managers can review a day without querying the database. Derived from the table, same
        fields, deleted on the same 365-day schedule, kept on the server's disk only, not part of the
        nightly backup, never served by the site (§ 7, § 8). <em>Application error log</em>: the
        service's own error output — message and stack trace, for diagnosing faults — is also kept
        as one file per day in the same place, for 30 days, not backed up, never served (§ 7, § 8).
      </li>
```

- [ ] **Step 3c: The policy-conformance test (API suite — it needs the code's constants)**

```ts
// apps/api/src/__tests__/activityLogsPolicyConformance.test.ts
/**
 * "Verify that the logs abide by the data retention policy" (user, 2026-08-22):
 * the policy page is prose, the code is constants, and the two drift silently.
 * This reads the policy's own section sources (as the web suite's
 * backupsExplained.test.ts does) and pins them to the constants the sweep and
 * the writers actually use. A retention change in either place fails here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { ACTIVITY_EXPORT, SHARED_REPORTS } from "#config";
import { AUDIT_FAILURE_REASONS } from "../services/auditFailure.js";

const SECTIONS = resolve(__dirname, "../../../web/app/components/dataRetention");
const read = (f: string) => readFileSync(resolve(SECTIONS, f), "utf8");
const visible = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const between = (text: string, start: string, end: string) => {
  const i = text.indexOf(start);
  expect(i, `marker "${start}"`).toBeGreaterThan(-1);
  const j = text.indexOf(end, i + start.length);
  expect(j, `end marker "${end}"`).toBeGreaterThan(-1);
  return text.slice(i, j);
};

const s07 = read("Section07RetentionTable.vue");
const s08 = read("Section08Stored.vue");

describe("the data-retention policy states what the code enforces", () => {
  it("§ 7: the activity files' window is the usage log's constant", () => {
    const row = visible(between(s07, "Daily activity files", "</tr>"));
    expect(row).toContain(`${SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS} days`);
    expect(row).toContain("SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS");
    expect(visible(between(s07, "Usage log", "</tr>"))).toContain(
      `${SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS} days`,
    );
  });
  it("§ 7: the error log's window is the config constant", () => {
    const row = visible(between(s07, "Application error log", "</tr>"));
    expect(row).toContain(`${ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS} days`);
    expect(row).toContain("ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS");
    expect(visible(s07)).toContain(`${ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS}-day window`);
  });
  it("§ 7 and § 8 name the directory the code writes to", () => {
    for (const marker of ["Daily activity files", "Application error log"]) {
      expect(visible(between(s07, marker, "</tr>"))).toContain(`${ACTIVITY_EXPORT.DIR_NAME}/`);
      expect(visible(between(s08, marker, "</li>"))).toContain(`${ACTIVITY_EXPORT.DIR_NAME}/`);
    }
  });
  it("§ 8 lists exactly the closed reason set the writer accepts", () => {
    const bullet = visible(between(s08, "For a failed audit", "</li>"));
    for (const r of AUDIT_FAILURE_REASONS) expect(bullet).toContain(r);
    const listed = bullet.match(/[a-z]+(?:-[a-z]+)*/g)!.filter((w) =>
      (AUDIT_FAILURE_REASONS as readonly string[]).includes(w),
    );
    expect(new Set(listed).size).toBe(AUDIT_FAILURE_REASONS.length);
  });
  it("§ 8 lists 30 days for the error log and 365 for the activity files, as the code does", () => {
    expect(visible(between(s08, "Application error log", "</li>"))).toContain(
      `Kept ${ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS} days`,
    );
    expect(visible(between(s08, "Daily activity files", "</li>"))).toContain(
      `Deleted after ${SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS} days`,
    );
  });
});
```

Run: `pnpm --filter api exec vitest run src/__tests__/activityLogsPolicyConformance.test.ts`
Expected: PASS (5 tests) once Step 3's edits are in place (it fails before them — that is the point).

- [ ] **Step 4: Format, then check for stale pins**

Run: `pnpm exec prettier --write apps/web/app/components/dataRetention/Section07RetentionTable.vue apps/web/app/components/dataRetention/Section08Stored.vue apps/web/app/components/dataRetention/Section08aStorageVerification.vue apps/web/app/components/dataRetention/Section14ChangeLog.vue`

Then: `grep -rn "seven tasks\|migration 12\|1\.11" apps/web/app/__tests__ | grep -v activityExportPolicy` — any test pinning the old wording or version must be updated to the new wording (these are literal string pins, not behaviour).

- [ ] **Step 5: Run the web suite**

Run: `pnpm --filter web test`
Expected: all green, including `dataRetentionVersion.test.ts` (header 1.12 == newest § 14 entry), `backupsExplained.test.ts`, `securityAudits.test.ts` (its shipping-version checks still pass because the package version has not changed yet — that is Task 13).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/pages/data-retention.vue apps/web/app/components/dataRetention apps/web/app/__tests__/activityExportPolicy.test.ts apps/api/src/__tests__/activityLogsPolicyConformance.test.ts
git commit -m "docs(policy): data-retention v1.12 — failed audits with a reason; daily activity files; application error log; policy pinned to the code's constants"
```

---

### Task 12: Runbook, process-supervision correction, README (spec § 5)

**Files:**
- Create: `docs/activity-export.md`
- Modify: `docs/process-supervision.md` ("## Log rotation" section)
- Modify: `README.md` (Contents list ~L34; "No Accounts, No Sign-In" bullets ~L100–107; a new `## Activity Export` section before `## Report Views` ~L444; API + web test tables; the per-suite counts in the `### API Tests (N tests)` / `### Web Tests (N tests)` headings)

**Interfaces:** none.

- [ ] **Step 1: Write the runbook**

```markdown
<!-- docs/activity-export.md -->
# Daily activity export

One CSV per calendar day, derived from the `audit_log` table, so a day can be reviewed — or
handed to a manager — without querying SQLite. Added in v1.88.0; design in
`docs/superpowers/specs/2026-08-22-activity-export-design.md`.

## Where

```
<repo-root>/logs/activity-YYYY-MM-DD.csv        # /home/forge/audit.icjia.app/file-accessibility-audit/logs/ in production
```

`logs/` at the root of the checkout — one `ls` from the application root. The path is derived
from the code's own location (`services/dataDir.ts: activityLogDir()`), never from the process
cwd; set `ACTIVITY_LOG_DIR` (absolute) to put it elsewhere. `logs/` is git-ignored and
`rebuild.sh` never `git clean`s, so deploys leave the files alone. Directory `0700`, files
`0600`, owned by the API process user (`forge` in production). Nothing serves these files; the
only way to read one is on the server.

```bash
cd /home/forge/audit.icjia.app/file-accessibility-audit
ls -lt logs | head                               # newest first
less logs/activity-2026-08-19.csv
scp forge@audit.icjia.app:audit.icjia.app/file-accessibility-audit/logs/activity-2026-08-19.csv .
```

Each file opens directly in Excel or Numbers (UTF-8 BOM, LF line endings).

## What a row is

Exactly the usage log's fields — the data-retention policy (§ 8) is the authority on what they
mean, and `ACTIVITY_CSV_COLUMNS` in `apps/api/src/services/activityCsv.ts` is the pinned allow-list:

| Column | Meaning |
| --- | --- |
| `id` | the `audit_log` row id — a stable reference two people can point at |
| `timestamp_utc` | `2026-08-19T14:03:22Z` |
| `timestamp_chicago` | `2026-08-19 09:03:22 CDT` — sortable, 24-hour |
| `event` | `analyze`, `analyze-url`, `audit-url`, `audit-url-page`, `bulk-from-inventory`, `rejected-upload`, or any of those with `-failed` |
| `filename` | the file's name, or the URL for URL / page audits |
| `score`, `grade` | empty for refusals and failures |
| `content_hash` | SHA-256 of the file; empty for refusals and failures |
| `tier` | `trusted-tool` (fleet token), `public`, or `unknown` (rows older than migration 12) |
| `reason` | failed audits only: `unreadable`, `timeout`, `fetch-failed`, `navigation-failed`, `internal` |

A day is an **America/Chicago** calendar day (`DEPLOY.LOCAL_TIME_ZONE`). A row at 23:30 Central
on the 19th is in the 19th's file even though its UTC date is the 20th.

## When it is written

Step 8 of the retention sweep (`runCleanup` in `apps/api/src/services/remediationCleanup.ts`),
which runs at API startup and every 5 minutes. Each run writes every *complete* day inside the
retention window that has no file yet (a day is complete 5 minutes after local midnight —
`ACTIVITY_EXPORT.GRACE_MINUTES`). So:

- the first run after deploy writes the whole past year from the rows the database still holds;
- a missed midnight (restart, reboot) heals itself on the next run;
- an empty day gets a header-only file — "nothing happened", not "the export did not run".

Check the sweep's own report: `pm2 logs file-audit-api --lines 50` after a restart, or run
`cd apps/api && pnpm tsx src/services/remediationCleanup.ts` and read `activityFilesWritten` /
`activityFilesPruned` / `errors`.

## Retention

365 days — `SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS`, the usage log's own window. There is no
separate setting, so a file exists exactly when its rows do: the sweep prunes any
`activity-YYYY-MM-DD.csv` whose date is at or before the cutoff day, and never writes the cutoff
day itself. The files are **not** in the nightly backup (they are derived; the database is) and
must not be archived past the window — the policy page is a published deletion promise.

## Regenerating a day

A complete day's file is never rewritten. Delete it; the next sweep writes it again from the
database (within the window):

```bash
rm logs/activity-2026-08-19.csv                       # then wait ≤ 5 min, or run the sweep by hand
```

This is also the upgrade path if the file format ever changes: delete the files, let the sweep
rebuild them.

## The error log — when the site misbehaves

```
<repo-root>/logs/errors-YYYY-MM-DD.log
```

Everything the API process writes to its error output, one plain-text file per Chicago day:
each entry is `2026-08-19T14:03:22Z [error] …` or `[warn] …` followed by exactly what the
terminal would show — for an Error, its message and stack. It is a tee of stderr, installed at
startup, so `pm2 logs file-audit-api` shows the same lines; this file is just the copy that is
easy to find and that outlives PM2's 14-day rotation.

```bash
less logs/errors-2026-08-19.log
grep -n '\[error\]' logs/errors-2026-08-19.log | tail      # the failures, newest last
grep -c 'net::ERR_ABORTED' logs/errors-2026-08-19.log       # how often a known condition fired
```

To go from a failed audit to its cause: take the row's `timestamp_utc` and `filename` from the
day's activity CSV and grep the same day's error log for the URL or the file name — the failure
row's one-word `reason` is the classification, the error log has the detail.

- Kept **30 days** (`ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS`), pruned by the sweep on the
  file-name date. Not in backups. Never served.
- A day's file stops growing at 50 MB (`ERROR_LOG_MAX_BYTES_PER_DAY`) after a final
  `[error-log] daily size limit reached` line — a crash loop cannot fill the disk; stderr (PM2)
  still gets everything.
- If the directory cannot be written, the tee says so once on stderr and stays off for the day;
  nothing else changes.
- Privacy: the file holds what stderr holds. The service never writes an IP address, a token, a
  user agent or a request body to stderr (tested); a message can name a file, a page address or
  a library path, which the data-retention policy says (§ 7, § 8).

## What is deliberately not here

- No download endpoint. The files stay on the server.
- No remediation or share events — those live in tables with their own retention.
- No compression — a year is tens of MB at most.
- Pruning touches only names of the exact `activity-YYYY-MM-DD.csv` shape. Anything else placed
  in the directory (including a stale `.tmp` from a crash) is left alone.
```

- [ ] **Step 2: Correct `docs/process-supervision.md`**

Replace the block under `## Log rotation` that starts at `pm2 set pm2-logrotate:max_size 10M` through the paragraph ending "…bounded enough that logs can never be what fills the disk." with:

````markdown
```bash
pm2 install pm2-logrotate

pm2 set pm2-logrotate:max_size 10M          # rotate at 10 MB
pm2 set pm2-logrotate:retain 14             # keep 14 rotated files per stream
pm2 set pm2-logrotate:compress true         # INEFFECTIVE in 3.0.0 — see below
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'   # also rotate nightly
pm2 set pm2-logrotate:workerInterval 30     # check every 30 seconds (the module default)

pm2 save
```

**Verify:**

```bash
pm2 conf pm2-logrotate                      # shows the values above
ls -lh ~/.pm2/logs/                         # rotated files appear as *__YYYY-MM-DD_HH-mm-ss.log
```

`pm2 save` matters: without it the module list is not written to the
resurrect file, and a server reboot brings PM2 back without rotation.

**Compression does not happen, despite `compress true`.** Verified on production
2026-08-22: every rotated file is plain `.log`. The cause is upstream, in
`pm2-logrotate` 3.0.0: the module's `parseBool` accepts only the *string*
`'true'`, but pmx casts the value stored by `pm2 set` to a boolean before the
module reads it, so `COMPRESSION` is always `false`. The setting is left in
place for whenever upstream fixes it; until then do not expect `.gz` files,
and do not "fix" it locally — the retention count is what bounds the disk.

The retention above therefore keeps up to **140 MB per log stream**
(14 × 10 MB, uncompressed) in the worst case, which is deliberate — enough
history to investigate an incident from a few days ago, bounded enough that
logs can never be what fills the disk. In practice the whole directory was
3.9 MB after two weeks. Application-level activity — what was audited, by
which path, with what result — is not in these logs at all; it is the
`audit_log` table and the daily activity export (`docs/activity-export.md`). Since v1.88.0 the
service also tees its own stderr into `logs/errors-YYYY-MM-DD.log` at the checkout root (30
days, 50 MB/day cap), so a fault can be diagnosed without opening `~/.pm2/logs` at all.
````

- [ ] **Step 3: README**

Contents list — in the `- **Reports & data** —` line, add ` · [Activity Export](#activity-export)` after `[Report Exports](#report-exports)`.

"No Accounts, No Sign-In" — after the `**No identifier storage, at the schema level.**` bullet, add:

```markdown
- **What the usage record holds, and where you can read it.** Every audit, URL audit, page audit, refused upload and — since v1.88.0 — **failed audit** is one `audit_log` row: event type, file name or URL, score, grade, content hash, request tier, timestamp, and for a failure a one-word reason (`unreadable`, `timeout`, `fetch-failed`, `navigation-failed`, `internal` — never the error text). Rows are purged after 365 days. The same rows are written out as one CSV per day on the server — see [Activity Export](#activity-export) — and the file name is the one field that can carry personal information, if a person put it there; the [data-retention policy](https://audit.icjia.app/data-retention) says so rather than claiming otherwise.
```

New section, inserted before `## Report Views`:

```markdown
## Activity Export

Since v1.88.0 the retention sweep writes **one CSV per calendar day** (America/Chicago) of the `audit_log` table into **`logs/activity-YYYY-MM-DD.csv` at the repository root** on the server — one `ls` from the application root for an operator with `less`, and a file a manager can open in Excel (`ACTIVITY_LOG_DIR` overrides the location; `logs/` is git-ignored and survives deploys). It is **derived** from the database (never a second source of truth), kept for the usage log's own **365 days** (`SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS` — there is no separate setting), pruned by file-name date, **not** included in the nightly backup, and **not served** by any route.

Columns: `id, timestamp_utc, timestamp_chicago, event, filename, score, grade, content_hash, tier, reason` — the pinned allow-list in `apps/api/src/services/activityCsv.ts`. `tier` is `trusted-tool` / `public` / `unknown`; `reason` is set only on `*-failed` rows. RFC 4180 quoting, a formula-injection guard, a UTF-8 BOM, LF line endings.

The first sweep after deploy materialises the whole window from the rows still in the database; a missed midnight heals itself; a complete day's file is never rewritten (delete it to regenerate).

**Error log.** The same directory holds `errors-YYYY-MM-DD.log` — a tee of everything the API process writes to stderr (`console.error`/`console.warn`, formatted as the terminal shows it, stacks included), installed at startup so a fault can be diagnosed without PM2: kept **30 days** (`ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS`), capped at 50 MB per day (a crash loop cannot fill the disk), not backed up, never served. The activity CSV gives the one-word `reason`; the error log gives the message and stack. Runbook: [`docs/activity-export.md`](docs/activity-export.md). Design: [`docs/superpowers/specs/2026-08-22-activity-export-design.md`](docs/superpowers/specs/2026-08-22-activity-export-design.md).
```

Test tables — add rows (counts from the Task 10 / Task 11 runs; the descriptions are final):

API table:

```markdown
| `failureEventTypes.test.ts` | N | `STATUS.FAILURE_EVENT_TYPES` is exactly the `-failed` twin of every document/page event type and overlaps no other list; migration 13 adds a nullable `audit_log.reason` and lands a fresh database at `user_version` 13, safely re-runnable; the export config names a real IANA zone. |
| `auditFailureClassifier.test.ts` | N | `classifyAuditFailure`: every rule of the spec's table — `SafeFetchError` → `fetch-failed` before anything else, 503 and refusal codes → `null`, parse codes / encrypted → `unreadable`, every timeout shape → `timeout`, `net::ERR_*` → `navigation-failed`, everything else (including non-Error throwables) → `internal`; never a substring of the message. |
| `auditLogFailure.test.ts` | N | `recordAuditFailure` against a real migrated `:memory:` DB: `<base>-failed` event, NULL score/grade/hash, tier and reason stored, file names sanitised but URLs left intact (clamped at 512), an out-of-set reason degrades to `internal`, the other writers leave `reason` NULL, and an insert failure never throws. |
| `auditFailureWiring.test.ts` | N | THE WIRING: `/analyze`, `/analyze-url`, `/audit-url`, `runUrlAudit` (fetch failures) and `/bulk-from-inventory` (per entry) each call `recordAuditFailure` with their own event type and the classified reason; 503 records nothing. |
| `errorHandler.test.ts` | N | The extracted global error handler: a 4xx (incl. multer's 413) logs one line with status/code/method/path and nothing about the caller; a 5xx keeps the full error; responses are unchanged. |
| `dataDir.test.ts` | N | `defaultDataDir` derives from `DB_PATH` exactly as `db/sqlite.ts` does, and `status.ts` re-exports the same function. |
| `activityDays.test.ts` | N | Local-day arithmetic for the export: days cut at Chicago midnight in CDT and CST, both 2026 DST transitions, calendar math across month/year/leap boundaries, the export window (grace + cutoff), and the `activity-YYYY-MM-DD.csv` name codec that recognises nothing else. |
| `activityCsv.test.ts` | N | The CSV: the ten-column allow-list, RFC 4180 quoting, the formula-injection guard for every trigger character, BOM + LF, the policy's tier vocabulary, a hostile filename round-tripping through a parser with exactly ten fields. |
| `activityExport.test.ts` | N | The runner against a real DB + temp dir: writes every complete day in the window and nothing outside it, header-only empty days, idempotent, never rewrites, prunes only matching names at/before the cutoff, atomic tmp+rename with 0600/0700, stale tmp overwritten, fails loudly on a blocked directory or unknown zone. |
| `errorLog.test.ts` | N | The stderr tee behind `logs/errors-YYYY-MM-DD.log`: entries carry the UTC timestamp, level and the `util.format` text (stacks included); the original console call still runs; a new local day opens a new file; the per-day byte cap writes one notice and stops; an unwritable directory never throws and notifies stderr once; `uninstall()` restores the console; pruning deletes only `errors-*.log` at/before the cutoff. |
| `activityLogsPolicyConformance.test.ts` | N | The data-retention page pinned to the code: § 7's windows equal `SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS` and `ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS`, § 7/§ 8 name `ACTIVITY_EXPORT.DIR_NAME`, § 8's reason list is exactly `AUDIT_FAILURE_REASONS`. |
| `activityExportWiring.test.ts` | N | `runCleanup()` really runs step 8 against `<dataDir>/activity`, reports `activityFilesWritten`/`activityFilesPruned`, and captures a failing export under step `activityExport` without blocking the other steps. |
```

Web table:

```markdown
| `activityExportPolicy.test.ts` | N | Policy v1.12: § 7's activity-files row (usage-log window, on-server, outside backups, one shared setting) and the eight-task sweep paragraph; § 8's failed-audit bullet names the closed reason set and "never the error text"; § 8a shows the migration-13 schema with `reason TEXT`; § 14's v1.12 entry matches the header; the new copy never overclaims. |
```

Also update: the `### API Tests (N tests)` and `### Web Tests (N tests)` heading counts, the row for `status.test.ts` (append "; failed-audit rows are invisible to every count; local time from `DEPLOY.LOCAL_TIME_ZONE`") and for `audit-url-page.test.ts` (append "; failed page audits recorded, expected failures log one line").

- [ ] **Step 4: Format check**

Run: `pnpm exec prettier --write README.md docs/activity-export.md docs/process-supervision.md && pnpm format:check`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add docs/activity-export.md docs/process-supervision.md README.md
git commit -m "docs: activity-export runbook, pm2-logrotate gzip correction, README activity export + test tables"
```

---

### Task 13: Release v1.88.0 (spec § 7)

**Files:**
- Modify: `CHANGELOG.md` (prepend under the intro)
- Modify: `package.json`, `apps/api/package.json`, `apps/web/package.json`, `apps/cli/package.json`, `packages/shared/package.json`, `packages/analyzer/package.json` (`"version": "1.87.1"` → `"1.88.0"`)
- Modify: `README.md` (`## Security` — prepend a `### v1.88.0` entry above `### v1.87.1`)
- Modify: `apps/web/app/data/securityAudits.ts` (prepend an entry to `SECURITY_AUDIT_ENTRIES`)
- Modify: `audit.config.ts` (`ANNOUNCEMENTS` — prepend an entry)

**Interfaces:** none.

- [ ] **Step 1: Versions**

Run: `sed -i '' 's/"version": "1.87.1"/"version": "1.88.0"/' package.json apps/api/package.json apps/web/package.json apps/cli/package.json packages/shared/package.json packages/analyzer/package.json && grep -n '"version"' package.json apps/*/package.json packages/*/package.json`
Expected: six lines, all `1.88.0`.

- [ ] **Step 2: CHANGELOG**

Insert after the intro paragraph (before `## [1.87.1]`):

```markdown
## [1.88.0] - 2026-08-22

### Added

- **Failed audits are recorded.** An audit the tool attempted and could not complete now leaves an `audit_log` row of its own — `analyze-failed`, `analyze-url-failed`, `audit-url-failed`, `audit-url-page-failed` or `bulk-from-inventory-failed` — with the same fields as a successful audit, NULL score/grade/content hash, and a one-word `reason` from a closed set: `unreadable`, `timeout`, `fetch-failed`, `navigation-failed`, `internal` (migration 13 → `user_version` 13). Never the error text. Capacity (503) and refusals are not failures and record nothing. The new event types sit outside every counting allow-list, so `/status` figures are unchanged — pinned by test.
- **Daily activity export.** The retention sweep (step 8) writes one CSV per complete America/Chicago calendar day of the `audit_log` table to `logs/activity-YYYY-MM-DD.csv` at the repository root on the server (`ACTIVITY_LOG_DIR` overrides), derived from the database, kept for the usage log's own 365 days (`SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS` — no second setting), pruned by file-name date, not in backups, not served. Columns `id, timestamp_utc, timestamp_chicago, event, filename, score, grade, content_hash, tier, reason`; RFC 4180 quoting, formula-injection guard, UTF-8 BOM, LF. The first sweep after deploy materialises the whole window; a missed midnight heals itself; a complete day's file is never rewritten. Runbook: `docs/activity-export.md`.

- **Application error log.** The API process tees everything it writes to stderr (`console.error`/`console.warn`, `util.format`-ed, stacks included) into `logs/errors-YYYY-MM-DD.log` — installed at startup, PM2's stream unchanged — so an unexpected error can be diagnosed from the same directory the activity files live in, without `~/.pm2/logs` and its 14-day rotation. Kept 30 days (`ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS`), pruned by the sweep; a day's file stops at 50 MB with a final notice so a crash loop cannot fill the disk; a write failure never throws. Holds what stderr holds — no IP, token, user agent or body is ever written there (tested for every app-written line).
- **The policy is pinned to the code.** `activityLogsPolicyConformance.test.ts` reads the data-retention sections and fails if their retention windows, directory name or reason list differ from the constants the sweep and writers use.

### Changed

- **Two log-noise trims.** A classified page-audit navigation failure or timeout (a fleet page URL that is really a download — 315 identical stack traces on 2026-08-19) now logs one line; the global error handler logs a 4xx (incl. the 413 "too large") as one line and keeps the stack for 5xx only. The handler moved to `middleware/errorHandler.ts` so it is tested. No response changed.
- `DEPLOY.LOCAL_TIME_ZONE` (`America/Chicago`) is now the one place the human-facing time zone lives; `/status`'s `*_chicago` fields read it. `defaultDataDir` and `sqliteUtcToIso` moved to their own modules (re-exported from `services/status.ts`).
- Data-retention policy → **v1.12**: § 7 row + sweep paragraph, § 8 bullets, § 8a schema (migration 13), § 14 entry.
- `docs/process-supervision.md` no longer promises gzipped PM2 logs: `pm2-logrotate` 3.0.0's `compress true` is ineffective (the module's `parseBool` accepts only the string `'true'`; pmx casts the stored value to a boolean). Rotated files are plain `.log`; the 14-file retention is what bounds the disk.

### Notes

- **No new surface.** No route was added or changed; nothing reads the activity files but the operator on the server.
- **Privacy.** Failure rows and activity files carry exactly the usage log's fields. No IP, token, user agent or body is written anywhere new; the one-line log formats are tested for it. The file name remains the one field that can carry personal information, and the policy says so.
- Tests: API +N / web +N (fill from the release run) → totals API N · web N · CLI 49.
```

- [ ] **Step 3: README § Security entry**

Insert above `### v1.87.1 — 2026-08-21 …`:

```markdown
### v1.88.0 — 2026-08-22 · Failed audits recorded; daily activity export on the server (feature + ops, not a vulnerability fix)

Adds an auditor-facing record rather than fixing a flaw. An audit the tool attempted and could not complete now leaves its own `audit_log` row (`<type>-failed`, NULL score/grade/hash, a one-word reason from a closed set — never error text; migration 13), and the retention sweep writes one derived CSV per Chicago calendar day of that table to `logs/` at the application root on the server: the usage log's own fields and 365-day window, pruned by file-name date, not in backups, **not served by any route**. Reviewed for what it adds to the attack surface and to retention: no new route or parameter; the CSV writer quotes per RFC 4180 and neutralises formula injection (managers open these in Excel); files are `0600` in a `0700` directory owned by the service user; pruning deletes only names of the exact shape it writes. The new event types sit outside every `/status` counting allow-list, pinned by test. Two log-noise trims (page-audit navigation failures and 4xx responses log one line) write nothing that carries an IP, token, user agent or body — also pinned. Data-retention policy v1.12 describes both additions; the file name stays the one field that can carry personal information, and the policy says so. Also recorded: `pm2-logrotate` 3.0.0's compression setting is ineffective (documented, not worked around). The same release adds an application error log — a tee of the service's own stderr into `logs/errors-YYYY-MM-DD.log`, 30 days, 50 MB/day cap — reviewed on the same terms: it holds exactly what stderr already held (no IP, token, user agent or body; file names, page addresses and library paths can appear, as the policy states), on the same server, never served; and a conformance test pins the policy page's retention windows, directory and reason list to the code's constants. Tests 2,431 → 2,530.
```

- [ ] **Step 4: § 10 entry**

Prepend to `SECURITY_AUDIT_ENTRIES` in `apps/web/app/data/securityAudits.ts`:

```ts
  {
    version: "v1.88.0",
    meta: "Reviewed <strong>2026-08-22</strong> · scope: a new record of failed audits in the usage-metadata table, and a daily file of that table written on the server for auditors. No new way to reach the service; one new column; no retention period changed.",
    body: [
      {
        kind: "p",
        html: "Two additions for the people who review this service rather than use it. An audit the tool attempted and could not complete is now recorded like any other audit &mdash; same fields, no score or grade, and a one-word reason that is never the error text. And each night the server writes the previous day&rsquo;s usage-metadata rows to a file on its own disk, so a day can be reviewed without querying the database. The data-retention policy is at v1.12 to describe both.",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "New",
            html: "<strong>Failed audits are recorded with a fixed reason.</strong> One column was added (<code>audit_log.reason</code>, migration 13) holding one of five codes: unreadable, timeout, fetch-failed, navigation-failed, internal. Error messages, which can embed a file name, an address or a library path, are never stored. Failure rows carry no content hash, so they can never satisfy the check that gates remediation behind a prior audit.",
          },
          {
            badge: "New",
            html: "<strong>A daily activity file, on the server only.</strong> One CSV per calendar day, derived from the usage-metadata table, kept for the same 365 days and deleted on the same schedule &mdash; there is no separate setting to drift. Nothing on the site serves these files; they are readable only by the service&rsquo;s own account on the server, and they are not part of the nightly backup. The writer quotes every field and neutralises spreadsheet formula injection, because a file name is user-chosen and the files are meant to be opened in Excel.",
          },
          {
            badge: "New",
            html: "<strong>An application error log, on the server only.</strong> The service now keeps a copy of its own error output &mdash; the error message and stack trace for each fault &mdash; as one file per day beside the activity files, for 30 days, so an unexpected error can be diagnosed quickly. It holds exactly what the process already wrote to its error stream: never an address, a token or a browser identifier; a file name or page address can appear, and the policy says so. A day&rsquo;s file stops growing at a fixed size, so a malfunction cannot fill the disk.",
          },
          {
            badge: "Hardened",
            html: "<strong>Quieter, safer logs.</strong> Two expected conditions that used to log a full stack trace each time &mdash; a page audit whose address turns out to be a download, and an over-sized upload &mdash; now log one line. Neither line carries an address, a token, a browser identifier or a request body; a test fails the build if one ever does.",
          },
          {
            badge: "Note",
            html: "<strong>Data-retention policy updated to v1.12.</strong> Section 7 lists the activity files and their window; section 8 says what a failed-audit row holds; section 8a shows the new column; the file name remains the one field that can carry personal information, and the policy continues to say so rather than claim otherwise.",
          },
        ],
      },
    ],
  },
```

- [ ] **Step 5: What's New entry**

Prepend to `ANNOUNCEMENTS` in `audit.config.ts`:

```ts
  {
    id: "activity-export-and-failed-audits-2026-08-22",
    badge: "Improved",
    text: "The service now keeps a daily record of what it did, on its own server, for the people who audit it. Each night the previous day's usage records — which documents and pages were checked, with what result — are written to one file, kept for the same 365 days as the records themselves and then deleted. Audits that could not be completed are now recorded too, with a one-word reason and never the error text. The service also keeps its own error log for 30 days so a fault can be diagnosed quickly. These records hold the same fields the usage record always has — nothing about who made a request — and nothing is downloadable from this site; the data-retention policy (now v1.12) describes exactly what they hold.",
    linkText: "Read the data-retention policy",
    linkTo: "/data-retention",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 22, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
```

- [ ] **Step 6: Full verification, from the repo root**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

Expected: every command exits 0 (gate on each `&&`; never pipe into `tail`/`grep`). `securityAudits.test.ts` now requires — and finds — both the § 10 entry and the README § Security entry for 1.88.0. Read the test summary and put the real totals into CHANGELOG's Notes line and README's `### API Tests (N tests)` / `### Web Tests (N tests)` headings and the `N` cells added in Task 12; re-run `pnpm format:check` after editing.

- [ ] **Step 7: Commit, tag, push, watch CI**

```bash
git add -A
git commit -m "release: v1.88.0 — failed audits recorded with a reason; daily activity export on the server; policy v1.12"
git tag -a v1.88.0 -m "v1.88.0 — failed audits recorded; daily activity export; data-retention policy v1.12"
git push origin main --follow-tags
gh run list --branch main --workflow CI --limit 3
```

Watch the CI run to green (`gh run watch <id>`), then hand over: the user deploys from Forge. After deploy, the verification in spec § 7: `ls -la logs | tail` (from the checkout root), `pm2 logs file-audit-api --lines 20` (the sweep ran at startup), and open one day's file.

---

---

### Task 14: Application error log — `logs/errors-YYYY-MM-DD.log` (spec § 2.6). **Execute after Task 10 and before Task 11.**

**Files:**
- Modify: `audit.config.ts` (`ACTIVITY_EXPORT` gains three constants)
- Create: `apps/api/src/services/errorLog.ts`
- Modify: `apps/api/src/index.ts` (install the tee first thing; imports)
- Modify: `apps/api/src/services/remediationCleanup.ts` (step 8 also prunes error logs; `CleanupResult.errorLogFilesPruned`)
- Test: `apps/api/src/__tests__/errorLog.test.ts`; extend `apps/api/src/__tests__/activityExportWiring.test.ts`

**Interfaces:**
- Consumes: `datedFileName`, `parseDatedFileName`, `localDate` (Task 7); `activityLogDir` (Task 6); `ACTIVITY_EXPORT`, `DEPLOY` (config).
- Produces: `ACTIVITY_EXPORT.ERROR_FILE_PREFIX = "errors-"`, `ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS = 30`, `ACTIVITY_EXPORT.ERROR_LOG_MAX_BYTES_PER_DAY = 50 * 1024 * 1024`; `errorLogFileName(day)`, `parseErrorLogFileName(name)`, `formatErrorLogEntry(level, args, nowMs)`, `installErrorLogTee(opts): ErrorLogTee` (`{ uninstall(), currentFile() }`), `pruneErrorLogs(dir, nowMs, retentionDays, timeZone): number`; `CleanupResult.errorLogFilesPruned: number`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/__tests__/errorLog.test.ts
/**
 * The application error log (v1.88.0): a tee of console.error/console.warn into
 * logs/errors-YYYY-MM-DD.log so a fault can be diagnosed from the same directory
 * the activity files live in. The original console call must still run (PM2's
 * stream is unchanged), nothing here may ever throw, a day's file is size-capped,
 * and pruning touches only the files this module writes.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  errorLogFileName,
  formatErrorLogEntry,
  installErrorLogTee,
  parseErrorLogFileName,
  pruneErrorLogs,
  type ErrorLogTee,
} from "../services/errorLog.js";

const TZ = "America/Chicago";
const T_AUG19 = Date.UTC(2026, 7, 19, 14, 3, 22); // 09:03:22 CDT Aug 19
let dir = ""; // set by fresh() / the prune test; empty for describes that never touch disk
let tee: ErrorLogTee | null = null;
const realError = console.error;
const realWarn = console.warn;

afterEach(() => {
  tee?.uninstall();
  tee = null;
  console.error = realError;
  console.warn = realWarn;
  if (dir) rmSync(join(dir, ".."), { recursive: true, force: true });
  dir = "";
});

function fresh(opts: { now?: () => number; maxBytesPerDay?: number } = {}) {
  dir = join(mkdtempSync(join(tmpdir(), "error-log-")), "logs");
  const calls: unknown[][] = [];
  console.error = (...a: unknown[]) => {
    calls.push(["error", ...a]);
  };
  console.warn = (...a: unknown[]) => {
    calls.push(["warn", ...a]);
  };
  tee = installErrorLogTee({
    dir,
    timeZone: TZ,
    maxBytesPerDay: opts.maxBytesPerDay ?? 50 * 1024 * 1024,
    now: opts.now ?? (() => T_AUG19),
  });
  return { calls };
}

describe("file names", () => {
  it("encode and parse errors-YYYY-MM-DD.log and nothing else", () => {
    expect(errorLogFileName("2026-08-19")).toBe("errors-2026-08-19.log");
    expect(parseErrorLogFileName("errors-2026-08-19.log")).toBe("2026-08-19");
    expect(parseErrorLogFileName("errors-2026-08-19.log.gz")).toBeNull();
    expect(parseErrorLogFileName("activity-2026-08-19.csv")).toBeNull();
  });
});

describe("formatErrorLogEntry", () => {
  it("prefixes the UTC timestamp and level and prints an Error's stack like the console does", () => {
    const entry = formatErrorLogEntry("error", ["audit-url error:", new Error("boom")], T_AUG19);
    expect(entry.startsWith("2026-08-19T14:03:22Z [error] audit-url error: Error: boom\n    at ")).toBe(true);
    expect(entry.endsWith("\n")).toBe(true);
    expect(formatErrorLogEntry("warn", ["[rate-limit] 429 limiter=%s", "global"], T_AUG19)).toBe(
      "2026-08-19T14:03:22Z [warn] [rate-limit] 429 limiter=global\n",
    );
  });
});

describe("installErrorLogTee", () => {
  it("tees error and warn into the day's file and still calls the original console", () => {
    const { calls } = fresh();
    console.error("Analysis error:", new Error("PDF parsing failed"));
    console.warn("[api] 413 LIMIT_FILE_SIZE POST /api/analyze");
    const text = readFileSync(join(dir, "errors-2026-08-19.log"), "utf8");
    expect(text).toContain("2026-08-19T14:03:22Z [error] Analysis error: Error: PDF parsing failed\n    at ");
    expect(text).toContain("2026-08-19T14:03:22Z [warn] [api] 413 LIMIT_FILE_SIZE POST /api/analyze\n");
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe("error");
    expect(calls[1][0]).toBe("warn");
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, "errors-2026-08-19.log")).mode & 0o777).toBe(0o600);
  });

  it("opens a new file when the LOCAL day changes", () => {
    let now = Date.UTC(2026, 7, 20, 4, 59, 59); // 23:59:59 CDT Aug 19
    fresh({ now: () => now });
    console.error("late");
    now = Date.UTC(2026, 7, 20, 5, 0, 0); // 00:00:00 CDT Aug 20
    console.error("early");
    expect(readFileSync(join(dir, "errors-2026-08-19.log"), "utf8")).toContain("[error] late");
    expect(readFileSync(join(dir, "errors-2026-08-20.log"), "utf8")).toContain("[error] early");
    expect(tee!.currentFile()).toBe(join(dir, "errors-2026-08-20.log"));
  });

  it("stops at the per-day byte cap after one notice, and resumes the next day", () => {
    let now = T_AUG19;
    // "one"/"two" entries are 33 bytes each: after "one" the file holds 33;
    // "two" would make 66 > 60, so the notice is written and the tee goes off
    // for the day; "three" is never written.
    const { calls } = fresh({ now: () => now, maxBytesPerDay: 60 });
    console.error("one");
    console.error("two");
    console.error("three");
    const text = readFileSync(join(dir, "errors-2026-08-19.log"), "utf8");
    expect(text).toContain("[error] one");
    expect(text).toContain("[error-log] daily size limit reached; further entries go to stderr only");
    expect(text).not.toContain("[error] two");
    expect(text).not.toContain("[error] three");
    expect(calls).toHaveLength(3); // stderr still got every call
    now = Date.UTC(2026, 7, 20, 12, 0, 0);
    console.error("next day");
    expect(readFileSync(join(dir, "errors-2026-08-20.log"), "utf8")).toContain("[error] next day");
  });

  it("never throws when the directory cannot be written — it notifies stderr once and stays off for the day", () => {
    const { calls } = fresh();
    rmSync(dir, { recursive: true, force: true });
    writeFileSync(dir, "a file where the directory should be");
    expect(() => console.error("first")).not.toThrow();
    expect(() => console.error("second")).not.toThrow();
    const notices = calls.filter((c) => String(c[1]).startsWith("[error-log] cannot write"));
    expect(notices).toHaveLength(1);
    expect(calls.filter((c) => c[1] === "first" || c[1] === "second")).toHaveLength(2);
  });

  it("uninstall restores the console", () => {
    fresh();
    const wrapped = console.error;
    tee!.uninstall();
    expect(console.error).not.toBe(wrapped);
    console.error("after");
    expect(existsSync(join(dir, "errors-2026-08-19.log"))).toBe(false);
    tee = null;
  });
});

describe("pruneErrorLogs", () => {
  it("deletes only errors-*.log dated at or before the cutoff day", () => {
    dir = join(mkdtempSync(join(tmpdir(), "error-log-prune-")), "logs");
    rmSync(dir, { recursive: true, force: true });
    expect(pruneErrorLogs(dir, T_AUG19, 30, TZ)).toBe(0); // missing dir is fine
    mkdirSync(dir, { recursive: true });
    const mk = (name: string) => writeFileSync(join(dir, name), "x");
    mk("errors-2026-07-19.log"); // 31 days before Aug 19 → pruned
    mk("errors-2026-07-20.log"); // cutoff day itself → pruned
    mk("errors-2026-07-21.log"); // inside the window → kept
    mk("activity-2026-07-01.csv"); // another module's file → untouched
    mk("errors-2026-07-19.log.gz"); // not our shape → untouched
    expect(pruneErrorLogs(dir, T_AUG19, 30, TZ)).toBe(2);
    expect(readdirSync(dir).sort()).toEqual([
      "activity-2026-07-01.csv",
      "errors-2026-07-19.log.gz",
      "errors-2026-07-21.log",
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api exec vitest run src/__tests__/errorLog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Config constants**

In `audit.config.ts`, inside `ACTIVITY_EXPORT` after `GRACE_MINUTES: 5,`:

```ts

  /**
   * The application error log (v1.88.0): `<prefix>YYYY-MM-DD.log` in the same
   * directory — a tee of everything the API process writes to stderr, so an
   * unexpected error can be diagnosed from logs/ without PM2. Same pruning
   * mechanism as the activity files: exact shape only.
   */
  ERROR_FILE_PREFIX: "errors-",

  /**
   * Days of error-log files to keep. Diagnostics, not the auditor record — the
   * activity CSV keeps each failure's one-word reason for the usage log's 365
   * days. 30 covers "the site misbehaved last week" with room to spare.
   * Coordinate with the data-retention page § 7 row (pinned by
   * activityLogsPolicyConformance.test.ts). SAFE TO CHANGE: Yes.
   */
  ERROR_LOG_RETENTION_DAYS: 30,

  /**
   * Bytes after which a day's error-log file stops growing (one final notice
   * is written). A crash loop writing the same stack thousands of times must
   * not be what fills the disk; stderr (PM2, with its own rotation) still gets
   * every line. SAFE TO CHANGE: Yes.
   */
  ERROR_LOG_MAX_BYTES_PER_DAY: 50 * 1024 * 1024,
```

- [ ] **Step 4: The module**

```ts
// apps/api/src/services/errorLog.ts
/**
 * Application error log (v1.88.0): logs/errors-YYYY-MM-DD.log.
 *
 * A TEE, not a logger. Every unexpected error the service knows about already
 * reaches console.error — the route catch blocks, the global handler's 5xx
 * path, the sweep's error list, the unhandledRejection / uncaughtException
 * hooks, engine failures — so wrapping console.error and console.warn once at
 * startup captures all of them with zero call-site changes and cannot miss a
 * new one. The original call runs first: PM2's stderr stream and `pm2 logs`
 * are unchanged; this file is the copy that is easy to find and outlives PM2's
 * rotation.
 *
 * Contracts (errorLog.test.ts):
 *   - entry = "<ISO UTC seconds> [error|warn] <util.format(args)>\n" — exactly
 *     what the terminal shows, an Error's stack included;
 *   - one file per LOCAL (DEPLOY.LOCAL_TIME_ZONE) day, 0600 in a 0700 dir;
 *   - a day's file stops at maxBytesPerDay after one notice line;
 *   - nothing here ever throws: a write failure notifies stderr once (via the
 *     ORIGINAL console.error, never the wrapper) and disables the tee for the
 *     rest of that day;
 *   - pruneErrorLogs deletes only `errors-YYYY-MM-DD.log` at/before the cutoff.
 *
 * Privacy: the file holds what stderr holds. The service writes no IP, token,
 * user agent or request body to stderr (rateLimiter.test.ts, errorHandler.test.ts,
 * audit-url-page.test.ts pin the app-written lines).
 */
import { appendFileSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { format } from "node:util";
import { ACTIVITY_EXPORT } from "#config";
import { datedFileName, localDate, parseDatedFileName } from "./activityDays.js";

export type ErrorLogLevel = "error" | "warn";

export interface ErrorLogOptions {
  /** Directory for the files; created 0700 if missing. */
  dir: string;
  timeZone: string;
  maxBytesPerDay: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface ErrorLogTee {
  /** Restore console.error / console.warn. */
  uninstall(): void;
  /** The file entries go to right now. */
  currentFile(): string;
}

const LIMIT_NOTICE = "[error-log] daily size limit reached; further entries go to stderr only";

export function errorLogFileName(day: string): string {
  return datedFileName(ACTIVITY_EXPORT.ERROR_FILE_PREFIX, day, ".log");
}

export function parseErrorLogFileName(name: string): string | null {
  return parseDatedFileName(name, ACTIVITY_EXPORT.ERROR_FILE_PREFIX, ".log");
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function formatErrorLogEntry(level: ErrorLogLevel, args: unknown[], nowMs: number): string {
  return `${stamp(nowMs)} [${level}] ${format(...(args as [unknown, ...unknown[]]))}\n`;
}

export function installErrorLogTee(opts: ErrorLogOptions): ErrorLogTee {
  const now = opts.now ?? Date.now;
  const original = { error: console.error, warn: console.warn };
  let day = "";
  let bytes = 0;
  /** The local day on which the tee gave up (cap reached or write failed). */
  let offForDay = "";

  const fileFor = (d: string) => join(opts.dir, errorLogFileName(d));

  function rollover(d: string): void {
    day = d;
    try {
      bytes = statSync(fileFor(d)).size;
    } catch {
      bytes = 0;
    }
  }

  /** Append, never throw. On failure: one notice via the ORIGINAL console.error
   *  (the wrapper would recurse) and off for the rest of the day. */
  function append(d: string, text: string): boolean {
    try {
      mkdirSync(opts.dir, { recursive: true, mode: 0o700 });
      appendFileSync(fileFor(d), text, { encoding: "utf8", mode: 0o600 });
      bytes += Buffer.byteLength(text);
      return true;
    } catch (e) {
      offForDay = d;
      original.error(
        `[error-log] cannot write ${fileFor(d)}: ${(e as Error).message} — stderr only for the rest of the day`,
      );
      return false;
    }
  }

  function tee(level: ErrorLogLevel, args: unknown[]): void {
    try {
      const ms = now();
      const d = localDate(ms, opts.timeZone);
      if (d !== day) rollover(d);
      if (offForDay === d) return;
      const entry = formatErrorLogEntry(level, args, ms);
      if (bytes + Buffer.byteLength(entry) > opts.maxBytesPerDay) {
        append(d, `${stamp(ms)} ${LIMIT_NOTICE}\n`);
        offForDay = d;
        return;
      }
      append(d, entry);
    } catch {
      // The original console call has already run; a tee failure is never a
      // caller's problem.
    }
  }

  console.error = (...args: unknown[]) => {
    original.error(...args);
    tee("error", args);
  };
  console.warn = (...args: unknown[]) => {
    original.warn(...args);
    tee("warn", args);
  };

  return {
    uninstall() {
      console.error = original.error;
      console.warn = original.warn;
    },
    currentFile() {
      return fileFor(day || localDate(now(), opts.timeZone));
    },
  };
}

/** Delete `errors-YYYY-MM-DD.log` files dated at or before the cutoff day.
 *  Touches nothing else; a missing directory is simply nothing to prune. */
export function pruneErrorLogs(
  dir: string,
  nowMs: number,
  retentionDays: number,
  timeZone: string,
): number {
  const cutoffDay = localDate(nowMs - retentionDays * 86_400_000, timeZone);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  let pruned = 0;
  for (const name of names) {
    const d = parseErrorLogFileName(name);
    if (d !== null && d <= cutoffDay) {
      rmSync(join(dir, name), { force: true });
      pruned++;
    }
  }
  return pruned;
}
```

- [ ] **Step 5: Install at startup and prune in the sweep**

`apps/api/src/index.ts` — add, immediately after the imports and BEFORE `const app = express();` (nothing may log before the tee exists):

```ts
// First thing: tee stderr into logs/errors-YYYY-MM-DD.log (v1.88.0), so an
// unexpected error can be diagnosed from the same directory as the activity
// files. The original console call still runs — PM2's stream is unchanged.
installErrorLogTee({
  dir: activityLogDir(),
  timeZone: DEPLOY.LOCAL_TIME_ZONE,
  maxBytesPerDay: ACTIVITY_EXPORT.ERROR_LOG_MAX_BYTES_PER_DAY,
});
```

with `import { installErrorLogTee } from "./services/errorLog.js";`, `import { activityLogDir } from "./services/dataDir.js";`, and `ACTIVITY_EXPORT` added to the `#config` import (keep `DEPLOY`, already imported).

`apps/api/src/services/remediationCleanup.ts` — `CleanupResult` gains `/** v1.88.0: error-log files pruned by step 8. */ errorLogFilesPruned: number;` (init `0`); inside step 8's `try`, after `result.activityFilesPruned = r.pruned;`:

```ts
    result.errorLogFilesPruned = pruneErrorLogs(
      activityLogDir(),
      now,
      ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS,
      DEPLOY.LOCAL_TIME_ZONE,
    );
```

with `import { pruneErrorLogs } from "./errorLog.js";`. Update the header comment's step 8 line to "…and prune activity files past AUDIT_LOG_RETENTION_DAYS and error-log files past ERROR_LOG_RETENTION_DAYS".

Extend `apps/api/src/__tests__/activityExportWiring.test.ts` with one test in the same describe (before the failing-export test):

```ts
  it("prunes old error-log files in the same step and reports it", async () => {
    writeFileSync(join(LOG_DIR, "errors-2025-01-01.log"), "ancient");
    writeFileSync(join(LOG_DIR, "errors-2099-01-01.log"), "future — kept");
    const result = await cleanup.runCleanup();
    expect(result.errorLogFilesPruned).toBe(1);
    expect(readdirSync(LOG_DIR)).toContain("errors-2099-01-01.log");
    expect(readdirSync(LOG_DIR)).not.toContain("errors-2025-01-01.log");
    rmSync(join(LOG_DIR, "errors-2099-01-01.log"), { force: true });
  });
```

- [ ] **Step 6: Run the tests, typecheck, lint**

Run: `pnpm --filter api exec vitest run src/__tests__/errorLog.test.ts src/__tests__/activityExportWiring.test.ts src/__tests__/activityDays.test.ts && pnpm --filter api exec tsc --noEmit && pnpm --filter api exec eslint src`
Expected: PASS, zero type errors, lint clean. Then `pnpm --filter api test` once.

- [ ] **Step 7: Commit**

```bash
git add audit.config.ts apps/api/src/services/errorLog.ts apps/api/src/index.ts apps/api/src/services/remediationCleanup.ts apps/api/src/__tests__/errorLog.test.ts apps/api/src/__tests__/activityExportWiring.test.ts
git commit -m "feat(api): application error log — stderr teed into logs/errors-YYYY-MM-DD.log, 30-day prune, per-day size cap"
```

## Self-review (done while writing)

- **Execution order:** 1–10, then 14, then 11–13 (the policy task cross-checks Task 14's constants).
- **Spec coverage:** § 2.6 → T14 (+ T11/T12/T13 copy); § 1.1 → T1/T3; § 1.2 → T1; § 1.3 → T3; § 1.4 → T2; § 1.5/§ 1.6 → T4; § 2.1 → T1/T6/T10; § 2.2 → T7; § 2.3/§ 3 → T8; § 2.4/§ 2.5 → T9/T10; § 4 → T4 (page route) + T5 (handler); § 5 → T11/T12/T13; § 6 → each task's tests; § 7 → T13; § 8/§ 9 → runbook (T12) and the thrown-error tests (T9/T10).
- **Placeholders:** the only open values are test COUNTS, which come from the suite runs in T10/T11/T13 by instruction.
- **Type consistency:** `recordAuditFailure({ eventType, privileged, filename, reason })` is used identically in T3/T4 and its tests; `runActivityExport` options match between T9 and T10; `CleanupResult.activityFilesWritten/Pruned` match T10's test; `RunUrlAuditInput.eventType` matches T4's pipeline test; `ACTIVITY_CSV_COLUMNS`/`CSV_BOM` names match between T8 and T9's test.
