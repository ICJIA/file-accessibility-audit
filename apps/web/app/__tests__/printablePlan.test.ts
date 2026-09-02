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

  it("passes the stored Creator into the plan builder (InDesign-authored PDFs)", () => {
    // The printable page is built inside openPlan()'s window.open flow, which
    // tests can't execute — so pin the wiring at the source, the same way the
    // remediation page's plan wiring is pinned. Without the third argument,
    // an InDesign annual report prints Word-only steps.
    const src = readFileSync(resolve(__dirname, "..", "components/PrintPlanButton.vue"), "utf8");
    expect(src).toMatch(/buildActionPlan\([^)]*pdfMetadata\?\.creator/);
  });

  it("passes best practices into the plan builder", () => {
    // Third instance of this exact class of bug on this branch: a feature
    // wired behind a prop no parent supplies, invisible in production, every
    // test green. Every test above (and every printablePlanBestPractices.test.ts
    // test) calls buildPrintablePlan() directly — none mounts this component
    // — so deleting `bestPractices: bestPractices.value` from openPlan()
    // would make every real printout silently drop the section while the
    // whole suite stayed green. Same pattern as the Creator pin above and
    // the understandingUrl/wcagQuickref pin below.
    const src = readFileSync(resolve(__dirname, "..", "components/PrintPlanButton.vue"), "utf8");
    expect(src).toMatch(/bestPractices:\s*bestPractices\.value/);
  });

  it("renders when best practices are the only thing left to print", () => {
    // Reachable state: a category that neither fails (no fix step —
    // buildActionPlan only turns a Critical/Moderate/Minor severity into a
    // step) nor passes into a dictionary-known manual check (manualChecks
    // only fires for an id MANUAL_CHECKS recognizes), on a format the
    // best-practices catalog evaluates regardless of which specific
    // category ids are present. Without the bestPractices clause in
    // hasSomethingToPrint, this document would show no button at all.
    const w = mount(PrintPlanButton, {
      props: {
        result: {
          filename: "clean.pdf",
          fileType: "pdf",
          categories: [
            { id: "not_in_manual_checks_dictionary", score: 100, severity: "No issues found" },
            // Scores a clean 100 (so it adds no fix step) while carrying a
            // not-scored advisory, which is exactly one best-practice row —
            // the only thing left for the button to print. Since v1.148.2 a
            // category with nothing to say yields no rows at all.
            {
              id: "bookmarks",
              score: 100,
              severity: "No issues found",
              findings: [
                "PDF/UA only — not scored: this 40-page document has 40 pages and no bookmarks, which makes it harder to navigate.",
              ],
            },
          ],
        },
      },
    });
    expect(w.find('[data-testid="print-plan"]').exists()).toBe(true);
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

describe("the automation-subset box prints on every plan (v1.102.0)", () => {
  // The printout is the version most likely to be read as a verdict — it gets
  // filed, forwarded, stapled to a review. The on-screen band under the score
  // (AutomationLimitBand) must survive onto paper. Since v1.102.0 nothing
  // gates it: it used to print only beside grades that look done (A/B), but
  // the user's rule is now "something users always see" — and the copy is
  // self-contained (it no longer says "the grade above"), so a gradeless
  // plan carries it safely too.
  it("prints the subset box with the study-backed figures", () => {
    const html = buildPrintablePlan({
      filename: "a.pdf",
      grade: "A",
      score: 100,
      steps: [],
      generatedAt: AT,
    });
    expect(html).toContain("Automated checks cover a subset");
    expect(html).toContain("30&ndash;40%");
    expect(html).toContain("57% of issue volume");
    expect(html).toContain("screen reader");
    expect(html).toContain("agency accessibility coordinator");
  });

  it("prints the box even when no grade line is printed — the copy is self-contained", () => {
    const html = buildPrintablePlan({ filename: "a.pdf", steps: [], generatedAt: AT });
    expect(html).toContain("Automated checks cover a subset");
    expect(html).toContain("can tell you a document is accessible");
  });

  it("prints the box below the old threshold too — no grade skips the message", () => {
    const html = buildPrintablePlan({
      filename: "a.pdf",
      grade: "C",
      score: 79,
      steps: [step()],
      generatedAt: AT,
    });
    expect(html).toContain("Automated checks cover a subset");
    expect(html).not.toContain("Even a high score is not a guarantee");
  });
});

describe("WCAG links print with the plan, typeable from paper", () => {
  // On paper a link isn't clickable — but the print stylesheet appends every
  // external href in parentheses after its link text, so giving each
  // criterion a real <a> both links the browser-tab preview AND prints the
  // W3C address for someone to type out (user request, 2026-08-14).
  const understandingUrl = (slug: string) =>
    `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`;

  it("links each fix step's criteria to their Understanding pages", () => {
    const html = buildPrintablePlan({
      filename: "a.pdf",
      steps: [step()],
      generatedAt: AT,
      understandingUrl,
    });
    expect(html).toContain('href="https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html"');
    expect(html).toContain("WCAG 2.4.2");
  });

  it("falls back to the quick reference for a criterion with no known slug", () => {
    const html = buildPrintablePlan({
      filename: "a.pdf",
      steps: [step({ wcagRefs: [{ sc: "9.9.9", name: "Future Criterion" }] })],
      generatedAt: AT,
      understandingUrl,
      wcagQuickref: "https://www.w3.org/WAI/WCAG22/quickref/",
    });
    const before = html.slice(
      Math.max(0, html.indexOf("Future Criterion") - 200),
      html.indexOf("Future Criterion"),
    );
    expect(before).toContain('href="https://www.w3.org/WAI/WCAG22/quickref/"');
  });

  it("links the unexamined criteria from their server-provided addresses", () => {
    const html = buildPrintablePlan({
      filename: "a.pdf",
      steps: [],
      generatedAt: AT,
      notAssessed: [
        {
          sc: "1.4.3",
          name: "Contrast (Minimum)",
          level: "AA",
          url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html",
        },
      ],
    });
    expect(html).toContain(
      'href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html"',
    );
  });

  it("refuses a non-http address from a stored report rather than printing it", () => {
    // The shared page's conformance block is attacker-controlled stored
    // JSON; a javascript: URL must be dropped, not linked or printed.
    const html = buildPrintablePlan({
      filename: "a.pdf",
      steps: [],
      generatedAt: AT,
      notAssessed: [
        { sc: "1.4.3", name: "Contrast (Minimum)", level: "AA", url: "javascript:alert(1)" },
      ],
    });
    expect(html).not.toContain("javascript:");
    expect(html).toContain("1.4.3");
  });

  it("prints the full quick-reference address in the footer", () => {
    const html = buildPrintablePlan({
      filename: "a.pdf",
      steps: [],
      generatedAt: AT,
      wcagQuickref: "https://www.w3.org/WAI/WCAG22/quickref/",
      wcagLabel: "WCAG 2.2 Level AA",
    });
    expect(html).toContain("WCAG 2.2 Level AA quick reference");
    expect(html).toContain('href="https://www.w3.org/WAI/WCAG22/quickref/"');
  });

  it("renders no links at all when no resolver is given (old callers unchanged)", () => {
    const html = buildPrintablePlan({ filename: "a.pdf", steps: [step()], generatedAt: AT });
    expect(html).not.toContain("<a href=");
  });

  it("the print button passes the WCAG link wiring", () => {
    const src = readFileSync(resolve(__dirname, "..", "components/PrintPlanButton.vue"), "utf8");
    expect(src).toContain("understandingUrl");
    expect(src).toContain("wcagQuickref");
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

describe("fix-time estimates in the printout", () => {
  it("prints each step's time and the plan total when every step is estimated", () => {
    const html = buildPrintablePlan({
      filename: "report.docx",
      steps: [
        step({ estimate: { label: "~2 min", maxMinutes: 2 } }),
        step({
          rank: 2,
          categoryId: "list_structure",
          title: "Use real lists",
          estimate: { label: "~3 min", maxMinutes: 3 },
        }),
      ],
      generatedAt: AT,
    });
    expect(html).toContain("~2 min");
    expect(html).toContain("~3 min");
    expect(html).toContain("typically under 10 minutes");
  });

  it("prints the apply-only caveat with its step and withholds the total", () => {
    const html = buildPrintablePlan({
      filename: "report.docx",
      steps: [
        step({
          categoryId: "alt_text",
          title: "Describe the images",
          estimate: {
            label: "~5 min",
            maxMinutes: null,
            note: "to apply the text — writing good alt text is the real work",
          },
        }),
      ],
      generatedAt: AT,
    });
    expect(html).toContain("~5 min to apply the text");
    expect(html).not.toContain("typically under");
  });

  it("prints no time text at all for unestimated steps", () => {
    const html = buildPrintablePlan({ filename: "report.pdf", steps: [step()], generatedAt: AT });
    expect(html).not.toContain("min</");
    expect(html).not.toContain("Hands-on fix time");
  });
});

describe("printable plan — the best-practices waiting line (2026-09-02)", () => {
  it("prints how many practices wait on the required fixes when the backlog says so", () => {
    const html = buildPrintablePlan({
      filename: "brief.pdf",
      grade: "F",
      score: 43,
      verdict: null,
      steps: [],
      bestPractices: [],
      bestPracticeBacklog: { blocked: 6, unjudged: 10 },
    } as never);
    expect(html).toMatch(/6 more practices are waiting on the required fixes above/);
    expect(html).toMatch(/10 could not be judged from this report/);
  });

  it("prints no such line when nothing is blocked", () => {
    const html = buildPrintablePlan({
      filename: "brief.pdf",
      grade: "A",
      score: 100,
      verdict: null,
      steps: [],
      bestPractices: [],
      bestPracticeBacklog: { blocked: 0, unjudged: 3 },
    } as never);
    expect(html).not.toMatch(/waiting on the required fixes/);
  });
});
