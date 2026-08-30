/**
 * The Word/PowerPoint/Excel catalog, one describe per practice.
 *
 * Every fixture string below is copied VERBATIM from packages/analyzer
 * (docx.ts / pptx.ts / xlsx.ts) via
 *   grep -n "not scored" packages/analyzer/src/scoring/{docx,pptx,xlsx}.ts
 * If a test here fails after an analyzer change, the catalog's matcher is
 * stale — fix the matcher, do not loosen the test.
 *
 * UNLIKE bestPracticesPdf.test.ts, no fixture here needs to carry a
 * "positive" line alongside its advisory: re-verified against source on
 * 2026-08-30, no Office scorer pushes a positive line unconditionally
 * alongside an advisory the way several PDF lines do. Every advisory here
 * is gated behind its own independent count check.
 *
 * MOST PRACTICES IN THIS FILE HAVE NO MET BRANCH — see office.ts's header
 * comment. Only xlsx-sheet-names, pptx-slide-titles, and
 * pptx-distinct-slide-titles have one to test.
 */
import { describe, it, expect } from "vitest";
import { OFFICE_PRACTICES } from "../utils/bestPractices/office";
import { buildContext } from "../utils/bestPractices/types";
import type { FileType } from "@file-audit/shared";

const practice = (id: string) => {
  const p = OFFICE_PRACTICES.find((x) => x.id === id);
  if (!p) throw new Error(`no practice with id "${id}"`);
  return p;
};

function formatOf(id: string): FileType {
  if (id.startsWith("docx-")) return "docx";
  if (id.startsWith("pptx-")) return "pptx";
  if (id.startsWith("xlsx-")) return "xlsx";
  throw new Error(`cannot infer a format from id "${id}"`);
}

const run = (id: string, findings: string[]) =>
  practice(id).detect(buildContext({ findings }, formatOf(id), 0));

// ---- verbatim analyzer output, packages/analyzer/src/scoring/docx.ts ------

const DOCX_NO_HEADINGS =
  "No headings were found. Short documents may not need them; longer documents should use Heading styles so readers can navigate.";
const DOCX_NO_TABLES = "No tables were found.";
const DOCX_NO_LINKS = "No hyperlinks were found.";

const DOCX_FIRST_HEADING_NOT_H1 =
  "Advisory — not scored: the first heading is Heading 3, not Heading 1 — your grade is not affected, but starting the outline at Heading 1 gives it a single root.";
const DOCX_HEADING_SKIPS =
  "Advisory — not scored: 2 place(s) skip a heading level (e.g. Heading 1 → Heading 3) — not a WCAG 2.1 failure, so your grade is not affected, but screen-reader users may wonder what they missed at the skipped level.";
const DOCX_HEADING_SKIPS_ONE =
  "Advisory — not scored: 1 place(s) skip a heading level (e.g. Heading 1 → Heading 3) — not a WCAG 2.1 failure, so your grade is not affected, but screen-reader users may wonder what they missed at the skipped level.";
const DOCX_EMPTY_HEADINGS =
  "Advisory — not scored: 2 empty Heading-styled paragraph(s) (no text — often a spacing habit). They clutter the navigable outline; use paragraph spacing instead.";
const DOCX_EMPTY_PARAGRAPH_RUNS =
  "Advisory — not scored: 3 run(s) of three or more consecutive empty paragraphs — blank lines used for spacing, each announced by a screen reader. Use paragraph spacing (Layout → Spacing) instead.";
const DOCX_LAYOUT_GRIDS =
  "Advisory — not scored: 2 bare grid(s) with no table style, borders, shading, or header marks anywhere — overwhelmingly a layout construct, so no header row is demanded and your grade is not affected. If it IS a data table, mark its header row (Table Layout → Repeat Header Rows) and give it a table style.";
const DOCX_NESTED_TABLES =
  "Advisory — not scored: nested tables were found — your grade is not affected, but they are hard for screen readers to navigate. Flatten them where possible.";
const DOCX_MERGED_CELLS =
  "Note — not scored: 12 merged cell(s) across the table(s). Merged and split cells can confuse screen-reader navigation (Microsoft's own checker flags them); whether they harm depends on placement — review manually.";
const DOCX_EMPTY_TABLE_ROWS =
  "Note — not scored: 4 entirely empty table row(s) — blank rows used for spacing are announced as empty rows a screen reader has to sit through. Use cell padding or table spacing instead.";
