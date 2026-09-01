/**
 * Conformance gate — a binary WCAG verdict that is deliberately independent
 * of the weighted 0–100 score.
 *
 * WHY THIS EXISTS: the numeric score is a *prioritised readiness* metric with
 * partial credit. A document can score 90+ ("A") and still fail WCAG, because
 * WCAG conformance is all-or-nothing per success criterion — one image without
 * alt text fails 1.1.1 (Level A) outright. This module answers the separate,
 * honest question: "did the automated checks find a confirmed WCAG failure?"
 *
 * It reports three states:
 *   - "fail"                  — at least one confirmed, machine-checkable
 *                               WCAG violation was found (against the operative
 *                               version — WCAG 2.1 or 2.2; see WCAG.VERSION).
 *   - "no-automated-failures" — none were found. This is NOT a statement of
 *                               conformance: color contrast, reading-order
 *                               nuance, and the *correctness* of alt text and
 *                               tags are not machine-verifiable. Manual review
 *                               remains mandatory.
 *   - "incomplete"            — an analyzer failed (e.g. an encrypted or
 *                               damaged file), so no verdict could be
 *                               determined without dishonestly guessing.
 *
 * The gate never says "conformant". By design — only a human review can.
 */
import { classifyLinkText } from "./common.js";
import type { QpdfResult } from "../qpdfService.js";
import type { PdfjsResult } from "../pdfjsService.js";
import type { DocxAnalysis } from "../docxService.js";
import type { PptxAnalysis } from "../pptxService.js";
import type { XlsxAnalysis } from "../xlsxService.js";
import type { CategoryResult } from "../scorer.js";
import { computeReadingOrderFidelity } from "./readingOrderFidelity.js";
import { detectLanguageMismatch, LANGUAGE_NAMES } from "../languagePlausibility.js";
import { isPlausibleLanguageTag } from "./common.js";
import { structTreeIsContentFree, untaggedContentImageCount } from "./common.js";
import { WCAG_UNDERSTANDING_SLUGS } from "@file-audit/shared";
import { WCAG, WCAG_22_NEW_AA } from "#config";

export interface ConformanceFinding {
  /** WCAG success criterion number, e.g. "1.1.1" (2.1 or 2.2). */
  sc: string;
  /** Success criterion name. */
  name: string;
  level: "A" | "AA";
  /** Related scoring category id, for cross-referencing in the UI. */
  category: string;
  /** Plain-language description of the confirmed violation. */
  issue: string;
  /** Link to the W3C "Understanding" page for this exact criterion. */
  url: string;
}

export interface NotAssessedCriterion {
  sc: string;
  name: string;
  level: "A" | "AA";
  reason: string;
  /** Link to the W3C "Understanding" page for this exact criterion. */
  url: string;
}

export interface ConformanceVerdict {
  /**
   * "fail" — confirmed machine-checkable WCAG violation(s) present.
   * "no-automated-failures" — none found (NOT a conformance guarantee).
   * "incomplete" — an analyzer failed; no verdict could be determined.
   */
  status: "fail" | "no-automated-failures" | "incomplete";
  failures: ConformanceFinding[];
  /**
   * Criteria outside this tool's automated scope — listed so the verdict is
   * never mistaken for a clean bill of health.
   */
  notAssessed: NotAssessedCriterion[];
  /** One-line plain-language verdict. */
  headline: string;
}

/** URL of the W3C "Understanding" page for a WCAG success criterion. The
 *  slug table lives in @file-audit/shared (moved v1.74.0) so the web app's
 *  printable plan builds identical links without a second copy. */
function wcagUrl(sc: string): string {
  const slug = WCAG_UNDERSTANDING_SLUGS[sc];
  const base = WCAG.UNDERSTANDING_BASE[WCAG.VERSION];
  return slug ? `${base}${slug}.html` : WCAG.QUICKREF[WCAG.VERSION];
}

/**
 * Criteria that apply to every document this tool audits but that no
 * automated check here can evaluate — appended to every verdict's
 * `notAssessed` so the manual-review card's "not checked by this tool at
 * all" list is complete rather than implying coverage.
 *
 * WHY: until 2026-08-08 the disclosure held only contrast and (conditionally)
 * reading order, and controls/ produced a live counterexample — a 100/A
 * report carrying stray da/de/it/no span languages, squarely 3.1.2
 * territory, with nothing telling the reader that span language is never
 * verified. A "not assessed" list that undersells what was skipped is the
 * one dishonesty this page's whole design exists to avoid.
 *
 * Deliberately NOT included: 1.4.4 Resize Text and 1.4.10 Reflow (behaviour
 * of the viewer as much as the file, and contested for fixed-layout formats
 * — listing them would demand judgments a document author cannot act on),
 * and the web-UI-only WCAG 2.2 criteria (documented on /wcag-2-2 instead).
 */
function universalNotAssessed(): NotAssessedCriterion[] {
  return [
    {
      sc: "3.1.2",
      name: "Language of Parts",
      level: "AA",
      reason:
        "Passages in a different language from the document (quotations, place names, legal terms) must carry their own language marking so screen readers switch pronunciation. Whether individual passages are marked, and marked correctly, is not automatically verified.",
      url: wcagUrl("3.1.2"),
    },
    {
      sc: "1.4.1",
      name: "Use of Color",
      level: "A",
      reason:
        "Whether any information is conveyed by color alone — chart series distinguished only by hue, or wording like “items in red are overdue” — can only be judged by looking at the content.",
      url: wcagUrl("1.4.1"),
    },
    {
      sc: "1.4.5",
      name: "Images of Text",
      level: "AA",
      reason:
        "Whether any image is really a picture of text that should be actual text (a scanned letterhead, a screenshot of a paragraph) is not reliably detectable automatically.",
      url: wcagUrl("1.4.5"),
    },
    {
      sc: "1.4.11",
      name: "Non-text Contrast",
      level: "AA",
      reason:
        "The contrast of charts, icons, form-field borders, and other graphics against their background is not measured by this tool.",
      url: wcagUrl("1.4.11"),
    },
    {
      sc: "1.3.3",
      name: "Sensory Characteristics",
      level: "A",
      reason:
        "Instructions that rely on shape, position, or size alone — “click the round button”, “see the box on the right” — can only be found by reading the content.",
      url: wcagUrl("1.3.3"),
    },
  ];
}

/**
 * Evaluate the conformance gate. Fires only on *confirmed*, high-confidence
 * machine-checkable violations — never on ambiguous signals (e.g. "no heading
 * tags" is not flagged, because the document may legitimately have no
 * headings; a vague link phrase is not flagged, because 2.4.4 is contextual).
 */
