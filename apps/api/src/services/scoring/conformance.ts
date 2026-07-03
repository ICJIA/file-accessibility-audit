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
import type { QpdfResult } from "../qpdfService.js";
import type { PdfjsResult } from "../pdfjsService.js";
import type { DocxAnalysis } from "../docxService.js";
import type { PptxAnalysis } from "../pptxService.js";
import type { XlsxAnalysis } from "../xlsxService.js";
import type { CategoryResult } from "../scorer.js";
import { computeReadingOrderFidelity } from "./readingOrderFidelity.js";
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

// WCAG "Understanding" page slugs, so every criterion the gate reports
// links to the exact, authoritative W3C explanation of the rule.
// Slugs are identical across WCAG 2.1 and 2.2 for carried-forward criteria;
// the new 2.2 criteria are appended at the bottom.
const WCAG_UNDERSTANDING_SLUGS: Record<string, string> = {
  "1.1.1": "non-text-content",
  "1.2.2": "captions-prerecorded",
  "1.3.1": "info-and-relationships",
  "1.3.2": "meaningful-sequence",
  "1.4.3": "contrast-minimum",
  "2.4.2": "page-titled",
  "2.4.4": "link-purpose-in-context",
  "2.4.5": "multiple-ways",
  "2.4.6": "headings-and-labels",
  "3.1.1": "language-of-page",
  "3.3.2": "labels-or-instructions",
  "4.1.2": "name-role-value",
  // New in WCAG 2.2 (form-relevant):
  "2.5.8": "target-size-minimum",
  "3.3.7": "redundant-entry",
  "3.3.8": "accessible-authentication-minimum",
};

