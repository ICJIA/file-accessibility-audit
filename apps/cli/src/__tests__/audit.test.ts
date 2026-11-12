/**
 * runAudit — the `a11y-audit <files…>` command, end to end.
 *
 * 2026-11-12: printResult had a test (auditPrint.test.ts); the command around
 * it had none — exit codes, --threshold, --json and the partial-failure path
 * are the whole contract a CI job scripts against, and nothing pinned them.
 *
 * The engine is mocked (its behaviour is the analyzer suite's business) and
 * process.exit is replaced by a throw, so each test observes exactly the
 * status the real command would have ended with.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnalysisResult } from "@file-audit/analyzer";

const analyzeDocument = vi.hoisted(() => vi.fn());
const checkQpdf = vi.hoisted(() => vi.fn(() => true));
vi.mock("@file-audit/analyzer", () => ({ analyzeDocument }));
vi.mock("../lib/colors.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/colors.js")>()),
  checkQpdf,
}));

import { runAudit } from "../commands/audit.js";
import { VERSION } from "../version.js";

class Exit extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`);
  }
}

function result(filename: string, overallScore: number): AnalysisResult {
  return {
    filename,
    fileType: "pdf",
    pageCount: 3,
    overallScore,
    grade: overallScore >= 90 ? "A" : overallScore >= 80 ? "B" : "F",
    isScanned: false,
    executiveSummary: "Summary.",
    categories: [],
    warnings: [],
  } as unknown as AnalysisResult;
}

let dir: string;
let out: string[];
let err: string[];

/** Run the command; resolve to the exit status (0 when it simply returns). */
async function run(...argv: string[]): Promise<number> {
  try {
    await runAudit(argv);
    return 0;
  } catch (e) {
    if (e instanceof Exit) return e.code;
    throw e;
  }
}

function file(name: string): string {
  const p = join(dir, name);
  writeFileSync(p, "stub — the engine is mocked");
  return p;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "a11y-audit-cmd-"));
  out = [];
  err = [];
  analyzeDocument.mockReset();
  checkQpdf.mockReset().mockReturnValue(true);
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

describe("runAudit — usage errors exit 2 before any analysis", () => {
  it("no files", async () => {
    expect(await run()).toBe(2);
    expect(err.join("\n")).toContain("No files specified");
  });

  it("a file that does not exist", async () => {
    expect(await run(join(dir, "missing.pdf"))).toBe(2);
    expect(err.join("\n")).toContain("File not found");
  });

  it("a directory", async () => {
    const d = join(dir, "folder.pdf");
    mkdirSync(d);
    expect(await run(d)).toBe(2);
    expect(err.join("\n")).toContain("Not a file");
  });

  it("an unsupported extension", async () => {
    expect(await run(file("notes.txt"))).toBe(2);
    expect(err.join("\n")).toContain("Not a PDF, Word");
  });

  it("an unknown option", async () => {
    expect(await run(file("a.pdf"), "--frobnicate")).toBe(2);
  });

  it.each(["abc", "-1", "101"])("--threshold %s", async (bad) => {
    expect(await run(file("a.pdf"), "--threshold", bad)).toBe(2);
    expect(err.join("\n")).toContain("--threshold must be a number between 0 and 100");
  });

  it("one bad path stops the run before the good file is analysed", async () => {
    expect(await run(file("a.pdf"), join(dir, "missing.pdf"))).toBe(2);
    expect(analyzeDocument).not.toHaveBeenCalled();
  });
});

describe("runAudit — informational exits", () => {
  it("--help exits 0", async () => {
    expect(await run("--help")).toBe(0);
    expect(out.join("\n")).toContain("Usage:");
  });

  it("--version prints the package version and exits 0", async () => {
    expect(await run("--version")).toBe(0);
    expect(out.join("\n")).toContain(`a11y-audit v${VERSION}`);
  });
});

describe("runAudit — qpdf", () => {
  it("a PDF without qpdf exits 1 and analyses nothing", async () => {
    checkQpdf.mockReturnValue(false);
    expect(await run(file("a.pdf"))).toBe(1);
    expect(err.join("\n")).toContain("qpdf is not installed");
    expect(analyzeDocument).not.toHaveBeenCalled();
  });

  it("an Office-only run never asks for qpdf", async () => {
    checkQpdf.mockReturnValue(false);
    analyzeDocument.mockResolvedValue(result("a.docx", 95));
    expect(await run(file("a.docx"))).toBe(0);
    expect(checkQpdf).not.toHaveBeenCalled();
  });
});

