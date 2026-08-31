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
export function evaluateBestPractices(
  result: unknown,
  catalog: BestPractice[] = CATALOG,
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
      const ctx = buildContext(category, ft, pageCount);
      return { practice, categoryLinks: readHelpLinks(category), ...runDetect(practice, ctx) };
    });
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
