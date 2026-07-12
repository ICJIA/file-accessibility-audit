/**
 * OOXML (docx/pptx/xlsx) analysis now runs in a per-request child process
 * (`node --import tsx` → services/ooxmlWorker.ts, driven by
 * services/ooxmlRunner.ts) instead of behind a plain Promise.race timeout,
 * so a timeout can genuinely SIGKILL a runaway synchronous analysis instead
 * of merely abandoning it while it keeps burning the event loop (the DoS
 * this closes — `withTimeout` alone, still used as-is for PDF in
 * pdfAnalyzer.ts, cannot stop synchronous JS it's racing against). A child
 * process (not a worker_thread) is required because tsx's `.js`→`.ts` +
 * `#config` resolution is not inherited by worker_threads spawned with
 * `execArgv:['--import','tsx']` — see ooxmlWorker.ts's header.
 *
 * This file proves, at the analyzeDocument (black-box) level:
 *  1. Results are byte-identical to the pre-child inline path — the existing
 *     docx/pptx/xlsxIntegration.test.ts + analyzer.test.ts suites already
 *     cover this (they call analyzeDocument, now transparently child-backed,
 *     and must pass UNCHANGED); the tests below add one explicit "survives
 *     the child/IPC boundary" assertion per type.
 *  2. A timeout rejects with the same `{ killed: true, code: 'ETIMEDOUT' }`
 *     shape withTimeout produces (so route mapping to 504 is unaffected),
 *     the child is actually killed (spawn spy → the returned child's
 *     `.killed` flag), and the concurrency slot is freed for the next
 *     request.
 *  3. A *ParseError's `.code` (e.g. "PPTX_PARSE_FAILED"/"XLSX_PARSE_FAILED")
 *     survives the structured-clone IPC reply back across the process
 *     boundary.
 *
 * Timeout tests use the same scoped-#config-mock pattern as
 * pdfAnalyzerTimeout.test.ts / xlsxService.test.ts's MAX_CELLS tests:
 * `vi.resetModules()` + `vi.doMock('#config', ...)` + a dynamic `import()`
 * of analyzer.js, so only that one call sees the shrunk ANALYSIS_TIMEOUT_MS.
 * The timeout is enforced in the PARENT (ooxmlRunner's setTimeout), so
 * shrinking it in the parent's mocked config takes effect even though the
 * child process reads the real, unmocked config. A tiny timeout fires during
 * child startup (before analysis) — per the design that still exercises the
 * exact timeout→SIGKILL→{ETIMEDOUT} path and the no-lingering-child
 * guarantee; a mid-analysis kill would look identical to the parent.
 */
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import JSZip from "jszip";
import { PPTX, XLSX } from "#config";
import { analyzeDocument } from "../services/analyzer.js";
import { runOoxmlInWorker } from "../services/ooxmlRunner.js";
import { buildDocx } from "./helpers/minimalDocx.js";
import { buildPptx } from "./helpers/minimalPptx.js";
import { buildXlsx } from "./helpers/minimalXlsx.js";

// Wrap node:child_process.spawn so every child the runner spawns is recorded
// (calling through to the real spawn — fully transparent), letting the
// timeout test assert the child was actually killed. ESM export bindings
// aren't spyable (namespace not configurable), so this is done via vi.mock +
// vi.hoisted rather than vi.spyOn. The array is captured by reference so it
// survives the vi.resetModules() the scoped-config helper does.
//
// Two extra hoisted pieces support the RB2 tests below:
//  - spawnCalls records the full (execPath, args, options) tuple for every
//    real spawn, so the "spawn env excludes secrets" test can inspect
//    options.env without needing its own separate mock (spying on a second
//    module mock of the same 'node:child_process' specifier isn't possible
//    once this one is registered).
//  - fakeChildQueue lets a single test substitute a synthetic, fully
//    controllable EventEmitter "child" instead of a real process, needed to
//    deterministically observe the timeout-settlement ORDERING fix (RB2-a):
//    a real process's SIGKILL-to-'exit' latency is too fast/variable to
//    reliably assert "the promise is still pending right after kill() is
//    called" against a live child.
const { spawnedChildren, spawnCalls, fakeChildQueue } = vi.hoisted(() => ({
  spawnedChildren: [] as ChildProcess[],
  spawnCalls: [] as unknown[][],
  fakeChildQueue: [] as unknown[],
}));
vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (...args: Parameters<typeof actual.spawn>) => {
      spawnCalls.push(args);
      if (fakeChildQueue.length > 0) {
        const fake = fakeChildQueue.shift();
        spawnedChildren.push(fake as ChildProcess);
        return fake as ReturnType<typeof actual.spawn>;
      }
      const child = actual.spawn(...args);
      spawnedChildren.push(child);
      return child;
    },
  };
});

