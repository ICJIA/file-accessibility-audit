/**
 * The compact PDF/UA-1 badge beside the remediation headline score has four
 * states, and the fourth is the one it used to get wrong: a veraPDF ERROR
 * (timeout, no output, unparseable JSON) arrives as `available:true,
 * passed:false, error:"…"` and rendered as an amber "!" with "0 rule
 * failures" — a conformance failure for a check that never finished — while
 * the <PdfUaVerdict> panel further down correctly said "Could not validate"
 * (fresh-eyes audit, 2026-09-02).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { veraPdfBadge } from "../utils/remediationVeraBadge";

const summary = (over: Record<string, unknown> = {}) => ({
  profile: "PDF/UA-1 validation profile",
  failures: [],
  totalFailureCount: 0,
  ...over,
});

describe("veraPdfBadge", () => {
  it("not configured → neutral, 'check not run'", () => {
    const b = veraPdfBadge({ available: false, passed: null, summary: null });
    expect(b.state).toBe("not-run");
    expect(b.text).toBe("check not run");
    expect(b.aria).toMatch(/not run/i);
  });

  it("passed → green check", () => {
    const b = veraPdfBadge({ available: true, passed: true, summary: summary() });
    expect(b.state).toBe("passed");
    expect(b.icon).toBe("✓");
    expect(b.text).toBe("conformance passed");
  });

  it("failed → amber with the real failure count", () => {
    const b = veraPdfBadge({
      available: true,
      passed: false,
      summary: summary({ totalFailureCount: 7 }),
    });
    expect(b.state).toBe("failed");
    expect(b.icon).toBe("!");
    expect(b.text).toBe("7 rule failures");
    expect(b.aria).toMatch(/found failures/i);
  });

  it("ERROR → 'could not be checked' — never a failure count, never 'found failures'", () => {
    const b = veraPdfBadge({
      available: true,
      passed: null,
      summary: summary({ error: "veraPDF exited with an error and produced no output" }),
    });
    expect(b.state).toBe("error");
    expect(b.text).toBe("could not be checked");
    expect(b.text).not.toMatch(/rule failure/);
    expect(b.aria).toMatch(/could not be completed/i);
    expect(b.aria).not.toMatch(/found failures/i);
  });

  it("an error stored by an older job row (passed=false, error set) is still an error, not a failure", () => {
    const b = veraPdfBadge({
      available: true,
      passed: false,
      summary: summary({ error: "could not parse veraPDF JSON output" }),
    });
    expect(b.state).toBe("error");
  });
});

describe("remediate/[jobId].vue wires the badge and names the error event", () => {
  const src = readFileSync(resolve(__dirname, "..", "pages", "remediate", "[jobId].vue"), "utf-8");

  it("renders the badge from veraPdfBadge() instead of a local passed/failed ternary", () => {
    expect(src).toContain("veraPdfBadge(");
    expect(src).not.toMatch(/rule failure\$\{/);
  });

  it("has a human label for verapdf_error", () => {
    expect(src).toMatch(/verapdf_error:\s*"veraPDF: check could not be completed/);
  });
});
