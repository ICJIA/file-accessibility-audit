/**
 * The action plan's "independently confirmed" block (v1.127.0).
 *
 * A reviewer reading a fix step is entitled to ask "says who?" — and for
 * machine-checkable defects the honest answer is stronger than our own
 * judgment: veraPDF, built by the PDF Association, which this project did
 * not write. These tests pin the two things that make the claim safe:
 *
 *   1. it appears ONLY when veraPDF actually failed that point on THIS
 *      document, quoting veraPDF's own words, clause, and count;
 *   2. its ABSENCE never reads as agreement — no verdict, an unavailable
 *      verdict, or a clean verdict all render nothing at all.
 */
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ActionPlan from "../components/ActionPlan.vue";
import ReportContent from "../components/ReportContent.vue";
import { pdfUaCategoryFor, pdfUaFailuresByCategory } from "../components/pdfUaCategory";

const SCOPE_FAILURE = {
  ruleId: "7.5-1",
  clause: "7.5",
  description:
    "If the table's structure is not determinable via Headers and IDs, then structure elements of type TH shall have a Scope attribute",
  count: 5,
};

const step = {
  rank: 1,
  categoryId: "table_markup",
  title: "Say which way your table headers point",
  why: "This table already has its header cells marked.",
  severity: "Minor" as const,
  wcagRefs: [{ sc: "1.3.1", name: "Info and Relationships" }],
  routes: [],
  detailAnchor: "#cat-table_markup",
};

const mountPlan = (verdict: unknown) =>
  mount(ActionPlan, { props: { steps: [step], pdfUaVerdict: verdict as never } });

// Targeted by test id, not by searching the whole render for "veraPDF":
// the component's own source comments mention it, and Vue keeps comments in
// the rendered output.
const cosign = (verdict: unknown) => mountPlan(verdict).findAll('[data-testid="pdfua-cosign"]');

describe("pdfUaCategoryFor — conservative, description-keyword matching", () => {
  it("maps the Scope rule to tables (before the generic table rule can claim it)", () => {
    expect(pdfUaCategoryFor(SCOPE_FAILURE)).toBe("table_markup");
  });

  it("maps figure alt-text and link-description rules to their own categories", () => {
    expect(
      pdfUaCategoryFor({ description: "A Figure structure element shall have an Alt entry" }),
    ).toBe("alt_text");
    expect(
      pdfUaCategoryFor({
        description: "Links shall contain an alternate description via their Contents key",
      }),
    ).toBe("link_quality");
  });

  it("returns null for a rule that maps to nothing of ours — never guesses", () => {
    expect(
      pdfUaCategoryFor({
        description: "The PDF/UA version and conformance level of a file shall be specified",
      }),
    ).toBeNull();
  });

  it("groups only a document's own failures", () => {
    expect(
      pdfUaFailuresByCategory({ available: true, failures: [SCOPE_FAILURE] }).table_markup,
    ).toHaveLength(1);
    expect(pdfUaFailuresByCategory({ available: false, failures: [SCOPE_FAILURE] })).toEqual({});
    expect(pdfUaFailuresByCategory(null)).toEqual({});
  });
});

describe("the co-sign block on the fix card", () => {
  it("quotes veraPDF's own words, clause, and count when it failed the same point", () => {
    const blocks = cosign({ available: true, failures: [SCOPE_FAILURE] });
    expect(blocks).toHaveLength(1);
    const html = blocks[0]!.html();
    expect(html).toContain("veraPDF");
    expect(html).toMatch(/shall have a Scope attribute/);
    expect(html).toContain("7.5");
    expect(html).toMatch(/5 failed checks/);
    // Attribution is explicit: theirs, not ours.
    expect(html).toMatch(/not ours|not by us/i);
  });

  it("renders NOTHING when veraPDF did not run — silence is not agreement", () => {
    expect(cosign({ available: false })).toHaveLength(0);
    expect(cosign(null)).toHaveLength(0);
    expect(cosign(undefined)).toHaveLength(0);
  });

  it("renders NOTHING when veraPDF ran and flagged nothing for this category", () => {
    expect(
      cosign({
        available: true,
        failures: [
          {
            ruleId: "5-1",
            clause: "5",
            description: "The PDF/UA version and conformance level of a file shall be specified",
            count: 1,
          },
        ],
      }),
    ).toHaveLength(0);
  });
});