export function evaluateConformance(
  qpdf: QpdfResult,
  pdfjs: PdfjsResult,
  categories: CategoryResult[],
): ConformanceVerdict {
  // If either analyzer failed, structural signals are unreliable — asserting
  // WCAG failures (or a clean bill) would both be dishonest. A damaged or
  // encrypted file must not be falsely accused of specific violations.
  if (qpdf.error || pdfjs.error) {
    return {
      status: "incomplete",
      failures: [],
      notAssessed: [],
      headline:
        "Automated analysis could not complete for this file (it may be encrypted, damaged, or unsupported), so no WCAG conformance verdict could be determined. A full manual review is required.",
    };
  }

  // DYNAMIC XFA (LiveCycle, /NeedsRendering true) renders its real UI from
  // the XFA template, which neither qpdf's object walk nor pdfjs can see —
  // the analyzable "page" is just the "Please update your viewer"
  // placeholder, so no honest verdict is possible. STATIC XFA (flag absent)
  // ships a full conventional rendering that IS what every viewer shows and
  // is evaluated normally — refusing a verdict there wrongly withheld clean
  // verdicts from accessible Designer forms.
  if (qpdf.hasXfa && qpdf.needsRendering) {
    return {
      status: "incomplete",
      failures: [],
      notAssessed: [],
      headline:
        "This PDF is an XFA (LiveCycle) form — an unsupported form technology whose real content is not visible to automated analysis. No WCAG conformance verdict could be determined; a full manual review in a viewer that supports XFA is required.",
    };
  }

  const failures: ConformanceFinding[] = [];

  const add = (
    sc: string,
    name: string,
    level: "A" | "AA",
    category: string,
    issue: string,
  ): void => {
    failures.push({ sc, name, level, category, issue, url: wcagUrl(sc) });
  };

  // 0. Security settings deny assistive technology (Matterhorn 26-002 /
  //    PDF/UA 7.16). Confirmed directly from the security handler's
  //    accessibility capability: conforming viewers refuse screen readers
  //    text access to the ENTIRE document — the same user-facing condition
  //    as a document with no extractable text (check 2 below), which is why
  //    it is asserted under the same criterion. Strictly `=== false`: null/
  //    undefined means unencrypted or unknown and must never fire.
  if (qpdf.accessibilityAllowed === false) {
    add(
      "1.1.1",
      "Non-text Content",
      "A",
      "text_extractability",
      "The document's security settings deny assistive-technology access (the accessibility permission flag is off — PDF/UA 7.16 / Matterhorn 26-002). Screen readers in conforming viewers cannot read any of its content, regardless of tagging. Re-save the PDF without restrictive security, or enable text access for screen readers in the security settings.",
    );
  }

  // 1. Untagged document — no structure tree at all, OR a StructTreeRoot that
  //    references no content. The two are the same barrier in practice: a
  //    screen reader following an empty tag tree gets nothing, exactly as it
  //    does from an untagged file. Gating on the root's mere presence let a
  //    document be laundered into a clean verdict by adding an empty root.
  if (!qpdf.hasStructTree) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "text_extractability",
      "The document has no tag structure (StructTreeRoot), so headings, lists, tables, and reading order cannot be conveyed to assistive technology.",
    );
  } else if (structTreeIsContentFree(qpdf, pdfjs)) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "text_extractability",
      "The document has a tag structure (StructTreeRoot), but it references no content — no paragraphs, headings, figures, tables, lists, or marked content are inside it. Every character of the text sits outside the structure tree, so assistive technology receives no headings, relationships, or reading order, exactly as if the document were untagged. Re-tag the document (Acrobat: All tools → Prepare for accessibility → Automatically tag PDF; classic UI: Tools → Accessibility → Autotag Document), then verify in the Tags panel that the body content appears under the tags.",
    );
  }

  // 2. No extractable text — a scanned image of text. Strictly
  //    textLength === 0, NOT the 50-character `hasText` scoring heuristic:
  //    a short born-digital notice HAS extractable text, and asserting "no
  //    text was found" about it would be factually false. Image presence is
  //    required for the scanned-image framing; a zero-text zero-image
  //    document has no content to alternate (the untagged claim above covers
  //    its structural problem when present).
  if (
    !pdfjs.error &&
    pdfjs.textLength === 0 &&
    (pdfjs.imageCount > 0 || qpdf.imageObjectCount > 0)
  ) {
    add(
      "1.1.1",
      "Non-text Content",
      "A",
      "text_extractability",
      "No extractable text was found and the pages consist of images — the document appears to be scanned images of text, which a screen reader cannot read.",
    );
  }

  // 3. Tagged figures without alternative text.
  const figuresMissingAlt = qpdf.images.filter((img) => img.ref && !img.hasAlt).length;
  if (figuresMissingAlt > 0) {
    add(
      "1.1.1",
      "Non-text Content",
      "A",
      "alt_text",
      `${figuresMissingAlt} image(s) tagged as <Figure> have no alternative text (/Alt).`,
    );
  }

  // 3b. Content images with no <Figure> tag at all. Strictly worse than a
  //     tagged figure missing /Alt — these are absent from the reading order
  //     entirely — yet counting only tagged figures meant the worse case
  //     asserted nothing at all. Fires only on images painted OUTSIDE any
  //     /Artifact run, so correctly-artifacted decorative graphics are
  //     excluded (that noise is why this was advisory-only before).
  const untaggedImages = untaggedContentImageCount(qpdf, pdfjs);
  if (untaggedImages !== null && untaggedImages > 0) {
    add(
      "1.1.1",
      "Non-text Content",
      "A",
      "alt_text",
      `${untaggedImages} image(s) are painted as page content but are not tagged as <Figure>, so they carry no alternative text and are missing from the reading order entirely. Tag each one as <Figure> with /Alt text, or — if it is purely decorative — mark it as an Artifact so it is deliberately hidden from assistive technology.`,
    );
  }

  // 3c. Formulas without a text alternative (v1.92.0 — Matterhorn 17).
  //     Machine-certain: the <Formula> element exists and carries neither
  //     /Alt nor /ActualText, and a formula's glyphs rarely extract as
  //     speakable text — the same non-text-content bar figures are held to.
  const formulasMissingAlt = qpdf.formulasMissingAlt ?? 0;
  if (formulasMissingAlt > 0) {
    add(
      "1.1.1",
      "Non-text Content",
      "A",
      "alt_text",
      `${formulasMissingAlt} mathematical formula(s) tagged <Formula> have no text alternative (/Alt or /ActualText), so a screen reader gets nothing usable from the expression. In the Tags panel, add the spoken form of each formula as its Alternate Text.`,
    );
  }

  // 4. No declared document language.
  if (!(qpdf.hasLang || pdfjs.lang)) {
    add(
      "3.1.1",
      "Language of Page",
      "A",
      "title_language",
      "No default language is declared, so assistive technology cannot determine which pronunciation rules to apply.",
    );
  }

  // 5. No document title.
  if (!(pdfjs.title && pdfjs.title.trim().length > 0)) {
    add(
      "2.4.2",
      "Page Titled",
      "A",
      "title_language",
      "The document has no title in its metadata; a screen reader will announce the filename instead.",
    );
  }

  // 6. RETIRED (2026-09-01): malformed tagged lists (<LI> without <LBody>)
  //    are no longer asserted as a confirmed 1.3.1 failure. The rule had no
  //    scoring twin — no scorer ever deducts for list shape — so the verdict
  //    said "does not meet WCAG 2.1 Level AA" beside a reading-order card at
  //    100/A, a contradiction on one screen that neither corpus gate could
  //    see (legal-basis now checks this converse direction). On the merits it
  //    was also the weakest rule here: an <LI> lacking <LBody> still exposes
  //    its text and its list membership; no W3C failure technique covers the
  //    shape, and Matterhorn 16 is PDF/UA, not WCAG. The reading-order card
  //    still reports the malformed lists — including the misspelt-LBody
  //    near-miss repair — as findings; they simply assert no criterion.

  // 7. Tagged tables with no header cells. Sub-2×2 tables (single row or
  //    single column) are overwhelmingly layout constructs — the OOXML gates
  //    already skip them, and asserting a confirmed Level A failure for a
  //    tagged layout table made the PDF verdict diverge from the DOCX one on
  //    the identical construct. The scoring category still reviews them.
  const tablesNoHeaders = qpdf.tables.filter(
    (t) => !t.hasHeaders && t.rowCount >= 2 && (t.columnCounts[0] ?? 2) >= 2,
  ).length;
  if (tablesNoHeaders > 0) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "table_markup",
      `${tablesNoHeaders} table(s) have no header cells (<TH>), so screen readers cannot associate data cells with their headers.`,
    );
  }

  // 7b. Link annotations outside the structure tree — in a TAGGED document
  //     with real content only (an untagged or content-free tree already
  //     carries the document-level 1.3.1 failure from check 1, and every
  //     link in it is "untagged" by definition). Each one is a link that
  //     assistive technology following the tags cannot identify or reach
  //     (W3C technique PDF11; PDF/UA 7.18.5). Mechanical and certain: the
  //     annotation exists and no structure element references it. The
  //     census is absent on stored reports from before it existed, so this
  //     never fires on them.
  // Mirrors scoreLinkQuality exactly (2026-08-29): the per-link census is
  //     the same signal the score uses, so the two can never disagree. The
  //     old content-free-tree guard suppressed this on remediated documents
  //     whose trees reference little content while their links still scored
  //     0 unattributed (ILHEALS, caught by scripts/legal-basis.ts).
  // THE PER-LINK CENSUS ONLY (2026-09-01). The old Math.max with the raw
  // untaggedLinkAnnotationCount asserted 1.3.1 on ELEVEN real corpus PDFs
  // whose every per-link record was tagged and whose link category showed a
  // perfect 100 — the annotation count includes duplicate/split annotations
  // and internal links the per-link census deliberately reconciles, and the
  // scorer deducts from the census alone. Found by the converse direction of
  // scripts/legal-basis.ts the day it was added. The census is present on
  // every fresh analysis that has links at all, so the fallback arm could
  // only ever fire beside a null ("No links found") category — a failing
  // criterion the report would show no deduction for.
  const untaggedLinks =
    qpdf.hasStructTree && (pdfjs.links ?? []).some((l) => typeof l.tagged === "boolean")
      ? (pdfjs.links ?? []).filter((l) => l.tagged === false).length
      : 0;
  if (untaggedLinks > 0) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "link_quality",
      `${untaggedLinks} link(s) are not tagged — the link annotation is on the page, but no <Link> structure element wraps it, so assistive technology following the tag tree cannot identify it as a link or reach it. Wrap each one in a <Link> tag (Acrobat: Tags panel → Options → Find → Unmarked Links → Tag Element) or, in Word, move the link out of the text box or shape into the main text before re-exporting.`,
    );
  }

  // Same 4.1.2 rule the three Office gates carry: a link with NO text has no
  // accessible name, and 4.1.2 (Level A) names links among the components that
  // must have one. Distinct from the untagged-link rule above (that one is
  // about the tag tree, this one about the name) and from vague text, which
  // stays unscored because 2.4.4 lets context supply the purpose.
  {
    const unnamedLinks = (pdfjs.links ?? []).filter(
      (l) => classifyLinkText(l.text ?? "") === "unnamed",
    ).length;
    if (unnamedLinks > 0) {
      add(
        "4.1.2",
        "Name, Role, Value",
        "A",
        "link_quality",
        `${unnamedLinks} link(s) carry no link text, so nothing identifies them to a screen reader — the link is announced with no name at all. Give each one descriptive text in the source document before re-exporting, or edit it in Acrobat.`,
      );
    }
  }

  // --- Rules 7c–7f + 5b, 6b, 9b (2026-08-29, the legal-only sweep) --------
  // The user's ruling: only WCAG 2.1 A/AA may move a score. That forces the
  // score and this verdict to agree EXACTLY — every deduction that survived
  // the sweep must be attributable here, and scripts/legal-basis.ts fails
  // the build when any scored category sits below 100 without a failure
  // attributed to it. Each condition below MIRRORS its scoring branch;
  // change them together or the gate goes red.

  // 2b. Tagged content that yields NO extractable text at all (and no images
  //     to explain it as a scan) — the tags promise content the text layer
  //     cannot deliver. Mirrors scoreTextExtractability's
  //     no-text-but-structured branch.
  if (
    !pdfjs.error &&
    pdfjs.textLength === 0 &&
    (pdfjs.imageCount ?? 0) === 0 &&
    (qpdf.imageObjectCount ?? 0) === 0 &&
    ((qpdf.tables ?? []).length > 0 ||
      (qpdf.paragraphCount ?? 0) > 0 ||
      (qpdf.headings ?? []).length > 0)
  ) {
    add(
      "1.1.1",
      "Non-text Content",
      "A",
      "text_extractability",
      "The document carries a tag structure (paragraphs/tables/headings) but no text could be extracted from any of it — assistive technology receives structure with nothing inside.",
    );
  }

  // 4b/4c. Language declared but unusable, or contradicting the text — a
  //     screen reader follows the declaration, so both defeat pronunciation
  //     exactly as a missing tag does; 3.1.1 requires the determined
  //     language to BE the document's language. Mirrors
  //     scoreTitleLanguage's hasLang/langValue/mismatch branches.
  {
    const hasLangC = qpdf.hasLang || !!pdfjs.lang;
    const langValueC = (qpdf.lang || pdfjs.lang || "").trim();
    if (hasLangC && !isPlausibleLanguageTag(langValueC)) {
      add(
        "3.1.1",
        "Language of Page",
        "A",
        "title_language",
        `The declared language "${langValueC}" is not a usable language code, so the document's language cannot be programmatically determined — screen readers fall back to their default pronunciation. Use a standard code such as "en-US".`,
      );
    } else if (hasLangC && isPlausibleLanguageTag(langValueC)) {
      const mismatchC = detectLanguageMismatch(pdfjs.textSample ?? "", langValueC);
      if (mismatchC) {
        add(
          "3.1.1",
          "Language of Page",
          "A",
          "title_language",
          `The document declares its language as "${langValueC}" but the text reads as ${LANGUAGE_NAMES[mismatchC.detected] ?? mismatchC.detected} (${mismatchC.detectedHits} common ${LANGUAGE_NAMES[mismatchC.detected] ?? mismatchC.detected} words vs ${mismatchC.declaredHits} in the declared language, of ${mismatchC.wordCount.toLocaleString()} sampled). The programmatically determined language is not the language of the text, so screen readers pronounce the entire document with the wrong rules.`,
        );
      }
    }
  }

  // 5b. Title present but it is the filename / a tool string — WCAG's own
  //     documented failure F25 for 2.4.2 (the title does not identify the
  //     document). Mirrors scoreTitleLanguage's titleLooksLikeFilename
  //     branch.
  if (pdfjs.title && pdfjs.title.trim().length > 0 && pdfjs.titleLooksLikeFilename) {
    add(
      "2.4.2",
      "Page Titled",
      "A",
      "title_language",
      `The document's title ("${pdfjs.title}") looks like a filename or tool-generated string rather than a description — screen readers announce it as the document's name. WCAG failure F25: a title that does not identify the document's topic or purpose fails 2.4.2. Replace it with a descriptive title (Acrobat: Document properties → Description → Title).`,
    );
  }

  // 6b. A substantive document with NO heading tags at all. Mirrors
  //     scoreHeadingStructure's zero-headings branch (same `substantive`
  //     expression): multi-page or paragraph-heavy documents visually carry
  //     section headings, and zero <H1>–<H6> tags means that structure is
  //     conveyed by presentation only — the textbook 1.3.1 failure, and the
  //     textbook 1.3.1 failure. (This said "the one Acrobat's own checker
  //     reports as an error" until 2026-08-31 — untrue, and contradicted by
  //     our own adobeParity.ts, which correctly records that Acrobat has no
  //     "document must contain headings" rule. Its only Headings rule is
  //     "Appropriate nesting".)
  if (
    (qpdf.headings ?? []).length === 0 &&
    ((qpdf.totalPageCount ?? 0) >= 4 ||
      (qpdf.paragraphCount ?? 0) >= 20 ||
      (qpdf.outlineCount ?? 0) > 0)
  ) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "heading_structure",
      "A document of this length has no heading tags (H1–H6) in its structure, so its sections exist only visually — assistive technology receives no outline to navigate by. Tag the section titles as headings (Acrobat: Tags panel, or re-export from the source with heading styles).",
    );
  }

  // 7c. Structural table defects beyond missing <TH>: rows not grouped in
  //     <TR>, irregular column counts (after row/col-span accounting), or a
  //     complex table (two-axis headers or spans) whose cells carry neither
  //     /Scope nor /Headers. Mirrors scoreTableMarkup's row-structure,
  //     consistency, and scoredAsAssociated blocks, including the
  //     layout-scaffold guard ((columnCounts[0] ?? 2) >= 2).
  {
    // MIRRORS scoreTableMarkup's isDataTable EXACTLY (scoring/pdf.ts:1534):
    // `(columnCounts[0] ?? 2) >= 2 && rowCount >= 2`. The row half was missing
    // until 2026-08-31, so a <Table> with no rows at all — no column data, so
    // the `?? 2` default let it through — was excluded by the scorer as a
    // layout scaffold and simultaneously accused by this verdict. Found by the
    // widened legal-basis gate on controls/synthetic-09-empty-table.pdf, which
    // graded 100/A with table_markup reported "not scored" beside a 1.3.1
    // Level A failure about that same table.
    const scoredTables = (qpdf.tables ?? []).filter(
      (t) => ((t.columnCounts ?? [])[0] ?? 2) >= 2 && (t.rowCount ?? 0) >= 2,
    );
    const noRows = scoredTables.filter((t) => !t.hasRowStructure).length;
    const irregular = scoredTables.filter((t) => t.hasConsistentColumns === false).length;
    const complexUnassociated = scoredTables.filter(
      (t) => t.hasHeaders && !t.hasScope && !t.hasHeaderAssociation && !t.simpleHeaderLayout,
    ).length;
    const parts: string[] = [];
    if (noRows > 0)
      parts.push(`${noRows} table(s) lack <TR> row structure (cells sit directly under <Table>)`);
    if (irregular > 0)
      parts.push(
        `${irregular} table(s) have irregular column counts even after row/column spans are accounted for, so the grid's shape is ambiguous`,
      );
    if (complexUnassociated > 0)
      parts.push(
        `${complexUnassociated} table(s) have headers along more than one edge (or spanned cells) with neither /Scope nor /Headers, so which header governs which cell cannot be determined`,
      );
    if (parts.length > 0) {
      add(
        "1.3.1",
        "Info and Relationships",
        "A",
        "table_markup",
        `Table structure is not programmatically determinable: ${parts.join("; ")}.`,
      );
    }
  }

  // 7d. Visible text painted OUTSIDE the tag structure — partial tagging.
  //     Mirrors the Matterhorn 01 scoring bands exactly (share ≥ 2% and
  //     ≥ 50 characters): those characters are in nobody's reading order and
  //     not artifacts, which is mechanical and certain.
  {
    const untaggedChars = pdfjs.untaggedVisibleChars;
    const taggedChars = pdfjs.taggedVisibleChars ?? 0;
    if (
      qpdf.hasStructTree &&
      typeof untaggedChars === "number" &&
      untaggedChars > 0 &&
      untaggedChars / Math.max(1, untaggedChars + taggedChars) >= 0.02 &&
      untaggedChars >= 50
    ) {
      add(
        "1.3.1",
        "Info and Relationships",
        "A",
        "text_extractability",
        `${untaggedChars.toLocaleString()} visible character(s) are painted outside the tagged content — neither in the reading order nor marked as decorative artifacts — so a screen reader following the tags never encounters them.`,
      );
    }
  }

  // 7e. A meaningful share of the text layer cannot be mapped to readable
  //     characters. Mirrors the Character Mapping failure band exactly
  //     (≥ 100 characters and ≥ 5% of the text layer): whatever the tagging
  //     says, that text cannot be read aloud or searched.
  {
    const unmappedChars = pdfjs.unmappedTextCharCount;
    if (
      typeof unmappedChars === "number" &&
      unmappedChars >= 100 &&
      unmappedChars / Math.max(1, pdfjs.textLength ?? 0) >= 0.05
    ) {
      add(
        "1.1.1",
        "Non-text Content",
        "A",
        "text_extractability",
        `${unmappedChars.toLocaleString()} extracted character(s) cannot be mapped to readable text — the glyphs paint on screen but extract as private-use symbols a screen reader cannot pronounce.`,
      );
    }
  }

  // 9b. No structure tree = no programmatic reading sequence AT ALL — the
  //     one reading-order condition that is mechanical and certain (the
  //     fidelity comparison never asserts 1.3.2; see rule 9's rationale).
  //     Mirrors scoreReadingOrder's !hasStructTree branch.
  if (!qpdf.hasStructTree) {
    add(
      "1.3.2",
      "Meaningful Sequence",
      "A",
      "reading_order",
      "The document has no tag structure, so no programmatic reading sequence exists — screen readers fall back to raw drawing order, which may not match the visual layout at all.",
    );
  }

  // 8. Unlabeled form fields.
  if (qpdf.hasAcroForm) {
    const unlabeledFields = qpdf.formFields.filter((f) => !f.hasTU).length;
    if (unlabeledFields > 0) {
      add(
        "4.1.2",
        "Name, Role, Value",
        "A",
        "form_accessibility",
        `${unlabeledFields} form field(s) have no accessible label (/TU tooltip).`,
      );
    }
  }

  // 8b. Form-field widgets outside the structure tree (v1.94.0 — the
  //     untagged-link mechanics of 7b applied to widgets, Matterhorn 28 /
  //     PDF/UA 7.18). Mechanical and certain: the visible widget exists and
  //     no structure element references it via OBJR. Same guards as 7b: only
  //     a tagged document with real content, and only when the census exists
  //     (never fires on stored pre-census reports).
  // RB-review F3: hasAcroForm is required — without it the Form
  // Accessibility category early-returns N/A ("no form fields found"), and a
  // confirmed failure beside an N/A category (no action-plan step, no score
  // effect) is exactly the gate/score divergence this file exists to avoid.
  const untaggedWidgets =
    qpdf.hasAcroForm && qpdf.hasStructTree && !structTreeIsContentFree(qpdf, pdfjs)
      ? (qpdf.untaggedWidgetAnnotationCount ?? 0)
      : 0;
  if (untaggedWidgets > 0) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "form_accessibility",
      `${untaggedWidgets} visible form-field widget(s) are not referenced from the tag structure — no structure element points at them, so assistive technology following the tags cannot reach those fields. In Acrobat: Tags panel → Options → Find → "Unmarked Annotations" → Tag Element.`,
    );
  }

  // 9. Reading-order divergence — measured by the rigorous struct-tree vs
  //    content-stream MCID comparison, but NEVER asserted as a confirmed
  //    1.3.2 failure: the content stream is DRAW order, not visual reading
  //    order, and the struct tree exists precisely to override it. A low
  //    similarity proves the two orders disagree — not which side is wrong
  //    (professional remediation deliberately re-orders tags away from a bad
  //    stream order, and assistive technology follows the tags). Heavy
  //    divergence is routed to notAssessed as an explicit manual-review item
  //    instead (see below).
  let orderDivergencePct: number | null = null;
  if (qpdf.hasStructTree) {
    const fidelity = computeReadingOrderFidelity(qpdf, pdfjs);
    // Both lower bands (≤65 = under 80% agreement) warrant the explicit
    // manual-review entry.
    if (fidelity.score !== null && fidelity.score <= 65) {
      orderDivergencePct = fidelity.similarityPct;
    }
  }

  // --- criteria this tool does not assess automatically ---------------------
  // Always surfaced so a "no failures" verdict is never read as conformance.
  const notAssessed: NotAssessedCriterion[] = [
    {
      sc: "1.4.3",
      name: "Contrast (Minimum)",
      level: "AA",
      reason: "This tool does not yet measure rendered text/background color contrast.",
      url: wcagUrl("1.4.3"),
    },
  ];
  const readingOrderCat = categories.find((c) => c.id === "reading_order");
  if (orderDivergencePct !== null) {
    notAssessed.push({
      sc: "1.3.2",
      name: "Meaningful Sequence",
      level: "A",
      reason: `The tag order diverges substantially from the content stream's draw order (only ${orderDivergencePct}% agreement). This is not automatically a violation — remediated documents re-order tags on purpose — but the reading order should be verified manually with a screen reader.`,
      url: wcagUrl("1.3.2"),
    });
  } else if (readingOrderCat && readingOrderCat.score === null) {
    notAssessed.push({
      sc: "1.3.2",
      name: "Meaningful Sequence",
      level: "A",
      reason:
        "Reading order could not be automatically verified for this document; manual review is required.",
      url: wcagUrl("1.3.2"),
    });
  }

  // New in WCAG 2.2: surface the form-relevant new A/AA criteria as
  // "not assessed — manual review" when this document has interactive form
  // fields. Never as failures (no automated evidence). Web-UI-only new
  // criteria (focus, dragging, consistent help) are documented on the
  // /wcag-2-2 page instead, not per-document.
  //
  // NO LONGER GATED ON WCAG.VERSION (user decision, 2026-08-31). When the
  // displayed standard moved to 2.1 these notes vanished, which is defensible
  // — they are not part of 2.1 — but it silently removed useful advice from
  // exactly the documents that need it, and left four surfaces promising a
  // disclosure that no longer happened. They are restored as ASPIRATIONAL:
  // the reason says plainly that they sit beyond the standard being measured,
  // so no reader can mistake one for something the law asks of them.
  if (qpdf.hasAcroForm) {
    for (const c of WCAG_22_NEW_AA) {
      if (!c.pdfFormRelevant) continue;
      notAssessed.push({
        sc: c.sc,
        name: c.name,
        level: c.level as "A" | "AA",
        reason:
          "Beyond the standard your grade measures: this is new in WCAG 2.2, and WCAG 2.1 is what ADA Title II and the Illinois IITAA require. It applies to interactive form controls, so it is worth a look by hand if you are aiming past the legal minimum. Nothing here affects your grade or your compliance.",
        url: wcagUrl(c.sc),
      });
    }
  }

  // Embedded audio/video/rich media (v1.92.0 — the census in qpdfService).
  // Presence is detected structurally; whether the media carries captions or
  // alternatives is not machine-verified — the same disclosure the PPTX gate
  // has made since its media census. Never a failure from presence alone.
  const media = qpdf.mediaAnnotationCounts;
  const mediaTotal = media ? media.screen + media.movie + media.sound + media.richMedia : 0;
  if (mediaTotal > 0) {
    notAssessed.push({
      sc: "1.2.2",
      name: "Captions (Prerecorded)",
      level: "A",
      reason: `This document embeds audio, video, or rich-media content (${mediaTotal} multimedia annotation${mediaTotal === 1 ? "" : "s"}); whether it provides captions or text alternatives is not machine-verified — manual review required.`,
      url: wcagUrl("1.2.2"),
    });
  }

  // The universally-unassessed criteria, with 3.1.2 upgraded from an abstract
  // caveat to the document's own evidence when the tag tree declares spans in
  // other languages. Compared by primary subtag ("en" vs "en-US" is not a
  // foreign passage); Word's language autodetect routinely scatters wrong
  // span languages through an English document, and whether each is a real
  // foreign passage or noise is exactly the judgment a machine cannot make.
  const docPrimaryLang = (qpdf.lang || "").toLowerCase().split("-")[0];
  const foreignSpanLangs = [
    ...new Set(
      (qpdf.langSpans ?? [])
        .map((s) => (s.lang || "").toLowerCase().split("-")[0])
        .filter((lang) => lang.length > 0 && lang !== docPrimaryLang),
    ),
  ];
  for (const criterion of universalNotAssessed()) {
    if (criterion.sc === "3.1.2" && foreignSpanLangs.length > 0) {
      notAssessed.push({
        ...criterion,
        reason: `This document declares passages in ${foreignSpanLangs.join(", ")} alongside its main language. Screen readers will switch pronunciation for each — whether every marking is a real foreign-language passage (rather than authoring-tool autodetect noise) and whether unmarked foreign passages remain is not automatically verified.`,
      });
    } else {
      notAssessed.push(criterion);
    }
  }

  const status: ConformanceVerdict["status"] =
    failures.length > 0 ? "fail" : "no-automated-failures";

  // Headlines are framed around Level AA — the bar the Illinois IITAA and the
  // ADA Title II rule actually require. A Level A failure is, by definition,
  // also a Level AA failure (AA conformance requires every A and AA criterion
  // to pass), so a document with confirmed Level A failures does not meet AA.
  const aCount = failures.filter((f) => f.level === "A").length;
  const aaCount = failures.filter((f) => f.level === "AA").length;
  const failBreakdown =
    aaCount === 0
      ? `${aCount} Level A failure${aCount === 1 ? "" : "s"}`
      : aCount === 0
        ? `${aaCount} Level AA failure${aaCount === 1 ? "" : "s"}`
        : `${aCount} Level A and ${aaCount} Level AA failures`;

  const headline =
    status === "fail"
      ? // WCAG 2.1 by name, whatever the audit basis: every criterion that can
        // appear in `failures` exists in WCAG 2.1 A/AA (enforced by the
        // wcag21Purity tests), so failing them fails 2.1 — the standard the
        // ADA Title II rule and the Illinois IITAA actually mandate.
        `This document does not meet WCAG 2.1 Level AA — ${failBreakdown} confirmed by automated checks. WCAG 2.1 Level AA is the standard required by the Illinois IITAA and the ADA Title II rule, and it requires every Level A and Level AA success criterion to pass.`
      : `No automated WCAG failures were detected. This is not a determination of conformance — WCAG ${WCAG.VERSION} Level AA also requires color contrast (not evaluated here) and the correctness of alt text, headings, reading order, and tags, all of which require manual review.`;

  return { status, failures, notAssessed, headline };
}

