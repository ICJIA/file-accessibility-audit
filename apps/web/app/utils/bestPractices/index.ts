/**
 * The catalog's only import surface.
 *
 * Consumers pass a whole report and get back one row per practice that
 * applies to its format, already evaluated. Everything is narrowed here so a
 * component never has to: /report/[id] renders stored JSON server-side.
 */
import { PDF_PRACTICES } from "./pdf";
import { OFFICE_PRACTICES } from "./office";
import {
  buildContext,
  type BestPractice,
  type BestPracticeLink,
  type BestPracticeResult,
  type DetectContext,
  type BestPracticeStatus,
} from "./types";
import type { FileType } from "@file-audit/shared";

export * from "./types";
export const CATALOG: BestPractice[] = [...PDF_PRACTICES, ...OFFICE_PRACTICES];

export interface EvaluatedPractice extends BestPracticeResult {
  practice: BestPractice;
  /** The vendor documentation the report's own category carries
   *  (CategoryResult.helpLinks), narrowed to {label, url} string pairs.
   *  Spec §4's third link source. NOT URL-checked here — safeLinks does that
   *  at render time, on both surfaces, through resolveRowLinks. */
  categoryLinks: BestPracticeLink[];
}

export interface BestPracticeSummary {
  met: number;
  notMet: number;
  notApplicable: number;
  notChecked: number;
  total: number;
}

const FILE_TYPES: FileType[] = ["pdf", "docx", "pptx", "xlsx"];

/** A category's helpLinks, narrowed to what a link needs and nothing more.
 *  Everything else about a forged entry (extra keys, a non-string url) is
 *  dropped here; whether the URL may be SHOWN is safeLinks's call, later. */
function readHelpLinks(category: unknown): BestPracticeLink[] {
  const cat =
    category && typeof category === "object" ? (category as Record<string, unknown>) : null;
  const raw = cat?.helpLinks;
  if (!Array.isArray(raw)) return [];
  const out: BestPracticeLink[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { label, url } = entry as Record<string, unknown>;
    if (typeof label === "string" && typeof url === "string") out.push({ label, url });
  }
  return out;
}

/** Spec §2: "the section as a whole is wrapped so one bad practice cannot
 *  take down the page." Every detect() is written to narrow and never throw,
 *  and the suite fuzzes them — but /report/[id] renders attacker-controlled
 *  stored JSON through SSR, where an uncaught throw is a 500 for every
 *  visitor. A throw becomes ONE grey row that says so, not a dead page. */
function runDetect(practice: BestPractice, ctx: DetectContext): BestPracticeResult {
  try {
    return practice.detect(ctx);
  } catch (err) {
    console.error(`[bestPractices] ${practice.id}.detect() threw`, err);
    return {
      status: "not-checked",
      evidence: ["This check could not be completed for this report."],
      reason: "error",
    };
  }
}

/** `catalog` is injectable for tests only — production always evaluates the
 *  full CATALOG. */
export interface EvaluateOptions {
  /** When the payload was analyzed. Live results omit it; /report/[id]
   *  passes the shared row's createdAt (minutes after analysis). */
  analyzedAt?: Date | string | null;
}

/** The era gate. A witness-based MET on a payload analyzed before the
 *  practice's advisory existed is a fabricated green: the analyzer of that
 *  day could not have complained, so the advisory's absence proves nothing.
 *  Found on real stored data (Office checkers shipped 2026-07-01; their
 *  advisories arrived 07-19 and 08-26; reports live 365 days). Only MET is
 *  overridden — NOT MET means the advisory WAS present, and N/A is a document
 *  fact from a line that predates every advisory. */
function eraGate(
  practice: BestPractice,
  ctx: DetectContext,
  outcome: BestPracticeResult,
): BestPracticeResult {
  if (outcome.status !== "met" || !practice.advisorySince || !ctx.analyzedAt) return outcome;
  const since = new Date(practice.advisorySince);
  if (Number.isNaN(since.getTime()) || ctx.analyzedAt >= since) return outcome;
  return {
    status: "not-checked",
    reason: "not-run",
    evidence: [
      `This report was created on ${ctx.analyzedAt.toISOString().slice(0, 10)}, before this check existed (added ${practice.advisorySince}), so it could not have been looked at. Re-run the audit to check it.`,
    ],
  };
}

/**
 * THE SECTION IS EXTRA CREDIT, AND NOTHING ELSE (user's rule, 2026-08-31).
 *
 *   "Best practices should only be things above and beyond WCAG 2.1. If it's
 *    already counted, then it doesn't need to be labelled as a best practice."
 *
 *   "If something is marked 'not checked' in the best practice — but WAS
 *    checked in the actual WCAG score — then don't list it. It's
 *    super-confusing."
 *
 *   "Best practices should only list stuff that MIGHT BE GOOD — not stuff
 *    that's already been checked. Reduce the visual noise. Extra credit — the
 *    student that wants to go above and beyond, past what's already graded."
 *
 * So only two statuses survive: NOT MET (what a reader could still do) and
 * MET (what this document already gets right). Everything else was noise
 * dressed as information, and every attempt to word it made things worse —
 * NOT APPLICABLE said a scored defect did not apply; COUNTED IN YOUR SCORE,
 * sitting beside a practice NAME, said that practice was scored when most of
 * them can never be; NOT CHECKED sat beside a category the same page had just
 * scored 0 and named 1.3.1 against. Three labels in one afternoon, each wrong
 * in a different direction, because the section was being asked to describe
 * things that belong in the action plan.
 *
 * A row that cannot be judged is not extra credit a student could attempt, so
 * it is not listed. A defect the grade already counted is not extra credit
 * either — it is the grade. What is left is a short list of things worth
 * doing and things already done, which is what the heading has always
 * promised.
 *
 * The catalog still evaluates every practice: detect() reports what it found,
 * and this decides what is worth a reader's attention. Sabotage-tested both
 * ways — a scored defect must never reappear here under any label.
 */