const DOCX_RAW_URL =
  "Advisory — not scored against you: 2 link(s) show the raw URL as their visible text. This satisfies WCAG 2.4.4 (the destination is determinable), but a descriptive label reads better in a screen reader's list of links.";

// ---- verbatim analyzer output, packages/analyzer/src/scoring/pptx.ts ------

const PPTX_NO_SLIDES = "No slides were found.";
const PPTX_NO_LINKS = "No hyperlinks were found.";
const PPTX_DISTINCT_MET = "All 8 visible slide(s) have a distinct title.";

// pptx.ts:154's template, rendered for one untitled slide (index 5) and for
// three (indices 3, 7, 12) — the source builds this from a multi-line
// template expression, not a single string literal, so there is no one
// "verbatim line" to grep; this is the assembled output for each shape.
const PPTX_UNTITLED_ONE =
  "Advisory — not scored: slide 5 has no title placeholder — your grade is not affected (a slide can carry its heading in a body placeholder), but titled slides give screen-reader users a navigable outline. In PowerPoint: use the Outline view (View → Outline) or a layout with a title placeholder.";
const PPTX_UNTITLED_MANY =
  "Advisory — not scored: slides 3, 7, 12 have no title placeholder — your grade is not affected (a slide can carry its heading in a body placeholder), but titled slides give screen-reader users a navigable outline. In PowerPoint: use the Outline view (View → Outline) or a layout with a title placeholder.";

const PPTX_DUP_ONE =
  'Advisory — not scored: 2 slides share the title "Q3 Results" — your grade is not affected, but a distinct, descriptive title on each slide lets screen-reader users tell them apart in the outline.';
const PPTX_DUP_TWO =
  'Advisory — not scored: 3 slides share the title "Overview" — your grade is not affected, but a distinct, descriptive title on each slide lets screen-reader users tell them apart in the outline.';

const PPTX_RAW_URL =
  "Advisory — not scored against you: 3 link(s) show the raw URL as their visible text. This satisfies WCAG 2.4.4, but a descriptive label reads better in a screen reader's list of links.";

// ---- verbatim analyzer output, packages/analyzer/src/scoring/xlsx.ts ------

const XLSX_NO_SHEETS = "No visible sheets were found.";
const XLSX_NO_DATA = "No tables or sizable data ranges were found.";
const XLSX_NO_LINKS = "No hyperlinks were found.";
const XLSX_SHEET_NAMES_MET = "All 4 visible sheet(s) have descriptive names.";

const XLSX_RENAME_ONE =
  'Advisory — not scored: rename "Sheet1" to describe its contents — your grade is not affected, but sheet names are the workbook\'s navigation and screen-reader users hear them when switching sheets.';
const XLSX_RENAME_TWO =
  'Advisory — not scored: rename "Sheet3" to describe its contents — your grade is not affected, but sheet names are the workbook\'s navigation and screen-reader users hear them when switching sheets.';

const XLSX_NO_DEFINED_TABLE =
  "Advisory — not scored: worksheet data is laid out as plain cell ranges with no defined Excel Table anywhere — your grade is not affected (whether a range is a data table is a judgment a person has to make), but a defined Table lets screen readers announce column headers while navigating. In Excel: select each data range → Insert → Table.";
const XLSX_DATA_OUTSIDE_TABLE =
  "Note — not scored: some worksheet data sits outside the defined table(s) as plain ranges. Consider Insert → Table for those ranges too.";

// xlsx.ts:243's template, rendered for one pivot sheet named "Summary".
const XLSX_PIVOT_ONE =
  'Note — not scored: 1 sheet(s) contain pivot tables ("Summary"). Pivots cannot become Excel Tables; verify their readability manually.';

// xlsx.ts:259's template, rendered for one sheet and for two.
const XLSX_DATA_START_ONE =
  'Note — not scored: on "Sheet1" data begins at row 5, column 3 — screen readers land at A1, so leading blank rows/columns are dead space to navigate. Start data at or near A1.';
const XLSX_DATA_START_TWO =
  'Note — not scored: on "Sheet1" data begins at row 5, column 3; "Data" data begins at row 8, column 1 — screen readers land at A1, so leading blank rows/columns are dead space to navigate. Start data at or near A1.';

