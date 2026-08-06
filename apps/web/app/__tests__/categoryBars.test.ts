import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CategoryBars from "../components/CategoryBars.vue";

const cats = [
  { id: "text_extractability", label: "Text Extractability", score: 0, grade: "F", severity: "Critical" },
  { id: "alt_text", label: "Alt Text on Images", score: 70, grade: "C", severity: "Moderate" },
  { id: "bookmarks", label: "Bookmarks / Navigation", score: 100, grade: "A", severity: "Pass" },
  { id: "reading_order", label: "Reading Order", score: null, grade: null, severity: null, notAssessed: true },
  { id: "color_contrast", label: "Color Contrast", score: null, grade: null, severity: null },
];

describe("CategoryBars", () => {
  it("renders one bar row per scored category with score, grade AND severity (table parity)", () => {
    const w = mount(CategoryBars, { props: { categories: cats } });
    const rows = w.findAll("[data-testid='bar-row']");
    expect(rows.length).toBe(3);
    const alt = rows[1]!;
    expect(alt.text()).toContain("Alt Text on Images");
    expect(alt.text()).toContain("70");
    expect(alt.text()).toContain("C");
    expect(alt.text()).toContain("Moderate");
    const fill = alt.find("[data-testid='bar-fill']");
    expect(fill.attributes("style")).toContain("width: 70%");
  });

  it("gives every row a full-sentence aria-label", () => {
    const w = mount(CategoryBars, { props: { categories: cats } });
    expect(w.findAll("[data-testid='bar-row']")[0]!.attributes("aria-label")).toBe(
      "Text Extractability: 0 out of 100, grade F, severity Critical",
    );
  });

  it("lists N/A categories with their reason, distinguishing not-assessed from not-applicable", () => {
    const w = mount(CategoryBars, { props: { categories: cats } });
    const na = w.find("[data-testid='bars-na']");
    expect(na.text()).toContain("Reading Order");
    expect(na.text()).toContain("Not assessed");
    expect(na.text()).toContain("Color Contrast");
    expect(na.text()).toContain("Not applicable");
  });

  it("survives a malformed categories value", () => {
    const w = mount(CategoryBars, { props: { categories: "junk" as never } });
    expect(w.findAll("[data-testid='bar-row']").length).toBe(0);
  });
});
