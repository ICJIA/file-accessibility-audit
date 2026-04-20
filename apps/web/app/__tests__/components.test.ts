import "./test-helpers";
import { describe, it, expect, vi } from "vitest";
import { mount, shallowMount } from "@vue/test-utils";

import DropZone from "../components/DropZone.vue";
import ScoreCard from "../components/ScoreCard.vue";
import CategoryRow from "../components/CategoryRow.vue";
import ProcessingOverlay from "../components/ProcessingOverlay.vue";

// ---------------------------------------------------------------------------
// DropZone
// ---------------------------------------------------------------------------
describe("DropZone", () => {
  it("renders the drop area with prompt text", () => {
    const wrapper = mount(DropZone);
    expect(wrapper.text()).toContain("Drop PDF files here");
    expect(wrapper.text()).toContain("max 50 MB each");
  });

  it("contains a hidden file input that accepts PDF", () => {
    const wrapper = mount(DropZone);
    const input = wrapper.find('input[type="file"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes("accept")).toContain("pdf");
    expect(input.classes()).toContain("hidden");
  });

  it("emits file-selected when a valid PDF is dropped", async () => {
    const wrapper = mount(DropZone);
    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const dropEvent = new Event("drop") as any;
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: { files: [file] },
    });
    Object.defineProperty(dropEvent, "preventDefault", { value: () => {} });

    await wrapper
      .find("div")
      .trigger("drop", { dataTransfer: { files: [file] } });
    // Since trigger does not pass dataTransfer through, call the handler manually
    // via the component's exposed method through the wrapper vm:
    const vm = wrapper.vm as any;
    // processFile is internal, but we can simulate via handleDrop-like logic
    // Instead, use the input change approach:
    const input = wrapper.find('input[type="file"]');
    // Create a mock change event
    Object.defineProperty(input.element, "files", {
      value: [file],
      writable: true,
    });
    await input.trigger("change");

    expect(wrapper.emitted("file-selected")).toBeTruthy();
    expect(wrapper.emitted("file-selected")![0][0]).toEqual(file);
  });

  it("does NOT emit file-selected for a non-PDF file", async () => {
    const wrapper = mount(DropZone);
    const file = new File(["img"], "photo.png", { type: "image/png" });

    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, "files", {
      value: [file],
      writable: true,
    });
    await input.trigger("change");
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("file-selected")).toBeFalsy();
    expect(wrapper.text()).toContain("Please select PDF files");
  });

  it("does NOT emit file-selected if file exceeds 50 MB", async () => {
    const wrapper = mount(DropZone);
    // Create a "file" whose size is over 50 MB
    const bigFile = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(bigFile, "size", { value: 51 * 1024 * 1024 });

    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, "files", {
      value: [bigFile],
      writable: true,
    });
    await input.trigger("change");
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("file-selected")).toBeFalsy();
    expect(wrapper.text()).toContain("exceed");
    expect(wrapper.text()).toContain("50 MB limit");
  });

  it("shows drag-active text when dragging over", async () => {
    const wrapper = mount(DropZone);
    // The dragover handler is on the inner div (the dashed-border drop area)
    const dropArea = wrapper
      .findAll("div")
      .find((d) => d.classes().some((c) => c.includes("border-dashed")))!;
    await dropArea.trigger("dragenter");
    expect(wrapper.text()).toContain("Drop your PDFs here");
  });
});