/**
 * Shared status/headline tail for the Office-format gates (docx, pptx, and
 * xlsx). Extracted from the original `evaluateDocxConformance` tail — the
 * docx gate's own tests pin its behavior unchanged, so any future edit here
 * must keep `docxConformance.test.ts` green.
 *
 * `contrastNotEvaluated` drives only the headline's contrast caveat clause
 * (the caller decides — and separately pushes — the corresponding
 * `NotAssessedCriterion` entry; this flag does not add one itself).
 */
function finalizeVerdict(
  failures: ConformanceFinding[],
  notAssessed: NotAssessedCriterion[],
  contrastNotEvaluated: boolean,
  // v1.95.0: distinct run-level language subtags (docx), mirroring the PDF
  // gate's evidence-backed 3.1.2 reason. Empty/omitted keeps the generic.
  foreignSpanLangs: string[] = [],
): ConformanceVerdict {
  // Every Office verdict funnels through here, so the universally-unassessed
  // document criteria are appended in one place for docx/pptx/xlsx. (The PDF
  // gate has its own tail and appends them itself, with a 3.1.2 reason built
  // from the document's measured language spans.)
  const universal = universalNotAssessed().map((c) =>
    c.sc === "3.1.2" && foreignSpanLangs.length > 0
      ? {
          ...c,
          reason: `This document declares passages in ${foreignSpanLangs.join(", ")} alongside its main language. Screen readers will switch pronunciation for each — whether every marking is a real foreign-language passage (rather than autodetect noise) and whether unmarked foreign passages remain is not automatically verified.`,
        }
      : c,
  );
  notAssessed = [...notAssessed, ...universal];

  const status: ConformanceVerdict["status"] =
    failures.length > 0 ? "fail" : "no-automated-failures";

  const aCount = failures.filter((f) => f.level === "A").length;
  const aaCount = failures.filter((f) => f.level === "AA").length;
  const failBreakdown =
    aaCount === 0
      ? `${aCount} Level A failure${aCount === 1 ? "" : "s"}`
      : aCount === 0
        ? `${aaCount} Level AA failure${aaCount === 1 ? "" : "s"}`
        : `${aCount} Level A and ${aaCount} Level AA failures`;

  const contrastNote = contrastNotEvaluated ? ", and color contrast was not evaluated" : "";
  const headline =
    status === "fail"
      ? // WCAG 2.1 by name, whatever the audit basis: every criterion that can
        // appear in `failures` exists in WCAG 2.1 A/AA (enforced by the
        // wcag21Purity tests), so failing them fails 2.1 — the standard the
        // ADA Title II rule and the Illinois IITAA actually mandate.
        `This document does not meet WCAG 2.1 Level AA — ${failBreakdown} confirmed by automated checks. WCAG 2.1 Level AA is the standard required by the Illinois IITAA and the ADA Title II rule, and it requires every Level A and Level AA success criterion to pass.`
      : `No automated WCAG failures were detected. This is not a determination of conformance — WCAG ${WCAG.VERSION} Level AA still requires manual review of reading order and the correctness of alt text, headings, and table header associations${contrastNote}.`;

  return { status, failures, notAssessed, headline };
}

