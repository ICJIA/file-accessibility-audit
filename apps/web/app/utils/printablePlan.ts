/**
 * A printable, standalone action plan — the fixes and the human checks — as a
 * self-contained HTML document.
 *
 * WHY THIS EXISTS. The workflow this tool is built for is: drop a file, get a
 * grade, get fixes. That last step then required keeping a browser tab open
 * while working in Word or Acrobat, on a second monitor nobody has, and the
 * fix steps are precisely the part someone needs *next to the document* rather
 * than behind it. So they get a page they can print, save as PDF, or hand to
 * whoever actually edits the file.
 *
 * Deliberately its own renderer rather than a reuse of exportFormats/html.ts:
 * that one reproduces the whole report (score tiles, category bars, technical
 * signals, methodology) styled dark for reading on screen. This is the
 * opposite document — no score theatre, ink-friendly, every fix step expanded,
 * and BOTH routes (source document and Acrobat) always shown, because the
 * person holding the printout may not be the person who chose the route.
 *
 * Self-contained by construction: one inline <style>, no scripts, no external
 * requests. It is opened as a blob URL in a new tab, so it inherits no CSP and
 * loads nothing.
 *
 * Every interpolated value passes through escapeHtml — the plan carries
 * document-derived strings (findings quote alt text, link labels, titles).
 */
import { escapeHtml } from "~/utils/escapeHtml";
import { FIX_STEPS_VERSION_NOTE } from "~/utils/fixStepVersions";
import type { PlanStep } from "~/utils/actionPlan";
import type { ManualCheck } from "~/utils/manualReview";

export interface PrintablePlanOptions {
  filename: string;
  grade?: string | null;
  score?: number | null;
  /** The publish verdict, in the same words the report shows. */
  verdict?: string | null;
  steps: PlanStep[];
  manualChecks?: Array<ManualCheck & { label: string }>;
  /** WCAG criteria the tool does not evaluate at all. */
  notAssessed?: Array<{ sc: string; name: string; level: string }>;
  /** "Accessibility Audit" — passed in so it follows a rebrand. */
  appName?: string;
  /** Absolute URL of the report this was generated from, if there is one. */
  reportUrl?: string | null;
  /** Injected so tests are deterministic; defaults to now. */
  generatedAt?: Date;
  /** Heading, so the remediation page can say what this plan is about. */
  heading?: string;
  /** One line under the heading explaining the context. */
  intro?: string;
}

const STYLE = `
*{box-sizing:border-box}
body{margin:0;padding:32px 28px 48px;background:#fff;color:#111;
 font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
 max-width:52em;margin-inline:auto}
h1{font-size:22px;margin:0 0 4px}
h2{font-size:16px;margin:32px 0 10px;padding-bottom:6px;border-bottom:2px solid #111}
h3{font-size:14px;margin:0 0 2px}
.sub{color:#444;margin:0 0 2px}
.meta{color:#666;font-size:12px;margin:0}
.verdict{margin:14px 0 0;padding:10px 12px;border:2px solid #111;border-radius:6px;font-weight:600}
.grade{font-weight:700}
ol.steps{list-style:none;padding:0;margin:0}
li.step{border:1px solid #bbb;border-radius:8px;padding:14px 16px;margin:0 0 14px;
 /* A fix and its instructions must not straddle a page break — half a
    procedure is worse than a page with white space at the bottom. */
 break-inside:avoid;page-break-inside:avoid}
.step-head{display:flex;align-items:baseline;gap:10px;margin:0 0 4px}
.num{flex:0 0 auto;width:22px;height:22px;border-radius:50%;background:#111;color:#fff;
 font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.sev{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
 border:1px solid #111;border-radius:999px;padding:1px 7px}
.why{color:#333;margin:0 0 10px}
.route{margin:10px 0 0;padding:10px 12px;background:#f4f4f4;border-radius:6px}
.route-label{font-weight:700;font-size:13px;margin:0 0 6px}
.route ol{margin:0;padding-left:20px}
.route li{margin:0 0 4px}
.wcag{margin:10px 0 0;font-size:12px;color:#555}
.wcag code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#eee;
 padding:1px 5px;border-radius:3px}
ul.checks{list-style:none;padding:0;margin:0}
ul.checks li{border-left:3px solid #bbb;padding:0 0 0 12px;margin:0 0 14px;
 break-inside:avoid;page-break-inside:avoid}
.verified{color:#1a7f37;font-size:13px;margin:2px 0 4px}
.caution{color:#9a6700;font-size:13px;margin:2px 0 4px;font-weight:600}
.confirm{color:#333;margin:0}
.note{border:1px solid #111;border-left-width:5px;border-radius:6px;padding:12px 14px;margin:0 0 18px}
.na li{margin:0 0 4px}
footer{margin:36px 0 0;padding-top:12px;border-top:1px solid #bbb;color:#666;font-size:12px}
.none{color:#1a7f37;font-weight:600}
@media print{
 body{padding:0;max-width:none}
 /* Reduce ink; the borders carry the structure. */
 .route{background:transparent;border:1px solid #ccc}
 a{text-decoration:none;color:#111}
 a[href^="http"]::after{content:" (" attr(href) ")";font-size:11px;color:#555}
}
@page{margin:16mm}
`.trim();