describe("the same co-sign appears in the DETAILED view's evidence card", () => {
  // The visual view's plan and the detailed view's evidence cards must tell
  // the same story — a reader who switches views to check the tool's work is
  // exactly the reader this block is for.
  const result = {
    fileType: "pdf",
    grade: "B",
    overallScore: 89,
    categories: [
      {
        id: "table_markup",
        label: "Table Markup",
        score: 85,
        severity: "Minor",
        explanation: "A designated header row lets screen readers announce the header.",
        findings: ["52 <TH> cell(s) missing Scope attribute"],
      },
    ],
    pdfUaVerdict: { available: true, passed: false, failures: [SCOPE_FAILURE] },
  };

  it("quotes veraPDF beside the category's own evidence", () => {
    const w = mount(ReportContent, { props: { result: result as never } });
    const blocks = w.findAll('[data-testid="pdfua-cosign"]');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.html()).toMatch(/shall have a Scope attribute/);
    expect(blocks[0]!.html()).toContain("7.5");
  });

  it("does NOT claim confirmation on a category we passed — it says veraPDF is stricter", () => {
    // The DoIT case: our link and font checks pass, veraPDF's PDF/UA rules
    // do not. Saying "independently confirmed" there would put words in the
    // referee's mouth about a finding we never made.
    const passing = {
      ...result,
      categories: [
        {
          id: "link_quality",
          label: "Link & URL Quality",
          score: 100,
          severity: null,
          explanation: "Link text should describe the destination.",
          findings: ["No issues found"],
        },
      ],
      pdfUaVerdict: {
        available: true,
        passed: false,
        failures: [
          {
            ruleId: "7.18.5-2",
            clause: "7.18.5",
            description:
              "Links shall contain an alternate description via their Contents key as described in ISO 32000-1:2008, 14.9.3",
            count: 17,
          },
        ],
      },
    };
    const w = mount(ReportContent, { props: { result: passing as never } });
    const block = w.find('[data-testid="pdfua-cosign"]');
    expect(block.exists()).toBe(true);
    expect(block.html()).toMatch(/stricter here/i);
    expect(block.html()).not.toMatch(/Independently confirmed/i);
    // And it must say the score did not move because of it.
    expect(block.html()).toMatch(/not counted in the score/i);
  });

  it("stays absent when veraPDF did not flag that category", () => {
    const clean = { ...result, pdfUaVerdict: { available: true, passed: true, failures: [] } };
    const w = mount(ReportContent, { props: { result: clean as never } });
    expect(w.findAll('[data-testid="pdfua-cosign"]')).toHaveLength(0);
  });
});

