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

describe("evaluateBestPractices — category help links and a throwing practice", () => {
  const withHelp = {
    fileType: "pdf",
    pageCount: 12,
    categories: [
      {
        id: "heading_structure",
        findings: ["Found 3 heading tags with logical hierarchy"],
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
    const other = rows.find((r) => r.practice.id === "bookmarks")!;
    expect(other.categoryLinks).toEqual([]);
  });

  it("never throws when a practice's detect() throws — that row reads NOT CHECKED with reason 'error', the rest are unaffected", () => {
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
      const b = rows.find((r) => r.practice.id === "bomb")!;
      expect(b.status).toBe("not-checked");
      expect(b.reason).toBe("error");
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
  it("turns a witness-based MET into NOT CHECKED when the payload predates the advisory", () => {
    const rows = evaluateBestPractices(julyWord, undefined, { analyzedAt: "2026-07-05T10:00:00Z" });
    const r = rows.find((x) => x.practice.id === "docx-merged-cells")!;
    expect(r.status).toBe("not-checked");
    expect(r.reason).toBe("not-run");
    expect(r.evidence.join(" ")).toMatch(/before this check existed/);
    expect(r.evidence.join(" ")).toMatch(/2026-08-26/);
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
    expect(gated.status).toBe("not-checked");
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

describe("the two kinds of NOT APPLICABLE are told apart (v1.148.0)", () => {
  // A real FY21 annual report with no heading tags at all rendered NINE
  // NOT APPLICABLE rows — five about headings, above a heading_structure
  // scoring 0/Critical with WCAG 1.3.1 Level A failing. The row text said
  // "counted in your score"; the chip above it said the opposite, and a
  // reader who trusts the chip concludes headings do not apply to their file.
  const report = (categories: Array<{ id: string; findings: string[] }>) => ({
    fileType: "pdf",
    pageCount: 12,
    categories,
  });

  it("marks a divert to the action plan as `scored`", () => {
    const rows = evaluateBestPractices(
      report([
        { id: "heading_structure", findings: ["No heading tags found in the document structure"] },
      ]),
    );
    const headingRows = rows.filter(
      (r) => r.practice.categoryId === "heading_structure" && r.status === "not-applicable",
    );
    expect(headingRows.length).toBeGreaterThan(0);
    for (const r of headingRows) expect(r.naReason, r.practice.id).toBe("scored");
  });

  it("marks a genuine absence as `absent` — nothing of this kind exists", () => {
    const rows = evaluateBestPractices(
      report([{ id: "link_quality", findings: ["No links found in this document"] }]),
    );
    const naLinkRows = rows.filter(
      (r) => r.practice.categoryId === "link_quality" && r.status === "not-applicable",
    );
    expect(naLinkRows.length).toBeGreaterThan(0);
    for (const r of naLinkRows) expect(r.naReason, r.practice.id).toBe("absent");
  });

  it("does NOT claim a deduction that did not happen", () => {
    // The mirror of the bug, and worse: telling a reader their clean tables
    // cost them points. The pointer is gated on the category's actual score.
    const clean = evaluateBestPractices({
      fileType: "pdf",
      pageCount: 12,
      categories: [{ id: "table_markup", score: 100, findings: ["Scope attributes: n/a"] }],
    });
    for (const r of clean.filter((x) => x.practice.id.startsWith("table-scope"))) {
      expect(r.naReason, r.practice.id).not.toBe("scored");
      expect(r.evidence.join(" "), r.practice.id).not.toContain("counted in your score");
    }
    const docked = evaluateBestPractices({
      fileType: "pdf",
      pageCount: 12,
      categories: [{ id: "table_markup", score: 45, findings: ["Scope attributes: n/a"] }],
    });
    const scoredRows = docked.filter(
      (x) => x.practice.id.startsWith("table-scope") && x.status === "not-applicable",
    );
    expect(scoredRows.length).toBeGreaterThan(0);
    for (const r of scoredRows) expect(r.naReason, r.practice.id).toBe("scored");
  });

  it("SCORED_IN_PLAN is the only definition of that sentence", () => {
    // The flag is derived from this exact string. If a catalog file spells it
    // out again, the copy and the chip drift and the bug returns silently.
    for (const f of ["pdf.ts", "office.ts"]) {
      const src = readFileSync(resolve(__dirname, "../utils/bestPractices", f), "utf8");
      expect(src, `${f} spells out the divert instead of using SCORED_IN_PLAN`).not.toContain(
        "counted in your score \u2014 see the action plan above, not this section.",
      );
    }
  });

  it("summarize counts the scored diverts separately", () => {
    const rows = [
      { practice: { id: "a" }, status: "not-applicable", naReason: "scored", evidence: [] },
      { practice: { id: "b" }, status: "not-applicable", naReason: "absent", evidence: [] },
    ] as never;
    const sum = summarizeBestPractices(rows);
    expect(sum.notApplicable).toBe(2);
    expect(sum.notApplicableScored).toBe(1);
  });

  it("the on-screen chip never says NOT APPLICABLE for a scored divert", () => {
    const src = readFileSync(resolve(__dirname, "../components/BestPracticesSection.vue"), "utf8");
    expect(src).toContain(
      'isScoredDivert(row) ? "COUNTED IN YOUR SCORE" : STATUS_LABEL[row.status]',
    );
    // and the printed twin must agree
    const plan = readFileSync(resolve(__dirname, "../utils/printablePlan.ts"), "utf8");
    expect(plan).toContain('"Counted in your score"');
  });
});
