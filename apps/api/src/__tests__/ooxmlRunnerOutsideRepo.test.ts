/**
 * Office audits must work wherever the process was started.
 *
 * The OOXML worker is launched as `node --import tsx ooxmlWorker.ts`. Node
 * resolves a bare `--import tsx` against the CHILD'S WORKING DIRECTORY, so a
 * process started outside the repository (the CLI pointed at a folder of
 * documents, a script in a temp dir) lost every Word/PowerPoint/Excel audit to
 * ERR_MODULE_NOT_FOUND while PDFs kept working. The runner now passes tsx as
 * an absolute file URL.
 *
 * This is deliberately a REAL process started in the OS temp directory: the
 * defect is about where Node looks, which a mocked spawn cannot show.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildDocx } from "./helpers/minimalDocx.js";
import { resolveTsxSpecifier } from "../services/ooxmlRunner.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const ANALYZER_ENTRY = path.join(REPO_ROOT, "packages/analyzer/src/analyzer.ts");

/** tsx's ESM entry, absolute — how the PARENT is started from outside the repo. */
function tsxLoaderUrl(): string {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve("tsx/package.json");
  return pathToFileURL(path.join(path.dirname(pkgJson), "dist/loader.mjs")).href;
}

describe("Office audit with a working directory outside the repository", () => {
  let dir: string;

  beforeAll(async () => {
    dir = realpathSync(mkdtempSync(path.join(tmpdir(), "ooxml-outside-")));
    writeFileSync(path.join(dir, "sample.docx"), await buildDocx());
    writeFileSync(path.join(dir, "package.json"), '{"type":"module"}');
    writeFileSync(
      path.join(dir, "run.ts"),
      [
        `import { readFileSync } from "node:fs";`,
        `import { analyzeDocument } from ${JSON.stringify(pathToFileURL(ANALYZER_ENTRY).href)};`,
        `analyzeDocument(readFileSync("sample.docx"), "sample.docx").then(`,
        `  (r) => { process.stdout.write(JSON.stringify({ fileType: r.fileType, score: r.overallScore, cwd: process.cwd() })); },`,
        `  (e) => { process.stdout.write(JSON.stringify({ error: String(e?.message ?? e) })); process.exitCode = 1; },`,
        `);`,
      ].join("\n"),
    );
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("the temp directory really is outside the repo (or the test proves nothing)", () => {
    expect(path.relative(REPO_ROOT, dir).startsWith("..")).toBe(true);
  });

  it("audits a .docx from there", () => {
    const stdout = execFileSync(process.execPath, ["--import", tsxLoaderUrl(), "run.ts"], {
      cwd: dir,
      // The engine's `#config` alias is a tsconfig path, and tsx looks for a
      // tsconfig from the working directory — so a launcher outside the repo
      // names one explicitly (the CLI's bin shim does exactly this). The
      // worker child inherits it.
      env: { ...process.env, TSX_TSCONFIG_PATH: path.join(REPO_ROOT, "apps/api/tsconfig.json") },
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    const out = JSON.parse(stdout);
    expect(out.error).toBeUndefined();
    expect(out.cwd).toBe(dir);
    expect(out.fileType).toBe("docx");
    expect(typeof out.score).toBe("number");
  }, 70_000);

  it("resolveTsxSpecifier never returns a path relative to the working directory", () => {
    const spec = resolveTsxSpecifier();
    // Either an absolute file URL, or the bare-name fallback on a host without
    // import.meta.resolve — never "./…" or a cwd-relative path.
    expect(spec === "tsx" || spec.startsWith("file:///")).toBe(true);
  });
});
