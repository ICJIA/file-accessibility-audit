/**
 * The remediated PDF's single-use download (review 2026-11-12).
 *
 * The API deletes the file the moment a download begins and marks the job
 * `expired` (routes/remediate.ts). That was never said on the page, and the
 * button was a plain link, so:
 *   · a second click navigated the tab to a raw `410 {"error": …}` response;
 *   · after a reload every before/after section vanished (they were gated on
 *     `complete`) under a message blaming "the retention window".
 *
 * This module holds the parts that can be tested without mounting the page:
 * what state the download is in, and the fetch that turns a failure into a
 * sentence instead of a JSON page.
 */

export type DownloadAvailability =
  /** The file is on the server and has not been fetched. */
  | "ready"
  /** It was downloaded (here, or before a reload) — the server copy is gone. */
  | "downloaded"
  /** It was never downloaded and has been deleted by the retention sweep. */
  | "expired"
  /** Job not finished, failed, or unknown. */
  | "not-ready";

interface EventLike {
  event?: unknown;
}

/** The receipt's lifecycle log records a `downloaded` event — that is what
 *  tells "you already took it" apart from "it timed out" after a reload. */
export function receiptShowsDownload(events: unknown): boolean {
  return Array.isArray(events) && events.some((e) => (e as EventLike)?.event === "downloaded");
}

export function downloadAvailability(input: {
  status: string | null | undefined;
  events?: unknown;
  /** This tab completed a download in this session. */
  downloadedHere?: boolean;
}): DownloadAvailability {
  const downloaded = input.downloadedHere === true || receiptShowsDownload(input.events);
  if (input.status === "complete") return downloaded ? "downloaded" : "ready";
  if (input.status === "expired") return downloaded ? "downloaded" : "expired";
  return "not-ready";
}

/** The filename the server chose (RFC 6266: `filename*` wins over `filename`). */
export function filenameFromContentDisposition(
  header: string | null | undefined,
  fallback: string,
): string {
  if (!header) return fallback;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star) {
    try {
      const decoded = decodeURIComponent(star[1]!.trim());
      if (decoded) return decoded;
    } catch {
      /* malformed percent-encoding — fall through to the plain form */
    }
  }
  const plain =
    /filename\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(header) ?? /filename\s*=\s*([^;]+)/.exec(header);
  const name = plain?.[1]?.replace(/\\(.)/g, "$1").trim();
  return name || fallback;
}

export type RemediatedPdfResult =
  | { ok: true; blob: Blob; filename: string }
  | {
      ok: false;
      message: string;
      /** The server says the file no longer exists (410) — retrying is useless. */
      gone: boolean;
    };

export const DOWNLOAD_GONE_MESSAGE =
  "This file is no longer on the server. It can be downloaded once, and it is deleted as soon as a download starts or its time on the server runs out. To get another copy, audit your PDF again and rerun the remediation.";

function failureMessage(status: number | null): string {
  if (status === 410) return DOWNLOAD_GONE_MESSAGE;
  if (status === 403) {
    return "This download link is not valid for this file. Return to the audit page and run the remediation again.";
  }
  if (status === 404) {
    return "This remediation job could not be found. Return to the audit page and run the remediation again.";
  }
  if (status === 409) {
    return "The remediated file is not ready yet. Wait for the remediation to finish, then try again.";
  }
  if (status === 429) {
    return "Too many requests from this network right now. Wait a minute, then try the download again.";
  }
  return "The download did not start. Check your connection and try again. If this page then says the file has been deleted, run the remediation again.";
}

/**
 * Fetch the remediated PDF as a Blob. Never throws: every failure comes back
 * as a message the page shows in place, where the old link sent the whole tab
 * to the API's JSON error.
 */
export async function fetchRemediatedPdf(
  url: string,
  fallbackName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RemediatedPdfResult> {
  let response: Response;
  try {
    response = await fetchImpl(url, { credentials: "include" });
  } catch {
    return { ok: false, message: failureMessage(null), gone: false };
  }
  if (!response.ok) {
    return { ok: false, message: failureMessage(response.status), gone: response.status === 410 };
  }
  try {
    const blob = await response.blob();
    return {
      ok: true,
      blob,
      filename: filenameFromContentDisposition(
        response.headers.get("content-disposition"),
        fallbackName,
      ),
    };
  } catch {
    // The server had already begun sending — and so already deleted its copy.
    return {
      ok: false,
      gone: true,
      message:
        "The download was interrupted before it finished, and the server has already deleted its copy. Audit your PDF again and rerun the remediation to get the file.",
    };
  }
}

const FLAG_PREFIX = "fa:remediation-downloaded:";

/** Remember, for this tab only, that this job's file was downloaded. Every
 *  storage access is guarded — it is a convenience, never a requirement. */
export function rememberDownloaded(jobId: string): void {
  try {
    sessionStorage.setItem(FLAG_PREFIX + jobId, "1");
  } catch {
    /* storage unavailable — the receipt's own event log still says so */
  }
}

export function wasDownloadedInThisTab(jobId: string): boolean {
  try {
    return sessionStorage.getItem(FLAG_PREFIX + jobId) === "1";
  } catch {
    return false;
  }
}
