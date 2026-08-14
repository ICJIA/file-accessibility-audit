import "./test-helpers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildPrintablePlan } from "../utils/printablePlan";
import PrintPlanButton from "../components/PrintPlanButton.vue";
import type { PlanStep } from "../utils/actionPlan";

// The workflow this tool serves is: drop a file, get a grade, get fixes. That
// last step required keeping a browser tab open while working in Word or
// Acrobat — the fix steps are exactly the part someone needs next to the
// document rather than behind it.
//
// The load-bearing properties are that BOTH fix routes survive into the
// printout (the person holding it may not be the person who chose the route),
// that document-derived strings are escaped, and that it is genuinely
// standalone — a printout that needed the network would be useless on paper.

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
  rank: 1,
  categoryId: "title_language",
  title: "Give the document a title",
  why: "Screen readers announce the filename otherwise.",
  severity: "Critical",
  wcagRefs: [{ sc: "2.4.2", name: "Page Titled" }],
  routes: [
    { tool: "source", label: "Easiest — fix the source document", steps: ["File → Info → Title"] },
    {
      tool: "acrobat",
      label: "No source file? Fix the PDF in Acrobat Pro",
      steps: ["File → Properties"],
    },
  ],
  detailAnchor: "#cat-title_language",
  ...over,
});

const AT = new Date("2026-08-08T12:00:00Z");

