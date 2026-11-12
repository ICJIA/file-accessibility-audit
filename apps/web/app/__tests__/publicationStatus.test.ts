import "./test-helpers";
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import ReportActionBanner from "../components/ReportActionBanner.vue";
import ReportGradeHero from "../components/ReportGradeHero.vue";
import ScoreCard from "../components/ScoreCard.vue";
import ActionPlan from "../components/ActionPlan.vue";
import PrintPlanButton from "../components/PrintPlanButton.vue";
import TwoStandardsStrip from "../components/TwoStandardsStrip.vue";
import ManualReviewCard from "../components/ManualReviewCard.vue";
import { buildPrintablePlan } from "../utils/printablePlan";
import { emptyPlanSentence } from "../utils/publicationStatus";
import { buildActionPlan, publicationVerdict } from "../utils/actionPlan";
import { publishVerdictFor, isPublishReady } from "../utils/publishReadiness";
import {
  publicationStatus,
  publicationBanner,
  exportCategoryStatus,
} from "../utils/publicationStatus";
import { buildHtml } from "../utils/exportFormats/html";
import { buildText } from "../utils/exportFormats/text";
import { buildMarkdown, escapeMarkdown } from "../utils/exportFormats/markdown";
import { buildJSON } from "../utils/exportFormats/json";
import { buildAiAnalysis } from "../utils/exportFormats/aiAnalysis";
import type { ReportResult, BrandingInfo } from "../utils/exportFormats/shared";

// ---------------------------------------------------------------------------
// Review 2026-11-12, finding 1: "passes / ready to publish / optional" was
// decided from category severity alone. A Word file with 19 of 20 images
// described is Minor on alt text and carries a confirmed 1.1.1 failure — the
// banner called it a pass while the summary beside it said it does not meet
// WCAG 2.1 AA. Every surface below is fed the SAME result and must agree.
// ---------------------------------------------------------------------------

const branding: BrandingInfo = {
  appName: "ICJIA Accessibility Audit",
  siteUrl: "https://audit.example.test",
  wcagVersion: "2.1",
  wcagUnderstandingBase: "https://www.w3.org/WAI/WCAG21/Understanding/",
};

const PASS_CLAIMS = [
  /(?<!not )(?<!not confirmed )ready to publish/i,
  /passes Illinois/i,
  /Optional fixes/i,
  /Every scored category passed/i,
  /all scored categories pass/i,
  /No remediation needed/i,
  /Nothing to fix/i,
  /passes all automated checks/i,
  /Verdict: Accessible/i,
];

function cat(
  id: string,
  label: string,
  score: number | null,
  severity: string | null,
  findings: string[] = [],
) {
  return { id, label, score, grade: null, severity, findings };
}

/** 19 of 20 images described: Minor in extent, a confirmed Level A failure. */
function minorWithFailure(): ReportResult {
  return {
    filename: "annual-report.docx",
    pageCount: 12,
    overallScore: 95,
    grade: "A",
    isScanned: false,
    fileType: "docx",
    executiveSummary: "This document does not meet WCAG 2.1 AA.",
    categories: [
      cat("alt_text", "Alt Text on Images", 95, "Minor", ["1 of 20 images has no alt text"]),
      cat("heading_structure", "Heading Structure", 100, "Pass", ["Headings are in order"]),
      cat("title_language", "Title & Language", 100, "Pass", ["Title is set"]),
    ],
    conformance: {
      status: "fail",
      headline: "Does not meet WCAG 2.1 Level AA.",
      failures: [
        {
          sc: "1.1.1",
          name: "Non-text Content",
          level: "A",
          category: "alt_text",
          issue: "1 image has no text alternative",
          url: "https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html",
        },
      ],
      notAssessed: [],
    },
  };
}

function minorNoFailure(): ReportResult {
  const r = minorWithFailure();
  r.categories[0]!.findings = ["Alt text is short on 1 image"];
  r.conformance = {
    status: "no-automated-failures",
    headline: "No automated WCAG failures detected.",
    failures: [],
    notAssessed: [],
  };
  return r;
}