/**
 * DOCX conformance gate. A self-contained analogue of `evaluateConformance`
 * (the PDF gate is left untouched). Same discipline: fires only on confirmed,
 * machine-checkable violations, mapped to the same WCAG success criteria and
 * levels. Heuristic signals (fake headings, manual bullets) stay in scoring.
 *
 * Unlike the PDF gate, color contrast IS machine-checkable for Word (explicit
 * and theme run colors are in the XML), so 1.4.3 can be a confirmed failure
 * here and is only listed "not assessed" when no colored text was resolvable.
 */
export function evaluateDocxConformance(analysis: DocxAnalysis): ConformanceVerdict {
  // The document body could not be parsed — every content-derived signal is
  // empty, and a "no-automated-failures" verdict over unanalyzed content
  // would be a false clean bill (the PDF gate has had this incomplete state
  // since v1.22; DOCX silently lacked it).
  if (analysis.parse && !analysis.parse.documentOk) {
    return {
      status: "incomplete",
      failures: [],
      notAssessed: [],
      headline:
        "The Word document's body could not be parsed, so its content was never analyzed and no WCAG conformance verdict could be determined. A full manual review is required.",
    };
  }

  const failures: ConformanceFinding[] = [];
  const add = (
    sc: string,
    name: string,
    level: "A" | "AA",
    category: string,
    issue: string,
  ): void => {
    failures.push({ sc, name, level, category, issue, url: wcagUrl(sc) });
  };
  const stylesUnreadable = analysis.parse?.stylesState === "unparseable";
  const coreUnreadable = analysis.parse?.coreState === "unparseable";

  // 1. Non-decorative images without alt text → 1.1.1.
  const imagesMissingAlt = analysis.images.filter(
    (i) => !i.decorative && !(i.altText && i.altText.trim()),
  ).length;
  if (imagesMissingAlt > 0) {
    add(
      "1.1.1",
      "Non-text Content",
      "A",
      "alt_text",
      `${imagesMissingAlt} image(s) have no alternative text. In Word, right-click each image → View Alt Text (some Word versions call it Edit Alt Text) and add a description (or mark it decorative).`,
    );
  }

  // 2. No declared document language → 3.1.1. Suppressed when the parts the
  //    language is read FROM could not be parsed — "the part said nothing"
  //    and "the part could not be read" must not produce the same confirmed
  //    claim.
  if (!analysis.metadata.language && !stylesUnreadable && !coreUnreadable) {
    add(
      "3.1.1",
      "Language of Page",
      "A",
      "title_language",
      "No document language is declared, so assistive technology cannot determine which pronunciation rules to apply. In Word: Review → Language → Set Proofing Language.",
    );
  }

  // 3. No document title → 2.4.2 (suppressed when core.xml was unparseable).
  if (!analysis.metadata.title && !coreUnreadable) {
    add(
      "2.4.2",
      "Page Titled",
      "A",
      "title_language",
      "The document has no title in its properties; a screen reader announces the filename instead. In Word: File → Info → Properties → Title.",
    );
  }

  // 3b. Paragraphs styled to LOOK like headings without Heading styles —
  //     WCAG's documented failure F2 for 1.3.1 (styling conveys structure
  //     the markup does not). Mirrors scoreDocxHeadings' `fakes` deduction.
  if (analysis.fakeHeadings.length > 0) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "heading_structure",
      `${analysis.fakeHeadings.length} paragraph(s) are formatted to look like headings (bold/large text) without a real Heading style — the visual structure is not programmatically determinable (WCAG failure F2). Apply Heading 1–6 styles.`,
    );
  }

  // 3b-ii. A Heading style on a blank line — structural markup used to make
  //     space, announcing a section that is not there — presentation
  //     conveying a relationship the content does not have, which is 1.3.1
  //     itself. (Not F43: that failure is HTML-scoped and its examples are
  //     all VISIBLE text styled as a heading.) Mirrors the deduction
  //     scoreDocxHeadings applies; the pair is required, because only a named
  //     criterion may move a score.
  // The same predicate scoreDocxHeadings uses. Belt and braces after the
  // 2026-08-31 adversarial audit: an accusation must never outlive the
  // deduction it mirrors.
  if ((analysis.emptyHeadingCount ?? 0) > 0) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "heading_structure",
      `${analysis.emptyHeadingCount} Heading-styled paragraph(s) contain no text — a heading style used for spacing rather than to mark a section, so the outline announces a section that does not exist.`,
    );
  }

  // 3c. Manually typed bullets/numbers instead of Word's list formatting —
  //     the list structure exists visually but not programmatically (1.3.1;
  //     W3C technique H48 is the sufficient path). Mirrors the
  //     manualBulletParagraphs deduction.
  if (analysis.lists.manualBulletParagraphs > 0) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "list_structure",
      `${analysis.lists.manualBulletParagraphs} paragraph(s) use typed bullets or numbers instead of Word's list formatting, so they are not announced as a list. Use the Bullets/Numbering buttons.`,
    );
  }

  // 4. Data tables (≥2×2, to skip layout tables) with no header row → 1.3.1.
  //    Tables with NO data-table indicators anywhere (no table style, no
  //    borders, no shading, no header marks) are overwhelmingly layout grids
  //    — asserting a confirmed Level A violation on them was the layout-table
  //    false positive promoted to the verdict. They stay a scoring concern.
  const dataTablesNoHeader = analysis.tables.filter(
    (t) => !t.hasHeaderRow && t.rowCount >= 2 && t.colCount >= 2 && t.looksLikeLayout !== true,
  ).length;
  if (dataTablesNoHeader > 0) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "table_markup",
      `${dataTablesNoHeader} data table(s) have no header row, so screen readers cannot associate data cells with their headers. In Word: select the top row → Table Layout → Repeat Header Rows.`,
    );
  }

  // 5. Confirmed low-contrast text → 1.4.3 (machine-checkable for Word).
  if (analysis.contrast.failing.length > 0) {
    const worst = analysis.contrast.failing.reduce((a, b) => (a.ratio < b.ratio ? a : b));
    add(
      "1.4.3",
      "Contrast (Minimum)",
      "AA",
      "color_contrast",
      `${analysis.contrast.failing.length} text run(s) fall below the WCAG contrast minimum (worst ${worst.ratio}:1, e.g. ${worst.foreground} on ${worst.background}). Adjust the font or background color in Word.`,
    );
  }

  // A link with NO TEXT AT ALL has no accessible name. WCAG 4.1.2 Name, Role,
  // Value (Level A) names links explicitly among the user interface components
  // whose "name and role can be programmatically determined", and unlike 2.4.4
  // it offers no context escape hatch — a name is present or it is not. This
  // is the ONE link-text defect an automated check can assert, which is why
  // the scorers penalise it and report weak-but-present text instead.
  // Added 2026-08-31: the scorers had been deducting for the whole class,
  // including vague text, while this gate named no criterion for any of it.
  {
    const unnamedLinks = (analysis.links ?? []).filter(
      (l) => classifyLinkText(l.text ?? "") === "unnamed",
    ).length;
    if (unnamedLinks > 0) {
      add(
        "4.1.2",
        "Name, Role, Value",
        "A",
        "link_quality",
        `${unnamedLinks} link(s) carry no link text, so nothing identifies them to a screen reader — the link is announced with no name at all. Give each one descriptive text in the "Text to display" field.`,
      );
    }
  }

  // --- criteria not assessed automatically ----------------------------------
  const floatingCount = analysis.floatingObjectCount ?? 0;
  const notAssessed: NotAssessedCriterion[] = [
    {
      sc: "1.3.2",
      name: "Meaningful Sequence",
      level: "A",
      reason:
        floatingCount > 0
          ? `Word's linear flow preserves the order of ordinary paragraphs, but this document has ${floatingCount} floating (anchored) object(s) whose reading position is set by anchoring — verify each is announced where a reader expects it.`
          : "Word's linear document flow usually preserves reading order, but floating objects and text boxes are not automatically verified — manual review recommended.",
      url: wcagUrl("1.3.2"),
    },
  ];
  // Contrast is assessed when explicit colors were resolvable; only surface it
  // as "not assessed" when nothing could be checked.
  if (analysis.contrast.checkedRuns === 0) {
    notAssessed.push({
      sc: "1.4.3",
      name: "Contrast (Minimum)",
      level: "AA",
      reason:
        "No text with a resolvable color was found (explicit and theme-based colors are both checked since v1.95.0; style-inherited and automatic colors are not), so contrast could not be evaluated.",
      url: wcagUrl("1.4.3"),
    });
  }

  return finalizeVerdict(
    failures,
    notAssessed,
    analysis.contrast.checkedRuns === 0,
    analysis.runLanguages ?? [],
  );
}

