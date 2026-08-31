<template>
  <div class="flex flex-col items-center justify-center min-h-[50vh] space-y-6">
    <!-- The document being analysed, ABOVE the spinner and in the heading
         colour (user request 2026-08-31). A person who queued a file, switched
         tabs and came back had no way to tell WHICH document this spinner
         belonged to — "Analyzing your document" is true of any of them. The
         name is the one thing that identifies it.

         Rendered as text through Vue's interpolation, never v-html: a filename
         is user-supplied and arrives from a file picker, so it is exactly the
         string an attacker controls. `break-all` because filenames run long
         and carry no spaces to wrap on. -->
    <p
      v-if="filename"
      data-testid="overlay-filename"
      class="max-w-xl px-4 text-center text-base sm:text-lg font-semibold text-[var(--text-heading)] break-all"
      :title="filename"
    >
      {{ filename }}
    </p>

    <div class="relative">
      <div
        class="w-16 h-16 border-4 border-[var(--border)] border-t-green-500 rounded-full animate-spin"
      />
    </div>

    <div class="text-center space-y-2 max-w-md px-4">
      <p class="text-lg font-medium text-[var(--text-heading)]">Analyzing your document</p>

      <!-- v1.100.0 (user request): REAL per-pass rows, driven by the job
           endpoints' observed step states — pending, running (with its own
           elapsed), done. Never a percentage: the JVM passes expose none.
           Skipped steps (non-PDF, WCAG pass disabled) never render. -->
      <template v-if="steps && steps.length">
        <ul class="text-left inline-block space-y-1.5" data-testid="overlay-steps">
          <li
            v-for="s in visibleSteps"
            :key="s.key"
            class="flex items-center gap-2 text-sm"
            :data-step-state="s.state"
          >
            <span
              class="inline-flex w-5 h-5 items-center justify-center rounded-full flex-shrink-0 text-[11px]"
              :class="
                s.state === 'done'
                  ? 'bg-emerald-700/40 text-emerald-200'
                  : s.state === 'running'
                    ? 'border border-sky-500/50 text-sky-300'
                    : 'border border-[var(--border)] text-[var(--text-muted)]'
              "
              aria-hidden="true"
            >
              <span v-if="s.state === 'done'">✓</span>
              <span v-else-if="s.state === 'running'" class="animate-pulse">●</span>
              <span v-else>○</span>
            </span>
            <span
              :class="
                s.state === 'pending' ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
              "
              >{{ s.label
              }}<span
                v-if="s.state === 'running' && s.runningSeconds !== null"
                class="text-[var(--text-muted)]"
              >
                ({{ s.runningSeconds }}s)</span
              ></span
            >
          </li>
        </ul>
        <p
          class="text-xs text-[var(--text-muted)]"
          aria-hidden="true"
          data-testid="overlay-elapsed"
        >
          {{ elapsedSeconds }}s elapsed — states above are the server's real progress.
        </p>
        <p
          v-if="reassurance"
          class="text-xs text-[var(--text-secondary)] leading-relaxed"
          aria-hidden="true"
          data-testid="overlay-reassurance"
        >
          {{ reassurance }}
        </p>
        <p class="sr-only" role="status" aria-live="polite" data-testid="overlay-live-region">
          {{ liveAnnouncement }}
        </p>
      </template>

      <!-- Legacy mode: an explicit stage string (the URL-audit path still
           narrates its own real milestones: fetching, building). -->
      <p
        v-else-if="!rotate"
        class="text-sm text-[var(--text-muted)]"
        role="status"
        aria-live="polite"
        data-testid="overlay-static-stage"
      >
        {{ stage }}
      </p>

      <!-- v1.99.0 (user request): the rotating check queue, so a 30-second
           audit never looks stuck. HONESTY SHAPE: the server runs these
           checks in parallel and reports nothing back until it's done, so no
           precise "now on step N" claim is possible — the list therefore
           CYCLES through the real checks under a headline that says they run
           together, and it never fakes completion of any of them. -->
      <template v-else>
        <p
          class="text-sm text-[var(--text-muted)]"
          aria-hidden="true"
          data-testid="overlay-rotating-stage"
        >
          {{ currentLine }}
        </p>
        <p
          class="text-xs text-[var(--text-muted)]"
          aria-hidden="true"
          data-testid="overlay-elapsed"
        >
          {{ elapsedSeconds }}s elapsed — the checks above run together on the server.
        </p>
        <p
          v-if="reassurance"
          class="text-xs text-[var(--text-secondary)] leading-relaxed"
          aria-hidden="true"
          data-testid="overlay-reassurance"
        >
          {{ reassurance }}
        </p>
        <!-- Sparse live region for assistive tech: announcing a 2.5-second
             rotation would be noise, so screen readers get an update on a
             ~15-second cadence instead — same facts, humane rate. -->
        <p class="sr-only" role="status" aria-live="polite" data-testid="overlay-live-region">
          {{ liveAnnouncement }}
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

