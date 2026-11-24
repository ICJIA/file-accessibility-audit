/**
 * GET /api/remediate/:jobId/download — single use means ONE COMPLETED
 * transfer.
 *
 * The handler used to mark the job expired the moment a request arrived and
 * delete the file when that response closed. Express 4 answers HEAD from the
 * GET route, so a link scanner's HEAD — or a GET that was cut off part-way —
 * destroyed a file nobody had received.
 *
 * Real SQLite, real files, the real router behind a real HTTP listener, and
 * real sockets that are really destroyed mid-transfer.
 *
 * Also here, because it needs the same listener: POST /api/remediate refuses
 * on its cheap limits BEFORE the upload is read.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

const { root, outDir } = vi.hoisted(() => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/remediate-download-test-${process.pid}-${Date.now()}`;
  process.env.DB_PATH = `${root}/test.db`;
  process.env.ACTIVITY_LOG_DIR = `${root}/logs`;
  return { root, outDir: `${root}/remediation` };
});

vi.mock("#config", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    REMEDIATION: {
      ...actual.REMEDIATION,
      ENABLED: true,
      OUTPUT_DIR: outDir,
      MAX_CONCURRENT_JOBS: 1,
      MAX_QUEUED_JOBS: 1,
    },
  };
});

// No worker is ever started here: a dispatched job just sits in its slot.
vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  const { EventEmitter } = await import("node:events");
  return {
    ...actual,
    spawn: () => Object.assign(new EventEmitter(), { unref: () => {}, pid: 999_999 }),
  };
});

let jobs: typeof import("../services/remediationJobs.js");
let events: typeof import("../services/remediationEvents.js");
let route: typeof import("../routes/remediate.js");
let queue: typeof import("../services/remediationQueue.js");
let db: (typeof import("../db/sqlite.js"))["default"];
let server: http.Server;
let baseUrl = "";

beforeAll(async () => {
  jobs = await import("../services/remediationJobs.js");
  events = await import("../services/remediationEvents.js");
  queue = await import("../services/remediationQueue.js");
  db = (await import("../db/sqlite.js")).default;
  route = await import("../routes/remediate.js");

  const express = (await import("express")).default;
  const { errorHandler } = await import("../middleware/errorHandler.js");
  const { stampErrorCodes } = await import("../services/apiError.js");
  const app = express();
  app.use(stampErrorCodes);
  app.use("/api", route.default);
  app.use(errorHandler);
  await new Promise<void>((r) => {
    server = app.listen(0, "127.0.0.1", r);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec("DELETE FROM remediation_jobs; DELETE FROM remediation_events; DELETE FROM audit_log;");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
});

/** Big enough that a transfer cannot finish inside the socket buffers. */
const BIG = 24 * 1024 * 1024;

/** A finished job with its output file on disk. */
function completeJob(size = 2048) {
  const { job, downloadToken } = jobs.createJob({
    inputFilename: "report.pdf",
    originalFilename: "Annual report.pdf",
    contentHash: "hash",
    pageCount: 3,
  });
  const dir = events.jobDirFor(job.id);
  mkdirSync(dir, { recursive: true });
  const outputPath = join(dir, "output.pdf");
  const bytes = randomBytes(size);
  writeFileSync(outputPath, bytes);
  jobs.setRunning(job.id);
  jobs.setComplete(job.id, outputPath);
  const url = `${baseUrl}/api/remediate/${job.id}/download?token=${downloadToken}`;
  return { id: job.id, token: downloadToken, outputPath, bytes, url, dir };
}

const statusOf = (id: string) => jobs.getJob(id)?.status;
const eventNames = (id: string) => events.getEventsForJob(id).map((e) => e.event);

async function until(cond: () => boolean, ms = 5_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Wait for the server-side close handler (expiry + deletion) to have run. */
const settled = () => until(() => route._downloadsInProgress() === 0);

/** Start a GET and hand back the response before any of the body is read. */
function openGet(url: string): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    http.get(url, resolve).on("error", reject);
  });
}

