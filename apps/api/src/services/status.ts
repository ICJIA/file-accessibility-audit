// Backing service for the public status document at GET /api/status, which
// the Nitro tier re-serves at https://audit.icjia.app/status.
//
// Design: docs/superpowers/specs/2026-08-03-public-status-endpoint-design.md
//
// THE ENDPOINT IS PUBLIC AND UNAUTHENTICATED. Two rules govern everything
// below, and statusPrivacy.test.ts fails the build if either is broken:
//
//   1. Only aggregates leave this module. Every figure is a COUNT(*). No
//      filename, email, IP address, or user-agent is ever serialized —
//      filenames are read *inside SQLite* by the by-format CASE expression
//      and never cross the boundary.
//   2. No filesystem paths, ever. Not VERAPDF_PATH, not the qpdf binary, not
//      a temp directory. Subprocess stderr routinely embeds absolute paths,
//      so probe failures collapse to a fixed reason enum and the real error
//      is logged server-side only. v1.38.0 fixed a veraPDF path-disclosure
//      bug; this endpoint must not reintroduce it.
//
// Everything is dependency-injected (clock, database, probes) so the whole
// payload can be built in tests without a live database, an installed engine,
// or real elapsed time.

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REMEDIATION, STATUS } from "#config";
import { QPDF_BIN } from "./qpdfService.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Why a probe failed. A closed set — never a raw error string, which would
 *  leak paths. The underlying error is logged server-side instead. */
export type ProbeFailureReason = "not_configured" | "not_executable" | "timeout" | "error";

export interface EngineResult {
  ok: boolean;
  /** Engine version, when the probe could determine one. Omitted on failure. */
  version?: string;
  /** Present only when ok === false. */
  reason?: ProbeFailureReason;
}

/** Audited documents by format.
 *
 *  `unknown_extension` was called `other` until v1.47.0. It is a DIFFERENT
 *  thing from RejectedFormatCounts.other and the shared name made the status
 *  page genuinely confusing: this one means "we audited the file, but its
 *  filename carried no extension we recognize" — a URL audit whose path is
 *  `download?id=123` sniffs as a real PDF and is audited normally, it just
 *  cannot be classified by name. It is near-always zero and exists so the
 *  format split always sums to the document total. */
export interface FormatCounts {
  pdf: number;
  docx: number;
  pptx: number;
  xlsx: number;
  unknown_extension: number;
}

/** Letter-grade distribution over a time window.
 *
 *  `ungraded` is NOT optional and must never be dropped: audit_log.grade is
 *  nullable (failed audits, and rows predating the column), so silently
 *  omitting those rows would make the distribution fail to sum to the
 *  `last_24h` / `last_30d` / `total` figure printed beside it — two numbers on
 *  one page that don't reconcile, which reads as a bug. Pinned by test. */
export interface GradeCounts {
  A: number;
  B: number;
  C: number;
  D: number;
  F: number;
  ungraded: number;
}

export interface DocumentCounts {
  last_24h: number;
  last_30d: number;
  total: number;
  by_format_30d: FormatCounts;
  by_format_total: FormatCounts;
  by_grade_24h: GradeCounts;
  by_grade_30d: GradeCounts;
  by_grade_total: GradeCounts;
}

/** Refused uploads, split by what was offered.
 *
 *  `other` is the catch-all and, unlike FormatCounts.unknown_extension, it is
 *  genuinely populated: it covers unrelated types (.jpg, .zip) and files whose
 *  extension lies — a .doc renamed to .docx is caught by content detection but
 *  buckets by its stated extension, since that is all the SQL can see.
 *
 *  The two are distinct on purpose. This one means "refused, and not one of
 *  the named unauditable formats"; FormatCounts.unknown_extension means
 *  "audited fine, but unclassifiable by filename". Sharing the name `other`
 *  is what made the status page confusing before v1.47.0. */
export interface RejectedFormatCounts {
  doc: number;
  xls: number;
  ppt: number;
  rtf: number;
  csv: number;
  other: number;
}

export interface RejectedCounts {
  last_24h: number;
  last_30d: number;
  total: number;
  by_format_30d: RejectedFormatCounts;
  by_format_total: RejectedFormatCounts;
}

