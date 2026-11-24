/**
 * A batch, as one table you can take away (2026-11-24).
 *
 * A batch used to end as a row of cards, one report at a time: nothing showed
 * the 25 files side by side, and nothing could be handed to a manager. This
 * builds the rows for the summary table and the CSV download from the same
 * data, so the two can never disagree.
 *
 * WHAT THE COLUMNS ARE. The grade letter and the score are the document's
 * OVERALL grade and score — never a per-category letter. The three counts
 * are how many of the document's checks are Critical, Moderate and Minor.
 * "Top issue" is the name of the most serious failing check.
 */
import { fileTypeLabel } from "./reportBanner";
import { tallySeverity } from "./severityTally";

export interface BatchSummaryInput {
  id: string;
  filename: string;
  status: "queued" | "processing" | "done" | "error" | "cancelled";
  // Raw result JSON — read defensively; a restored session is untyped.
  result: Record<string, any> | null;
  error: { error?: string; details?: string } | null;
}

export interface BatchSummaryRow {
  /** Position in the batch — what "View report" switches to. */
  index: number;
  id: string;
  filename: string;
  /** "PDF", "Word", … — from the result, else from the file extension. */
  format: string;
  grade: string | null;
  score: number | null;
  critical: number | null;
  moderate: number | null;
  minor: number | null;
  /** "Alt Text (Critical)" — or "No issues found by the automated checks". */
  topIssue: string;
  /** "Done", "Failed", "Cancelled" — a word, never an icon or colour alone. */
  status: "Done" | "Failed" | "Cancelled" | "Not finished";
  /** Why it failed, in the same words the page shows. Empty otherwise. */
  reason: string;
}

const SEVERITY_RANK: Record<string, number> = { Critical: 0, Moderate: 1, Minor: 2 };

function formatOf(filename: string, fileType: unknown): string {
  if (typeof fileType === "string" && fileType) return fileTypeLabel(fileType);
  const m = /\.(pdf|docx|pptx|xlsx)$/i.exec(filename);
  return m ? fileTypeLabel(m[1]!.toLowerCase()) : "—";
}

/** The most serious failing check: worst severity first, then lowest score. */
export function topIssueOf(categories: unknown): string {
  const list = Array.isArray(categories) ? categories : [];
  const failing = list
    .filter(
      (c) =>
        c && typeof c === "object" && typeof c.severity === "string" && c.severity in SEVERITY_RANK,
    )
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity]! - SEVERITY_RANK[b.severity]! ||
        (typeof a.score === "number" ? a.score : 101) -
          (typeof b.score === "number" ? b.score : 101),
    );
  const top = failing[0];
  if (!top) return "No issues found by the automated checks";
  const label =
    typeof top.label === "string" && top.label ? top.label : String(top.id ?? "A check");
  return `${label} (${top.severity})`;
}

export function summarizeBatch(items: readonly BatchSummaryInput[]): BatchSummaryRow[] {
  return items.map((item, index) => {
    const base = { index, id: item.id, filename: item.filename };
    if (item.status === "done" && item.result) {
      const r = item.result;
      // The strict profile is the one the report shows; a legacy stored
      // result can carry a divergent top-level pair.
      const strict = r.scoreProfiles?.strict;
      const categories = Array.isArray(strict?.categories) ? strict.categories : r.categories;
      const tally = tallySeverity(Array.isArray(categories) ? categories : []);
      const score = strict?.overallScore ?? r.overallScore;
      const grade = strict?.grade ?? r.grade;
      return {
        ...base,
        format: formatOf(item.filename, r.fileType),
        grade: typeof grade === "string" ? grade : null,
        score: typeof score === "number" && Number.isFinite(score) ? score : null,
        critical: tally.critical,
        moderate: tally.moderate,
        minor: tally.minor,
        topIssue: topIssueOf(categories),
        status: "Done" as const,
        reason: "",
      };
    }
    const failed = item.status === "error";
    const reason = failed
      ? [item.error?.error, item.error?.details]
          .filter((s) => typeof s === "string" && s)
          .join(" ") || "The audit could not be completed."
      : item.status === "cancelled"
        ? "Cancelled before it was checked."
        : "";
    return {
      ...base,
      format: formatOf(item.filename, null),
      grade: null,
      score: null,
      critical: null,
      moderate: null,
      minor: null,
      topIssue: "—",
      status: failed
        ? ("Failed" as const)
        : item.status === "cancelled"
          ? ("Cancelled" as const)
          : ("Not finished" as const),
      reason,
    };
  });
}

export type ScoreSort = "none" | "ascending" | "descending";

/**
 * Sort by score. Files with no score (failed, cancelled) always go LAST, in
 * their original order, whichever way the scored ones are sorted — a failed
 * file is not "the lowest score". Stable; "none" is the upload order.
 */
export function sortByScore(rows: readonly BatchSummaryRow[], dir: ScoreSort): BatchSummaryRow[] {
  const copy = [...rows];
  if (dir === "none") return copy.sort((a, b) => a.index - b.index);
  const sign = dir === "ascending" ? 1 : -1;
  return copy.sort((a, b) => {
    if (a.score === null && b.score === null) return a.index - b.index;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return sign * (a.score - b.score) || a.index - b.index;
  });
}

/**
 * One CSV cell.
 *
 * FORMULA INJECTION. A spreadsheet treats a cell that starts with = + - @
 * (or a tab or carriage return) as a formula. A filename is whatever the
 * visitor's file was called, and "=HYPERLINK(…)" is a legal filename — so
 * any such cell is prefixed with an apostrophe, which every spreadsheet
 * reads as "this is text". Numbers this module writes itself are passed as
 * numbers and are not prefixed (a score is never negative).
 *
 * QUOTING (RFC 4180). A cell containing a comma, a quote or a line break is
 * wrapped in double quotes, with inner quotes doubled.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** UTF-8 byte-order mark, so Excel reads accented filenames correctly. */
export const CSV_BOM = String.fromCharCode(0xfeff);

export const BATCH_CSV_HEADERS = [
  "File",
  "Format",
  "Grade",
  "Score (out of 100)",
  "Critical",
  "Moderate",
  "Minor",
  "Top issue",
  "Status",
  "Reason",
] as const;

/** The whole summary as CSV: CRLF line ends, and a UTF-8 byte-order mark so
 *  Excel opens accented filenames correctly. Always in upload order. */
export function batchSummaryCsv(rows: readonly BatchSummaryRow[]): string {
  const lines = [BATCH_CSV_HEADERS.map(csvCell).join(",")];
  for (const r of sortByScore(rows, "none")) {
    lines.push(
      [
        r.filename,
        r.format,
        r.grade,
        r.score,
        r.critical,
        r.moderate,
        r.minor,
        r.topIssue,
        r.status,
        r.reason,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}

/** "accessibility-batch-summary-2026-11-24.csv" */
export function batchSummaryFilename(now: Date = new Date()): string {
  return `accessibility-batch-summary-${now.toISOString().slice(0, 10)}.csv`;
}
