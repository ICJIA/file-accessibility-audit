import { describe, it, expect } from "vitest";
import { buildAdobeParityReport } from "../services/scoring/adobeParity.js";
import type { QpdfResult, TableAnalysis } from "../services/qpdfService.js";
import type { PdfjsResult } from "../services/pdfjsService.js";

function makeQpdf(overrides: Partial<QpdfResult> = {}): QpdfResult {
  return {
    hasStructTree: false,
    hasLang: false,
    lang: null,
    hasOutlines: false,
    outlineCount: 0,
    outlineTitles: [],
    hasAcroForm: false,
    formFields: [],
    images: [],
    imageObjectCount: 0,
    headings: [],
    tables: [],
    lists: [],
    paragraphCount: 0,
    hasMarkInfo: false,
    isMarkedContent: false,
    hasRoleMap: false,
    roleMapEntries: [],
    tabOrderPages: 0,
    totalPageCount: 0,
    langSpans: [],
    fonts: [],
    hasPdfUaIdentifier: false,
    pdfUaPart: null,
    artifactCount: 0,
    actualTextCount: 0,
    expansionTextCount: 0,
    structTreeDepth: 0,
    contentOrder: [],
    structTreeMcidsByPage: {},
    error: null,
    ...overrides,
  };
}

function makeTable(overrides: Partial<TableAnalysis> = {}): TableAnalysis {
  return {
    hasHeaders: true,
    headerCount: 3,
    dataCellCount: 9,
    hasScope: true,
    scopeMissingCount: 0,
    hasRowStructure: true,
    rowCount: 4,
    hasNestedTable: false,
    hasCaption: false,
    hasConsistentColumns: true,
    columnCounts: [3, 3, 3, 3],
    hasHeaderAssociation: true,
    ...overrides,
  };
}

function makePdfjs(overrides: Partial<PdfjsResult> = {}): PdfjsResult {
  return {
    pageCount: 1,
    hasText: false,
    textLength: 0,
    title: null,
    author: null,
    subject: null,
    lang: null,
    hasOutlines: false,
    outlineCount: 0,
    links: [],
    imageCount: 0,
    emptyPages: [],
    metadata: {
      creator: null,
      producer: null,
      creationDate: null,
      modDate: null,
      pdfVersion: null,
      isEncrypted: false,
      keywords: null,
      author: null,
      subject: null,
      pageCount: 1,
    },
    contentStreamMcidsByPage: {},
    error: null,
    ...overrides,
  };
}

