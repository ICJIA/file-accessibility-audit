/**
 * What the tool tells an author when an audit runs out of time.
 *
 * WHY THIS EXISTS (2026-08-28): the copy used to read "This file is too
 * complex to analyze within the time limit", and it was reached from a
 * catch-all on `err.killed`. A 246-page annual report tripped it — a document
 * qpdf parses in 1.7 seconds. The audit had starved its own qpdf pass by
 * running it beside pdfjs and two veraPDF JVMs on a two-core box, and the
 * author was told the fault was in their document. It was not.
 *
 * So the message must never diagnose the document, and every surface that can
 * time out must say the same thing — there are six of them, and they drifted
 * before. This walks them.
 */
import { describe, it, expect, vi } from "vitest";
import { AUDIT_TIMEOUT_MESSAGE } from "@file-audit/shared";

vi.mock("../services/auditLog.js", () => ({
  recordAudit: vi.fn(),
  recordAuditFailure: vi.fn(),
  recordRejectedUpload: vi.fn(),
  sanitizeStoredFilename: (n: string) => n,
  sha256Hex: () => "hash",
}));

describe("the audit-timeout message", () => {
  it("does not blame the document", () => {
    const whole = `${AUDIT_TIMEOUT_MESSAGE.error} ${AUDIT_TIMEOUT_MESSAGE.details}`;
    expect(whole).not.toMatch(/too complex|too difficult|too complicated/i);
  });

  it("tells the reader to try again, because a retry usually succeeds", () => {
    expect(AUDIT_TIMEOUT_MESSAGE.details).toMatch(/try again/i);
  });

  it("is written for a non-technical reader — no engine or process jargon", () => {
    const whole = `${AUDIT_TIMEOUT_MESSAGE.error} ${AUDIT_TIMEOUT_MESSAGE.details}`;
    expect(whole).not.toMatch(/qpdf|pdfjs|pdf\.js|verapdf|jvm|timeout|subprocess|semaphore/i);
  });
});

describe("every surface that can time out uses it", () => {
  it("mapAnalyzeError: a killed analysis", async () => {
    const { mapAnalyzeError } = await import("../services/analyzeCore.js");

    expect(mapAnalyzeError({ killed: true }, undefined, false)).toEqual({
      status: 504,
      body: AUDIT_TIMEOUT_MESSAGE,
    });
  });

  it("mapAnalyzeError: an ETIMEDOUT analysis", async () => {
    const { mapAnalyzeError } = await import("../services/analyzeCore.js");

    expect(mapAnalyzeError({ code: "ETIMEDOUT" }, undefined, false)).toEqual({
      status: 504,
      body: AUDIT_TIMEOUT_MESSAGE,
    });
  });

  it("the job store's hard-timeout backstop", async () => {
    vi.useFakeTimers();
    try {
      const { createAnalyzeJob, pollAnalyzeJob, JOB_HARD_TIMEOUT_MS, _resetAnalyzeJobs } =
        await import("../services/analyzeJobs.js");
      _resetAnalyzeJobs();
      const created = createAnalyzeJob(true);
      expect(created).not.toBeNull();

      vi.advanceTimersByTime(JOB_HARD_TIMEOUT_MS + 1000);
      const status = pollAnalyzeJob(created!.id, created!.token);

      expect(status?.done).toBe(true);
      expect(status?.error).toEqual({ status: 504, body: AUDIT_TIMEOUT_MESSAGE });
    } finally {
      vi.useRealTimers();
    }
  });

  it("the fleet inventory runner's per-document line", async () => {
    const { AUDIT_TIMEOUT_SUMMARY } = await import("@file-audit/shared");
    const { mapEntryError } = await import("../routes/bulk-from-inventory.js");

    // The runner records one terse line per document rather than the
    // visitor-facing card, so it has its own constant — held to the same rule.
    expect(AUDIT_TIMEOUT_SUMMARY).not.toMatch(/too complex/i);
    expect(AUDIT_TIMEOUT_SUMMARY).toMatch(/did not finish in time/i);

    expect(mapEntryError({ killed: true })).toBe(AUDIT_TIMEOUT_SUMMARY);
    expect(mapEntryError({ code: "ETIMEDOUT" })).toBe(AUDIT_TIMEOUT_SUMMARY);
  });
});
