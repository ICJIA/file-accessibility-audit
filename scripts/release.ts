/**
 * scripts/release.ts — prepare a release in one step.
 *
 *   pnpm release <patch|minor|major|x.y.z> [options]
 *   pnpm release --verify
 *
 * What a release used to be, by hand: a CHANGELOG entry, the version in six
 * package.json files, the README badge and test counts, a README § Security
 * entry, a securityAudits.ts entry, scripts/brief-stats.json, `pnpm
 * build-brief`, and an annotated tag. A missed step passed every check. This
 * script writes all of the mechanical parts and leaves a marked
 * `TODO(release)` wherever a person must still write prose.
 *
 * What it never does: push. And unless --commit / --tag are passed it does
 * not commit or tag either — it prepares the files and prints the git
 * commands. Pushing to main does NOT deploy; deploys are a separate, manual
 * step on the server (docs/deploys.md).
 *
 * Options
 *   --title "…"          short name of the release (required unless --notes-file)
 *   --summary "…"        what changed, for the CHANGELOG
 *   --security-note "…"  what the security review of this release found
 *   --scope "…"          what the review looked at, in a few plain words
 *   --notes-file f.json  the same fields as JSON:
 *                        { "title", "summary", "securityNote",
 *                          "securityNotePlain", "scope", "section" }
 *   --counts             run the test suite (scripts/test.ts), write the real
 *                        counts into README + brief-stats.json, then run
 *                        `pnpm build-brief`
 *   --dry-run            print a unified diff of every change; write nothing
 *   --allow-dirty        run although the working tree has other changes
 *   --commit             commit the release files (refused while any
 *                        TODO(release) placeholder remains)
 *   --tag                with --commit: also create the annotated tag vX.Y.Z
 *   --verify             change nothing: check that the versions agree and no
 *                        TODO(release) placeholder is left, then exit
 *
 * The pure steps live in scripts/releaseLib.ts and are unit-tested in
 * apps/api/src/__tests__/releaseScript.test.ts. See docs/releasing.md.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PACKAGE_FILES,
  PLACEHOLDER,
  bumpPackageJson,
  bumpReadmeBadge,
  findPlaceholders,
  newestChangelogVersion,
  newestReadmeSecurityVersion,
  newestSecurityLogVersion,
  nextVersion,
  parseTestSummary,
  scaffoldChangelog,
  scaffoldReadmeSecurity,
  scaffoldSecurityLog,
  summarizeAudit,
  updateBriefStats,
  updateReadmeCounts,
  type AuditOutcome,
  type ReleaseNotes,
  type TestCounts,
} from "./releaseLib.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const CHANGELOG = "CHANGELOG.md";
const README = "README.md";
const SECURITY_LOG = "apps/web/app/data/securityAudits.ts";
const BRIEF_STATS = "scripts/brief-stats.json";
/** Files `pnpm build-brief` rewrites; committed with the release when it ran. */
const BRIEF_OUTPUTS = [
  "docs/brief/checker-brief.html",
  "docs/brief/checker-brief.docx",
  "apps/web/app/data/trustBody.ts",
  "apps/web/public/sitemap.xml",
  BRIEF_STATS,
];

const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");
const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

function fail(message: string): never {
  console.error(`\nrelease: ${message}\n`);
  process.exit(1);
}

interface Options {
  bump: string | null;
  notes: ReleaseNotes;
  counts: boolean;
  dryRun: boolean;
  allowDirty: boolean;
  commit: boolean;
  tag: boolean;
  verify: boolean;
}

