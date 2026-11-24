/**
 * `a11y-audit audit` as a CI gate: what it accepts (folders, globs, files
 * recognised by content), each gate and the exit status it produces, every
 * output format's shape, the config file, and the baseline.
 *
 * The engine is mocked — a file's SCORE is written in its name or content so
 * each test reads as a table of inputs and outcomes. The formats are checked
 * by PARSING what was emitted (CSV, XML, SARIF JSON), never by matching
 * substrings of it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalysisResult } from "@file-audit/analyzer";

const analyzeDocument = vi.hoisted(() => vi.fn());
const detectFileType = vi.hoisted(() => vi.fn());
const checkQpdf = vi.hoisted(() => vi.fn(() => true));
vi.mock("@file-audit/analyzer", () => ({ analyzeDocument, detectFileType }));
vi.mock("../lib/colors.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/colors.js")>()),
  checkQpdf,
}));

import { runAudit } from "../commands/audit.js";
import { globToRegExp } from "../audit/inputs.js";
import { VERSION } from "../version.js";
import { CATEGORY_IDS } from "../lib/categories.js";
import { ENGINE_CONCURRENCY_LIMIT } from "../commands/publist.js";

class Exit extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`);
  }
}

interface Cat {
  id: string;
  label: string;
  score: number | null;
  severity: string | null;
  findings: string[];
  findingDetails?: unknown[];
  helpLinks?: Array<{ label: string; url: string }>;
}

function category(over: Partial<Cat> & { id: string }): Cat {
  return {
    label: over.id,
    score: 100,
    severity: "Pass",
    findings: [],
    helpLinks: [],
    ...over,
  };
}

function result(
  filename: string,
  overallScore: number,
  over: Partial<{ categories: Cat[]; conformance: unknown; fileType: string }> = {},
): AnalysisResult {
  return {
    filename,
    fileType: over.fileType ?? "pdf",
    pageCount: 3,
    overallScore,
    grade: overallScore >= 90 ? "A" : overallScore >= 80 ? "B" : "F",
    isScanned: false,
    executiveSummary: "Summary.",
    categories: over.categories ?? [],
    warnings: [],
    conformance: over.conformance,
  } as unknown as AnalysisResult;
}

let dir: string;
let out: string[];
let err: string[];

/** Run the command; resolve to its exit status. Each run starts with empty
 *  captured streams, so a test may run the command more than once. */
async function run(...argv: string[]): Promise<number> {
  out.length = 0;
  err.length = 0;
  try {
    await runAudit(argv, { cwd: dir, busyRetryDelaysMs: [] });
    return 0;
  } catch (e) {
    if (e instanceof Exit) return e.code;
    throw e;
  }
}

/** Create a file under the temp folder. `score:NN` in the content is what the
 *  mocked engine reports for it. */
function file(rel: string, content = "%PDF-1.7 score:95"): string {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return rel;
}

const stdout = (): string => out.join("\n");

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "a11y-audit-gate-")));
  out = [];
  err = [];
  checkQpdf.mockReset().mockReturnValue(true);
  detectFileType.mockReset().mockResolvedValue(null);
  // The mocked engine: score comes from "score:NN" in the bytes.
  analyzeDocument.mockReset().mockImplementation(async (buffer: Buffer, name: string) => {
    const m = /score:(\d+)/.exec(buffer.toString("latin1"));
    return result(name, m ? Number(m[1]) : 95);
  });
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Exit(code ?? 0);
  }) as never);
  vi.spyOn(console, "log").mockImplementation((...a) => void out.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a) => void err.push(a.join(" ")));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const paths = (): string[] =>
  (JSON.parse(stdout()) as { results: Array<{ path: string }> }).results.map((r) => r.path);

// ------------------------------------------------------------------- inputs

describe("what can be passed as a path", () => {
  it("a folder is searched at every depth, in name order", async () => {
    file("docs/b.pdf");
    file("docs/a.docx", "PK\u0003\u0004 score:90");
    file("docs/deep/er/c.xlsx", "PK\u0003\u0004");
    file("docs/notes.txt", "plain text");
    expect(await run("docs", "--json")).toBe(0);
    expect(paths()).toEqual(["docs/a.docx", "docs/b.pdf", "docs/deep/er/c.xlsx"]);
  });

  it("skips node_modules, dot-folders, AppleDouble sidecars and Office lock files", async () => {
    file("docs/real.pdf");
    file("docs/node_modules/pkg/x.pdf");
    file("docs/.git/y.pdf");
    file("docs/._real.pdf");
    file("docs/~$draft.docx");
    expect(await run("docs", "--json")).toBe(0);
    expect(paths()).toEqual(["docs/real.pdf"]);
  });

  it("a glob: ** crosses folders, * does not", async () => {
    file("docs/a.pdf");
    file("docs/sub/b.pdf");
    file("docs/sub/c.docx");
    expect(await run("docs/**/*.pdf", "--json")).toBe(0);
    expect(paths()).toEqual(["docs/a.pdf", "docs/sub/b.pdf"]);

    expect(await run("docs/*.pdf", "--json")).toBe(0);
    expect(paths()).toEqual(["docs/a.pdf"]);
  });

  it("a glob with alternatives", async () => {
    file("docs/a.pdf");
    file("docs/b.docx");
    file("docs/c.xlsx");
    expect(await run("docs/*.{pdf,docx}", "--json")).toBe(0);
    expect(paths()).toEqual(["docs/a.pdf", "docs/b.docx"]);
  });

  it("globToRegExp: the documented syntax", () => {
    expect(globToRegExp("**/*.pdf").test("a.pdf")).toBe(true);
    expect(globToRegExp("**/*.pdf").test("x/y/a.pdf")).toBe(true);
    expect(globToRegExp("*.pdf").test("x/a.pdf")).toBe(false);
    expect(globToRegExp("a?.pdf").test("ab.pdf")).toBe(true);
    expect(globToRegExp("a?.pdf").test("a/.pdf")).toBe(false);
    expect(globToRegExp("[ab].pdf").test("b.pdf")).toBe(true);
    expect(globToRegExp("[!ab].pdf").test("b.pdf")).toBe(false);
    expect(globToRegExp("a.pdf").test("aXpdf")).toBe(false); // "." is literal
  });

  it("the same file reached twice is audited once", async () => {
    file("docs/a.pdf");
    expect(await run("docs", "docs/a.pdf", "docs/*.pdf", "--json")).toBe(0);
    expect(paths()).toEqual(["docs/a.pdf"]);
  });

  it("--exclude leaves out matching files and whole folders", async () => {
    file("docs/a.pdf");
    file("docs/drafts/b.pdf");
    file("docs/old/c.pdf");
    file("docs/keep/old-report.pdf");
    expect(await run("docs", "--exclude", "drafts", "--exclude=docs/old", "--json")).toBe(0);
    expect(paths()).toEqual(["docs/a.pdf", "docs/keep/old-report.pdf"]);
  });

  it("nothing found is a usage error — unless --allow-empty", async () => {
    mkdirSync(join(dir, "docs"));
    expect(await run("docs/**/*.pdf")).toBe(2);
    expect(err.join("\n")).toContain("No PDF, Word, PowerPoint or Excel files found");
    expect(await run("docs", "--allow-empty", "--json")).toBe(0);
    expect(JSON.parse(stdout()).summary.files).toBe(0);
  });
});

