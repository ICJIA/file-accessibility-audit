import "./test-helpers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AutomationLimitBand from "../components/AutomationLimitBand.vue";
import ReportGradeHero from "../components/ReportGradeHero.vue";
import ScoreCard from "../components/ScoreCard.vue";
import { buildHtml } from "../utils/exportFormats/html";
import type { ReportResult, BrandingInfo } from "../utils/exportFormats/shared";

// Accessibility remediators keep repeating one sentence about tools like this:
// a 100 does not mean the document is accessible. It means the document
// handles the signals automated tests can measure — and the moment of maximum
// risk is exactly the high score, when a reader closes the tab satisfied.
// The ManualReviewCard says this in prose further down the page; this band
// says it AT the score, visually, where the celebration happens.
//
// Two hard rules inherited from the scoring rework (see gradeCapNote.test.ts):
// the band must never show a figure that could be read as the grade (no
// percentages, nothing out of 100), and it must appear beside every score
// display that meets the threshold — both heroes — or switching views
// contradicts itself.
//
// The threshold (user rule, 2026-08-14): the band shows for any grade over a
// 79 — A and B, the grades that LOOK done. Under the severity caps, 80+ means
// the worst finding is Minor or nothing, which is exactly when a reader
// closes the tab satisfied. A C/D/F report already leads with work to do; the
// ManualReviewCard still covers the human half there at every score.

const NOT_ASSESSED: Array<{
  sc: string;
  name: string;
  level: "A" | "AA";
  reason: string;
  url: string;
}> = [
  { sc: "1.4.3", name: "Contrast (Minimum)", level: "AA", reason: "r", url: "https://w3.org/x" },
  { sc: "1.4.1", name: "Use of Color", level: "A", reason: "r", url: "https://w3.org/x" },
  {
    sc: "1.3.3",
    name: "Sensory Characteristics",
    level: "A",
    reason: "r",
    url: "https://w3.org/x",
  },
];

describe("AutomationLimitBand — the score is not a guarantee", () => {
  it("says even a perfect score is not a guarantee, and names the screen reader", () => {
    const w = mount(AutomationLimitBand, { props: { grade: "A" } });
    const text = w.text();
    expect(text).toContain("Even a perfect score is not a guarantee");
    expect(text).toContain("signals automated tests can measure");
    expect(text).toContain("screen reader");
  });

  it("shows the two halves of the job in words, not color alone", () => {
    const w = mount(AutomationLimitBand, { props: { grade: "A" } });
    const text = w.text();
    expect(text).toContain("Automated checks");
    expect(text).toContain("Done — this score");
    expect(text).toContain("Human review");
    expect(text).toContain("Always still required");
  });

  it("reports the real count of criteria automation never examined", () => {
    const w = mount(AutomationLimitBand, { props: { grade: "A", notAssessedCount: 3 } });
    expect(w.text()).toContain("3 WCAG criteria on this document were never machine-checked");
  });

  it("uses the singular for a single unexamined criterion", () => {
    const w = mount(AutomationLimitBand, { props: { grade: "A", notAssessedCount: 1 } });
    expect(w.text()).toContain("1 WCAG criterion on this document was never machine-checked");
  });

  it("stays silent about the count when it is unknown", () => {
    // A forged shared report can omit conformance; claiming "0 criteria were
    // never machine-checked" would be an overclaim, the one thing this band
    // exists to prevent.
    const w = mount(AutomationLimitBand, { props: { grade: "A" } });
    expect(w.text()).not.toContain("machine-checked");
  });

  it("links to the manual checklist only where the checklist exists", () => {
    // The remediation page shows ScoreCards but no ManualReviewCard — an
    // anchor there would jump nowhere.
    const withLink = mount(AutomationLimitBand, { props: { grade: "A", linkManualReview: true } });
    expect(withLink.find('a[href="#manual-review-h"]').exists()).toBe(true);
    expect(withLink.text()).toContain("Still worth checking by hand");

    const withoutLink = mount(AutomationLimitBand, { props: { grade: "A" } });
    expect(withoutLink.find('a[href="#manual-review-h"]').exists()).toBe(false);
    expect(withoutLink.text()).toContain("a person");
  });

  it("never renders a figure that could be mistaken for the grade", () => {
    // v1.58.1's lesson: ANY figure out of 100 beside a letter grade is read
    // AS the grade, no matter its label. The band sits directly under the
    // score, so it may carry plain counts only.
    const w = mount(AutomationLimitBand, { props: { grade: "A", notAssessedCount: 7 } });
    const text = w.text();
    expect(text).not.toContain("%");
    expect(text).not.toContain("/100");
    expect(text).not.toMatch(/\bof 100\b/);
  });
});

