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
  it("lists failed checkpoints with clause, description and count", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: base } });
    expect(w.text()).toContain("7.1");
    expect(w.text()).toContain("Structure element missing");
    expect(w.text()).toContain("2");
  });
  it("shows a Pass badge with no checkpoint list when passed", () => {
    const w = mount(PdfUaVerdict, {
      props: { verdict: { ...base, passed: true, totalFailureCount: 0, failures: [] } },
    });
    expect(w.text()).toMatch(/Pass/);
  });
});