describe("type is read from the contents, not only the name", () => {
  it("a named file with the wrong extension but a PDF header is audited", async () => {
    file("report.bin", "%PDF-1.4 score:88");
    expect(await run("report.bin", "--json")).toBe(0);
    expect(JSON.parse(stdout()).results[0]).toMatchObject({ path: "report.bin", score: 88 });
    expect(checkQpdf).toHaveBeenCalled(); // a PDF by content still needs qpdf
  });

  it("in a folder: a PDF header is enough; a ZIP is taken only if the engine says it is Office", async () => {
    file("docs/scan.dat", "%PDF-1.4");
    file("docs/slides.upload", "PK\u0003\u0004 office");
    file("docs/archive.zip", "PK\u0003\u0004 plain");
    detectFileType.mockImplementation(async (b: Buffer) =>
      b.toString("latin1").includes("office") ? "pptx" : null,
    );
    expect(await run("docs", "--json")).toBe(0);
    expect(paths()).toEqual(["docs/scan.dat", "docs/slides.upload"]);
  });

  it("a named file that is neither by name nor by content is a usage error", async () => {
    file("notes.txt", "hello");
    expect(await run("notes.txt")).toBe(2);
    expect(analyzeDocument).not.toHaveBeenCalled();
  });

  it("a supported extension with unreadable content is an analysis failure (3), not usage", async () => {
    file("broken.pdf", "not a pdf at all");
    analyzeDocument.mockRejectedValue(
      Object.assign(new Error("Unsupported file type"), { code: "UNSUPPORTED_FILE_TYPE" }),
    );
    expect(await run("broken.pdf", "--json")).toBe(3);
    expect(JSON.parse(stdout()).results[0].error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });
});

// -------------------------------------------------------------------- gates

describe("gates and exit statuses", () => {
  it("no gate: any score exits 0", async () => {
    file("a.pdf", "%PDF- score:5");
    expect(await run("a.pdf")).toBe(0);
  });

  it("--fail-under: below fails (1), equal passes (0)", async () => {
    file("a.pdf", "%PDF- score:79");
    expect(await run("a.pdf", "--fail-under", "80")).toBe(1);
    expect(await run("a.pdf", "--fail-under=79")).toBe(0);
  });

  it.each([
    ["critical", "Critical", 1],
    ["critical", "Moderate", 0],
    ["moderate", "Critical", 1],
    ["moderate", "Moderate", 1],
    ["moderate", "Minor", 0],
    ["minor", "Minor", 1],
    ["minor", "Pass", 0],
    ["minor", "No scored issues", 0],
    ["minor", null, 0],
  ] as const)("--fail-on %s with a %s category → exit %i", async (level, sev, code) => {
    file("a.pdf");
    analyzeDocument.mockResolvedValue(
      result("a.pdf", 100, { categories: [category({ id: "alt_text", severity: sev })] }),
    );
    expect(await run("a.pdf", "--fail-on", level)).toBe(code);
  });

  it("--fail-on names the categories that tripped it", async () => {
    file("a.pdf");
    analyzeDocument.mockResolvedValue(
      result("a.pdf", 60, {
        categories: [
          category({ id: "alt_text", label: "Alt Text", severity: "Critical" }),
          category({ id: "bookmarks", label: "Bookmarks", severity: "Pass" }),
        ],
      }),
    );
    expect(await run("a.pdf", "--fail-on", "moderate")).toBe(1);
    expect(stdout()).toContain("1 category at moderate or worse: Alt Text (Critical)");
  });

  describe("--fail-on-conformance", () => {
    const verdict = (status: string, failures: unknown[]): unknown => ({
      status,
      failures,
      notAssessed: [],
      headline: "",
    });
    const failure = (sc: string, likely?: boolean): unknown => ({ sc, name: sc, likely });

    it("a confirmed WCAG failure fails the run", async () => {
      file("a.pdf");
      analyzeDocument.mockResolvedValue(
        result("a.pdf", 100, {
          conformance: verdict("fail", [failure("1.1.1"), failure("2.4.2")]),
        }),
      );
      expect(await run("a.pdf", "--fail-on-conformance")).toBe(1);
      expect(stdout()).toContain("2 confirmed WCAG failures: 1.1.1, 2.4.2");
    });

    it("without the flag the same document passes", async () => {
      file("a.pdf");
      analyzeDocument.mockResolvedValue(
        result("a.pdf", 100, { conformance: verdict("fail", [failure("1.1.1")]) }),
      );
      expect(await run("a.pdf")).toBe(0);
    });

    it('a "likely — please verify" failure alone does not trip it', async () => {
      file("a.pdf");
      analyzeDocument.mockResolvedValue(
        result("a.pdf", 100, { conformance: verdict("fail", [failure("1.3.1", true)]) }),
      );
      expect(await run("a.pdf", "--fail-on-conformance")).toBe(0);
    });

    it("no failures, an incomplete verdict, or no verdict at all: pass", async () => {
      file("a.pdf");
      for (const conformance of [
        verdict("no-automated-failures", []),
        verdict("incomplete", []),
        undefined,
      ]) {
        analyzeDocument.mockResolvedValue(result("a.pdf", 100, { conformance }));
        expect(await run("a.pdf", "--fail-on-conformance")).toBe(0);
      }
    });
  });

  it("usage errors are 2: unknown flag, bad values, a flag missing its value", async () => {
    file("a.pdf");
    expect(await run("a.pdf", "--frobnicate")).toBe(2);
    expect(await run("a.pdf", "--fail-on", "severe")).toBe(2);
    expect(await run("a.pdf", "--format", "yaml")).toBe(2);
    expect(await run("a.pdf", "--concurrency", "0")).toBe(2);
    expect(await run("a.pdf", "--fail-under", "101")).toBe(2);
    expect(await run("a.pdf", "--output")).toBe(2);
    expect(analyzeDocument).not.toHaveBeenCalled();
  });

  it("the report's own summary.exitCode is the status the process ends with", async () => {
    file("a.pdf", "%PDF- score:10");
    expect(await run("a.pdf", "--fail-under", "50", "--json")).toBe(1);
    expect(JSON.parse(stdout()).summary).toMatchObject({ failed: 1, passed: 0, exitCode: 1 });
  });
});

// -------------------------------------------------------------- concurrency

describe("--concurrency", () => {
  async function peakWith(...flags: string[]): Promise<number> {
    for (let i = 0; i < 8; i++) file(`docs/f${i}.pdf`);
    let active = 0;
    let peak = 0;
    analyzeDocument.mockImplementation(async (_b: Buffer, name: string) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return result(name, 95);
    });
    expect(await run("docs", "--json", ...flags)).toBe(0);
    expect(JSON.parse(stdout()).results).toHaveLength(8);
    return peak;
  }

  it("defaults to 2 at a time", async () => {
    expect(await peakWith()).toBe(Math.min(2, ENGINE_CONCURRENCY_LIMIT));
  });

  it("1 runs strictly one at a time, and keeps input order", async () => {
    expect(await peakWith("--concurrency", "1")).toBe(1);
    expect(paths()).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => `docs/f${i}.pdf`));
  });

  it("never exceeds the engine's own limit, and says so", async () => {
    expect(await peakWith("-c", "50")).toBe(ENGINE_CONCURRENCY_LIMIT);
    expect(err.join("\n")).toContain(`using ${ENGINE_CONCURRENCY_LIMIT}`);
  });

  it('retries the engine\'s "Server busy" refusal instead of losing the file', async () => {
    file("a.pdf");
    analyzeDocument
      .mockRejectedValueOnce(Object.assign(new Error("Server busy"), { status: 503 }))
      .mockResolvedValue(result("a.pdf", 91));
    let code: number;
    try {
      await runAudit(["a.pdf", "--json"], { cwd: dir, busyRetryDelaysMs: [0, 0] });
      code = 0;
    } catch (e) {
      code = (e as Exit).code;
    }
    expect(code).toBe(0);
    expect(JSON.parse(stdout()).results[0].score).toBe(91);
  });
});

