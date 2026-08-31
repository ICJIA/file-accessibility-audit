/**
 * The PDF best-practice catalog.
 *
 * Each entry reads the findings packages/analyzer already emits and turns
 * them into: a status for THIS document, the evidence behind it, and both
 * fix routes. Nothing here is scored, and nothing here may read as an
 * obligation — the grade measures WCAG 2.1 A/AA only.
 *
 * MATCHER ORDER IS LOAD-BEARING within a detect(): several analyzer lines
 * contain each other's keywords, and several "positive" lines are pushed
 * UNCONDITIONALLY by the analyzer — they sit after an advisory block with no
 * early return in between, so a document that fails the advisory carries
 * BOTH lines in its findings. Where a detect() depends on checking one
 * status before another for this reason, it is commented at the site with
 * the analyzer line numbers involved. Getting the order wrong does not
 * throw or fail loudly — it silently reports the opposite of the truth.
 *
 * THE PAYLOAD MAY BE A YEAR OLD. /report/[id] renders stored JSON that lives
 * 365 days (SHARED_REPORTS.EXPIRY_DAYS), and scoring/regrade.ts recomputes
 * score/grade/summary only — it never re-derives `findings`. Every string
 * matched here is therefore frozen at ANALYSIS time, not at deploy time, and
 * v1.136.0 (2026-08-29) re-prefixed ~18 advisories. So:
 *
 *   - ADVISORY reads use `matchAdvisory` (notScored ∪ main), never
 *     `matchNotScored` — an un-prefixed older line sits in `main`.
 *   - WITNESS / POSITIVE / NOT-APPLICABLE reads use `matchMain`, never
 *     `matchAny`: `matchAny` also sees indented signal items, which quote the
 *     DOCUMENT'S own text, so a PDF whose heading reads "Why documents with
 *     no heading tags fail" could forge four not-applicable rows.
 *   - Where v1.136.0 changed the WORDING as well as the prefix, the needle is
 *     narrowed to the clause both eras share, and says so at the site.
 *
 * bestPracticesVersionDrift.test.ts pins all of this with fixtures copied
 * verbatim from the PRE-v1.136.0 analyzer (git show 842dde9^).
 */
import {
  matchAdvisory,
  matchMain,
  signalLines,
  firstNumber,
  type BestPractice,
  type BestPracticeLink,
  type BestPracticeResult,
  type DetectContext,
  type EvidenceBlock,
} from "./types";
import { matterhornLink, techniqueLink } from "./links";
// apps/web has no #config alias (that exists in api/cli only) — import the
// root config by relative path, as other web code does.
import { ANALYSIS } from "../../../../../audit.config";

/** Drop null Matterhorn lookups (a checkpoint id the shipped protocol data
 *  does not define) instead of repeating a `.filter(...)` at every entry. */
const links = (...ls: Array<BestPracticeLink | null>): BestPracticeLink[] =>
  ls.filter((l): l is BestPracticeLink => l !== null);

/** An evidence block sourced straight from a technical-signal group — the
 *  document's own list of fonts, flagged links, bookmark titles, and so
 *  on — or undefined when the group is empty or absent. An optional
 *  filter narrows the group's items first. */
function blockFrom(
  ctx: DetectContext,
  heading: string,
  caption: string,
  filter?: (line: string) => boolean,
): EvidenceBlock | undefined {
  const lines = signalLines(ctx, heading).filter((l) => (filter ? filter(l) : true));
  return lines.length ? { caption, lines } : undefined;
}

/** The heading tree the analyzer prints as a technical signal — the exact
 *  "H1 → H2 → H1 → H1" sequence, lifted out of the collapsed panel and put
 *  next to the practice it is evidence for. */
function headingTreeBlock(ctx: DetectContext) {
  const lines = signalLines(ctx, "Heading Tree");
  // The first line is the level flow; the rest are the skip annotations.
  const flow = lines.find((l) => l.includes("→") && !l.startsWith("Heading hierarchy skip"));
  return flow ? { caption: "Your heading order, in document order", lines: [flow] } : undefined;
}

const notChecked = (why: string, reason?: "silent" | "not-run"): BestPracticeResult => ({
  status: "not-checked",
  evidence: [why],
  reason,
});

/** NOT CHECKED when the whole category is absent from this report — a
 *  forged/corrupted stored report, an archived payload predating this
 *  category, or any other reason the DATA is missing. A fresh analysis
 *  always emits all ten PDF categories (analyzer scoreDocument), so
 *  absence is never evidence the document itself has none of the subject
 *  matter — that is a document FACT, established separately at each call
 *  site from the analyzer's own "No <thing> detected/found in this
 *  document" line. Only ever match that FULL phrase: a bare "no tables"
 *  needle also matches "No tables have <TR> row structure…", a real
 *  FAILURE line, and would report a document with broken tables as having
 *  none at all. */
function categoryAbsent(ctx: DetectContext): boolean {
  return !ctx.categoryPresent;
}

/** The analyzer's OWN "nothing to check here" outcomes for table_markup —
 *  all top-level `main` lines, byte-identical since before 842dde9^:
 *  no tables (scoring/pdf.ts:1511); only single-column tables, treated as
 *  layout (:1568-1572, an early return before any scope/nesting line);
 *  tables with no header cells (:1680). Each used to fall to a "no finding"
 *  NOT CHECKED beneath a card that explicitly said why. */
function tableNotApplicable(ctx: DetectContext, aboutScope: boolean): BestPracticeResult | null {
  if (matchMain(ctx, "no tables detected in this document")) {
    return { status: "not-applicable", evidence: ["This document has no tables."] };
  }
  if (matchMain(ctx, "treated as layout structures")) {
    return {
      status: "not-applicable",
      evidence: [
        "This document's only tables are single-column layout structures, which the analyzer does not treat as data tables.",
      ],
    };
  }
  if (aboutScope && matchMain(ctx, "scope attributes: n/a")) {
    return {
      status: "not-applicable",
      evidence: [
        "This document's tables have no header cells, so there is no header scope to check.",
      ],
    };
  }
  return null;
}

/** scoring/pdf.ts:1711 — headers on more than one edge, or spanned cells,
 *  with neither /Scope nor /Headers. That is a SCORED WCAG 1.3.1 failure
 *  with a required step in the plan above; this unscored section must not
 *  say "does not change your score" beneath it. */
function scopeScoredFailure(ctx: DetectContext): BestPracticeResult | null {
  if (!matchMain(ctx, "missing scope attribute (with no /headers association either)")) return null;
  return {
    status: "not-applicable",
    evidence: [
      "Some of this document's tables have headers on more than one edge (or spanned cells) with no /Scope or /Headers. That is a WCAG 1.3.1 failure and is counted in your score — see the action plan above, not this section.",
    ],
  };
}

