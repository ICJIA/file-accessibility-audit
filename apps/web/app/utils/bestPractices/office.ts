/**
 * The Word, PowerPoint, and Excel best-practice catalog.
 *
 * Six of these read "Note — not scored:" lines that only reached the
 * not-scored partition on 2026-08-30 (docx.ts:311, :316; xlsx.ts:236, :243,
 * :259, :273) — before that fix they rendered under the Tier-1 heading
 * claiming the score measures them. See findings.ts's isNotScoredFinding.
 *
 * WITNESS LINES. Most Office scorers never emit a "this is clean" positive
 * line — but several emit a CENSUS line unconditionally whenever they
 * examine a document's headings/tables/links at all, before any advisory.
 * Where such a line exists, it WITNESSES that the check ran, and:
 *
 *   MET = witness present AND no advisory for this practice
 *
 * THAT RULE HAS TWO HALVES, and both false-green bugs this catalog has
 * actually shipped turned on the SECOND one.
 *
 * FIRST HALF — THE WITNESS MUST BE UNCONDITIONAL. A line only counts as a
 * witness if the scorer pushes it whenever it runs — never only on the
 * clean path, and never nested inside a branch an advisory could skip.
 * Getting this wrong reproduces the PDF catalog's heading-content
 * inversion bug (a "positive-looking" group that only ever appears once a
 * problem was already found).
 *
 * SECOND HALF — THE ADVISORY MUST BE UNCONDITIONAL TOO. "No advisory" only
 * means "no defect" if the scorer emits that exact advisory for EVERY
 * document carrying the defect. Two shapes of suppression have each cost a
 * real false MET here:
 *
 *   - NESTED UNDER AN UNRELATED CONDITION. pdf.ts's list-labels keyed MET
 *     off the absence of supplementary.ts:200-206's "<Lbl>" advisory —
 *     which is pushed only inside `if (wellFormed === qpdf.lists.length)`,
 *     a check about <LBody> that ignores <Lbl> entirely (qpdfService.ts
 *     :1561's own comment: "<Lbl> is deliberately NOT required"). A
 *     malformed list that ALSO lacked <Lbl> took the sibling else-branch,
 *     emitted no advisory at all, and read MET.
 *   - MUTUALLY EXCLUSIVE WITH A SIBLING ADVISORY. xlsx.ts:225-238 is
 *     `if (datafulWithoutTable && a.tables.length === 0) { …"no defined
 *     Excel Table anywhere"… } else if (datafulWithoutTable) { …"sits
 *     outside the defined table(s)"… }`. xlsx-data-outside-tables matched
 *     only the second, so a workbook with data and ZERO tables fired the
 *     first, never the second, and its witness alone read MET — claiming
 *     nothing sat outside a Table in a workbook where all of it did. This
 *     shape is INVISIBLE to a nesting check: the advisory is not nested
 *     under anything, it just loses an `else if`.
 *
 * So the test is NOT "is this advisory's own `if` unconditional". It is:
 * FOR EVERY DOCUMENT WHERE THIS DEFECT EXISTS, DOES THIS EXACT STRING GET
 * PUSHED? Answer it from the scorer's control flow read end to end — the
 * advisory's own condition is only one branch of it.
 *
 * ORDER IS LOAD-BEARING at every witness site
 * below: docx.ts:290 and xlsx.ts:207 (this file's two busiest witnesses)
 * are pushed unconditionally alongside EVERY advisory in their category —
 * a document WITH the problem emits both the witness and the advisory
 * line in the same findings array, so the advisory check must be tested
 * first, or a bad document reads as MET. Sixteen of this file's MET
 * branches are correct only because that ordering holds at every site.
 *
 * THE TABLE WITNESS NEEDS AN EXTRA GATE — for TWO practices, not one.
 * xlsx.ts's table-markup witness (`${a.tables.length} defined table(s)
 * found.`) is pushed even at n=0 in one real scenario: a workbook whose
 * only sizable data lives on a PIVOT sheet (pivots are explicitly excluded
 * from `datafulWithoutTable`, xlsx.ts:222-224, so neither table_markup
 * advisory fires, yet zero defined tables exist). Both practices whose
 * concern turns on the witness's numeric VALUE, not just its presence,
 * additionally require that value to be > 0:
 *
 *   - `xlsx-defined-tables` — its concern IS "does at least one table
 *     exist". Skipping the gate would report a workbook with literally
 *     zero defined tables as having met a practice called "Data uses
 *     defined Excel Tables". Below the gate it reports NOT CHECKED.
 *   - `xlsx-data-outside-tables` — at n=0 the pivot sheet's own >=12-cell
 *     range demonstrably DOES sit outside a defined Table, because there
 *     is no Table in the workbook for it to sit in. The analyzer carves
 *     pivots out because the ADVICE would be wrong (a pivot cannot become
 *     an Excel Table), not because the fact is. Below the gate it reports
 *     NOT APPLICABLE, naming the carve-out.
 *
 * The other three table_markup practices (xlsx-pivot-tables,
 * xlsx-data-start, xlsx-merged-cells) key off their own independent
 * advisory lines rather than the witness's number, and take no such gate.
 * `pptx.ts:176-178`'s witness has the same shape of trap (a deck whose
 * slides are ALL hidden reads "All 0 visible slide(s) have a distinct
 * title.", vacuously true), and gets the same `n > 0` gate for both
 * PowerPoint title practices.
 *
 * Reading witnesses/N-A/MET lines: use `matchMain` (types.ts), never
 * `matchAny` — `matchAny` searches the RAW, unpartitioned findings array,
 * which can include a document's OWN quoted text inside an indented signal
 * item (docx.ts:199 interpolates a fake heading's own sample). `matchMain`
 * searches only `ctx.main`, the analyzer's own voice.
 *
 * READING ADVISORIES: `matchAdvisory`, never `matchNotScored`. The witness
 * rule above has a THIRD half that has nothing to do with control flow: the
 * payload may be a year old. /report/[id] renders stored JSON that lives 365
 * days (SHARED_REPORTS.EXPIRY_DAYS) and scoring/regrade.ts never re-derives
 * `findings`, so every advisory string is frozen at ANALYSIS time. v1.136.0
 * (2026-08-29) re-prefixed the docx heading advisories, the docx nested-table
 * advisory, the pptx untitled/duplicate-slide advisories, the xlsx sheet-name
 * advisory and the xlsx no-defined-Table advisory. On an older payload those
 * sit UN-PREFIXED in `main`, where `matchNotScored` cannot see them — and a
 * witness-based MET then reports a green for a document whose own stored
 * finding, rendered verbatim in the card below, says otherwise. Confirmed
 * false greens before the fix: docx-first-heading-is-h1, docx-heading-skips,
 * docx-nested-tables and docx-layout-grids. `matchAdvisory` searches
 * notScored ∪ main (never `signals`, which quote the document). Where the
 * WORDING moved too, the needle is narrowed to the clause both eras share and
 * says so at the site; docx-layout-grids, whose advisory did not exist at all
 * before 2026-08-29, carries a soundness gate instead. Pinned by
 * bestPracticesVersionDrift.test.ts against `git show 842dde9^`.
 *
 * Every practice in this file traced to a valid witness once its scorer
 * was read end to end — that is a fact about docx.ts/pptx.ts/xlsx.ts as
 * they exist today, not a promise. A future scorer change, or a future
 * 20th practice, may have no unconditional positive line to key off; in
 * that case the practice must keep reporting NOT MET, NOT APPLICABLE, or
 * NOT CHECKED only. An unqualified witness is worse than none, because it
 * produces exactly the inverted gate described above.
 */
