/**
 * scripts/e2e-smoke.ts — drive the built app in a real browser, once.
 *
 *   pnpm e2e                                  start the API + the built web app, test, stop them
 *   pnpm e2e --base-url http://localhost:5102 test an instance that is already running
 *   pnpm e2e --headed                         watch it happen
 *
 * WHY: the unit suites mount components in happy-dom and call routes
 * in-process. Nothing loaded the real pages in a real browser, uploaded a file
 * through the real file input, or ran an accessibility check on the checker's
 * OWN pages. An accessibility checker with an inaccessible upload form is the
 * one bug this project cannot afford, and nothing would have caught it.
 *
 * What it does, with headless Chromium:
 *   1. loads `/`, uploads a tracked fixture PDF through the page's own
 *      <input type="file">, and waits for the grade;
 *   2. checks the report rendered and that "Download report as JSON" produces
 *      a file that parses;
 *   3. runs axe-core (WCAG 2.0 + 2.1, levels A and AA) on `/`, on the result
 *      view, and on /trust, /data-retention, /technical-details,
 *      /announcements, /wcag-2-2 and /status — any violation fails the run.
 *
 * NO NEW DEPENDENCY: puppeteer and @axe-core/puppeteer are already
 * dependencies of apps/api (the web-page audit service). They are resolved
 * from there, so the root package.json gains nothing.
 *
 * PORTS: the built web app forwards /api to the API on DEPLOY.API_PORT (5103)
 * — that address is compiled into the build — so the API must be on 5103. The
 * web app itself is started on a free port. If 5103 is taken, stop what is
 * using it or pass --base-url. The API is started with DB_PATH in a temporary
 * directory: the developer's database is never opened.
 *
 * SELECTORS are the hooks the app already carries for its own tests
 * (data-testid, aria-label) and are listed once, in HOOKS, so a UI change
 * means editing one block here.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const API_DIR = path.join(ROOT, "apps", "api");
const WEB_DIR = path.join(ROOT, "apps", "web");
/** Compiled into the web build's /api proxy rule (audit.config.ts DEPLOY.API_PORT). */
const API_PORT = 5103;
const FIXTURE = path.join(API_DIR, "src", "__tests__", "fixtures", "accessible.pdf");

/** Every selector this script depends on. */
const HOOKS = {
  dropzone: '[data-testid="dropzone"]',
  fileInput: 'input[type="file"]',
  resultsHeading: '[data-testid="results-heading"]',
  gradeLabel: '[data-testid="grade-label"]',
  jsonDownload: '[aria-label="Download report as JSON"]',
};

/** Pages checked with axe after the upload flow. */
const AXE_PAGES = [
  "/trust",
  "/data-retention",
  "/technical-details",
  "/announcements",
  "/wcag-2-2",
  "/sample-report",
  "/status",
];
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// puppeteer + axe live in apps/api's dependencies; resolve them from there.
const apiRequire = createRequire(path.join(API_DIR, "package.json"));

const puppeteer: any = apiRequire("puppeteer");

const { AxePuppeteer }: any = apiRequire("@axe-core/puppeteer");

const args = process.argv.slice(2);
const flagValue = (name: string): string | null => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};
const baseUrlArg = flagValue("--base-url");
const headed = args.includes("--headed");

