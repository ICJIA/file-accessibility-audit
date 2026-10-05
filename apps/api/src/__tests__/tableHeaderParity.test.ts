/**
 * ONE DEFECT, ONE SEVERITY, IN EVERY FORMAT (2026-10-05).
 *
 * A data table whose header row is not marked fails WCAG 1.3.1 the same way
 * (W3C failure F91) whichever program made the file. It must therefore land
 * in the same severity band — and so under the same grade ceiling — in a
 * PDF, a Word document, a PowerPoint deck, and an Excel workbook.
 *
 * Found auditing a real Word agenda that graded D: every category scored 100
 * except one unheadered roll-call table. The same defect scored Critical in
 * Word and PowerPoint (30 → capped 69/D), Moderate in PDF (45 → capped 79/C)
 * and Minor in Excel (100 − 30 = 70 → capped 89/B). The Office values were
 * written on 2026-07-01/02, five weeks before the severity cap (2026-08-07)
 * turned a category number into a grade ceiling, and nobody re-checked them.
 *
 * The PDF rubric is the reference: it is the one built from components (40
 * header-presence points of 100), and it already lands a lone TH-less table
 * at 45. Each case below is an otherwise-clean document, so the table is the
 * only thing that can move the grade.
 */
import { describe, it, expect } from "vitest";
import { scoreDocument, scoreDocx, scorePptx, scoreXlsx } from "../services/scorer.js";
import type { DocxAnalysis } from "../services/docxService.js";
import type { PptxAnalysis } from "../services/pptxService.js";
import type { XlsxAnalysis } from "../services/xlsxService.js";
import type { ScoringResult } from "../services/scorer.js";
import { makeTable, taggedBaseline } from "./helpers/mockResults.js";

// ── One clean document per format, varying only its tables ────────────────

// `extraNonData` appends one table each format treats as NOT a data table —
// the case where averaging over every table used to dilute the penalty.
function pdf(tables: Array<{ headed: boolean }>, extraNonData = false): ScoringResult {
  const { qpdf, pdfjs } = taggedBaseline();
  qpdf.tables = tables.map(({ headed }) =>
    makeTable({
      hasHeaders: headed,
      headerCount: headed ? 2 : 0,
      dataCellCount: headed ? 4 : 6,
      hasRowStructure: true,
      rowCount: 3,
      columnCounts: [2, 2, 2],
      hasConsistentColumns: true,
      // A marked header row along one edge, nothing spanned — WCAG-complete
      // without /Scope under the 2026-08-29 split.
      simpleHeaderLayout: headed,
    }),
  );
  if (extraNonData) {
    // Single-column: layout to the PDF rubric, never scored.
    qpdf.tables.push(
      makeTable({
        dataCellCount: 3,
        hasRowStructure: true,
        rowCount: 3,
        columnCounts: [1, 1, 1],
        hasConsistentColumns: true,
      }),
    );
  }
  return scoreDocument(qpdf, pdfjs);
}

/** A clean Word analysis with no tables; each case adds its own. */
function docxBase(): DocxAnalysis {
  return {
    metadata: {
      title: "Task Force Meeting Agenda",
      creator: "Agency",
      language: "en-US",
      pageCount: 2,
      wordCount: 500,
    },
    headings: [
      { level: 1, text: "Task Force" },
      { level: 2, text: "Meeting Agenda" },
    ],
    fakeHeadings: [],
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 4, unresolvedRuns: 0, failing: [] },
    paragraphCount: 6,
    emptyHeadingCount: 0,
    parse: { documentOk: true, stylesState: "ok", coreState: "ok" },
  };
}

/** A clean PowerPoint analysis with no tables; each case adds its own. */
function pptxBase(): PptxAnalysis {
  return {
    metadata: { title: "Deck", creator: "x", language: "en-US", slideCount: 2 },
    slides: [
      { index: 1, title: "Welcome", titleIsFirstShape: true, shapeCount: 2 },
      { index: 2, title: "Roll call", titleIsFirstShape: true, shapeCount: 3 },
    ],
    fakeHeadings: [],
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    hasMedia: false,
    shapeCount: 5,
  };
}

