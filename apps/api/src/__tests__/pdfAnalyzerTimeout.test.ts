/**
 * The pdfjs extraction pass runs in-process, so a pathological PDF could
 * otherwise hold a concurrency slot indefinitely. analyzePDF must abandon
 * the analysis with a timeout error once pdfjs exceeds PDFJS_TIMEOUT_MS,
 * freeing the slot. Verified via a stubbed pdfjs service that hangs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// qpdf returns immediately; pdfjs hangs forever to simulate a pathological doc.
vi.mock("../services/qpdfService.js", () => ({
  analyzeWithQpdfAsync: vi.fn(async () => ({
    hasStructTree: true,
    error: null,
    fonts: [],
    images: [],
    tables: [],
    lists: [],
    headings: [],
    formFields: [],
    langSpans: [],
    roleMapEntries: [],
    outlineTitles: [],
    contentOrder: [],
    structTreeMcidsByPage: {},
    hasLang: false,
    lang: null,
    hasOutlines: false,
    outlineCount: 0,
    hasAcroForm: false,
    imageObjectCount: 0,
    paragraphCount: 0,
    hasMarkInfo: false,
    isMarkedContent: false,
    hasRoleMap: false,
    tabOrderPages: 0,
    totalPageCount: 1,
    hasPdfUaIdentifier: false,
    pdfUaPart: null,
    artifactCount: 0,
    actualTextCount: 0,
    expansionTextCount: 0,
    structTreeDepth: 1,
  })),
}));

vi.mock("../services/pdfjsService.js", () => ({
  analyzeWithPdfjs: vi.fn(
    () => new Promise(() => {}), // never resolves — simulates a hang
  ),
}));

// Shrink the timeout so the test runs fast.
vi.mock("#config", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    ANALYSIS: { ...actual.ANALYSIS, PDFJS_TIMEOUT_MS: 80 },
  };
});

describe("analyzePDF pdfjs timeout", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("rejects with a timeout error when pdfjs exceeds PDFJS_TIMEOUT_MS", async () => {
    const { analyzePDF } = await import("../services/pdfAnalyzer.js");
    await expect(
      analyzePDF(Buffer.from("%PDF-1.7 fake"), "hang.pdf"),
    ).rejects.toMatchObject({ killed: true });
  });

  it("frees the concurrency slot after a timeout (a second call still runs)", async () => {
    const { analyzePDF } = await import("../services/pdfAnalyzer.js");
    await expect(analyzePDF(Buffer.from("%PDF-"), "a.pdf")).rejects.toThrow();
    // If the slot leaked, this second call would hang on the semaphore and
    // the test would time out; instead it should reach pdfjs and time out too.
    await expect(analyzePDF(Buffer.from("%PDF-"), "b.pdf")).rejects.toThrow();
  });
});
