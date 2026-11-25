/**
 * The pipeline's own (courtesy) timeout: when the pdfjs pass YIELDS but never
 * finishes, the pipeline abandons it with a timeout error at
 * PDFJS_TIMEOUT_MS and signals it to stop. Verified via a stubbed pdfjs
 * service that hangs.
 *
 * Since 2026-11-25 the pipeline runs in a child process (pdfWorker.ts), and
 * the case this timeout CANNOT handle — work that never yields — is the
 * parent's SIGKILL, tested for real in pdfWorkerIsolation.test.ts. These
 * tests drive the pipeline function directly, in process, because a mock
 * does not cross a process boundary.
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

describe("the PDF pipeline's own pdfjs timeout", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("rejects with a timeout error when pdfjs exceeds PDFJS_TIMEOUT_MS", async () => {
    const { analyzePdfInProcess } = await import("@file-audit/analyzer/pdfWorker");
    await expect(analyzePdfInProcess(Buffer.from("%PDF-1.7 fake"))).rejects.toMatchObject({
      killed: true,
    });
  });

  it("signals the abandoned pdfjs pass to stop", async () => {
    const { analyzePdfInProcess } = await import("@file-audit/analyzer/pdfWorker");
    const { analyzeWithPdfjs } = await import("../services/pdfjsService.js");
    await expect(analyzePdfInProcess(Buffer.from("%PDF-1.7 fake"))).rejects.toThrow();
    const opts = vi.mocked(analyzeWithPdfjs).mock.calls[0]?.[1] as { signal?: AbortSignal };
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
    expect(opts.signal!.aborted).toBe(true);
  });

  it("a second run after a timeout still reaches pdfjs and times out too", async () => {
    const { analyzePdfInProcess } = await import("@file-audit/analyzer/pdfWorker");
    await expect(analyzePdfInProcess(Buffer.from("%PDF-"))).rejects.toThrow();
    await expect(analyzePdfInProcess(Buffer.from("%PDF-"))).rejects.toThrow();
  });
});
