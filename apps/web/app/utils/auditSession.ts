/**
 * Remembering an audit across a page load (v1.147.0).
 *
 * WHY THIS EXISTS. The audit itself already survives — POST /api/analyze-job
 * runs it on the server and holds the job for ANALYZE_JOB.TTL_MS whether or
 * not a browser is watching. What did not survive was the browser's memory of
 * WHICH job was running: the id and token lived in refs in pages/index.vue, so
 * clicking the footer's "Status" link (a Nitro route, therefore a real page
 * load) threw them away and the visitor had to upload the file again. This
 * module is the ~200 bytes of persistence that closes that gap.
 *
 * WHAT IS STORED, AND WHERE. sessionStorage, per tab, cleared by the browser
 * when the tab closes. Two shapes: a RUNNING audit (job id, bearer token,
 * filename) and a FINISHED one (the report JSON, ~75-100 KB on real agency
 * documents). Nothing is sent anywhere — the server's own posture is
 * unchanged, and it still deletes a finished job the moment a page collects
 * it. The filename is the visitor's own, and it never leaves their browser.
 *
 * EVERY ACCESS IS GUARDED. sessionStorage throws outright in some privacy
 * modes, and setItem throws when the quota is full — a report from a very
 * large document could exceed what a nearly-full origin can take. A failure
 * to persist must never break an audit that is otherwise working, so every
 * operation is wrapped and every read validates the shape it gets back.
 * Losing the session degrades to exactly today's behaviour.
 */
import type { AnalysisResult } from "@file-audit/shared";

const KEY = "fa:audit-session:v1";

export type SessionFileType = "pdf" | "docx" | "pptx" | "xlsx" | null;

export interface RunningAuditSession {
  kind: "running";
  jobId: string;
  token: string;
  filename: string;
  fileType: SessionFileType;
  /** Epoch ms the job was CREATED — the server sweeps from that moment. */
  startedAt: number;
  appVersion: string;
}

export interface FinishedAuditSession {
  kind: "result";
  result: AnalysisResult;
  filename: string;
  savedAt: number;
  appVersion: string;
}

export type AuditSession = RunningAuditSession | FinishedAuditSession;

/** The storage this module uses. Injectable so tests need no jsdom globals,
 *  and so a throwing accessor is a normal case rather than a crash. */
export type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(explicit?: SessionStore): SessionStore | null {
  if (explicit) return explicit;
  try {
    // Reading the property itself can throw when site data is blocked.
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function clearAuditSession(s?: SessionStore): void {
  const st = store(s);
  if (!st) return;
  try {
    st.removeItem(KEY);
  } catch {
    /* nothing to do — the session simply will not be restored */
  }
}

function write(value: AuditSession, s?: SessionStore): boolean {
  const st = store(s);
  if (!st) return false;
  try {
    st.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    // Quota, or storage disabled mid-session. Leave nothing half-written: a
    // stale RUNNING entry beside a finished audit would offer to resume a job
    // that is already gone.
    clearAuditSession(st);
    return false;
  }
}

export function saveRunningAudit(
  job: Omit<RunningAuditSession, "kind">,
  s?: SessionStore,
): boolean {
  return write({ kind: "running", ...job }, s);
}

export function saveFinishedAudit(
  finished: Omit<FinishedAuditSession, "kind">,
  s?: SessionStore,
): boolean {
  return write({ kind: "result", ...finished }, s);
}

/**
 * Read back a session, or null when there is nothing usable.
 *
 * Rejects — and clears — anything that cannot be trusted to render:
 *   · a payload written by a different app version (a deploy can land
 *     mid-session, and a stored result is a shape this build may no longer
 *     understand; the report is not worth a broken page)
 *   · a RUNNING job older than the server's own TTL, which would resume
 *     straight into a 404
 *   · anything that is not one of the two shapes above
 */
export function readAuditSession(
  opts: { now: number; appVersion: string; ttlMs: number },
  s?: SessionStore,
): AuditSession | null {
  const st = store(s);
  if (!st) return null;
  let raw: string | null;
  try {
    raw = st.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearAuditSession(st);
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    clearAuditSession(st);
    return null;
  }
  // Deliberately a loose record, not `Partial<Running & Finished>`: the two
  // `kind` literals intersect to `never`, which makes every field unreadable.
  const v = parsed as Record<string, unknown>;

  if (v.appVersion !== opts.appVersion) {
    clearAuditSession(st);
    return null;
  }

  if (v.kind === "running") {
    const { jobId, token, filename, startedAt } = v;
    const ok =
      typeof jobId === "string" &&
      jobId.length > 0 &&
      typeof token === "string" &&
      token.length > 0 &&
      typeof filename === "string" &&
      typeof startedAt === "number" &&
      Number.isFinite(startedAt);
    if (!ok || opts.now - (startedAt as number) > opts.ttlMs) {
      clearAuditSession(st);
      return null;
    }
    return {
      kind: "running",
      jobId: jobId as string,
      token: token as string,
      filename: filename as string,
      fileType: (v.fileType ?? null) as SessionFileType,
      startedAt: startedAt as number,
      appVersion: opts.appVersion,
    };
  }

  if (v.kind === "result") {
    const { result, filename, savedAt } = v;
    const ok =
      typeof result === "object" &&
      result !== null &&
      typeof filename === "string" &&
      typeof savedAt === "number" &&
      Number.isFinite(savedAt);
    if (!ok) {
      clearAuditSession(st);
      return null;
    }
    return {
      kind: "result",
      result: result as AnalysisResult,
      filename: filename as string,
      savedAt: savedAt as number,
      appVersion: opts.appVersion,
    };
  }

  clearAuditSession(st);
  return null;
}
