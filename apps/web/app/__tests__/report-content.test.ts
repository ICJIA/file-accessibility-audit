import { describe, it, expect, vi } from "vitest";

// ReportContent calls useWcag(), which reads Nuxt runtime config — mock it
// so bare @vue/test-utils mounts work outside a Nuxt app context.
vi.mock("~/composables/useWcag", () => ({
  useWcag: () => ({
    version: "2.2",
    level: "AA",
    label: "WCAG 2.2 Level AA",
    quickref: "https://www.w3.org/WAI/WCAG22/quickref/",
    understandingUrl: (slug: string) => `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`,
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

function mountReport(categories: unknown[], extra: Record<string, unknown> = {}) {
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
    expect(wrapper.find('[data-testid="category-scores-footnote"]').exists()).toBe(true);
  });

  it("omits the Not Included section and footnote when every category is scored", () => {
    const wrapper = mountReport([cat()]);
    // text() (unlike html()) excludes template comments, so this asserts on
    // the rendered v-if state, not the `<!-- Not Included in Scoring -->`
    // comment node.
    expect(wrapper.text()).not.toContain("Not Included in Scoring");
    expect(wrapper.find('[data-testid="category-scores-footnote"]').exists()).toBe(false);
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

describe("ReportContent — help-link href hardening (stored XSS)", () => {
  it("drops the href for a javascript: help-link URL but keeps the label", () => {
    const wrapper = mountReport([
      cat({
        helpLinks: [{ label: "CLICK FOR HELP", url: "javascript:alert(document.domain)" }],
      }),
    ]);
    const html = wrapper.html();
    // the label still renders...
    expect(html).toContain("CLICK FOR HELP");
    // ...but the dangerous scheme never reaches an href attribute
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("javascript:alert");
  });

  it("keeps the href for a legitimate https help-link URL", () => {
    const wrapper = mountReport([
      cat({
        helpLinks: [{ label: "WCAG guidance", url: "https://www.w3.org/WAI/x.html" }],
      }),
    ]);
    expect(wrapper.html()).toContain('href="https://www.w3.org/WAI/x.html"');
  });
});

describe("ReportContent — malformed stored report (SSR crash guard)", () => {
  it("does not throw when categories is not an array", () => {
    expect(() =>
      mount(ReportContent, {
        props: { result: { categories: "not-an-array" } as any },
        global: { stubs: { NaCell: true, AppTooltip: true } },
      }),
    ).not.toThrow();
  });

  it("does not throw when a category's findings is not an array", () => {
    expect(() =>
      mountReport([cat({ findings: "not-an-array" as unknown as string[] })]),
    ).not.toThrow();
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

  it("renders docx metadata rows (Title/Creator/Language/Pages/Words), with a null language shown as Not set", () => {
    const wrapper = mountReport([cat()], {
      fileType: "docx",
      docxMetadata: {
        title: "Annual Report",
        creator: "Jane Doe",
        language: null,
        pageCount: 8,
        wordCount: 2400,
      },
    });
    const panel = wrapper.find('[data-testid="document-metadata"]');
    expect(panel.exists()).toBe(true);
    const text = panel.text();
    expect(text).toContain("Title");
    expect(text).toContain("Annual Report");
    expect(text).toContain("Creator");
    expect(text).toContain("Jane Doe");
    expect(text).toContain("Language");
    expect(text).toContain("Not set");
    expect(text).toContain("Pages");
    expect(text).toContain("8");
    expect(text).toContain("Words");
    expect(text).toContain("2400");
  });

  it("renders the pptx Slides row", () => {
    const wrapper = mountReport([cat()], {
      fileType: "pptx",
      pptxMetadata: {
        title: "Deck",
        creator: "Author",
        language: "en-US",
        slideCount: 24,
      },
    });
    const panel = wrapper.find('[data-testid="document-metadata"]');
    expect(panel.exists()).toBe(true);
    const text = panel.text();
    expect(text).toContain("Slides");
    expect(text).toContain("24");
  });

  it("renders the xlsx Sheets row", () => {
    const wrapper = mountReport([cat()], {
      fileType: "xlsx",
      xlsxMetadata: {
        title: "Budget",
        creator: "Finance",
        sheetCount: 9,
      },
    });
    const panel = wrapper.find('[data-testid="document-metadata"]');
    expect(panel.exists()).toBe(true);
    const text = panel.text();
    expect(text).toContain("Sheets");
    expect(text).toContain("9");
  });

  it("renders a real zero count as the digit 0, not Not set", () => {
    const wrapper = mountReport([cat()], {
      fileType: "xlsx",
      xlsxMetadata: {
        title: null,
        creator: null,
        sheetCount: 0,
      },
    });
    const panel = wrapper.find('[data-testid="document-metadata"]');
    const rows = panel.findAll("span");
    // Sheets row: label span followed by value span. The value span's own
    // text must be exactly "0", never the "Not set" fallback.
    const sheetsLabelIndex = rows.findIndex((s) => s.text() === "Sheets");
    expect(sheetsLabelIndex).toBeGreaterThanOrEqual(0);
    expect(rows[sheetsLabelIndex + 1]?.text()).toBe("0");
  });

  it("keeps the existing PDF rows unchanged even when fileType is also set", () => {
    const wrapper = mountReport([cat()], {
      fileType: "pdf",
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
    const panel = wrapper.find('[data-testid="document-metadata"]');
    const text = panel.text();
    expect(text).toContain("Source Application");
    expect(text).toContain("PDF Producer");
    expect(text).toContain("Acrobat Distiller");
    expect(text).toContain("PDF Version");
    expect(text).toContain("Page Count");
    expect(text).toContain("Encrypted");
    // format-specific labels from the other three shapes must never leak in
    expect(text).not.toContain("Slides");
    expect(text).not.toContain("Sheets");
    expect(text).not.toContain("Words");
  });

  it("omits the metadata card when fileType is set but its metadata object is absent", () => {
    const wrapper = mountReport([cat()], { fileType: "docx" });
    expect(wrapper.html()).not.toContain("Document Metadata");
    expect(wrapper.find('[data-testid="document-metadata"]').exists()).toBe(false);
  });
});
