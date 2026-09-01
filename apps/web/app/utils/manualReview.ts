/**
 * What a person still has to check, on a document the automated checks are
 * happy with.
 *
 * WHY THIS EXISTS. A document that scores 100 gets an empty action plan, and
 * the report then has almost nothing to say to its author — who is, reasonably,
 * curious: *what should I still look at?* The honest answer is that these
 * checks verify accessibility structure EXISTS; almost none of them can judge
 * whether it is CORRECT. Alt text of "image" passes. A heading that describes
 * the wrong section passes. A reading order tagged in the wrong sequence
 * passes if it is tagged at all. That gap is invisible on a clean report
 * unless the report names it.
 *
 * So each check that PASSED contributes a prompt about the judgment it could
 * not make. Failed checks are deliberately absent — they are already the
 * action plan, and repeating them here would bury the one thing this list is
 * for.
 *
 * Written for document authors, not developers: no WCAG numbers in the prompt
 * text (the criteria this tool does not check at all are listed separately,
 * with their numbers and links), no jargon that is not immediately unpacked,
 * and every prompt names a concrete thing to look at rather than a principle
 * to uphold.
 */

import { hasUnscoredAdvisory } from "@file-audit/shared";

export interface ManualCheck {
  /** Category id, so the caller can pair this with the category's own label. */
  id: string;
  /** What the automated check actually established. */
  verified: string;
  /** The judgment only a person can make, phrased as something to go and do. */
  confirm: string;
  /**
   * "caution" marks a prompt whose check did NOT pass — the category was
   * EXCLUDED from scoring while content is present (score null +
   * notAssessed), so rendering it with the passed-check ✓ would claim a
   * verification that never happened. Absent for ordinary passed checks.
   */
  tone?: "caution";
}

/** Keyed by scoring-category id. A category absent from here contributes no
 *  prompt — better silent than padded with something an author cannot act on. */
export const MANUAL_CHECKS: Record<string, Omit<ManualCheck, "id">> = {
  text_extractability: {
    verified: "The text is real text, not a picture of text.",
    confirm:
      "Read a page or two aloud with your computer's read-aloud tool. Confirm it comes out as sentences rather than fragments, and that nothing important is silently skipped.",
  },
  title_language: {
    verified: "A document title and a language are both set.",
    confirm:
      "Check the title actually describes this document — screen readers announce it on open, so “Document1” or a filename is a miss even though it passes. Confirm the language matches what the document is written in.",
  },
  heading_structure: {
    verified: "Headings are present and their levels nest in a sensible order.",
    confirm:
      "Read just the headings, top to bottom. They should work as an outline of the document on their own. Also look for anything that only looks like a heading without being one — text made big and bold by hand carries no structure, so a screen reader skips right past it.",
  },
  alt_text: {
    verified: "Every image carries a text description.",
    confirm:
      "Read each description and ask whether it tells someone who cannot see the image what the image is doing there. “Image”, “logo” and a filename all pass this check and convey nothing. Charts and maps usually need a sentence, not a phrase.",
  },
  reading_order: {
    // Only what the analyzer verified: the tag structure EXISTS. Whether its
    // order matches the visual layout is precisely the judgment this card
    // hands to a person — the old wording claimed it as verified on reports
    // whose own findings listed pages of reading-order drift.
    verified: "The document has a tagged reading order.",
    confirm:
      "Check any page that isn't a single column — sidebars, pull quotes, captions, multi-column text and anything in a text box. Confirm each lands where a reader would expect rather than at the end of the page.",
  },
  link_quality: {
    verified: "Link text is descriptive rather than a bare web address.",
    confirm:
      "Read each link's text on its own, with no surrounding sentence. Screen reader users often jump from link to link, so “the 2026 budget summary” works and “click here” or “more” does not.",
  },
  table_markup: {
    verified: "Tables have header cells marked as headers.",
    confirm:
      "Confirm the marked headers are the right row or column, and that no table is being used purely to position things on the page — a layout table read cell by cell is confusing.",
  },
  bookmarks: {
    verified: "The document has bookmarks for navigation.",
    confirm:
      "Check they cover the document's real sections, in the order those sections appear, and that the labels match the headings they point at.",
  },
  form_accessibility: {
    verified: "Form fields carry labels.",
    confirm:
      "Confirm each label says what to type, not just what the field is called, and tab through the form to check the order matches the visual layout.",
  },
  color_contrast: {
    verified: "Explicitly-set text colours were checked against their backgrounds.",
    confirm:
      "Colours inherited from a theme or style cannot be resolved automatically. Check body text against its background with a contrast checker: 4.5:1 for normal text, 3:1 for large or bold text.",
  },
};

