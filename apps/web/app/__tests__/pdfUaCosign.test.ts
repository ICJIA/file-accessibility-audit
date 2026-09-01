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

/** A whole report — fileType, categories keyed by their real `id`, and a
 *  pdfUaVerdict — the shape evaluateBestPractices() actually needs. Reusing
 *  the bare `{ categories: [{ label, findings }] }` shape the tests above
 *  pass to `mountPlan` produces zero Best Practices rows silently: the
 *  catalog matches a category by `id` (absent from those fixtures) and
 *  gates on `result.fileType` (absent too). */
const SCOPE_RESULT = {
  fileType: "pdf",
  pageCount: 12,
  categories: [
    {
      id: "table_markup",
      label: "Table Markup",
      findings: [
        "All 1 table(s) have header cells (TH)",
        "PDF/UA only — not scored: 2 header cell(s) across 1 table(s) have no /Scope.",
      ],
    },
  ],
  pdfUaVerdict: {
    available: true,
    passed: false,
    totalFailureCount: 5,
    distinctRuleCount: 1,
    failures: [SCOPE_FAILURE],
  },
};

/** A SECOND helper, deliberately not an extension of `mountPlan` — that one
 *  forwards only `steps`/`pdfUaVerdict`, and every veraPDF co-sign test
 *  above keeps using it unchanged. This one passes a whole `result` through
 *  too, the shape BestPracticesSection needs. */
const mountPlanWithResult = (result: unknown) =>
  mount(ActionPlan, {
    props: { steps: [step], result, pdfUaVerdict: (result as any).pdfUaVerdict },
  });

// Targeted by test id, not by searching the whole render for "veraPDF":
// the component's own source comments mention it, and Vue keeps comments in
// the rendered output.
const cosign = (verdict: unknown) => mountPlan(verdict).findAll('[data-testid="pdfua-cosign"]');

