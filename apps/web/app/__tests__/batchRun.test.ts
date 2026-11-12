import { describe, it, expect } from "vitest";
import { runBatch, type BatchRunItem } from "../utils/batchRun";

type Item = BatchRunItem<{ grade: string }, { error: string }>;

function items(prefix: string, n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    filename: `${prefix}${i}.pdf`,
    file: new File(["x"], `${prefix}${i}.pdf`),
    status: "queued" as const,
    result: null,
    error: null,
  }));
}

/** An analyze() whose every call waits until the test settles it. */
function deferredAnalyze() {
  const calls: Array<{
    name: string;
    resolve: (v: { grade: string }) => void;
    reject: (e: unknown) => void;
  }> = [];
  const analyze = (file: File) =>
    new Promise<{ grade: string }>((resolve, reject) => {
      calls.push({ name: file.name, resolve, reject });
    });
  return { calls, analyze };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const describeError = (e: unknown) => ({ error: String((e as Error)?.message ?? e) });

describe("runBatch", () => {
  it("runs every file, two at a time, and records results and errors", async () => {
    const list = items("a", 3);
    const { calls, analyze } = deferredAnalyze();
    const run = runBatch({
      items: list,
      signal: new AbortController().signal,
      analyze,
      describeError,
    });
    await tick();
    expect(calls.map((c) => c.name)).toEqual(["a0.pdf", "a1.pdf"]);
    expect(list.map((i) => i.status)).toEqual(["processing", "processing", "queued"]);
    calls[0]!.resolve({ grade: "A" });
    calls[1]!.reject(new Error("boom"));
    await tick();
    calls[2]!.resolve({ grade: "B" });
    await run;
    expect(list.map((i) => i.status)).toEqual(["done", "error", "done"]);
    expect(list[1]!.error).toEqual({ error: "boom" });
    expect(list.every((i) => i.file === null)).toBe(true);
  });

  it("cancel stops new work and marks the rest cancelled", async () => {
    const list = items("a", 4);
    const controller = new AbortController();
    const { calls, analyze } = deferredAnalyze();
    const run = runBatch({ items: list, signal: controller.signal, analyze, describeError });
    await tick();
    controller.abort();
    calls[0]!.reject(new Error("aborted"));
    calls[1]!.resolve({ grade: "A" }); // answered anyway — still not a result
    await run;
    expect(calls).toHaveLength(2);
    expect(list.map((i) => i.status)).toEqual(["cancelled", "cancelled", "cancelled", "cancelled"]);
    expect(list[1]!.result).toBeNull();
  });

  it("a stale run never touches a newer run's items or picks up its files", async () => {
    // Run A starts, is reset (aborted) mid-flight, and run B starts on a
    // fresh list while A's requests are still unanswered.
    const a = items("a", 3);
    const b = items("b", 3);
    const controllerA = new AbortController();
    const controllerB = new AbortController();
    const dA = deferredAnalyze();
    const dB = deferredAnalyze();

    const runA = runBatch({
      items: a,
      signal: controllerA.signal,
      analyze: dA.analyze,
      describeError,
    });
    await tick();
    controllerA.abort(); // the reset
    const runB = runBatch({
      items: b,
      signal: controllerB.signal,
      analyze: dB.analyze,
      describeError,
    });
    await tick();

    // A's tail arrives now.
    dA.calls.forEach((c) => c.reject(new Error("aborted")));
    await runA;

    // B is untouched: two in flight, one still queued WITH its file.
    expect(b.map((i) => i.status)).toEqual(["processing", "processing", "queued"]);
    expect(b[2]!.file).not.toBeNull();
    // A's workers picked up nothing of B's, and nothing more of their own.
    expect(dA.calls.map((c) => c.name)).toEqual(["a0.pdf", "a1.pdf"]);
    expect(dB.calls.map((c) => c.name)).toEqual(["b0.pdf", "b1.pdf"]);

    dB.calls[0]!.resolve({ grade: "A" });
    dB.calls[1]!.resolve({ grade: "A" });
    await tick();
    dB.calls[2]!.resolve({ grade: "C" });
    await runB;
    expect(b.map((i) => i.status)).toEqual(["done", "done", "done"]);
  });
});
