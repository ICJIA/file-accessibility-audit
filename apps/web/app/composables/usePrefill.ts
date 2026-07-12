/**
 * usePrefill — reads ?prefill=<url> from the page's query string on mount
 * and fires POST /api/analyze-url so the analysis starts automatically.
 *
 * Designed to be called once from pages/index.vue's <script setup>.
 *
 * @param opts.onStart   called before the request — show the processing UI
 * @param opts.onResult  called with the successful AnalysisResult JSON
 * @param opts.onError   called with { error, details? } on any failure
 * @param opts.onDone    called in finally — hide the processing UI
 */
import type { AnalysisResult } from "@file-audit/shared";

export interface PrefillError {
  error: string;
  details?: string;
}

export interface PrefillCallbacks {
  onStart: (url: string) => void;
  onResult: (result: AnalysisResult) => void;
  onError: (err: PrefillError) => void;
  onDone: () => void;
}

export function usePrefill(callbacks: PrefillCallbacks): void {
  // Only run client-side (Nuxt SSR guard)
  if (import.meta.server) return;

  onMounted(async () => {
    const params = new URLSearchParams(window.location.search);
    const rawUrl = params.get("prefill");
    if (!rawUrl) return;

    // Decode in case the URL was percent-encoded (the normal case from filecap
    // audit links, e.g. ?prefill=https%3A%2F%2Fexample.com%2Freport.pdf)
    let url: string;
    try {
      url = decodeURIComponent(rawUrl);
    } catch {
      callbacks.onError({ error: "Invalid prefill URL (could not decode)." });
      return;
    }

    callbacks.onStart(url);
    try {
      const result = await $fetch<AnalysisResult>("/api/analyze-url", {
        method: "POST",
        body: { url },
        credentials: "include",
      });
      callbacks.onResult(result);
    } catch (err: any) {
      if (err?.status === 401) {
        // Let the auth middleware redirect handle this — navigateTo is a
        // Nuxt auto-import and will route to /login.
        navigateTo("/login");
        return;
      }
      callbacks.onError(
        err?.data ?? { error: "Could not analyze the prefill URL. Please try again." },
      );
    } finally {
      callbacks.onDone();
    }
  });
}
