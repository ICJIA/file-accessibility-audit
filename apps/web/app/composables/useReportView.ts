/**
 * Visual/Detailed report view. Always starts on **Visual** — the stepper — for
 * everyone, every time.
 *
 * This used to persist to localStorage per device, so anyone who once opened
 * the Detailed view got it for every report thereafter. That surfaced as
 * "the stepper is gone": a reader who had toggled to Detailed days earlier
 * met the technical view on a fresh report, and since the Detailed view has
 * never contained the action plan, the plan appeared to have been deleted.
 *
 * The default carries the product's whole intent — the stepper is the view
 * written for non-technical document authors, and it is what should greet
 * anyone opening a report, including people who prefer the detailed view and
 * know exactly where the toggle is. A sticky preference silently opts a
 * reader out of the thing the report is for, and the cost of being wrong is
 * asymmetric: showing the stepper to someone who wanted detail costs one
 * click, while hiding it from someone who needed it costs them the guidance.
 *
 * The toggle still works — it just applies to the report in front of you
 * rather than to every report you will ever open.
 */
import { onMounted, ref, type Ref } from "vue";

export type ReportViewMode = "visual" | "detailed";

/** The key this preference used to be stored under. Read by nothing now; it
 *  is cleared on mount so a stale "detailed" from before this change cannot
 *  linger on someone's device, and so the app stops owning a piece of browser
 *  storage it no longer uses. */
const LEGACY_STORAGE_KEY = "far:report-view";

export function useReportView(): {
  mode: Ref<ReportViewMode>;
  setMode: (m: ReportViewMode) => void;
} {
  const mode = ref<ReportViewMode>("visual");

  onMounted(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* private browsing / storage disabled — nothing to clean up */
    }
  });

  function setMode(m: ReportViewMode): void {
    mode.value = m;
  }

  return { mode, setMode };
}