/**
 * PPTX conformance gate. A self-contained analogue of `evaluateDocxConformance`
 * — same structure, same discipline: fires only on confirmed, machine-checkable
 * violations. Heuristic signals stay in scoring, not here — most notably a
 * slide missing its own title (`slide_titles`) and the title-first reading-order
 * heuristic (`reading_order`) are NOT gate failures, since neither is a
 * confirmed WCAG violation on its own.
 *
 * Color contrast is machine-checkable the same way as docx (explicit run/theme
 * colors are in the XML), so 1.4.3 can be a confirmed failure here too.
 */
export function evaluatePptxConformance(analysis: PptxAnalysis): ConformanceVerdict {
  const failures: ConformanceFinding[] = [];
  const add = (
    sc: string,
    name: string,
    level: "A" | "AA",
    category: string,
    issue: string,
  ): void => {
    failures.push({ sc, name, level, category, issue, url: wcagUrl(sc) });
  };

  // 1. Non-decorative images without alt text → 1.1.1.
  const imagesMissingAlt = analysis.images.filter(
    (i) => !i.decorative && !(i.altText && i.altText.trim()),
  ).length;
  if (imagesMissingAlt > 0) {
    add(
      "1.1.1",
      "Non-text Content",
      "A",
      "alt_text",
      `${imagesMissingAlt} image(s) have no alternative text. In PowerPoint: right-click each image → View Alt Text (some versions call it Edit Alt Text) and add a description (or mark it decorative).`,
    );
  }

  // 2. No declared presentation language → 3.1.1.
  if (!analysis.metadata.language) {
    add(
      "3.1.1",
      "Language of Page",
      "A",
      "title_language",
      "No presentation language is declared, so assistive technology cannot determine which pronunciation rules to apply. In PowerPoint: Review → Language → Set Proofing Language.",
    );
  }

  // 3. No document title → 2.4.2. This is the file's Title property (what a
  //    screen reader announces on open), not a slide's own title placeholder
  //    text and not footer text — those are separate things and neither one
  //    sets this property.
  if (!analysis.metadata.title) {
    add(
      "2.4.2",
      "Page Titled",
      "A",
      "title_language",
      "The presentation has no title in its properties; a screen reader announces the filename instead. In PowerPoint: File → Info → Properties → Title (Insert → Header & Footer is not a slide title — it only sets footer text — and a slide's own Title placeholder does not set this property either).",
    );
  }

  // 4. Data tables (≥2×2, to skip layout tables) with no header row → 1.3.1.
  const dataTablesNoHeader = analysis.tables.filter(
    (t) => !t.hasHeaderRow && t.rowCount >= 2 && t.colCount >= 2,
  ).length;
  if (dataTablesNoHeader > 0) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "table_markup",
      `${dataTablesNoHeader} data table(s) have no header row, so screen readers cannot associate data cells with their headers. In PowerPoint: select the table → Table Design → check Header Row.`,
    );
  }

  // 5. Confirmed low-contrast text → 1.4.3 (machine-checkable via explicit
  //    run/theme colors, same discipline as the docx gate).
  if (analysis.contrast.failing.length > 0) {
    const worst = analysis.contrast.failing.reduce((a, b) => (a.ratio < b.ratio ? a : b));
    add(
      "1.4.3",
      "Contrast (Minimum)",
      "AA",
      "color_contrast",
      `${analysis.contrast.failing.length} text run(s) fall below the WCAG contrast minimum (worst ${worst.ratio}:1, e.g. ${worst.foreground} on ${worst.background}). Adjust the font or background color in PowerPoint.`,
    );
  }

  // A link with NO TEXT AT ALL has no accessible name. WCAG 4.1.2 Name, Role,
  // Value (Level A) names links explicitly among the user interface components
  // whose "name and role can be programmatically determined", and unlike 2.4.4
  // it offers no context escape hatch — a name is present or it is not. This
  // is the ONE link-text defect an automated check can assert, which is why
  // the scorers penalise it and report weak-but-present text instead.
  // Added 2026-08-31: the scorers had been deducting for the whole class,
  // including vague text, while this gate named no criterion for any of it.
  {
    const unnamedLinks = (analysis.links ?? []).filter(
      (l) => classifyLinkText(l.text ?? "") === "unnamed",
    ).length;
    if (unnamedLinks > 0) {
      add(
        "4.1.2",
        "Name, Role, Value",
        "A",
        "link_quality",
        `${unnamedLinks} link(s) carry no link text, so nothing identifies them to a screen reader — the link is announced with no name at all. Give each one descriptive text in the "Text to display" field.`,
      );
    }
  }

  // A heading typed into a floating text box instead of the slide's title
  // placeholder. The heading EXISTS — it is visibly one — and nothing marks
  // it as such, which is structure conveyed by presentation alone: WCAG 1.3.1
  // Level A, exactly as Word has scored it since the start. Deliberately NOT
  // the same question as "should this slide have a title at all", which is
  // 2.4.10 Section Headings, Level AAA, and stays out of the grade (see the
  // note on slide_titles above).
  if ((analysis.fakeHeadings ?? []).length > 0) {
    const n = analysis.fakeHeadings.length;
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "slide_titles",
      `${n} slide(s) carry a heading typed into an ordinary text box rather than the slide's title placeholder, so the heading is visible but not programmatically a heading. In PowerPoint: Home → Layout → choose a layout with a Title, then move the text into the title placeholder.`,
    );
  }

  // --- criteria not assessed automatically ----------------------------------
  const notAssessed: NotAssessedCriterion[] = [
    {
      sc: "1.3.2",
      name: "Meaningful Sequence",
      level: "A",
      reason:
        "Only whether each slide's title placeholder reads first is checked; the reading order of the remaining shapes (text boxes, grouped objects) on each slide is not automatically verified — manual review recommended.",
      url: wcagUrl("1.3.2"),
    },
  ];
  // Contrast is assessed when an explicit run or theme color was resolvable;
  // only surface it as "not assessed" when nothing could be checked.
  if (analysis.contrast.checkedRuns === 0) {
    notAssessed.push({
      sc: "1.4.3",
      name: "Contrast (Minimum)",
      level: "AA",
      reason:
        "No text with an explicit run color was found; formatting inherited from a slide layout or master is not resolved in this version, so contrast could not be evaluated.",
      url: wcagUrl("1.4.3"),
    });
  }
  // Hand-typed bullets → 1.3.1 (Level A; F2's class — visual list structure
  // with no programmatic list). Mirrors the list_structure deduction in
  // scoring/pptx.ts exactly as the Word gate has since 2026-08-31; until
  // 2026-09-01 the pptx gate had no list rule at all, so a deck capped at D
  // named no criterion.
  if (analysis.lists.manualBulletParagraphs > 0) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "list_structure",
      `${analysis.lists.manualBulletParagraphs} paragraph(s) use typed characters instead of PowerPoint's bullet/numbering formatting, so they are not announced as a list. Use the Bullets/Numbering controls.`,
    );
  }

  // Embedded audio/video is detected structurally, but caption presence and
  // quality are not — surfaced as not-assessed whenever the deck has media.
  if (analysis.hasMedia) {
    notAssessed.push({
      sc: "1.2.2",
      name: "Captions (Prerecorded)",
      level: "A",
      reason:
        "This presentation contains embedded audio or video; whether it has captions is not machine-verified — manual review required.",
      url: wcagUrl("1.2.2"),
    });
  }

  return finalizeVerdict(failures, notAssessed, analysis.contrast.checkedRuns === 0);
}

