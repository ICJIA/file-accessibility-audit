/**
 * Review 2026-11-12, findings 1, 2 and 9.
 *
 *  1. Remediation workers had no global bound: every POST spawned a detached
 *     node worker + two JVMs. There is now a cap (REMEDIATION
 *     .MAX_CONCURRENT_JOBS) with a bounded queue behind it, counted from the
 *     job ROWS so it is right across an API restart.
 *  2. A killed / stuck / failed job left the document on disk for ~7 days.
 *     Every terminal state now has its whole job directory deleted and
 *     verified, with the same events a completed job's deletion records.
 *  9. A non-PDF upload answered 500; an asynchronous spawn failure crashed
 *     the API.
 *
 * Real SQLite (own DB_PATH), real filesystem (own OUTPUT_DIR), the real
 * router behind a real HTTP listener. Only the worker PROCESS is faked: spawn
 * returns an EventEmitter the test drives.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

const { root, outDir, spawned, knobs, wg } = vi.hoisted(() => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/remediation-queue-test-${process.pid}-${Date.now()}`;
  process.env.DB_PATH = `${root}/test.db`;
  process.env.ACTIVITY_LOG_DIR = `${root}/logs`;
  return {
    root,
    outDir: `${root}/remediation`,
    spawned: [] as Array<{ jobId: string; child: any }>,
    knobs: { perCaller: 50 },
    // The worker's process group is faked here (the children are
    // EventEmitters, not processes); workerGroup.test.ts kills real ones.
    wg: {
      kill: (() => true) as (w: { jobId: string; pid: number | null }) => boolean,
      alive: (() => true) as (w: { jobId: string }) => boolean,
    },
  };
});

vi.mock("../services/workerGroup.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/workerGroup.js")>()),
  killWorkerGroup: (w: any) => wg.kill(w),
  isWorkerAlive: (w: any) => wg.alive(w),
}));

vi.mock("#config", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    REMEDIATION: {
      ...actual.REMEDIATION,
      ENABLED: true,
      OUTPUT_DIR: outDir,
      MAX_CONCURRENT_JOBS: 2,
      MAX_QUEUED_JOBS: 2,
      MAX_QUEUE_WAIT_MS: 10 * 60_000,
      MAX_JOBS_PER_DAY_PER_CALLER: 50,
      get MAX_ACTIVE_JOBS_PER_CALLER() {
        return knobs.perCaller;
      },
    },
  };
});

const { spawnImpl } = vi.hoisted(() => ({
  spawnImpl: { fn: null as null | ((...a: any[]) => any) },
}));
vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  return { ...actual, spawn: (...args: any[]) => spawnImpl.fn!(...args) };
});

vi.mock("../services/pdfAnalyzer.js", () => ({
  analyzePDF: vi.fn(async () => ({ overallScore: 40, grade: "F", pageCount: 3 })),
}));

let jobs: typeof import("../services/remediationJobs.js");
let events: typeof import("../services/remediationEvents.js");
let queue: typeof import("../services/remediationQueue.js");
let cleanup: typeof import("../services/remediationCleanup.js");
let auditLog: typeof import("../services/auditLog.js");
let cap: typeof import("../services/remediationCap.js");
let db: (typeof import("../db/sqlite.js"))["default"];
let server: import("node:http").Server;
let baseUrl = "";

function fakeChild(): any {
  const child: any = new EventEmitter();
  child.unref = vi.fn();
  child.pid = 4242;
  return child;
}

beforeAll(async () => {
  jobs = await import("../services/remediationJobs.js");
  events = await import("../services/remediationEvents.js");
  queue = await import("../services/remediationQueue.js");
  cleanup = await import("../services/remediationCleanup.js");
  auditLog = await import("../services/auditLog.js");
  cap = await import("../services/remediationCap.js");
  db = (await import("../db/sqlite.js")).default;

  const express = (await import("express")).default;
  const router = (await import("../routes/remediate.js")).default;
  const { errorHandler } = await import("../middleware/errorHandler.js");
  const app = express();
  app.use("/api", router);
  app.use(errorHandler);
  await new Promise<void>((r) => {
    server = app.listen(0, "127.0.0.1", r);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  cleanup.stopCleanupInterval();
  await new Promise((r) => server.close(r));
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec("DELETE FROM remediation_jobs; DELETE FROM remediation_events; DELETE FROM audit_log;");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  spawned.length = 0;
  knobs.perCaller = 50;
  wg.kill = () => true;
  wg.alive = () => true;
  cap._resetRemediationCap();
  spawnImpl.fn = (_exec: string, args: string[]) => {
    const child = fakeChild();
    spawned.push({ jobId: args[args.length - 1]!, child });
    return child;
  };
  vi.restoreAllMocks();
});

/** A queued job with its upload on disk, as POST /api/remediate leaves it. */
function queuedJob(): string {
  const { job } = jobs.createJob({ inputFilename: "r.pdf", contentHash: "h", pageCount: 1 });
  const work = join(outDir, job.id, "work");
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "input.pdf"), "%PDF-1.4 document bytes");
  return job.id;
}
const status = (id: string) => jobs.getJob(id)!.status;
const eventNames = (id: string) => events.getEventsForJob(id).map((e) => e.event);

