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