/**
 * THE CATALOG READ AGAINST A YEAR-OLD PAYLOAD.
 *
 * Every other fixture in this suite is copied verbatim from the analyzer as
 * it stands TODAY, so no test in it can fail on version drift — which is
 * exactly the defect this file exists to pin. /report/[id] renders stored
 * JSON that lives 365 days (audit.config.ts SHARED_REPORTS.EXPIRY_DAYS), and
 * packages/analyzer/src/scoring/regrade.ts recomputes score/grade/summary
 * only: it NEVER re-derives `findings`. A stored report's strings are frozen
 * at analysis time.
 *
 * v1.136.0 (commit 842dde9, 2026-08-29 — the legal-only scoring sweep)
 * re-prefixed ~18 advisory strings. `partitionCardFindings` routes by prefix,
 * so the older, un-prefixed form of each lands in `main`, not `notScored` —
 * invisible to a matcher that searches only the not-scored partition. The
 * witness line beside it did not change, so the practice matched its witness,
 * found no advisory, and reported MET: a green row for a document whose own
 * stored finding is rendered verbatim in the category card inches below,
 * saying the opposite. `nested-structure-tree` printed "nested 1 level deep",
 * the number that disproves its own status.
 *
 * EVERY FIXTURE BELOW IS COPIED VERBATIM FROM THE PRE-v1.136.0 ANALYZER:
 *
 *   git show 842dde9^:packages/analyzer/src/scoring/pdf.ts
 *   git show 842dde9^:packages/analyzer/src/scoring/docx.ts
 *   git show 842dde9^:packages/analyzer/src/scoring/pptx.ts
 *   git show 842dde9^:packages/analyzer/src/scoring/xlsx.ts
 *
 * Do not "modernise" them. A fixture updated to today's wording tests
 * nothing — it is the old wording that a real stored report carries.
 *
 * TO SABOTAGE-VERIFY (the project's rule: a gate that has only ever passed
 * proves nothing): change one `matchAdvisory` back to `matchNotScored` in
 * utils/bestPractices/{pdf,office}.ts and re-run. The matching case below
 * must go red, reporting "met".
 */
import { describe, it, expect } from "vitest";
import { PDF_PRACTICES } from "../utils/bestPractices/pdf";
import { OFFICE_PRACTICES } from "../utils/bestPractices/office";
import { buildContext } from "../utils/bestPractices/types";
import type { FileType } from "@file-audit/shared";

const ALL = [...PDF_PRACTICES, ...OFFICE_PRACTICES];

const practice = (id: string) => {
  const p = ALL.find((x) => x.id === id);
  if (!p) throw new Error(`no practice with id "${id}"`);
  return p;
};

const run = (id: string, findings: string[], fileType: FileType = "pdf", pageCount = 10) =>
  practice(id).detect(buildContext({ findings }, fileType, pageCount));

// ===========================================================================
// PRE-v1.136.0 ANALYZER OUTPUT — verbatim from 842dde9^
// ===========================================================================

// --- pdf.ts ---------------------------------------------------------------
// :891 (un-prefixed; today "PDF/UA only — not scored: found 6 heading tags,
// but the LEVEL ORDER has gaps …")
const OLD_HEADING_GAPS = "Found 6 heading tags, but the hierarchy has gaps";
// :906
const OLD_HEADING_GAPS_FIX =
  "Heading levels should not skip — e.g., don't jump from H1 to H3 without an H2 in between.";
// :884 (un-prefixed; today prefixed "PDF/UA only — not scored: ")
const OLD_MIXED_CONVENTIONS =
  "3 generic <H> heading(s) appear alongside the numbered <H1>–<H6> headings. PDF/UA prohibits mixing the two conventions in one document (Matterhorn 14-002): a generic <H> carries no level, so screen-reader users lose their place in an otherwise numbered outline.";
// :822 (un-prefixed; today "…: only generic <H> tags WERE FOUND (not H1–H6). …")
const OLD_ALL_GENERIC =
  "Only generic /H tags found (not H1–H6). Generic heading tags don't convey hierarchy.";
