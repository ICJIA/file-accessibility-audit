// Backing service for the public status document at GET /api/status, which
// the Nitro tier re-serves at https://audit.icjia.app/status.
//
// Design: docs/superpowers/specs/2026-08-03-public-status-endpoint-design.md
//
// THE ENDPOINT IS PUBLIC AND UNAUTHENTICATED. Two rules govern everything
// below, and statusPrivacy.test.ts fails the build if either is broken:
//
//   1. Only aggregates leave this module. Every figure is a COUNT(*). No
//      filename or content hash is ever serialized (the schema itself has
//      no email/IP/user-agent columns since v1.68.0) —
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
import { readFileSync, statfsSync } from "node:fs";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEPLOY, REMEDIATION, STATUS } from "#config";
import { GRADE_THRESHOLDS } from "@file-audit/shared";
import { QPDF_BIN } from "./qpdfService.js";
import { defaultDataDir } from "./dataDir.js";
import { sqliteUtcToIso } from "./sqliteTime.js";

export { defaultDataDir, sqliteUtcToIso };

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

/** Privileged-tier audit volume: audits that came through the
 *  API_PRIVILEGED_TOKEN tier rather than the public tier. Same three windows
 *  as documents_audited. Only rows with `privileged = 1` count — rows written
 *  before the tier column existed are NULL (unknown) and are excluded, so
 *  `total` and `last_30d` climb from the migration date rather than showing
 *  fabricated history. It records a property of the shared service token, not
 *  identity. */
export interface PrivilegedCounts {
  last_24h: number;
  last_30d: number;
  total: number;
}

/** Distinct uploaded contents (by content hash), per window — the counterpart
 *  to documents_audited's event counts: four audits of one unchanged file are
 *  four audits but one distinct document. A re-export of the same document
 *  produces new bytes and counts as a new distinct content — that is the
 *  honest reading, since the tool cannot know two different files are "the
 *  same" document. Rows without a stored hash (old rows; failed audits) are
 *  not counted, so these figures climb from when hashing began and can be
 *  smaller than documents_audited, never larger. Hashes are consumed inside
 *  SQLite by COUNT(DISTINCT …) and never cross the module boundary. */
export interface DistinctDocumentCounts {
  last_24h: number;
  last_30d: number;
  total: number;
}

/** The remediation loop (audit → fix → re-audit), aggregated over the last 30
 *  days. Documents are grouped by filename INSIDE SQLite; one row of plain
 *  numbers per document comes back (run count, first score, latest score) and
 *  only the folded totals below leave the module — no filename, hash, score
 *  list, or timestamp is ever serialized.
 *
 *    documents   distinct filenames with ≥1 completed, scored document audit
 *    reaudited   of those, audited 2+ times in the window
 *    improvable  re-audited AND the first audit scored below an A
 *    improved    improvable AND the latest score beats the first
 *    reached_a   improvable AND the latest score is an A
 *    median_lift median (latest − first) across re-audited documents, or null
 *                below STATUS.PROGRESS_MIN_DOCS qualifying documents — a
 *                "median" of one document would describe a single visitor's
 *                afternoon, not a usage pattern. Counts are always published.
 *
 *  Grouping by filename (not hash) is deliberate: the loop's whole point is
 *  that the bytes change between runs while the document stays "the same".
 *  Two different visitors auditing identically-named files would merge — an
 *  accepted imprecision for an aggregate; nothing about either file is
 *  disclosed.
 *
 *  Counts PUBLIC-tier audits only (privileged = 0) since v1.90.0 — the fleet
 *  re-scans unchanged documents on a schedule and was drowning the signal;
 *  NULL-tier (pre-migration) rows are excluded with it, so the figures climb
 *  from when tier recording began. distinct_documents deliberately keeps all
 *  tiers: it is a volume figure, already contextualized by privileged_audits. */