describe("the two tiers: required by WCAG 2.1 vs PDF/UA best practice (v1.130.0, renamed v1.133.0)", () => {
  // The objection this answers: "you are grading our file against PDF/UA,
  // and PDF/UA is not the law." Now the grade measures only the legal
  // standard, and PDF/UA work is shown beside it, plainly not counted.
  const withBothTiers = {
    fileType: "pdf",
    grade: "A",
    overallScore: 100,
    categories: [
      {
        id: "table_markup",
        label: "Table Markup",
        score: 100,
        severity: null,
        explanation: "A designated header row lets screen readers announce the header.",
        findings: [
          "All 1 table(s) have header cells (TH) — 2 header cell(s) total",
          "PDF/UA only — not scored: 2 header cell(s) across 1 table(s) have no /Scope. Each of those tables has its headers along a single edge with nothing spanned, so the header-to-data relationship is already determinable and WCAG 1.3.1 is satisfied — your grade is not affected.",
          "How to fix (optional): In Adobe Acrobat, set Scope on the header cells.",
        ],
      },
    ],
  };

  it("shows the PDF/UA items in their own tier, marked not counted", () => {
    const w = mount(ReportContent, { props: { result: withBothTiers as never } });
    const tier = w.find('[data-testid="not-scored-tier"]');
    expect(tier.exists()).toBe(true);
    expect(tier.html()).toMatch(/PDF\/UA best practice/i);
    expect(tier.html()).toMatch(/not counted in your score/i);
    expect(tier.html()).toMatch(/no \/Scope/);
    // The optional fix line travels with it, not with the scored findings.
    expect(tier.html()).toMatch(/How to fix \(optional\)/i);
  });

  it("labels the scored findings as the legal standard when a second tier exists", () => {
    const html = mount(ReportContent, { props: { result: withBothTiers as never } }).html();
    expect(html).toMatch(/Required by WCAG 2\.1/i);
    expect(html).toMatch(/ADA Title II/);
  });

  it("adds no headings at all to an ordinary card with nothing unscored", () => {
    const plain = {
      ...withBothTiers,
      categories: [
        {
          ...withBothTiers.categories[0],
          findings: ["All 1 table(s) have header cells (TH) — 2 header cell(s) total"],
        },
      ],
    };
    const w = mount(ReportContent, { props: { result: plain as never } });
    expect(w.find('[data-testid="not-scored-tier"]').exists()).toBe(false);
    expect(w.html()).not.toMatch(/Required by WCAG 2\.1 —/i);
  });
});

describe("the action plan labels legal work and separates the optional (v1.132.0)", () => {
  const step = {
    rank: 1,
    categoryId: "alt_text",
    title: "Describe your images",
    why: "Screen readers announce alt text in place of the image.",
    severity: "Critical" as const,
    wcagRefs: [{ sc: "1.1.1", name: "Non-text Content" }],
    routes: [],
    detailAnchor: "#cat-alt_text",
  };

  it("marks every numbered step as required by law", () => {
    // A PDF/UA-only item carries no severity, so it never becomes a step —
    // which is exactly why the chip can be unconditional.
    const w = mount(ActionPlan, { props: { steps: [step] } });
    expect(w.find('[data-testid="step-law-chip"]').exists()).toBe(true);
    expect(w.find('[data-testid="step-law-chip"]').text()).toMatch(/REQUIRED BY WCAG 2\.1/);
  });

  it("lists unscored PDF/UA work separately, never as a numbered step", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [step],
        categories: [
          {
            label: "Table Markup",
            findings: [
              "All 1 table(s) have header cells (TH)",
              "PDF/UA only — not scored: 2 header cell(s) have no /Scope.",
            ],
          },
        ],
      },
    });
    const beyond = w.find('[data-testid="plan-beyond-group"]');
    expect(beyond.exists()).toBe(true);
    expect(beyond.text()).toMatch(/Above and beyond — not required by WCAG 2\.1/i);
    expect(beyond.text()).toMatch(/PDF\/UA BEST PRACTICE/);
    expect(beyond.text()).toMatch(/no \/Scope/);
    // Still exactly one numbered step: the optional item did not become one.
    expect(w.findAll('[data-testid="step-law-chip"]')).toHaveLength(1);
  });

  it("shows no 'above and beyond' group when there is nothing optional", () => {
    const w = mount(ActionPlan, {
      props: { steps: [step], categories: [{ label: "Table Markup", findings: ["All good"] }] },
    });
    expect(w.find('[data-testid="plan-beyond-group"]').exists()).toBe(false);
  });
});

describe("the strip's failing-verdict link points at the fixes", () => {
  it("targets the action plan, not the technical report", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(__dirname, "../components/TwoStandardsStrip.vue"), "utf8");
    // The plan is what a reader with failures needs next; the technical
    // report is evidence, not action.
    expect(src).toContain('href="#action-plan"');
    expect(src).not.toContain('href="#technical-report"');
    const plan = readFileSync(resolve(__dirname, "../components/ActionPlan.vue"), "utf8");
    expect(plan).toContain('id="action-plan"');
  });
});