/**
 * A synthetic ChildProcess stand-in for the RB2-a ordering tests: a plain
 * EventEmitter (so `.once('exit', ...)` etc. behave exactly like the real
 * thing) plus the handful of members ooxmlRunner.ts actually touches
 * (`.kill`, `.send`, `.exitCode`, `.signalCode`). No real process is ever
 * spawned, so the test controls precisely when (or whether) 'exit' fires.
 */
function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: string | null;
    kill: (signal?: string) => boolean;
    send: (msg: unknown, cb?: (err: Error | null) => void) => boolean;
  };
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn(() => true);
  child.send = vi.fn((_msg: unknown, cb?: (err: Error | null) => void) => {
    cb?.(null);
    return true;
  });
  return child;
}

const TINY_TIMEOUT_MS = 5;

async function withScopedConfig<T>(
  overrides: (actual: any) => Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  vi.resetModules();
  vi.doMock("#config", async (importOriginal) => {
    const actual = (await importOriginal()) as any;
    return { ...actual, ...overrides(actual) };
  });
  try {
    return await fn();
  } finally {
    vi.doUnmock("#config");
    vi.resetModules();
  }
}

describe("OOXML child process: result is intact end-to-end through the IPC boundary", () => {
  it("docx: analyzeDocument's result survives the child round-trip", async () => {
    const buf = await buildDocx();
    const r = await analyzeDocument(buf, "worker.docx");
    expect(r.fileType).toBe("docx");
    expect(r.docxMetadata?.title).toBe("Quarterly Report");
    expect(typeof r.overallScore).toBe("number");
    expect(r.categories.length).toBeGreaterThan(0);
    expect(r.conformance).toBeDefined();
    // PDF-only signals must be absent for OOXML.
    expect(r.pdfUa).toBeUndefined();
    expect(r.adobeParity).toBeUndefined();
  });

  it("pptx: analyzeDocument's result survives the child round-trip", async () => {
    const buf = await buildPptx({ slides: [{ title: "Welcome" }] });
    const r = await analyzeDocument(buf, "worker.pptx");
    expect(r.fileType).toBe("pptx");
    expect(r.pptxMetadata?.title).toBe("Quarterly Briefing");
    expect(r.pageCount).toBe(1);
    expect(r.categories.length).toBeGreaterThan(0);
  });

  it("xlsx: analyzeDocument's result survives the child round-trip", async () => {
    const buf = await buildXlsx({ sheets: [{ name: "A" }, { name: "B" }] });
    const r = await analyzeDocument(buf, "worker.xlsx");
    expect(r.fileType).toBe("xlsx");
    expect(r.xlsxMetadata?.title).toBe("Grant Ledger");
    expect(r.pageCount).toBe(2);
    expect(r.categories.length).toBeGreaterThan(0);
  });
});

