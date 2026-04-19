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
      "When no real H1–H6 tags exist, Practical (developer extension) grants 70 (C) if the document still has rich tagged body structure (StructTreeRoot + 25+ paragraph tags) plus either bookmarks or custom heading-like tags that RoleMap resolves to <P>. Strict — ICJIA's rubric — treats that same state as a hard failure (0 / F) because the semantics assistive technology actually needs are missing.",
    whyStrictMatters:
      "Strict reflects ICJIA's rubric. WCAG 1.3.1 and 2.4.6 require programmatic headings so screen-reader users can jump between sections with a \"next heading\" command. Paragraph tags, bookmarks, and visually styled pseudo-headings do not announce as headings. For Illinois agency publication or ADA Title II sign-off, Strict is the authoritative signal.",
    whyPracticalMatters:
      "Practical is a developer-added progress lens, not ICJIA's rubric. The 70-point floor is a judgment call, not an accessibility-law standard. It is useful for tracking quarter-over-quarter improvement or reconciling against vendor rubrics — but do not cite it as an Illinois accessibility-law signal.",
  },
  table_markup: {
    label: "Scores can differ by mode",
    whatPracticalCredits:
      "When tables have valid <TR> row structure and consistent column counts but no <TH> header cells, Practical (developer extension) bumps the score to at least 70 (C) to reflect the remediation scaffold. Strict — ICJIA's rubric — keeps the raw subscore, which usually lands in the 30–45 range because the headers component alone is 40 points.",
    whyStrictMatters:
      "Strict reflects ICJIA's rubric. Without <TH> (and ideally /Scope or /Headers), screen readers read data tables as a flat stream of numbers. Column and row headers are the single most important table-accessibility signal — WCAG 1.3.1 requires them. Strict deliberately refuses to round that up.",
    whyPracticalMatters:
      "Practical is a developer-added lens. The 70-point floor on a headerless table with valid rows is a judgment call, not a WCAG / ADA / ITTAA requirement. It helps visualize remediation scaffolding in vendor-style rubrics, but it does not satisfy Illinois accessibility law until <TH> / /Scope work is complete.",
  },
  reading_order: {
    label: "Scores can differ by mode",
    whatPracticalCredits:
      "Once the structure tree has depth > 1, Practical (developer extension) scores reading order using proxies — tab-order coverage across pages, content-order evidence (MCIDs), struct-tree depth, and the presence of paragraph / heading tags — starting at 55 and adding up to 40 bonus points. Strict — ICJIA's rubric — reports N/A in the same state.",
    whyStrictMatters:
      "Strict reflects ICJIA's rubric. It refuses to score reading order above \"structure exists\" because a rigorous verdict requires comparing per-page marked-content order against the actual page content stream — a check this analyzer does not yet perform. N/A is an honest \"we can't verify that.\"",
    whyPracticalMatters:
      "Practical is a developer-added lens. The proxy scoring (55 baseline + up to 40 bonus) is a judgment call, not an Illinois accessibility-law signal. Useful for surfacing movement and reconciling against vendor rubrics that grade on similar proxies — but not a formal reading-order verdict.",
  },
  pdf_ua_compliance: {
    label: "Practical-only (developer extension)",
    whatPracticalCredits:
      "Practical (developer extension) scores PDF/UA-oriented signals directly: tagged structure (+25), MarkInfo /Marked true (+20), PDF/UA identifier in metadata (+15), tab order on every page (+10), list legality (+up to 15), and table legality (+up to 15). Strict — ICJIA's rubric — returns N/A and attaches guidance instead, because PDF/UA is not required by Illinois accessibility law for final documents.",
    whyStrictMatters:
      "Strict reflects ICJIA's rubric. Illinois IITAA §E205.4 frames final non-web document accessibility through WCAG 2.1, NOT PDF/UA. PDF/UA is a separate technical standard referenced in IITAA §504.2.2 only for authoring-tool export capability. Strict keeps the publication lens on WCAG signals and does not let PDF/UA findings drive the primary compliance score.",
    whyPracticalMatters:
      "This entire category is a developer-added extension, not ICJIA's rubric. PDF/UA signals correlate with assistive-technology quality and match what some commercial remediation tools grade on, so the score is useful for vendor reconciliation or PDF-specific progress tracking. It is NOT an Illinois accessibility-law signal — treat it as supplementary only.",
  },
};

const SAME_COPY: DivergenceCopy = {
  label: "Same in both modes",
  whatPracticalCredits: SAME_SCORE_LABEL,
  whyStrictMatters:
    "This category does not branch on the scoring mode. Strict reflects ICJIA's rubric (WCAG 2.1 AA / IITAA §E205.4) for this category and Practical uses the same evaluation.",
  whyPracticalMatters:
    "Any difference you see in the overall grade between Strict and Practical is coming from the weight this category carries in the developer-extension profile, not from a different evaluation.",
};

export function getDivergenceCopy(categoryId: string): DivergenceCopy {
  return DIVERGENCE_COPY[categoryId] ?? SAME_COPY;
}

export function canCategoryDiverge(categoryId: string): boolean {
  return categoryId in DIVERGENCE_COPY;
}
