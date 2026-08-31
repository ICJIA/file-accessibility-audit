/**
 * The Word/PowerPoint/Excel catalog, one describe per practice.
 *
 * Every fixture string below is copied VERBATIM from packages/analyzer
 * (docx.ts / pptx.ts / xlsx.ts) via
 *   grep -n "not scored" packages/analyzer/src/scoring/{docx,pptx,xlsx}.ts
 * If a test here fails after an analyzer change, the catalog's matcher is
 * stale — fix the matcher, do not loosen the test.
 *
 * WITNESS LINES. Sixteen of these practices key MET off a census line the
 * scorer pushes unconditionally before any advisory (office.ts's header
 * comment explains the qualifying rule, and the two lines that need an
 * extra numeric gate: xlsx.ts's table-markup witness and pptx.ts's shared
 * distinct-title witness, both of which can vacuously read n=0). EVERY NOT
 * MET fixture below therefore includes BOTH the witness line AND the
 * advisory — exactly as a real document would emit them — so a branch
 * reorder (MET checked before NOT MET) fails these tests. A fixture that
 * omitted the witness would not prove the ordering; it would only prove
 * the advisory matches, which is a weaker claim.
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

// docx.ts:162 — pushed unconditionally inside `if (total > 0)`, before
// every heading-structure advisory. Witnesses docx-first-heading-is-h1,
// docx-heading-skips, docx-empty-headings.
const DOCX_HEADING_WITNESS = "4 real heading(s) found.";

// docx.ts:194 — headingOutlineLines(a.headings), pushed whenever total > 0:
// one indented line per heading carrying that heading's OWN text. It is
// document-controlled, so it lives in `signals` and may never act as a
// needle — but it is exactly the evidence an author asked to see.
const DOCX_HEADING_OUTLINE = ["--- Heading Outline ---", '  H1 "Introduction"', '  H3 "Findings"'];

// docx.ts:290 — the findings array initializer, pushed unconditionally
// whenever a.tables.length > 0, before every table_markup advisory.
// Witnesses docx-layout-grids, docx-nested-tables, docx-merged-cells,
// docx-empty-table-rows.
const DOCX_TABLE_WITNESS = "3 table(s) found.";

// docx.ts:85-87 — the ONLY line scoreDocxText ever pushes unconditionally
// (this whole function has no branch that could skip it). Witnesses
// docx-empty-paragraph-runs.
const DOCX_TEXT_WITNESS =
  "Word documents contain fully extractable, selectable text — unlike a scanned PDF, the content is always available to assistive technology.";

// docx.ts's link-quality findings[0] — pushed unconditionally whenever
// a.links.length > 0, before the raw-URL advisory. Witnesses
// docx-raw-url-link-text.
const DOCX_LINK_WITNESS = "5 link(s) found; 1 with unclear text.";

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

// pptx.ts's link-quality findings[0] — same shape as docx.ts's. Witnesses
// pptx-raw-url-link-text.
const PPTX_LINK_WITNESS = "6 link(s) found; 2 with unclear text.";

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

// xlsx.ts:207 — the findings array initializer, pushed unconditionally
// whenever the early return is not taken. Witnesses xlsx-pivot-tables,
// xlsx-data-start and xlsx-merged-cells directly; xlsx-defined-tables AND
// xlsx-data-outside-tables also require this witness's own count to be > 0
// (see XLSX_TABLE_WITNESS_ZERO below for the trap that gate closes).
const XLSX_TABLE_WITNESS = "2 defined table(s) found.";
// The pivot-only-workbook trap office.ts's header comment documents: this
// line is pushed even at n=0 whenever a workbook's only sizable data lives
// on a sheet excluded from `datafulWithoutTable` by being a pivot. Paired
// with a pivot-tables advisory and NO defined-tables advisory, this must
// NOT read MET for xlsx-defined-tables (its concern, "does at least one
// table exist", is unconfirmed) and must NOT read MET for
// xlsx-data-outside-tables either (with zero tables, the pivot's own data
// does sit outside one — MET would state a false document fact).
const XLSX_TABLE_WITNESS_ZERO = "0 defined table(s) found.";
const XLSX_PIVOT_ONLY_WORKBOOK =
  'Note — not scored: 1 sheet(s) contain pivot tables ("PivotSheet"). Pivots cannot become Excel Tables; verify their readability manually.';

// xlsx.ts's link-quality findings[0] — witnesses xlsx-raw-url-link-text.
const XLSX_LINK_WITNESS = "4 link(s) assessed; 1 with unclear text.";

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
  "docx-first-heading-is-h1": [DOCX_HEADING_WITNESS, DOCX_FIRST_HEADING_NOT_H1],
  "docx-heading-skips": [DOCX_HEADING_WITNESS, DOCX_HEADING_SKIPS],
  "docx-empty-headings": [DOCX_HEADING_WITNESS, DOCX_EMPTY_HEADINGS],
  "docx-empty-paragraph-runs": [DOCX_TEXT_WITNESS, DOCX_EMPTY_PARAGRAPH_RUNS],
  "docx-layout-grids": [DOCX_TABLE_WITNESS, DOCX_LAYOUT_GRIDS],
  "docx-nested-tables": [DOCX_TABLE_WITNESS, DOCX_NESTED_TABLES],
  "docx-merged-cells": [DOCX_TABLE_WITNESS, DOCX_MERGED_CELLS],
  "docx-empty-table-rows": [DOCX_TABLE_WITNESS, DOCX_EMPTY_TABLE_ROWS],
  "docx-raw-url-link-text": [DOCX_LINK_WITNESS, DOCX_RAW_URL],
  "pptx-slide-titles": [PPTX_UNTITLED_MANY],
  "pptx-distinct-slide-titles": [PPTX_DUP_ONE],
  "pptx-raw-url-link-text": [PPTX_LINK_WITNESS, PPTX_RAW_URL],
  "xlsx-sheet-names": [XLSX_RENAME_ONE, XLSX_RENAME_TWO],
  "xlsx-defined-tables": [XLSX_TABLE_WITNESS_ZERO, XLSX_NO_DEFINED_TABLE],
  "xlsx-data-outside-tables": [XLSX_TABLE_WITNESS, XLSX_DATA_OUTSIDE_TABLE],
  "xlsx-pivot-tables": [XLSX_TABLE_WITNESS, XLSX_PIVOT_ONE],
  "xlsx-data-start": [XLSX_TABLE_WITNESS, XLSX_DATA_START_ONE],
  "xlsx-merged-cells": [XLSX_TABLE_WITNESS, XLSX_MERGED_ONE],
  "xlsx-raw-url-link-text": [XLSX_LINK_WITNESS, XLSX_RAW_URL],
};

describe("docx-first-heading-is-h1", () => {
  it("is NOT MET, even with the witness line present, and reports the level, not a count", () => {
    // ORDER PROOF: a real document with this problem carries BOTH lines —
    // docx.ts:162 pushes the witness unconditionally before the
    // first-heading check even runs. If MET were checked first, this
    // fixture would (wrongly) read MET.
    const r = run("docx-first-heading-is-h1", [DOCX_HEADING_WITNESS, DOCX_FIRST_HEADING_NOT_H1]);
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

  it("is MET when the witness is present with no first-heading advisory", () => {
    const r = run("docx-first-heading-is-h1", [DOCX_HEADING_WITNESS]);
    expect(r.status).toBe("met");
    expect(r.evidence.join(" ")).toMatch(/starts at Heading 1/);
  });

  it("is NOT CHECKED — never MET — when the analyzer said nothing either way (no witness present)", () => {
    expect(run("docx-first-heading-is-h1", []).status).toBe("not-checked");
  });
});

describe("docx-heading-skips", () => {
  it("is NOT MET, even with the witness line present, pluralized correctly for more than one skip", () => {
    const r = run("docx-heading-skips", [DOCX_HEADING_WITNESS, DOCX_HEADING_SKIPS]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 places/);
  });

  it("is NOT MET, pluralized correctly for exactly one skip", () => {
    const r = run("docx-heading-skips", [DOCX_HEADING_WITNESS, DOCX_HEADING_SKIPS_ONE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/1 place\b/);
    expect(r.evidence.join(" ")).not.toMatch(/1 places/);
  });

  it("is NOT APPLICABLE when the document has no headings at all", () => {
    expect(run("docx-heading-skips", [DOCX_NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("is MET when the witness is present with no skip advisory", () => {
    const r = run("docx-heading-skips", [DOCX_HEADING_WITNESS]);
    expect(r.status).toBe("met");
    expect(r.evidence.join(" ")).toMatch(/none of the levels skip a step/);
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no witness present)", () => {
    expect(run("docx-heading-skips", []).status).toBe("not-checked");
  });
});

describe("docx-empty-headings", () => {
  it("is NOT MET, even with the witness line present", () => {
    const r = run("docx-empty-headings", [DOCX_HEADING_WITNESS, DOCX_EMPTY_HEADINGS]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 empty Heading-styled paragraphs/);
  });

  it("is NOT APPLICABLE when the document has no headings at all", () => {
    expect(run("docx-empty-headings", [DOCX_NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("is MET when the witness is present with no empty-heading advisory", () => {
    expect(run("docx-empty-headings", [DOCX_HEADING_WITNESS]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no witness present)", () => {
    expect(run("docx-empty-headings", []).status).toBe("not-checked");
  });
});

describe("docx-empty-paragraph-runs", () => {
  it("is NOT MET, even with the witness line present", () => {
    const r = run("docx-empty-paragraph-runs", [DOCX_TEXT_WITNESS, DOCX_EMPTY_PARAGRAPH_RUNS]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/3 places/);
  });

  it("is MET when the witness (scoreDocxText's only unconditional line) is present alone", () => {
    const r = run("docx-empty-paragraph-runs", [DOCX_TEXT_WITNESS]);
    expect(r.status).toBe("met");
  });

  it("is NOT CHECKED — no witness and no advisory present", () => {
    expect(run("docx-empty-paragraph-runs", []).status).toBe("not-checked");
  });

  it("is NOT CHECKED when the category itself is absent (no explicit guard needed: falls through)", () => {
    const ctx = buildContext(null, "docx", 0);
    expect(practice("docx-empty-paragraph-runs").detect(ctx).status).toBe("not-checked");
  });
});

describe("docx-layout-grids", () => {
  it("is NOT MET, even with the witness line present", () => {
    const r = run("docx-layout-grids", [DOCX_TABLE_WITNESS, DOCX_LAYOUT_GRIDS]);
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

  it("is MET when the witness is present with no bare-grid advisory", () => {
    expect(run("docx-layout-grids", [DOCX_TABLE_WITNESS]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no witness present)", () => {
    expect(run("docx-layout-grids", []).status).toBe("not-checked");
  });
});

describe("docx-nested-tables", () => {
  it("is NOT MET, even with the witness line present", () => {
    expect(run("docx-nested-tables", [DOCX_TABLE_WITNESS, DOCX_NESTED_TABLES]).status).toBe(
      "not-met",
    );
  });

  it("is NOT APPLICABLE when the document has no tables", () => {
    expect(run("docx-nested-tables", [DOCX_NO_TABLES]).status).toBe("not-applicable");
  });

  it("is MET when the witness is present with no nested-table advisory", () => {
    expect(run("docx-nested-tables", [DOCX_TABLE_WITNESS]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no witness present)", () => {
    expect(run("docx-nested-tables", []).status).toBe("not-checked");
  });
});

describe("docx-merged-cells", () => {
  it("is NOT MET, even with the witness line present, and surfaces the count", () => {
    const r = run("docx-merged-cells", [DOCX_TABLE_WITNESS, DOCX_MERGED_CELLS]);
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

  it("is MET when the witness is present with no merged-cell advisory, using the coordinator's own example copy", () => {
    const r = run("docx-merged-cells", [DOCX_TABLE_WITNESS]);
    expect(r.status).toBe("met");
    expect(r.evidence).toEqual([
      "This document's tables were checked, and none use merged or split cells.",
    ]);
  });

  it("is NOT CHECKED when neither the witness nor the advisory is present", () => {
    expect(run("docx-merged-cells", []).status).toBe("not-checked");
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
  it("is NOT MET, even with the witness line present", () => {
    const r = run("docx-empty-table-rows", [DOCX_TABLE_WITNESS, DOCX_EMPTY_TABLE_ROWS]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/4 entirely empty table rows/);
  });

  it("is NOT APPLICABLE when the document has no tables", () => {
    expect(run("docx-empty-table-rows", [DOCX_NO_TABLES]).status).toBe("not-applicable");
  });

  it("is MET when the witness is present with no empty-row advisory", () => {
    expect(run("docx-empty-table-rows", [DOCX_TABLE_WITNESS]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no witness present)", () => {
    expect(run("docx-empty-table-rows", []).status).toBe("not-checked");
  });
});

describe("docx-raw-url-link-text", () => {
  it("is NOT MET, even with the witness line present (un-prefixed in the analyzer's category header, but 'Advisory — not scored against you' IS recognised)", () => {
    const r = run("docx-raw-url-link-text", [DOCX_LINK_WITNESS, DOCX_RAW_URL]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 links showing a raw web address/);
  });

  it("is NOT APPLICABLE when the document has no links", () => {
    expect(run("docx-raw-url-link-text", [DOCX_NO_LINKS]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED — not NOT APPLICABLE — when the category itself is absent", () => {
    const ctx = buildContext(null, "docx", 0);
    expect(practice("docx-raw-url-link-text").detect(ctx).status).toBe("not-checked");
  });

  it("is MET when the witness is present with no raw-URL advisory", () => {
    expect(run("docx-raw-url-link-text", [DOCX_LINK_WITNESS]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no witness present)", () => {
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

  it("is NOT CHECKED — never MET — when the distinct-title witness reads n=0: pptx.ts:176-178 pushes 'All 0 visible slide(s) have a distinct title.' for a deck whose slides are ALL hidden, which is vacuously true but not something a reader can act on or verify", () => {
    const r = run("pptx-slide-titles", ["All 0 visible slide(s) have a distinct title."]);
    expect(r.status).toBe("not-checked");
    expect(r.evidence.join(" ")).toMatch(/all hidden/);
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

  it("is NOT CHECKED — never MET — for the same all-hidden-deck trap as pptx-slide-titles (both practices share the same witness line)", () => {
    const r = run("pptx-distinct-slide-titles", ["All 0 visible slide(s) have a distinct title."]);
    expect(r.status).toBe("not-checked");
    expect(r.evidence.join(" ")).toMatch(/all hidden/);
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("pptx-distinct-slide-titles", []).status).toBe("not-checked");
  });
});

describe("pptx-raw-url-link-text", () => {
  it("is NOT MET, even with the witness line present", () => {
    const r = run("pptx-raw-url-link-text", [PPTX_LINK_WITNESS, PPTX_RAW_URL]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/3 links showing a raw web address/);
  });

  it("is NOT APPLICABLE when the presentation has no links", () => {
    expect(run("pptx-raw-url-link-text", [PPTX_NO_LINKS]).status).toBe("not-applicable");
  });

  it("is MET when the witness is present with no raw-URL advisory", () => {
    expect(run("pptx-raw-url-link-text", [PPTX_LINK_WITNESS]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no witness present)", () => {
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
    const r = run("xlsx-defined-tables", [XLSX_TABLE_WITNESS_ZERO, XLSX_NO_DEFINED_TABLE]);
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

  it("is MET when the witness is present with n > 0 and no defined-table advisory", () => {
    const r = run("xlsx-defined-tables", [XLSX_TABLE_WITNESS]);
    expect(r.status).toBe("met");
    expect(r.evidence.join(" ")).toMatch(/uses at least one defined Excel Table/);
  });

  it("is NOT CHECKED — never MET — for the pivot-only-workbook trap: witness present at n=0, no defined-table advisory (pivots are excluded from that check), so claiming 'uses a defined Table' would be false", () => {
    // This is the exact scenario office.ts's header comment documents: a
    // workbook whose only sizable data lives on a pivot sheet pushes
    // "0 defined table(s) found." WITHOUT tripping the "no defined Excel
    // Table anywhere" advisory (pivot sheets are excluded from
    // `datafulWithoutTable`), so a bare "witness present + no advisory"
    // gate would wrongly report MET on a workbook with zero defined
    // tables. The extra n > 0 gate in office.ts is what prevents that.
    const r = run("xlsx-defined-tables", [XLSX_TABLE_WITNESS_ZERO, XLSX_PIVOT_ONLY_WORKBOOK]);
    expect(r.status).toBe("not-checked");
    // The witness IS present ("0 defined table(s) found." is right there in
    // the report) — the message must not deny a line the reader can see.
    expect(r.evidence.join(" ")).toMatch(/does not establish whether/);
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no witness present)", () => {
    expect(run("xlsx-defined-tables", []).status).toBe("not-checked");
  });
});

describe("xlsx-data-outside-tables", () => {
  it("is NOT MET, even with the witness line present, when a table exists but other data sits outside it", () => {
    const r = run("xlsx-data-outside-tables", [XLSX_TABLE_WITNESS, XLSX_DATA_OUTSIDE_TABLE]);
    expect(r.status).toBe("not-met");
  });

  it("is NOT APPLICABLE when the workbook has no tables or sizable data ranges", () => {
    expect(run("xlsx-data-outside-tables", [XLSX_NO_DATA]).status).toBe("not-applicable");
  });

  // CORRECTED (audit sweep, same bug class as list-labels): this test used
  // to be named "does not false-trigger on the sibling 'no defined table
  // anywhere' line" and expected NOT CHECKED. That line is the tables=0
  // special case of the EXACT fact this practice measures — when there are
  // no defined tables anywhere, all sizable non-pivot data trivially sits
  // "outside" one. Not matching it meant the unconditional witness alone
  // satisfied the MET check below for a workbook with ZERO defined tables:
  // reproduced with [XLSX_TABLE_WITNESS_ZERO, XLSX_NO_DEFINED_TABLE], which
  // returned MET, claiming "none has sizable data sitting outside a defined
  // Table," before this fix.
  it("is NOT MET when there are zero defined tables anywhere — the tables=0 special case of the same fact this practice measures", () => {
    const r = run("xlsx-data-outside-tables", [XLSX_TABLE_WITNESS_ZERO, XLSX_NO_DEFINED_TABLE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/no defined Excel Table anywhere/);
  });

  it("is MET when the witness is present with no data-outside-tables advisory and at least one table exists", () => {
    expect(run("xlsx-data-outside-tables", [XLSX_TABLE_WITNESS]).status).toBe("met");
  });

  // A workbook with real Tables AND a pivot sheet: MET is right (no ordinary
  // range sits outside a Table), but the unqualified sentence would not be —
  // the pivot's cells are outside one. The wording carries the carve-out
  // only where the pivot line establishes there is one.
  it("names the pivot carve-out in its MET wording when a pivot sheet is present alongside real tables", () => {
    const r = run("xlsx-data-outside-tables", [XLSX_TABLE_WITNESS, XLSX_PIVOT_ONE]);
    expect(r.status).toBe("met");
    expect(r.evidence.join(" ")).toMatch(/apart from its pivot tables/);
  });

  // CORRECTED: this test used to pin MET here, on the reasoning that this
  // practice's concern (non-pivot data outside a table) has no non-pivot
  // data to be wrong about. The reasoning is about the ADVICE, not the
  // FACT. With zero defined tables, the pivot sheet's own >=12-cell range
  // demonstrably DOES sit outside a defined Table — there is no Table in
  // the workbook for it to sit in — so MET's own sentence ("none has
  // sizable data sitting outside a defined Table") stated something false
  // about the document, and this test pinned that as correct. The analyzer
  // excludes pivots from `datafulWithoutTable` (xlsx.ts:222-224) because a
  // pivot cannot be converted into an Excel Table, i.e. the fix would be
  // wrong — not because the data is inside one. NOT APPLICABLE says that
  // without asserting anything untrue.
  it("is NOT APPLICABLE for a pivot-only workbook — MET would state a false fact, since with zero tables the pivot's data does sit outside one", () => {
    const r = run("xlsx-data-outside-tables", [XLSX_TABLE_WITNESS_ZERO, XLSX_PIVOT_ONLY_WORKBOOK]);
    expect(r.status).toBe("not-applicable");
    expect(r.evidence.join(" ")).toMatch(/pivot tables, which cannot be turned into Tables/);
    // The carve-out may only be NAMED where the analyzer established it.
    expect(r.evidence.join(" ")).not.toMatch(/none has sizable data sitting outside/);
  });

  // The same n=0 witness WITHOUT the pivot line. Reachable: a workbook whose
  // only >=12-cell sheet is hidden (xlsx.ts:192 counts hidden sheets, but
  // both :222 datafulWithoutTable and :240 pivotSheets require !s.hidden).
  // Nothing was established about the visible sheets either way, and the
  // pivot carve-out must NOT be named here — inferring it from the absence
  // of two advisories would fabricate the exact class of document fact this
  // catalog exists to prevent.
  it("is NOT CHECKED at a zero-count witness with no pivot line — the carve-out is never inferred from silence", () => {
    const r = run("xlsx-data-outside-tables", [XLSX_TABLE_WITNESS_ZERO]);
    expect(r.status).toBe("not-checked");
    expect(r.evidence.join(" ")).toMatch(/does not establish whether/);
    expect(r.evidence.join(" ")).not.toMatch(/pivot/i);
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no witness present)", () => {
    expect(run("xlsx-data-outside-tables", []).status).toBe("not-checked");
  });
});

describe("xlsx-pivot-tables", () => {
  it("is NOT MET, even with the witness line present, and names the sheet", () => {
    const r = run("xlsx-pivot-tables", [XLSX_TABLE_WITNESS, XLSX_PIVOT_ONE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/1 sheet\b/);
    expect(r.evidence.join(" ")).not.toMatch(/1 sheets/);
  });

  it("is NOT APPLICABLE when the workbook has no tables or sizable data ranges", () => {
    expect(run("xlsx-pivot-tables", [XLSX_NO_DATA]).status).toBe("not-applicable");
  });

  it("is MET when the witness is present with no pivot-table advisory", () => {
    expect(run("xlsx-pivot-tables", [XLSX_TABLE_WITNESS]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no witness present)", () => {
    expect(run("xlsx-pivot-tables", []).status).toBe("not-checked");
  });
});

describe("xlsx-data-start", () => {
  it("is NOT MET, even with the witness line present, for one sheet — extracting row/column rather than calling firstNumber (a quoted sheet name with a digit, e.g. 'Sheet1', would corrupt it)", () => {
    const r = run("xlsx-data-start", [XLSX_TABLE_WITNESS, XLSX_DATA_START_ONE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/"Sheet1" \(row 5, column 3\)/);
  });

  it("is NOT MET for several sheets, listing each one", () => {
    const r = run("xlsx-data-start", [XLSX_TABLE_WITNESS, XLSX_DATA_START_TWO]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/"Sheet1" \(row 5, column 3\)/);
    expect(r.evidence.join(" ")).toMatch(/"Data" \(row 8, column 1\)/);
  });

  it("is NOT MET when only the column exceeds the threshold, so the row renders as '?' — xlsx.ts:251-255 admits a sheet on firstDataCol alone, and xlsx.ts:262 renders a missing firstDataRow as '?'; the regex must accept that or silently drop the sheet", () => {
    const XLSX_DATA_START_ROW_UNKNOWN =
      'Note — not scored: on "Sheet1" data begins at row ?, column 6 — screen readers land at A1, so leading blank rows/columns are dead space to navigate. Start data at or near A1.';
    const r = run("xlsx-data-start", [XLSX_TABLE_WITNESS, XLSX_DATA_START_ROW_UNKNOWN]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/"Sheet1" \(row \?, column 6\)/);
  });

  it("is NOT APPLICABLE when the workbook has no tables or sizable data ranges", () => {
    expect(run("xlsx-data-start", [XLSX_NO_DATA]).status).toBe("not-applicable");
  });

  it("is MET when the witness is present with no far-start advisory", () => {
    expect(run("xlsx-data-start", [XLSX_TABLE_WITNESS]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no witness present)", () => {
    expect(run("xlsx-data-start", []).status).toBe("not-checked");
  });
});

describe("xlsx-merged-cells", () => {
  it("is NOT MET, even with the witness line present, and names the sheet with its merge count", () => {
    const r = run("xlsx-merged-cells", [XLSX_TABLE_WITNESS, XLSX_MERGED_ONE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/1 sheet\b/);
    expect(r.evidence.join(" ")).toMatch(/"Sheet1" \(3\)/);
  });

  it("is NOT APPLICABLE when the workbook has no tables or sizable data ranges", () => {
    expect(run("xlsx-merged-cells", [XLSX_NO_DATA]).status).toBe("not-applicable");
  });

  it("is MET when the witness is present with no merged-cell advisory", () => {
    expect(run("xlsx-merged-cells", [XLSX_TABLE_WITNESS]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no witness present)", () => {
    expect(run("xlsx-merged-cells", []).status).toBe("not-checked");
  });
});

describe("xlsx-raw-url-link-text", () => {
  it("is NOT MET, even with the witness line present", () => {
    const r = run("xlsx-raw-url-link-text", [XLSX_LINK_WITNESS, XLSX_RAW_URL]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/5 links showing a raw web address/);
  });

  it("is NOT APPLICABLE when the workbook has no links", () => {
    expect(run("xlsx-raw-url-link-text", [XLSX_NO_LINKS]).status).toBe("not-applicable");
  });

  it("is MET when the witness is present with no raw-URL advisory, scoped to visible sheets — xlsxService.ts skips collectSheetContent (where a.links is populated) wholesale for hidden sheets, so the claim must not imply broader coverage", () => {
    const r = run("xlsx-raw-url-link-text", [XLSX_LINK_WITNESS]);
    expect(r.status).toBe("met");
    expect(r.evidence.join(" ")).toMatch(/links on visible sheets/);
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no witness present)", () => {
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

  it("MET is never claimed from a witness alone where the practice's own concern is the witness's numeric value — regression pin for the xlsx-defined-tables gate", () => {
    // A cheap, format-wide version of the pivot-only-workbook trap test
    // above: every OTHER table_markup/link_quality witness-backed practice
    // must read MET off the bare witness with count 0 substituted in,
    // EXCEPT xlsx-defined-tables, which must not.
    const zeroWitnessOnly = run("xlsx-defined-tables", ["0 defined table(s) found."]);
    expect(zeroWitnessOnly.status).not.toBe("met");
  });
});

describe("Word heading practices show the document's own outline — the evidence an author asked for", () => {
  it("docx-heading-skips carries the outline on NOT MET", () => {
    const r = run("docx-heading-skips", [
      DOCX_HEADING_WITNESS,
      DOCX_HEADING_SKIPS,
      ...DOCX_HEADING_OUTLINE,
    ]);
    expect(r.status).toBe("not-met");
    expect(r.block?.lines).toEqual(['H1 "Introduction"', 'H3 "Findings"']);
  });

  it("docx-heading-skips carries the outline on MET too", () => {
    const r = run("docx-heading-skips", [DOCX_HEADING_WITNESS, ...DOCX_HEADING_OUTLINE]);
    expect(r.status).toBe("met");
    expect(r.block?.lines).toContain('H1 "Introduction"');
  });

  it("docx-first-heading-is-h1 carries the outline on NOT MET and MET", () => {
    const notMet = run("docx-first-heading-is-h1", [
      DOCX_HEADING_WITNESS,
      DOCX_FIRST_HEADING_NOT_H1,
      ...DOCX_HEADING_OUTLINE,
    ]);
    expect(notMet.status).toBe("not-met");
    expect(notMet.block?.lines).toContain('H3 "Findings"');
    const met = run("docx-first-heading-is-h1", [DOCX_HEADING_WITNESS, ...DOCX_HEADING_OUTLINE]);
    expect(met.status).toBe("met");
    expect(met.block?.lines).toContain('H1 "Introduction"');
  });

  it("the outline's own heading text can never forge a status", () => {
    // A heading literally titled with the advisory's needle. It is indented
    // signal text, so matchAdvisory (notScored ∪ main) must not see it.
    const r = run("docx-heading-skips", [
      DOCX_HEADING_WITNESS,
      "--- Heading Outline ---",
      '  H1 "Why we skip a heading level"',
    ]);
    expect(r.status).toBe("met");
  });

  it("no outline, no block — never an empty caption", () => {
    const r = run("docx-heading-skips", [DOCX_HEADING_WITNESS, DOCX_HEADING_SKIPS]);
    expect(r.block).toBeUndefined();
  });
});
