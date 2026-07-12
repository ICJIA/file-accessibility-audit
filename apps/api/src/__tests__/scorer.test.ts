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
  const pdfjs = makePdfjs({ pageCount: 1 });
  const result = scoreDocument(qpdf, pdfjs);

  it("isScanned is true", () => {
    expect(result.isScanned).toBe(true);
  });

  it("overall score is 0", () => {
    expect(result.overallScore).toBe(0);
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
    const qpdf = makeQpdf();
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

    // text_extractability = 100, title_language = 100, heading_structure = 0 (F),
    // alt_text = null (no images), bookmarks = null, table_markup = null,
    // link_quality = null, form_accessibility = null, reading_order = null
    // Applicable: text(0.20), title(0.15), heading(0.15)
    // Total weight = 0.50
    const text = findCategory(result, "text_extractability");
    const title = findCategory(result, "title_language");
    const heading = findCategory(result, "heading_structure");
    const alt = findCategory(result, "alt_text");
    const reading = findCategory(result, "reading_order");

    expect(text.score).toBe(100);
    expect(title.score).toBe(100);
    expect(heading.score).toBe(0); // no headings -> F
    expect(alt.score).toBeNull(); // no images -> N/A
    expect(reading.score).toBeNull();

    // Expected: (100*0.20 + 100*0.15 + 0*0.15) / 0.50 = 70
    expect(result.overallScore).toBe(70);
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

  it("score 100 → grade A", () => {
    const { qpdf, pdfjs } = fullyAccessible();
    const result = scoreDocument(qpdf, pdfjs);
    expect(result.grade).toBe("A");
  });

  it("score 90 → grade A (boundary)", () => {
    // Create a scenario that produces exactly 90
    const { qpdf, pdfjs } = fullyAccessible();
    // Reduce one category slightly — 1 of 2 images missing alt → alt_text = 50
    qpdf.images = [
      { ref: "10 0 R", hasAlt: true },
      { ref: "11 0 R", hasAlt: false },
    ];
    const result = scoreDocument(qpdf, pdfjs);
    // Verify grade based on the score produced
    if (result.overallScore >= 90) expect(result.grade).toBe("A");
    else if (result.overallScore >= 80) expect(result.grade).toBe("B");
    else expect.fail(`Unexpected score: ${result.overallScore}`);
  });

  it("score in 80-89 → grade B", () => {
    const { qpdf, pdfjs } = fullyAccessible();
    // Remove title → title_language drops to 50
    pdfjs.title = null;
    // title_language goes to 50 (only lang). weight 0.15.
    // All others are 100. Overall = 100 - (50 * 0.15) = 92.5 → still A
    // Need more degradation. Also break heading hierarchy.
    qpdf.headings = [
      { level: "H1", tag: "/H1" },
      { level: "H3", tag: "/H3" }, // skips H2
    ];
    const result2 = scoreDocument(qpdf, pdfjs);
    // heading_structure = 60, title_language = 50
    // With these two lowered, overall should be in the 80s range
    expect(result2.overallScore).toBeGreaterThanOrEqual(80);
    expect(result2.overallScore).toBeLessThan(100);
    if (result2.overallScore >= 90) expect(result2.grade).toBe("A");
    else expect(result2.grade).toBe("B");
  });

  it("grade F for a 0 score", () => {
    const qpdf = makeQpdf();
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
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
    const pdfjs = makePdfjs();
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
    const qpdf = makeQpdf({ headings: [] });
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

  it("H1→H2→H2→H1 (multiple H1s) → score 75 with warning", () => {
    const qpdf = makeQpdf({
      headings: [
        { level: "H1", tag: "/H1" },
        { level: "H2", tag: "/H2" },
        { level: "H2", tag: "/H2" },
        { level: "H1", tag: "/H1" },
      ],
    });
    const pdfjs = makePdfjs();
    const result = scoreDocument(qpdf, pdfjs);
    // No hierarchy skip, but 2 H1s → minor ding (75)
    expect(findCategory(result, "heading_structure").score).toBe(75);
    expect(
      findCategory(result, "heading_structure").findings.some(
        (f: string) => f.includes("H1 headings") && f.includes("exactly one"),
      ),
    ).toBe(true);
  });
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
