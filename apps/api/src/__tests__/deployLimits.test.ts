import { describe, it, expect } from "vitest";
import { ANALYSIS, REMEDIATION, DEPLOY } from "#config";

// ---------------------------------------------------------------------------
// The upload caps must fit inside the proxy limit.
//
// This is the one class of misconfiguration the rest of the suite structurally
// cannot catch: nginx sits IN FRONT of the app, so when it rejects a request
// the app never sees it, no route runs, and no test observes anything. The
// failure is invisible from inside the process.
//
// It happened on 2026-08-13. The `location /api/` block was narrowed to 35 MB
// on the reasoning that the 25 MB audit cap plus headroom was all that was
// required. But REMEDIATION.MAX_FILE_SIZE_MB is 50 — deliberately double the
// audit cap, because remediation handles annual reports and multi-section
// dossiers. Every remediation upload between 35 and 50 MB began failing with a
// 413 from the proxy: a live feature broken in production, with a green test
// suite and nothing in the application logs.
//
// These tests cannot read nginx. What they CAN do is fail the build the moment
// a cap outgrows the documented contract, so the proxy change is remembered
// while the code change is being made rather than discovered in production.
// ---------------------------------------------------------------------------

describe("upload caps fit inside the nginx proxy limit", () => {
  const largestUpload = Math.max(ANALYSIS.MAX_FILE_SIZE_MB, REMEDIATION.MAX_FILE_SIZE_MB);

  it("the largest accepted upload plus headroom fits within client_max_body_size", () => {
    expect(largestUpload + DEPLOY.UPLOAD_HEADROOM_MB).toBeLessThanOrEqual(
      DEPLOY.NGINX_CLIENT_MAX_BODY_SIZE_MB,
    );
  });

  // Named separately from the check above so a failure says WHICH cap broke it.
  it("the remediation cap — the binding constraint — fits, with headroom", () => {
    expect(REMEDIATION.MAX_FILE_SIZE_MB + DEPLOY.UPLOAD_HEADROOM_MB).toBeLessThanOrEqual(
      DEPLOY.NGINX_CLIENT_MAX_BODY_SIZE_MB,
    );
  });

  it("the analysis cap fits, with headroom", () => {
    expect(ANALYSIS.MAX_FILE_SIZE_MB + DEPLOY.UPLOAD_HEADROOM_MB).toBeLessThanOrEqual(
      DEPLOY.NGINX_CLIENT_MAX_BODY_SIZE_MB,
    );
  });

  // The trap that actually sprang: sizing the proxy to the audit cap alone.
  // If these two ever become equal the comment above is wrong and the reasoning
  // "the proxy only needs to cover uploads" becomes accidentally true, which is
  // exactly how the mistake was justified the first time.
  it("remediation accepts LARGER files than the audit — sizing the proxy to the audit cap breaks it", () => {
    expect(REMEDIATION.MAX_FILE_SIZE_MB).toBeGreaterThan(ANALYSIS.MAX_FILE_SIZE_MB);
    // The 35 MB value that broke production: enough for the audit cap, not for
    // remediation. Asserting the gap exists keeps the hazard legible.
    expect(ANALYSIS.MAX_FILE_SIZE_MB + DEPLOY.UPLOAD_HEADROOM_MB).toBeLessThan(
      REMEDIATION.MAX_FILE_SIZE_MB + DEPLOY.UPLOAD_HEADROOM_MB,
    );
  });

  it("headroom is real, so a legally sized file is not rejected by its envelope", () => {
    // Multipart boundaries and headers make the request larger than the file.
    expect(DEPLOY.UPLOAD_HEADROOM_MB).toBeGreaterThanOrEqual(2);
  });

  it("the documented proxy limit is a positive whole number of megabytes", () => {
    expect(Number.isInteger(DEPLOY.NGINX_CLIENT_MAX_BODY_SIZE_MB)).toBe(true);
    expect(DEPLOY.NGINX_CLIENT_MAX_BODY_SIZE_MB).toBeGreaterThan(0);
  });

  // A ceiling on the ceiling: REMEDIATION's own comment warns that going past
  // 100 MB risks JVM OOM on the 4 GB droplet. If the proxy is ever opened wider
  // than that, the proxy stops being a meaningful guard.
  it("the proxy limit stays within what the droplet can survive", () => {
    expect(DEPLOY.NGINX_CLIENT_MAX_BODY_SIZE_MB).toBeLessThanOrEqual(100);
  });
});
