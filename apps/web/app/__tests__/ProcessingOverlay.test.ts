import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ProcessingOverlay from "../components/ProcessingOverlay.vue";

// ---------------------------------------------------------------------------
// ProcessingOverlay a11y (Task F6) — the evolving "stage" text ("Uploading…"
// → "Extracting PDF structure…" → "Building report…") must be announced to
// screen-reader users as it updates, the same live-region contract already
// used by RemediateButton.vue's busy-status line.
// ---------------------------------------------------------------------------

describe("ProcessingOverlay — live region", () => {
  it('the stage text is wrapped in role="status" aria-live="polite"', () => {
    const wrapper = mount(ProcessingOverlay, { props: { stage: "Uploading…" } });
    const status = wrapper.find('[role="status"]');
    expect(status.exists()).toBe(true);
    expect(status.attributes("aria-live")).toBe("polite");
    expect(status.text()).toContain("Uploading…");
  });

  it("announces an updated stage when the prop changes", async () => {
    const wrapper = mount(ProcessingOverlay, { props: { stage: "Uploading…" } });
    await wrapper.setProps({ stage: "Building report…" });
    const status = wrapper.find('[role="status"]');
    expect(status.text()).toContain("Building report…");
    expect(status.text()).not.toContain("Uploading…");
  });
});
