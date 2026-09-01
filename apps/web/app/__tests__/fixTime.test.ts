import { describe, it, expect } from "vitest";
import { estimateFixTime, planTimeTotal } from "../utils/fixTime";

/** Finding strings below are VERBATIM analyzer output (packages/analyzer/src/
 *  scoring/{docx,pptx,xlsx,pdf}.ts) — an estimate that parses a phrasing the
 *  analyzer never emits proves nothing (test-validity audit 2026-08-31). */

describe("estimateFixTime — count-driven categories", () => {
  it("prices heading fixes at ~30s each, summing fake and blank headings", () => {
    const e = estimateFixTime(
      "heading_structure",
      [
        "9 paragraph(s) are formatted to look like headings (bold/large text) but are not real Heading styles. Apply Heading 1–6 so assistive technology can navigate them.",
        "3 Heading-styled paragraph(s) contain no text — a heading style applied to a blank line, usually to make space. Someone navigating by heading lands on silence, and the outline shows a section that is not there. In Word: delete the blank line, or set it to Normal style and use paragraph spacing instead.",
      ],
      "docx",
    );
    expect(e).toEqual({ label: "~6 min", maxMinutes: 6 });
  });

  it("applies the 2-minute floor to a single fake heading", () => {
    const e = estimateFixTime(
      "heading_structure",
      [
        "1 paragraph(s) are formatted to look like headings (bold/large text) but are not real Heading styles. Apply Heading 1–6 so assistive technology can navigate them.",
      ],
      "docx",
    );
    expect(e).toEqual({ label: "~2 min", maxMinutes: 2 });
  });

  it("prices typed-bullet conversion at ~20s per paragraph", () => {
    const e = estimateFixTime(
      "list_structure",
      [
        "0 real list item(s); 9 manually-typed bullet/number paragraph(s).",
        "9 paragraph(s) use typed bullets or numbers instead of Word's list formatting, so they are not announced as a list. Use the Bullets/Numbering buttons.",
      ],
      "docx",
    );
    expect(e).toEqual({ label: "~3 min", maxMinutes: 3 });
  });

  it("counts only the FAILING contrast runs, never the census total", () => {
    const e = estimateFixTime(
      "color_contrast",
      [
        "39 colored text run(s) checked; 4 below the WCAG minimum.",
        "Lowest contrast 2.52:1 (#D99618 on #FFFFFF). Needs ≥4.5:1 (≥3:1 for large text).",
      ],
      "docx",
    );
    expect(e).toEqual({ label: "~4 min", maxMinutes: 4 });
  });

  it("parses the xlsx contrast phrasing (cell styles, 'WCAG contrast minimum')", () => {
    const e = estimateFixTime(
      "color_contrast",
      ["12 cell style(s) checked; 3 below the WCAG contrast minimum."],
      "xlsx",
    );
    expect(e).toEqual({ label: "~3 min", maxMinutes: 3 });
  });

  it("prices headerless tables at ~1 min each across docx/pptx/xlsx phrasings", () => {
    const docx = estimateFixTime(
      "table_markup",
      [
        "4 table(s) found.",
        "2 data table(s) have no header row. In Word: select the top row → Table Layout → Repeat Header Rows.",
      ],
      "docx",
    );
    expect(docx).toEqual({ label: "~2 min", maxMinutes: 2 });
    const xlsx = estimateFixTime(
      "table_markup",
      ['3 table(s) have no header row: "Table1" (Sheet1), "Table2" (Sheet2), "Table3" (Data).'],
      "xlsx",
    );
    expect(xlsx).toEqual({ label: "~3 min", maxMinutes: 3 });
  });

  it("prices bare links at ~30s each", () => {
    const e = estimateFixTime(
      "link_quality",
      [
        "5 link(s) found; 3 with no link text at all.",
        '3 link(s) have no link text, so a screen reader announces the link with nothing to identify it. In Word: select the link → Insert → Link, and type a descriptive phrase in "Text to display".',
      ],
      "docx",
    );
    expect(e).toEqual({ label: "~2 min", maxMinutes: 2 });
  });

  it("gives alt text an apply-only estimate that cannot enter a total", () => {
    const e = estimateFixTime(
      "alt_text",
      [
        "2 of 7 meaningful image(s) have alt text.",
        "5 image(s) are missing alt text. In Word, right-click each image → View Alt Text (some Word versions call it Edit Alt Text) and add a description.",
      ],
      "docx",
    );
    expect(e).toEqual({
      label: "~5 min",
      maxMinutes: null,
      note: "to apply the text — writing good alt text is the real work",
    });
  });

  it("derives the PDF alt-text count from the 'X of Y' coverage line", () => {
    const e = estimateFixTime("alt_text", ["3 of 8 image(s) have alternative text"], "pdf");
    expect(e).toEqual({
      label: "~5 min",
      maxMinutes: null,
      note: "to apply the text — writing good alt text is the real work",
    });
  });
});

