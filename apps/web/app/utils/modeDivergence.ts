// Per-category explanations of why Strict and Practical can produce
// different scores for the same document, which mode the category branches
// on inside the scorer, and a short note on which mode is the better
// publication signal vs. the better progress signal for that category.
//
// Only four categories actually branch on the scoring mode:
//   - heading_structure
//   - table_markup
//   - reading_order
//   - pdf_ua_compliance
//
// Every other category computes the same category-level score in both
// modes. Those categories can still nudge the OVERALL grade because Strict
// and Practical weight them differently, but the per-category score itself
// does not diverge.

export interface DivergenceCopy {
  /**
   * Short label summarizing the divergence pattern for the card header —
   * e.g. "Scores can differ by mode" vs. "Same score in both modes; weight
   * differs".
   */
  label: string;
  /** What Practical credits that Strict does not, for this category. */
  whatPracticalCredits: string;
  /** Why the Strict interpretation matters for publication/legal review. */
  whyStrictMatters: string;
  /** Why the Practical interpretation is a useful progress signal. */
  whyPracticalMatters: string;
}

const SAME_SCORE_LABEL =
  "Same category score in both modes — only the weight differs between Strict and Practical.";

export const DIVERGENCE_COPY: Record<string, DivergenceCopy> = {
  heading_structure: {
    label: "Scores can differ by mode",
    whatPracticalCredits:
      "When no real H1–H6 tags exist, Practical grants 70 (C) if the document still has rich tagged body structure (StructTreeRoot + 25+ paragraph tags) plus either bookmarks or custom heading-like tags that RoleMap resolves to <P>. Strict treats the same state as a hard failure (0 / F) because WCAG programmatic-heading semantics are missing.",
    whyStrictMatters:
      "Strict is anchored to WCAG 2.1 AA and IITAA §E205.4. WCAG 1.3.1 and 2.4.6 require programmatic headings so screen-reader users can jump between sections with a \"next heading\" command. Paragraph tags, bookmarks, and visually styled pseudo-headings do not announce as headings — Strict refuses to round that up.",
    whyPracticalMatters:
      "Practical credits remediation scaffolding (rich tagged body + bookmarks or role-mapped heading-like tags) with a 70-point floor. The floor is a judgment call built into this tool, not a WCAG requirement. It is useful for tracking quarter-over-quarter improvement or reconciling against tools that give similar partial credit.",
  },
  table_markup: {
    label: "Scores can differ by mode",
    whatPracticalCredits:
      "When tables have valid <TR> row structure and consistent column counts but no <TH> header cells, Practical bumps the score to at least 70 (C) to reflect the remediation scaffold. Strict keeps the raw subscore, which usually lands in the 30–45 range because the headers component alone is 40 points.",
    whyStrictMatters:
      "Strict is anchored to WCAG 2.1 AA and IITAA §E205.4. Without <TH> (and ideally /Scope or /Headers), screen readers read data tables as a flat stream of numbers. Column and row headers are the single most important table-accessibility signal — WCAG 1.3.1 requires them.",
    whyPracticalMatters:
      "Practical's 70-point floor on a headerless table with valid rows is a judgment call built into this tool, not a WCAG / ADA / ITTAA requirement. It helps visualize remediation scaffolding, but it does not substitute for completed <TH> / /Scope work.",
  },
  reading_order: {
    label: "Scores can differ by mode",
    whatPracticalCredits:
      "Practical scores reading order using proxies — tab-order coverage across pages, content-order evidence, struct-tree depth, and the presence of paragraph / heading tags — starting at 55 and adding up to 40 bonus points. Strict performs a rigorous per-page MCID fidelity check (logical tag order vs. visual draw order) and produces a 0–100 score when it can extract enough shared MCIDs; otherwise it falls back to N/A.",
    whyStrictMatters:
      "Strict compares each page's structure-tree MCID sequence against its content-stream MCID sequence using a longest-common-subsequence ratio. That's the signal WCAG 1.3.2 Meaningful Sequence actually cares about — whether the tag order matches the visual flow a sighted reader sees.",
    whyPracticalMatters:
      "Practical's proxy scoring (55 baseline + up to 40 bonus) is a softer readiness signal built into this tool. It rewards remediation scaffolding (tab-order coverage, struct-tree depth) even when the rigorous MCID fidelity check isn't available. Useful for reconciling against tools that grade on similar proxies.",
  },
  pdf_ua_compliance: {
    label: "Practical-only (Strict does not include PDF/UA)",
    whatPracticalCredits:
      "Practical scores PDF/UA-oriented signals directly: tagged structure (+25), MarkInfo /Marked true (+20), PDF/UA identifier in metadata (+15), tab order on every page (+10), list legality (+up to 15), and table legality (+up to 15). Strict returns N/A and attaches guidance instead — Strict does not include a PDF/UA category.",
    whyStrictMatters:
      "Strict is anchored to WCAG 2.1 AA and IITAA §E205.4. IITAA §E205.4 frames final non-web document accessibility through WCAG 2.1, not PDF/UA. PDF/UA is referenced in IITAA §504.2.2 for authoring-tool export capability. Strict evaluates through WCAG signals only and does not include a PDF/UA category.",
    whyPracticalMatters:
      "Practical includes PDF/UA signals because they correlate with assistive-technology quality and match what many commercial remediation tools grade on. The score is useful for vendor reconciliation or PDF-specific progress tracking.",
  },
};

