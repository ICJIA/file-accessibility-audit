/**
 * The PDF best-practice catalog.
 *
 * Each entry reads the findings packages/analyzer already emits and turns
 * them into: a status for THIS document, the evidence behind it, and both
 * fix routes. Nothing here is scored, and nothing here may read as an
 * obligation — the grade measures WCAG 2.1 A/AA only.
 *
 * MATCHER ORDER IS LOAD-BEARING within a detect(): several analyzer lines
 * contain each other's keywords. Where that is true it is commented at the
 * site.
 */
import {
  matchAny,
  matchNotScored,
  signalLines,
  type BestPractice,
  type BestPracticeResult,
} from "./types";
import { matterhornLink, techniqueLink } from "./links";

/** The heading tree the analyzer prints as a technical signal — the exact
 *  "H1 → H2 → H1 → H1" sequence, lifted out of the collapsed panel and put
 *  next to the practice it is evidence for. */
function headingTreeBlock(ctx: Parameters<BestPractice["detect"]>[0]) {
  const lines = signalLines(ctx, "Heading Tree");
  // The first line is the level flow; the rest are the skip annotations.
  const flow = lines.find((l) => l.includes("→") && !l.startsWith("Heading hierarchy skip"));
  return flow ? { caption: "Your heading order, in document order", lines: [flow] } : undefined;
}

const notChecked = (why: string): BestPracticeResult => ({
  status: "not-checked",
  evidence: [why],
});

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
    links: [matterhornLink("13"), techniqueLink("G141")].filter(
      (l): l is NonNullable<typeof l> => l !== null,
    ),
    detect(ctx) {
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
];
