import "./test-helpers";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AutomationLimitBand from "../components/AutomationLimitBand.vue";
import ReportGradeHero from "../components/ReportGradeHero.vue";
import ScoreCard from "../components/ScoreCard.vue";
import { buildHtml } from "../utils/exportFormats/html";
import { MATTERHORN_FACTS } from "../data/matterhorn";
import type { ReportResult, BrandingInfo } from "../utils/exportFormats/shared";

// Accessibility remediators keep repeating one sentence about tools like this:
// a score — even 100 — is the AUTOMATED subset of accessibility, not the
// document working. The ManualReviewCard says it in prose further down the
// page; this band says it AT the score, visually, on every report.
//
// v1.102.0 (user request) rewrote the contract:
// - ONE form, EVERY grade. The old rule showed the full band only over a 79
//   (A/B) with a one-line reminder elsewhere; the rule now is "something
//   users always see, so they understand this tool checks a subset and the
//   rest needs an actual human". The grade gate (shouldShowAutomationLimit)
//   is deleted outright — a test below pins that it stays deleted.
// - The band carries the coverage PERCENTAGES, study-sourced (previously
//   banned outright by v1.58.1's no-figures rule). The amended rule: only
//   the paired coverage ranges and attributed study figures, each with "%"
//   attached — never a bare figure out of 100 that could shadow the grade.
//   A test strips the allowed figures and asserts nothing else survives.

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

const heroProps = (grade: string, score: number, severity: string | null) => ({
  grade,
  overallScore: score,
  categories: [{ id: "alt_text", label: "Alt Text", score: severity ? 50 : 100, grade, severity }],
});

describe("AutomationLimitBand — the subset message", () => {
  it("leads with the subset claim and names the peer checkers", () => {
    const w = mount(AutomationLimitBand);
    const text = w.text();
    expect(text).toContain("This tool checks a subset — a human has to check the rest");
    expect(text).toContain("Adobe");
    expect(text).toContain("Acrobat");
    expect(text).toContain("PAC");
    expect(text).toContain("Word");
    expect(text).toContain("screen reader");
  });

  it("shows the two halves of the job in words, not color alone", () => {
    const w = mount(AutomationLimitBand);
    const text = w.text();
    expect(text).toContain("Machine-checkable");
    expect(text).toContain("Checked — this score");
    expect(text).toContain("Human judgment");
    expect(text).toContain("Still open — needs a person");
  });

  it("names the judgment calls machines cannot make", () => {
    const text = mount(AutomationLimitBand).text();
    expect(text).toContain("does the alt text actually describe the image");
    expect(text).toContain("does the reading order make sense in a screen reader");
    expect(text).toContain("do complex tables navigate");
    expect(text).toContain("is the writing clear");
  });

  it("reports the real count of criteria automation never examined", () => {
    const w = mount(AutomationLimitBand, { props: { notAssessedCount: 3 } });
    expect(w.text()).toContain("3 WCAG criteria on this document were never machine-checked");
  });

  it("uses the singular for a single unexamined criterion", () => {
    const w = mount(AutomationLimitBand, { props: { notAssessedCount: 1 } });
    expect(w.text()).toContain("1 WCAG criterion on this document was never machine-checked");
  });

  it("stays silent about the count when it is unknown", () => {
    // A forged shared report can omit conformance; claiming "0 criteria were
    // never machine-checked" would be an overclaim, the one thing this band
    // exists to prevent.
    const w = mount(AutomationLimitBand);
    expect(w.text()).not.toContain("never machine-checked at all");
  });

  it("links to the manual checklist only where the checklist exists", () => {
    // The remediation page shows ScoreCards but no ManualReviewCard — an
    // anchor there would jump nowhere.
    const withLink = mount(AutomationLimitBand, { props: { linkManualReview: true } });
    expect(withLink.find('a[href="#manual-review-h"]').exists()).toBe(true);
    expect(withLink.text()).toContain("Still worth checking by hand");

    const withoutLink = mount(AutomationLimitBand);
    expect(withoutLink.find('a[href="#manual-review-h"]').exists()).toBe(false);
    expect(withoutLink.text()).toContain("Have a person confirm the human half");
  });

  it("points further questions at the agency accessibility coordinator", () => {
    // Exact role title by request — "agency accessibility coordinator", the
    // standard designation in Illinois agencies. Not a person's name, not a
    // narrower specialist title.
    expect(mount(AutomationLimitBand).text()).toContain(
      "contact your agency accessibility coordinator",
    );
  });
});

