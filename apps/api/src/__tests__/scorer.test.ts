import { describe, it, expect } from "vitest";
import { scoreDocument, type CategoryResult, type ScoringResult } from "../services/scorer.js";
import type { QpdfResult, TableAnalysis } from "../services/qpdfService.js";
import type { PdfjsResult } from "../services/pdfjsService.js";
import { generateSummary } from "../services/scoring/summary.js";
import type { ConformanceVerdict } from "../services/scoring/conformance.js";
import { WCAG } from "#config";

// ---------------------------------------------------------------------------
// Helpers to build mock data
// ---------------------------------------------------------------------------

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
    isEncrypted: false,
    accessibilityAllowed: null,
    displayDocTitle: null,
    hasXfa: false,
    needsRendering: false,
    suspectsFlag: false,
    structTreeDepth: 0,
    contentOrder: [],
    structTreeMcidsByPage: {},
    error: null,
    ...overrides,
  };
}

function makeTable(overrides: Partial<TableAnalysis> = {}): TableAnalysis {
  return {
    hasHeaders: false,
    headerCount: 0,
    dataCellCount: 0,
    hasScope: false,
    scopeMissingCount: 0,
    hasRowStructure: false,
    rowCount: 0,
    hasNestedTable: false,
    hasCaption: false,
    hasConsistentColumns: null,
    columnCounts: [],
    hasHeaderAssociation: false,
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
    error: null,
    contentStreamMcidsByPage: {},
    ...overrides,
  };
}

/** Build a fully-accessible PDF mock (all categories score 100). */
function fullyAccessible(): { qpdf: QpdfResult; pdfjs: PdfjsResult } {
  return {
    qpdf: makeQpdf({
      hasStructTree: true,
      hasLang: true,
      lang: "en-US",
      displayDocTitle: true,
      hasOutlines: true,
      outlineCount: 5,
      hasMarkInfo: true,
      isMarkedContent: true,
      tabOrderPages: 20,
      totalPageCount: 20,
      hasPdfUaIdentifier: true,
      pdfUaPart: "1",
      artifactCount: 4,
      actualTextCount: 1,
      expansionTextCount: 1,
      headings: [
        { level: "H1", tag: "/H1" },
        { level: "H2", tag: "/H2" },
        { level: "H3", tag: "/H3" },
      ],
      images: [
        { ref: "10 0 R", hasAlt: true },
        { ref: "11 0 R", hasAlt: true },
      ],
      tables: [
        makeTable({
          hasHeaders: true,
          headerCount: 3,
          dataCellCount: 9,
          hasScope: true,
          scopeMissingCount: 0,
          hasRowStructure: true,
          rowCount: 4,
          hasCaption: true,
          hasConsistentColumns: true,
          columnCounts: [3, 3, 3, 3],
          hasHeaderAssociation: true,
        }),
      ],
      hasAcroForm: true,
      formFields: [{ hasTU: true }, { hasTU: true }],
      structTreeDepth: 4,
      contentOrder: [0, 1, 2, 3, 4, 5],
    }),
    pdfjs: makePdfjs({
      pageCount: 20,
      hasText: true,
      textLength: 5000,
      title: "Annual Report 2025",
      lang: "en-US",
      hasOutlines: true,
      outlineCount: 5,
      links: [{ url: "https://example.com", text: "View the full report" }],
    }),
  };
}

function findCategory(result: ScoringResult, id: string): CategoryResult {
  const cat = result.categories.find((c) => c.id === id);
  if (!cat) throw new Error(`Category "${id}" not found in result`);
  return cat;
}

// ---------------------------------------------------------------------------
// scoreDocument: fully accessible PDF
// ---------------------------------------------------------------------------

describe("scoreDocument — fully accessible PDF", () => {
  const { qpdf, pdfjs } = fullyAccessible();
  const result = scoreDocument(qpdf, pdfjs);

  it("returns overall score of 100", () => {
    expect(result.overallScore).toBe(100);
  });

  it("returns grade A", () => {
    expect(result.grade).toBe("A");
  });

  it("is not scanned", () => {
    expect(result.isScanned).toBe(false);
  });

  it("has no warnings", () => {
    expect(result.warnings).toHaveLength(0);
  });

  it("executive summary is positive but does not claim conformance", () => {
    expect(result.executiveSummary).toContain("strong result");
    expect(result.executiveSummary).toContain("not a determination of conformance");
  });

  it("all 10 categories are present (pdf_ua_compliance dropped in v1.21+)", () => {
    expect(result.categories).toHaveLength(10);
  });

  it("text_extractability scores 100", () => {
    expect(findCategory(result, "text_extractability").score).toBe(100);
  });

  it("title_language scores 100", () => {
    expect(findCategory(result, "title_language").score).toBe(100);
  });

  it("heading_structure scores 100", () => {
    expect(findCategory(result, "heading_structure").score).toBe(100);
  });

  it("alt_text scores 100", () => {
    expect(findCategory(result, "alt_text").score).toBe(100);
  });

  it("bookmarks scores 100", () => {
    expect(findCategory(result, "bookmarks").score).toBe(100);
  });

  it("table_markup scores 100", () => {
    expect(findCategory(result, "table_markup").score).toBe(100);
  });

  it("color_contrast is N/A until PDF contrast analysis exists", () => {
    expect(findCategory(result, "color_contrast").score).toBeNull();
  });

  it("link_quality scores 100", () => {
    expect(findCategory(result, "link_quality").score).toBe(100);
  });

  it("form_accessibility scores 100", () => {
    expect(findCategory(result, "form_accessibility").score).toBe(100);
  });

  it("reading_order is advisory/N-A until page-level order checks exist", () => {
    expect(findCategory(result, "reading_order").score).toBeNull();
  });

  it("emits remediation profile as a structural alias of strict (v1.21+)", () => {
    expect(result.scoringMode).toBe("strict");
    expect(result.scoreProfiles.strict.overallScore).toBe(100);
    // remediation is an alias of strict — same score, same grade.
    expect(result.scoreProfiles.remediation.overallScore).toBe(
      result.scoreProfiles.strict.overallScore,
    );
    expect(result.scoreProfiles.remediation.grade).toBe(result.scoreProfiles.strict.grade);
  });
});

// ---------------------------------------------------------------------------
// scoreDocument: scanned PDF (no text, no tags)
// ---------------------------------------------------------------------------

describe("scoreDocument — scanned PDF", () => {
  const qpdf = makeQpdf(); // defaults: no struct tree, no anything
  // A real scan has zero extractable text AND page images.
  const pdfjs = makePdfjs({ pageCount: 1, imageCount: 3 });
  const result = scoreDocument(qpdf, pdfjs);

  it("isScanned is true", () => {
    expect(result.isScanned).toBe(true);
  });

  it("overall score is 0 — 'nothing could be checked' is not 'nothing wrong'", () => {
    // Load-bearing since v1.58.3, when unassessable categories started
    // counting as PASSING so a simple document is not punished for what it
    // does not contain. A scan is the case where that reasoning inverts: its
    // categories come back null because there is no extractable content at
    // all, and a screen reader gets nothing. Without the isScanned guard in
    // aggregateScore this fixture scored 55.
    expect(result.overallScore).toBe(0);
    expect(result.grade).toBe("F");
  });

  it("grade is F", () => {
    expect(result.grade).toBe("F");
  });

  it("executive summary mentions scanned image and OCR", () => {
    expect(result.executiveSummary).toContain("scanned image");
    expect(result.executiveSummary).toContain("OCR");
  });

  it("text_extractability scores 0", () => {
    expect(findCategory(result, "text_extractability").score).toBe(0);
  });

  it("reading_order scores 0 (no struct tree)", () => {
    expect(findCategory(result, "reading_order").score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// scoreDocument: images all marked as decorative artifacts (0 tagged figures).
// A report whose only images are an artifacted cover graphic and closing logos
// must NOT be flagged "images detected but no <Figure> tags" — those images are
// correctly hidden from assistive technology and need no alt text.
// ---------------------------------------------------------------------------

describe("scoreDocument — all images are decorative artifacts (0 figures)", () => {
  const base = () => makeQpdf({ hasStructTree: true, images: [], imageObjectCount: 4 });

  it("all painted images artifacted → alt_text N/A, no 'untagged images' alarm", () => {
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 2000,
      pageCount: 6,
      imageCount: 4,
      nonArtifactImageCount: 0,
    });
    const alt = findCategory(scoreDocument(base(), pdfjs), "alt_text");
    expect(alt.notAssessed).toBe(true);
    expect(alt.score).toBeNull();
    expect((alt.findings ?? []).join(" ")).toMatch(/artifact|decorative/i);
    expect((alt.findings ?? []).join(" ")).not.toMatch(/no tagged <Figure> elements were found/);
  });

  it("non-artifacted painted images with no <Figure> at all → scores 0, not N/A", () => {
    // Previously this returned notAssessed/N/A, which dropped alt_text out of
    // the weighted average entirely — so a document whose content images were
    // never tagged out-scored one with a single missing /Alt. The images here
    // are the ones left AFTER excluding every correctly-artifacted graphic,
    // so there is nothing noisy left to be cautious about.
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 2000,
      pageCount: 6,
      imageCount: 4,
      nonArtifactImageCount: 4,
    });
    const alt = findCategory(scoreDocument(base(), pdfjs), "alt_text");
    expect(alt.score).toBe(0);
    expect((alt.findings ?? []).join(" ")).toMatch(/not tagged as <Figure>|none are tagged/i);
  });
});

// ---------------------------------------------------------------------------
// scoreDocument: short born-digital PDF — has (a little) real text, no images.
// Must NOT be classified as a scanned document: the "scanned image / OCR"
// framing was factually false for one-page notices and cover sheets.
// ---------------------------------------------------------------------------

describe("scoreDocument — short born-digital PDF (little text, no images)", () => {
  const qpdf = makeQpdf(); // untagged
  const pdfjs = makePdfjs({ hasText: false, textLength: 30, imageCount: 0 });
  const result = scoreDocument(qpdf, pdfjs);

  it("is not classified as scanned", () => {
    expect(result.isScanned).toBe(false);
  });

  it("does not claim a scanned image in the executive summary", () => {
    expect(result.executiveSummary).not.toContain("scanned image");
  });

  it("text_extractability keeps its low score but says minimal text, not photograph-of-text", () => {
    const cat = findCategory(result, "text_extractability");
    expect(cat.score).toBe(0); // scoring calibration unchanged
    const text = cat.findings.join(" ");
    expect(text).not.toContain("photograph of text");
    expect(text).toContain("30");
  });
});

// ---------------------------------------------------------------------------
// scoreDocument: mixed results
// ---------------------------------------------------------------------------

describe("scoreDocument — mixed results", () => {
  it("text but no tags scores 50 for text_extractability", () => {
    const qpdf = makeQpdf({ hasStructTree: false });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "text_extractability").score).toBe(50);
  });

  it("tags but no text scores 25 for text_extractability", () => {
    const qpdf = makeQpdf({ hasStructTree: true, structTreeDepth: 2 });
    const pdfjs = makePdfjs({ hasText: false });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "text_extractability").score).toBe(25);
  });

  it("title without lang scores 50 for title_language", () => {
    const qpdf = makeQpdf({ displayDocTitle: true });
    const pdfjs = makePdfjs({ title: "My Document", lang: null });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "title_language").score).toBe(50);
  });

  it("lang without title scores 50 for title_language", () => {
    const qpdf = makeQpdf({ hasLang: true, lang: "en" });
    const pdfjs = makePdfjs({ title: null });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "title_language").score).toBe(50);
  });

  it("filename-like title earns partial credit (25 of 50) with an advisory", () => {
    const qpdf = makeQpdf({ hasLang: true, lang: "en" });
    const pdfjs = makePdfjs({
      title: "report_v3_final.pdf",
      titleLooksLikeFilename: true,
    });
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "title_language");
    expect(cat.score).toBe(75); // 25 title + 50 lang
    expect(cat.findings.join(" ")).toContain("filename");
    // The title EXISTS — it must never be reported as a confirmed 2.4.2
    // "no title in metadata" conformance failure.
    expect(result.conformance.failures.some((f) => f.sc === "2.4.2")).toBe(false);
  });

  it("filename-like title still beats no title at all", () => {
    const qpdf = makeQpdf();
    const withFilename = scoreDocument(
      qpdf,
      makePdfjs({ title: "scan_20240115", titleLooksLikeFilename: true }),
    );
    const withNone = scoreDocument(qpdf, makePdfjs({ title: null }));
    expect(findCategory(withFilename, "title_language").score!).toBeGreaterThan(
      findCategory(withNone, "title_language").score!,
    );
  });

  it("qpdf error adds a warning", () => {
    const qpdf = makeQpdf({ error: "QPDF parsing failed" });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("could not be completed");
  });

  it("pdfjs error also adds a warning and avoids scanned classification", () => {
    const qpdf = makeQpdf({ hasStructTree: false });
    const pdfjs = makePdfjs({ error: "PDF.js parsing failed", hasText: false });
    const result = scoreDocument(qpdf, pdfjs);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.isScanned).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// N/A category handling
// ---------------------------------------------------------------------------

describe("N/A category handling", () => {
  it("alt_text is null when no images exist", () => {
    const qpdf = makeQpdf({ images: [] });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "alt_text");
    expect(cat.score).toBeNull();
    expect(cat.grade).toBeNull();
    expect(cat.severity).toBeNull();
  });

  it("bookmarks is null for short documents", () => {
    const qpdf = makeQpdf();
    const pdfjs = makePdfjs({ pageCount: 5 }); // under threshold of 10
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "bookmarks");
    expect(cat.score).toBeNull();
    expect(cat.findings[0]).toContain("not required");
  });

  it("table_markup is null when no tables exist", () => {
    const qpdf = makeQpdf({ tables: [] });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "table_markup").score).toBeNull();
  });

  it("link_quality is null when no links exist", () => {
    const qpdf = makeQpdf();
    const pdfjs = makePdfjs({ links: [] });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "link_quality").score).toBeNull();
  });

  it("form_accessibility is null when no forms exist", () => {
    const qpdf = makeQpdf({ hasAcroForm: false, formFields: [] });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "form_accessibility").score).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Weight renormalization when categories are N/A
