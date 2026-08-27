import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { isTextLineLikeImage, countTextLineLikeImages } from "@file-audit/analyzer/qpdfService";

/**
 * "Text turned into pictures" detection (v1.105.0).
 *
 * The case that produced this: a real ICJIA board agenda whose letterhead
 * read "ILLINOIS / CRIMINAL JUSTICE / INFORMATION AUTHORITY". All three
 * lines were pixels — the string "ILLINOIS" appeared nowhere in the PDF's
 * text layer — so the agency's own name could not be read aloud by a screen
 * reader, searched for, or reflowed on zoom. The report said only "3 images
 * missing alt text", which sent the author to Acrobat to write descriptions
 * of their own letterhead. The right fix was in Word, and nothing in Word
 * could have shown them the problem: there, it is still text.
 *
 * The heuristic recognises the SHAPE of a rasterized line of type. It is
 * evidence, never proof, so the finding it drives asks the reader to confirm
 * and never asserts a WCAG failure or moves the score. Every threshold below
 * is pinned to a real file that would otherwise be misread — this is a
 * measured heuristic, not a guessed one, and loosening a bound re-admits the
 * false positive named beside it.
 */

describe("isTextLineLikeImage — the shape of a rasterized line of type", () => {
  it("accepts the three letterhead lines that motivated the check", () => {
    // Measured from the agenda: one image per line, widths ragged because
    // lines of writing differ in length.
    expect(isTextLineLikeImage(189, 35)).toBe(true);
    expect(isTextLineLikeImage(404, 35)).toBe(true);
    expect(isTextLineLikeImage(562, 35)).toBe(true);
  });

  it("accepts a title stored as a picture at another export resolution", () => {
    // ARIFactSheet control: "ADULT REDEPLOY ILLINOIS" (661×51) and the ICJIA
    // wordmark banner (1145×117) are both genuinely text-as-image.
    expect(isTextLineLikeImage(661, 51)).toBe(true);
    expect(isTextLineLikeImage(1145, 117)).toBe(true);
  });

  it("rejects logos, seals and photographs — they sit near square", () => {
    expect(isTextLineLikeImage(192, 192)).toBe(false); // the Illinois seal
    expect(isTextLineLikeImage(208, 209)).toBe(false); // DJJ report logo
    expect(isTextLineLikeImage(1811, 1195)).toBe(false); // cover photograph
    expect(isTextLineLikeImage(625, 945)).toBe(false); // portrait image
  });

  it("rejects hairline rules, borders and underlines", () => {
    // A rule is decorative and wants an Artifact, not this finding. Without
    // the lower height bound these would dominate the count.
    expect(isTextLineLikeImage(562, 2)).toBe(false);
    expect(isTextLineLikeImage(1000, 4)).toBe(false);
    expect(isTextLineLikeImage(400, 7)).toBe(false);
  });

  it("rejects wide decorative colour bands", () => {
    // Control file "FINAL REPORT PDF FOR POSTING": solid bars with flat,
    // uniform alpha. These passed under the original 200px ceiling and are
    // why it is 120 — a line of type is never ~190px tall.
    expect(isTextLineLikeImage(1274, 194)).toBe(false);
    expect(isTextLineLikeImage(1296, 179)).toBe(false);
    expect(isTextLineLikeImage(2390, 199)).toBe(false);
  });

  it("rejects single glyphs, bullets and spacer tiles", () => {
    // The same agenda painted 10×35 and 9×31 spacer slivers between the
    // rasterized words; they are noise, not lines.
    expect(isTextLineLikeImage(10, 35)).toBe(false);
    expect(isTextLineLikeImage(9, 31)).toBe(false);
  });

  it("holds the aspect boundary at 4:1", () => {
    expect(isTextLineLikeImage(160, 40)).toBe(true); // exactly 4:1
    expect(isTextLineLikeImage(159, 40)).toBe(false); // just under
  });

  it("survives junk dimensions rather than throwing", () => {
    expect(isTextLineLikeImage(Number.NaN, 35)).toBe(false);
    expect(isTextLineLikeImage(400, Number.NaN)).toBe(false);
    expect(isTextLineLikeImage(Number.POSITIVE_INFINITY, 35)).toBe(false);
    expect(isTextLineLikeImage(0, 0)).toBe(false);
  });
});

describe("countTextLineLikeImages — dropping pictures sliced into bands", () => {
  it("counts ragged widths — lines of writing differ in length", () => {
    expect(countTextLineLikeImages([189, 404, 562])).toBe(3);
  });

  it("drops a picture cut into identical horizontal bands", () => {
    // The DJJ recidivism report's state seal was flattened into six bands,
    // every one of them 392px wide. All six matched the shape test; none of
    // them is text. Without this rule the file reported 7 instead of 1.
    expect(countTextLineLikeImages([392, 392, 392, 392, 392, 392])).toBe(0);
  });

  it("keeps genuine lines that happen to sit beside a sliced picture", () => {
    // Same file: one unrelated 358px candidate survives the seal's bands.
    expect(countTextLineLikeImages([392, 392, 392, 392, 392, 392, 358])).toBe(1);
  });

  it("keeps two equal widths — a coincidence, not a grid", () => {
    // Three is the threshold on purpose: two lines of text can legitimately
    // come out the same width, three identical widths is a sliced graphic.
    expect(countTextLineLikeImages([300, 300])).toBe(2);
    expect(countTextLineLikeImages([300, 300, 300])).toBe(0);
  });

  it("counts nothing when there are no candidates", () => {
    expect(countTextLineLikeImages([])).toBe(0);
  });
});

describe("the finding softens when every image is already described", () => {
  // The DoIT XFA example alt-texted its "Office Supply" banner — the right
  // thing to do — and still got a five-paragraph correction under a category
  // scoring 100/A. The wording is still worth having (a description does not
  // make words searchable or resizable) but not aimed at someone who got it
  // wrong. Asserted against the analyzer source, since building a full
  // qpdf+pdfjs fixture here would test the mock rather than the copy.
  const src = readFileSync(
    resolve(__dirname, "../../../../packages/analyzer/src/scoring/pdf.ts"),
    "utf8",
  );

  it("has a described-images branch keyed on full alt-text coverage", () => {
    expect(src).toContain("const everyImageDescribed =");
    expect(src).toContain("figures.length > 0 && figuresWithAlt === figures.length");
    expect(src).toContain("textLineLikeImages > 0 && everyImageDescribed");
  });

  it("credits the author instead of correcting them, and marks itself advisory", () => {
    const block = src.slice(
      src.indexOf("everyImageDescribed) {"),
      src.indexOf("} else if (textLineLikeImages"),
    );
    expect(block).toMatch(/which is the right thing to do/i);
    expect(block).toMatch(/note rather than a problem/i);
    expect(block).toMatch(/does not affect the score/i);
    // It must NOT scold: the "do not simply add a description" correction
    // belongs only to the branch where nothing was described.
    expect(block).not.toMatch(/do not simply add a description/i);
  });
});
