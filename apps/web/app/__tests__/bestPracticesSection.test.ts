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
        "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 14 (Headings)), not a WCAG 2.1 failure, so your grade is not affected.",
        "Found 6 heading tags, 3 of them H1.",
        "--- Heading Tree ---",
        "  H1 → H2 → H1 → H1",
        "  Heading hierarchy skip: H1 → H3 (skipped H2)",
      ],
    },
    // Since v1.148.2 the section lists ONLY met/not-met rows, so a fixture
    // needs categories that actually resolve — otherwise the tests below have
    // nothing to look at. These give a single-h1 MET, a display-doc-title MET
    // (it carries a standard with no links), and a not-met bookmarks row.
    {
      id: "title_language",
      label: "Title",
      findings: [
        "PDF/UA only — not scored: the DisplayDocTitle viewer preference is off, so viewers show the filename instead of the title.",
      ],
    },
    {
      id: "bookmarks",
      label: "Bookmarks",
      findings: [
        "PDF/UA only — not scored: this 40-page document has 40 pages and no bookmarks, which makes it harder to navigate.",
      ],
    },
    // A MET row, so the ordering test has both statuses to order.
    { id: "table_markup", label: "Tables", findings: ["No nested tables detected."] },
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
    // Two statuses reach the section since v1.148.2, and only two: what a
    // reader could still do, and what they already did. A NOT CHECKED or NOT
    // APPLICABLE row appearing here would be the noise this section was
    // trimmed to remove.
    expect(w.find('[data-status="met"]').exists()).toBe(true);
    expect(w.find('[data-status="not-checked"]').exists()).toBe(false);
    expect(w.find('[data-status="not-applicable"]').exists()).toBe(false);
    expect(w.text()).toMatch(/MET/);
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

  it("orders rows NOT MET first and MET last (inverting STATUS_ORDER must fail)", () => {
    // Only two statuses reach the section since v1.148.2 — what a reader
    // could still do comes before what they already did.
    const w = mountSection(pdfResult);
    const rows = w.findAll("[data-practice]");
    expect(rows[0]!.attributes("data-status")).toBe("not-met");
    expect(rows[rows.length - 1]!.attributes("data-status")).toBe("met");
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
    const btn2 = w.find('[data-practice="bookmarks"] button');
    await btn1.trigger("click");
    await btn2.trigger("click");
    expect(btn1.attributes("aria-expanded")).toBe("true");
    expect(btn2.attributes("aria-expanded")).toBe("true");
    expect(w.find("#bp-body-heading-level-order").isVisible()).toBe(true);
    expect(w.find("#bp-body-bookmarks").isVisible()).toBe(true);
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

  it("the Show/Hide affordance sits INSIDE bp-row-header and is marked data-export-exclude", () => {
    // The nesting is the CSS contract: main.css's print rule is
    // `.bp-row-header [data-export-exclude] { display: none !important }`,
    // the only thing that keeps a printed row — whose body is force-shown
    // right beneath it — from ending in a literal "Show". Print honours no
    // [data-export-exclude] rule of its own (only useReportExport.ts does,
    // and only for the HTML export), so moving this span out of the header
    // or dropping the attribute silently reinstates the contradiction.
    const w = mountSection(pdfResult);
    const affordance = w.find(".bp-row-header [data-export-exclude]");
    expect(affordance.exists()).toBe(true);
    expect(affordance.text()).toBe("Show");
  });

  // The headline invariant: exactly FOUR practices never reach MET, so a
  // flawless PDF reads "15 met · 0 not met · 4 not checked", not 19 met.
  //
  // list-labels is the one that decides four vs five, and this comment
  // describes only what pdf.ts does NOW. Its MET branch reads the
  // analyzer's PER-LIST detail lines (supplementary.ts:198, each rendered
  // "  List N: … | <Lbl> ✓/✗ | …") off signalLines and requires EVERY one
  // to show "<Lbl> ✓". Those markers come from each list's own
  // l.hasLabels, set during the qpdf tree walk (qpdfService.ts:1524-1526)
  // independently of <LBody> well-formedness and of whether the summary
  // <Lbl> advisory fired. That independence is the whole point: the
  // earlier "census witness present AND no advisory" gate was unsound,
  // because that advisory is emitted only inside a <LBody> check which
  // ignores <Lbl> entirely, so a malformed unlabelled list suppressed it
  // and read MET (task-7-report.md, fix round 3).
  //
  // Hence the fixture below carries a real per-list line, not just the
  // census — without it list-labels would correctly fall to NOT CHECKED
  // and this test would be pinning 14/0/5. Counts re-verified empirically
  // against this exact fixture before being pinned here.
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
          // The analyzer emits exactly ONE of the two scope lines (scoring/pdf.ts:1683-1687); the
          // fully-scoped one is the clean path both scope practices read as MET.
          "All <TH> cells have Scope attributes (/Column, /Row, or /Both)",
          "No nested tables detected in this document.",
        ],
      },
      { id: "link_quality", findings: ["All 5 link(s) use descriptive text."] },
    ],
  };

  it("the headline invariant: a flawless PDF shows 15 met, never 19 — the four it cannot vouch for are not listed", () => {
    // Silence is not a pass. Four practices have no witness in this fixture,
    // so the checker cannot claim them — and since v1.148.2 a row it cannot
    // claim is not shown at all rather than shown as NOT CHECKED. The
    // invariant that matters is unchanged: the section must never read 19 met.
    const w = mountSection(flawlessPdf);
    const cannotVouchFor = [
      "heading-content",
      "single-h1",
      "character-mapping",
      "content-in-tag-tree",
    ];
    for (const id of cannotVouchFor) {
      expect(w.find(`[data-practice="${id}"]`).exists(), id).toBe(false);
    }
    // list-labels DOES reach MET here — the fixture includes its witness
    // (a well-formed list with <Lbl> present) and no <Lbl> advisory.
    expect(w.find('[data-practice="list-labels"]').attributes("data-status")).toBe("met");
    expect(w.findAll('[data-status="not-checked"]').length).toBe(0);
    expect(w.findAll('[data-status="met"]').length).toBe(15);
    expect(w.findAll('[data-status="not-met"]').length).toBe(0);
    const summary = w.find('[data-testid="best-practices-summary"]');
    expect(summary.text()).toContain("15");
  });
});

