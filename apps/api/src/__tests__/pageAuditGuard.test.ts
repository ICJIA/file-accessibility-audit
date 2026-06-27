/**
 * Pure per-request decision logic for the page-audit Chromium interceptor.
 *
 * SSRF defense for the headless-browser path: every request Chromium makes
 * (main navigation, redirects, and subresources) is classified here. The
 * async private-IP resolution layer is tested separately via safeFetch's
 * resolvePublicIp; this covers the synchronous scheme + allowlist decision.
 *
 * Policy:
 *   - data:/blob:/about: — no network, always allowed (preserves inline
 *     images/fonts so legit pages render).
 *   - http(s) — allowed, but flagged needsIpCheck so the caller resolves the
 *     host and aborts on a private/reserved IP.
 *   - any other scheme (file:, ftp:, gopher:, …) — aborted.
 *   - document navigations additionally must pass the host allowlist (kills
 *     open-redirect-to-internal and off-allowlist navigation); subresources
 *     do NOT (so public CDN assets still load).
 */
import { describe, it, expect } from "vitest";
import { shouldAllowPageRequest } from "../services/pageAuditGuard.js";

// Allowlist stub: only *.illinois.gov is allowed (mirrors isAllowedUrl shape).
const isUrlAllowed = (raw: string): boolean => {
  try {
    const h = new URL(raw).hostname.toLowerCase();
    return h === "illinois.gov" || h.endsWith(".illinois.gov");
  } catch {
    return false;
  }
};

describe("shouldAllowPageRequest", () => {
  it("allows a data: URI with no network check", () => {
    const d = shouldAllowPageRequest("data:image/png;base64,AAAA", false, isUrlAllowed);
    expect(d).toEqual({ allow: true, needsIpCheck: false });
  });

  it("allows about:blank and blob: with no network check", () => {
    expect(shouldAllowPageRequest("about:blank", true, isUrlAllowed).allow).toBe(true);
    expect(shouldAllowPageRequest("blob:https://x/y", false, isUrlAllowed).needsIpCheck).toBe(false);
  });

  it("aborts non-http(s) network schemes", () => {
    for (const u of ["file:///etc/passwd", "ftp://host/x", "gopher://h/", "dict://h/"]) {
      expect(shouldAllowPageRequest(u, false, isUrlAllowed).allow).toBe(false);
    }
  });

  it("allows an allowlisted document navigation but flags it for IP check", () => {
    const d = shouldAllowPageRequest("https://icjia.illinois.gov/page", true, isUrlAllowed);
    expect(d).toEqual({ allow: true, needsIpCheck: true });
  });

  it("aborts a document navigation to a NON-allowlisted host (open-redirect target)", () => {
    // The classic attack: an allowlisted page 302s here. As a document
    // navigation it must be rejected even though the IP might be public.
    expect(shouldAllowPageRequest("http://169.254.169.254/latest/meta-data/", true, isUrlAllowed).allow).toBe(false);
    expect(shouldAllowPageRequest("https://attacker.example.com/", true, isUrlAllowed).allow).toBe(false);
  });

  it("allows an off-allowlist SUBRESOURCE (public CDN) but flags it for IP check", () => {
    // Subresources aren't allowlist-gated, so legit CDN assets render — but
    // they still get the private-IP check via needsIpCheck.
    const d = shouldAllowPageRequest("https://cdn.jsdelivr.net/app.css", false, isUrlAllowed);
    expect(d).toEqual({ allow: true, needsIpCheck: true });
  });

  it("aborts a malformed URL", () => {
    expect(shouldAllowPageRequest("http://", false, isUrlAllowed).allow).toBe(false);
  });

  it("still flags http(s) for the private-IP check when the allowlist is bypassed (privileged token)", () => {
    // Privileged callers pass an allow-all predicate so they can audit any
    // PUBLIC page. The private/reserved-IP block must remain in force so the
    // token can't be turned into an internal-SSRF key: every http(s) request,
    // document or subresource, must still come back needsIpCheck:true (the
    // async resolvePublicIp layer then aborts private/reserved targets).
    const allowAll = () => true;
    expect(
      shouldAllowPageRequest("https://anything.example.com/", true, allowAll),
    ).toEqual({ allow: true, needsIpCheck: true });
    // A document nav straight at the cloud-metadata IP is NOT short-circuited
    // by the allowlist anymore, but it's flagged for the IP check that blocks it.
    expect(
      shouldAllowPageRequest("http://169.254.169.254/latest/meta-data/", true, allowAll),
    ).toEqual({ allow: true, needsIpCheck: true });
    // Non-http(s) schemes are still aborted regardless of the predicate.
    expect(
      shouldAllowPageRequest("file:///etc/passwd", true, allowAll).allow,
    ).toBe(false);
  });
});
