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
        "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 14 (Headings)), not a WCAG 2.1 failure, so your grade is not affected.",
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

  it("uses a real <pre> for the evidence block, never a whitespace-pre div", () => {
    // Prettier reflows a whitespace-pre div's text — it collapsed 12
    // preformatted blocks in this repo before (v1.53.0). A real <pre> is
    // immune to that class of regression.
    const html = build();
    expect(html).toContain('<pre class="bp-block">');
  });

  it("keeps a practice and its evidence on one page — pinned on ul.bp>li's OWN rule, not li.step's", () => {
    // li.step already carries break-inside:avoid, so a bare
    // toContain("break-inside:avoid") passes even if ul.bp>li's own copy of
    // the rule were deleted entirely. Extract ul.bp>li's rule specifically.
    const html = build();
    const rule = html.match(/ul\.bp>li\{[^}]*\}/)?.[0];
    expect(rule).toBeTruthy();
    expect(rule).toContain("break-inside:avoid");
    expect(rule).toContain("page-break-inside:avoid");
  });

  it("prints a practice's standard citation even when it has no links (display-doc-title)", () => {
    // The screen prints practice.standard under "Read more"; without this,
    // a citation like display-doc-title's ("PDF/UA (ISO 14289) clause 7.1",
    // links: []) would carry no provenance at all on paper — and the
    // printout is the artifact someone defends a decision with.
    const html = build();
    expect(html).toContain("PDF/UA (ISO 14289) clause 7.1");
  });

  it("scopes the 'everything WCAG 2.1 asks' claim to what an automated check can find", () => {
    // The .limit band on this same page discloses automated checks cover
    // roughly 30–40% of issues, and a clean file's "What to fix" section
    // reads "Nothing — this document passed every automated check" right
    // above this line — an unscoped completeness claim would contradict
    // both neighbors on the same printout.
    const html = build();
    expect(html).toContain(
      "everything WCAG 2.1 asks of this document that an automated check can find",
    );
  });

  it("sits between 'What to fix' and 'Still worth checking by hand'", () => {
    const html = buildPrintablePlan({
      filename: "report.pdf",
      steps: [
        {
          rank: 1,
          categoryId: "title_language",
          title: "Give the document a title",
          why: "Screen readers announce the filename otherwise.",
          severity: "Critical",
          wcagRefs: [],
          routes: [{ tool: "source", label: "Fix the source", steps: ["Do the thing"] }],
          detailAnchor: "#cat-title_language",
        },
      ],
      manualChecks: [
        {
          id: "alt_text",
          label: "Alt Text",
          verified: "Every image has one.",
          confirm: "Read each.",
        },
      ],
      bestPractices: evaluateBestPractices(report),
    });
    // Anchored on the actual <h2> tags, not a bare substring: the .limit
    // band above all three sections already cross-references "Still worth
    // checking by hand" in a sentence ("The \u201cStill worth checking by
    // hand\u201d section below is that half of the job") whenever
    // manualChecks is non-empty — a bare indexOf on that phrase finds THAT
    // mention first and reports a false ordering.
    const whatToFix = html.indexOf("<h2>What to fix");
    const bestPracticesHeading = html.indexOf("<h2>Best practices — not scored</h2>");
    const stillWorth = html.indexOf("<h2>Still worth checking by hand</h2>");
    expect(whatToFix).toBeGreaterThan(-1);
    expect(bestPracticesHeading).toBeGreaterThan(whatToFix);
    expect(stillWorth).toBeGreaterThan(bestPracticesHeading);
  });

  it("prints rows NOT MET first — matching the screen's order, not the catalog's declaration order", () => {
    // "bookmarks" (bestPractices/pdf.ts) is declared well after the five
    // heading_structure practices — in raw catalog order it prints behind
    // six "Not checked" rows (proven in bestPracticesCore.test.ts's
    // sortBestPractices tests). sortBestPractices moves the one actionable
    // row to the front, matching BestPracticesSection.vue's on-screen order
    // for the same document.
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
    const html = buildPrintablePlan({ filename: "report.pdf", steps: [], bestPractices: rows });
    const bpList = html.slice(html.indexOf('<ul class="bp">'));
    const firstLi = bpList.slice(0, bpList.indexOf("</li>") + "</li>".length);
    expect(firstLi).toContain("Bookmarks for navigation — Worth doing");
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

  it("escapes document-derived text on BOTH escape sites — the block AND the evidence channel", () => {
    // Two independent interpolations (printablePlan.ts): r.block.lines feeds
    // the <pre>, r.evidence feeds a separate <p class="bp-doc"> paragraph.
    // The <script> payload below proves the block; on its own that says
    // nothing about evidence, which carries link labels, font names and
    // sheet names on real documents and needs its own proof. "Heading
    // hierarchy skip: …" (bestPractices/pdf.ts:111-118) is the one line that
    // routes hostile text into `evidence` for this practice.
    const hostile = evaluateBestPractices({
      fileType: "pdf",
      pageCount: 40,
      categories: [
        {
          id: "heading_structure",
          findings: [
            'PDF/UA only — not scored: found 2 heading tags, but the level order has gaps — <img src=x onerror="alert(1)">',
            "Heading hierarchy skip: <img src=x onerror=alert(1)>",
            "--- Heading Tree ---",
            "  H1 → <script>alert(1)</script>",
          ],
        },
      ],
    });
    const html = buildPrintablePlan({ filename: "x.pdf", steps: [], bestPractices: hostile });
    // The block escape site (r.block.lines).
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    // The evidence escape site (r.evidence) — a DIFFERENT interpolation.
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    // The onerror payload embedded in the FIRST finding never reaches ANY
    // interpolation at all — heading-level-order's detect() folds a matched
    // notScored line into a canned sentence rather than quoting it — so this
    // assertion alone would prove nothing; the two pairs above do the work.
    expect(html).not.toContain('onerror="alert(1)"');
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

  it("links the criterion to the WCAG 2.1 Understanding page, whatever the caller passes", () => {
    // Pinned to 2.1 since 2026-08-31: these rows argue about the LEGAL
    // standard, and a label reading "Level A" that opens a /WCAG22/ page
    // invites the obvious question about which version is meant. The runtime
    // resolver follows WCAG.VERSION — 2.1 by default, and settable to 2.2 —
    // which is right everywhere else and wrong here, so this link does not
    // use it. That is what "whatever the caller passes" is asserting.
    const html = buildPrintablePlan({
      filename: "report.pdf",
      steps: [],
      bestPractices: bookmarksRows(),
      understandingUrl: (slug) => `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`,
    });
    expect(html).toContain('href="https://www.w3.org/WAI/WCAG21/Understanding/multiple-ways.html"');
    expect(html).not.toContain("WCAG22/Understanding/multiple-ways");
    expect(html).toContain("WCAG 2.4.5: Multiple Ways");
  });

  it("links it on paper too, with no resolver supplied", () => {
    // The URL no longer depends on a resolver reaching this call site, so a
    // printout can never lose the rule. Previously the whole link was
    // dropped when `understandingUrl` was absent.
    const html = buildPrintablePlan({
      filename: "report.pdf",
      steps: [],
      bestPractices: bookmarksRows(),
    });
    expect(html).toContain('href="https://www.w3.org/WAI/WCAG21/Understanding/multiple-ways.html"');
    expect(html).toContain("WCAG 2.4.5: Multiple Ways");
  });
});

describe("category help links on paper", () => {
  it("prints a category help link and drops an unsafe one", () => {
    const withHelp = {
      ...report,
      categories: [
        {
          ...report.categories[0],
          helpLinks: [
            { label: "Adobe: heading tags", url: "https://helpx.adobe.com/acrobat/headings" },
            { label: "Evil", url: "javascript:alert(1)" },
          ],
        },
      ],
    };
    const html = buildPrintablePlan({
      filename: "x.pdf",
      steps: [],
      bestPractices: evaluateBestPractices(withHelp),
    });
    expect(html).toContain('href="https://helpx.adobe.com/acrobat/headings"');
    expect(html).toContain("Adobe: heading tags");
    expect(html).not.toContain("javascript:");
  });
});

describe("the printed section makes no legal claim the catalog cannot support (2026-08-31)", () => {
  it("never calls the whole list 'optional work'", () => {
    // On paper there is no row to click into, so the intro is the only thing
    // a reader has. "Optional work" reads as "the law does not ask for any of
    // this" — untrue for the link-text practices, which are unscored because
    // WCAG 2.4.4 (Level A) admits context an automated check cannot read.
    const html = build();
    expect(html).toContain("None of this affected the grade.");
    expect(html).not.toMatch(/optional work/i);
    expect(html).toMatch(/only a person can judge/i);
  });
});
