/**
 * Checking a document by its web address ("…or check a document by link").
 *
 * The server does the real work and the real policing: POST /api/analyze-url
 * fetches the document itself, from any public https address (v1.180.0 —
 * before that, only an approved list of government sites). It refuses
 * private addresses and non-standard ports, and gives link checks to sites
 * off the approved list a small hourly budget of their own
 * (apps/api/src/services/urlPolicy.ts, RATE_LIMITS.urlAnyHost). Nothing here is a
 * security control — it exists so a person gets a clear sentence before a
 * request is sent, and a clear sentence when the server says no.
 */
import { describeAnalysisError } from "./analyzeJob";
import { URL_FETCH } from "../../../../audit.config";

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

/** What the page shows when the server refuses a host. Since v1.180.0 the
 *  home-page form no longer meets this for a public site; it remains for an
 *  older server and for the endpoints that still keep the approved list. */
export const URL_HOST_NOT_APPROVED = {
  error: "That site cannot be checked by link.",
  details:
    "Uploading the file always works: download the document to your computer, then drop it in the upload box.",
} as const;

/** What the page shows when a visitor has used up the hour's link checks. */
export const URL_LINK_LIMIT_REACHED = {
  error: "You have reached this hour's limit for checking documents by link.",
  details:
    "Uploading has no such limit: download the document to your device, then drop it in the upload box. Or try the link again in an hour.",
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
    // The hourly budget for link checks to sites off the approved list
    // (v1.180.0). The general 429 sentence says "wait a minute", which is
    // wrong for an hourly limit — and there is a way forward right now.
    if (typeof error === "string" && /^Link check limit reached\./i.test(error)) {
      return { ...URL_LINK_LIMIT_REACHED };
    }
    // The other link-check refusals (one at a time; the checker is busy; a
    // ceiling for everyone or for one website). The server's sentence is
    // written for a person and already names the way forward — show it.
    if (
      typeof error === "string" &&
      /^(Link check limit reached|The link checker (is busy|has reached))/i.test(error)
    ) {
      return { error: "That link cannot be checked right now.", details: error };
    }
    if (typeof error === "string" && /^URL not allowed/i.test(error)) {
      const why = typeof details === "string" ? details : "";
      if (/allowlist/i.test(why) || !why) return { ...URL_HOST_NOT_APPROVED };
      // Refused for another reason (a private address, an odd port, a bad
      // scheme): still not something uploading cannot solve.
      return {
        error: "That address cannot be checked by link.",
        details:
          "The link has to be a public https address — not one on a private network, and not one with an unusual port number. Uploading the file always works.",
      };
    }
  }
  return describeAnalysisError(err);
}

/**
 * Is this address on the approved list (audit.config.ts
 * URL_FETCH.APPROVED_HOSTS)? Used for ONE thing: deciding whether a link that
 * arrived as `?prefill=` may start by itself. A deployment's own additions
 * (the ANALYZE_URL_ALLOWED_HOSTS environment variable) are not known here;
 * those links simply wait for a press of the button, which is the safe way
 * to be wrong.
 */
export function isApprovedHost(rawUrl: string): boolean {
  let host: string;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (parsed.port !== "" && parsed.port !== "80" && parsed.port !== "443") return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  return URL_FETCH.APPROVED_HOSTS.some((ah) => host === ah || host.endsWith("." + ah));
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
