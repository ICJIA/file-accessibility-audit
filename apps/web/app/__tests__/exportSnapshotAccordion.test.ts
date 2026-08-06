import "./test-helpers";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useReportExport } from "../composables/useReportExport";
import type { ReportResult } from "../composables/useReportExport";

// ---------------------------------------------------------------------------
// Final-review Fix 1 (2026-08-06): snapshotReport() used to click every
// collapsed `[aria-expanded="false"]` toggle to "expand all" before cloning
// the live report DOM. The action plan's accordion is exclusive-open
// (opening one step closes whichever step was open), so clicking through the
// full list left every `.plan-step-body` `display: none` except the last one
// clicked — and the downloaded HTML file ships no JS, so those steps could
// never be revealed by the reader. This test drives the REAL snapshotReport()
// path (via the public exportHtml()) against a DOM fixture shaped like
// ActionPlan.vue's exclusive accordion (step A open, step B closed) plus a
// closed, non-exclusive TechnicalReport toggle, and asserts the fix's three
// parts together: plan-step buttons are never clicked (so the live accordion
// is never scrambled), the forced-visible CSS rule ships in the exported
// document, and the exported markup's aria-expanded is normalized to match
// what that CSS forces visible.
// ---------------------------------------------------------------------------

function minimalResult(): ReportResult {
  return {
    filename: "report.pdf",
    pageCount: 1,
    overallScore: 62,
    grade: "D",
    isScanned: false,
    executiveSummary: "sum",
    categories: [],
  };
}

describe("useReportExport — snapshotReport neutralizes the exclusive plan-step accordion (Fix 1)", () => {
  let capturedBlob: Blob | null;

  beforeEach(() => {
    capturedBlob = null;
    (URL as any).createObjectURL = vi.fn((b: Blob) => {
      capturedBlob = b;
      return "blob:mock-url";
    });
    (URL as any).revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  /**
   * Mirrors the DOM shape ActionPlan.vue + TechnicalReport.vue actually
   * render: two `.plan-step-body` elements behind an exclusive accordion
   * (step A open, step B closed — exactly what's left after a user opens a
   * step, or never touches step B at all) plus a closed `.tech-report-body`,
   * a normal (non-exclusive) collapsed section — the kind the expand-all
   * loop is still supposed to click open.
   */
  function mountFixture(): HTMLElement {
    const el = document.createElement("div");
    el.setAttribute("data-report-content", "");
    el.innerHTML = `
      <section>
        <button aria-expanded="true" aria-controls="plan-step-a">Step A</button>
        <div id="plan-step-a" class="plan-step-body">Body A content</div>
        <button aria-expanded="false" aria-controls="plan-step-b">Step B</button>
        <div id="plan-step-b" class="plan-step-body" style="display: none;">Body B content</div>
      </section>
      <section>
        <button aria-expanded="false" aria-controls="technical-report-body">Full technical report</button>
        <div id="technical-report-body" class="tech-report-body" style="display: none;">Tech body content</div>
      </section>
    `;
    document.body.appendChild(el);
    return el;
  }

  it("never clicks the plan-step accordion buttons, so the live page's accordion state is untouched", async () => {
    const el = mountFixture();
    const planA = el.querySelector('[aria-controls="plan-step-a"]')!;
    const planB = el.querySelector('[aria-controls="plan-step-b"]')!;
    const tech = el.querySelector('[aria-controls="technical-report-body"]')!;
    const planASpy = vi.fn();
    const planBSpy = vi.fn();
    const techSpy = vi.fn();
    planA.addEventListener("click", planASpy);
    planB.addEventListener("click", planBSpy);
    tech.addEventListener("click", techSpy);

    const { exportHtml } = useReportExport();
    await exportHtml(minimalResult());

    expect(planASpy).not.toHaveBeenCalled();
    expect(planBSpy).not.toHaveBeenCalled();
    // The non-exclusive technical-report toggle is still clicked open before
    // cloning, then clicked again afterward to restore the live page's state.
    expect(techSpy).toHaveBeenCalledTimes(2);
    // Untouched: step A is still open, step B is still closed on the LIVE page.
    expect(planA.getAttribute("aria-expanded")).toBe("true");
    expect(planB.getAttribute("aria-expanded")).toBe("false");
  });

  it("forces every plan-step body and the technical report visible in the exported document, regardless of captured inline styles", async () => {
    mountFixture();
    const { exportHtml } = useReportExport();
    await exportHtml(minimalResult());

    expect(capturedBlob).not.toBeNull();
    const html = await capturedBlob!.text();

    // (i) the forced-visible style rule ships in the exported document.
    expect(html).toMatch(
      /\.plan-step-body,\s*\.tech-report-body\s*\{\s*display:\s*block\s*!important;?\s*\}/,
    );

    // The closed step's (and the tech report's) own inline display:none
    // survive the clone verbatim — proving this exercises the real bug
    // scenario — but nothing is left un-overridden: the rule above lives in
    // the SAME document, so neither is actually hidden once rendered.
    expect(html).toMatch(/id="plan-step-b"[^>]*style="display: none;"/);
    expect(html).toContain("Body B content");
    expect(html).toContain("Tech body content");

    // (ii) ARIA state is normalized: nothing in the export still claims to be
    // collapsed while the CSS forces its content open.
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll('[aria-expanded="false"]').length).toBe(0);
    expect(doc.querySelector('[aria-controls="plan-step-b"]')!.getAttribute("aria-expanded")).toBe(
      "true",
    );
  });
});
