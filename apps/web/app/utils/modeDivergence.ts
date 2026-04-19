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
      "When no real H1–H6 tags exist, Practical grants 70 (C) if the document still has rich tagged body structure (StructTreeRoot + 25+ paragraph tags) plus either bookmarks or custom heading-like tags that RoleMap resolves to <P>. Strict treats that same state as a hard failure (0 / F) because the semantics assistive technology actually needs are missing.",
    whyStrictMatters:
      "WCAG 1.3.1 and 2.4.6 require programmatic headings so screen-reader users can jump between sections with a \"next heading\" command. Paragraph tags, bookmarks, and visually styled pseudo-headings do not announce as headings. For Illinois agency publication or ADA Title II sign-off, Strict is the better primary signal.",
    whyPracticalMatters:
      "A document with hundreds of tagged paragraphs, a populated outline, and role-mapped heading-like tags IS materially more navigable than an untagged scan. Practical surfaces that progress so remediation teams can see movement quarter-over-quarter even before the final H1–H6 pass lands.",
  },
  table_markup: {
    label: "Scores can differ by mode",
    whatPracticalCredits:
      "When tables have valid <TR> row structure and consistent column counts but no <TH> header cells, Practical bumps the score to at least 70 (C) to reflect the remediation scaffold. Strict keeps the raw subscore, which usually lands in the 30–45 range because the headers component alone is 40 points.",
    whyStrictMatters:
      "Without <TH> (and ideally /Scope or /Headers), screen readers read data tables as a flat stream of numbers. Column and row headers are the single most important table-accessibility signal — WCAG 1.3.1 and PDF/UA both require them. Strict deliberately refuses to round that up.",
    whyPracticalMatters:
      "A grid with valid row structure and consistent columns is the scaffold that the <TH> / /Scope work depends on. Practical rewards that scaffold so progress is visible in dashboards and vendor-style rubrics, even when the final header pass is still ahead.",
  },
  reading_order: {
    label: "Scores can differ by mode",
    whatPracticalCredits:
      "Once the structure tree has depth > 1, Practical scores reading order using proxies — tab-order coverage across pages, content-order evidence (MCIDs), struct-tree depth, and the presence of paragraph / heading tags — starting at 55 and adding up to 40 bonus points. Strict reports N/A in the same state.",
    whyStrictMatters:
      "Strict refuses to score reading order above \"structure exists\" because a rigorous verdict requires comparing per-page marked-content order against the actual page content stream — a check this analyzer does not yet perform. N/A is an honest \"we can't verify that.\"",
    whyPracticalMatters:
      "The proxies (tab order, tree depth, paragraph/heading tagging) are genuine improvements. Practical surfaces a readiness score so teams can see movement even when a formal reading-order verdict is not available, and so vendor rubrics that grade on proxies line up.",
  },
  pdf_ua_compliance: {
    label: "Practical-only category",
    whatPracticalCredits:
      "Practical scores PDF/UA-oriented signals directly: tagged structure (+25), MarkInfo /Marked true (+20), PDF/UA identifier in metadata (+15), tab order on every page (+10), list legality (+up to 15), and table legality (+up to 15). Strict returns N/A and attaches guidance instead.",
    whyStrictMatters:
      "Illinois IITAA 2.1 §E205.4 frames final non-web document accessibility through WCAG 2.1, not PDF/UA. PDF/UA conformance is a separate technical standard that IITAA §504.2.2 references only for authoring-tool export capability. Strict therefore keeps the publication lens on WCAG signals and does not let PDF/UA findings drive the primary compliance score.",
    whyPracticalMatters:
      "PDF/UA signals correlate strongly with real assistive-technology quality, and many commercial remediation tools grade on them. A dedicated Practical category lets you reconcile against those tools, track PDF-specific progress, and surface PDF/UA-oriented fixes without overstating them as the governing legal rule.",
  },
};

const SAME_COPY: DivergenceCopy = {
  label: "Same in both modes",
  whatPracticalCredits: SAME_SCORE_LABEL,
  whyStrictMatters:
    "This category does not branch on the scoring mode, so Strict's and Practical's per-category scores for it are identical.",
  whyPracticalMatters:
    "Any difference you see in the overall grade between Strict and Practical is coming from the weight this category carries in each profile, not from a different evaluation.",
};

export function getDivergenceCopy(categoryId: string): DivergenceCopy {
  return DIVERGENCE_COPY[categoryId] ?? SAME_COPY;
}

export function canCategoryDiverge(categoryId: string): boolean {
  return categoryId in DIVERGENCE_COPY;
}
