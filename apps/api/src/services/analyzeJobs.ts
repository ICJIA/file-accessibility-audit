/**
 * In-memory job store for the progress-model audit (v1.100.0).
 *
 * PRIVACY POSTURE — the reason this is a Map and not a table: an audit
 * stores nothing, and the progress variant must not change that. A job here
 * holds step states and, once finished, the SAME result JSON the synchronous
 * endpoint would have returned — in process memory only, never on disk,
 * never in the database, and only until the page collects it or a short TTL
 * expires. The uploaded buffer itself is released the moment the pipeline
 * finishes, exactly as on the synchronous path. A restart forgets everything
 * (the page then falls back to a plain re-upload).
 *
 * ADDRESSING — the remediation precedent: jobs carry no owner identity, so
 * an unguessable id plus a bearer token is the only key. The raw token is
 * returned once at creation and stored only as its SHA-256; lookups compare
 * hashes with timingSafeEqual, and a wrong id or wrong token both answer
 * 404 — a bad key must not even confirm the job exists.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { AnalysisResult } from "@file-audit/analyzer";
import type { AnalyzeStep, MappedAnalyzeError } from "./analyzeCore.js";

export type JobStepState = "pending" | "running" | "done" | "skipped";

export interface AnalyzeJobStatus {
  done: boolean;
  steps: Record<AnalyzeStep, { state: JobStepState; startedAt?: number; endedAt?: number }>;
  /** Present exactly once, on the delivering response. */
  result?: AnalysisResult;
  /** Present exactly once when the audit failed — the same body the
   *  synchronous endpoint would have sent, with its HTTP status. */
  error?: MappedAnalyzeError;
}

interface AnalyzeJob {
  id: string;
  tokenHash: Buffer;
  createdAt: number;
  status: AnalyzeJobStatus;
}

// Bounds: a job lives until delivered or TTL; the cap is a DoS backstop far
// above real concurrency (uploads are rate-limited and the analysis
// semaphore admits two at a time).
export const JOB_TTL_MS = 10 * 60 * 1000;
export const JOB_HARD_TIMEOUT_MS = 5 * 60 * 1000;
export const MAX_JOBS = 100;

const jobs = new Map<string, AnalyzeJob>();

function sha256(raw: string): Buffer {
  return createHash("sha256").update(raw).digest();
}

/** Drop expired jobs; called on every access (no timer to keep alive). */
function sweep(now = Date.now()): void {
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
    else if (!job.status.done && now - job.createdAt > JOB_HARD_TIMEOUT_MS) {
      // A pipeline that somehow never settled (every inner step has its own
      // timeout, so this is a backstop): fail the job honestly rather than
      // letting the page poll a zombie forever.
      job.status.done = true;
      job.status.error = {
        status: 504,
        body: {
          error: "This file is too complex to analyze within the time limit.",
          details:
            "This can happen with very large documents that contain many embedded images or complex structure trees. To work around this, try splitting the document into smaller sections and analyzing each section separately.",
        },
      };
    }
  }
}

/** Create a job; null when the store is at its cap (caller answers 503). */
export function createAnalyzeJob(isPdf: boolean): { id: string; token: string } | null {
  sweep();
  if (jobs.size >= MAX_JOBS) return null;
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const skippedVera: JobStepState = isPdf ? "pending" : "skipped";
  jobs.set(id, {
    id,
    tokenHash: sha256(token),
    createdAt: Date.now(),
    status: {
      done: false,
      steps: {
        analysis: { state: "pending" },
        veraPdfUa: { state: skippedVera },
        veraPdfWcag: { state: skippedVera },
      },
    },
  });
  return { id, token };
}

/** Token-gated lookup: wrong id and wrong token are indistinguishable. */
function authorized(id: string, token: string): AnalyzeJob | null {
  sweep();
  const job = jobs.get(id);
  if (!job) return null;
  const offered = sha256(token);
  if (offered.length !== job.tokenHash.length || !timingSafeEqual(offered, job.tokenHash)) {
    return null;
  }
  return job;
}

/** Record a real observed step transition. */
export function markStep(id: string, step: AnalyzeStep, state: "running" | "done"): void {
  const job = jobs.get(id);
  if (!job) return;
  const s = job.status.steps[step];
  if (state === "running" && s.state === "pending") {
    s.state = "running";
    s.startedAt = Date.now();
  } else if (state === "done" && s.state !== "done") {
    s.state = "done";
    s.endedAt = Date.now();
  }
}

/** A veraPDF step the run decided not to perform (feature off / non-PDF). */
export function markStepSkipped(id: string, step: AnalyzeStep): void {
  const job = jobs.get(id);
  if (!job) return;
  if (job.status.steps[step].state === "pending") job.status.steps[step].state = "skipped";
}

export function finishJob(
  id: string,
  outcome: { result: AnalysisResult } | { error: MappedAnalyzeError },
): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status.done = true;
  if ("result" in outcome) job.status.result = outcome.result;
  else job.status.error = outcome.error;
}

/**
 * Poll a job. Step states are returned as often as asked; the RESULT (or
 * error) is delivered exactly once — the job is deleted on the response
 * that carries it, so nothing lingers once the page has the report.
 */
export function pollAnalyzeJob(id: string, token: string): AnalyzeJobStatus | null {
  const job = authorized(id, token);
  if (!job) return null;
  const status = job.status;
  if (status.done) jobs.delete(id);
  return status;
}

/** Test hook: reset the store completely. */
export function _resetAnalyzeJobs(): void {
  jobs.clear();
}

/** Test hook: current live job count (also used by tests for the cap). */
export function _jobCount(): number {
  sweep();
  return jobs.size;
}
