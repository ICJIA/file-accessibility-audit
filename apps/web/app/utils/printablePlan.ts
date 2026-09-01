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
import { safeHttpUrl, wcagSlugFor } from "@file-audit/shared";
import type { PlanStep } from "~/utils/actionPlan";
import type { ManualCheck } from "~/utils/manualReview";
import { sortBestPractices } from "~/utils/bestPractices";
import type { BestPracticeStatus, EvaluatedPractice } from "~/utils/bestPractices";
import { resolveRowLinks } from "~/utils/bestPractices/links";

export interface PrintablePlanOptions {
  filename: string;
  grade?: string | null;
  score?: number | null;
  /** The publish verdict, in the same words the report shows. */
  verdict?: string | null;
  steps: PlanStep[];
  /** Best practices, already evaluated. Printed FULLY EXPANDED — there is no
   *  show/hide on paper, and the holder of the printout may not be the
   *  person who chose which fix route to take. */
  bestPractices?: EvaluatedPractice[];
  manualChecks?: Array<ManualCheck & { label: string }>;
  /** WCAG criteria the tool does not evaluate at all. `url` is the server's
   *  Understanding-page address; it is safeHttpUrl-guarded before rendering
   *  (on the shared page this arrives from attacker-controlled stored JSON). */
  notAssessed?: Array<{ sc: string; name: string; level: string; url?: string }>;
  /** Understanding-page URL builder (useWcag().understandingUrl). When given,
   *  every criterion in the fix steps links to its W3C page — clickable in
   *  the browser tab, and printed in full by the print stylesheet's
   *  a[href]::after rule so it can be typed out from paper. */
  understandingUrl?: (slug: string) => string;
  /** The version's quick-reference URL — fallback for unknown criteria and
   *  the footer's "full standard" line. */
  wcagQuickref?: string;
  /** "WCAG 2.2 Level AA" — names the quick reference in the footer. */
  wcagLabel?: string;
  /** "ICJIA Accessibility Audit" — passed in so it follows a rebrand. */
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
ul.bp{list-style:none;padding:0;margin:0}
ul.bp>li{border:1px solid #bbb;border-radius:8px;padding:12px 14px;margin:0 0 12px;
 /* Same rule as li.step: a practice and its evidence must not straddle a
    page break. */
 break-inside:avoid;page-break-inside:avoid}
.bp-what,.bp-doc,.bp-why,.bp-fix{margin:4px 0}
.bp-cap{margin:8px 0 2px;font-size:12px;color:#555}
pre.bp-block{margin:0 0 8px;padding:8px 10px;background:#f4f4f4;border:1px solid #ddd;
 border-radius:4px;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.bp-standard{margin:6px 0 0;font-size:11px;color:#666}
.bp-links{margin:6px 0 0;font-size:12px;color:#444}
ul.checks{list-style:none;padding:0;margin:0}
ul.checks li{border-left:3px solid #bbb;padding:0 0 0 12px;margin:0 0 14px;
 break-inside:avoid;page-break-inside:avoid}
.verified{color:#1a7f37;font-size:13px;margin:2px 0 4px}
.caution{color:#9a6700;font-size:13px;margin:2px 0 4px;font-weight:600}
.confirm{color:#333;margin:0}
.note{border:1px solid #111;border-left-width:5px;border-radius:6px;padding:12px 14px;margin:0 0 18px}
/* Dashed on purpose: the same open-work border the on-screen band gives the
   human half. It qualifies the grade line directly above it. */
.limit{margin:10px 0 0;padding:12px 14px;border:2px dashed #666;border-radius:6px}
.limit-h{font-weight:700;font-size:14px;margin:0 0 4px}
.limit-body{margin:0;color:#333;font-size:13px}
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

function renderStep(step: PlanStep, criterionHref: (sc: string) => string | null): string {
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
        .map((w) => {
          const inner = `<code>WCAG ${escapeHtml(w.sc)}</code> ${escapeHtml(w.name)}`;
          const href = criterionHref(w.sc);
          return href ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner;
        })
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

// Friendlier prose than the on-screen chip's ALL-CAPS pill (BestPracticesSection.vue) —
// this reads as a sentence next to the practice's own label, not a compact status badge.
const STATUS_LABEL: Record<BestPracticeStatus, string> = {
  met: "Already done",
  "not-met": "Worth doing",
  "not-applicable": "Does not apply",
  "not-checked": "Not checked",
};

/** Each catalog practice belongs to exactly one format family — pdf, or one
 *  of docx/pptx/xlsx — never both (bestPractices/types.ts), so this single
 *  check is enough to pick the right fix-route labels. */
function isPdfPractice(practice: EvaluatedPractice["practice"]): boolean {
  return practice.formats.includes("pdf");
}

/** A best practice, expanded in full — there is no accordion on paper, and
 *  the person reading it may not be the one who generated it. Every
 *  document-derived value (evidence, the heading/link/font census block)
 *  passes escapeHtml; the catalog's own copy (label/description/why) is
 *  static, but is escaped too rather than trusted as a special case.
 *
 *  `understandingUrl` resolves each practice's `wcagSlugs` the same way
 *  BestPracticesSection.vue does on screen — both call resolveRowLinks() — those slugs
 *  are version-aware and can only be turned into a URL by the caller
 *  (useWcag() lives behind runtime config, unreachable from this
 *  module-scope catalog). Matters MORE on paper than on screen: the print
 *  stylesheet appends "(href)" after every link so it can be typed from the
 *  page, so a link this function drops is unrecoverable in a way a missing
 *  on-screen link is not. Absent (no resolver wired — only some tests; every
 *  PrintPlanButton caller passes one), wcagSlugs links are skipped entirely rather than
 *  rendering a broken href. */
function renderBestPractice(
  r: EvaluatedPractice,
  understandingUrl?: (slug: string) => string,
): string {
  const isPdf = isPdfPractice(r.practice);
  const evidence = r.evidence.length
    ? `<p class="bp-doc"><strong>Your document:</strong> ${r.evidence.map(escapeHtml).join(" ")}</p>`
    : "";
  const block = r.block
    ? `<p class="bp-cap">${escapeHtml(r.block.caption)}</p>` +
      `<pre class="bp-block">${r.block.lines.map(escapeHtml).join("\n")}</pre>`
    : "";
  // PDF has a real second tool (Acrobat, editing the exported file). Office
  // documents do not — office.ts's OFFICE_FIX_APP is a re-export reminder,
  // not a second route, and BestPracticesSection.vue's own history has a
  // fix for exactly this: a heading here once contradicted the very
  // sentence under it ("fixed at the source, not after export"). Same
  // information, no second-route label, for anything that isn't PDF.
  const fix = r.fix
    ? `<p class="bp-fix"><strong>In the source file (${isPdf ? "Word, InDesign" : "Word, PowerPoint, Excel"}):</strong> ${escapeHtml(r.fix.source)}</p>` +
      (isPdf
        ? `<p class="bp-fix"><strong>In the PDF (Acrobat):</strong> ${escapeHtml(r.fix.app)}</p>`
        : `<p class="bp-fix">${escapeHtml(r.fix.app)}</p>`)
    : "";
  // The citation (e.g. "PDF/UA (ISO 14289) clause 7.1") is independent of
  // whether the practice has any links — display-doc-title cites a standard
  // with links: [] — so it prints even when the links paragraph below does
  // not. On screen this sits under the same "Read more" label as the links
  // list (BestPracticesSection.vue); the printout is the artifact someone
  // may cite a decision from, so the provenance travels onto paper too.
  const standard = r.practice.standard
    ? `<p class="bp-standard">${escapeHtml(r.practice.standard)}</p>`
    : "";

  // wcagSlugs concatenated onto the practice's own links and run through
  // safeLinks TOGETHER, exactly as BestPracticesSection.vue does — a link
  // is the one thing on the page a reader is invited to click (or, here,
  // type out by hand), and an entry whose URL fails safeHttpUrl is DROPPED
  // rather than downgraded to plain text.
  const allLinks = resolveRowLinks(r, understandingUrl);
  const links = allLinks.length
    ? `<p class="bp-links">` +
      allLinks.map((l) => `<a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>`).join(" · ") +
      `</p>`
    : "";
  return (
    `<li><h3>${escapeHtml(r.practice.label)} — ${escapeHtml(STATUS_LABEL[r.status])}</h3>` +
    `<p class="bp-what">${escapeHtml(r.practice.description)}</p>` +
    evidence +
    block +
    `<p class="bp-why">${escapeHtml(r.practice.why)}</p>` +
    fix +
    standard +
    links +
    `</li>`
  );
}

export function buildPrintablePlan(o: PrintablePlanOptions): string {
  const appName = o.appName || "ICJIA Accessibility Audit";
  const when = (o.generatedAt ?? new Date()).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const heading = o.heading || "Accessibility fix plan";

  // Understanding-page link for a criterion number; quickref when the slug
  // is unknown; null (render plain text) when the caller wired no links.
  const criterionHref = (sc: string): string | null => {
    if (o.understandingUrl) {
      const slug = wcagSlugFor(sc);
      if (slug) return o.understandingUrl(slug);
    }
    return o.wcagQuickref ?? null;
  };

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
      `<ol class="steps">${o.steps.map((s) => renderStep(s, criterionHref)).join("")}</ol>`
    : `<h2>What to fix</h2><p class="none">Nothing — this document passed every automated check.</p>`;

  // Between "What to fix" and the human checks: best practices are
  // reported-but-never-scored, so they sit in their own group rather than
  // inside the fix count above it. sortBestPractices (bestPractices/index.ts)
  // is the ONE place NOT-MET-first ordering is defined — BestPracticesSection.vue
  // calls the same function, so a reader comparing the screen and the
  // printout sees the same rows in the same order, not the catalog's raw
  // declaration order scattering the one or two actionable rows among
  // mostly "Does not apply"/"Not checked".
  const sortedPractices = sortBestPractices(o.bestPractices ?? []);
  const practices = sortedPractices.length
    ? `<h2>Best practices — not scored</h2>` +
      // "everything here is optional work" was a LEGAL claim, and a stronger
      // one than the catalog supports (2026-08-31 WCAG audit). Two different
      // things sit in this list: items the law genuinely does not ask for
      // (PDF/UA and industry practice), and items WCAG does ask for but whose
      // judgment needs a human — vague link text meets 2.4.4 (Level A) when
      // the surrounding sentence carries the purpose, which no automated
      // check can read. Calling the second kind "optional" on paper, where
      // there is no row detail to correct it, is the overclaim. The screen
      // version makes only the score claim, which is true by construction.
      `<p class="sub">None of this affected the grade. The fixes above are everything WCAG 2.1 ` +
      `asks of this document that an automated check can find. Each practice below names the ` +
      `standard behind it — some are industry practice beyond what the law requires, others are ` +
      `things the law asks for that only a person can judge.</p>` +
      `<ul class="bp">${sortedPractices.map((r) => renderBestPractice(r, o.understandingUrl)).join("")}</ul>`
    : "";

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
      `<p class="sub">These were not machine-checked by this audit — each row says why, and ` +
      `some (contrast among them) other tools do measure. They are not failures — they are ` +
      `simply unexamined here.</p>` +
      `<ul class="na">` +
      (o.notAssessed ?? [])
        .map((n) => {
          const rawReason = (n as unknown as { reason?: unknown }).reason;
          const reason =
            typeof rawReason === "string" ? ` — <em>${escapeHtml(rawReason)}</em>` : "";
          const inner = `<code>WCAG ${escapeHtml(n.sc)}</code> ${escapeHtml(n.name)} (Level ${escapeHtml(n.level)})${reason}`;
          // The server sends each criterion's Understanding URL; on the
          // shared page it arrives from attacker-controlled stored JSON, so
          // a non-http(s) address is dropped rather than linked or printed.
          const safe = safeHttpUrl(n.url);
          return `<li>${safe ? `<a href="${escapeHtml(safe)}">${inner}</a>` : inner}</li>`;
        })
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
${
  // On every plan since v1.102.0 (it used to print only beside A/B grades):
  // the printout travels to whoever does the fixing, and they need the
  // checker's reach stated too. Self-contained copy — it no longer says
  // "the grade above", so a gradeless plan can carry it safely; the
  // footer's human-in-the-loop line still closes every plan.
  `<div class="limit"><p class="limit-h">&#9888; Automated checks cover a subset — a person checks the rest</p>` +
  `<p class="limit-body">Automated checkers — this one, Adobe Acrobat&rsquo;s, PAC, Word&rsquo;s — can only test the machine-checkable share ` +
  `of accessibility, roughly 30&ndash;40% of issues in independent tests (the UK government&rsquo;s ten-tool study; even Deque&rsquo;s own most ` +
  `optimistic figure is 57% of issue volume). Whether the document actually works with a screen reader — alt text that describes each ` +
  `image, headings that match their sections, a reading order that makes sense — can only be confirmed by a person.` +
  `${o.manualChecks?.length ? " The &ldquo;Still worth checking by hand&rdquo; section below is that half of the job." : ""}` +
  ` If you have additional questions about file accessibility, contact your agency accessibility coordinator.</p></div>`
}
${o.intro ? `<p class="note">${escapeHtml(o.intro)}</p>` : ""}
${steps}
${practices}
${checks}
${na}
<footer>
No automated audit can tell you a document is accessible — it can only tell you where it definitely
is not. Whatever the score, a person should look at the document before it is published.${
    o.wcagQuickref
      ? ` The full standard: <a href="${escapeHtml(o.wcagQuickref)}">${escapeHtml(o.wcagLabel ?? "WCAG")} quick reference</a>.`
      : ""
  }
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
