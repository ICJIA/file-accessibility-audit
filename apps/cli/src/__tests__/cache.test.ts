import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initCache, upsertResult, getAllSuccessful } from "../lib/cache.js";
import { generateCsv } from "../lib/csv.js";
import { generateHtml } from "../lib/html.js";
import type { Publication } from "../lib/graphql.js";
import type { AnalysisResult } from "../../../api/src/services/pdfAnalyzer.js";
import type { CategoryResult, ScoreProfileResult } from "../../../api/src/services/scorer.js";

// ---------------------------------------------------------------------------
// RB3-1 [IMPORTANT, pre-merge re-audit]: publist's cache + CSV + HTML
// enumerate category ids off a hand-synced list (CATEGORY_IDS, duplicated
// between cache.ts and csv.ts) that predates the pptx/xlsx checkers. Both
// copies stopped at the 12 original PDF/DOCX categories, so `slide_titles`
// (PPTX) and `sheet_names` (XLSX) — each the HIGHEST-weighted category for
// its format (PPTX.SCORING_WEIGHTS.slide_titles = 0.18,
// XLSX.SCORING_WEIGHTS.sheet_names = 0.18) — were silently dropped: never
// written to the cache DB, never in the CSV header/row, never in the HTML
// report's per-row category data.
//
// This is a round-trip test (cache.ts had none before this fix): construct a
// pptx-shaped and an xlsx-shaped AnalysisResult (mirroring the real shape
// scorePptx()/scoreXlsx() in scorer.ts produce), persist each via
// upsertResult, read the rows back, and confirm slide_titles/sheet_names
// survive into generateCsv/generateHtml. RED before the fix: the DB has no
// slide_titles_*/sheet_names_* columns, so upsertResult's per-category loop
// (`for (const catId of CATEGORY_IDS) ...`) never even attempts to write
// them — the values are silently dropped, not merely nulled.
// ---------------------------------------------------------------------------

function makePub(fileURL: string, title: string): Publication {
  return {
    id: fileURL,
    title,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    fileURL,
    publicationDate: "2026-01-01",
    pubType: "Report",
    summary: null,
    tags: null,
  };
}

function makeCategory(overrides: Partial<CategoryResult> & { id: string }): CategoryResult {
  return {
    label: overrides.id,
    weight: 0.1,
    score: 100,
    grade: "A",
    severity: "Pass",
    findings: [],
    explanation: "",
    helpLinks: [],
    ...overrides,
  };
}

function makeProfile(
  categories: CategoryResult[],
  overallScore: number,
  grade: string,
): ScoreProfileResult {
  return {
    mode: "strict",
    label: "Strict semantic score (WCAG + IITAA §E205.4)",
    description: "Test profile",
    overallScore,
    grade,
    executiveSummary: "Test executive summary",
    categoryScores: Object.fromEntries(categories.map((c) => [c.id, c.score])),
    categories,
  };
}

function makePptxResult(): AnalysisResult {
  const categories: CategoryResult[] = [
    makeCategory({ id: "text_extractability", score: 100 }),
    makeCategory({ id: "title_language", score: 100 }),
    makeCategory({
      id: "slide_titles",
      label: "Slide Titles",
      score: 82,
      grade: "B",
      severity: "Minor",
    }),
    makeCategory({ id: "alt_text", score: 90 }),
  ];
  const profile = makeProfile(categories, 91, "A");
  return {
    overallScore: 91,
    grade: "A",
    isScanned: false,
    executiveSummary: "Test PPTX summary",
    categories,
    warnings: [],
    scoringMode: "strict",
    scoreProfiles: { strict: profile, remediation: profile },
    conformance: {
      status: "no-automated-failures",
      failures: [],
      notAssessed: [],
      headline: "No automated failures found.",
    },
    filename: "sample.pptx",
    pageCount: 5,
    fileType: "pptx",
  } as AnalysisResult;
}

function makeXlsxResult(): AnalysisResult {
  const categories: CategoryResult[] = [
    makeCategory({ id: "text_extractability", score: 100 }),
    makeCategory({ id: "title_language", score: 100 }),
    makeCategory({
      id: "sheet_names",
      label: "Sheet Names",
      score: 75,
      grade: "C",
      severity: "Minor",
    }),
    makeCategory({ id: "table_markup", score: 80, grade: "B" }),
  ];
  const profile = makeProfile(categories, 84, "B");
  return {
    overallScore: 84,
    grade: "B",
    isScanned: false,
    executiveSummary: "Test XLSX summary",
    categories,
    warnings: [],
    scoringMode: "strict",
    scoreProfiles: { strict: profile, remediation: profile },
    conformance: {
      status: "no-automated-failures",
      failures: [],
      notAssessed: [],
      headline: "No automated failures found.",
    },
    filename: "sample.xlsx",
    pageCount: 1,
    fileType: "xlsx",
  } as AnalysisResult;
}

describe("cache.ts round-trip: pptx/xlsx categories survive upsertResult -> CSV/HTML (RB3-1)", () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "a11y-audit-cache-test-"));
    db = initCache(dir);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists slide_titles (pptx) and sheet_names (xlsx) scores/grades/severities, and renders them in the CSV and HTML reports", () => {
    const pptxPub = makePub("https://example.gov/deck.pptx", "Sample Deck");
    const xlsxPub = makePub("https://example.gov/book.xlsx", "Sample Book");

    upsertResult(db, pptxPub, makePptxResult());
    upsertResult(db, xlsxPub, makeXlsxResult());

    const rows = getAllSuccessful(db);
    expect(rows).toHaveLength(2);

    const pptxRow = rows.find((r) => r.file_url === pptxPub.fileURL)!;
    const xlsxRow = rows.find((r) => r.file_url === xlsxPub.fileURL)!;
    expect(pptxRow).toBeTruthy();
    expect(xlsxRow).toBeTruthy();

    // --- cache DB round-trip ---
    expect((pptxRow as any).slide_titles_score).toBe(82);
    expect((pptxRow as any).slide_titles_grade).toBe("B");
    expect((pptxRow as any).slide_titles_severity).toBe("Minor");
    expect((xlsxRow as any).sheet_names_score).toBe(75);
    expect((xlsxRow as any).sheet_names_grade).toBe("C");
    expect((xlsxRow as any).sheet_names_severity).toBe("Minor");

    // A pre-existing shared category still round-trips too (no regression).
    expect((pptxRow as any).text_extractability_score).toBe(100);
    expect((xlsxRow as any).text_extractability_score).toBe(100);

    // --- CSV ---
    const csv = generateCsv(rows);
    expect(csv).toContain("Slide Titles");
    expect(csv).toContain("Sheet Names");
    const pptxLine = csv.split("\n").find((l) => l.includes("Sample Deck"));
    expect(pptxLine).toBeTruthy();
    expect(pptxLine).toContain("82");
    const xlsxLine = csv.split("\n").find((l) => l.includes("Sample Book"));
    expect(xlsxLine).toBeTruthy();
    expect(xlsxLine).toContain("75");

    // --- HTML ---
    const html = generateHtml(rows, new Date("2026-01-01"));
    expect(html).toContain("Slide Titles");
    expect(html).toContain("Sheet Names");
    // Per-row category data is embedded as JSON for client-side rendering —
    // confirm the actual score values made it into the page, not just the
    // column headers.
    expect(html).toContain('"slide_titles":{"s":82');
    expect(html).toContain('"sheet_names":{"s":75');
  });
});
