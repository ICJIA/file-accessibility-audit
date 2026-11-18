/**
 * User decision 2026-11-18: "the grade should not reward this, stricter and
 * explanatory is better than rewarding." A "remediated" control has an empty
 * tag structure and every image marked as an artifact; it scored 60/D while
 * its untagged original scored 50/F, because alt text and reading order fell
 * out of the average as "not assessed". Both now score 0 with an explanation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzePDF } from "../services/pdfAnalyzer.js";

const CONTROLS = resolve(__dirname, "../../../../controls");
const load = (f: string) => readFileSync(resolve(CONTROLS, f));

describe("hiding content is never rewarded", () => {
  it("the content-free 'remediated' copy scores no higher than its untagged original", async () => {
    const original = await analyzePDF(
      load("ILHEALSFallWinter2022FINAL-untagged-original.pdf"),
      "o.pdf",
    );
    const hidden = await analyzePDF(load("ILHEALSFallWinter2022FINAL-remediated.pdf"), "h.pdf");
    expect(hidden.overallScore).toBeLessThanOrEqual(original.overallScore);
    const cat = (id: string) => hidden.categories.find((c) => c.id === id)!;
    expect(cat("alt_text").score).toBe(0);
    expect(cat("alt_text").findings.join(" ")).toMatch(/marking everything as decoration/);
    expect(cat("reading_order").score).toBe(0);
    expect(cat("reading_order").findings.join(" ")).toMatch(/contains no content/);
    // No praise for artifacts in a tree that holds nothing.
    const text = hidden.categories.find((c) => c.id === "text_extractability")!.findings.join(" ");
    expect(text).not.toMatch(/distinguished from real content/);
    expect(text).toMatch(/hides content from screen readers/);
    // Every point lost names its criterion (the legal-basis gate's rule):
    // reading order → 1.3.2, confirmed; hidden images → 1.1.1, LIKELY.
    const failures = (
      hidden as {
        conformance?: { failures: Array<{ sc: string; category: string; likely?: boolean }> };
      }
    ).conformance!.failures;
    const ro = failures.find((f) => f.category === "reading_order");
    const alt = failures.find((f) => f.category === "alt_text");
    expect(ro?.sc).toBe("1.3.2");
    expect(ro?.likely).toBeUndefined();
    expect(alt?.sc).toBe("1.1.1");
    expect(alt?.likely).toBe(true);
  }, 120_000);

  it("a properly tagged document keeps its scored reading order (the rule is narrow)", async () => {
    const tagged = await analyzePDF(load("ILHEALSFallWinter2022FINAL.pdf"), "t.pdf");
    const ro = tagged.categories.find((c) => c.id === "reading_order")!;
    expect(ro.findings.join(" ")).not.toMatch(/contains no content/);
  }, 120_000);
});