export interface DocumentProgress {
  documents: number;
  reaudited: number;
  improvable: number;
  improved: number;
  reached_a: number;
  median_lift: number | null;
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
  /** Distinct uploaded contents per window (see DistinctDocumentCounts):
   *  separates "documents touched" from "audit runs". Aggregate counts only. */
  distinct_documents: DistinctDocumentCounts;
  /** The audit → fix → re-audit loop over the last 30 days (see
   *  DocumentProgress): how many documents were re-checked and whether they
   *  improved. Aggregate counts and one median only. */
  document_progress_30d: DocumentProgress;
  /** Privileged-tier audit volume (API_PRIVILEGED_TOKEN tier). Lets an
   *  operator confirm privileged usage matches the fleet and spot misuse of
   *  the shared token. */
  privileged_audits: PrivilegedCounts;
  /** Uploads the tool refused. Deliberately a sibling of documents_audited
   *  rather than a bucket inside it — a refusal has no score and no grade, so
   *  folding it in would inflate the audit count and dump every refusal into
   *  the grade distribution's 'ungraded' bucket. */
  documents_rejected: RejectedCounts;
  /** Free space on the volume holding the database. NO PATH is reported —
   *  /status is public, and statusPrivacy.test.ts forbids filesystem paths. */
  disk: DiskStatus;
  last_audit_at: string | null;
  /** Same instant as last_audit_at, rendered in America/Chicago — the local
   *  zone of the people who read this page. Null when there is no audit yet,
   *  or when Node lacks full ICU (the UTC field is always present). */
  last_audit_at_chicago: string | null;
  remediation: {
    enabled: boolean;
    jobs_24h: { complete: number; failed: number };
  };
  /** Last successful database backup, read from the status file the backup
   *  job writes only after a snapshot passes its integrity check. Since
   *  v1.52.0, "stale" joins the `degraded` list (a dead nightly job should
   *  page); "unavailable" still does not — a deployment before its first
   *  scheduled run must not alarm. Never part of isCoreFailure/503. */
  backup: BackupStatus;
  /** Whether the privileged rate-limit tier is armed — i.e. whether
   *  API_PRIVILEGED_TOKEN is set on the running process. NEVER the token, its
   *  length, or any hash of it; only on/off. See privilegedTierStatus. */
  privileged_tier: PrivilegedTierStatus;
}

/** "on"  — a token is configured; fleet clients can reach the generous tier.
 *  "off" — no token; EVERY caller is anonymous, including the fleet audit. */
export type PrivilegedTierStatus = "on" | "off";

export interface DiskStatus {
  /** "low" is a degradation, never an outage — see STATUS.DISK_LOW_FREE_PCT.
   *  "unavailable" means the filesystem could not be queried at all, which
   *  must never be mistaken for "plenty of room". */
  status: "ok" | "low" | "unavailable";
  free_bytes: number | null;
  total_bytes: number | null;
  /** Whole percent, so the number a reader sees is the number the threshold
   *  compares — no rounding disagreement between the payload and the rule. */
  free_pct: number | null;
}