describe("global worker cap (finding 1)", () => {
  it("starts at most MAX_CONCURRENT_JOBS workers; the rest wait, oldest first", () => {
    const ids = [queuedJob(), queuedJob(), queuedJob(), queuedJob()];
    expect(queue.dispatchQueuedJobs()).toBe(2);
    expect(spawned.map((s) => s.jobId)).toEqual(ids.slice(0, 2));
    expect(jobs.countActiveJobs()).toBe(2);
    expect(jobs.countQueuedJobs()).toBe(2);
    // Dispatching again changes nothing while both slots are held.
    expect(queue.dispatchQueuedJobs()).toBe(0);
    expect(spawned).toHaveLength(2);
    expect(jobs.getJob(ids[0]!)!.startedAt).not.toBeNull();
    expect(jobs.getJob(ids[2]!)!.startedAt).toBeNull();
  });

  it("counts slots from the job rows, so an API restart cannot over-commit", async () => {
    const ids = [queuedJob(), queuedJob(), queuedJob()];
    queue.dispatchQueuedJobs();
    expect(spawned).toHaveLength(2);

    // "Restart": a brand-new module graph has no memory of what it spawned —
    // the detached workers are still running, and only the rows say so.
    vi.resetModules();
    const freshQueue = await import("../services/remediationQueue.js");
    const freshJobs = await import("../services/remediationJobs.js");
    expect(freshJobs.countActiveJobs()).toBe(2);
    expect(freshQueue.dispatchQueuedJobs()).toBe(0);
    expect(spawned).toHaveLength(2);
    expect(freshJobs.getJob(ids[2]!)!.startedAt).toBeNull();
  });

  it("a running job holds its slot; every terminal state releases it", () => {
    const ids = [queuedJob(), queuedJob(), queuedJob(), queuedJob(), queuedJob()];
    queue.dispatchQueuedJobs();
    jobs.setRunning(ids[0]!);
    expect(jobs.countActiveJobs()).toBe(2);
    expect(queue.dispatchQueuedJobs()).toBe(0);

    jobs.setComplete(ids[0]!, join(outDir, ids[0]!, "output.pdf")); // success
    expect(queue.dispatchQueuedJobs()).toBe(1);
    jobs.setFailed(ids[1]!, "boom"); // failure
    expect(queue.dispatchQueuedJobs()).toBe(1);
    jobs.setExpired(ids[2]!); // expiry
    expect(queue.dispatchQueuedJobs()).toBe(1);
    expect(spawned.map((s) => s.jobId)).toEqual(ids);
    expect(jobs.countActiveJobs()).toBe(2);
  });

  it("when a worker exits its slot goes to the next queued job", () => {
    const ids = [queuedJob(), queuedJob(), queuedJob()];
    queue.dispatchQueuedJobs();
    // Worker 0 finishes its job, then exits.
    jobs.setRunning(ids[0]!);
    jobs.setComplete(ids[0]!, join(outDir, ids[0]!, "output.pdf"));
    spawned[0]!.child.emit("exit", 0, null);
    expect(status(ids[0]!)).toBe("complete"); // a finished job is left alone
    expect(spawned.map((s) => s.jobId)).toEqual(ids);
  });

  it("a worker that dies WITHOUT finishing is failed at once, its files deleted, its slot reused", () => {
    const ids = [queuedJob(), queuedJob(), queuedJob()];
    queue.dispatchQueuedJobs();
    jobs.setRunning(ids[0]!);
    spawned[0]!.child.emit("exit", null, "SIGKILL"); // e.g. the OOM killer

    expect(status(ids[0]!)).toBe("failed");
    expect(jobs.getJob(ids[0]!)!.failureReason).toMatch(/stopped before finishing/);
    expect(existsSync(join(outDir, ids[0]!))).toBe(false);
    expect(eventNames(ids[0]!)).toEqual(
      expect.arrayContaining(["error", "output_deleted", "verified_absent"]),
    );
    expect(spawned.map((s) => s.jobId)).toEqual(ids); // third job started
  });
});

