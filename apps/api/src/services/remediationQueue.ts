/**
 * Remediation worker dispatch — the global concurrency cap (review 2026-11-12).
 *
 * WHY: every POST /api/remediate used to spawn a detached node worker on the
 * spot, and each worker starts an OpenDataLoader JVM (-Xmx JVM_HEAP_MB) and
 * then a veraPDF JVM. The only bound was the per-caller DAILY cap (100), so
 * one caller re-posting one audited PDF could have dozens of JVMs running at
 * once on a 4 GB box.
 *
 * HOW: a job is created QUEUED (status `pending`, started_at NULL) and this
 * module starts queued jobs, oldest first, while fewer than
 * REMEDIATION.MAX_CONCURRENT_JOBS hold a slot. Slots are counted from the
 * remediation_jobs rows (services/remediationJobs.ts), never from process
 * memory: workers are detached and outlive an API restart, so an in-process
 * counter would restart at zero with workers still running.
 *
 * WHEN dispatch runs:
 *   - right after POST /api/remediate inserts a job;
 *   - when a worker this process spawned exits (the usual hand-over);
 *   - on each status poll of a job that is still queued (covers an API
 *     restart, after which no exit listener exists for the old workers);
 *   - on every retention sweep (last resort).
 *
 * A slot is released by ANY terminal transition of its job — worker success
 * or failure, the worker's own kill timer, the stuck-job sweep, or the exit /
 * spawn-error handlers below — because "released" is just "the row is no
 * longer pending/running".
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REMEDIATION } from "#config";
import { buildChildSpawnEnv } from "./childSpawnEnv.js";
import { jobDirFor, purgeJobDir, recordEvent } from "./remediationEvents.js";
import {
  countActiveJobs,
  failIfActive,
  getJob,
  listActiveJobs,
  markDispatched,
  nextQueuedJobId,
  setWorkerPid,
} from "./remediationJobs.js";
import { isWorkerAlive, killWorkerGroup } from "./workerGroup.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.resolve(HERE, "../jobs/remediate.ts");

/**
 * End a job from OUTSIDE its own pipeline: the worker could not be started,
 * died (OOM-killed, crashed before its handlers ran), is stuck, or is simply
 * not there any more after a restart. A job the worker already finished is
 * left exactly as it is.
 *
 * ORDER IS THE POINT (see services/workerGroup.ts):
 *   1. SIGKILL the worker's whole process group and wait until it is empty —
 *      the JVMs it started do not die with it, and an orphaned JVM both keeps
 *      using the memory the cap exists to protect and writes the document
 *      back to disk after a purge;
 *   2. only then mark the row failed — that transition is what frees the
 *      slot, so the slot stays taken until the group is confirmed dead;
 *   3. only then delete and verify the job directory.
 * If the group cannot be confirmed dead in time, NOTHING is changed: the row
 * stays active (slot held, files not claimed deleted) and the next sweep
 * tries again. Returns whether the job was ended.
 */
export function endJobFromOutside(
  jobId: string,
  errorType: string,
  reason: string,
  detail: string,
): boolean {
  try {
    const job = getJob(jobId);
    if (!job || (job.status !== "pending" && job.status !== "running")) return false;
    const dead = killWorkerGroup({ jobId, pid: job.workerPid, startedAt: job.startedAt });
    if (!dead) {
      recordEvent(jobId, "error", {
        error_type: "worker_group_still_alive",
        message: "worker processes did not exit after SIGKILL; job left active, will retry",
      });
      return false;
    }
    if (!failIfActive(jobId, reason)) return false;
    recordEvent(jobId, "error", { error_type: errorType, message: detail });
    purgeJobDir(jobId, jobDirFor(jobId), "cleanup");
    return true;
  } catch (e) {
    console.error(`[remediation] could not end a job from outside its worker:`, e);
    return false;
  }
}

/** A worker this recently dispatched may not have exec'd yet (its command
 *  line is still the API's own), so it is not judged. */
const RECONCILE_GRACE_MS = 5_000;

/**
 * Reconcile the job rows with the processes that actually exist. Run on API
 * boot and on every sweep.
 *
 * WHY: slots are counted from rows. A PM2 restart that tree-kills the workers
 * leaves their rows `running` with nothing behind them, and both slots stayed
 * taken until the stuck-job sweep, 10–15 minutes later. A row whose worker is
 * not alive — or whose pid now belongs to something else — is ended at once
 * (group killed first, in case its JVMs survived it). A worker that IS still
 * alive from before the restart keeps its slot and carries on.
 *
 * Rows with no recorded pid (dispatched before migration 18) are left to the
 * stuck-job sweep. Returns how many jobs were ended. Never throws.
 */
