// As of v1.21.0 the UI shows only the Strict (WCAG + IITAA §E205.4) score.
// The previous Practical / PDF-UA flavored profile was retired because the
// PDF/UA signal it tried to summarize is now more authoritatively surfaced
// by the optional veraPDF check on the remediation result page.
//
// `ScoringMode` is retained as a type so server payloads with
// `scoreProfiles.strict` / `scoreProfiles.remediation` still type-check —
// the runtime only ever uses "strict" but the broader type keeps shared
// reports stored before v1.21 from triggering TS errors when loaded.

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
  if (score >= 100) return "No issues found";
  if (score >= 70) return "Minor";
  if (score >= 40) return "Moderate";
  return "Critical";
}

// Project the categories array onto the requested scoring mode's per-category
// scores when the API supplied profile-specific category arrays. In v1.21+
// the UI always passes "strict"; the parameter is retained so historical
// `scoreProfiles.remediation` payloads still round-trip through the helper
// without losing data.
export function categoriesForScoringMode<T extends ScoredCategoryLike>(
  categories: T[] | null | undefined,
  scoreProfiles: Partial<Record<ScoringMode, ScoreProfile>> | null | undefined,
  mode: ScoringMode,
): T[] {
  if (!categories?.length) return [];

  const profile = scoreProfiles?.[mode];

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
