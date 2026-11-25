/**
 * scripts/releaseLib.ts — the pure half of `pnpm release` (scripts/release.ts).
 *
 * Everything here takes text and returns text: no file system, no git, no
 * network. That is what lets apps/api/src/__tests__/releaseScript.test.ts run
 * each step against small fixture copies of the three files a release writes
 * (CHANGELOG.md, README.md, securityAudits.ts) without touching the real ones.
 *
 * Every function that edits a document THROWS when it cannot find its anchor.
 * A release step that silently does nothing is the failure this script exists
 * to remove.
 */

/** The marker left wherever a person must still write prose. */
export const PLACEHOLDER = "TODO(release)";

export const PACKAGE_FILES = [
  "package.json",
  "apps/web/package.json",
  "apps/api/package.json",
  "apps/cli/package.json",
  "packages/shared/package.json",
  "packages/analyzer/package.json",
] as const;

export interface ReleaseNotes {
  /** Short name of the release: "Larger text on the two reference pages". */
  title: string;
  /** What changed, for the CHANGELOG. Plain language. */
  summary?: string;
  /** What the security review of this release found, in the reviewer's words. */
  securityNote?: string;
  /** The same finding in plain language, for the public security log (§ 10). */
  securityNotePlain?: string;
  /** What the review looked at, in a few plain words ("text size on two pages"). */
  scope?: string;
  /** CHANGELOG section heading. Default "Changed". */
  section?: "Added" | "Changed" | "Fixed" | "Security" | "Removed";
}

export interface TestCounts {
  total: number;
  files: number;
  api: number;
  web: number;
  cli: number;
}

/** What `pnpm audit --prod` said, for THIS release. Never typed by hand. */
export interface AuditOutcome {
  /** False when the command could not be run or its output could not be read. */
  ran: boolean;
  /** One sentence fragment for the security entries. */
  text: string;
  /** Counts by severity, when it ran. */
  counts?: Record<string, number>;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** "4837" → "4,837". Fixed en-US grouping; never locale-dependent. */
export function thousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) throw new Error(`not a plain x.y.z version: ${!pa ? a : b}`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d;
  }
  return 0;
}

/** patch | minor | major | an explicit x.y.z that is newer than `current`. */
export function nextVersion(current: string, bump: string): string {
  const m = SEMVER.exec(current);
  if (!m) throw new Error(`current version is not plain x.y.z: ${current}`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  switch (bump) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "major":
      return `${major + 1}.0.0`;
    default:
      if (!SEMVER.test(bump)) {
        throw new Error(`expected patch, minor, major or x.y.z — got "${bump}"`);
      }
      if (compareVersions(bump, current) <= 0) {
        throw new Error(`${bump} is not newer than the current version ${current}`);
      }
      return bump;
  }
}

/**
 * Replace the top-level "version" in a package.json, as text, so the file's
 * formatting and key order are left exactly as they were.
 */
export function bumpPackageJson(text: string, from: string, to: string): string {
  const needle = `"version": "${from}"`;
  const at = text.indexOf(needle);
  if (at === -1) throw new Error(`package.json does not carry "version": "${from}"`);
  if (text.indexOf(needle, at + needle.length) !== -1) {
    throw new Error(`package.json carries "version": "${from}" more than once`);
  }
  return text.slice(0, at) + `"version": "${to}"` + text.slice(at + needle.length);
}

const VERSION_BADGE = /(img\.shields\.io\/badge\/version-)(\d+\.\d+\.\d+)(-)/;

export function bumpReadmeBadge(readme: string, to: string): string {
  if (!VERSION_BADGE.test(readme)) throw new Error("README.md has no version badge to update");
  return readme.replace(VERSION_BADGE, `$1${to}$3`);
}

