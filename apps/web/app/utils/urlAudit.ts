/**
 * Checking a document by its web address ("…or check a document by link").
 *
 * The server does the real work and the real policing: POST /api/analyze-url
 * fetches the document itself, and will only fetch from an approved list of
 * government sites (apps/api/src/services/urlPolicy.ts). Nothing here is a
 * security control — it exists so a person gets a clear sentence before a
 * request is sent, and a clear sentence when the server says no.
 */
import { describeAnalysisError } from "./analyzeJob";

/** Longest address the field accepts. Far above any real document link, far
 *  below anything a server would treat as abuse. */
export const DOCUMENT_URL_MAX_LENGTH = 2000;

export type UrlValidation = { ok: true; url: string } | { ok: false; message: string };

/**
 * Is this something worth sending? An https address with a real host name,
 * of sensible length. Deliberately NOT a check of the file extension: plenty
 * of real document links end in an id, not ".pdf", and the server decides
 * the type from the file's own contents.
 */
export function validateDocumentUrl(raw: unknown): UrlValidation {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) {
    return { ok: false, message: "Enter the web address of a document, starting with https://" };
  }
  if (text.length > DOCUMENT_URL_MAX_LENGTH) {
    return {
      ok: false,
      message: `That address is too long (more than ${DOCUMENT_URL_MAX_LENGTH} characters). Download the document and upload it instead.`,
    };
  }
  if (/\s/.test(text)) {
    return { ok: false, message: "A web address cannot contain spaces. Check it and try again." };
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return {
      ok: false,
      message: "That does not look like a web address. It should start with https://",
    };
  }
  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      message: "The address must start with https:// (a secure link).",
    };
  }
  if (!parsed.hostname.includes(".") || parsed.username || parsed.password) {
    return {
      ok: false,
      message: "That does not look like a public web address. Check it and try again.",
    };
  }
  return { ok: true, url: parsed.toString() };
}

/** What the page shows when the server refuses a host. */
export const URL_HOST_NOT_APPROVED = {
  error: "That site cannot be checked by link.",
  details:
    "Only approved government sites can be checked by link. Uploading the file always works: download the document to your computer, then drop it in the upload box.",
} as const;

/**
 * Turn a failed link check into words a person can act on. The server's
 * refusal for a host that is not approved reads "URL not allowed — host 'x'
 * is not in the allowlist. Allowed: …", which is accurate and no help to
 * someone who has never heard of an allowlist. Everything else goes through
 * the same describer uploads use.
 */
export function describeUrlAuditError(err: unknown): { error: string; details?: string } {
  const data = (err as { data?: unknown } | null | undefined)?.data;
  if (data && typeof data === "object") {
    const { error, details } = data as { error?: unknown; details?: unknown };
    if (typeof error === "string" && /^URL not allowed/i.test(error)) {
      const why = typeof details === "string" ? details : "";
      if (/allowlist/i.test(why) || !why) return { ...URL_HOST_NOT_APPROVED };
      // Refused for another reason (a private address, an odd port, a bad
      // scheme): still not something uploading cannot solve.
      return {
        error: "That address cannot be checked by link.",
        details:
          "The link has to be a public https address on an approved government site. Uploading the file always works.",
      };
    }
  }
  return describeAnalysisError(err);
}

export type PrefillRead = { kind: "none" } | { kind: "url"; url: string } | { kind: "invalid" };

/**
 * Read `?prefill=<url>` from a query string. `URLSearchParams` has already
 * percent-decoded the value once; links built by other tools are sometimes
 * encoded twice, so one further decode is attempted and a failure to decode
 * is reported rather than sent to the server as nonsense.
 */
export function readPrefillParam(search: string): PrefillRead {
  const raw = new URLSearchParams(search).get("prefill");
  if (!raw) return { kind: "none" };
  try {
    return { kind: "url", url: decodeURIComponent(raw) };
  } catch {
    return { kind: "invalid" };
  }
}

/** The same query string without `prefill`, as a plain object for the router. */
export function queryWithoutPrefill(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(search)) if (k !== "prefill") out[k] = v;
  return out;
}
