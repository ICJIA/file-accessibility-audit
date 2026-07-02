import { describe, it, expect } from "vitest";
import { isSafeHttpUrl, safeHttpUrl } from "@file-audit/shared";

// URL-scheme guard shared by the report render (ReportContent href), the HTML
// export, and the API store-time sanitizer. Its whole job is to make sure a
// javascript:/data:/vbscript: URI from an attacker-controlled stored report
// can never reach an <a href> or be persisted.

describe("isSafeHttpUrl", () => {
  it("accepts http and https absolute URLs", () => {
    expect(isSafeHttpUrl("https://www.w3.org/WAI/WCAG22/quickref/")).toBe(true);
    expect(isSafeHttpUrl("http://example.gov/a.pdf")).toBe(true);
  });

  it("rejects javascript: and other script-bearing schemes", () => {
    expect(isSafeHttpUrl("javascript:alert(document.domain)")).toBe(false);
    expect(isSafeHttpUrl("  javascript:alert(1)")).toBe(false); // leading space
    expect(isSafeHttpUrl("JavaScript:alert(1)")).toBe(false); // case
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(
      false,
    );
    expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeHttpUrl("blob:https://x/1")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects relative, empty, and non-string inputs", () => {
    expect(isSafeHttpUrl("/relative/path")).toBe(false);
    expect(isSafeHttpUrl("//evil.example")).toBe(false);
    expect(isSafeHttpUrl("not a url")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(42)).toBe(false);
    expect(isSafeHttpUrl({ toString: () => "https://x" })).toBe(false);
  });
});

describe("safeHttpUrl", () => {
  it("returns the URL unchanged when safe", () => {
    expect(safeHttpUrl("https://example.gov/a.pdf")).toBe(
      "https://example.gov/a.pdf",
    );
  });

  it("returns undefined for unsafe/invalid input (so :href is omitted)", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("")).toBeUndefined();
    expect(safeHttpUrl(null)).toBeUndefined();
  });
});
