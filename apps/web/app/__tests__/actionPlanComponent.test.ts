import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ActionPlan from "../components/ActionPlan.vue";
import type { PlanStep } from "../utils/actionPlan";
import { FIX_STEPS_VERSION_NOTE } from "../utils/fixStepVersions";

const step = (rank: number, categoryId: string, severity: PlanStep["severity"]): PlanStep => ({
  rank,
  categoryId,
  title: `Fix ${categoryId}`,
  why: `Why ${categoryId}`,
  severity,
  wcagRefs: [{ sc: "1.1.1", name: "Non-text Content" }],
  routes: [
    {
      tool: "source",
      label: "Easiest — fix the source document, then re-export",
      steps: ["Open Word", "Re-export"],
    },
    { tool: "acrobat", label: "No source file? Fix the PDF in Acrobat", steps: ["Autotag"] },
  ],
  detailAnchor: `#cat-${categoryId}`,
});

describe("ActionPlan", () => {
  it("renders numbered steps in order with the first expanded, rest collapsed", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [step(1, "text_extractability", "Critical"), step(2, "alt_text", "Moderate")],
      },
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
    expect(w.findAll(".plan-step-body")[1]!.attributes("style") ?? "").not.toContain(
      "display: none",
    );
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
    expect(w.findAll(".plan-step-body")[0]!.attributes("style") ?? "").not.toContain(
      "display: none",
    );
    // Click step 1 again to close it.
    await w.findAll("button[aria-expanded]")[0]!.trigger("click");
    // Both steps are now closed.
    expect(w.findAll(".plan-step-body")[0]!.attributes("style") ?? "").toContain("display: none");
    expect(w.findAll(".plan-step-body")[1]!.attributes("style") ?? "").toContain("display: none");
    // aria-expanded is false for both.
    expect(w.findAll("button[aria-expanded]")[0]!.attributes("aria-expanded")).toBe("false");
    expect(w.findAll("button[aria-expanded]")[1]!.attributes("aria-expanded")).toBe("false");
  });

  it("re-seeds the open step when the steps prop changes identity (e.g., switching batch tabs)", async () => {
    // index.vue swaps `result` (and therefore `steps`) per active batch tab
    // WITHOUT remounting ActionPlan — openId must re-seed to the new list's
    // first step rather than staying stuck on a stale/arbitrary category id.
    const w = mount(ActionPlan, {
      props: { steps: [step(1, "a", "Critical"), step(2, "b", "Minor")] },
    });
    // Open step B (closing step A, exclusive accordion).
    await w.findAll("button[aria-expanded]")[1]!.trigger("click");
    expect(w.findAll("button[aria-expanded]")[1]!.attributes("aria-expanded")).toBe("true");

    // Swap in an entirely new steps array — a different batch tab's plan.
    await w.setProps({ steps: [step(1, "c", "Critical"), step(2, "d", "Moderate")] });

    const toggles = w.findAll("button[aria-expanded]");
    expect(toggles[0]!.attributes("aria-expanded")).toBe("true");
    expect(toggles[1]!.attributes("aria-expanded")).toBe("false");
    const bodies = w.findAll(".plan-step-body");
    expect(bodies[0]!.attributes("style") ?? "").not.toContain("display: none");
    expect(bodies[1]!.attributes("style") ?? "").toContain("display: none");
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

  it("empty plan hands off to the manual-review list instead of dumping SC numbers", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [],
        conformance: {
          status: "no-automated-failures",
          headline: "h",
          failures: [],
          notAssessed: [
            {
              sc: "1.4.3",
              name: "Contrast (Minimum)",
              level: "AA",
              reason: "r",
              url: "https://w3.org",
            },
          ],
        },
      },
    });
    expect(w.find("[data-testid='plan-pass-card']").exists()).toBe(true);
    expect(w.text()).toContain("Nothing to fix");
    // Was `toContain("1.4.3")`. A list of bare criterion numbers told a
    // document author nothing they could act on, and it was the only thing a
    // perfect report had left to say. ManualReviewCard now sits directly
    // below and names each criterion with a link, so this card's job is to
    // point at it — and to deny the "100 means done" reading outright.
    expect(w.text()).not.toContain("1.4.3");
    expect(w.text()).toContain("Still worth checking by hand");
    expect(w.text()).toContain("not the same as being accessible");
  });

  // Wiring rule: every surface that shows fix steps must also say which
  // Word/Acrobat versions the steps are written for, and who to call when
  // the menus don't match (a real user on an older Acrobat couldn't find
  // the menu items and had no way to know why).
  it("renders the version note + IDS support line inside each step card", () => {
    const w = mount(ActionPlan, { props: { steps: [step(1, "alt_text", "Critical")] } });
    expect(w.text()).toContain(FIX_STEPS_VERSION_NOTE);
    expect(w.text()).toContain("contact IDS at ICJIA");
  });

  it("does not render the version note on the nothing-to-fix pass card", () => {
    const w = mount(ActionPlan, { props: { steps: [] } });
    expect(w.text()).not.toContain("contact IDS at ICJIA");
  });
});