// :924 — the witness, byte-identical in both eras. In the OLD analyzer the
// gapped/mixed branch returned BEFORE this line, so an old gapped payload
// carries no witness at all; today it carries both. The fixtures below
// include it so the practice is forced to check the advisory first either way.
const HEADING_WITNESS = "Found 6 heading tags with logical hierarchy";
// :2196 (un-prefixed; today "Advisory — not scored: THE structure tree is flat …")
const OLD_FLAT_TREE =
  "Structure tree is flat (no meaningful nesting) — the document has tags but they don't define a nested hierarchy.";
// :2187 — the witness, byte-identical in both eras, pushed before the flat check.
const DEPTH_WITNESS = "Structure tree depth: 1 level(s)";
// :2287 (un-prefixed; today "Advisory — not scored: the tagged order agreed …")
const OLD_READING_ORDER_DRIFT =
  "Reading order scored 72/100 — the tagged order agreed with the content stream's draw order on 84% of comparable content (a perfect 100 requires ≥ 97%). Divergence is not automatically wrong — remediated documents re-order tags away from a bad draw order on purpose — so verify with a screen reader or Acrobat's Order panel which side reflects the true reading sequence.";
// :2222 — the witness, byte-identical in both eras, pushed before the drift check.
const FIDELITY_WITNESS = "Reading-order fidelity: 84% (6 of 6 page(s) compared)";
// :1473 (un-prefixed; today "Advisory — not scored: this document has 20 pages
// AND no bookmarks. …")
const OLD_NO_BOOKMARKS = "Document has 20 pages but no bookmarks";
// :435 (un-prefixed; today "PDF/UA only — not scored: the title is set, but the
// DisplayDocTitle viewer preference is OFF, so viewers show the FILENAME …")
const OLD_DISPLAYDOCTITLE_OFF =
  "The title is set, but the DisplayDocTitle viewer preference is not — viewers will show the filename in the title bar instead of this title.";
// :1948 (un-prefixed; today "Advisory — not scored: 2 of 9 link(s) use …")
const OLD_NON_DESCRIPTIVE_LINKS =
  '2 of 9 link(s) use non-descriptive text — empty, a vague phrase such as "click here" / "read more", or too short to mean anything';

// --- docx.ts --------------------------------------------------------------
// :163 (un-prefixed; today "Advisory — not scored: the first heading is …")
const OLD_DOCX_FIRST_HEADING =
  "The first heading is Heading 2, not Heading 1. Start the outline at Heading 1.";
// :174 (un-prefixed; today "Advisory — not scored: 2 place(s) skip …")
const OLD_DOCX_SKIPS =
  "2 place(s) skip a heading level (e.g. Heading 1 → Heading 3). Don't skip levels — screen-reader users infer structure from them.";
// :161 — the witness, byte-identical in both eras, pushed before both advisories.
const DOCX_HEADING_WITNESS = "7 real heading(s) found.";
// :289 (un-prefixed; today "Advisory — not scored: nested tables were found —
// YOUR GRADE IS NOT AFFECTED, but they are hard …")
const OLD_DOCX_NESTED =
  "Nested tables were found — these are hard for screen readers to navigate. Flatten them where possible.";
// :283 — the witness, byte-identical in both eras, pushed before every advisory.
const DOCX_TABLE_WITNESS = "3 table(s) found.";
// The header-row line — its TEXT byte-identical in both eras, but not its
// meaning. Pre-v1.136.0 it had no layout filter, so it counted every table
// 2x2 or larger with no header row, bare grids included — a strict superset
// (looksLikeLayout requires no header mark anywhere and hasHeaderRow requires
// one on row 0, so looksLikeLayout implies !hasHeaderRow). TODAY the same
// line EXCLUDES bare grids, which are counted separately and get their own
// advisory. That is why the gate needs both halves: see the comment on it in
// office.ts, and do not read this fixture as proof of the current-era case.
const DOCX_NO_HEADER_ROW =
  "2 data table(s) have no header row. In Word: select the top row → Table Layout → Repeat Header Rows.";