/**
 * XLSX conformance gate. A self-contained analogue of `evaluateDocxConformance`
 * — same structure, same discipline: fires only on confirmed, machine-checkable
 * violations. The 1.3.1 table check fires ONLY on a defined table with header
 * row explicitly off (`hasHeaderRow: false`); the "data range with no defined
 * table" signal and merged-cell counts are scoring-only advisories, never a
 * confirmed WCAG violation on their own (a data region without a Table object
 * may still be a legitimate, if unstructured, layout; merges alone don't imply
 * broken header association).
 *
 * Color contrast is machine-checkable the same way as docx/pptx (styles.xml
 * cell styles carry explicit rgb colors), so 1.4.3 can be a confirmed failure
 * here too. Unlike docx/pptx, 3.1.1 is ALWAYS "not assessed": Excel workbooks
 * have no document-language property at all (not merely one this tool doesn't
 * resolve yet), so asserting a confirmed failure would overstate what's true —
 * this is a structural fact about the file format, not a v1 boundary.
 */
export function evaluateXlsxConformance(analysis: XlsxAnalysis): ConformanceVerdict {
  const failures: ConformanceFinding[] = [];
  const add = (
    sc: string,
    name: string,
    level: "A" | "AA",
    category: string,
    issue: string,
  ): void => {
    failures.push({ sc, name, level, category, issue, url: wcagUrl(sc) });
  };

  // 1. Non-decorative images without alt text → 1.1.1.
  const imagesMissingAlt = analysis.images.filter(
    (i) => !i.decorative && !(i.altText && i.altText.trim()),
  ).length;
  if (imagesMissingAlt > 0) {
    add(
      "1.1.1",
      "Non-text Content",
      "A",
      "alt_text",
      `${imagesMissingAlt} image(s) have no alternative text. In Excel: right-click the image → View Alt Text (some versions call it Edit Alt Text) and add a description (or mark it decorative).`,
    );
  }

  // 2. No document title → 2.4.2.
  if (!analysis.metadata.title) {
    add(
      "2.4.2",
      "Page Titled",
      "A",
      "title_language",
      "The workbook has no title in its properties; a screen reader announces the filename instead. In Excel: File → Info → Properties → Title.",
    );
  }

  // 3. Defined tables with the header row explicitly off → 1.3.1. Never the
  //    data-region heuristic (a used range with no Table object) and never
  //    merged cells — both are scoring-only advisories, not confirmed
  //    WCAG violations (see the doc comment above).
  // Single-column defined tables ("Format as Table" used for row banding on
  // a plain list) carry no data-cell/header association to break — gate only
  // multi-column tables (unknown span counts as multi, the safe default).
  const tablesNoHeader = analysis.tables.filter(
    (t) => !t.hasHeaderRow && (t.columnCount ?? 2) >= 2,
  ).length;
  if (tablesNoHeader > 0) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "table_markup",
      `${tablesNoHeader} table(s) have no header row, so screen readers cannot associate data cells with their headers. In Excel: select the range → Insert → Table → check "My table has headers".`,
    );
  }

  // 4. Confirmed low-contrast cell styles → 1.4.3 (machine-checkable via
  //    literal rgb colors on solid fills).
  if (analysis.contrast.failing.length > 0) {
    const worst = analysis.contrast.failing.reduce((a, b) => (a.ratio < b.ratio ? a : b));
    add(
      "1.4.3",
      "Contrast (Minimum)",
      "AA",
      "color_contrast",
      `${analysis.contrast.failing.length} cell style(s) fall below the WCAG contrast minimum (worst ${worst.ratio}:1, e.g. ${worst.foreground} on ${worst.background}). Adjust the font or fill color in Excel.`,
    );
  }

  // A link with NO TEXT AT ALL has no accessible name. WCAG 4.1.2 Name, Role,
  // Value (Level A) names links explicitly among the user interface components
  // whose "name and role can be programmatically determined", and unlike 2.4.4
  // it offers no context escape hatch — a name is present or it is not. This
  // is the ONE link-text defect an automated check can assert, which is why
  // the scorers penalise it and report weak-but-present text instead.
  // Added 2026-08-31: the scorers had been deducting for the whole class,
  // including vague text, while this gate named no criterion for any of it.
  {
    // Mirrors the scorer (2026-09-01): links whose text could not be
    // resolved from the file are excluded there, so they may not become a
    // confirmed 4.1.2 here — an unresolved link produced a failure beside a
    // link category that lost nothing. Only the Excel service emits
    // `resolved`; the Word/PowerPoint gates classify every link, as their
    // scorers do.
    const unnamedLinks = (analysis.links ?? []).filter(
      (l) => l.resolved && classifyLinkText(l.text ?? "") === "unnamed",
    ).length;
    if (unnamedLinks > 0) {
      add(
        "4.1.2",
        "Name, Role, Value",
        "A",
        "link_quality",
        `${unnamedLinks} link(s) carry no link text, so nothing identifies them to a screen reader — the link is announced with no name at all. Give each one descriptive text in the "Text to display" field.`,
      );
    }
  }

  // --- criteria not assessed automatically ----------------------------------
  const notAssessed: NotAssessedCriterion[] = [
    {
      sc: "3.1.1",
      name: "Language of Page",
      level: "A",
      reason:
        "Excel workbooks do not store a document language, so assistive technology falls back to the reader's defaults — this criterion cannot be evaluated for spreadsheets.",
      url: wcagUrl("3.1.1"),
    },
    {
      sc: "1.3.2",
      name: "Meaningful Sequence",
      level: "A",
      reason:
        "Reading order (sheet order and tab order) is not machine-verified — manual review recommended.",
      url: wcagUrl("1.3.2"),
    },
  ];
  // Contrast is assessed when a literal rgb color on a solid fill was
  // resolvable; only surface it as "not assessed" when nothing could be
  // checked.
  if (analysis.contrast.checkedRuns === 0) {
    notAssessed.push({
      sc: "1.4.3",
      name: "Contrast (Minimum)",
      level: "AA",
      reason:
        "No cell style with a resolvable color pair was found (literal, theme-based, and legacy indexed colors on solid fills are all checked since v1.95.0; automatic colors and non-solid fills are not), so contrast could not be evaluated.",
      url: wcagUrl("1.4.3"),
    });
  }

  return finalizeVerdict(failures, notAssessed, analysis.contrast.checkedRuns === 0);
}
