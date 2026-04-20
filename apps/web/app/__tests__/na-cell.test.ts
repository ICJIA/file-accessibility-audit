import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import NaCell from "../components/NaCell.vue";

describe("NaCell — accessible N/A tooltip", () => {
  it("renders N/A text, an info button, and a role=tooltip describing the reason", () => {
    const wrapper = mount(NaCell, {
      props: { catId: "pdf_ua_compliance", mode: "strict" },
    });

    expect(wrapper.text()).toContain("N/A");

    const btn = wrapper.get("button");
    expect(btn.attributes("aria-describedby")).toBe(
      "na-tooltip-pdf_ua_compliance",
    );
    expect(btn.attributes("aria-label")).toContain("pdf ua compliance");
    expect(btn.attributes("aria-label")).toContain(
      "Strict does not include a PDF/UA category",
    );

    const tip = wrapper.get('[role="tooltip"]');
    expect(tip.attributes("id")).toBe("na-tooltip-pdf_ua_compliance");
    expect(tip.text()).toContain(
      "Strict does not include a PDF/UA category",
    );
  });

  it("returns the reading-order fallback reason under Strict (when MCIDs don't overlap)", () => {
    const wrapper = mount(NaCell, {
      props: { catId: "reading_order", mode: "strict" },
    });

    const tip = wrapper.get('[role="tooltip"]');
    expect(tip.text()).toContain("per-page MCID fidelity check");
    expect(tip.text()).toContain("Acrobat's Order panel or PAC");
  });

  it("returns the color-contrast explanation (same in both modes)", () => {
    const wrapper = mount(NaCell, {
      props: { catId: "color_contrast", mode: "remediation" },
    });

    const tip = wrapper.get('[role="tooltip"]');
    expect(tip.text()).toContain(
      "Rendered-PDF color-contrast analysis is not yet implemented",
    );
  });
});