// --- pptx.ts --------------------------------------------------------------
// :153 (un-prefixed; today "Advisory — not scored: slides 3, 7 have NO TITLE
// PLACEHOLDER — …")
const OLD_PPTX_UNTITLED =
  "Slides 3, 7 have no title. In PowerPoint: use the Outline view (View → Outline) or a layout with a title placeholder so every slide has one.";
// :168 (un-prefixed; today "Advisory — not scored: 2 slides share the title …")
const OLD_PPTX_DUPLICATE_TITLES =
  '2 slides share the title "Q3 Results". Give each slide a distinct, descriptive title so screen-reader users can tell them apart in the outline.';

// --- xlsx.ts --------------------------------------------------------------
// :166 (un-prefixed; today "Advisory — not scored: rename \"Sheet1\" to …")
const OLD_XLSX_RENAME =
  'Rename "Sheet1" to describe its contents — sheet names are the workbook\'s navigation.';
// :236 (un-prefixed; today "Advisory — not scored: worksheet data is laid out …")
const OLD_XLSX_NO_TABLE_ANYWHERE =
  "Worksheet data is laid out as plain cell ranges with no defined Excel Table anywhere, so screen readers cannot announce column headers while navigating. In Excel: select each data range → Insert → Table.";
// :207 — the witness, byte-identical in both eras.
const XLSX_TABLE_WITNESS_ZERO = "0 defined table(s) found.";

// ===========================================================================
// THE FIVE PROVEN FALSE GREENS — plus the two the sweep added
// ===========================================================================

describe("a pre-v1.136.0 stored payload never fabricates a MET", () => {
  it("nested-structure-tree: a flat tree is NOT MET, not 'nested 1 level deep'", () => {
    const r = run("nested-structure-tree", [DEPTH_WITNESS, OLD_FLAT_TREE]);
    expect(r.status).toBe("not-met");
    // The specific contradiction this bug shipped: the row printed the depth
    // number off the witness while the card below printed the flat-tree line.
    expect(r.evidence.join(" ")).not.toMatch(/nested 1 level/i);
    expect(r.evidence.join(" ")).toMatch(/flat/i);
  });

  it("reading-order-fidelity: measured drift is NOT MET", () => {
    const r = run("reading-order-fidelity", [FIDELITY_WITNESS, OLD_READING_ORDER_DRIFT]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/84%/);
  });

  it("docx-nested-tables: a nested table is NOT MET", () => {
    const r = run("docx-nested-tables", [DOCX_TABLE_WITNESS, OLD_DOCX_NESTED], "docx");
    expect(r.status).toBe("not-met");
  });

  it("docx-first-heading-is-h1: an outline starting at Heading 2 is NOT MET", () => {
    const r = run(
      "docx-first-heading-is-h1",
      [DOCX_HEADING_WITNESS, OLD_DOCX_FIRST_HEADING],
      "docx",
    );
    expect(r.status).toBe("not-met");
  });

  it("docx-heading-skips: skipped levels are NOT MET", () => {
    const r = run("docx-heading-skips", [DOCX_HEADING_WITNESS, OLD_DOCX_SKIPS], "docx");
    expect(r.status).toBe("not-met");
  });

  it("heading-convention: mixed conventions are NOT MET even beside the witness", () => {
    // The OLD analyzer returned early before the witness, so a real old
    // payload carried the advisory alone — but the fixture includes the
    // witness anyway, which is the strictly harder case and the one the
    // post-v1.136.0 analyzer actually emits.
    const r = run("heading-convention", [OLD_MIXED_CONVENTIONS, HEADING_WITNESS]);
    expect(r.status).toBe("not-met");
  });

  it("heading-level-order: a gapped outline is NOT MET even beside the witness", () => {
    const r = run("heading-level-order", [OLD_HEADING_GAPS, OLD_HEADING_GAPS_FIX, HEADING_WITNESS]);
    expect(r.status).toBe("not-met");
  });

  it("heading-numbered-levels: all-generic is NOT MET; mixed defers to heading-convention (one chip, 2026-09-02)", () => {
    expect(run("heading-numbered-levels", [OLD_ALL_GENERIC]).status).toBe("not-met");
    expect(run("heading-numbered-levels", [OLD_MIXED_CONVENTIONS, HEADING_WITNESS]).status).toBe(
      "not-applicable",
    );
  });

  it("docx-layout-grids: a bare grid predating the advisory is never MET — and the payload's age is carried by analyzedAt", () => {
    // The bare-grid advisory did not exist before 842dde9, so there is no old
    // string to match. Before 2026-08-29 the "no header row" count still
    // INCLUDED bare grids, so on a payload of that age the line is ambiguous
    // and the practice hedges; on a current payload the same line is a scored
    // WCAG 1.3.1 failure that already excludes bare grids, and the practice
    // defers to the score. Neither is ever MET.
    const old = practice("docx-layout-grids").detect(
      buildContext(
        { findings: [DOCX_TABLE_WITNESS, DOCX_NO_HEADER_ROW] },
        "docx",
        10,
        new Date("2026-08-01"),
      ),
    );
    expect(old.status).toBe("not-checked");
    expect(old.evidence.join(" ")).toMatch(/predates/);
    const current = run("docx-layout-grids", [DOCX_TABLE_WITNESS, DOCX_NO_HEADER_ROW], "docx");
    expect(current.status).toBe("not-applicable");
    expect(current.evidence.join(" ")).toMatch(/no header row/i);
    expect(current.evidence.join(" ")).toMatch(/counted in your score/);
    for (const r of [old, current]) expect(r.status).not.toBe("met");
  });

  it("docx-layout-grids: still MET when the report rules a bare grid out", () => {
    const r = run("docx-layout-grids", [DOCX_TABLE_WITNESS], "docx");
    expect(r.status).toBe("met");
  });
});