// xlsx.ts:273's template, rendered for one sheet with 3 merged ranges.
const XLSX_MERGED_ONE =
  'Note — not scored: 1 sheet(s) contain merged cells ("Sheet1": 3), which can confuse screen-reader navigation. Whether they harm depends on placement — review manually.';

const XLSX_RAW_URL =
  "Advisory — not scored against you: 5 link(s) show the raw URL as their visible text. This satisfies WCAG 2.4.4, but a descriptive label reads better in a screen reader's list of links.";

// A minimal NOT-MET-triggering fixture per practice, used only by the
// forbidden-phrasing sweep below. Every line here is copied from the
// fixtures used in that practice's own describe block above.
const NOT_MET_TRIGGERS: Record<string, string[]> = {
  "docx-first-heading-is-h1": [DOCX_FIRST_HEADING_NOT_H1],
  "docx-heading-skips": [DOCX_HEADING_SKIPS],
  "docx-empty-headings": [DOCX_EMPTY_HEADINGS],
  "docx-empty-paragraph-runs": [DOCX_EMPTY_PARAGRAPH_RUNS],
  "docx-layout-grids": [DOCX_LAYOUT_GRIDS],
  "docx-nested-tables": [DOCX_NESTED_TABLES],
  "docx-merged-cells": [DOCX_MERGED_CELLS],
  "docx-empty-table-rows": [DOCX_EMPTY_TABLE_ROWS],
  "docx-raw-url-link-text": [DOCX_RAW_URL],
  "pptx-slide-titles": [PPTX_UNTITLED_MANY],
  "pptx-distinct-slide-titles": [PPTX_DUP_ONE],
  "pptx-raw-url-link-text": [PPTX_RAW_URL],
  "xlsx-sheet-names": [XLSX_RENAME_ONE, XLSX_RENAME_TWO],
  "xlsx-defined-tables": [XLSX_NO_DEFINED_TABLE],
  "xlsx-data-outside-tables": [XLSX_DATA_OUTSIDE_TABLE],
  "xlsx-pivot-tables": [XLSX_PIVOT_ONE],
  "xlsx-data-start": [XLSX_DATA_START_ONE],
  "xlsx-merged-cells": [XLSX_MERGED_ONE],
  "xlsx-raw-url-link-text": [XLSX_RAW_URL],
};

