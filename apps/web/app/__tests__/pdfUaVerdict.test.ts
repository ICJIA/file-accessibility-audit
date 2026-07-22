import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PdfUaVerdict from "../components/PdfUaVerdict.vue";

const base = {
  available: true,
  passed: false,
  profile: "ua1",
  totalFailureCount: 2,
  failures: [
    { ruleId: "7.1-1", clause: "7.1", description: "Structure element missing", count: 2 },
  ],
};

describe("PdfUaVerdict.vue", () => {
  it("renders nothing when veraPDF is unavailable", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: { ...base, available: false } } });
    expect(w.text()).toBe("");
  });
  it("shows a Fail badge and never the bare word Conformant", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: base } });
    expect(w.text()).toMatch(/PDF\/UA-1 machine checks/i);
    expect(w.text()).toMatch(/Fail/);
    expect(w.text()).not.toMatch(/\bConformant\b/);
    expect(w.text()).toMatch(/manual review/i);
  });
  it("hides failed checkpoints by default (collapsed)", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: base } });
    expect(w.text()).not.toContain("Structure element missing");
  });
  it("lists failed checkpoints (clause, description, count) after expanding", async () => {
    const w = mount(PdfUaVerdict, { props: { verdict: base } });
    await w.find("button").trigger("click");
    expect(w.text()).toContain("7.1");
    expect(w.text()).toContain("Structure element missing");
    expect(w.text()).toContain("2");
  });
  it("shows ruleId when clause is only a coarse string-prefix, not a true '<clause>-' match (regression)", async () => {
    const w = mount(PdfUaVerdict, {
      props: {
        verdict: {
          ...base,
          failures: [
            { ruleId: "7.1-3", clause: "7", description: "Unrelated checkpoint", count: 1 },
          ],
        },
      },
    });
    await w.find("button").trigger("click");
    expect(w.text()).toContain("7.1-3");
  });
  it("shows a Pass badge with no checkpoint list when passed", () => {
    const w = mount(PdfUaVerdict, {
      props: { verdict: { ...base, passed: true, totalFailureCount: 0, failures: [] } },
    });
    expect(w.text()).toMatch(/Pass/);
  });
  it("shows a neutral 'Could not validate' state when veraPDF errored, never a Fail verdict", () => {
    const w = mount(PdfUaVerdict, {
      props: {
        verdict: {
          available: true,
          passed: false,
          profile: "ua1",
          error: "veraPDF timed out",
          totalFailureCount: 0,
          failures: [],
        },
      },
    });
    expect(w.text()).toMatch(/could not validate/i);
    expect(w.text()).toContain("veraPDF timed out");
    expect(w.text()).not.toMatch(/\b(Pass|Fail)\b/);
    expect(w.find("button").exists()).toBe(false);
  });
});
