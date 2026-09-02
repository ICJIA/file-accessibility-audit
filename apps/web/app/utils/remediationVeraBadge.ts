/**
 * The compact PDF/UA-1 badge beside the remediation headline score.
 *
 * Four states, decided in ONE place. The job API's `veraPdf` DTO carries an
 * `error` inside `summary` when the veraPDF run itself failed (timeout, no
 * output, unparseable JSON); read as a boolean that state is identical to a
 * real non-conformance, and the badge used to render it as an amber "!" with
 * "0 rule failures" while the <PdfUaVerdict> panel further down said "Could
 * not validate" (2026-09-02). The error check comes first for that reason.
 */
export type VeraBadgeState = "not-run" | "passed" | "failed" | "error";

export interface VeraBadgeInput {
  available: boolean | null;
  passed: boolean | null;
  summary?: { totalFailureCount?: number; error?: string } | null;
}

export interface VeraBadge {
  state: VeraBadgeState;
  /** Colour family for the pill: neutral (grey), good (green), warn (amber). */
  tone: "neutral" | "good" | "warn";
  icon: string;
  text: string;
  aria: string;
}

export function veraPdfBadge(v: VeraBadgeInput): VeraBadge {
  if (!v.available) {
    return {
      state: "not-run",
      tone: "neutral",
      icon: "–",
      text: "check not run",
      aria: "PDF/UA-1 conformance check not run (veraPDF not configured)",
    };
  }
  if (v.summary?.error || v.passed === null) {
    return {
      state: "error",
      tone: "neutral",
      icon: "?",
      text: "could not be checked",
      aria: "PDF/UA-1 conformance check could not be completed",
    };
  }
  if (v.passed) {
    return {
      state: "passed",
      tone: "good",
      icon: "✓",
      text: "conformance passed",
      aria: "PDF/UA-1 conformance check passed",
    };
  }
  const n = v.summary?.totalFailureCount;
  return {
    state: "failed",
    tone: "warn",
    icon: "!",
    text: `${n ?? "some"} rule failure${n === 1 ? "" : "s"}`,
    aria: "PDF/UA-1 conformance check found failures",
  };
}
