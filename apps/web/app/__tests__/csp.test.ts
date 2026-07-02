import { describe, it, expect } from "vitest";
import { buildCspHeader } from "../../server/utils/csp";

// The production CSP header string. The security-critical property is that
// script-src carries the per-request nonce and NO 'unsafe-inline' (so injected
// inline scripts / javascript: URIs can't execute), while style-src keeps
// 'unsafe-inline' (Vue :style attributes can't be nonced — out of scope).

function directive(header: string, name: string): string | undefined {
  return header.split("; ").find((d) => d.startsWith(name + " "));
}

describe("buildCspHeader", () => {
  const header = buildCspHeader("TESTNONCE");

  it("puts the nonce in script-src and drops 'unsafe-inline' there", () => {
    const scriptSrc = directive(header, "script-src")!;
    expect(scriptSrc).toBe("script-src 'self' 'nonce-TESTNONCE'");
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
    expect(directive(header, "connect-src")).toBe("connect-src 'self'");
    expect(header).toContain("upgrade-insecure-requests");
  });

  it("embeds whatever nonce it is given (per-request)", () => {
    expect(buildCspHeader("abc123==")).toContain("'nonce-abc123=='");
  });

  it("never emits 'unsafe-inline' for scripts under any nonce", () => {
    const scriptSrc = directive(buildCspHeader("x"), "script-src")!;
    expect(scriptSrc).not.toContain("unsafe-inline");
  });
});