// ------------------------------------------------------------------ formats

/** RFC 4180 parser, enough to read back what toCsv wrote. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const unxml = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** A strict little XML reader: throws on anything not well-formed. */
function parseXml(source: string): XmlNode {
  const body = source.replace(/^<\?xml[^>]*\?>\s*/, "");
  const root: XmlNode = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const token = /<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>|([^<]+)/g;
  let last = 0;
  for (let m = token.exec(body); m; m = token.exec(body)) {
    if (m.index !== last) throw new Error(`XML: unexpected text at ${last}`);
    last = token.lastIndex;
    const top = stack[stack.length - 1];
    if (m[1]) {
      if (top.tag !== m[1]) throw new Error(`XML: </${m[1]}> closes <${top.tag}>`);
      stack.pop();
    } else if (m[2]) {
      const attrs: Record<string, string> = {};
      for (const a of m[3].matchAll(/([\w:-]+)="([^"<]*)"/g)) attrs[a[1]] = unxml(a[2]);
      const node: XmlNode = { tag: m[2], attrs, children: [], text: "" };
      top.children.push(node);
      if (!m[4]) stack.push(node);
    } else if (m[5]) {
      if (/&(?!(?:lt|gt|quot|apos|amp);)/.test(m[5])) throw new Error("XML: bare ampersand");
      top.text += unxml(m[5]);
    }
  }
  if (last !== body.length) throw new Error(`XML: could not read past ${last}`);
  if (stack.length !== 1) throw new Error(`XML: <${stack[stack.length - 1].tag}> never closed`);
  if (root.children.length !== 1) throw new Error("XML: expected one root element");
  return root.children[0];
}