describe("HEAD uses nothing up", () => {
  it("HEAD returns the headers a GET would, with no body, and changes nothing", async () => {
    const j = completeJob();
    const head = await fetch(j.url, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toBe("application/pdf");
    expect(head.headers.get("content-length")).toBe(String(j.bytes.length));
    expect(head.headers.get("content-disposition")).toContain("Annual%20report.pdf");
    expect((await head.arrayBuffer()).byteLength).toBe(0);

    expect(statusOf(j.id)).toBe("complete");
    expect(existsSync(j.outputPath)).toBe(true);
    expect(eventNames(j.id)).not.toContain("downloaded");
    expect(eventNames(j.id)).not.toContain("output_deleted");
  });

  it("HEAD (as often as a scanner likes) then GET: the person still gets the file", async () => {
    const j = completeJob();
    for (let i = 0; i < 3; i++) expect((await fetch(j.url, { method: "HEAD" })).status).toBe(200);

    const get = await fetch(j.url);
    expect(get.status).toBe(200);
    expect(Buffer.from(await get.arrayBuffer()).equals(j.bytes)).toBe(true);
  });
});

describe("a completed GET is the one use", () => {
  it("completed GET → the job is expired, its files are gone, and the next GET is 410", async () => {
    const j = completeJob();
    const first = await fetch(j.url);
    expect(first.status).toBe(200);
    expect(Buffer.from(await first.arrayBuffer()).equals(j.bytes)).toBe(true);
    await settled();
    await until(() => !existsSync(j.dir));

    expect(statusOf(j.id)).toBe("expired");
    expect(existsSync(j.outputPath)).toBe(false);
    const names = eventNames(j.id);
    expect(names).toContain("downloaded");
    expect(names).toContain("output_deleted");

    const second = await fetch(j.url);
    expect(second.status).toBe(410);
    expect(await second.json()).toEqual({
      error: "Output expired and was deleted.",
      code: "GONE",
    });
    // HEAD after the download agrees.
    expect((await fetch(j.url, { method: "HEAD" })).status).toBe(410);
  });
});

describe("an interrupted GET leaves the download retryable", () => {
  it("aborted GET then GET: the second one receives the whole file", async () => {
    const j = completeJob(BIG);

    const res = await openGet(j.url);
    expect(res.statusCode).toBe(200);
    // Take the first chunk, then cut the connection — a closed tab.
    await new Promise<void>((resolve) => res.once("data", () => resolve()));
    res.destroy();
    await settled();

    // Nothing was used up.
    expect(statusOf(j.id)).toBe("complete");
    expect(existsSync(j.outputPath)).toBe(true);
    expect(eventNames(j.id)).not.toContain("downloaded");
    expect(eventNames(j.id)).not.toContain("output_deleted");
    const incomplete = events
      .getEventsForJob(j.id)
      .find((e) => (e.details as any)?.error_type === "download_incomplete");
    expect(incomplete).toBeDefined();
    expect((incomplete!.details as any).bytes_sent).toBeLessThan(BIG);

    const retry = await fetch(j.url);
    expect(retry.status).toBe(200);
    expect(Buffer.from(await retry.arrayBuffer()).equals(j.bytes)).toBe(true);
    await settled();
    expect(statusOf(j.id)).toBe("expired");

    expect((await fetch(j.url)).status).toBe(410);
  });

  it("the retention sweep still expires a job whose download was only ever interrupted", async () => {
    const cleanup = await import("../services/remediationCleanup.js");
    const j = completeJob(BIG);
    const res = await openGet(j.url);
    await new Promise<void>((resolve) => res.once("data", () => resolve()));
    res.destroy();
    await settled();
    expect(statusOf(j.id)).toBe("complete");

    db.prepare("UPDATE remediation_jobs SET expires_at = ? WHERE id = ?").run(Date.now() - 1, j.id);
    const result = await cleanup.runCleanup();
    cleanup.stopCleanupInterval();
    expect(result.expiredOutputs).toBe(1);
    expect(statusOf(j.id)).toBe("expired");
    expect(existsSync(j.outputPath)).toBe(false);
    expect((await fetch(j.url)).status).toBe(410);
  });
});

describe("two GETs at once cannot both succeed", () => {
  it("the second is refused while the first is being sent; the first completes", async () => {
    const j = completeJob(BIG);

    // The first transfer is open and not being read: it is in progress.
    const first = await openGet(j.url);
    expect(first.statusCode).toBe(200);
    expect(route._downloadsInProgress()).toBe(1);

    const second = await fetch(j.url);
    expect(second.status).toBe(409);
    expect(second.headers.get("retry-after")).toBe("5");
    expect(second.headers.get("content-type")).toMatch(/application\/json/);
    expect(await second.json()).toEqual({
      error: "A download of this file is already in progress.",
      details: "The file can be downloaded once. Wait for the download that has started.",
      code: "DOWNLOAD_IN_PROGRESS",
    });
    // The refusal used nothing up, and did not disturb the first transfer.
    expect(statusOf(j.id)).toBe("complete");

    const chunks: Buffer[] = [];
    for await (const c of first) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).equals(j.bytes)).toBe(true);
    await settled();

    expect(statusOf(j.id)).toBe("expired");
    expect((await fetch(j.url)).status).toBe(410);
    expect(eventNames(j.id).filter((n) => n === "downloaded")).toHaveLength(1);
  });

  it("two requests fired together: exactly one 200", async () => {
    const j = completeJob(BIG);
    const [a, b] = await Promise.all([fetch(j.url), fetch(j.url)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    expect(Buffer.from(await winner.arrayBuffer()).equals(j.bytes)).toBe(true);
    await (a.status === 200 ? b : a).arrayBuffer();
    await settled();
    expect(statusOf(j.id)).toBe("expired");
  });
});

describe("nothing about a job is told to a caller without its token", () => {
  const body404 = { error: "Job not found", code: "NOT_FOUND" };

  it("a wrong or missing token is the same 404 as an unknown job — in every job state", async () => {
    const unknown = await fetch(
      `${baseUrl}/api/remediate/00000000-0000-4000-8000-000000000000/download?token=x`,
    );
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual(body404);

    // complete, pending, failed, expired
    const complete = completeJob();
    const pending = jobs.createJob({ inputFilename: "p.pdf", contentHash: "h", pageCount: 1 });
    const failed = jobs.createJob({ inputFilename: "f.pdf", contentHash: "h", pageCount: 1 });
    jobs.setFailed(failed.job.id, "x");
    const expired = completeJob();
    jobs.setExpired(expired.id);

    for (const id of [complete.id, pending.job.id, failed.job.id, expired.id]) {
      for (const suffix of ["", "?token=", "?token=not-the-token"]) {
        const r = await fetch(`${baseUrl}/api/remediate/${id}/download${suffix}`);
        expect(r.status, `${id}${suffix}`).toBe(404);
        expect(await r.json()).toEqual(body404);
      }
    }
    // …and none of that used the real download up.
    expect(statusOf(complete.id)).toBe("complete");
    expect(existsSync(complete.outputPath)).toBe(true);
  });

  it("WITH the token, the state is reported as before: 409 not finished, 410 expired", async () => {
    const pending = jobs.createJob({ inputFilename: "p.pdf", contentHash: "h", pageCount: 1 });
    const r = await fetch(
      `${baseUrl}/api/remediate/${pending.job.id}/download?token=${pending.downloadToken}`,
    );
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      error: "Job is pending.",
      details: "Wait for completion before downloading.",
      code: "NOT_READY",
    });
  });

  it("a file that has vanished: GET expires the job (410); HEAD only reports it", async () => {
    const j = completeJob();
    rmSync(j.outputPath);
    expect((await fetch(j.url, { method: "HEAD" })).status).toBe(410);
    expect(statusOf(j.id)).toBe("complete"); // HEAD changed nothing
    const get = await fetch(j.url);
    expect(get.status).toBe(410);
    expect(await get.json()).toEqual({ error: "Output already deleted.", code: "GONE" });
    expect(statusOf(j.id)).toBe("expired");
  });
});