export interface BackupStatus {
  /** "unavailable" covers both never-ran and unreadable/failed status files —
   *  the reader cannot tell those apart, and must never mistake either for a
   *  success. */
  status: "ok" | "stale" | "unavailable";
  finished_at: string | null;
  finished_at_chicago: string | null;
  age_hours: number | null;
  size_bytes: number | null;
  rows: number | null;
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
  /** Path of the backup job's last-backup.json. Injected (like the clock and
   *  DB) so tests point it at fixtures; production uses
   *  defaultBackupStatusFile(). */
  backupStatusFile: string;
  /** Directory whose volume is measured for free space. Injected like the
   *  clock and DB so tests point it at a temp dir; production uses the API's
   *  own data directory, where uploads and the database live. */
  diskPath: string;
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
      timeZone: DEPLOY.LOCAL_TIME_ZONE,
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

/** Counts privileged-tier audits (privileged = 1) in the window. Mirrors
 *  countDocuments exactly, plus the tier filter. NULL-tier rows (pre-migration)
 *  are excluded by `= 1`, which is the intended semantics. */
function countPrivilegedDocuments(db: StatusDb, sinceMs: number | null): number {
  const inClause = placeholders(DOCUMENT_TYPES.length);
  const sql =
    sinceMs === null
      ? `SELECT COUNT(*) AS n FROM audit_log
           WHERE event_type IN (${inClause}) AND privileged = 1`
      : `SELECT COUNT(*) AS n FROM audit_log
           WHERE event_type IN (${inClause}) AND privileged = 1
             AND created_at > datetime(?, 'unixepoch')`;
  const params =
    sinceMs === null ? [...DOCUMENT_TYPES] : [...DOCUMENT_TYPES, Math.floor(sinceMs / 1000)];
  const row = db.prepare(sql).get(...params) as { n?: number } | undefined;
  return row?.n ?? 0;
}

/** Distinct uploaded contents in the window. The DISTINCT runs inside SQLite;
 *  no hash crosses the boundary. Empty-string hashes are excluded alongside
 *  NULLs defensively — no writer produces them, but a distinct-count of ''
 *  would silently add a phantom document. */
function countDistinctDocuments(db: StatusDb, sinceMs: number | null): number {
  const inClause = placeholders(DOCUMENT_TYPES.length);
  const base = `SELECT COUNT(DISTINCT content_hash) AS n FROM audit_log
                 WHERE event_type IN (${inClause})
                   AND content_hash IS NOT NULL AND content_hash != ''`;
  const sql = sinceMs === null ? base : `${base} AND created_at > datetime(?, 'unixepoch')`;
  const params =
    sinceMs === null ? [...DOCUMENT_TYPES] : [...DOCUMENT_TYPES, Math.floor(sinceMs / 1000)];
  const row = db.prepare(sql).get(...params) as { n?: number } | undefined;
  return row?.n ?? 0;
}

/** The score at and above which a document is an A. Read from the published
 *  grade ladder rather than repeated here, so the stats can never disagree
 *  with the grades the reports themselves show. */
const A_MIN = GRADE_THRESHOLDS.find((t) => t.grade === "A")?.min ?? 90;

/** One folded DocumentProgress over the window.
 *
 *  The CTE partitions by filename INSIDE SQLite and emits exactly one row of
 *  numbers per document — run count, first score, latest score. The filename
 *  is the partition key only; it is never in the SELECT list, so it cannot
 *  cross the module boundary (rule 1 in the header). Ties on created_at
 *  (second precision — a batch upload) are broken by id, the insertion order.
 *
 *  PUBLIC UPLOADS ONLY (`privileged = 0`, v1.90.0): the trusted-tool fleet
 *  re-scans the same unchanged documents on a schedule, and on the first live
 *  day its runs were 3,293 of 3,781 grouped documents with a median lift of
 *  0 — drowning the picture of documents people actually fix, which is the
 *  question this block exists to answer. `= 0` also excludes NULL-tier rows
 *  (written before migration 12): unknown might be the fleet, so the figures
 *  climb from when tier recording began — the same reasoning, and the same
 *  climb-from-migration behavior, as privileged_audits (v1.86.0). */
function collectDocumentProgress(db: StatusDb, sinceMs: number): DocumentProgress {
  const inClause = placeholders(DOCUMENT_TYPES.length);
  const sql = `
    WITH runs AS (
      SELECT
        ROW_NUMBER() OVER (PARTITION BY filename ORDER BY created_at ASC, id ASC) AS rn,
        COUNT(*) OVER (PARTITION BY filename) AS n,
        FIRST_VALUE(score) OVER (
          PARTITION BY filename ORDER BY created_at ASC, id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS first_score,
        LAST_VALUE(score) OVER (
          PARTITION BY filename ORDER BY created_at ASC, id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_score
      FROM audit_log
      WHERE event_type IN (${inClause})
        AND score IS NOT NULL
        AND privileged = 0
        AND created_at > datetime(?, 'unixepoch')
    )
    SELECT n, first_score, last_score FROM runs WHERE rn = 1`;
  const rows = db.prepare(sql).all(...DOCUMENT_TYPES, Math.floor(sinceMs / 1000)) as Array<{
    n?: number;
    first_score?: number;
    last_score?: number;
  }>;

  let documents = 0;
  let reaudited = 0;
  let improvable = 0;
  let improved = 0;
  let reachedA = 0;
  const lifts: number[] = [];
  for (const r of rows) {
    documents += 1;
    if ((r.n ?? 0) < 2) continue;
    const first = r.first_score ?? 0;
    const last = r.last_score ?? 0;
    reaudited += 1;
    lifts.push(last - first);
    if (first < A_MIN) {
      improvable += 1;
      if (last > first) improved += 1;
      if (last >= A_MIN) reachedA += 1;
    }
  }
  return {
    documents,
    reaudited,
    improvable,
    improved,
    reached_a: reachedA,
    median_lift: reaudited >= STATUS.PROGRESS_MIN_DOCS ? median(lifts) : null,
  };
}

/** Median of a non-empty list: the middle value, or halfway between the middle
 *  pair, rounded to one decimal so the payload never carries float noise. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m =
    s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
  return Math.round(m * 10) / 10;
}

function emptyDocumentProgress(): DocumentProgress {
  return {
    documents: 0,
    reaudited: 0,
    improvable: 0,
    improved: 0,
    reached_a: 0,
    median_lift: null,
  };
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
  distinct_documents: DistinctDocumentCounts;
  document_progress_30d: DocumentProgress;
  privileged_audits: PrivilegedCounts;
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
      distinct_documents: {
        last_24h: countDistinctDocuments(db, nowMs - DAY_MS),
        last_30d: countDistinctDocuments(db, nowMs - THIRTY_DAYS_MS),
        total: countDistinctDocuments(db, null),
      },
      document_progress_30d: collectDocumentProgress(db, nowMs - THIRTY_DAYS_MS),
      privileged_audits: {
        last_24h: countPrivilegedDocuments(db, nowMs - DAY_MS),
        last_30d: countPrivilegedDocuments(db, nowMs - THIRTY_DAYS_MS),
        total: countPrivilegedDocuments(db, null),
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
      distinct_documents: { last_24h: 0, last_30d: 0, total: 0 },
      document_progress_30d: emptyDocumentProgress(),
      privileged_audits: { last_24h: 0, last_30d: 0, total: 0 },
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

/** One system behind the health verdict, as the header's tooltip shows it.
 *  `ok: null` means not established (no probe cached, backup never recorded,
 *  disk not measurable) — which never degrades and must not read as failure. */
export interface HealthSystem {
  id: string;
  label: string;
  ok: boolean | null;
  state: string;
}

/** Plain-language names for the tooltip; the audience is whoever is looking
 *  at the page header, so the program name is the parenthetical, not the
 *  label. Full descriptions of what each engine does live on /status. */
const ENGINE_LABELS: Record<(typeof CORE_ENGINES | typeof OPTIONAL_ENGINES)[number], string> = {
  qpdf: "Document audits (qpdf)",
  verapdf: "PDF/UA checks (veraPDF)",
  chromium: "Web-page audits (Chromium)",
};

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

/**
 * Is the privileged rate-limit tier armed?
 *
 * Why this is worth reporting: the token reaches the API only through the
 * process environment (ecosystem.config.cjs reads
 * `process.env.API_PRIVILEGED_TOKEN || ""`, sourced from /etc/environment,
 * which PAM loads for LOGIN shells). If PM2 ever resurrects the app from a
 * non-login shell — a reboot, a manual `pm2 start` from a bare context — the
 * API comes up with an empty token and `isPrivilegedRequest` fails closed.
 * Every caller is then anonymous, the fleet audit silently drops from 5000/hour
 * to 500/hour, and the only external symptom is that a weekly run appears to
 * take the service "offline" (2026-08-12). Nothing else on this page would move.
 *
 * PRIVACY: returns on/off ONLY. The token, its length, and any hash of it stay
 * out of this public document — statusPrivacy.test.ts enforces the shape.
 */
export function privilegedTierStatus(env: NodeJS.ProcessEnv = process.env): PrivilegedTierStatus {
  const token = env.API_PRIVILEGED_TOKEN;
  return typeof token === "string" && token.length > 0 ? "on" : "off";
}

/** Names of everything currently unhealthy, core first. Drives the
 *  `degraded` array (and, for core entries only, the 503 the Nitro tier
 *  selects via isCoreFailure — which never considers the backup).
 *
 *  Backup semantics (v1.52.0): "stale" degrades — a backup that succeeded
 *  before and is now overdue means the nightly job died, and the uptime
 *  monitor's keyword alert on "degraded" should fire. "unavailable" does
 *  NOT — that is the expected state of a deployment before its first
 *  scheduled run, and a fresh install must not page anyone. Residual,
 *  accepted: deleting the status file demotes stale to unavailable and
 *  silences the signal; a live nightly job rewrites the file within 24h,
 *  so only the compound failure (file gone AND job dead) stays quiet. */
export function degradedList(
  engines: EngineSnapshot,
  database: "ok" | "down",
  backupStatus: BackupStatus["status"],
  diskStatus: DiskStatus["status"] = "ok",
  privilegedTier: PrivilegedTierStatus = "on",
): string[] {
  const out: string[] = [];
  if (database === "down") out.push("database");
  for (const name of [...CORE_ENGINES, ...OPTIONAL_ENGINES]) {
    if (!engines[name].ok) out.push(name);
  }
  if (backupStatus === "stale") out.push("backup");
  // Like a stale backup: joins `degraded` (so the existing keyword alert
  // fires) but is never part of isCoreFailure, because the service can still
  // audit with a nearly-full disk, and paging about an outage that has not
  // happened yet is how alerts get ignored. "unavailable" does NOT degrade —
  // an unqueryable filesystem is a gap in our knowledge, not evidence of a
  // problem, and alarming on it would fire on any platform where statfs
  // behaves differently.
  if (diskStatus === "low") out.push("disk");
  // Same class as a stale backup or a low disk: it degrades (so the existing
  // "degraded" keyword alert fires with no new monitor) but is never a core
  // failure, because the service can still audit perfectly well — it is the
  // FLEET integration that quietly loses its 10x headroom.
  //
  // Accepted trade-off: a deployment that never uses the fleet integration and
  // deliberately runs without a token would degrade continuously. This one
  // always sets it (/etc/environment), so "off" here means something broke.
  if (privilegedTier === "off") out.push("privileged_tier");
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
    const backup = readBackupStatus(deps.backupStatusFile, nowMs);
    const disk = readDiskStatus(deps.diskPath);

    const privilegedTier = privilegedTierStatus();
    const degraded = degradedList(eng, agg.database, backup.status, disk.status, privilegedTier);
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
      distinct_documents: agg.distinct_documents,
      document_progress_30d: agg.document_progress_30d,
      privileged_audits: agg.privileged_audits,
      documents_rejected: agg.documents_rejected,
      disk,
      last_audit_at: agg.last_audit_at,
      // Derived here rather than stored, so it can never disagree with the
      // UTC value above. Date.parse of an ISO string with an explicit Z is
      // zone-unambiguous, so this is a pure re-rendering of the same instant.
      last_audit_at_chicago: agg.last_audit_at ? chicagoTime(Date.parse(agg.last_audit_at)) : null,
      remediation: {
        enabled: deps.remediationEnabled,
        jobs_24h: agg.remediation_jobs_24h,
      },
      backup,
      privileged_tier: privilegedTier,
    };
    // Omitted rather than empty on the happy path, so a reader scanning the
    // JSON sees no failure vocabulary at all when nothing is wrong.
    if (degraded.length > 0) payload.degraded = degraded;
    return payload;
  }

  /**
   * The same verdict /status computes, from what is ALREADY cached — for the
   * always-visible header indicator, which polls every 20 seconds per open
   * tab.
   *
   * Two things it must not do, and does not:
   *
   *   - **Trigger an engine probe.** Those spawn processes (veraPDF starts a
   *     JVM). A header polling every 20s across every open tab would turn the
   *     most expensive operation on the service into its most frequent one.
   *     Only an already-cached engine snapshot is consulted; with none, the
   *     engines simply do not contribute to the verdict yet.
   *
   *   - **Touch /status's rate limit.** That endpoint is capped at 120/min
   *     shared GLOBALLY — Nitro proxies it over loopback, so every browser hit
   *     arrives as 127.0.0.1 in one bucket. Pointing the header at /status
   *     would let ~40 concurrent tabs exhaust the budget, at which point
   *     /status answers "unknown" and the uptime monitor's keyword alert goes
   *     blind. Making the header prettier by disabling the alarm is not a
   *     trade worth making, so this rides on /api/health instead.
   *
   * Everything else here is cheap: aggregates are 5-second-cached synchronous
   * SQL, the backup status is one small file read, the disk check is a statfs.
   */
  function getHealthSummary(): {
    status: "ok" | "degraded";
    degraded: string[];
    systems: HealthSystem[];
  } {
    const nowMs = deps.now();
    const agg = getAggregates(nowMs);
    const backup = readBackupStatus(deps.backupStatusFile, nowMs);
    const disk = readDiskStatus(deps.diskPath);
    const cachedEngines = engines?.value;

    // The per-system list behind the verdict, for the header's tooltip. Each
    // entry is a static label plus a one-word state — never a path, count, or
    // anything measured, so there is nothing here /status does not already
    // say in more detail. `ok: null` means "not established", which is
    // deliberately distinct from failure: engines before their first /status
    // probe, a backup that has never recorded, a filesystem that could not be
    // measured. None of those degrade the verdict, and the tooltip must not
    // dress them up as either "up" or "down".
    const systems: HealthSystem[] = [
      {
        id: "database",
        label: "Database",
        ok: agg.database === "ok",
        state: agg.database === "ok" ? "up" : "down",
      },
      ...[...CORE_ENGINES, ...OPTIONAL_ENGINES].map((name): HealthSystem => {
        const engine = cachedEngines?.[name];
        return {
          id: name,
          label: ENGINE_LABELS[name],
          ok: engine ? engine.ok : null,
          state: engine ? (engine.ok ? "up" : "down") : "not yet checked",
        };
      }),
      {
        id: "backup",
        label: "Nightly backup",
        ok: backup.status === "ok" ? true : backup.status === "stale" ? false : null,
        state:
          backup.status === "ok" ? "up" : backup.status === "stale" ? "stale" : "never recorded",
      },
      {
        id: "disk",
        label: "Disk space",
        ok: disk.status === "ok" ? true : disk.status === "low" ? false : null,
        state: disk.status === "ok" ? "ok" : disk.status === "low" ? "low" : "not measured",
      },
      // Carried here as well as in the payload so the header verdict and
      // /status can never disagree — the two compute `degraded` by different
      // routes, and a card wired into only one of them has shipped before.
      {
        id: "privileged_tier",
        label: "Privileged API tier",
        ok: privilegedTierStatus() === "on",
        state: privilegedTierStatus() === "on" ? "armed" : "off",
      },
    ];

    // The verdict itself is unchanged: only an established failure degrades.
    const out = systems.filter((s) => s.ok === false).map((s) => s.id);

    return { status: out.length === 0 ? "ok" : "degraded", degraded: out, systems };
  }

  return { getStatus, getHealthSummary };
}