describe("OOXML child process: timeout SIGKILLs the child instead of abandoning it", () => {
  it("docx: rejects with a killed/ETIMEDOUT error and kills the spawned child", async () => {
    spawnedChildren.length = 0;
    const buf = await buildDocx();
    await withScopedConfig(
      (actual) => ({ DOCX: { ...actual.DOCX, ANALYSIS_TIMEOUT_MS: TINY_TIMEOUT_MS } }),
      async () => {
        const { analyzeDocument: analyze } = await import("../services/analyzer.js");
        await expect(analyze(buf, "slow.docx")).rejects.toMatchObject({
          killed: true,
          code: "ETIMEDOUT",
        });
      },
    );
    // The runner spawned exactly one child and the timeout path killed it —
    // `.killed` is set once .kill() is invoked. This proves the timeout does
    // not merely abandon the child (the DoS) but genuinely terminates it.
    expect(spawnedChildren.length).toBeGreaterThan(0);
    expect(spawnedChildren.every((c) => c.killed)).toBe(true);
  });

  it("pptx: rejects with a killed/ETIMEDOUT error", async () => {
    const buf = await buildPptx({ slides: [{ title: "Welcome" }] });
    await withScopedConfig(
      (actual) => ({ PPTX: { ...actual.PPTX, ANALYSIS_TIMEOUT_MS: TINY_TIMEOUT_MS } }),
      async () => {
        const { analyzeDocument: analyze } = await import("../services/analyzer.js");
        await expect(analyze(buf, "slow.pptx")).rejects.toMatchObject({
          killed: true,
          code: "ETIMEDOUT",
        });
      },
    );
  });

  it("xlsx: rejects with a killed/ETIMEDOUT error", async () => {
    const buf = await buildXlsx({ sheets: [{ name: "A" }] });
    await withScopedConfig(
      (actual) => ({ XLSX: { ...actual.XLSX, ANALYSIS_TIMEOUT_MS: TINY_TIMEOUT_MS } }),
      async () => {
        const { analyzeDocument: analyze } = await import("../services/analyzer.js");
        await expect(analyze(buf, "slow.xlsx")).rejects.toMatchObject({
          killed: true,
          code: "ETIMEDOUT",
        });
      },
    );
  });

  it("frees the concurrency slot after a timeout (a second call does not hang behind it)", async () => {
    const buf = await buildXlsx({ sheets: [{ name: "A" }] });
    await withScopedConfig(
      (actual) => ({
        XLSX: { ...actual.XLSX, ANALYSIS_TIMEOUT_MS: TINY_TIMEOUT_MS },
        // Scoped to 1 so this test is only meaningful if the slot is truly
        // freed: if releaseSemaphore didn't fire after the killed child
        // settled, the second call would queue behind the "leaked" slot and
        // fail via the semaphore's own 60s wait-queue timeout — blowing past
        // vitest's per-test timeout and failing this test rather than
        // hanging it forever.
        ANALYSIS: { ...actual.ANALYSIS, MAX_CONCURRENT_ANALYSES: 1 },
      }),
      async () => {
        const { analyzeDocument: analyze } = await import("../services/analyzer.js");
        await expect(analyze(buf, "a.xlsx")).rejects.toThrow();
        await expect(analyze(buf, "b.xlsx")).rejects.toThrow();
      },
    );
  });
});

