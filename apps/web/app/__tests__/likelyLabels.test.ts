/**
 * Decision 2026-11-18 (4): a failure judged from how text looks is labelled
 * "Likely — please verify" where the failures are listed, and counted as
 * likely in the WCAG side of the two-standards strip.
 */
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScoreCard from "../components/ScoreCard.vue";
import TwoStandardsStrip from "../components/TwoStandardsStrip.vue";

const f = (sc: string, category: string, likely?: boolean) => ({
  sc,
  name: "Info and Relationships",
  level: "A" as const,
  category,
  issue: `issue ${category}`,
  url: "https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html",
  ...(likely ? { likely: true } : {}),
});
const verdict = (failures: ReturnType<typeof f>[]) => ({
  status: "fail" as const,
  failures,
  notAssessed: [],
  headline: "x",
});

describe("likely failures on screen", () => {
  it("the score card labels a likely failure and not a confirmed one", () => {
    const w = mount(ScoreCard, {
      props: {
        result: {
          filename: "a.docx",
          pageCount: 1,
          overallScore: 69,
          grade: "D",
          executiveSummary: "",
          categories: [
            { id: "heading_structure", label: "Headings", score: 0, severity: "Critical" },
          ] as never,
          conformance: verdict([
            f("2.4.2", "title_language"),
            f("1.3.1", "heading_structure", true),
          ]) as never,
          fileType: "docx",
        },
      },
    });
    const badges = w.findAll('[data-testid="likely-badge"]');
    expect(badges).toHaveLength(1);
    expect(badges[0]!.text()).toBe("Likely — please verify");
  });

  it("the strip says how many criteria are only likely", () => {
    const mixed = mount(TwoStandardsStrip, {
      props: {
        wcagVersion: "2.1",
        conformance: verdict([f("2.4.2", "t"), f("1.3.1", "h", true)]),
      } as never,
    });
    expect(mixed.text()).toMatch(/2 criteria failing.*\(1 likely — please verify\)/);
    const onlyLikely = mount(TwoStandardsStrip, {
      props: { wcagVersion: "2.1", conformance: verdict([f("1.3.1", "h", true)]) } as never,
    });
    expect(onlyLikely.text()).toMatch(/1 criterion failing — likely, please verify/);
  });
});