/** Per-format overrides for MANUAL_CHECKS. PowerPoint has no tag structure —
 *  its reading-order check is that each slide's title placeholder reads
 *  first — so the PDF sentence ("tagged reading order") is false there. */
const MANUAL_CHECKS_BY_TYPE: Record<string, Record<string, Omit<ManualCheck, "id">>> = {
  pptx: {
    reading_order: {
      verified: "Every slide's title placeholder is first in its reading order.",
      confirm:
        "Open the Selection Pane (Home → Arrange → Selection Pane) on a few busy slides and read the shapes bottom to top — that is the order a screen reader follows. Confirm each slide reads its title first, then the body, then supporting content, and that grouped or floating shapes land where a listener would expect.",
    },
  },
};

interface CategoryLike {
  id?: string;
  label?: string;
  score?: number | null;
  severity?: string | null;
  notAssessed?: boolean | null;
  findings?: readonly string[] | null;
}

/**
 * Prompts for categories EXCLUDED from scoring while content is present —
 * score null with notAssessed set — where the exclusion itself is the
 * judgment a person must make. Only alt_text today: "every image is
 * artifacted / not verifiably tagged" is an author's claim the tool cannot
 * check, and the old score===100 gate meant the card said nothing about
 * images on exactly the report that most needed the prompt
 * (controls/2026_dvfrc_biennial_report.pdf: 100/A with a half-page cover
 * image hidden as a Pagination artifact). The asymmetry rule from the report
 * views applies here too: an unneeded prompt costs a paragraph; a missing
 * one publishes an invisible cover image.
 *
 * Deliberately NOT color_contrast: that exclusion is already disclosed in
 * the "not checked by this tool at all" criteria list (1.4.3), and a second
 * entry would double-report it.
 */
const NOT_ASSESSED_CHECKS: Record<string, Omit<ManualCheck, "id">> = {
  alt_text: {
    tone: "caution",
    verified:
      "Images are present, but every one of them is excluded from automated alt-text scoring — most commonly because it is marked decorative, which hides it from screen readers entirely.",
    confirm:
      "Look at each image in the document. Marking an image decorative claims it conveys nothing — if a chart, photograph, or cover image actually carries information, it needs a real text description instead. Screen readers skip decorative images silently, so a mis-marked image simply disappears for those readers.",
  },
};

/**
 * Prompts for every category that PASSED, in the order the categories are
 * given (which is the scorer's own weight order, so the checks that matter
 * most to a reader come first).
 *
 * "Passed" is score 100 — the same bar `SEVERITY_THRESHOLDS` uses for
 * "No issues found" — AND nothing reported-but-unscored beneath it. Since the
 * legal-only sweep, a category whose defects are advisory (bookmarks, reading
 * order) is ALWAYS 100; the ✓ card asserted "the document has bookmarks" on
 * documents with none. A 100 that carries an unscored advisory verified
 * nothing, so it contributes no card: the advisory already speaks, in the
 * findings and in the Best-practices section. Two signals cover both eras —
 * the "No scored issues" severity (v1.149+) and the not-scored phrase in the
 * findings themselves (stored payloads from before the label existed).
 */
export function manualChecks(
  categories: ReadonlyArray<CategoryLike> | null | undefined,
  fileType?: string | null,
): Array<ManualCheck & { label: string }> {
  if (!Array.isArray(categories)) return [];
  const overrides = MANUAL_CHECKS_BY_TYPE[fileType ?? ""] ?? {};
  const out: Array<ManualCheck & { label: string }> = [];
  for (const c of categories) {
    if (!c || typeof c.id !== "string") continue;
    const label = typeof c.label === "string" && c.label ? c.label : c.id;
    if (c.score === 100) {
      if (c.severity === "No scored issues") continue;
      if (hasUnscoredAdvisory(c.findings ?? undefined)) continue;
      const copy = overrides[c.id] ?? MANUAL_CHECKS[c.id];
      if (copy) out.push({ id: c.id, label, ...copy });
    } else if (c.score === null && c.notAssessed === true) {
      const copy = NOT_ASSESSED_CHECKS[c.id];
      if (copy) out.push({ id: c.id, label, ...copy });
    }
  }
  return out;
}