/** A two-file run every format test shares: one failing PDF, one clean. */
function twoFiles(): void {
  file('docs/bad, "quoted".pdf', "%PDF- score:40");
  file("docs/good.pdf", "%PDF- score:100");
  analyzeDocument.mockImplementation(async (buffer: Buffer, name: string) => {
    if (buffer.toString("latin1").includes("score:100")) {
      return result(name, 100, {
        categories: [
          category({ id: "alt_text", label: "Alt Text", score: 100, severity: "Pass" }),
          category({ id: "color_contrast", label: "Color Contrast", score: null, severity: null }),
        ],
        conformance: { status: "no-automated-failures", failures: [] },
      });
    }
    return result(name, 40, {
      categories: [
        category({
          id: "alt_text",
          label: "Alt Text",
          score: 0,
          severity: "Critical",
          findings: [
            "0 of 3 image(s) have alternative text",
            "--- Images Missing Alt Text ---",
            "  Image 1: <Figure> tag & no /Alt",
            "How to fix: add alt text",
          ],
          helpLinks: [{ label: "Understanding 1.1.1", url: "https://www.w3.org/x" }],
        }),
        category({
          id: "title_language",
          label: "Title & Language",
          score: 50,
          severity: "Moderate",
          findings: ["No document title found"],
        }),
        category({ id: "bookmarks", label: "Bookmarks", score: 100, severity: "Pass" }),
      ],
      conformance: { status: "fail", failures: [{ sc: "1.1.1", name: "Non-text Content" }] },
    });
  });
}