function parseArgs(argv: string[]): Options {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const positional: string[] = [];
  const takesValue = ["--title", "--summary", "--security-note", "--scope", "--notes-file"];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (takesValue.includes(arg)) {
      const value = argv[++i];
      if (value === undefined) fail(`${arg} needs a value`);
      values[arg] = value;
    } else if (arg.startsWith("--")) {
      flags.add(arg);
    } else {
      positional.push(arg);
    }
  }
  const known = [
    "--counts",
    "--dry-run",
    "--allow-dirty",
    "--commit",
    "--tag",
    "--verify",
    "--help",
  ];
  for (const flag of flags) if (!known.includes(flag)) fail(`unknown option ${flag}`);
  if (flags.has("--help")) {
    console.log(
      read("scripts/release.ts")
        .split("*/")[0]!
        .replace(/^\/\*\*\n?/, ""),
    );
    process.exit(0);
  }
  if (positional.length > 1) fail(`expected one version argument, got: ${positional.join(" ")}`);

  let notes: Partial<ReleaseNotes> = {};
  if (values["--notes-file"]) {
    try {
      notes = JSON.parse(fs.readFileSync(path.resolve(values["--notes-file"]), "utf8"));
    } catch (e) {
      fail(`cannot read --notes-file: ${(e as Error).message}`);
    }
  }
  if (values["--title"]) notes.title = values["--title"];
  if (values["--summary"]) notes.summary = values["--summary"];
  if (values["--security-note"]) notes.securityNote = values["--security-note"];
  if (values["--scope"]) notes.scope = values["--scope"];

  return {
    bump: positional[0] ?? null,
    notes: notes as ReleaseNotes,
    counts: flags.has("--counts"),
    dryRun: flags.has("--dry-run"),
    allowDirty: flags.has("--allow-dirty"),
    commit: flags.has("--commit"),
    tag: flags.has("--tag"),
    verify: flags.has("--verify"),
  };
}

