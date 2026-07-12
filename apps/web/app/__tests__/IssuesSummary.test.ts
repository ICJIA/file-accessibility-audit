import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import IssuesSummary from "../components/IssuesSummary.vue";

const mkCat = (id: string, label: string, severity: string | null, findings: string[] = []) => ({
  id,
  label,
  severity,
  findings,
});

describe("IssuesSummary", () => {
  it("renders nothing when no Critical/Moderate/Minor categories present", () => {
    const wrapper = mount(IssuesSummary, {
      props: {
        categories: [mkCat("a", "Alpha", "Pass", ["ok"]), mkCat("b", "Beta", null, [])],
      },
    });
    expect(wrapper.text()).toBe("");
  });

  it("orders rows Critical, Moderate, Minor regardless of input order", () => {
    const wrapper = mount(IssuesSummary, {
      props: {
        categories: [
          mkCat("m1", "Reading Order", "Moderate", ["2 pages reorder columns"]),
          mkCat("c1", "Alt Text on Images", "Critical", ["5 images with no alt text"]),
          mkCat("mi1", "Bookmarks", "Minor", ["Some bookmarks missing"]),
          mkCat("c2", "Document Title", "Critical", ["Title metadata blank"]),
          mkCat("p1", "Bookmarks", "Pass", ["ok"]),
        ],
      },
    });
    const rows = wrapper.findAll("li");
    expect(rows.length).toBe(4);
    expect(rows[0]!.text()).toContain("Alt Text on Images");
    expect(rows[1]!.text()).toContain("Document Title");
    expect(rows[2]!.text()).toContain("Reading Order");
    expect(rows[3]!.text()).toContain("Bookmarks");
  });

  it("renders the first actionable finding as the row summary", () => {
    const wrapper = mount(IssuesSummary, {
      props: {
        categories: [
          mkCat("c1", "Alt Text on Images", "Critical", [
            "--- Detected images ---",
            "  Page 3: 200x150 figure",
            "Fix: add alt text in Acrobat",
            "5 images with no alt text",
          ]),
        ],
      },
    });
    expect(wrapper.find("li").text()).toContain("5 images with no alt text");
  });

  it("exposes a toggle button with aria-controls linking to the fix-steps region", () => {
    const wrapper = mount(IssuesSummary, {
      props: {
        categories: [mkCat("alt_text_images", "Alt Text", "Critical", ["x"])],
      },
    });
    const btn = wrapper.find("button");
    expect(btn.exists()).toBe(true);
    expect(btn.attributes("aria-controls")).toBe("fix-steps-alt_text_images");
    expect(btn.attributes("aria-expanded")).toBe("false");
  });

  it("excludes Pass and null severity categories", () => {
    const wrapper = mount(IssuesSummary, {
      props: {
        categories: [
          mkCat("p", "P", "Pass", ["x"]),
          mkCat("n", "N", null, ["x"]),
          mkCat("c", "C", "Critical", ["x"]),
        ],
      },
    });
    expect(wrapper.findAll("li").length).toBe(1);
  });
});
