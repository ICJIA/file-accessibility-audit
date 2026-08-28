/**
 * A tag whose name differs from a standard one ONLY in capitalization.
 *
 * WHY (2026-08-28): a 246-page annual report was told "13 list(s) have items
 * missing <LBody> elements" and advised to "ensure each <LI> contains an
 * <LBody>". Nothing was missing. The document contains 43 list bodies — spelled
 * `/Lbody`, with a lowercase b, and with no RoleMap entry to say what they are.
 * Reading the file settles it: zero standard `/LBody` elements, 43 `/Lbody`.
 *
 * Both halves were technically true and separately reported: the list finding
 * said the bodies were missing, and an advisory note far below said one custom
 * tag carried no mapping. Nothing connected them, so the author was sent to
 * look for content that was already there, when the real repair is one line in
 * the RoleMap.
 *
 * A near-miss like this is worth naming wherever it appears, not only for
 * lists — a tag one capital away from a standard type is a typo with a
 * one-line fix, and assistive technology treats it as an anonymous box.
 */
import { describe, it, expect } from "vitest";
import { scoreDocument } from "../services/scorer.js";
import { makeQpdf, makePdfjs } from "./helpers/mockResults.js";

function findings(qpdfOverrides: object): string {
  const result = scoreDocument(
    makeQpdf({
      hasStructTree: true,
      paragraphCount: 40,
      totalPageCount: 20,
      hasRoleMap: true,
      ...qpdfOverrides,
    }),
    makePdfjs({ pageCount: 20, hasText: true, textLength: 5000 }),
  );
  return result.categories.flatMap((c) => c.findings).join("\n");
}

const MALFORMED_LISTS = [
  { itemCount: 6, hasLabels: true, hasBodies: false, isWellFormed: false, nestingDepth: 0 },
  { itemCount: 3, hasLabels: true, hasBodies: false, isWellFormed: false, nestingDepth: 0 },
];

describe("a tag one capital letter away from a standard type", () => {
  it("says the list bodies are misspelled, not missing", () => {
    const text = findings({ lists: MALFORMED_LISTS, roleMapUnmappedTags: ["Lbody"] });

    expect(text).toMatch(/Lbody/);
    expect(text).toMatch(/capitalization|capital letter|spelled/i);
    // And it must not send the author hunting for content that is already there.
    expect(text).toMatch(/RoleMap/);
  });

  it("keeps the plain missing-body advice when nothing explains it away", () => {
    const text = findings({ lists: MALFORMED_LISTS, roleMapUnmappedTags: [] });

    expect(text).toMatch(/missing <LBody>/);
    expect(text).not.toMatch(/capitalization/i);
  });

  it("names a near-miss tag even when it has nothing to do with lists", () => {
    // Same defect class, different tag: assistive technology sees an
    // anonymous container either way.
    const text = findings({ roleMapUnmappedTags: ["Tbody", "Figure "] });

    expect(text).toMatch(/Tbody/);
    expect(text).toMatch(/capitalization|capital letter|spelled/i);
  });

  it("does not accuse a genuinely custom tag name of being a typo", () => {
    const text = findings({ roleMapUnmappedTags: ["CoverPanel"] });

    expect(text).toMatch(/CoverPanel/);
    expect(text).not.toMatch(/capitalization/i);
  });
});