describe("the two forms — full band over a 79, one-line reminder for every other grade", () => {
  // Two user rules compose here. (1) The unmissable celebration puncture is
  // for grades that LOOK done — over a 79, A and B. (2) "Always remind, no
  // matter the grade, that humans have to be in the loop": every other score
  // display still carries a compact one-line reminder in the same spot, so
  // no grade is ever silent about the human half.
  it.each(["A", "B"])("shows the full band for grade %s", (grade) => {
    const w = mount(AutomationLimitBand, { props: { grade } });
    expect(w.find('[data-testid="automation-limit"]').exists()).toBe(true);
    expect(w.find('[data-testid="human-loop-reminder"]').exists()).toBe(false);
  });

  it.each(["C", "D", "F"])("shows the one-line reminder, not the band, for grade %s", (grade) => {
    const w = mount(AutomationLimitBand, { props: { grade } });
    expect(w.find('[data-testid="automation-limit"]').exists()).toBe(false);
    const line = w.find('[data-testid="human-loop-reminder"]');
    expect(line.exists()).toBe(true);
    expect(line.text()).toContain("a person");
    expect(line.text()).not.toContain("Even a perfect score");
  });

  it("falls back to the reminder when the grade is unknown or junk", () => {
    // A forged shared report with a junk grade must not summon the full
    // band — but "always remind" means it still gets the one-liner.
    const missing = mount(AutomationLimitBand);
    expect(missing.find('[data-testid="automation-limit"]').exists()).toBe(false);
    expect(missing.find('[data-testid="human-loop-reminder"]').exists()).toBe(true);
    const junk = mount(AutomationLimitBand, { props: { grade: "b" } });
    expect(junk.find('[data-testid="automation-limit"]').exists()).toBe(false);
    expect(junk.find('[data-testid="human-loop-reminder"]').exists()).toBe(true);
  });

  it("the reminder links to the checklist only where the checklist exists", () => {
    const linked = mount(AutomationLimitBand, {
      props: { grade: "C", linkManualReview: true },
    });
    expect(linked.find('a[href="#manual-review-h"]').exists()).toBe(true);
    const bare = mount(AutomationLimitBand, { props: { grade: "C" } });
    expect(bare.find('a[href="#manual-review-h"]').exists()).toBe(false);
  });

  it("the reminder carries no figure that could be read as the grade either", () => {
    const w = mount(AutomationLimitBand, { props: { grade: "F", notAssessedCount: 7 } });
    const text = w.text();
    expect(text).not.toContain("%");
    expect(text).not.toContain("/100");
  });
});

