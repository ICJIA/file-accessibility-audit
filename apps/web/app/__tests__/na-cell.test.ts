import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import NaCell from "../components/NaCell.vue";

describe("NaCell — accessible Not-applicable / Not-assessed cell", () => {
  it("renders the 'Not assessed' label, an info button, and a role=tooltip describing the reason", () => {
    const wrapper = mount(NaCell, {
      props: { catId: "reading_order", notAssessed: true },
    });

    expect(wrapper.text()).toContain("Not assessed");

    const btn = wrapper.get("button");
    expect(btn.attributes("aria-describedby")).toBe("na-tooltip-reading_order");
    expect(btn.attributes("aria-label")).toContain("reading order");

    const tip = wrapper.get('[role="tooltip"]');
    expect(tip.attributes("id")).toBe("na-tooltip-reading_order");
    expect(tip.text()).toContain("per-page MCID fidelity check");
  });

  it("returns the color-contrast 'not assessed' explanation", () => {
    const wrapper = mount(NaCell, {
      props: { catId: "color_contrast", notAssessed: true },
    });

    const tip = wrapper.get('[role="tooltip"]');
    expect(tip.text()).toContain("rendered-PDF contrast analysis is not yet implemented");
  });

  it("renders 'Not applicable' (not 'Not assessed') when a category genuinely does not apply", () => {
    const wrapper = mount(NaCell, {
      props: { catId: "bookmarks" },
    });

    expect(wrapper.text()).toContain("Not applicable");
    expect(wrapper.text()).not.toContain("Not assessed");

    const tip = wrapper.get('[role="tooltip"]');
    expect(tip.text()).toContain("10 or more pages");
  });
});
