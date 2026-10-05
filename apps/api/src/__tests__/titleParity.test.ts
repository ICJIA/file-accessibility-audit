/**
 * ONE TITLE, ONE VERDICT, IN EVERY FORMAT (2026-10-05).
 *
 * A title that is a file name or an authoring tool's default does not
 * identify the document — W3C failure F25 for WCAG 2.4.2. PDF has checked
 * that since the legal-only sweep (classifyTitleShape, narrowed 2026-09-02);
 * Word, PowerPoint and Excel never did, so a deck titled "PowerPoint
 * Presentation" — PowerPoint's own default, carried by the agency template in
 * the control corpus — passed as an Office file and failed as its PDF.
 *
 * The same title string must now get the same title score and the same
 * verdict whichever format carries it. Each document is otherwise clean, with
 * a declared language, so only the title can move the category.
 */
import { describe, it, expect } from "vitest";
import { scoreDocument, scoreDocx, scorePptx, scoreXlsx } from "../services/scorer.js";
import type { ScoringResult } from "../services/scorer.js";
import type { DocxAnalysis } from "../services/docxService.js";
import type { PptxAnalysis } from "../services/pptxService.js";
import type { XlsxAnalysis } from "../services/xlsxService.js";
import { classifyTitleShape, isFilenameLikeTitle } from "../services/pdfjsService.js";
import { taggedBaseline } from "./helpers/mockResults.js";

function pdf(title: string): ScoringResult {
  const { qpdf, pdfjs } = taggedBaseline();
  qpdf.displayDocTitle = true; // the title is shown — only its wording is under test
  pdfjs.title = title;
  // Exactly what pdfjsService derives from the title it extracts.
  pdfjs.titleIsToolGenerated = classifyTitleShape(title) === "tool-generated";
  pdfjs.titleLooksLikeFilename = isFilenameLikeTitle(title);
  return scoreDocument(qpdf, pdfjs);
}

function docx(title: string): ScoringResult {
  const analysis: DocxAnalysis = {
    metadata: { title, creator: "x", language: "en-US", pageCount: 2, wordCount: 500 },
    headings: [
      { level: 1, text: "Introduction" },
      { level: 2, text: "Details" },
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
  return scoreDocx(analysis);
}

function pptx(title: string): ScoringResult {
  const analysis: PptxAnalysis = {
    metadata: { title, creator: "x", language: "en-US", slideCount: 2 },
    slides: [
      { index: 1, title: "Welcome", titleIsFirstShape: true, shapeCount: 2 },
      { index: 2, title: "Agenda", titleIsFirstShape: true, shapeCount: 3 },
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
  return scorePptx(analysis);
}

function xlsx(title: string): ScoringResult {
  const analysis: XlsxAnalysis = {
    metadata: { title, creator: "x", sheetCount: 1 },
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
    tables: [{ sheetName: "FY26 Grants", name: "Grants", hasHeaderRow: true }],
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
const ALL = Object.keys(FORMATS) as Format[];

const verdict = (fmt: Format, title: string) => {
  const r = FORMATS[fmt](title);
  const cat = r.categories.find((c) => c.id === "title_language")!;
  const f25 = r.conformance.failures.filter(
    (f) => f.sc === "2.4.2" && f.category === "title_language",
  );
  const advisory = cat.findings.some((f) =>
    /^Advisory — not scored:.*reads like a filename/i.test(f),
  );
  return { score: cat.score, f25: f25.length > 0, advisory };
};

describe("title parity — the same title gets the same verdict in every format", () => {
  const TOOL = ["PowerPoint Presentation", "Final_Report_v3.docx", "Untitled", "Document1"];
  const SHAPED = ["Annual_Report_2024", "FY_22_ICJIA_Annual_Report_7c7ba4f4f0"];
  const DESCRIPTIVE = ["2024 Annual Crime Report", "Task Force Meeting Agenda"];

  for (const t of TOOL) {
    it.each(ALL)(`%s: "${t}" is a tool string — half the title credit, 2.4.2 named`, (fmt) => {
      expect(verdict(fmt, t)).toEqual({ score: 75, f25: true, advisory: false });
    });
  }
  for (const t of SHAPED) {
    it.each(ALL)(`%s: "${t}" still names the document — full credit, advisory only`, (fmt) => {
      expect(verdict(fmt, t)).toEqual({ score: 100, f25: false, advisory: true });
    });
  }
  for (const t of DESCRIPTIVE) {
    it.each(ALL)(`%s: "${t}" is descriptive — full credit, nothing said`, (fmt) => {
      expect(verdict(fmt, t)).toEqual({ score: 100, f25: false, advisory: false });
    });
  }
});