describe("the figures — study-sourced, paired, and nothing that shadows the grade", () => {
  it("carries the coverage split as paired ranges", () => {
    const text = mount(AutomationLimitBand).text();
    expect(text).toContain("roughly 30–40%");
    expect(text).toContain("roughly 60–70%");
  });

  it("quotes the study figures it attributes", () => {
    const text = mount(AutomationLimitBand).text();
    expect(text).toContain("best tool 41%");
    expect(text).toContain("worst 17%");
    expect(text).toContain("57% of issue volume");
  });

  it("carries NO figure beyond the sourced ones — the amended v1.58.1 rule", () => {
    // v1.58.1's lesson stands underneath the amendment: a bare figure out of
    // 100 beside a letter grade is read AS the grade. The user's 2026-08-26
    // request adds the coverage percentages — so the rule is now a whitelist:
    // strip the sourced figures and nothing percent-like may remain.
    const text = mount(AutomationLimitBand, { props: { notAssessedCount: 7 } }).text();
    const stripped = text.replace(/30–40%|60–70%|41%|17%|57%/g, "");
    expect(stripped).not.toContain("%");
    expect(stripped).not.toContain("/100");
    expect(stripped).not.toMatch(/\bof 100\b/);
  });

  it("links all three sources, opening in new tabs", () => {
    const w = mount(AutomationLimitBand);
    const hrefs = [
      "https://accessibility.blog.gov.uk/2017/02/24/what-we-found-when-we-tested-tools-on-the-worlds-least-accessible-webpage/",
      "https://www.deque.com/automated-accessibility-coverage-report/",
      "https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html",
    ];
    for (const href of hrefs) {
      const a = w.find(`a[href="${href}"]`);
      expect(a.exists()).toBe(true);
      expect(a.attributes("target")).toBe("_blank");
      expect(a.attributes("rel")).toContain("noopener");
    }
  });

  it("states the Matterhorn human-judgment share from the protocol data, not a hardcoded copy", () => {
    // Coupling rule: matterhorn.ts promotions must never orphan this copy —
    // so the copy reads MATTERHORN_FACTS directly and this pin asserts from
    // the same source.
    const text = mount(AutomationLimitBand).text();
    expect(text).toContain(
      `${MATTERHORN_FACTS.humanJudgment} of its ${MATTERHORN_FACTS.failureConditions} failure conditions`,
    );
  });
});

describe("one form, every grade — nothing gates the message anymore (v1.102.0)", () => {
  it("renders in full with no props at all", () => {
    const w = mount(AutomationLimitBand);
    expect(w.find('[data-testid="automation-limit"]').exists()).toBe(true);
    expect(w.text()).toContain("This tool checks a subset");
  });

  it.each(["A", "B", "C", "D", "F"])(
    "ReportGradeHero shows the full band at grade %s — no low-grade downgrade",
    (grade) => {
      const w = mount(ReportGradeHero, {
        props: heroProps(grade, grade === "A" ? 100 : 50, grade === "A" ? null : "Moderate"),
      });
      expect(w.find('[data-testid="automation-limit"]').exists()).toBe(true);
      expect(w.find('[data-testid="human-loop-reminder"]').exists()).toBe(false);
    },
  );

  it("ScoreCard shows the full band below the old threshold too", () => {
    const w = mount(ScoreCard, {
      props: {
        result: {
          filename: "agenda.pdf",
          pageCount: 2,
          overallScore: 62,
          grade: "D",
          executiveSummary: "sum",
          categories: [
            { id: "alt_text", label: "Alt Text", score: 50, grade: "F", severity: "Moderate" },
          ],
        },
      },
    });
    expect(w.find('[data-testid="automation-limit"]').exists()).toBe(true);
    expect(w.find('[data-testid="human-loop-reminder"]').exists()).toBe(false);
  });

  it("the grade gate stays deleted — no predicate, no import, no util file", () => {
    expect(existsSync(resolve(__dirname, "../utils/automationLimit.ts"))).toBe(false);
    for (const rel of [
      "components/AutomationLimitBand.vue",
      "utils/printablePlan.ts",
      "utils/exportFormats/html.ts",
    ]) {
      const src = readFileSync(resolve(__dirname, "..", rel), "utf8");
      expect(src, `${rel} must not re-grow a grade gate`).not.toContain(
        "shouldShowAutomationLimit",
      );
    }
  });
});

