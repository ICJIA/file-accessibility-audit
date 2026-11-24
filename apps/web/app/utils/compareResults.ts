/**
 * Before and after: what changed between two reports on the same document.
 *
 * A person fixes a document and uploads it again. Nothing used to say what
 * the second check found different from the first. This compares two reports
 * and stores nothing: both sides are already in the browser (the report on
 * screen, and an earlier one the person supplies — an exported JSON file, a
 * share link, or the previous upload of the same filename in this tab).
 *
 * WHAT IS COMPARED
 *   - the overall score and grade;
 *   - each check's score (a check present on only one side is reported as
 *     such, never as a change from or to zero);
 *   - the ISSUES each check reported: fixed (in the earlier report only),
 *     new (in the later one only), and still there (in both).
 *
 * HOW ISSUES ARE MATCHED. Within a check, by the finding's stable `code`
 * when BOTH reports carry structured findings (`findingDetails`, results
 * from schemaVersion 1 on), otherwise by the finding's exact text. Text
 * matching has one honest weakness, and the result says when it applied
 * (`matchedBy: "text"`): a finding whose numbers changed — "5 images have no
 * description" becoming "3 images…" — reads as one fixed and one new.
 *
 * WHAT COUNTS AS AN ISSUE. With structured findings, the lines the engine
 * classified as a failure or an advisory. Without them, the lines the report
 * card itself would show as a problem: not guidance ("How to fix: …"), not a
 * neutral measurement, not a technical signal, and only in a check that is
 * not passing outright.
 *
 * SAME FILE? An audit result carries no content hash today, so two reports
 * cannot be proved to be of the same bytes; `sameContent` is null (unknown)
 * unless both sides carry a `contentHash`. "Nothing changed" is decided from
 * what the reports say, and is said plainly.
 */
import {
  isGuidanceFinding,
  isNeutralFinding,
  isNotScoredFinding,
  partitionCardFindings,
} from "./findings";

/** One report, reduced to what a comparison reads. */
export interface ComparableCategory {
  id: string;
  label: string;
  score: number | null;
  notAssessed: boolean;
  /** The issue lines only — see "WHAT COUNTS AS AN ISSUE" above. */
  issues: Array<{ text: string; code: string | null }>;
  /** True when every issue has a code (the result carried findingDetails). */
  coded: boolean;
}

export interface ComparableReport {
  filename: string;
  score: number | null;
  grade: string | null;
  fileType: string | null;
  contentHash: string | null;
  categories: ComparableCategory[];
}

export interface CategoryDelta {
  id: string;
  label: string;
  before: number | null;
  after: number | null;
  /** after − before, or null when either side has no score. */
  delta: number | null;
  /** In words — the table never relies on a sign or a colour alone. */
  change:
    | "improved"
    | "worse"
    | "unchanged"
    | "only in the earlier report"
    | "only in the later report"
    | "not scored";
}

export interface FindingChange {
  categoryId: string;
  category: string;
  text: string;
}

export interface Comparison {
  before: { filename: string; score: number | null; grade: string | null };
  after: { filename: string; score: number | null; grade: string | null };
  scoreDelta: number | null;
  gradeChanged: boolean;
  categories: CategoryDelta[];
  resolved: FindingChange[];
  added: FindingChange[];
  unchanged: FindingChange[];
  /** "code" only when every compared check was matched by code. */
  matchedBy: "code" | "text";
  /** true/false when both reports carry a content hash; null = unknown. */
  sameContent: boolean | null;
  /** The two reports say exactly the same thing. */
  nothingChanged: boolean;
  /** The two filenames differ — worth saying, never a refusal. */
  differentFilenames: boolean;
  /** The two reports are of different kinds of file (PDF vs Word…). */
  differentFormats: boolean;
  /** One plain sentence for the top of the card. */
  summary: string;
}