export const PDF_PRACTICES: BestPractice[] = [
  {
    id: "heading-level-order",
    formats: ["pdf"],
    categoryId: "heading_structure",
    label: "Heading level order",
    description:
      "Headings should step down one level at a time — H1, then H2, then H3. Jumping a level leaves a gap in the outline.",
    why: "Screen-reader users move through a document by jumping between headings. A skipped level reads as a missing section: they cannot tell whether they missed something or whether the document simply has a gap.",
    standard:
      "Matterhorn Protocol 14 (Headings) · W3C technique G141 — a SUFFICIENT technique for 1.3.1, not a criterion. Skipping a heading level is not a WCAG 2.1 failure: the levels are still programmatically determinable.",
    links: links(matterhornLink("14"), techniqueLink("G141")),
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no heading-structure data for this document.",
          "not-run",
        );
      }
      // ORDER IS LOAD-BEARING: pdf.ts:924 pushes the "logical hierarchy"
      // line unconditionally — it sits after the gap check (:906-913) with
      // no return in between, so a gapped document carries it TOO. The
      // gaps check must stay above the MET check or a gapped document
      // reads as passing.
      // TWO NEEDLES, ONE PER ERA'S HALF OF THE SENTENCE. v1.136.0 reworded
      // this line's middle as well as its prefix — pre-2026-08-29 stored
      // reports carry "Found 6 heading tags, but the HIERARCHY has gaps",
      // today's carry "…but the LEVEL ORDER has gaps". The clause either
      // side of the change is identical in both, so match on that.
      const gaps = matchAdvisory(ctx, "heading tags, but the", "has gaps");
      if (gaps) {
        // Scan ALL findings, not one signal group: "--- Heading Outline
        // ---" (common.ts:423) opens a SECOND group right after the
        // Heading Tree flow line whenever pdfjs resolved any heading text,
        // and findings.ts's partitioner reassigns the open group on every
        // "---" line and never restores it — so these skip lines almost
        // always land in Heading Outline, not Heading Tree, on a real
        // document. Reading straight off ctx.findings sidesteps which
        // group they ended up in.
        const skips = ctx.findings
          .map((l) => l.trim())
          .filter((l) => l.startsWith("Heading hierarchy skip"));
        return {
          status: "not-met",
          evidence: [
            "The heading levels in this document skip at least one step.",
            ...skips.map((s) => s.replace(/^Heading hierarchy skip:\s*/, "Skips a level: ")),
          ],
          block: headingTreeBlock(ctx),
          fix: {
            source:
              "In Word or InDesign, apply the built-in heading styles in order — do not jump from Heading 1 to Heading 3 — then re-export with tags on.",
            app: "In Acrobat's Tags panel, renumber the heading tags so the levels never skip a step.",
          },
        };
      }
      // The positive line. Only the analyzer's own words earn a pass.
      if (matchMain(ctx, "heading tags with logical hierarchy")) {
        // MET here means only "no level is SKIPPED". A document can satisfy
        // that and still have seven H1s (H1→H1→H1→H2→H2→H1…): stepping back
        // up to a new top level is not a gap. Reported 2026-08-31 from a
        // real 51-page report — the tree printed under this row's green
        // check reads as an endorsement of the whole outline, while the
        // finding that actually applies sits in "One top-level heading".
        // Say so here rather than let the reader conclude the outline is
        // fine. scoring/pdf.ts:879 emits the count only above one.
        const h1Line = ctx.findings.find((l) => /^found \d+ h1 headings\b/i.test(l.trim()));
        const h1Count = firstNumber(h1Line ?? null);
        const alsoManyH1 =
          h1Line && h1Count !== null && h1Count > 1
            ? [
                `This document has ${h1Count} H1 headings, which is not a skipped level — stepping back up to a new top level leaves no gap. Whether that is worth changing is judged in "One top-level heading" above.`,
              ]
            : [];
        return {
          status: "met",
          evidence: ["Every heading level steps down one at a time.", ...alsoManyH1],
          block: headingTreeBlock(ctx),
        };
      }
      // scoring/pdf.ts:826-838 returns before the hierarchy line when every
      // heading is a generic <H>; heading-numbered-levels reads NOT MET off
      // that same advisory one row away, so "no finding" here was untrue.
      if (matchAdvisory(ctx, "only generic")) {
        return {
          status: "not-applicable",
          evidence: [
            'This document\'s headings are generic <H> tags with no numbered level, so level order cannot be assessed — see "Numbered heading levels".',
          ],
        };
      }
      // THE TWO LINES ARE NOT THE SAME FACT (2026-08-31 WCAG audit).
      // "No heading tags found in the document structure" (scoring/pdf.ts:777)
      // is the score-0, grade-F branch, and conformance.ts:479-491 attributes
      // it as a WCAG 1.3.1 Level A failure — the single largest deduction the
      // report can carry. Five of these cards used to answer "not applicable"
      // beside it, saying nothing about the score. "No headings were found.
      // Short documents may not need them" (scoring/pdf.ts:770) is a
      // different branch entirely: score null, not assessed, nothing lost.
      if (matchMain(ctx, "no heading tags")) {
        return {
          status: "not-applicable",
          evidence: [
            "This document has no heading tags at all, so there is no level order to check. That absence is counted in your score — see the action plan above, not this section.",
          ],
        };
      }
      if (matchMain(ctx, "no headings were found")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no headings, so there is no level order to check."],
        };
      }
      return notChecked("This report contains no finding about this document's heading levels.");
    },
  },
  {
    id: "heading-convention",
    advisorySince: "2026-08-26",
    formats: ["pdf"],
    categoryId: "heading_structure",
    label: "Consistent heading style",
    description:
      "A document should use one heading convention throughout — either numbered tags (H1–H6) or generic ones, not a mix of both.",
    why: "A generic heading tag carries no level. Wherever one sits among numbered headings, the depth a screen reader would announce is missing at exactly that point, even though a heading tag is present.",
    standard:
      "Matterhorn Protocol 14-002 (PDF/UA). WCAG 2.1 has no analogue: every heading here is still exposed as a heading with a determinable level, which is all 1.3.1 asks. Picking one convention is a PDF/UA consistency rule.",
    links: links(matterhornLink("14")),
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no heading-structure data for this document.",
          "not-run",
        );
      }
      // ORDER IS LOAD-BEARING: this advisory (pdf.ts:893) sits in the same
      // branch that later, unconditionally, pushes "Found N heading tags
      // with logical hierarchy" (pdf.ts:924) — no return in between, so a
      // document with mixed conventions carries BOTH lines. The mixed-
      // convention check must run before the MET check.
      const mixed = matchAdvisory(ctx, "generic <h> heading(s) appear alongside");
      if (mixed) {
        const count = firstNumber(mixed);
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count} heading${count === 1 ? "" : "s"} in this document ${count === 1 ? "uses" : "use"} the generic tag instead of a numbered one, alongside numbered headings elsewhere.`
              : "This document mixes generic heading tags with numbered ones (H1–H6).",
            "Wherever a generic tag sits, the level a screen reader would announce is missing.",
          ],
          fix: {
            source:
              "In Word or InDesign, apply the built-in numbered heading styles throughout — avoid a generic heading style — then re-export with tags on.",
            app: "In Acrobat's Tags panel, change each generic heading tag to the specific level (H1–H6) that matches its place in the outline.",
          },
        };
      }
      if (matchMain(ctx, "heading tags with logical hierarchy")) {
        return {
          status: "met",
          evidence: ["Every heading in this document uses the same, numbered convention."],
        };
      }
      // scoring/pdf.ts:826-838 returns before the hierarchy line when every
      // heading is a generic <H>; heading-numbered-levels reads NOT MET off
      // that same advisory one row away, so "no finding" here was untrue.
      if (matchAdvisory(ctx, "only generic")) {
        return {
          status: "not-applicable",
          evidence: [
            'This document\'s headings are generic <H> tags with no numbered level, so a heading convention cannot be assessed — see "Numbered heading levels".',
          ],
        };
      }
      // THE TWO LINES ARE NOT THE SAME FACT (2026-08-31 WCAG audit).
      // "No heading tags found in the document structure" (scoring/pdf.ts:777)
      // is the score-0, grade-F branch, and conformance.ts:479-491 attributes
      // it as a WCAG 1.3.1 Level A failure — the single largest deduction the
      // report can carry. Five of these cards used to answer "not applicable"
      // beside it, saying nothing about the score. "No headings were found.
      // Short documents may not need them" (scoring/pdf.ts:770) is a
      // different branch entirely: score null, not assessed, nothing lost.
      if (matchMain(ctx, "no heading tags")) {
        return {
          status: "not-applicable",
          evidence: [
            "This document has no heading tags at all, so there is no convention to check. That absence is counted in your score — see the action plan above, not this section.",
          ],
        };
      }
      if (matchMain(ctx, "no headings were found")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no headings, so there is no convention to check."],
        };
      }
      return notChecked(
        "This report contains no finding about this document's heading convention.",
      );
    },
  },
  {
    id: "heading-numbered-levels",
    formats: ["pdf"],
    categoryId: "heading_structure",
    label: "Numbered heading levels",
    description:
      "Heading tags should carry a specific level (H1, H2, H3…) rather than a single generic heading tag with no level at all.",
    why: 'A generic heading tag tells a screen reader "this is a heading" but not which level — the outline it builds has no depth, so someone navigating by heading cannot tell a top-level section from a subsection.',
    standard: "PDF/UA (ISO 14289) clause 7.4 · Matterhorn Protocol 14",
    links: links(matterhornLink("14")),
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no heading-structure data for this document.",
          "not-run",
        );
      }
      // No ordering hazard for the ALL-generic case: pdf.ts returns
      // immediately after pushing this advisory (the
      // `if (!hasNumberedHeadings)` branch ends in a `return`), so this
      // line and "heading tags with logical hierarchy" (pushed only later,
      // once levels are computed) never coexist in one document's findings.
      // TWO NEEDLES, ONE PER ERA (see heading-level-order): pre-2026-08-29
      // this line read "Only generic /H tags FOUND (not H1–H6)", today it
      // reads "only generic <H> tags WERE FOUND (not H1–H6)". "only generic"
      // and the parenthetical survive both.
      if (matchAdvisory(ctx, "only generic", "not h1–h6")) {
        return {
          status: "not-met",
          evidence: [
            "Every heading tag in this document is generic — none carries a specific level (H1–H6).",
            "The headings are announced as headings, but the outline they form has no depth.",
          ],
          fix: {
            source:
              "In Word or InDesign, apply the built-in numbered heading styles (Heading 1, Heading 2, …) instead of a single generic heading style, then re-export with tags on.",
            app: "In Acrobat's Tags panel, change each generic heading tag to the specific level (H1, H2, etc.) that matches the document outline.",
          },
        };
      }
      // ORDER IS LOAD-BEARING for the MIXED case: pdf.ts:924 needs only
      // hasNumberedHeadings, which a MIXED document also satisfies (it has
      // at least one numbered heading) — the mixed-convention advisory
      // (pdf.ts:893, genericHCount > 0) does not return, so both lines
      // coexist. Without this check a mixed document reads MET here
      // ("every heading tag carries a numbered level") while
      // heading-convention correctly reads NOT MET one row below it.
      const mixed = matchAdvisory(ctx, "generic <h> heading(s) appear alongside");
      if (mixed) {
        return {
          status: "not-met",
          evidence: [
            "Some heading tags in this document are generic rather than numbered — this document mixes the two conventions.",
            "A generic tag carries no level, so it does not count toward a fully numbered outline.",
          ],
          fix: {
            source:
              "In Word or InDesign, apply the built-in numbered heading styles throughout — avoid a generic heading style — then re-export with tags on.",
            app: "In Acrobat's Tags panel, change each generic heading tag to the specific level (H1–H6) that matches its place in the outline.",
          },
        };
      }
      if (matchMain(ctx, "heading tags with logical hierarchy")) {
        return {
          status: "met",
          evidence: ["Every heading tag in this document carries a specific, numbered level."],
        };
      }
      // THE TWO LINES ARE NOT THE SAME FACT (2026-08-31 WCAG audit).
      // "No heading tags found in the document structure" (scoring/pdf.ts:777)
      // is the score-0, grade-F branch, and conformance.ts:479-491 attributes
      // it as a WCAG 1.3.1 Level A failure — the single largest deduction the
      // report can carry. Five of these cards used to answer "not applicable"
      // beside it, saying nothing about the score. "No headings were found.
      // Short documents may not need them" (scoring/pdf.ts:770) is a
      // different branch entirely: score null, not assessed, nothing lost.
      if (matchMain(ctx, "no heading tags")) {
        return {
          status: "not-applicable",
          evidence: [
            "This document has no heading tags at all, so there are no levels to check. That absence is counted in your score — see the action plan above, not this section.",
          ],
        };
      }
      if (matchMain(ctx, "no headings were found")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no headings, so there are no levels to check."],
        };
      }
      return notChecked(
        "This report contains no finding about whether this document's headings carry numbered levels.",
      );
    },
  },
  {
    id: "heading-content",
    formats: ["pdf"],
    categoryId: "heading_structure",
    label: "Headings read as headings",
    description:
      "A heading tag should hold a short heading — not an empty tag, a sentence fragment, or an entire paragraph.",
    why: "Someone navigating by heading lands on whatever the tag contains. A heading tag with no text is silence; one holding a paragraph reads as a wall of words that says nothing about where they are.",
    // The most legally exposed row in this catalog, and it says so rather
    // than claiming to be settled (2026-08-31 WCAG audit): an EMPTY heading
    // is treated as a failure by mainstream tooling — WAVE maps empty_heading
    // to 1.3.1 Level A, and W3C failure F43 covers structural markup used for
    // presentation — while axe-core classes it best-practice, and the
    // fragment/paragraph members of this check really are heuristic.
    standard:
      "Contested. An empty heading is widely treated as a WCAG failure (1.3.1 Level A via W3C failure F43; a heading with no text also describes no topic or purpose under 2.4.6 Level AA), while other checkers class it a best practice. This tool does not score it, because its heading-text census is heuristic — do not read that as settled: have a person confirm any empty heading.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no heading-structure data for this document.",
          "not-run",
        );
      }
      // CORRECTED (round 2): this practice has NO positive analyzer line,
      // and cannot have one. "--- Do the Headings Read Like Headings? ---"
      // (analyzer :695) is pushed ONLY on the line AFTER
      // `if (!census || census.unusable === 0) return { score: 100,
      // findings: [] }` (:693) — so the group's presence REQUIRES
      // census.unusable > 0. A genuinely clean document takes the exact
      // same early return as a null census and never reaches the group at
      // all, so "group present" can never mean "content is fine" — it can
      // only mean "the census found at least one heading that does not
      // read as one", whether or not there were enough of them
      // (HEADING_MIN_UNUSABLE = 3) to move the score. Follow single-h1's
      // pattern: no MET branch, ever.
      //
      // Key NOT MET off the group's own count lines (the same `details`
      // this practice already surfaces as evidence) rather than the "may
      // not read as headings" advisory: that advisory is added only when
      // contentVerdict.score < 100 (:915), so a document with real but
      // too-few-to-score bad headings — 3 empty headings out of 40, say —
      // carried the count lines without ever tripping the advisory, and a
      // matcher keyed on the advisory text alone missed it. This is the
      // same band-coverage rekey already applied to character-mapping and
      // content-in-tag-tree.
      const details = signalLines(ctx, "Do the Headings Read Like Headings").filter((l) =>
        /^\d/.test(l),
      );
      if (details.length > 0) {
        return {
          status: "not-met",
          evidence: [
            "Some heading tags in this document hold content that does not read like a heading — empty, a cut-off fragment, or a full paragraph.",
            ...details,
          ],
          fix: {
            source:
              "Re-export from the source document with its real heading styles applied to short, descriptive heading text.",
            app: "In Acrobat's Tags panel, open each flagged heading and retag it by hand — split an oversized one, or move real heading text into an empty one.",
          },
        };
      }
      // THE TWO LINES ARE NOT THE SAME FACT (2026-08-31 WCAG audit).
      // "No heading tags found in the document structure" (scoring/pdf.ts:777)
      // is the score-0, grade-F branch, and conformance.ts:479-491 attributes
      // it as a WCAG 1.3.1 Level A failure — the single largest deduction the
      // report can carry. Five of these cards used to answer "not applicable"
      // beside it, saying nothing about the score. "No headings were found.
      // Short documents may not need them" (scoring/pdf.ts:770) is a
      // different branch entirely: score null, not assessed, nothing lost.
      if (matchMain(ctx, "no heading tags")) {
        return {
          status: "not-applicable",
          evidence: [
            "This document has no heading tags at all, so there is no content to check. That absence is counted in your score — see the action plan above, not this section.",
          ],
        };
      }
      if (matchMain(ctx, "no headings were found")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no headings, so there is no content to check."],
        };
      }
      return notChecked("This report contains no finding about heading content for this document.");
    },
  },
  {
    id: "single-h1",
    formats: ["pdf"],
    categoryId: "heading_structure",
    label: "One top-level heading",
    description:
      "Many style guides recommend a single H1 — the document title — with every section demoted to H2 and below, so the outline has one root.",
    why: "This is a style convention, not a rule: PDF/UA explicitly permits repeated H1s in a document with clear underlying structure, and no WCAG criterion requires just one. A single top-level heading simply gives the outline one clear starting point.",
    links: [],
    standard:
      "No WCAG 2.1 criterion mentions H1 counts, and PDF/UA permits repeated H1s. axe-core classes the equivalent HTML rule (page-has-heading-one) a best practice, not a WCAG rule.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no heading-structure data for this document.",
          "not-run",
        );
      }
      // The analyzer only speaks up when the count is above one — it is
      // silent for a document with exactly one H1 (or none), so unlike the
      // other heading practices this one has no positive line to confirm a
      // pass against. Per the project's rule, silence stays NOT CHECKED
      // rather than being inferred as MET from a weaker, indirect signal.
      // Anchored on the line's own start, not a bare "h1 headings"
      // substring — a heading OUTLINE line quoting a document's real
      // heading text ('  H2 "Understanding H1 Headings in Reports"')
      // could otherwise contain that exact phrase and false-trigger this
      // practice from unrelated document content.
      const found = ctx.findings.find((l) => /^found \d+ h1 headings\b/i.test(l.trim()));
      const count = firstNumber(found ?? null);
      if (found && count !== null && count > 1) {
        return {
          status: "not-met",
          evidence: [
            `This document has ${count} H1 headings rather than one.`,
            "That is not a standards violation — it simply means the outline has more than one top-level entry point.",
          ],
          // The user's canonical example — "heading order: h1->h2->h1->h1" —
          // is exactly this case: no level GAP, so heading-level-order reads
          // MET, and THIS is the row that flags it. The sequence belongs
          // beside the sentence it explains, not three rows away.
          block: headingTreeBlock(ctx),
          fix: {
            source:
              "In the source document, demote every H1 after the first to H2 (or lower), keeping one top-level heading for the document title.",
            app: "In Acrobat's Tags panel, change each extra H1 tag to H2 or the level matching its place in the outline.",
          },
        };
      }
      // THE TWO LINES ARE NOT THE SAME FACT (2026-08-31 WCAG audit).
      // "No heading tags found in the document structure" (scoring/pdf.ts:777)
      // is the score-0, grade-F branch, and conformance.ts:479-491 attributes
      // it as a WCAG 1.3.1 Level A failure — the single largest deduction the
      // report can carry. Five of these cards used to answer "not applicable"
      // beside it, saying nothing about the score. "No headings were found.
      // Short documents may not need them" (scoring/pdf.ts:770) is a
      // different branch entirely: score null, not assessed, nothing lost.
      if (matchMain(ctx, "no heading tags")) {
        return {
          status: "not-applicable",
          evidence: [
            "This document has no heading tags at all, so there is no H1 count to check. That absence is counted in your score — see the action plan above, not this section.",
          ],
        };
      }
      if (matchMain(ctx, "no headings were found")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no headings, so there is no H1 count to check."],
        };
      }
      return notChecked("This report contains no finding about this document's H1 count.");
    },
  },
  {
    id: "reading-order-fidelity",
    advisorySince: "2026-07-19",
    formats: ["pdf"],
    categoryId: "reading_order",
    label: "Reading order matches the layout",
    description:
      "The order screen readers announce content in should agree with the order the page draws it in — or where it does not, that divergence should have been reviewed.",
    why: "When the tagged order and the drawing order disagree, assistive technology and a sighted reviewer can end up looking at content in a different sequence, which makes it hard for anyone to confirm a document reads correctly.",
    // "WCAG technique for 1.3.2" borrowed W3C's authority for a home-grown
    // metric — no such technique exists (PDF3 is an authoring action, not a
    // similarity measure), and techniques are never requirements anyway.
    standard:
      "Relates to WCAG 1.3.2 Meaningful Sequence (Level A), but is not a conformance test: this is a heuristic comparison of tag order against draw order. Divergence does not by itself fail 1.3.2, and agreement does not establish conformance.",
    wcagSlugs: [{ slug: "meaningful-sequence", label: "WCAG 1.3.2: Meaningful Sequence" }],
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report has no reading-order data for this document.", "not-run");
      }
      // THREE-WAY ORDER HAZARD: pdf.ts pushes "Reading-order fidelity: N%…"
      // unconditionally whenever a rigorous comparison ran at all — before
      // both the form check and the score<100 check, with no return
      // separating any of the three. A form, a low-fidelity document, AND a
      // clean document all carry that line. Check N/A (form) first, then
      // NOT MET (score<100), and only THEN treat the bare percentage line
      // as confirmation of a genuine pass.
      if (matchMain(ctx, "it is a form")) {
        return {
          status: "not-applicable",
          evidence: [
            "This document is a form. Field captions and widgets are painted after the rest of the page, so comparing draw order to reading order does not mean anything here.",
          ],
        };
      }
      const drift = matchAdvisory(ctx, "tagged order agreed with the content stream");
      if (drift) {
        // NOT firstNumber: version-blind. Pre-2026-08-29 this line opened
        // "Reading order scored 72/100 — the tagged order agreed … on 84% of
        // comparable content", so the FIRST number is the old score, not the
        // similarity — a stored report would have been told its tagged order
        // agreed on "72%" of content it actually agreed on 84% of. The clause
        // "draw order on N%" is identical in both eras; read the number off
        // that, and render countless when it cannot be read.
        const pctMatch = /draw order on (\d[\d,]*)%/i.exec(drift);
        const pct = firstNumber(pctMatch?.[1] ?? null);
        return {
          status: "not-met",
          evidence: [
            pct !== null
              ? `The tagged reading order agreed with the page's draw order on ${pct}% of comparable content.`
              : "The tagged reading order diverges from the page's draw order in parts of this document.",
            "That is not automatically wrong — a document can be deliberately re-ordered away from a messy draw order — but it is worth checking with a screen reader or a reading-order tool.",
          ],
          fix: {
            source:
              "Confirm the intended reading order in the source document before re-exporting.",
            app: "In Acrobat, open the Order panel or Fix reading order tool and compare the tag sequence against the visual layout.",
          },
        };
      }
      if (matchMain(ctx, "reading-order fidelity")) {
        return {
          status: "met",
          evidence: ["The tagged reading order agrees closely with the page's draw order."],
        };
      }
      return notChecked(
        "This report contains no finding about this document's reading-order fidelity.",
      );
    },
  },
  {
    id: "bookmarks",
    formats: ["pdf"],
    categoryId: "bookmarks",
    label: "Bookmarks for navigation",
    description:
      "A long document is easier to navigate with bookmarks (a clickable outline) than by scrolling or paging through it from the start.",
    why: "Bookmarks let every reader — screen-reader users included — jump straight to a section instead of stepping through everything before it.",
    standard: "No WCAG 2.1 criterion requires bookmarks in a single document",
    // A bare "WCAG 2.4.5" link under a row the standard field says no
    // criterion governs reads as the governing rule. 2.4.5 is about a SET of
    // pages; WCAG2ICT maps it to a set of documents, not to navigation
    // inside one.
    wcagSlugs: [
      {
        slug: "multiple-ways",
        label: "WCAG 2.4.5: Multiple Ways — applies to sets of pages, not within one document",
      },
    ],
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report contains no bookmark data for this document.", "not-run");
      }
      // pageCount === 0 is not "a zero-page document" — buildContext
      // defaults an absent/unreadable pageCount field to 0 (types.ts), and
      // a real stored report can carry that default. Treating 0 as a short
      // document invents a document fact ("too short for bookmarks") from
      // data that was never read at all; it belongs with the other
      // not-checked defaults, not with a genuinely short 1-9 page document.
      // scoring/pdf.ts:1444-1459 — an /Outlines with no entries scores the
      // category 40 (a Moderate deduction with its own plan step). Not this
      // section's to call "optional".
      if (matchMain(ctx, "outline structure present but contains no entries")) {
        return {
          status: "not-applicable",
          evidence: [
            "This document has a bookmark outline with no entries in it. That is counted in your score — see the action plan above, not this section.",
          ],
        };
      }
      // The analyzer's own short-document line (scoring/pdf.ts:1412) — a
      // document fact, and the right answer even when a stored pageCount is 0.
      if (matchMain(ctx, "bookmarks are not required")) {
        return {
          status: "not-applicable",
          evidence: ["This document is short enough that bookmarks are not required."],
        };
      }
      if (ctx.pageCount > 0 && ctx.pageCount < ANALYSIS.BOOKMARKS_PAGE_THRESHOLD) {
        return {
          status: "not-applicable",
          evidence: [
            `This document has ${ctx.pageCount} page${ctx.pageCount === 1 ? "" : "s"} — too short for bookmarks to matter.`,
          ],
        };
      }
      // TWO NEEDLES, ONE PER ERA (see heading-level-order): pre-2026-08-29
      // this line read "Document has 20 pages BUT no bookmarks", today it
      // reads "this document has 20 pages AND no bookmarks". The conjunction
      // is the only word that moved. No other bookmarks finding in either
      // era carries both halves — the short-document line says "bookmarks
      // are not required", never "no bookmarks".
      const missing = matchAdvisory(ctx, "pages", "no bookmarks");
      if (missing) {
        return {
          status: "not-met",
          evidence: [
            `This ${ctx.pageCount}-page document has no bookmarks.`,
            "Nothing in WCAG 2.1 requires them for a single document, but a long PDF without them is markedly harder to move around in.",
          ],
          fix: {
            source:
              "Build the document with heading styles applied, so bookmarks can be generated from them.",
            app: "In Acrobat's Bookmarks panel, create bookmarks for each major section, or auto-generate them from heading tags (Options → New Bookmarks From Structure).",
          },
        };
      }
      // The analyzer speaks up on failure and on the not-required cases; the
      // MET line ("N bookmark(s) found") is the only positive text it ever
      // emits for this category, so it is the one this practice matches.
      const found = matchMain(ctx, "bookmark(s) found");
      if (found) {
        return {
          status: "met",
          evidence: [found],
          block: blockFrom(ctx, "Bookmark Outline", "This document's bookmarks"),
        };
      }
      return notChecked("This report contains no finding about this document's bookmarks.");
    },
  },
  {
    id: "font-embedding",
    formats: ["pdf"],
    categoryId: "text_extractability",
    label: "Fonts are embedded",
    description:
      "Every font a document uses to display visible text should be embedded in the file, not just referenced by name.",
    why: "A font that is not embedded may be substituted on a system that does not have it installed, which can make the displayed text garbled or unreadable — this is a rendering concern, not a screen-reader one, since substitution does not affect what gets read aloud.",
    standard: "PDF/UA (ISO 14289) clause 7.21 · Matterhorn Protocol 31",
    links: links(matterhornLink("31")),
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no text-extractability data for this document.",
          "not-run",
        );
      }
      // No ordering hazard: re-verified against pdf.ts (the source of the
      // fixtures below) — the font-embedding block is a plain
      // if (flagged) / else if (exempt) / else (all embedded) chain, so
      // "non-embedded font(s)" (NOT MET) can never coexist with either MET
      // line in one document's findings.
      const flagged = matchAdvisory(ctx, "non-embedded font(s)");
      if (flagged) {
        const count = firstNumber(flagged);
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count} font${count === 1 ? "" : "s"} that ${count === 1 ? "displays" : "display"} visible text in this document ${count === 1 ? "is" : "are"} not embedded.`
              : "Some fonts that display visible text in this document are not embedded.",
          ],
          block: blockFrom(ctx, "Font Embedding", "Fonts used in this document"),
          fix: {
            source:
              "In the source application (Word, InDesign), enable font embedding before exporting to PDF.",
            app: "In Acrobat, check Document properties → Fonts tab for embedding status, then re-export from the source with embedding turned on — fonts cannot be embedded after the fact in Acrobat alone.",
          },
        };
      }
      if (matchMain(ctx, "all fonts are embedded")) {
        return {
          status: "met",
          evidence: ["Every font used to display text in this document is embedded."],
        };
      }
      // A second, narrower positive line: some fonts are not embedded, but
      // none of them ever paints visible text (typically leftover
      // whitespace runs from the source word processor) — matchMain's
      // needles must ALL occur in one line, and this line's extra words
      // ("used to display text") mean the needle above never matches it,
      // so it needs its own check or a document that genuinely passes
      // reads NOT CHECKED instead.
      if (matchMain(ctx, "all fonts used to display text are embedded")) {
        return {
          status: "met",
          evidence: [
            "Every font that actually puts text on the page is embedded.",
            "A few font entries are not embedded, but they never display visible text — usually leftover spacing from the program the document came from — so they cannot change how it looks or reads.",
          ],
        };
      }
      return notChecked("This report contains no finding about this document's font embedding.");
    },
  },
  {
    id: "display-doc-title",
    formats: ["pdf"],
    categoryId: "title_language",
    label: "Document title shown in viewers",
    description:
      "A PDF can be set to show its own descriptive title in the viewer's title bar and tabs, instead of the filename.",
    why: 'Screen readers announce whatever the viewer displays first. Without this preference set, someone opening the file hears the filename ("report_v3_final.pdf") instead of a title that says what the document actually is.',
    // The internal inconsistency this row must not hide: when the /Title
    // merely LOOKS like a filename, scoring/pdf.ts:423 gives 25/50 and
    // conformance.ts:462-469 records a 2.4.2 / F25 Level A failure. With this
    // flag off the reader is handed the actual filename — the same outcome,
    // full credit. Defensible (2.4.2 asks for a title, which exists), but the
    // row may not present it as settled.
    standard:
      "PDF/UA (ISO 14289) clause 7.1. WCAG's own PDF technique for 2.4.2 (PDF18) sets this flag too, and some evaluators record a 2.4.2 (Level A) failure when the viewer shows the filename. This tool does not count it, because 2.4.2 asks that the document have a title — and it does.",
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no title-and-language data for this document.",
          "not-run",
        );
      }
      // Needle stops before the word that moved: pre-2026-08-29 this line
      // read "the DisplayDocTitle viewer preference is NOT — viewers will
      // show the filename", today "…is OFF, so viewers show the FILENAME".
      // The other DisplayDocTitle line ("shown by viewers — DisplayDocTitle
      // is set") does not contain "viewer preference is", so this stays as
      // narrow as it was.
      const off = matchAdvisory(ctx, "displaydoctitle viewer preference is");
      if (off) {
        return {
          status: "not-met",
          evidence: [
            "This document has a descriptive title set, but viewers are not told to display it — they show the filename instead.",
          ],
          fix: {
            source: "This is a viewer-preference flag, not something the source document controls.",
            app: "In Acrobat, open Document properties → Initial View tab → set Show: Document Title, then save.",
          },
        };
      }
      // Deliberately narrower than a bare "title" search: "No document title
      // found in metadata" and the filename-like-title line both also
      // contain the word "title" and would otherwise read as a pass for a
      // document with no usable title at all.
      if (matchMain(ctx, "displaydoctitle is set")) {
        return {
          status: "met",
          evidence: ["This document's descriptive title is shown by viewers, not its filename."],
        };
      }
      return notChecked(
        "This report contains no finding about whether this document's viewers display its title.",
      );
    },
  },
  {
    id: "table-scope-simple",
    formats: ["pdf"],
    categoryId: "table_markup",
    label: "Table header scope",
    description:
      "Each header cell in a table can be marked to say exactly which row or column of data it labels — an attribute called /Scope. It spells out, for a screen reader, what a sighted reader sees at a glance from the table's layout.",
    why: "For a simple table with headers along one edge, a screen reader can already work out which header goes with which cell from the table's shape alone. Adding /Scope explicitly is extra insurance for the few screen readers that need it spelled out rather than inferred.",
    standard: "PDF/UA (ISO 14289) · Matterhorn Protocol 15",
    links: links(matterhornLink("15")),
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no table-markup data for this document.",
          "not-run",
        );
      }
      const na = tableNotApplicable(ctx, true);
      if (na) return na;
      const scored = scopeScoredFailure(ctx);
      if (scored) return scored;
      const advisory = matchAdvisory(ctx, "header cell(s) across", "have no /scope");
      if (advisory) {
        const m = /(\d+) header cell\(s\) across (\d+) table\(s\)/.exec(advisory);
        return {
          status: "not-met",
          evidence: [
            m
              ? `${m[1]} header cell${m[1] === "1" ? "" : "s"} across ${m[2]} table${m[2] === "1" ? "" : "s"} ${m[1] === "1" ? "has" : "have"} no /Scope attribute.`
              : "Some header cells in this document's tables have no /Scope attribute.",
            "Each of those tables has headers along a single edge with nothing spanned, so the relationship is already clear without it.",
          ],
          fix: {
            source:
              "In Word, select the table and tick Table Design → Header Row before exporting — Word writes the scopes for you.",
            app: 'In Acrobat, open the Table Editor for the table, right-click the header cells → Table Cell Properties → set Scope ("Column" or "Row").',
          },
        };
      }
      if (matchMain(ctx, "all <th> cells have scope attributes")) {
        return {
          status: "met",
          evidence: ["Every header cell in this document's tables carries a /Scope attribute."],
        };
      }
      return notChecked(
        "This report contains no finding about this document's table header scope.",
      );
    },
  },
  {
    id: "table-scope-with-headers",
    advisorySince: "2026-07-19",
    formats: ["pdf"],
    categoryId: "table_markup",
    label: "Complex table header association",
    description:
      "A table whose headers run along more than one edge, or that has spanned cells, can associate its data cells with headers using either /Scope or the explicit /Headers attribute.",
    why: "Either technique makes the header-to-data relationship determinable by software. Adding /Scope as well, even where /Headers already covers it, is belt-and-braces for viewers with partial /Headers support.",
    standard: "PDF/UA (ISO 14289) · Matterhorn Protocol 15",
    links: links(matterhornLink("15")),
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no table-markup data for this document.",
          "not-run",
        );
      }
      const na = tableNotApplicable(ctx, true);
      if (na) return na;
      const scored = scopeScoredFailure(ctx);
      if (scored) return scored;
      // ORDER IS LOAD-BEARING: this advisory only fires when at least one
      // table lacks /Scope, which forces the SAME "all tables associate…"
      // line this practice treats as MET into the same findings array (the
      // /Scope-only variant of that line requires every table to have
      // /Scope, which cannot be true here). The advisory check must run
      // first, or a document using /Headers-without-Scope reads as
      // untouched by this practice's own concern.
      const advisory = matchAdvisory(ctx, "rely on /headers associations without /scope");
      if (advisory) {
        const count = firstNumber(advisory);
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count} table${count === 1 ? "" : "s"} in this document ${count === 1 ? "associates" : "associate"} headers with data cells using /Headers, without also setting /Scope.`
              : "Some tables in this document associate headers using /Headers, without also setting /Scope.",
            // qpdfStructTree.ts:497-499 sets hasHeaderAssociation from ANY
            // cell carrying /Headers, and never resolves the references. So
            // "spec-correct" was a conclusion the analyzer never reached.
            "Where those /Headers references are complete and point at real header cells, that is spec-correct on its own and /Scope is optional extra insurance. This tool does not resolve the references — on a table with headers on more than one edge, confirm them in Acrobat's Table Editor.",
          ],
          fix: {
            source: "No change is required in the source document — this is an optional addition.",
            app: "In Acrobat's Table Editor, header cells that already carry /Headers can also be given a /Scope value for broader viewer support.",
          },
        };
      }
      // scoring/pdf.ts:1683-1687 emits exactly one of two lines when every
      // table passes: "All <TH> cells have Scope attributes…" (scopeOnly) or
      // "All tables associate data cells with headers (via /Scope or the
      // explicit /Headers attribute)". The second is satisfied by
      // `associated(t) || t.simpleHeaderLayout` (:1671) — an UNSCOPED simple
      // table counts — so it coexists with the simple-scope advisory (:1692)
      // and is not, on its own, proof of association. controls/synthetic-121
      // is exactly that shape: table-scope-simple NOT MET, and this row used
      // to read MET one line below it.
      if (matchMain(ctx, "all <th> cells have scope attributes")) {
        return {
          status: "met",
          evidence: ["Every header cell in this document's tables carries a /Scope attribute."],
        };
      }
      if (matchMain(ctx, "all tables associate data cells with headers")) {
        if (matchAdvisory(ctx, "header cell(s) across", "have no /scope")) {
          return notChecked(
            "Some of this document's tables are simple ones with no /Scope; this report does not establish whether any complex table uses /Headers without /Scope.",
          );
        }
        return {
          status: "met",
          evidence: [
            "Every table in this document associates its data cells with headers, using /Scope or the explicit /Headers attribute.",
          ],
        };
      }
      return notChecked(
        "This report contains no finding about this document's complex table header association.",
      );
    },
  },
  {
    id: "nested-tables",
    formats: ["pdf"],
    categoryId: "table_markup",
    label: "No nested tables",
    description: "A table should not contain another table nested inside one of its cells.",
    why: "A properly tagged nested table still has determinable relationships, so it is not a WCAG failure — but it is genuinely difficult to navigate by keyboard or screen reader, one table inside another.",
    // NOT Matterhorn 15: the repo's own checkpoint data (data/matterhorn.ts)
    // defines 15 as "Tables declare header cells and associate data cells
    // with them" — nothing about nesting. Neither rulebook forbids a nested
    // table, so this row cites no standard at all.
    standard: "No standard forbids nesting — a navigability recommendation only",
    links: links(matterhornLink("15")),
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no table-markup data for this document.",
          "not-run",
        );
      }
      const na = tableNotApplicable(ctx, false);
      if (na) return na;
      if (matchAdvisory(ctx, "a nested table is not a wcag failure")) {
        return {
          status: "not-met",
          evidence: [
            "At least one table in this document contains another table nested inside it.",
            "It is still properly tagged and its relationships are determinable, but nesting makes it hard to navigate.",
          ],
          fix: {
            source:
              "Restructure the source so the content is a single flat table, or split it into separate tables.",
            app: "In Acrobat's Tags panel, flatten the nested <Table> into the parent table, or split it out as its own table.",
          },
        };
      }
      // The analyzer's own dedicated line for this exact condition — not
      // the row-structure line, which measures a different thing (<TR>
      // presence) and is present or absent independently of nesting.
      if (matchMain(ctx, "no nested tables detected")) {
        return {
          status: "met",
          // The analyzer counts nesting over multi-column DATA tables only
          // (scoring/pdf.ts:1742 filters dataTables; a single-column table is
          // "layout, not scored" at :1561 and skipped). A nested table inside
          // a layout table therefore still yields "No nested tables detected".
          // The sentence claims exactly what was measured — no more.
          evidence: [
            "None of this document's data tables contains another table nested inside it.",
            "Single-column layout tables are not checked for nesting.",
          ],
        };
      }
      return notChecked(
        "This report contains no finding about whether this document's tables are nested.",
      );
    },
  },
  {
    id: "descriptive-link-text",
    formats: ["pdf"],
    categoryId: "link_quality",
    label: "Descriptive link text",
    description:
      'A link\'s visible text should describe where it goes — not a vague phrase like "click here" or "read more".',
    why: 'Screen-reader users often pull up a bare list of every link on a page. "Click here" repeated ten times in that list says nothing about where any of them go; a descriptive label does.',
    // The full legal position, restored from the analyzer's own advisory
    // (scoring/pdf.ts:1952) after the 2026-08-31 WCAG audit found this
    // summary had kept only its second half. Saying just "2.4.9 is AAA"
    // reads as "the law is silent about vague link text" — it is not.
    // W3C: "click here" / "read more" FAIL 2.4.4 (Level A) unless adequate
    // context is provided; context means the same paragraph, list item or
    // table cell. This is unscored because that context is not machine-
    // decidable, NOT because it falls outside the legal standard.
    standard:
      "WCAG 2.4.4 (Link Purpose, In Context) is Level A and does apply — but it is met when the surrounding sentence makes the purpose clear, which no automated check can weigh. Judging the link text on its own is 2.4.9, a AAA criterion outside the legal standard. Unscored for that reason, not because vague link text is always acceptable.",
    wcagSlugs: [
      { slug: "link-purpose-in-context", label: "WCAG 2.4.4: Link Purpose (In Context) — Level A" },
      { slug: "link-purpose-link-only", label: "WCAG 2.4.9: Link Purpose (Link Only) — AAA" },
    ],
    links: [],
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no link-quality data for this document.",
          "not-run",
        );
      }
      if (matchMain(ctx, "no links found in this document")) {
        return { status: "not-applicable", evidence: ["This document has no links."] };
      }
      const advisory = matchAdvisory(ctx, "link(s) use non-descriptive text");
      if (advisory) {
        const m = /(\d+) of (\d+) link\(s\)/.exec(advisory);
        return {
          status: "not-met",
          evidence: [
            m
              ? `${m[1]} of ${m[2]} link${m[2] === "1" ? "" : "s"} in this document ${m[1] === "1" ? "uses" : "use"} non-descriptive text — empty, a vague phrase, or too short to mean anything on its own.`
              : "Some links in this document use non-descriptive text.",
          ],
          block: blockFrom(
            ctx,
            "Links With Non-Descriptive Text",
            "Links with non-descriptive text",
          ),
          fix: {
            source:
              "In the source document, change the visible link text to something that describes the destination, then re-export.",
            app: "In Acrobat, use the Edit tool to change the visible link text in place.",
          },
        };
      }
      if (matchMain(ctx, "link(s) use descriptive text")) {
        return {
          status: "met",
          evidence: ["Every link in this document uses descriptive text."],
        };
      }
      return notChecked("This report contains no finding about this document's link text.");
    },
  },
  {
    id: "raw-url-link-text",
    formats: ["pdf"],
    categoryId: "link_quality",
    label: "Link text is not a raw URL",
    description:
      "A link's visible text can be the destination address itself, but a short descriptive label reads better in a list of links.",
    why: "A raw URL as link text does tell a screen reader where a link goes, so it meets WCAG 2.4.4 Link Purpose (In Context), Level A — a descriptive label is simply easier to listen to in a list of many links.",
    links: [],
    standard:
      "Satisfies WCAG 2.4.4 Link Purpose (In Context), Level A — the URL is the destination, so the purpose is determinable from the link text itself. Preferring a short label over the address is 2.4.9 (Link Only), a AAA criterion outside the legal standard.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no link-quality data for this document.",
          "not-run",
        );
      }
      if (matchMain(ctx, "no links found in this document")) {
        return { status: "not-applicable", evidence: ["This document has no links."] };
      }
      // Un-prefixed in the analyzer's own output in BOTH eras (main, not
      // notScored) — matchNotScored would never find this line, which is
      // why every advisory here reads through matchAdvisory. See the header.
      const raw = matchAdvisory(ctx, "use the raw url as their visible text");
      if (raw) {
        const count = firstNumber(raw);
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count} link${count === 1 ? "" : "s"} in this document ${count === 1 ? "uses" : "use"} the raw web address as ${count === 1 ? "its" : "their"} visible text.`
              : "Some links in this document use the raw web address as their visible text.",
            "This already satisfies the destination-is-determinable rule — a descriptive label is a readability nicety, not a fix for a failure.",
          ],
          block: blockFrom(ctx, "Raw URL Link Text", "Links using their raw web address as text"),
          fix: {
            source:
              "In the source document, replace the visible URL with a short label describing the destination, then re-export.",
            app: "In Acrobat, use the Edit tool to change the visible link text in place.",
          },
        };
      }
      if (matchMain(ctx, "link(s) use descriptive text")) {
        return {
          status: "met",
          evidence: ["No link in this document uses its raw web address as visible text."],
        };
      }
      return notChecked(
        "This report contains no finding about whether this document's links use raw web addresses as text.",
      );
    },
  },
  {
    id: "nested-structure-tree",
    advisorySince: "2026-08-29",
    formats: ["pdf"],
    categoryId: "reading_order",
    label: "Structure tree has real nesting",
    description:
      "A document's tag structure can nest sections inside each other — not just list every tag in one flat sequence.",
    why: "A flat tree still gives assistive technology a reading order, so it is not a failure — but nesting mirrors the document's real sections, which makes a long document far easier to navigate section by section.",
    links: [],
    standard:
      "No criterion requires a nested structure tree. WCAG 1.3.2 Meaningful Sequence (Level A) asks that a correct reading sequence be programmatically determinable — a flat tree still provides one.",
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report has no reading-order data for this document.", "not-run");
      }
      // Mutually exclusive with everything below: pdf.ts returns
      // immediately when there is no structure tree at all, before ever
      // reaching the depth line or the flatness check.
      if (matchMain(ctx, "no structure tree present")) {
        return {
          status: "not-applicable",
          evidence: [
            "This document has no structure tree at all, so there is no nesting to check.",
          ],
        };
      }
      // ORDER IS LOAD-BEARING: pdf.ts pushes "Structure tree depth: N
      // level(s)" unconditionally, before checking whether that depth is
      // flat — so a flat tree's findings contain BOTH the flat-tree
      // advisory AND text matching "structure tree depth". The flat check
      // must run first, or a flat tree reads as nested.
      // The leading article is dropped from the needle: pre-2026-08-29 the
      // line began the sentence ("Structure tree is flat (no meaningful
      // nesting) — …"); today the prefix pushed it mid-sentence ("…: THE
      // structure tree is flat (no meaningful nesting) — …").
      if (matchAdvisory(ctx, "structure tree is flat")) {
        return {
          status: "not-met",
          evidence: [
            "This document's tag structure is flat — a single sequence of tags rather than nested sections.",
            "It still gives assistive technology a reading order, so this is not a failure — nesting is a navigation improvement.",
          ],
          fix: {
            source:
              "No source-document change is required; this is a tagging/export structure, not content.",
            app: "In Acrobat, use Fix reading order (All tools → Prepare for accessibility → Fix reading order) to reorganize the tag structure into sections.",
          },
        };
      }
      const depthLine = matchMain(ctx, "structure tree depth");
      if (depthLine) {
        const depth = firstNumber(depthLine);
        return {
          status: "met",
          evidence: [
            depth !== null
              ? `This document's tag structure is nested ${depth} level${depth === 1 ? "" : "s"} deep.`
              : "This document's tag structure is genuinely nested, not flat.",
          ],
        };
      }
      return notChecked(
        "This report contains no finding about this document's structure tree nesting.",
      );
    },
  },
  {
    id: "character-mapping",
    formats: ["pdf"],
    categoryId: "text_extractability",
    label: "Text characters map to readable text",
    description:
      "Every extracted character should map to real, readable text — not a symbol-font glyph with no pronounceable meaning.",
    why: "A glyph that paints correctly on screen but extracts as a private-use symbol looks fine to a sighted reader and is unreadable to a screen reader — it has no word to announce.",
    // As content-in-tag-tree: conformance.ts:555-570 maps the larger bands
    // to WCAG 1.1.1 Level A, and they cap the category.
    standard:
      "Matterhorn Protocol 10 · A larger share of unmappable text is a WCAG 1.1.1 (Level A) failure and IS scored — only a small share is left unscored here.",
    links: links(matterhornLink("10")),
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no text-extractability data for this document.",
          "not-run",
        );
      }
      // The measurement line (pdf.ts, indented, inside this signal group)
      // is pushed UNCONDITIONALLY whenever unmappedChars > 0 — across all
      // three severity bands, including the worst one (>= 100 characters,
      // >= 5% of the text layer), which does NOT repeat "symbol-font
      // bullets or dingbats" at all. Keying only off that phrase (as this
      // practice once did) silently skipped the worst case: a document
      // with thousands of unreadable characters showed a grey "not
      // checked" row instead of a red one.
      const group = signalLines(ctx, "Character Mapping");
      const countLine = group.find((l) => /cannot be mapped to readable text/i.test(l));
      if (countLine) {
        const count = firstNumber(countLine);
        // scoring/pdf.ts:322-341 pushes the count line in every band. Only the
        // "symbol-font bullets" advisory (:335 un-indented, :339 indented)
        // marks the UNSCORED bands; the large band caps the category at 50 and
        // appears in the plan as a required fix — this section may not say
        // "does not change your score" beneath that.
        const advisory =
          matchAdvisory(ctx, "symbol-font bullets") ??
          group.find((l) => /symbol-font bullets/i.test(l));
        if (!advisory) {
          return {
            status: "not-applicable",
            evidence: [
              count !== null
                ? `${count.toLocaleString()} extracted character${count === 1 ? "" : "s"} in this document cannot be mapped to readable text. That is counted in your score — see the action plan above, not this section.`
                : "Some of this document's text cannot be mapped to readable text. That is counted in your score — see the action plan above, not this section.",
            ],
          };
        }
        const severe = false;
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count.toLocaleString()} extracted character${count === 1 ? "" : "s"} in this document cannot be mapped to readable text.`
              : "Some extracted characters in this document cannot be mapped to readable text.",
            severe
              ? "This is enough of the document's text that some of it may not reliably be read aloud or found by search, whatever the tagging says."
              : "This is often symbol-font bullets or dingbats, which read as decoration rather than words — worth a quick check with a screen reader if real words are affected.",
          ],
          fix: {
            source:
              "Re-export from the source application with standard fonts, or with the fonts used embedded.",
            app: severe
              ? "Run OCR over the affected pages: All tools → Scan & OCR → Recognize Text."
              : "Usually no action is needed. If a screen-reader check finds real words affected rather than decoration, re-export from the source with standard or embedded fonts.",
          },
        };
      }
      return notChecked(
        "This report contains no finding about character mapping for this document.",
      );
    },
  },
  {
    id: "content-in-tag-tree",
    formats: ["pdf"],
    categoryId: "text_extractability",
    label: "All visible text is tagged",
    description:
      "Every visible, non-decorative character on the page should sit inside the tag structure, not painted outside every tagged element.",
    why: "A screen reader follows the tags. Visible text painted outside all of them — neither in the reading order nor marked as a decorative artifact — is never encountered at all.",
    // The unscored band only. conformance.ts:530-548 attributes this exact
    // defect to WCAG 1.3.1 Level A once it passes the threshold, and the
    // larger bands cap the category — citing only the PDF industry's test
    // model presented a Level A matter as format etiquette.
    standard:
      "Matterhorn Protocol 01 · Above a small amount, untagged visible text is a WCAG 1.3.1 (Level A) failure and IS scored — only a very small amount is left unscored here.",
    links: links(matterhornLink("01")),
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked(
          "This report contains no text-extractability data for this document.",
          "not-run",
        );
      }
      // As with character-mapping: the measurement line is pushed
      // unconditionally across all three severity bands. Keying only off
      // "stray export residue" (the smallest band's own wording) silently
      // skipped the two worse bands, whose lines say "How to fix" and
      // "Review the named pages" instead — a document with a fifth of its
      // text outside the tag structure showed as not-checked rather than
      // not-met.
      const group = signalLines(ctx, "Content Outside the Tag Structure");
      const countLine = group.find((l) => /visible character\(s\)/.test(l));
      if (countLine) {
        const count = firstNumber(countLine);
        // scoring/pdf.ts:366-381 pushes the count line in every band; the
        // large band caps the category at 50 and the middle at 85 — both
        // scored, both in the plan. Only the "stray export residue" advisory
        // (:381, indented) marks the unscored band.
        const advisory = group.find((l) => /stray export residue/i.test(l));
        if (!advisory) {
          return {
            status: "not-applicable",
            evidence: [
              count !== null
                ? `${count.toLocaleString()} visible character${count === 1 ? "" : "s"} in this document ${count === 1 ? "sits" : "sit"} outside the tag structure. That is counted in your score — see the action plan above, not this section.`
                : "Some visible text in this document sits outside the tag structure. That is counted in your score — see the action plan above, not this section.",
            ],
          };
        }
        const severe = false;
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count.toLocaleString()} visible character${count === 1 ? "" : "s"} in this document ${count === 1 ? "sits" : "sit"} outside the tag structure.`
              : "A small amount of visible text in this document sits outside the tag structure.",
            severe
              ? "That is enough of the page's text that a screen reader following the tags would miss a meaningful amount of it."
              : "This is often stray export residue rather than missing content — worth a check on the named pages when convenient.",
          ],
          fix: {
            source:
              "Re-export from the source document; watermarks or crop marks are common causes.",
            app: "In Acrobat's Tags panel, tag the real content, or mark decorative text as an artifact.",
          },
        };
      }
      return notChecked(
        "This report contains no finding about whether this document has visible text outside the tag structure.",
      );
    },
  },
  {
    id: "list-labels",
    advisorySince: "2026-06-10",
    formats: ["pdf"],
    categoryId: "reading_order",
    label: "List item markers labeled",
    description:
      "A list item can carry its bullet or number as its own <Lbl> element, separate from the item's text.",
    why: "Optional, not required: without a labelled marker a screen reader still reads the item text, it just may not announce the bullet or number that goes with it.",
    standard: "ISO 32000-1 (optional) · Matterhorn Protocol 16",
    links: links(matterhornLink("16")),
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report has no reading-order data for this document.", "not-run");
      }
      if (matchMain(ctx, "no tagged lists detected")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no tagged lists, so there are no list labels to check."],
        };
      }
      // NOT a witness+silence inference (round 2 tried that and was wrong
      // — see task-7-report.md's fix-round-3 notes). The <Lbl> advisory
      // (supplementary.ts:204-206, "N list(s) have no <Lbl>…") is nested
      // INSIDE `if (wellFormed === qpdf.lists.length)` (:200) — a condition
      // about <LBody>, a different property from <Lbl> entirely
      // (qpdfService.ts:1561's own comment: "<Lbl> is deliberately NOT
      // required" for well-formedness). A document with a MALFORMED list
      // (missing <LBody>) that ALSO lacks <Lbl> takes the sibling `else`
      // branch (:207) and never emits the advisory at all — so "witness
      // present AND no advisory" is unsound here: it would report MET for
      // that document. The only sound signal is the PER-LIST lines
      // themselves (`  List N: … | <Lbl> ✓/✗ | …`, supplementary.ts:198),
      // which record each list's real <Lbl> status independent of <LBody>
      // well-formedness and independent of whether the summary advisory
      // fired. Reusing the exact lines the NOT MET branch below already
      // reads off signalLines, not a separate top-level match.
      const perList = signalLines(ctx, "List Structure Analysis").filter((l) => /^List\b/.test(l));
      const advisory = matchAdvisory(ctx, "have no <lbl>");
      // supplementary.ts:198 pushes one "<Lbl> ✓/✗" line PER LIST
      // unconditionally, from the same hasLabels field the advisory counts
      // (:205) — but that advisory sits inside the well-formedness check
      // (:200), so a malformed list with no labels never triggers it. The
      // glyph is the honest signal either way.
      const unlabeled = perList.filter((l) => l.includes("<Lbl> ✗"));
      if (advisory || unlabeled.length > 0) {
        const count = advisory ? firstNumber(advisory) : unlabeled.length;
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count} list${count === 1 ? "" : "s"} in this document ${count === 1 ? "has" : "have"} no <Lbl> (bullet/number) element on ${count === 1 ? "its" : "their"} items.`
              : "Some lists in this document have no <Lbl> (bullet/number) element on their items.",
            "This is optional under ISO 32000 and does not affect the score — adding it helps a screen reader announce each item's marker.",
          ],
          block: perList.length ? { caption: "This document's lists", lines: perList } : undefined,
          fix: {
            source:
              "Use the source application's real list formatting (bullets/numbering), not manually typed characters, then re-export.",
            app: "In Acrobat's Tags panel, add an <Lbl> child to each <LI> holding its marker text.",
          },
        };
      }
      // hasLabels is an ANY-quantifier per list (qpdfService.ts:1524-1526
      // sets it true the moment ONE <LI> in the list has a <Lbl> child), so
      // "<Lbl> ✓" means "this list has at least one labelled item" — never
      // "every item in it is labelled". `every` below therefore establishes
      // exactly one thing: every LIST carries the markers. The evidence
      // wording states that, and says which unit it was reported in, so it
      // cannot be read as a claim about every item.
      if (perList.length > 0 && perList.every((l) => l.includes("<Lbl> ✓"))) {
        return {
          status: "met",
          evidence: [
            "This document's lists were checked, and every list in it uses <Lbl> (bullet/number) markers — reported list by list, not item by item.",
          ],
        };
      }
      return notChecked("This report contains no finding about this document's list item labels.");
    },
  },
  {
    id: "footnote-ids",
    formats: ["pdf"],
    categoryId: "reading_order",
    label: "Footnotes linked by ID",
    description:
      "Each footnote or endnote tag should carry a unique /ID, and no two notes should share one.",
    why: "A unique /ID is what lets assistive technology link an in-text reference to its note and back again. Without one — or with a duplicate — that link cannot be made reliably.",
    standard:
      "Matterhorn Protocol 19 (PDF/UA clause 7.9). Not a WCAG 2.1 failure: the association between a reference and its note is normally carried by the matching visible numerals and by the link annotation, so the information is available in text — which satisfies 1.3.1.",
    links: links(matterhornLink("19")),
    detect(ctx) {
      if (categoryAbsent(ctx)) {
        return notChecked("This report has no reading-order data for this document.", "not-run");
      }
      const notes = signalLines(ctx, "Footnotes");
      const missing = notes.find((l) => l.toLowerCase().includes("note(s) have no /id"));
      const dup = notes.find((l) => l.toLowerCase().includes("note(s) reuse another note's /id"));
      if (missing || dup) {
        const evidence: string[] = [];
        const missingCount = firstNumber(missing ?? null);
        const dupCount = firstNumber(dup ?? null);
        if (missing) {
          evidence.push(
            missingCount !== null
              ? `${missingCount} note${missingCount === 1 ? "" : "s"} in this document ${missingCount === 1 ? "has" : "have"} no /ID.`
              : "Some notes in this document have no /ID.",
          );
        }
        if (dup) {
          evidence.push(
            dupCount !== null
              ? `${dupCount} note${dupCount === 1 ? "" : "s"} reuse${dupCount === 1 ? "s" : ""} another note's /ID.`
              : "Some notes in this document reuse another note's /ID.",
          );
        }
        return {
          status: "not-met",
          evidence,
          fix: {
            source:
              "Re-exporting from a current version of the source application commonly repairs this.",
            app: "In Acrobat's Tags panel, select each <Note> tag → Properties → set a unique ID.",
          },
        };
      }
      if (notes.some((l) => l.toLowerCase().includes("all notes carry a unique /id"))) {
        return {
          status: "met",
          evidence: ["Every footnote or endnote in this document carries a unique /ID."],
        };
      }
      return notChecked(
        "This report contains no finding about this document's footnote/endnote IDs.",
      );
    },
  },
];