describe("visibility — the band interrupts the celebration, loudly (v1.74.1)", () => {
  it("the headline sits in a solid amber header strip", () => {
    const w = mount(AutomationLimitBand);
    const head = w.find('[data-testid="automation-limit-head"]');
    expect(head.exists()).toBe(true);
    expect(head.text()).toContain("This tool checks a subset — a human has to check the rest");
    expect(head.classes()).toContain("bg-amber-400");
    expect(head.classes()).toContain("text-black");
  });

  it("ReportGradeHero places the band ABOVE the fix-progress panel", () => {
    const w = mount(ReportGradeHero, { props: heroProps("A", 100, null) });
    const html = w.html();
    const band = html.indexOf('data-testid="automation-limit"');
    const progress = html.indexOf("Fix progress");
    expect(band).toBeGreaterThan(-1);
    expect(progress).toBeGreaterThan(-1);
    expect(band).toBeLessThan(progress);
  });

  it("keeps that placement on a failing grade too — the subset message outranks the plan", () => {
    const w = mount(ReportGradeHero, { props: heroProps("F", 30, "Critical") });
    const html = w.html();
    const band = html.indexOf('data-testid="automation-limit"');
    const progress = html.indexOf("Fix progress");
    expect(band).toBeGreaterThan(-1);
    expect(band).toBeLessThan(progress);
  });

  it("ScoreCard places the band ABOVE the fix-progress panel too", () => {
    const w = mount(ScoreCard, {
      props: {
        result: {
          filename: "a.pdf",
          pageCount: 1,
          overallScore: 100,
          grade: "A",
          executiveSummary: "sum",
          categories: [
            { id: "alt_text", label: "Alt Text", score: 100, grade: "A", severity: null },
          ],
        },
      },
    });
    const html = w.html();
    const band = html.indexOf('data-testid="automation-limit"');
    const progress = html.indexOf("Fix progress");
    expect(band).toBeGreaterThan(-1);
    expect(progress).toBeGreaterThan(-1);
    expect(band).toBeLessThan(progress);
  });

  it("the HTML export's band leads with the same filled header", () => {
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
    expect(html).toContain('class="lb-head"');
    expect(html).toContain(".lb-head { background:#fbbf24");
  });
});

describe("wiring — every score display carries the band", () => {
  it("ReportGradeHero (Visual view) renders it, with the count threaded through", () => {
    const w = mount(ReportGradeHero, {
      props: { ...heroProps("A", 100, null), notAssessedCount: 3 },
    });
    const band = w.find('[data-testid="automation-limit"]');
    expect(band.exists()).toBe(true);
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

  it("the downloaded HTML report carries the subset band under its score hero", () => {
    // A downloaded report is read away from the app, usually by whoever has
    // to sign off on publishing — exactly the reader the band exists for.
    const html = buildHtml(result, branding);
    const band = html.indexOf("Automated checks cover a subset");
    expect(band).toBeGreaterThan(-1);
    expect(html).toContain("30&ndash;40%");
    expect(html).toContain("57% of issue volume");
    expect(html).toContain("screen reader");
    expect(html).toContain("agency accessibility coordinator");
    // Under the hero, before the report body.
    expect(band).toBeGreaterThan(html.indexOf("/100"));
    expect(band).toBeLessThan(html.indexOf("Executive Summary"));
  });

  it("the export shows the SAME band at a low grade — the two-form split is gone", () => {
    const lowGrade = buildHtml({ ...result, overallScore: 62, grade: "D" }, branding);
    expect(lowGrade).toContain("Automated checks cover a subset");
    expect(lowGrade).not.toContain("only part of the job");
    expect(lowGrade).not.toContain("limit-line");
  });

  it("the share email always qualifies the score it quotes, at every grade", () => {
    // "Score: 62/100 (Grade D)" in an email IS the report for most
    // recipients. "Always remind, no matter the grade": the qualifier is
    // deliberately unconditional — no grade gate may creep back in.
    const fn = read("pages/index.vue");
    const body = fn.slice(fn.indexOf("function emailShareUrl"));
    const beforeSend = body.slice(0, body.indexOf("window.open"));
    expect(beforeSend).toContain("automated checks only");
    expect(beforeSend).toContain("30–40%");
    expect(beforeSend).not.toContain("shouldShowAutomationLimit");
  });
});
