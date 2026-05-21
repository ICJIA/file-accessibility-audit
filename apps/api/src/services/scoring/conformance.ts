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
 *                               WCAG 2.1 violation was found.
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
import type { CategoryResult } from "../scorer.js";

export interface ConformanceFinding {
  /** WCAG 2.1 success criterion number, e.g. "1.1.1". */
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

// WCAG 2.1 "Understanding" page slugs, so every criterion the gate reports
// links to the exact, authoritative W3C explanation of the rule.
const WCAG_UNDERSTANDING_SLUGS: Record<string, string> = {
  "1.1.1": "non-text-content",
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
};

/** URL of the W3C "Understanding" page for a WCAG 2.1 success criterion. */
function wcagUrl(sc: string): string {
  const slug = WCAG_UNDERSTANDING_SLUGS[sc];
  return slug
    ? `https://www.w3.org/WAI/WCAG21/Understanding/${slug}.html`
    : "https://www.w3.org/WAI/WCAG21/quickref/";
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

  // 6. Malformed tagged lists (1.3.1, Level A).
  const malformedLists = qpdf.lists.filter((l) => !l.isWellFormed).length;
  if (qpdf.lists.length > 0 && malformedLists > 0) {
    add(
      "1.3.1",
      "Info and Relationships",
      "A",
      "reading_order",
      `${malformedLists} tagged list(s) are missing the required <Lbl>/<LBody> structure, so list relationships are not programmatically conveyed.`,
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

  // 9. Confirmed reading-order drift — only when the rigorous struct-tree vs.
  //    content-stream check actually ran and found substantial disorder.
  //    Guarded by hasStructTree so we do not double-count finding #1.
  if (qpdf.hasStructTree) {
    const readingOrder = categories.find((c) => c.id === "reading_order");
    if (
      readingOrder &&
      readingOrder.score !== null &&
      readingOrder.score <= 40
    ) {
      add(
        "1.3.2",
        "Meaningful Sequence",
        "A",
        "reading_order",
        "The tagged reading order differs substantially from the visual order of the page content, so assistive technology will read the document out of sequence.",
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
      ? `This document does not meet WCAG 2.1 Level AA — ${failBreakdown} confirmed by automated checks. Level AA conformance (the standard required by the Illinois IITAA and the ADA Title II rule) requires every Level A and Level AA success criterion to pass.`
      : "No automated WCAG failures were detected. This is not a determination of conformance — WCAG 2.1 Level AA also requires color contrast (not evaluated here) and the correctness of alt text, headings, reading order, and tags, all of which require manual review.";

  return { status, failures, notAssessed, headline };
}
