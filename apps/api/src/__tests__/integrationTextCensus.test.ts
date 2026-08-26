/**
 * v1.94.0 — full-pipeline integration for the two text censuses, over two
 * hand-authored synthetic fixtures (qpdf-normalized; provenance in each
 * test). These are the score-integrity checks the 2026-08-25 Matterhorn
 * audit ranked highest: a document can LOOK fine and score well while its
 * text extracts as unpronounceable symbols (checkpoint 10) or while a large
 * share of visible text sits outside the tag structure (checkpoint 01) —
 * both invisible to every unit test that mocks pdfjs, which is why these
 * run the real QPDF → pdf.js → scorer pipeline (qpdf required, as for
 * integration.test.ts).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { analyzePDF } from "../services/pdfAnalyzer.js";
import type { AnalysisResult } from "../services/pdfAnalyzer.js";

const fixturesDir = path.join(import.meta.dirname, "fixtures");

function loadFixture(filename: string): Buffer {
  return fs.readFileSync(path.join(fixturesDir, filename));
}

function textCategory(result: AnalysisResult) {
  const cat = result.categories.find((c) => c.id === "text_extractability");
  if (!cat) throw new Error("text_extractability missing");
  return cat;
}

// ---------------------------------------------------------------------------
// partial-tagging.pdf — one page, tagged Document→P holding ONE sentence via
// MCID 0, plus three visible sentences painted OUTSIDE any marked-content
// run (~81% of the page text). A screen reader following the tags gets one
// sentence and never learns the rest exists.
// ---------------------------------------------------------------------------
describe("integration: partially tagged PDF (Matterhorn 01)", () => {
  let result: AnalysisResult;

  it("analyzes without errors", async () => {
    result = await analyzePDF(loadFixture("partial-tagging.pdf"), "partial-tagging.pdf");
    expect(result.warnings).toHaveLength(0);
  }, 30_000);

  it("is tagged — the content-free-tree check must NOT fire (there IS tagged content)", () => {
    expect(
      result.conformance.failures.some(
        (f) => f.sc === "1.3.1" && /references no content/i.test(f.issue),
      ),
    ).toBe(false);
  });

  it("caps Text Extractability at 50 and names the untagged share and page", () => {
    const cat = textCategory(result);
    expect(cat.score).toBeLessThanOrEqual(50);
    const text = cat.findings.join("\n");
    expect(text).toContain("Content Outside the Tag Structure (Matterhorn 01)");
    expect(text).toMatch(/outside the tagged content \(page 1\)/);
  });

  it("the whole document cannot grade above C (the severity cap holds)", () => {
    expect(result.overallScore).toBeLessThanOrEqual(79);
  });
});

// ---------------------------------------------------------------------------
// unmapped-glyphs.pdf — one page, fully tagged, whose font's ToUnicode maps
// A–Z into the Private Use Area (U+E001…): the page renders ordinary capital
// letters while ~77% of the extracted text is unpronounceable symbols — the
// same reader experience as a font with no usable character map at all.
// ---------------------------------------------------------------------------
describe("integration: unmapped-glyph PDF (Matterhorn 10)", () => {
  let result: AnalysisResult;

  it("analyzes without errors", async () => {
    result = await analyzePDF(loadFixture("unmapped-glyphs.pdf"), "unmapped-glyphs.pdf");
    expect(result.warnings).toHaveLength(0);
  }, 30_000);

  it("caps Text Extractability at 50 with the character-mapping finding", () => {
    const cat = textCategory(result);
    expect(cat.score).toBeLessThanOrEqual(50);
    const text = cat.findings.join("\n");
    expect(text).toContain("Character Mapping (Matterhorn 10)");
    expect(text).toMatch(/cannot be mapped to readable text/);
  });

  it("does NOT fire the untagged-content census — everything is inside the tagged run", () => {
    const text = textCategory(result).findings.join("\n");
    expect(text).not.toContain("Content Outside the Tag Structure");
  });

  it("the whole document cannot grade above C", () => {
    expect(result.overallScore).toBeLessThanOrEqual(79);
  });
});
