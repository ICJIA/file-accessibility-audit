/**
 * rebuild.sh is the production deploy script. It cannot be run against
 * production from a test, so this file pins it three ways:
 *
 *   1. it parses (`bash -n`);
 *   2. a text-level contract — the safety properties that are one careless
 *      edit away from disappearing (precedent: ecosystemConfig.test.ts);
 *   3. a rehearsal — the real script, run in a throwaway git checkout with
 *      stand-ins for pm2, pnpm and curl, through a healthy deploy, a deploy
 *      whose new version fails its health gate (automatic rollback), the
 *      opt-out, and `--check`.
 *
 * The rehearsal NEVER runs the script inside this repository: a copy is
 * committed to a temporary "origin", cloned, and run there with HOME pointed
 * at a temporary directory. If argument handling ever broke, the worst it
 * could do is `git checkout -- .` in a directory this test created.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(__dirname, "../../../..");
const scriptPath = join(root, "rebuild.sh");
const script = readFileSync(scriptPath, "utf8");

const hasBash = process.platform !== "win32" && spawnSync("bash", ["--version"]).status === 0;

/** The body of one shell function, from its opening line to the closing brace. */
function functionBody(name: string): string {
  const start = script.indexOf(`\n${name}() {\n`);
  if (start === -1) throw new Error(`${name}() not found in rebuild.sh`);
  const end = script.indexOf("\n}\n", start);
  return script.slice(start, end);
}

describe.skipIf(!hasBash)("rebuild.sh parses", () => {
  it("passes bash -n", () => {
    const res = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
  });
});

