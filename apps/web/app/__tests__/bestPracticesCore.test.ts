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
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SCORED_IN_PLAN,
  type BestPractice,
  buildContext,
  matchNotScored,
  matchAny,
  signalLines,
  firstNumber,
} from "../utils/bestPractices/types";
import { matterhornLink, techniqueLink, safeLinks } from "../utils/bestPractices/links";
import {
  CATALOG,
  evaluateBestPractices,
  uncoveredNotScored,
  summarizeBestPractices,
  sortBestPractices,
  type BestPracticeStatus,
} from "../utils/bestPractices";

const category = {
  id: "heading_structure",
  label: "Heading Structure",
  findings: [
    "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 14 (Headings)), not a WCAG 2.1 failure, so your grade is not affected.",
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
    expect(matchNotScored(ctx, "level order has gaps")).toMatch(/Matterhorn 14\b/);
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
    expect(l.url).toBe("https://www.w3.org/WAI/WCAG21/Techniques/general/G141");
  });

  it("builds a W3C technique link for PDF-class codes", () => {
    const l = techniqueLink("PDF17");
    expect(l.label).toBe("WCAG technique PDF17");
    expect(l.url).toBe("https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF17");
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
          "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 14 (Headings)), not a WCAG 2.1 failure, so your grade is not affected.",
          "--- Heading Tree ---",
          "  H1 → H2 → H1 → H1",
        ],
      },
    ],
  };

  it("returns only the practices for the report's own format", () => {
    // Filtered to extra credit since v1.148.2, so this is a subset of the PDF
    // catalog — never a row from another format, and never more than exist.
    const rows = evaluateBestPractices(pdfReport);
    const pdfCatalog = CATALOG.filter((p) => p.formats.includes("pdf")).length;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(pdfCatalog);
    expect(rows.every((r) => r.practice.formats.includes("pdf"))).toBe(true);
    expect(rows.some((r) => r.practice.id.startsWith("docx-"))).toBe(false);
    // Only the two statuses a reader can act on or take credit for.
    expect(rows.every((r) => r.status === "met" || r.status === "not-met")).toBe(true);
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

describe("evaluateBestPractices — category help links and a throwing practice", () => {
  const withHelp = {
    fileType: "pdf",
    pageCount: 12,
    categories: [
      {
        id: "heading_structure",
        // Findings chosen so the heading rows resolve to MET/NOT MET and
        // therefore survive the extra-credit filter (v1.148.2) — this test is
        // about link plumbing, not about which status a row lands on.
        findings: [
          "Found 3 heading tags with logical hierarchy",
          "--- Heading Outline ---",
          '  H1 "Title"',
          '  H2 "Section"',
          '  H1 "Second"',
        ],
        // Spec §4's third link source: the vendor documentation each
        // category already carries. Narrowed here to {label, url} string
        // pairs; safeLinks decides at render time whether a URL may be shown.
        helpLinks: [
          { label: "Adobe: heading tags", url: "https://helpx.adobe.com/acrobat/headings" },
          { label: "junk", url: 42 },
          "not an object",
          null,
        ],
      },
    ],
  };

  it("carries the category's own helpLinks onto every practice in that category, narrowed to string pairs", () => {
    const rows = evaluateBestPractices(withHelp);
    const h = rows.find((r) => r.practice.id === "heading-level-order")!;
    expect(h.categoryLinks).toEqual([
      { label: "Adobe: heading tags", url: "https://helpx.adobe.com/acrobat/headings" },
    ]);
    // A practice in a DIFFERENT category gets nothing from this one.
    // A practice in a DIFFERENT category gets nothing from this one.
    const other = rows.find((r) => r.practice.categoryId !== "heading_structure");
    expect(other?.categoryLinks ?? []).toEqual([]);
  });

  it("never throws when a practice's detect() throws — the page survives and the row is simply absent", () => {
    // Spec §2: "the section as a whole is wrapped so one bad practice cannot
    // take down the page." /report/[id] renders stored JSON through SSR; an
    // uncaught throw here is a 500 on the shared-report page.
    const bomb: BestPractice = {
      id: "bomb",
      formats: ["pdf"],
      categoryId: "heading_structure",
      label: "Bomb",
      description: "x",
      why: "y",
      links: [],
      detect() {
        throw new Error("kaboom");
      },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let rows: ReturnType<typeof evaluateBestPractices> = [];
      expect(() => {
        rows = evaluateBestPractices(withHelp, [...CATALOG, bomb]);
      }).not.toThrow();
      // A row that could not be evaluated is not extra credit a reader could
      // attempt, so it is not listed at all (v1.148.2). What must hold is that
      // it never takes the page down with it.
      expect(rows.find((r) => r.practice.id === "bomb")).toBeUndefined();
      expect(rows.filter((r) => r.practice.id !== "bomb").every((r) => r.reason !== "error")).toBe(
        true,
      );
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("the era gate — a witness cannot vouch for a payload older than its advisory", () => {
  // Office checkers shipped 2026-07-01; docx-merged-cells' advisory arrived
  // 2026-08-26 (v1.95.0). A July report carrying the table census but no
  // advisory is NOT a clean document — it is one the analyzer of that day
  // could not have complained about.
  const julyWord = {
    fileType: "docx",
    pageCount: 3,
    categories: [{ id: "table_markup", findings: ["3 table(s) found."] }],
  };
  it("never shows a witness-based MET on a payload that predates the advisory", () => {
    // The gate turns it into NOT CHECKED, and since v1.148.2 a not-checked row
    // is not listed at all. Both together are the guarantee that matters: a
    // stored report from before the check existed can never claim the credit.
    const rows = evaluateBestPractices(julyWord, undefined, { analyzedAt: "2026-07-05T10:00:00Z" });
    expect(rows.find((x) => x.practice.id === "docx-merged-cells")).toBeUndefined();
  });
  it("leaves the MET alone once the payload is new enough, and for a live analysis with no date", () => {
    expect(
      evaluateBestPractices(julyWord, undefined, { analyzedAt: "2026-09-01" }).find(
        (x) => x.practice.id === "docx-merged-cells",
      )!.status,
    ).toBe("met");
    expect(
      evaluateBestPractices(julyWord).find((x) => x.practice.id === "docx-merged-cells")!.status,
    ).toBe("met");
  });
  it("never downgrades NOT MET or NOT APPLICABLE — only a fabricated MET", () => {
    const withAdvisory = {
      ...julyWord,
      categories: [
        {
          id: "table_markup",
          findings: [
            "3 table(s) found.",
            "Note — not scored: 2 merged cell(s) across the table(s).",
          ],
        },
      ],
    };
    expect(
      evaluateBestPractices(withAdvisory, undefined, { analyzedAt: "2026-07-05" }).find(
        (x) => x.practice.id === "docx-merged-cells",
      )!.status,
    ).toBe("not-met");
  });
  it("ignores an unparseable date rather than guessing", () => {
    expect(
      evaluateBestPractices(julyWord, undefined, { analyzedAt: "not a date" }).find(
        (x) => x.practice.id === "docx-merged-cells",
      )!.status,
    ).toBe("met");
  });
  it("gates the PDF witness practices too", () => {
    const july = {
      fileType: "pdf",
      pageCount: 12,
      categories: [{ id: "reading_order", findings: ["Structure tree depth: 3 level(s)"] }],
    };
    const gated = evaluateBestPractices(july, undefined, { analyzedAt: "2026-08-01" }).find(
      (x) => x.practice.id === "nested-structure-tree",
    )!;
    expect(gated === undefined).toBe(true);
    expect(
      evaluateBestPractices(july).find((x) => x.practice.id === "nested-structure-tree")!.status,
    ).toBe("met");
  });
});

describe("uncoveredNotScored — what the analyzer said that no practice covers", () => {
  const xfa =
    "Advisory — not scored: this is a static XFA form. The conventional PDF content audited here is exactly what viewers display, but the embedded XFA template layer itself was not separately audited.";
  const report = {
    fileType: "pdf",
    pageCount: 4,
    categories: [
      { id: "form_accessibility", label: "Form Accessibility", findings: [xfa] },
      {
        id: "heading_structure",
        label: "Heading Structure",
        findings: ["PDF/UA only — not scored: only generic <H> tags were found (not H1–H6)."],
      },
    ],
  };
  it("returns not-scored lines from categories no practice reads, labelled", () => {
    const notes = uncoveredNotScored(report);
    expect(notes).toEqual([{ label: "Form Accessibility", text: xfa }]);
  });
  it("covers per LINE, not per category: an advisory no practice reads surfaces even in a covered category (2026-09-02)", () => {
    // link_quality is read by three practices, none of which reads the
    // unattributable-link advisory — whose own text names an F89 candidate.
    // Per-category coverage hid it entirely.
    const unattributed =
      "Advisory — not scored: 2 link(s) could not have their text attributed (rotated or image-only) and are shown with their URL instead. If one of these is genuinely an image with no alternative text, that is a WCAG 4.1.2 / 1.1.1 failure (F89) — verify by hand.";
    const withLinks = {
      ...report,
      categories: [
        ...report.categories,
        {
          id: "link_quality",
          label: "Link Quality",
          findings: ["3 link(s) found; 0 with no link text at all.", unattributed],
        },
      ],
    };
    const notes = uncoveredNotScored(withLinks);
    expect(notes.some((n) => n.label === "Link Quality" && n.text === unattributed)).toBe(true);
    // …while a line a practice DID read (generic <H>, heading-numbered-levels) stays out.
    expect(notes.some((n) => /generic <H>/.test(n.text))).toBe(false);
  });

  it("excludes categories a practice already covers, and never throws on junk", () => {
    expect(uncoveredNotScored(report).some((n) => /generic <H>/.test(n.text))).toBe(false);
    expect(uncoveredNotScored(null)).toEqual([]);
    expect(uncoveredNotScored({ fileType: "pdf", categories: "junk" })).toEqual([]);
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
    // behind them. A real not-met bookmarks result must
    // still land first once sorted, proving this isn't a coincidence of
    // "heading-level-order" (the catalog's actual first entry) happening to
    // already be the not-met one in other fixtures.
    const rows = evaluateBestPractices({
      fileType: "pdf",
      pageCount: 40,
      categories: [
        // Heading practices are declared FIRST in the catalog, so they must
        // survive the extra-credit filter for this test to prove anything —
        // a clean outline makes them MET (v1.148.2).
        {
          id: "heading_structure",
          findings: [
            "Found 3 heading tags with logical hierarchy",
            "--- Heading Outline ---",
            '  H1 "Title"',
            '  H2 "Section"',
            '  H3 "Detail"',
          ],
        },
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
          "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 14 (Headings)), not a WCAG 2.1 failure, so your grade is not affected.",
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

describe("every practice states its legal basis (2026-08-31 WCAG audit, made permanent)", () => {
  // The audit's durable half. A row in this section tells a public body that
  // something does not affect their grade; it may not do that without saying,
  // in the row itself, which standard it comes from and why it is not scored.
  // Adding a practice now forces that question to be answered.
  it("declares a non-empty `standard` on all of them", () => {
    const missing = CATALOG.filter((p) => !p.standard || p.standard.trim().length < 40).map(
      (p) => p.id,
    );
    expect(missing).toEqual([]);
  });

  it("never names a Level A criterion in a bare, unexplained assertion", () => {
    // Guards the exact drift the audit found: descriptive-link-text used to
    // cite ONLY 2.4.9 (AAA), which read as "the law is silent here" when
    // 2.4.4 (Level A) is on point and merely not machine-decidable.
    // Objective rule rather than keyword matching: if a row invokes the legal
    // standard, it owes the reader an explanation, not a verdict. Every
    // current row that names Level A runs well past this.
    for (const p of CATALOG) {
      const std = p.standard ?? "";
      if (!/Level A\b/.test(std)) continue;
      expect(
        std.length,
        `${p.id} names a Level A criterion in ${std.length} characters — explain why it is not scored`,
      ).toBeGreaterThanOrEqual(120);
    }
  });
});

describe("naming a WCAG criterion means linking it (standing rule, 2026-08-31)", () => {
  // "Please remember to always link to the WCAG guidelines whenever a WCAG
  // rule is referenced." Copy that names a success criterion without a way to
  // reach it asks a public body to take this tool's word for what the law
  // says. ISO 14289 clauses (7.4.4), Matterhorn conditions (14-007) and W3C
  // technique ids (G141, F43) are deliberately out of scope — the rule is
  // about success criteria, which are what the law adopts.
  const CRITERION = /\b([1-4]\.\d\.\d+)\b/g;

  it("every criterion a practice names in its `standard` is also in `wcagSlugs`", () => {
    const gaps: string[] = [];
    for (const p of CATALOG) {
      const named = [...new Set([...(p.standard ?? "").matchAll(CRITERION)].map((m) => m[1]))];
      const linked = (p.wcagSlugs ?? []).map((x) => x.label.replace(/^WCAG /, "").split(":")[0]);
      for (const sc of named) if (!linked.includes(sc)) gaps.push(`${p.id} names ${sc}`);
    }
    expect(gaps).toEqual([]);
  });

  it("every wcagSlugs label carries its criterion number, so the link says what it is", () => {
    for (const p of CATALOG) {
      for (const ref of p.wcagSlugs ?? []) {
        expect(ref.label, p.id).toMatch(/^WCAG [1-4]\.\d\.\d+: /);
        expect(ref.slug, p.id).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });
});

describe("this section holds only things above and beyond WCAG 2.1 (v1.148.1)", () => {
  // The user's rule, after two labels in one afternoon both misled: "best
  // practices should only be things above and beyond WCAG 2.1. If it's
  // already counted, then it doesn't need to be labelled as a best practice."
  const report = (categories: Array<Record<string, unknown>>) => ({
    fileType: "pdf",
    pageCount: 12,
    categories,
  });

  it("drops a row whose OWN defect is scored — it lives in the action plan", () => {
    const rows = evaluateBestPractices(
      report([
        {
          id: "bookmarks",
          score: 60,
          findings: ["This document has a bookmark outline with no entries in it."],
        },
      ]),
    );
    const bookmark = rows.find((r) => r.practice.id === "bookmarks");
    // Whatever it would have said, it must not be offered as an optional nicety.
    if (bookmark) {
      expect(bookmark.evidence.join(" ")).not.toContain(SCORED_IN_PLAN);
    }
    for (const r of rows) expect(r.evidence.join(" "), r.practice.id).not.toContain(SCORED_IN_PLAN);
  });

  it("drops a practice it could not judge because a scored failure got there first", () => {
    // The user, on seeing NOT CHECKED beside heading rows in a report that had
    // just scored heading_structure 0 and named 1.3.1: "if something is marked
    // 'not checked' in the best practice — but WAS checked in the actual WCAG
    // score — then don't list it. It's super-confusing." They are right: the
    // page contradicted itself. Skipped heading levels really are above and
    // beyond (the analyzer says so: "not a WCAG 2.1 failure"), but that is an
    // argument for leaving the row out, not for labelling it a fourth way.
    const rows = evaluateBestPractices(
      report([
        {
          id: "heading_structure",
          score: 0,
          findings: ["No heading tags found in the document structure"],
        },
      ]),
    );
    for (const id of [
      "heading-level-order",
      "heading-convention",
      "heading-numbered-levels",
      "heading-content",
      "single-h1",
    ]) {
      expect(
        rows.find((r) => r.practice.id === id),
        `${id} is still listed, on a document whose headings the report scored`,
      ).toBeUndefined();
    }
  });

  it("neither marker sentence is ever written out by hand", () => {
    // The two are load-bearing: one decides whether a row appears at all, the
    // other whether it reads as blocked. Spelling either out again is how the
    // copy and the behaviour came apart the first time.
    for (const f of ["pdf.ts", "office.ts"]) {
      const src = readFileSync(resolve(__dirname, "../utils/bestPractices", f), "utf8");
      expect(src, `${f} spells out the scored divert`).not.toContain(
        "counted in your score \u2014 see the action plan above, not this section.",
      );
      expect(src, `${f} spells out the blocked sentence`).not.toContain(
        "so this could not be checked. That absence is in your action plan above",
      );
    }
  });
});

describe("catalog copy guards (2026-09-02)", () => {
  it("the four raw-URL rows hedge 2.4.4 in `why` the way their `standard` does — 'usually', never flatly 'it meets'", () => {
    const rows = CATALOG.filter((p) => /raw-url-link-text$/.test(p.id));
    expect(rows.length).toBe(4);
    for (const row of rows) {
      expect(row.why, row.id).not.toMatch(/\bit meets WCAG 2\.4\.4\b/);
      expect(row.why, row.id).toMatch(/usually/);
    }
  });

  it("no row label asserts a review that never happened", () => {
    for (const row of CATALOG) {
      expect(row.label, row.id).not.toMatch(/reviewed/i);
    }
  });

  it("rows whose only basis is Microsoft's own accessibility guidance link to it", () => {
    for (const id of [
      "pptx-distinct-slide-titles",
      "docx-nested-tables",
      "docx-merged-cells",
      "xlsx-sheet-names",
      "xlsx-merged-cells",
    ]) {
      const row = CATALOG.find((p) => p.id === id)!;
      expect(row, id).toBeDefined();
      expect(
        row.links.some((l) => /support\.microsoft\.com/.test(l.url)),
        `${id} cites no Microsoft page`,
      ).toBe(true);
    }
  });
});