export interface StatusPayload {
  status: "ok" | "degraded";
  degraded?: string[];
  version: string;
  uptime_seconds: number;
  uptime: string;
  checked_at: string;
  checked_at_chicago: string | null;
  database: "ok" | "down";
  engines: {
    checked_at: string;
    qpdf: EngineResult;
    verapdf: EngineResult;
    chromium: EngineResult;
  };
  documents_audited: DocumentCounts;
  /** Uploads the tool refused. Deliberately a sibling of documents_audited
   *  rather than a bucket inside it — a refusal has no score and no grade, so
   *  folding it in would inflate the audit count and dump every refusal into
   *  the grade distribution's 'ungraded' bucket. */
  documents_rejected: RejectedCounts;
  last_audit_at: string | null;
  /** Same instant as last_audit_at, rendered in America/Chicago — the local
   *  zone of the people who read this page. Null when there is no audit yet,
   *  or when Node lacks full ICU (the UTC field is always present). */
  last_audit_at_chicago: string | null;
  remediation: {
    enabled: boolean;
    jobs_24h: { complete: number; failed: number };
  };
}

/** Minimal structural shape of the better-sqlite3 handle this service uses.
 *  Structural rather than nominal so tests can pass a real in-memory database
 *  and exercise the actual SQL. */
