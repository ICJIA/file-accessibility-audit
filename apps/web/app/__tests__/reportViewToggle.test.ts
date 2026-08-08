import "./test-helpers";
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import ReportViewToggle from "../components/ReportViewToggle.vue";
import { useReportView } from "../composables/useReportView";

beforeEach(() => localStorage.clear());

describe("useReportView", () => {
  const Harness = defineComponent({
    setup() {
      const { mode, setMode } = useReportView();
      return { mode, setMode };
    },
    render() {
      return h("div", this.mode);
    },
  });

  // The view preference used to persist per device, so anyone who once opened
  // the Detailed view got it for every report thereafter. That surfaced as
  // "the stepper is gone": a reader who had toggled to Detailed days earlier
  // met the technical view on a fresh report, and since the Detailed view has
  // never contained the action plan, the plan looked deleted.
  //
  // Everyone now starts on Visual, every time — including people who prefer
  // the detailed view and know where the toggle is. The cost of being wrong
  // is asymmetric: showing the stepper to someone who wanted detail costs one
  // click; hiding it from someone who needed it costs them the guidance.

  it("defaults to visual", () => {
    const w = mount(Harness);
    expect(w.text()).toBe("visual");
  });

  it("starts on visual even when a previous preference is stored", async () => {
    // The load-bearing assertion. This is the exact state a returning reader
    // was in when they reported the stepper missing.
    localStorage.setItem("far:report-view", "detailed");
    const w = mount(Harness);
    await nextTick();
    expect(w.text()).toBe("visual");
  });

  it("clears the legacy key so it cannot linger on a device", async () => {
    localStorage.setItem("far:report-view", "detailed");
    mount(Harness);
    await nextTick();
    expect(localStorage.getItem("far:report-view")).toBeNull();
  });

  it("setMode switches the current report without persisting anything", () => {
    const w = mount(Harness);
    (w.vm as unknown as { setMode: (m: string) => void }).setMode("detailed");
    expect(localStorage.getItem("far:report-view")).toBeNull();
  });

  it("still switches the view for the report in front of you", async () => {
    const w = mount(Harness);
    (w.vm as unknown as { setMode: (m: string) => void }).setMode("detailed");
    await nextTick();
    expect(w.text()).toBe("detailed");
  });
});

describe("ReportViewToggle", () => {
  it("marks the active mode with aria-pressed and is excluded from exports", async () => {
    const w = mount(ReportViewToggle, { props: { modelValue: "visual" } });
    expect(w.attributes("data-export-exclude")).toBeDefined();
    const [visualBtn, detailedBtn] = w.findAll("button");
    expect(visualBtn!.attributes("aria-pressed")).toBe("true");
    expect(detailedBtn!.attributes("aria-pressed")).toBe("false");
    await detailedBtn!.trigger("click");
    expect(w.emitted("update:modelValue")![0]).toEqual(["detailed"]);
  });

  it("labels both options in plain words", () => {
    const w = mount(ReportViewToggle, { props: { modelValue: "visual" } });
    expect(w.text()).toContain("Visual");
    expect(w.text()).toContain("Detailed");
  });
});

describe("ReportViewToggle — findable, not just present", () => {
  // The toggle was two text-xs labels in a small right-aligned strip, and a
  // reader looking for the step-by-step plan could not find the control that
  // shows it — they reported the plan as gone. A toggle nobody sees is not a
  // toggle; it is a hidden setting. These pin the properties that make it
  // findable, since "it renders" was already true when it was being missed.

  it("asks its own question, so the control explains itself", () => {
    const w = mount(ReportViewToggle, { props: { modelValue: "visual" } });
    expect(w.text()).toContain("How do you want to read this report?");
  });

  it("says what each view actually gives you", () => {
    const w = mount(ReportViewToggle, { props: { modelValue: "visual" } });
    // Naming the numbered plan is the point: it is what the reader was
    // looking for and could not find.
    expect(w.text()).toMatch(/numbered plan/i);
    expect(w.text()).toMatch(/full technical report/i);
  });

  it("marks the active view in WORDS, not colour alone", () => {
    // 1.4.1 Use of Colour. Colour is not available to every reader, and this
    // is an accessibility tool — the state has to survive without it.
    const visual = mount(ReportViewToggle, { props: { modelValue: "visual" } });
    const [vBtn, dBtn] = visual.findAll("button");
    expect(vBtn!.text()).toContain("Showing");
    expect(dBtn!.text()).not.toContain("Showing");

    const detailed = mount(ReportViewToggle, { props: { modelValue: "detailed" } });
    const [vBtn2, dBtn2] = detailed.findAll("button");
    expect(vBtn2!.text()).not.toContain("Showing");
    expect(dBtn2!.text()).toContain("Showing");
  });

  it("keeps both options as real buttons with an accessible group name", () => {
    const w = mount(ReportViewToggle, { props: { modelValue: "visual" } });
    expect(w.findAll("button").length).toBe(2);
    expect(w.find('[role="group"]').attributes("aria-label")).toBe("Report view");
  });

  it("hides the decorative glyphs from assistive technology", () => {
    // They repeat what the titles already say; announcing them would be noise.
    const w = mount(ReportViewToggle, { props: { modelValue: "visual" } });
    for (const svg of w.findAll("svg")) {
      expect(svg.element.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });
});
