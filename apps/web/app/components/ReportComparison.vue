<template>
  <section
    class="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-5"
    aria-labelledby="compare-heading"
    data-testid="report-comparison"
    data-export-exclude
  >
    <h3 :id="'compare-heading'" class="text-base font-semibold text-[var(--text-heading)]">
      <template v-if="comparison && recheckOf">This is a re-check of {{ recheckOf }}</template>
      <template v-else>Compare with an earlier report</template>
    </h3>

    <!-- ── The control: supply an earlier report ─────────────────────────── -->
    <div v-if="!comparison" class="mt-2">
      <p class="text-sm text-[var(--text-secondary)]">
        Fixed this document since an earlier check? Add the earlier report to see what changed.
        Nothing is uploaded or saved: the comparison is made in your browser.
      </p>
      <div class="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label :for="fileId" class="block text-sm font-medium text-[var(--text-heading)]">
            An earlier report you downloaded (JSON)
          </label>
          <input
            :id="fileId"
            type="file"
            accept="application/json,.json"
            data-testid="compare-file"
            :aria-describedby="error ? errorId : undefined"
            class="mt-1 block w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border file:border-[var(--border-input)] file:bg-[var(--surface-body)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
            @change="onFile"
          />
        </div>
        <form novalidate @submit.prevent="onLink">
          <label :for="linkId" class="block text-sm font-medium text-[var(--text-heading)]">
            …or an earlier share link
          </label>
          <div class="mt-1 flex gap-2">
            <input
              :id="linkId"
              v-model="link"
              type="text"
              inputmode="url"
              autocomplete="off"
              spellcheck="false"
              maxlength="2000"
              placeholder="https://…/report/…"
              data-testid="compare-link"
              :aria-describedby="error ? errorId : undefined"
              class="min-w-0 flex-1 rounded-lg border border-[var(--border-input)] bg-[var(--surface-body)] px-3 py-1.5 text-sm text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
            />
            <button
              type="submit"
              data-testid="compare-link-submit"
              :disabled="loading"
              class="shrink-0 rounded-lg border border-[var(--border-input)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
            >
              {{ loading ? "Loading…" : "Compare" }}
            </button>
          </div>
        </form>
      </div>
      <p
        v-if="error"
        :id="errorId"
        role="alert"
        data-testid="compare-error"
        class="mt-3 text-sm text-[var(--status-error)]"
      >
        {{ error }}
      </p>
    </div>

    <!-- ── The comparison ─────────────────────────────────────────────────── -->
    <div v-else class="mt-2" data-testid="comparison-card">
      <p class="text-sm font-medium text-[var(--text-heading)]" data-testid="comparison-summary">
        {{ comparison.summary }}
      </p>
      <p
        v-if="comparison.differentFilenames || comparison.differentFormats"
        class="mt-1 text-xs text-[var(--text-muted)]"
        data-testid="comparison-different-file"
      >
        The earlier report is for “{{ comparison.before.filename }}” and this one is for “{{
          comparison.after.filename
        }}”. If these are not two versions of one document, the comparison will not mean much.
      </p>

      <!-- Before → after: the document's OVERALL grade and score. -->
      <dl class="mt-3 grid grid-cols-2 gap-3 text-center">
        <div class="rounded-lg border border-[var(--border)] bg-[var(--surface-body)] px-3 py-3">
          <dt class="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Earlier
          </dt>
          <dd class="mt-1 text-[var(--text-heading)]">
            <span class="text-2xl font-black">{{ comparison.before.grade ?? "—" }}</span>
            <span class="block text-sm text-[var(--text-secondary)]"
              >{{ comparison.before.score ?? "—" }} out of 100</span
            >
          </dd>
        </div>
        <div class="rounded-lg border border-[var(--border)] bg-[var(--surface-body)] px-3 py-3">
          <dt class="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Now
          </dt>
          <dd class="mt-1 text-[var(--text-heading)]">
            <span class="text-2xl font-black">{{ comparison.after.grade ?? "—" }}</span>
            <span class="block text-sm text-[var(--text-secondary)]"
              >{{ comparison.after.score ?? "—" }} out of 100</span
            >
          </dd>
        </div>
      </dl>

      <template v-if="!comparison.nothingChanged">
        <div class="mt-4 overflow-x-auto" role="region" :aria-labelledby="captionId" tabindex="0">
          <table class="w-full min-w-[28rem] border-collapse text-left text-sm">
            <caption :id="captionId" class="mb-2 text-left text-xs text-[var(--text-muted)]">
              Each check's score in the earlier report and now. Scores are out of 100.
            </caption>
            <thead>
              <tr class="border-b border-[var(--border)] text-[var(--text-muted)]">
                <th scope="col" class="py-1.5 pr-3 font-semibold">Check</th>
                <th scope="col" class="py-1.5 pr-3 font-semibold">Earlier</th>
                <th scope="col" class="py-1.5 pr-3 font-semibold">Now</th>
                <th scope="col" class="py-1.5 font-semibold">Change</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in comparison.categories"
                :key="c.id"
                class="border-b border-[var(--border)] last:border-b-0"
              >
                <th scope="row" class="py-1.5 pr-3 font-medium text-[var(--text-heading)]">
                  {{ c.label }}
                </th>
                <td class="py-1.5 pr-3 text-[var(--text-secondary)]">{{ c.before ?? "—" }}</td>
                <td class="py-1.5 pr-3 text-[var(--text-secondary)]">{{ c.after ?? "—" }}</td>
                <!-- Sign AND word; weight, not colour, marks a change. -->
                <td
                  class="py-1.5 text-[var(--text-secondary)]"
                  :class="c.delta ? 'font-semibold text-[var(--text-heading)]' : ''"
                >
                  {{ describeDelta(c) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-4 space-y-3">
          <div v-for="group in groups" :key="group.key" :data-testid="`comparison-${group.key}`">
            <h4 class="text-sm font-semibold text-[var(--text-heading)]">
              {{ group.title }} ({{ group.items.length }})
            </h4>
            <p v-if="group.items.length === 0" class="text-sm text-[var(--text-muted)]">
              {{ group.empty }}
            </p>
            <ul v-else class="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
              <li v-for="(f, i) in group.items.slice(0, limit(group.key))" :key="i">
                <span class="font-medium text-[var(--text-heading)]">{{ f.category }}:</span>
                {{ f.text }}
              </li>
            </ul>
            <button
              v-if="group.items.length > limit(group.key)"
              type="button"
              class="mt-1 text-sm underline text-[var(--link)] hover:text-[var(--link-hover)] rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
              @click="shown[group.key] = group.items.length"
            >
              Show all {{ group.items.length }}
            </button>
          </div>
        </div>
        <p v-if="comparison.matchedBy === 'text'" class="mt-3 text-xs text-[var(--text-muted)]">
          Issues were matched by their exact wording, so an issue whose numbers changed (for
          example, fewer images without a description) is listed once as fixed and once as new.
        </p>
      </template>

      <p class="mt-4">
        <button
          type="button"
          data-testid="compare-clear"
          class="text-sm underline text-[var(--link)] hover:text-[var(--link-hover)] rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
          @click="clear"
        >
          {{ recheckOf ? "Hide this comparison" : "Compare with a different report" }}
        </button>
      </p>
    </div>

    <!-- Announces the arrival of a comparison made from a file or a link. -->
    <p class="sr-only" role="status" aria-live="polite" data-testid="compare-status">
      {{ announcement }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from "vue";
import {
  COMPARE_MAX_FILE_BYTES,
  compareResults,
  describeDelta,
  parseExportedReport,
  reportIdFromInput,
} from "~/utils/compareResults";

const props = defineProps<{
  /** The report on screen — the "now" side. */
  result: Record<string, any>;
  /** An earlier report already in hand: the previous upload of this file. */
  earlier?: Record<string, any> | null;
  /** Set with `earlier` when this upload re-checks a file seen in this tab. */
  recheckOf?: string | null;
}>();
const emit = defineEmits<{ dismiss: [] }>();

const uid = useId();
const fileId = `compare-file-${uid}`;
const linkId = `compare-link-${uid}`;
const errorId = `compare-error-${uid}`;
const captionId = `compare-caption-${uid}`;

// The earlier report supplied here, by file or by link.
const supplied = ref<Record<string, any> | null>(null);
const link = ref("");
const error = ref("");
const loading = ref(false);
const announcement = ref("");

const earlierReport = computed(() => supplied.value ?? props.earlier ?? null);
const comparison = computed(() =>
  earlierReport.value ? compareResults(earlierReport.value, props.result) : null,
);

// A different report on screen (a batch tab, a new upload): what was
// supplied for the old one no longer applies.
watch(
  () => props.result,
  () => {
    supplied.value = null;
    error.value = "";
    link.value = "";
  },
);

const INITIAL = 8;
const shown = reactive<Record<string, number>>({
  fixed: INITIAL,
  new: INITIAL,
  remaining: INITIAL,
});
const limit = (key: string) => shown[key] ?? INITIAL;
const groups = computed(() => {
  const c = comparison.value;
  if (!c) return [];
  return [
    { key: "fixed", title: "Fixed", items: c.resolved, empty: "No issues were fixed." },
    { key: "new", title: "New", items: c.added, empty: "No new issues appeared." },
    {
      key: "remaining",
      title: "Still to fix",
      items: c.unchanged,
      empty: "Nothing from the earlier report remains.",
    },
  ];
});

function accept(report: Record<string, any>) {
  if (!compareResults(report, props.result)) {
    error.value = "That report could not be compared with this one.";
    return;
  }
  supplied.value = report;
  error.value = "";
  shown.fixed = shown.new = shown.remaining = INITIAL;
  announcement.value = `Comparison ready. ${comparison.value?.summary ?? ""}`;
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  error.value = "";
  if (file.size > COMPARE_MAX_FILE_BYTES) {
    error.value = "That file is too large to be a report from this tool.";
    return;
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    error.value = "That file could not be read.";
    return;
  }
  const parsed = parseExportedReport(text);
  if (!parsed.ok) {
    error.value = parsed.message;
    return;
  }
  accept(parsed.report);
}

async function onLink() {
  error.value = "";
  const id = reportIdFromInput(link.value);
  if (!id) {
    error.value =
      "That does not look like a share link from this tool. Paste the whole link, ending in /report/ and a long code.";
    return;
  }
  loading.value = true;
  try {
    // Always this site's own API, whatever host the pasted link named.
    const res = await $fetch<{ report?: unknown }>(`/api/reports/${id}`);
    const report = res?.report;
    if (!report || typeof report !== "object" || !Array.isArray((report as any).categories)) {
      error.value = "That link is not a document report, so it cannot be compared.";
      return;
    }
    accept(report as Record<string, any>);
  } catch (err) {
    const status =
      (err as { status?: number; statusCode?: number })?.status ??
      (err as { statusCode?: number })?.statusCode;
    error.value =
      status === 404
        ? "No report was found at that link."
        : status === 410
          ? "That share link has expired."
          : status === 429
            ? "Too many requests from this network right now. Wait a minute, then try again."
            : "The earlier report could not be loaded. Try again in a moment.";
  } finally {
    loading.value = false;
  }
}

function clear() {
  const hadSupplied = supplied.value !== null;
  supplied.value = null;
  error.value = "";
  announcement.value = "Comparison removed.";
  // The page owns `earlier`; ask it to drop the automatic one.
  if (!hadSupplied) emit("dismiss");
}
</script>
