export type ScoringMode = "strict" | "remediation";

export interface ScoredCategoryLike {
  id: string;
  score: number | null;
  grade: string | null;
  severity: string | null;
}

export interface ScoreProfile {
  label: string;
  description?: string;
  overallScore: number;
  grade: string;
  executiveSummary: string;
  categoryScores?: Record<string, number | null>;
  categories?: ScoredCategoryLike[];
}

export const IITAA_PDFUA_URL =
  "https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html";

// Origin / attribution per profile.
//   - Strict  → ICJIA's rubric, anchored to WCAG 2.1 AA + IITAA §E205.4.
//   - Practical → a developer-introduced extension that layers PDF/UA-oriented
//     checks on top of ICJIA's rubric. PDF/UA is NOT required by Illinois
//     accessibility law for final documents — IITAA §504.2.2 references it
//     only for authoring-tool export capability.
export const MODE_PROFILE_ORIGINS: Record<ScoringMode, string> = {
  strict: "icjia.iitaa.wcag21",
  remediation: "developer-extension.pdfua",
};

export const MODE_PROFILE_ORIGIN_LABELS: Record<ScoringMode, string> = {
  strict: "ICJIA / IITAA-aligned",
  remediation: "Developer extension — adds PDF/UA",
};

export const PRACTICAL_DISCLAIMER =
  "Practical is a developer extension that layers PDF/UA-oriented checks on top of ICJIA's Strict rubric. PDF/UA is not required by Illinois accessibility law for final documents — IITAA §504.2.2 references it only for authoring-tool export capability, while §E205.4 frames final-document accessibility through WCAG 2.1. Use Strict for Illinois agency publication decisions.";

export const PRACTICAL_DISCLAIMER_SHORT =
  "Practical is a developer extension (adds PDF/UA signals) — it is not ICJIA's rubric and is not required by Illinois accessibility law.";

export const MODE_BUTTON_LABELS: Record<ScoringMode, string> = {
  strict: "Strict",
  remediation: "Practical",
};

// Longer form used in banners, exports, and AI-analysis payloads.
export const MODE_PROFILE_LABELS: Record<ScoringMode, string> = {
  strict: "Strict semantic score (ICJIA rubric)",
  remediation: "Practical readiness score (developer extension)",
};

export const MODE_PROFILE_DESCRIPTIONS: Record<ScoringMode, string> = {
  strict:
    "ICJIA's rubric. Anchored to WCAG 2.1 AA and Illinois IITAA §E205.4 for non-web documents. Prioritizes programmatically determinable headings, table semantics, and logical structure.",
  remediation:
    "Developer-added lens. Layers PDF/UA-oriented checks on top of ICJIA's Strict rubric. PDF/UA is not required by Illinois accessibility law for final documents — it is referenced in IITAA §504.2.2 only for authoring-tool export capability. Use Strict for publication and legal accessibility decisions.",
};

export const MODE_RECOMMENDATION_TITLES: Record<ScoringMode, string> = {
  strict:
    "Use Strict — ICJIA's rubric — as the primary mode for legal accessibility review.",
  remediation:
    "Practical is a developer extension, not ICJIA's rubric or an Illinois accessibility-law signal.",
};

export const MODE_RECOMMENDATION_SUMMARIES: Record<ScoringMode, string> = {
  strict:
    "Strict is ICJIA's rubric, anchored to WCAG 2.1 AA and IITAA §E205.4 for non-web documents. It emphasizes programmatically determinable headings, table headers, and logical structure, which are the signals Illinois agency publication and ADA/WCAG/ITTAA-oriented review actually depend on. Practical is a developer-added extension that also scores PDF/UA signals — useful for progress tracking and vendor reconciliation, but not an Illinois accessibility-law signal.",
  remediation:
    "Practical is a developer-introduced extension that layers PDF/UA-oriented checks on top of ICJIA's Strict rubric. It can score differently because it adds a dedicated PDF/UA category (MarkInfo, tab order, list/table legality, PDF/UA identifiers) and applies partial-credit floors on heading and table structure. Illinois IITAA §504.2.2 references PDF/UA only for authoring-tool export capability, while §E205.4 frames final-document accessibility through WCAG 2.1. Switch back to Strict — ICJIA's rubric — for publication and legal accessibility decisions.",
};

export const STRICT_MODE_RATIONALE_TEXT =
  "Strict is ICJIA's rubric and the stronger ADA/WCAG/ITTAA-facing signal. It prioritizes programmatically determinable semantics — real headings, table headers, and logical structure — making it the better primary mode for Illinois agency publication and legal accessibility review.";

export const PRACTICAL_FINDINGS_NOTE_PREFIX =
  "Practical is a developer-added lens, not ICJIA's rubric. It is the same document viewed through an extended schema that adds PDF/UA-oriented signals (MarkInfo, tab order, list/table legality, PDF/UA identifiers) and applies partial-credit floors. PDF/UA is not required by Illinois accessibility law for final documents — IITAA §504.2.2 references it only for authoring-tool export capability via ";

export const PRACTICAL_FINDINGS_NOTE_SUFFIX =
  ", while §E205.4 frames final-document accessibility through WCAG 2.1. Use Strict — ICJIA's rubric — for publication and legal accessibility decisions.";

export const CATEGORY_TABLE_PRACTICAL_PREFIX =
  "Practical is a developer-added lens, not ICJIA's rubric. The score, grade, and severity shown below reflect the developer-extension schema (partial-credit floors plus a dedicated PDF/UA-oriented category). Use Strict for Illinois agency publication and ADA/WCAG/ITTAA-oriented legal accessibility review — Strict is ICJIA's rubric. IITAA §504.2.2 references PDF/UA only for authoring tools via ";

export const CATEGORY_TABLE_PRACTICAL_SUFFIX =
  ", while §E205.4 frames final-document accessibility through WCAG 2.1.";

export const CATEGORY_TABLE_STRICT_PREFIX =
  "Switching to Practical does not switch to a different document. It applies a developer-added extension that layers PDF/UA-oriented checks on top of ICJIA's Strict rubric. Strict remains the better primary view for Illinois agency publication and ADA/WCAG/ITTAA-oriented legal accessibility review, while Practical is a progress / vendor-reconciliation lens. IITAA §504.2.2 references PDF/UA only for authoring tools via ";

export const CATEGORY_TABLE_STRICT_SUFFIX =
  ", while §E205.4 still frames final-document accessibility through WCAG 2.1. Strict is the Illinois publication lens.";

export function gradeForScore(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function severityForScore(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 90) return "Pass";
  if (score >= 70) return "Minor";
  if (score >= 40) return "Moderate";
  return "Critical";
}

export function categoriesForScoringMode<T extends ScoredCategoryLike>(
  categories: T[] | null | undefined,
  scoreProfiles: Partial<Record<ScoringMode, ScoreProfile>> | null | undefined,
  mode: ScoringMode,
): T[] {
  if (!categories?.length) return [];

  const profile = scoreProfiles?.[mode];

  // Prefer the full per-profile category array when the API supplies it.
  // This ensures fields like `findings` and `explanation` match the mode —
  // e.g. `pdf_ua_compliance` cards show Strict-mode guidance text in Strict
  // and Practical-mode findings in Practical.
  if (profile?.categories?.length) {
    return profile.categories as unknown as T[];
  }

  const categoryScores = profile?.categoryScores;
  if (!categoryScores) return categories;

  return categories.map((category) => {
    if (!(category.id in categoryScores)) return category;

    const score = categoryScores[category.id] ?? null;
    return {
      ...category,
      score,
      grade: gradeForScore(score),
      severity: severityForScore(score),
    };
  });
}
