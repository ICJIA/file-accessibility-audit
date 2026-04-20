import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import ModeCompareBox from "../components/ModeCompareBox.vue";

describe("ModeCompareBox — scores stay stable across mode toggles", () => {
  it("keeps strictScore and practicalScore pill values when selectedMode flips", async () => {
    const wrapper = mount(ModeCompareBox, {
      props: {
        categoryId: "pdf_ua_compliance",
        strictScore: null,
        strictGrade: null,
        practicalScore: 85,
        practicalGrade: "B",
        selectedMode: "remediation",
      },
    });

    const strictPill = wrapper.get('[data-testid="mode-compare-strict"]');
    const practicalPill = wrapper.get('[data-testid="mode-compare-practical"]');

    expect(strictPill.text()).toContain("N/A");
    expect(practicalPill.text()).toContain("85/100");

    // Click Strict pill → emits update:selectedMode=strict
    await strictPill.trigger("click");
    expect(wrapper.emitted("update:selectedMode")?.[0]).toEqual(["strict"]);

    // Simulate parent updating selectedMode
    await wrapper.setProps({ selectedMode: "strict" });

    // Pill scores must not have changed
    expect(wrapper.get('[data-testid="mode-compare-strict"]').text()).toContain("N/A");
    expect(wrapper.get('[data-testid="mode-compare-practical"]').text()).toContain("85/100");
  });
});
