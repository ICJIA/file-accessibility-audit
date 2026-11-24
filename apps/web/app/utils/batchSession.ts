/**
 * Keeping a finished BATCH across a page load — the batch twin of
 * utils/auditSession.ts, and the same bargain.
 *
 * WHAT IS STORED, AND WHERE. sessionStorage: per tab, cleared by the browser
 * when the tab closes, never sent anywhere. The finished reports' JSON and
 * each file's name and size — the same kind of thing auditSession already
 * keeps for a single report, for the same reason (the server keeps nothing,
 * so this tab is the only place the reports exist). No file contents: the
 * File objects are freed as each audit finishes and were never storable.
 *
 * THE SIZE CHECK. A report is roughly 75–100 KB of JSON; a full batch can be
 * a few megabytes, and sessionStorage holds about five. A batch larger than
 * BATCH_SESSION_MAX_CHARS is NOT stored — saveBatchSession returns false and
 * the page warns before the tab is closed or reloaded instead. Every access
 * is wrapped: storage that throws (privacy modes, a full quota) degrades to
 * that same warning, never to a broken page.
 */
import type { SessionStore } from "./auditSession";

const KEY = "fa:batch-session:v1";

/** Above this many characters of JSON the batch is not stored. */
export const BATCH_SESSION_MAX_CHARS = 3_000_000;

export interface StoredBatchItem {
  id: string;
  filename: string;
  fileSize: number | null;
  status: "done" | "error" | "cancelled";
  result: Record<string, any> | null;
  error: { error: string; details?: string } | null;
}

export interface BatchSession {
  items: StoredBatchItem[];
  activeIndex: number;
  savedAt: number;
  appVersion: string;
}

function store(explicit?: SessionStore): SessionStore | null {
  if (explicit) return explicit;
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function clearBatchSession(s?: SessionStore): void {
  try {
    store(s)?.removeItem(KEY);
  } catch {
    /* nothing to clear, or storage is blocked */
  }
}

/** True when the batch is now in storage; false when it was too large or
 *  storage refused — the caller then warns before unload instead. */
export function saveBatchSession(session: BatchSession, s?: SessionStore): boolean {
  const st = store(s);
  if (!st) return false;
  let json: string;
  try {
    json = JSON.stringify(session);
  } catch {
    return false;
  }
  if (json.length > BATCH_SESSION_MAX_CHARS) {
    clearBatchSession(st);
    return false;
  }
  try {
    st.setItem(KEY, json);
    return true;
  } catch {
    // Quota. Do not leave a stale earlier batch behind in its place.
    clearBatchSession(st);
    return false;
  }
}

function validItem(v: unknown): v is StoredBatchItem {
  if (typeof v !== "object" || v === null) return false;
  const i = v as Record<string, unknown>;
  if (typeof i.id !== "string" || typeof i.filename !== "string") return false;
  if (i.status !== "done" && i.status !== "error" && i.status !== "cancelled") return false;
  if (i.fileSize !== null && typeof i.fileSize !== "number") return false;
  if (i.status === "done") {
    const r = i.result as Record<string, unknown> | null;
    return (
      typeof r === "object" &&
      r !== null &&
      typeof r.filename === "string" &&
      typeof r.grade === "string" &&
      Array.isArray(r.categories)
    );
  }
  if (i.status === "error") {
    const e = i.error as Record<string, unknown> | null;
    return typeof e === "object" && e !== null && typeof e.error === "string";
  }
  return true;
}

/**
 * Read a stored batch back, or null. Rejects — and clears — anything written
 * by a different app version (a stored report is a shape this build may no
 * longer understand), anything older than `ttlMs`, and anything that is not
 * exactly the shape saveBatchSession writes.
 */
export function readBatchSession(
  opts: { now: number; appVersion: string; ttlMs: number },
  s?: SessionStore,
): BatchSession | null {
  const st = store(s);
  if (!st) return null;
  let raw: string | null;
  try {
    raw = st.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let v: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) throw new Error("shape");
    v = parsed as Record<string, unknown>;
  } catch {
    clearBatchSession(st);
    return null;
  }
  const ok =
    v.appVersion === opts.appVersion &&
    typeof v.savedAt === "number" &&
    opts.now - v.savedAt <= opts.ttlMs &&
    Array.isArray(v.items) &&
    v.items.length > 1 &&
    v.items.every(validItem);
  if (!ok) {
    clearBatchSession(st);
    return null;
  }
  const items = v.items as StoredBatchItem[];
  const active = typeof v.activeIndex === "number" ? Math.floor(v.activeIndex) : 0;
  return {
    items,
    activeIndex: active >= 0 && active < items.length ? active : 0,
    savedAt: v.savedAt as number,
    appVersion: opts.appVersion,
  };
}
