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
 */
import {
  matchAny,
  matchNotScored,
  signalLines,
  firstNumber,
  type BestPractice,
  type BestPracticeLink,
  type BestPracticeResult,
  type DetectContext,
} from "./types";
import { matterhornLink, techniqueLink } from "./links";

/** Drop null Matterhorn lookups (a checkpoint id the shipped protocol data
 *  does not define) instead of repeating a `.filter(...)` at every entry. */
const links = (...ls: Array<BestPracticeLink | null>): BestPracticeLink[] =>
  ls.filter((l): l is BestPracticeLink => l !== null);

/** The heading tree the analyzer prints as a technical signal — the exact
 *  "H1 → H2 → H1 → H1" sequence, lifted out of the collapsed panel and put
 *  next to the practice it is evidence for. */
function headingTreeBlock(ctx: DetectContext) {
  const lines = signalLines(ctx, "Heading Tree");
  // The first line is the level flow; the rest are the skip annotations.
  const flow = lines.find((l) => l.includes("→") && !l.startsWith("Heading hierarchy skip"));
  return flow ? { caption: "Your heading order, in document order", lines: [flow] } : undefined;
}

const notChecked = (why: string): BestPracticeResult => ({
  status: "not-checked",
  evidence: [why],
});

/** NOT APPLICABLE when the whole category is absent from this report, or
 *  the analyzer said outright that the document has none of the relevant
 *  subject matter — its own "No <thing> detected/found in this document"
 *  line. Only ever pass that FULL phrase: a bare "no tables" needle also
 *  matches "No tables have <TR> row structure…", a real FAILURE line, and
 *  would report a document with broken tables as having none at all. */