const ISSUE_KINDS = new Set(["failure", "advisory"]);

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function issuesOf(cat: Record<string, any>): {
  issues: ComparableCategory["issues"];
  coded: boolean;
} {
  const findings: string[] = Array.isArray(cat.findings)
    ? cat.findings.filter((f: unknown): f is string => typeof f === "string")
    : [];
  const details = Array.isArray(cat.findingDetails) ? cat.findingDetails : null;
  if (details && details.length > 0) {
    const issues = details
      .filter(
        (d: any) =>
          d && typeof d === "object" && ISSUE_KINDS.has(d.kind) && typeof d.text === "string",
      )
      .map((d: any) => ({ text: d.text.trim(), code: str(d.code) }));
    return { issues, coded: issues.every((i: { code: string | null }) => i.code !== null) };
  }
  // No structured findings: read the lines the way the report card does.
  const score = num(cat.score);
  if (score === null || score >= 100) return { issues: [], coded: false };
  const issues = partitionCardFindings(findings)
    .main.filter((f) => !isGuidanceFinding(f) && !isNeutralFinding(f) && !isNotScoredFinding(f))
    .map((f) => ({ text: f.trim(), code: null }));
  return { issues, coded: false };
}

/**
 * Reduce a report to its comparable form. Accepts a live or stored
 * AnalysisResult (the strict profile is preferred, as everywhere else) —
 * read defensively, because a stored report is raw JSON.
 */
export function toComparable(result: unknown): ComparableReport | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, any>;
  const strict = r.scoreProfiles?.strict;
  const rawCats = Array.isArray(strict?.categories) ? strict.categories : r.categories;
  if (!Array.isArray(rawCats)) return null;
  const categories: ComparableCategory[] = [];
  for (const c of rawCats) {
    if (!c || typeof c !== "object" || typeof c.id !== "string") continue;
    const { issues, coded } = issuesOf(c);
    categories.push({
      id: c.id,
      label: str(c.label) ?? c.id,
      score: num(c.score),
      notAssessed: c.notAssessed === true,
      issues,
      coded,
    });
  }
  return {
    filename: str(r.filename) ?? "document",
    score: num(strict?.overallScore ?? r.overallScore ?? r.score),
    grade: str(strict?.grade ?? r.grade),
    fileType: str(r.fileType),
    contentHash: str(r.contentHash),
    categories,
  };
}

function categoryDelta(
  b: ComparableCategory | undefined,
  a: ComparableCategory | undefined,
): CategoryDelta {
  const one = (a ?? b)!;
  const before = b ? b.score : null;
  const after = a ? a.score : null;
  let change: CategoryDelta["change"];
  let delta: number | null = null;
  if (!b) change = "only in the later report";
  else if (!a) change = "only in the earlier report";
  else if (before === null || after === null) {
    // No number on one side or both: a check that newly applies, or no
    // longer does, is neither an improvement nor a decline. describeDelta
    // says which side had a score.
    change = "not scored";
  } else {
    delta = after - before;
    change = delta > 0 ? "improved" : delta < 0 ? "worse" : "unchanged";
  }
  return { id: one.id, label: one.label, before, after, delta, change };
}

