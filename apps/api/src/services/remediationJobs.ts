import { createHash, randomUUID, randomBytes } from "node:crypto";
import db from "../db/sqlite.js";
import { REMEDIATION } from "#config";

export type RemediationJobStatus =
  | "pending"
  | "running"
  | "complete"
  | "failed"
  | "expired";

export type RemediationStep =
  | "preparing"
  | "tagging"
  | "validating"
  | "comparing";

export interface RemediationJob {
  id: string;
  email: string | null;
  inputFilename: string;
  contentHash: string | null;
  pageCount: number | null;
  status: RemediationJobStatus;
  step: RemediationStep | null;
  progressPct: number;
  inputScore: number | null;
  outputScore: number | null;
  outputValid: boolean | null;
  outputPath: string | null;
  downloadTokenHash: string | null;
  failureReason: string | null;
  createdAt: number;
  completedAt: number | null;
  expiresAt: number;
}

interface JobRow {
  id: string;
  email: string | null;
  input_filename: string;
  content_hash: string | null;
  page_count: number | null;
  status: RemediationJobStatus;
  step: RemediationStep | null;
  progress_pct: number;
  input_score: number | null;
  output_score: number | null;
  output_valid: number | null;
  output_path: string | null;
  download_token_hash: string | null;
  failure_reason: string | null;
  created_at: number;
  completed_at: number | null;
  expires_at: number;
}

function rowToJob(r: JobRow): RemediationJob {
  return {
    id: r.id,
    email: r.email,
    inputFilename: r.input_filename,
    contentHash: r.content_hash,
    pageCount: r.page_count,
    status: r.status,
    step: r.step,
    progressPct: r.progress_pct,
    inputScore: r.input_score,
    outputScore: r.output_score,
    outputValid:
      r.output_valid === null ? null : r.output_valid === 1,
    outputPath: r.output_path,
    downloadTokenHash: r.download_token_hash,
    failureReason: r.failure_reason,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    expiresAt: r.expires_at,
  };
}

