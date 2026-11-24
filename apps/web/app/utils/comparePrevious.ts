/**
 * The EARLIER report of a re-check, kept for this tab — so a reload of a
 * "this is a re-check of report.pdf" page still shows the comparison.
 *
 * Same bargain as utils/auditSession.ts, and the same kind of data: one
 * report's JSON in sessionStorage, per tab, never sent anywhere, cleared by
 * the browser when the tab closes and by the page on Reset. Guarded
 * throughout; a refused write only means the comparison does not survive a
 * reload.
 */
import type { SessionStore } from "./auditSession";

const KEY = "fa:audit-previous:v1";
/** A single report is ~75–100 KB; refuse anything wildly larger. */
export const PREVIOUS_MAX_CHARS = 1_000_000;

function store(explicit?: SessionStore): SessionStore | null {
  if (explicit) return explicit;
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function clearPreviousResult(s?: SessionStore): void {
  try {
    store(s)?.removeItem(KEY);
  } catch {
    /* blocked storage */
  }
}

export function savePreviousResult(
  entry: { result: Record<string, any>; appVersion: string },
  s?: SessionStore,
): boolean {
  const st = store(s);
  if (!st) return false;
  try {
    const json = JSON.stringify(entry);
    if (json.length > PREVIOUS_MAX_CHARS) {
      clearPreviousResult(st);
      return false;
    }
    st.setItem(KEY, json);
    return true;
  } catch {
    clearPreviousResult(st);
    return false;
  }
}

export function readPreviousResult(
  opts: { appVersion: string },
  s?: SessionStore,
): Record<string, any> | null {
  const st = store(s);
  if (!st) return null;
  try {
    const raw = st.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { result?: unknown; appVersion?: unknown };
    const r = v?.result as Record<string, any> | undefined;
    const ok =
      v?.appVersion === opts.appVersion &&
      !!r &&
      typeof r === "object" &&
      typeof r.filename === "string" &&
      Array.isArray(r.categories);
    if (!ok) {
      clearPreviousResult(st);
      return null;
    }
    return r!;
  } catch {
    clearPreviousResult(st);
    return null;
  }
}
