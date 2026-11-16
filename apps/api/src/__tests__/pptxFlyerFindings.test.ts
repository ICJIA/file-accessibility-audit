/**
 * Three things a one-page recruitment flyer showed on 2026-11-16, checked by
 * hand against its slide XML and a render:
 *
 *   1. CONTRAST READ AS A CLEAN PASS WHEN PART OF THE SLIDE WAS NEVER CHECKED.
 *      13 runs were checked and passed; 9 more sat on a see-through panel and
 *      were skipped by design. The finding said "all meet the minimum" at 100
 *      and never mentioned the nine — one of which is a 3.8:1 link. Word has
 *      always disclosed its unresolved runs; PowerPoint and Excel did not.
 *
 *   2. THE WRONG TEXT WAS NAMED AS THE SLIDE'S HEADING. The picker took the
 *      FIRST floating text box with any bold run of 14 pt or more — a bullet
 *      whose first few words are bold — and never reached the 28 pt heading
 *      stacked later. A bold lead-in is emphasis, not a heading; and where
 *      several boxes qualify, the largest is the heading.
 *
 *   3. TWO DIFFERENT "TITLES" READ AS ONE. The scored finding is the FILE's
 *      Title property (WCAG 2.4.2); the unscored advisory is the SLIDE's title
 *      placeholder. Both said only "title".
 */
import { describe, it, expect } from "vitest";
import { buildPptx } from "./helpers/minimalPptx.js";
import { analyzePptx } from "../services/pptxService.js";
import { scorePptx, scoreXlsx } from "../services/scorer.js";
import type { PptxAnalysis } from "../services/pptxService.js";
import type { XlsxAnalysis } from "../services/xlsxService.js";

const run = (text: string, sz?: number, bold = false) =>
  `<a:r><a:rPr lang="en-US"${sz === undefined ? "" : ` sz="${sz}"`}${bold ? ' b="1"' : ""}/><a:t>${text}</a:t></a:r>`;
let nextId = 100;
/** A floating text box: no <p:ph>, so it has no placeholder role at all. */
const textBox = (...runs: string[]) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${nextId++}" name="TextBox"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p>${runs.join("")}</a:p></p:txBody></p:sp>`;

const LEAD_IN = textBox(
  run("Understand what data you need ", 1600, true),
  run("to most effectively use the law", 1600),
);
const HEADING = textBox(
  run("Help Improve ", 2800, true),
  run("Data Systems in Illinois", 2800, true),
);
const FOOTER = textBox(run("Data Infrastructure Project", 1500, true));

const headingsOf = async (body: string) =>
  (await analyzePptx(await buildPptx({ slides: [{ title: null, body }] }))).fakeHeadings;

describe("pptx typed heading: a bold lead-in is emphasis, and the largest box is the heading", () => {
  it("a text box whose first words alone are bold is not a typed heading", async () => {
    expect(await headingsOf(LEAD_IN)).toEqual([]);
  });

  it("names the 28 pt heading, not the bold lead-in stacked before it", async () => {
    expect(await headingsOf(LEAD_IN + HEADING)).toEqual([
      { slide: 1, text: "Help Improve Data Systems in Illinois" },
    ]);
  });

  it("of two boxes that qualify, the larger is the heading even when it comes later", async () => {
    expect(await headingsOf(FOOTER + HEADING)).toEqual([
      { slide: 1, text: "Help Improve Data Systems in Illinois" },
    ]);
  });

  it("at the same size the first in reading order is kept", async () => {
    const a = textBox(run("First Heading", 2800, true));
    const b = textBox(run("Second Heading", 2800, true));
    expect(await headingsOf(a + b)).toEqual([{ slide: 1, text: "First Heading" }]);
  });

  it("a space-only run between two bold runs does not make the heading a lead-in", async () => {
    const spaced = textBox(run("Quarterly", 2000, true), run(" "), run("Results", 2000, true));
    expect(await headingsOf(spaced)).toEqual([{ slide: 1, text: "Quarterly Results" }]);
  });

  it("one large word inside a body-size sentence is emphasis, not a heading", async () => {
    const shout = textBox(
      run("Enrollment rose ", 1200),
      run("12 percent", 2400),
      run(" this year", 1200),
    );
    expect(await headingsOf(shout)).toEqual([]);
  });

  it("a whole line of 16 pt bold is still a typed heading", async () => {
    expect(await headingsOf(textBox(run("Next Steps", 1600, true)))).toEqual([
      { slide: 1, text: "Next Steps" },
    ]);
  });
});

