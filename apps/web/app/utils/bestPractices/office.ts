/**
 * The Word, PowerPoint, and Excel best-practice catalog.
 *
 * Six of these read "Note — not scored:" lines that only reached the
 * not-scored partition on 2026-08-30 (docx.ts:311, :316; xlsx.ts:236, :243,
 * :259, :273) — before that fix they rendered under the Tier-1 heading
 * claiming the score measures them. See findings.ts's isNotScoredFinding.
 *
 * UNLIKE THE PDF CATALOG, the Office scorers never push a "positive" line
 * unconditionally alongside an advisory — every advisory here is gated
 * behind its own independent `if (count > 0)` check with nothing pushed
 * afterward that could coexist misleadingly. There is no "ORDER IS
 * LOAD-BEARING" hazard in the sense the PDF catalog has it anywhere in
 * this file (re-verified against docx.ts/pptx.ts/xlsx.ts on 2026-08-30).
 *
 * WITNESS LINES. Most Office scorers never emit a "this is clean" positive
 * line — but several emit a CENSUS line unconditionally whenever they
 * examine a document's headings/tables/links at all, before any advisory.
 * Where such a line exists, it WITNESSES that the check ran, and:
 *
 *   MET = witness present AND no advisory for this practice
 *
 * The qualifying rule is strict: a line only counts as a witness if the
 * scorer pushes it unconditionally whenever it runs — never only on the
 * clean path, and never nested inside a branch an advisory could skip.
 * Getting this wrong reproduces the PDF catalog's heading-content
 * inversion bug (a "positive-looking" group that only ever appears once a
 * problem was already found). ORDER IS LOAD-BEARING at every witness site
 * below: a document WITH the problem emits both the witness and the
 * advisory line in the same findings array, so the advisory check must be
 * tested first, or a bad document reads as MET.
 *
 * ONE WITNESS NEEDS AN EXTRA GATE. xlsx.ts's table-markup witness
 * (`${a.tables.length} defined table(s) found.`) is pushed even at n=0 in
 * one real scenario: a workbook whose only sizable data lives on a PIVOT
 * sheet (pivots are explicitly excluded from `datafulWithoutTable`, so
 * neither table_markup advisory fires, yet zero defined tables exist).
 * `xlsx-defined-tables`'s own concern IS "does at least one table exist",
 * so — unlike its four table_markup siblings, whose concerns are
 * orthogonal to the witness's numeric value — it additionally requires the
 * witness's own count to be > 0. Skipping that gate would report a
 * workbook with literally zero defined tables as having met a practice
 * called "Data uses defined Excel Tables".
 *
 * Where no line qualifies as a witness (scorePptxSlideTitles has none for
 * "every heading is a specific level" style claims beyond its own two
 * dedicated positive lines, and no docx/pptx/xlsx scorer has anything
 * beyond what is used below), the practice keeps reporting NOT MET, NOT
 * APPLICABLE, or NOT CHECKED only — an unqualified witness is worse than
 * none, because it produces exactly this inverted gate.
 */
import {
  firstNumber,
  matchAny,
  matchNotScored,
  type BestPractice,
  type BestPracticeResult,
  type DetectContext,
} from "./types";

const notChecked = (why: string): BestPracticeResult => ({
  status: "not-checked",
  evidence: [why],
});

/** NOT CHECKED when the whole category is absent from this report — a
 *  forged/corrupted stored report, an archived payload predating this
 *  category, or any other reason the DATA is missing. A fresh analysis
 *  always emits every DOCX/PPTX/XLSX category (buildDocxCategories /
 *  buildPptxCategories / buildXlsxCategories), so absence is never evidence
 *  the document itself has none of the subject matter — that is a document
 *  FACT, established separately at each call site from the analyzer's own
 *  "No <thing> were/was found" line. Mirrors pdf.ts's categoryAbsent(). */
function categoryAbsent(ctx: DetectContext): boolean {
  return !ctx.categoryPresent;
}

const OFFICE_FIX_APP =
  "Office documents are fixed at the source, not after export — make the change and re-export (or re-save) the file.";