function docx(tables: Array<{ headed: boolean }>, extraNonData = false): ScoringResult {
  const analysis: DocxAnalysis = {
    metadata: {
      title: "Task Force Meeting Agenda",
      creator: "Agency",
      language: "en-US",
      pageCount: 2,
      wordCount: 500,
    },
    headings: [
      { level: 1, text: "Task Force" },
      { level: 2, text: "Meeting Agenda" },
    ],
    fakeHeadings: [],
    images: [],
    // Bordered grids (looksLikeLayout false): real data tables to the scorer.
    tables: [
      ...tables.map(({ headed }) => ({
        hasHeaderRow: headed,
        rowCount: 15,
        colCount: 3,
        hasNestedTable: false,
        looksLikeLayout: false,
        mergedCellCount: 0,
      })),
      // A borderless, unstyled grid: layout, never scored.
      ...(extraNonData
        ? [
            {
              hasHeaderRow: false,
              rowCount: 3,
              colCount: 2,
              hasNestedTable: false,
              looksLikeLayout: true,
              mergedCellCount: 0,
            },
          ]
        : []),
    ],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 4, unresolvedRuns: 0, failing: [] },
    paragraphCount: 6,
    emptyHeadingCount: 0,
    parse: { documentOk: true, stylesState: "ok", coreState: "ok" },
  };
  return scoreDocx(analysis);
}

function pptx(tables: Array<{ headed: boolean }>, extraNonData = false): ScoringResult {
  const analysis: PptxAnalysis = {
    metadata: { title: "Deck", creator: "x", language: "en-US", slideCount: 2 },
    slides: [
      { index: 1, title: "Welcome", titleIsFirstShape: true, shapeCount: 2 },
      { index: 2, title: "Roll call", titleIsFirstShape: true, shapeCount: 3 },
    ],
    fakeHeadings: [],
    images: [],
    tables: [
      ...tables.map(({ headed }) => ({ hasHeaderRow: headed, rowCount: 15, colCount: 3 })),
      // A one-row strip: below the 2×2 data-table floor, never scored.
      ...(extraNonData ? [{ hasHeaderRow: false, rowCount: 1, colCount: 3 }] : []),
    ],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    hasMedia: false,
    shapeCount: 5,
  };
  return scorePptx(analysis);
}

function xlsx(tables: Array<{ headed: boolean }>, extraNonData = false): ScoringResult {
  const analysis: XlsxAnalysis = {
    metadata: { title: "Ledger", creator: "x", sheetCount: 1 },
    sheets: [
      {
        name: "FY26 Grants",
        hidden: false,
        defaultNamed: false,
        mergedRangeCount: 0,
        usedRangeCellCount: 80,
        hasDefinedTable: true,
      },
    ],
    tables: [
      ...tables.map(({ headed }, i) => ({
        sheetName: "FY26 Grants",
        name: `Table${i + 1}`,
        hasHeaderRow: headed,
        columnCount: 3,
      })),
      // A single-column list: no data-cell/header association, never scored.
      ...(extraNonData
        ? [{ sheetName: "FY26 Grants", name: "List", hasHeaderRow: false, columnCount: 1 }]
        : []),
    ],
    images: [],
    links: [],
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    totalCellsWithValue: 40,
    textBoxCount: 0,
  };
  return scoreXlsx(analysis);
}

const FORMATS = { pdf, docx, pptx, xlsx } as const;
type Format = keyof typeof FORMATS;
const OFFICE: Format[] = ["docx", "pptx", "xlsx"];

const tableCat = (r: ScoringResult) => r.categories.find((c) => c.id === "table_markup")!;
const run = (fmt: Format, tables: Array<{ headed: boolean }>) => FORMATS[fmt](tables);
const withNonDataTable = (fmt: Format, tables: Array<{ headed: boolean }>) =>
  FORMATS[fmt](tables, true);