/** Whether a built payload represents an outage rather than a degradation.
 *
 *  Derived from the payload itself rather than from the service's internal
 *  cache, so the answer always describes the response actually being sent. */
export function payloadIsCoreFailure(payload: StatusPayload): boolean {
  return isCoreFailure(payload.engines, payload.database);
}

// ---------------------------------------------------------------------------
// Backup status
// ---------------------------------------------------------------------------

/** Where the backup job's status file lives: $BACKUP_DIR/last-backup.json,
 *  defaulting to a `backups/` directory BESIDE the repository checkout
 *  (on the production server: /home/forge/audit.icjia.app/backups — inside
 *  the Forge site folder for findability, outside the git working tree so a
 *  `git clean -xdf` cannot delete the backups along with the database, and
 *  outside any web root). Must match scripts/backup-db.sh's default, which
 *  derives the same path from its own location. */
/**
 * Free space on the volume holding a given path.
 *
 * WHY: a full disk breaks uploads AND the nightly backup at once, silently,
 * while every other check on this page stays green — the audit path holds
 * files in memory and the backup writes elsewhere, so neither surfaces a disk
 * problem as its own failure. The first symptom would otherwise be a failed
 * restore months later.
 *
 * Reports percentages and byte counts ONLY. The path is deliberately absent
 * from the return value: /status is public and statusPrivacy.test.ts forbids
 * filesystem paths in the payload, so there is nothing here to leak even if a
 * field were added carelessly later.
 *
 * `bavail` (blocks available to an unprivileged user), not `bfree` — on ext4
 * the 5% root reserve is free but unusable by the `forge` user, and counting
 * it would report headroom the service cannot actually spend.
 *
 * Any failure returns "unavailable" rather than throwing or guessing: this
 * runs on every status request, and a status endpoint that 500s because it
 * could not stat a directory is worse than one admitting it does not know.
 */
