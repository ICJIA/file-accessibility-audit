/**
 * scripts/build-brief.mjs — regenerate the manager-facing brief with live numbers.
 *
 *   pnpm build-brief
 *
 * Reads docs/brief/checker-brief.template.{html,md}, fills every {{STAT}}
 * placeholder from LIVE sources — the production /status JSON, git itself, the
 * root package.json version — stamps today's date big and bold, and writes:
 *
 *   docs/brief/checker-brief.html   (standalone, opens anywhere)
 *   docs/brief/checker-brief.docx   (via pandoc; verified free of field codes)
 *   apps/web/app/data/trustBody.ts (the SAME content, rendered by /trust in-app)
 *   ~/Downloads/checker-brief.{html,docx}  (copies, when Downloads exists)
 *
 * RUN THIS BEFORE EVERY RELEASE COMMIT (user rule, 2026-08-28): the brief's
 * whole credibility is the big date stamp saying its numbers are at most a
 * few days old. The HTML artifact at claude.ai is republished from the fresh
 * docs/brief/checker-brief.html.
 *
 * The only hand-maintained numbers live in scripts/brief-stats.json (test
 * count, trap count) — both are printed in every release's CHANGELOG entry,
 * so updating them is a copy of a number you just wrote down.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fill as fillTemplate } from "./gateLogic.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRIEF = path.join(ROOT, "docs", "brief");
const fmt = (n) => Number(n).toLocaleString("en-US");
const git = (args) => execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8" }).trim();

// --- live production stats (fall back to the last committed output's numbers
//     never blocking a commit made offline) ---
let status = null;
try {
  const res = await fetch("https://audit.icjia.app/status?format=json", {
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) status = await res.json();
} catch {
  /* offline — fall through */
}
if (!status) {
  console.warn(
    "WARN: could not reach /status — production numbers reused from brief-stats.json cache",
  );
}

const manual = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "brief-stats.json"), "utf8"));
if (status) {
  manual.cache = {
    audits_total: status.documents_audited.total,
    audits_30d: status.documents_audited.last_30d,
    reaudited: status.document_progress_30d?.reaudited ?? manual.cache.reaudited,
    reached_a: status.document_progress_30d?.reached_a ?? manual.cache.reached_a,
  };
  fs.writeFileSync(
    path.join(ROOT, "scripts", "brief-stats.json"),
    JSON.stringify(manual, null, 2) + "\n",
  );
}
const live = manual.cache;

// --- git-derived stats ---
const commits = Number(git("rev-list --count HEAD"));
const commits30d = Number(git('rev-list --count --since="30 days ago" HEAD'));
const firstCommitAt = Number(git("log --reverse --format=%at").split("\n")[0]) * 1000;
const weeks = Math.round((Date.now() - firstCommitAt) / (7 * 86_400_000));
const MONTH_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];
const months = Math.round((Date.now() - firstCommitAt) / (30.44 * 86_400_000));
const monthsWord = MONTH_WORDS[months] ?? String(months);
const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const versions = version.split(".")[1]; // 1.117.0 → 117

// The /trust timeline is the section a sceptical reader scrolls to for "is
// this still maintained?", and it is hand-curated — not every release earns an
// entry, so this warns rather than fails. It shouts only when the newest entry
// has fallen a long way behind the version in the heading right above it.
{
  const tpl = fs.readFileSync(path.join(ROOT, "docs/brief/checker-brief.template.html"), "utf8");
  const timeline = tpl.slice(tpl.indexOf('class="timeline"'));
  const minors = [...timeline.matchAll(/class="ver mono">v1\.(\d+)/g)].map((m) => Number(m[1]));
  const newest = minors.length ? Math.max(...minors) : 0;
  const behind = Number(versions) - newest;
  if (behind > 5) {
    console.warn(
      `WARN: the /trust timeline's newest entry is v1.${newest}, ${behind} minor versions behind v${version}. ` +
        "Add an entry to docs/brief/checker-brief.template.html for anything a reader can see, or accept the gap deliberately.",
    );
  }
}