describe("runAudit — results", () => {
  it("a successful audit prints the report and exits 0", async () => {
    analyzeDocument.mockResolvedValue(result("a.pdf", 95));
    expect(await run(file("a.pdf"))).toBe(0);
    expect(out.join("\n")).toContain("95/100");
    expect(analyzeDocument).toHaveBeenCalledWith(expect.any(Buffer), "a.pdf");
  });

  it("--json prints ONE object for one file, and nothing else on stdout", async () => {
    analyzeDocument.mockResolvedValue(result("a.pdf", 95));
    expect(await run(file("a.pdf"), "--json")).toBe(0);
    const parsed = JSON.parse(out.join("\n"));
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.overallScore).toBe(95);
  });

  it("--json prints an array for several files, in argument order", async () => {
    analyzeDocument.mockImplementation(async (_b: Buffer, name: string) =>
      result(name, name === "a.pdf" ? 95 : 40),
    );
    expect(await run(file("a.pdf"), file("b.docx"), "--json")).toBe(0);
    const parsed = JSON.parse(out.join("\n"));
    expect(parsed.map((r: AnalysisResult) => r.filename)).toEqual(["a.pdf", "b.docx"]);
  });
});

describe("runAudit — --threshold", () => {
  it("no threshold: a failing score still exits 0", async () => {
    analyzeDocument.mockResolvedValue(result("a.pdf", 12));
    expect(await run(file("a.pdf"))).toBe(0);
  });

  it("a score below the threshold exits 1 and names the file", async () => {
    analyzeDocument.mockResolvedValue(result("a.pdf", 79));
    expect(await run(file("a.pdf"), "--threshold", "80")).toBe(1);
    const text = out.join("\n");
    expect(text).toContain("FAILED:");
    expect(text).toContain("a.pdf: 79");
  });

  it("a score exactly AT the threshold passes", async () => {
    analyzeDocument.mockResolvedValue(result("a.pdf", 80));
    expect(await run(file("a.pdf"), "--threshold", "80")).toBe(0);
  });

  it("one file below the threshold fails the whole run, naming only that file", async () => {
    analyzeDocument.mockImplementation(async (_b: Buffer, name: string) =>
      result(name, name === "a.pdf" ? 95 : 40),
    );
    expect(await run(file("a.pdf"), file("b.pdf"), "--threshold", "80")).toBe(1);
    const text = out.join("\n");
    expect(text).toContain("1 file(s) scored below threshold of 80");
    expect(text).toContain("b.pdf: 40");
    expect(text).not.toContain("a.pdf: 95");
  });

  it("--json with a failing threshold exits 1 and keeps stdout pure JSON", async () => {
    analyzeDocument.mockResolvedValue(result("a.pdf", 10));
    expect(await run(file("a.pdf"), "--json", "--threshold", "80")).toBe(1);
    expect(() => JSON.parse(out.join("\n"))).not.toThrow();
    expect(out.join("\n")).not.toContain("FAILED");
  });
});

describe("runAudit — failures during analysis", () => {
  it("partial failure: the good file is still reported, and the run exits 1", async () => {
    analyzeDocument.mockImplementation(async (_b: Buffer, name: string) => {
      if (name === "bad.pdf") throw new Error("could not be parsed");
      return result(name, 95);
    });
    expect(await run(file("bad.pdf"), file("good.pdf"))).toBe(1);
    expect(err.join("\n")).toContain("Error analyzing bad.pdf: could not be parsed");
    expect(out.join("\n")).toContain("good.pdf");
    expect(out.join("\n")).toContain("95/100");
  });

  it("partial failure exits 1 even when every analysed file clears the threshold", async () => {
    analyzeDocument.mockImplementation(async (_b: Buffer, name: string) => {
      if (name === "bad.pdf") throw new Error("boom");
      return result(name, 100);
    });
    expect(await run(file("good.pdf"), file("bad.pdf"), "--threshold", "50")).toBe(1);
  });

  it("partial failure with --json: stdout is the JSON of what succeeded, status 1", async () => {
    analyzeDocument.mockImplementation(async (_b: Buffer, name: string) => {
      if (name === "bad.pdf") throw new Error("boom");
      return result(name, 88);
    });
    expect(await run(file("bad.pdf"), file("good.pdf"), "--json")).toBe(1);
    expect(JSON.parse(out.join("\n")).filename).toBe("good.pdf");
  });

  it("every file failing exits 1 and prints no report", async () => {
    analyzeDocument.mockRejectedValue(new Error("boom"));
    expect(await run(file("a.pdf"), file("b.pdf"))).toBe(1);
    expect(out).toEqual([]);
    expect(err).toHaveLength(2);
  });

  it("an encrypted file gets the password-protected message", async () => {
    analyzeDocument.mockRejectedValue(new Error("encrypted"));
    expect(await run(file("locked.pdf"))).toBe(1);
    expect(err.join("\n")).toContain("locked.pdf is password-protected");
  });
});
