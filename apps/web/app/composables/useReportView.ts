/**
 * Visual/Detailed report view preference. Per-device (localStorage), default
 * "visual" — shared-report recipients are mostly non-technical. SSR renders
 * the default; the stored preference applies on mount (the brief flicker for
 * detailed-preference users is an accepted trade-off — see the spec's
 * "View toggle and data parity" section).
 */
import { onMounted, ref, type Ref } from "vue";

export type ReportViewMode = "visual" | "detailed";

const STORAGE_KEY = "far:report-view";

export function useReportView(): {
  mode: Ref<ReportViewMode>;
  setMode: (m: ReportViewMode) => void;
} {
  const mode = ref<ReportViewMode>("visual");

  onMounted(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "visual" || stored === "detailed") mode.value = stored;
    } catch {
      /* private browsing / storage disabled — keep default */
    }
  });

  function setMode(m: ReportViewMode): void {
    mode.value = m;
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* private browsing / storage disabled — preference just won't persist */
    }
  }

  return { mode, setMode };
}
