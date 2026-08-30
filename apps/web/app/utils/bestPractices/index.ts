/**
 * The catalog's only import surface.
 *
 * Consumers pass a whole report and get back one row per practice that
 * applies to its format, already evaluated. Everything is narrowed here so a
 * component never has to: /report/[id] renders stored JSON server-side.
 */
import { PDF_PRACTICES } from "./pdf";
import { OFFICE_PRACTICES } from "./office";
import { buildContext, type BestPractice, type BestPracticeResult } from "./types";
import type { FileType } from "@file-audit/shared";

export * from "./types";
export const CATALOG: BestPractice[] = [...PDF_PRACTICES, ...OFFICE_PRACTICES];

export interface EvaluatedPractice extends BestPracticeResult {
  practice: BestPractice;
}

export interface BestPracticeSummary {
  met: number;
  notMet: number;
  notApplicable: number;
  notChecked: number;
  total: number;
}

const FILE_TYPES: FileType[] = ["pdf", "docx", "pptx", "xlsx"];

export function evaluateBestPractices(result: unknown): EvaluatedPractice[] {
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

  return CATALOG.filter((p) => p.formats.includes(ft)).map((practice) => {
    const ctx = buildContext(byId.get(practice.categoryId), ft, pageCount);
    return { practice, ...practice.detect(ctx) };
  });
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