describe("spawn failures do not take the API down (finding 9b)", () => {
  it("an asynchronous spawn error is handled: job failed, files deleted, queue moves on", () => {
    const ids = [queuedJob(), queuedJob(), queuedJob()];
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    queue.dispatchQueuedJobs();

    const child = spawned[0]!.child;
    // The whole point: an 'error' event with NO listener is an uncaught
    // exception, which index.ts answers by exiting the process.
    expect(child.listenerCount("error")).toBeGreaterThan(0);
    expect(() =>
      child.emit("error", Object.assign(new Error("spawn EAGAIN"), { code: "EAGAIN" })),
    ).not.toThrow();

    expect(status(ids[0]!)).toBe("failed");
    expect(jobs.getJob(ids[0]!)!.failureReason).toMatch(/could not be started/);
    expect(existsSync(join(outDir, ids[0]!))).toBe(false);
    const err = events.getEventsForJob(ids[0]!).find((e) => e.event === "error");
    expect(err?.details).toMatchObject({ error_type: "worker_spawn_failed", message: "EAGAIN" });
    expect(spawned.map((s) => s.jobId)).toEqual(ids);
    expect(errors).toHaveBeenCalled();
  });

  it("a synchronous spawn throw is handled the same way", () => {
    const id = queuedJob();
    spawnImpl.fn = () => {
      throw Object.assign(new Error("spawn EMFILE"), { code: "EMFILE" });
    };
    expect(() => queue.dispatchQueuedJobs()).not.toThrow();
    expect(status(id)).toBe("failed");
    expect(existsSync(join(outDir, id))).toBe(false);
    expect(jobs.countActiveJobs()).toBe(0);
  });
});

