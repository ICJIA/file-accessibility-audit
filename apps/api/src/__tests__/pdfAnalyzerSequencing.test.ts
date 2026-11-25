/**
 * qpdf must run to COMPLETION before the pdfjs pass starts.
 *
 * WHY (2026-08-28, a 246-page InDesign annual report reported as "too complex
 * to analyze within the time limit"): the two passes used to run under one
 * `Promise.all`. pdfjs runs IN-PROCESS, so Node only drains qpdf's multi-
 * megabyte JSON off its stdout pipe between pdfjs page chunks — qpdf blocks on
 * a full pipe while its OWN wall-clock timeout runs. Measured on the
 * production droplet: qpdf alone 1.7s, qpdf alongside pdfjs 15.7s, and with
 * the two veraPDF JVMs also competing it was killed at QPDF_TIMEOUT_MS and the
 * author was told their document was too complex. qpdf's timeout was measuring
 * the whole audit's wall clock instead of qpdf's own work.
 *
 * Running qpdf first costs almost nothing — the overlap was never real on the
 * documents that matter (15.7s concurrent vs 1.7 + 14.2 sequential) — and it
 * restores the timeout to what it is documented to mean.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { order } = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock("../services/qpdfService.js", async () => {
  const { taggedBaseline } = await import("./helpers/mockResults.js");
  return {
    analyzeWithQpdfAsync: vi.fn(async () => {
      order.push("qpdf:start");
      // A real qpdf run settles on a later tick; without that the two passes
      // could interleave only in wall-clock, not in this recorded order.
      await new Promise((r) => setTimeout(r, 20));
      order.push("qpdf:end");
      return taggedBaseline().qpdf;
    }),
  };
});

vi.mock("../services/pdfjsService.js", async () => {
  const { taggedBaseline } = await import("./helpers/mockResults.js");
  return {
    analyzeWithPdfjs: vi.fn(async () => {
      order.push("pdfjs:start");
      return taggedBaseline().pdfjs;
    }),
  };
});

// Driven through the pipeline function, in process: since 2026-11-25
// analyzePDF runs this same function in a child process, where a mock cannot
// follow (see pdfWorker.ts).
describe("PDF pipeline pass ordering", () => {
  beforeEach(() => {
    order.length = 0;
    vi.clearAllMocks();
  });

  it("does not start the pdfjs pass until qpdf has finished", async () => {
    const { analyzePdfInProcess } = await import("@file-audit/analyzer/pdfWorker");

    await analyzePdfInProcess(Buffer.from("%PDF-1.7 fake"));

    expect(order).toEqual(["qpdf:start", "qpdf:end", "pdfjs:start"]);
  });

  it("still returns a fully scored result from both passes", async () => {
    const { analyzePdfInProcess } = await import("@file-audit/analyzer/pdfWorker");

    const result = await analyzePdfInProcess(Buffer.from("%PDF-1.7 fake"));

    // pageCount comes from pdfjs, the grade from scoring the qpdf structure.
    expect(result.pageCount).toBe(2);
    expect(result.scoring.grade).toBeTruthy();
  });

  it("never starts pdfjs when qpdf fails outright", async () => {
    const { analyzeWithQpdfAsync } = await import("../services/qpdfService.js");
    vi.mocked(analyzeWithQpdfAsync).mockRejectedValueOnce(
      Object.assign(new Error("QPDF timeout"), { killed: true }),
    );
    const { analyzePdfInProcess } = await import("@file-audit/analyzer/pdfWorker");

    await expect(analyzePdfInProcess(Buffer.from("%PDF-"))).rejects.toMatchObject({
      killed: true,
    });
    expect(order).not.toContain("pdfjs:start");
  });
});