// ---------------------------------------------------------------------------

describe("weight renormalization", () => {
  it("N/A categories are excluded from overall score calculation", () => {
    // Make a doc where ONLY text_extractability and title_language are applicable,
    // and both score 100. The overall should be 100, not diluted by N/A categories.
    const qpdf = makeQpdf({
      hasStructTree: true,
      hasLang: true,
      lang: "en",
      displayDocTitle: true,
      // No images, no tables, no forms, no outlines, no headings
      images: [],
      tables: [],
      formFields: [],
      headings: [],
      structTreeDepth: 3,
      contentOrder: [0, 1, 2],
    });
    const pdfjs = makePdfjs({
      pageCount: 3, // short doc -> bookmarks N/A
      hasText: true,
      textLength: 500,
      title: "Test",
      links: [],
    });
    const result = scoreDocument(qpdf, pdfjs);

    // text_extractability = 100, title_language = 100,
    // heading_structure = null — a SHORT document with no headings and no
    // heading-like signals is plausibly heading-less by design; WCAG does
    // not require headings in content that has no sections, and the DOCX
    // path already treats this as N/A. (The old 0/Critical here made the
    // same memo score 70/C as PDF and 100/A as DOCX.)
    // alt_text = null (no images), bookmarks = null, table_markup = null,
    // link_quality = null, form_accessibility = null, reading_order = null
    const text = findCategory(result, "text_extractability");
    const title = findCategory(result, "title_language");
    const heading = findCategory(result, "heading_structure");
    const alt = findCategory(result, "alt_text");
    const reading = findCategory(result, "reading_order");

    expect(text.score).toBe(100);
    expect(title.score).toBe(100);
    expect(heading.score).toBeNull(); // short doc, no headings → N/A
    expect(alt.score).toBeNull(); // no images -> N/A
    expect(reading.score).toBeNull();

    // Applicable: text(0.20) + title(0.15), both 100 → 100.
    expect(result.overallScore).toBe(100);
  });

  it("still scores heading_structure 0 for a SUBSTANTIVE document with no headings", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      hasLang: true,
      lang: "en",
      headings: [],
      paragraphCount: 80,
      totalPageCount: 12,
      structTreeDepth: 3,
      contentOrder: [0, 1, 2],
    });
    const pdfjs = makePdfjs({ pageCount: 12, hasText: true, textLength: 9000, title: "T" });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "heading_structure").score).toBe(0);
  });

  it("title credit is docked when DisplayDocTitle is not set (viewers show the filename)", () => {
    const base = {
      hasStructTree: true,
      hasLang: true,
      lang: "en",
      structTreeDepth: 3,
      contentOrder: [0, 1, 2],
    };
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      title: "Annual Report",
      pageCount: 3,
    });
    const withFlag = scoreDocument(makeQpdf({ ...base, displayDocTitle: true }), pdfjs);
    expect(findCategory(withFlag, "title_language").score).toBe(100);

    const withoutFlag = scoreDocument(makeQpdf(base), pdfjs);
    const cat = findCategory(withoutFlag, "title_language");
    expect(cat.score).toBe(85); // 35 (title without DDT) + 50 (language)
    expect(cat.findings.join(" ")).toContain("filename");
  });

  it("counts painted images beyond the tagged figures against coverage, not as full coverage", () => {
    // 8 content images painted outside any /Artifact run, only 1 of them
    // tagged. Claiming "all 1 tagged image has alt text" here would report
    // full coverage over a document where 7 images are absent from the
    // reading order. `nonArtifactImageCount` is what makes the claim safe —
    // without it (pdfjs failed, or reported no artifact data) the category
    // stays silent rather than guessing from the raw image count, which is
    // what used to produce false alarms on correctly-artifacted documents.
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [0, 1, 2],
      images: [{ ref: "3 0 R", hasAlt: true, altText: "Chart" }],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      imageCount: 8,
      nonArtifactImageCount: 8,
      pageCount: 3,
    });
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "alt_text");
    expect(cat.score).toBe(12); // 1 described of 8 describable
    expect(cat.findings.join(" ")).toMatch(/not tagged as <Figure>/i);
  });

  it("surfaces the producer's Suspects flag as an advisory", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      suspectsFlag: true,
      structTreeDepth: 3,
      contentOrder: [0, 1, 2],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500, pageCount: 3 });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "text_extractability").findings.join(" ")).toContain("suspect");
  });

  it("mid-band order divergence scores 65 (Moderate manual-review), not 40 (Critical)", () => {
    // ~70% LCS agreement between tag order and DRAW order — a correctly
    // tagged form routinely diverges this much (fields painted in creation
    // order, tags ordered logically). The metric cannot say which side is
    // wrong, so the signal is "review manually", not Critical.
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 5,
      structTreeMcidsByPage: { 1: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      contentOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      contentStreamMcidsByPage: { 1: [2, 0, 1, 5, 3, 4, 8, 6, 7, 9] },
    });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "reading_order").score).toBe(65);
  });

  it("static XFA forms get a disclosure advisory in form accessibility", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [0, 1, 2],
      hasXfa: true,
      needsRendering: false,
      hasAcroForm: true,
      formFields: [{ ref: "5 0 R", hasTU: true, name: "field1" }],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "form_accessibility");
    expect(cat.score).toBe(100);
    expect(cat.findings.join(" ")).toMatch(/static XFA/i);
  });

  it("missing TH Scope is advisory (not deducted) when /Headers association exists", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [0, 1, 2],
      tables: [
        makeTable({
          hasHeaders: true,
          headerCount: 4,
          hasScope: false,
          scopeMissingCount: 4,
          hasRowStructure: true,
          rowCount: 5,
          hasConsistentColumns: true,
          columnCounts: [4, 4, 4, 4, 4],
          hasHeaderAssociation: true,
        }),
      ],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "table_markup");
    expect(cat.score).toBe(100);
    expect(cat.findings.join(" ")).toMatch(/Headers/);
  });

  it("missing TH Scope still deducts when no /Headers association exists", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [0, 1, 2],
      tables: [
        makeTable({
          hasHeaders: true,
          headerCount: 4,
          hasScope: false,
          scopeMissingCount: 4,
          hasRowStructure: true,
          rowCount: 5,
          hasConsistentColumns: true,
          columnCounts: [4, 4, 4, 4, 4],
          hasHeaderAssociation: false,
        }),
      ],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "table_markup").score).toBeLessThan(100);
  });

  it("all categories N/A results in score 0", () => {
    // This is an extreme edge case but the code handles it
    // We can't really make ALL categories N/A because text_extractability always returns a score,
    // but if somehow all applicable categories are N/A, totalWeight would be 0 → score 0
    // Testing the branch: applicable is empty → score 0
    // In practice this won't happen, but let's verify the math holds
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [0, 1, 2],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500, pageCount: 3 });
    const result = scoreDocument(qpdf, pdfjs);
    // At minimum text_extractability is applicable, so overall > 0
    expect(result.overallScore).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Grade thresholds (A/B/C/D/F boundaries)
// ---------------------------------------------------------------------------