describe("retention sweep — no document bytes outlive a terminal state (finding 2)", () => {
  const backdate = (id: string, col: string, ms: number) =>
    db.prepare(`UPDATE remediation_jobs SET ${col} = ? WHERE id = ?`).run(Date.now() - ms, id);

  it("a stuck worker's job is failed AND its whole directory is deleted and verified", async () => {
    const id = queuedJob();
    // Mid-pipeline leftovers a killed worker would leave behind.
    mkdirSync(join(outDir, id, "work", "odl"), { recursive: true });
    writeFileSync(join(outDir, id, "work", "normalized.pdf"), "normalized copy");
    writeFileSync(join(outDir, id, "work", "odl", "tagged.pdf"), "tagged copy");
    queue.dispatchQueuedJobs();
    jobs.setRunning(id);
    backdate(id, "started_at", 11 * 60_000);

    const result = await cleanup.runCleanup();
    expect(result.errors).toEqual([]);
    expect(result.stuckJobs).toBe(1);
    expect(status(id)).toBe("failed");
    expect(existsSync(join(outDir, id))).toBe(false);

    // Recorded the way a completed job's deletion is: a deleted + verified
    // pair per file (3 files) and one more for the directory.
    const evs = events.getEventsForJob(id);
    expect(evs.filter((e) => e.event === "output_deleted")).toHaveLength(4);
    expect(evs.filter((e) => e.event === "verified_absent")).toHaveLength(4);
    expect(evs.some((e) => e.event === "verify_failed")).toBe(false);
    expect(JSON.stringify(evs)).not.toContain(outDir); // path hashes only
    // The slot is free again.
    expect(jobs.countActiveJobs()).toBe(0);
  });

  it("a job still inside its 10 minutes is left completely alone", async () => {
    const id = queuedJob();
    queue.dispatchQueuedJobs();
    jobs.setRunning(id);
    backdate(id, "created_at", 30 * 60_000); // old upload, but dispatched just now
    const result = await cleanup.runCleanup();
    expect(result.stuckJobs).toBe(0);
    expect(status(id)).toBe("running");
    expect(existsSync(join(outDir, id, "work", "input.pdf"))).toBe(true);
  });

  it("a FAILED job's directory is deleted on the next sweep even though its row is minutes old", async () => {
    // The old orphan scan skipped every directory whose row was < 7 days old.
    const id = queuedJob();
    jobs.setFailed(id, "qpdf normalization failed");
    const result = await cleanup.runCleanup();
    expect(result.jobDirsPurged).toBe(1);
    expect(existsSync(join(outDir, id))).toBe(false);
    expect(eventNames(id)).toEqual(expect.arrayContaining(["output_deleted", "verified_absent"]));
  });

  it("an EXPIRED job's leftover directory is deleted too", async () => {
    const id = queuedJob();
    jobs.setExpired(id);
    await cleanup.runCleanup();
    expect(existsSync(join(outDir, id))).toBe(false);
  });

  it("a complete job past its TTL loses its output AND everything else in its directory", async () => {
    const id = queuedJob(); // work/input.pdf is still there: the worker was killed after finalising
    const out = join(outDir, id, "output.pdf");
    writeFileSync(out, "remediated");
    jobs.setComplete(id, out);
    backdate(id, "expires_at", 1000);
    const result = await cleanup.runCleanup();
    expect(result.expiredOutputs).toBe(1);
    expect(status(id)).toBe("expired");
    expect(existsSync(join(outDir, id))).toBe(false);
  });

  it("a complete job inside its TTL keeps its output but not leftover scratch", async () => {
    const id = queuedJob();
    const out = join(outDir, id, "output.pdf");
    writeFileSync(out, "remediated");
    jobs.setComplete(id, out);
    await cleanup.runCleanup();
    expect(existsSync(out)).toBe(true);
    expect(existsSync(join(outDir, id, "work"))).toBe(false);
    expect(status(id)).toBe("complete");
  });

  it("a job that waited in the queue too long is failed and its upload deleted", async () => {
    const id = queuedJob();
    backdate(id, "created_at", 11 * 60_000);
    // Both slots taken, so the sweep's own dispatch cannot rescue it first.
    queuedJob();
    queuedJob();
    db.prepare(
      "UPDATE remediation_jobs SET started_at = ? WHERE id != ? AND started_at IS NULL",
    ).run(Date.now(), id);

    const result = await cleanup.runCleanup();
    expect(result.queueExpiredJobs).toBe(1);
    expect(status(id)).toBe("failed");
    expect(jobs.getJob(id)!.failureReason).toMatch(/waited too long/);
    expect(existsSync(join(outDir, id))).toBe(false);
  });

  it("the sweep starts queued jobs when slots are free", async () => {
    const id = queuedJob();
    await cleanup.runCleanup();
    expect(spawned.map((s) => s.jobId)).toEqual([id]);
    expect(existsSync(join(outDir, id, "work", "input.pdf"))).toBe(true);
  });

  it("a directory with no job row is removed — after a grace, never mid-upload", async () => {
    const fresh = join(outDir, "11111111-1111-4111-8111-111111111111");
    const old = join(outDir, "22222222-2222-4222-8222-222222222222");
    for (const d of [fresh, old]) {
      mkdirSync(join(d, "work"), { recursive: true });
      writeFileSync(join(d, "work", "input.pdf"), "bytes");
    }
    const past = new Date(Date.now() - 5 * 60_000);
    utimesSync(old, past, past);

    const result = await cleanup.runCleanup();
    expect(result.orphanDirs).toBe(1);
    expect(existsSync(old)).toBe(false);
    // POST /api/remediate writes the upload just before inserting the row.
    expect(existsSync(fresh)).toBe(true);
  });

  it("purgeJobDir refuses a path outside the remediation directory", () => {
    const outside = join(root, "not-remediation");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "keep.txt"), "x");
    expect(events.purgeJobDir("some-job", outside, "cleanup")).toBe(false);
    expect(existsSync(join(outside, "keep.txt"))).toBe(true);
    expect(events.purgeJobDir("some-job", outDir, "cleanup")).toBe(false); // the root itself
    expect(existsSync(outDir)).toBe(true);
  });
});