function categoryEmpty(ctx: DetectContext, noneLine?: string): boolean {
  if (!ctx.categoryPresent) return true;
  return noneLine ? matchAny(ctx, noneLine) !== null : false;
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
    standard: "Matterhorn Protocol 13-004 · WCAG technique G141",
    links: links(matterhornLink("13"), techniqueLink("G141")),
    detect(ctx) {
      // ORDER IS LOAD-BEARING: pdf.ts:924 pushes the "logical hierarchy"
      // line unconditionally — it sits after the gap check (:906-913) with
      // no return in between, so a gapped document carries it TOO. The
      // gaps check must stay above the MET check or a gapped document
      // reads as passing.
      const gaps = matchNotScored(ctx, "level order has gaps");
      if (gaps) {
        const skips = signalLines(ctx, "Heading Tree").filter((l) =>
          l.startsWith("Heading hierarchy skip"),
        );
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
      if (matchAny(ctx, "heading tags with logical hierarchy")) {
        return {
          status: "met",
          evidence: ["Every heading level steps down one at a time."],
          block: headingTreeBlock(ctx),
        };
      }
      if (matchAny(ctx, "no heading tags")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no heading tags, so there is no level order to check."],
        };
      }
      return notChecked("This document's heading levels were not evaluated.");
    },
  },
  {
    id: "heading-convention",
    formats: ["pdf"],
    categoryId: "heading_structure",
    label: "Consistent heading style",
    description:
      "A document should use one heading convention throughout — either numbered tags (H1–H6) or generic ones, not a mix of both.",
    why: "A generic heading tag carries no level. Wherever one sits among numbered headings, the depth a screen reader would announce is missing at exactly that point, even though a heading tag is present.",
    standard: "Matterhorn Protocol 14-002",
    links: links(matterhornLink("14")),
    detect(ctx) {
      // ORDER IS LOAD-BEARING: this advisory (pdf.ts:893) sits in the same
      // branch that later, unconditionally, pushes "Found N heading tags
      // with logical hierarchy" (pdf.ts:924) — no return in between, so a
      // document with mixed conventions carries BOTH lines. The mixed-
      // convention check must run before the MET check.
      const mixed = matchNotScored(ctx, "generic <h> heading(s) appear alongside");
      if (mixed) {
        const count = firstNumber(mixed);
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count} heading(s) in this document use the generic tag instead of a numbered one, alongside numbered headings elsewhere.`
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
      if (matchAny(ctx, "heading tags with logical hierarchy")) {
        return {
          status: "met",
          evidence: ["Every heading in this document uses the same, numbered convention."],
        };
      }
      if (matchAny(ctx, "no heading tags")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no heading tags, so there is no convention to check."],
        };
      }
      return notChecked("This document's heading convention was not evaluated.");
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
      // No ordering hazard here: pdf.ts returns immediately after pushing
      // this advisory (the `if (!hasNumberedHeadings)` branch ends in a
      // `return`), so this line and "heading tags with logical hierarchy"
      // (pushed only later, once levels are computed) never coexist in one
      // document's findings — unlike the other heading practices above.
      if (matchNotScored(ctx, "only generic <h> tags were found")) {
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
      if (matchAny(ctx, "heading tags with logical hierarchy")) {
        return {
          status: "met",
          evidence: ["Every heading tag in this document carries a specific, numbered level."],
        };
      }
      if (matchAny(ctx, "no heading tags")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no heading tags, so there are no levels to check."],
        };
      }
      return notChecked(
        "Whether this document's headings carry numbered levels was not evaluated.",
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
    links: [],
    detect(ctx) {
      // ORDER IS LOAD-BEARING: this advisory (pdf.ts:920, via
      // findings.unshift) sits in the same branch that unconditionally
      // pushes "Found N heading tags with logical hierarchy" (pdf.ts:924)
      // — no return in between, so a document with unreadable heading
      // content carries BOTH lines. The content check must run first.
      const unusable = matchNotScored(ctx, "may not read as headings");
      if (unusable) {
        const details = signalLines(ctx, "Do the Headings Read Like Headings").filter((l) =>
          /^\d/.test(l),
        );
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
      if (matchAny(ctx, "heading tags with logical hierarchy")) {
        return {
          status: "met",
          evidence: ["The heading tags in this document hold short, heading-like text."],
        };
      }
      if (matchAny(ctx, "no heading tags")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no heading tags, so there is no content to check."],
        };
      }
      return notChecked(
        "Whether this document's heading content reads as headings was not evaluated.",
      );
    },
  },
  {
    id: "single-h1",
    formats: ["pdf"],
    categoryId: "heading_structure",
    label: "One top-level heading",
    description:
      "Many style guides recommend a single H1 — the document title — with every section demoted to H2 and below, so the outline has one root.",
    why: "This is a style convention, not a rule: PDF/UA explicitly permits repeated H1s in a strongly structured document, and no WCAG criterion requires just one. A single top-level heading simply gives the outline one clear starting point.",
    links: [],
    detect(ctx) {
      // The analyzer only speaks up when the count is above one — it is
      // silent for a document with exactly one H1 (or none), so unlike the
      // other heading practices this one has no positive line to confirm a
      // pass against. Per the project's rule, silence stays NOT CHECKED
      // rather than being inferred as MET from a weaker, indirect signal.
      const found = matchAny(ctx, "h1 headings");
      const count = firstNumber(found);
      if (found && count !== null && count > 1) {
        return {
          status: "not-met",
          evidence: [
            `This document has ${count} H1 headings rather than one.`,
            "That is not a standards violation — it simply means the outline has more than one top-level entry point.",
          ],
          fix: {
            source:
              "In the source document, demote every H1 after the first to H2 (or lower), keeping one top-level heading for the document title.",
            app: "In Acrobat's Tags panel, change each extra H1 tag to H2 or the level matching its place in the outline.",
          },
        };
      }
      if (matchAny(ctx, "no heading tags")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no heading tags, so there is no H1 count to check."],
        };
      }
      return notChecked("This document's H1 count was not evaluated.");
    },
  },
  {
    id: "reading-order-fidelity",
    formats: ["pdf"],
    categoryId: "reading_order",
    label: "Reading order matches the layout",
    description:
      "The order screen readers announce content in should agree with the order the page draws it in — or where it does not, that divergence should have been reviewed.",
    why: "When the tagged order and the drawing order disagree, assistive technology and a sighted reviewer can end up looking at content in a different sequence, which makes it hard for anyone to confirm a document reads correctly.",
    standard: "WCAG technique for 1.3.2 (advisory measurement, not a scored check)",
    wcagSlugs: [{ slug: "meaningful-sequence", label: "WCAG 1.3.2: Meaningful Sequence" }],
    links: [],
    detect(ctx) {
      // THREE-WAY ORDER HAZARD: pdf.ts pushes "Reading-order fidelity: N%…"
      // unconditionally whenever a rigorous comparison ran at all — before
      // both the form check and the score<100 check, with no return
      // separating any of the three. A form, a low-fidelity document, AND a
      // clean document all carry that line. Check N/A (form) first, then
      // NOT MET (score<100), and only THEN treat the bare percentage line
      // as confirmation of a genuine pass.
      if (matchAny(ctx, "it is a form")) {
        return {
          status: "not-applicable",
          evidence: [
            "This document is a form. Field captions and widgets are painted after the rest of the page, so comparing draw order to reading order does not mean anything here.",
          ],
        };
      }
      const drift = matchNotScored(ctx, "tagged order agreed with the content stream");
      if (drift) {
        const pct = firstNumber(drift);
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
      if (matchAny(ctx, "reading-order fidelity")) {
        return {
          status: "met",
          evidence: ["The tagged reading order agrees closely with the page's draw order."],
        };
      }
      return notChecked("This document's reading-order fidelity was not evaluated.");
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
    wcagSlugs: [{ slug: "multiple-ways", label: "WCAG 2.4.5: Multiple Ways" }],
    links: [],
    detect(ctx) {
      if (ctx.pageCount < 10) {
        return {
          status: "not-applicable",
          evidence: [
            `This document has ${ctx.pageCount} page(s) — too short for bookmarks to matter.`,
          ],
        };
      }
      const missing = matchNotScored(ctx, "pages and no bookmarks");
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
      const found = matchAny(ctx, "bookmark(s) found");
      if (found) {
        return {
          status: "met",
          evidence: [found],
          block: (() => {
            const titles = signalLines(ctx, "Bookmark Outline");
            return titles.length
              ? { caption: "This document's bookmarks", lines: titles }
              : undefined;
          })(),
        };
      }
      return notChecked("This document's bookmarks were not evaluated.");
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
      // No ordering hazard: the analyzer's font-embedding block is a plain
      // if / else-if / else — exactly one of the three outcomes below is
      // ever pushed for a given document.
      const flagged = matchNotScored(ctx, "non-embedded font(s)");
      if (flagged) {
        const count = firstNumber(flagged);
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count} font(s) that display visible text in this document are not embedded.`
              : "Some fonts that display visible text in this document are not embedded.",
          ],
          block: (() => {
            const lines = signalLines(ctx, "Font Embedding");
            return lines.length ? { caption: "Fonts used in this document", lines } : undefined;
          })(),
          fix: {
            source:
              "In the source application (Word, InDesign), enable font embedding before exporting to PDF.",
            app: "In Acrobat, check Document properties → Fonts tab for embedding status, then re-export from the source with embedding turned on — fonts cannot be embedded after the fact in Acrobat alone.",
          },
        };
      }
      if (matchAny(ctx, "all fonts are embedded")) {
        return {
          status: "met",
          evidence: ["Every font used to display text in this document is embedded."],
        };
      }
      return notChecked("This document's font embedding was not evaluated.");
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
    standard: "PDF/UA (ISO 14289) clause 7.1",
    links: [],
    detect(ctx) {
      const off = matchNotScored(ctx, "displaydoctitle viewer preference is off");
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
      if (matchAny(ctx, "displaydoctitle is set")) {
        return {
          status: "met",
          evidence: ["This document's descriptive title is shown by viewers, not its filename."],
        };
      }
      return notChecked("Whether this document's viewers display its title was not evaluated.");
    },
  },
  {
    id: "table-scope-simple",
    formats: ["pdf"],
    categoryId: "table_markup",
    label: "Table header scope",
    description:
      "Beyond a bare header row or column, a table's header cells can carry a /Scope attribute stating which cells they label.",
    why: "For a simple table with headers along one edge, the header-to-data relationship is already clear from the table's shape. Adding /Scope anyway is extra insurance for viewers that need it spelled out.",
    standard: "PDF/UA (ISO 14289) · Matterhorn Protocol 15",
    links: links(matterhornLink("15")),
    detect(ctx) {
      if (categoryEmpty(ctx, "no tables detected in this document")) {
        return { status: "not-applicable", evidence: ["This document has no tables."] };
      }
      const advisory = matchNotScored(ctx, "header cell(s) across", "have no /scope");
      if (advisory) {
        const m = /(\d+) header cell\(s\) across (\d+) table\(s\)/.exec(advisory);
        return {
          status: "not-met",
          evidence: [
            m
              ? `${m[1]} header cell(s) across ${m[2]} table(s) have no /Scope attribute.`
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
      if (matchAny(ctx, "all <th> cells have scope attributes")) {
        return {
          status: "met",
          evidence: ["Every header cell in this document's tables carries a /Scope attribute."],
        };
      }
      return notChecked("This document's table header scope was not evaluated.");
    },
  },
  {
    id: "table-scope-with-headers",
    formats: ["pdf"],
    categoryId: "table_markup",
    label: "Complex table header association",
    description:
      "A table whose headers run along more than one edge, or that has spanned cells, can associate its data cells with headers using either /Scope or the explicit /Headers attribute.",
    why: "Either technique makes the header-to-data relationship determinable by software. Adding /Scope as well, even where /Headers already covers it, is belt-and-braces for viewers with partial /Headers support.",
    standard: "PDF/UA (ISO 14289) · Matterhorn Protocol 15",
    links: links(matterhornLink("15")),
    detect(ctx) {
      if (categoryEmpty(ctx, "no tables detected in this document")) {
        return { status: "not-applicable", evidence: ["This document has no tables."] };
      }
      // ORDER IS LOAD-BEARING: this advisory only fires when at least one
      // table lacks /Scope, which forces the SAME "all tables associate…"
      // line this practice treats as MET into the same findings array (the
      // /Scope-only variant of that line requires every table to have
      // /Scope, which cannot be true here). The advisory check must run
      // first, or a document using /Headers-without-Scope reads as
      // untouched by this practice's own concern.
      const advisory = matchNotScored(ctx, "rely on /headers associations without /scope");
      if (advisory) {
        const count = firstNumber(advisory);
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count} table(s) in this document associate headers with data cells using /Headers, without also setting /Scope.`
              : "Some tables in this document associate headers using /Headers, without also setting /Scope.",
            "That is complete and spec-correct on its own — adding /Scope as well is optional extra insurance.",
          ],
          fix: {
            source: "No change is required in the source document — this is an optional addition.",
            app: "In Acrobat's Table Editor, header cells that already carry /Headers can also be given a /Scope value for broader viewer support.",
          },
        };
      }
      if (matchAny(ctx, "all tables associate data cells with headers")) {
        return {
          status: "met",
          evidence: [
            "Every table in this document associates its data cells with headers, using /Scope or the explicit /Headers attribute.",
          ],
        };
      }
      return notChecked("This document's complex table header association was not evaluated.");
    },
  },
  {
    id: "nested-tables",
    formats: ["pdf"],
    categoryId: "table_markup",
    label: "No nested tables",
    description: "A table should not contain another table nested inside one of its cells.",
    why: "A properly tagged nested table still has determinable relationships, so it is not a standards failure — but it is genuinely difficult to navigate by keyboard or screen reader, one table inside another.",
    standard: "PDF/UA (ISO 14289) · Matterhorn Protocol 15",
    links: links(matterhornLink("15")),
    detect(ctx) {
      if (categoryEmpty(ctx, "no tables detected in this document")) {
        return { status: "not-applicable", evidence: ["This document has no tables."] };
      }
      if (matchNotScored(ctx, "a nested table is not a wcag failure")) {
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
      if (matchAny(ctx, "no nested tables detected")) {
        return {
          status: "met",
          evidence: ["No table in this document contains another table nested inside it."],
        };
      }
      return notChecked("Whether this document's tables are nested was not evaluated.");
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
    wcagSlugs: [{ slug: "link-purpose-link-only", label: "WCAG 2.4.9: Link Purpose (Link Only)" }],
    links: [],
    detect(ctx) {
      if (categoryEmpty(ctx, "no links found in this document")) {
        return { status: "not-applicable", evidence: ["This document has no links."] };
      }
      const advisory = matchNotScored(ctx, "link(s) use non-descriptive text");
      if (advisory) {
        const m = /(\d+) of (\d+) link\(s\)/.exec(advisory);
        return {
          status: "not-met",
          evidence: [
            m
              ? `${m[1]} of ${m[2]} link(s) in this document use non-descriptive text — empty, a vague phrase, or too short to mean anything on its own.`
              : "Some links in this document use non-descriptive text.",
          ],
          block: (() => {
            const lines = signalLines(ctx, "Links With Non-Descriptive Text");
            return lines.length ? { caption: "Links with non-descriptive text", lines } : undefined;
          })(),
          fix: {
            source:
              "In the source document, change the visible link text to something that describes the destination, then re-export.",
            app: "In Acrobat, use the Edit tool to change the visible link text in place.",
          },
        };
      }
      if (matchAny(ctx, "link(s) use descriptive text")) {
        return {
          status: "met",
          evidence: ["Every link in this document uses descriptive text."],
        };
      }
      return notChecked("This document's link text was not evaluated.");
    },
  },
  {
    id: "raw-url-link-text",
    formats: ["pdf"],
    categoryId: "link_quality",
    label: "Link text is not a raw URL",
    description:
      "A link's visible text can be the destination address itself, but a short descriptive label reads better in a list of links.",
    why: "A raw URL as link text does tell a screen reader where a link goes, so this already meets the letter of the rule — a descriptive label is simply easier to listen to in a list of many links.",
    links: [],
    detect(ctx) {
      if (categoryEmpty(ctx, "no links found in this document")) {
        return { status: "not-applicable", evidence: ["This document has no links."] };
      }
      // Un-prefixed in the analyzer's own output (main, not notScored) —
      // matchNotScored would never find this line. See the file header.
      const raw = matchAny(ctx, "use the raw url as their visible text");
      if (raw) {
        const count = firstNumber(raw);
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count} link(s) in this document use the raw web address as their visible text.`
              : "Some links in this document use the raw web address as their visible text.",
            "This already satisfies the destination-is-determinable rule — a descriptive label is a readability nicety, not a fix for a failure.",
          ],
          block: (() => {
            const lines = signalLines(ctx, "Raw URL Link Text");
            return lines.length
              ? { caption: "Links using their raw web address as text", lines }
              : undefined;
          })(),
          fix: {
            source:
              "In the source document, replace the visible URL with a short label describing the destination, then re-export.",
            app: "In Acrobat, use the Edit tool to change the visible link text in place.",
          },
        };
      }
      if (matchAny(ctx, "link(s) use descriptive text")) {
        return {
          status: "met",
          evidence: ["No link in this document uses its raw web address as visible text."],
        };
      }
      return notChecked(
        "Whether this document's links use raw web addresses as text was not evaluated.",
      );
    },
  },
  {
    id: "nested-structure-tree",
    formats: ["pdf"],
    categoryId: "reading_order",
    label: "Structure tree has real nesting",
    description:
      "A document's tag structure can nest sections inside each other — not just list every tag in one flat sequence.",
    why: "A flat tree still gives assistive technology a reading order, so it is not a failure — but nesting mirrors the document's real sections, which makes a long document far easier to navigate section by section.",
    links: [],
    detect(ctx) {
      // ORDER IS LOAD-BEARING: pdf.ts pushes "Structure tree depth: N
      // level(s)" unconditionally, before checking whether that depth is
      // flat — so a flat tree's findings contain BOTH the flat-tree
      // advisory AND text matching "structure tree depth". The flat check
      // must run first, or a flat tree reads as nested.
      if (matchNotScored(ctx, "the structure tree is flat")) {
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
      const depthLine = matchAny(ctx, "structure tree depth");
      if (depthLine) {
        const depth = firstNumber(depthLine);
        return {
          status: "met",
          evidence: [
            depth !== null
              ? `This document's tag structure is nested ${depth} level(s) deep.`
              : "This document's tag structure is genuinely nested, not flat.",
          ],
        };
      }
      return notChecked("This document's structure tree nesting was not evaluated.");
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
    standard: "Matterhorn Protocol 10",
    links: links(matterhornLink("10")),
    detect(ctx) {
      // TWO VARIANTS OF THE SAME ADVISORY (pdf.ts): a larger count is
      // UN-INDENTED and lands in notScored; a smaller count is INDENTED
      // and lands in the "Character Mapping" signal group instead. Check
      // both, or a small-count document silently reads NOT CHECKED.
      const large = matchNotScored(ctx, "symbol-font bullets or dingbats");
      const groupLines = signalLines(ctx, "Character Mapping");
      const small = groupLines.find((l) =>
        l.toLowerCase().includes("symbol-font bullets or dingbats"),
      );
      if (large || small) {
        const countLine = groupLines.find((l) => /cannot be mapped to readable text/i.test(l));
        const count = firstNumber(countLine ?? large ?? small ?? null);
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count} extracted character(s) in this document cannot be mapped to readable text.`
              : "Some extracted characters in this document cannot be mapped to readable text.",
            "This is often symbol-font bullets or dingbats, which read as decoration rather than words — worth a quick check with a screen reader if real words are affected.",
          ],
          fix: {
            source:
              "Re-export from the source application with standard fonts, or embed the fonts used.",
            app: "Run OCR over the affected pages: All tools → Scan & OCR → Recognize Text.",
          },
        };
      }
      return notChecked("This document's character mapping was not evaluated.");
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
    standard: "Matterhorn Protocol 01",
    links: links(matterhornLink("01")),
    detect(ctx) {
      const group = signalLines(ctx, "Content Outside the Tag Structure");
      const stray = group.find((l) => l.toLowerCase().includes("stray export residue"));
      if (stray) {
        // The count lives on the measurement line above the advisory, not
        // in the advisory sentence itself (which carries no digits).
        const countLine = group.find((l) => /visible character\(s\)/.test(l));
        const count = firstNumber(countLine ?? null);
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count} visible character(s) in this document sit outside the tag structure.`
              : "A small amount of visible text in this document sits outside the tag structure.",
            "This is often stray export residue rather than missing content — worth a check on the named pages when convenient.",
          ],
          fix: {
            source:
              "Re-export from the source document; watermarks or crop marks are common causes.",
            app: "In Acrobat's Tags panel, tag the real content, or mark decorative text as an artifact.",
          },
        };
      }
      return notChecked(
        "Whether this document has visible text outside the tag structure was not evaluated.",
      );
    },
  },
  {
    id: "list-labels",
    formats: ["pdf"],
    categoryId: "reading_order",
    label: "List item markers labeled",
    description:
      "A list item can carry its bullet or number as its own <Lbl> element, separate from the item's text.",
    why: "Optional, not required: without a labelled marker a screen reader still reads the item text, it just may not announce the bullet or number that goes with it.",
    standard: "ISO 32000-1 (optional) · Matterhorn Protocol 16",
    links: links(matterhornLink("16")),
    detect(ctx) {
      if (categoryEmpty(ctx)) {
        return {
          status: "not-applicable",
          evidence: ["This report has no reading-order data for this document."],
        };
      }
      const advisory = matchAny(ctx, "have no <lbl>");
      if (advisory) {
        const count = firstNumber(advisory);
        const perList = signalLines(ctx, "List Structure Analysis").filter((l) =>
          /^List\b/.test(l),
        );
        return {
          status: "not-met",
          evidence: [
            count !== null
              ? `${count} list(s) in this document have no <Lbl> (bullet/number) element on their items.`
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
      return notChecked("This document's list item labels were not evaluated.");
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
    standard: "Matterhorn Protocol 19",
    links: links(matterhornLink("19")),
    detect(ctx) {
      if (categoryEmpty(ctx)) {
        return {
          status: "not-applicable",
          evidence: ["This report has no reading-order data for this document."],
        };
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
              ? `${missingCount} note(s) in this document have no /ID.`
              : "Some notes in this document have no /ID.",
          );
        }
        if (dup) {
          evidence.push(
            dupCount !== null
              ? `${dupCount} note(s) reuse another note's /ID.`
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
      return notChecked("This document's footnote/endnote IDs were not evaluated.");
    },
  },
];