describe("grade thresholds", () => {
  // We test indirectly via scoreDocument by controlling the inputs
  // to produce known overall scores.
  //
  // Two of these tests used to assert the grade purely from the score band,
  // and both went red when the severity cap shipped — correctly. They had
  // encoded the behaviour the cap exists to remove: a high average
  // outranking a real finding. Their scenarios (1 of 2 images missing alt;
  // no title plus a skipped heading level) each leave a MODERATE category
  // behind, which now holds the SCORE at the top of the C band (79).
  //
  // The cap moved from the letter to the score in v1.58.2: capping the letter
  // alone severed it from the number and shipped "D" above "80/100". Capping
  // the score keeps GRADE_THRESHOLDS the one consistent scale, so these tests
  // assert the score and read the grade back through it.

  it("score 100 → grade A", () => {
    const { qpdf, pdfjs } = fullyAccessible();
    const result = scoreDocument(qpdf, pdfjs);
    expect(result.grade).toBe("A");
  });

  it("an A requires a clean sweep — one moderate finding holds the score at 79", () => {
    const { qpdf, pdfjs } = fullyAccessible();
    // 1 of 2 images missing alt → alt_text = 50 → Moderate. The raw weighted
    // average clears 90; the cap holds it at the top of the C band.
    qpdf.images = [
      { ref: "10 0 R", hasAlt: true },
      { ref: "11 0 R", hasAlt: false },
    ];
    const result = scoreDocument(qpdf, pdfjs);

    expect(findCategory(result, "alt_text").severity).toBe("Moderate");
    expect(result.overallScore).toBe(79);
    // And the letter still comes straight off the published scale.
    expect(result.grade).toBe("C");
  });

  it("two moderate findings land at 79/C too — the ceiling, not the band", () => {
    const { qpdf, pdfjs } = fullyAccessible();
    pdfjs.title = null; // title_language → 50 (language only) → Moderate
    qpdf.headings = [
      { level: "H1", tag: "/H1" },
      { level: "H3", tag: "/H3" }, // skips H2 → heading_structure → 60 → Moderate
    ];
    const result2 = scoreDocument(qpdf, pdfjs);

    expect(result2.overallScore).toBe(79);
    expect(result2.grade).toBe("C");
  });

  it("a minor-only finding caps at B rather than dropping further", () => {
    // The ladder is graduated, not a single cliff: Minor → B, Moderate → C,
    // Critical → D. Without a case at each rung, a change that collapsed them
    // into one cap would pass.
    const { qpdf, pdfjs } = fullyAccessible();
    // A data table with headers and rows but no scope/association and no
    // caption → table_markup 85, which is the Minor band (70–99). (This test
    // originally generated Minor via multiple H1s; the 2026-08-08 calibration
    // made that advisory, and the premise guard below caught the substitution
    // — twice now — exactly as designed.)
    qpdf.tables = [
      makeTable({
        hasHeaders: true,
        headerCount: 3,
        scopeMissingCount: 3,
        dataCellCount: 9,
        hasRowStructure: true,
        rowCount: 4,
        hasConsistentColumns: true,
        columnCounts: [3, 3, 3, 3],
      }),
    ];
    const result = scoreDocument(qpdf, pdfjs);
    const sev = findCategory(result, "table_markup").severity;
    // Guard the premise: if scoring shifts this category out of Minor, the
    // assertion below would be testing a different rung than it claims to.
    expect(sev).toBe("Minor");
    expect(result.overallScore).toBe(89);
    expect(result.grade).toBe("B");
  });

  it("THE INVARIANT: a real audit's grade always matches its own score", () => {
    // The regression test for v1.58.0, which capped the LETTER and left the
    // score alone — shipping reports that read "D" above "80/100". Nothing in
    // the suite tied the two together, so CI stayed green while the headline
    // was self-contradictory. This walks real scoring paths rather than the
    // pure helper, because that is where the two came apart.
    const scenarios: Array<[string, () => ReturnType<typeof fullyAccessible>]> = [
      ["clean", () => fullyAccessible()],
      [
        "moderate",
        () => {
          const f = fullyAccessible();
          f.pdfjs.title = null;
          return f;
        },
      ],
      [
        "critical",
        () => {
          const f = fullyAccessible();
          f.pdfjs.title = null;
          f.pdfjs.lang = null;
          return f;
        },
      ],
      [
        "minor",
        () => {
          const f = fullyAccessible();
          f.qpdf.headings = [
            { level: "H1", tag: "/H1" },
            { level: "H2", tag: "/H2" },
            { level: "H2", tag: "/H2" },
            { level: "H1", tag: "/H1" },
          ];
          return f;
        },
      ],
    ];
    for (const [name, build] of scenarios) {
      const { qpdf, pdfjs } = build();
      const r = scoreDocument(qpdf, pdfjs);
      const s = r.overallScore;
      const expected = s >= 90 ? "A" : s >= 80 ? "B" : s >= 70 ? "C" : s >= 60 ? "D" : "F";
      expect(r.grade, `${name}: score ${s}`).toBe(expected);
      // Both score profiles are published too, and each carries its own pair.
      for (const [mode, profile] of Object.entries(r.scoreProfiles)) {
        const ps = profile.overallScore;
        const pe = ps >= 90 ? "A" : ps >= 80 ? "B" : ps >= 70 ? "C" : ps >= 60 ? "D" : "F";
        expect(profile.grade, `${name}/${mode}: score ${ps}`).toBe(pe);
      }
    }
  });

  it("the cap only ever lowers — a bad average keeps its own worse score", () => {
    const qpdf = makeQpdf();
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    // Critical findings cap at 69, but this document's average is far below.
    // The cap must not PROMOTE it.
    expect(result.overallScore).toBeLessThan(60);
    expect(result.grade).toBe("F");
  });
});

// ---------------------------------------------------------------------------
// Severity thresholds
// ---------------------------------------------------------------------------

describe("severity thresholds", () => {
  it("score 100 → No issues found", () => {
    const { qpdf, pdfjs } = fullyAccessible();
    const result = scoreDocument(qpdf, pdfjs);
    // "No issues found" is reserved for a perfect 100 — see SEVERITY_THRESHOLDS.
    expect(findCategory(result, "text_extractability").severity).toBe("No issues found");
  });

  it("score 0 → Critical", () => {
    const qpdf = makeQpdf();
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "text_extractability").severity).toBe("Critical");
  });

  it("null score → null severity", () => {
    const qpdf = makeQpdf({ images: [] });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "alt_text").severity).toBeNull();
  });

  it("score 50 → Moderate", () => {
    // text but no tags → score 50
    const qpdf = makeQpdf({ hasStructTree: false });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "text_extractability").score).toBe(50);
    expect(findCategory(result, "text_extractability").severity).toBe("Moderate");
  });
});

// ---------------------------------------------------------------------------
// Executive summary generation
// ---------------------------------------------------------------------------

describe("executive summary", () => {
  it("scanned PDF gets OCR-required summary", () => {
    const qpdf = makeQpdf();
    // A real scan: zero extractable text AND page images.
    const pdfjs = makePdfjs({ imageCount: 3 });
    const result = scoreDocument(qpdf, pdfjs);
    expect(result.executiveSummary).toContain("scanned image");
    expect(result.executiveSummary).toContain("OCR");
  });

  it("grade A with no automated failures is summarised positively, with a manual-review caveat", () => {
    const { qpdf, pdfjs } = fullyAccessible();
    const result = scoreDocument(qpdf, pdfjs);
    expect(result.conformance.status).toBe("no-automated-failures");
    expect(result.executiveSummary).toContain("strong result");
    expect(result.executiveSummary).toContain("manual review");
  });

  it("a confirmed failure (missing title) drives the summary regardless of the grade", () => {
    const { qpdf, pdfjs } = fullyAccessible();
    pdfjs.title = null; // → WCAG 2.4.2 (Page Titled) failure
    const result = scoreDocument(qpdf, pdfjs);
    expect(result.conformance.status).toBe("fail");
    expect(result.executiveSummary).toContain(`does not yet meet WCAG ${WCAG.VERSION} Level AA`);
  });

  it("a document with multiple confirmed failures gets a failure summary", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [0, 1, 2],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      pageCount: 20,
    });
    const result = scoreDocument(qpdf, pdfjs);
    expect(result.conformance.status).toBe("fail");
    expect(result.conformance.failures.length).toBeGreaterThan(1);
    expect(result.executiveSummary).toContain(`does not yet meet WCAG ${WCAG.VERSION} Level AA`);
    expect(result.executiveSummary).toContain(`WCAG ${WCAG.VERSION} failures`);
  });

  it("an unreadable document yields an incomplete-analysis summary", () => {
    const result = scoreDocument(
      makeQpdf({ error: "damaged or encrypted" }),
      makePdfjs({ error: "damaged or encrypted" }),
    );
    expect(result.conformance.status).toBe("incomplete");
    expect(result.executiveSummary).toContain("could not fully complete");
  });
});

// ---------------------------------------------------------------------------
// generateSummary — direct unit tests (conformance reconciliation, v1.22.3)
// ---------------------------------------------------------------------------

function summaryVerdict(
  status: ConformanceVerdict["status"],
  failureCount = 0,
): ConformanceVerdict {
  return {
    status,
    failures: Array.from({ length: failureCount }, (_, i) => ({
      sc: "1.1.1",
      name: "Non-text Content",
      level: "A" as const,
      category: "alt_text",
      issue: `confirmed failure ${i + 1}`,
      url: "https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html",
    })),
    notAssessed: [],
    headline: "",
  };
}

function summaryCat(severity: string | null, score: number | null): CategoryResult {
  return {
    id: "demo",
    label: "Demo Category",
    weight: 10,
    score,
    grade: null,
    severity,
    findings: [],
    explanation: "",
    helpLinks: [],
  };
}

describe("generateSummary", () => {
  it("a confirmed conformance failure outranks a high grade", () => {
    const s = generateSummary(95, "A", false, [], summaryVerdict("fail", 1));
    expect(s).toContain(`does not yet meet WCAG ${WCAG.VERSION} Level AA`);
    expect(s).toContain(`1 WCAG ${WCAG.VERSION} failure`);
    expect(s).not.toContain("strong result");
  });

  it("pluralises multiple confirmed failures", () => {
    const s = generateSummary(70, "C", false, [], summaryVerdict("fail", 3));
    expect(s).toContain(`3 WCAG ${WCAG.VERSION} failures`);
  });

  it("an incomplete verdict makes no readiness claim", () => {
    const s = generateSummary(40, "F", false, [], summaryVerdict("incomplete"));
    expect(s).toContain("could not fully complete");
  });

  it("grade A with no automated failures never claims conformance", () => {
    const cats = [summaryCat("No issues found", 100), summaryCat("No issues found", 100)];
    const s = generateSummary(96, "A", false, cats, summaryVerdict("no-automated-failures"));
    expect(s).toContain("not a determination of conformance");
  });

  it("grade B counts issue-free categories by the current 'No issues found' severity", () => {
    const cats = [
      summaryCat("No issues found", 100),
      summaryCat("No issues found", 100),
      summaryCat("Minor", 85),
    ];
    const s = generateSummary(85, "B", false, cats, summaryVerdict("no-automated-failures"));
    expect(s).toContain("2 of 3 categories are fully issue-free");
  });

  it("a scanned PDF gets the OCR message regardless of the verdict", () => {
    const s = generateSummary(0, "F", true, [], summaryVerdict("fail", 5));
    expect(s).toContain("OCR");
  });
});

// ---------------------------------------------------------------------------
// Individual category scoring functions — edge cases
// ---------------------------------------------------------------------------

