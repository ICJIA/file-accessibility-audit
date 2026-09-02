/**
 * The three outcomes of the remediation job's veraPDF step, and what each
 * one records.
 *
 * `runVeraPdf` reports an ERROR — a JVM timeout, no output, unparseable JSON
 * — as `available:true, passed:false, error:"…"`. Read as a boolean that is
 * indistinguishable from a real non-conformance, and until 2026-09-02 the
 * job did exactly that: it recorded `verapdf_failed`, stored
 * `verapdf_passed = 0`, and the results page badge showed an amber "0 rule
 * failures" for a check that never finished. The verdict column is nullable
 * for this reason: NULL is "no verdict", which is the truth of an error.
 */
import type { VeraPdfVerdict } from "../services/veraPdf.js";

export type VeraPdfEvent =
  "verapdf_passed" | "verapdf_failed" | "verapdf_error" | "verapdf_unavailable";

export interface VeraPdfOutcome {
  event: VeraPdfEvent;
  /** The value to persist in `verapdf_passed`: true/false for a real verdict,
   *  null when there is none (not configured, or the run errored). */
  passed: boolean | null;
}

export function veraPdfOutcome(
  vera: Pick<VeraPdfVerdict, "available" | "passed" | "error"> & Partial<VeraPdfVerdict>,
): VeraPdfOutcome {
  if (!vera.available) return { event: "verapdf_unavailable", passed: null };
  if (vera.error) return { event: "verapdf_error", passed: null };
  return vera.passed
    ? { event: "verapdf_passed", passed: true }
    : { event: "verapdf_failed", passed: false };
}
