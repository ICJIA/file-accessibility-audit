/**
 * How many veraPDF JVMs the box may run at once.
 *
 * WHY THIS IS PINNED (2026-08-28): every PDF audit starts a PDF/UA pass and a
 * WCAG pass, and at a budget of 2 they ran simultaneously. Measured on the
 * production droplet, ONE pass on a 246-page report costs 785 MB RSS and 191%
 * CPU — two of them is ~1.5 GB and four cores' worth of demand on a 2-vCPU,
 * 3.9 GB machine that was already in swap. The audit's own qpdf pass was
 * starved past its 30s timeout and the upload failed with "this file is too
 * complex"; the health endpoint could not answer either, so the header showed
 * "audit server offline" while nothing was actually down.
 *
 * A budget of 1 serializes the two passes: half the peak memory, and each pass
 * gets the cores to itself. audit.config.ts documents this as the frugal
 * setting for a small droplet. Raise it only alongside MAX_CONCURRENT_ANALYSES
 * and the RAM budget — and re-read the measurements above first.
 */
import { describe, it, expect } from "vitest";
import { REMEDIATION, ANALYSIS } from "#config";

describe("veraPDF JVM budget", () => {
  it("runs one veraPDF JVM at a time", () => {
    expect(REMEDIATION.VERAPDF_MAX_CONCURRENT).toBe(1);
  });

  it("never budgets more JVMs than concurrent analyses", () => {
    // A JVM is several times the cost of an analysis slot, so the JVM budget
    // exceeding the analysis budget would be backwards in any configuration.
    expect(REMEDIATION.VERAPDF_MAX_CONCURRENT).toBeLessThanOrEqual(
      ANALYSIS.MAX_CONCURRENT_ANALYSES,
    );
  });

  it("gives a queued pass long enough to wait out the pass ahead of it", () => {
    // With the passes serialized, the WCAG pass waits for the UA pass to
    // finish. That wait must comfortably exceed one pass's own timeout, or the
    // second verdict would degrade to "Did not run" on exactly the large
    // documents this budget exists to protect.
    expect(REMEDIATION.VERAPDF_QUEUE_TIMEOUT_MS).toBeGreaterThan(
      REMEDIATION.VERAPDF_AUDIT_TIMEOUT_MS,
    );
  });
});