describe("scoreHeadingStructure edge cases", () => {
  it("no headings → score 0, grade F", () => {
    // Substantive document (many paragraphs) — short heading-less docs are
    // N/A instead (see the minimal-document test above).
    const qpdf = makeQpdf({ headings: [], paragraphCount: 40 });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "heading_structure");
    expect(cat.score).toBe(0);
    expect(cat.grade).toBe("F");
    expect(cat.severity).toBe("Critical");
  });

  it("explains when heading-like custom tags are still mapped to paragraphs", () => {
    const qpdf = makeQpdf({
      headings: [],
      hasStructTree: true,
      paragraphCount: 347,
      outlineCount: 30,
      hasRoleMap: true,
      roleMapEntries: ["Head → P", "Subhead_1 → P", "Body_text → P"],
    });
    const pdfjs = makePdfjs({ pageCount: 30, hasText: true, textLength: 5000 });
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "heading_structure");
    expect(cat.findings.some((f) => f.includes("RoleMap maps them to paragraphs"))).toBe(true);
    expect(
      cat.findings.some((f) =>
        f.includes("Bookmarks and paragraph-level structure do not replace true H1–H6 semantics"),
      ),
    ).toBe(true);
  });

  it("only generic /H tags → score 40", () => {
    const qpdf = makeQpdf({
      headings: [
        { level: "H", tag: "/H" },
        { level: "H", tag: "/H" },
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "heading_structure").score).toBe(40);
  });

  it("proper hierarchy H1→H2→H3 → score 100", () => {
    const qpdf = makeQpdf({
      headings: [
        { level: "H1", tag: "/H1" },
        { level: "H2", tag: "/H2" },
        { level: "H3", tag: "/H3" },
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "heading_structure").score).toBe(100);
  });

  it("H1→H3 skip → score 60, findings mention skip", () => {
    const qpdf = makeQpdf({
      headings: [
        { level: "H1", tag: "/H1" },
        { level: "H3", tag: "/H3" },
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "heading_structure");
    expect(cat.score).toBe(60);
    expect(cat.findings.some((f) => f.includes("skip"))).toBe(true);
  });

  it("mixed generic /H and numbered headings, proper hierarchy → score 100", () => {
    const qpdf = makeQpdf({
      headings: [
        { level: "H", tag: "/H" },
        { level: "H1", tag: "/H1" },
        { level: "H2", tag: "/H2" },
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    // Has numbered headings with proper hierarchy, so 100
    expect(findCategory(result, "heading_structure").score).toBe(100);
  });

  // Multiple-H1 behavior is pinned by "multiple H1s are advisory, not scored"
  // below — the 2026-08-08 calibration replaced the old 75/Minor penalty.
});

describe("scoreAltText pdfjs fallback", () => {
  it("qpdf finds no tagged figures but raw image signals become advisory/N-A", () => {
    const qpdf = makeQpdf({ images: [], imageObjectCount: 2 });
    const pdfjs = makePdfjs({ imageCount: 3 });
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "alt_text");
    expect(cat.score).toBeNull();
    expect(cat.severity).toBeNull();
    expect(cat.findings.some((f) => f.includes("image-like object"))).toBe(true);
    expect(cat.findings.some((f) => f.includes("Manual review recommended"))).toBe(true);
  });

  it("qpdf finds no images and pdfjs finds none either → N/A", () => {
    const qpdf = makeQpdf({ images: [] });
    const pdfjs = makePdfjs({ imageCount: 0 });
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "alt_text");
    expect(cat.score).toBeNull();
  });
});

describe("scoreAltText edge cases", () => {
  it("2 images, 1 with alt → score 50", () => {
    const qpdf = makeQpdf({
      images: [
        { ref: "10 0 R", hasAlt: true },
        { ref: "11 0 R", hasAlt: false },
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "alt_text").score).toBe(50);
  });

  it("3 images, 2 with alt → score 66 (floored, never rounded up)", () => {
    const qpdf = makeQpdf({
      images: [
        { ref: "10 0 R", hasAlt: true },
        { ref: "11 0 R", hasAlt: true },
        { ref: "12 0 R", hasAlt: false },
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "alt_text").score).toBe(66);
  });

  it("a single missing alt among many never rounds up to a perfect 100", () => {
    const qpdf = makeQpdf({
      images: Array.from({ length: 200 }, (_, i) => ({
        ref: `${i + 10} 0 R`,
        hasAlt: i < 199,
      })),
    });
    const result = scoreDocument(qpdf, makePdfjs());
    const altText = findCategory(result, "alt_text");
    expect(altText.score).toBe(99); // floor(99.5) — not round(99.5) = 100
    expect(altText.severity).not.toBe("No issues found");
  });

  it("images with no ref are excluded", () => {
    const qpdf = makeQpdf({
      images: [
        { ref: "", hasAlt: false }, // no ref, filtered out
        { ref: "10 0 R", hasAlt: true },
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    // Only ref='10 0 R' passes the filter, and it has alt
    expect(findCategory(result, "alt_text").score).toBe(100);
  });
});

describe("scoreBookmarks edge cases", () => {
  it("20 pages, outlines with entries → score 100", () => {
    const qpdf = makeQpdf({ hasOutlines: true, outlineCount: 5 });
    const pdfjs = makePdfjs({
      pageCount: 20,
      hasOutlines: true,
      outlineCount: 5,
    });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "bookmarks").score).toBe(100);
  });

  it("20 pages, outline structure but 0 entries → score 40", () => {
    const qpdf = makeQpdf({ hasOutlines: true, outlineCount: 0 });
    const pdfjs = makePdfjs({
      pageCount: 20,
      hasOutlines: false,
      outlineCount: 0,
    });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "bookmarks").score).toBe(40);
  });

  it("20 pages, no outlines → score 45 (moderate, not critical)", () => {
    const qpdf = makeQpdf({ hasOutlines: false, outlineCount: 0 });
    const pdfjs = makePdfjs({
      pageCount: 20,
      hasOutlines: false,
      outlineCount: 0,
    });
    const result = scoreDocument(qpdf, pdfjs);
    // Missing bookmarks maps to WCAG 2.4.5 (Level AA), satisfiable other
    // ways — so it is a moderate issue, not a critical 0.
    expect(findCategory(result, "bookmarks").score).toBe(45);
    expect(findCategory(result, "bookmarks").grade).toBe("F");
    expect(findCategory(result, "bookmarks").severity).toBe("Moderate");
  });

  it("9 pages → N/A", () => {
    const qpdf = makeQpdf();
    const pdfjs = makePdfjs({ pageCount: 9 });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "bookmarks").score).toBeNull();
  });

  it("10 pages → assessed (boundary)", () => {
    const qpdf = makeQpdf();
    const pdfjs = makePdfjs({ pageCount: 10 });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "bookmarks").score).not.toBeNull();
  });
});