const SAME_COPY: DivergenceCopy = {
  label: "Same score in both modes",
  whatPracticalCredits: SAME_SCORE_LABEL,
  whyStrictMatters:
    "This category does not branch on the scoring mode. Strict applies WCAG 2.1 AA / IITAA §E205.4 for this category and Practical uses the same evaluation.",
  whyPracticalMatters:
    "Any difference you see in the overall grade between Strict and Practical for this category is coming from the category weight, not from a different evaluation.",
};

export function getDivergenceCopy(categoryId: string): DivergenceCopy {
  return DIVERGENCE_COPY[categoryId] ?? SAME_COPY;
}

export function canCategoryDiverge(categoryId: string): boolean {
  return categoryId in DIVERGENCE_COPY;
}

// Human-readable reason for why a category's score is N/A in the Category
// Scores table. Used to populate the accessible tooltip + footnote.
export function naReason(
  categoryId: string,
  mode: "strict" | "remediation",
): string {
  if (categoryId === "pdf_ua_compliance") {
    return mode === "strict"
      ? "Strict does not include a PDF/UA category. The Practical profile scores PDF/UA signals (MarkInfo, tab order, PDF/UA identifiers, list/table legality)."
      : "No PDF/UA signals detected for scoring.";
  }
  if (categoryId === "reading_order") {
    return mode === "strict"
      ? "Strict performs a per-page MCID fidelity check (logical tag order vs. visual draw order) but could not extract enough shared MCIDs from this document to produce a verdict — the structure tree and content stream didn't overlap sufficiently. Practical scores via softer proxies (tab-order coverage, struct-tree depth). Verify the tag order in Acrobat's Order panel or PAC before publishing."
      : "Reading order could not be evaluated.";
  }
  if (categoryId === "color_contrast") {
    return "Rendered-PDF color-contrast analysis is not yet implemented. Check contrast manually in Acrobat's Accessibility Checker or WebAIM's Contrast Checker before publishing.";
  }
  if (categoryId === "bookmarks") {
    return "Bookmarks are only scored for documents with 10 or more pages. Shorter documents do not need a bookmark tree for navigation.";
  }
  if (categoryId === "alt_text") {
    return "No images detected in the document, so alt-text coverage is not applicable.";
  }
  if (categoryId === "table_markup") {
    return "No tables detected in the document, so table-markup quality is not applicable.";
  }
  if (categoryId === "link_quality") {
    return "No hyperlinks detected in the document, so link quality is not applicable.";
  }
  if (categoryId === "form_accessibility") {
    return "No form fields detected in the document, so form accessibility is not applicable.";
  }
  return "This category does not apply to the current document.";
}