describe("POST /api/remediate refuses on its cheap limits before the upload is read", () => {
  it("queue full → 503 + Retry-After without parsing the body at all", async () => {
    // One job running, one waiting: MAX_CONCURRENT_JOBS 1 + MAX_QUEUED_JOBS 1.
    jobs.createJob({ inputFilename: "a.pdf", contentHash: "h1", pageCount: 1 });
    queue.dispatchQueuedJobs();
    jobs.createJob({ inputFilename: "b.pdf", contentHash: "h2", pageCount: 1 });
    expect(jobs.countActiveJobs()).toBe(1);
    expect(jobs.countQueuedJobs()).toBe(1);

    // A body the multipart parser would refuse with 400 ("Only PDF files are
    // accepted") if it were ever read. The answer is the queue's 503 instead:
    // the refusal came first.
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(1024)], { type: "text/plain" }), "notes.txt");
    const res = await fetch(`${baseUrl}/api/remediate`, { method: "POST", body: form });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(await res.json()).toEqual({
      error: "Auto-remediation is busy.",
      details:
        "Too many remediations are already running or waiting. Please try again in a minute.",
      code: "SERVER_BUSY",
    });
  });

  it("with room, the same request reaches the parser (400: not a PDF)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(1024)], { type: "text/plain" }), "notes.txt");
    const res = await fetch(`${baseUrl}/api/remediate`, { method: "POST", body: form });
    warn.mockRestore();
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("UNSUPPORTED_TYPE");
  });

  it("a password-protected PDF fails the preflight as 422 FILE_ENCRYPTED, not 500 — and leaves nothing on disk", async () => {
    const { execFileSync } = await import("node:child_process");
    const { readFileSync, readdirSync } = await import("node:fs");
    const auditLog = await import("../services/auditLog.js");
    const out = `${root}/encrypted.pdf`;
    execFileSync(process.env.QPDF_PATH || "qpdf", [
      "--encrypt",
      "user-password",
      "owner-password",
      "256",
      "--",
      new URL("./fixtures/accessible.pdf", import.meta.url).pathname,
      out,
    ]);
    const encrypted = readFileSync(out);
    // These exact bytes "were audited" — the audit-gate is not what is under test.
    auditLog.recordAudit({
      eventType: "analyze",
      privileged: false,
      filename: "locked.pdf",
      score: 0,
      grade: "F",
      contentHash: auditLog.sha256Hex(encrypted),
    });

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(encrypted)], { type: "application/pdf" }),
      "locked.pdf",
    );
    const res = await fetch(`${baseUrl}/api/remediate`, { method: "POST", body: form });
    error.mockRestore();

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("This PDF is password-protected.");
    expect(body.code).toBe("FILE_ENCRYPTED");
    // No job, no copy of the upload, and no failed-AUDIT row (it was not an audit).
    expect(jobs.countActiveJobs() + jobs.countQueuedJobs()).toBe(0);
    expect(readdirSync(outDir)).toEqual([]);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE event_type LIKE '%-failed'").get(),
    ).toEqual({ n: 0 });
  });

  it("WIRING: the gate is mounted before the multipart parser", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../routes/remediate.ts", import.meta.url), "utf8");
    const gate = src.indexOf("  requireRemediationCapacity,\n");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(src.indexOf('  remediateUpload.single("file"),'));
  });
});