function incomplete(): ReportResult {
  const r = minorNoFailure();
  r.conformance = {
    status: "incomplete",
    headline: "Automated analysis could not complete for this file.",
    failures: [],
    notAssessed: [],
  };
  return r;
}

function legacy(): ReportResult {
  const r = minorNoFailure();
  delete r.conformance;
  return r;
}

/** Text of every surface for one result. */
function surfaces(r: ReportResult) {
  const banner = mount(ReportActionBanner, {
    props: { categories: r.categories, conformance: r.conformance },
  });
  const hero = mount(ReportGradeHero, {
    props: {
      grade: r.grade,
      overallScore: r.overallScore,
      categories: r.categories,
      conformance: r.conformance,
    },
    global: { stubs: { AutomationLimitBand: true } },
  });
  const scoreCard = mount(ScoreCard, {
    props: { result: r as never, showFilename: false, showPdfUaSignals: false },
    global: { stubs: { AutomationLimitBand: true, PdfUaSignalsCard: true, AppTooltip: true } },
  });
  const steps = buildActionPlan(r.categories, r.fileType, null, r.conformance);
  const plan = mount(ActionPlan, {
    props: { steps, conformance: r.conformance ?? null },
    global: { stubs: { BestPracticesSection: true } },
  });
  const json = JSON.parse(buildJSON(r, branding));
  return {
    banner: banner.text(),
    hero: hero.find('[data-testid="grade-label"]').text(),
    scoreCard: scoreCard.text(),
    plan: plan.text(),
    printable: publicationVerdict(r.categories, r.conformance).text,
    remediationPage: publishVerdictFor(r).text,
    html: buildHtml(r, branding),
    text: buildText(r, branding),
    markdown: buildMarkdown(r, branding),
    jsonSummary: `${json.remediationPlan.summary} ${json.llmContext.prompt} ${json.publication.verdict}`,
    ai: buildAiAnalysis(r, branding),
    json,
  };
}

function textOf(s: ReturnType<typeof surfaces>): Record<string, string> {
  const { json: _json, ...rest } = s;
  return rest;
}