describe("wiring — every score display carries the band", () => {
  it("ReportGradeHero swaps to the reminder below the threshold, from the grade it displays", () => {
    const w = mount(ReportGradeHero, {
      props: {
        grade: "C",
        overallScore: 79,
        categories: [
          { id: "alt_text", label: "Alt Text", score: 50, grade: "F", severity: "Moderate" },
        ],
        notAssessedCount: 3,
      },
    });
    expect(w.find('[data-testid="automation-limit"]').exists()).toBe(false);
    expect(w.find('[data-testid="human-loop-reminder"]').exists()).toBe(true);
  });

  it("ScoreCard swaps to the reminder below the threshold, from the grade it displays", () => {
    const w = mount(ScoreCard, {
      props: {
        result: {
          filename: "agenda.pdf",
          pageCount: 2,
          overallScore: 79,
          grade: "C",
          executiveSummary: "sum",
          categories: [
            { id: "alt_text", label: "Alt Text", score: 50, grade: "F", severity: "Moderate" },
          ],
          conformance: {
            status: "no-automated-failures",
            failures: [],
            notAssessed: NOT_ASSESSED,
            headline: "",
          },
        },
      },
    });
    expect(w.find('[data-testid="automation-limit"]').exists()).toBe(false);
    expect(w.find('[data-testid="human-loop-reminder"]').exists()).toBe(true);
  });

  it("ReportGradeHero (Visual view) renders it, with the count threaded through", () => {
    const w = mount(ReportGradeHero, {
      props: {
        grade: "A",
        overallScore: 100,
        categories: [
          {
            id: "alt_text",
            label: "Alt Text",
            score: 100,
            grade: "A",
            severity: "No issues found",
          },
        ],
        notAssessedCount: 3,
      },
    });
    const band = w.find('[data-testid="automation-limit"]');
    expect(band.exists()).toBe(true);
    expect(band.text()).toContain("Even a perfect score is not a guarantee");
    expect(band.text()).toContain("3 WCAG criteria");
  });

  it("ScoreCard (Detailed view + remediation cards) renders it from its own conformance", () => {
    const w = mount(ScoreCard, {
      props: {
        result: {
          filename: "agenda.pdf",
          pageCount: 2,
          overallScore: 100,
          grade: "A",
          executiveSummary: "sum",
          categories: [
            { id: "alt_text", label: "Alt Text", score: 100, grade: "A", severity: null },
          ],
          conformance: {
            status: "no-automated-failures",
            failures: [],
            notAssessed: NOT_ASSESSED,
            headline: "",
          },
        },
      },
    });
    const band = w.find('[data-testid="automation-limit"]');
    expect(band.exists()).toBe(true);
    expect(band.text()).toContain("3 WCAG criteria");
  });

  it("ScoreCard links to the checklist only when its page opts in", () => {
    const result = {
      filename: "agenda.pdf",
      pageCount: 2,
      overallScore: 100,
      grade: "A",
      executiveSummary: "sum",
    };
    const bare = mount(ScoreCard, { props: { result } });
    expect(bare.find('a[href="#manual-review-h"]').exists()).toBe(false);

    const linked = mount(ScoreCard, { props: { result, linkManualReview: true } });
    expect(linked.find('a[href="#manual-review-h"]').exists()).toBe(true);
  });

  // Source scans, not mounts: mounting a page requires Nuxt's own component
  // resolution (same trade-off as manualReview.test.ts).
  const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");

  it("ReportVisualView threads the not-assessed count into the hero", () => {
    const src = read("components/ReportVisualView.vue");
    const tag = src.slice(src.indexOf("<ReportGradeHero"));
    expect(tag.slice(0, tag.indexOf(">"))).toContain(":not-assessed-count=");
  });

  it.each([
    ["Detailed view — audit page", "pages/index.vue"],
    ["Detailed view — shared report page", "pages/report/[id].vue"],
  ])("%s opts its ScoreCard into the checklist link", (_label, file) => {
    const src = read(file);
    const tag = src.slice(src.indexOf("<ScoreCard"));
    expect(tag.slice(0, tag.indexOf(">"))).toContain(":link-manual-review=");
  });
});

describe("the message travels with the score wherever the score is quoted", () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");

  it("the downloaded HTML report carries the band under its score hero", () => {
    // A downloaded report is read away from the app, usually by whoever has
    // to sign off on publishing — exactly the reader the band exists for.
    const branding: BrandingInfo = {
      appName: "File Audit",
      siteUrl: "https://audit.example",
      wcagVersion: "2.2",
      wcagUnderstandingBase: "https://www.w3.org/WAI/WCAG22/Understanding/",
    };
    const result: ReportResult = {
      filename: "report.pdf",
      pageCount: 1,
      overallScore: 100,
      grade: "A",
      isScanned: false,
      executiveSummary: "Summary",
      fileType: "pdf",
      categories: [
        {
          id: "title_language",
          label: "Document Title & Language",
          score: 100,
          grade: "A",
          severity: "Pass",
          findings: [],
        },
      ],
    };
    const html = buildHtml(result, branding);
    const band = html.indexOf("Even a perfect score is not a guarantee");
    expect(band).toBeGreaterThan(-1);
    expect(html).toContain("screen reader");
    // Under the hero, before the report body.
    expect(band).toBeGreaterThan(html.indexOf("/100"));
    expect(band).toBeLessThan(html.indexOf("Executive Summary"));

    // Below the threshold the export swaps to the one-line reminder — same
    // two-form rule as on screen.
    const lowGrade = buildHtml({ ...result, overallScore: 62, grade: "D" }, branding);
    expect(lowGrade).not.toContain("Even a perfect score is not a guarantee");
    expect(lowGrade).toContain("only part of the job");
  });

  it("the share email always qualifies the score it quotes, at every grade", () => {
    // "Score: 62/100 (Grade D)" in an email IS the report for most
    // recipients. "Always remind, no matter the grade": the qualifier is
    // deliberately unconditional — no grade gate may creep back in.
    const fn = read("pages/index.vue");
    const body = fn.slice(fn.indexOf("function emailShareUrl"));
    const beforeSend = body.slice(0, body.indexOf("window.open"));
    expect(beforeSend).toContain("automated checks only");
    expect(beforeSend).not.toContain("shouldShowAutomationLimit");
  });
});