describe("pdfUaCategoryFor — conservative, rule-id matching", () => {
  it("maps the Scope rule to tables", () => {
    expect(pdfUaCategoryFor(SCOPE_FAILURE)).toBe("table_markup");
  });

  it("maps figure alt-text and link-description rules to their own categories", () => {
    expect(
      pdfUaCategoryFor({
        ruleId: "7.3-1",
        clause: "7.3",
        description: "A Figure structure element shall have an Alt entry",
      }),
    ).toBe("alt_text");
    expect(
      pdfUaCategoryFor({
        ruleId: "7.18.5-2",
        clause: "7.18.5",
        description: "Links shall contain an alternate description via their Contents key",
      }),
    ).toBe("link_quality");
  });

  it("the figure-alt rule's 'Table 323' ISO citation must not file it under tables", () => {
    // 2026-09-01: keyword matching sent this rule — ×16 on a real annual
    // report — to the Tables step as "independently confirmed", and its
    // Fix: line said to repair the table tags.
    expect(
      pdfUaCategoryFor({
        ruleId: "7.3-1",
        clause: "7.3",
        description:
          "Figure tags shall include an alternative representation or replacement text that represents the contents marked with the Figure tag as noted in ISO 32000-1:2008, 14.7.2, Table 323",
      }),
    ).toBe("alt_text");
  });

  it("the general annotation rule maps to nothing of ours — it spans link, media and file annotations", () => {
    expect(
      pdfUaCategoryFor({
        ruleId: "7.18.1-2",
        clause: "7.18.1",
        description:
          "An annotation (except Widget annotations or hidden annotations) shall have either Contents key or an Alt entry in the enclosing structure element",
      }),
    ).toBeNull();
  });

  it("font rules corroborate text extraction, not tables", () => {
    expect(
      pdfUaCategoryFor({
        ruleId: "7.21.4.1-1",
        clause: "7.21.4.1",
        description:
          "The font programs for all fonts used for rendering within a conforming file shall be embedded within that file, as defined in ISO 32000-1:2008, 9.9",
      }),
    ).toBe("text_extractability");
  });

  it("returns null for a rule that maps to nothing of ours — never guesses", () => {
    expect(
      pdfUaCategoryFor({
        ruleId: "5-1",
        clause: "5",
        description: "The PDF/UA version and conformance level of a file shall be specified",
      }),
    ).toBeNull();
    expect(pdfUaCategoryFor({ description: "no rule id at all" })).toBeNull();
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

  const failingAlt = {
    status: "fail",
    failures: [
      {
        sc: "1.1.1",
        name: "Non-text Content",
        level: "A",
        category: "alt_text",
        issue: "images lack alt text",
        url: "",
      },
    ],
    notAssessed: [],
    headline: "",
  } as never;

  it("marks a step REQUIRED only when its category produced a failing criterion", () => {
    // v1.132's chip was unconditional and wrong: the SFY25 report said
    // "3 criteria failing" above five REQUIRED chips. Earned now.
    const w = mount(ActionPlan, { props: { steps: [step], conformance: failingAlt } });
    expect(w.find('[data-testid="step-law-chip"]').exists()).toBe(true);
    expect(w.find('[data-testid="step-law-chip"]').text()).toMatch(/REQUIRED BY WCAG 2\.1/);
    expect(w.find('[data-testid="step-reco-chip"]').exists()).toBe(false);
  });

  it("marks a scored-but-not-failing step RECOMMENDED — the bookmarks case", () => {
    const bookmarksStep = {
      ...step,
      categoryId: "bookmarks",
      title: "Add bookmarks so the document is navigable",
      severity: "Moderate" as const,
      wcagRefs: [{ sc: "2.4.5", name: "Multiple Ways" }],
      detailAnchor: "#cat-bookmarks",
    };
    const w = mount(ActionPlan, {
      props: { steps: [step, bookmarksStep], conformance: failingAlt },
    });
    expect(w.findAll('[data-testid="step-law-chip"]')).toHaveLength(1);
    const reco = w.find('[data-testid="step-reco-chip"]');
    expect(reco.exists()).toBe(true);
    expect(reco.text()).toMatch(/RECOMMENDED/);
    // And the subtitle reconciles the arithmetic the reader will do anyway.
    expect(w.text()).toMatch(
      /1 of the 2 clear WCAG 2\.1 criterion failures; the other 1 is recommended/,
    );
  });

  it("shows NO chip without a conformance verdict — never assert what cannot be verified", () => {
    const w = mount(ActionPlan, { props: { steps: [step] } });
    expect(w.find('[data-testid="step-law-chip"]').exists()).toBe(false);
    expect(w.find('[data-testid="step-reco-chip"]').exists()).toBe(false);
  });
  // The two tests that used to live here ("lists unscored PDF/UA work
  // separately" and "shows no 'above and beyond' group when there is
  // nothing optional") asserted on `categories`-only fixtures with no
  // `result` — behavior this component no longer has (2026-08-30): our own
  // unscored findings moved to BestPracticesSection, and `categories` alone
  // can no longer produce or suppress the beyond group. Superseded by
  // "the plan's two tiers after the best-practices split" below.
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

  it("hides the group entirely on a clean veraPDF pass — even with unscored findings elsewhere", () => {
    // Post-split (2026-08-30): a clean pass has nothing left to say once our
    // own unscored findings moved to BestPracticesSection, so the group
    // (and the "no machine-checkable failures" line that used to live
    // inside it) no longer renders at all. The unscored `categories`
    // finding stays in this fixture on purpose, to prove it can no longer
    // resurrect the group by itself.
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
    expect(w.find('[data-testid="plan-beyond-group"]').exists()).toBe(false);
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
    // The group's own intro promises "every rule it failed... and how many
    // times it occurs" — which is false on this exact path (nothing failed,
    // nothing to count; the check simply didn't finish). The intro's own
    // "or, if it could not finish, that it says so" clause is what keeps
    // that promise honest here (fix round 1, 2026-08-30).
    expect(w.find('[data-testid="plan-beyond-group"]').text()).toMatch(
      /if it could not finish, that it says so/,
    );
  });
  // The "carries the optional-fix line with its unscored finding (partition
  // parity)" test that used to live here mounted with `categories` alone
  // (no `result`, no `pdfUaVerdict`) and expected the beyond group to carry
  // an unscored finding's optional-fix line. That group no longer reads
  // `categories` at all (2026-08-30); the same fix line now surfaces from
  // BestPracticesSection's own "How to fix" block, covered by that
  // component's own test file.
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
            ruleId: "7.1-3",
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

  it("rule-id routing: the Form rule maps to form advice although its text says \"widget annotation\"", () => {
    // Its description contains "widget annotation" — a naive match order
    // would send it to the annotation route.
    const w = mount(ActionPlan, {
      props: {
        steps: [step],
        pdfUaVerdict: verdict([
          {
            ruleId: "7.18.4-2",
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

  it("rule-id routing: the Tabs rule maps to tab-order advice although its text says \"annotation\"", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [step],
        pdfUaVerdict: verdict([
          {
            ruleId: "7.18.3-1",
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
            ruleId: "5-1",
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

describe("the plan reconciles fixes to criteria when one fix clears two (v1.139.1)", () => {
  it("says the fixes together clear all criteria, naming the double-clearing fix", () => {
    const mk = (rank: number, categoryId: string, severity: "Critical" | "Moderate") => ({
      rank,
      categoryId,
      title: categoryId,
      why: "x",
      severity,
      wcagRefs: [],
      routes: [],
      detailAnchor: `#cat-${categoryId}`,
    });
    const conformance = {
      status: "fail",
      failures: [
        { sc: "1.1.1", name: "", level: "A", category: "alt_text", issue: "", url: "" },
        { sc: "2.4.2", name: "", level: "A", category: "title_language", issue: "", url: "" },
        { sc: "3.1.1", name: "", level: "A", category: "title_language", issue: "", url: "" },
      ],
      notAssessed: [],
      headline: "",
    } as never;
    const w = mount(ActionPlan, {
      props: {
        steps: [mk(1, "alt_text", "Critical"), mk(2, "title_language", "Moderate")],
        conformance,
      },
    });
    expect(w.text()).toMatch(/Together they clear all 3 failing WCAG 2\.1 criteria/);
    expect(w.text()).toMatch(/fix № 2 clears more than one/);
  });
});

describe("the beyond group reads as a section, not a footnote (v1.140.1)", () => {
  const step = {
    rank: 1,
    categoryId: "alt_text",
    title: "Describe your images",
    why: "x",
    severity: "Critical" as const,
    wcagRefs: [{ sc: "1.1.1", name: "Non-text Content" }],
    routes: [],
    detailAnchor: "#cat-alt_text",
  };

  it("bridges from the required tier and shows the at-a-glance chips", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [step],
        pdfUaVerdict: {
          available: true,
          passed: false,
          totalFailureCount: 4732,
          distinctRuleCount: 8,
          failures: [{ clause: "7.1", description: "Content shall be tagged", count: 2418 }],
        },
      },
    });
    const g = w.find('[data-testid="plan-beyond-group"]');
    expect(g.exists()).toBe(true);
    // The seam moved out of the group and above BestPracticesSection too
    // (2026-08-30) — it now introduces both non-required tiers, so it is
    // asserted against the whole render rather than scoped to this group.
    expect(w.text()).toMatch(/Everything WCAG 2.1 requires is above/);
    const chips = w.find('[data-testid="beyond-stat-chips"]');
    expect(chips.exists()).toBe(true);
    expect(chips.text()).toMatch(/0 of these count toward your score/);
    expect(chips.text()).toMatch(/4,732/);
    expect(chips.text()).toMatch(/8/);
  });
});

describe("the plan's two tiers after the best-practices split (2026-08-30)", () => {
  it("puts the unscored items in the Best Practices section, above the beyond group", () => {
    const w = mountPlanWithResult(SCOPE_RESULT);
    const bp = w.find('[data-testid="best-practices"]');
    const beyond = w.find('[data-testid="plan-beyond-group"]');
    expect(bp.exists()).toBe(true);
    expect(beyond.exists()).toBe(true);
    // Not /scope/i — the row LABEL satisfies that. The NOT MET evidence does not.
    expect(bp.text()).toMatch(/header cells? across/i);
    // The section sits between the numbered steps and the beyond group —
    // both boundaries, not just the one against the beyond group.
    const html = w.html();
    expect(html.indexOf('id="plan-step-')).toBeLessThan(
      html.indexOf('data-testid="best-practices"'),
    );
    expect(html.indexOf('data-testid="best-practices"')).toBeLessThan(
      html.indexOf('data-testid="plan-beyond-group"'),
    );
  });

  it("no longer repeats those items inside the beyond group, and the two blocks don't wear the same badge", () => {
    const w = mountPlanWithResult(SCOPE_RESULT);
    const beyond = w.find('[data-testid="plan-beyond-group"]');
    expect(beyond.text()).not.toMatch(/no \/Scope/);
    expect(beyond.text()).toMatch(/veraPDF/);
    // The BEST PRACTICE — NOT SCORED chip used to sit on both blocks,
    // inches apart. It now lives only on the Best Practices heading — if
    // it reappears on the beyond group, the two blocks read as duplicates
    // again, the specific problem this task existed to fix.
    expect(beyond.text()).not.toMatch(/BEST PRACTICE — NOT SCORED/);
    expect(w.find("#best-practices-title").text()).toMatch(/not scored/i);
  });

  it("hides the beyond group entirely when veraPDF has nothing to say", () => {
    const w = mountPlanWithResult({ ...SCOPE_RESULT, pdfUaVerdict: null });
    expect(w.find('[data-testid="plan-beyond-group"]').exists()).toBe(false);
  });

  it("never turns an unscored finding into a numbered step — a number in this plan means a WCAG 2.1 obligation", () => {
    // SCOPE_RESULT pairs exactly one scored step (`step`) with an unscored
    // /Scope finding that (per the first test above) makes the Best
    // Practices section render rows in the same mount. The count of
    // numbered steps must track `steps.length` only, and must never grow
    // because best-practices rows exist alongside it — that is the whole
    // premise the two-tier split rests on, and the kind of thing a future
    // refactor (folding a best-practices row into the plan's step list)
    // would break silently if nothing pinned it.
    const w = mountPlanWithResult(SCOPE_RESULT);
    expect(w.find('[data-testid="best-practices"]').exists()).toBe(true);
    expect(w.findAll(".plan-step-body")).toHaveLength(1); // === [step].length
  });

  it("keeps the beyond group's heading at h2 — a peer tier, not a subsection of Best Practices", () => {
    // Both blocks sit inside <section id="action-plan">, so a flat heading
    // outline (how a screen-reader user navigates) would nest this under
    // Best Practices' own h2 if it were still an h3 — no level skipped, but
    // wrongly subordinate. The plan, Best Practices, and this card are
    // three peer tiers.
    const w = mountPlanWithResult(SCOPE_RESULT);
    expect(w.find('[data-testid="plan-beyond-group"] h2').exists()).toBe(true);
    expect(w.find('[data-testid="plan-beyond-group"] h3').exists()).toBe(false);
  });

  it("pins the beyond group's own heading text and intro — the two copy changes this task exists for", () => {
    // Nothing previously asserted the rendered heading or intro text
    // directly: `expect(beyond.text()).toMatch(/veraPDF/)` (above) is
    // satisfied by the intro paragraph and by plan-vera-detail regardless
    // of the heading, so reverting the heading to its old, now-false
    // wording ("Above and beyond — not required by WCAG 2.1") would have
    // kept the suite green. Pin both directly.
    const w = mountPlanWithResult(SCOPE_RESULT);
    expect(w.find('[data-testid="plan-beyond-group"] h2').text()).toBe(
      "Above and beyond — veraPDF's verdict",
    );
    expect(w.find('[data-testid="plan-beyond-group"]').text()).toMatch(
      /independent PDF\/UA validator, built by the PDF Association/,
    );
  });

  it("keeps the seam off a report with nothing below it", () => {
    // A legacy or forged stored report can carry categories with a
    // missing/unrecognized fileType — evaluateBestPractices returns []
    // for it (gates on fileType), so BestPracticesSection renders nothing.
    // With no pdfUaVerdict either, the beyond group also stays hidden. The
    // seam must not draw "Everything WCAG 2.1 requires is above ↑" over
    // empty space.
    const w = mountPlanWithResult({
      pageCount: 1,
      categories: [{ id: "table_markup", label: "Table Markup", findings: [] }],
    });
    expect(w.find('[data-testid="best-practices"]').exists()).toBe(false);
    expect(w.find('[data-testid="plan-beyond-group"]').exists()).toBe(false);
    expect(w.text()).not.toMatch(/Everything WCAG 2.1 requires is above/);
  });
});

describe("the per-category not-scored tier names a standard the file type actually has", () => {
  it("says PDF/UA on a PDF card and plain 'best practice' on a Word card", () => {
    const line = "Note — not scored: 2 merged cell(s) across the table(s).";
    const docx = mount(ReportContent, {
      props: {
        result: {
          fileType: "docx",
          categories: [{ id: "table_markup", label: "Table Markup", score: 100, findings: [line] }],
        } as never,
      },
    });
    // Scoped to the tier itself: TwoStandardsStrip (above the cards) names
    // PDF/UA on purpose, to say it "Does not apply to this file type".
    const docxTier = docx.find('[data-testid="not-scored-tier"]');
    expect(docxTier.text()).toMatch(/Also recommended — best practice/);
    expect(docxTier.text()).not.toMatch(/PDF\/UA/);
    const pdf = mount(ReportContent, {
      props: {
        result: {
          fileType: "pdf",
          categories: [
            {
              id: "table_markup",
              label: "Table Markup",
              score: 100,
              findings: [
                "PDF/UA only — not scored: 2 header cell(s) across 1 table(s) have no /Scope.",
              ],
            },
          ],
        } as never,
      },
    });
    expect(pdf.find('[data-testid="not-scored-tier"]').text()).toMatch(
      /Also recommended — PDF\/UA best practice/,
    );
  });
});