describe("estimateFixTime — flat and null categories", () => {
  it("prices title & language at a flat ~2 min for every file type", () => {
    for (const ft of ["docx", "pptx", "xlsx", "pdf"] as const) {
      expect(estimateFixTime("title_language", ["No document title is set."], ft)).toEqual({
        label: "~2 min",
        maxMinutes: 2,
      });
    }
  });

  it("prices PDF bookmarks at a flat ~5 min", () => {
    expect(estimateFixTime("bookmarks", ["0 bookmark(s) found"], "pdf")).toEqual({
      label: "~5 min",
      maxMinutes: 5,
    });
  });

  it("never estimates unbounded or judgment-only categories", () => {
    expect(
      estimateFixTime("text_extractability", ["Scanned document detected."], "pdf"),
    ).toBeNull();
    expect(estimateFixTime("form_accessibility", ["2 form field(s) found."], "pdf")).toBeNull();
    expect(estimateFixTime("reading_order", ["2 floating object(s) found."], "docx")).toBeNull();
  });

  it("returns null when a counted category's findings carry no parseable count", () => {
    expect(estimateFixTime("heading_structure", ["No headings were found."], "pdf")).toBeNull();
    expect(estimateFixTime("color_contrast", [], "docx")).toBeNull();
    expect(estimateFixTime("not_a_category", ["7 thing(s) wrong."], "docx")).toBeNull();
  });

  it("restricts PDF estimates to mechanical Acrobat fixes (no structural tag surgery)", () => {
    expect(
      estimateFixTime(
        "table_markup",
        ["2 data table(s) have no header row in the tag tree."],
        "pdf",
      ),
    ).toBeNull();
    expect(
      estimateFixTime("link_quality", ["3 link(s) have no link text at all."], "pdf"),
    ).toBeNull();
  });

  it("ignores advisory, note, and indented signal lines when counting", () => {
    expect(
      estimateFixTime(
        "table_markup",
        [
          "3 defined table(s) found.",
          'Advisory — not scored: 2 single-column table(s) have the header row off ("List1" (Sheet1), "List2" (Sheet2)). A one-column list carries no data-cell/header association to break, so your grade is not affected — but marking the header row still helps screen readers announce what the list holds.',
          "  2 table(s) have no header row: decorative spacing rows",
        ],
        "xlsx",
      ),
    ).toBeNull();
  });
});

describe("planTimeTotal", () => {
  const step = (
    estimate: { label: string; maxMinutes: number | null; note?: string } | undefined,
  ) => ({ estimate }) as { estimate?: { label: string; maxMinutes: number | null; note?: string } };

  it("sums estimated maxima and rounds up to the next 5 minutes", () => {
    const t = planTimeTotal([
      step({ label: "~2 min", maxMinutes: 2 }),
      step({ label: "~3 min", maxMinutes: 3 }),
      step({ label: "~4 min", maxMinutes: 4 }),
    ]);
    expect(t).toEqual({ label: "typically under 10 minutes" });
  });

  it("rounds a small plan up to 5 minutes, never to zero", () => {
    expect(planTimeTotal([step({ label: "~2 min", maxMinutes: 2 })])).toEqual({
      label: "typically under 5 minutes",
    });
  });

  it("keeps an exact multiple of 5 honest by rounding UP, not to itself", () => {
    // 5 → "under 10": the sum is an upper bound already met, and "under 5"
    // beside a 5-minute sum would be the one direction estimates must not err.
    expect(planTimeTotal([step({ label: "~5 min", maxMinutes: 5 })])).toEqual({
      label: "typically under 10 minutes",
    });
  });

  it("declines a total when any step is unestimated or apply-only", () => {
    expect(planTimeTotal([step({ label: "~2 min", maxMinutes: 2 }), step(undefined)])).toBeNull();
    expect(
      planTimeTotal([
        step({ label: "~2 min", maxMinutes: 2 }),
        step({ label: "~5 min", maxMinutes: null, note: "to apply the text" }),
      ]),
    ).toBeNull();
    expect(planTimeTotal([])).toBeNull();
  });
});
