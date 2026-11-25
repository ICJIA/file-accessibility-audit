/**
 * A document handed over by its web address.
 *
 * The site has NO field for typing a link (removed 2026-11-25, owner
 * decision; it existed for two days and accepted any public address for
 * one). What remains is `?prefill=<url>`, which ICJIA's own tools use to
 * open a document here, and it is honoured only for a host on the approved
 * list (audit.config.ts URL_FETCH.APPROVED_HOSTS). The server enforces the
 * same list (apps/api/src/services/urlPolicy.ts); nothing here is the
 * security control — it decides what the page says and whether a request is
 * made at all.
 */
import { describeAnalysisError } from "./analyzeJob";
import { URL_FETCH } from "../../../../audit.config";

/** What the page shows for a link it will not run. */
export const LINKS_NOT_ACCEPTED = {
  error: "This tool checks uploaded files, not links.",
  details: "Download the document to your computer or phone, then drop it in the upload box.",
} as const;

/**
 * Turn a failed link check into words a person can act on. A server refusal
 * of the address itself ("URL not allowed …") becomes the same sentence the
 * page uses for a link it would not send; everything else goes through the
 * describer uploads use.
 */
export function describeUrlAuditError(err: unknown): { error: string; details?: string } {
  const data = (err as { data?: unknown } | null | undefined)?.data;
  if (data && typeof data === "object") {
    const { error } = data as { error?: unknown };
    if (typeof error === "string" && /^URL (not allowed|resolves to)/i.test(error)) {
      return { ...LINKS_NOT_ACCEPTED };
    }
  }
  return describeAnalysisError(err);
}

/**
 * Is this address on the approved list? Decides whether a link that arrived
 * as `?prefill=` is run. https only, standard port only, exact host or a
 * subdomain. A deployment's own additions (the ANALYZE_URL_ALLOWED_HOSTS
 * environment variable) are not known here; such a link is simply not run,
 * which is the safe way to be wrong.
 */
export function isApprovedHost(rawUrl: string): boolean {
  let host: string;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    if (parsed.port !== "" && parsed.port !== "443") return false;
    if (parsed.username || parsed.password) return false;
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