describe("table-header parity — the same 1.3.1 failure scores the same in every format", () => {
  it("the PDF rubric — the reference — lands a lone TH-less table at 45, Moderate", () => {
    const cat = tableCat(run("pdf", [{ headed: false }]));
    expect(cat.score).toBe(45);
    expect(cat.severity).toBe("Moderate");
  });

  it.each(OFFICE)("%s: a lone unheadered data table scores exactly what PDF does", (fmt) => {
    const reference = tableCat(run("pdf", [{ headed: false }]));
    const cat = tableCat(run(fmt, [{ headed: false }]));
    expect(cat.score).toBe(reference.score);
    expect(cat.severity).toBe(reference.severity);
  });

  it.each(Object.keys(FORMATS) as Format[])(
    "%s: an otherwise-clean document carrying that table caps at 79/C — the Moderate ceiling",
    (fmt) => {
      const r = run(fmt, [{ headed: false }]);
      expect(r.overallScore).toBe(79);
      expect(r.grade).toBe("C");
    },
  );

  it.each(Object.keys(FORMATS) as Format[])(
    "%s: the same document with the header row marked is clean in table markup",
    (fmt) => {
      const cat = tableCat(run(fmt, [{ headed: true }]));
      expect(cat.score).toBe(100);
    },
  );

  it.each(OFFICE)("%s: two unheadered tables score what one does — no per-table pile-up", (fmt) => {
    // Excel subtracted 30 PER TABLE, so two headerless tables fell to 40 and
    // four to 0 while Word and PowerPoint averaged per table. One rule.
    const one = tableCat(run(fmt, [{ headed: false }]));
    const two = tableCat(run(fmt, [{ headed: false }, { headed: false }]));
    expect(two.score).toBe(one.score);
  });

  it.each(Object.keys(FORMATS) as Format[])(
    "%s: one headed + one unheadered table lands in the same band in every format",
    (fmt) => {
      const reference = tableCat(run("pdf", [{ headed: true }, { headed: false }]));
      const cat = tableCat(run(fmt, [{ headed: true }, { headed: false }]));
      expect(cat.severity).toBe(reference.severity);
    },
  );

  it.each(Object.keys(FORMATS) as Format[])(
    "%s: a non-data table beside the unheadered one does not dilute it",
    (fmt) => {
      // PDF scores only its data tables (a single-column table is layout and
      // excluded). Word and PowerPoint averaged over EVERY table, counting a
      // layout grid as a passing 100 — so the same unheadered table scored 73
      // (Minor) beside a layout grid and 45 (Moderate) alone.
      const lone = tableCat(run(fmt, [{ headed: false }]));
      const withLayout = tableCat(withNonDataTable(fmt, [{ headed: false }]));
      expect(withLayout.score).toBe(lone.score);
    },
  );

  it.each(["docx", "pptx"] as const)(
    "%s: a bare layout grid — no style, borders, shading or header mark — is never scored",
    (fmt) => {
      // Word's rule since 2026-08-29; PowerPoint adopted it 2026-10-05.
      const r =
        fmt === "docx"
          ? scoreDocx({
              ...docxBase(),
              tables: [
                {
                  hasHeaderRow: false,
                  rowCount: 3,
                  colCount: 2,
                  hasNestedTable: false,
                  looksLikeLayout: true,
                  mergedCellCount: 0,
                },
              ],
            })
          : scorePptx({
              ...pptxBase(),
              tables: [{ hasHeaderRow: false, rowCount: 3, colCount: 2, looksLikeLayout: true }],
            });
      expect(tableCat(r).score).toBe(100);
      expect(r.conformance.failures.some((f) => f.category === "table_markup")).toBe(false);
    },
  );

  it.each(Object.keys(FORMATS) as Format[])(
    "%s: the unheadered table is attributed to WCAG 1.3.1 in the verdict",
    (fmt) => {
      const r = run(fmt, [{ headed: false }]);
      expect(
        r.conformance.failures.some((f) => f.sc === "1.3.1" && f.category === "table_markup"),
      ).toBe(true);
    },
  );
});
