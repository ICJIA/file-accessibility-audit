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
