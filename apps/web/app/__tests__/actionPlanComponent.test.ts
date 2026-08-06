import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ActionPlan from "../components/ActionPlan.vue";
import type { PlanStep } from "../utils/actionPlan";

const step = (rank: number, categoryId: string, severity: PlanStep["severity"]): PlanStep => ({
  rank,
  categoryId,
  title: `Fix ${categoryId}`,
  why: `Why ${categoryId}`,
  severity,
  wcagRefs: [{ sc: "1.1.1", name: "Non-text Content" }],
  routes: [
    { tool: "source", label: "Easiest — fix the source document, then re-export", steps: ["Open Word", "Re-export"] },
    { tool: "acrobat", label: "No source file? Fix the PDF in Acrobat", steps: ["Autotag"] },
  ],
  detailAnchor: `#cat-${categoryId}`,
});

describe("ActionPlan", () => {
  it("renders numbered steps in order with the first expanded, rest collapsed", () => {
    const w = mount(ActionPlan, {
      props: { steps: [step(1, "text_extractability", "Critical"), step(2, "alt_text", "Moderate")] },
    });
    const toggles = w.findAll("button[aria-expanded]");
    expect(toggles[0]!.attributes("aria-expanded")).toBe("true");
    expect(toggles[1]!.attributes("aria-expanded")).toBe("false");
    // Both bodies exist in the DOM (v-show, for print/export) — the second is hidden.
    const bodies = w.findAll(".plan-step-body");
    expect(bodies.length).toBe(2);
    // happy-dom + vue-test-utils isVisible() can't see v-show's inline display,
    // so assert the mechanism v-show actually uses: the style attribute.
    expect(bodies[0]!.attributes("style") ?? "").not.toContain("display: none");
    expect(bodies[1]!.attributes("style") ?? "").toContain("display: none");
  });

  it("shows both routes and the why-line in an expanded step", () => {
    const w = mount(ActionPlan, { props: { steps: [step(1, "alt_text", "Critical")] } });
    expect(w.text()).toContain("Why alt_text");
    expect(w.text()).toContain("Easiest — fix the source document");
    expect(w.text()).toContain("No source file? Fix the PDF in Acrobat");
    expect(w.text()).toContain("WCAG 1.1.1");
  });

  it("expands a collapsed step on click", async () => {
    const w = mount(ActionPlan, {
      props: { steps: [step(1, "a", "Critical"), step(2, "b", "Minor")] },
    });
    // Step 1 is open initially, step 2 is closed.
    // Click step 2 to open it — step 1 should close (exclusive accordion).
    await w.findAll("button[aria-expanded]")[1]!.trigger("click");
    expect(w.findAll(".plan-step-body")[1]!.attributes("style") ?? "").not.toContain("display: none");
    // Step 1 is now closed, step 2 is open.
    expect(w.findAll(".plan-step-body")[0]!.attributes("style") ?? "").toContain("display: none");
    // Verify aria-expanded reflects exclusive state.
    expect(w.findAll("button[aria-expanded]")[0]!.attributes("aria-expanded")).toBe("false");
    expect(w.findAll("button[aria-expanded]")[1]!.attributes("aria-expanded")).toBe("true");
  });

  it("closes the open step when clicked again", async () => {
    const w = mount(ActionPlan, {
      props: { steps: [step(1, "a", "Critical"), step(2, "b", "Minor")] },
    });
    // Step 1 is open initially.
    expect(w.findAll(".plan-step-body")[0]!.attributes("style") ?? "").not.toContain("display: none");
    // Click step 1 again to close it.
    await w.findAll("button[aria-expanded]")[0]!.trigger("click");
    // Both steps are now closed.
    expect(w.findAll(".plan-step-body")[0]!.attributes("style") ?? "").toContain("display: none");
    expect(w.findAll(".plan-step-body")[1]!.attributes("style") ?? "").toContain("display: none");
    // aria-expanded is false for both.
    expect(w.findAll("button[aria-expanded]")[0]!.attributes("aria-expanded")).toBe("false");
    expect(w.findAll("button[aria-expanded]")[1]!.attributes("aria-expanded")).toBe("false");
  });

  it("emits show-evidence with the category id", async () => {
    const w = mount(ActionPlan, { props: { steps: [step(1, "table_markup", "Moderate")] } });
    await w.find("[data-testid='evidence-link']").trigger("click");
    expect(w.emitted("show-evidence")![0]).toEqual(["table_markup"]);
  });

  it("subtitle counts the blocking steps", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [step(1, "a", "Critical"), step(2, "b", "Critical"), step(3, "c", "Minor")],
      },
    });
    expect(w.text()).toContain("3 fixes, in order.");
    expect(w.text()).toContain("№ 1–2 block publication");
  });

  it("empty plan renders the green pass card with the manual-review reminder", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [],
        conformance: {
          status: "no-automated-failures",
          headline: "h",
          failures: [],
          notAssessed: [
            { sc: "1.4.3", name: "Contrast (Minimum)", level: "AA", reason: "r", url: "https://w3.org" },
          ],
        },
      },
    });
    expect(w.find("[data-testid='plan-pass-card']").exists()).toBe(true);
    expect(w.text()).toContain("Nothing to fix");
    expect(w.text()).toContain("1.4.3");
  });
});