function isExtraCredit(row: { status: BestPracticeStatus }): boolean {
  return row.status === "met" || row.status === "not-met";
}

export function evaluateBestPractices(
  result: unknown,
  catalog: BestPractice[] = CATALOG,
  opts: EvaluateOptions = {},
): EvaluatedPractice[] {
  const r = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
  if (!r) return [];

  const fileType = r.fileType;
  if (typeof fileType !== "string" || !FILE_TYPES.includes(fileType as FileType)) return [];
  const ft = fileType as FileType;

  // A page-audit row shares the shared_reports table and carries no
  // categories. No categories, no evidence, no section.
  const categories = Array.isArray(r.categories) ? r.categories : [];
  if (categories.length === 0) return [];

  const pageCount = typeof r.pageCount === "number" ? r.pageCount : 0;
  const byId = new Map<string, unknown>();
  for (const c of categories) {
    if (c && typeof c === "object") {
      const id = (c as Record<string, unknown>).id;
      if (typeof id === "string") byId.set(id, c);
    }
  }

  return catalog
    .filter((p) => p.formats.includes(ft))
    .map((practice) => {
      const category = byId.get(practice.categoryId);
      const ctx = buildContext(category, ft, pageCount, opts.analyzedAt ?? null);
      return {
        practice,
        categoryLinks: readHelpLinks(category),
        ...eraGate(practice, ctx, runDetect(practice, ctx)),
      };
    })
    .filter(isExtraCredit);
}

// NOT MET first (the actionable ones), then MET, then NOT APPLICABLE, then
// NOT CHECKED last — never by severity, because nothing here has one. The
// ONE place this order is defined: BestPracticesSection.vue (the on-screen
// accordion) and printablePlan.ts (the printout) both call sortBestPractices
// rather than each keeping its own copy, so the same document can never
// show its practices in two different orders depending on which surface a
// reader is looking at.
export const BEST_PRACTICE_STATUS_ORDER: Record<BestPracticeStatus, number> = {
  "not-met": 0,
  met: 1,
  "not-applicable": 2,
  "not-checked": 3,
};

/** Sorted by status per BEST_PRACTICE_STATUS_ORDER. Array#sort is stable in
 *  every engine this app ships on, so ties keep the catalog's own order
 *  within a status. Returns a new array; does not mutate `rows`. */
export function sortBestPractices<T extends { status: BestPracticeStatus }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => BEST_PRACTICE_STATUS_ORDER[a.status] - BEST_PRACTICE_STATUS_ORDER[b.status],
  );
}

export function summarizeBestPractices(rows: EvaluatedPractice[]): BestPracticeSummary {
  const s: BestPracticeSummary = {
    met: 0,
    notMet: 0,
    notApplicable: 0,
    notChecked: 0,
    total: rows.length,
  };
  for (const r of rows) {
    if (r.status === "met") s.met++;
    else if (r.status === "not-met") s.notMet++;
    else if (r.status === "not-applicable") s.notApplicable++;
    else s.notChecked++;
  }
  return s;
}

/** Not-scored lines from categories NO practice for this format reads —
 *  today, for PDF: alt_text, color_contrast and form_accessibility (the
 *  static-XFA caveat lives there). Before this section existed the plan's
 *  "Above and beyond" group listed every such line; narrowing that group to
 *  veraPDF's verdict alone silently dropped them from the Visual view.
 *  BestPracticesSection renders these under "Also noted in this report" so
 *  nothing the analyzer chose to say goes unsaid. Same narrowing as
 *  evaluateBestPractices; never throws. */
export function uncoveredNotScored(result: unknown): Array<{ label: string; text: string }> {
  const r = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
  if (!r) return [];
  const fileType = r.fileType;
  if (typeof fileType !== "string" || !FILE_TYPES.includes(fileType as FileType)) return [];
  const covered = new Set(
    CATALOG.filter((p) => p.formats.includes(fileType as FileType)).map((p) => p.categoryId),
  );
  const categories = Array.isArray(r.categories) ? r.categories : [];
  const out: Array<{ label: string; text: string }> = [];
  for (const c of categories) {
    if (!c || typeof c !== "object") continue;
    const cat = c as Record<string, unknown>;
    if (typeof cat.id !== "string" || covered.has(cat.id)) continue;
    const ctx = buildContext(cat, fileType as FileType, 0);
    const label = typeof cat.label === "string" ? cat.label : cat.id;
    for (const text of ctx.notScored) out.push({ label, text });
  }
  return out;
}
