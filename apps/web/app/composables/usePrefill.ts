/**
 * usePrefill — reads ?prefill=<url> from the page's query string on mount
 * and hands the address to the page, which audits it exactly as it audits an
 * address typed into the "check a document by link" field.
 *
 * Designed to be called once from pages/index.vue's <script setup>.
 *
 * WHAT CHANGED (2026-11-24). This used to make the request itself, with no
 * abort signal and no idea who owned the page:
 *   - a reset mid-request left the processing overlay up, and the answer
 *     still landed on the page the visitor had just cleared;
 *   - the param stayed in the address bar, so a reload ran it again and it
 *     overrode a later upload's saved report.
 * Now the composable only READS the param and removes it from the address
 * (router.replace — no new history entry); the page runs the audit under the
 * same ownership/abort model as an upload.
 *
 * @param opts.onUrl    called with the decoded address — start the audit
 * @param opts.onError  called with { error, details? } when the param is unusable
 */
import { useRouter } from "#app";
import { queryWithoutPrefill, readPrefillParam } from "~/utils/urlAudit";

export interface PrefillError {
  error: string;
  details?: string;
}

export interface PrefillCallbacks {
  onUrl: (url: string) => void | Promise<void>;
  onError: (err: PrefillError) => void;
}

export function usePrefill(callbacks: PrefillCallbacks): void {
  // Only run client-side (Nuxt SSR guard)
  if (import.meta.server) return;

  const router = useRouter();

  onMounted(() => {
    const search = window.location.search;
    const read = readPrefillParam(search);
    if (read.kind === "none") return;

    // Remove the param FIRST, whatever happens next: it is an instruction to
    // run once, not a setting. Left in place, a reload repeated the audit and
    // took the page back from a report the visitor had made since.
    // `replace`, so Back does not return to an address that re-runs it.
    void Promise.resolve(
      router.replace({ path: window.location.pathname, query: queryWithoutPrefill(search) }),
    ).catch(() => {
      /* navigation refused — the audit still runs */
    });

    if (read.kind === "invalid") {
      callbacks.onError({ error: "Invalid prefill URL (could not decode)." });
      return;
    }
    void callbacks.onUrl(read.url);
  });
}
