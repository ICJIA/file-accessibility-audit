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
 *   apps/web/public/trust.html     (the SAME page, served by the site itself)
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

// --- the date stamp ---
const now = new Date();
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const dateBig = `${MON[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
const dateLong = now.toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const SUBS = {
  DATE_BIG: dateBig,
  DATE_LONG: dateLong,
  DATE_UPPER: dateLong.toUpperCase(),
  AUDITS_TOTAL: fmt(live.audits_total),
  AUDITS_30D: fmt(live.audits_30d),
  TESTS: fmt(manual.tests),
  TRAPS: String(manual.traps),
  TRAPS_REST: String(manual.traps - 9), // the trap grid shows 9 named tiles
  COMMITS: String(commits),
  COMMITS_30D: String(commits30d),
  WEEKS: String(weeks),
  MONTHS_WORD: monthsWord,
  VERSIONS: String(versions),
  REAUDITED: String(live.reaudited),
  REACHED_A: String(live.reached_a),
};
const fill = (s) => {
  const out = s.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in SUBS)) throw new Error(`template placeholder with no value: {{${k}}}`);
    return SUBS[k];
  });
  const leftover = out.match(/\{\{\w+\}\}/);
  if (leftover) throw new Error(`unfilled placeholder: ${leftover[0]}`);
  return out;
};

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
// The same page, served by the site itself at /trust.html ("Can I trust
// this?" in both navs). BYTE-IDENTICAL to the brief by construction — pinned
// by trustPage.test.ts, so the site can never tell a different story than the
// document being emailed around.
fs.writeFileSync(path.join(ROOT, "apps", "web", "public", "trust.html"), standalone);

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
