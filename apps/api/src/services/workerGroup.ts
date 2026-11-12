/**
 * The remediation worker's PROCESS GROUP (review 2026-11-12, second pass).
 *
 * A worker is spawned `detached`, which makes it the leader of its own
 * process group: its pid is the group id, and the OpenDataLoader JVM, the
 * veraPDF JVM and any qpdf child it starts are members. That matters because
 * killing the node worker does NOT kill those children. The verifier
 * SIGKILLed a worker; the job was failed and its directory purged and
 * "verified absent" — and then the orphaned JVM, still running, wrote
 * work/odl/…_tagged.pdf back to disk, while the freed slot let a third JVM
 * start against a cap of two.
 *
 * So whenever a job is ended from OUTSIDE its own pipeline (the worker's kill
 * timer, the exit handler, the stuck-job sweep, the boot reconcile):
 *   1. SIGKILL the whole group,
 *   2. wait — bounded — until no member remains,
 *   3. only THEN mark the row terminal (which is what frees its slot), purge
 *      the directory and record the deletion.
 *
 * PID REUSE: a pid stored on a row may, later, belong to something else.
 * Nothing here is killed unless it is provably ours:
 *   - a live group LEADER must have our worker's command line (it carries the
 *     job id as its last argument);
 *   - every member must be YOUNGER than the job's dispatch time — a process
 *     that was already running before the worker was spawned cannot be its
 *     descendant.
 * A group that fails those checks is treated as "not ours": left alone, and
 * the worker counted as gone.
 *
 * Synchronous throughout (ps via execFileSync, a blocking sleep): the callers
 * are a kill timer about to exit, and row transitions that must not
 * interleave with a dispatch pass.
 */
import { execFileSync } from "node:child_process";

export interface GroupMember {
  pid: number;
  pgid: number;
  /** Seconds since the process started. */
  elapsedSec: number;
  command: string;
}

/** `[[dd-]hh:]mm:ss` (ps etime, identical on Linux and macOS) → seconds. */
export function parseEtime(text: string): number {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(text.trim());
  if (!m) return Number.POSITIVE_INFINITY; // unparseable = "old" = never ours
  return Number(m[1] ?? 0) * 86_400 + Number(m[2] ?? 0) * 3_600 + Number(m[3]) * 60 + Number(m[4]);
}

/** Every process on the host, as ps reports it. Injectable for tests. */
export type ProcessLister = () => GroupMember[];

export const listProcesses: ProcessLister = () => {
  let out: string;
  try {
    out = execFileSync("ps", ["-A", "-ww", "-o", "pid=,pgid=,stat=,etime=,args="], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 5_000,
    });
  } catch {
    return [];
  }
  const rows: GroupMember[] = [];
  for (const line of out.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/.exec(line);
    if (!m) continue;
    // A ZOMBIE is dead: it runs nothing and can write nothing; it is only an
    // exit status waiting to be collected (by this very process, which is
    // blocked in the wait loop below and so cannot collect it yet). Counting
    // it would both stall that loop and — because a zombie's command line is
    // gone — make a just-killed worker look like an unrelated process.
    if (m[3]!.startsWith("Z")) continue;
    rows.push({
      pid: Number(m[1]),
      pgid: Number(m[2]),
      elapsedSec: parseEtime(m[4]!),
      command: m[5]!,
    });
  }
  return rows;
};

export interface WorkerRef {
  jobId: string;
  /** The worker's pid = its process-group id. */
  pid: number | null;
  /** When the job was dispatched (ms epoch); null on rows older than the column. */
  startedAt: number | null;
}

/** Slack for clock granularity (ps reports whole seconds). */
const AGE_SLACK_SEC = 5;

function isOurLeader(p: GroupMember, w: WorkerRef): boolean {
  return /jobs[\\/]remediate\.[tj]s/.test(p.command) && p.command.includes(w.jobId);
}

/**
 * The members of the worker's group that are provably ours (see PID REUSE).
 * Empty = the worker and everything it started are gone, or the pid now
 * belongs to something else.
 */
export function ourGroupMembers(
  w: WorkerRef,
  now: number = Date.now(),
  list: ProcessLister = listProcesses,
): GroupMember[] {
  if (!w.pid || w.pid <= 1) return [];
  const members = list().filter((p) => p.pgid === w.pid);
  if (members.length === 0) return [];

  const leader = members.find((p) => p.pid === w.pid);
  if (leader && !isOurLeader(leader, w)) return []; // pid reused by an unrelated group leader

  if (w.startedAt == null) return leader ? members : [];
  const maxAgeSec = (now - w.startedAt) / 1000 + AGE_SLACK_SEC;
  return members.filter((p) => p.elapsedSec <= maxAgeSec);
}

/** Is the worker PROCESS itself (the group leader) alive and ours? */
export function isWorkerAlive(
  w: WorkerRef,
  now: number = Date.now(),
  list: ProcessLister = listProcesses,
): boolean {
  return ourGroupMembers(w, now, list).some((p) => p.pid === w.pid);
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export interface KillOptions {
  /** How long to wait for the group to empty. */
  timeoutMs?: number;
  /** Leave this pid alive (the worker killing its own descendants). */
  exceptPid?: number;
  list?: ProcessLister;
  kill?: (pid: number, signal: NodeJS.Signals) => void;
  now?: () => number;
}

/**
 * SIGKILL every provably-ours member of the worker's group and wait until
 * none remains. Returns true when the group is CONFIRMED empty (also when it
 * already was), false if members were still present at the deadline — in
 * which case the caller must NOT free the slot or claim the files are gone.
 */
export function killWorkerGroup(w: WorkerRef, opts: KillOptions = {}): boolean {
  const list = opts.list ?? listProcesses;
  const kill = opts.kill ?? ((pid, signal) => process.kill(pid, signal));
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.timeoutMs ?? 5_000);
  const remaining = (): GroupMember[] =>
    ourGroupMembers(w, now(), list).filter((p) => p.pid !== opts.exceptPid);

  for (;;) {
    const members = remaining();
    if (members.length === 0) return true;
    for (const p of members) {
      try {
        // Individually, not kill(-pgid): each target has just been checked.
        kill(p.pid, "SIGKILL");
      } catch {
        // ESRCH — already gone; EPERM — not ours to kill after all
      }
    }
    if (now() >= deadline) return remaining().length === 0;
    sleepSync(50);
  }
}