// --- the date stamp ---
const now = new Date();
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const dateBig = `${MON[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
const dateLong = now.toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

// --- the trap inventory modal (2026-08-28, user request): every trap
//     document, its plain-language label, and its verdict chip, rendered from
//     scripts/trap-manifest.json — which only a fully verified
//     `pnpm synthetic-controls` run may write. The count is pinned to
//     brief-stats.json so the page can never claim documents that were not
//     actually verified. ---
const pdfManifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts", "trap-manifest.json"), "utf8"),
);
const officeManifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts", "trap-manifest-office.json"), "utf8"),
);
// Sorted NUMERICALLY across both batteries (2026-08-29): the PDF battery's
// numbering resumed at 116 after the Office traps took 101–115, so a plain
// concatenation ended the modal at "synthetic-115" — and a reader scrolling
// to the bottom read that as the total ("this shows 115 — but there are nine
// more"). The count was always right; the ORDER told a false story.
const trapNum = (i) => Number(String(i.file ?? i.name ?? "").match(/synthetic-(\d+)/)?.[1] ?? 0);
const trapManifest = {
  count: pdfManifest.count + officeManifest.count,
  items: [...pdfManifest.items, ...officeManifest.items].sort((a, b) => trapNum(a) - trapNum(b)),
};
const trapBugs = trapManifest.items.filter((i) => i.chip === "bug").length;
// Fixed-number claims that history has already staled once are BANNED from
// the templates (user rule 2026-08-29: "always seek and fix these stats
// throughout the trust page"): counts must be {{PLACEHOLDER}}-driven or the
// sentence must be written countless. This list grows every time one slips.
{
  const banned = [
    /caught one of its own bugs/i,
    /\bone real bug\b/i,
    /\b1 real bug\b/,
    /Lost (one|two|three|four|five|\d+) public arguments/i,
    /See all \d+ trap documents/i,
    /All \d+ traps held(?!.*then in the battery)/i,
    // Fixed counts of the corpus and the Office battery. Both staled without
    // anyone noticing (the page said "fifteen" Office traps at 34, and named a
    // 136-document sweep at 187): every count is placeholder-driven or absent.
    /\b(fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\d+) native <strong>Word/i,
    /\d+-document corpus sweep/i,
    /\d+ real agency documents plus the \d+ traps/i,
  ];
  for (const t of ["checker-brief.template.html", "checker-brief.template.md"]) {
    const src = fs.readFileSync(path.join(BRIEF, t), "utf8");
    for (const re of banned) {
      if (re.test(src))
        throw new Error(
          `${t} contains a fixed-number claim matching ${re} — make it {{PLACEHOLDER}}-driven or countless`,
        );
    }
  }
}
// The transparency list is hand-written prose; the chips are data. They must
// agree, or the page understates its own record — fail the build, don't drift
// (the "caught one real bug" headline sat under five bug chips for a week).
{
  const templateHtml = fs.readFileSync(path.join(BRIEF, "checker-brief.template.html"), "utf8");
  const bugRows = (templateHtml.match(/class="bugrow"/g) ?? []).length;
  if (bugRows !== trapBugs)
    throw new Error(
      `the trust page details ${bugRows} bugs but the manifests carry ${trapBugs} bug chips — update the buglist in checker-brief.template.html`,
    );
}
if (trapManifest.count !== manual.traps)
  throw new Error(
    `manifests hold ${trapManifest.count} entries but brief-stats.json says traps=${manual.traps} — rerun pnpm synthetic-controls + synthetic-office-controls or fix brief-stats`,
  );
// The public dispute record, COUNTED from the cards rather than typed beside
// them. The prose said "three times ... two of the four it won" over four
// cards showing three losses and one win — 3 + 2 = 5, and it overstated the
// tool's record, which is the worst direction for a page whose whole argument
// is that it loses arguments honestly. A card marked "right" is a win; every
// other card is a loss.
const DISPUTE_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const disputeWord = (n) => DISPUTE_WORDS[n] ?? String(n);
/** "once" / "twice" / "three times" — the sentence reads "This one has X". */
const disputeTimes = (n) => (n === 1 ? "once" : n === 2 ? "twice" : `${disputeWord(n)} times`);
let disputesTotal = 0;
let disputesWon = 0;
{
  const tpl = fs.readFileSync(path.join(BRIEF, "checker-brief.template.html"), "utf8");
  const start = tpl.indexOf('class="disputes"');
  const end = tpl.indexOf('<p class="agree"', start);
  if (start === -1 || end === -1) throw new Error("cannot find the disputes block to count");
  const cards = tpl.slice(start, end).split('<div class="dis">').slice(1);
  disputesTotal = cards.length;
  // ONLY the span class, never the words. The LOSING cards say "The expert
  // was right" in their body copy, so matching that text inverted the record
  // — the page briefly claimed three wins and one loss, the exact opposite of
  // the truth, which is worse than the typo it replaced.
  disputesWon = cards.filter((c) => /class="right"/.test(c)).length;
  if (disputesTotal === 0)
    throw new Error("no dispute cards found — the counted prose would read zero");
}

const escHtml = (x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const chipFor = (i) =>
  i.chip === "bug"
    ? ["caught", i.chipText ?? "FOUND A REAL BUG"]
    : i.chip === "caught"
      ? ["held", i.chipText ?? "CAUGHT"]
      : ["clean", i.chipText ?? "PASSED CLEAN"];
const shortName = (f) => f.replace(/^(synthetic-\d+).*$/, "$1");
const TRAP_CARDS = trapManifest.items
  .map((i) => {
    const [cls, txt] = chipFor(i);
    return `<div class="trapm"><div class="name">${shortName(i.file)}</div><div class="what">${escHtml(i.label)}</div><span class="chip ${cls}">${escHtml(txt)}</span></div>`;
  })
  .join("");
const TRAP_LIST_MD = trapManifest.items
  .map((i) => `- **${shortName(i.file)}** — ${i.label} *(${chipFor(i)[1].toLowerCase()})*`)
  .join("\n");
const trapsCaught = trapManifest.items.filter((i) => i.chip === "caught").length;
const trapsHeld = trapManifest.items.filter((i) => i.chip === "held").length;
// The three chips must PARTITION the manifest. A typo'd chip value falls
// through chipFor()'s final branch and still renders a card, so the grid can
// show N documents while the sentence beneath it counts fewer: on 2026-08-31
// two traps carried chip "clean" (not a chip at all) and one caught defect was
// labelled "held", so the brief rendered 130 cards and claimed 56+66+6 = 128.
{
  const bucketed = trapsCaught + trapsHeld + trapBugs;
  if (bucketed !== trapManifest.count) {
    const strays = [...new Set(trapManifest.items.map((i) => i.chip))].filter(
      (c) => !["caught", "held", "bug"].includes(c),
    );
    throw new Error(
      `trap chips do not partition the manifest: ${trapsCaught} caught + ${trapsHeld} held + ${trapBugs} bug = ${bucketed}, but ${trapManifest.count} traps exist` +
        (strays.length
          ? `\n    unrecognised chip value(s): ${strays.map((c) => JSON.stringify(c)).join(", ")}`
          : ""),
    );
  }
}

const SUBS = {
  DATE_BIG: dateBig,
  DATE_LONG: dateLong,
  DATE_UPPER: dateLong.toUpperCase(),
  AUDITS_TOTAL: fmt(live.audits_total),
  AUDITS_30D: fmt(live.audits_30d),
  TESTS: fmt(manual.tests),
  TRAPS: String(manual.traps),
  TRAPS_REST: String(manual.traps - 9), // the trap grid shows 9 named tiles
  TRAP_CARDS,
  TRAP_LIST_MD,
  TRAPS_CAUGHT: String(trapsCaught),
  TRAPS_HELD: String(trapsHeld),
  TRAPS_BUGS: String(trapBugs),
  DISPUTES_TOTAL_WORD: disputeWord(disputesTotal),
  // Starts a sentence in both templates, so it ships capitalised.
  DISPUTES_WON_WORD: disputeWord(disputesWon).replace(/^./, (c) => c.toUpperCase()),
  DISPUTES_LOST_TIMES: disputeTimes(disputesTotal - disputesWon),
  COMMITS: String(commits),
  COMMITS_30D: String(commits30d),
  WEEKS: String(weeks),
  MONTHS_WORD: monthsWord,
  VERSIONS: String(versions),
  REAUDITED: String(live.reaudited),
  REACHED_A: String(live.reached_a),
};
const fill = (s) => fillTemplate(s, SUBS);

// --- html: fill and wrap into a standalone document ---
const htmlBody = fill(fs.readFileSync(path.join(BRIEF, "checker-brief.template.html"), "utf8"));
const styleEnd = htmlBody.indexOf("</style>") + "</style>".length;
const standalone =
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  htmlBody.slice(0, styleEnd) +
  "\n</head>\n<body>" +
  htmlBody.slice(styleEnd) +
  "\n</body>\n</html>\n";
fs.writeFileSync(path.join(BRIEF, "checker-brief.html"), standalone);

// The same content as a PAGE OF THE APP (v1.119.0): /trust renders this body
// inside the site's own header nav and footer. Derived from the SAME fill, so
// the site can never tell a different story than the document being emailed
// around — trustPage.test.ts pins that this body appears verbatim inside the
// standalone brief. The template's own footer is dropped here (the app layout
// provides the real one).
const appBody = htmlBody
  .slice(styleEnd)
  .replace(/\s*<footer>[\s\S]*?<\/footer>/, "")
  // Scripts stay out of the app body: v-html would never execute them, and
  // the page's own bundle (trust.vue) carries the equivalent behavior in a
  // CSP-legal place. trustPage.test.ts applies the same strip before its
  // containment assertion — and pins that the app body is script-free.
  .replace(/\s*<!-- Close goes BACK[\s\S]*?<\/script>/g, "")
  .replace(/\s*<script>[\s\S]*?<\/script>/g, "");
fs.writeFileSync(
  path.join(ROOT, "apps", "web", "app", "data", "trustBody.ts"),
  "// GENERATED by `pnpm build-brief` — do not edit; edit docs/brief/checker-brief.template.html\n" +
    "// and rerun. Rendered via v-html on pages/trust.vue: repo-authored template + machine stats\n" +
    "// only, no request-derived data — the same trust class as Section10AuditEntry.\n" +
    `export const TRUST_BODY: string = ${JSON.stringify(appBody)};\n` +
    `export const TRUST_STAMP: string = ${JSON.stringify(dateBig)};\n`,
);

// --- docx: fill markdown, pandoc, verify no field codes (user's global rule) ---
const md = fill(fs.readFileSync(path.join(BRIEF, "checker-brief.template.md"), "utf8"));
const mdTmp = path.join(os.tmpdir(), "checker-brief.md");
fs.writeFileSync(mdTmp, md);
execSync(`pandoc "${mdTmp}" -o "${path.join(BRIEF, "checker-brief.docx")}"`, { cwd: ROOT });
const fieldCodes = execSync(
  `unzip -p "${path.join(BRIEF, "checker-brief.docx")}" word/document.xml | grep -c 'w:instrText\\|w:fldChar' || true`,
  { encoding: "utf8", shell: "/bin/bash" },
).trim();
if (fieldCodes !== "0") throw new Error(`docx contains ${fieldCodes} field codes — must be 0`);

// --- sitemap.xml (2026-08-28, user request): regenerated here so <lastmod>
//     is honest — the same run that refreshes the trust page's numbers. Lists
//     every PUBLIC page and nothing robots.txt disallows (/status, /publist,
//     /api, /healthz stay out; a sitemap inviting crawlers to a disallowed
//     URL is an argument between two files). Pinned by seo.test.ts. ---
const SITE = "https://audit.icjia.app";
const isoDay = now.toISOString().slice(0, 10);
const pages = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/trust", priority: "0.8", changefreq: "weekly" },
  { path: "/announcements", priority: "0.7", changefreq: "weekly" },
  { path: "/technical-details", priority: "0.6", changefreq: "monthly" },
  { path: "/data-retention", priority: "0.5", changefreq: "monthly" },
  { path: "/wcag-2-2", priority: "0.5", changefreq: "monthly" },
];
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  pages
    .map(
      (p) =>
        `  <url>\n    <loc>${SITE}${p.path}</loc>\n    <lastmod>${isoDay}</lastmod>\n` +
        `    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
    )
    .join("\n") +
  "\n</urlset>\n";
fs.writeFileSync(path.join(ROOT, "apps", "web", "public", "sitemap.xml"), sitemap);

// --- convenience copies ---
const dl = path.join(os.homedir(), "Downloads");
if (fs.existsSync(dl)) {
  fs.copyFileSync(path.join(BRIEF, "checker-brief.html"), path.join(dl, "checker-brief.html"));
  fs.copyFileSync(path.join(BRIEF, "checker-brief.docx"), path.join(dl, "checker-brief.docx"));
}

console.log(`brief regenerated — stamped ${dateBig}`);
console.log(
  `  audits ${SUBS.AUDITS_TOTAL} (30d ${SUBS.AUDITS_30D}) · tests ${SUBS.TESTS} · traps ${SUBS.TRAPS} · ` +
    `commits ${SUBS.COMMITS} (${SUBS.COMMITS_30D}/30d) · ${SUBS.WEEKS} weeks · v-count ${SUBS.VERSIONS}`,
);
console.log(
  `  docs/brief/checker-brief.{html,docx}${fs.existsSync(dl) ? " + ~/Downloads copies" : ""}`,
);
console.log("  reminder: republish the claude.ai artifact from docs/brief/checker-brief.html");