/** URL of the W3C "Understanding" page for a WCAG success criterion. */
function wcagUrl(sc: string): string {
  const slug = WCAG_UNDERSTANDING_SLUGS[sc];
  const base = WCAG.UNDERSTANDING_BASE[WCAG.VERSION];
  return slug ? `${base}${slug}.html` : WCAG.QUICKREF[WCAG.VERSION];
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

  // 1. Untagged document — no structure tree at all.
  if (!qpdf.hasStructTree) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "text_extractability",
      "The document has no tag structure (StructTreeRoot), so headings, lists, tables, and reading order cannot be conveyed to assistive technology.",
    );
  }

  // 2. No extractable text — a scanned image of text.
  if (!pdfjs.error && !pdfjs.hasText) {
    add(
      "1.1.1",
      "Non-text Content",
      "A",
      "text_extractability",
      "No extractable text was found — the document appears to be scanned images of text, which a screen reader cannot read.",
    );
  }

  // 3. Tagged figures without alternative text.
  const figuresMissingAlt = qpdf.images.filter(
    (img) => img.ref && !img.hasAlt,
  ).length;
  if (figuresMissingAlt > 0) {
    add(
      "1.1.1",
      "Non-text Content",
      "A",
      "alt_text",
      `${figuresMissingAlt} image(s) tagged as <Figure> have no alternative text (/Alt).`,
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

  // 6. Malformed tagged lists (1.3.1, Level A). isWellFormed requires every
  //    <LI> to contain an <LBody>; a missing <Lbl> alone is advisory and must
  //    NOT be asserted as a confirmed failure (ISO 32000 permits label-less
  //    items, and common tooling emits LBody-only lists).
  const malformedLists = qpdf.lists.filter((l) => !l.isWellFormed).length;
  if (qpdf.lists.length > 0 && malformedLists > 0) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "reading_order",
      `${malformedLists} tagged list(s) have items without the required <LBody> structure, so list item content is not programmatically associated with the list.`,
    );
  }

  // 7. Tagged tables with no header cells.
  const tablesNoHeaders = qpdf.tables.filter((t) => !t.hasHeaders).length;
  if (tablesNoHeaders > 0) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "table_markup",
      `${tablesNoHeaders} table(s) have no header cells (<TH>), so screen readers cannot associate data cells with their headers.`,
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

  // 9. Confirmed reading-order drift — asserted ONLY from the rigorous
  //    struct-tree vs. content-stream MCID comparison itself, never from the
  //    reading_order category score. The category can be low for heuristic
  //    reasons (e.g. a flat structure tree scores 30) that say nothing about
  //    whether the order actually matches — asserting 1.3.2 from those would
  //    be an unconfirmed claim. Guarded by hasStructTree so we do not
  //    double-count finding #1.
  if (qpdf.hasStructTree) {
    const fidelity = computeReadingOrderFidelity(qpdf, pdfjs);
    if (fidelity.score !== null && fidelity.score <= 40) {
      add(
        "1.3.2",
        "Meaningful Sequence",
        "A",
        "reading_order",
        `The tagged reading order matched the visual order on only ${fidelity.similarityPct}% of comparable content (${fidelity.pagesAnalyzed} page(s) compared), so assistive technology will read the document out of sequence.`,
      );
    }
  }

  // --- criteria this tool does not assess automatically ---------------------
  // Always surfaced so a "no failures" verdict is never read as conformance.
  const notAssessed: NotAssessedCriterion[] = [
    {
      sc: "1.4.3",
      name: "Contrast (Minimum)",
      level: "AA",
      reason:
        "This tool does not yet measure rendered text/background color contrast.",
      url: wcagUrl("1.4.3"),
    },
  ];
  const readingOrderCat = categories.find((c) => c.id === "reading_order");
  if (readingOrderCat && readingOrderCat.score === null) {
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
  // fields. Never as failures (no automated evidence). Skipped entirely when
  // reverted to WCAG 2.1. Web-UI-only new criteria (focus, dragging, consistent
  // help) are documented on the /wcag-2-2 page instead, not per-document.
  if (WCAG.VERSION === "2.2" && qpdf.hasAcroForm) {
    for (const c of WCAG_22_NEW_AA) {
      if (!c.pdfFormRelevant) continue;
      notAssessed.push({
        sc: c.sc,
        name: c.name,
        level: c.level as "A" | "AA",
        reason:
          "New in WCAG 2.2. Applies to interactive PDF form controls/processes; this tool does not assess it automatically — manual review required.",
        url: wcagUrl(c.sc),
      });
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
      ? `This document does not meet WCAG ${WCAG.VERSION} Level AA — ${failBreakdown} confirmed by automated checks. Level AA conformance (the standard required by the Illinois IITAA 2.1 and the ADA Title II rule, which mandate WCAG 2.1 AA — a subset of 2.2) requires every Level A and Level AA success criterion to pass.`
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
): ConformanceVerdict {
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

  const contrastNote = contrastNotEvaluated
    ? ", and color contrast was not evaluated"
    : "";
  const headline =
    status === "fail"
      ? `This document does not meet WCAG ${WCAG.VERSION} Level AA — ${failBreakdown} confirmed by automated checks. Level AA conformance (the standard required by the Illinois IITAA 2.1 and the ADA Title II rule, which mandate WCAG 2.1 AA — a subset of 2.2) requires every Level A and Level AA success criterion to pass.`
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
export function evaluateDocxConformance(
  analysis: DocxAnalysis,
): ConformanceVerdict {
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
      `${imagesMissingAlt} image(s) have no alternative text. In Word, right-click each image → View Alt Text and add a description (or mark it decorative).`,
    );
  }

  // 2. No declared document language → 3.1.1.
  if (!analysis.metadata.language) {
    add(
      "3.1.1",
      "Language of Page",
      "A",
      "title_language",
      "No document language is declared, so assistive technology cannot determine which pronunciation rules to apply. In Word: Review → Language → Set Proofing Language.",
    );
  }

  // 3. No document title → 2.4.2.
  if (!analysis.metadata.title) {
    add(
      "2.4.2",
      "Page Titled",
      "A",
      "title_language",
      "The document has no title in its properties; a screen reader announces the filename instead. In Word: File → Info → Properties → Title.",
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
      `${dataTablesNoHeader} data table(s) have no header row, so screen readers cannot associate data cells with their headers. In Word: select the top row → Table Layout → Repeat Header Rows.`,
    );
  }

  // 5. Confirmed low-contrast text → 1.4.3 (machine-checkable for Word).
  if (analysis.contrast.failing.length > 0) {
    const worst = analysis.contrast.failing.reduce((a, b) =>
      a.ratio < b.ratio ? a : b,
    );
    add(
      "1.4.3",
      "Contrast (Minimum)",
      "AA",
      "color_contrast",
      `${analysis.contrast.failing.length} text run(s) fall below the WCAG contrast minimum (worst ${worst.ratio}:1, e.g. ${worst.foreground} on ${worst.background}). Adjust the font or background color in Word.`,
    );
  }

  // --- criteria not assessed automatically ----------------------------------
  const notAssessed: NotAssessedCriterion[] = [
    {
      sc: "1.3.2",
      name: "Meaningful Sequence",
      level: "A",
      reason:
        "Word's linear document flow usually preserves reading order, but floating objects and text boxes are not automatically verified — manual review recommended.",
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
        "No text with an explicit color was found; inherited and theme colors are not resolved in this version, so contrast could not be evaluated.",
      url: wcagUrl("1.4.3"),
    });
  }

  return finalizeVerdict(failures, notAssessed, analysis.contrast.checkedRuns === 0);
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
export function evaluatePptxConformance(
  analysis: PptxAnalysis,
): ConformanceVerdict {
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
      `${imagesMissingAlt} image(s) have no alternative text. In PowerPoint: right-click each image → View Alt Text and add a description (or mark it decorative).`,
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
    const worst = analysis.contrast.failing.reduce((a, b) =>
      a.ratio < b.ratio ? a : b,
    );
    add(
      "1.4.3",
      "Contrast (Minimum)",
      "AA",
      "color_contrast",
      `${analysis.contrast.failing.length} text run(s) fall below the WCAG contrast minimum (worst ${worst.ratio}:1, e.g. ${worst.foreground} on ${worst.background}). Adjust the font or background color in PowerPoint.`,
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
export function evaluateXlsxConformance(
  analysis: XlsxAnalysis,
): ConformanceVerdict {
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
      `${imagesMissingAlt} image(s) have no alternative text. In Excel: right-click the image → View Alt Text and add a description (or mark it decorative).`,
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
  const tablesNoHeader = analysis.tables.filter((t) => !t.hasHeaderRow).length;
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
    const worst = analysis.contrast.failing.reduce((a, b) =>
      a.ratio < b.ratio ? a : b,
    );
    add(
      "1.4.3",
      "Contrast (Minimum)",
      "AA",
      "color_contrast",
      `${analysis.contrast.failing.length} cell style(s) fall below the WCAG contrast minimum (worst ${worst.ratio}:1, e.g. ${worst.foreground} on ${worst.background}). Adjust the font or fill color in Excel.`,
    );
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
        "No cell style with an explicit color was found; only literal rgb colors on solid fills are resolvable in this version, so contrast could not be evaluated.",
      url: wcagUrl("1.4.3"),
    });
  }

  return finalizeVerdict(failures, notAssessed, analysis.contrast.checkedRuns === 0);
}
