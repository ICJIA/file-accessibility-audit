/**
 * Security review 2026-11-18 (Low): /status probed the API over loopback on
 * every request, so all visitors shared one 120/min bucket; 121 requests a
 * minute made /status read "unknown" for everyone, hiding a real outage
 * from the keyword monitor. The probe is now shared for 5 seconds and
 * concurrent callers ride one in-flight probe.
 */
import { describe, it, expect, vi } from "vitest";
import { createStatusCache, STATUS_CACHE_MS } from "../../server/utils/status";

const OK = { httpStatus: 200, body: { status: "ok" } } as never;
const DOWN = { httpStatus: 503, body: { status: "down" } } as never;

describe("the shared /status answer", () => {
  it("1,000 requests inside the window cost the API ONE probe", async () => {
    const probe = vi.fn(async () => OK);
    const get = createStatusCache(probe, STATUS_CACHE_MS, () => 0);
    for (let i = 0; i < 1000; i++) await get();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("concurrent callers share one in-flight probe", async () => {
    let release!: () => void;
    const probe = vi.fn(() => new Promise<typeof OK>((r) => (release = () => r(OK))));
    const get = createStatusCache(probe);
    const all = Promise.all([get(), get(), get()]);
    release();
    expect(await all).toEqual([OK, OK, OK]);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("a real change is reported within the window: no answer is older than 5 seconds", async () => {
    let t = 0;
    const probe = vi.fn().mockResolvedValueOnce(OK).mockResolvedValueOnce(DOWN);
    const get = createStatusCache(probe, STATUS_CACHE_MS, () => t);
    expect(await get()).toBe(OK);
    t = STATUS_CACHE_MS;
    expect(await get()).toBe(DOWN);
    expect(STATUS_CACHE_MS).toBeLessThanOrEqual(5_000);
  });

  it("a failed probe is not cached: the next caller probes again", async () => {
    const probe = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(OK);
    const get = createStatusCache(probe);
    await expect(get()).rejects.toThrow("boom");
    expect(await get()).toBe(OK);
  });
});

describe("WIRING", () => {
  it("the /status route answers through the shared cache, not a fresh probe per request", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(__dirname, "../../server/routes/status.ts"), "utf8");
    expect(src).toMatch(/createStatusCache\(/);
    expect(src).toMatch(/await cachedStatus\(\)/);
  });
});
