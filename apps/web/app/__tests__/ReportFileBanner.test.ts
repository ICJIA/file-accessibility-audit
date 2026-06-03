import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReportFileBanner from "../components/ReportFileBanner.vue";

describe("ReportFileBanner", () => {
  it("renders the filename prominently", () => {
    const wrapper = mount(ReportFileBanner, {
      props: { filename: "budget-report-2026.pdf", pageCount: 12 },
    });
    expect(wrapper.text()).toContain("budget-report-2026.pdf");
  });

  it("renders the eyebrow label", () => {
    const wrapper = mount(ReportFileBanner, {
      props: { filename: "a.pdf", pageCount: 12 },
    });
    expect(wrapper.text()).toContain("ACCESSIBILITY REPORT FOR");
  });

  it("renders the page count and PDF type", () => {
    const wrapper = mount(ReportFileBanner, {
      props: { filename: "a.pdf", pageCount: 12 },
    });
    expect(wrapper.text()).toContain("12 pages · PDF");
  });

  it("uses the singular 'page' for a one-page document", () => {
    const wrapper = mount(ReportFileBanner, {
      props: { filename: "a.pdf", pageCount: 1 },
    });
    expect(wrapper.text()).toContain("1 page · PDF");
    expect(wrapper.text()).not.toContain("1 pages");
  });

  it("shows a Scanned chip when isScanned is true", () => {
    const wrapper = mount(ReportFileBanner, {
      props: { filename: "a.pdf", pageCount: 3, isScanned: true },
    });
    expect(wrapper.text()).toContain("Scanned");
  });

  it("omits the Scanned chip by default", () => {
    const wrapper = mount(ReportFileBanner, {
      props: { filename: "a.pdf", pageCount: 3 },
    });
    expect(wrapper.text()).not.toContain("Scanned");
  });

  it("keeps a long filename intact (no truncation)", () => {
    const long =
      "2026-Q1-statewide-criminal-justice-information-authority-annual-accessibility-report-FINAL-v3.pdf";
    const wrapper = mount(ReportFileBanner, {
      props: { filename: long, pageCount: 48 },
    });
    expect(wrapper.text()).toContain(long);
  });
});