describe("publication verdict — every surface agrees", () => {
  it("a Minor category with a confirmed WCAG failure is never called a pass, anywhere", () => {
    const s = surfaces(minorWithFailure());
    for (const [name, text] of Object.entries(textOf(s))) {
      for (const claim of PASS_CLAIMS) {
        expect(text, `${name} must not claim ${claim}`).not.toMatch(claim);
      }
    }
    // …and the ones that state a verdict all state the same one.
    expect(s.banner).toBe(
      "1 WCAG 2.1 requirement is not met and must be fixed before publishing, even though the issue is small in extent.",
    );
    const blocked = "Not ready to publish — 1 WCAG 2.1 requirement not met";
    expect(s.hero).toBe(blocked);
    expect(s.printable).toBe(blocked);
    expect(s.remediationPage).toBe(blocked);
    expect(s.html).toContain(blocked);
    expect(s.text).toContain(`Verdict:       ${blocked}`);
    expect(s.markdown).toContain(`**Verdict:** ${blocked}`);
    expect(s.json.publication).toMatchObject({
      state: "wcag-fail",
      readyToPublish: false,
      verdict: blocked,
      wcagFailureCount: 1,
    });
    expect(s.scoreCard).toContain("1 WCAG 2.1 requirement is not met — fix before publishing");
    expect(s.ai).toContain("Verdict: Not accessible");
    expect(isPublishReady(minorWithFailure())).toBe(false);
  });

  it("the same document WITHOUT the failure keeps its pass on every surface", () => {
    const s = surfaces(minorNoFailure());
    expect(s.banner).toContain("Optional fixes — this document passes Illinois accessibility.");
    expect(s.hero).toBe("Excellent — ready to publish");
    expect(s.printable).toBe("ready to publish");
    expect(s.remediationPage).toBe("ready to publish");
    expect(s.html).toContain("Excellent — ready to publish");
    expect(s.text).toContain("Verdict:       Excellent — ready to publish");
    expect(s.markdown).toContain("**Verdict:** Excellent — ready to publish");
    expect(s.json.publication.readyToPublish).toBe(true);
    expect(s.scoreCard).toContain("Every scored category passed");
  });

  it("an incomplete WCAG check is never a pass either", () => {
    const s = surfaces(incomplete());
    for (const [name, text] of Object.entries(textOf(s))) {
      for (const claim of PASS_CLAIMS) {
        expect(text, `${name} must not claim ${claim}`).not.toMatch(claim);
      }
    }
    expect(s.banner).toContain("is not confirmed ready to publish");
    expect(s.hero).toContain("not confirmed ready to publish");
    expect(s.json.publication.readyToPublish).toBe(false);
    expect(s.ai).toContain("Verdict: Not determined");
  });

  it("a stored report with no conformance block falls back to the severity answer", () => {
    const s = surfaces(legacy());
    expect(s.hero).toBe("Excellent — ready to publish");
    expect(s.banner).toContain("1 minor issue found.");
    expect(s.json.publication.readyToPublish).toBe(true);
  });

  it("stored data that contradicts a pass wins even when malformed", () => {
    // A forged / truncated stored report: fail status, no usable list.
    const status = publicationStatus([{ severity: "Pass" }], { status: "fail", failures: "x" });
    expect(status.mayClaimPass).toBe(false);
    expect(status.verdictText).toBe("Not ready to publish — WCAG 2.1 requirements not met");
    expect(publicationBanner(status)?.text).toBe(
      "WCAG 2.1 requirements are not met and must be fixed before publishing, even though the issues are small in extent.",
    );
    // An unknown status is not a pass.
    expect(publicationStatus([{ severity: "Pass" }], { status: "???" }).mayClaimPass).toBe(false);
    // A failures list beside a clean status still fails.
    expect(
      publicationStatus([{ severity: "Minor" }], {
        status: "no-automated-failures",
        failures: [{ sc: "1.1.1" }],
      }).state,
    ).toBe("wcag-fail");
  });

  it("a Critical category still leads, and Moderate + failure says must, not recommended", () => {
    expect(
      publicationStatus([{ severity: "Critical" }], minorWithFailure().conformance).verdictText,
    ).toBe("Not ready to publish — 1 critical issue");
    const mod = publicationStatus([{ severity: "Moderate" }], minorWithFailure().conformance);
    expect(mod.tone).toBe("critical");
    expect(publicationBanner(mod)?.text).toBe(
      "1 WCAG 2.1 requirement is not met and must be fixed before publishing.",
    );
    // Moderate with a clean gate keeps the recommendation.
    expect(
      publicationStatus([{ severity: "Moderate" }], minorNoFailure().conformance).verdictText,
    ).toBe("fix recommended before publishing");
  });

  it("the action plan never shows its green card when no pass may be claimed", () => {
    const failing = minorWithFailure().conformance!;
    const wrapper = mount(ActionPlan, {
      props: { steps: [], conformance: failing },
      global: { stubs: { BestPracticesSection: true } },
    });
    expect(wrapper.find('[data-testid="plan-pass-card"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="plan-no-pass-card"]').text()).toContain(
      "1 WCAG 2.1 requirement is not met",
    );
    const clean = mount(ActionPlan, {
      props: { steps: [], conformance: minorNoFailure().conformance! },
      global: { stubs: { BestPracticesSection: true } },
    });
    expect(clean.find('[data-testid="plan-pass-card"]').exists()).toBe(true);
  });
});

