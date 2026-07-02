import { describe, it, expect, vi } from "vitest";

// ReportContent calls useWcag(), which reads Nuxt runtime config — mock it
// so bare @vue/test-utils mounts work outside a Nuxt app context.
vi.mock("~/composables/useWcag", () => ({
  useWcag: () => ({
    version: "2.2",
    level: "AA",
    label: "WCAG 2.2 Level AA",
    quickref: "https://www.w3.org/WAI/WCAG22/quickref/",
    understandingUrl: (slug: string) =>
      `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`,
  }),
}));

import { mount } from "@vue/test-utils";
import ReportContent from "../components/ReportContent.vue";
import { GRADE_COLORS, SEVERITY_COLORS } from "@file-audit/shared";

// Behavioral coverage for the shared report subtree (Score Table, Document
// Metadata, Detailed Findings, Not Included in Scoring). Replaces the old
// CategoryRow.vue tests, which pinned a component the app never rendered.

function cat(over: Record<string, unknown> = {}) {
  return {
    id: "heading_structure",
    label: "Heading Structure",
    weight: 0.15,
    score: 85,
    grade: "B",
    severity: "Minor",
    findings: ["Found 12 headings with logical hierarchy"],
    explanation: "Headings create a navigable outline.",
    helpLinks: [{ label: "WCAG 1.3.1", url: "https://example.org" }],
    ...over,
  };
}

function mountReport(
  categories: unknown[],
  extra: Record<string, unknown> = {},
) {
  return mount(ReportContent, {
    props: { result: { categories, ...extra } as any },
    global: { stubs: { NaCell: true, AppTooltip: true } },
  });
}

describe("ReportContent — score table", () => {
  it("renders one row per scored category with the grade color", () => {
    const wrapper = mountReport([
      cat(),
      cat({
        id: "alt_text",
        label: "Alt Text on Images",
        score: 95,
        grade: "A",
        severity: "Minor",
      }),
    ]);
    const html = wrapper.html();
    expect(html).toContain("Heading Structure");
    expect(html).toContain("Alt Text on Images");
    expect(html).toContain(GRADE_COLORS.B);
    expect(html).toContain(GRADE_COLORS.A);
    // severity chips use the shared severity palette (ports the old
    // CategoryRow severity-badge coverage)
    expect(html).toContain(SEVERITY_COLORS.Minor);
  });

  it("splits N/A categories into the Not Included in Scoring subsection", () => {
    const wrapper = mountReport([
      cat(),
      cat({
        id: "forms",
        label: "Form Fields",
        score: null,
        grade: null,
        severity: null,
      }),
    ]);
    // N/A rows render inside the same table, under their own header row,
    // and the explanatory footnote appears.
    expect(wrapper.text()).toContain("Not Included in Scoring");
    expect(wrapper.text()).toContain("Form Fields");
    expect(
      wrapper.find('[data-testid="category-scores-footnote"]').exists(),
    ).toBe(true);
  });

  it("omits the Not Included section and footnote when every category is scored", () => {
    const wrapper = mountReport([cat()]);
    // text() (unlike html()) excludes template comments, so this asserts on
    // the rendered v-if state, not the `<!-- Not Included in Scoring -->`
    // comment node.
    expect(wrapper.text()).not.toContain("Not Included in Scoring");
    expect(
      wrapper.find('[data-testid="category-scores-footnote"]').exists(),
    ).toBe(false);
  });
});

describe("ReportContent — detailed findings", () => {
  it("renders scored findings under Detailed Findings and N/A context under Not Included", () => {
    const wrapper = mountReport([
      cat(),
      cat({
        id: "forms",
        label: "Form Fields",
        score: null,
        grade: null,
        severity: null,
        findings: ["only rendered as N/A context"],
      }),
    ]);
    expect(wrapper.text()).toContain("Detailed Findings");
    expect(wrapper.text()).toContain("Found 12 headings");
    // N/A categories keep their findings too — shown as context inside the
    // Not Included in Scoring card, not as scored findings.
    expect(wrapper.text()).toContain("only rendered as N/A context");
  });

  it("keeps the aria-expanded technical-signals toggle (export snapshot contract)", () => {
    const wrapper = mountReport([
      cat({
        findings: [
          "Found 12 headings with logical hierarchy",
          "--- Technical signals ---",
          "  StructTree depth 4",
        ],
      }),
    ]);
    expect(wrapper.html()).toContain("aria-expanded");
  });
});

describe("ReportContent — document metadata", () => {
  it("renders the metadata card when pdfMetadata is present", () => {
    const wrapper = mountReport([cat()], {
      pdfMetadata: {
        creator: "Word",
        producer: "Acrobat Distiller",
        pdfVersion: "1.7",
        pageCount: 12,
        author: "A",
        subject: null,
        keywords: null,
        creationDate: null,
        modDate: null,
        isEncrypted: false,
      },
    });
    expect(wrapper.html()).toContain("Document Metadata");
    expect(wrapper.html()).toContain("Acrobat Distiller");
  });

  it("omits the metadata card without pdfMetadata", () => {
    const wrapper = mountReport([cat()]);
    expect(wrapper.html()).not.toContain("Document Metadata");
  });
});