// ---------------------------------------------------------------------------
// ScoreCard
// ---------------------------------------------------------------------------
describe("ScoreCard", () => {
  const baseResult = {
    filename: "test-report.pdf",
    pageCount: 12,
    overallScore: 87,
    grade: "B",
    executiveSummary: "Overall the document is in good shape.",
  };

  it("renders the grade letter", () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } });
    expect(wrapper.text()).toContain("B");
  });

  it("renders the overall score with /100 suffix", () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } });
    expect(wrapper.text()).toContain("87");
    expect(wrapper.text()).toContain("/100");
  });

  it("renders the filename and page count", () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } });
    expect(wrapper.text()).toContain("test-report.pdf");
    expect(wrapper.text()).toContain("12 pages");
  });

  it('renders singular "page" for pageCount of 1', () => {
    const wrapper = mount(ScoreCard, {
      props: { result: { ...baseResult, pageCount: 1 } },
    });
    expect(wrapper.text()).toContain("1 page");
    expect(wrapper.text()).not.toContain("1 pages");
  });

  it("renders the executive summary", () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } });
    expect(wrapper.text()).toContain("Overall the document is in good shape.");
  });

  it("renders the grade label text", () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } });
    expect(wrapper.text()).toContain("Good");
  });

  it("shows score-profile toggle buttons when an alternate profile exists", () => {
    const wrapper = mount(ScoreCard, {
      props: {
        result: {
          ...baseResult,
          scoreProfiles: {
            strict: {
              label: "Strict semantic score",
              description: "Strict mode description",
              overallScore: 66,
              grade: "D",
              executiveSummary: "Strict summary",
            },
            remediation: {
              label: "Practical readiness score",
              description: "Practical mode description",
              overallScore: 86,
              grade: "B",
              executiveSummary: "Remediation summary",
            },
          },
        },
      },
    });

    expect(wrapper.get('[data-testid="score-mode-strict"]').text()).toContain(
      "Strict",
    );
    expect(
      wrapper.get('[data-testid="score-mode-remediation"]').text(),
    ).toContain("Practical");
    expect(
      wrapper.get('[data-testid="alternate-score-summary"]').text(),
    ).toContain("Practical readiness score");
    expect(
      wrapper.get('[data-testid="strict-mode-rationale"]').text(),
    ).toContain("programmatically determinable");
    expect(
      wrapper.get('[data-testid="mode-recommendation-title"]').text(),
    ).toContain("two WCAG-based scoring methodologies");
    expect(
      wrapper.get('[data-testid="mode-recommendation-title"]').text(),
    ).toContain("both are valid");
    expect(
      wrapper.get('[data-testid="mode-recommendation-current"]').text(),
    ).toContain("Current view: Strict");
    expect(wrapper.text()).toContain("IITAA §E205.4");
  });

  it("switches the displayed score and summary when remediation mode is selected", async () => {
    const wrapper = mount(ScoreCard, {
      props: {
        result: {
          ...baseResult,
          overallScore: 66,
          grade: "D",
          executiveSummary: "Strict summary",
          categories: [
            {
              id: "heading_structure",
              label: "Heading Structure",
              score: 0,
              grade: "F",
              severity: "Critical",
              findings: ["No heading tags"],
              explanation: "Heading explanation",
            },
          ],
          scoreProfiles: {
            strict: {
              label: "Strict semantic score",
              description: "Strict mode description",
              overallScore: 66,
              grade: "D",
              executiveSummary: "Strict summary",
            },
            remediation: {
              label: "Practical readiness score",
              description: "Practical mode description",
              overallScore: 86,
              grade: "B",
              executiveSummary: "Remediation summary",
            },
          },
        },
      },
    });

    await wrapper
      .get('[data-testid="score-mode-remediation"]')
      .trigger("click");

    expect(wrapper.text()).toContain("86");
    expect(wrapper.text()).toContain("Good");
    expect(wrapper.text()).toContain("Remediation summary");
    expect(
      wrapper.get('[data-testid="mode-recommendation-title"]').text(),
    ).toContain("two WCAG-based scoring methodologies");
    expect(
      wrapper.get('[data-testid="mode-recommendation-title"]').text(),
    ).toContain("both are valid");
    expect(
      wrapper.get('[data-testid="mode-recommendation-current"]').text(),
    ).toContain("Current view: Practical");
    expect(
      wrapper.get('[data-testid="practical-disclaimer"]').text(),
    ).toContain("PDF/UA Compliance Signals");
    expect(
      wrapper.get('[data-testid="practical-disclaimer"]').text(),
    ).toContain("same document");
    expect(
      wrapper.get('[data-testid="strict-findings-note"]').text(),
    ).toContain("different category weights");
    expect(
      wrapper.get('[data-testid="strict-findings-note"]').text(),
    ).toContain("PDF/UA identifiers");
    expect(
      wrapper.get('[data-testid="strict-findings-note"]').text(),
    ).toContain("same document");
    expect(
      wrapper.get('[data-testid="strict-findings-note"]').text(),
    ).toContain("§504.2.2 PDF Export");
    expect(
      wrapper.get('[data-testid="iitaa-pdfua-link"]').attributes("href"),
    ).toBe(
      "https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html",
    );
  });

  it("emits selectedMode updates so parent category tables can follow the toggle", async () => {
    const wrapper = mount(ScoreCard, {
      props: {
        result: {
          ...baseResult,
          scoreProfiles: {
            strict: {
              label: "Strict semantic score",
              description: "Strict mode description",
              overallScore: 66,
              grade: "D",
              executiveSummary: "Strict summary",
            },
            remediation: {
              label: "Practical readiness score",
              description: "Practical mode description",
              overallScore: 86,
              grade: "B",
              executiveSummary: "Remediation summary",
            },
          },
        },
      },
    });

    await wrapper
      .get('[data-testid="score-mode-remediation"]')
      .trigger("click");

    expect(wrapper.emitted("update:selectedMode")?.[0]).toEqual([
      "remediation",
    ]);
  });

  it.each([
    { grade: "A", expectedColor: "#22c55e", label: "Excellent" },
    { grade: "B", expectedColor: "#14b8a6", label: "Good" },
    { grade: "C", expectedColor: "#eab308", label: "Needs Improvement" },
    { grade: "D", expectedColor: "#f97316", label: "Poor" },
    { grade: "F", expectedColor: "#ef4444", label: "Failing" },
  ])(
    'grade $grade renders with color $expectedColor and label "$label"',
    ({ grade, expectedColor, label }) => {
      const wrapper = mount(ScoreCard, {
        props: { result: { ...baseResult, grade, overallScore: 50 } },
      });
      // The grade circle border uses the grade color
      const circle = wrapper.find('[class*="rounded-full"]');
      expect(circle.exists()).toBe(true);
      expect(circle.attributes("style")).toContain(expectedColor);
      // The label text should appear
      expect(wrapper.text()).toContain(label);
    },
  );
});