const insertJob = db.prepare(
  `INSERT INTO remediation_jobs (
     id, email, input_filename, content_hash, page_count, status,
     progress_pct, download_token_hash, created_at, expires_at
   ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
);

const selectJobById = db.prepare(
  "SELECT * FROM remediation_jobs WHERE id = ?",
);

const updateStep = db.prepare(
  "UPDATE remediation_jobs SET step = ?, progress_pct = ? WHERE id = ?",
);

const updateStatus = db.prepare(
  "UPDATE remediation_jobs SET status = ?, progress_pct = ? WHERE id = ?",
);

const updateScores = db.prepare(
  "UPDATE remediation_jobs SET input_score = ?, output_score = ?, output_valid = ? WHERE id = ?",
);

const finalizeJob = db.prepare(
  `UPDATE remediation_jobs
   SET status = 'complete', step = NULL, progress_pct = 100,
       output_path = ?, completed_at = ?, expires_at = ?
   WHERE id = ?`,
);

const failJob = db.prepare(
  `UPDATE remediation_jobs
   SET status = 'failed', step = NULL, failure_reason = ?, completed_at = ?
   WHERE id = ?`,
);

const expireJob = db.prepare(
  "UPDATE remediation_jobs SET status = 'expired', output_path = NULL WHERE id = ?",
);

const countRunningByEmail = db.prepare(
  "SELECT COUNT(*) AS n FROM remediation_jobs WHERE email = ? AND status IN ('pending','running')",
);

export interface CreateJobInput {
  email: string | null;
  inputFilename: string;
  contentHash: string;
  pageCount: number | null;
}

export interface CreatedJob {
  job: RemediationJob;
  downloadToken: string;
}

/**
 * Create a new pending job and return it alongside the one-time download
 * token (returned to the client; we only store the SHA-256 hash).
 */
export function createJob(input: CreateJobInput): CreatedJob {
  const id = randomUUID();
  const downloadToken = randomBytes(32).toString("base64url");
  const downloadTokenHash = createHash("sha256")
    .update(downloadToken)
    .digest("hex");
  const now = Date.now();
  // expires_at is set conservatively at creation time using the output
  // TTL; finalizeJob() refreshes it relative to completion time.
  const expiresAt = now + REMEDIATION.OUTPUT_TTL_MS;

  insertJob.run(
    id,
    input.email,
    input.inputFilename,
    input.contentHash,
    input.pageCount,
    downloadTokenHash,
    now,
    expiresAt,
  );

  const job = rowToJob(selectJobById.get(id) as JobRow);
  return { job, downloadToken };
}

export function getJob(id: string): RemediationJob | null {
  const row = selectJobById.get(id) as JobRow | undefined;
  return row ? rowToJob(row) : null;
}

export function setStep(
  id: string,
  step: RemediationStep,
  progressPct: number,
): void {
  updateStep.run(step, progressPct, id);
}

export function setRunning(id: string): void {
  updateStatus.run("running", 5, id);
}

export function setScores(
  id: string,
  inputScore: number,
  outputScore: number,
  outputValid: boolean,
): void {
  updateScores.run(inputScore, outputScore, outputValid ? 1 : 0, id);
}

export function setComplete(id: string, outputPath: string): void {
  const now = Date.now();
  finalizeJob.run(outputPath, now, now + REMEDIATION.OUTPUT_TTL_MS, id);
}

const setInputAuditStmt = db.prepare(
  "UPDATE remediation_jobs SET input_audit_json = ? WHERE id = ?",
);

const setOutputAuditStmt = db.prepare(
  "UPDATE remediation_jobs SET output_audit_json = ? WHERE id = ?",
);

/**
 * Persist the pre-flight audit categories (JSON) so the result page can
 * render category-level before/after without re-running the audit.
 */
export function setInputAudit(id: string, auditJson: string): void {
  setInputAuditStmt.run(auditJson, id);
}

/**
 * Persist the post-remediation audit categories (JSON). Called from the
 * worker once the output passes validation.
 */
export function setOutputAudit(id: string, auditJson: string): void {
  setOutputAuditStmt.run(auditJson, id);
}

export interface JobAuditPair {
  inputAudit: unknown | null;
  outputAudit: unknown | null;
}

const selectAuditPairStmt = db.prepare(
  "SELECT input_audit_json, output_audit_json FROM remediation_jobs WHERE id = ?",
);

export function getJobAuditPair(id: string): JobAuditPair {
  const row = selectAuditPairStmt.get(id) as
    | { input_audit_json: string | null; output_audit_json: string | null }
    | undefined;
  return {
    inputAudit: row?.input_audit_json
      ? JSON.parse(row.input_audit_json)
      : null,
    outputAudit: row?.output_audit_json
      ? JSON.parse(row.output_audit_json)
      : null,
  };
}

const setVeraStmt = db.prepare(
  `UPDATE remediation_jobs
   SET verapdf_available = ?, verapdf_passed = ?, verapdf_summary_json = ?
   WHERE id = ?`,
);

/** Persist a veraPDF verdict on the job row. */
export function setVeraPdfResult(
  id: string,
  available: boolean,
  passed: boolean,
  summaryJson: string,
): void {
  setVeraStmt.run(
    available ? 1 : 0,
    available ? (passed ? 1 : 0) : null,
    summaryJson,
    id,
  );
}

export interface JobVeraPdf {
  available: boolean | null;
  passed: boolean | null;
  summary: unknown | null;
}

const selectVeraStmt = db.prepare(
  "SELECT verapdf_available, verapdf_passed, verapdf_summary_json FROM remediation_jobs WHERE id = ?",
);

export function getJobVeraPdf(id: string): JobVeraPdf {
  const row = selectVeraStmt.get(id) as
    | {
        verapdf_available: number | null;
        verapdf_passed: number | null;
        verapdf_summary_json: string | null;
      }
    | undefined;
  if (!row) {
    return { available: null, passed: null, summary: null };
  }
  return {
    available:
      row.verapdf_available === null ? null : row.verapdf_available === 1,
    passed: row.verapdf_passed === null ? null : row.verapdf_passed === 1,
    summary: row.verapdf_summary_json
      ? JSON.parse(row.verapdf_summary_json)
      : null,
  };
}

export function setFailed(id: string, reason: string): void {
  failJob.run(reason, Date.now(), id);
}

export function setExpired(id: string): void {
  expireJob.run(id);
}

export function countActiveJobsForEmail(email: string): number {
  const row = countRunningByEmail.get(email) as { n: number };
  return row.n;
}

/**
 * Constant-time-ish compare a presented download token against the stored
 * hash. SHA-256 of the presented token is compared via Buffer equals which
 * is constant-time for equal-length inputs (always 32 bytes here).
 */
export function verifyDownloadToken(
  job: RemediationJob,
  presented: string,
): boolean {
  if (!job.downloadTokenHash) return false;
  const presentedHash = createHash("sha256").update(presented).digest();
  const storedHash = Buffer.from(job.downloadTokenHash, "hex");
  if (presentedHash.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < presentedHash.length; i++) {
    diff |= presentedHash[i] ^ storedHash[i];
  }
  return diff === 0;
}
