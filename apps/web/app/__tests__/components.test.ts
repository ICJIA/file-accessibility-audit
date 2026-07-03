import "./test-helpers";
import { describe, it, expect, vi } from "vitest";
import { mount, shallowMount } from "@vue/test-utils";

import DropZone from "../components/DropZone.vue";
import ScoreCard from "../components/ScoreCard.vue";
import ProcessingOverlay from "../components/ProcessingOverlay.vue";

// ---------------------------------------------------------------------------
// DropZone
// ---------------------------------------------------------------------------
describe("DropZone", () => {
  it("renders the drop area with prompt text", () => {
    const wrapper = mount(DropZone);
    expect(wrapper.text()).toContain(
      "Drop PDF, Word, PowerPoint, or Excel files here",
    );
    expect(wrapper.text()).toContain("max 15 MB each");
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

  it("emits file-selected when a valid .docx is selected", async () => {
    const wrapper = mount(DropZone);
    const file = new File(["docx"], "report.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const input = wrapper.find('input[type="file"]');
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
    expect(wrapper.text()).toContain(
      "Please select PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) files",
    );
  });

  it("does NOT emit file-selected if file exceeds 15 MB", async () => {
    const wrapper = mount(DropZone);
    // Create a "file" whose size is over 15 MB
    const bigFile = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(bigFile, "size", { value: 16 * 1024 * 1024 });

    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, "files", {
      value: [bigFile],
      writable: true,
    });
    await input.trigger("change");
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("file-selected")).toBeFalsy();
    expect(wrapper.text()).toContain("exceed");
    expect(wrapper.text()).toContain("15 MB limit");
  });

  it("shows drag-active text when dragging over", async () => {
    const wrapper = mount(DropZone);
    // The dragover handler is on the inner div (the dashed-border drop area)
    const dropArea = wrapper
      .findAll("div")
      .find((d) => d.classes().some((c) => c.includes("border-dashed")))!;
    await dropArea.trigger("dragenter");
    expect(wrapper.text()).toContain(
      "Drop your PDF, Word, PowerPoint, or Excel files here",
    );
  });

  it("emits file-selected for a valid .pptx", async () => {
    const wrapper = mount(DropZone);
    const file = new File(["pptx"], "deck.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, "files", {
      value: [file],
      writable: true,
    });
    await input.trigger("change");
    expect(wrapper.emitted("file-selected")).toBeTruthy();
    expect(wrapper.emitted("file-selected")![0][0]).toEqual(file);
  });

  it("emits file-selected for a valid .xlsx", async () => {
    const wrapper = mount(DropZone);
    const file = new File(["xlsx"], "budget.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, "files", {
      value: [file],
      writable: true,
    });
    await input.trigger("change");
    expect(wrapper.emitted("file-selected")).toBeTruthy();
  });

  it("advertises the pptx and xlsx MIME types in the accept attr", () => {
    const wrapper = mount(DropZone);
    const accept = wrapper.find('input[type="file"]').attributes("accept")!;
    expect(accept).toContain(".pptx");
    expect(accept).toContain(".xlsx");
    expect(accept).toContain(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(accept).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("rejects .pptx and drops it from copy when pptxEnabled is false", async () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      public: { docxEnabled: true, pptxEnabled: false, xlsxEnabled: true },
    }));
    try {
      const wrapper = mount(DropZone);
      expect(
        wrapper.find('input[type="file"]').attributes("accept"),
      ).not.toContain("presentationml");
      expect(wrapper.text()).toContain(
        "Drop PDF, Word, or Excel files here",
      );
      const file = new File(["pptx"], "deck.pptx", {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
      const input = wrapper.find('input[type="file"]');
      Object.defineProperty(input.element, "files", {
        value: [file],
        writable: true,
      });
      await input.trigger("change");
      expect(wrapper.emitted("file-selected")).toBeFalsy();
      expect(wrapper.text()).toContain(
        "Please select PDF, Word (.docx), or Excel (.xlsx) files",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects .xlsx when xlsxEnabled is false", async () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      public: { docxEnabled: true, pptxEnabled: true, xlsxEnabled: false },
    }));
    try {
      const wrapper = mount(DropZone);
      const file = new File(["xlsx"], "budget.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const input = wrapper.find('input[type="file"]');
      Object.defineProperty(input.element, "files", {
        value: [file],
        writable: true,
      });
      await input.trigger("change");
      expect(wrapper.emitted("file-selected")).toBeFalsy();
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("does not throw when a stored report's conformance lacks failures/notAssessed arrays", () => {
    // The public /report/:id page renders attacker-controlled stored JSON. A
    // forged report with a conformance object missing its arrays must not
    // crash SSR (reading .length of undefined) — same class as the malformed
    // categories/findings guard.
    expect(() =>
      mount(ScoreCard, {
        props: {
          result: {
            ...baseResult,
            conformance: { status: "fail", headline: "x" } as any,
          },
        },
      }),
    ).not.toThrow();
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

  it("hides the filename and page-count line when showFilename is false", () => {
    // The prominent ReportFileBanner now carries the filename above the card,
    // so the page passes showFilename: false to avoid duplicating it here.
    const wrapper = mount(ScoreCard, {
      props: { result: baseResult, showFilename: false },
    });
    expect(wrapper.text()).not.toContain("test-report.pdf");
    expect(wrapper.text()).not.toContain("12 pages");
    // The grade/score still render — only the filename line is suppressed.
    expect(wrapper.text()).toContain("87");
  });

  it("renders the executive summary", () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } });
    expect(wrapper.text()).toContain("Overall the document is in good shape.");
  });

  it("renders the grade label text", () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } });
    expect(wrapper.text()).toContain("Good");
  });

  it("does not render any score-profile toggle (single Strict view as of v1.21+)", () => {
    const wrapper = mount(ScoreCard, {
      props: {
        result: {
          ...baseResult,
          scoreProfiles: {
            strict: {
              label: "Strict semantic score",
              overallScore: 66,
              grade: "D",
              executiveSummary: "Strict summary",
            },
            remediation: {
              label: "Practical readiness score (alias)",
              overallScore: 66,
              grade: "D",
              executiveSummary: "Strict summary",
            },
          },
        },
      },
    });

    expect(wrapper.find('[data-testid="score-mode-strict"]').exists()).toBe(false);
    expect(
      wrapper.find('[data-testid="score-mode-remediation"]').exists(),
    ).toBe(false);
    expect(
      wrapper.find('[data-testid="mode-recommendation-title"]').exists(),
    ).toBe(false);
    expect(
      wrapper.find('[data-testid="practical-disclaimer"]').exists(),
    ).toBe(false);
  });

  it("prefers the strict profile overall score when scoreProfiles.strict is provided", () => {
    const wrapper = mount(ScoreCard, {
      props: {
        result: {
          ...baseResult,
          overallScore: 87,
          grade: "B",
          executiveSummary: "Top-level summary",
          scoreProfiles: {
            strict: {
              label: "Strict semantic score",
              overallScore: 66,
              grade: "D",
              executiveSummary: "Strict-profile summary",
            },
            remediation: {
              label: "alias of strict",
              overallScore: 66,
              grade: "D",
              executiveSummary: "Strict-profile summary",
            },
          },
        },
      },
    });

    expect(wrapper.text()).toContain("66");
    expect(wrapper.text()).toContain("Poor");
    expect(wrapper.text()).toContain("Strict-profile summary");
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

  it.each([
    { fileType: "docx", app: "Word" },
    { fileType: "pptx", app: "PowerPoint" },
    { fileType: "xlsx", app: "Excel" },
  ])(
    "points $fileType results at $app's built-in Accessibility Checker",
    ({ fileType, app }) => {
      const wrapper = mount(ScoreCard, {
        props: { result: { ...baseResult, fileType } },
      });
      expect(wrapper.text()).toContain(`${app}'s built-in`);
      expect(wrapper.text()).toContain(
        `Because this ${app} file is the source document`,
      );
      expect(wrapper.text()).not.toContain("Adobe Acrobat");
    },
  );

  it("keeps the Acrobat caveat for PDF results", () => {
    const wrapper = mount(ScoreCard, {
      props: { result: { ...baseResult, fileType: "pdf" } },
    });
    expect(wrapper.text()).toContain("Adobe Acrobat's Accessibility Checker");
  });

  it("names the source app in the warning-tone conformance fix path", () => {
    const wrapper = mount(ScoreCard, {
      props: {
        result: {
          ...baseResult,
          grade: "F",
          overallScore: 20,
          fileType: "pptx",
          conformance: {
            status: "fail",
            headline: "Confirmed failures found.",
            failures: [
              {
                sc: "1.1.1",
                name: "Non-text Content",
                level: "A",
                category: "alt_text",
                issue: "2 images have no alt text",
                url: "https://example.org",
              },
            ],
            notAssessed: [],
          },
        },
      },
    });
    expect(wrapper.text()).toContain(
      "fix the issues directly in PowerPoint (Review → Check Accessibility)",
    );
  });
});

// ---------------------------------------------------------------------------
describe("ProcessingOverlay", () => {
  it("renders the spinner element", () => {
    const wrapper = mount(ProcessingOverlay, {
      props: { stage: "Uploading..." },
    });
    const spinner = wrapper.find(".animate-spin");
    expect(spinner.exists()).toBe(true);
  });

  it('shows the static "Analyzing your document" heading', () => {
    const wrapper = mount(ProcessingOverlay, {
      props: { stage: "Uploading..." },
    });
    expect(wrapper.text()).toContain("Analyzing your document");
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
