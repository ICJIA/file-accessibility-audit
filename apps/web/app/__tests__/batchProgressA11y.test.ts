import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BatchProgress from "../components/BatchProgress.vue";
import DropZone from "../components/DropZone.vue";

// Review 2026-11-12, finding 8 (b) and (c): batch error / processing states
// were an icon alone, and drop-zone validation errors announced nothing.

const item = (status: string, over: Record<string, unknown> = {}) => ({
  id: status,
  filename: `${status}.pdf`,
  file: null,
  status,
  result: null,
  error: null,
  ...over,
});

describe("BatchProgress — every state is given in words", () => {
  const wrapper = mount(BatchProgress, {
    props: {
      items: [
        item("queued"),
        item("processing"),
        item("done", { result: { grade: "B" } }),
        item("error", { error: { error: "x" } }),
        item("cancelled"),
      ] as never,
    },
    global: { stubs: { UButton: true } },
  });
  const rows = wrapper.findAll(".w-full.max-w-md > div").map((r) => r.text());

  it("labels each row", () => {
    expect(rows[0]).toContain("Waiting");
    expect(rows[1]).toContain("Analyzing…");
    expect(rows[2]).toMatch(/Done, grade\s*B/);
    expect(rows[3]).toContain("Could not be analyzed");
    expect(rows[4]).toContain("Cancelled");
  });

  it("the failed label is visible text, not screen-reader-only", () => {
    const failed = wrapper.find('[data-testid="batch-item-failed"]');
    expect(failed.classes()).not.toContain("sr-only");
  });

  it("hides the decorative status icons from assistive technology", () => {
    for (const svg of wrapper.findAll("svg")) {
      expect(svg.element.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("announces the running count politely, as one sentence", () => {
    const status = wrapper.find('[data-testid="batch-status"]');
    expect(status.attributes()).toMatchObject({
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
    });
    expect(status.text()).toContain("Analyzing 5 files");
    expect(status.text()).toContain("3 of 5 complete");
  });
});

describe("DropZone — validation errors announce themselves", () => {
  it("an unsupported file produces a role=alert message", async () => {
    const wrapper = mount(DropZone);
    const input = wrapper.find('input[type="file"]');
    const bad = new File(["x"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(input.element, "files", { value: [bad], configurable: true });
    await input.trigger("change");
    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text().length).toBeGreaterThan(0);
  });
});
