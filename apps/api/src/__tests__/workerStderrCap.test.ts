/**
 * The remediation worker's error output has a hard per-job byte limit.
 *
 * Security review of v1.176.0 (2026-11-24): the worker's stderr is a raw
 * descriptor onto the day's error log, which bypasses that log's per-day byte
 * limit. A document built to make a parser complain without end could have
 * filled the disk. jobs/stderrCap.ts makes the worker limit itself.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { capStream, WORKER_STDERR_MAX_BYTES } from "../jobs/stderrCap";

const HERE = dirname(fileURLToPath(import.meta.url));
const CAP_MODULE = resolve(HERE, "../jobs/stderrCap.ts");

function fakeStream() {
  const chunks: string[] = [];
  return {
    chunks,
    bytes: () => chunks.reduce((n, c) => n + Buffer.byteLength(c), 0),
    write: ((chunk: unknown, ...rest: unknown[]) => {
      chunks.push(String(chunk));
      const cb = rest.find((a) => typeof a === "function") as (() => void) | undefined;
      cb?.();
      return true;
    }) as typeof process.stderr.write,
  };
}

describe("capStream", () => {
  it("passes output through until the limit, then one notice, then nothing", () => {
    const s = fakeStream();
    capStream(s, 100);
    s.write("a".repeat(60));
    s.write("b".repeat(40)); // exactly at the limit — still allowed
    s.write("c".repeat(10)); // over
    s.write("d".repeat(5000)); // dropped
    s.write("e"); // dropped, even though it is small: the budget is spent
    expect(s.chunks[0]).toBe("a".repeat(60));
    expect(s.chunks[1]).toBe("b".repeat(40));
    expect(s.chunks).toHaveLength(3);
    expect(s.chunks[2]).toMatch(/error output limit reached/);
  });

  it("counts bytes, not characters, and counts buffers", () => {
    const s = fakeStream();
    capStream(s, 10);
    s.write("ééééé"); // 5 characters, 10 bytes
    s.write(new Uint8Array(1) as never);
    expect(s.chunks).toHaveLength(2);
    expect(s.chunks[1]).toMatch(/limit reached/);
  });

  it("still calls back for a dropped write, so nothing waits for ever", async () => {
    const s = fakeStream();
    capStream(s, 1);
    s.write("xx"); // over at once: notice
    const called = await new Promise<boolean>((done) => {
      s.write("dropped", () => done(true));
      setTimeout(() => done(false), 500);
    });
    expect(called).toBe(true);
    const viaEncoding = await new Promise<boolean>((done) => {
      (s.write as (c: string, e: string, cb: () => void) => boolean)("dropped", "utf8", () =>
        done(true),
      );
      setTimeout(() => done(false), 500);
    });
    expect(viaEncoding).toBe(true);
  });

  it("the restore function puts the original back", () => {
    const s = fakeStream();
    const original = s.write;
    const restore = capStream(s, 1);
    expect(s.write).not.toBe(original);
    restore();
    expect(s.write).toBe(original);
  });

  it("the limit is small next to the error log's own daily limit", () => {
    expect(WORKER_STDERR_MAX_BYTES).toBeLessThanOrEqual(256 * 1024);
    expect(WORKER_STDERR_MAX_BYTES).toBeGreaterThanOrEqual(8 * 1024); // room for real stack traces
  });
});

describe("in a real process whose stderr is a file", () => {
  function run(scriptRelPath: string): number {
    const root = mkdtempSync(join(tmpdir(), "stderr-cap-"));
    try {
      const script = join(root, scriptRelPath);
      mkdirSync(dirname(script), { recursive: true });
      writeFileSync(
        script,
        `import ${JSON.stringify(pathToFileURL(CAP_MODULE).href)};\n` +
          `for (let i = 0; i < 2000; i++) console.error("x".repeat(1023));\n` + // ~2 MB
          `process.stderr.write("y".repeat(500_000));\n`,
      );
      const out = join(root, "stderr.log");
      const fd = openSync(out, "a", 0o600);
      try {
        const r = spawnSync(process.execPath, ["--import", "tsx", script], {
          stdio: ["ignore", "ignore", fd],
          cwd: resolve(HERE, "../.."),
          timeout: 60_000,
        });
        expect(r.status).toBe(0);
      } finally {
        closeSync(fd);
      }
      return readFileSync(out).byteLength;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it("a process started as jobs/remediate.ts writes no more than the limit plus one notice", () => {
    const bytes = run("jobs/remediate.ts");
    expect(bytes).toBeGreaterThan(WORKER_STDERR_MAX_BYTES - 2048); // it did write up to the limit
    expect(bytes).toBeLessThanOrEqual(WORKER_STDERR_MAX_BYTES + 200);
  }, 90_000);

  it("any other process that imports the module keeps its stderr untouched", () => {
    // The API imports this module too (for the type); it must not be limited.
    expect(run("somewhere/else.ts")).toBeGreaterThan(2_000_000);
  }, 90_000);
});

describe("wiring", () => {
  it("the worker imports the limit before anything else", () => {
    const src = readFileSync(resolve(HERE, "../jobs/remediate.ts"), "utf8");
    const firstImport = src.match(/^import .*$/m)?.[0];
    expect(firstImport).toBe('import "./stderrCap.js";');
  });
});
