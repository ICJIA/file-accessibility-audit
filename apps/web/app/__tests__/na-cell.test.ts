import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import NaCell from "../components/NaCell.vue";

describe("NaCell — accessible N/A tooltip", () => {
  it("renders N/A text, an info button, and a role=tooltip describing the reason", () => {
    const wrapper = mount(NaCell, {
      props: { catId: "reading_order" },
    });

    expect(wrapper.text()).toContain("N/A");

    const btn = wrapper.get("button");
    expect(btn.attributes("aria-describedby")).toBe(
      "na-tooltip-reading_order",
    );
    expect(btn.attributes("aria-label")).toContain("reading order");

    const tip = wrapper.get('[role="tooltip"]');
    expect(tip.attributes("id")).toBe("na-tooltip-reading_order");
    expect(tip.text()).toContain("per-page MCID fidelity check");
  });

  it("returns the color-contrast explanation", () => {
    const wrapper = mount(NaCell, {
      props: { catId: "color_contrast" },
    });

    const tip = wrapper.get('[role="tooltip"]');
    expect(tip.text()).toContain(
      "Rendered-PDF color-contrast analysis is not yet implemented",
    );
  });

  it("returns the bookmarks-too-short explanation for short documents", () => {
    const wrapper = mount(NaCell, {
      props: { catId: "bookmarks" },
    });

    const tip = wrapper.get('[role="tooltip"]');
    expect(tip.text()).toContain("10 or more pages");
  });
});