export function readDiskStatus(dirPath: string): DiskStatus {
  try {
    const fs = statfsSync(dirPath);
    const total = Number(fs.blocks) * Number(fs.bsize);
    const free = Number(fs.bavail) * Number(fs.bsize);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free) || free < 0) {
      return { status: "unavailable", free_bytes: null, total_bytes: null, free_pct: null };
    }
    const freePct = Math.round((free / total) * 100);
    return {
      status: freePct < STATUS.DISK_LOW_FREE_PCT ? "low" : "ok",
      free_bytes: free,
      total_bytes: total,
      free_pct: freePct,
    };
  } catch {
    return { status: "unavailable", free_bytes: null, total_bytes: null, free_pct: null };
  }
}

export function defaultBackupStatusFile(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../../../..");
  const dir = process.env.BACKUP_DIR || path.join(path.dirname(repoRoot), "backups");
  return path.join(dir, "last-backup.json");
}

/** Reads last-backup.json into the public payload shape.
 *
 *  The source file carries two absolute server paths (sourcePath,
 *  snapshotPath); neither is copied — rule 2 in this module's header applies.
 *  `integrity !== "ok"`, a missing file, unreadable JSON, or an unparseable
 *  timestamp all collapse to "unavailable": the section only ever describes a
 *  backup that provably succeeded. */