function severityWord(s: string): string {
  return s === "Critical" ? "Critical — fix first" : s;
}

function renderStep(step: PlanStep): string {
  const routes = step.routes
    .map(
      (r) =>
        `<div class="route"><p class="route-label">${escapeHtml(r.label)}</p><ol>` +
        r.steps.map((t) => `<li>${escapeHtml(t)}</li>`).join("") +
        `</ol></div>`,
    )
    .join("");
  const wcag = step.wcagRefs.length
    ? `<p class="wcag">Meets: ` +
      step.wcagRefs
        .map((w) => `<code>WCAG ${escapeHtml(w.sc)}</code> ${escapeHtml(w.name)}`)
        .join(" · ") +
      `</p>`
    : "";
  return (
    `<li class="step"><div class="step-head">` +
    `<span class="num">${step.rank}</span>` +
    `<h3>${escapeHtml(step.title)}</h3>` +
    `<span class="sev">${escapeHtml(severityWord(step.severity))}</span>` +
    `</div>` +
    `<p class="why">${escapeHtml(step.why)}</p>` +
    routes +
    wcag +
    `</li>`
  );
}

export function buildPrintablePlan(o: PrintablePlanOptions): string {
  const appName = o.appName || "Accessibility Audit";
  const when = (o.generatedAt ?? new Date()).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const heading = o.heading || "Accessibility fix plan";

  const gradeBit =
    o.grade && typeof o.score === "number"
      ? `<span class="grade">Grade ${escapeHtml(o.grade)}</span> · ${o.score}/100`
      : o.grade
        ? `<span class="grade">Grade ${escapeHtml(o.grade)}</span>`
        : "";

  // The version note prints WITH the steps (not in the footer): the printout
  // is read next to Word/Acrobat, which is exactly where a menu mismatch is
  // discovered, and the holder of the paper may not be the person who
  // generated it.
  const steps = o.steps.length
    ? `<h2>What to fix${o.steps.length > 1 ? ` — ${o.steps.length} items, in order` : ""}</h2>` +
      `<p class="sub">${escapeHtml(FIX_STEPS_VERSION_NOTE)}</p>` +
      `<ol class="steps">${o.steps.map(renderStep).join("")}</ol>`
    : `<h2>What to fix</h2><p class="none">Nothing — this document passed every automated check.</p>`;

  const hasCaution = (o.manualChecks ?? []).some((c) => c.tone === "caution");
  const checks = (o.manualChecks ?? []).length
    ? `<h2>Still worth checking by hand</h2>` +
      `<p class="sub">These checks passed. Passing means the structure is there, not that it is right — ` +
      `only a person can judge that. None of these is a failure.` +
      (hasCaution
        ? ` Items marked with ! were not checked at all — the content was excluded from automated scoring, and the exclusion itself is what needs a look.`
        : "") +
      `</p>` +
      `<ul class="checks">` +
      (o.manualChecks ?? [])
        .map(
          (c) =>
            `<li><h3>${escapeHtml(c.label)}</h3>` +
            // A caution entry is NOT a passed check — the ✓ would claim a
            // verification that never happened (e.g. every image marked
            // decorative). Same tone rule as ManualReviewCard.
            (c.tone === "caution"
              ? `<p class="caution">! ${escapeHtml(c.verified)}</p>`
              : `<p class="verified">&#10003; ${escapeHtml(c.verified)}</p>`) +
            `<p class="confirm">${escapeHtml(c.confirm)}</p></li>`,
        )
        .join("") +
      `</ul>`
    : "";

  const na = (o.notAssessed ?? []).length
    ? `<h2>Not checked by this tool at all</h2>` +
      `<p class="sub">These need a person or a live interaction to judge, so no automated tool ` +
      `reports on them. They are not failures — they are simply unexamined.</p>` +
      `<ul class="na">` +
      (o.notAssessed ?? [])
        .map(
          (n) =>
            `<li><code>WCAG ${escapeHtml(n.sc)}</code> ${escapeHtml(n.name)} (Level ${escapeHtml(n.level)})</li>`,
        )
        .join("") +
      `</ul>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)} — ${escapeHtml(o.filename)}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${escapeHtml(heading)}</h1>
<p class="sub">${escapeHtml(o.filename)}</p>
<p class="meta">Generated ${escapeHtml(when)} by ${escapeHtml(appName)}${
    o.reportUrl ? ` · <a href="${escapeHtml(o.reportUrl)}">${escapeHtml(o.reportUrl)}</a>` : ""
  }</p>
${gradeBit ? `<p class="verdict">${gradeBit}${o.verdict ? ` — ${escapeHtml(o.verdict)}` : ""}</p>` : ""}
${o.intro ? `<p class="note">${escapeHtml(o.intro)}</p>` : ""}
${steps}
${checks}
${na}
<footer>
No automated audit can tell you a document is accessible — it can only tell you where it definitely
is not. Whatever the score, a person should look at the document before it is published.
</footer>
</body>
</html>`;
}

/**
 * Open a built plan in a new tab, as a blob URL.
 *
 * Must be called directly from a click handler or the browser treats it as a
 * popup and blocks it. The object URL is revoked on a timer rather than
 * immediately: revoking it in the same tick can race the new tab's load in
 * Safari and produce a blank page.
 */
export function openPrintablePlan(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
