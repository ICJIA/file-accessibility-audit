/**
 * Boundary tests from the 8x8-fixture lesson (v1.125.0).
 *
 * The re-save invariance gate's first-ever run (2026-08-29) caught trap
 * fixtures whose 8x8 images sat under the analyzer's tiny-image skip,
 * making their census depend on whether pdf.js could resolve the image —
 * which varied with byte layout. The corpus now pins that end to end; these
 * tests pin the SAME boundaries at the unit level, so they survive corpus
 * refactors and say precisely where the lines are:
 *
 *   - MIN_IMAGE_DIM: a 49px-intrinsic image is skipped as decoration, a
 *     50px one is counted — regardless of how large it is painted.
 *   - markedContentAttributionReliable: the exported thresholds that decide
 *     "we could not read this page" vs "these headings are empty"
 *     (20 text items to judge, >2 ids to average, half must carry text).
 */
import { describe, it, expect } from "vitest";
import { analyzeWithPdfjs, markedContentAttributionReliable } from "../services/pdfjsService.js";
import { buildPdf } from "./helpers/minimalPdf.js";

function imageDoc(px: number): Buffer {
  const bytes = px * px;
  const content = `q 300 0 0 300 72 400 cm /Im1 Do Q\nBT /F1 11 Tf 72 720 Td (A paragraph of ordinary running text so the page is not empty at all.) Tj ET\n`;
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Type /XObject /Subtype /Image /Width ${px} /Height ${px} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${bytes} >>\nstream\n${"x".repeat(bytes)}\nendstream`,
  ]);
}

describe("MIN_IMAGE_DIM boundary — intrinsic pixels decide, not painted size", () => {
  it("skips a 49px image as tiny decoration even when painted 300pt wide", async () => {
    const r = await analyzeWithPdfjs(imageDoc(49));
    expect(r.imageCount).toBe(0);
  });

  it("counts a 50px image — the first size that is content", async () => {
    const r = await analyzeWithPdfjs(imageDoc(50));
    expect(r.imageCount).toBe(1);
  });
});

describe("markedContentAttributionReliable — the exported thresholds", () => {
  it("trusts a page with too little text to judge (<= 20 items), whatever the ratio", () => {
    expect(markedContentAttributionReliable({ textItems: 20, idsSeen: 10, idsWithText: 0 })).toBe(
      true,
    );
  });

  it("trusts a page with too few ids to average (<= 2), whatever the ratio", () => {
    expect(markedContentAttributionReliable({ textItems: 100, idsSeen: 2, idsWithText: 0 })).toBe(
      true,
    );
  });

  it("declares the DVFR shape unreliable: many items, many ids, text for one", () => {
    expect(markedContentAttributionReliable({ textItems: 168, idsSeen: 17, idsWithText: 1 })).toBe(
      false,
    );
  });

  it("half the ids carrying text is exactly enough to be judged reliable", () => {
    expect(markedContentAttributionReliable({ textItems: 100, idsSeen: 10, idsWithText: 5 })).toBe(
      true,
    );
    expect(markedContentAttributionReliable({ textItems: 100, idsSeen: 10, idsWithText: 4 })).toBe(
      false,
    );
  });
});