describe("rebuild.sh contract", () => {
  it("stops on the first failed command", () => {
    expect(script.split("\n").slice(0, 3)).toContain("set -e");
  });

  it("--check exits before anything is pulled, installed, built or restarted", () => {
    const checkExit = script.indexOf(
      'if [ "$_check_only" -eq 1 ]; then\n  echo ""\n  echo "Preflight',
    );
    expect(checkExit).toBeGreaterThan(-1);
    const exitAt = script.indexOf("\n  exit 0\nfi\n", checkExit);
    expect(exitAt).toBeGreaterThan(checkExit);
    for (const later of [
      "\ngit checkout -- .",
      "\ngit pull origin main",
      "_run pnpm install --frozen-lockfile",
      "\n  pm2 restart ecosystem.config.cjs --update-env\nfi",
    ]) {
      expect(script.indexOf(later), later).toBeGreaterThan(exitAt);
    }
  });

  it("--check writes no deploy log and does not touch a parked build", () => {
    expect(script).toContain('if [ "$_check_only" -eq 0 ] && [ -z "${REBUILD_LOG_FILE:-}" ]; then');
    expect(script).toContain('if [ "$_check_only" -eq 0 ] && [ -d "$_prev_output_dir" ]; then');
  });

  it("lists server-side edits and saves a patch before discarding them", () => {
    const checkout = script.indexOf("\ngit checkout -- .\n");
    const patch = script.indexOf('git diff --binary > "$_discard_patch"');
    const listing = script.indexOf("git status --short --untracked-files=no 2>/dev/null | sed");
    expect(patch).toBeGreaterThan(-1);
    expect(listing).toBeGreaterThan(-1);
    expect(patch).toBeLessThan(checkout);
    expect(listing).toBeLessThan(checkout);
    // Exactly one place discards, and it is the guarded one.
    expect(script.match(/^git checkout -- \.$/gm)).toHaveLength(1);
  });

  it("records the starting commit before the pull", () => {
    const record = script.indexOf("_pre_pull_sha=$(git rev-parse HEAD");
    expect(record).toBeGreaterThan(-1);
    expect(record).toBeLessThan(script.indexOf("\ngit pull origin main"));
  });

  it("keeps the previous web build until the health gate has passed", () => {
    const keep = script.indexOf('mv "$_prev_output_dir" "$_rollback_output_dir"');
    const healthy = script.indexOf('\n_stage="healthy"\n');
    const drop = script.indexOf('rm -rf "$_rollback_output_dir" 2>/dev/null || true');
    expect(keep).toBeGreaterThan(-1);
    expect(keep).toBeLessThan(script.indexOf('\n_stage="pm2-restart"\n'));
    expect(drop).toBeGreaterThan(healthy);
  });

  describe("automatic rollback", () => {
    const body = functionBody("_rollback_deploy");

    it("is defined before the health gate that calls it", () => {
      expect(script.indexOf("\n_rollback_deploy() {")).toBeLessThan(
        script.indexOf("_rollback_deploy || _rollback_rc=$?"),
      );
    });

    it("can be switched off with ROLLBACK_ON_FAILURE=false", () => {
      expect(body).toContain('if [ "${ROLLBACK_ON_FAILURE:-true}" = "false" ]; then');
    });

    it("does the steps in order: reset, previous build, install, restart, health gate", () => {
      const order = [
        'git reset --hard "$_pre_pull_sha" || return 2',
        'mv "$_rollback_output_dir" apps/web/.output',
        "_run pnpm install --frozen-lockfile || return 2",
        "pm2 restart ecosystem.config.cjs --update-env || return 2",
        '_wait_healthy "the API (previous version)" "$API_HEALTH_URL" || return 2',
        '_wait_healthy "the web app (previous version)" "$WEB_HEALTH_URL" || return 2',
      ].map((step) => body.indexOf(step));
      for (const at of order) expect(at).toBeGreaterThan(-1);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it("checks every step by hand (set -e is off inside a function called in an `if`)", () => {
      // Every command that changes something must be followed by a check.
      const mutating = body
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => /^(git reset|_run |pm2 (delete|start|save|restart))/.test(l));
      expect(mutating.length).toBeGreaterThanOrEqual(6);
      for (const line of mutating) expect(line, line).toMatch(/\|\| return 2$/);
    });

    it("never touches the database", () => {
      expect(body).not.toMatch(/restore-db|backup-db|audit\.db|sqlite/i);
    });

    it("never deletes other applications' PM2 processes", () => {
      for (const line of script.split("\n").filter((l) => /^\s*pm2 delete /.test(l))) {
        expect(line.trim()).toMatch(/^pm2 delete file-audit-api file-audit-web( \|\| return 2)?$/);
      }
    });

    it("exits non-zero whatever the rollback did, inside the gate's own block", () => {
      const call = script.indexOf("_rollback_deploy || _rollback_rc=$?");
      const blockEnd = script.indexOf("\nfi\n", call);
      const block = script.slice(call, blockEnd);
      expect(block).toContain('0)\n      _stage="rolled-back"');
      expect(block).toContain('*) _stage="rollback-failed" ;;');
      expect(block.trimEnd().endsWith("exit 1")).toBe(true);
    });

    it("tells the operator the database was not rolled back, and how to restore it", () => {
      const banner = script.slice(script.indexOf("    rolled-back)\n"));
      expect(banner).toContain("DATABASE WAS NOT ROLLED BACK");
      expect(banner).toContain("./scripts/restore-db.sh");
      expect(banner).toContain("REBUILD_LOG_FILE");
    });
  });
});

// ---------------------------------------------------------------------------
// Rehearsal
// ---------------------------------------------------------------------------

const hasGit = spawnSync("git", ["--version"]).status === 0;

describe.skipIf(!hasBash || !hasGit)("rebuild.sh rehearsal (stand-in pm2 / pnpm / curl)", () => {
  let box = "";
  let live = "";
  let v1 = "";
  let v2 = "";

  const sh = (cwd: string, command: string): string =>
    execFileSync("bash", ["-c", command], { cwd, encoding: "utf8" }).trim();
  const gitIdentity = "-c user.name=rehearsal -c user.email=rehearsal@example.invalid";
  const readBox = (name: string): string => readFileSync(join(box, name), "utf8").trim();

  /** Put the clone back to "v1 is deployed and healthy". */
  function reset(healthy: string[]): void {
    sh(live, `git reset -q --hard ${v1}`);
    rmSync(join(live, "apps/web/.output"), { recursive: true, force: true });
    rmSync(join(live, "apps/web/node_modules"), { recursive: true, force: true });
    mkdirSync(join(live, "apps/web/.output"), { recursive: true });
    mkdirSync(join(live, "apps/web/node_modules/.cache"), { recursive: true });
    writeFileSync(join(live, "apps/web/.output/built-from"), `${v1}\n`);
    writeFileSync(join(box, "running-sha"), `${v1}\n`);
    writeFileSync(join(box, "healthy-shas"), healthy.join("\n") + "\n");
    writeFileSync(join(box, "calls.log"), "");
    rmSync(join(box, "home"), { recursive: true, force: true });
    mkdirSync(join(box, "home"));
  }

  function run(args: string[] = [], env: Record<string, string> = {}) {
    const res = spawnSync("bash", ["./rebuild.sh", ...args], {
      cwd: live,
      encoding: "utf8",
      input: "",
      env: {
        ...process.env,
        HARNESS: box,
        HOME: join(box, "home"),
        PATH: `${join(box, "bin")}:${process.env.PATH}`,
        REMEDIATION_ENABLED: "false",
        HEALTH_WAIT_SECONDS: "0",
        SMOKE_URL: "http://public.invalid",
        REBUILD_LOG_DIR: "",
        REBUILD_LOG_FILE: "",
        REBUILD_REEXECED: "",
        REBUILD_PRE_PULL_SHA: "",
        ROLLBACK_ON_FAILURE: "",
        ...env,
      },
    });
    return { status: res.status, out: `${res.stdout}${res.stderr}` };
  }

  const head = (): string => sh(live, "git rev-parse HEAD");
  const webBuild = (): string =>
    readFileSync(join(live, "apps/web/.output/built-from"), "utf8").trim();
  const calls = (): string[] => readBox("calls.log").split("\n").filter(Boolean);
  const stateFiles = (): string[] =>
    existsSync(join(box, "home/deploy-logs")) ? readdirSync(join(box, "home/deploy-logs")) : [];

  beforeAll(() => {
    box = mkdtempSync(join(tmpdir(), "rebuild-rehearsal-"));
    mkdirSync(join(box, "bin"));
    const tool = (name: string, body: string) => {
      writeFileSync(join(box, "bin", name), `#!/bin/bash\n${body}\n`);
      chmodSync(join(box, "bin", name), 0o755);
    };
    // pm2: a restart "starts" whatever commit and web build are on disk.
    tool(
      "pm2",
      [
        'echo "pm2 $*" >> "$HARNESS/calls.log"',
        'case "$1" in',
        '  restart|start) git -C "$HARNESS/live" rev-parse HEAD > "$HARNESS/running-sha" ;;',
        '  jlist) echo "[]" ;;',
        '  --version) echo "0.0.0-rehearsal" ;;',
        "esac",
        "exit 0",
      ].join("\n"),
    );
    // pnpm: the web build writes a marker naming the commit it was built from.
    tool(
      "pnpm",
      [
        'echo "pnpm $*" >> "$HARNESS/calls.log"',
        'case "$*" in',
        '  "--version") echo "10.0.0-rehearsal" ;;',
        '  "--filter web build")',
        "    rm -rf apps/web/.output && mkdir -p apps/web/.output",
        "    git rev-parse HEAD > apps/web/.output/built-from ;;",
        "esac",
        "exit 0",
      ].join("\n"),
    );
    // curl: a local health URL answers 200 only when the "running" commit is
    // listed as healthy; anything public answers 200.
    tool(
      "curl",
      [
        'url="${@: -1}"',
        'case "$url" in',
        "  http://127.0.0.1:*)",
        '    if grep -qx "$(cat "$HARNESS/running-sha")" "$HARNESS/healthy-shas"; then printf 200; else printf 500; fi ;;',
        '  *format=json) printf \'{"verapdf":{"ok":true}}\' ;;',
        "  *) printf 200 ;;",
        "esac",
      ].join("\n"),
    );

    const src = join(box, "src");
    mkdirSync(src);
    writeFileSync(join(src, "rebuild.sh"), script);
    writeFileSync(
      join(src, "ecosystem.config.cjs"),
      readFileSync(join(root, "ecosystem.config.cjs")),
    );
    writeFileSync(
      join(src, "package.json"),
      JSON.stringify(
        {
          scripts: {
            build:
              "pnpm --filter @file-audit/analyzer build && pnpm --filter api build && pnpm --filter web build",
          },
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(join(src, ".gitignore"), "node_modules\n.output\n");
    writeFileSync(join(src, "app.txt"), "one\n");
    sh(src, `git init -q -b main . && git add -A && git ${gitIdentity} commit -q -m one`);
    v1 = sh(src, "git rev-parse HEAD");
    sh(box, "git clone -q --bare src origin.git && git clone -q origin.git live");
    live = join(box, "live");
    writeFileSync(join(src, "app.txt"), "two\n");
    sh(src, `git ${gitIdentity} commit -q -am two && git push -q ../origin.git main`);
    v2 = sh(src, "git rev-parse HEAD");
  }, 60_000);

  afterAll(() => {
    if (box) rmSync(box, { recursive: true, force: true });
  });

  it("--check reports and changes nothing", () => {
    reset([v1]);
    writeFileSync(join(live, "app.txt"), "edited on the server\n");
    const { status, out } = run(["--check"]);
    expect(out).toContain("Preflight summary");
    expect(out).toContain("M app.txt");
    expect(status).toBe(0);
    expect(out).not.toContain("Pulling latest changes");
    expect(head()).toBe(v1);
    expect(readFileSync(join(live, "app.txt"), "utf8")).toBe("edited on the server\n");
    expect(stateFiles()).toEqual([]);
    expect(calls()).toEqual(["pnpm --version", "pm2 --version"]);
  }, 60_000);

  it("a healthy deploy ends on the new commit, records it, and keeps a patch of discarded edits", () => {
    reset([v1, v2]);
    writeFileSync(join(live, "ecosystem.config.cjs"), "// edited on the server\n", { flag: "a" });
    const { status, out } = run();
    expect(out).toContain("Deployed: the API and the web app both answer");
    expect(status).toBe(0);
    expect(head()).toBe(v2);
    expect(webBuild()).toBe(v2);
    expect(readBox("running-sha")).toBe(v2);
    expect(readBox("home/deploy-logs/last-healthy-commit")).toBe(v2);
    expect(existsSync(join(live, "apps/web/node_modules/.cache/rebuild-rollback-output"))).toBe(
      false,
    );
    const patch = stateFiles().find((f) => f.startsWith("discarded-edits-"));
    expect(patch, out).toBeDefined();
    expect(readBox(`home/deploy-logs/${patch}`)).toContain("+// edited on the server");
    expect(out).toContain("M ecosystem.config.cjs");
  }, 60_000);

  it("a new version that fails its health gate is rolled back, and the run still fails", () => {
    reset([v1]);
    const { status, out } = run();
    expect(out).toContain("Rolling back automatically");
    expect(out).toContain("DEPLOY FAILED AND WAS ROLLED BACK.");
    expect(out).toContain("DATABASE WAS NOT ROLLED BACK");
    expect(status).toBe(1);
    expect(head()).toBe(v1);
    // The PREVIOUS build was put back — not rebuilt from the old commit.
    expect(webBuild()).toBe(v1);
    expect(calls().filter((c) => c === "pnpm --filter web build")).toHaveLength(1);
    expect(readBox("running-sha")).toBe(v1);
    expect(readBox("home/deploy-logs/last-healthy-commit")).toBe(v1);
    // Dependencies were restored for the old commit, then PM2 restarted again.
    const log = calls();
    const installs = log.flatMap((c, i) => (c === "pnpm install --frozen-lockfile" ? [i] : []));
    const restarts = log.flatMap((c, i) => (c.startsWith("pm2 restart ") ? [i] : []));
    expect(installs).toHaveLength(2);
    expect(restarts).toHaveLength(2);
    expect(installs[1]).toBeGreaterThan(restarts[0]!);
    expect(restarts[1]).toBeGreaterThan(installs[1]!);
  }, 60_000);

  it("ROLLBACK_ON_FAILURE=false leaves the failed version in place and says so", () => {
    reset([v1]);
    const { status, out } = run([], { ROLLBACK_ON_FAILURE: "false" });
    expect(out).not.toContain("Rolling back automatically");
    expect(out).toContain(
      "It was NOT rolled back automatically: ROLLBACK_ON_FAILURE=false was set.",
    );
    expect(out).toContain(`git reset --hard ${v1}`);
    expect(status).toBe(1);
    expect(head()).toBe(v2);
    expect(readBox("running-sha")).toBe(v2);
  }, 60_000);

  it("does not roll back onto a commit that was never the healthy one", () => {
    reset([v1]);
    mkdirSync(join(box, "home/deploy-logs"), { recursive: true });
    writeFileSync(join(box, "home/deploy-logs/last-healthy-commit"), "0".repeat(40) + "\n");
    const { status, out } = run();
    expect(out).not.toContain("Rolling back automatically");
    expect(out).toContain("It was NOT rolled back automatically: this run started from");
    expect(status).toBe(1);
    expect(head()).toBe(v2);
  }, 60_000);
});

// Added 2026-11-25 (user request): the smoke checks said the site answered,
// never which version answered.
describe("rebuild.sh — the smoke checks name the version that is live", () => {
  it("compares the live /status version with this checkout's and fails the smoke run on a mismatch", () => {
    expect(script).toContain("✓ app version -> v${_live_version}");
    expect(script).toMatch(/\[ "\$_live_version" = "\$_repo_version" \]/);
    const block = script.slice(script.indexOf("# Which version is live"));
    expect(block.slice(0, block.indexOf("✓ Deployed"))).toContain("_smoke_failed=1");
    expect(script).toContain('echo "  Version now live: v${_live_version}"');
  });

  it("the two extractions read the version out of real input", () => {
    const live = execFileSync(
      "bash",
      [
        "-c",
        `printf '%s' '{"status":"ok","version":"9.8.7","engines":{"verapdf":{"ok":true,"version":"1.30.1"}}}' | grep -o '"version":"[^"]*"' | head -n 1 | cut -d'"' -f4`,
      ],
      { encoding: "utf8" },
    ).trim();
    expect(live).toBe("9.8.7");
    const repo = execFileSync(
      "bash",
      ["-c", `grep -m 1 '"version"' package.json | cut -d'"' -f4`],
      {
        cwd: root,
        encoding: "utf8",
      },
    ).trim();
    expect(repo).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