export interface OverlayStep {
  key: string;
  label: string;
  state: "pending" | "running" | "done" | "skipped";
  startedAt?: number;
}

const props = defineProps<{
  /** Legacy explicit stage line (URL audits narrate real milestones). */
  stage: string;
  /** Turn on the rotating check queue (single-file uploads). */
  rotate?: boolean;
  /** Steers which check list rotates; null/undefined → the generic list. */
  fileType?: "pdf" | "docx" | "pptx" | "xlsx" | null;
  /** v1.100.0: REAL observed step states from the job endpoints. When
   *  present, replaces the rotating queue. */
  steps?: OverlayStep[] | null;
  /** The document being analysed, shown above the spinner. Absent for URL
   *  audits, which have no file — the line then does not render at all. */
  filename?: string | null;
}>();

// The REAL checks, per pipeline. Wording matches the report's own category
// and panel names so the queue teaches the product while it reassures.
const PDF_LINES = [
  "Uploading and validating the file…",
  "Reading the PDF's internal structure (qpdf)…",
  "Extracting text and metadata from every page (pdf.js)…",
  "Checking headings, reading order, and tags…",
  "Checking images and alt text…",
  "Checking tables, links, and bookmarks…",
  "Running veraPDF (pass 1 of 2, both run together): PDF/UA conformance…",
  "Running veraPDF (pass 2 of 2, both run together): WCAG 2.2 machine checks…",
  "Scoring the categories and building the report…",
];
const OFFICE_LINES = [
  "Uploading and validating the file…",
  "Unzipping the document package (OOXML)…",
  "Reading the document's structure…",
  "Checking headings, titles, and names…",
  "Checking images and alt text…",
  "Checking tables and links…",
  "Resolving colors and checking contrast…",
  "Scoring the categories and building the report…",
];
const lines = computed(() =>
  props.fileType && props.fileType !== "pdf" ? OFFICE_LINES : PDF_LINES,
);

const visibleSteps = computed(() =>
  (props.steps ?? [])
    .filter((s) => s.state !== "skipped")
    .map((s) => ({
      ...s,
      runningSeconds:
        s.state === "running" && s.startedAt
          ? Math.max(0, Math.round((nowMs.value - s.startedAt) / 1000))
          : null,
    })),
);

const ROTATE_MS = 2_500;
const idx = ref(0);
const elapsedSeconds = ref(0);
const currentLine = computed(() => lines.value[idx.value % lines.value.length]!);

// Escalating, truthful reassurance — thresholds tuned to real timings (a
// complex InDesign PDF measured ~26 s in production; the veraPDF passes are
// the slow part and are hard-timeout-bounded server-side). The stated ceiling
// tracks ANALYSIS.PDFJS_TIMEOUT_MS, which is two minutes — pinned by
// ProcessingOverlay.test.ts so the promise cannot outlive the budget.
const reassurance = computed(() => {
  if (elapsedSeconds.value >= 60)
    return "Still working. The server enforces hard timeouts on every step, so this will finish or fail with a clear message — it never hangs forever.";
  if (elapsedSeconds.value >= 15)
    return "Large or design-heavy PDFs (InDesign exports, many images) can take up to two minutes — the two veraPDF engine passes run one after the other and are the slow part.";
  return "";
});

// Screen-reader announcements on a sparse cadence (0s, then every ~15s).
const liveAnnouncement = ref("Analysis running.");

const nowMs = ref(Date.now());

let rotateTimer: ReturnType<typeof setInterval> | undefined;
let secondTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  if (!props.rotate && !props.steps) return;
  rotateTimer = setInterval(() => {
    idx.value = (idx.value + 1) % lines.value.length;
  }, ROTATE_MS);
  secondTimer = setInterval(() => {
    elapsedSeconds.value += 1;
    nowMs.value = Date.now();
    if (elapsedSeconds.value % 15 === 0) {
      liveAnnouncement.value = `Analysis still running — about ${elapsedSeconds.value} seconds so far. ${
        reassurance.value || "Large documents can take up to two minutes."
      }`;
    }
  }, 1_000);
});
onBeforeUnmount(() => {
  if (rotateTimer) clearInterval(rotateTimer);
  if (secondTimer) clearInterval(secondTimer);
});
</script>