import {
  advisoryLines,
  firstNumber,
  matchAdvisory,
  matchMain,
  type BestPractice,
  signalLines,
  type BestPracticeResult,
  type DetectContext,
  type EvidenceBlock,
} from "./types";

const notChecked = (why: string, reason?: "silent" | "not-run"): BestPracticeResult => ({
  status: "not-checked",
  evidence: [why],
  reason,
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

/** The heading outline the analyzer prints as a technical signal — one
 *  indented line per heading, `H1 "Introduction"` / `H3 "Findings"`, with
 *  the heading's own text — lifted next to the practice it is evidence for,
 *  the way pdf.ts's headingTreeBlock lifts the PDF level flow. docx.ts:194
 *  pushes it (common.ts headingOutlineLines) whenever total > 0.
 *
 *  Those lines carry document-controlled text and live in `signals`, so no
 *  matcher here ever reads them — they are shown, never trusted. Absent
 *  (older payloads, no headings) → no block, never an empty caption. */
function docxHeadingOutlineBlock(ctx: DetectContext): EvidenceBlock | undefined {
  const lines = signalLines(ctx, "Heading Outline");
  return lines.length ? { caption: "Your headings, in document order", lines } : undefined;
}

const OFFICE_FIX_APP =
  "Office documents are fixed at the source, not after export — make the change and re-export (or re-save) the file.";

export const OFFICE_PRACTICES: BestPractice[] = [
  // =========================================================================
  // WORD
  // =========================================================================
  {
    id: "docx-first-heading-is-h1",
    advisorySince: "2026-08-29",
    formats: ["docx"],
    categoryId: "heading_structure",
    label: "Outline starts at Heading 1",
    description:
      "A document's first heading-styled paragraph can be any level, but starting at Heading 1 gives the outline a single, top-level root.",
    why: "Someone navigating by heading builds a mental map of the document from its levels. If the outline starts partway down — at Heading 3, say — there is no top-level entry point, which reads as though an earlier section is missing.",
    links: [],
    standard:
      "No WCAG 2.1 criterion requires a document to start at Heading 1 or to have a single top-level heading. axe-core classes the equivalent rule a best practice.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no heading-structure data for this document.",
          "not-run",
        );
      }
      const line = matchAdvisory(ctx, "the first heading is heading");
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
          block: docxHeadingOutlineBlock(ctx),
          fix: {
            source:
              "In Word, apply the Heading 1 style to the document's first heading-styled paragraph, or promote the outline so it begins there.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchMain(ctx, "no headings were found")) {
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
      if (matchMain(ctx, "real heading(s) found")) {
        return {
          status: "met",
          evidence: ["This document's headings were checked, and its outline starts at Heading 1."],
          block: docxHeadingOutlineBlock(ctx),
        };
      }
      return notChecked("This report contains no finding about this document's first heading.");
    },
  },
  {
    id: "docx-heading-skips",
    advisorySince: "2026-07-01",
    formats: ["docx"],
    categoryId: "heading_structure",
    label: "Heading levels do not skip",
    description:
      "Headings should step down one level at a time — Heading 1, then Heading 2, then Heading 3 — rather than jumping a level.",
    why: "A skipped level reads as a missing section to someone navigating by heading: they cannot tell whether they missed something or the document simply has a gap.",
    links: [],
    standard:
      "Not a WCAG 2.1 failure: the headings exist and their levels are programmatically determinable, which is what 1.3.1 asks. W3C publishes no failure technique for skipped levels, and axe-core classes heading-order a best practice.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no heading-structure data for this document.",
          "not-run",
        );
      }
      const line = matchAdvisory(ctx, "skip a heading level");
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
          block: docxHeadingOutlineBlock(ctx),
          fix: {
            source:
              "In Word, apply heading styles in order — do not jump from Heading 1 to Heading 3 — so each section steps down one level at a time.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchMain(ctx, "no headings were found")) {
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
      if (matchMain(ctx, "real heading(s) found")) {
        return {
          status: "met",
          evidence: ["This document's headings were checked, and none of the levels skip a step."],
          block: docxHeadingOutlineBlock(ctx),
        };
      }
      return notChecked(
        "This report contains no finding about this document's heading level order.",
      );
    },
  },
  // docx-empty-headings was HERE until 2026-08-31. It is now a SCORED
  // WCAG 1.3.1 (Level A) failure — see scoring/docx.ts and conformance.ts —
  // so it belongs in the action plan, not in a section that tells the reader
  // nothing here affects the grade. The PDF twin (heading-content) stays
  // unscored and hedged: its evidence is heuristic, this one's is exact.
  {
    id: "docx-empty-paragraph-runs",
    advisorySince: "2026-08-26",
    formats: ["docx"],
    categoryId: "text_extractability",
    label: "No long runs of blank paragraphs",
    description:
      "Blank space between sections should come from paragraph spacing, not three or more empty paragraphs typed in a row.",
    why: "A screen reader announces each blank paragraph individually while moving through the document — a long run of them is dead air someone has to sit through.",
    links: [],
    standard:
      "No WCAG 2.1 criterion is engaged. The nearest W3C failures cover something else: F33 and F34 are about whitespace used to fake columns or tables in plain text, and F32 is about whitespace inside a word. None addresses blank paragraphs used as vertical spacing.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no text-extractability data for this document.",
          "not-run",
        );
      }
      const line = matchAdvisory(ctx, "consecutive empty paragraphs");
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
      if (matchMain(ctx, "fully extractable, selectable text")) {
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
    advisorySince: "2026-08-29",
    formats: ["docx"],
    categoryId: "table_markup",
    label: "Bare layout grids reviewed",
    description:
      "A table-shaped grid with no table style, borders, shading, or header marks anywhere is usually a layout construct rather than a data table — worth a quick check that none of them actually holds data.",
    why: "A screen reader announces a real data table's header with each cell. A layout grid does not need one — but it is easy to build a genuine data table without ever applying a table style, which would leave it looking identical to a layout grid in the file.",
    links: [],
    standard:
      "A genuine layout table needs no header row — W3C failure F46 fails the reverse case, a layout table given header cells (F46 is written for HTML and is cited here by analogy; Word has no equivalent markup). Read this row with care: it is by construction the set this tool could NOT classify, so if one of these is really a data table, its missing header row IS a WCAG 1.3.1 (Level A) failure.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no table-markup data for this document.",
          "not-run",
        );
      }
      const line = matchAdvisory(ctx, "bare grid");
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
      if (matchMain(ctx, "no tables were found")) {
        return { status: "not-applicable", evidence: ["This document has no tables."] };
      }
      // ORDER IS LOAD-BEARING: docx.ts:290 pushes "N table(s) found."
      // unconditionally whenever any tables exist, before the bare-grid
      // check (:296) even runs — so a document with a bare grid carries
      // both lines. The advisory check above must win.
      //
      // THE ONE PRACTICE WITH NO PRE-v1.136.0 ADVISORY AT ALL. Every other
      // advisory this catalog reads was merely re-prefixed on 2026-08-29;
      // the bare-grid line was CREATED that day, together with the
      // looksLikeLayout rule behind it. A stored report from before it
      // (365-day retention, findings never re-derived) can carry a bare grid
      // and no line naming one, so the witness alone would report MET for a
      // document that has exactly the thing this row denies.
      //
      // WHY THE GATE BELOW IS SOUND — TWO DIFFERENT REASONS, ONE PER ERA.
      // Do not collapse them into one, and do NOT delete the bare-grid check
      // above as redundant: today's half of the soundness rests entirely on
      // it returning first.
      //
      //   TODAY, the bare-grid advisory is emitted for every bare grid of two or more rows and columns (scoring/docx.ts:288)
      //   (docx.ts:296), so such a document has already returned NOT MET
      //   above and never reaches this gate. The header-row line read below
      //   says nothing about bare grids either way on a current payload — it
      //   deliberately EXCLUDES them (docx.ts:284 filters
      //   `looksLikeLayout !== true`; they are counted separately as
      //   `layoutish`). Reading it here only makes this practice
      //   conservative, never wrong.
      //
      //   PRE-2026-08-29, there was no bare-grid advisory AND no layout
      //   filter (842dde9^:docx.ts:281-283), so that same line — whose text
      //   is byte-identical in both eras — counted a STRICT SUPERSET: every
      //   table 2×2 or larger with no header row, bare grids included.
      //   docxService.ts:381-390 makes the containment total: looksLikeLayout
      //   requires no header mark ANYWHERE and hasHeaderRow requires one on
      //   row 0, so looksLikeLayout implies !hasHeaderRow. On such a payload
      //   the line's ABSENCE therefore proves there was no bare grid, and its
      //   PRESENCE is ambiguous — a real data table missing its header looks
      //   identical.
      //
      // Absence -> MET, sound at any payload age. Presence -> NOT CHECKED,
      // the honest answer, rather than a green or a fabricated red.
      const headerless = matchAdvisory(ctx, "data table(s) have no header row");
      if (matchMain(ctx, "table(s) found")) {
        if (!headerless) {
          return {
            status: "met",
            evidence: [
              // scoring/docx.ts:288 counts a bare grid only when rowCount >= 2
              // && colCount >= 2; a 1×N unstyled grid is never flagged, so
              // the claim is scoped to what the analyzer actually examined.
              "This document's tables with two or more rows and columns were checked, and none is a bare, unstyled grid.",
            ],
          };
        }
        // Claims only what is established at this branch in EITHER era: the
        // document fact (a table with no header row), the two things that
        // can be, and that this check is not picking between them. It must
        // not say "this report does not say which" — a current-era report
        // DOES say, by the absence of the bare-grid advisory above.
        // "N data table(s) have no header row" is, on every payload analyzed
        // since 2026-08-29, a SCORED WCAG 1.3.1 failure that already excludes
        // bare grids (docx.ts:285 filters looksLikeLayout) — it appears in the
        // action plan above as a required fix. Saying "does not change your
        // score" beneath it would contradict the plan on the same page.
        // Before 2026-08-29 that count still INCLUDED bare grids, so on an
        // older payload the line is genuinely ambiguous.
        if (ctx.analyzedAt && ctx.analyzedAt < new Date("2026-08-29")) {
          return notChecked(
            "This report predates the check that tells a bare layout grid apart from a data table missing its header, so this one needs a person's eye.",
          );
        }
        return {
          status: "not-applicable",
          evidence: [
            "This document has a data table with no header row. That is counted in your score — see the action plan above, not this section.",
          ],
        };
      }
      return notChecked(
        "This report contains no finding about bare layout grids in this document.",
      );
    },
  },
  {
    id: "docx-nested-tables",
    advisorySince: "2026-07-01",
    formats: ["docx"],
    categoryId: "table_markup",
    label: "No nested tables",
    description: "A table should not contain another table nested inside one of its cells.",
    why: "A nested table — one table inside another — is genuinely difficult to navigate by keyboard or by screen reader, even where both are properly built.",
    links: [],
    standard:
      "No standard forbids nesting — a navigability recommendation only. Each table keeps its own programmatically determinable relationships, which is what WCAG 1.3.1 asks.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no table-markup data for this document.",
          "not-run",
        );
      }
      if (matchAdvisory(ctx, "nested tables were found")) {
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
      if (matchMain(ctx, "no tables were found")) {
        return { status: "not-applicable", evidence: ["This document has no tables."] };
      }
      // ORDER IS LOAD-BEARING: docx.ts:290's witness is pushed whenever any
      // tables exist, before the nested-table check (:303) even runs — a
      // document with a nested table carries both lines. The advisory
      // check above must win.
      if (matchMain(ctx, "table(s) found")) {
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
    advisorySince: "2026-08-26",
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
    standard:
      "No WCAG 2.1 criterion or failure technique forbids merged cells. H43 and H63 are SUFFICIENT techniques for associating headers, and they are written for HTML — Word has no scope or headers mechanism to fail against in the first place.",
    detect(ctx) {
      // categoryAbsent is checked separately from (and before) the "no
      // tables" line below: a missing category is a missing-DATA fact, never
      // "this document has no tables" — a document fact. Conflating the two
      // would let a forged/archived report with table_markup missing
      // entirely be reported as "this document has no tables", which is a
      // claim about the DOCUMENT this report never actually made. See
      // pdf.ts's categoryAbsent() doctrine comment.
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no table-markup data for this document.",
          "not-run",
        );
      }
      const line = matchAdvisory(ctx, "merged cell(s) across the table");
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
      if (matchMain(ctx, "no tables were found")) {
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
      if (matchMain(ctx, "table(s) found")) {
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
    advisorySince: "2026-08-26",
    formats: ["docx"],
    categoryId: "table_markup",
    label: "No entirely empty table rows",
    description:
      "Blank space inside a table should come from cell padding or table spacing, not a row left entirely empty.",
    why: "A screen reader announces an empty row as an empty row while moving through the table — it is dead air someone has to sit through, row by row.",
    links: [],
    standard:
      "No WCAG 2.1 criterion is engaged: the cells of an empty row are still perceivable and announced. A tidiness recommendation.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no table-markup data for this document.",
          "not-run",
        );
      }
      const line = matchAdvisory(ctx, "entirely empty table row");
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
      if (matchMain(ctx, "no tables were found")) {
        return { status: "not-applicable", evidence: ["This document has no tables."] };
      }
      // ORDER IS LOAD-BEARING: docx.ts:290's witness is pushed whenever any
      // tables exist, before the empty-row count is even computed (:314).
      // A document with an empty row carries both lines, so the advisory
      // check above must win.
      if (matchMain(ctx, "table(s) found")) {
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
    advisorySince: "2026-06-05",
    formats: ["docx"],
    categoryId: "link_quality",
    label: "Link text is not a raw URL",
    description:
      "A link's visible text can be the destination address itself, but a short descriptive label reads better in a list of links.",
    why: "A raw URL as link text does tell a screen reader where a link goes, so it meets WCAG 2.4.4 Link Purpose (In Context), Level A — a descriptive label is simply easier to listen to in a list of many links.",
    links: [],
    standard:
      "A readable address usually satisfies WCAG 2.4.4 Link Purpose (In Context), Level A, because the destination is the link text. A long or parameterised URL may not make the purpose determinable, and this tool does not judge which is which — check those in place. Preferring a short label over any address is 2.4.9 (Link Only), a AAA criterion outside the legal standard.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no link-quality data for this document.",
          "not-run",
        );
      }
      const line = matchAdvisory(ctx, "raw url as their visible text");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n !== null
              ? `This document has ${n} link${n === 1 ? "" : "s"} showing a raw web address instead of descriptive text.`
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
      if (matchMain(ctx, "no hyperlinks were found")) {
        return { status: "not-applicable", evidence: ["This document has no links."] };
      }
      // ORDER IS LOAD-BEARING: docx.ts's link witness ("N link(s) found; N
      // with unclear text.") is pushed unconditionally whenever any links
      // exist, before the raw-URL check (:359) even runs. A document with
      // raw-URL links carries both lines, so the advisory check above must
      // win.
      if (matchMain(ctx, "link(s) found")) {
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
    why: "A slide's title placeholder is what lets a screen-reader user tell slides apart and jump straight to one, building a navigable outline of the whole deck. No WCAG 2.1 A/AA criterion requires a heading to exist — that requirement is 2.4.10 Section Headings, Level AAA, which the ADA Title II rule does not adopt — which is why this is reported rather than counted.",
    // The old reason given here ("a slide can carry its heading text in a
    // body placeholder") was not accurate: a body placeholder carries no
    // heading semantics at all, and its text never reaches the Outline view.
    // The honest reason is the AAA one above. Note also the coverage gap
    // this row cannot close: a slide showing a visually-styled heading in a
    // floating text box IS a 1.3.1 Level A failure (W3C F2) — scored for
    // Word (scoring/docx.ts:186-190), undetected for PowerPoint.
    standard:
      "No WCAG 2.1 A/AA criterion requires a slide to have a title; requiring section headings is 2.4.10 (Level AAA). A missing title becomes a WCAG 1.3.1 (Level A) failure only where the slide shows a visually-styled heading that is not marked up as one — a case this tool does not detect in PowerPoint.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no slide-title data for this presentation.",
          "not-run",
        );
      }
      // TWO NEEDLES, ONE PER ERA. v1.136.0 reworded this line as well as
      // prefixing it: pre-2026-08-29 it read "Slides 3, 7 have NO TITLE. In
      // PowerPoint: use the Outline view…", today "…have NO TITLE
      // PLACEHOLDER — … In PowerPoint: use the Outline view…". "no title"
      // alone would also match this category's duplicate-title advisory,
      // which interpolates a slide's OWN title; pairing it with the fix
      // clause both eras share cannot be forged from a title.
      const line = matchAdvisory(ctx, "no title", "use the outline view");
      if (line) {
        // pptx.ts:154 — the evidence is a LIST of slide numbers ("slides 3,
        // 7, 12"), never a count: firstNumber would silently return only
        // the first. Lift the already-correctly-conjugated clause straight
        // out of the analyzer's own line instead of re-deriving grammar.
        const phrase =
          /slides?\s+[\d,\s]+\s+(?:has|have)\s+no title(?: placeholder)?/i.exec(line)?.[0] ?? null;
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
      if (matchMain(ctx, "no slides were found")) {
        return { status: "not-applicable", evidence: ["This presentation has no slides."] };
      }
      const distinctLine = matchMain(ctx, "have a distinct title");
      if (distinctLine) {
        // GATE, same reason as xlsx-defined-tables: pptx.ts:176-178 pushes
        // this line whenever untitled.length === 0 AND duplicateGroups.length
        // === 0, which is vacuously true when `visible` (pptx.ts:131) is
        // empty — a deck whose slides are ALL hidden. The claim is
        // technically true at n=0, but a green "every slide has a title"
        // row on a deck with no visible slides is not something a reader
        // can act on or verify.
        const n = firstNumber(distinctLine);
        if (n !== null && n > 0) {
          return {
            status: "met",
            evidence: ["Every visible slide in this presentation has a title."],
          };
        }
        return notChecked(
          "This presentation's slides are all hidden, so there are no visible slide titles to check.",
        );
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
    standard:
      "WCAG 2.4.6 Headings and Labels (Level AA) requires headings to DESCRIBE topic or purpose — never to be unique. A deck can honestly hold two slides both titled Q3 Results.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no slide-title data for this presentation.",
          "not-run",
        );
      }
      // pptx.ts:168 is pushed once PER duplicate-title group (mirrors
      // xlsx.ts:171's per-sheet push) — a single-match helper would return
      // only the first group. Collect every matching line so a deck with
      // several different repeated titles reports all of them, not just one.
      // advisoryLines(), not ctx.notScored: pre-2026-08-29 payloads carry
      // this advisory un-prefixed, in `main`. See types.ts matchAdvisory.
      const dupLines = advisoryLines(ctx).filter((l) => /slides? share the title "/i.test(l));
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
      if (matchMain(ctx, "no slides were found")) {
        return { status: "not-applicable", evidence: ["This presentation has no slides."] };
      }
      const distinctLine = matchMain(ctx, "have a distinct title");
      if (distinctLine) {
        // GATE: see pptx-slide-titles's identical comment — pptx.ts:176-178's
        // witness is vacuously true ("All 0 visible slide(s)…") when every
        // slide is hidden.
        const n = firstNumber(distinctLine);
        if (n !== null && n > 0) {
          return {
            status: "met",
            evidence: ["No two visible slides in this presentation share the same title."],
          };
        }
        return notChecked(
          "This presentation's slides are all hidden, so there are no visible slide titles to check.",
        );
      }
      return notChecked(
        "This report contains no finding about duplicate slide titles in this presentation.",
      );
    },
  },
  {
    id: "pptx-raw-url-link-text",
    advisorySince: "2026-06-05",
    formats: ["pptx"],
    categoryId: "link_quality",
    label: "Link text is not a raw URL",
    description:
      "A link's visible text can be the destination address itself, but a short descriptive label reads better in a list of links.",
    why: "A raw URL as link text does tell a screen reader where a link goes, so it meets WCAG 2.4.4 Link Purpose (In Context), Level A — a descriptive label is simply easier to listen to in a list of many links.",
    links: [],
    standard:
      "A readable address usually satisfies WCAG 2.4.4 Link Purpose (In Context), Level A, because the destination is the link text. A long or parameterised URL may not make the purpose determinable, and this tool does not judge which is which — check those in place. Preferring a short label over any address is 2.4.9 (Link Only), a AAA criterion outside the legal standard.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no link-quality data for this presentation.",
          "not-run",
        );
      }
      const line = matchAdvisory(ctx, "raw url as their visible text");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n !== null
              ? `This presentation has ${n} link${n === 1 ? "" : "s"} showing a raw web address instead of descriptive text.`
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
      if (matchMain(ctx, "no hyperlinks were found")) {
        return { status: "not-applicable", evidence: ["This presentation has no links."] };
      }
      // ORDER IS LOAD-BEARING: pptx.ts's link witness ("N link(s) found; N
      // with unclear text.") is pushed unconditionally whenever any links
      // exist, before the raw-URL check (:472) even runs. A presentation
      // with raw-URL links carries both lines, so the advisory check above
      // must win.
      if (matchMain(ctx, "link(s) found")) {
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
    standard:
      "No WCAG 2.1 A/AA criterion requires a descriptive sheet name. 2.4.6 Headings and Labels (Level AA) governs headings and labels that already exist; requiring descriptive names for sections is 2.4.10, Level AAA. Reasonable people read a sheet tab either way — this tool does not count it.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no sheet-name data for this workbook.", "not-run");
      }
      // xlsx.ts:171 is pushed once PER default-named sheet — a single-match
      // helper would return only the first. Collect every match, and never
      // call firstNumber on it: the evidence is the sheet's own NAME
      // (quoted), and a default name like "Sheet1" would make firstNumber
      // return 1 as if it were a count. advisoryLines(), not ctx.notScored:
      // pre-2026-08-29 payloads carry this advisory un-prefixed, in `main`.
      const renameLines = advisoryLines(ctx).filter((l) =>
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
      if (matchMain(ctx, "no visible sheets were found")) {
        return { status: "not-applicable", evidence: ["This workbook has no visible sheets."] };
      }
      if (matchMain(ctx, "visible sheet(s) have descriptive names")) {
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
    advisorySince: "2026-07-19",
    formats: ["xlsx"],
    categoryId: "table_markup",
    label: "Data uses defined Excel Tables",
    description:
      "Sizable data laid out as a real Excel Table (with a header row) lets a screen reader announce the right column header while moving across cells — a plain range of typed cells carries no such structure.",
    why: "Whether a given range is really a data table is a judgment call a person has to make, which is why this is reported rather than counted — but where it is, a defined Table is what gives it structure a screen reader can use.",
    links: [],
    standard:
      "WCAG 1.3.1 (Level A) binds only where a range really is a data table with header semantics, and whether a given range is one is a human judgment. The mechanical half IS scored: a DEFINED Excel Table with its header row switched off loses points.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no table-markup data for this workbook.",
          "not-run",
        );
      }
      if (matchAdvisory(ctx, "no defined excel table anywhere")) {
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
      if (matchMain(ctx, "no tables or sizable data ranges were found")) {
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
      const tableWitness = matchMain(ctx, "defined table(s) found");
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
        // The pivot-only-workbook case: the witness IS present (the report
        // literally shows "0 defined table(s) found."), so a message
        // claiming no finding exists would contradict what the reader can
        // see right above it. Name what could not be established instead.
        return notChecked(
          "This report does not establish whether this workbook's data uses a defined Excel Table.",
        );
      }
      return notChecked("This report contains no finding about defined tables in this workbook.");
    },
  },
  {
    id: "xlsx-data-outside-tables",
    advisorySince: "2026-07-19",
    formats: ["xlsx"],
    categoryId: "table_markup",
    label: "No sizable data outside a table",
    description:
      "A sizable block of worksheet data should sit inside a defined Excel Table rather than a plain range of cells.",
    why: "A screen reader can announce column headers while a reader moves across a defined Table's cells, but not across a plain, unstructured range sitting next to it.",
    links: [],
    standard:
      "As with defined tables: no criterion names the Excel Table feature, and whether a plain range is a data table stays a human call. A defined Table with its header row off is the scored case.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no table-markup data for this workbook.",
          "not-run",
        );
      }
      // FIX (audit sweep, same bug class as list-labels): xlsx.ts:225-238 is
      // an if/else-if — "no defined Excel Table anywhere" (advisory A, the
      // tables.length===0 case) and "sits outside the defined table(s)"
      // (advisory B, tables exist but some data isn't in one) never
      // coexist, and only advisory B was matched here. A workbook with
      // ZERO defined tables anywhere fires advisory A, not B — this
      // practice's own matcher found nothing, fell through to the witness
      // check below, and reported MET ("none has sizable data sitting
      // outside a defined Table") for a workbook where trivially ALL of
      // it does, because there is nowhere else for it to sit. Advisory A
      // is the tables=0 special case of the exact same fact this practice
      // measures, so it is matched here too.
      const noTablesAtAll = matchAdvisory(ctx, "no defined excel table anywhere");
      const someOutside = matchAdvisory(ctx, "sits outside the defined table");
      if (noTablesAtAll || someOutside) {
        return {
          status: "not-met",
          evidence: [
            noTablesAtAll
              ? "This workbook has no defined Excel Table anywhere, so its sizable data sits entirely outside one, as plain cell ranges."
              : "This workbook has data sitting outside its defined tables, as plain cell ranges.",
            "A screen reader can announce column headers while moving across a defined Table, but not across a plain range.",
          ],
          fix: {
            source:
              "In Excel, select the data range outside the existing tables and choose Insert → Table.",
            app: OFFICE_FIX_APP,
          },
        };
      }
      if (matchMain(ctx, "no tables or sizable data ranges were found")) {
        return {
          status: "not-applicable",
          evidence: ["This workbook has no tables or sizable data ranges."],
        };
      }
      // ORDER IS LOAD-BEARING: xlsx.ts:207's witness is pushed unconditionally
      // whenever the early return is not taken, before either advisory check
      // (:225-238) even runs. Both advisory checks above must win.
      //
      // EXTRA GATE, same `n > 0` as xlsx-defined-tables but for a different
      // reason. With the tables=0 advisory now caught above, reaching here
      // with a.tables.length === 0 means every sizable sheet was skipped by
      // `datafulWithoutTable` (xlsx.ts:222-224) — which excludes pivot
      // sheets and hidden sheets — so no advisory fired even though zero
      // tables exist. The pivot case is the one that matters, and MET is
      // NOT accurate there: the pivot sheet's own >=12-cell range
      // demonstrably DOES sit outside a defined Table, because there is no
      // Table in the workbook for it to sit in. The analyzer carves pivots
      // out because the ADVICE would be wrong (a pivot cannot be converted
      // into an Excel Table), not because the fact is. So: NOT APPLICABLE,
      // naming the carve-out, rather than a green row asserting something
      // false about the document.
      const tableWitness = matchMain(ctx, "defined table(s) found");
      // xlsx.ts:240-247, pushed whenever any VISIBLE sheet has a pivot. Used
      // only to establish the carve-out actually applies before naming it.
      // Without it the hidden-sheet case (a workbook whose only sizable
      // sheet is hidden lands here at n=0 too) would be told it is full of
      // pivots — inferring a document fact from the absence of two
      // advisories, exactly what this fix exists to stop. No pivot line, no
      // claim: that case falls through to NOT CHECKED below.
      const pivotLine = matchAdvisory(ctx, "contain pivot tables");
      if (tableWitness) {
        const n = firstNumber(tableWitness);
        if (n !== null && n > 0) {
          return {
            status: "met",
            evidence: [
              pivotLine
                ? "Every visible sheet in this workbook with sizable data has at least one defined Excel Table — apart from its pivot tables, which cannot be turned into one. Whether every range on those sheets sits inside a Table is not checked; the analyzer tests each sheet, not each range."
                : "Every visible sheet in this workbook with sizable data has at least one defined Excel Table. Whether every range on those sheets sits inside a Table is not checked; the analyzer tests each sheet (xlsxService hasDefinedTable), not each range.",
            ],
          };
        }
        if (pivotLine) {
          return {
            status: "not-applicable",
            evidence: [
              "This workbook has no defined Excel Tables, and the sizable data on its visible sheets is all in pivot tables, which cannot be turned into Tables.",
              "There is no ordinary range of cells on those sheets that could be moved into one.",
            ],
          };
        }
        // Witness present at zero with no pivot line: the report shows "0
        // defined table(s) found." while naming no data outside a table and
        // no pivot. Nothing about the workbook's visible sheets was
        // established either way, and a message claiming the report holds no
        // finding would contradict the line the reader can see.
        return notChecked(
          "This report does not establish whether any sizable data in this workbook sits outside a defined Table.",
        );
      }
      return notChecked(
        "This report contains no finding about data outside defined tables in this workbook.",
      );
    },
  },
  {
    id: "xlsx-pivot-tables",
    advisorySince: "2026-07-19",
    formats: ["xlsx"],
    categoryId: "table_markup",
    label: "Pivot tables reviewed manually",
    description:
      "A pivot table cannot be converted into a defined Excel Table, so its readability for a screen-reader user has to be checked by hand.",
    why: "A defined Table's header association does not apply to a pivot table's own layout — someone has to confirm by hand, for example with a screen reader, that a pivot reads sensibly from top to bottom.",
    links: [],
    standard:
      "Not a defect and no criterion applies — a prompt to review by hand, because a pivot table cannot be turned into an Excel Table.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no table-markup data for this workbook.",
          "not-run",
        );
      }
      const line = matchAdvisory(ctx, "contain pivot tables");
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
      if (matchMain(ctx, "no tables or sizable data ranges were found")) {
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
      if (matchMain(ctx, "defined table(s) found")) {
        return {
          status: "met",
          evidence: [
            "This workbook's visible sheets were checked, and none contains a pivot table needing manual review.",
          ],
        };
      }
      return notChecked("This report contains no finding about pivot tables in this workbook.");
    },
  },
  {
    id: "xlsx-data-start",
    advisorySince: "2026-08-26",
    formats: ["xlsx"],
    categoryId: "table_markup",
    label: "Data starts near cell A1",
    description:
      "A sheet's data should begin at or near cell A1, not several empty rows or columns in.",
    why: "A screen reader lands at cell A1 when it opens a sheet. Empty leading rows or columns are dead space someone has to move through before reaching anything real.",
    links: [],
    standard:
      "No WCAG 2.1 criterion is engaged: leading blank rows or columns lose no information, structure, or relationship. A navigation convenience.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no table-markup data for this workbook.",
          "not-run",
        );
      }
      const line = matchAdvisory(ctx, "data begins at row");
      if (line) {
        // Never call firstNumber here: a quoted SHEET NAME sits before the
        // row/column numbers in this line, and a name containing a digit
        // (e.g. a default "Sheet1") would be picked up as if it were the
        // row or column count. Extract the named triples explicitly.
        const matches = [
          ...line.matchAll(/"([^"]+)" data begins at row (\d+|\?), column (\d+|\?)/g),
        ];
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
      if (matchMain(ctx, "no tables or sizable data ranges were found")) {
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
      if (matchMain(ctx, "defined table(s) found")) {
        return {
          status: "met",
          evidence: [
            "This workbook's visible sheets with sizable data were checked, and each one starts at or near cell A1.",
          ],
        };
      }
      return notChecked("This report contains no finding about where this workbook's data starts.");
    },
  },
  {
    id: "xlsx-merged-cells",
    advisorySince: "2026-07-02",
    formats: ["xlsx"],
    categoryId: "table_markup",
    label: "Merged cells reviewed",
    description:
      "A merged cell spans more than one row or column, so the grid a screen reader walks no longer matches the grid a sighted reader sees.",
    why: "Someone listening to a sheet moves cell by cell. Where cells are merged, that can confuse navigation — whether it actually causes trouble depends on where the merge sits, which is why this is reported for review rather than counted.",
    links: [],
    standard:
      "No WCAG 2.1 criterion or failure technique forbids merged cells in a spreadsheet. Worth a look because merges can confuse screen-reader table navigation, but nothing in the standard is broken.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no table-markup data for this workbook.",
          "not-run",
        );
      }
      const line = matchAdvisory(ctx, "contain merged cells");
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
      if (matchMain(ctx, "no tables or sizable data ranges were found")) {
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
      if (matchMain(ctx, "defined table(s) found")) {
        return {
          status: "met",
          evidence: [
            "This workbook's visible sheets were checked, and none contains merged cells.",
          ],
        };
      }
      return notChecked("This report contains no finding about merged cells in this workbook.");
    },
  },
  {
    id: "xlsx-raw-url-link-text",
    advisorySince: "2026-06-05",
    formats: ["xlsx"],
    categoryId: "link_quality",
    label: "Link text is not a raw URL",
    description:
      "A link's visible text can be the destination address itself, but a short descriptive label reads better in a list of links.",
    why: "A raw URL as link text does tell a screen reader where a link goes, so it meets WCAG 2.4.4 Link Purpose (In Context), Level A — a descriptive label is simply easier to listen to in a list of many links.",
    links: [],
    standard:
      "A readable address usually satisfies WCAG 2.4.4 Link Purpose (In Context), Level A, because the destination is the link text. A long or parameterised URL may not make the purpose determinable, and this tool does not judge which is which — check those in place. Preferring a short label over any address is 2.4.9 (Link Only), a AAA criterion outside the legal standard.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no link-quality data for this workbook.",
          "not-run",
        );
      }
      const line = matchAdvisory(ctx, "raw url as their visible text");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n !== null
              ? `This workbook has ${n} link${n === 1 ? "" : "s"} showing a raw web address instead of descriptive text.`
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
      if (matchMain(ctx, "no hyperlinks were found")) {
        return { status: "not-applicable", evidence: ["This workbook has no links."] };
      }
      // ORDER IS LOAD-BEARING: xlsx.ts's link witness ("N link(s) assessed;
      // N with unclear text.") is pushed unconditionally whenever any
      // links are assessable, before the raw-URL check (:448) even runs. A
      // workbook with raw-URL links carries both lines, so the advisory
      // check above must win.
      //
      // SCOPE, deliberately: xlsxService.ts wraps collectSheetContent (where
      // analysis.links is populated) in `if (!hidden && sheetRoot)` — hidden
      // sheets are skipped for content collection wholesale, so `a.links`
      // never includes a hidden sheet's links at all. Unlike
      // xlsx-defined-tables's existence claim, "links were checked" is a
      // coverage claim, so it must name the scope that was actually
      // examined.
      if (matchMain(ctx, "link(s) assessed")) {
        return {
          status: "met",
          evidence: [
            "This workbook's links on visible sheets were checked, and none uses a raw web address as its visible text.",
          ],
        };
      }
      return notChecked(
        "This report contains no finding about raw web addresses used as link text in this workbook.",
      );
    },
  },
];