describe("printable plan — verdict and blurb", () => {
  afterEach(() => vi.restoreAllMocks());

  async function openedPlan(r: ReportResult): Promise<string> {
    let html = "";
    vi.spyOn(URL, "createObjectURL").mockImplementation((b: Blob | MediaSource) => {
      void (b as Blob).text().then((t) => (html = t));
      return "blob:test";
    });
    vi.spyOn(window, "open").mockReturnValue(null);
    const wrapper = mount(PrintPlanButton, { props: { result: r as never } });
    await wrapper.find('[data-testid="print-plan"]').trigger("click");
    await new Promise((res) => setTimeout(res, 0));
    return html;
  }

  it("prints the blocked verdict for a Minor document with a confirmed failure", async () => {
    const html = await openedPlan(minorWithFailure());
    expect(html).toContain("Not ready to publish — 1 WCAG 2.1 requirement not met");
    expect(html).not.toMatch(/— ready to publish/);
  });

  it("the blurb only promises an Acrobat route for PDFs", () => {
    const docx = mount(PrintPlanButton, { props: { result: minorWithFailure() as never } });
    expect(docx.text()).not.toContain("Acrobat");
    expect(docx.text()).toContain("step-by-step instructions for Word");

    const pdf = mount(PrintPlanButton, {
      props: { result: { ...minorWithFailure(), fileType: "pdf", filename: "a.pdf" } as never },
    });
    expect(pdf.text()).toContain("instructions for both the source document and Acrobat");

    const xlsx = mount(PrintPlanButton, {
      props: { result: { ...minorWithFailure(), fileType: "xlsx" } as never },
    });
    expect(xlsx.text()).toContain("step-by-step instructions for Excel");
  });
});

describe("JSON export — status from severity and the conformance verdict (finding 5)", () => {
  it("a 95 / Minor category with a required fix is not a pass", () => {
    const json = JSON.parse(buildJSON(minorWithFailure(), branding));
    const alt = json.categories.find((c: { id: string }) => c.id === "alt_text");
    expect(alt.status).toBe("minor");
    expect(alt.requiredByWcag).toBe(true);
    expect(json.remediationPlan.summary).toBe(
      "1 category needs remediation. 1 WCAG 2.1 requirement is not met and must be fixed before publishing.",
    );
    expect(json.remediationPlan.prioritizedSteps).toHaveLength(1);
    expect(json.remediationPlan.prioritizedSteps[0]).toMatchObject({
      priority: 1,
      categoryId: "alt_text",
      requiredByWcag: true,
      wcagCriteria: ["1.1.1 Non-text Content (Level A)"],
    });
    expect(json.llmContext.prompt).toContain("Alt Text on Images (95/100)");
    expect(json.llmContext.prompt).not.toContain("All scored categories pass");
  });

  it("uses the screen's severity bands, not its own", () => {
    const json = JSON.parse(buildJSON(minorWithFailure(), branding));
    expect(json.llmContext.scoringScale).toEqual({
      pass: "100",
      minor: "70–99",
      moderate: "40–69",
      fail: "0–39",
    });
    expect(exportCategoryStatus({ score: 95, severity: null })).toBe("minor");
    expect(exportCategoryStatus({ score: 100, severity: "No scored issues" })).toBe("pass");
    expect(exportCategoryStatus({ score: 30, severity: "Critical" })).toBe("fail");
    expect(exportCategoryStatus({ score: null, notAssessed: true })).toBe("not-assessed");
    expect(exportCategoryStatus({ score: null })).toBe("not-applicable");
  });

  it("orders prioritizedSteps the way the action plan does", () => {
    const r = minorWithFailure();
    r.categories = [
      cat("alt_text", "Alt Text on Images", 95, "Minor"),
      cat("table_markup", "Table Markup", 55, "Moderate"),
      cat("heading_structure", "Heading Structure", 60, "Moderate"),
      cat("title_language", "Title & Language", 20, "Critical"),
    ];
    const json = JSON.parse(buildJSON(r, branding));
    const ids = json.remediationPlan.prioritizedSteps.map(
      (s: { categoryId: string }) => s.categoryId,
    );
    const planIds = buildActionPlan(r.categories, r.fileType, null, r.conformance).map(
      (s) => s.categoryId,
    );
    expect(ids).toEqual(planIds);
    expect(ids).toEqual(["title_language", "table_markup", "heading_structure", "alt_text"]);
  });

  it("keeps a category with a confirmed failure in the plan even when it has no step", () => {
    const r = minorWithFailure();
    r.categories[0] = cat("alt_text", "Alt Text on Images", 100, "Pass");
    const json = JSON.parse(buildJSON(r, branding));
    expect(
      json.remediationPlan.prioritizedSteps.map((s: { categoryId: string }) => s.categoryId),
    ).toEqual(["alt_text"]);
    expect(json.remediationPlan.summary).not.toContain("No remediation needed");
  });
});