describe("OOXML child process: a *ParseError's .code survives the IPC boundary", () => {
  it("pptx: a deck exceeding MAX_SLIDES rejects analyzeDocument with code PPTX_PARSE_FAILED", async () => {
    // Detection (in the PARENT) only needs [Content_Types].xml +
    // ppt/presentation.xml present + well-formed; the MAX_SLIDES cap (checked
    // IN THE CHILD, against the real unmocked config) trips on the slide-file
    // FILENAMES before any slide content is read, so empty slide entries
    // suffice — fast to build, and it proves the child's PptxParseError.code
    // survives the structured-clone reply.
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
    );
    zip.file(
      "docProps/core.xml",
      `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title><dc:creator>C</dc:creator></cp:coreProperties>`,
    );
    zip.file(
      "ppt/presentation.xml",
      `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst/></p:presentation>`,
    );
    const tooMany = PPTX.MAX_SLIDES + 1;
    for (let i = 1; i <= tooMany; i++) zip.file(`ppt/slides/slide${i}.xml`, "");
    const buf = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;

    await expect(analyzeDocument(buf, "huge.pptx")).rejects.toMatchObject({
      code: "PPTX_PARSE_FAILED",
    });
  });

  it("xlsx: a workbook exceeding MAX_SHEETS rejects analyzeDocument with code XLSX_PARSE_FAILED", async () => {
    // Same shape: MAX_SHEETS is checked in the child against the parsed
    // <sheet> elements in xl/workbook.xml BEFORE any worksheet part is
    // resolved, so no real per-sheet parts are needed to trip the real cap.
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
    );
    zip.file(
      "docProps/core.xml",
      `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title><dc:creator>C</dc:creator></cp:coreProperties>`,
    );
    const tooMany = XLSX.MAX_SHEETS + 1;
    const sheets = Array.from(
      { length: tooMany },
      (_, i) => `<sheet name="S${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    ).join("");
    zip.file(
      "xl/workbook.xml",
      `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`,
    );
    const buf = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;

    await expect(analyzeDocument(buf, "huge.xlsx")).rejects.toMatchObject({
      code: "XLSX_PARSE_FAILED",
    });
  });
});

describe("RB2-a: timeout settlement waits for the child's OS-confirmed exit", () => {
  // Today, runOoxmlInWorker's timeout branch calls killChild() (SIGKILL)
  // and rejects in the SAME synchronous tick — so analyzer.ts's
  // `finally { releaseSemaphore() }` frees the concurrency slot the instant
  // the signal is *issued*, not once the OS has actually reaped the
  // process. The fix delays the reject() until the child's 'exit' event
  // fires (a short grace timer races it so a truly stuck child still
  // rejects). A synthetic fake child (see makeFakeChild above) gives
  // deterministic control over exactly when 'exit' fires — a real
  // process's SIGKILL-to-exit latency is too fast/variable to reliably
  // assert "still pending right after kill()" against.
  const TINY_MS = 5;

  it("does NOT settle the promise merely because the timeout fired and kill() was called", async () => {
    const fakeChild = makeFakeChild();
    fakeChildQueue.push(fakeChild);

    const promise = runOoxmlInWorker("xlsx", Buffer.from("probe"), TINY_MS);
    // Observe settlement without ever producing an unhandled rejection.
    const settled = promise.then(
      () => ({ state: "resolved" as const }),
      (e) => ({ state: "rejected" as const, e }),
    );

    // Let the timeoutMs timer fire and call kill() — but do not emit
    // 'exit' yet.
    await new Promise((r) => setTimeout(r, TINY_MS + 30));
    expect(fakeChild.kill).toHaveBeenCalledWith("SIGKILL");

    const raceResult = await Promise.race([
      settled.then(() => "settled" as const),
      new Promise<"still-pending">((r) => setTimeout(() => r("still-pending"), 50)),
    ]);
    // This is the crux of the fix: SIGKILL was issued, but the child has
    // not (yet) told us it actually exited, so the promise — and therefore
    // the concurrency-slot release riding on it — must still be pending.
    expect(raceResult).toBe("still-pending");

    // Clean up: let the child "exit" so the promise settles and nothing
    // leaks into the next test.
    fakeChild.signalCode = "SIGKILL";
    fakeChild.emit("exit", null, "SIGKILL");
    await settled;
  });

  it("settles with the ETIMEDOUT/killed shape once the child's 'exit' event fires", async () => {
    const fakeChild = makeFakeChild();
    fakeChildQueue.push(fakeChild);

    const promise = runOoxmlInWorker("pptx", Buffer.from("probe"), TINY_MS);
    // Attach a handler synchronously (before the timer below can possibly
    // fire) so a rejection that lands before we emit 'exit' is never
    // briefly "unhandled" from Node's perspective — avoids a spurious
    // PromiseRejectionHandledWarning regardless of exactly when the
    // implementation settles.
    const settled = promise.catch((e) => e);

    await new Promise((r) => setTimeout(r, TINY_MS + 30));
    fakeChild.signalCode = "SIGKILL";
    fakeChild.emit("exit", null, "SIGKILL");

    const outcome = await settled;
    expect(outcome).toMatchObject({
      killed: true,
      code: "ETIMEDOUT",
    });
  });

  it("still rejects via the grace timer if the child never emits 'exit' (does not hang forever)", async () => {
    const fakeChild = makeFakeChild();
    fakeChildQueue.push(fakeChild);
    // Deliberately never emit 'exit' — simulates a child that somehow
    // doesn't die from SIGKILL.

    await expect(runOoxmlInWorker("docx", Buffer.from("probe"), TINY_MS)).rejects.toMatchObject({
      killed: true,
      code: "ETIMEDOUT",
    });
  }, 10_000);

  it("frees the concurrency slot after a timeout (a second call does not hang behind it) — unchanged regression", async () => {
    const buf = await buildXlsx({ sheets: [{ name: "A" }] });
    await withScopedConfig(
      (actual) => ({
        XLSX: { ...actual.XLSX, ANALYSIS_TIMEOUT_MS: TINY_TIMEOUT_MS },
        ANALYSIS: { ...actual.ANALYSIS, MAX_CONCURRENT_ANALYSES: 1 },
      }),
      async () => {
        const { analyzeDocument: analyze } = await import("../services/analyzer.js");
        await expect(analyze(buf, "a2.xlsx")).rejects.toThrow();
        await expect(analyze(buf, "b2.xlsx")).rejects.toThrow();
      },
    );
  });
});

describe("RB2-d: OOXML worker spawn env excludes API secrets", () => {
  it("does not pass JWT_SECRET/API_PRIVILEGED_TOKEN/SMTP_PASS to the spawned child, but the child still boots and analyzes correctly", async () => {
    const prevJwt = process.env.JWT_SECRET;
    const prevToken = process.env.API_PRIVILEGED_TOKEN;
    const prevSmtp = process.env.SMTP_PASS;
    process.env.JWT_SECRET = "unit-test-jwt-secret-probe";
    process.env.API_PRIVILEGED_TOKEN = "unit-test-privileged-token-probe";
    process.env.SMTP_PASS = "unit-test-smtp-pass-probe";
    try {
      spawnCalls.length = 0;
      const buf = await buildXlsx({ sheets: [{ name: "A" }] });
      // Real spawn + real analysis — proves the OOXML worker still boots
      // and produces a correct result under the stripped env, not just
      // that the outgoing env object lacks the probed keys.
      const r = await analyzeDocument(buf, "envcheck.xlsx");
      expect(r.fileType).toBe("xlsx");
      expect(r.xlsxMetadata?.title).toBe("Grant Ledger");

      expect(spawnCalls.length).toBeGreaterThan(0);
      const [, , options] = spawnCalls[spawnCalls.length - 1] as [
        unknown,
        unknown,
        { env?: Record<string, string | undefined> },
      ];
      const childEnv = options?.env ?? {};
      expect(childEnv.JWT_SECRET).toBeUndefined();
      expect(childEnv.API_PRIVILEGED_TOKEN).toBeUndefined();
      expect(childEnv.SMTP_PASS).toBeUndefined();
      // Essentials survive so the child can actually launch under tsx.
      expect(childEnv.PATH).toBe(process.env.PATH);
    } finally {
      if (prevJwt === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = prevJwt;
      if (prevToken === undefined) delete process.env.API_PRIVILEGED_TOKEN;
      else process.env.API_PRIVILEGED_TOKEN = prevToken;
      if (prevSmtp === undefined) delete process.env.SMTP_PASS;
      else process.env.SMTP_PASS = prevSmtp;
    }
  });
});