describe("docx-first-heading-is-h1", () => {
  it("is NOT MET and reports the level, not a count", () => {
    const r = run("docx-first-heading-is-h1", [DOCX_FIRST_HEADING_NOT_H1]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/Heading 3/);
    expect(r.evidence.join(" ")).not.toMatch(/3 headings?\b/i);
  });

  it("is NOT APPLICABLE when the document has no headings at all", () => {
    expect(run("docx-first-heading-is-h1", [DOCX_NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED — not NOT APPLICABLE — when the category itself is absent", () => {
    const ctx = buildContext(null, "docx", 0);
    expect(practice("docx-first-heading-is-h1").detect(ctx).status).toBe("not-checked");
  });

  it("is NOT CHECKED — never MET — when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("docx-first-heading-is-h1", []).status).toBe("not-checked");
  });
});

describe("docx-heading-skips", () => {
  it("is NOT MET, pluralized correctly for more than one skip", () => {
    const r = run("docx-heading-skips", [DOCX_HEADING_SKIPS]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 places/);
  });

  it("is NOT MET, pluralized correctly for exactly one skip", () => {
    const r = run("docx-heading-skips", [DOCX_HEADING_SKIPS_ONE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/1 place\b/);
    expect(r.evidence.join(" ")).not.toMatch(/1 places/);
  });

  it("is NOT APPLICABLE when the document has no headings at all", () => {
    expect(run("docx-heading-skips", [DOCX_NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("docx-heading-skips", []).status).toBe("not-checked");
  });
});

describe("docx-empty-headings", () => {
  it("is NOT MET", () => {
    const r = run("docx-empty-headings", [DOCX_EMPTY_HEADINGS]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 empty Heading-styled paragraphs/);
  });

  it("is NOT APPLICABLE when the document has no headings at all", () => {
    expect(run("docx-empty-headings", [DOCX_NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("docx-empty-headings", []).status).toBe("not-checked");
  });
});

describe("docx-empty-paragraph-runs", () => {
  it("is NOT MET", () => {
    const r = run("docx-empty-paragraph-runs", [DOCX_EMPTY_PARAGRAPH_RUNS]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/3 places/);
  });

  it("is NOT CHECKED — no N/A line and no positive line exist for this concern", () => {
    expect(run("docx-empty-paragraph-runs", []).status).toBe("not-checked");
  });

  it("is NOT CHECKED when the category itself is absent (no explicit guard needed: falls through)", () => {
    const ctx = buildContext(null, "docx", 0);
    expect(practice("docx-empty-paragraph-runs").detect(ctx).status).toBe("not-checked");
  });
});

describe("docx-layout-grids", () => {
  it("is NOT MET", () => {
    const r = run("docx-layout-grids", [DOCX_LAYOUT_GRIDS]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 bare grids/);
  });

  it("is NOT APPLICABLE when the document has no tables", () => {
    expect(run("docx-layout-grids", [DOCX_NO_TABLES]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED — not NOT APPLICABLE — when the category itself is absent", () => {
    const ctx = buildContext(null, "docx", 0);
    expect(practice("docx-layout-grids").detect(ctx).status).toBe("not-checked");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("docx-layout-grids", []).status).toBe("not-checked");
  });
});

describe("docx-nested-tables", () => {
  it("is NOT MET", () => {
    expect(run("docx-nested-tables", [DOCX_NESTED_TABLES]).status).toBe("not-met");
  });

  it("is NOT APPLICABLE when the document has no tables", () => {
    expect(run("docx-nested-tables", [DOCX_NO_TABLES]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("docx-nested-tables", []).status).toBe("not-checked");
  });
});

describe("docx-merged-cells", () => {
  it("is NOT MET and surfaces the count", () => {
    const r = run("docx-merged-cells", [DOCX_MERGED_CELLS]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/12 merged cells/);
    expect(r.fix?.source).toBeTruthy();
    expect(r.fix?.app).toBeTruthy();
  });

  it("is NOT APPLICABLE when the document has no tables", () => {
    expect(run("docx-merged-cells", [DOCX_NO_TABLES]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED — not NOT APPLICABLE — when the category itself is absent: a missing category must never be reported as the document fact 'this document has no tables'", () => {
    // This is the one deliberate deviation from the brief's worked-example
    // code: the example combined `!ctx.categoryPresent` into the same
    // branch as "no tables were found", which would report a forged/
    // archived report with table_markup missing entirely as "this document
    // has no tables" — a document-fact claim this report never actually
    // made. office.ts checks categoryAbsent() separately and first, exactly
    // like pdf.ts's table-scope-simple/nested-tables/etc.
    const ctx = buildContext(null, "docx", 0);
    expect(practice("docx-merged-cells").detect(ctx).status).toBe("not-checked");
  });

  it("is NOT CHECKED when the document has tables but merged cells were not flagged (no positive line exists)", () => {
    const r = run("docx-merged-cells", ["3 table(s) found."]);
    expect(r.status).toBe("not-checked");
  });
});

describe("the six 'Note — not scored' lines Task 1 unblocked", () => {
  it("reads Word merged cells out of the not-scored partition", () => {
    const r = practice("docx-merged-cells").detect(
      buildContext(
        {
          findings: [
            "Note — not scored: 12 merged cell(s) across the table(s). Merged and split cells can confuse screen-reader navigation (Microsoft's own checker flags them); whether they harm depends on placement — review manually.",
          ],
        },
        "docx",
        0,
      ),
    );
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/12/);
  });
});

describe("docx-empty-table-rows", () => {
  it("is NOT MET", () => {
    const r = run("docx-empty-table-rows", [DOCX_EMPTY_TABLE_ROWS]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/4 entirely empty table rows/);
  });

  it("is NOT APPLICABLE when the document has no tables", () => {
    expect(run("docx-empty-table-rows", [DOCX_NO_TABLES]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("docx-empty-table-rows", []).status).toBe("not-checked");
  });
});

describe("docx-raw-url-link-text", () => {
  it("is NOT MET (un-prefixed in the analyzer's category header, but 'Advisory — not scored against you' IS recognised)", () => {
    const r = run("docx-raw-url-link-text", [DOCX_RAW_URL]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 link\(s\)/);
  });

  it("is NOT APPLICABLE when the document has no links", () => {
    expect(run("docx-raw-url-link-text", [DOCX_NO_LINKS]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED — not NOT APPLICABLE — when the category itself is absent", () => {
    const ctx = buildContext(null, "docx", 0);
    expect(practice("docx-raw-url-link-text").detect(ctx).status).toBe("not-checked");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("docx-raw-url-link-text", []).status).toBe("not-checked");
  });
});

describe("pptx-slide-titles", () => {
  it("is NOT MET for a single untitled slide, using the analyzer's own singular phrasing", () => {
    const r = run("pptx-slide-titles", [PPTX_UNTITLED_ONE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/slide 5 has no title placeholder/);
  });

  it("is NOT MET for several untitled slides, quoting the whole list rather than just the first number", () => {
    // pptx.ts:154's evidence is a LIST of slide numbers — firstNumber would
    // wrongly return only 3.
    const r = run("pptx-slide-titles", [PPTX_UNTITLED_MANY]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/slides 3, 7, 12 have no title placeholder/);
  });

  it("is NOT APPLICABLE when the presentation has no slides", () => {
    expect(run("pptx-slide-titles", [PPTX_NO_SLIDES]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED — not NOT APPLICABLE — when the category itself is absent", () => {
    const ctx = buildContext(null, "pptx", 0);
    expect(practice("pptx-slide-titles").detect(ctx).status).toBe("not-checked");
  });

  it("is MET when every visible slide has a distinct title", () => {
    const r = run("pptx-slide-titles", [PPTX_DISTINCT_MET]);
    expect(r.status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("pptx-slide-titles", []).status).toBe("not-checked");
  });
});

describe("pptx-distinct-slide-titles", () => {
  it("is NOT MET for one duplicate-title group and quotes the title", () => {
    const r = run("pptx-distinct-slide-titles", [PPTX_DUP_ONE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/"Q3 Results"/);
  });

  it("is NOT MET for several duplicate-title groups, collecting every group rather than just the first", () => {
    // pptx.ts:168 is pushed once PER duplicate-title group — matchNotScored
    // alone would return only the first ("Q3 Results"), silently dropping
    // "Overview".
    const r = run("pptx-distinct-slide-titles", [PPTX_DUP_ONE, PPTX_DUP_TWO]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/"Q3 Results"/);
    expect(r.evidence.join(" ")).toMatch(/"Overview"/);
  });

  it("is NOT APPLICABLE when the presentation has no slides", () => {
    expect(run("pptx-distinct-slide-titles", [PPTX_NO_SLIDES]).status).toBe("not-applicable");
  });

  it("is MET when no two visible slides share a title", () => {
    expect(run("pptx-distinct-slide-titles", [PPTX_DISTINCT_MET]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("pptx-distinct-slide-titles", []).status).toBe("not-checked");
  });
});

describe("pptx-raw-url-link-text", () => {
  it("is NOT MET", () => {
    const r = run("pptx-raw-url-link-text", [PPTX_RAW_URL]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/3 link\(s\)/);
  });

  it("is NOT APPLICABLE when the presentation has no links", () => {
    expect(run("pptx-raw-url-link-text", [PPTX_NO_LINKS]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("pptx-raw-url-link-text", []).status).toBe("not-checked");
  });
});

describe("xlsx-sheet-names", () => {
  it("is NOT MET for one default-named sheet, extracting the quoted name rather than calling firstNumber", () => {
    // xlsx.ts:171's evidence is the sheet's own NAME, and a default name
    // like "Sheet1" would make firstNumber return 1 as if it were a count.
    const r = run("xlsx-sheet-names", [XLSX_RENAME_ONE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/"Sheet1"/);
    expect(r.evidence.join(" ")).toMatch(/1 sheet\b/);
    expect(r.evidence.join(" ")).not.toMatch(/1 sheets/);
  });

  it("is NOT MET for several default-named sheets, collecting every one rather than just the first", () => {
    const r = run("xlsx-sheet-names", [XLSX_RENAME_ONE, XLSX_RENAME_TWO]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/"Sheet1"/);
    expect(r.evidence.join(" ")).toMatch(/"Sheet3"/);
    expect(r.evidence.join(" ")).toMatch(/2 sheets/);
  });

  it("is NOT APPLICABLE when the workbook has no visible sheets", () => {
    expect(run("xlsx-sheet-names", [XLSX_NO_SHEETS]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED — not NOT APPLICABLE — when the category itself is absent", () => {
    const ctx = buildContext(null, "xlsx", 0);
    expect(practice("xlsx-sheet-names").detect(ctx).status).toBe("not-checked");
  });

  it("is MET when every visible sheet has a descriptive name", () => {
    expect(run("xlsx-sheet-names", [XLSX_SHEET_NAMES_MET]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("xlsx-sheet-names", []).status).toBe("not-checked");
  });
});

describe("xlsx-defined-tables", () => {
  it("is NOT MET when data exists with no defined Excel Table anywhere", () => {
    const r = run("xlsx-defined-tables", [XLSX_NO_DEFINED_TABLE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/no defined Excel Table anywhere/);
  });

  it("is NOT APPLICABLE when the workbook has no tables or sizable data ranges", () => {
    expect(run("xlsx-defined-tables", [XLSX_NO_DATA]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED — not NOT APPLICABLE — when the category itself is absent", () => {
    const ctx = buildContext(null, "xlsx", 0);
    expect(practice("xlsx-defined-tables").detect(ctx).status).toBe("not-checked");
  });

  it("does not false-trigger on the sibling 'data outside tables' line", () => {
    expect(run("xlsx-defined-tables", [XLSX_DATA_OUTSIDE_TABLE]).status).toBe("not-checked");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("xlsx-defined-tables", []).status).toBe("not-checked");
  });
});

describe("xlsx-data-outside-tables", () => {
  it("is NOT MET when a table exists but other data sits outside it", () => {
    const r = run("xlsx-data-outside-tables", [XLSX_DATA_OUTSIDE_TABLE]);
    expect(r.status).toBe("not-met");
  });

  it("is NOT APPLICABLE when the workbook has no tables or sizable data ranges", () => {
    expect(run("xlsx-data-outside-tables", [XLSX_NO_DATA]).status).toBe("not-applicable");
  });

  it("does not false-trigger on the sibling 'no defined table anywhere' line", () => {
    expect(run("xlsx-data-outside-tables", [XLSX_NO_DEFINED_TABLE]).status).toBe("not-checked");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("xlsx-data-outside-tables", []).status).toBe("not-checked");
  });
});

describe("xlsx-pivot-tables", () => {
  it("is NOT MET and names the sheet", () => {
    const r = run("xlsx-pivot-tables", [XLSX_PIVOT_ONE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/1 sheet\b/);
    expect(r.evidence.join(" ")).not.toMatch(/1 sheets/);
  });

  it("is NOT APPLICABLE when the workbook has no tables or sizable data ranges", () => {
    expect(run("xlsx-pivot-tables", [XLSX_NO_DATA]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("xlsx-pivot-tables", []).status).toBe("not-checked");
  });
});

describe("xlsx-data-start", () => {
  it("is NOT MET for one sheet, extracting row/column rather than calling firstNumber (a quoted sheet name with a digit, e.g. 'Sheet1', would corrupt it)", () => {
    const r = run("xlsx-data-start", [XLSX_DATA_START_ONE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/"Sheet1" \(row 5, column 3\)/);
  });

  it("is NOT MET for several sheets, listing each one", () => {
    const r = run("xlsx-data-start", [XLSX_DATA_START_TWO]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/"Sheet1" \(row 5, column 3\)/);
    expect(r.evidence.join(" ")).toMatch(/"Data" \(row 8, column 1\)/);
  });

  it("is NOT APPLICABLE when the workbook has no tables or sizable data ranges", () => {
    expect(run("xlsx-data-start", [XLSX_NO_DATA]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("xlsx-data-start", []).status).toBe("not-checked");
  });
});

describe("xlsx-merged-cells", () => {
  it("is NOT MET and names the sheet with its merge count", () => {
    const r = run("xlsx-merged-cells", [XLSX_MERGED_ONE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/1 sheet\b/);
    expect(r.evidence.join(" ")).toMatch(/"Sheet1" \(3\)/);
  });

  it("is NOT APPLICABLE when the workbook has no tables or sizable data ranges", () => {
    expect(run("xlsx-merged-cells", [XLSX_NO_DATA]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("xlsx-merged-cells", []).status).toBe("not-checked");
  });
});

describe("xlsx-raw-url-link-text", () => {
  it("is NOT MET", () => {
    const r = run("xlsx-raw-url-link-text", [XLSX_RAW_URL]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/5 link\(s\)/);
  });

  it("is NOT APPLICABLE when the workbook has no links", () => {
    expect(run("xlsx-raw-url-link-text", [XLSX_NO_LINKS]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no positive line exists)", () => {
    expect(run("xlsx-raw-url-link-text", []).status).toBe("not-checked");
  });
});

describe("every Office practice", () => {
  it("has exactly the 19 catalogued practices", () => {
    expect(OFFICE_PRACTICES.length).toBe(19);
  });

  it("gates each practice to its own format", () => {
    for (const p of OFFICE_PRACTICES) {
      expect(p.formats.length, p.id).toBeGreaterThan(0);
      expect(
        p.formats.every((f) => ["docx", "pptx", "xlsx"].includes(f)),
        p.id,
      ).toBe(true);
      if (p.id.startsWith("docx-")) expect(p.formats).toEqual(["docx"]);
      if (p.id.startsWith("pptx-")) expect(p.formats).toEqual(["pptx"]);
      if (p.id.startsWith("xlsx-")) expect(p.formats).toEqual(["xlsx"]);
    }
  });

  it("returns NOT CHECKED for an empty document — silence is never a pass", () => {
    for (const p of OFFICE_PRACTICES) {
      const r = p.detect(buildContext({ findings: [] }, formatOf(p.id), 0));
      expect(r.status, `${p.id} must read NOT CHECKED on silence, not just avoid MET`).toBe(
        "not-checked",
      );
    }
  });

  it("never throws on malformed stored findings", () => {
    const hostile = [null, { findings: "nope" }, { findings: [1, null, {}] }, 42];
    for (const p of OFFICE_PRACTICES) {
      for (const c of hostile) {
        expect(() => p.detect(buildContext(c, formatOf(p.id), 0)), `${p.id}`).not.toThrow();
      }
    }
  });

  it("has unique ids, non-empty copy, and no forbidden phrasing", () => {
    const ids = OFFICE_PRACTICES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of OFFICE_PRACTICES) {
      expect(p.label.length, p.id).toBeGreaterThan(0);
      expect(p.description.length, p.id).toBeGreaterThan(0);
      expect(p.why.length, p.id).toBeGreaterThan(0);
      const copy = `${p.label} ${p.description} ${p.why} ${p.standard ?? ""}`;
      expect(copy, p.id).not.toMatch(/required by law/i);
      expect(copy, p.id).not.toMatch(/\bstrong\w*/i);
    }
  });

  it("has no forbidden phrasing in evidence or fix text either — most user-facing sentences live there, not in the static copy", () => {
    // A gate that has only ever passed proves nothing (project rule): fail
    // loudly, rather than silently skip, if a future 20th practice has no
    // entry here, and assert the fixture actually LANDS on not-met (a
    // fixture that drifted to not-checked would otherwise make the
    // phrasing check pass vacuously).
    for (const p of OFFICE_PRACTICES) {
      const findings = NOT_MET_TRIGGERS[p.id];
      expect(
        findings,
        `no NOT_MET_TRIGGERS entry for "${p.id}" — every practice needs one, or this sweep silently skips it`,
      ).toBeDefined();
      const r = p.detect(buildContext({ findings: findings! }, formatOf(p.id), 0));
      expect(
        r.status,
        `${p.id}'s NOT_MET_TRIGGERS fixture did not reach not-met (got "${r.status}") — update the trigger, or this sweep proves nothing for this practice`,
      ).toBe("not-met");
      const copy = `${r.evidence.join(" ")} ${r.fix?.source ?? ""} ${r.fix?.app ?? ""}`;
      expect(copy, p.id).not.toMatch(/required by law/i);
      expect(copy, p.id).not.toMatch(/\bstrong\w*/i);
    }
  });

  it("uses only valid Office category ids", () => {
    const valid = new Set([
      "heading_structure",
      "text_extractability",
      "table_markup",
      "link_quality",
      "slide_titles",
      "sheet_names",
    ]);
    for (const p of OFFICE_PRACTICES) {
      expect(valid.has(p.categoryId), `${p.id} categoryId "${p.categoryId}"`).toBe(true);
    }
  });
});
