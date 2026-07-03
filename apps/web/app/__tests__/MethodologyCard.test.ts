import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MethodologyCard from "../components/MethodologyCard.vue";

describe("MethodologyCard", () => {
  it("names the PDF toolchain by default", () => {
    const wrapper = mount(MethodologyCard);
    expect(wrapper.text()).toContain("QPDF");
    expect(wrapper.text()).toContain("PDF.js (Mozilla)");
    expect(wrapper.text()).toContain("Nine categories");
  });

  it("keeps the Word methodology for docx", () => {
    const wrapper = mount(MethodologyCard, { props: { fileType: "docx" } });
    expect(wrapper.text()).toContain("JSZip");
    expect(wrapper.text()).toContain("unzips the .docx (OOXML) package");
    expect(wrapper.text()).toContain("Eight categories");
    expect(wrapper.text()).not.toContain("QPDF");
  });

  it("describes the PowerPoint methodology for pptx", () => {
    const wrapper = mount(MethodologyCard, { props: { fileType: "pptx" } });
    expect(wrapper.text()).toContain("unzips the .pptx (OOXML) package");
    expect(wrapper.text()).toContain("the PowerPoint presentation's");
    expect(wrapper.text()).toContain("slide titles");
    expect(wrapper.text()).toContain(
      "Accessibility Checker rules for PowerPoint",
    );
    expect(wrapper.text()).not.toContain("QPDF");
  });

  it("describes the Excel methodology for xlsx", () => {
    const wrapper = mount(MethodologyCard, { props: { fileType: "xlsx" } });
    expect(wrapper.text()).toContain("unzips the .xlsx (OOXML) package");
    expect(wrapper.text()).toContain("the Excel workbook's");
    expect(wrapper.text()).toContain("sheet names");
    expect(wrapper.text()).toContain("no document-language property");
    expect(wrapper.text()).toContain("Accessibility Checker rules for Excel");
    expect(wrapper.text()).not.toContain("QPDF");
  });
});
