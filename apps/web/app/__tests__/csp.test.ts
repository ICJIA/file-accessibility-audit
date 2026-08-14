import { describe, it, expect } from "vitest";
import { buildCspHeader } from "../../server/utils/csp";
import { ANALYTICS } from "../../../../audit.config";

// The production CSP header string. The security-critical property is that
// script-src carries the per-request nonce and NO 'unsafe-inline' (so injected
// inline scripts / javascript: URIs can't execute), while style-src keeps
// 'unsafe-inline' (Vue :style attributes can't be nonced — out of scope).
//
// Since the Plausible snippet shipped, the self-hosted analytics origin is the
// one deliberate exception to 'self': it must appear in script-src AND
// connect-src — the script tag loads via script-src, but every page-view POST
// to /api/event goes through connect-src. Allowing only one of the two breaks
// analytics silently (script loads, events refused), so both are pinned here.

function directive(header: string, name: string): string | undefined {
  return header.split("; ").find((d) => d.startsWith(name + " "));
}

describe("buildCspHeader", () => {
  const header = buildCspHeader("TESTNONCE");

  it("puts the nonce in script-src and drops 'unsafe-inline' there", () => {
    const scriptSrc = directive(header, "script-src")!;
    expect(scriptSrc).toBe("script-src 'self' 'nonce-TESTNONCE' https://plausible.icjia.cloud");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("keeps style-src 'unsafe-inline' (scoped to script-src only)", () => {
    expect(directive(header, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
  });

  it("preserves the tight high-value directives", () => {
    expect(directive(header, "default-src")).toBe("default-src 'self'");
    expect(directive(header, "object-src")).toBe("object-src 'none'");
    expect(directive(header, "base-uri")).toBe("base-uri 'none'");
    expect(directive(header, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(header, "connect-src")).toBe(
      "connect-src 'self' https://plausible.icjia.cloud",
    );
    expect(header).toContain("upgrade-insecure-requests");
  });

  it("allows the configured Plausible origin in BOTH script-src and connect-src", () => {
    // Wiring, not literals: whatever origin audit.config.ts declares must be
    // allowed to load (script-src) and to report (connect-src). If the host
    // ever moves, this fails until the CSP moves with it.
    expect(ANALYTICS.PLAUSIBLE_HOST).toBeTruthy();
    expect(directive(header, "script-src")).toContain(` ${ANALYTICS.PLAUSIBLE_HOST}`);
    expect(directive(header, "connect-src")).toContain(` ${ANALYTICS.PLAUSIBLE_HOST}`);
  });

  it("allows no other external origin anywhere in the policy", () => {
    // The analytics origin is the single deliberate exception. Strip it and
    // no scheme://host source may remain in any directive.
    const withoutPlausible = header.split(ANALYTICS.PLAUSIBLE_HOST).join("");
    expect(withoutPlausible).not.toMatch(/https?:\/\//);
  });

  it("embeds whatever nonce it is given (per-request)", () => {
    expect(buildCspHeader("abc123==")).toContain("'nonce-abc123=='");
  });

  it("never emits 'unsafe-inline' for scripts under any nonce", () => {
    const scriptSrc = directive(buildCspHeader("x"), "script-src")!;
    expect(scriptSrc).not.toContain("unsafe-inline");
  });
});