// ---------------------------------------------------------------------------
// CategoryRow
// ---------------------------------------------------------------------------
describe("CategoryRow", () => {
  const baseCategory = {
    id: "headings",
    label: "Headings",
    score: 75,
    grade: "C",
    severity: "Moderate",
    findings: [
      "Heading structure found but incomplete",
      "No H1 heading present",
      "All other headings in order",
    ],
  };

  it("renders the category label", () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } });
    expect(wrapper.text()).toContain("Headings");
  });

  it("renders the score number", () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } });
    expect(wrapper.text()).toContain("75");
  });

  it("sets the score bar width to match the score percentage", () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } });
    const bar = wrapper.find(
      '[class*="rounded-full"][class*="transition-all"]',
    );
    expect(bar.exists()).toBe(true);
    expect(bar.attributes("style")).toContain("width: 75%");
  });

  it("renders the severity badge text", () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } });
    expect(wrapper.text()).toContain("Moderate");
  });

  it("renders the grade badge", () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } });
    expect(wrapper.text()).toContain("C");
  });

  it("does not show findings initially (collapsed by default)", () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } });
    expect(wrapper.text()).not.toContain(
      "Heading structure found but incomplete",
    );
  });

  it("shows findings after clicking the row (expanding)", async () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } });
    await wrapper.find("button").trigger("click");
    expect(wrapper.text()).toContain("Heading structure found but incomplete");
    expect(wrapper.text()).toContain("No H1 heading present");
    expect(wrapper.text()).toContain("All other headings in order");
  });

  it("collapses findings on a second click", async () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } });
    await wrapper.find("button").trigger("click");
    expect(wrapper.text()).toContain("Heading structure found but incomplete");
    await wrapper.find("button").trigger("click");
    expect(wrapper.text()).not.toContain(
      "Heading structure found but incomplete",
    );
  });

  it('shows "N/A" when score is null', () => {
    const wrapper = mount(CategoryRow, {
      props: {
        category: { ...baseCategory, score: null, grade: null, severity: null },
      },
    });
    expect(wrapper.text()).toContain("N/A");
  });

  it("does not render a score bar when score is null", () => {
    const wrapper = mount(CategoryRow, {
      props: {
        category: { ...baseCategory, score: null, grade: null },
      },
    });
    // The inner bar (with v-if="category.score !== null") should not exist
    const bars = wrapper.findAll('[class*="transition-all"]');
    const scoreBars = bars.filter((b) =>
      b.attributes("style")?.includes("width"),
    );
    expect(scoreBars.length).toBe(0);
  });

  it("renders severity badge with correct color mapping", () => {
    const severities = [
      { severity: "Pass", expectedColor: "success" },
      { severity: "Minor", expectedColor: "info" },
      { severity: "Moderate", expectedColor: "warning" },
      { severity: "Critical", expectedColor: "error" },
    ];
    for (const { severity, expectedColor } of severities) {
      const wrapper = mount(CategoryRow, {
        props: { category: { ...baseCategory, severity } },
      });
      const badge = wrapper.find(".u-badge");
      expect(badge.exists()).toBe(true);
      expect(badge.attributes("data-color")).toBe(expectedColor);
    }
  });

  it("shows finding icons based on finding text", async () => {
    const wrapper = mount(CategoryRow, {
      props: {
        category: {
          ...baseCategory,
          findings: [
            "Tags not found in document",
            "Alt text found for all images",
            "Some minor issues detected",
          ],
        },
      },
    });
    await wrapper.find("button").trigger("click");
    const items = wrapper.findAll("li");
    // "not found" => cross icon
    expect(items[0].text()).toContain("\u2717"); // ✗
    // "found" => check icon
    expect(items[1].text()).toContain("\u2713"); // ✓
    // generic => bullet
    expect(items[2].text()).toContain("\u2022"); // •
  });
});

// ---------------------------------------------------------------------------
// ProcessingOverlay
// ---------------------------------------------------------------------------
describe("ProcessingOverlay", () => {
  it("renders the spinner element", () => {
    const wrapper = mount(ProcessingOverlay, {
      props: { stage: "Uploading..." },
    });
    const spinner = wrapper.find(".animate-spin");
    expect(spinner.exists()).toBe(true);
  });

  it('shows the static "Analyzing your PDF" heading', () => {
    const wrapper = mount(ProcessingOverlay, {
      props: { stage: "Uploading..." },
    });
    expect(wrapper.text()).toContain("Analyzing your PDF");
  });

  it("renders the stage message from props", () => {
    const wrapper = mount(ProcessingOverlay, {
      props: { stage: "Extracting text..." },
    });
    expect(wrapper.text()).toContain("Extracting text...");
  });

  it("updates stage text reactively", async () => {
    const wrapper = mount(ProcessingOverlay, { props: { stage: "Step 1" } });
    expect(wrapper.text()).toContain("Step 1");
    await wrapper.setProps({ stage: "Step 2" });
    expect(wrapper.text()).toContain("Step 2");
    expect(wrapper.text()).not.toContain("Step 1");
  });
});
