import "./test-helpers";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// ReportDownloadBar (Task F4) — replaces the 10 hand-duplicated download
// buttons across pages/index.vue ("cards" variant) and pages/report/[id].vue
// ("compact" variant). useReportExport is mocked so these tests exercise
// only the button wiring (labels, order, aria-labels, click → handler),
// not the real file-saver/DOM download side effects (which F5 removes
// file-saver from entirely).
// ---------------------------------------------------------------------------

const exportText = vi.fn();
const exportHtml = vi.fn();
const exportMarkdown = vi.fn();
const exportJSON = vi.fn();
const exportPdfViaBrowserPrint = vi.fn();

vi.mock("~/composables/useReportExport", () => ({
  useReportExport: () => ({
    exportText,
    exportHtml,
    exportMarkdown,
    exportJSON,
    exportPdfViaBrowserPrint,
  }),
}));

import { mount } from "@vue/test-utils";
import ReportDownloadBar from "../components/ReportDownloadBar.vue";

const result = { filename: "sample.pdf" } as any;

beforeEach(() => {
  exportText.mockReset();
  exportHtml.mockReset();
  exportMarkdown.mockReset();
  exportJSON.mockReset();
  exportPdfViaBrowserPrint.mockReset();
});

describe("ReportDownloadBar — cards variant (index.vue)", () => {
  it("renders the 5 buttons in the original order with the original labels", () => {
    const wrapper = mount(ReportDownloadBar, { props: { result } });
    const labels = wrapper.findAll("button").map((b) => b.text());
    expect(labels).toEqual([
      "Text (.txt)",
      "HTML (.html)",
      "Markdown (.md)",
      "JSON (.json)",
      "PDF (browser print)",
    ]);
  });

  it("every button gets a descriptive aria-label", () => {
    const wrapper = mount(ReportDownloadBar, { props: { result } });
    const buttons = wrapper.findAll("button");
    expect(buttons[0]!.attributes("aria-label")).toBe("Download report as plain text");
    expect(buttons[4]!.attributes("aria-label")).toBe("Print report to PDF");
  });

  it("clicking each button calls the matching useReportExport function with the result prop", async () => {
    const wrapper = mount(ReportDownloadBar, { props: { result } });
    const buttons = wrapper.findAll("button");

    await buttons[0]!.trigger("click");
    expect(exportText).toHaveBeenCalledWith(result);

    await buttons[1]!.trigger("click");
    expect(exportHtml).toHaveBeenCalledWith(result);

    await buttons[2]!.trigger("click");
    expect(exportMarkdown).toHaveBeenCalledWith(result);

    await buttons[3]!.trigger("click");
    expect(exportJSON).toHaveBeenCalledWith(result);

    await buttons[4]!.trigger("click");
    expect(exportPdfViaBrowserPrint).toHaveBeenCalledWith(result);
  });

  it("keeps the original (entity-quoted) PDF print-dialog title text", () => {
    const wrapper = mount(ReportDownloadBar, { props: { result } });
    const pdfButton = wrapper.findAll("button").at(-1)!;
    expect(pdfButton.attributes("title")).toContain("&quot;Save as PDF&quot;");
  });
});

describe("ReportDownloadBar — compact variant (report/[id].vue)", () => {
  it("renders the 5 buttons in the original order with the original (shorter) labels", () => {
    const wrapper = mount(ReportDownloadBar, { props: { result, variant: "compact" } });
    const labels = wrapper.findAll("button").map((b) => b.text());
    expect(labels).toEqual(["Text", "Markdown", "JSON", "HTML", "PDF"]);
  });

  it("clicking each button calls the matching useReportExport function with the result prop", async () => {
    const wrapper = mount(ReportDownloadBar, { props: { result, variant: "compact" } });
    const buttons = wrapper.findAll("button");

    await buttons[0]!.trigger("click");
    expect(exportText).toHaveBeenCalledWith(result);

    await buttons[1]!.trigger("click");
    expect(exportMarkdown).toHaveBeenCalledWith(result);

    await buttons[2]!.trigger("click");
    expect(exportJSON).toHaveBeenCalledWith(result);

    await buttons[3]!.trigger("click");
    expect(exportHtml).toHaveBeenCalledWith(result);

    await buttons[4]!.trigger("click");
    expect(exportPdfViaBrowserPrint).toHaveBeenCalledWith(result);
  });

  it("uses the plain (non-entity) PDF print-dialog title text", () => {
    const wrapper = mount(ReportDownloadBar, { props: { result, variant: "compact" } });
    const pdfButton = wrapper.findAll("button").at(-1)!;
    expect(pdfButton.attributes("title")).toBe(
      "Opens the browser print dialog — pick 'Save as PDF' as the destination.",
    );
  });

  it("uses the original border/background classes (not the cards-variant UButton stub)", () => {
    const wrapper = mount(ReportDownloadBar, { props: { result, variant: "compact" } });
    const firstButton = wrapper.find("button");
    expect(firstButton.classes()).toContain("border-[var(--border-input)]");
  });
});
