<template>
  <div class="flex flex-col items-center justify-center min-h-[50vh] space-y-6">
    <div class="relative">
      <div
        class="w-16 h-16 border-4 border-[var(--border)] border-t-green-500 rounded-full animate-spin"
      />
    </div>

    <div class="text-center space-y-2 max-w-md px-4">
      <p class="text-lg font-medium text-[var(--text-heading)]">Analyzing your document</p>

      <!-- Legacy mode: an explicit stage string (the URL-audit path still
           narrates its own real milestones: fetching, building). -->
      <p
        v-if="!rotate"
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

const props = defineProps<{
  /** Legacy explicit stage line (URL audits narrate real milestones). */
  stage: string;
  /** Turn on the rotating check queue (single-file uploads). */
  rotate?: boolean;
  /** Steers which check list rotates; null/undefined → the generic list. */
  fileType?: "pdf" | "docx" | "pptx" | "xlsx" | null;
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

const ROTATE_MS = 2_500;
const idx = ref(0);
const elapsedSeconds = ref(0);
const currentLine = computed(() => lines.value[idx.value % lines.value.length]!);

// Escalating, truthful reassurance — thresholds tuned to real timings (a
// complex InDesign PDF measured ~26 s in production; the veraPDF passes are
// the slow part and are hard-timeout-bounded server-side).
const reassurance = computed(() => {
  if (elapsedSeconds.value >= 60)
    return "Still working. The server enforces hard timeouts on every step, so this will finish or fail with a clear message — it never hangs forever.";
  if (elapsedSeconds.value >= 15)
    return "Large or design-heavy PDFs (InDesign exports, many images) can take 30–60 seconds — the two veraPDF engine passes are the slow part.";
  return "";
});

// Screen-reader announcements on a sparse cadence (0s, then every ~15s).
const liveAnnouncement = ref("Analysis running.");

let rotateTimer: ReturnType<typeof setInterval> | undefined;
let secondTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  if (!props.rotate) return;
  rotateTimer = setInterval(() => {
    idx.value = (idx.value + 1) % lines.value.length;
  }, ROTATE_MS);
  secondTimer = setInterval(() => {
    elapsedSeconds.value += 1;
    if (elapsedSeconds.value % 15 === 0) {
      liveAnnouncement.value = `Analysis still running — about ${elapsedSeconds.value} seconds so far. ${
        reassurance.value || "Large documents can take a minute."
      }`;
    }
  }, 1_000);
});
onBeforeUnmount(() => {
  if (rotateTimer) clearInterval(rotateTimer);
  if (secondTimer) clearInterval(secondTimer);
});
</script>