/** `pnpm audit --prod`, run now, for this release. Read-only. */
function runAudit(): AuditOutcome {
  console.log("Running pnpm audit --prod …");
  const res = spawnSync("pnpm", ["audit", "--prod", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const outcome = summarizeAudit(res.stdout ?? "");
  console.log(
    outcome.ran
      ? `  result: ${outcome.text}`
      : "  could NOT be run or read — the security entries get a placeholder, not a result.",
  );
  return outcome;
}

/** The whole suite through scripts/test.ts, output shown as it runs. */
function runTests(): TestCounts {
  console.log("Running the test suite (scripts/test.ts) …");
  const res = spawnSync("pnpm", ["test"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
  process.stdout.write(res.stdout ?? "");
  if (res.status !== 0) fail("the test suite failed — a release is not prepared over red tests.");
  const counts = parseTestSummary(res.stdout ?? "");
  if (!counts) fail("the test summary could not be read — counts are not guessed. Stopping.");
  return counts;
}

function trapCount(): number {
  const count = (rel: string): number => (JSON.parse(read(rel)) as { count: number }).count;
  return count("scripts/trap-manifest.json") + count("scripts/trap-manifest-office.json");
}

/** A unified diff of old → new for one file, labelled with its repo path. */
function unifiedDiff(rel: string, next: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "release-dry-run-"));
  try {
    const tmp = path.join(dir, path.basename(rel));
    fs.writeFileSync(tmp, next);
    const res = spawnSync("git", ["diff", "--no-index", "--no-color", "--", rel, tmp], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return (res.stdout ?? "")
      .split("\n")
      .map((line) =>
        line.startsWith("diff --git ")
          ? `diff --git a/${rel} b/${rel}`
          : line.startsWith("+++ ")
            ? `+++ b/${rel}`
            : line,
      )
      .join("\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function verify(): never {
  const versions = PACKAGE_FILES.map(
    (rel) => [rel, (JSON.parse(read(rel)) as { version: string }).version] as const,
  );
  const root = versions[0]![1];
  const problems: string[] = [];
  for (const [rel, v] of versions)
    if (v !== root) problems.push(`${rel} is at ${v}, root at ${root}`);
  const readme = read(README);
  const records: [string, string | null][] = [
    ["README version badge", /badge\/version-(\d+\.\d+\.\d+)-/.exec(readme)?.[1] ?? null],
    ["newest CHANGELOG heading", newestChangelogVersion(read(CHANGELOG))],
    ["newest README § Security entry", newestReadmeSecurityVersion(readme)],
    ["newest securityAudits.ts entry", newestSecurityLogVersion(read(SECURITY_LOG))],
  ];
  for (const [what, v] of records) if (v !== root) problems.push(`${what} is ${v ?? "missing"}`);
  const left = findPlaceholders({
    [CHANGELOG]: read(CHANGELOG),
    [README]: readme,
    [SECURITY_LOG]: read(SECURITY_LOG),
  });
  if (left.length) problems.push(`${left.length} ${PLACEHOLDER} placeholder(s) left:`, ...left);
  if (problems.length) fail(`not ready to commit (v${root}):\n  ${problems.join("\n  ")}`);
  console.log(`release: v${root} is consistent and has no ${PLACEHOLDER} placeholders.`);
  process.exit(0);
}

function main() {
  // tsx hands a `--tsconfig` choice to child processes as a RELATIVE path in
  // TSX_TSCONFIG_PATH. The suites this script can start spawn tsx workers from
  // other directories, where that path does not exist. `pnpm release` is
  // defined without --tsconfig; this covers anyone who runs it another way.
  delete process.env.TSX_TSCONFIG_PATH;
  const opts = parseArgs(process.argv.slice(2));
  if (opts.verify) verify();
  if (!opts.bump) fail("say which version: patch, minor, major, or x.y.z (see --help)");
  if (!opts.notes.title?.trim()) fail("a release needs --title (or a --notes-file with one)");
  if (opts.tag && !opts.commit) {
    fail("--tag needs --commit: a tag made now would point at the commit BEFORE the release.");
  }
  if (opts.dryRun && (opts.commit || opts.tag)) fail("--dry-run cannot be combined with --commit");

  const dirty = git("status", "--porcelain");
  if (dirty) {
    if (opts.dryRun) {
      console.log(
        "NOTE: the working tree has other changes (a dry run writes nothing, so it goes on).",
      );
    } else if (!opts.allowDirty) {
      fail(
        "the working tree is not clean. Commit or stash first, or pass --allow-dirty.\n" +
          dirty
            .split("\n")
            .slice(0, 15)
            .map((l) => `  ${l}`)
            .join("\n"),
      );
    } else {
      console.log(
        "NOTE: --allow-dirty: other changes in the tree are left alone and not committed.",
      );
    }
  }

  const current = (JSON.parse(read("package.json")) as { version: string }).version;
  let version: string;
  try {
    version = nextVersion(current, opts.bump);
  } catch (e) {
    fail((e as Error).message);
  }
  for (const rel of PACKAGE_FILES) {
    const v = (JSON.parse(read(rel)) as { version: string }).version;
    if (v !== current) fail(`${rel} is at ${v} but the root is at ${current} — fix that first.`);
  }
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  console.log(`\nPreparing v${version} (from v${current}), dated ${date}\n`);

  const audit = runAudit();

  let counts: TestCounts | null = null;
  if (opts.counts) {
    if (opts.dryRun) {
      console.log(
        "--counts: a dry run does not run the suite or build-brief; counts shown as placeholders.",
      );
    } else {
      counts = runTests();
    }
  }

  // Every change is computed in memory first. Nothing is written until all of
  // it has been computed without an error, so a missing anchor in the last
  // file cannot leave the first five half-released.
  const next: Record<string, string> = {};
  try {
    for (const rel of PACKAGE_FILES) next[rel] = bumpPackageJson(read(rel), current, version);
    let readme = bumpReadmeBadge(read(README), version);
    readme = scaffoldReadmeSecurity(readme, version, date, opts.notes, audit, counts);
    if (counts) readme = updateReadmeCounts(readme, counts);
    next[README] = readme;
    next[CHANGELOG] = scaffoldChangelog(read(CHANGELOG), version, date, opts.notes, counts);
    next[SECURITY_LOG] = scaffoldSecurityLog(read(SECURITY_LOG), version, date, opts.notes, audit);
    if (counts) next[BRIEF_STATS] = updateBriefStats(read(BRIEF_STATS), counts.total, trapCount());
  } catch (e) {
    fail(`${(e as Error).message}\nNothing was written.`);
  }

  const placeholders = findPlaceholders({
    [CHANGELOG]: next[CHANGELOG]!,
    [README]: next[README]!,
    [SECURITY_LOG]: next[SECURITY_LOG]!,
  });

  if (opts.dryRun) {
    for (const [rel, text] of Object.entries(next)) process.stdout.write(unifiedDiff(rel, text));
    console.log(`\nDRY RUN — nothing was written. ${Object.keys(next).length} files would change.`);
    if (placeholders.length) {
      console.log(
        `${placeholders.length} ${PLACEHOLDER} placeholder(s) would be left for a person:`,
      );
      for (const p of placeholders) console.log(`  ${p}`);
    }
    return;
  }

  if (opts.commit && placeholders.length) {
    fail(
      `--commit refused: ${placeholders.length} ${PLACEHOLDER} placeholder(s) would be committed.\n  ` +
        placeholders.join("\n  ") +
        "\nGive the missing text (--summary, --security-note, --scope, --counts) or run without\n" +
        "--commit, write the prose by hand, and commit with the commands that prints.\n" +
        "Nothing was written.",
    );
  }

  for (const [rel, text] of Object.entries(next)) fs.writeFileSync(path.join(ROOT, rel), text);
  console.log(`\nWrote ${Object.keys(next).length} files.`);

  const toCommit = [...Object.keys(next)];
  if (opts.counts) {
    console.log("\nRunning pnpm build-brief …");
    const res = spawnSync("pnpm", ["build-brief"], { cwd: ROOT, stdio: "inherit" });
    if (res.status !== 0)
      fail("pnpm build-brief failed — the files above ARE written; fix and re-run it.");
    for (const rel of BRIEF_OUTPUTS) if (!toCommit.includes(rel)) toCommit.push(rel);
  }

  const subject = `release: v${version} — ${opts.notes.title.trim().replace(/[.!?]+$/, "")}`;
  const tagMessage = `v${version} — ${opts.notes.title.trim().replace(/[.!?]+$/, "")}`;
  const quoted = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

  if (opts.commit) {
    git("add", "--", ...toCommit);
    git("commit", "-m", subject);
    console.log(`\nCommitted: ${subject}`);
    if (opts.tag) {
      git("tag", "-a", `v${version}`, "-m", tagMessage);
      console.log(`Tagged:    v${version}`);
    }
  }

  console.log("\n" + "─".repeat(70));
  if (!opts.commit) {
    if (placeholders.length) {
      console.log(`Write the prose first — ${placeholders.length} ${PLACEHOLDER} placeholder(s):`);
      for (const p of placeholders) console.log(`  ${p}`);
      console.log("");
    }
    console.log("Then, in this order:");
    if (!opts.counts) {
      console.log(
        "  pnpm test                # put the real counts in CHANGELOG, README, brief-stats.json",
      );
      console.log("  pnpm build-brief         # after the counts; rewrites the trust page files");
    }
    console.log("  pnpm lint && pnpm format:check && pnpm typecheck && pnpm build");
    console.log("  pnpm release --verify    # versions agree, no placeholder left");
    const files = [...toCommit, ...BRIEF_OUTPUTS.filter((f) => !toCommit.includes(f))];
    console.log(`  git add -- ${files.join(" ")}`);
    console.log(`  git commit -m ${quoted(subject)}`);
  }
  if (!opts.tag) console.log(`  git tag -a v${version} -m ${quoted(tagMessage)}`);
  console.log(
    "  git push origin main && git push origin v" +
      version +
      "   # by hand — this script never pushes",
  );
  console.log("");
  console.log("Not done by this script:");
  console.log(
    "  - the announcement banner in audit.config.ts, if visitors should hear about this release;",
  );
  console.log("  - republishing the trust brief from docs/brief/checker-brief.html;");
  console.log("  - DEPLOYING. Pushing to main does not deploy. The server is updated by hand");
  console.log("    (./rebuild.sh on the server — docs/deploys.md), then `pnpm prod-sentinels`.");
  console.log("─".repeat(70));
}

main();
