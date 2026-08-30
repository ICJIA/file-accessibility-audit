/**
 * The Best Practices scorecard.
 *
 * Pinned here: it never reads as an obligation, it renders every status
 * distinctly, a MET row never appears without the analyzer having said so,
 * and the section self-hides when there is nothing to show.
 */
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BestPracticesSection from "../components/BestPracticesSection.vue";

const pdfResult = {
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
        "  Heading hierarchy skip: H1 → H3 (skipped H2)",
      ],
    },
  ],
};

const mountSection = (result: unknown) => mount(BestPracticesSection, { props: { result } });

describe("BestPracticesSection", () => {
  it("renders the practice, its status, and the document's own heading order", () => {
    const w = mountSection(pdfResult);
    const row = w.find('[data-practice="heading-level-order"]');
    expect(row.exists()).toBe(true);
    expect(row.attributes("data-status")).toBe("not-met");
    expect(w.text()).toContain("H1 → H2 → H1 → H1");
  });

  // Renamed (fix round): this pins the specific banned phrases only —
  // "the standard Illinois (IITAA) and federal law (ADA Title II) require"
  // ships intentionally (verbatim in ActionPlan.vue, survived the
  // v1.130-1.133 copy audit), so the old name overpromised what this test
  // actually guarantees.
  it('never uses the banned "required by law" / "REQUIRED BY WCAG" phrasing', () => {
    const html = mountSection(pdfResult).html();
    expect(html).not.toMatch(/required by law/i);
    expect(html).not.toMatch(/REQUIRED BY WCAG/i);
    expect(html).toMatch(/not scored/i);
  });

  it("states plainly that none of it affected the grade", () => {
    expect(mountSection(pdfResult).text()).toMatch(/none of (this|it) affected your grade/i);
  });

  it("computes the summary counts rather than hardcoding them", () => {
    const w = mountSection(pdfResult);
    const summary = w.find('[data-testid="best-practices-summary"]');
    expect(summary.exists()).toBe(true);
    const rows = w.findAll("[data-practice]");
    const notMet = w.findAll('[data-status="not-met"]').length;
    expect(summary.text()).toContain(String(notMet));
    expect(rows.length).toBeGreaterThan(1);
  });

  it("renders every status with its own label", () => {
    // NOTE the category ids: font embedding lives under text_extractability.
    // There is no "fonts" category — see the Category ID Reference.
    const w = mountSection({
      fileType: "pdf",
      pageCount: 2,
      categories: [
        { id: "heading_structure", findings: ["Found 3 heading tags with logical hierarchy"] },
        {
          id: "text_extractability",
          findings: [
            "All fonts are embedded — text will render correctly regardless of the user's installed fonts",
          ],
        },
      ],
    });
    expect(w.find('[data-status="met"]').exists()).toBe(true);
    expect(w.find('[data-status="not-checked"]').exists()).toBe(true);
    expect(w.text()).toMatch(/not checked/i);
  });

  it("expands and collapses a row", async () => {
    const w = mountSection(pdfResult);
    const btn = w.find('[data-practice="heading-level-order"] button');
    expect(btn.attributes("aria-expanded")).toBe("false");
    await btn.trigger("click");
    expect(btn.attributes("aria-expanded")).toBe("true");
    expect(w.find("#bp-body-heading-level-order").isVisible()).toBe(true);
    await btn.trigger("click");
    expect(btn.attributes("aria-expanded")).toBe("false");
  });

  it("renders nothing at all when there is nothing to show", () => {
    expect(mountSection({ fileType: "pdf" }).find('[data-testid="best-practices"]').exists()).toBe(
      false,
    );
    expect(mountSection(null).find('[data-testid="best-practices"]').exists()).toBe(false);
  });

  it("does not throw on a forged stored report", () => {
    expect(() => mountSection({ fileType: "pdf", categories: "nope" })).not.toThrow();
    expect(() => mountSection({ fileType: 42, categories: [null] })).not.toThrow();
  });

  // ---- Fix-round pins (coordinator review, 2026-08-30) ----
  // The 8 tests above are the brief's verbatim block; everything below
  // pins copy/DOM invariants the review found untested — a straight
  // WORTH DOING -> FAILED rename left the suite green.

  it('the NOT MET pill is the literal "WORTH DOING" text, never a failure word', () => {
    const w = mountSection(pdfResult);
    const row = w.find('[data-practice="heading-level-order"]');
    expect(row.text()).toContain("WORTH DOING");
    expect(row.text()).not.toMatch(/FAILED|ISSUE/);
  });

  it("the not-met pill's own classes are sky, never red or amber", () => {
    const w = mountSection(pdfResult);
    const row = w.find('[data-practice="heading-level-order"]');
    const pill = row.findAll("span").find((s) => s.text() === "WORTH DOING");
    expect(pill).toBeTruthy();
    const cls = pill!.attributes("class") ?? "";
    expect(cls).toMatch(/sky/);
    expect(cls).not.toMatch(/red/);
    expect(cls).not.toMatch(/amber/);
  });

  it("orders rows NOT MET first and NOT CHECKED last (inverting STATUS_ORDER must fail)", () => {
    const w = mountSection(pdfResult);
    const rows = w.findAll("[data-practice]");
    expect(rows[0]!.attributes("data-status")).toBe("not-met");
    expect(rows[rows.length - 1]!.attributes("data-status")).toBe("not-checked");
  });

  it("the summary never renders a fraction — a denominator beside a status reads as a grade", () => {
    const w = mountSection(pdfResult);
    const summary = w.find('[data-testid="best-practices-summary"]');
    expect(summary.text()).not.toMatch(/\d+\s*(of|\/)\s*\d+/);
  });

  it("aria-controls equals the disclosure body's own id", () => {
    const w = mountSection(pdfResult);
    const btn = w.find('[data-practice="heading-level-order"] button');
    const body = w.find("#bp-body-heading-level-order");
    expect(body.exists()).toBe(true);
    expect(btn.attributes("aria-controls")).toBe(body.attributes("id"));
  });

  it("holds two rows open at once — not an exclusive accordion", async () => {
    const w = mountSection(pdfResult);
    const btn1 = w.find('[data-practice="heading-level-order"] button');
    const btn2 = w.find('[data-practice="single-h1"] button');
    await btn1.trigger("click");
    await btn2.trigger("click");
    expect(btn1.attributes("aria-expanded")).toBe("true");
    expect(btn2.attributes("aria-expanded")).toBe("true");
    expect(w.find("#bp-body-heading-level-order").isVisible()).toBe(true);
    expect(w.find("#bp-body-single-h1").isVisible()).toBe(true);
  });

  it("a not-checked row's body contains neither How to fix nor Read more", () => {
    const w = mountSection({
      fileType: "pdf",
      pageCount: 2,
      categories: [
        { id: "heading_structure", findings: ["Found 3 heading tags with logical hierarchy"] },
        {
          id: "text_extractability",
          findings: [
            "All fonts are embedded — text will render correctly regardless of the user's installed fonts",
          ],
        },
      ],
    });
    const row = w.find('[data-practice="heading-content"]');
    expect(row.attributes("data-status")).toBe("not-checked");
    expect(row.text()).not.toContain("How to fix");
    expect(row.text()).not.toContain("Read more");
  });

  it("drops a WCAG Understanding link whose resolved URL is not http(s) — safeLinks on the wcag half", () => {
    // bookmarks carries wcagSlugs (WCAG 2.4.5) and links: [] — its ONLY
    // link comes from resolving wcagSlugs through useWcag().understandingUrl,
    // which is exactly the path safeLinks must guard.
    const original = (globalThis as any).useRuntimeConfig;
    (globalThis as any).useRuntimeConfig = () => ({
      public: { ...original().public, wcagUnderstandingBase: "javascript:alert(1)//" },
    });
    try {
      const html = mountSection(pdfResult).html();
      expect(html).not.toContain("javascript:");
      expect(html).not.toMatch(/href="javascript/i);
    } finally {
      (globalThis as any).useRuntimeConfig = original;
    }
  });

  it("the intro never claims every check ran — it sits above rows admitting they have no data", () => {
    // Fix round 3: the intro used to say "was checked against this
    // document" — a universal claim directly above a NOT CHECKED chip and
    // rows saying a check has no data at all (reason: "not-run").
    const html = mountSection(pdfResult).html();
    expect(html).not.toMatch(/was checked against this document/i);
    expect(html).toMatch(/none of this affected your grade/i);
  });

  it("distinguishes a not-run NOT CHECKED row from a silent one — no false reassurance", () => {
    // table-scope-simple's category (table_markup) is absent from pdfResult
    // — its detect() hits categoryAbsent() and must not claim the check ran
    // and stayed quiet, because it never ran at all.
    const w = mountSection(pdfResult);
    const notRun = w.find('[data-practice="table-scope-simple"]');
    expect(notRun.attributes("data-status")).toBe("not-checked");
    expect(notRun.text()).toContain("was not looked at either way");
    expect(notRun.text()).not.toContain("staying silent here is not a sign of trouble");
  });

  it("a silent NOT CHECKED row (category present, nothing to report) keeps the original reassurance", () => {
    const w = mountSection({
      fileType: "pdf",
      pageCount: 2,
      categories: [
        { id: "heading_structure", findings: ["Found 3 heading tags with logical hierarchy"] },
      ],
    });
    // single-h1's category (heading_structure) IS present; it has no MET
    // branch and no categoryAbsent() gate, so an ordinary silent fallback.
    const silent = w.find('[data-practice="single-h1"]');
    expect(silent.attributes("data-status")).toBe("not-checked");
    expect(silent.text()).toContain("staying silent here is not a sign of trouble");
    expect(silent.text()).not.toContain("was not looked at either way");
  });

  it("Office fix.app renders as a plain note, never under a contradicting 'exported file' heading", () => {
    const w = mountSection({
      fileType: "docx",
      pageCount: 12,
      categories: [
        {
          id: "heading_structure",
          findings: [
            "5 real heading(s) found.",
            "Advisory — not scored: 2 place(s) skip a heading level (e.g. Heading 1 → Heading 3) — not a WCAG 2.1 failure, so your grade is not affected, but screen-reader users may wonder what they missed at the skipped level.",
          ],
        },
      ],
    });
    const row = w.find('[data-practice="docx-heading-skips"]');
    expect(row.attributes("data-status")).toBe("not-met");
    expect(row.text()).toContain("In the source file (Word, PowerPoint, Excel):");
    expect(row.text()).toContain("Office documents are fixed at the source");
    expect(row.text()).not.toContain("In the exported file:");
  });

  it("a PDF fix keeps its labelled second route (In the exported PDF (Acrobat):)", () => {
    const w = mountSection(pdfResult);
    const row = w.find('[data-practice="heading-level-order"]');
    expect(row.text()).toContain("In the source file (Word, InDesign):");
    expect(row.text()).toContain("In the exported PDF (Acrobat):");
  });

  it("a citation with no links (display-doc-title: standard set, links: []) still renders under Read more", () => {
    // MISSING bug from the review: standard used to be nested inside the
    // links guard and silently disappeared whenever links was empty.
    const w = mountSection(pdfResult);
    const row = w.find('[data-practice="display-doc-title"]');
    expect(row.text()).toContain("PDF/UA (ISO 14289) clause 7.1");
  });

  it("the disclosure body carries the bp-body class main.css's print rule targets", () => {
    const w = mountSection(pdfResult);
    const body = w.find("#bp-body-heading-level-order");
    expect(body.classes()).toContain("bp-body");
  });

  it("the row header button carries the bp-row-header class main.css force-shows at print", () => {
    // main.css:227 hides every <button> at print; without this class (and
    // the paired rule after it) a printed report shows 19 anonymous
    // bodies — evidence and fix steps with no practice name and no status.
    const w = mountSection(pdfResult);
    const btn = w.find('[data-practice="heading-level-order"] button');
    expect(btn.classes()).toContain("bp-row-header");
  });

  // The headline invariant. CORRECTED in fix round 2: list-labels was
  // briefly believed to be a fifth never-MET practice (round 1). It is
  // not — supplementary.ts:184-186 pushes an unconditional census witness
  // ("N list(s) detected with M total item(s)"), un-indented (main, so
  // matchMain finds it), before the <Lbl> advisory — see pdf.ts's
  // list-labels detect() and its ORDER IS LOAD-BEARING comment. Re-verified
  // empirically against this exact fixture (with list content now
  // included) before pinning anything: the product's stated
  // "15 met · 0 not met · 4 not checked" holds.
  const flawlessPdf = {
    fileType: "pdf",
    pageCount: 40,
    categories: [
      { id: "heading_structure", findings: ["Found 6 heading tags with logical hierarchy"] },
      {
        id: "reading_order",
        findings: [
          "Reading-order fidelity: 100% of comparable content agreed with the page's draw order.",
          "Structure tree depth: 4 level(s).",
          "--- List Structure Analysis ---",
          "3 list(s) detected with 14 total item(s)",
          "  List 1: 5 <LI> | <Lbl> ✓ | <LBody> ✓ | well-formed",
          "All lists are well-formed (each <LI> has an <LBody>)",
          "--- Footnotes ---",
          "  All notes carry a unique /ID.",
        ],
      },
      { id: "bookmarks", findings: ["12 bookmark(s) found."] },
      {
        id: "text_extractability",
        findings: [
          "All fonts are embedded — text will render correctly regardless of the user's installed fonts",
        ],
      },
      {
        id: "title_language",
        findings: [
          "The DisplayDocTitle is set; viewers will show this document's descriptive title.",
        ],
      },
      {
        id: "table_markup",
        findings: [
          "All <TH> cells have scope attributes.",
          "All tables associate data cells with headers, using /Scope or the explicit /Headers attribute.",
          "No nested tables detected in this document.",
        ],
      },
      { id: "link_quality", findings: ["All 5 link(s) use descriptive text."] },
    ],
  };

  it("the headline invariant: a flawless PDF is 15 met · 0 not met · 4 not checked, never 19 met", () => {
    const w = mountSection(flawlessPdf);
    const neverMet = ["heading-content", "single-h1", "character-mapping", "content-in-tag-tree"];
    for (const id of neverMet) {
      expect(w.find(`[data-practice="${id}"]`).attributes("data-status")).toBe("not-checked");
    }
    // list-labels DOES reach MET here — the fixture includes its witness
    // (a well-formed list with <Lbl> present) and no <Lbl> advisory.
    expect(w.find('[data-practice="list-labels"]').attributes("data-status")).toBe("met");
    expect(w.findAll('[data-status="not-checked"]').length).toBe(4);
    expect(w.findAll('[data-status="met"]').length).toBe(15);
    expect(w.findAll('[data-status="not-met"]').length).toBe(0);
    const summary = w.find('[data-testid="best-practices-summary"]');
    expect(summary.text()).toContain("4");
    expect(summary.text()).toContain("15");
  });
});