// ===========================================================================
// THE REST OF THE RE-PREFIXED SET — these fell to NOT CHECKED rather than a
// false green, but a grey "no finding about this" row still contradicts the
// stored finding the card below renders verbatim.
// ===========================================================================

describe("a pre-v1.136.0 advisory is still read as an advisory", () => {
  it("bookmarks: 'pages BUT no bookmarks' reads NOT MET", () => {
    const r = run("bookmarks", [OLD_NO_BOOKMARKS], "pdf", 20);
    expect(r.status).toBe("not-met");
  });

  it("display-doc-title: 'viewer preference is NOT' reads NOT MET", () => {
    const r = run("display-doc-title", [
      'Document title: "2024 Annual Crime Report"',
      OLD_DISPLAYDOCTITLE_OFF,
    ]);
    expect(r.status).toBe("not-met");
  });

  it("descriptive-link-text: the un-prefixed advisory reads NOT MET", () => {
    const r = run("descriptive-link-text", [OLD_NON_DESCRIPTIVE_LINKS]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 of 9/);
  });

  it("pptx-slide-titles: 'have no title.' reads NOT MET, with the slide numbers", () => {
    const r = run("pptx-slide-titles", [OLD_PPTX_UNTITLED], "pptx");
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/slides 3, 7 have no title/i);
  });

  it("pptx-distinct-slide-titles: the un-prefixed duplicate line reads NOT MET", () => {
    const r = run("pptx-distinct-slide-titles", [OLD_PPTX_DUPLICATE_TITLES], "pptx");
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/Q3 Results/);
  });

  it("xlsx-sheet-names: the un-prefixed rename line reads NOT MET, naming the sheet", () => {
    const r = run("xlsx-sheet-names", [OLD_XLSX_RENAME], "xlsx");
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/"Sheet1"/);
  });

  it("xlsx-defined-tables: no Table anywhere reads NOT MET; xlsx-data-outside-tables defers to it (one chip, 2026-09-02)", () => {
    const findings = [XLSX_TABLE_WITNESS_ZERO, OLD_XLSX_NO_TABLE_ANYWHERE];
    expect(run("xlsx-defined-tables", findings, "xlsx").status).toBe("not-met");
    expect(run("xlsx-data-outside-tables", findings, "xlsx").status).toBe("not-applicable");
  });
});

// ===========================================================================
// S2 — pdf.ts never adopted matchMain. `matchAny` scans the RAW findings
// array, indented signal items included, and those quote the DOCUMENT'S own
// text. A PDF *about* PDF accessibility is the natural carrier.
// ===========================================================================