const children: ChildProcess[] = [];
let tmpDir = "";
const failures: string[] = [];
const pass = (what: string) => console.log(`  PASS  ${what}`);
const fail = (what: string, detail = "") => {
  failures.push(what);
  console.log(`  FAIL  ${what}${detail ? `\n        ${detail.replace(/\n/g, "\n        ")}` : ""}`);
};

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host: "127.0.0.1" });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor200(url: string, label: string, timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  let last = "no response";
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.status === 200) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} did not answer 200 at ${url} within ${timeoutMs / 1000}s (${last})`);
}

function start(name: string, cwd: string, argv: string[], env: Record<string, string>): void {
  // `pnpm e2e` runs this script through `tsx --tsconfig scripts/tsconfig.json`,
  // and tsx hands that choice to child processes as TSX_TSCONFIG_PATH — a
  // RELATIVE path. The API (cwd apps/api, also started through tsx) would look
  // for apps/api/scripts/tsconfig.json and die at start. It must use its own.
  const inherited: Record<string, string | undefined> = { ...process.env };
  delete inherited.TSX_TSCONFIG_PATH;
  const child = spawn("node", argv, {
    cwd,
    env: { ...inherited, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = fs.createWriteStream(path.join(tmpDir, `${name}.log`));
  child.stdout!.pipe(log);
  child.stderr!.pipe(log);
  child.on("exit", (code) => {
    if (code !== null && code !== 0 && !stopping) {
      console.error(
        `\n${name} exited early with code ${code} — see ${path.join(tmpDir, `${name}.log`)}`,
      );
    }
  });
  children.push(child);
}

let stopping = false;
async function stopAll(): Promise<void> {
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) return resolve();
          const force = setTimeout(() => child.kill("SIGKILL"), 8_000);
          child.once("exit", () => {
            clearTimeout(force);
            resolve();
          });
        }),
    ),
  );
}

/** Start the API and the built web app; returns the web app's base URL. */
async function startStack(): Promise<string> {
  if (!fs.existsSync(path.join(WEB_DIR, ".output", "server", "index.mjs"))) {
    throw new Error(
      "apps/web/.output is missing — run `pnpm build` first (this tests the BUILT app).",
    );
  }
  if (await portInUse(API_PORT)) {
    throw new Error(
      `port ${API_PORT} is in use. The built web app can only reach the API there. Stop what ` +
        "is using it, or test the running instance with --base-url http://localhost:<web port>.",
    );
  }
  const webPort = await freePort();
  start("api", API_DIR, ["--import", "tsx", "src/index.ts"], {
    NODE_ENV: "production",
    PORT: String(API_PORT),
    DB_PATH: path.join(tmpDir, "data", "audit.db"),
    REMEDIATION_ENABLED: "false",
    API_PRIVILEGED_TOKEN: "",
  });
  start("web", WEB_DIR, [".output/server/index.mjs"], {
    NODE_ENV: "production",
    PORT: String(webPort),
    HOST: "127.0.0.1",
  });
  await waitFor200(`http://127.0.0.1:${API_PORT}/api/health`, "the API");
  // The home page, NOT /healthz: /healthz asks the API for its health on every
  // call and answers 503 unless the API says "ok" — and an API started without
  // a fleet token reports "degraded". Polling it here spent the API's whole
  // per-minute request allowance before the browser had loaded a page, and
  // the upload was then refused with 429 (found 2026-11-24).
  await waitFor200(`http://127.0.0.1:${webPort}/`, "the web app");
  return `http://127.0.0.1:${webPort}`;
}

interface AxeViolation {
  id: string;
  impact?: string;
  help: string;
  nodes: { target: unknown[] }[];
}

async function axeCheck(page: any, label: string): Promise<void> {
  const results = await new AxePuppeteer(page).withTags(AXE_TAGS).analyze();
  const violations = results.violations as AxeViolation[];
  if (violations.length === 0) {
    pass(`axe: ${label} — no WCAG 2.1 A/AA violations (${results.passes.length} rules passed)`);
    return;
  }
  fail(
    `axe: ${label} — ${violations.length} violation(s)`,
    violations
      .map(
        (v) =>
          `${v.id} [${v.impact ?? "?"}] ${v.help}\n` +
          v.nodes
            .slice(0, 5)
            .map((n) => `    ${JSON.stringify(n.target)}`)
            .join("\n"),
      )
      .join("\n"),
  );
}

