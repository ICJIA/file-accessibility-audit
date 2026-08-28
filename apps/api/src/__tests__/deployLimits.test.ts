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

// ---------------------------------------------------------------------------
// The audit's own budget must fit inside the proxy's patience.
//
// The same invisible class as the size cap above, discovered the same way — in
// production, on 2026-08-28, verifying the v1.109.0 fix. The app was raised to
// allow a long document up to two minutes; nginx's `location /api/` block
// carried `proxy_read_timeout 60s`. A 246-page annual report that the server
// audits happily in ~60-70s came back as an nginx HTML `504 Gateway Time-out`
// the application never saw and never logged: no route error, no failed-audit
// row, nothing. The browser's audit page is unaffected (it creates a job and
// polls, so every request is short), but the SYNCHRONOUS endpoints —
// /api/analyze and the /api/audit-url the fleet scanner calls — run the whole
// audit inside one request and are cut off mid-work.
//
// Note what the v1.109.0 sequencing change did to the worst case: qpdf and
// pdfjs no longer overlap, so their budgets ADD rather than max. That is the
// right trade (see pdfAnalyzer.ts) but it moves this ceiling, which is exactly
// why it is pinned here rather than left as folklore.
// ---------------------------------------------------------------------------

describe("the synchronous audit budget fits inside the nginx proxy timeout", () => {
  // qpdf runs to completion, THEN pdfjs — sequential since v1.109.0.
  const worstCaseAnalysisMs = ANALYSIS.QPDF_TIMEOUT_MS + ANALYSIS.PDFJS_TIMEOUT_MS;
  // The two veraPDF passes are serialized, and the second may wait for the slot
  // the first holds. They run alongside the analysis, so the audit costs the
  // longer of the two arms, not their sum.
  const worstCaseVeraMs =
    REMEDIATION.VERAPDF_QUEUE_TIMEOUT_MS + REMEDIATION.VERAPDF_AUDIT_TIMEOUT_MS;
  const worstCaseAuditMs = Math.max(worstCaseAnalysisMs, worstCaseVeraMs);

  it("a request the app is still legitimately working on is not cut off by the proxy", () => {
    expect(worstCaseAuditMs + DEPLOY.PROXY_TIMEOUT_HEADROOM_S * 1000).toBeLessThanOrEqual(
      DEPLOY.NGINX_PROXY_READ_TIMEOUT_S * 1000,
    );
  });

  it("the sequential passes are accounted for as a SUM, not a maximum", () => {
    // If someone restores the Promise.all, this stops being the binding figure
    // — and the comment above stops being true. Fail loudly if the arithmetic
    // silently becomes over-generous.
    expect(worstCaseAnalysisMs).toBe(ANALYSIS.QPDF_TIMEOUT_MS + ANALYSIS.PDFJS_TIMEOUT_MS);
    expect(worstCaseAnalysisMs).toBeGreaterThan(ANALYSIS.PDFJS_TIMEOUT_MS);
  });

  it("headroom covers the upload and the response, which are outside the audit budget", () => {
    // A 25 MB upload over a slow line, plus writing the report JSON back.
    expect(DEPLOY.PROXY_TIMEOUT_HEADROOM_S).toBeGreaterThanOrEqual(15);
  });

  it("the documented proxy timeout is a positive whole number of seconds", () => {
    expect(Number.isInteger(DEPLOY.NGINX_PROXY_READ_TIMEOUT_S)).toBe(true);
    expect(DEPLOY.NGINX_PROXY_READ_TIMEOUT_S).toBeGreaterThan(0);
  });

  // A ceiling on the ceiling: the proxy must still hang up on something truly
  // wedged. Every step inside the app is bounded, so anything past this is not
  // an audit any more.
  it("the proxy still gives up eventually", () => {
    expect(DEPLOY.NGINX_PROXY_READ_TIMEOUT_S).toBeLessThanOrEqual(300);
  });
});