function pptxAnalysis(over: Partial<PptxAnalysis> = {}): PptxAnalysis {
  return {
    metadata: { title: "Deck", creator: "x", language: "en-US", slideCount: 1 },
    slides: [{ index: 1, title: "Welcome", titleIsFirstShape: true, shapeCount: 2 }],
    fakeHeadings: [],
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 13, unresolvedRuns: 0, failing: [] },
    hasMedia: false,
    shapeCount: 2,
    ...over,
  };
}
const pptxCat = (a: PptxAnalysis, id: string) => scorePptx(a).categories.find((c) => c.id === id)!;

describe("pptx contrast: runs that could not be checked are disclosed", () => {
  it("a pass with unchecked runs says how many, and does not read 'No issues found'", () => {
    const c = pptxCat(
      pptxAnalysis({ contrast: { checkedRuns: 13, unresolvedRuns: 9, failing: [] } }),
      "color_contrast",
    );
    expect(c.score).toBe(100);
    expect(c.findings.join(" ")).toMatch(/13 colored text run\(s\) checked; all meet/);
    expect(c.findings.join(" ")).toMatch(
      /Advisory — not scored: 9 more text run\(s\) could not be checked/,
    );
    expect(c.severity).toBe("No scored issues");
  });

  it("a failing result discloses them too", () => {
    const c = pptxCat(
      pptxAnalysis({
        contrast: {
          checkedRuns: 4,
          unresolvedRuns: 2,
          failing: [{ ratio: 2.1, foreground: "#AAAAAA", background: "#FFFFFF" }],
        } as PptxAnalysis["contrast"],
      }),
      "color_contrast",
    );
    expect(c.findings.join(" ")).toMatch(/1 below the WCAG minimum/);
    expect(c.findings.join(" ")).toMatch(/2 more text run\(s\) could not be checked/);
  });

  it("says nothing extra when every run was checked", () => {
    const c = pptxCat(pptxAnalysis(), "color_contrast");
    expect(c.findings.join(" ")).not.toMatch(/could not be checked/);
    expect(c.severity).toBe("No issues found");
  });
});

describe("xlsx contrast: cell styles that could not be checked are disclosed", () => {
  const xlsxAnalysis = (contrast: XlsxAnalysis["contrast"]): XlsxAnalysis => ({
    metadata: { title: "Ledger", creator: "x", sheetCount: 1 },
    sheets: [
      {
        name: "FY26 Grants",
        hidden: false,
        defaultNamed: false,
        mergedRangeCount: 0,
        usedRangeCellCount: 80,
        hasDefinedTable: true,
      },
    ],
    tables: [{ sheetName: "FY26 Grants", name: "Grants", hasHeaderRow: true }],
    images: [],
    links: [],
    contrast,
    totalCellsWithValue: 40,
    textBoxCount: 0,
  });
  const contrastOf = (c: XlsxAnalysis["contrast"]) =>
    scoreXlsx(xlsxAnalysis(c)).categories.find((x) => x.id === "color_contrast")!;

  it("a pass with unchecked styles says how many, and does not read 'No issues found'", () => {
    const c = contrastOf({ checkedRuns: 5, unresolvedRuns: 3, failing: [] });
    expect(c.score).toBe(100);
    expect(c.findings.join(" ")).toMatch(
      /Advisory — not scored: 3 more cell style\(s\) could not be checked/,
    );
    expect(c.severity).toBe("No scored issues");
  });

  it("says nothing extra when every style was checked", () => {
    const c = contrastOf({ checkedRuns: 5, unresolvedRuns: 0, failing: [] });
    expect(c.findings.join(" ")).not.toMatch(/could not be checked/);
    expect(c.severity).toBe("No issues found");
  });
});

describe("pptx: the file's title and a slide's title are told apart", () => {
  it("the scored finding says it is the file's title, not a slide's", () => {
    const c = pptxCat(
      pptxAnalysis({ metadata: { title: null, creator: "x", language: "en-US", slideCount: 1 } }),
      "title_language",
    );
    const f = c.findings.join(" ");
    // The action plan and the fix-time chip both key on this opening.
    expect(f).toMatch(/No presentation title is set/);
    expect(f).toMatch(/not a slide's title/);
    expect(f).toMatch(/Slide Titles/);
  });

  it("the unscored advisory says it is the slide's title, not the file's", () => {
    const c = pptxCat(
      pptxAnalysis({
        slides: [{ index: 1, title: null, titleIsFirstShape: false, shapeCount: 2 }],
      }),
      "slide_titles",
    );
    const f = c.findings.join(" ");
    expect(f).toMatch(/slide 1 has no slide title/);
    expect(f).toMatch(/not the presentation's title/);
    expect(f).toMatch(/Title & Language/);
    expect(c.score).toBe(100);
  });
});
