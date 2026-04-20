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
//   - Strict  → WCAG-based scoring methodology anchored to WCAG 2.1 AA +
//     IITAA §E205.4. Nine categories, no PDF/UA category.
//   - Practical → WCAG-based scoring methodology with different category
//     weights and an added PDF/UA Compliance Signals category (eleven
//     categories total). Applies partial-credit floors on heading and
//     table structure.
export const MODE_PROFILE_ORIGINS: Record<ScoringMode, string> = {
  strict: "wcag.iitaa.strict",
  remediation: "wcag.pdfua.practical",
};

export const MODE_PROFILE_ORIGIN_LABELS: Record<ScoringMode, string> = {
  strict: "WCAG + IITAA §E205.4",
  remediation: "WCAG + PDF/UA signals",
};

export const PRACTICAL_DISCLAIMER =
  "Both Strict and Practical evaluate the same document using WCAG guidelines. They use different category weights, and Practical adds a PDF/UA Compliance Signals category (MarkInfo, tab order, PDF/UA identifiers, list/table legality) with partial-credit floors on heading and table structure. Pick whichever view (or both together) matches what you're trying to learn about the document.";

export const PRACTICAL_DISCLAIMER_SHORT =
  "Practical uses different weights and includes PDF/UA signals; Strict does not. Both are valid WCAG-based evaluations of the same document.";

export const MODE_BUTTON_LABELS: Record<ScoringMode, string> = {
  strict: "Strict",
  remediation: "Practical",
};

// Longer form used in banners, exports, and AI-analysis payloads.
export const MODE_PROFILE_LABELS: Record<ScoringMode, string> = {
  strict: "Strict semantic score (WCAG + IITAA §E205.4)",
  remediation: "Practical readiness score (WCAG + PDF/UA)",
};

export const MODE_PROFILE_DESCRIPTIONS: Record<ScoringMode, string> = {
  strict:
    "Canonical score. Aligns with WCAG 2.1 Level AA, ADA Title II, and Illinois IITAA §E205.4 — the rules that govern non-web document accessibility. Nine categories, no PDF/UA category. Cite this score for legal-compliance and Illinois agency publication decisions.",
  remediation:
    "Strict plus an added PDF/UA layer (ISO 14289-1). Different category weights and a PDF/UA Compliance Signals category (MarkInfo, tab order, PDF/UA identifiers, list/table legality) with partial-credit floors on heading and table structure. PDF/UA is not a legal requirement for final PDFs under Illinois rules — IITAA references it only in §504.2.2 for authoring-tool export capability. Practical ≥ Strict always: it can lift the number when PDF/UA or partial-credit signals apply, but never drop below Strict.",
};

export const MODE_RECOMMENDATION_TITLES: Record<ScoringMode, string> = {
  strict:
    "Strict and Practical are two WCAG-based scoring methodologies for the same document — both are valid evaluations.",
  remediation:
    "Strict and Practical are two WCAG-based scoring methodologies for the same document — both are valid evaluations.",
};

export const MODE_RECOMMENDATION_SUMMARIES: Record<ScoringMode, string> = {
  strict:
    "Both Strict and Practical use WCAG guidelines to evaluate the same document. Strict weighs nine categories anchored to WCAG 2.1 AA and IITAA §E205.4 and does not include a PDF/UA category. Practical uses different category weights and adds a PDF/UA Compliance Signals category plus partial-credit floors on heading and table structure. The two can produce different scores because they emphasize different signals — pick whichever view (or both together) matches your question.",
  remediation:
    "Both Strict and Practical use WCAG guidelines to evaluate the same document. Practical uses different category weights than Strict and adds a PDF/UA Compliance Signals category (MarkInfo, tab order, list/table legality, PDF/UA identifiers) plus partial-credit floors on heading and table structure. The two can produce different scores because they emphasize different signals — pick whichever view (or both together) matches your question.",
};

export const STRICT_MODE_RATIONALE_TEXT =
  "Strict weighs nine categories anchored to WCAG 2.1 AA and IITAA §E205.4. It emphasizes programmatically determinable semantics — real headings, table headers, and logical structure — as the way it evaluates the document.";

export const PRACTICAL_FINDINGS_NOTE_PREFIX =
  "Practical adds a PDF/UA Compliance Signals category (MarkInfo, tab order, list/table legality, PDF/UA identifiers) plus partial-credit floors on heading and table structure. Useful for tracking PDF/UA tools and authoring exports referenced in IITAA ";

export const PRACTICAL_FINDINGS_NOTE_SUFFIX = ".";

export const CATEGORY_TABLE_PRACTICAL_PREFIX =
  "Practical uses different category weights than Strict and adds a PDF/UA Compliance Signals category plus partial-credit floors. Both evaluate the same document under WCAG. IITAA §504.2.2 references PDF/UA in ";

export const CATEGORY_TABLE_PRACTICAL_SUFFIX =
  ", while §E205.4 frames final-document accessibility through WCAG 2.1.";

export const CATEGORY_TABLE_STRICT_PREFIX =
  "Switching to Practical does not switch to a different document. Practical uses different category weights and adds PDF/UA-oriented rules plus partial-credit floors on heading and table structure. Both are valid WCAG-based evaluations. IITAA §504.2.2 references PDF/UA in ";

export const CATEGORY_TABLE_STRICT_SUFFIX =
  ", while §E205.4 still frames final-document accessibility through WCAG 2.1.";

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