describe("--format json / ndjson", () => {
  it("json: the documented top-level shape and every entry key", async () => {
    twoFiles();
    expect(await run("docs", "--format", "json", "--fail-under", "80")).toBe(1);
    const report = JSON.parse(stdout());
    expect(Object.keys(report)).toEqual(["schemaVersion", "tool", "summary", "results"]);
    expect(report.schemaVersion).toBe(1);
    expect(report.tool).toEqual({ name: "a11y-audit", version: VERSION });
    expect(report.summary).toEqual({
      files: 2,
      analysed: 2,
      errors: 0,
      passed: 1,
      failed: 1,
      averageScore: 70,
      lowestScore: 40,
      grades: { F: 1, A: 1 },
      gates: { failUnder: 80, failOn: null, failOnConformance: false, baseline: null },
      exitCode: 1,
    });
    expect(Object.keys(report.results[0])).toEqual([
      "path",
      "filename",
      "sha256",
      "bytes",
      "status",
      "fileType",
      "pageCount",
      "score",
      "grade",
      "conformance",
      "confirmedFailures",
      "passed",
      "gateFailures",
      "baseline",
      "error",
      "analysis",
    ]);
    expect(report.results[0]).toMatchObject({
      path: 'docs/bad, "quoted".pdf',
      status: "ok",
      score: 40,
      conformance: "fail",
      confirmedFailures: 1,
      passed: false,
      gateFailures: [{ gate: "fail-under", message: "score 40 is below the minimum of 80" }],
    });
    expect(report.results[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("an error entry has the SAME keys as a successful one", async () => {
    file("a.pdf");
    file("b.pdf");
    analyzeDocument.mockImplementation(async (_b: Buffer, name: string) => {
      if (name === "b.pdf") throw new Error("boom");
      return result(name, 90);
    });
    expect(await run("a.pdf", "b.pdf", "--json")).toBe(3);
    const [ok, bad] = JSON.parse(stdout()).results;
    expect(Object.keys(bad)).toEqual(Object.keys(ok));
  });

  it("ndjson: one result line per file, then one summary line", async () => {
    twoFiles();
    expect(await run("docs", "--format", "ndjson")).toBe(0);
    const lines = stdout()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(["result", "result", "summary"]);
    expect(lines[1]).toMatchObject({ path: "docs/good.pdf", score: 100, status: "ok" });
    expect(lines[2]).toMatchObject({
      schemaVersion: 1,
      tool: { name: "a11y-audit" },
      summary: { files: 2 },
    });
  });
});

describe("--format csv", () => {
  it("one header, one row per file, fields that survive commas and quotes", async () => {
    twoFiles();
    expect(await run("docs", "--format", "csv", "--fail-under", "80")).toBe(1);
    const rows = parseCsv(stdout());
    expect(rows).toHaveLength(3);
    const [header, bad, good] = rows;
    expect(header.slice(0, 6)).toEqual(["path", "status", "file_type", "pages", "score", "grade"]);
    for (const id of CATEGORY_IDS) expect(header).toContain(id);
    expect(bad).toHaveLength(header.length);
    const cell = (row: string[], name: string): string => row[header.indexOf(name)];
    expect(cell(bad, "path")).toBe('docs/bad, "quoted".pdf');
    expect(cell(bad, "score")).toBe("40");
    expect(cell(bad, "passed")).toBe("no");
    expect(cell(bad, "gate_failures")).toBe("fail-under: score 40 is below the minimum of 80");
    expect(cell(bad, "conformance")).toBe("fail");
    expect(cell(bad, "confirmed_wcag_failures")).toBe("1");
    expect(cell(bad, "alt_text")).toBe("0");
    expect(cell(bad, "title_language")).toBe("50");
    expect(cell(bad, "sheet_names")).toBe(""); // a category this format lacks
    expect(cell(good, "passed")).toBe("yes");
    expect(cell(good, "color_contrast")).toBe(""); // present but not scored
  });

  it("a file that could not be audited is a row with its error", async () => {
    file("a.pdf");
    analyzeDocument.mockRejectedValue(new Error("boom"));
    expect(await run("a.pdf", "--format", "csv")).toBe(3);
    const [header, row] = parseCsv(stdout());
    expect(row[header.indexOf("status")]).toBe("error");
    expect(row[header.indexOf("error")]).toBe("analysis_failed: boom");
    expect(row[header.indexOf("score")]).toBe("");
  });

  it("a path that would open as a spreadsheet formula is neutralised", async () => {
    file("=cmd.pdf");
    expect(await run("=cmd.pdf", "--format", "csv")).toBe(0);
    expect(parseCsv(stdout())[1][0]).toBe("'=cmd.pdf");
  });
});

describe("--format junit", () => {
  it("one testsuite per file; one testcase per category plus the gates case", async () => {
    twoFiles();
    expect(await run("docs", "--format", "junit", "--fail-under", "80")).toBe(1);
    const root = parseXml(stdout());
    expect(root.tag).toBe("testsuites");
    expect(root.children.map((s) => s.tag)).toEqual(["testsuite", "testsuite"]);
    const [bad, good] = root.children;

    expect(bad.attrs.name).toBe('docs/bad, "quoted".pdf');
    const badCases = bad.children.filter((c) => c.tag === "testcase");
    expect(badCases.map((c) => c.attrs.name)).toEqual([
      "Alt Text",
      "Title & Language",
      "Bookmarks",
      "gates",
    ]);
    const failed = (c: XmlNode): XmlNode | undefined => c.children.find((x) => x.tag === "failure");
    expect(failed(badCases[0])?.attrs.type).toBe("Critical");
    // The findings are the failure body, special characters intact.
    expect(failed(badCases[0])?.text).toContain("Image 1: <Figure> tag & no /Alt");
    expect(failed(badCases[1])?.attrs.type).toBe("Moderate");
    expect(failed(badCases[2])).toBeUndefined();
    expect(failed(badCases[3])?.attrs.message).toBe("score 40 is below the minimum of 80");
    expect(bad.attrs).toMatchObject({ tests: "4", failures: "3", errors: "0", skipped: "0" });

    const goodCases = good.children.filter((c) => c.tag === "testcase");
    expect(goodCases.map((c) => c.attrs.name)).toEqual(["Alt Text", "Color Contrast", "gates"]);
    expect(goodCases[1].children[0].tag).toBe("skipped"); // not scored
    expect(good.attrs).toMatchObject({ tests: "3", failures: "0", skipped: "1" });

    // The root totals are the sum of the suites.
    expect(root.attrs).toMatchObject({ tests: "7", failures: "3", errors: "0", skipped: "1" });
  });

  it("--fail-on raises the bar for which categories count as failed testcases", async () => {
    twoFiles();
    expect(await run("docs/bad*.pdf", "--format", "junit", "--fail-on", "critical")).toBe(1);
    const suite = parseXml(stdout()).children[0];
    const failedNames = suite.children
      .filter((c) => c.children.some((x) => x.tag === "failure"))
      .map((c) => c.attrs.name);
    expect(failedNames).toEqual(["Alt Text", "gates"]); // Moderate no longer counts
  });

  it("a file that could not be audited is an <error> testcase", async () => {
    file("a.pdf");
    analyzeDocument.mockRejectedValue(new Error("bad <xml> & more"));
    expect(await run("a.pdf", "--format", "junit")).toBe(3);
    const root = parseXml(stdout());
    expect(root.attrs).toMatchObject({ tests: "1", errors: "1", failures: "0" });
    const error = root.children[0].children.find((c) => c.tag === "testcase")!.children[0];
    expect(error.tag).toBe("error");
    expect(error.attrs.message).toBe("bad <xml> & more");
  });
});

describe("--format sarif", () => {
  it("is SARIF 2.1.0 with the tool, its rules, and an invocation", async () => {
    twoFiles();
    expect(await run("docs", "--format", "sarif")).toBe(0);
    const sarif = JSON.parse(stdout());
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toContain("sarif-2.1.0");
    expect(sarif.runs).toHaveLength(1);
    const run0 = sarif.runs[0];
    expect(run0.tool.driver).toMatchObject({ name: "a11y-audit", version: VERSION });
    expect(run0.invocations[0]).toMatchObject({ executionSuccessful: true, exitCode: 0 });
    // Every result's rule is declared.
    const ruleIds = run0.tool.driver.rules.map((r: { id: string }) => r.id);
    for (const r of run0.results) expect(ruleIds).toContain(r.ruleId);
  });

  it("without structured findings: one result per failing CATEGORY, ruleId = category id", async () => {
    twoFiles();
    expect(await run("docs", "--format", "sarif")).toBe(0);
    const { results, tool } = JSON.parse(stdout()).runs[0];
    expect(results.map((r: { ruleId: string }) => r.ruleId)).toEqual([
      "alt_text",
      "title_language",
    ]);
    expect(results.map((r: { level: string }) => r.level)).toEqual(["error", "warning"]);
    // The message carries the headline, not the indented detail or the how-to.
    expect(results[0].message.text).toContain("0 of 3 image(s) have alternative text");
    expect(results[0].message.text).not.toContain("Image 1");
    expect(results[0].message.text).not.toContain("How to fix");
    expect(results[0].locations).toEqual([
      {
        physicalLocation: {
          artifactLocation: { uri: "docs/bad%2C%20%22quoted%22.pdf", uriBaseId: "%SRCROOT%" },
        },
      },
    ]);
    expect(tool.driver.rules[0]).toMatchObject({ id: "alt_text", helpUri: "https://www.w3.org/x" });
  });

  it("with structured findings: one result per FAILURE finding, ruleId = its code", async () => {
    file("a.pdf");
    analyzeDocument.mockResolvedValue(
      result("a.pdf", 40, {
        categories: [
          category({
            id: "alt_text",
            label: "Alt Text",
            score: 0,
            severity: "Critical",
            findings: ["0 of 3 image(s) have alternative text", "How to fix: add alt", "13 images"],
            findingDetails: [
              {
                code: "pdf.alt_text.images_missing_alt",
                kind: "failure",
                text: "0 of 3 image(s) have alternative text",
                count: 3,
                total: 3,
                pages: [2, 5],
                sc: ["1.1.1"],
              },
              { code: "pdf.alt_text.howto", kind: "howto", text: "How to fix: add alt" },
              { code: "pdf.alt_text.image_count", kind: "info", text: "13 images" },
            ],
          }),
          category({
            id: "title_language",
            label: "Title",
            score: 50,
            severity: "Minor",
            findings: ["No title", "No language"],
            findingDetails: [
              { code: "pdf.title.missing", kind: "failure", text: "No title", sc: ["2.4.2"] },
              { code: "pdf.lang.missing", kind: "failure", text: "No language", sc: ["3.1.1"] },
            ],
          }),
          category({
            id: "bookmarks",
            score: 100,
            severity: "No scored issues",
            findings: ["Advisory"],
            findingDetails: [{ code: "pdf.bookmarks.none", kind: "advisory", text: "Advisory" }],
          }),
        ],
      }),
    );
    expect(await run("a.pdf", "--format", "sarif")).toBe(0);
    const { results, tool } = JSON.parse(stdout()).runs[0];
    expect(results.map((r: { ruleId: string }) => r.ruleId)).toEqual([
      "pdf.alt_text.images_missing_alt",
      "pdf.title.missing",
      "pdf.lang.missing",
    ]);
    expect(results.map((r: { level: string }) => r.level)).toEqual(["error", "note", "note"]);
    expect(results[0].message.text).toBe("0 of 3 image(s) have alternative text");
    expect(results[0].properties).toMatchObject({
      category: "alt_text",
      count: 3,
      total: 3,
      pages: [2, 5],
      wcag: ["1.1.1"],
    });
    expect(results[0].locations[0].physicalLocation.artifactLocation.uri).toBe("a.pdf");
    const rule = tool.driver.rules.find((r: { id: string }) => r.id === "pdf.title.missing");
    expect(rule.properties.tags).toEqual(["accessibility", "wcag-2.4.2"]);
    // Two results in one file get different fingerprints.
    const prints = results.map(
      (r: { partialFingerprints: Record<string, string> }) => r.partialFingerprints["a11yAudit/v1"],
    );
    expect(new Set(prints).size).toBe(3);
  });

  it("a failing category whose structured findings name no failure still gets a result", async () => {
    file("a.pdf");
    analyzeDocument.mockResolvedValue(
      result("a.pdf", 40, {
        categories: [
          category({
            id: "alt_text",
            label: "Alt Text",
            score: 33,
            severity: "Critical",
            findings: ["1 of 3 image(s) have alternative text"],
            findingDetails: [
              {
                code: "pdf.alt_text.count",
                kind: "info",
                text: "1 of 3 image(s) have alternative text",
              },
            ],
          }),
        ],
      }),
    );
    expect(await run("a.pdf", "--format", "sarif")).toBe(0);
    const { results } = JSON.parse(stdout()).runs[0];
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ ruleId: "alt_text", level: "error" });
  });

  it("a file that could not be audited is a tool notification, not a result", async () => {
    file("a.pdf");
    analyzeDocument.mockRejectedValue(new Error("boom"));
    expect(await run("a.pdf", "--format", "sarif")).toBe(3);
    const run0 = JSON.parse(stdout()).runs[0];
    expect(run0.results).toEqual([]);
    expect(run0.invocations[0].executionSuccessful).toBe(false);
    expect(run0.invocations[0].toolExecutionNotifications[0]).toMatchObject({
      level: "error",
      message: { text: "a.pdf: boom" },
    });
  });
});

describe("--output", () => {
  it("writes the report to the file (creating folders) and keeps stdout empty", async () => {
    twoFiles();
    expect(await run("docs", "--format", "sarif", "--output", "out/reports/a11y.sarif")).toBe(0);
    expect(out).toEqual([]);
    const written = readFileSync(join(dir, "out/reports/a11y.sarif"), "utf-8");
    expect(JSON.parse(written).version).toBe("2.1.0");
    expect(written.endsWith("\n")).toBe(true);
    expect(err.join("\n")).toContain("Report written:");
  });

  it("a text report written to a file carries no colour codes", async () => {
    file("a.pdf", "%PDF- score:10");
    expect(await run("a.pdf", "--fail-under", "50", "-o", "report.txt")).toBe(1);
    const written = readFileSync(join(dir, "report.txt"), "utf-8");
    expect(written).toContain("Score: 10/100");
    expect(written).toContain("FAILED:");
    // eslint-disable-next-line no-control-regex
    expect(written).not.toMatch(/\x1b\[/);
    // …and the reason for the failure still reaches the log.
    expect(err.join("\n")).toContain("a.pdf: score 10 is below the minimum of 50");
  });

  it("--quiet says nothing extra on the error stream", async () => {
    file("a.pdf", "%PDF- score:10");
    expect(await run("a.pdf", "--fail-under", "50", "--json", "-o", "r.json", "--quiet")).toBe(1);
    expect(err).toEqual([]);
  });
});

// -------------------------------------------------------------- config file

describe("config file", () => {
  const config = (name: string, body: unknown): void =>
    writeFileSync(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));

  it(".a11y-audit.json supplies defaults — including the paths", async () => {
    file("docs/a.pdf", "%PDF- score:70");
    config(".a11y-audit.json", { paths: ["docs"], failUnder: 80, format: "json" });
    expect(await run()).toBe(1);
    const report = JSON.parse(stdout());
    expect(report.summary.gates.failUnder).toBe(80);
    expect(report.results[0].path).toBe("docs/a.pdf");
  });

  it("a11y-audit.config.json is the other accepted name", async () => {
    file("a.pdf", "%PDF- score:70");
    config("a11y-audit.config.json", { failUnder: 80 });
    expect(await run("a.pdf")).toBe(1);
  });

  it(".a11y-audit.json wins when both exist", async () => {
    file("a.pdf", "%PDF- score:70");
    config(".a11y-audit.json", { failUnder: 60 });
    config("a11y-audit.config.json", { failUnder: 80 });
    expect(await run("a.pdf")).toBe(0);
  });

  it("flags win over the file, one setting at a time", async () => {
    file("docs/a.pdf", "%PDF- score:70");
    file("other/b.pdf", "%PDF- score:70");
    config(".a11y-audit.json", {
      paths: ["docs"],
      failUnder: 80,
      failOnConformance: true,
      format: "csv",
    });
    // A lower bar, a different format, different paths — all from flags.
    expect(await run("other", "--fail-under", "50", "--format", "json")).toBe(0);
    const report = JSON.parse(stdout());
    expect(report.results.map((r: { path: string }) => r.path)).toEqual(["other/b.pdf"]);
    // …and what no flag mentioned still comes from the file.
    expect(report.summary.gates).toMatchObject({ failUnder: 50, failOnConformance: true });
  });

  it("--no-fail-on-conformance turns off a gate the file turned on", async () => {
    file("a.pdf");
    config(".a11y-audit.json", { failOnConformance: true });
    analyzeDocument.mockResolvedValue(
      result("a.pdf", 100, { conformance: { status: "fail", failures: [{ sc: "1.1.1" }] } }),
    );
    expect(await run("a.pdf")).toBe(1);
    expect(await run("a.pdf", "--no-fail-on-conformance")).toBe(0);
  });

  it("exclude adds up across file and flags", async () => {
    file("docs/a.pdf");
    file("docs/drafts/b.pdf");
    file("docs/old/c.pdf");
    config(".a11y-audit.json", { exclude: ["drafts"] });
    expect(await run("docs", "--exclude", "old", "--json")).toBe(0);
    expect(paths()).toEqual(["docs/a.pdf"]);
  });

  it("--no-config ignores it; --config names another", async () => {
    file("a.pdf", "%PDF- score:70");
    config(".a11y-audit.json", { failUnder: 80 });
    config("strict.json", { failUnder: 99 });
    expect(await run("a.pdf", "--no-config")).toBe(0);
    expect(await run("a.pdf", "--config", "strict.json", "--json")).toBe(1);
    expect(JSON.parse(stdout()).summary.gates.failUnder).toBe(99);
  });

  it("a misspelt key, a bad value, broken JSON, or a missing --config file is a usage error", async () => {
    file("a.pdf");
    config(".a11y-audit.json", { failBelow: 80 });
    expect(await run("a.pdf")).toBe(2);
    expect(err.join("\n")).toContain('Unknown key "failBelow"');
    config(".a11y-audit.json", { failOn: "severe" });
    expect(await run("a.pdf")).toBe(2);
    config(".a11y-audit.json", "{ not json");
    expect(await run("a.pdf")).toBe(2);
    expect(await run("a.pdf", "--config", "nope.json")).toBe(2);
    expect(analyzeDocument).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------- baseline

describe("baseline", () => {
  const BASELINE = ".a11y-audit-baseline.json";
  const readBaseline = (): { files: Record<string, { score: number; sha256: string }> } =>
    JSON.parse(readFileSync(join(dir, BASELINE), "utf-8"));

  it("--update-baseline records every file's score and hash, sorted, and exits 0", async () => {
    file("docs/b.pdf", "%PDF- score:40");
    file("docs/a.pdf", "%PDF- score:90");
    // Gates are not judged while recording — a low score is simply written down.
    expect(await run("docs", "--update-baseline", "--fail-under", "80")).toBe(0);
    const baseline = readBaseline();
    expect(Object.keys(baseline)).toEqual(["schemaVersion", "tool", "files"]);
    expect(Object.keys(baseline.files)).toEqual(["docs/a.pdf", "docs/b.pdf"]);
    expect(baseline.files["docs/b.pdf"].score).toBe(40);
    expect(baseline.files["docs/b.pdf"].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("an unchanged or improved file passes even below --fail-under", async () => {
    file("docs/old.pdf", "%PDF- score:40");
    expect(await run("docs", "--update-baseline")).toBe(0);
    expect(await run("docs", "--baseline", BASELINE, "--fail-under", "80")).toBe(0);
    file("docs/old.pdf", "%PDF- score:55");
    expect(await run("docs", "--baseline", BASELINE, "--fail-under", "80", "--json")).toBe(0);
    expect(JSON.parse(stdout()).results[0].baseline).toEqual({ score: 40, delta: 15 });
  });

  it("a file that got worse fails, with the drop spelled out", async () => {
    file("docs/old.pdf", "%PDF- score:90");
    expect(await run("docs", "--update-baseline")).toBe(0);
    file("docs/old.pdf", "%PDF- score:85");
    // 85 clears --fail-under 80; it fails because it DROPPED.
    expect(await run("docs", "--baseline", BASELINE, "--fail-under", "80", "--json")).toBe(1);
    const entry = JSON.parse(stdout()).results[0];
    expect(entry.gateFailures).toEqual([
      { gate: "baseline", message: "score fell from 90 to 85 since the baseline" },
    ]);
    expect(entry.baseline).toEqual({ score: 90, delta: -5 });
  });

  it("a NEW file has to clear the ordinary gates", async () => {
    file("docs/old.pdf", "%PDF- score:40");
    expect(await run("docs", "--update-baseline")).toBe(0);
    file("docs/new.pdf", "%PDF- score:70");
    expect(await run("docs", "--baseline", BASELINE, "--fail-under", "80", "--json")).toBe(1);
    const byPath = Object.fromEntries(
      (JSON.parse(stdout()).results as Array<{ path: string; passed: boolean }>).map((r) => [
        r.path,
        r.passed,
      ]),
    );
    expect(byPath).toEqual({ "docs/new.pdf": false, "docs/old.pdf": true });

    file("docs/new.pdf", "%PDF- score:80");
    expect(await run("docs", "--baseline", BASELINE, "--fail-under", "80")).toBe(0);
  });

  it("a new file with no threshold given passes", async () => {
    file("docs/old.pdf", "%PDF- score:40");
    expect(await run("docs", "--update-baseline")).toBe(0);
    file("docs/new.pdf", "%PDF- score:5");
    expect(await run("docs", "--baseline", BASELINE)).toBe(0);
  });

  it("a renamed file is recognised by its contents, not treated as new", async () => {
    file("docs/old-name.pdf", "%PDF- score:40");
    expect(await run("docs", "--update-baseline")).toBe(0);
    renameSync(join(dir, "docs/old-name.pdf"), join(dir, "docs/new-name.pdf"));
    expect(await run("docs", "--baseline", BASELINE, "--fail-under", "80")).toBe(0);
  });

  it("accepts a hand-written plain map, keyed by path or by sha256", async () => {
    file("a.pdf", "%PDF- score:60");
    file("b.pdf", "%PDF- score:60");
    expect(await run("b.pdf", "--json")).toBe(0);
    const sha = JSON.parse(stdout()).results[0].sha256;
    writeFileSync(join(dir, "base.json"), JSON.stringify({ "a.pdf": 70, [`sha256:${sha}`]: 60 }));
    expect(await run("a.pdf", "b.pdf", "--baseline", "base.json", "--json")).toBe(1);
    const [a, b] = JSON.parse(stdout()).results;
    expect(a).toMatchObject({ passed: false, baseline: { score: 70, delta: -10 } });
    expect(b).toMatchObject({ passed: true, baseline: { score: 60, delta: 0 } });
  });

  it("updating from a sub-folder keeps the rest; a deleted file is dropped", async () => {
    file("docs/a.pdf", "%PDF- score:50");
    file("other/b.pdf", "%PDF- score:60");
    file("other/gone.pdf", "%PDF- score:70");
    expect(await run("docs", "other", "--update-baseline")).toBe(0);
    rmSync(join(dir, "other/gone.pdf"));
    file("docs/a.pdf", "%PDF- score:55");
    expect(await run("docs", "--update-baseline")).toBe(0);
    const { files } = readBaseline();
    expect(Object.keys(files)).toEqual(["docs/a.pdf", "other/b.pdf"]);
    expect(files["docs/a.pdf"].score).toBe(55);
    expect(files["other/b.pdf"].score).toBe(60);
  });

  it("a file that cannot be audited keeps its old entry on update, and the run exits 3", async () => {
    file("docs/a.pdf", "%PDF- score:50");
    expect(await run("docs", "--update-baseline")).toBe(0);
    analyzeDocument.mockRejectedValue(new Error("boom"));
    expect(await run("docs", "--update-baseline")).toBe(3);
    expect(readBaseline().files["docs/a.pdf"].score).toBe(50);
  });

  it("--baseline with a custom path; --update-baseline writes to it", async () => {
    file("a.pdf", "%PDF- score:50");
    expect(await run("a.pdf", "--update-baseline", "--baseline", "ci/base.json")).toBe(0);
    expect(existsSync(join(dir, "ci/base.json"))).toBe(true);
    expect(existsSync(join(dir, BASELINE))).toBe(false);
  });

  it("a missing or malformed baseline is a usage error, before anything is audited", async () => {
    file("a.pdf");
    expect(await run("a.pdf", "--baseline", "nope.json")).toBe(2);
    expect(err.join("\n")).toContain("create it with --update-baseline");
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ "a.pdf": "eighty" }));
    expect(await run("a.pdf", "--baseline", "bad.json")).toBe(2);
    expect(analyzeDocument).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------- help

describe("help", () => {
  it("documents every flag, the exit statuses, the config file and two worked examples", async () => {
    expect(await run("--help")).toBe(0);
    const help = stdout();
    for (const flag of [
      "--format",
      "--output",
      "--json",
      "--quiet",
      "--fail-under",
      "--threshold",
      "--fail-on ",
      "--fail-on-conformance",
      "--baseline",
      "--update-baseline",
      "--concurrency",
      "--exclude",
      "--allow-empty",
      "--config",
      "--no-config",
    ]) {
      expect(help, flag).toContain(flag);
    }
    for (const format of ["text", "json", "ndjson", "csv", "junit", "sarif"]) {
      expect(help, format).toContain(format);
    }
    expect(help).toContain(".a11y-audit.json");
    expect(help).toContain("a11y-audit.config.json");
    expect(help).toMatch(/\n\s*0\s+every file was audited/);
    expect(help).toMatch(/\n\s*1\s+a gate failed/);
    expect(help).toMatch(/\n\s*2\s+the command could not start/);
    expect(help).toMatch(/\n\s*3\s+one or more files could not be audited/);
    expect(help.match(/Example —/g)).toHaveLength(2);
  });
});

// ------------------------------------------------------------ the bin shim

describe("bin/a11y-audit.js", () => {
  const BIN = resolve(dirname(fileURLToPath(import.meta.url)), "../../bin/a11y-audit.js");

  it("is what package.json's bin points at", () => {
    const pkg = JSON.parse(readFileSync(resolve(dirname(BIN), "../package.json"), "utf-8")) as {
      bin: Record<string, string>;
    };
    expect(resolve(dirname(BIN), "..", pkg.bin["a11y-audit"])).toBe(BIN);
  });

  it("starts from a directory outside the repository (a real process)", () => {
    const printed = execFileSync(process.execPath, [BIN, "--version"], {
      cwd: dir,
      encoding: "utf-8",
      env: { ...process.env, TSX_TSCONFIG_PATH: "" },
      timeout: 60_000,
    });
    expect(printed.trim()).toBe(`a11y-audit v${VERSION}`);
  }, 70_000);

  it("a usage error from the real process is exit status 2", () => {
    let status: number | null = 0;
    try {
      execFileSync(process.execPath, [BIN, "audit", "missing.pdf"], {
        cwd: dir,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, TSX_TSCONFIG_PATH: "" },
        timeout: 60_000,
      });
    } catch (e) {
      status = (e as { status: number | null }).status;
    }
    expect(status).toBe(2);
  }, 70_000);
});
