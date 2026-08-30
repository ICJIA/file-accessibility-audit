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
import {
  CATALOG,
  evaluateBestPractices,
  summarizeBestPractices,
  sortBestPractices,
  type BestPracticeStatus,
} from "../utils/bestPractices";

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

describe("evaluateBestPractices", () => {
  const pdfReport = {
    fileType: "pdf",
    pageCount: 40,
    categories: [
      {
        id: "heading_structure",
        label: "Heading Structure",
        findings: [
          "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 13-004), not a WCAG 2.1 failure, so your grade is not affected.",
          "--- Heading Tree ---",
          "  H1 → H2 → H1 → H1",
        ],
      },
    ],
  };

  it("returns only the practices for the report's own format", () => {
    const rows = evaluateBestPractices(pdfReport);
    expect(rows.length).toBe(CATALOG.filter((p) => p.formats.includes("pdf")).length);
    expect(rows.every((r) => r.practice.formats.includes("pdf"))).toBe(true);
    expect(rows.some((r) => r.practice.id.startsWith("docx-"))).toBe(false);
  });

  it("evaluates each practice against its own category", () => {
    const rows = evaluateBestPractices(pdfReport);
    const order = rows.find((r) => r.practice.id === "heading-level-order");
    expect(order?.status).toBe("not-met");
    expect(order?.block?.lines).toContain("H1 → H2 → H1 → H1");
  });

  it("returns nothing for a page-audit row with no categories", () => {
    expect(evaluateBestPractices({ fileType: "pdf" })).toEqual([]);
    expect(evaluateBestPractices({ fileType: "pdf", categories: [] })).toEqual([]);
  });

  it("returns nothing for an unknown or absent file type", () => {
    expect(evaluateBestPractices({ categories: [{ id: "x", findings: [] }] })).toEqual([]);
    expect(evaluateBestPractices(null)).toEqual([]);
    expect(evaluateBestPractices("hostile")).toEqual([]);
  });

  it("never throws on a forged stored report", () => {
    const hostile = [
      { fileType: "pdf", categories: "not an array" },
      { fileType: "pdf", categories: [null, 42, "x"] },
      { fileType: 99, categories: [{ findings: [1] }] },
    ];
    for (const h of hostile) expect(() => evaluateBestPractices(h)).not.toThrow();
  });
});

describe("summarizeBestPractices", () => {
  it("counts each status and totals them", () => {
    const rows = evaluateBestPractices({
      fileType: "pdf",
      pageCount: 40,
      categories: [
        { id: "heading_structure", findings: ["Found 6 heading tags with logical hierarchy"] },
      ],
    });
    const s = summarizeBestPractices(rows);
    expect(s.met + s.notMet + s.notApplicable + s.notChecked).toBe(s.total);
    expect(s.total).toBe(rows.length);
    expect(s.met).toBeGreaterThan(0);
  });
});

describe("sortBestPractices", () => {
  // The ONE place NOT-MET-first ordering is defined — BestPracticesSection.vue
  // (the on-screen accordion) and printablePlan.ts (the printout) both call
  // this instead of keeping their own copy, so the two surfaces cannot show
  // the same document's practices in two different orders.
  it("orders not-met, met, not-applicable, not-checked — never catalog declaration order", () => {
    const rows: Array<{ status: BestPracticeStatus }> = [
      { status: "not-checked" },
      { status: "not-applicable" },
      { status: "met" },
      { status: "not-met" },
    ];
    expect(sortBestPractices(rows).map((r) => r.status)).toEqual([
      "not-met",
      "met",
      "not-applicable",
      "not-checked",
    ]);
  });

  it("does not mutate its input", () => {
    const rows: Array<{ status: BestPracticeStatus }> = [
      { status: "not-checked" },
      { status: "not-met" },
    ];
    const original = [...rows];
    sortBestPractices(rows);
    expect(rows).toEqual(original);
  });

  it("moves an actionable row ahead of catalog entries declared before it", () => {
    // "bookmarks" is declared in bestPractices/pdf.ts well after the five
    // heading_structure practices — in raw catalog order it would print
    // behind six "not-checked" rows. A real not-met bookmarks result must
    // still land first once sorted, proving this isn't a coincidence of
    // "heading-level-order" (the catalog's actual first entry) happening to
    // already be the not-met one in other fixtures.
    const rows = evaluateBestPractices({
      fileType: "pdf",
      pageCount: 40,
      categories: [
        {
          id: "bookmarks",
          findings: [
            "PDF/UA only — not scored: this 40-page document has 40 pages and no bookmarks, which makes it harder to navigate.",
          ],
        },
      ],
    });
    const rawIndex = rows.findIndex((r) => r.practice.id === "bookmarks");
    expect(rawIndex).toBeGreaterThan(0); // not already first in catalog order
    expect(rows[rawIndex]?.status).toBe("not-met");
    const sorted = sortBestPractices(rows);
    expect(sorted[0]?.practice.id).toBe("bookmarks");
  });
});