describe("category help links reach the row (spec §4's third link source)", () => {
  const withHelp = {
    ...pdfResult,
    categories: [
      {
        ...pdfResult.categories[0],
        helpLinks: [
          { label: "Adobe: heading tags", url: "https://helpx.adobe.com/acrobat/headings" },
          { label: "Evil", url: "javascript:alert(1)" },
          // Identical to the Matterhorn link heading-level-order already
          // carries — must render ONCE, not twice.
          {
            label: "Matterhorn 14 — Headings",
            url: "https://pdfa.org/resource/the-matterhorn-protocol/",
          },
        ],
      },
    ],
  };

  it("renders a category help link under Read more, drops an unsafe one, and never repeats a link the practice already carries", () => {
    const w = mountSection(withHelp);
    const row = w.find('[data-practice="heading-level-order"]');
    expect(row.exists()).toBe(true);
    const html = row.html();
    expect(html).toContain('href="https://helpx.adobe.com/acrobat/headings"');
    expect(html).not.toContain("javascript:");
    expect(html.match(/Matterhorn 14 — Headings/g)?.length ?? 0).toBe(1);
  });
});

describe("the era gate reaches the component through analyzedAt", () => {
  const withHierarchy = {
    fileType: "pdf",
    pageCount: 12,
    categories: [
      { id: "heading_structure", findings: ["Found 4 heading tags with logical hierarchy"] },
    ],
  };
  it("a witness-based MET is not shown at all for a payload older than its advisory, MET otherwise", () => {
    // The gate turns it into NOT CHECKED and the section then leaves it out
    // (v1.148.2). Together: a stored report from before the check existed can
    // never take the credit, and never explains itself in a row either.
    const old = mount(BestPracticesSection, {
      props: { result: withHierarchy, analyzedAt: "2026-08-01T00:00:00Z" },
    });
    expect(old.find('[data-practice="heading-convention"]').exists()).toBe(false);
    const fresh = mountSection(withHierarchy);
    expect(fresh.find('[data-practice="heading-convention"]').attributes("data-status")).toBe(
      "met",
    );
  });
});

describe("Also noted in this report — advisories no practice covers are not dropped", () => {
  it("renders the static-XFA caveat from form_accessibility, in the analyzer's words", () => {
    const w = mountSection({
      ...pdfResult,
      categories: [
        ...pdfResult.categories,
        {
          id: "form_accessibility",
          label: "Form Accessibility",
          findings: [
            "Advisory — not scored: this is a static XFA form. The conventional PDF content audited here is exactly what viewers display, but the embedded XFA template layer itself was not separately audited.",
          ],
        },
      ],
    });
    const notes = w.find('[data-testid="best-practices-other-notes"]');
    expect(notes.exists()).toBe(true);
    expect(notes.text()).toMatch(/Form Accessibility/);
    expect(notes.text()).toMatch(/static XFA form/);
  });
  it("renders nothing when every advisory is covered", () => {
    expect(
      mountSection(pdfResult).find('[data-testid="best-practices-other-notes"]').exists(),
    ).toBe(false);
  });
});

describe("the grade answer never contradicts the row above it (2026-08-31 WCAG audit)", () => {
  // Found by three independent auditors and reproduced here. Today's fix
  // round diverted scored defects into NOT APPLICABLE rows whose evidence
  // reads "That is counted in your score — see the action plan above." The
  // row body then printed, unconditionally, "Does this affect my grade? No.
  // This is optional — it does not change your score." Two blocks apart, on
  // the same card. It also defeated the whole divert mechanism.
  const scoredDivert = {
    fileType: "pdf",
    pageCount: 12,
    categories: [
      {
        id: "bookmarks",
        label: "Bookmarks",
        findings: ["Outline structure present but contains no entries"],
      },
    ],
  };

  it("does not render a row at all when the defect is already scored", () => {
    // v1.148.1, the user's rule: "best practices should only be things above
    // and beyond WCAG 2.1. If it's already counted, then it doesn't need to be
    // labelled as a best practice." An empty bookmark outline is a scored
    // failure; it belongs in the action plan and nowhere else. Two attempts to
    // LABEL it here both misled — first "NOT APPLICABLE" (on a defect that had
    // just cost points), then "COUNTED IN YOUR SCORE" (beside a practice name,
    // asserting that practice was scored). Not rendering it needs no qualifier.
    const w = mountSection(scoredDivert);
    expect(w.find('[data-practice="bookmarks"]').exists()).toBe(false);
    expect(w.text()).not.toMatch(/counted in your score/);
  });

  it("still answers the question on a genuine NOT MET row — without the word 'optional'", () => {
    const row = mountSection(pdfResult).find('[data-status="not-met"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toMatch(/Does this affect my grade/);
    expect(row.text()).toMatch(/does not change your score/);
    // "Optional" is a claim about the LAW, not about scoring, and the
    // catalog holds practices (vague link text) that WCAG 2.4.4 Level A
    // does reach — it is unscored because context is not machine-readable.
    expect(row.text()).not.toMatch(/\boptional\b/i);
  });
});
