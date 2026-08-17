/**
 * Tests for the content-stream font-usage signal (visibleTextFontNames).
 *
 * History: the font-embedding check flagged every reachable non-embedded
 * font, but word processors routinely emit inter-run WHITESPACE in a
 * different font (the paragraph default) than the visible text — a
 * newsletter whose every ArialMT run was a single "( )Tj" scored a Minor
 * finding while Adobe Preflight (which evaluates fonts actually used for
 * rendering) passed it. A space paints no glyph and extracts from the
 * encoding, not the font program, so it cannot garble. The scorer therefore
 * needs to know which fonts paint VISIBLE, NON-WHITESPACE text: glyphs
 * outside text rendering mode 3 (invisible — the OCR-layer carve-out the
 * PDF/A and PDF/UA rules also make) whose unicode is not pure whitespace.
 */
import { describe, it, expect } from "vitest";
import { analyzeWithPdfjs } from "../services/pdfjsService.js";
import { buildPdf } from "./helpers/minimalPdf.js";

/** A stream object body with a correct /Length for the given operators. */
function contentStream(ops: string): string {
  return `<< /Length ${Buffer.byteLength(ops, "latin1")} >>\nstream\n${ops}\nendstream`;
}

/**
 * One page, two standard-14 fonts (/F1 Helvetica, /F2 Courier), and the
 * given content stream. Standard-14 fonts keep the usage signal independent
 * of embedding mechanics — pdfjs resolves their names without a FontFile.
 */
function docWithContent(ops: string): Buffer {
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    contentStream(ops),
  ]);
}

describe("visibleTextFontNames", () => {
  it("reports fonts that paint visible text (including TJ arrays with kerning)", async () => {
    const result = await analyzeWithPdfjs(
      docWithContent("BT /F1 12 Tf 72 720 Td [(He) -30 (llo)] TJ ET"),
    );
    expect(result.error).toBeNull();
    expect(result.visibleTextFontNames).toContain("Helvetica");
  });

  it("excludes fonts that only ever paint whitespace", async () => {
    const result = await analyzeWithPdfjs(
      docWithContent("BT /F1 12 Tf 72 720 Td (Hi) Tj /F2 12 Tf ( ) Tj ( ) Tj ET"),
    );
    expect(result.visibleTextFontNames).toContain("Helvetica");
    expect(result.visibleTextFontNames).not.toContain("Courier");
  });

  it("excludes fonts used only in invisible render mode (3 Tr — the OCR text layer)", async () => {
    const result = await analyzeWithPdfjs(
      docWithContent("BT /F1 12 Tf 72 720 Td (Visible) Tj /F2 12 Tf 3 Tr (secret layer) Tj ET"),
    );
    expect(result.visibleTextFontNames).toContain("Helvetica");
    expect(result.visibleTextFontNames).not.toContain("Courier");
  });

  it("counts a font again once the render mode returns from 3 to visible", async () => {
    const result = await analyzeWithPdfjs(
      docWithContent("BT /F2 12 Tf 3 Tr (hidden) Tj 0 Tr (shown) Tj ET"),
    );
    expect(result.visibleTextFontNames).toContain("Courier");
  });

  it("is an empty array (not undefined) for a page with no text at all", async () => {
    const result = await analyzeWithPdfjs(docWithContent("q 1 0 0 1 0 0 cm Q"));
    expect(result.visibleTextFontNames).toEqual([]);
  });
});