export function readBackupStatus(filePath: string, nowMs: number): BackupStatus {
  const unavailable: BackupStatus = {
    status: "unavailable",
    finished_at: null,
    finished_at_chicago: null,
    age_hours: null,
    size_bytes: null,
    rows: null,
  };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return unavailable;
  }
  if (typeof raw !== "object" || raw === null) return unavailable;
  const rec = raw as Record<string, unknown>;
  if (rec.integrity !== "ok") return unavailable;
  const finishedMs = typeof rec.finishedAt === "string" ? Date.parse(rec.finishedAt) : NaN;
  if (!Number.isFinite(finishedMs)) return unavailable;

  // Clamped at zero: a finishedAt slightly in the future is clock skew, not
  // a time traveller, and a negative age would read as data corruption.
  const ageHours = Math.max(0, Math.round(((nowMs - finishedMs) / 3_600_000) * 10) / 10);

  return {
    status: ageHours > STATUS.BACKUP_STALE_AFTER_HOURS ? "stale" : "ok",
    finished_at: new Date(finishedMs).toISOString(),
    finished_at_chicago: chicagoTime(finishedMs),
    age_hours: ageHours,
    size_bytes: typeof rec.bytes === "number" && Number.isFinite(rec.bytes) ? rec.bytes : null,
    rows:
      typeof rec.auditLogRows === "number" && Number.isFinite(rec.auditLogRows)
        ? rec.auditLogRows
        : null,
  };
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
