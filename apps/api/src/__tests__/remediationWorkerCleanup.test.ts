/**
 * Review 2026-11-12, finding 2 — the WORKER's side (jobs/remediate.ts).
 *
 * The master timeout SIGKILLs the worker's whole process group, so the
 * `finally` that removed the scratch directory never ran: the input, the
 * normalized copy and the tagged copy stayed on disk. And an ordinary failure
 * removed only work/, leaving the job directory behind. Now:
 *   - the kill timer deletes the job directory synchronously BEFORE the kill;
 *   - every non-successful exit deletes and verifies the whole job directory.
 *
 * process.kill is replaced for the whole file — the real call would SIGKILL
 * the test runner's own process group.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { root, outDir, normalize, wg } = vi.hoisted(() => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/remediation-worker-test-${process.pid}-${Date.now()}`;
  process.env.DB_PATH = `${root}/test.db`;
  return {
    root,
    outDir: `${root}/remediation`,
    normalize: { impl: null as null | ((...a: any[]) => Promise<any>) },
    wg: { kill: (() => true) as (w: any, opts: any) => boolean },
  };
});
vi.mock("../services/workerGroup.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/workerGroup.js")>()),
  killWorkerGroup: (w: any, opts: any) => wg.kill(w, opts),
}));

vi.mock("#config", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    REMEDIATION: { ...actual.REMEDIATION, OUTPUT_DIR: outDir, WORKER_TIMEOUT_MS: 150 },
  };
});
vi.mock("@opendataloader/pdf", () => ({ convert: vi.fn(async () => {}) }));
vi.mock("../services/pdfAnalyzer.js", () => ({ analyzePDF: vi.fn() }));
vi.mock("../services/veraPdf.js", () => ({ runVeraPdf: vi.fn() }));
vi.mock("../services/qpdfNormalize.js", () => ({
  qpdfNormalize: (...a: any[]) => normalize.impl!(...a),
}));

let jobs: typeof import("../services/remediationJobs.js");
let events: typeof import("../services/remediationEvents.js");
let worker: typeof import("../jobs/remediate.js");
const kill = vi.fn();
const exit = vi.fn();
const realKill = process.kill;
const realExit = process.exit;

beforeAll(async () => {
  (process as any).kill = kill;
  (process as any).exit = exit;
  jobs = await import("../services/remediationJobs.js");
  events = await import("../services/remediationEvents.js");
  worker = await import("../jobs/remediate.js");
});
afterAll(() => {
  (process as any).kill = realKill;
  (process as any).exit = realExit;
  rmSync(root, { recursive: true, force: true });
});
beforeEach(() => {
  kill.mockReset();
  exit.mockReset();
  wg.kill = () => true;
});

function jobWithUpload(): { id: string; dir: string } {
  const { job } = jobs.createJob({ inputFilename: "r.pdf", contentHash: "h", pageCount: 1 });
  const dir = join(outDir, job.id);
  mkdirSync(join(dir, "work"), { recursive: true });
  writeFileSync(join(dir, "work", "input.pdf"), "%PDF-1.4 the document");
  return { id: job.id, dir };
}

describe("remediation worker — nothing left on disk after a failure", () => {
  it("an ordinary pipeline failure deletes and verifies the whole job directory", async () => {
    const { id, dir } = jobWithUpload();
    normalize.impl = async () => {
      throw new Error("qpdf exploded");
    };
    await worker.runRemediationJob(id);

    expect(jobs.getJob(id)!.status).toBe("failed");
    expect(existsSync(dir)).toBe(false); // not just work/ — the directory itself
    const names = events.getEventsForJob(id).map((e) => e.event);
    expect(names).toEqual(expect.arrayContaining(["output_deleted", "verified_absent"]));
    expect(names).not.toContain("verify_failed");
    expect(kill).not.toHaveBeenCalled();
  });

  it("a job whose input is missing at start leaves no directory either", async () => {
    const { id, dir } = jobWithUpload();
    rmSync(join(dir, "work", "input.pdf"));
    await worker.runRemediationJob(id);
    expect(jobs.getJob(id)!.status).toBe("failed");
    expect(existsSync(dir)).toBe(false);
  });

  it("the master timeout kills its children, THEN deletes the directory, THEN fails the job, THEN exits", async () => {
    const { id, dir } = jobWithUpload();
    let dirExistedAtKill: boolean | null = null;
    let statusAtKill: string | null = null;
    const steps: string[] = [];
    wg.kill = (w, opts) => {
      // Children are killed while the row is still active (slot held) and
      // before anything is deleted — and the worker spares itself.
      steps.push(`kill-group:${jobs.getJob(id)!.status}:dir=${existsSync(dir)}`);
      expect(w).toMatchObject({ jobId: id, pid: process.pid });
      expect(opts).toMatchObject({ exceptPid: process.pid });
      return true;
    };
    exit.mockImplementation(() => {
      // What the disk and the row look like at the instant the worker exits.
      dirExistedAtKill = existsSync(dir);
      statusAtKill = jobs.getJob(id)!.status;
      steps.push("exit");
    });
    // A pipeline step that never returns, with mid-pipeline files on disk.
    normalize.impl = () => {
      writeFileSync(join(dir, "work", "normalized.pdf"), "normalized copy");
      return new Promise(() => {});
    };

    void worker.runRemediationJob(id);
    await vi.waitFor(() => expect(exit).toHaveBeenCalled(), { timeout: 3_000 });

    expect(exit).toHaveBeenCalledWith(1);
    expect(kill).not.toHaveBeenCalled(); // no wholesale group kill needed
    expect(steps).toEqual(["kill-group:running:dir=true", "exit"]);
    expect(dirExistedAtKill).toBe(false);
    expect(statusAtKill).toBe("failed");
    expect(jobs.getJob(id)!.failureReason).toMatch(/timed out/);
    const evs = events.getEventsForJob(id);
    expect(evs.some((e) => e.details?.error_type === "worker_timeout")).toBe(true);
    // input.pdf + normalized.pdf + the directory: each deleted and verified.
    expect(evs.filter((e) => e.event === "output_deleted")).toHaveLength(3);
    expect(evs.filter((e) => e.event === "verified_absent")).toHaveLength(3);
  });
});

describe("remediation worker — children that will not die", () => {
  it("if its children cannot be confirmed dead it deletes nothing, leaves the row active, and kills the whole group", async () => {
    const { id, dir } = jobWithUpload();
    wg.kill = () => false;
    kill.mockImplementation(() => true);
    normalize.impl = () => new Promise(() => {});

    void worker.runRemediationJob(id);
    await vi.waitFor(() => expect(kill).toHaveBeenCalled(), { timeout: 3_000 });

    expect(kill).toHaveBeenCalledWith(-process.pid, "SIGKILL");
    // Not failed (its slot stays taken) and not "verified absent": the API's
    // exit handler / reconcile finishes it once the group is really gone.
    expect(jobs.getJob(id)!.status).toBe("running");
    expect(existsSync(dir)).toBe(true);
    expect(events.getEventsForJob(id).map((e) => e.event)).not.toContain("verified_absent");
  });
});
