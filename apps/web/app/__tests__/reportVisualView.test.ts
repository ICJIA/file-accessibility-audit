import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ReportVisualView from "../components/ReportVisualView.vue";
import ReportGradeHero from "../components/ReportGradeHero.vue";

const result = {
  filename: "report.pdf",
  pageCount: 12,
  overallScore: 62,
  grade: "D",
  isScanned: false,
  executiveSummary: "sum",
  fileType: "pdf",
  warnings: ["A warning line"],
  categories: [
    {
      id: "text_extractability",
      label: "Text Extractability",
      score: 0,
      grade: "F",
      severity: "Critical",
      findings: ["No text found"],
    },
    {
      id: "title_language",
      label: "Document Title & Language",
      score: 40,
      grade: "F",
      severity: "Moderate",
      findings: ["No title set"],
    },
    {
      id: "reading_order",
      label: "Reading Order",
      score: null,
      grade: null,
      severity: null,
      notAssessed: true,
    },
  ],
  conformance: {
    status: "fail",
    headline: "h",
    failures: [
      {
        sc: "1.3.1",
        name: "Info and Relationships",
        level: "A",
        category: "text_extractability",
        issue: "x",
        url: "https://w3.org",
      },
    ],
    notAssessed: [],
  },
};

describe("ReportVisualView", () => {
  it("renders hero, tiles, verdict, plan, bars, and technical expander — in that DOM order", () => {
    const w = mount(ReportVisualView, { props: { result } });
    const html = w.html();
    const order = [
      // Was html.indexOf("/100") — the hero's bare "80/100" line. v1.58.0
      // demoted that into a labelled "Fix progress ... 80 of 100" panel
      // (showing a raw score beside a severity-capped letter read as "D =
      // 80"), so "/100" now first matches inside the technical report far
      // below and the marker pointed at the wrong element. The hero's own
      // panel label is the stable anchor.
      html.indexOf("Fix progress"), // hero
      html.indexOf("severity-tile-critical"),
      html.indexOf("verdict-strip"),
      html.indexOf("Your action plan"),
      html.indexOf("Where the score comes from"),
      // NOT html.indexOf("technical-report") — VerdictStrip's fail-branch
      // renders href="#technical-report" (pinned by reportHeader.test.ts),
      // which is an earlier, unrelated match for that substring. Anchor to
      // the TechnicalReport section's own opening tag instead.
      html.indexOf('id="technical-report"'),
    ];
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("builds plan steps from the result (Critical first)", () => {
    const w = mount(ReportVisualView, { props: { result } });
    expect(w.text()).toContain("Make the text readable by screen readers");
    expect(w.text()).toContain("2 fixes, in order.");
  });

  it("wires failure-mode plan copy through: unembedded fonts on a tagged PDF get the font step", () => {
    // The ARI-fact-sheet shape (2026-08-15): text extracts, tags present,
    // fonts unembedded → Minor. The step must NOT read as the scanned-
    // document catastrophe.
    const fontsResult = {
      ...result,
      categories: [
        {
          id: "text_extractability",
          label: "Text Extractability",
          score: 85,
          grade: "B",
          severity: "Minor",
          findings: [
            "PDF contains extractable text",
            "Document is tagged (StructTreeRoot present)",
            "3 non-embedded font(s) may cause garbled text on systems without these fonts: ArialMT",
          ],
        },
      ],
    };
    const w = mount(ReportVisualView, { props: { result: fontsResult } });
    expect(w.text()).toContain("Embed the fonts");
    expect(w.text()).not.toContain("Make the text readable by screen readers");
    expect(w.text()).not.toContain("picture of text");
  });

  it("shows warnings and renders the notice slot", () => {
    const w = mount(ReportVisualView, {
      props: { result },
      slots: { notice: "<div data-testid='notice-slot'>notice</div>" },
    });
    expect(w.text()).toContain("A warning line");
    expect(w.find("[data-testid='notice-slot']").exists()).toBe(true);
  });

  it("evidence click opens the technical report and moves focus to the target category card", async () => {
    // attachTo: document.body (not a detached mount()) because happy-dom's
    // HTMLElement.focus() is a documented no-op for nodes that aren't
    // connected to `document` (see HTMLElementUtility.focus, which gates on
    // isConnected) — a detached tree could never show a focus change either
    // way, fix or no fix, so it wouldn't actually verify this behavior.
    const w = mount(ReportVisualView, { props: { result }, attachTo: document.body });
    // happy-dom + vue-test-utils isVisible() can't see v-show's inline display,
    // so assert the mechanism v-show actually uses: the style attribute
    // (pattern from actionPlanComponent.test.ts / technicalReport.test.ts).
    expect(w.find(".tech-report-body").attributes("style") ?? "").toContain("display: none");
    await w.find("[data-testid='evidence-link']").trigger("click");
    await flushPromises(); // flush revealEvidence's nextTick-scheduled scroll+focus
    expect(w.find(".tech-report-body").attributes("style") ?? "").not.toContain("display: none");

    // Keyboard/screen-reader users must land on the card the scroll sent
    // them to, not stay on the button they just left (revealEvidence in
    // ReportVisualView.vue; tabindex="-1" on ReportContent.vue's cat-<id>
    // cards is what makes them programmatically focusable at all).
    const target = document.getElementById("cat-text_extractability");
    expect(target).not.toBeNull();
    // Pinned explicitly (not just implied by the focus succeeding): happy-dom's
    // focus() only gates on isConnected/disabled/inert, not tabindex, so it
    // would silently move focus even onto a non-focusable div — a real
    // browser would not. This assertion is what actually pins the
    // tabindex="-1" markup in ReportContent.vue.
    expect(target?.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(target);

    w.unmount();
  });

  it("legacy report: hero grade/score come from scoreProfiles.strict, not a divergent top-level grade/score (Fix 4)", () => {
    // Pre-v1.21 stored reports can carry a top-level grade/score that
    // disagrees with scoreProfiles.strict — the Detailed view's ScoreCard has
    // always preferred strict; the Visual view must derive the hero the same
    // way so the two views can't disagree for the same shared report.
    const legacy = {
      ...result,
      grade: "C",
      overallScore: 77,
      scoreProfiles: {
        strict: { label: "Strict", overallScore: 95, grade: "A", executiveSummary: "strict sum" },
      },
    };
    const w = mount(ReportVisualView, { props: { result: legacy } });
    const hero = w.findComponent(ReportGradeHero);
    expect(hero.props("grade")).toBe("A");
    expect(hero.props("overallScore")).toBe(95);
  });

  it("page-audit-shaped report (no categories) → hero only, NEVER the pass card", () => {
    const pageAudit = {
      filename: "https://example.gov/news",
      overallScore: undefined,
      grade: "B",
      score: 74,
      violationCount: 12,
      bySeverity: { critical: 2, serious: 4, moderate: 5, minor: 1 },
    };
    const w = mount(ReportVisualView, { props: { result: pageAudit } });
    expect(w.text()).toContain("Good");
    expect(w.text()).toContain("74");
    expect(w.find("[data-testid='plan-pass-card']").exists()).toBe(false);
    expect(w.find("[data-testid^='severity-tile-']").exists()).toBe(false);
    expect(w.find("[data-testid='bar-row']").exists()).toBe(false);
    expect(w.find("#technical-report").exists()).toBe(false);
    expect(w.text()).not.toContain("Nothing to fix");
  });
});
