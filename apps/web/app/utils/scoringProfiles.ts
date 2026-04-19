export type ScoringMode = "strict" | "remediation";

export interface ScoreProfile {
  label: string;
  description?: string;
  overallScore: number;
  grade: string;
  executiveSummary: string;
  categoryScores?: Record<string, number | null>;
}

export interface ScoredCategoryLike {
  id: string;
  score: number | null;
  grade: string | null;
  severity: string | null;
}

export const IITAA_PDFUA_URL =
  "https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html";

export const MODE_BUTTON_LABELS: Record<ScoringMode, string> = {
  strict: "Strict",
  remediation: "Practical",
};

export const MODE_PROFILE_LABELS: Record<ScoringMode, string> = {
  strict: "Strict semantic score",
  remediation: "Practical readiness score",
};

export const MODE_PROFILE_DESCRIPTIONS: Record<ScoringMode, string> = {
  strict:
    "Valid semantics-first lens on the same document. Prioritizes programmatically determinable headings, table semantics, and logical structure for ADA/WCAG/ITTAA-oriented review.",
  remediation:
    "Valid remediation/progress lens on the same document. More generous and more closely aligned to broader weighted remediation workflows, including a dedicated PDF/UA-oriented category. Illinois IITAA 2.1 references PDF/UA in authoring-tool rules, while Strict remains the primary document-level publication lens.",
};

export const MODE_RECOMMENDATION_TITLES: Record<ScoringMode, string> = {
  strict: "Use Strict as the primary mode for legal accessibility review.",
  remediation: "Practical is not the primary legal/compliance score.",
};

export const MODE_RECOMMENDATION_SUMMARIES: Record<ScoringMode, string> = {
  strict:
    "Strict and Practical score the same document through different valid accessibility lenses. Strict is the semantics-first lens: it emphasizes programmatically determinable headings, table headers, and logical structure, making it the better primary signal for Illinois agency publication and ADA/WCAG/ITTAA-oriented review.",
  remediation:
    "Strict and Practical score the same document through different valid accessibility lenses. Practical is the remediation/progress lens: it can score differently because it more closely follows a broader weighted remediation schema, including a dedicated PDF/UA-oriented category for signals such as MarkInfo, tab order, list/table legality, and PDF/UA identifiers. Illinois IITAA 2.1 expressly references PDF/UA in §504.2.2 for authoring-tool PDF export capability, while E205.4 frames electronic content accessibility through WCAG 2.1 for non-web documents, so switch back to Strict for publication and legal accessibility decisions.",
};

export const STRICT_MODE_RATIONALE_TEXT =
  "Choose Strict for the stronger ADA/WCAG/ITTAA-facing signal. It prioritizes programmatically determinable semantics — real headings, table headers, and logical structure — which makes it the better primary mode for agency publication and legal accessibility review.";

export const PRACTICAL_FINDINGS_NOTE_PREFIX =
  "Practical does not mean a different document. It is the same document viewed through a broader remediation/progress lens. That lens is valid for tracking improvement and vendor-style accessibility workflows because it rewards usable improvements such as bookmarks, broader tagging, cleaner table grids, and a dedicated PDF/UA-oriented category covering signals like MarkInfo, tab order, list/table legality, and PDF/UA identifiers. Illinois IITAA 2.1 expressly references PDF/UA in ";

export const PRACTICAL_FINDINGS_NOTE_SUFFIX =
  " for authoring tools, while E205.4 frames document-level electronic content accessibility through WCAG 2.1 for non-web documents. Use Strict for agency publication and legal accessibility decisions.";

export const CATEGORY_TABLE_PRACTICAL_PREFIX =
  "Practical does not mean a different document. It is the same document viewed through a valid remediation/progress lens. The score, grade, and severity shown below now reflect the softer practical-readiness scoring, while Strict remains the valid semantics-first lens on that same file. Use Strict for agency publication and ADA/WCAG/ITTAA-oriented legal accessibility review. Practical also includes a dedicated PDF/UA-oriented category. Illinois IITAA 2.1 expressly references PDF/UA in ";

export const CATEGORY_TABLE_PRACTICAL_SUFFIX =
  " for authoring tools, while E205.4 frames document-level electronic content accessibility through WCAG 2.1 for non-web documents.";

export const CATEGORY_TABLE_STRICT_PREFIX =
  "Switching to Practical does not switch to a different document. It applies a different valid accessibility lens to the same file. Strict remains the better primary view for agency publication and ADA/WCAG/ITTAA-oriented legal accessibility review, while Practical is a valid remediation/progress view that adds a broader weighted schema including PDF/UA-oriented audits. Illinois IITAA 2.1 expressly references PDF/UA in ";

export const CATEGORY_TABLE_STRICT_SUFFIX =
  " for authoring tools, while E205.4 still frames non-web document accessibility through WCAG 2.1, so Strict remains the better primary view.";

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

  const categoryScores = scoreProfiles?.[mode]?.categoryScores;
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