describe("scoreTableMarkup edge cases", () => {
  const perfectTable = () =>
    makeTable({
      hasHeaders: true,
      headerCount: 3,
      dataCellCount: 9,
      hasScope: true,
      scopeMissingCount: 0,
      hasRowStructure: true,
      rowCount: 4,
      hasCaption: true,
      hasConsistentColumns: true,
      columnCounts: [3, 3, 3, 3],
      hasHeaderAssociation: true,
    });

  it("2 perfect tables → score 100", () => {
    const qpdf = makeQpdf({ tables: [perfectTable(), perfectTable()] });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "table_markup").score).toBe(100);
  });

  it("headers only, no scope or caption → partial score", () => {
    const qpdf = makeQpdf({
      tables: [
        makeTable({
          hasHeaders: true,
          headerCount: 2,
          dataCellCount: 6,
          hasRowStructure: true,
          rowCount: 3,
          hasConsistentColumns: true,
          columnCounts: [2, 2, 2],
          scopeMissingCount: 2,
        }),
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    // 40 (headers) + 20 (rows) + 0 (no scope) + 10 (no nesting) + 5 (caption always credited) + 10 (consistent) = 85
    expect(findCategory(result, "table_markup").score).toBe(85);
  });

  it("scope-only conformant table reaches 100 (scope satisfies header association)", () => {
    // A simple data table that is fully conformant under WCAG 2.1/2.2 SC 1.3.1 via /Scope:
    // TH headers with scope, TR rows, consistent columns, a caption, no nesting.
    // It uses /Scope (the recommended technique for simple tables) rather than
    // the explicit /Headers attribute, so hasHeaderAssociation is false.
    // Such a table passes every applicable check and must score 100 — it must
    // NOT be docked 5 points for lacking the /Headers attribute.
    const qpdf = makeQpdf({
      tables: [
        makeTable({
          hasHeaders: true,
          headerCount: 3,
          dataCellCount: 9,
          hasScope: true,
          scopeMissingCount: 0,
          hasRowStructure: true,
          rowCount: 4,
          hasCaption: true,
          hasConsistentColumns: true,
          columnCounts: [3, 3, 3, 3],
          hasHeaderAssociation: false,
        }),
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "table_markup").score).toBe(100);
  });

  it("captionless but otherwise-conformant table still reaches 100 (caption is a non-blocking note)", () => {
    // Same fully-conformant simple table as above, but with NO <Caption>.
    // A caption is not a WCAG 2.1/2.2 requirement, so its absence must not
    // cap the category below 100 — the points are awarded regardless, and the
    // missing caption is surfaced only as an advisory note.
    const qpdf = makeQpdf({
      tables: [
        makeTable({
          hasHeaders: true,
          headerCount: 3,
          dataCellCount: 9,
          hasScope: true,
          scopeMissingCount: 0,
          hasRowStructure: true,
          rowCount: 4,
          hasCaption: false,
          hasConsistentColumns: true,
          columnCounts: [3, 3, 3, 3],
          hasHeaderAssociation: false,
        }),
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "table_markup");
    expect(cat.score).toBe(100);
    // The missing caption is still mentioned as an (optional) recommendation.
    expect(cat.findings.some((f) => f.toLowerCase().includes("caption"))).toBe(true);
  });

  it("no headers at all → low score, can still earn structure points", () => {
    const qpdf = makeQpdf({
      tables: [
        makeTable({
          hasRowStructure: true,
          rowCount: 3,
          dataCellCount: 9,
          hasConsistentColumns: true,
          columnCounts: [3, 3, 3],
        }),
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    // 0 (no headers) + 20 (rows) + 0 (no scope, N/A) + 10 (no nesting) + 5 (caption always credited) + 10 (consistent) = 45
    expect(findCategory(result, "table_markup").score).toBe(45);
  });

  it("Strict does not give partial credit to a well-formed grid without TH cells", () => {
    // v1.21+: only the Strict profile is exposed. A row-structured grid
    // without /TH headers still scores 40 (no programmatic header
    // relationships → no Pass).
    const qpdf = makeQpdf({
      tables: [
        makeTable({
          hasRowStructure: true,
          rowCount: 32,
          dataCellCount: 288,
          hasConsistentColumns: true,
          columnCounts: new Array(32).fill(9),
        }),
      ],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 5000 });
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "table_markup");
    // 0 (no headers) + 20 (rows) + 10 (no nesting) + 5 (caption always credited) + 10 (consistent) = 45
    expect(cat.score).toBe(45);
    expect(
      cat.findings.some((f) =>
        f.includes("row structure alone does not create programmatic header relationships"),
      ),
    ).toBe(true);
  });

  it("nested table costs 10 points", () => {
    const qpdf = makeQpdf({
      tables: [
        makeTable({
          hasHeaders: true,
          headerCount: 2,
          hasScope: true,
          hasRowStructure: true,
          rowCount: 3,
          hasCaption: true,
          hasConsistentColumns: true,
          columnCounts: [2, 2, 2],
          hasNestedTable: true,
          hasHeaderAssociation: true,
        }),
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    // 40 + 20 + 10 + 0 (nested) + 5 + 10 + 5 = 90
    expect(findCategory(result, "table_markup").score).toBe(90);
  });

  it("no tables → score null (N/A)", () => {
    const qpdf = makeQpdf({ tables: [] });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "table_markup").score).toBeNull();
  });

  it("mixed quality across multiple tables", () => {
    const qpdf = makeQpdf({
      tables: [
        perfectTable(),
        makeTable({
          hasRowStructure: true,
          rowCount: 2,
          dataCellCount: 4,
          hasConsistentColumns: true,
          columnCounts: [2, 2],
        }),
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    // 20 (some headers) + 20 (all rows) + 10 (all TH-bearing tables have scope) + 10 (no nesting) + 5 (caption always credited) + 10 (all consistent) + 5 (some assoc) = 80
    expect(findCategory(result, "table_markup").score).toBe(80);
  });

  it("inconsistent columns reduces score", () => {
    const qpdf = makeQpdf({
      tables: [
        makeTable({
          hasHeaders: true,
          headerCount: 3,
          hasScope: true,
          hasRowStructure: true,
          rowCount: 3,
          hasCaption: true,
          hasConsistentColumns: false,
          columnCounts: [3, 4, 3],
        }),
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    // 40 + 20 + 10 (scope) + 10 (no nesting) + 5 (caption) + 0 (inconsistent)
    // + 5 (header association via /Scope) = 90. Inconsistent columns are the
    // only defect; a scope-based table is not separately docked for lacking
    // the explicit /Headers attribute.
    expect(findCategory(result, "table_markup").score).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// Supplementary findings (informational, no scoring impact)
// ---------------------------------------------------------------------------

describe("supplementary findings — list markup", () => {
  it("reports well-formed lists in reading_order findings", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [0, 1],
      lists: [
        {
          itemCount: 3,
          hasLabels: true,
          hasBodies: true,
          isWellFormed: true,
          nestingDepth: 0,
        },
      ],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const readingCat = findCategory(result, "reading_order");
    expect(readingCat.findings.some((f) => f.includes("1 list(s) detected"))).toBe(true);
    expect(readingCat.findings.some((f) => f.includes("well-formed"))).toBe(true);
  });

  it("reports malformed lists (items without LBody)", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [0, 1],
      lists: [
        {
          itemCount: 2,
          hasLabels: true,
          hasBodies: false,
          isWellFormed: false,
          nestingDepth: 0,
        },
      ],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const readingCat = findCategory(result, "reading_order");
    expect(readingCat.findings.some((f) => f.includes("missing <LBody>"))).toBe(true);
  });

  it("flags missing Lbl as advisory only on well-formed lists", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [0, 1],
      lists: [
        {
          itemCount: 2,
          hasLabels: false,
          hasBodies: true,
          isWellFormed: true,
          nestingDepth: 0,
        },
      ],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const readingCat = findCategory(result, "reading_order");
    expect(readingCat.findings.some((f) => f.includes("optional"))).toBe(true);
    // No confirmed WCAG failure may be asserted for a missing-Lbl list.
    expect(result.conformance.failures.some((f) => f.issue.includes("list"))).toBe(false);
  });
});

describe("supplementary findings — marked content & artifacts", () => {
  it("reports marked content when /MarkInfo /Marked true", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      hasMarkInfo: true,
      isMarkedContent: true,
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.findings.some((f) => f.includes("Marked Content"))).toBe(true);
  });

  it("reports missing MarkInfo on tagged documents", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      hasMarkInfo: false,
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.findings.some((f) => f.includes("No MarkInfo"))).toBe(true);
  });
});

describe("supplementary findings — font embedding", () => {
  it("reports all fonts embedded", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      fonts: [
        { name: "Arial", embedded: true },
        { name: "TimesNewRoman", embedded: true },
      ],
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.findings.some((f) => f.includes("All fonts are embedded"))).toBe(true);
  });

  it("reports non-embedded fonts", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      fonts: [
        { name: "Arial", embedded: true },
        { name: "Comic Sans", embedded: false },
      ],
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.findings.some((f) => f.includes("non-embedded"))).toBe(true);
    expect(textCat.findings.some((f) => f.includes("Comic Sans"))).toBe(true);
    expect(textCat.score).toBeLessThan(100);
  });

  // ---- Usage-based exemption (v1.79.0) ------------------------------------
  // A non-embedded font that never paints visible, non-whitespace text
  // (word processors emit inter-run SPACES in the paragraph default font;
  // OCR layers paint in invisible mode 3) cannot garble anything — a space
  // has no glyph marks and extraction comes from the encoding, not the font
  // program. Adobe Preflight evaluates fonts "used for rendering" and passes
  // such files; flagging them was a false positive.

  const taggedDoc = {
    hasStructTree: true,
    structTreeDepth: 3,
    contentOrder: [0, 1],
  };

  it("exempts a non-embedded font that never paints visible text", () => {
    const qpdf = makeQpdf({
      ...taggedDoc,
      fonts: [
        { name: "UEMGVF+Calibri", embedded: true, baseFonts: ["UEMGVF+Calibri"] },
        { name: "Arial", embedded: false, baseFonts: ["ArialMT"] },
      ],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      visibleTextFontNames: ["UEMGVF+Calibri"],
    });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.score).toBe(100);
    expect(textCat.findings.some((f) => f.includes("may cause garbled"))).toBe(false);
    expect(textCat.findings.some((f) => f.includes("never displays visible text"))).toBe(true);
  });

  it("still flags a non-embedded font that paints visible text", () => {
    const qpdf = makeQpdf({
      ...taggedDoc,
      fonts: [{ name: "Arial", embedded: false, baseFonts: ["ArialMT"] }],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      visibleTextFontNames: ["ArialMT"],
    });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.score).toBeLessThanOrEqual(85);
    expect(textCat.findings.some((f) => f.includes("may cause garbled"))).toBe(true);
  });

  it("correlates usage across differing subset prefixes", () => {
    const qpdf = makeQpdf({
      ...taggedDoc,
      fonts: [{ name: "Arial", embedded: false, baseFonts: ["XXXXXX+ArialMT"] }],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      visibleTextFontNames: ["YYYYYY+ArialMT"],
    });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.score).toBeLessThanOrEqual(85);
    expect(textCat.findings.some((f) => f.includes("may cause garbled"))).toBe(true);
  });

  it("keeps flagging every non-embedded font when the usage signal is absent (legacy stored reports)", () => {
    const qpdf = makeQpdf({
      ...taggedDoc,
      fonts: [{ name: "Arial", embedded: false, baseFonts: ["ArialMT"] }],
    });
    // makePdfjs default has NO visibleTextFontNames — the pre-v1.79.0 shape.
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.score).toBeLessThanOrEqual(85);
    expect(textCat.findings.some((f) => f.includes("may cause garbled"))).toBe(true);
  });

  it("uses honest wording when the only non-embedded fonts are exempt", () => {
    const qpdf = makeQpdf({
      ...taggedDoc,
      fonts: [
        { name: "UEMGVF+Calibri", embedded: true, baseFonts: ["UEMGVF+Calibri"] },
        { name: "Arial", embedded: false, baseFonts: ["ArialMT"] },
      ],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      visibleTextFontNames: ["UEMGVF+Calibri"],
    });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    // NOT the unconditional "All fonts are embedded" — one of them isn't.
    expect(textCat.findings.some((f) => f.includes("All fonts are embedded"))).toBe(false);
    expect(
      textCat.findings.some((f) => f.includes("All fonts used to display text are embedded")),
    ).toBe(true);
  });

  it("emits no finding matching the action plan's fonts-variant trigger when all non-embedded fonts are exempt", () => {
    // apps/web's actionPlan.ts picks the "Embed the fonts" step when any
    // text_extractability finding matches /non-embedded font/i. A document
    // whose non-embedded fonts are ALL exempt must not trip that trigger —
    // recommending font embedding for harmless whitespace runs would be
    // actively wrong advice.
    const qpdf = makeQpdf({
      ...taggedDoc,
      fonts: [{ name: "Arial", embedded: false, baseFonts: ["ArialMT"] }],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      visibleTextFontNames: [],
    });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.findings.some((f) => /non-embedded font/i.test(f))).toBe(false);
  });

  it("passes the Adobe-parity character-encoding rule when non-embedded fonts are all exempt", () => {
    const qpdf = makeQpdf({
      ...taggedDoc,
      fonts: [
        { name: "UEMGVF+Calibri", embedded: true, baseFonts: ["UEMGVF+Calibri"] },
        { name: "Arial", embedded: false, baseFonts: ["ArialMT"] },
      ],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      visibleTextFontNames: ["UEMGVF+Calibri"],
    });
    const result = scoreDocument(qpdf, pdfjs);
    const encodingRule = result.adobeParity?.rules.find((r) => r.id === "character_encoding");
    expect(encodingRule?.status).toBe("passed");
  });
});

describe("supplementary findings — empty pages", () => {
  it("reports empty pages", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      emptyPages: [3, 7],
    });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.findings.some((f) => f.includes("2 empty"))).toBe(true);
    expect(textCat.findings.some((f) => f.includes("page(s) 3, 7"))).toBe(true);
  });
});

describe("supplementary findings — role mapping & tab order", () => {
  it("reports role mapping in reading_order", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      hasRoleMap: true,
      roleMapEntries: ["Heading1 → H1", "Normal → P"],
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const readingCat = findCategory(result, "reading_order");
    expect(readingCat.findings.some((f) => f.includes("Role mapping present"))).toBe(true);
  });

  it("reports tab order status", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      tabOrderPages: 5,
      totalPageCount: 5,
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const readingCat = findCategory(result, "reading_order");
    expect(readingCat.findings.some((f) => f.includes("Tab order is set on all"))).toBe(true);
  });

  it("reports missing tab order", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      tabOrderPages: 0,
      totalPageCount: 10,
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const readingCat = findCategory(result, "reading_order");
    expect(readingCat.findings.some((f) => f.includes("No tab order"))).toBe(true);
  });
});

describe("supplementary findings — language spans", () => {
  it("reports foreign language spans", () => {
    const qpdf = makeQpdf({
      hasLang: true,
      lang: "en-US",
      langSpans: [
        { lang: "es", tag: "Span" },
        { lang: "es", tag: "P" },
        { lang: "fr", tag: "Span" },
      ],
    });
    const pdfjs = makePdfjs({ title: "Test", hasText: true, textLength: 100 });
    const result = scoreDocument(qpdf, pdfjs);
    const langCat = findCategory(result, "title_language");
    expect(langCat.findings.some((f) => f.includes("Language Span Analysis"))).toBe(true);
    expect(langCat.findings.some((f) => f.includes("es: 2"))).toBe(true);
    expect(langCat.findings.some((f) => f.includes("fr: 1"))).toBe(true);
  });
});

describe("supplementary findings — paragraph count", () => {
  it("reports paragraph tag count", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      paragraphCount: 15,
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.findings.some((f) => f.includes("15 paragraph tag(s)"))).toBe(true);
  });
});