describe("the beyond group carries veraPDF's verdict in full (v1.133.0)", () => {
  const step = {
    rank: 1,
    categoryId: "alt_text",
    title: "Describe your images",
    why: "Screen readers announce alt text in place of the image.",
    severity: "Critical" as const,
    wcagRefs: [{ sc: "1.1.1", name: "Non-text Content" }],
    routes: [],
    detailAnchor: "#cat-alt_text",
  };
  const failedVerdict = {
    available: true,
    passed: false,
    profile: "PDF/UA-1",
    totalFailureCount: 106,
    distinctRuleCount: 7,
    failures: [
      { clause: "7.1", description: "Content shall be marked as Artifact or tagged", count: 63 },
      { clause: "7.21.4.1", description: "Fonts shall be embedded", count: 7 },
      { clause: "7.5", description: "Table header cells shall have Scope", count: 36 },
    ],
  };

  it("lists every failing rule with its ISO clause and occurrence count, plus the totals line", () => {
    // The DoIT newsletter case: 100/A on the legal standard, 106 veraPDF
    // items — the reader must be able to see the referee's full list without
    // leaving the plan.
    const w = mount(ActionPlan, { props: { steps: [step], pdfUaVerdict: failedVerdict } });
    const vera = w.find('[data-testid="plan-vera-detail"]');
    expect(vera.exists()).toBe(true);
    expect(vera.text()).toMatch(/What veraPDF found/);
    expect(vera.text()).toMatch(/106 occurrences across 7 failing rules of PDF\/UA-1/);
    expect(vera.text()).toMatch(/7\.21\.4\.1/);
    expect(vera.text()).toMatch(/Fonts shall be embedded/);
    expect(vera.text()).toMatch(/× 7/);
    expect(vera.text()).toMatch(/Table header cells shall have Scope/);
  });

  it("shows the group on veraPDF failures alone — even with no unscored findings of our own", () => {
    const w = mount(ActionPlan, { props: { steps: [step], pdfUaVerdict: failedVerdict } });
    expect(w.find('[data-testid="plan-beyond-group"]').exists()).toBe(true);
  });

  it("reports a clean veraPDF pass as such, with no rule list", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [step],
        pdfUaVerdict: { available: true, passed: true, failures: [] },
        categories: [
          {
            label: "Table Markup",
            findings: ["PDF/UA only — not scored: 2 header cell(s) have no /Scope."],
          },
        ],
      },
    });
    const vera = w.find('[data-testid="plan-vera-detail"]');
    expect(vera.text()).toMatch(/no machine-checkable PDF\/UA failures/);
    expect(vera.text()).not.toMatch(/occurrences across/);
  });

  it("surfaces a veraPDF error instead of pretending the check ran clean", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [step],
        pdfUaVerdict: { available: true, passed: false, error: "JVM timed out", failures: [] },
      },
    });
    expect(w.find('[data-testid="plan-vera-detail"]').text()).toMatch(
      /could not complete[^]*JVM timed out/,
    );
  });

  it("carries the optional-fix line with its unscored finding (partition parity)", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [step],
        categories: [
          {
            label: "Table Markup",
            findings: [
              "PDF/UA only — not scored: 2 header cell(s) have no /Scope.",
              "How to fix (optional): set Scope in the Tags panel.",
            ],
          },
        ],
      },
    });
    const beyond = w.find('[data-testid="plan-beyond-group"]');
    expect(beyond.text()).toMatch(/How to fix \(optional\)/);
  });
});