describe("ending a job from outside kills the worker's process group FIRST (second pass, 2)", () => {
  it("records the worker pid (= process-group id) on the row at spawn", () => {
    const id = queuedJob();
    queue.dispatchQueuedJobs();
    expect(jobs.getJob(id)!.workerPid).toBe(4242);
  });

  it("ORDER: group killed and confirmed dead → row failed (slot freed) → directory purged", () => {
    const ids = [queuedJob(), queuedJob(), queuedJob()];
    queue.dispatchQueuedJobs();
    jobs.setRunning(ids[0]!);
    const seen: Array<Record<string, unknown>> = [];
    wg.kill = (w) => {
      // The state of the world at the moment the group is being killed:
      seen.push({
        jobId: w.jobId,
        pid: w.pid,
        status: status(w.jobId),
        dirExists: existsSync(join(outDir, w.jobId)),
        active: jobs.countActiveJobs(),
        spawned: spawned.length,
      });
      return true;
    };
    spawned[0]!.child.emit("exit", null, "SIGKILL");

    expect(seen).toEqual([
      // Still running, files still there, slot still held, nothing new started.
      { jobId: ids[0], pid: 4242, status: "running", dirExists: true, active: 2, spawned: 2 },
    ]);
    expect(status(ids[0]!)).toBe("failed");
    expect(existsSync(join(outDir, ids[0]!))).toBe(false);
    expect(spawned.map((s) => s.jobId)).toEqual(ids); // only now did the third start
  });

  it("if the group cannot be confirmed dead NOTHING changes: slot held, files not claimed deleted, no third worker", () => {
    const ids = [queuedJob(), queuedJob(), queuedJob()];
    queue.dispatchQueuedJobs();
    jobs.setRunning(ids[0]!);
    wg.kill = () => false; // an orphaned JVM that will not die (yet)
    spawned[0]!.child.emit("exit", null, "SIGKILL");

    expect(status(ids[0]!)).toBe("running");
    expect(existsSync(join(outDir, ids[0]!, "work", "input.pdf"))).toBe(true);
    expect(jobs.countActiveJobs()).toBe(2); // never three JVMs against a cap of two
    expect(spawned).toHaveLength(2);
    expect(eventNames(ids[0]!)).not.toContain("verified_absent");
    expect(
      events
        .getEventsForJob(ids[0]!)
        .some((e) => e.details?.error_type === "worker_group_still_alive"),
    ).toBe(true);

    // Later the group is gone: the reconcile finishes the job and the queue moves.
    wg.kill = () => true;
    wg.alive = (w) => w.jobId !== ids[0];
    db.prepare("UPDATE remediation_jobs SET started_at = ? WHERE id = ?").run(
      Date.now() - 60_000,
      ids[0],
    );
    expect(queue.reconcileWorkers()).toBe(1);
    expect(status(ids[0]!)).toBe("failed");
    expect(existsSync(join(outDir, ids[0]!))).toBe(false);
    queue.dispatchQueuedJobs();
    expect(spawned.map((s) => s.jobId)).toEqual(ids);
  });

  it("the stuck-job sweep goes through the same kill-first path", async () => {
    const id = queuedJob();
    queue.dispatchQueuedJobs();
    jobs.setRunning(id);
    db.prepare("UPDATE remediation_jobs SET started_at = ? WHERE id = ?").run(
      Date.now() - 11 * 60_000,
      id,
    );
    wg.kill = () => false;
    let result = await cleanup.runCleanup();
    expect(result.stuckJobs).toBe(0);
    expect(status(id)).toBe("running");
    expect(existsSync(join(outDir, id))).toBe(true);

    const killed: unknown[] = [];
    wg.kill = (w) => (killed.push(w.pid), true);
    result = await cleanup.runCleanup();
    expect(result.stuckJobs).toBe(1);
    expect(killed).toContain(4242);
    expect(existsSync(join(outDir, id))).toBe(false);
  });

  it("a failed job's leftover directory is not purged while its group is still alive", async () => {
    const id = queuedJob();
    queue.dispatchQueuedJobs();
    jobs.setFailed(id, "failed by the worker itself");
    wg.kill = () => false;
    await cleanup.runCleanup();
    expect(existsSync(join(outDir, id))).toBe(true);
    wg.kill = () => true;
    await cleanup.runCleanup();
    expect(existsSync(join(outDir, id))).toBe(false);
  });
});

