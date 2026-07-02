/**
 * Report-payload types — moved verbatim from apps/api/src/services/scorer.ts
 * so the web app can type API responses with the REAL shapes instead of
 * hand-kept partial copies (which had drifted). scorer.ts re-exports these,
 * so the CLI's `import { CategoryResult } from '.../scorer.js'` and every
 * internal API import keep working unchanged.
 */
import type { ScoringMode } from "./scoring.js";

export interface HelpLink {
  label: string;
  url: string;
}

export interface WcagCriterion {
  /** WCAG 2.1 success criterion number, e.g. "1.3.1". */
  sc: string;
  /** Success criterion name. */
  name: string;
  level: "A" | "AA";
}

export interface CategoryResult {
  id: string;
  label: string;
  weight: number;
  score: number | null; // null = N/A — see `notAssessed` to disambiguate
  grade: string | null;
  severity: string | null;
  findings: string[];
  explanation: string;
  helpLinks: HelpLink[];
  /**
   * Disambiguates a null `score`. When false/undefined, a null score means
   * "not applicable" — the document genuinely has no tables / forms / images
   * / etc. When true, it means "not assessed" — the tool does not or could
   * not evaluate this category (color contrast; reading order when the
   * rigorous check had insufficient data; alt text when images are present
   * but untagged). Surfaced as distinct states in the UI.
   */
  notAssessed?: boolean;
  /** WCAG 2.1 success criteria this category maps to (see WCAG_CATEGORY_MAP). */
  wcagCriteria?: WcagCriterion[];
}

export interface ScoreProfileResult {
  mode: ScoringMode;
  label: string;
  description: string;
  overallScore: number;
  grade: string;
  executiveSummary: string;
  categoryScores: Record<string, number | null>;
  categories: CategoryResult[];
  // For auditing transparency. On Practical, `rawOverallScore` is the
  // unfloored weighted average; `flooredToStrict` is true when that raw
  // number was lifted up to Strict's score to maintain the Strict ≤
  // Practical invariant. On Strict, these mirror `overallScore` and
  // `false`. Always present post-v1.15.0 so auditors can reconstruct
  // the pre-floor math when needed.
  rawOverallScore?: number;
  flooredToStrict?: boolean;
}
