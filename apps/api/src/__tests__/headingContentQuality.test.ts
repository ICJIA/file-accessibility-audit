/**
 * Heading structure is scored on what the headings SAY, not only on their
 * levels.
 *
 * WHY (2026-08-28): a 246-page annual report scored 60/Moderate for "the
 * hierarchy has gaps" — a deduction earned by six level skips. Reading the
 * page content streams directly told a much worse story: of its 96 heading
 * tags, 19 carry no text at all, 14 are entire paragraphs tagged as headings,
 * and 29 are cut mid-word — "Population d", "property crime a", "la", "the
 * rate of formal p". Only 34 are headings in any useful sense. The outline the
 * report prints showed those fragments plainly, and nothing scored them, so an
 * author would have fixed six skips and left the outline unusable.
 *
 * The check is deliberately conservative, because any sub-100 category becomes
 * a severity and a severity caps the whole grade:
 *   - it needs a real outline to judge (few headings → no verdict),
 *   - it needs a real PROPORTION to be affected, not one odd entry,
 *   - and "fragment" excludes the ordinary English that looks like one
 *     ("What we do" ends in a two-letter word; "iPhone" starts lowercase).
 */
import { describe, it, expect } from "vitest";
import { scoreDocument } from "../services/scorer.js";
import { makeQpdf, makePdfjs } from "./helpers/mockResults.js";
import type { CategoryResult } from "../services/scorer.js";

function headingCategory(qpdfOverrides: object, pdfjsOverrides: object): CategoryResult {
  const result = scoreDocument(
    makeQpdf({ hasStructTree: true, paragraphCount: 40, totalPageCount: 20, ...qpdfOverrides }),
    makePdfjs({ pageCount: 20, hasText: true, textLength: 5000, ...pdfjsOverrides }),
  );
  return result.categories.find((c) => c.id === "heading_structure")!;
}

/** N heading tags at the given levels, as qpdf reports them. */
function levels(...ls: number[]) {
  return ls.map((l) => ({ level: `H${l}`, tag: `/H${l}` }));
}

/** A clean, ascending outline of `n` real headings. */
function goodOutline(n: number) {
  return Array.from({ length: n }, (_, i) => ({ level: "H2", text: `Section ${i + 1} overview` }));
}

describe("headings that are not really headings", () => {
  it("scores down an outline that is mostly empty, fragmentary, or whole paragraphs", () => {
    const outline = [
      ...goodOutline(5),
      { level: "H1", text: "Population d" },
      { level: "H3", text: "and over who have be" },
      { level: "H5", text: "property crime a" },
      { level: "H5", text: "la" },
      { level: "H4", text: "these juveniles unless a juvenile cou" },
      { level: "H2", text: "A".repeat(200) },
      { level: "H3", text: "B".repeat(180) },
    ];
    const cat = headingCategory(
      { headings: levels(2, 2, 2, 2, 2, 1, 3, 5, 5, 4, 2, 3, 1, 1, 1, 1, 1, 1) },
      { headingOutline: outline, headingsWithoutText: 6 },
    );

    // 6 empty + 5 fragments + 2 paragraphs = 13 of 18 tags.
    expect(cat.score).toBeLessThanOrEqual(40);
    expect(cat.findings.join("\n")).toMatch(/Population d/);
  });

  it("names how many are unusable, and why, so the author can check the claim", () => {
    const cat = headingCategory(
      { headings: levels(...Array(10).fill(2)) },
      {
        headingOutline: [
          ...goodOutline(3),
          { level: "H2", text: "the rate of formal p" },
          { level: "H2", text: "adult would. Mandato" },
        ],
        headingsWithoutText: 5,
      },
    );
    const text = cat.findings.join("\n");
    expect(text).toMatch(/carry no text at all/i);
    expect(text).toMatch(/cut off mid-word|fragment/i);
  });

  it("leaves a good outline with one odd entry alone — one bad heading is not a broken outline", () => {
    const cat = headingCategory(
      { headings: levels(...Array(20).fill(2)) },
      { headingOutline: [...goodOutline(19), { level: "H2", text: "trailing fragment p" }] },
    );
    expect(cat.score).toBe(100);
  });

  it("gives no verdict on a short outline, where one entry would swing the proportion", () => {
    const cat = headingCategory(
      { headings: levels(1, 2, 2) },
      { headingOutline: [{ level: "H1", text: "Report" }], headingsWithoutText: 2 },
    );
    expect(cat.score).toBe(100);
  });

  it("does not call ordinary English a fragment", () => {
    // Every one of these is a real heading that trips a naive rule: ends in a
    // short word, starts with a lowercase brand, or contains a capital
    // mid-word.
    const cat = headingCategory(
      { headings: levels(...Array(8).fill(2)) },
      {
        headingOutline: [
          { level: "H2", text: "What we do" },
          { level: "H2", text: "How to apply" },
          { level: "H2", text: "Who it is for" },
          { level: "H2", text: "iPhone adoption in Illinois" },
          { level: "H2", text: "eFiling rollout" },
          { level: "H2", text: "Cook County and McHenry County" },
          { level: "H2", text: "Where to go" },
          { level: "H2", text: "Notes on the data" },
        ],
      },
    );
    expect(cat.score).toBe(100);
  });

  it("stays silent when pdfjs could not resolve any heading text at all", () => {
    // No outline is "we could not look", not "the headings are bad".
    const cat = headingCategory({ headings: levels(1, 2, 2, 2, 3, 3) }, { headingOutline: [] });
    expect(cat.score).toBe(100);
  });

  it("takes the worse of a broken hierarchy and an unusable outline", () => {
    const cat = headingCategory(
      { headings: levels(1, 3, 1, 3, 1, 3, 1, 3, 1, 3) }, // H1 → H3 skips
      { headingOutline: goodOutline(2), headingsWithoutText: 8 },
    );
    expect(cat.score).toBeLessThan(60);
  });

  it("ignores headings from pages whose text could not be attributed", () => {
    // Marked textReliable:false by the extractor. Judging these would mean
    // calling a heading a fragment because WE could not read it.
    const cat = headingCategory(
      { headings: levels(...Array(12).fill(2)) },
      {
        headingOutline: [
          ...goodOutline(6),
          { level: "H2", text: "partial fragment p", textReliable: false },
          { level: "H2", text: "another cut off th", textReliable: false },
          { level: "H2", text: "and a third one wi", textReliable: false },
          { level: "H2", text: "a fourth cut short b", textReliable: false },
        ],
      },
    );
    expect(cat.score).toBe(100);
  });

  it("strips double quotes from quoted samples, so the finding's own quoting stays balanced", async () => {
    // The finding wraps each sample in double quotes; a fragment carrying its
    // own quote would nest them unbalanced, which is also what lets document
    // text bleed past the icon classifier's quoted-span stripping downstream.
    const { censusHeadingContent } = await import("@file-audit/analyzer/scoring/pdf");
    const census = censusHeadingContent(
      [
        { level: "H2", text: 'he said "advisory" and th' },
        { level: "H2", text: "plain fragment thi" },
        { level: "H2", text: "another cut off wo" },
      ],
      0,
    );
    expect(census).not.toBeNull();
    for (const sample of census!.samples) expect(sample).not.toContain('"');
    expect(census!.samples.join(" ")).toContain("advisory");
  });
});