describe("supplementary findings — PDF/UA identifier", () => {
  it("reports PDF/UA conformance when present", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      hasPdfUaIdentifier: true,
      pdfUaPart: "1",
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.findings.some((f) => f.includes("PDF/UA-1"))).toBe(true);
  });

  it("reports no PDF/UA when absent", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      hasPdfUaIdentifier: false,
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.findings.some((f) => f.includes("No PDF/UA identifier"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reading-order rigorous check (Strict mode)
// ---------------------------------------------------------------------------

describe("reading_order — rigorous struct-tree vs. content-stream check", () => {
  // Build the common "deep tree with MCID data" base and let each test
  // override the per-page MCID maps to simulate the fidelity states.
  function buildBase(
    structByPage: Record<number, number[]>,
    streamByPage: Record<number, number[]>,
  ) {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [0, 1, 2],
      totalPageCount: Object.keys(structByPage).length,
      tabOrderPages: Object.keys(structByPage).length,
      paragraphCount: 10,
      structTreeMcidsByPage: structByPage,
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      contentStreamMcidsByPage: streamByPage,
    });
    return { qpdf, pdfjs };
  }

  it("scores 100 in Strict when struct-tree and content-stream MCID orders match perfectly", () => {
    const seq = [0, 1, 2, 3, 4, 5, 6, 7];
    const { qpdf, pdfjs } = buildBase({ 1: seq }, { 1: seq });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "reading_order").score).toBe(100);
  });

  it("scores below 100 when the two sequences diverge", () => {
    const struct = [0, 1, 2, 3, 4, 5, 6, 7];
    const stream = [0, 2, 1, 3, 5, 4, 6, 7]; // a few local swaps
    const { qpdf, pdfjs } = buildBase({ 1: struct }, { 1: stream });
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "reading_order");
    expect(cat.score).not.toBeNull();
    expect(cat.score!).toBeLessThan(100);
    expect(cat.score!).toBeGreaterThan(0);
  });

  it("scores 10 or low when the stream order is the reverse of the tree order", () => {
    const struct = [0, 1, 2, 3, 4, 5, 6, 7];
    const stream = [7, 6, 5, 4, 3, 2, 1, 0];
    const { qpdf, pdfjs } = buildBase({ 1: struct }, { 1: stream });
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "reading_order");
    expect(cat.score).toBeLessThanOrEqual(40);
  });

  it("falls back to N/A in Strict when fewer than 2 MCIDs overlap per page", () => {
    // Struct has MCIDs [0,1,2] but stream only has [99] — no shared MCIDs.
    const { qpdf, pdfjs } = buildBase({ 1: [0, 1, 2] }, { 1: [99] });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "reading_order").score).toBeNull();
  });

  it("includes a human-readable fidelity finding in Strict", () => {
    const seq = [0, 1, 2, 3, 4];
    const { qpdf, pdfjs } = buildBase({ 1: seq }, { 1: seq });
    const result = scoreDocument(qpdf, pdfjs);
    const findings = findCategory(result, "reading_order").findings.join("\n");
    expect(findings).toMatch(/Reading-order fidelity/i);
    expect(findings).toMatch(/100%/);
  });
});

describe("supplementary findings — artifact tagging", () => {
  it("reports artifact count when present", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      artifactCount: 5,
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.findings.some((f) => f.includes("5 element(s) tagged as artifacts"))).toBe(true);
  });

  it("warns when no artifacts found in tagged PDF", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      artifactCount: 0,
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.findings.some((f) => f.includes("No artifact tags found"))).toBe(true);
  });
});

describe("supplementary findings — ActualText & expansion text", () => {
  it("reports ActualText when present", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      actualTextCount: 3,
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const readingCat = findCategory(result, "reading_order");
    expect(readingCat.findings.some((f) => f.includes("3 element(s) have /ActualText"))).toBe(true);
  });

  it("reports expansion text when present", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      expansionTextCount: 2,
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const readingCat = findCategory(result, "reading_order");
    expect(
      readingCat.findings.some((f) => f.includes("2 element(s) have /E (expansion text)")),
    ).toBe(true);
  });

  it("does not add section when neither present", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      actualTextCount: 0,
      expansionTextCount: 0,
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const readingCat = findCategory(result, "reading_order");
    expect(readingCat.findings.some((f) => f.includes("Screen Reader Text Overrides"))).toBe(false);
  });
});

describe("scoreLinkQuality edge cases", () => {
  it("all descriptive links → score 100", () => {
    const qpdf = makeQpdf();
    const pdfjs = makePdfjs({
      links: [
        { url: "https://example.com", text: "View Report" },
        { url: "https://example.com/faq", text: "Frequently Asked Questions" },
      ],
    });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "link_quality").score).toBe(100);
  });

  it("all raw URL links → score 100 (advisory, not a WCAG 2.4.4 failure)", () => {
    // A visible URL conveys a determinable destination, so WCAG 2.4.4 is met
    // (and PAC does not flag it). It is surfaced as a best-practice advisory,
    // not penalized.
    const qpdf = makeQpdf();
    const pdfjs = makePdfjs({
      links: [
        { url: "https://example.com", text: "https://example.com" },
        { url: "https://example.com/page", text: "www.example.com/page" },
      ],
    });
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "link_quality");
    expect(cat.score).toBe(100);
    expect(cat.findings.some((f) => /raw URL|advisory|not penalized/i.test(f))).toBe(true);
  });

  it("mix of descriptive and vague → proportional score (vague penalized)", () => {
    const qpdf = makeQpdf();
    const pdfjs = makePdfjs({
      links: [
        { url: "https://a.com", text: "Annual Report 2024" }, // descriptive
        { url: "https://b.com", text: "click here" }, // vague → penalized
      ],
    });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "link_quality").score).toBe(50);
  });

  it("raw URLs do not drag the score when mixed with descriptive links", () => {
    const qpdf = makeQpdf();
    const pdfjs = makePdfjs({
      links: [
        { url: "https://a.com", text: "Annual Report 2024" }, // descriptive
        { url: "https://b.com", text: "https://b.com" }, // raw URL → advisory
      ],
    });
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "link_quality").score).toBe(100);
  });

  it("vague phrases ('click here', 'read more') count as non-descriptive (WCAG 2.4.4)", () => {
    const qpdf = makeQpdf();
    const pdfjs = makePdfjs({
      links: [
        { url: "https://a.com", text: "click here" },
        { url: "https://b.com", text: "Read More" },
        { url: "https://c.com", text: "Download the 2024 budget (PDF)" },
      ],
    });
    const result = scoreDocument(qpdf, pdfjs);
    // Only the third link is genuinely descriptive → 1 of 3.
    expect(findCategory(result, "link_quality").score).toBe(33);
  });
});

describe("conformance gate", () => {
  it("an untagged document fails WCAG 2.1 Level A", () => {
    const result = scoreDocument(makeQpdf(), makePdfjs());
    expect(result.conformance.status).toBe("fail");
    expect(result.conformance.failures.some((f) => f.sc === "1.3.1")).toBe(true);
  });

  it("reports 'incomplete' when an analyzer fails — no false accusations", () => {
    const result = scoreDocument(makeQpdf({ error: "qpdf failed to parse" }), makePdfjs());
    expect(result.conformance.status).toBe("incomplete");
    expect(result.conformance.failures).toHaveLength(0);
  });

  it("a tagged figure with no alt text triggers a 1.1.1 failure", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      hasLang: true,
      lang: "en-US",
      images: [
        { ref: "10 0 R", hasAlt: true },
        { ref: "11 0 R", hasAlt: false },
      ],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      title: "Quarterly Report",
      lang: "en-US",
    });
    const result = scoreDocument(qpdf, pdfjs);
    expect(result.conformance.status).toBe("fail");
    expect(
      result.conformance.failures.some((f) => f.sc === "1.1.1" && f.category === "alt_text"),
    ).toBe(true);
  });

  it("a fully accessible document reports no automated failures", () => {
    const { qpdf, pdfjs } = fullyAccessible();
    const result = scoreDocument(qpdf, pdfjs);
    expect(result.conformance.status).toBe("no-automated-failures");
    expect(result.conformance.failures).toHaveLength(0);
  });

  it("always lists color contrast (1.4.3) as not assessed", () => {
    const { qpdf, pdfjs } = fullyAccessible();
    const result = scoreDocument(qpdf, pdfjs);
    expect(result.conformance.notAssessed.some((n) => n.sc === "1.4.3")).toBe(true);
  });
});

describe("scoreFormAccessibility edge cases", () => {
  it("all fields labeled → score 100", () => {
    const qpdf = makeQpdf({
      hasAcroForm: true,
      formFields: [{ hasTU: true }, { hasTU: true }, { hasTU: true }],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "form_accessibility").score).toBe(100);
  });

  it("no fields labeled → score 0", () => {
    const qpdf = makeQpdf({
      hasAcroForm: true,
      formFields: [{ hasTU: false }, { hasTU: false }],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "form_accessibility").score).toBe(0);
  });

  it("hasAcroForm true but empty formFields → N/A", () => {
    const qpdf = makeQpdf({ hasAcroForm: true, formFields: [] });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "form_accessibility").score).toBeNull();
  });
});

describe("scoreReadingOrder edge cases", () => {
  it("no struct tree → score 0", () => {
    const qpdf = makeQpdf({ hasStructTree: false });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "reading_order");
    expect(cat.score).toBe(0);
    expect(cat.severity).toBe("Critical");
  });

  it("flat struct tree (depth 1) → score 30", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 1,
      contentOrder: [0, 1, 2],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "reading_order").score).toBe(30);
  });

  it("deep tree with ordered MCIDs → advisory/N-A", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 4,
      contentOrder: [0, 1, 2, 3, 4, 5],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "reading_order").score).toBeNull();
  });

  it("deep tree with significantly disordered MCIDs still requires manual review", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 4,
      contentOrder: [0, 5, 1, 6, 2, 7, 3, 8, 4, 9],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    const cat = findCategory(result, "reading_order");
    expect(cat.score).toBeNull();
    expect(cat.findings.some((f) => f.includes("Manual review recommended"))).toBe(true);
  });

  it("deep tree with slightly disordered MCIDs (under threshold) → advisory/N-A", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 4,
      contentOrder: [0, 1, 2, 3, 4, 5, 6, 7, 9, 8],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "reading_order").score).toBeNull();
  });

  it("single MCID → advisory/N-A (insufficient evidence for a precise verdict)", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [0],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "reading_order").score).toBeNull();
  });

  it("empty contentOrder with deep tree → advisory/N-A", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    expect(findCategory(result, "reading_order").score).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PDF/UA identifier and artifacts are sourced from pdfjs (XMP + content
// stream), because `qpdf --json` (no stream-data flag) exposes neither.
// ---------------------------------------------------------------------------

describe("PDF/UA + artifacts sourced from pdfjs", () => {
  it("detects the PDF/UA identifier from pdfjs XMP even when qpdf misses it", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      hasPdfUaIdentifier: false, // qpdf cannot see the compressed XMP
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      hasPdfUaIdentifier: true,
      pdfUaPart: "1",
    });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.findings.some((f) => f.includes("PDF/UA-1"))).toBe(true);
    expect(textCat.findings.some((f) => f.includes("No PDF/UA identifier"))).toBe(false);
  });

  it("detects artifacts from pdfjs content stream even when qpdf struct count is 0", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      artifactCount: 0, // no /S=/Artifact struct elements (the common case)
      structTreeDepth: 3,
      contentOrder: [0, 1],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      artifactRunCount: 17,
    });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.findings.some((f) => f.includes("tagged as artifacts"))).toBe(true);
    expect(textCat.findings.some((f) => f.includes("No artifact tags found"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Acrobat "How to Fix" guide visibility — only on categories below 100.
// ---------------------------------------------------------------------------

describe("pdfUa conformance signals", () => {
  it("summarizes machine-checkable PDF/UA-1 signals from qpdf + pdfjs", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      hasMarkInfo: true,
      isMarkedContent: true,
      structTreeDepth: 4,
      hasLang: true,
      lang: "en-US",
      fonts: [
        { name: "A", embedded: true },
        { name: "B", embedded: true },
      ],
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      title: "Quarterly Report",
      hasPdfUaIdentifier: true,
      pdfUaPart: "1",
      artifactRunCount: 17,
    });
    const result = scoreDocument(qpdf, pdfjs);
    expect(result.pdfUa!.hasIdentifier).toBe(true);
    expect(result.pdfUa!.part).toBe("1");
    expect(result.pdfUa!.isTagged).toBe(true);
    expect(result.pdfUa!.isMarkedContent).toBe(true);
    expect(result.pdfUa!.artifactRunCount).toBe(17);
    expect(result.pdfUa!.fontCount).toBe(2);
    expect(result.pdfUa!.embeddedFontCount).toBe(2);
    expect(result.pdfUa!.allFontsEmbedded).toBe(true);
    expect(result.pdfUa!.structTreeDepth).toBe(4);
    expect(result.pdfUa!.hasLanguage).toBe(true);
    expect(result.pdfUa!.hasTitle).toBe(true);
  });

  it("reports absence honestly when signals are missing", () => {
    const result = scoreDocument(makeQpdf(), makePdfjs());
    expect(result.pdfUa!.hasIdentifier).toBe(false);
    expect(result.pdfUa!.part).toBeNull();
    expect(result.pdfUa!.isTagged).toBe(false);
    expect(result.pdfUa!.isMarkedContent).toBe(false);
    expect(result.pdfUa!.artifactRunCount).toBe(0);
  });
});

