/**
 * The printout is read next to Word or Acrobat by whoever does the fixing —
 * who may not be the person who generated it. So the best practices print
 * FULLY EXPANDED, with both fix routes, and every document-derived string
 * escaped: findings quote heading text, link labels, sheet and font names.
 */
import { describe, it, expect } from "vitest";
import { buildPrintablePlan } from "../utils/printablePlan";
import { evaluateBestPractices } from "../utils/bestPractices";

const report = {
  fileType: "pdf",
  pageCount: 40,
  categories: [
    {
      id: "heading_structure",
      findings: [
        "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 13-004), not a WCAG 2.1 failure, so your grade is not affected.",
        "--- Heading Tree ---",
        "  H1 → H2 → H1 → H1",
      ],
    },
  ],
};

const build = (extra: Record<string, unknown> = {}) =>
  buildPrintablePlan({
    filename: "report.pdf",
    steps: [],
    bestPractices: evaluateBestPractices(report),
    ...extra,
  });

describe("printable plan — best practices", () => {
  it("prints the section with the document's own heading order", () => {
    const html = build();
    expect(html).toContain("Best practices");
    expect(html).toContain("H1 → H2 → H1 → H1");
  });

  it("prints every row expanded, with both fix routes", () => {
    const html = build();
    expect(html).toMatch(/In the source file/i);
    expect(html).toMatch(/In the PDF/i);
    // No interactive affordance survives onto paper.
    expect(html).not.toMatch(/Show how|aria-expanded/);
  });

  it("says plainly that none of it is scored, and never that it is required", () => {
    const html = build();
    expect(html).toMatch(/not scored/i);
    expect(html).not.toMatch(/required by law/i);
  });

  it("escapes document-derived text", () => {
    const hostile = evaluateBestPractices({
      fileType: "pdf",
      pageCount: 40,
      categories: [
        {
          id: "heading_structure",
          findings: [
            'PDF/UA only — not scored: found 2 heading tags, but the level order has gaps — <img src=x onerror="alert(1)">',
            "--- Heading Tree ---",
            "  H1 → <script>alert(1)</script>",
          ],
        },
      ],
    });
    const html = buildPrintablePlan({ filename: "x.pdf", steps: [], bestPractices: hostile });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain("&lt;script&gt;");
  });

  it("omits the section entirely when there is nothing to print", () => {
    expect(build({ bestPractices: [] })).not.toContain("Best practices");
    expect(buildPrintablePlan({ filename: "x.pdf", steps: [] })).not.toContain("Best practices");
  });
});

describe("printable plan — best practices' wcagSlugs links", () => {
  // "Bookmarks for navigation" carries no static `links`, only a `wcagSlugs`
  // citation (WCAG 2.4.5) — isolating it from the heading practices' own
  // matterhornLink/techniqueLink entries above.
  const bookmarksRows = () =>
    evaluateBestPractices({
      fileType: "pdf",
      pageCount: 40,
      categories: [{ id: "bookmarks", findings: [] }],
    });

  it("resolves a wcagSlugs practice's Understanding link when understandingUrl is supplied", () => {
    const html = buildPrintablePlan({
      filename: "report.pdf",
      steps: [],
      bestPractices: bookmarksRows(),
      understandingUrl: (slug) => `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`,
    });
    expect(html).toContain('href="https://www.w3.org/WAI/WCAG22/Understanding/multiple-ways.html"');
    expect(html).toContain("WCAG 2.4.5: Multiple Ways");
  });

  it("renders no broken link — or the bare label — when understandingUrl is not supplied", () => {
    const html = buildPrintablePlan({
      filename: "report.pdf",
      steps: [],
      bestPractices: bookmarksRows(),
    });
    // Dropped entirely, not downgraded to plain text: a link on paper is
    // typed from the printed "(href)", so a label with no href would read
    // as a promise the page cannot keep.
    expect(html).not.toContain("WCAG 2.4.5: Multiple Ways");
    expect(html).not.toMatch(/href="[^"]*undefined/);
  });
});