describe("buildPrintablePlan", () => {
  it("carries BOTH fix routes, expanded", () => {
    // On screen these live behind an accordion; on paper there is nothing to
    // click, and the reader may not be the person who chose the route.
    const html = buildPrintablePlan({ filename: "a.pdf", steps: [step()], generatedAt: AT });
    expect(html).toContain("Easiest — fix the source document");
    expect(html).toContain("No source file? Fix the PDF in Acrobat Pro");
    expect(html).toContain("File → Info → Title");
    expect(html).toContain("File → Properties");
  });

  it("prints the version note + IDS support line with the steps, not just on screen", () => {
    // The printout is read next to Word/Acrobat — exactly where a menu
    // mismatch is discovered — and the holder of the paper may not be the
    // person who generated it.
    const html = buildPrintablePlan({ filename: "a.pdf", steps: [step()], generatedAt: AT });
    expect(html).toContain("contact IDS at ICJIA");
    expect(html).toContain("August 2026");
  });

  it("omits the version note when there is nothing to fix", () => {
    const html = buildPrintablePlan({ filename: "a.pdf", steps: [], generatedAt: AT });
    expect(html).not.toContain("contact IDS at ICJIA");
  });

  it("is a complete standalone document with no external requests", () => {
    // A printout that needed the network would be useless on paper, and this
    // opens as a blob URL where a relative asset path resolves to nothing.
    const html = buildPrintablePlan({ filename: "a.pdf", steps: [step()], generatedAt: AT });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link[^>]+href/i);
    expect(html).not.toMatch(/src=["']http/i);
  });

  it("escapes document-derived strings", () => {
    // Findings quote alt text, link labels and titles straight out of the
    // uploaded file.
    const html = buildPrintablePlan({
      filename: '<img src=x onerror="alert(1)">.pdf',
      steps: [step({ title: "<script>bad()</script>", why: "a & b < c" })],
      generatedAt: AT,
    });
    expect(html).not.toMatch(/<script>bad/);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
    expect(html).toContain("a &amp; b &lt; c");
  });

  it("keeps a fix and its instructions on one page", () => {
    // Half a procedure across a page break is worse than white space.
    const html = buildPrintablePlan({ filename: "a.pdf", steps: [step()], generatedAt: AT });
    expect(html).toContain("break-inside:avoid");
    expect(html).toContain("page-break-inside:avoid");
  });

  it("prints ink-friendly, not the dark UI", () => {
    const html = buildPrintablePlan({ filename: "a.pdf", steps: [step()], generatedAt: AT });
    expect(html).toContain("background:#fff");
    expect(html).toContain("@media print");
    expect(html).toContain("@page");
  });

  it("includes the human checks and the unexamined criteria", () => {
    const html = buildPrintablePlan({
      filename: "a.pdf",
      steps: [],
      manualChecks: [
        {
          id: "alt_text",
          label: "Alt Text",
          verified: "Every image has one.",
          confirm: "Read each.",
        },
      ],
      notAssessed: [{ sc: "1.4.3", name: "Contrast (Minimum)", level: "AA" }],
      generatedAt: AT,
    });
    expect(html).toContain("Still worth checking by hand");
    expect(html).toContain("Alt Text");
    expect(html).toContain("Not checked by this tool at all");
    expect(html).toContain("1.4.3");
  });

  it("renders a caution-tone check with ! instead of the passed-check tick", () => {
    // The excluded-images prompt (every image marked decorative) is not a
    // passed check — on paper as on screen, a ✓ would claim a verification
    // that never happened. Same wiring rule as the card: every surface that
    // shows the checks must honor the tone.
    const html = buildPrintablePlan({
      filename: "a.pdf",
      steps: [],
      manualChecks: [
        {
          id: "alt_text",
          label: "Alt Text",
          tone: "caution",
          verified: "Every image is excluded from automated scoring.",
          confirm: "Look at each image.",
        },
      ],
      generatedAt: AT,
    });
    expect(html).toContain("Every image is excluded from automated scoring.");
    expect(html).not.toContain("&#10003;");
    expect(html).toContain('class="caution"');
  });

  it("says so plainly when there is nothing to fix", () => {
    const html = buildPrintablePlan({ filename: "a.pdf", steps: [], generatedAt: AT });
    expect(html).toContain("passed every automated check");
  });

  it("carries the human-in-the-loop statement onto the paper too", () => {
    const html = buildPrintablePlan({ filename: "a.pdf", steps: [step()], generatedAt: AT });
    expect(html).toContain("can tell you a document is accessible");
  });

  it("takes a heading and intro, so the remediation page can retitle it", () => {
    const html = buildPrintablePlan({
      filename: "a.pdf",
      steps: [step()],
      heading: "What still needs fixing",
      intro: "Automatic remediation has already run.",
      generatedAt: AT,
    });
    expect(html).toContain("<h1>What still needs fixing</h1>");
    expect(html).toContain("Automatic remediation has already run.");
  });
});

describe("PrintPlanButton", () => {
  const result = {
    filename: "report.pdf",
    grade: "D",
    overallScore: 69,
    fileType: "pdf",
    categories: [
      { id: "title_language", label: "Title & Language", score: 0, severity: "Critical" },
      { id: "alt_text", label: "Alt Text", score: 100, severity: "No issues found" },
    ],
    conformance: { notAssessed: [{ sc: "1.4.3", name: "Contrast (Minimum)", level: "AA" }] },
  };

  it("is a real, prominent button naming what it does", () => {
    // The small right-aligned view toggle taught us a control non-technical
    // readers need cannot be a hint.
    const w = mount(PrintPlanButton, { props: { result } });
    const btn = w.find('[data-testid="print-plan"]');
    expect(btn.exists()).toBe(true);
    expect(btn.element.tagName).toBe("BUTTON");
    expect(w.text()).toContain("Printer-friendly action steps");
  });

  it("tells the reader it opens elsewhere and what they get", () => {
    const w = mount(PrintPlanButton, { props: { result } });
    expect(w.text()).toContain("Opens in a new tab");
    expect(w.text()).toMatch(/source document and Acrobat/);
    expect(w.text()).toMatch(/Print or save as PDF/);
  });

  it("is excluded from report exports", () => {
    // It is a control, not content; a downloaded report should not carry it.
    const w = mount(PrintPlanButton, { props: { result } });
    expect(w.attributes("data-export-exclude")).toBeDefined();
  });

  it("renders nothing when there is genuinely nothing to print", () => {
    // Page-audit rows share the report table and carry no categories.
    const w = mount(PrintPlanButton, { props: { result: { filename: "x", categories: [] } } });
    expect(w.find('[data-testid="print-plan"]').exists()).toBe(false);
  });

  it("survives a null result rather than throwing on a shared report", () => {
    expect(() => mount(PrintPlanButton, { props: { result: null } })).not.toThrow();
  });
});

describe("the print button reaches every surface that shows a report", () => {
  // It first shipped into the Visual view only. Someone reading the detailed
  // report is just as likely to be the person who has to go and make the
  // fixes — and the same wiring gap left the manual-review card missing from
  // a whole view two releases ago.
  const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");

  it.each([
    ["Visual view", "components/ReportVisualView.vue"],
    ["Detailed view — audit page", "pages/index.vue"],
    ["Detailed view — shared report", "pages/report/[id].vue"],
    ["Remediation result", "pages/remediate/[jobId].vue"],
  ])("%s renders PrintPlanButton", (_label, file) => {
    expect(read(file)).toContain("<PrintPlanButton");
  });

  it("gives the remediation copy its own heading, since it prints a different thing", () => {
    const src = read("pages/remediate/[jobId].vue");
    expect(src).toContain('heading="What still needs fixing"');
    expect(src).toMatch(/Automatic remediation has already run/);
  });
});

describe("the automation-limit warning prints beside the grade", () => {
  // The printout is the version most likely to be read as a verdict — it gets
  // filed, forwarded, stapled to a review. The on-screen band under the score
  // (AutomationLimitBand) must survive onto paper, anchored to the same
  // grade line it qualifies.
  it("prints the not-a-guarantee box when a grade is printed", () => {
    const html = buildPrintablePlan({
      filename: "a.pdf",
      grade: "A",
      score: 100,
      steps: [],
      generatedAt: AT,
    });
    expect(html).toContain("Even a perfect score is not a guarantee");
    expect(html).toContain("screen reader");
  });

  it("omits the box when no grade line is printed", () => {
    // With no grade above it, "the score above" would dangle; the footer's
    // human-in-the-loop sentence still prints on every plan.
    const html = buildPrintablePlan({ filename: "a.pdf", steps: [], generatedAt: AT });
    expect(html).not.toContain("Even a perfect score is not a guarantee");
    expect(html).toContain("can tell you a document is accessible");
  });

  it("omits the box below the threshold — a C printout already leads with work to do", () => {
    // Same rule as on screen: the warning exists to puncture a score that
    // LOOKS done (over 79 — A and B), not to pile onto a failing one.
    const html = buildPrintablePlan({
      filename: "a.pdf",
      grade: "C",
      score: 79,
      steps: [step()],
      generatedAt: AT,
    });
    expect(html).not.toContain("Even a perfect score is not a guarantee");
  });
});

describe("the printed header link", () => {
  it("is omitted entirely when no URL is given", () => {
    const html = buildPrintablePlan({ filename: "a.pdf", steps: [], generatedAt: AT });
    expect(html).not.toContain("<a href=");
  });

  it("is suppressed on the remediation page", () => {
    // That job page expires, and it is not somewhere the reader should return
    // to: the file has already been remediated, and the page cannot show the
    // original audit either. A dead link on a printout is worse than no link.
    const src = readFileSync(resolve(__dirname, "..", "pages/remediate/[jobId].vue"), "utf8");
    expect(src).toContain(':show-url="false"');
  });

  it("is kept on the audit report, which is a live shareable page", () => {
    const src = readFileSync(resolve(__dirname, "..", "components/ReportVisualView.vue"), "utf8");
    const tag = src.slice(src.indexOf("<PrintPlanButton"));
    expect(tag.slice(0, tag.indexOf("/>"))).not.toContain("show-url");
  });
});