describe("Acrobat How-to-Fix guide visibility", () => {
  it("is NOT appended to categories scoring 100", () => {
    const { qpdf, pdfjs } = fullyAccessible();
    const result = scoreDocument(qpdf, pdfjs);
    for (const cat of result.categories) {
      if (cat.score === 100) {
        expect(cat.findings.some((f) => f.includes("Adobe Acrobat: How to Fix"))).toBe(false);
      }
    }
  });

  it("is appended to a category scoring below 100", () => {
    // Untagged document → text_extractability scores 50 (text but no tags).
    const qpdf = makeQpdf({ hasStructTree: false });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const textCat = findCategory(result, "text_extractability");
    expect(textCat.score).toBeLessThan(100);
    expect(textCat.findings.some((f) => f.includes("Adobe Acrobat: How to Fix"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reading-order fidelity: noise-tolerant top band + transparent deduction.
// ---------------------------------------------------------------------------

describe("reading_order — noise tolerance & deduction transparency", () => {
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  const withSwaps = (arr: number[], pairs: Array<[number, number]>) => {
    const c = [...arr];
    for (const [i, j] of pairs) {
      const t = c[i];
      c[i] = c[j];
      c[j] = t;
    }
    return c;
  };
  function build(struct: number[], stream: number[]) {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      contentOrder: [0, 1, 2],
      totalPageCount: 1,
      tabOrderPages: 1,
      paragraphCount: 10,
      structTreeMcidsByPage: { 1: struct },
    });
    const pdfjs = makePdfjs({
      hasText: true,
      textLength: 500,
      contentStreamMcidsByPage: { 1: stream },
    });
    return { qpdf, pdfjs };
  }

  it("scores 100 when fidelity is in the 97–99% band (extraction jitter tolerated)", () => {
    const struct = range(100);
    const stream = withSwaps(struct, [
      [10, 11],
      [60, 61],
    ]); // 2 transpositions → ~98% LCS
    const { qpdf, pdfjs } = build(struct, stream);
    expect(findCategory(scoreDocument(qpdf, pdfjs), "reading_order").score).toBe(100);
  });

  it("explains the point deduction when fidelity is below the 100 threshold", () => {
    const struct = range(20);
    const stream = withSwaps(struct, [[10, 11]]); // 19/20 = 95% → below 100
    const { qpdf, pdfjs } = build(struct, stream);
    const cat = findCategory(scoreDocument(qpdf, pdfjs), "reading_order");
    expect(cat.score).not.toBe(100);
    expect(cat.findings.some((f) => /reading order scored/i.test(f))).toBe(true);
  });

  it("does not contradict itself by claiming it cannot compare order when it just did", () => {
    const seq = range(10);
    const { qpdf, pdfjs } = build(seq, seq);
    const cat = findCategory(scoreDocument(qpdf, pdfjs), "reading_order");
    expect(
      cat.findings.some((f) => f.includes("does not yet compare per-page marked-content order")),
    ).toBe(false);
  });

  // ---- Figure paint order is not reading order (v1.81.0) ------------------
  // Real case (orderform-accessible.pdf, 2026-08-17): the company logo —
  // a /Figure, correctly tagged FIRST because it sits at the top of the
  // page — was painted LAST by Excel's exporter. 27/28 = 96.4% missed the
  // 97% band and a correctly ordered document lost 10 points. Image paint
  // order is a z-order concern with zero reading-order information, so
  // figure MCIDs are excluded from the fidelity comparison.

  it("does not penalize a figure painted out of sequence (the Excel logo case)", () => {
    // Tag order: figure first (top of page). Draw order: figure painted last.
    const text = range(27);
    const struct = [41, ...text];
    const stream = [...text, 41];
    const { qpdf, pdfjs } = build(struct, stream);
    qpdf.figureMcidsByPage = { 1: [41] };
    expect(findCategory(scoreDocument(qpdf, pdfjs), "reading_order").score).toBe(100);
  });

  it("keeps the legacy deduction when the figure census is absent (old stored payloads)", () => {
    const text = range(27);
    const struct = [41, ...text];
    const stream = [...text, 41];
    const { qpdf, pdfjs } = build(struct, stream);
    // No figureMcidsByPage — the pre-v1.81.0 stored-payload shape.
    expect(findCategory(scoreDocument(qpdf, pdfjs), "reading_order").score).toBe(90);
  });

  it("still deducts for displaced TEXT even when figures are excluded", () => {
    const text = range(20);
    const struct = [41, ...text];
    const stream = [...withSwaps(text, [[10, 11]]), 41]; // real text swap + moved figure
    const { qpdf, pdfjs } = build(struct, stream);
    qpdf.figureMcidsByPage = { 1: [41] };
    // Figure excluded; the text swap alone is 19/20 = 95% → below the band.
    expect(findCategory(scoreDocument(qpdf, pdfjs), "reading_order").score).toBe(90);
  });
});

describe("supplementary findings — Acrobat fix guide", () => {
  it("appends the Acrobat guide to a failing form_accessibility category", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      hasAcroForm: true,
      formFields: [
        { ref: "5 0 R", hasTU: false, name: "firstName" },
        { ref: "6 0 R", hasTU: true, name: "lastName" },
      ],
    });
    const pdfjs = makePdfjs({ hasText: true, textLength: 500 });
    const result = scoreDocument(qpdf, pdfjs);
    const formCat = findCategory(result, "form_accessibility");
    expect(formCat.score).toBeLessThan(100);
    expect(formCat.findings.some((f) => f.includes("Adobe Acrobat: How to Fix"))).toBe(true);
  });
});

describe("help links and How-to-fix accuracy", () => {
  // WebAIM's PDF series has no "#702" anchor (verified 2026-06-10 against
  // webaim.org/techniques/acrobat/*) — links using it silently scroll to the
  // top of the wrong page.
  it("contains no broken WebAIM #702 anchors in help links", () => {
    const { qpdf, pdfjs } = fullyAccessible();
    // Force every category to emit (failures produce the most links/findings)
    const result = scoreDocument(makeQpdf(), makePdfjs());
    const all = [result, scoreDocument(qpdf, pdfjs)];
    for (const r of all) {
      for (const cat of r.categories) {
        for (const link of cat.helpLinks) {
          expect(link.url).not.toContain("#702");
          expect(link.url).not.toContain("acrobat#document");
        }
      }
    }
  });

  // The app audits against WCAG.VERSION (2.2 by default); category help
  // links to W3C "Understanding" pages must use the same version base as
  // the conformance gate, not a hardcoded 2.1.
  it("links W3C Understanding pages for the active WCAG version", () => {
    // Mirrors the WCAG version flag (defaults to 2.2; WCAG_VERSION=2.1
    // reverts) so the suite stays green under either setting.
    const expected = process.env.WCAG_VERSION === "2.1" ? "/WCAG21/" : "/WCAG22/";
    const result = scoreDocument(makeQpdf(), makePdfjs());
    for (const cat of result.categories) {
      for (const link of cat.helpLinks) {
        if (link.url.includes("/Understanding/")) {
          expect(link.url).toContain(expected);
        }
      }
    }
  });
});

describe("text_extractability — StructTreeRoot present but empty", () => {
  // A tag tree that references no content leaves a screen reader exactly
  // where an untagged file does, so it must not score as a tagged document.
  // Reproduces controls/ILHEALSFallWinter2022FINAL-remediated.pdf.
  const emptyTree = () =>
    makeQpdf({
      hasStructTree: true,
      isMarkedContent: true,
      structTreeDepth: 0,
      paragraphCount: 0,
      headings: [],
      images: [],
      tables: [],
      lists: [],
      contentOrder: [],
      structTreeMcidsByPage: {},
    });

  it("scores 50 (as untagged), not 100, when the tree references no content", () => {
    const result = scoreDocument(
      emptyTree(),
      makePdfjs({ hasText: true, textLength: 9948, pageCount: 4 }),
    );
    const cat = result.categories.find((c) => c.id === "text_extractability")!;
    expect(cat.score).toBe(50);
  });

  it("says the tag tree is empty rather than 'Document is tagged'", () => {
    const result = scoreDocument(
      emptyTree(),
      makePdfjs({ hasText: true, textLength: 9948, pageCount: 4 }),
    );
    const cat = result.categories.find((c) => c.id === "text_extractability")!;
    expect(cat.findings.some((f) => /empty|no content|references no/i.test(f))).toBe(true);
    expect(cat.findings).not.toContain("Document is tagged (StructTreeRoot present)");
  });

  it("still scores 100 for a tagged document whose tree carries content", () => {
    const result = scoreDocument(
      makeQpdf({
        hasStructTree: true,
        paragraphCount: 40,
        contentOrder: [0, 1, 2],
        structTreeMcidsByPage: { 1: [0, 1, 2] },
      }),
      makePdfjs({ hasText: true, textLength: 9948, pageCount: 4 }),
    );
    const cat = result.categories.find((c) => c.id === "text_extractability")!;
    expect(cat.score).toBe(100);
  });
});

describe("alt_text — content images that were never tagged as <Figure>", () => {
  it("scores 0 rather than N/A when every content image is untagged", () => {
    // Strictly worse than a tagged figure missing /Alt, yet the category
    // used to return N/A and drop out of the weighted average entirely.
    const result = scoreDocument(
      makeQpdf({
        hasStructTree: true,
        paragraphCount: 20,
        contentOrder: [0],
        imageObjectCount: 10,
      }),
      makePdfjs({
        hasText: true,
        textLength: 5000,
        imageCount: 10,
        nonArtifactImageCount: 10,
      }),
    );
    const cat = result.categories.find((c) => c.id === "alt_text")!;
    expect(cat.score).toBe(0);
  });

  it("counts untagged content images in the denominator alongside tagged figures", () => {
    // 2 tagged figures, both with alt, plus 2 painted content images that
    // never made it into the tag tree => 2 of 4 covered.
    const result = scoreDocument(
      makeQpdf({
        hasStructTree: true,
        paragraphCount: 20,
        contentOrder: [0],
        imageObjectCount: 4,
        images: [
          { ref: "5 0 R", hasAlt: true, altText: "A" },
          { ref: "6 0 R", hasAlt: true, altText: "B" },
        ],
      }),
      makePdfjs({ hasText: true, textLength: 5000, imageCount: 4, nonArtifactImageCount: 4 }),
    );
    const cat = result.categories.find((c) => c.id === "alt_text")!;
    expect(cat.score).toBe(50);
  });

  it("stays N/A when every painted image is artifacted", () => {
    const result = scoreDocument(
      makeQpdf({ hasStructTree: true, paragraphCount: 20, contentOrder: [0], imageObjectCount: 4 }),
      makePdfjs({ hasText: true, textLength: 5000, imageCount: 4, nonArtifactImageCount: 0 }),
    );
    const cat = result.categories.find((c) => c.id === "alt_text")!;
    expect(cat.score).toBeNull();
  });

  it("does not penalise a fully tagged document whose figures outnumber raster images", () => {
    // <Figure> legitimately wraps vector content, so figures can exceed the
    // painted-image count. That must never create phantom untagged images.
    const result = scoreDocument(
      makeQpdf({
        hasStructTree: true,
        paragraphCount: 20,
        contentOrder: [0],
        imageObjectCount: 2,
        images: Array.from({ length: 8 }, (_, i) => ({
          ref: `${10 + i} 0 R`,
          hasAlt: true,
          altText: `Chart ${i}`,
        })),
      }),
      makePdfjs({ hasText: true, textLength: 5000, imageCount: 2, nonArtifactImageCount: 2 }),
    );
    const cat = result.categories.find((c) => c.id === "alt_text")!;
    expect(cat.score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 2026-08-08 calibration — adversarial review against controls/.
// The score is a readiness metric and may be stricter than WCAG, but a
// sub-100 category score becomes a severity, and a severity CAPS the grade
// (SEVERITY_GRADE_CAPS). So only findings with a standards or tool-precedent
// basis may score below 100; conventions stay as advisory findings.
// ---------------------------------------------------------------------------

describe("multiple H1s are advisory, not scored", () => {
  // No WCAG SC, PDF/UA clause, or Matterhorn condition requires a single H1,
  // and Acrobat/PAC do not flag it. The old 75/Minor capped a document with
  // zero automated conformance failures at B: controls/DVFR_Biennial_2024
  // (5×H1, its ONLY sub-100 category) was denied its A by an HTML-era
  // convention.
  it("H1→H2→H2→H1 keeps score 100 with an advisory finding", () => {
    const qpdf = makeQpdf({
      headings: [
        { level: "H1", tag: "/H1" },
        { level: "H2", tag: "/H2" },
        { level: "H2", tag: "/H2" },
        { level: "H1", tag: "/H1" },
      ],
    });
    const cat = findCategory(scoreDocument(qpdf, makePdfjs()), "heading_structure");
    expect(cat.score).toBe(100);
    expect(cat.severity).toBe("No issues found");
    // The observation is still surfaced — as advice, with its basis stated.
    expect(cat.findings.some((f) => f.includes("2 H1 headings"))).toBe(true);
    expect(cat.findings.some((f) => /no WCAG criterion requires/i.test(f))).toBe(true);
  });

  it("an all-H1 flat outline is still advisory, with pointed copy", () => {
    const qpdf = makeQpdf({
      headings: Array.from({ length: 6 }, () => ({ level: "H1", tag: "/H1" })),
    });
    const cat = findCategory(scoreDocument(qpdf, makePdfjs()), "heading_structure");
    expect(cat.score).toBe(100);
    expect(cat.findings.some((f) => f.includes("6 H1 headings"))).toBe(true);
  });

  it("hierarchy skips still score 60, and multiple H1s no longer compound to 55", () => {
    // The skip penalty keeps its technique basis (G141); the H1 count no
    // longer stacks a second penalty on top.
    const qpdf = makeQpdf({
      headings: [
        { level: "H1", tag: "/H1" },
        { level: "H3", tag: "/H3" },
        { level: "H1", tag: "/H1" },
      ],
    });
    expect(findCategory(scoreDocument(qpdf, makePdfjs()), "heading_structure").score).toBe(60);
  });
});

describe("single-column tables are layout, not data", () => {
  // The conformance gate already skips one-column constructs
  // ((t.columnCounts[0] ?? 2) >= 2); the score docked them for missing <TH>
  // anyway. controls/2022_DVFR_Annual_Report: 26 single-column tables →
  // table_markup 75 for header markup on constructs the tool itself
  // classifies as layout.
  it("a document whose only tables are single-column gets N/A, not a dock", () => {
    const qpdf = makeQpdf({
      tables: [
        makeTable({
          rowCount: 5,
          columnCounts: [1, 1, 1, 1, 1],
          dataCellCount: 5,
          hasRowStructure: true,
          hasConsistentColumns: true,
        }),
        makeTable({
          rowCount: 3,
          columnCounts: [1, 1, 1],
          dataCellCount: 3,
          hasRowStructure: true,
          hasConsistentColumns: true,
        }),
      ],
    });
    const cat = findCategory(scoreDocument(qpdf, makePdfjs()), "table_markup");
    expect(cat.score).toBeNull();
    expect(cat.findings.some((f) => /single-column/i.test(f))).toBe(true);
  });

  it("layout tables do not dilute a real data table's score", () => {
    const dataTable = makeTable({
      hasHeaders: true,
      headerCount: 3,
      dataCellCount: 9,
      hasScope: true,
      hasRowStructure: true,
      rowCount: 4,
      hasConsistentColumns: true,
      columnCounts: [3, 3, 3, 3],
    });
    const layout = makeTable({
      rowCount: 4,
      columnCounts: [1, 1, 1, 1],
      dataCellCount: 4,
      hasRowStructure: true,
      hasConsistentColumns: true,
    });
    const withLayout = findCategory(
      scoreDocument(makeQpdf({ tables: [dataTable, layout] }), makePdfjs()),
      "table_markup",
    );
    const alone = findCategory(
      scoreDocument(makeQpdf({ tables: [dataTable] }), makePdfjs()),
      "table_markup",
    );
    expect(withLayout.score).toBe(alone.score);
  });
});

describe("bookmarks framing — best practice, not a WCAG requirement", () => {
  it("missing bookmarks on a long PDF keeps its score but stops citing 2.4.5 as the rule", () => {
    // 2.4.5 Multiple Ways is scoped to a SET of web pages; no criterion
    // requires bookmarks inside a single document. Acrobat's own checker
    // flags them on long documents, which is the honest precedent to cite.
    const qpdf = makeQpdf({ hasStructTree: true, paragraphCount: 30 });
    const pdfjs = makePdfjs({ pageCount: 40, hasText: true, textLength: 9000 });
    const cat = findCategory(scoreDocument(qpdf, pdfjs), "bookmarks");
    expect(cat.score).toBe(45);
    expect(cat.findings.some((f) => f.includes("map to WCAG 2.4.5"))).toBe(false);
    expect(cat.findings.some((f) => /no WCAG criterion strictly requires/i.test(f))).toBe(true);
    expect(cat.findings.some((f) => /Acrobat/.test(f))).toBe(true);
  });
});

describe("alt text that declares itself decorative", () => {
  // controls/DVFR_Biennial_2024: three <Figure>s carry /Alt "Decorative
  // border". A screen reader announces every one; an image that IS
  // decorative belongs outside the reading order as an /Artifact, not in it
  // with a self-cancelling description.
  it("flags 'Decorative border' and points at artifacting instead", () => {
    const qpdf = makeQpdf({
      images: [
        { ref: "12 0 R", hasAlt: true, altText: "Decorative border" },
        { ref: "13 0 R", hasAlt: true, altText: "Chart of 2024 referrals by county" },
      ],
    });
    const cat = findCategory(
      scoreDocument(qpdf, makePdfjs({ hasText: true, textLength: 500 })),
      "alt_text",
    );
    expect(cat.score).toBe(100); // advisory only — alt coverage is complete
    expect(cat.findings.some((f) => f.includes("Decorative border") && /artifact/i.test(f))).toBe(
      true,
    );
  });

  it("does not flag alt that merely depicts decoration", () => {
    const qpdf = makeQpdf({
      images: [
        {
          ref: "12 0 R",
          hasAlt: true,
          altText: "Photo of decorative ironwork on the courthouse gate",
        },
      ],
    });
    const cat = findCategory(
      scoreDocument(qpdf, makePdfjs({ hasText: true, textLength: 500 })),
      "alt_text",
    );
    expect(cat.findings.some((f) => /marked as an \/Artifact/i.test(f))).toBe(false);
  });
});

describe("heading outline signals (pdf.js heading text)", () => {
  const taggedQpdf = () =>
    makeQpdf({
      hasStructTree: true,
      isMarkedContent: true,
      headings: [
        { level: "H1", tag: "/H1" },
        { level: "H2", tag: "/H2" },
      ],
    });

  it("emits a Heading Outline group with each heading's text when pdfjs resolved it", () => {
    const pdfjs = makePdfjs({
      headingOutline: [
        { level: "H1", text: "Annual Report" },
        { level: "H2", text: "Introduction" },
      ],
    });
    const f = findCategory(scoreDocument(taggedQpdf(), pdfjs), "heading_structure").findings;
    expect(f).toContain("--- Heading Outline ---");
    expect(f).toContain('  H1 "Annual Report"');
    expect(f).toContain('  H2 "Introduction"');
  });

  it("omits the Heading Outline group when pdfjs found no heading text", () => {
    const f = findCategory(scoreDocument(taggedQpdf(), makePdfjs()), "heading_structure").findings;
    expect(f).not.toContain("--- Heading Outline ---");
    expect(f).toContain("--- Heading Tree ---");
  });

  it("caps the outline at 40 headings and notes the remainder", () => {
    const outline = Array.from({ length: 45 }, (_, i) => ({
      level: "H2",
      text: `Section ${i + 1}`,
    }));
    const f = findCategory(
      scoreDocument(taggedQpdf(), makePdfjs({ headingOutline: outline })),
      "heading_structure",
    ).findings;
    expect(f.filter((l) => /^ {2}H\d "/.test(l))).toHaveLength(40);
    expect(f).toContain("  ... and 5 more heading(s)");
  });
});