describe("boot reconcile — rows vs. the processes that exist (second pass, 3)", () => {
  const dispatchedAgo = (id: string, ms: number) =>
    db.prepare("UPDATE remediation_jobs SET started_at = ? WHERE id = ?").run(Date.now() - ms, id);

  it("a running row whose worker is gone is failed and purged at once, freeing its slot", () => {
    const ids = [queuedJob(), queuedJob(), queuedJob()];
    queue.dispatchQueuedJobs();
    ids.slice(0, 2).forEach((id) => (jobs.setRunning(id), dispatchedAgo(id, 60_000)));
    // "PM2 restart tree-killed the workers": no exit event was ever seen.
    wg.alive = () => false;

    expect(queue.reconcileWorkers()).toBe(2);
    for (const id of ids.slice(0, 2)) {
      expect(status(id)).toBe("failed");
      expect(jobs.getJob(id)!.failureReason).toMatch(/no longer running/);
      expect(existsSync(join(outDir, id))).toBe(false);
    }
    expect(jobs.countActiveJobs()).toBe(0); // not held for 10–15 minutes
  });

  it("a worker that is still alive from before the restart keeps its slot", () => {
    const ids = [queuedJob(), queuedJob()];
    queue.dispatchQueuedJobs();
    ids.forEach((id) => (jobs.setRunning(id), dispatchedAgo(id, 60_000)));
    wg.alive = (w) => w.jobId === ids[0];

    expect(queue.reconcileWorkers()).toBe(1);
    expect(status(ids[0]!)).toBe("running");
    expect(existsSync(join(outDir, ids[0]!, "work", "input.pdf"))).toBe(true);
    expect(status(ids[1]!)).toBe("failed");
    expect(jobs.countActiveJobs()).toBe(1);
  });

  it("does not judge a worker dispatched moments ago, or a row with no recorded pid", () => {
    const [fresh, legacy] = [queuedJob(), queuedJob()];
    queue.dispatchQueuedJobs();
    dispatchedAgo(legacy!, 60_000);
    db.prepare("UPDATE remediation_jobs SET worker_pid = NULL WHERE id = ?").run(legacy);
    wg.alive = () => false;
    expect(queue.reconcileWorkers()).toBe(0);
    expect(status(fresh!)).toBe("pending");
    expect(status(legacy!)).toBe("pending");
  });

  it("WIRING: index.ts reconciles synchronously on boot, before the first sweep", () => {
    const src = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    const reconcileAt = src.indexOf("reconcileWorkers()");
    expect(reconcileAt).toBeGreaterThan(-1);
    expect(reconcileAt).toBeLessThan(src.indexOf("void runScheduledSweep({ always: true })"));
  });

  it("WIRING: every sweep reconciles too", async () => {
    const id = queuedJob();
    queue.dispatchQueuedJobs();
    jobs.setRunning(id);
    dispatchedAgo(id, 60_000);
    wg.alive = () => false;
    const result = await cleanup.runCleanup();
    expect(result.stuckJobs).toBe(1);
    expect(status(id)).toBe("failed");
  });
});

