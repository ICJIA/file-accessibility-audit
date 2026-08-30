/**
 * The catalog's foundation.
 *
 * Two things are pinned here and must never regress:
 *   1. NOTHING throws. /report/[id] renders stored JSON through SSR, and a
 *      forged report has 500'd that page before (v1.68.0). Every primitive
 *      takes `unknown` and narrows.
 *   2. Silence is never a pass. A context with no matching finding yields
 *      null, and the practices built on these primitives turn null into
 *      NOT CHECKED — never MET.
 */
import { describe, it, expect } from "vitest";
import {
  buildContext,
  matchNotScored,
  matchAny,
  signalLines,
  firstNumber,
} from "../utils/bestPractices/types";
import {
  matterhornLink,
  techniqueLink,
  understandingLink,
  safeLinks,
} from "../utils/bestPractices/links";

const category = {
  id: "heading_structure",
  label: "Heading Structure",
  findings: [
    "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 13-004), not a WCAG 2.1 failure, so your grade is not affected.",
    "--- Heading Tree ---",
    "  H1 → H2 → H1 → H1 → H3 → H5",
    "  Heading hierarchy skip: H1 → H3 (skipped H2)",
    "  Heading hierarchy skip: H3 → H5 (skipped H4)",
    "Found 6 heading tags with logical hierarchy",
  ],
};

describe("buildContext", () => {
  it("splits a category into the partitions a practice reads", () => {
    const ctx = buildContext(category, "pdf", 12);
    expect(ctx.fileType).toBe("pdf");
    expect(ctx.pageCount).toBe(12);
    expect(ctx.categoryPresent).toBe(true);
    expect(ctx.notScored[0]).toMatch(/level order has gaps/);
    expect(ctx.main).toContain("Found 6 heading tags with logical hierarchy");
    expect(ctx.signals[0]?.heading).toBe("Heading Tree");
  });

  it("marks an absent category as not present, with empty partitions", () => {
    const ctx = buildContext(undefined, "pdf", 0);
    expect(ctx.categoryPresent).toBe(false);
    expect(ctx.findings).toEqual([]);
    expect(ctx.notScored).toEqual([]);
    expect(ctx.signals).toEqual([]);
  });

  it("survives every malformed shape a forged stored report can carry", () => {
    // Each of these previously had a route to throwing during SSR.
    const hostile: unknown[] = [
      null,
      "a string, not an object",
      42,
      { findings: "not an array" },
      { findings: null },
      { findings: [1, 2, 3] },
      { findings: [null, undefined, {}, []] },
      {
        findings: [
          {
            toString: () => {
              throw new Error("boom");
            },
          },
        ],
      },
    ];
    for (const c of hostile) {
      expect(() => buildContext(c, "pdf", 0)).not.toThrow();
      const ctx = buildContext(c, "pdf", 0);
      expect(Array.isArray(ctx.findings)).toBe(true);
      expect(ctx.findings.every((f) => typeof f === "string")).toBe(true);
    }
  });
});

describe("matchNotScored", () => {
  it("returns the matching not-scored line", () => {
    const ctx = buildContext(category, "pdf", 12);
    expect(matchNotScored(ctx, "level order has gaps")).toMatch(/Matterhorn 13-004/);
  });

  it("returns null when nothing matches — silence is never a pass", () => {
    const ctx = buildContext(category, "pdf", 12);
    expect(matchNotScored(ctx, "no bookmarks")).toBeNull();
  });

  it("only searches the not-scored partition, never the scored findings", () => {
    const ctx = buildContext(category, "pdf", 12);
    // This phrase exists in `main`, not in `notScored`.
    expect(matchNotScored(ctx, "logical hierarchy")).toBeNull();
    expect(matchAny(ctx, "logical hierarchy")).toMatch(/Found 6 heading tags/);
  });
});

describe("signalLines", () => {
  it("returns a technical-signal group's items by its heading", () => {
    const ctx = buildContext(category, "pdf", 12);
    expect(signalLines(ctx, "Heading Tree")).toEqual([
      "H1 → H2 → H1 → H1 → H3 → H5",
      "Heading hierarchy skip: H1 → H3 (skipped H2)",
      "Heading hierarchy skip: H3 → H5 (skipped H4)",
    ]);
  });

  it("returns an empty array for an absent group", () => {
    const ctx = buildContext(category, "pdf", 12);
    expect(signalLines(ctx, "Bookmark Outline")).toEqual([]);
  });
});

describe("firstNumber", () => {
  it("reads a count out of a finding, including a thousands separator", () => {
    expect(firstNumber("Advisory — not scored: 12 merged cell(s)")).toBe(12);
    expect(firstNumber("this document has 1,240 pages and no bookmarks")).toBe(1240);
  });

  it("returns null rather than guessing", () => {
    expect(firstNumber(null)).toBeNull();
    expect(firstNumber("no digits here")).toBeNull();
  });
});

describe("link resolution", () => {
  it("names a Matterhorn checkpoint from the shipped protocol data", () => {
    const l = matterhornLink("13");
    expect(l).not.toBeNull();
    expect(l!.label).toMatch(/^Matterhorn 13 —/);
    expect(l!.url).toBe("https://pdfa.org/resource/the-matterhorn-protocol/");
  });

  it("returns null for a checkpoint the protocol does not define", () => {
    expect(matterhornLink("99")).toBeNull();
  });

  it("builds a W3C technique link", () => {
    const l = techniqueLink("G141");
    expect(l.label).toBe("WCAG technique G141");
    expect(l.url).toBe("https://www.w3.org/WAI/WCAG22/Techniques/general/G141");
  });

  it("builds a W3C technique link for PDF-class codes", () => {
    const l = techniqueLink("PDF17");
    expect(l.label).toBe("WCAG technique PDF17");
    expect(l.url).toBe("https://www.w3.org/WAI/WCAG22/Techniques/pdf/PDF17");
  });

  it("builds an Understanding link through the injected version-aware builder", () => {
    const l = understandingLink(
      "info-and-relationships",
      "Understanding 1.3.1",
      (s) => `https://www.w3.org/WAI/WCAG22/Understanding/${s}.html`,
    );
    expect(l!.url).toBe("https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html");
  });

  it("returns null when the slug is empty", () => {
    const l = understandingLink("", "x", (s) => s);
    expect(l).toBeNull();
  });

  it("drops links whose URL is not http(s) — the shared page's data is stored JSON", () => {
    const input = [
      { label: "ok", url: "https://example.org/a" },
      { label: "script", url: "javascript:alert(1)" },
      { label: "data", url: "data:text/html,<script>alert(1)</script>" },
      { label: "empty", url: "" },
    ];
    const kept = safeLinks(input);
    expect(kept.map((l) => l.label)).toEqual(["ok"]);
    // Assert the surviving entry's URL passed through unchanged.
    expect(kept[0]!.url).toBe("https://example.org/a");
    // Assert the call does not mutate its input.
    expect(input.length).toBe(4);
    expect(input[0]!.url).toBe("https://example.org/a");
  });
});