export interface StatusDb {
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

export interface EngineProbes {
  qpdf(): Promise<EngineResult>;
  verapdf(): Promise<EngineResult>;
  chromium(): Promise<EngineResult>;
}

export interface StatusDeps {
  /** Injected clock, in ms. Tests advance it to exercise the two cache TTLs
   *  without real elapsed time. */
  now: () => number;
  db: StatusDb;
  probes: EngineProbes;
  version: string;
  /** ms epoch at which the API process started. */
  startedAtMs: number;
  remediationEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;

/** Human-readable uptime. Extracted so /api/health and /api/status cannot
 *  drift into reporting the same number two different ways. */
export function formatUptime(uptimeSec: number): string {
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const seconds = uptimeSec % 60;
  return days > 0
    ? `${days}d ${hours}h ${minutes}m ${seconds}s`
    : hours > 0
      ? `${hours}h ${minutes}m ${seconds}s`
      : `${minutes}m ${seconds}s`;
}

/** ms epoch -> "2026-08-03T14:22:10Z". Seconds precision: this is a status
 *  page, not a trace, and millisecond noise invites false "did it change?"
 *  comparisons between polls. */
export function isoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Local rendering for readers who do not think in UTC. Returns null when
 *  Node was built without full ICU — the UTC field is always present, so a
 *  missing local rendering degrades the payload rather than breaking it. */
export function chicagoTime(ms: number): string | null {
  try {
    return new Date(ms).toLocaleString("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return null;
  }
}

/** SQLite CURRENT_TIMESTAMP stores "YYYY-MM-DD HH:MM:SS" in UTC with no zone
 *  marker. Naively handing that to `new Date()` is parsed as LOCAL time by
 *  some engines, silently shifting every timestamp by the server's offset. */
export function sqliteUtcToIso(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return normalized.endsWith("Z") ? normalized : `${normalized}Z`;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const DOCUMENT_TYPES = STATUS.DOCUMENT_EVENT_TYPES as readonly string[];

/** `?, ?, ?` for an IN clause. The event-type lists are config constants, not
 *  user input, but parameterizing keeps the query injection-proof by
 *  construction rather than by assumption. */
function placeholders(n: number): string {
  return new Array(n).fill("?").join(", ");
}

/** Buckets a document audit by filename extension.
 *
 *  audit_log has no format column, and adding one would only populate going
 *  forward — every one of the 365 retained days of history would read as zero
 *  until the table turned over. Deriving from the extension is correct for
 *  historical AND new rows.
 *
 *  Note this runs INSIDE SQLite: filenames are consumed by the CASE and only
 *  the resulting counts cross the module boundary. */
const FORMAT_CASE = `
  CASE
    WHEN lower(filename) LIKE '%.pdf'  THEN 'pdf'
    WHEN lower(filename) LIKE '%.docx' THEN 'docx'
    WHEN lower(filename) LIKE '%.pptx' THEN 'pptx'
    WHEN lower(filename) LIKE '%.xlsx' THEN 'xlsx'
    ELSE 'unknown_extension'
  END`;

function emptyFormatCounts(): FormatCounts {
  return { pdf: 0, docx: 0, pptx: 0, xlsx: 0, unknown_extension: 0 };
}

/** Buckets a document audit by its stored letter grade.
 *
 *  Every row lands in exactly one bucket. NULL grades (failed audits, rows
 *  predating the column) and any unrecognized value fall through to
 *  'ungraded' via the ELSE rather than being dropped, so the buckets always
 *  sum to the window's document count — see GradeCounts.
 *
 *  upper() is defensive: the scorer only ever writes uppercase letters
 *  (GRADE_THRESHOLDS in packages/shared/src/scoring.ts), but a lowercase value
 *  from any future writer would otherwise land in 'ungraded' and silently
 *  understate a real grade. */
const GRADE_CASE = `
  CASE
    WHEN upper(grade) IN ('A', 'B', 'C', 'D', 'F') THEN upper(grade)
    ELSE 'ungraded'
  END`;

function emptyGradeCounts(): GradeCounts {
  return { A: 0, B: 0, C: 0, D: 0, F: 0, ungraded: 0 };
}

function countDocuments(db: StatusDb, sinceMs: number | null): number {
  const inClause = placeholders(DOCUMENT_TYPES.length);
  const sql =
    sinceMs === null
      ? `SELECT COUNT(*) AS n FROM audit_log WHERE event_type IN (${inClause})`
      : `SELECT COUNT(*) AS n FROM audit_log
           WHERE event_type IN (${inClause})
             AND created_at > datetime(?, 'unixepoch')`;
  const params =
    sinceMs === null ? [...DOCUMENT_TYPES] : [...DOCUMENT_TYPES, Math.floor(sinceMs / 1000)];
  const row = db.prepare(sql).get(...params) as { n?: number } | undefined;
  return row?.n ?? 0;
}

function countDocumentsByFormat(db: StatusDb, sinceMs: number | null): FormatCounts {
  const inClause = placeholders(DOCUMENT_TYPES.length);
  const sql =
    sinceMs === null
      ? `SELECT ${FORMAT_CASE} AS fmt, COUNT(*) AS n
           FROM audit_log
          WHERE event_type IN (${inClause})
          GROUP BY fmt`
      : `SELECT ${FORMAT_CASE} AS fmt, COUNT(*) AS n
           FROM audit_log
          WHERE event_type IN (${inClause})
            AND created_at > datetime(?, 'unixepoch')
          GROUP BY fmt`;
  const params =
    sinceMs === null ? [...DOCUMENT_TYPES] : [...DOCUMENT_TYPES, Math.floor(sinceMs / 1000)];

  const counts = emptyFormatCounts();
  for (const raw of db.prepare(sql).all(...params)) {
    const row = raw as { fmt?: string; n?: number };
    if (row.fmt && row.fmt in counts) {
      counts[row.fmt as keyof FormatCounts] = row.n ?? 0;
    }
  }
  return counts;
}

function countDocumentsByGrade(db: StatusDb, sinceMs: number | null): GradeCounts {
  const inClause = placeholders(DOCUMENT_TYPES.length);
  const sql =
    sinceMs === null
      ? `SELECT ${GRADE_CASE} AS g, COUNT(*) AS n
           FROM audit_log
          WHERE event_type IN (${inClause})
          GROUP BY g`
      : `SELECT ${GRADE_CASE} AS g, COUNT(*) AS n
           FROM audit_log
          WHERE event_type IN (${inClause})
            AND created_at > datetime(?, 'unixepoch')
          GROUP BY g`;
  const params =
    sinceMs === null ? [...DOCUMENT_TYPES] : [...DOCUMENT_TYPES, Math.floor(sinceMs / 1000)];

  const counts = emptyGradeCounts();
  for (const raw of db.prepare(sql).all(...params)) {
    const row = raw as { g?: string; n?: number };
    // Assign only onto keys the struct already has, so an unexpected value
    // from the database can never inject a property. GRADE_CASE already
    // funnels those into 'ungraded'; this is the second line of defence.
    if (row.g && row.g in counts) {
      counts[row.g as keyof GradeCounts] = row.n ?? 0;
    }
  }
  return counts;
}

// -- refused uploads ---------------------------------------------------------

const REJECTION_TYPES = STATUS.REJECTION_EVENT_TYPES as readonly string[];

/** Buckets a refused upload by the extension it was offered under. Filenames
 *  are consumed by the CASE inside SQLite and never cross the boundary, same
 *  as FORMAT_CASE. `%.doc` cannot match `.docx` — the pattern is anchored to
 *  the end of the string. */
const REJECT_FORMAT_CASE = `
  CASE
    WHEN lower(filename) LIKE '%.doc' THEN 'doc'
    WHEN lower(filename) LIKE '%.xls' THEN 'xls'
    WHEN lower(filename) LIKE '%.ppt' THEN 'ppt'
    WHEN lower(filename) LIKE '%.rtf' THEN 'rtf'
    WHEN lower(filename) LIKE '%.csv' OR lower(filename) LIKE '%.tsv' THEN 'csv'
    ELSE 'other'
  END`;

function emptyRejectedFormatCounts(): RejectedFormatCounts {
  return { doc: 0, xls: 0, ppt: 0, rtf: 0, csv: 0, other: 0 };
}

function countRejected(db: StatusDb, sinceMs: number | null): number {
  const inClause = placeholders(REJECTION_TYPES.length);
  const sql =
    sinceMs === null
      ? `SELECT COUNT(*) AS n FROM audit_log WHERE event_type IN (${inClause})`
      : `SELECT COUNT(*) AS n FROM audit_log
           WHERE event_type IN (${inClause})
             AND created_at > datetime(?, 'unixepoch')`;
  const params =
    sinceMs === null ? [...REJECTION_TYPES] : [...REJECTION_TYPES, Math.floor(sinceMs / 1000)];
  const row = db.prepare(sql).get(...params) as { n?: number } | undefined;
  return row?.n ?? 0;
}

function countRejectedByFormat(db: StatusDb, sinceMs: number | null): RejectedFormatCounts {
  const inClause = placeholders(REJECTION_TYPES.length);
  const sql =
    sinceMs === null
      ? `SELECT ${REJECT_FORMAT_CASE} AS fmt, COUNT(*) AS n
           FROM audit_log
          WHERE event_type IN (${inClause})
          GROUP BY fmt`
      : `SELECT ${REJECT_FORMAT_CASE} AS fmt, COUNT(*) AS n
           FROM audit_log
          WHERE event_type IN (${inClause})
            AND created_at > datetime(?, 'unixepoch')
          GROUP BY fmt`;
  const params =
    sinceMs === null ? [...REJECTION_TYPES] : [...REJECTION_TYPES, Math.floor(sinceMs / 1000)];

  const counts = emptyRejectedFormatCounts();
  for (const raw of db.prepare(sql).all(...params)) {
    const row = raw as { fmt?: string; n?: number };
    if (row.fmt && row.fmt in counts) {
      counts[row.fmt as keyof RejectedFormatCounts] = row.n ?? 0;
    }
  }
  return counts;
}

function lastAuditAt(db: StatusDb): string | null {
  const sql = `SELECT MAX(created_at) AS t FROM audit_log
                WHERE event_type IN (${placeholders(DOCUMENT_TYPES.length)})`;
  const row = db.prepare(sql).get(...DOCUMENT_TYPES) as { t?: unknown } | undefined;
  return sqliteUtcToIso(row?.t);
}

/** remediation_jobs.created_at is an INTEGER ms epoch — NOT the UTC datetime
 *  string audit_log uses. Comparing it with datetime() would match nothing. */
function remediationJobs24h(db: StatusDb, nowMs: number): { complete: number; failed: number } {
  const out = { complete: 0, failed: 0 };
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS n FROM remediation_jobs
        WHERE created_at > ?
        GROUP BY status`,
    )
    .all(nowMs - DAY_MS);
  for (const raw of rows) {
    const row = raw as { status?: string; n?: number };
    if (row.status === "complete") out.complete = row.n ?? 0;
    else if (row.status === "failed") out.failed = row.n ?? 0;
  }
  return out;
}

export interface AggregateSnapshot {
  database: "ok" | "down";
  documents_audited: DocumentCounts;
  documents_rejected: RejectedCounts;
  last_audit_at: string | null;
  remediation_jobs_24h: { complete: number; failed: number };
}

/** All database-derived figures, in one place so the caller caches one object.
 *  A database failure degrades to zeros with database:"down" rather than
 *  throwing — the endpoint's job is to REPORT breakage, not to break. */
export function collectAggregates(db: StatusDb, nowMs: number): AggregateSnapshot {
  try {
    return {
      database: "ok",
      documents_audited: {
        last_24h: countDocuments(db, nowMs - DAY_MS),
        last_30d: countDocuments(db, nowMs - THIRTY_DAYS_MS),
        total: countDocuments(db, null),
        by_format_30d: countDocumentsByFormat(db, nowMs - THIRTY_DAYS_MS),
        by_format_total: countDocumentsByFormat(db, null),
        by_grade_24h: countDocumentsByGrade(db, nowMs - DAY_MS),
        by_grade_30d: countDocumentsByGrade(db, nowMs - THIRTY_DAYS_MS),
        by_grade_total: countDocumentsByGrade(db, null),
      },
      documents_rejected: {
        last_24h: countRejected(db, nowMs - DAY_MS),
        last_30d: countRejected(db, nowMs - THIRTY_DAYS_MS),
        total: countRejected(db, null),
        by_format_30d: countRejectedByFormat(db, nowMs - THIRTY_DAYS_MS),
        by_format_total: countRejectedByFormat(db, null),
      },
      last_audit_at: lastAuditAt(db),
      remediation_jobs_24h: remediationJobs24h(db, nowMs),
    };
  } catch (err) {
    console.error("[status] aggregate query failed:", err);
    return {
      database: "down",
      documents_audited: {
        last_24h: 0,
        last_30d: 0,
        total: 0,
        by_format_30d: emptyFormatCounts(),
        by_format_total: emptyFormatCounts(),
        by_grade_24h: emptyGradeCounts(),
        by_grade_30d: emptyGradeCounts(),
        by_grade_total: emptyGradeCounts(),
      },
      documents_rejected: {
        last_24h: 0,
        last_30d: 0,
        total: 0,
        by_format_30d: emptyRejectedFormatCounts(),
        by_format_total: emptyRejectedFormatCounts(),
      },
      last_audit_at: null,
      remediation_jobs_24h: { complete: 0, failed: 0 },
    };
  }
}

// ---------------------------------------------------------------------------
// Engine probes
// ---------------------------------------------------------------------------

/** Runs `bin --version` and returns the first line.
 *
 *  Rejections are mapped to a reason enum by the caller; the raw error never
 *  escapes, because subprocess stderr routinely contains absolute paths. */
function probeVersion(bin: string, args: string[] = ["--version"]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: STATUS.PROBE_TIMEOUT_MS }, (err, stdout) => {
      if (err) reject(err);
      else resolve(String(stdout).trim());
    });
  });
}

/** Pulls a bare version number out of tool output, e.g.
 *  "qpdf version 12.3.2" -> "12.3.2". Returns undefined rather than echoing
 *  the raw line, which for some tools includes an install path. */
export function extractVersion(output: string): string | undefined {
  const match = /\b(\d+\.\d+(?:\.\d+)?)\b/.exec(output);
  return match?.[1];
}

function classifyProbeError(err: unknown): ProbeFailureReason {
  const e = err as { killed?: boolean; signal?: string; code?: string } | null;
  if (e?.killed || e?.signal === "SIGTERM") return "timeout";
  if (e?.code === "ENOENT") return "not_executable";
  if (e?.code === "EACCES") return "not_executable";
  return "error";
}

/** Rejects with a timeout-shaped error if `p` has not settled in time.
 *
 *  execFile's own `timeout` already kills a hung subprocess, so this guards
 *  the other cases: a probe that hangs before spawning (a stalled dynamic
 *  import, a blocked fs call) or an injected probe in a test. Without it,
 *  one wedged probe would hold the whole response open. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error("probe timed out"), { killed: true }));
    }, ms);
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/** Turns any probe outcome into data — never an exception.
 *
 *  This lives at the COLLECTION layer rather than inside each probe so the
 *  guarantee holds for every implementation, including ones injected by
 *  tests or added later. Reporting that an engine is broken is this
 *  endpoint's entire purpose; a broken engine must never be able to break
 *  the response that reports it.
 *
 *  The real error — which routinely contains an absolute path — is logged
 *  server-side and replaced in the payload by a fixed reason enum. */
export async function safeProbe(
  name: string,
  run: () => Promise<EngineResult>,
): Promise<EngineResult> {
  try {
    return await withTimeout(run(), STATUS.PROBE_TIMEOUT_MS);
  } catch (err) {
    console.error(`[status] ${name} probe failed:`, err);
    return { ok: false, reason: classifyProbeError(err) };
  }
}

/** The real probes. These are free to throw — safeProbe is what converts a
 *  failure into a reported result. */
export const defaultProbes: EngineProbes = {
  async qpdf() {
    // QPDF_BIN, not a bare "qpdf": the analyzer falls back to
    // /opt/homebrew/bin and /usr/local/bin when PATH lacks qpdf, which is the
    // normal case under PM2. Probing a bare name would report a false OUTAGE
    // — a 503 paging someone about a service that is auditing documents
    // perfectly well.
    return { ok: true, version: extractVersion(await probeVersion(QPDF_BIN)) };
  },

  async verapdf() {
    // "Not configured" is a distinct state from "broken": veraPDF is
    // optional, and an unset path is a deployment choice, not a fault.
    if (!REMEDIATION.VERAPDF_PATH) return { ok: false, reason: "not_configured" };
    const out = await probeVersion(REMEDIATION.VERAPDF_PATH);
    return { ok: true, version: extractVersion(out) };
  },

  async chromium() {
    // Deliberately does NOT launch a browser. Starting Chromium on every
    // probe would be disproportionate to the question being asked; an
    // executable check answers "could we launch one if we needed to".
    const puppeteer = (await import("puppeteer")).default;
    const bin = puppeteer.executablePath();
    if (!bin) return { ok: false, reason: "not_configured" };
    await access(bin, constants.X_OK);
    return { ok: true };
  },
};

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface EngineSnapshot {
  checked_at: string;
  qpdf: EngineResult;
  verapdf: EngineResult;
  chromium: EngineResult;
}

/** Engines whose absence stops the service from auditing at all. A failure
 *  here is an outage (503); anything else is degraded (200). */
export const CORE_ENGINES = ["qpdf"] as const;

/** Engines whose absence removes a feature but leaves document auditing
 *  intact. veraPDF only powers the PDF/UA verdict; Chromium only powers page
 *  audits. Paging an operator at 3am for either would be wrong. */
export const OPTIONAL_ENGINES = ["verapdf", "chromium"] as const;

export async function collectEngines(probes: EngineProbes, nowMs: number): Promise<EngineSnapshot> {
  // Concurrent, and each independently guarded: one broken or hung engine
  // must not delay or fail the report on the others.
  const [qpdf, verapdf, chromium] = await Promise.all([
    safeProbe("qpdf", () => probes.qpdf()),
    safeProbe("verapdf", () => probes.verapdf()),
    safeProbe("chromium", () => probes.chromium()),
  ]);
  return { checked_at: isoSeconds(nowMs), qpdf, verapdf, chromium };
}

/** Names of everything currently unhealthy, core first. Drives both the
 *  `degraded` array and the HTTP status the Nitro tier selects. */
export function degradedList(engines: EngineSnapshot, database: "ok" | "down"): string[] {
  const out: string[] = [];
  if (database === "down") out.push("database");
  for (const name of [...CORE_ENGINES, ...OPTIONAL_ENGINES]) {
    if (!engines[name].ok) out.push(name);
  }
  return out;
}

/** True when the failure is severe enough that the service cannot audit.
 *  The Nitro tier turns this into a 503. */
export function isCoreFailure(engines: EngineSnapshot, database: "ok" | "down"): boolean {
  if (database === "down") return true;
  return CORE_ENGINES.some((name) => !engines[name].ok);
}

// ---------------------------------------------------------------------------
// Service (two independent caches)
// ---------------------------------------------------------------------------

interface Cached<T> {
  value: T;
  atMs: number;
}

/**
 * Builds the status payload, caching the two halves independently.
 *
 * The split is the whole point. Database aggregates are pure SQL and refresh
 * every minute; engine probes spawn processes — including a veraPDF JVM — and
 * refresh every ten. A single short TTL would mean an uptime monitor polling
 * at its 5-minute default misses the cache on EVERY check, starting a JVM
 * roughly 288 times a day purely to answer monitoring traffic. With the split,
 * probe cost is bounded by the TTL rather than by anyone's poll rate.
 *
 * Both halves coalesce concurrent misses into one computation, so a burst of
 * simultaneous requests cannot multiply the work.
 *
 * Caches are per-instance, not module-level, so each test gets a clean one.
 */
export function createStatusService(deps: StatusDeps) {
  let aggregates: Cached<AggregateSnapshot> | null = null;
  let engines: Cached<EngineSnapshot> | null = null;
  let enginesInFlight: Promise<EngineSnapshot> | null = null;

  function getAggregates(nowMs: number): AggregateSnapshot {
    if (aggregates && nowMs - aggregates.atMs < STATUS.AGGREGATE_TTL_MS) {
      return aggregates.value;
    }
    // Synchronous (better-sqlite3), so there is no in-flight window to guard.
    const value = collectAggregates(deps.db, nowMs);
    aggregates = { value, atMs: nowMs };
    return value;
  }

  async function getEngines(nowMs: number): Promise<EngineSnapshot> {
    if (engines && nowMs - engines.atMs < STATUS.ENGINE_PROBE_TTL_MS) {
      return engines.value;
    }
    if (enginesInFlight) return enginesInFlight;

    enginesInFlight = collectEngines(deps.probes, nowMs)
      .then((value) => {
        engines = { value, atMs: nowMs };
        return value;
      })
      .finally(() => {
        enginesInFlight = null;
      });
    return enginesInFlight;
  }

  async function getStatus(): Promise<StatusPayload> {
    const nowMs = deps.now();
    const [agg, eng] = [getAggregates(nowMs), await getEngines(nowMs)];

    const degraded = degradedList(eng, agg.database);
    const uptimeSeconds = Math.max(0, Math.floor((nowMs - deps.startedAtMs) / 1000));

    const payload: StatusPayload = {
      status: degraded.length === 0 ? "ok" : "degraded",
      version: deps.version,
      uptime_seconds: uptimeSeconds,
      uptime: formatUptime(uptimeSeconds),
      checked_at: isoSeconds(nowMs),
      checked_at_chicago: chicagoTime(nowMs),
      database: agg.database,
      engines: eng,
      documents_audited: agg.documents_audited,
      documents_rejected: agg.documents_rejected,
      last_audit_at: agg.last_audit_at,
      // Derived here rather than stored, so it can never disagree with the
      // UTC value above. Date.parse of an ISO string with an explicit Z is
      // zone-unambiguous, so this is a pure re-rendering of the same instant.
      last_audit_at_chicago: agg.last_audit_at ? chicagoTime(Date.parse(agg.last_audit_at)) : null,
      remediation: {
        enabled: deps.remediationEnabled,
        jobs_24h: agg.remediation_jobs_24h,
      },
    };
    // Omitted rather than empty on the happy path, so a reader scanning the
    // JSON sees no failure vocabulary at all when nothing is wrong.
    if (degraded.length > 0) payload.degraded = degraded;
    return payload;
  }

  return { getStatus };
}

/** Whether a built payload represents an outage rather than a degradation.
 *
 *  Derived from the payload itself rather than from the service's internal
 *  cache, so the answer always describes the response actually being sent. */
export function payloadIsCoreFailure(payload: StatusPayload): boolean {
  return isCoreFailure(payload.engines, payload.database);
}

// ---------------------------------------------------------------------------
// Package version
// ---------------------------------------------------------------------------

/** Reads apps/api/package.json. All three package versions are bumped in sync
 *  by the release checklist, so any of them is authoritative. */
export function readApiVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(path.resolve(here, "../../package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