/** Pair up issues within one check. Returns indices into each side. */
function matchIssues(
  b: ComparableCategory | undefined,
  a: ComparableCategory | undefined,
): { resolved: string[]; added: string[]; unchanged: string[]; byCode: boolean } {
  const bi = b?.issues ?? [];
  const ai = a?.issues ?? [];
  const byCode = !!b && !!a && b.coded && a.coded && bi.length + ai.length > 0;
  const keyOf = (i: { text: string; code: string | null }) => (byCode ? i.code! : i.text);
  // A multiset: the same code (or the same sentence) can appear twice.
  const remaining = new Map<string, number>();
  for (const i of bi) remaining.set(keyOf(i), (remaining.get(keyOf(i)) ?? 0) + 1);
  const unchanged: string[] = [];
  const added: string[] = [];
  for (const i of ai) {
    const k = keyOf(i);
    const left = remaining.get(k) ?? 0;
    if (left > 0) {
      remaining.set(k, left - 1);
      unchanged.push(i.text);
    } else {
      added.push(i.text);
    }
  }
  const resolved: string[] = [];
  for (const i of bi) {
    const k = keyOf(i);
    const left = remaining.get(k) ?? 0;
    if (left > 0) {
      remaining.set(k, left - 1);
      resolved.push(i.text);
    }
  }
  return { resolved, added, unchanged, byCode };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function compareResults(beforeRaw: unknown, afterRaw: unknown): Comparison | null {
  const before = toComparable(beforeRaw);
  const after = toComparable(afterRaw);
  if (!before || !after) return null;

  const bById = new Map(before.categories.map((c) => [c.id, c]));
  const aById = new Map(after.categories.map((c) => [c.id, c]));
  // The later report's order first (it is the one on screen), then anything
  // only the earlier report had.
  const ids = [...after.categories.map((c) => c.id)];
  for (const c of before.categories) if (!aById.has(c.id)) ids.push(c.id);

  const categories: CategoryDelta[] = [];
  const resolved: FindingChange[] = [];
  const added: FindingChange[] = [];
  const unchanged: FindingChange[] = [];
  let anyText = false;
  for (const id of ids) {
    const b = bById.get(id);
    const a = aById.get(id);
    const d = categoryDelta(b, a);
    categories.push(d);
    const m = matchIssues(b, a);
    if (!m.byCode && (b?.issues.length || a?.issues.length)) anyText = true;
    const tag = (text: string): FindingChange => ({ categoryId: id, category: d.label, text });
    resolved.push(...m.resolved.map(tag));
    added.push(...m.added.map(tag));
    unchanged.push(...m.unchanged.map(tag));
  }

  const scoreDelta =
    before.score !== null && after.score !== null ? after.score - before.score : null;
  const gradeChanged = before.grade !== after.grade;
  const sameContent =
    before.contentHash && after.contentHash ? before.contentHash === after.contentHash : null;
  const nothingChanged =
    scoreDelta === 0 &&
    !gradeChanged &&
    resolved.length === 0 &&
    added.length === 0 &&
    categories.every((c) => c.change === "unchanged" || (c.before === null && c.after === null));

  let summary: string;
  if (sameContent === true) {
    summary = "These two reports are for the same file. Nothing changed.";
  } else if (nothingChanged) {
    summary = "Nothing changed: the score, the grade and every issue are the same in both reports.";
  } else {
    const parts: string[] = [];
    if (scoreDelta === null) parts.push("The scores cannot be compared");
    else if (scoreDelta > 0) parts.push(`The score went up by ${scoreDelta}`);
    else if (scoreDelta < 0) parts.push(`The score went down by ${-scoreDelta}`);
    else parts.push("The score is the same");
    if (before.grade && after.grade) {
      parts.push(
        gradeChanged
          ? `the grade changed from ${before.grade} to ${after.grade}`
          : `the grade is still ${after.grade}`,
      );
    }
    summary =
      `${parts.join(" and ")}. ` +
      `${plural(resolved.length, "issue was", "issues were")} fixed, ` +
      `${plural(added.length, "new issue", "new issues")} appeared, and ` +
      `${plural(unchanged.length, "issue remains", "issues remain")}.`;
  }

  return {
    before: { filename: before.filename, score: before.score, grade: before.grade },
    after: { filename: after.filename, score: after.score, grade: after.grade },
    scoreDelta,
    gradeChanged,
    categories,
    resolved,
    added,
    unchanged,
    matchedBy: anyText ? "text" : "code",
    sameContent,
    nothingChanged,
    differentFilenames: before.filename.toLowerCase() !== after.filename.toLowerCase(),
    differentFormats: !!before.fileType && !!after.fileType && before.fileType !== after.fileType,
    summary,
  };
}

/** "+12 points (improved)", "−5 points (worse)", "no change" — text, with
 *  the sign AND the word, so it never depends on colour. */
export function describeDelta(d: CategoryDelta): string {
  if (d.delta === null) {
    if (d.change === "not scored") {
      if (d.before === null && d.after === null) return "not scored in either report";
      return d.before === null
        ? "scored only in the later report"
        : "scored only in the earlier report";
    }
    return d.change;
  }
  if (d.delta === 0) return "no change";
  const n = Math.abs(d.delta);
  const unit = n === 1 ? "point" : "points";
  return d.delta > 0 ? `+${n} ${unit} (improved)` : `−${n} ${unit} (worse)`;
}

// ---------------------------------------------------------------------------
// Reading an earlier report from a file or a link
// ---------------------------------------------------------------------------

/** Largest JSON file the compare control will read. A real export is a few
 *  hundred kilobytes. */
export const COMPARE_MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_CATEGORIES = 40;
const MAX_FINDINGS = 3000;
const MAX_TEXT = 20_000;

export type ParsedEarlier =
  { ok: true; report: Record<string, any> } | { ok: false; message: string };

const NOT_OURS =
  "That file is not a report exported from this tool. Use the JSON file from a report's “Download Report” options.";

/**
 * Validate the app's own JSON export (utils/exportFormats/json.ts) STRICTLY
 * and turn it back into the result shape toComparable() reads. Anything that
 * is not exactly that export is refused with a sentence, never guessed at.
 * Every string it yields is later rendered as TEXT (never v-html).
 */
export function parseExportedReport(text: string): ParsedEarlier {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, message: "That file is empty." };
  }
  if (text.length > COMPARE_MAX_FILE_BYTES) {
    return { ok: false, message: "That file is too large to be a report from this tool." };
  }
  let v: any;
  try {
    v = JSON.parse(text);
  } catch {
    return {
      ok: false,
      message: "That file is not valid JSON. Choose the JSON export of a report.",
    };
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, message: NOT_OURS };
  const meta = v.reportMeta;
  const file = v.file;
  const score = v.score;
  const okShape =
    meta &&
    typeof meta === "object" &&
    typeof meta.tool === "string" &&
    typeof meta.schemaVersion === "string" &&
    file &&
    typeof file === "object" &&
    typeof file.name === "string" &&
    file.name.length > 0 &&
    file.name.length <= 500 &&
    score &&
    typeof score === "object" &&
    typeof score.overall === "number" &&
    Number.isFinite(score.overall) &&
    score.overall >= 0 &&
    score.overall <= 100 &&
    typeof score.grade === "string" &&
    /^[A-F]$/.test(score.grade) &&
    Array.isArray(v.categories) &&
    v.categories.length > 0 &&
    v.categories.length <= MAX_CATEGORIES;
  if (!okShape) return { ok: false, message: NOT_OURS };

  const categories: Array<Record<string, unknown>> = [];
  let findingCount = 0;
  for (const c of v.categories) {
    const ok =
      c &&
      typeof c === "object" &&
      typeof c.id === "string" &&
      /^[a-z0-9_]{1,60}$/.test(c.id) &&
      typeof c.label === "string" &&
      c.label.length <= 200 &&
      (c.score === null ||
        (typeof c.score === "number" &&
          Number.isFinite(c.score) &&
          c.score >= 0 &&
          c.score <= 100)) &&
      (c.severity === null || c.severity === undefined || typeof c.severity === "string") &&
      Array.isArray(c.findings) &&
      c.findings.every((f: unknown) => typeof f === "string" && f.length <= MAX_TEXT);
    if (!ok) return { ok: false, message: NOT_OURS };
    findingCount += c.findings.length;
    if (findingCount > MAX_FINDINGS) return { ok: false, message: NOT_OURS };
    categories.push({
      id: c.id,
      label: c.label,
      score: c.score,
      severity: c.severity ?? null,
      findings: c.findings,
      // The export writes "not_assessed" for a check the tool did not make.
      notAssessed: c.status === "not_assessed" || c.status === "not-assessed",
    });
  }
  return {
    ok: true,
    report: {
      filename: file.name,
      overallScore: score.overall,
      grade: score.grade,
      categories,
    },
  };
}

/**
 * A share link or a bare report id → the id, or null. The id is 32
 * lowercase hex characters (apps/api/src/routes/reports.ts); a link is
 * accepted from ANY host as long as its path is /report/<id>, because the id
 * is all that is used — the request always goes to this site's own API.
 */
export function reportIdFromInput(input: unknown): string | null {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text || text.length > 2000) return null;
  if (/^[a-f0-9]{32}$/.test(text)) return text;
  const m = /\/report\/([a-f0-9]{32})(?:[/?#]|$)/.exec(text);
  return m ? m[1]! : null;
}