describe("text and Markdown exports — plan, verdict, disclosure (finding 6)", () => {
  it("both carry the ordered fix steps, the verdict, and the subset disclosure", () => {
    const r = minorWithFailure();
    const [step] = buildActionPlan(r.categories, r.fileType, null, r.conformance);
    for (const out of [buildText(r, branding), buildMarkdown(r, branding)]) {
      expect(out.toLowerCase()).toContain(
        "automated checks cover a subset — a person checks the rest",
      );
      expect(out).toContain("roughly 30–40% of issues");
      expect(out).toContain(step!.title);
      expect(out).toContain(step!.routes[0]!.steps[0]!.slice(0, 20));
      expect(out).toMatch(/Required by WCAG 2\.1/i);
      // Naming a criterion means linking it.
      expect(out).toContain("https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html");
      expect(out).not.toMatch(/Grade:\**\s+A — Excellent/);
    }
  });

  it("escapes Markdown-significant characters in document-derived strings", () => {
    const r = minorWithFailure();
    r.filename = "a|b_[draft]*.docx";
    r.categories[0]!.findings = [
      "Link text [click here](javascript:alert(1)) is vague",
      "Alt text is `<img onerror=x>`\n# Injected heading",
    ];
    r.conformance!.failures[0]!.issue = "cell one | cell two\nnext row";
    const out = buildMarkdown(r, branding);
    expect(out).toContain("# a\\|b\\_\\[draft\\]\\*.docx");
    expect(out).not.toContain("[click here](javascript:");
    expect(out).toContain("\\[click here\\](javascript:alert(1))");
    expect(out).not.toMatch(/^# Injected heading/m);
    expect(out).toContain("\\`\\<img onerror=x\\>\\`");
    // The table row stays one row with three cells.
    const row = out.split("\n").find((l) => l.includes("cell one"))!;
    expect(row).toContain("cell one \\| cell two next row");
    expect(row.replace(/\\\|/g, "").split("|")).toHaveLength(5);
  });

  it("escapeMarkdown neutralises a block marker at the start of a value only", () => {
    expect(escapeMarkdown("# heading")).toBe("\\# heading");
    expect(escapeMarkdown("- item")).toBe("\\- item");
    expect(escapeMarkdown("1. item")).toBe("1\\. item");
    expect(escapeMarkdown("screen-reader users (most)")).toBe("screen-reader users (most)");
    expect(escapeMarkdown("1.4.3 Contrast", { inline: true })).toBe("1.4.3 Contrast");
  });
});

// ---------------------------------------------------------------------------
// Follow-up (same review): surfaces an independent verifier found still
// contradicting publicationStatus — the standards strip, the zero-step
// printable plan, the three "Every automated check passed" lines, the bare
// grade adjective, and the AI hand-off. Three payloads, all with every
// category at 100, so nothing but the conformance verdict separates them.
// ---------------------------------------------------------------------------

function all100(conformance: ReportResult["conformance"]): ReportResult {
  return {
    filename: "clean-looking.docx",
    pageCount: 3,
    overallScore: 100,
    grade: "A",
    isScanned: false,
    fileType: "docx",
    executiveSummary: "Summary.",
    categories: [
      cat("alt_text", "Alt Text on Images", 100, "Pass", ["All images described"]),
      cat("heading_structure", "Heading Structure", 100, "Pass", ["Headings are in order"]),
      cat("table_markup", "Table Markup", null, null, []),
    ],
    conformance,
  };
}
const failInAll100 = () => all100(minorWithFailure().conformance);
const incompleteAll100 = () => all100(incomplete().conformance);
const cleanAll100 = () => all100(minorNoFailure().conformance);

function moreSurfaces(r: ReportResult) {
  const strip = mount(TwoStandardsStrip, {
    props: { conformance: r.conformance, wcagVersion: "2.1", fileType: r.fileType },
  });
  const hero = mount(ReportGradeHero, {
    props: {
      grade: r.grade,
      overallScore: r.overallScore,
      categories: r.categories,
      conformance: r.conformance,
    },
    global: { stubs: { AutomationLimitBand: true } },
  });
  const scoreCard = mount(ScoreCard, {
    props: { result: r as never, showFilename: false, showPdfUaSignals: false },
    global: { stubs: { AutomationLimitBand: true, PdfUaSignalsCard: true, AppTooltip: true } },
  });
  const manual = mount(ManualReviewCard, {
    props: { categories: r.categories as never, conformance: r.conformance, fileType: r.fileType },
    global: { stubs: { AppTooltip: true } },
  });
  const status = publicationStatus(r.categories, r.conformance);
  const printable = buildPrintablePlan({
    filename: r.filename,
    grade: r.grade,
    score: r.overallScore,
    verdict: status.verdictText,
    steps: buildActionPlan(r.categories, r.fileType, null, r.conformance),
    emptyPlanText: status.mayClaimPass ? null : emptyPlanSentence(status),
  });
  const json = JSON.parse(buildJSON(r, branding));
  return {
    strip,
    stripVerdict: strip.find('[data-testid="law-verdict"]').text(),
    hero: hero.text(),
    scoreCard: scoreCard.text(),
    scoreCardLabel: scoreCard.find('[data-testid="scorecard-grade-label"]').text(),
    manual: manual.text(),
    printable,
    json,
    ai: buildAiAnalysis(r, branding),
  };
}

const EVERY_CHECK = /Every automated check passed|passed every automated check/i;

describe("publication verdict — the surfaces the first sweep missed (A–E)", () => {
  it("a confirmed failure in an all-100 document: no surface celebrates", async () => {
    const s = moreSurfaces(failInAll100());
    // A — the strip
    expect(s.stripVerdict).toContain("✕");
    expect(s.stripVerdict).toContain("1 criterion failing");
    expect(s.stripVerdict).not.toContain("No automated failures found");
    // B — the printable plan with zero steps
    expect(s.printable).not.toMatch(EVERY_CHECK);
    expect(s.printable).toContain("1 WCAG 2.1 requirement is not met — fix before publishing.");
    // C — the three "every check passed" lines
    for (const text of [s.hero, s.scoreCard, s.manual]) expect(text).not.toMatch(EVERY_CHECK);
    expect(s.hero).toContain(
      "Every scored category is at 100, but 1 WCAG 2.1 requirement is not met — fix before publishing.",
    );
    expect(s.manual).toContain("Separate from the WCAG 2.1 requirement that is not met");
    // D — no flattering adjective
    expect(s.scoreCardLabel).toBe("Not ready to publish — 1 WCAG 2.1 requirement not met");
    expect(s.json.score.gradeLabel).toBe("Not ready to publish — 1 WCAG 2.1 requirement not met");
    expect(s.json.scoreProfiles.strict.gradeLabel).not.toBe("Excellent");
    expect(s.json.score.gradeAdjective).toBe("Excellent");
    expect(s.json.publication.readyToPublish).toBe(false);
    // E — the AI hand-off
    expect(s.ai).toContain("Verdict: Not accessible");
    expect(s.ai).not.toContain("passed every applicable check");

    // …and through the real button, which builds the printout itself.
    let html = "";
    vi.spyOn(URL, "createObjectURL").mockImplementation((b: Blob | MediaSource) => {
      void (b as Blob).text().then((t) => (html = t));
      return "blob:test";
    });
    vi.spyOn(window, "open").mockReturnValue(null);
    const btn = mount(PrintPlanButton, { props: { result: failInAll100() as never } });
    await btn.find('[data-testid="print-plan"]').trigger("click");
    await new Promise((res) => setTimeout(res, 0));
    expect(html).not.toMatch(EVERY_CHECK);
    expect(html).toContain("1 WCAG 2.1 requirement is not met");
    vi.restoreAllMocks();
  });

  it("an incomplete check in an all-100 document: not completed, never a green tick", () => {
    const s = moreSurfaces(incompleteAll100());
    expect(s.stripVerdict).toBe("⚠ The WCAG 2.1 check could not be completed");
    expect(s.stripVerdict).not.toContain("✓");
    expect(s.strip.html()).not.toContain("status-ok-green");
    expect(s.printable).not.toMatch(EVERY_CHECK);
    expect(s.printable).toContain("The WCAG 2.1 check could not be completed for this file");
    for (const text of [s.hero, s.scoreCard, s.manual]) expect(text).not.toMatch(EVERY_CHECK);
    expect(s.scoreCardLabel).toBe(
      "Excellent — not confirmed ready to publish — the WCAG 2.1 check could not be completed",
    );
    expect(s.json.score.gradeLabel).toBe(s.scoreCardLabel);
    expect(s.ai).toContain("Verdict: Not determined");
    expect(s.ai).not.toContain("passed every applicable check");
  });

  it("the clean document keeps every one of its pass lines", () => {
    const s = moreSurfaces(cleanAll100());
    expect(s.stripVerdict).toBe("✓ No automated failures found");
    expect(s.printable).toContain("Nothing — this document passed every automated check.");
    expect(s.hero).toContain("Every automated check passed. See what still needs a human below.");
    expect(s.scoreCard).toContain("Every automated check passed.");
    expect(s.manual).toContain("Every automated check passed — but");
    expect(s.scoreCardLabel).toBe("Excellent");
    expect(s.json.score.gradeLabel).toBe("Excellent");
    expect(s.ai).toContain("Verdict: Accessible");
  });

  it("a fail status with an empty list, or failures under another status, still fails (A, E)", () => {
    const emptyFail = all100({ status: "fail", headline: "h", failures: [], notAssessed: [] });
    const a = moreSurfaces(emptyFail);
    expect(a.stripVerdict).toBe("✕ WCAG 2.1 requirements not met");
    expect(a.ai).toContain("Verdict: Not accessible");
    expect(a.ai).not.toContain("passed every applicable check");

    const mislabelled = all100({
      ...minorWithFailure().conformance!,
      status: "no-automated-failures",
    });
    const b = moreSurfaces(mislabelled);
    expect(b.stripVerdict).toContain("✕");
    expect(b.stripVerdict).toContain("1 criterion failing");
    expect(b.ai).toContain("Verdict: Not accessible");
  });
});

describe("Markdown export — numeric fields from a stored payload (F)", () => {
  it("a string where a number belongs cannot inject Markdown", () => {
    const r = minorWithFailure() as unknown as Record<string, unknown> & ReportResult;
    (r as { overallScore: unknown }).overallScore = "95** [x](javascript:alert(1)) **";
    (r as { pageCount: unknown }).pageCount = "3 | injected | cell";
    (r.categories[0] as { score: unknown }).score = "95 | x | y\n# H";
    const out = buildMarkdown(r, branding);
    expect(out).not.toContain("[x](javascript:");
    expect(out).not.toContain("95**");
    expect(out).not.toMatch(/^# H/m);
    expect(out).not.toContain("3 | injected | cell");
    const row = out.split("\n").find((l) => l.startsWith("| Alt Text on Images"))!;
    expect(row.replace(/\\\|/g, "").split("|")).toHaveLength(5);
  });
});
