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

  it("hedges the inherits-structure claim — 'in most cases', never an absolute promise", () => {
    // User call (2026-08-15): "no remediation is needed" promised too much —
    // a well-structured source usually exports clean, but not always.
    const wrapper = mount(SourceDocumentNotice);
    expect(wrapper.text()).toContain("in most cases");
    expect(wrapper.text()).not.toContain("and no remediation is needed");
  });

  it("makes no absolute or unverifiable claims in any variant", () => {
    // Same pass, whole component: (1) a PDF inherits source structure only
    // when exported WITH tagging on — "any PDF you export … automatically"
    // overpromised; (2) Office's own checker does not find-and-fix "most"
    // issues — this product's whole automation-limit stance says otherwise;
    // (3) "#1 cause … we see here" asserts observed data this tool does not
    // collect.
    for (const fileType of ["pdf", "docx", "pptx", "xlsx"] as const) {
      const text = mount(SourceDocumentNotice, { props: { fileType } }).text();
      expect(text, fileType).not.toContain("inherits that structure automatically. There's no");
      expect(text, fileType).not.toContain("finds and fixes most issues");
      expect(text, fileType).not.toContain("#1 cause");
    }
    // The tagging condition is stated where the inherit claim is made.
    const docx = mount(SourceDocumentNotice, { props: { fileType: "docx" } }).text();
    expect(docx).toMatch(/tagging turned on/);
  });

  it("keeps the Word source framing for docx", () => {
    const wrapper = mount(SourceDocumentNotice, {
      props: { fileType: "docx" },
    });
    expect(wrapper.text()).toContain("A Word document is the source document");
    expect(wrapper.text()).toContain("fix it in Word, then re-check");
  });

  it("shows Word-specific tips (not the generic multi-app PDF list) for docx", () => {
    const wrapper = mount(SourceDocumentNotice, {
      props: { fileType: "docx" },
    });
    expect(wrapper.text()).toContain("Check Accessibility");
    expect(wrapper.text()).toContain("Heading");
    // Must not fall through to the generic PDF-source-app tips list, which
    // names other apps and PDF-export-specific advice irrelevant to a
    // directly-uploaded Word file.
    expect(wrapper.text()).not.toContain("Adobe InDesign");
    expect(wrapper.text()).not.toContain("Google Docs");
    expect(wrapper.text()).not.toContain("Apple Pages");
    expect(wrapper.text()).not.toContain("Create Tagged PDF");
  });

  it("shows PowerPoint framing with slide-title and checker steps for pptx", () => {
    const wrapper = mount(SourceDocumentNotice, {
      props: { fileType: "pptx" },
    });
    expect(wrapper.text()).toContain("A PowerPoint deck is the source document");
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
    expect(wrapper.text()).toContain("An Excel workbook is the source document");
    expect(wrapper.text()).toContain("fix it in Excel, then re-check");
    expect(wrapper.text()).toContain("Format as Table");
    expect(wrapper.text()).toContain("Rename");
    expect(wrapper.text()).not.toContain("Adobe InDesign");
  });
});