export function reconcileWorkers(now: number = Date.now()): number {
  let ended = 0;
  try {
    for (const job of listActiveJobs()) {
      if (job.workerPid == null || job.startedAt == null) continue;
      if (now - job.startedAt < RECONCILE_GRACE_MS) continue;
      if (isWorkerAlive({ jobId: job.id, pid: job.workerPid, startedAt: job.startedAt }, now)) {
        continue;
      }
      if (
        endJobFromOutside(
          job.id,
          "worker_lost",
          "the remediation worker is no longer running",
          "no live worker process for this job (found by reconcile)",
        )
      ) {
        ended++;
      }
    }
  } catch (e) {
    console.error("[remediation] reconcile failed:", e);
  }
  return ended;
}

/**
 * Start the detached worker for one job. Exported for the spawn-env test and
 * re-exported from routes/remediate.ts (its historical home).
 */
export function spawnWorker(jobId: string): ChildProcess {
  // Detached child so the parent (API) doesn't have to wait. tsx is the
  // runtime loader used by both `pnpm dev` (`tsx watch`) and `pnpm start`
  // (`node --import tsx`); we pass it explicitly here so the worker
  // launches the same way regardless of how the parent was started.
  const child = spawn(process.execPath, ["--import", "tsx", WORKER_PATH, jobId], {
    detached: true,
    stdio: "ignore",
    // Denylisted copy of the parent's env (see childSpawnEnv.ts): this
    // worker parses an attacker-controlled PDF, so it must not hold the
    // API's secrets while still getting everything it needs to boot
    // (PATH/HOME/NODE_*/TSX_*) and to run the JVM pipeline (JAVA_*).
    env: buildChildSpawnEnv(),
  });

  // An ASYNCHRONOUS spawn failure (EAGAIN — out of processes, EMFILE — out of
  // descriptors, ENOMEM) arrives as an 'error' event, not a throw. With no
  // listener Node turns that into an uncaught exception, and index.ts's
  // uncaughtException handler exits the API: one failed fork under load took
  // the whole service down. Listen, fail the job, keep serving.
  child.on("error", (err: NodeJS.ErrnoException) => {
    console.error(`[remediation] worker spawn failed (${err?.code ?? "error"})`);
    endJobFromOutside(
      jobId,
      "worker_spawn_failed",
      "the remediation worker could not be started",
      err?.code ?? "spawn error",
    );
    dispatchQueuedJobs();
  });

  // The worker ended: its slot is free. If it ended WITHOUT finishing the job
  // (killed from outside, crashed during boot) the row would otherwise hold
  // the slot until the stuck-job sweep, up to 15 minutes later.
  child.on("exit", (code, signal) => {
    // The worker PROCESS is gone, but the JVMs it started may not be:
    // endJobFromOutside kills what is left of its group before anything else.
    endJobFromOutside(
      jobId,
      "worker_exited",
      "the remediation worker stopped before finishing",
      `exit code ${code ?? "none"}, signal ${signal ?? "none"}`,
    );
    dispatchQueuedJobs();
  });

  // The pid doubles as the process-group id (detached). Recorded so the
  // group can be killed, and so a restart can tell a live worker from a row.
  if (typeof child.pid === "number") setWorkerPid(jobId, child.pid);

  child.unref();
  return child;
}

/**
 * Start queued jobs while slots are free. Synchronous end to end (SQLite
 * reads + a guarded UPDATE + spawn), so two triggers in the same tick cannot
 * over-commit. Returns how many workers were started. Never throws.
 *
 * `start` is injectable for tests; production uses spawnWorker.
 */
export function dispatchQueuedJobs(start: (jobId: string) => unknown = spawnWorker): number {
  let started = 0;
  try {
    // Bounded loop: at most one start per free slot.
    for (let i = 0; i < REMEDIATION.MAX_CONCURRENT_JOBS; i++) {
      if (countActiveJobs() >= REMEDIATION.MAX_CONCURRENT_JOBS) break;
      const jobId = nextQueuedJobId();
      if (!jobId) break;
      if (!markDispatched(jobId)) continue;
      try {
        start(jobId);
        started++;
      } catch (e) {
        // A SYNCHRONOUS spawn failure (bad arguments, EACCES on some
        // platforms): same outcome as the asynchronous one.
        endJobFromOutside(
          jobId,
          "worker_spawn_failed",
          "the remediation worker could not be started",
          (e as NodeJS.ErrnoException)?.code ?? "spawn threw",
        );
      }
    }
  } catch (e) {
    console.error("[remediation] dispatch failed:", e);
  }
  return started;
}