async function waitForDownload(dir: string, timeoutMs = 20_000): Promise<string | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const done = fs.readdirSync(dir).filter((f) => !f.endsWith(".crdownload"));
    if (done.length > 0) return path.join(dir, done[0]!);
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function main(): Promise<void> {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-smoke-"));
  const downloads = path.join(tmpDir, "downloads");
  fs.mkdirSync(downloads);
  fs.mkdirSync(path.join(tmpDir, "data"));

  const base = (baseUrlArg ?? (await startStack())).replace(/\/$/, "");
  console.log(`\nBrowser smoke + accessibility check against ${base}\n`);

  const browser = await puppeteer.launch({
    headless: !headed,
    // The same flags the page-audit service uses; CI runners need --no-sandbox.
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const pageErrors: string[] = [];
    page.on("pageerror", (e: Error) => pageErrors.push(e.message));

    // --- 1. the landing page ---
    const res = await page.goto(`${base}/`, { waitUntil: "networkidle2", timeout: 60_000 });
    if (res?.status() === 200) pass("GET / answers 200");
    else fail("GET / answers 200", `got ${res?.status()}`);
    if (await page.$(HOOKS.dropzone)) pass("the upload area is on the page");
    else fail("the upload area is on the page", `no ${HOOKS.dropzone}`);
    await axeCheck(page, "/ (before an upload)");

    // --- 2. upload through the real file input, wait for the grade ---
    const input = await page.$(HOOKS.fileInput);
    if (!input) {
      fail("the file input exists", `no ${HOOKS.fileInput}`);
    } else {
      await input.uploadFile(FIXTURE);
      let graded = false;
      try {
        await page.waitForSelector(HOOKS.gradeLabel, { timeout: 120_000 });
        const grade = await page.$eval(HOOKS.gradeLabel, (el: Element) => el.textContent?.trim());
        graded = Boolean(grade);
        if (grade) pass(`a grade is shown after the upload ("${grade}")`);
        else fail("a grade is shown after the upload", "the grade label is empty");
      } catch {
        fail("a grade is shown after the upload", `${HOOKS.gradeLabel} never appeared (120s)`);
      }
      if (await page.$(HOOKS.resultsHeading)) pass("the report rendered");
      else fail("the report rendered", `no ${HOOKS.resultsHeading}`);

      // --- 3. the JSON export ---
      const cdp = await page.createCDPSession();
      await cdp.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: downloads,
      });
      const button = await page.$(HOOKS.jsonDownload);
      if (!button) {
        fail("the JSON export button exists", `no ${HOOKS.jsonDownload}`);
      } else {
        await button.click();
        const file = await waitForDownload(downloads);
        if (!file) {
          fail("the JSON export downloads a file", "nothing arrived in 20s");
        } else {
          try {
            const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
            if (parsed && typeof parsed === "object") {
              pass(`the JSON export is valid JSON (${path.basename(file)})`);
            } else {
              fail("the JSON export is valid JSON", "it parsed, but not to an object");
            }
          } catch (e) {
            fail("the JSON export is valid JSON", (e as Error).message);
          }
        }
      }
      // Only when there IS a result view: checking the bare landing page a
      // second time and calling it "the result view" would be a false pass.
      if (graded) await axeCheck(page, "/ (the result view)");
      else fail("axe: / (the result view)", "not checked — no result was shown");
    }

    // --- 4. the other pages ---
    for (const route of AXE_PAGES) {
      const r = await page.goto(`${base}${route}`, { waitUntil: "networkidle2", timeout: 60_000 });
      if (r?.status() !== 200) {
        fail(`GET ${route} answers 200`, `got ${r?.status()}`);
        continue;
      }
      await axeCheck(page, route);
    }

    if (pageErrors.length === 0) pass("no uncaught script errors on any page");
    else fail("no uncaught script errors on any page", pageErrors.slice(0, 10).join("\n"));
  } finally {
    await browser.close();
  }
}

let exitCode = 0;
main()
  .catch((e: Error) => {
    console.error(`\ne2e: ${e.message}`);
    exitCode = 2;
  })
  .finally(async () => {
    await stopAll();
    if (failures.length > 0) exitCode = 1;
    console.log(
      exitCode === 0
        ? "\nE2E SMOKE PASSED"
        : exitCode === 1
          ? `\nE2E SMOKE FAILED — ${failures.length} check(s):\n  - ${failures.join("\n  - ")}`
          : "\nE2E SMOKE COULD NOT RUN",
    );
    // Server logs are kept only when something went wrong.
    if (exitCode === 0 && tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    else if (tmpDir && children.length > 0) console.log(`Server logs: ${tmpDir}`);
    process.exit(exitCode);
  });
