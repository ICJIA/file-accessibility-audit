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
    // The technical-report toggle behaves like the real one: a click flips
    // its aria-expanded. (The plan-step buttons get no handler — they must
    // never be clicked at all.)
    const tech = el.querySelector('[aria-controls="technical-report-body"]')!;
    tech.addEventListener("click", () => {
      tech.setAttribute(
        "aria-expanded",
        tech.getAttribute("aria-expanded") === "true" ? "false" : "true",
      );
    });
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
    // …and the toggle that WAS clicked is back where the visitor left it.
    expect(tech.getAttribute("aria-expanded")).toBe("false");
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
    // (Since the static-export pass, the disclosure state is removed outright
    // along with the dead buttons that owned it — see the next describe.)
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll('[aria-expanded="false"]').length).toBe(0);
    expect(doc.querySelectorAll("[aria-expanded], [aria-controls]").length).toBe(0);
    expect(html).toContain("Step B");
  });
});

// ---------------------------------------------------------------------------
// The exported file is honest about being static, and the live page is put
// back. The download ships no script, yet it used to keep every disclosure
// button: focusable, announced as "button, expanded", and doing nothing. And
// the expand-all pass clicked the live page's toggles with no guarantee of
// clicking them back.
// ---------------------------------------------------------------------------
describe("useReportExport — the exported HTML has no dead controls", () => {
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

  function mount(html: string): HTMLElement {
    const el = document.createElement("div");
    el.setAttribute("data-report-content", "");
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }

  async function exported(): Promise<Document> {
    const { exportHtml } = useReportExport();
    await exportHtml(minimalResult());
    expect(capturedBlob).not.toBeNull();
    return new DOMParser().parseFromString(await capturedBlob!.text(), "text/html");
  }

  const FIXTURE = `
    <h2><button type="button" class="row-header flex" aria-expanded="true" aria-controls="b1"><span>Alt text</span> <span class="pill">Critical</span></button></h2>
    <div id="b1">Body one</div>
    <div role="button" tabindex="0" aria-pressed="false" class="chip">Chip</div>
    <button type="button" aria-label="Copy link"><svg aria-hidden="true"></svg></button>
    <span class="relative group"><button type="button" aria-describedby="na-tip" aria-label="Why?"><span aria-hidden="true">i</span></button><span id="na-tip" role="tooltip">Because.</span></span>
    <div data-export-exclude><button type="button">Switch view</button></div>
    <details><summary>More</summary><p>Details body</p></details>
    <a href="https://www.w3.org/WAI/">W3C</a>
    <input type="text" value="x">
    <div tabindex="0" class="scroller">Scrollable</div>
  `;

  it("turns script-dependent buttons into static text, keeping their content and classes", async () => {
    mount(FIXTURE);
    const doc = await exported();
    const header = doc.querySelector(".row-header")!;
    expect(header.tagName).toBe("SPAN");
    expect(header.classList.contains("flex")).toBe(true);
    expect(header.textContent).toContain("Alt text");
    expect(header.textContent).toContain("Critical");
    expect(header.hasAttribute("aria-expanded")).toBe(false);
    expect(header.hasAttribute("aria-controls")).toBe(false);
    expect(header.hasAttribute("type")).toBe(false);
    // Still inside its heading: the outline of the file is unchanged.
    expect(header.parentElement!.tagName).toBe("H2");
    expect(doc.body.textContent).toContain("Body one");
  });

  it("leaves nothing focusable that does nothing", async () => {
    mount(FIXTURE);
    const doc = await exported();
    const report = doc.querySelector(".report-export")!;
    // The only button left is the CSS-tooltip trigger, which still works.
    const buttons = Array.from(report.querySelectorAll("button"));
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute("aria-describedby")).toBe("na-tip");
    expect(report.querySelector("#na-tip")!.getAttribute("role")).toBe("tooltip");

    expect(report.querySelectorAll('[role="button"]')).toHaveLength(0);
    expect(
      report.querySelectorAll("[aria-pressed], [aria-expanded], [aria-controls]"),
    ).toHaveLength(0);
    expect(report.querySelector(".chip")!.hasAttribute("tabindex")).toBe(false);
    expect(report.querySelector(".scroller")!.hasAttribute("tabindex")).toBe(false);
    expect(report.querySelector("input")!.hasAttribute("disabled")).toBe(true);
    // Every remaining focusable element is one that works with no script.
    for (const n of Array.from(
      report.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]"),
    )) {
      const works =
        n.tagName === "A" ||
        n.tagName === "SUMMARY" ||
        n.hasAttribute("disabled") ||
        (n.tagName === "BUTTON" && n.hasAttribute("aria-describedby"));
      expect(works, n.outerHTML).toBe(true);
    }
  });

  it("drops export-excluded controls, keeps links, and opens native details", async () => {
    mount(FIXTURE);
    const doc = await exported();
    expect(doc.body.textContent).not.toContain("Switch view");
    expect(doc.querySelector('a[href="https://www.w3.org/WAI/"]')).not.toBeNull();
    expect(doc.querySelector("details")!.hasAttribute("open")).toBe(true);
    expect(doc.querySelector("summary")).not.toBeNull();
  });

  it("does not alter the live page's controls", async () => {
    const el = mount(FIXTURE);
    const before = el.innerHTML;
    await exported();
    expect(el.innerHTML).toBe(before);
    expect(el.querySelectorAll("button")).toHaveLength(4);
  });

  it("clicks back only a toggle that actually opened", async () => {
    const el = mount(`
      <button id="works" aria-expanded="false" aria-controls="w">Works</button>
      <button id="inert" aria-expanded="false" aria-controls="i">Inert</button>
    `);
    const works = el.querySelector<HTMLElement>("#works")!;
    const inert = el.querySelector<HTMLElement>("#inert")!;
    works.addEventListener("click", () =>
      works.setAttribute(
        "aria-expanded",
        works.getAttribute("aria-expanded") === "true" ? "false" : "true",
      ),
    );
    const worksSpy = vi.fn();
    const inertSpy = vi.fn();
    works.addEventListener("click", worksSpy);
    inert.addEventListener("click", inertSpy);

    await exported();

    expect(worksSpy).toHaveBeenCalledTimes(2);
    expect(works.getAttribute("aria-expanded")).toBe("false");
    // It ignored the first click; a second would be a stray click, not a restore.
    expect(inertSpy).toHaveBeenCalledTimes(1);
  });

  it("restores the page even when building the file fails, and returns focus", async () => {
    const el = mount(`
      <button id="t" aria-expanded="false" aria-controls="x">Toggle</button>
      <a id="keep" href="#x">Focused link</a>
    `);
    const t = el.querySelector<HTMLElement>("#t")!;
    t.addEventListener("click", () => {
      t.setAttribute(
        "aria-expanded",
        t.getAttribute("aria-expanded") === "true" ? "false" : "true",
      );
      // A real disclosure can pull focus when it opens.
      t.focus();
    });
    const keep = el.querySelector<HTMLElement>("#keep")!;
    keep.focus();
    (URL as any).createObjectURL = vi.fn(() => {
      throw new Error("blob store full");
    });

    const { exportHtml } = useReportExport();
    await expect(exportHtml(minimalResult())).rejects.toThrow("blob store full");

    expect(t.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(keep);
  });

  it("no longer exposes an `exporting` flag nothing ever read", () => {
    expect(useReportExport()).not.toHaveProperty("exporting");
  });
});