describe("POST /api/remediate — wiring over real HTTP (findings 1, 9a)", () => {
  const PDF = Buffer.from("%PDF-1.4\n% a small test document\n");

  function upload(bytes: Buffer, name: string, type: string) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
    return fetch(`${baseUrl}/api/remediate`, { method: "POST", body: form });
  }
  /** Make these exact bytes pass the audit gate. */
  function audited(bytes: Buffer) {
    auditLog.recordAudit({
      filename: "r.pdf",
      score: 40,
      grade: "F",
      contentHash: auditLog.sha256Hex(bytes),
      privileged: false,
    });
  }

  it("a non-PDF upload is a 400 with a message, not a 500 with a stack", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await upload(Buffer.from("hello"), "notes.txt", "text/plain");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Only PDF files are accepted" });
    // An expected client error: one warn line, no error-log entry, no stack.
    expect(error).not.toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(" ")).toMatch(/\[api\] 400 /);
    expect(jobs.countQueuedJobs() + jobs.countActiveJobs()).toBe(0);
  });

  it("runs 2 at once, queues 2, then answers 503 + Retry-After — and a refusal leaves nothing behind", async () => {
    audited(PDF);
    const accepted: any[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await upload(PDF, "r.pdf", "application/pdf");
      expect(res.status).toBe(202);
      accepted.push(await res.json());
    }
    // The route used the dispatcher: two started, two waiting.
    expect(accepted.map((a) => a.queued)).toEqual([false, false, true, true]);
    expect(spawned.map((s) => s.jobId)).toEqual([accepted[0].jobId, accepted[1].jobId]);
    expect(jobs.countActiveJobs()).toBe(2);
    expect(jobs.countQueuedJobs()).toBe(2);
    // Every accepted job has its upload on disk before it can be dispatched.
    for (const a of accepted) {
      expect(existsSync(join(outDir, a.jobId, "work", "input.pdf"))).toBe(true);
    }

    const dirsBefore = readdirSync(outDir).length;
    const usedBefore = cap.remediationSlotsUsed("127.0.0.1", 86_400_000);
    expect(usedBefore).toBe(4);
    const refused = await upload(PDF, "r.pdf", "application/pdf");
    expect(refused.status).toBe(503);
    expect(refused.headers.get("retry-after")).toBe("60");
    expect((await refused.json()).error).toMatch(/busy/i);
    expect(spawned).toHaveLength(2); // nothing new started
    expect(readdirSync(outDir).length).toBe(dirsBefore); // no upload left on disk
    expect(db.prepare("SELECT COUNT(*) AS n FROM remediation_jobs").get()).toEqual({ n: 4 });
    // A refusal does not spend the caller's daily allowance.
    expect(cap.remediationSlotsUsed("127.0.0.1", 86_400_000)).toBe(usedBefore);

    // The status route reports the queue, and moves it when a slot frees up
    // (this is what restarts the queue after an API restart).
    const third = accepted[2];
    const statusUrl = `${baseUrl}/api/remediate/${third.jobId}/status?token=${third.downloadToken}`;
    let body = await (await fetch(statusUrl)).json();
    expect(body).toMatchObject({ status: "pending", queued: true, queuePosition: 1 });
    const fourth = accepted[3];
    body = await (
      await fetch(`${baseUrl}/api/remediate/${fourth.jobId}/status?token=${fourth.downloadToken}`)
    ).json();
    expect(body).toMatchObject({ queued: true, queuePosition: 2 });

    jobs.setFailed(accepted[0].jobId, "done elsewhere"); // a slot frees with no exit event seen
    body = await (await fetch(statusUrl)).json();
    expect(body.queued).toBe(false);
    expect(spawned.map((s) => s.jobId)).toContain(third.jobId);
  });

  it("one caller cannot take both slots and the whole queue: 429 past their share (second pass, 4)", async () => {
    knobs.perCaller = 2;
    audited(PDF);
    const first = await (await upload(PDF, "r.pdf", "application/pdf")).json();
    expect((await upload(PDF, "r.pdf", "application/pdf")).status).toBe(202);

    const dirsBefore = readdirSync(outDir).length;
    const refused = await upload(PDF, "r.pdf", "application/pdf");
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.error).toMatch(/already have remediations in progress/);
    expect(body).toMatchObject({ limit: 2, active: 2 });
    expect(readdirSync(outDir).length).toBe(dirsBefore);
    // The queue is still EMPTY for everyone else, and no daily slot was spent.
    expect(jobs.countQueuedJobs()).toBe(0);
    expect(cap.remediationSlotsUsed("127.0.0.1", 86_400_000)).toBe(2);

    // The share is released when one of the caller's jobs reaches a terminal state.
    jobs.setFailed(first.jobId, "finished");
    expect((await upload(PDF, "r.pdf", "application/pdf")).status).toBe(202);
    expect((await upload(PDF, "r.pdf", "application/pdf")).status).toBe(429);
  });

  it("the per-caller share lives in process memory only — no caller column on the job row", () => {
    const cols = (
      db.prepare("PRAGMA table_info(remediation_jobs)").all() as { name: string }[]
    ).map((c) => c.name);
    expect(cols.join(",")).not.toMatch(/caller|client|ip|email|owner/i);
    // Keyed by the shared client key: one IPv6 /64 is one caller.
    const active = () => true;
    cap.trackCallerJob(cap.capKeyFromIp("2001:db8:1:2::1"), "job-a");
    cap.trackCallerJob(cap.capKeyFromIp("2001:db8:1:2::2"), "job-b");
    expect(cap.callerActiveJobs(cap.capKeyFromIp("2001:db8:1:2::3"), active)).toBe(2);
    expect(cap.callerActiveJobs(cap.capKeyFromIp("2001:db8:1:3::1"), active)).toBe(0);
    // Terminal jobs drop out.
    expect(cap.callerActiveJobs(cap.capKeyFromIp("2001:db8:1:2::3"), (id) => id === "job-a")).toBe(
      1,
    );
  });

  it("an upload refused by the audit gate never reaches the disk", async () => {
    const res = await upload(PDF, "r.pdf", "application/pdf");
    expect(res.status).toBe(403);
    expect(readdirSync(outDir)).toEqual([]);
  });
});
