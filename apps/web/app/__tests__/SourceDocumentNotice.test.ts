import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SourceDocumentNotice from "../components/SourceDocumentNotice.vue";

describe("SourceDocumentNotice", () => {
  it("keeps the PDF fallback framing by default", () => {
    const wrapper = mount(SourceDocumentNotice);
    expect(wrapper.text()).toContain("PDF remediation");
    expect(wrapper.text()).toContain("source document");
    expect(wrapper.text()).toContain("Adobe InDesign");
  });

  it("keeps the Word source framing for docx", () => {
    const wrapper = mount(SourceDocumentNotice, {
      props: { fileType: "docx" },
    });
    expect(wrapper.text()).toContain("A Word document is the source document");
    expect(wrapper.text()).toContain("fix it in Word, then re-check");
  });

  it("shows PowerPoint framing with slide-title and checker steps for pptx", () => {
    const wrapper = mount(SourceDocumentNotice, {
      props: { fileType: "pptx" },
    });
    expect(wrapper.text()).toContain(
      "A PowerPoint deck is the source document",
    );
    expect(wrapper.text()).toContain("fix it in PowerPoint, then re-check");
    expect(wrapper.text()).toContain("Check Accessibility");
    expect(wrapper.text()).toContain("Outline View");
    expect(wrapper.text()).toContain("Home → Layout");
    expect(wrapper.text()).not.toContain("Adobe InDesign");
  });

  it("shows Excel framing with Format-as-Table and sheet-rename steps for xlsx", () => {
    const wrapper = mount(SourceDocumentNotice, {
      props: { fileType: "xlsx" },
    });
    expect(wrapper.text()).toContain(
      "An Excel workbook is the source document",
    );
    expect(wrapper.text()).toContain("fix it in Excel, then re-check");
    expect(wrapper.text()).toContain("Format as Table");
    expect(wrapper.text()).toContain("Rename");
    expect(wrapper.text()).not.toContain("Adobe InDesign");
  });
});