/** The newest version each of the three hand-written records carries. */
export function newestChangelogVersion(changelog: string): string | null {
  return /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)?.[1] ?? null;
}
export function newestReadmeSecurityVersion(readme: string): string | null {
  return /^### v(\d+\.\d+\.\d+) — /m.exec(readme)?.[1] ?? null;
}
export function newestSecurityLogVersion(source: string): string | null {
  const from = source.indexOf("export const SECURITY_AUDIT_ENTRIES");
  if (from === -1) return null;
  return /version:\s*"v(\d+\.\d+\.\d+)"/.exec(source.slice(from))?.[1] ?? null;
}

const todo = (what: string): string => `${PLACEHOLDER}: ${what}`;

const testsSentence = (counts: TestCounts | null): string =>
  counts
    ? `Tests ${thousands(counts.total)} across ${counts.files} files (API ${thousands(counts.api)} · Web ${thousands(counts.web)} · CLI ${thousands(counts.cli)}).`
    : todo("test counts — run `pnpm test`, or re-run `pnpm release` with --counts.");

/** A sentence ends with exactly one full stop, whatever the caller typed. */
const sentence = (s: string): string => {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/**
 * Insert a new `## [x.y.z] - date` section above the newest one.
 *
 *   ## [1.175.6] - 2026-11-18
 *
 *   ### Changed
 *
 *   - **Title.** Summary.
 *
 *   ### Notes
 *
 *   - Tests 4,837 across 275 files (API 2,655 · Web 2,085 · CLI 97).
 */
export function scaffoldChangelog(
  changelog: string,
  version: string,
  date: string,
  notes: ReleaseNotes,
  counts: TestCounts | null,
): string {
  const anchor = /^## \[\d+\.\d+\.\d+\]/m.exec(changelog);
  if (!anchor) throw new Error("CHANGELOG.md has no `## [x.y.z]` heading to insert above");
  if (changelog.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md already has a section for ${version}`);
  }
  const title = notes.title.trim().replace(/[.!?]+$/, "");
  const summary = notes.summary
    ? sentence(notes.summary)
    : todo("say what changed and why, in plain language.");
  const section =
    `## [${version}] - ${date}\n\n` +
    `### ${notes.section ?? "Changed"}\n\n` +
    `- **${title}.** ${summary}\n\n` +
    `### Notes\n\n` +
    `- ${testsSentence(counts)}\n\n`;
  return changelog.slice(0, anchor.index) + section + changelog.slice(anchor.index);
}

/**
 * The line that opens the folded block of earlier reviews in README § Security.
 * Only the newest review is shown open (owner request, 2026-11-25); every
 * earlier one sits inside this <details>, which is closed by one `</details>`
 * just before `## Changelog`. A release moves this line down past the entry it
 * adds, so the review that was newest is folded and the new one is open.
 */
export const EARLIER_REVIEWS_OPEN =
  "<details>\n<summary><strong>Earlier reviews</strong> — every release before this one, most recent first (select to open)</summary>\n\n";

/**
 * Insert a new entry at the top of README § Security → Review history.
 *
 *   ### v1.175.6 — 2026-11-18 · Title (scope)
 *
 *   Finding. `pnpm audit --prod`: result. Tests 4,837 green; …
 */
export function scaffoldReadmeSecurity(
  readme: string,
  version: string,
  date: string,
  notes: ReleaseNotes,
  audit: AuditOutcome,
  counts: TestCounts | null,
): string {
  const historyAt = readme.indexOf("### Review history");
  if (historyAt === -1) throw new Error("README.md has no `### Review history` section");
  // Lift the fold line out; it goes back in below the new entry, so that the
  // entry which was newest until now becomes the first one inside the fold.
  const foldAt = readme.indexOf(EARLIER_REVIEWS_OPEN, historyAt);
  const folded = foldAt !== -1;
  if (folded) {
    readme = readme.slice(0, foldAt) + readme.slice(foldAt + EARLIER_REVIEWS_OPEN.length);
  }
  const rest = readme.slice(historyAt);
  const anchor = /^### v\d+\.\d+\.\d+ — /m.exec(rest);
  if (!anchor) throw new Error("README.md review history has no `### vX.Y.Z — ` entry");
  if (rest.includes(`### v${version} — `)) {
    throw new Error(`README.md already has a security entry for v${version}`);
  }
  const title = notes.title.trim().replace(/[.!?]+$/, "");
  const scope = notes.scope
    ? notes.scope.trim()
    : todo('scope tag, e.g. "no new attack surface" or "SECURITY RELEASE"');
  const finding = notes.securityNote
    ? sentence(notes.securityNote)
    : todo("what the security review of this release looked at and what it found.");
  const tests = counts
    ? `Tests ${thousands(counts.total)} green.`
    : todo("test count, from a run made for this release.");
  const entry =
    `### v${version} — ${date} · ${title} (${scope})\n\n` +
    `${finding} \`pnpm audit --prod\`: ${audit.text} ${tests} ` +
    `${todo("confirm lint, format, typecheck and build are green, then say so here.")}\n\n`;
  const at = historyAt + anchor.index;
  return readme.slice(0, at) + entry + (folded ? EARLIER_REVIEWS_OPEN : "") + readme.slice(at);
}

/**
 * The public security log renders its strings with v-html and its own test
 * (securityAudits.test.ts) allows only inline formatting, no backticks and no
 * `${`. Backticked spans become <code>; anything else that could be markup is
 * escaped.
 */
export function toLogHtml(text: string): string {
  if (text.includes("${")) throw new Error("security-log text must not contain `${`");
  const escaped = text.replace(/&(?![a-z]+;|#\d+;)/gi, "&amp;").replace(/</g, "&lt;");
  const coded = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
  if (coded.includes("`")) throw new Error("security-log text has an unmatched backtick");
  return coded;
}

/**
 * Prepend an entry object to SECURITY_AUDIT_ENTRIES, in the exact layout the
 * existing entries (and prettier) use.
 */
export function scaffoldSecurityLog(
  source: string,
  version: string,
  date: string,
  notes: ReleaseNotes,
  audit: AuditOutcome,
): string {
  const opener = /export const SECURITY_AUDIT_ENTRIES: SecurityAuditEntry\[\] = \[\n/.exec(source);
  if (!opener) throw new Error("securityAudits.ts: cannot find the SECURITY_AUDIT_ENTRIES array");
  if (source.includes(`version: "v${version}"`)) {
    throw new Error(`securityAudits.ts already has an entry for v${version}`);
  }
  const scope = notes.scope
    ? notes.scope.trim().replace(/[.!?]+$/, "")
    : todo("what was reviewed, in a few plain words");
  const plain = notes.securityNotePlain ?? notes.securityNote;
  const finding = plain
    ? sentence(plain)
    : todo("what the review found, in plain language for auditors.");
  const html = toLogHtml(`${finding} Dependency scan for this release: ${audit.text}`);
  const entry =
    `  {\n` +
    `    version: ${JSON.stringify(`v${version}`)},\n` +
    `    meta: ${JSON.stringify(`Reviewed <strong>${date}</strong> &middot; scope: ${toLogHtml(scope)}.`)},\n` +
    `    body: [\n` +
    `      {\n` +
    `        kind: "p",\n` +
    `        html: ${JSON.stringify(html)},\n` +
    `      },\n` +
    `    ],\n` +
    `  },\n`;
  const at = opener.index + opener[0].length;
  return source.slice(0, at) + entry + source.slice(at);
}

/** Every line that still carries the placeholder, as "file:line: text". */
export function findPlaceholders(files: Record<string, string>): string[] {
  const hits: string[] = [];
  for (const [name, text] of Object.entries(files)) {
    text.split("\n").forEach((line, i) => {
      if (line.includes(PLACEHOLDER)) {
        // From the placeholder on: these lines can be very long, and what a
        // person needs to see is what is still to be written.
        const shown = line.slice(line.indexOf(PLACEHOLDER)).trim();
        hits.push(`${name}:${i + 1}: ${shown.length > 160 ? `${shown.slice(0, 157)}...` : shown}`);
      }
    });
  }
  return hits;
}

/**
 * Read `pnpm audit --prod --json`. pnpm exits non-zero when it FINDS
 * something, so the exit code alone cannot tell "found advisories" from
 * "could not run" — only parsable output with the severity table can.
 */
export function summarizeAudit(stdout: string): AuditOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      ran: false,
      text: todo("`pnpm audit --prod` did not return a readable result — run it by hand."),
    };
  }
  const table = (parsed as { metadata?: { vulnerabilities?: Record<string, number> } })?.metadata
    ?.vulnerabilities;
  if (!table || typeof table !== "object") {
    return {
      ran: false,
      text: todo("`pnpm audit --prod` returned no severity table — run it by hand."),
    };
  }
  const order = ["critical", "high", "moderate", "low", "info"];
  const found = order
    .map((level) => [level, Number(table[level] ?? 0)] as const)
    .filter(([, n]) => n > 0);
  const counts = Object.fromEntries(order.map((level) => [level, Number(table[level] ?? 0)]));
  if (found.length === 0) {
    return { ran: true, counts, text: "no known advisories in production dependencies." };
  }
  return {
    ran: true,
    counts,
    text:
      `${found.map(([level, n]) => `${n} ${level}`).join(", ")} in production dependencies. ` +
      todo("say what each advisory is and what was done about it."),
  };
}

/** Read the summary block scripts/test.ts prints. Null when it is not there. */
export function parseTestSummary(output: string): TestCounts | null {
  // eslint-disable-next-line no-control-regex
  const plain = output.replace(/\x1b\[[0-9;]*m/g, "");
  const suite = (name: string): number | null => {
    const m = new RegExp(`✔\\s+${name}\\s+(\\d+) passed \\((\\d+) files\\)`).exec(plain);
    return m ? Number(m[1]) : null;
  };
  const total = /✔ (\d+) tests passed across (\d+) files/.exec(plain);
  const [api, web, cli] = [suite("API"), suite("Web"), suite("CLI")];
  if (!total || api === null || web === null || cli === null) return null;
  const counts = { total: Number(total[1]), files: Number(total[2]), api, web, cli };
  if (api + web + cli !== counts.total) return null;
  return counts;
}

const README_TESTS_BADGE = /(img\.shields\.io\/badge\/tests-)\d+(%20passing)/;
const README_TESTS_LINE =
  /\*\*[\d,]+ tests\*\* across \d+ test files \(API [\d,]+ · Web [\d,]+ · CLI [\d,]+\)/;

/** The tests badge and the opening line of README § Tests. */
export function updateReadmeCounts(readme: string, counts: TestCounts): string {
  if (!README_TESTS_BADGE.test(readme)) throw new Error("README.md has no tests badge to update");
  if (!README_TESTS_LINE.test(readme)) {
    throw new Error("README.md § Tests has no `**N tests** across M test files (…)` line");
  }
  return readme
    .replace(README_TESTS_BADGE, `$1${counts.total}$2`)
    .replace(
      README_TESTS_LINE,
      `**${thousands(counts.total)} tests** across ${counts.files} test files ` +
        `(API ${thousands(counts.api)} · Web ${thousands(counts.web)} · CLI ${thousands(counts.cli)})`,
    );
}

/** scripts/brief-stats.json, edited as text so its layout survives. */
export function updateBriefStats(text: string, tests: number, traps: number): string {
  if (!/"tests": \d+/.test(text) || !/"traps": \d+/.test(text)) {
    throw new Error('brief-stats.json has no "tests" / "traps" numbers to update');
  }
  return text
    .replace(/"tests": \d+/, `"tests": ${tests}`)
    .replace(/"traps": \d+/, `"traps": ${traps}`);
}
