/**
 * Review 2026-11-12, second pass, finding 2 — with REAL processes.
 *
 * The verifier SIGKILLed a remediation worker. The job was failed and its
 * directory purged and "verified absent" — and then the ORPHANED JVM, which
 * does not die with the worker, wrote the document back and kept running
 * beside two new JVMs. services/workerGroup.ts kills the worker's whole
 * process group and waits for it to be empty; these tests build exactly that
 * shape (a detached leader with a child that outlives it) and check it.
 *
 * The stand-in "worker" is `node -e … jobs/remediate.ts <jobId>`: the same
 * command-line signature the real worker has, which is what the pid-reuse
 * guard looks for. The stand-in "JVM" is a `sleep` it starts.
 */
import { describe, it, expect, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import {
  isWorkerAlive,
  killWorkerGroup,
  listProcesses,
  ourGroupMembers,
  parseEtime,
  type GroupMember,
} from "../services/workerGroup.js";

const JOB = "0f6f1a52-6c1c-4a3e-9d4e-5b7a8c9d0e1f";
const started: ChildProcess[] = [];

const LEADER_SCRIPT =
  "require('child_process').spawn('sleep',['120'],{stdio:'ignore'});setInterval(()=>{},1000)";

function spawnFakeWorker(jobId = JOB): ChildProcess {
  const child = spawn(process.execPath, ["-e", LEADER_SCRIPT, "jobs/remediate.ts", jobId], {
    detached: true,
    stdio: "ignore",
  });
  started.push(child);
  return child;
}

const group = (pgid: number): GroupMember[] => listProcesses().filter((p) => p.pgid === pgid);

async function until(cond: () => boolean, ms = 5_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 50));
  }
}

afterEach(() => {
  for (const c of started.splice(0)) {
    try {
      process.kill(-c.pid!, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
});

describe("parseEtime", () => {
  it.each([
    ["00:07", 7],
    ["12:34", 754],
    ["01:02:03", 3723],
    ["2-03:04:05", 183_845],
  ])("%s → %d s", (text, sec) => expect(parseEtime(text)).toBe(sec));
  it("treats anything unparseable as infinitely old (never 'ours')", () => {
    expect(parseEtime("??")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("the worker's process group — real processes", () => {
  it("sees the worker and the child it started as one group", async () => {
    const w = spawnFakeWorker();
    await until(() => group(w.pid!).length === 2);
    const ref = { jobId: JOB, pid: w.pid!, startedAt: Date.now() - 1_000 };
    expect(ourGroupMembers(ref).map((p) => p.pid)).toContain(w.pid);
    expect(ourGroupMembers(ref)).toHaveLength(2);
    expect(isWorkerAlive(ref)).toBe(true);
  });

  it("THE BUG: after the worker is SIGKILLed its child is still running — and killWorkerGroup ends it", async () => {
    const w = spawnFakeWorker();
    await until(() => group(w.pid!).length === 2);
    const ref = { jobId: JOB, pid: w.pid!, startedAt: Date.now() - 1_000 };

    process.kill(w.pid!, "SIGKILL"); // what the verifier did
    await until(() => !group(w.pid!).some((p) => p.pid === w.pid));

    // The orphan (the stand-in JVM) survived its parent, in the same group.
    const orphans = group(w.pid!);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]!.command).toMatch(/sleep/);
    expect(isWorkerAlive(ref)).toBe(false); // the worker itself is gone …
    expect(ourGroupMembers(ref)).toHaveLength(1); // … its group is not

    expect(killWorkerGroup(ref)).toBe(true);
    expect(group(w.pid!)).toEqual([]); // confirmed: nothing left to write the file back
  });

  it("kills a live worker and its child together", async () => {
    const w = spawnFakeWorker();
    await until(() => group(w.pid!).length === 2);
    expect(killWorkerGroup({ jobId: JOB, pid: w.pid!, startedAt: Date.now() - 1_000 })).toBe(true);
    expect(group(w.pid!)).toEqual([]);
  });

  it("exceptPid spares the worker itself (its own kill timer) and takes only the children", async () => {
    const w = spawnFakeWorker();
    await until(() => group(w.pid!).length === 2);
    const ref = { jobId: JOB, pid: w.pid!, startedAt: Date.now() - 1_000 };
    expect(killWorkerGroup(ref, { exceptPid: w.pid! })).toBe(true);
    expect(group(w.pid!).map((p) => p.pid)).toEqual([w.pid]);
  });

  it("PID REUSE: a pid that now belongs to an unrelated group leader is never killed", async () => {
    const other = spawn("sleep", ["120"], { detached: true, stdio: "ignore" });
    started.push(other);
    await until(() => group(other.pid!).length === 1);
    // A job row that still carries this pid from a long-dead worker.
    const ref = { jobId: JOB, pid: other.pid!, startedAt: Date.now() - 1_000 };
    expect(ourGroupMembers(ref)).toEqual([]);
    expect(isWorkerAlive(ref)).toBe(false);
    expect(killWorkerGroup(ref)).toBe(true); // "nothing of ours there"
    expect(group(other.pid!)).toHaveLength(1); // and it is still alive
  });

  it("PID REUSE: a worker for a DIFFERENT job on that pid is not ours either", async () => {
    const w = spawnFakeWorker("some-other-job-id");
    await until(() => group(w.pid!).length === 2);
    expect(killWorkerGroup({ jobId: JOB, pid: w.pid!, startedAt: Date.now() })).toBe(true);
    expect(group(w.pid!)).toHaveLength(2);
  });
});

describe("the guards, with a scripted process table", () => {
  const now = 1_800_000_000_000;
  const row = (pid: number, pgid: number, elapsedSec: number, command: string): GroupMember => ({
    pid,
    pgid,
    elapsedSec,
    command,
  });
  const ref = { jobId: JOB, pid: 500, startedAt: now - 60_000 };

  it("orphans older than the job's dispatch cannot be its descendants", () => {
    const list = () => [
      row(501, 500, 30, "java -Xmx768m -jar odl.jar"), // started after dispatch: ours
      row(502, 500, 86_400, "postgres"), // running since yesterday: a reused group id
    ];
    expect(ourGroupMembers(ref, now, list).map((p) => p.pid)).toEqual([501]);
  });

  it("never touches pid 0/1 or a row with no pid", () => {
    const list = () => [row(1, 1, 5, "init"), row(2, 0, 5, "kthreadd")];
    for (const pid of [null, 0, 1]) {
      expect(ourGroupMembers({ ...ref, pid }, now, list)).toEqual([]);
    }
  });

  it("returns false — and says so — when members are still there at the deadline", () => {
    let clock = now;
    const killed: number[] = [];
    const dead = killWorkerGroup(ref, {
      timeoutMs: 200,
      now: () => (clock += 60),
      list: () => [row(501, 500, 30, "java -jar odl.jar")], // will not die
      kill: (pid) => void killed.push(pid),
    });
    expect(dead).toBe(false);
    expect(killed.length).toBeGreaterThan(1); // it kept trying
    expect(new Set(killed)).toEqual(new Set([501]));
  });

  it("returns true as soon as the table shows the group empty", () => {
    let alive = true;
    const dead = killWorkerGroup(ref, {
      list: () => (alive ? [row(501, 500, 30, "java")] : []),
      kill: () => void (alive = false),
      now: () => now,
    });
    expect(dead).toBe(true);
  });
});