describe("a document's own heading text cannot forge an analyzer verdict", () => {
  // An all-generic-<H> PDF whose heading outline quotes a heading titled
  // "Why documents with no heading tags fail". Before the sweep, the quoted
  // signal item satisfied matchAny(ctx, "no heading tags") on five practices,
  // each reporting "This document has no heading tags" while the Heading Tree
  // three lines above showed H → H → H.
  const EXPLOIT = [
    "PDF/UA only — not scored: only generic <H> tags were found (not H1–H6). The headings are identifiable to assistive technology, but they carry no level, so the outline has no depth. WCAG 2.1 does not require numbered levels — your grade is not affected — but PDF/UA (clause 7.4) does.",
    "How to fix (optional): In the Tags panel, change each /H tag to a specific level (H1, H2, etc.) that matches the document outline.",
    "--- Heading Tree ---",
    "  H → H → H",
    "--- Heading Outline ---",
    '  H "Why documents with no heading tags fail"',
    '  H "Reading order and no headings were found: a field guide"',
    '  H "No tables detected in this document, and other myths"',
  ];

  it("never lets the forged 'no heading tags' text produce the no-headings N/A on any of four practices", () => {
    // heading-level-order and heading-convention ARE not-applicable on this
    // document — but only because of the REAL un-indented advisory on line
    // one (all-generic <H>, 2026-08-30 fix round 2), and they say so by
    // pointing at "Numbered heading levels". The forgery in the outline must
    // never be the reason: no practice may claim the document has no headings.
    for (const id of [
      "heading-level-order",
      "heading-convention",
      "heading-content",
      "single-h1",
    ]) {
      const r = run(id, EXPLOIT);
      expect(r.evidence.join(" "), id).not.toMatch(/has no heading tags|no headings were found/i);
    }
    for (const id of ["heading-content", "single-h1"]) {
      expect(run(id, EXPLOIT).status, id).not.toBe("not-applicable");
    }
    for (const id of ["heading-level-order", "heading-convention"]) {
      const r = run(id, EXPLOIT);
      expect(r.status, id).toBe("not-applicable");
      expect(r.evidence.join(" "), id).toMatch(/Numbered heading levels/);
    }
    // And with the real advisory removed, the forgery alone moves nothing.
    const FORGERY_ONLY = EXPLOIT.slice(2);
    for (const id of [
      "heading-level-order",
      "heading-convention",
      "heading-content",
      "single-h1",
    ]) {
      expect(run(id, FORGERY_ONLY).status, id).not.toBe("not-applicable");
    }
  });

  it("still reports the real, analyzer-stated fact for the generic headings", () => {
    expect(run("heading-numbered-levels", EXPLOIT).status).toBe("not-met");
  });

  it("does not let a quoted heading claim the document has no tables or links", () => {
    // Same shape, different category: the table-markup and link-quality
    // not-applicable lines were matchAny too.
    const tableCat = [
      "3 table(s) found in the document structure",
      "--- Table Overview ---",
      '  Table 1 caption: "No tables detected in this document, and other myths"',
    ];
    for (const id of ["table-scope-simple", "table-scope-with-headers", "nested-tables"]) {
      expect(run(id, tableCat).status, id).not.toBe("not-applicable");
    }
    const linkCat = [
      "9 link(s) assessed",
      "--- Link Details ---",
      '  "No links found in this document" → https://example.gov/a',
    ];
    for (const id of ["descriptive-link-text", "raw-url-link-text"]) {
      expect(run(id, linkCat).status, id).not.toBe("not-applicable");
    }
  });

  it("leaves no matchAny call behind in either catalog", async () => {
    // The contract in types.ts:141-151 — the sweep must not regress one
    // practice at a time. Read the sources rather than trusting a comment.
    const fs = await import("node:fs/promises");
    const url = await import("node:url");
    const path = await import("node:path");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    for (const f of ["pdf.ts", "office.ts"]) {
      const src = await fs.readFile(path.join(here, "../utils/bestPractices", f), "utf8");
      expect(src.includes("matchAny(ctx,"), f).toBe(false);
      expect(src.includes("matchNotScored(ctx,"), f).toBe(false);
    }
  });
});
