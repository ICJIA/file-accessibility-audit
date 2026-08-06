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

  it("defaults to visual", () => {
    const w = mount(Harness);
    expect(w.text()).toBe("visual");
  });

  it("applies a stored 'detailed' preference on mount", async () => {
    localStorage.setItem("far:report-view", "detailed");
    const w = mount(Harness);
    await nextTick();
    expect(w.text()).toBe("detailed");
  });

  it("ignores garbage stored values", async () => {
    localStorage.setItem("far:report-view", "bogus");
    const w = mount(Harness);
    await nextTick();
    expect(w.text()).toBe("visual");
  });

  it("setMode persists to localStorage", () => {
    const w = mount(Harness);
    (w.vm as unknown as { setMode: (m: string) => void }).setMode("detailed");
    expect(localStorage.getItem("far:report-view")).toBe("detailed");
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
