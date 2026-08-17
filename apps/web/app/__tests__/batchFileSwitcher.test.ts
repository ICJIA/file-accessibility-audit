/**
 * Tests for BatchFileSwitcher — the multi-file report switcher.
 *
 * History: after a batch finished, the switcher was a thin strip of small
 * muted-text buttons; the INACTIVE tab rendered as near-invisible gray text
 * on a transparent gradient, so a user who dropped two files reported "I
 * don't see the second tab — only the first" (2026-08-17). The switcher is
 * now a scoreboard of real cards — grade ring, score, filename — where every
 * card, active or not, carries visible card chrome.
 */
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BatchFileSwitcher from "../components/BatchFileSwitcher.vue";

function makeItems() {
  return [
    {
      id: "batch-0",
      filename: "annual-report.pdf",
      status: "done" as const,
      result: { grade: "B", overallScore: 89 } as any,
      error: null,
    },
    {
      id: "batch-1",
      filename: "meeting-minutes.pdf",
      status: "done" as const,
      result: { grade: "A", overallScore: 100 } as any,
      error: null,
    },
    {
      id: "batch-2",
      filename: "broken.pdf",
      status: "error" as const,
      result: null,
      error: { error: "Analysis failed." } as any,
    },
  ];
}

function mountSwitcher(overrides: { activeIndex?: number } = {}) {
  return mount(BatchFileSwitcher, {
    props: {
      items: makeItems() as any,
      activeIndex: overrides.activeIndex ?? 0,
    },
  });
}

describe("BatchFileSwitcher", () => {
  it("renders one tab card per file inside an accessible tablist", () => {
    const wrapper = mountSwitcher();
    const tablist = wrapper.find('[role="tablist"]');
    expect(tablist.exists()).toBe(true);
    expect(tablist.attributes("aria-label")).toBe("3 file results");
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(3);
  });

  it("shows the grade letter and the score out of 100 on finished cards", () => {
    const wrapper = mountSwitcher();
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs[0]!.text()).toContain("annual-report.pdf");
    expect(tabs[0]!.text()).toContain("B");
    expect(tabs[0]!.text()).toContain("89");
    expect(tabs[0]!.text()).toContain("/100");
    expect(tabs[1]!.text()).toContain("100");
  });

  it("marks only the active card as selected", () => {
    const wrapper = mountSwitcher({ activeIndex: 1 });
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs[0]!.attributes("aria-selected")).toBe("false");
    expect(tabs[1]!.attributes("aria-selected")).toBe("true");
    expect(tabs[2]!.attributes("aria-selected")).toBe("false");
  });

  it("gives every card — active or not — the same visible card chrome", () => {
    // The regression this component exists to fix: the old inactive tab was
    // muted text on a transparent gradient, indistinguishable from disabled
    // chrome. Every card must carry the shared card class with real border
    // and surface.
    const wrapper = mountSwitcher();
    const tabs = wrapper.findAll('[role="tab"]');
    for (const tab of tabs) {
      expect(tab.classes()).toContain("batch-file-card");
    }
  });

  it("emits switch with the card's index on click", async () => {
    const wrapper = mountSwitcher();
    await wrapper.findAll('[role="tab"]')[1]!.trigger("click");
    expect(wrapper.emitted("switch")).toEqual([[1]]);
  });

  it("labels an errored file honestly instead of showing a grade", () => {
    const wrapper = mountSwitcher();
    const errorTab = wrapper.findAll('[role="tab"]')[2]!;
    expect(errorTab.text()).toContain("broken.pdf");
    expect(errorTab.text()).toContain("Couldn't analyze");
    expect(errorTab.text()).not.toContain("/100");
  });

  it("labels a cancelled file", () => {
    const items = makeItems();
    items[2] = { ...items[2]!, status: "cancelled" as any, error: null };
    const wrapper = mount(BatchFileSwitcher, {
      props: { items: items as any, activeIndex: 0 },
    });
    expect(wrapper.findAll('[role="tab"]')[2]!.text()).toContain("Cancelled");
  });

  it("folds the completion message into the header instead of a separate banner", () => {
    const wrapper = mountSwitcher();
    expect(wrapper.text()).toContain("All 3 files processed");
    expect(wrapper.text()).toContain("select a file");
  });
});

describe("index page wiring", () => {
  // Test the WIRING, not just the logic: the component only helps if the
  // page actually renders it in place of the old strip + banner.
  it("index.vue renders BatchFileSwitcher and drops the old inline tab strip and banner", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(path.resolve(__dirname, "../pages/index.vue"), "utf-8");
    expect(source).toContain("<BatchFileSwitcher");
    expect(source).toContain('@switch="switchTab"');
    // The page no longer owns a tablist or the dismissible completion banner.
    expect(source).not.toContain('role="tablist"');
    expect(source).not.toContain("showBatchBanner");
  });
});