describe("the Detailed view opens with the two-standards strip (v1.133.0)", () => {
  it("renders it by default and suppresses it when embedded in TechnicalReport", () => {
    const result = {
      categories: [],
      fileType: "pdf",
      conformance: { status: "pass", failures: [], notAssessed: [], headline: "" },
    } as never;
    const shown = mount(ReportContent, { props: { result } });
    expect(shown.find('[data-testid="two-standards-strip"]').exists()).toBe(true);
    const hidden = mount(ReportContent, { props: { result, showStandardsStrip: false } });
    expect(hidden.find('[data-testid="two-standards-strip"]').exists()).toBe(false);
  });
});

describe("per-rule fix routes in the veraPDF list (v1.134.0)", () => {
  const step = {
    rank: 1,
    categoryId: "alt_text",
    title: "Describe your images",
    why: "Screen readers announce alt text in place of the image.",
    severity: "Critical" as const,
    wcagRefs: [{ sc: "1.1.1", name: "Non-text Content" }],
    routes: [],
    detailAnchor: "#cat-alt_text",
  };
  const verdict = (failures: unknown[]) =>
    ({ available: true, passed: false, totalFailureCount: 9, failures }) as never;

  it("gives a mapped rule a collapsed expander with BOTH routes — source and PDF", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [step],
        pdfUaVerdict: verdict([
          {
            clause: "7.1",
            description: "Content shall be marked as Artifact or tagged as real content",
            count: 247,
          },
        ]),
      },
    });
    const fix = w.find('[data-testid="vera-fix-0"]');
    expect(fix.exists()).toBe(true);
    expect(fix.text()).toMatch(/How to fix/);
    expect(fix.text()).toMatch(/In the source file \(Word, InDesign\):/);
    expect(fix.text()).toMatch(/In the exported PDF \(Acrobat\):/);
    expect(fix.text()).toMatch(/Document structure tags for accessibility/);
    expect(fix.text()).toMatch(/Automatically tag PDF/);
    // Collapsed by default — a <details> without the open attribute.
    expect(fix.attributes("open")).toBeUndefined();
  });

  it("renders an unmappable rule as a plain row — no advice is better than wrong advice", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [step],
        pdfUaVerdict: verdict([
          {
            clause: "9.9",
            description: "Some future rule this build has never heard of",
            count: 1,
          },
        ]),
      },
    });
    expect(w.find('[data-testid="vera-fix-0"]').exists()).toBe(false);
    expect(w.find('[data-testid="plan-vera-detail"]').text()).toMatch(/future rule/);
    expect(w.find('[data-testid="plan-vera-detail"]').text()).not.toMatch(/How to fix/);
  });

  it("keyword ordering: the Form/widget rule maps to form advice, not annotation advice", () => {
    // Its description contains "widget annotation" — a naive match order
    // would send it to the annotation route.
    const w = mount(ActionPlan, {
      props: {
        steps: [step],
        pdfUaVerdict: verdict([
          {
            clause: "7.18.4",
            description:
              "If the Form element omits a Role attribute (Table 348), it shall have only one child: an object reference identifying the widget annotation",
            count: 2,
          },
        ]),
      },
    });
    const fix = w.find('[data-testid="vera-fix-0"]');
    expect(fix.text()).toMatch(/Tooltip/);
    expect(fix.text()).not.toMatch(/review annotations/);
  });

  it("keyword ordering: the Tabs rule maps to tab-order advice, not annotation advice", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [step],
        pdfUaVerdict: verdict([
          {
            clause: "7.18.3",
            description:
              "Every page on which there is an annotation shall contain in its page dictionary the key Tabs, and its value shall be S",
            count: 1,
          },
        ]),
      },
    });
    expect(w.find('[data-testid="vera-fix-0"]').text()).toMatch(/tab order/);
  });

  it("the PDF/UA identifier's advice warns it is a claim, not a repair", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [step],
        pdfUaVerdict: verdict([
          {
            clause: "5",
            description:
              "The PDF/UA version and conformance level of a file shall be specified using the PDF/UA Identification extension schema",
            count: 1,
          },
        ]),
      },
    });
    expect(w.find('[data-testid="vera-fix-0"]').text()).toMatch(
      /claim of conformance, not a repair/,
    );
  });
});