describe("buildAdobeParityReport", () => {
  it("always emits exactly 32 rules in Adobe's native grouping", () => {
    const report = buildAdobeParityReport(makeQpdf(), makePdfjs());
    expect(report.rules).toHaveLength(32);
    expect(report.summary.total).toBe(32);

    const byCategory = report.rules.reduce<Record<string, number>>(
      (acc, r) => {
        acc[r.category] = (acc[r.category] ?? 0) + 1;
        return acc;
      },
      {},
    );
    expect(byCategory).toEqual({
      Document: 8,
      "Page Content": 9,
      Forms: 2,
      "Alternate Text": 5,
      Tables: 5,
      Lists: 2,
      Headings: 1,
    });
  });

  it("reproduces the ILHEAL 'Potemkin-tagged' case: MarkInfo=true but empty tree", () => {
    // Matches actual signals from controls/ILHEALSFallWinter2022FINAL-remediated.pdf:
    // StructTreeRoot exists, MarkInfo=true, lang set, tab order set, but the
    // structure tree is flat (depth=0) with 0 <P>, 0 headings, 0 figures.
    // No /Info/Title. 4 raster images painted but none tagged as <Figure>.
    const qpdf = makeQpdf({
      hasStructTree: true,
      hasLang: true,
      lang: "en",
      hasMarkInfo: true,
      isMarkedContent: true,
      tabOrderPages: 4,
      totalPageCount: 4,
      structTreeDepth: 0,
      paragraphCount: 0,
      headings: [],
      images: [],
      tables: [],
      lists: [],
      formFields: [],
      fonts: [
        { name: "Poppins-Regular", embedded: true },
        { name: "Poppins-Bold", embedded: true },
      ],
    });
    const pdfjs = makePdfjs({
      pageCount: 4,
      hasText: true,
      textLength: 9948,
      title: null,
      lang: "en",
      imageCount: 4,
      links: [{ url: "https://example.com", text: "link" }],
    });

    const report = buildAdobeParityReport(qpdf, pdfjs);

    // Key vacuous passes: everything derived from 0 tables, 0 lists, 0 forms,
    // 0 figures, 0 headings plus any vacuous "tagged multimedia / scripts /
    // flicker / timed responses" assumptions.
    expect(report.summary.vacuousPasses).toBeGreaterThanOrEqual(15);

    // Tagged PDF must be a *vacuous* pass on this file (StructTreeRoot
    // exists, but tree is empty).
    const taggedPdf = report.rules.find((r) => r.id === "tagged_pdf")!;
    expect(taggedPdf.status).toBe("passed");
    expect(taggedPdf.vacuous).toBe(true);
    expect(taggedPdf.note).toMatch(/flat|empty/i);

    // Tagged content must be vacuous here too — MarkInfo=true but no tags.
    const taggedContent = report.rules.find((r) => r.id === "tagged_content")!;
    expect(taggedContent.status).toBe("passed");
    expect(taggedContent.vacuous).toBe(true);

    // Figures alternate text must be vacuous AND the note must surface the
    // 4 painted-but-untagged images.
    const figuresAlt = report.rules.find(
      (r) => r.id === "figures_alternate_text",
    )!;
    expect(figuresAlt.status).toBe("passed");
    expect(figuresAlt.vacuous).toBe(true);
    expect(figuresAlt.note).toMatch(/4 raster image/);

    // Appropriate nesting passes vacuously (0 headings).
    const nesting = report.rules.find((r) => r.id === "appropriate_nesting")!;
    expect(nesting.status).toBe("passed");
    expect(nesting.vacuous).toBe(true);

    // Title: no /Info/Title — this tool can't determine Acrobat's verdict
    // without ViewerPreferences, so it should be "not_computed".
    const title = report.rules.find((r) => r.id === "title")!;
    expect(title.status).toBe("not_computed");
    expect(title.note).toMatch(/DisplayDocTitle|ViewerPreferences/);
  });

  it("reproduces the WomenInPolicing case: well-tagged doc with real figures, tables, and headings", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      hasLang: true,
      lang: "en-US",
      hasMarkInfo: true,
      isMarkedContent: true,
      tabOrderPages: 37,
      totalPageCount: 37,
      structTreeDepth: 5,
      paragraphCount: 666,
      hasOutlines: true,
      outlineCount: 9,
      headings: Array.from({ length: 8 }, () => ({
        level: "H1",
        tag: "/H1",
      })),
      images: [
        { ref: "240 0 R", hasAlt: true, altText: "Table (page 37)" },
        { ref: "251 0 R", hasAlt: true, altText: "Table (page 1)" },
      ],
      tables: [
        makeTable({ hasScope: false, scopeMissingCount: 14 }),
        makeTable({ hasScope: false, scopeMissingCount: 6 }),
      ],
      lists: [
        {
          itemCount: 4,
          hasLabels: false,
          hasBodies: true,
          isWellFormed: false,
          nestingDepth: 0,
        },
        {
          itemCount: 4,
          hasLabels: false,
          hasBodies: true,
          isWellFormed: false,
          nestingDepth: 0,
        },
      ],
      fonts: [
        { name: "A+Calibri", embedded: true },
        { name: "TimesNewRomanPSMT", embedded: false },
      ],
    });
    const pdfjs = makePdfjs({
      pageCount: 37,
      hasText: true,
      textLength: 86534,
      title: null,
      lang: "en-US",
      imageCount: 4,
      links: [
        { url: "https://example.com/a", text: "link a" },
        { url: "https://example.com/b", text: "link b" },
      ],
    });

    const report = buildAdobeParityReport(qpdf, pdfjs);

    // Figures alt text: NOT vacuous here — real tagged figures exist.
    const figures = report.rules.find(
      (r) => r.id === "figures_alternate_text",
    )!;
    expect(figures.vacuous).toBe(false);
    expect(figures.status).toBe("passed"); // all have alt

    // Lists: real lists present and malformed (no Lbl) — should FAIL.
    const lbl = report.rules.find((r) => r.id === "lbl_and_lbody")!;
    expect(lbl.vacuous).toBe(false);
    expect(lbl.status).toBe("failed");

    // Headers: tables exist with TH — pass, not vacuous.
    const headers = report.rules.find((r) => r.id === "headers")!;
    expect(headers.vacuous).toBe(false);
    expect(headers.status).toBe("passed");

    // Appropriate nesting: headings exist — not vacuous.
    const nesting = report.rules.find((r) => r.id === "appropriate_nesting")!;
    expect(nesting.vacuous).toBe(false);
    expect(nesting.note).toMatch(/multiple <H1>|does not penalize/i);

    // Character encoding: with a non-embedded font, must NOT be a direct
    // pass — should drop to not_computed with a note.
    const encoding = report.rules.find((r) => r.id === "character_encoding")!;
    expect(encoding.status).toBe("not_computed");
  });

  it("always reports 'Summary' as skipped and 'Logical Reading Order' + 'Color contrast' as manual", () => {
    const report = buildAdobeParityReport(makeQpdf(), makePdfjs());
    expect(report.rules.find((r) => r.id === "summary")!.status).toBe(
      "skipped",
    );
    expect(
      report.rules.find((r) => r.id === "logical_reading_order")!.status,
    ).toBe("manual");
    expect(report.rules.find((r) => r.id === "color_contrast")!.status).toBe(
      "manual",
    );
  });

  it("fails 'Tagged PDF' when there is no StructTreeRoot", () => {
    const report = buildAdobeParityReport(
      makeQpdf({ hasStructTree: false }),
      makePdfjs(),
    );
    const r = report.rules.find((r) => r.id === "tagged_pdf")!;
    expect(r.status).toBe("failed");
    expect(r.vacuous).toBe(false);
  });

  it("never aggregates into a single Adobe score — summary fields are raw counts only", () => {
    const report = buildAdobeParityReport(makeQpdf(), makePdfjs());
    const keys = Object.keys(report.summary).sort();
    expect(keys).toEqual(
      [
        "failed",
        "manual",
        "notComputed",
        "passed",
        "skipped",
        "total",
        "vacuousPasses",
      ].sort(),
    );
  });
});
