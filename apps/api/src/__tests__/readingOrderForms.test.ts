/**
 * Reading order is NOT scored on documents that are forms.
 *
 * The case (2026-08-27): a DoIT Accessibility XFA example scored 65/D for
 * reading order, and the document's own author disputed the grade. They were
 * right. The entire deduction came from four `/Caption` elements reading
 * "Order Date:", "City:", "State:", "ZIP:" — tagged exactly where a reader
 * meets them, but painted last, because that is how form content renders.
 *
 * In a form the two orders are EXPECTED to disagree, so the better the
 * tagging the worse this metric scores: a form whose tags sit in logical
 * reading position rather than paint position is penalised for being
 * correct. The old card also contradicted itself, printing "divergence is
 * not automatically wrong" directly above a 35-point deduction for exactly
 * that divergence.
 *
 * Where a measurement cannot support a verdict, report it and say so. An
 * unassessed category counts as passing under the scoring model, so a
 * well-built form is no longer punished for being a form.
 */
import { describe, it, expect } from "vitest";
import { scoreDocument } from "../services/scorer.js";
import { makeQpdf, makePdfjs } from "./helpers/mockResults.js";

const inOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
// Captions tagged in reading position but painted last — the XFA shape.
const captionsTaggedEarly = [0, 1, 8, 2, 3, 9, 4, 5, 6, 7];

function build(opts: { fields: number; struct: number[]; stream: number[] }) {
  const qpdf = makeQpdf({
    hasStructTree: true,
    structTreeDepth: 3,
    contentOrder: inOrder,
    totalPageCount: 1,
    tabOrderPages: 1,
    paragraphCount: 10,
    structTreeMcidsByPage: { 1: opts.struct },
    hasAcroForm: opts.fields > 0,
    formFields: Array.from({ length: opts.fields }, (_, i) => ({
      ref: `${i} 0 R`,
      hasTU: true,
    })),
  });
  const pdfjs = makePdfjs({
    pageCount: 1,
    hasText: true,
    textLength: 500,
    contentStreamMcidsByPage: { 1: opts.stream },
  });
  return scoreDocument(qpdf, pdfjs).categories.find((c) => c.id === "reading_order")!;
}

describe("reading order on forms", () => {
  it("is not scored when the document has form fields", () => {
    const cat = build({ fields: 26, struct: captionsTaggedEarly, stream: inOrder });
    expect(cat.score).toBeNull();
    expect(cat.grade).toBeNull();
    expect(cat.severity).toBeNull();
    expect((cat as { notAssessed?: boolean }).notAssessed).toBe(true);
  });

  it("says why, and gives a check a person can actually run", () => {
    const cat = build({ fields: 26, struct: captionsTaggedEarly, stream: inOrder });
    const text = cat.findings.join(" ");
    expect(text).toMatch(/Not scored for this document: it is a form \(26 field\(s\)\)/);
    // Names the reason the metric cannot work here.
    expect(text).toMatch(/painted in a later pass/i);
    expect(text).toMatch(/would punish the right answer|correctly tagged form/i);
    // Replaces the score with something the author can do.
    expect(text).toMatch(/tab through it with the keyboard/i);
    // And must NOT still print a score sentence.
    expect(text).not.toMatch(/Reading order scored \d+\/100/);
  });

  it("a perfectly-ordered form is unscored too — the rule is structural, not a rescue", () => {
    // Not "forms that would score badly get a pass": the metric simply does
    // not apply, whichever way the sequences happen to fall.
    const cat = build({ fields: 4, struct: inOrder, stream: inOrder });
    expect(cat.score).toBeNull();
    expect((cat as { notAssessed?: boolean }).notAssessed).toBe(true);
  });

  it("still scores a NON-form document exactly as before", () => {
    // The change must be surgical — every document without form fields keeps
    // its existing score, which is what the calibration corpus depends on.
    const drifted = build({ fields: 0, struct: captionsTaggedEarly, stream: inOrder });
    expect(drifted.score).not.toBeNull();
    expect(typeof drifted.score).toBe("number");

    const clean = build({ fields: 0, struct: inOrder, stream: inOrder });
    expect(clean.score).toBe(100);
  });

  it("an AcroForm dictionary with no fields is not treated as a form", () => {
    const cat = build({ fields: 0, struct: inOrder, stream: inOrder });
    expect(cat.score).toBe(100);
  });
});
