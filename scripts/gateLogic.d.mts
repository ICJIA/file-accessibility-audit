// Hand-written declarations for gateLogic.mjs (the repo's pattern for
// plain-JS modules imported from TS — vitest accepts untyped .mjs imports
// that `tsc --noEmit` rejects).
export function fill(s: string, subs: Record<string, string>): string;

export interface LedgerRowLike {
  score?: number;
  grade?: string;
  categories?: Record<string, string>;
  error?: string;
}
export function diffRow(file: string, want: LedgerRowLike, got: LedgerRowLike): string[];

export interface TwinResultLike {
  overallScore: number;
  categories: Array<{ id: string; score: number | null }>;
}
export function twinViolations(
  bad: TwinResultLike,
  good: TwinResultLike,
  category: string,
): string[];