export const OFFICE_PRACTICES: BestPractice[] = [
  // =========================================================================
  // WORD
  // =========================================================================
  {
    id: "docx-first-heading-is-h1",
    formats: ["docx"],
    categoryId: "heading_structure",
    label: "Outline starts at Heading 1",
    description:
      "A document's first heading-styled paragraph can be any level, but starting at Heading 1 gives the outline a single, top-level root.",
    why: "Someone navigating by heading builds a mental map of the document from its levels. If the outline starts partway down — at Heading 3, say — there is no top-level entry point, which reads as though an earlier section is missing.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no heading-structure data for this document.");
      }
      const line = matchNotScored(ctx, "the first heading is heading");
      if (line) {
        const level = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            level !== null
              ? `This document's outline starts at Heading ${level}, not Heading 1.`
              : "This document's first heading is not Heading 1.",
            "That gives the outline more than one possible starting point.",
          ],
          fix: {
            source:
              "In Word, apply the Heading 1 style to the document's first heading-styled paragraph, or promote the outline so it begins there.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no headings were found")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no headings, so there is no first heading to check."],
        };
      }
      // ORDER IS LOAD-BEARING: docx.ts:162 pushes "N real heading(s) found."
      // unconditionally whenever total > 0, before the first-heading check
      // (:167) even runs — so a document whose first heading is NOT
      // Heading 1 carries BOTH lines. The advisory check above must win, or
      // a document that fails this practice would read MET here.
      if (matchAny(ctx, "real heading(s) found")) {
        return {
          status: "met",
          evidence: ["This document's headings were checked, and its outline starts at Heading 1."],
        };
      }
      return notChecked("This report contains no finding about this document's first heading.");
    },
  },
  {
    id: "docx-heading-skips",
    formats: ["docx"],
    categoryId: "heading_structure",
    label: "Heading levels do not skip",
    description:
      "Headings should step down one level at a time — Heading 1, then Heading 2, then Heading 3 — rather than jumping a level.",
    why: "A skipped level reads as a missing section to someone navigating by heading: they cannot tell whether they missed something or the document simply has a gap.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no heading-structure data for this document.");
      }
      const line = matchNotScored(ctx, "skip a heading level");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n !== null
              ? `This document has ${n} place${n === 1 ? "" : "s"} where the heading levels skip a step (for example, Heading 1 straight to Heading 3).`
              : "This document has at least one place where the heading levels skip a step.",
            "Screen-reader users may wonder what they missed at the skipped level.",
          ],
          fix: {
            source:
              "In Word, apply heading styles in order — do not jump from Heading 1 to Heading 3 — so each section steps down one level at a time.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no headings were found")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no headings, so there is no level order to check."],
        };
      }
      // ORDER IS LOAD-BEARING: docx.ts:162 pushes "N real heading(s) found."
      // unconditionally whenever total > 0, before the skip count is even
      // computed (:172-176) — so a document with a skip carries BOTH lines.
      // The advisory check above must win, or a skipped document would read
      // MET here.
      if (matchAny(ctx, "real heading(s) found")) {
        return {
          status: "met",
          evidence: ["This document's headings were checked, and none of the levels skip a step."],
        };
      }
      return notChecked(
        "This report contains no finding about this document's heading level order.",
      );
    },
  },
  {
    id: "docx-empty-headings",
    formats: ["docx"],
    categoryId: "heading_structure",
    label: "No empty headings",
    description:
      "A paragraph styled as a heading should hold heading text — not sit empty, kept only for spacing.",
    why: "A heading tag with no text is silence: a screen-reader user who jumps to it hears nothing, and it clutters the outline everyone navigates by.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no heading-structure data for this document.");
      }
      const line = matchNotScored(ctx, "empty heading-styled paragraph");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n !== null
              ? `This document has ${n} empty Heading-styled paragraph${n === 1 ? "" : "s"} — a paragraph tagged as a heading with no text in it.`
              : "This document has at least one empty Heading-styled paragraph — a paragraph tagged as a heading with no text in it.",
            "Each one is announced as a heading with nothing to say, and it clutters the outline someone would navigate by.",
          ],
          fix: {
            source:
              "In Word, delete the empty heading-styled paragraphs and use paragraph spacing (Layout → Spacing) for blank space instead.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no headings were found")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no headings, so there are no empty headings to check."],
        };
      }
      // ORDER IS LOAD-BEARING: docx.ts:162's witness is pushed whenever
      // total > 0, which is a SUFFICIENT (not necessary) condition for the
      // empty-heading check (:182) to have run too — that check sits past
      // the SAME early-return guard the witness does, just outside the
      // `if (total > 0)` block. A document with empty headings carries both
      // lines, so the advisory check above must win.
      if (matchAny(ctx, "real heading(s) found")) {
        return {
          status: "met",
          evidence: ["This document's headings were checked, and none of them is empty."],
        };
      }
      return notChecked("This report contains no finding about empty headings in this document.");
    },
  },
  {
    id: "docx-empty-paragraph-runs",
    formats: ["docx"],
    categoryId: "text_extractability",
    label: "No long runs of blank paragraphs",
    description:
      "Blank space between sections should come from paragraph spacing, not three or more empty paragraphs typed in a row.",
    why: "A screen reader announces each blank paragraph individually while moving through the document — a long run of them is dead air someone has to sit through.",
    links: [],
    detect(ctx) {
      const line = matchNotScored(ctx, "consecutive empty paragraphs");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n !== null
              ? `This document has ${n} place${n === 1 ? "" : "s"} with three or more consecutive empty paragraphs used as blank spacing.`
              : "This document has at least one run of three or more consecutive empty paragraphs used as blank spacing.",
            "A screen reader announces each of those blank lines individually while moving through the document.",
          ],
          fix: {
            source:
              "In Word, delete the empty paragraphs and use paragraph spacing (Layout → Spacing, Before/After) for blank space instead.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      // ORDER IS LOAD-BEARING: docx.ts's text_extractability finding is a
      // single straight-line function — the witness sentence below is
      // ALWAYS findings[0], and the empty-paragraph-run check (the only
      // conditional in the function) always runs right after it, with no
      // early return anywhere. A document with the problem therefore
      // carries both lines, so the advisory check above must win.
      if (matchAny(ctx, "fully extractable, selectable text")) {
        return {
          status: "met",
          evidence: [
            "This document's paragraphs were checked, and none has three or more consecutive empty ones.",
          ],
        };
      }
      // No N/A branch: scoreDocxText has no "no paragraphs" concept — a
      // Word document always has text, and this witness is always present
      // whenever the category itself is (there is no other code path).
      return notChecked(
        "This report contains no finding about blank paragraph spacing in this document.",
      );
    },
  },
  {
    id: "docx-layout-grids",
    formats: ["docx"],
    categoryId: "table_markup",
    label: "Bare layout grids reviewed",
    description:
      "A table-shaped grid with no table style, borders, shading, or header marks anywhere is usually a layout construct rather than a data table — worth a quick check that none of them actually holds data.",
    why: "A screen reader announces a real data table's header with each cell. A layout grid does not need one — but it is easy to build a genuine data table without ever applying a table style, which would leave it looking identical to a layout grid in the file.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no table-markup data for this document.");
      }
      const line = matchNotScored(ctx, "bare grid");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n !== null
              ? `This document has ${n} bare grid${n === 1 ? "" : "s"} — a table-shaped layout with no table style, borders, shading, or header marks anywhere.`
              : "This document has at least one bare grid — a table-shaped layout with no table style, borders, shading, or header marks anywhere.",
            "These usually hold layout content rather than data, so a header row is not expected — but it is worth checking that none of them is really a data table someone forgot to style.",
          ],
          fix: {
            source:
              "If a flagged grid genuinely holds data, apply a table style and mark its header row (Table Layout → Repeat Header Rows) in Word. If it is layout only, no change is needed.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no tables were found")) {
        return { status: "not-applicable", evidence: ["This document has no tables."] };
      }
      // ORDER IS LOAD-BEARING: docx.ts:290 pushes "N table(s) found."
      // unconditionally whenever any tables exist, before the bare-grid
      // check (:296) even runs — so a document with a bare grid carries
      // both lines. The advisory check above must win.
      if (matchAny(ctx, "table(s) found")) {
        return {
          status: "met",
          evidence: ["This document's tables were checked, and none is a bare, unstyled grid."],
        };
      }
      return notChecked(
        "This report contains no finding about bare layout grids in this document.",
      );
    },
  },
  {
    id: "docx-nested-tables",
    formats: ["docx"],
    categoryId: "table_markup",
    label: "No nested tables",
    description: "A table should not contain another table nested inside one of its cells.",
    why: "A nested table is genuinely difficult to navigate by keyboard or by screen reader, one table inside another, even where both are properly built.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no table-markup data for this document.");
      }
      if (matchNotScored(ctx, "nested tables were found")) {
        return {
          status: "not-met",
          evidence: [
            "At least one table in this document contains another table nested inside it.",
            "Nested tables are hard to navigate with a keyboard or a screen reader.",
          ],
          fix: {
            source:
              "In Word, flatten the nested table into the parent table, or split it out as its own separate table.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no tables were found")) {
        return { status: "not-applicable", evidence: ["This document has no tables."] };
      }
      // ORDER IS LOAD-BEARING: docx.ts:290's witness is pushed whenever any
      // tables exist, before the nested-table check (:303) even runs — a
      // document with a nested table carries both lines. The advisory
      // check above must win.
      if (matchAny(ctx, "table(s) found")) {
        return {
          status: "met",
          evidence: [
            "This document's tables were checked, and none contains another table nested inside it.",
          ],
        };
      }
      return notChecked("This report contains no finding about nested tables in this document.");
    },
  },
  {
    id: "docx-merged-cells",
    formats: ["docx"],
    categoryId: "table_markup",
    label: "Merged and split table cells",
    description:
      "A merged cell spans more than one row or column, so the grid a screen reader walks no longer matches the grid a sighted reader sees.",
    why: "Someone listening to a table moves cell by cell and hears each one announced with its headers. Where cells are merged, that announcement can name the wrong header or skip a position entirely. Whether it actually causes trouble depends on where the merge sits, which is why this is reported for review rather than counted.",
    // No standard is cited: no WCAG criterion and no PDF/UA clause forbids a
    // merged cell. Microsoft's own checker flags them, and that is the whole
    // basis — say so in `why`, claim nothing more.
    links: [],
    detect(ctx) {
      // categoryAbsent is checked separately from (and before) the "no
      // tables" line below: a missing category is a missing-DATA fact, never
      // "this document has no tables" — a document fact. Conflating the two
      // would let a forged/archived report with table_markup missing
      // entirely be reported as "this document has no tables", which is a
      // claim about the DOCUMENT this report never actually made. See
      // pdf.ts's categoryAbsent() doctrine comment.
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no table-markup data for this document.");
      }
      const line = matchNotScored(ctx, "merged cell(s) across the table");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n === null
              ? "This document contains merged or split table cells."
              : `This document has ${n} merged cell${n === 1 ? "" : "s"} across its tables.`,
            "Check each one with a screen reader: confirm every data cell is still announced with the header that belongs to it.",
          ],
          fix: {
            source:
              "In Word, select the merged cell and choose Layout → Split Cells, so each row has one cell per column. Where the merge is a visual grouping rather than data, consider splitting the table in two.",
            app: "Merged cells cannot be reliably unpicked after export — fix this in the Word file and re-export.",
          },
        };
      }
      if (matchAny(ctx, "no tables were found")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no tables."],
        };
      }
      // ORDER IS LOAD-BEARING: docx.ts:290's witness is pushed whenever any
      // tables exist, before the merged-cell total is even computed (:308).
      // A document with merged cells carries both lines, so the advisory
      // check above must win — this is the SAME hazard as the PDF
      // catalog's heading-content bug, just for a different category.
      if (matchAny(ctx, "table(s) found")) {
        return {
          status: "met",
          evidence: ["This document's tables were checked, and none use merged or split cells."],
        };
      }
      return notChecked("This document has tables, but they were not checked for merged cells.");
    },
  },
  {
    id: "docx-empty-table-rows",
    formats: ["docx"],
    categoryId: "table_markup",
    label: "No entirely empty table rows",
    description:
      "Blank space inside a table should come from cell padding or table spacing, not a row left entirely empty.",
    why: "A screen reader announces an empty row as an empty row while moving through the table — it is dead air someone has to sit through, row by row.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no table-markup data for this document.");
      }
      const line = matchNotScored(ctx, "entirely empty table row");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n !== null
              ? `This document has ${n} entirely empty table row${n === 1 ? "" : "s"} — a blank row kept only for spacing.`
              : "This document has at least one entirely empty table row — a blank row kept only for spacing.",
            "A screen reader announces each one as an empty row while moving through the table.",
          ],
          fix: {
            source:
              "In Word, delete the empty table rows and use cell padding or table spacing (Table Layout → Cell Margins) for visual space instead.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no tables were found")) {
        return { status: "not-applicable", evidence: ["This document has no tables."] };
      }
      // ORDER IS LOAD-BEARING: docx.ts:290's witness is pushed whenever any
      // tables exist, before the empty-row count is even computed (:314).
      // A document with an empty row carries both lines, so the advisory
      // check above must win.
      if (matchAny(ctx, "table(s) found")) {
        return {
          status: "met",
          evidence: ["This document's tables were checked, and none has an entirely empty row."],
        };
      }
      return notChecked("This report contains no finding about empty table rows in this document.");
    },
  },
  {
    id: "docx-raw-url-link-text",
    formats: ["docx"],
    categoryId: "link_quality",
    label: "Link text is not a raw URL",
    description:
      "A link's visible text can be the destination address itself, but a short descriptive label reads better in a list of links.",
    why: "A raw URL as link text does tell a screen reader where a link goes, so this already meets the letter of the rule — a descriptive label is simply easier to listen to in a list of many links.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no link-quality data for this document.");
      }
      const line = matchNotScored(ctx, "raw url as their visible text");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n !== null
              ? `${n} link(s) in this document use the raw web address as their visible text.`
              : "Some links in this document use the raw web address as their visible text.",
            "This already tells a screen reader where the link goes — a descriptive label is a readability nicety, not a fix for a failure.",
          ],
          fix: {
            source:
              "In Word, select the link and change its visible text to a short label describing the destination.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no hyperlinks were found")) {
        return { status: "not-applicable", evidence: ["This document has no links."] };
      }
      // ORDER IS LOAD-BEARING: docx.ts's link witness ("N link(s) found; N
      // with unclear text.") is pushed unconditionally whenever any links
      // exist, before the raw-URL check (:359) even runs. A document with
      // raw-URL links carries both lines, so the advisory check above must
      // win.
      if (matchAny(ctx, "link(s) found")) {
        return {
          status: "met",
          evidence: [
            "This document's links were checked, and none uses a raw web address as its visible text.",
          ],
        };
      }
      return notChecked(
        "This report contains no finding about raw web addresses used as link text in this document.",
      );
    },
  },

  // =========================================================================
  // POWERPOINT
  // =========================================================================
  {
    id: "pptx-slide-titles",
    formats: ["pptx"],
    categoryId: "slide_titles",
    label: "Every slide has a title",
    description:
      "Each slide should carry a title in its title placeholder — PowerPoint's equivalent of a heading.",
    why: "A slide's title placeholder is what lets a screen-reader user tell slides apart and jump straight to one, building a navigable outline of the whole deck. A slide can still carry its heading text in a body placeholder instead, which is why this is reported rather than counted.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no slide-title data for this presentation.");
      }
      const line = matchNotScored(ctx, "no title placeholder");
      if (line) {
        // pptx.ts:154 — the evidence is a LIST of slide numbers ("slides 3,
        // 7, 12"), never a count: firstNumber would silently return only
        // the first. Lift the already-correctly-conjugated clause straight
        // out of the analyzer's own line instead of re-deriving grammar.
        const phrase =
          /slides?\s+[\d,\s]+\s+(?:has|have)\s+no title placeholder/i.exec(line)?.[0] ?? null;
        return {
          status: "not-met",
          evidence: [
            phrase
              ? `This presentation's ${phrase}.`
              : "At least one slide in this presentation has no title placeholder.",
            "A slide can still carry its heading in a body placeholder, but a title placeholder is what gives screen-reader users a navigable outline of the whole presentation.",
          ],
          fix: {
            source:
              "In PowerPoint, use the Outline view (View → Outline) or choose a slide layout with a title placeholder, then add a title to each flagged slide.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no slides were found")) {
        return { status: "not-applicable", evidence: ["This presentation has no slides."] };
      }
      if (matchAny(ctx, "have a distinct title")) {
        return {
          status: "met",
          evidence: ["Every visible slide in this presentation has a title."],
        };
      }
      return notChecked("This report contains no finding about slide titles in this presentation.");
    },
  },
  {
    id: "pptx-distinct-slide-titles",
    formats: ["pptx"],
    categoryId: "slide_titles",
    label: "Slide titles are distinct",
    description:
      "Where two or more slides share the exact same title, a screen-reader user browsing the outline cannot tell them apart.",
    why: "A distinct, descriptive title on each slide is what lets someone using a screen reader tell slides apart while browsing the outline instead of opening each one to check.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no slide-title data for this presentation.");
      }
      // pptx.ts:168 is pushed once PER duplicate-title group (mirrors
      // xlsx.ts:171's per-sheet push) — matchNotScored would return only the
      // first group. Collect every matching line so a deck with several
      // different repeated titles reports all of them, not just one.
      const dupLines = ctx.notScored.filter((l) => /slides? share the title "/i.test(l));
      if (dupLines.length > 0) {
        const titles = dupLines
          .map((l) => /share the title "([^"]+)"/.exec(l)?.[1])
          .filter((t): t is string => Boolean(t));
        return {
          status: "not-met",
          evidence: [
            titles.length > 0
              ? `More than one slide in this presentation shares the same title: ${titles.map((t) => `"${t}"`).join(", ")}.`
              : "More than one slide in this presentation shares the same title.",
            "A distinct title on each slide helps someone using a screen reader tell slides apart while browsing the outline.",
          ],
          fix: {
            source:
              'In PowerPoint, give each slide its own descriptive title, even where the content is similar (for example, "Q3 Results — Revenue" and "Q3 Results — Costs" instead of two slides both titled "Q3 Results").',
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no slides were found")) {
        return { status: "not-applicable", evidence: ["This presentation has no slides."] };
      }
      if (matchAny(ctx, "have a distinct title")) {
        return {
          status: "met",
          evidence: ["No two visible slides in this presentation share the same title."],
        };
      }
      return notChecked(
        "This report contains no finding about duplicate slide titles in this presentation.",
      );
    },
  },
  {
    id: "pptx-raw-url-link-text",
    formats: ["pptx"],
    categoryId: "link_quality",
    label: "Link text is not a raw URL",
    description:
      "A link's visible text can be the destination address itself, but a short descriptive label reads better in a list of links.",
    why: "A raw URL as link text does tell a screen reader where a link goes, so this already meets the letter of the rule — a descriptive label is simply easier to listen to in a list of many links.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no link-quality data for this presentation.");
      }
      const line = matchNotScored(ctx, "raw url as their visible text");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n !== null
              ? `${n} link(s) in this presentation use the raw web address as their visible text.`
              : "Some links in this presentation use the raw web address as their visible text.",
            "This already tells a screen reader where the link goes — a descriptive label is a readability nicety, not a fix for a failure.",
          ],
          fix: {
            source:
              "In PowerPoint, select the linked text and change it to a short label describing the destination.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no hyperlinks were found")) {
        return { status: "not-applicable", evidence: ["This presentation has no links."] };
      }
      // ORDER IS LOAD-BEARING: pptx.ts's link witness ("N link(s) found; N
      // with unclear text.") is pushed unconditionally whenever any links
      // exist, before the raw-URL check (:472) even runs. A presentation
      // with raw-URL links carries both lines, so the advisory check above
      // must win.
      if (matchAny(ctx, "link(s) found")) {
        return {
          status: "met",
          evidence: [
            "This presentation's links were checked, and none uses a raw web address as its visible text.",
          ],
        };
      }
      return notChecked(
        "This report contains no finding about raw web addresses used as link text in this presentation.",
      );
    },
  },

  // =========================================================================
  // EXCEL
  // =========================================================================
  {
    id: "xlsx-sheet-names",
    formats: ["xlsx"],
    categoryId: "sheet_names",
    label: "Descriptive sheet names",
    description:
      'A worksheet\'s name should describe its contents — not sit at an Excel default like "Sheet1".',
    why: "Sheet names are the workbook's navigation. A screen-reader user hears them announced when switching sheets, so a default name gives no clue what is on it.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no sheet-name data for this workbook.");
      }
      // xlsx.ts:171 is pushed once PER default-named sheet — matchNotScored
      // would return only the first. Collect every match, and never call
      // firstNumber on it: the evidence is the sheet's own NAME (quoted),
      // and a default name like "Sheet1" would make firstNumber return 1 as
      // if it were a count.
      const renameLines = ctx.notScored.filter((l) =>
        /rename "[^"]+" to describe its contents/i.test(l),
      );
      if (renameLines.length > 0) {
        const names = renameLines
          .map((l) => /rename "([^"]+)" to describe its contents/i.exec(l)?.[1])
          .filter((n): n is string => Boolean(n));
        return {
          status: "not-met",
          evidence: [
            names.length > 0
              ? `This workbook has ${names.length} sheet${names.length === 1 ? "" : "s"} with a default name that does not describe its contents: ${names.map((n) => `"${n}"`).join(", ")}.`
              : "This workbook has at least one sheet with a default name that does not describe its contents.",
            "Sheet names are the workbook's navigation — a screen-reader user hears them when switching sheets.",
          ],
          fix: {
            source:
              'In Excel, double-click each sheet tab and replace the default name (such as "Sheet1") with one that describes what the sheet holds.',
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no visible sheets were found")) {
        return { status: "not-applicable", evidence: ["This workbook has no visible sheets."] };
      }
      if (matchAny(ctx, "visible sheet(s) have descriptive names")) {
        return {
          status: "met",
          evidence: ["Every visible sheet in this workbook has a descriptive name."],
        };
      }
      return notChecked("This report contains no finding about sheet names in this workbook.");
    },
  },
  {
    id: "xlsx-defined-tables",
    formats: ["xlsx"],
    categoryId: "table_markup",
    label: "Data uses defined Excel Tables",
    description:
      "Sizable data laid out as a real Excel Table (with a header row) lets a screen reader announce the right column header while moving across cells — a plain range of typed cells carries no such structure.",
    why: "Whether a given range is really a data table is a judgment call a person has to make, which is why this is reported rather than counted — but where it is, a defined Table is what gives it structure a screen reader can use.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no table-markup data for this workbook.");
      }
      if (matchNotScored(ctx, "no defined excel table anywhere")) {
        return {
          status: "not-met",
          evidence: [
            "This workbook has sizable data laid out in plain cell ranges, with no defined Excel Table anywhere.",
            "A defined Table lets a screen reader announce the right column header while moving across cells; a plain range does not.",
          ],
          fix: {
            source:
              "In Excel, select a data range and choose Insert → Table to give it a defined structure with headers.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no tables or sizable data ranges were found")) {
        return {
          status: "not-applicable",
          evidence: ["This workbook has no tables or sizable data ranges."],
        };
      }
      // ORDER IS LOAD-BEARING: xlsx.ts:207's witness ("N defined table(s)
      // found.") is pushed unconditionally whenever the early return is not
      // taken, before the no-defined-table advisory (:225) even runs. The
      // advisory check above must win.
      //
      // EXTRA GATE, deliberately: this witness line is pushed even at n=0
      // in one real scenario the advisory check above does NOT catch — a
      // workbook whose only sizable data lives on a pivot sheet. Pivot
      // sheets are excluded from `datafulWithoutTable` (xlsx.ts:222-224),
      // so neither table_markup advisory fires, yet a.tables.length is
      // genuinely 0. Unlike its four table_markup siblings below, THIS
      // practice's own concern is "does at least one table exist" — the
      // witness's numeric value, not just its presence — so it must also
      // require that value to be > 0, or a workbook with zero defined
      // tables would read MET.
      const tableWitness = matchAny(ctx, "defined table(s) found");
      if (tableWitness) {
        const n = firstNumber(tableWitness);
        if (n !== null && n > 0) {
          return {
            status: "met",
            evidence: [
              "This workbook's data was checked, and it uses at least one defined Excel Table.",
            ],
          };
        }
      }
      // NOTE: falls through to NOT CHECKED (never MET) when the witness is
      // present but its count is 0 — the pivot-only-workbook case above.
      return notChecked("This report contains no finding about defined tables in this workbook.");
    },
  },
  {
    id: "xlsx-data-outside-tables",
    formats: ["xlsx"],
    categoryId: "table_markup",
    label: "No sizable data outside a table",
    description:
      "Where at least one Excel Table already exists, other sizable data on the same workbook should also sit inside a defined Table rather than a plain range.",
    why: "A screen reader can announce column headers while a reader moves across a defined Table's cells, but not across a plain, unstructured range sitting next to it.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no table-markup data for this workbook.");
      }
      if (matchNotScored(ctx, "sits outside the defined table")) {
        return {
          status: "not-met",
          evidence: [
            "This workbook has data sitting outside its defined table(s), as plain cell ranges.",
            "A screen reader can announce column headers while moving across a defined Table, but not across a plain range.",
          ],
          fix: {
            source:
              "In Excel, select the data range outside the existing table(s) and choose Insert → Table.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no tables or sizable data ranges were found")) {
        return {
          status: "not-applicable",
          evidence: ["This workbook has no tables or sizable data ranges."],
        };
      }
      // ORDER IS LOAD-BEARING: xlsx.ts:207's witness is pushed unconditionally
      // whenever the early return is not taken, before the data-outside-
      // tables check (:225-238) even runs. The advisory check above must
      // win. Unlike xlsx-defined-tables, this practice's concern (is data
      // sitting OUTSIDE a table) is orthogonal to the witness's own numeric
      // value — the evidence copy below deliberately mirrors the code's own
      // definition (pivot sheets are excluded from this specific check by
      // design, so "no data sits outside a defined Table" is accurate
      // exactly whenever the advisory is silent, regardless of how many
      // defined tables exist).
      if (matchAny(ctx, "defined table(s) found")) {
        return {
          status: "met",
          evidence: [
            "This workbook's sheets were checked, and none has sizable data sitting outside a defined Table.",
          ],
        };
      }
      return notChecked(
        "This report contains no finding about data outside defined tables in this workbook.",
      );
    },
  },
  {
    id: "xlsx-pivot-tables",
    formats: ["xlsx"],
    categoryId: "table_markup",
    label: "Pivot tables reviewed manually",
    description:
      "A pivot table cannot be converted into a defined Excel Table, so its readability for a screen-reader user has to be checked by hand.",
    why: "A defined Table's header association does not apply to a pivot table's own layout — someone has to confirm by hand, for example with a screen reader, that a pivot reads sensibly from top to bottom.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no table-markup data for this workbook.");
      }
      const line = matchNotScored(ctx, "contain pivot tables");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n !== null
              ? `This workbook has ${n} sheet${n === 1 ? "" : "s"} containing a pivot table.`
              : "This workbook has at least one sheet containing a pivot table.",
            "Pivot tables cannot become defined Excel Tables — check their readability manually, for example with a screen reader.",
          ],
          fix: {
            source:
              "No structural fix applies — pivot tables are a different Excel feature from defined Tables. Review each pivot's layout for a reader moving through it top to bottom.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no tables or sizable data ranges were found")) {
        return {
          status: "not-applicable",
          evidence: ["This workbook has no tables or sizable data ranges."],
        };
      }
      // ORDER IS LOAD-BEARING: xlsx.ts:207's witness is pushed unconditionally
      // whenever the early return is not taken, before the pivot-sheet
      // check (:240-247) even runs. A workbook with a pivot sheet carries
      // both lines, so the advisory check above must win. This practice's
      // concern (are there pivot sheets) is computed from `a.sheets`
      // directly and is independent of the witness's own numeric value.
      if (matchAny(ctx, "defined table(s) found")) {
        return {
          status: "met",
          evidence: [
            "This workbook's sheets were checked, and none contains a pivot table needing manual review.",
          ],
        };
      }
      return notChecked("This report contains no finding about pivot tables in this workbook.");
    },
  },
  {
    id: "xlsx-data-start",
    formats: ["xlsx"],
    categoryId: "table_markup",
    label: "Data starts near cell A1",
    description:
      "A sheet's data should begin at or near cell A1, not several empty rows or columns in.",
    why: "A screen reader lands at cell A1 when it opens a sheet. Empty leading rows or columns are dead space someone has to move through before reaching anything real.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no table-markup data for this workbook.");
      }
      const line = matchNotScored(ctx, "data begins at row");
      if (line) {
        // Never call firstNumber here: a quoted SHEET NAME sits before the
        // row/column numbers in this line, and a name containing a digit
        // (e.g. a default "Sheet1") would be picked up as if it were the
        // row or column count. Extract the named triples explicitly.
        const matches = [...line.matchAll(/"([^"]+)" data begins at row (\d+), column (\d+)/g)];
        const parts = matches.map((m) => `"${m[1]}" (row ${m[2]}, column ${m[3]})`);
        return {
          status: "not-met",
          evidence: [
            parts.length > 0
              ? `This workbook's data starts well away from cell A1 on ${parts.join("; ")}.`
              : "This workbook's data starts well away from cell A1 on at least one sheet.",
            "A screen reader lands at A1 when it opens a sheet, so empty leading rows or columns are dead space to move through before reaching anything real.",
          ],
          fix: {
            source:
              "In Excel, move the sheet's data so it starts at or near cell A1 — cut the blank leading rows or columns.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no tables or sizable data ranges were found")) {
        return {
          status: "not-applicable",
          evidence: ["This workbook has no tables or sizable data ranges."],
        };
      }
      // ORDER IS LOAD-BEARING: xlsx.ts:207's witness is pushed unconditionally
      // whenever the early return is not taken, before the far-start check
      // (:251-268) even runs. A workbook with a far-start sheet carries
      // both lines, so the advisory check above must win. This check
      // applies uniformly to every dataful sheet, pivot or not, so it is
      // independent of the witness's own numeric value.
      if (matchAny(ctx, "defined table(s) found")) {
        return {
          status: "met",
          evidence: [
            "This workbook's sheets were checked, and each one's data starts at or near cell A1.",
          ],
        };
      }
      return notChecked("This report contains no finding about where this workbook's data starts.");
    },
  },
  {
    id: "xlsx-merged-cells",
    formats: ["xlsx"],
    categoryId: "table_markup",
    label: "Merged cells reviewed",
    description:
      "A merged cell spans more than one row or column, so the grid a screen reader walks no longer matches the grid a sighted reader sees.",
    why: "Someone listening to a sheet moves cell by cell. Where cells are merged, that can confuse navigation — whether it actually causes trouble depends on where the merge sits, which is why this is reported for review rather than counted.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no table-markup data for this workbook.");
      }
      const line = matchNotScored(ctx, "contain merged cells");
      if (line) {
        const n = firstNumber(line);
        const detail = [...line.matchAll(/"([^"]+)":\s*(\d+)/g)].map(
          ([, name, count]) => `"${name}" (${count})`,
        );
        return {
          status: "not-met",
          evidence: [
            n !== null
              ? `This workbook has ${n} sheet${n === 1 ? "" : "s"} containing merged cells${detail.length ? `: ${detail.join(", ")}` : ""}.`
              : "This workbook has at least one sheet containing merged cells.",
            "Merged cells can confuse screen-reader navigation. Whether they cause real trouble depends on where they sit — worth a manual check.",
          ],
          fix: {
            source:
              "In Excel, select the merged cell and choose Merge & Center (or Unmerge Cells) to split it back into one cell per row and column, where the merge is not purely visual.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no tables or sizable data ranges were found")) {
        return {
          status: "not-applicable",
          evidence: ["This workbook has no tables or sizable data ranges."],
        };
      }
      // ORDER IS LOAD-BEARING: xlsx.ts:207's witness is pushed unconditionally
      // whenever the early return is not taken, before the merged-cell
      // check (:270-279) even runs. A workbook with merged cells carries
      // both lines, so the advisory check above must win. This check
      // applies to every sheet directly (no pivot carve-out), so it is
      // independent of the witness's own numeric value.
      if (matchAny(ctx, "defined table(s) found")) {
        return {
          status: "met",
          evidence: ["This workbook's sheets were checked, and none contains merged cells."],
        };
      }
      return notChecked("This report contains no finding about merged cells in this workbook.");
    },
  },
  {
    id: "xlsx-raw-url-link-text",
    formats: ["xlsx"],
    categoryId: "link_quality",
    label: "Link text is not a raw URL",
    description:
      "A link's visible text can be the destination address itself, but a short descriptive label reads better in a list of links.",
    why: "A raw URL as link text does tell a screen reader where a link goes, so this already meets the letter of the rule — a descriptive label is simply easier to listen to in a list of many links.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no link-quality data for this workbook.");
      }
      const line = matchNotScored(ctx, "raw url as their visible text");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n !== null
              ? `${n} link(s) in this workbook use the raw web address as their visible text.`
              : "Some links in this workbook use the raw web address as their visible text.",
            "This already tells a screen reader where the link goes — a descriptive label is a readability nicety, not a fix for a failure.",
          ],
          fix: {
            source:
              "In Excel, right-click the cell's link and change its display text to a short label describing the destination.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchAny(ctx, "no hyperlinks were found")) {
        return { status: "not-applicable", evidence: ["This workbook has no links."] };
      }
      // ORDER IS LOAD-BEARING: xlsx.ts's link witness ("N link(s) assessed;
      // N with unclear text.") is pushed unconditionally whenever any
      // links are assessable, before the raw-URL check (:448) even runs. A
      // workbook with raw-URL links carries both lines, so the advisory
      // check above must win.
      if (matchAny(ctx, "link(s) assessed")) {
        return {
          status: "met",
          evidence: [
            "This workbook's links were checked, and none uses a raw web address as its visible text.",
          ],
        };
      }
      return notChecked(
        "This report contains no finding about raw web addresses used as link text in this workbook.",
      );
    },
  },
];
