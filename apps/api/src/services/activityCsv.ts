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