describe("a document that PASSES WCAG still has best practices to meet", () => {
  // A report with NO failing WCAG criterion — the grade is A, the score is
  // 100, conformance.failures is empty — that nonetheless carries several
  // not-scored advisories. This is the exact shape the section exists for.
  const wcagCleanButImperfect = {
    fileType: "pdf",
    pageCount: 40,
    overallScore: 100,
    grade: "A",
    conformance: { failures: [], notAssessed: [] },
    categories: [
      {
        id: "heading_structure",
        label: "Heading Structure",
        score: 100,
        grade: "A",
        severity: "No issues found",
        findings: [
          "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 13-004), not a WCAG 2.1 failure, so your grade is not affected.",
          "--- Heading Tree ---",
          "  H1 → H2 → H1 → H1 → H3 → H5",
          "--- Heading Outline ---",
          "  Heading hierarchy skip: H1 → H3 (skipped H2)",
          "Found 6 heading tags with logical hierarchy",
        ],
      },
      {
        id: "bookmarks",
        label: "Bookmarks",
        score: 100,
        grade: "A",
        severity: "No issues found",
        findings: [
          "Advisory — not scored: this document has 40 pages and no bookmarks. No WCAG 2.1 criterion requires bookmarks in a single document (2.4.5 Multiple Ways applies to sets of pages), so your grade is not affected.",
        ],
      },
    ],
  };

  it("reports unmet best practices even though no WCAG criterion is failing", () => {
    const rows = evaluateBestPractices(wcagCleanButImperfect);
    const notMet = rows.filter((r) => r.status === "not-met");
    expect(notMet.length).toBeGreaterThan(0);
    expect(notMet.map((r) => r.practice.id)).toContain("heading-level-order");
    expect(notMet.map((r) => r.practice.id)).toContain("bookmarks");
  });

  it("carries the document's own evidence on each unmet row", () => {
    const rows = evaluateBestPractices(wcagCleanButImperfect);
    const order = rows.find((r) => r.practice.id === "heading-level-order");
    expect(order?.block?.lines.join(" ")).toContain("H1 → H2 → H1 → H1 → H3 → H5");
    expect(order?.evidence.join(" ")).toMatch(/H1 → H3 \(skipped H2\)/);
  });

  it("never marks an unmet best practice as a WCAG obligation", () => {
    const rows = evaluateBestPractices(wcagCleanButImperfect);
    for (const r of rows) {
      const copy = `${r.practice.label} ${r.practice.description} ${r.practice.why} ${r.evidence.join(" ")}`;
      expect(copy, r.practice.id).not.toMatch(/required by law/i);
      expect(copy, r.practice.id).not.toMatch(/WCAG 2\.1 failure/i);
    }
  });
});

describe("a document in Word that PASSES WCAG still has best practices to meet", () => {
  // The Office half of the same claim. A Word report with no failing WCAG
  // criterion — grade A, score 100 — that nonetheless carries advisory-only
  // findings for skipped heading levels and merged table cells. Findings are
  // verbatim strings from packages/analyzer/src/scoring/docx.ts: the skip
  // advisory (:178) and the merged-cell note (:311), each alongside the
  // witness line a real document always carries too (:162 "N real
  // heading(s) found.", :290 "N table(s) found.") — a fixture that omitted
  // those witnesses would test less than it appears to.
  const wcagCleanWordButImperfect = {
    fileType: "docx",
    pageCount: 12,
    overallScore: 100,
    grade: "A",
    conformance: { failures: [], notAssessed: [] },
    categories: [
      {
        id: "heading_structure",
        label: "Heading Structure",
        score: 100,
        grade: "A",
        severity: "No issues found",
        findings: [
          "5 real heading(s) found.",
          "Advisory — not scored: 2 place(s) skip a heading level (e.g. Heading 1 → Heading 3) — not a WCAG 2.1 failure, so your grade is not affected, but screen-reader users may wonder what they missed at the skipped level.",
        ],
      },
      {
        id: "table_markup",
        label: "Table Markup",
        score: 100,
        grade: "A",
        severity: "No issues found",
        findings: [
          "2 table(s) found.",
          "Note — not scored: 3 merged cell(s) across the table(s). Merged and split cells can confuse screen-reader navigation (Microsoft's own checker flags them); whether they harm depends on placement — review manually.",
        ],
      },
    ],
  };

  it("reports unmet best practices even though no WCAG criterion is failing", () => {
    const rows = evaluateBestPractices(wcagCleanWordButImperfect);
    const notMet = rows.filter((r) => r.status === "not-met");
    expect(notMet.length).toBeGreaterThan(0);
    expect(notMet.map((r) => r.practice.id)).toContain("docx-heading-skips");
    expect(notMet.map((r) => r.practice.id)).toContain("docx-merged-cells");
  });

  it("carries the document's own evidence on each unmet row", () => {
    const rows = evaluateBestPractices(wcagCleanWordButImperfect);
    const skips = rows.find((r) => r.practice.id === "docx-heading-skips");
    expect(skips?.evidence.join(" ")).toMatch(/2 places where the heading levels skip a step/);
    const merged = rows.find((r) => r.practice.id === "docx-merged-cells");
    expect(merged?.evidence.join(" ")).toMatch(/3 merged cells across its tables/);
  });

  it("never marks an unmet best practice as a WCAG obligation", () => {
    const rows = evaluateBestPractices(wcagCleanWordButImperfect);
    for (const r of rows) {
      const copy = `${r.practice.label} ${r.practice.description} ${r.practice.why} ${r.evidence.join(" ")}`;
      expect(copy, r.practice.id).not.toMatch(/required by law/i);
      expect(copy, r.practice.id).not.toMatch(/WCAG 2\.1 failure/i);
    }
  });
});
