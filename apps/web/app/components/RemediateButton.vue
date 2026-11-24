<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { navigateTo, useRuntimeConfig } from "#app";
import { currentDocMetadata, REMEDIATION_LANGUAGES } from "~/utils/remediationMetadata";
import { matchReselectedFile, type ExpectedFile } from "~/utils/remediationFileMatch";

interface Props {
  /** The File that was uploaded for the audit; re-uploaded for remediation. */
  file?: File | null;
  /** Current audit score (used to suppress the button on already-A docs). */
  inputScore?: number | null;
  /** The audit's categories — the title/language findings prefill the form. */
  categories?: unknown;
  /**
   * The document this report is about: its filename, and its size when the
   * page still knows it. When `file` is null the person is asked to choose
   * THIS file again, and a different file is refused — see
   * utils/remediationFileMatch.ts.
   */
  expectedFile?: ExpectedFile | null;
}

const props = withDefaults(defineProps<Props>(), {
  file: null,
  inputScore: null,
  categories: undefined,
  expectedFile: null,
});

// Title and language written into the repaired PDF (user decision
// 2026-11-18): auto-tagging cannot know a document's title, and a missing
// title or language is the most common failure. Prefilled with the PDF's
// own values; the person confirms or corrects them.
const current = computed(() => currentDocMetadata(props.categories));
const docTitle = ref(current.value.title ?? "");
const docLanguage = ref(current.value.language ?? "en-US");
// The title and language ALWAYS belong to the document shown. This component
// instance is reused when a batch switches tabs, and seeding the fields once
// (as the two lines above did on their own) left document A's title in the
// form while the report — and the file sent — were document B's: the wrong
// title written into a PDF. Reseed whenever the report underneath changes;
// the page also keys the component on the active report, and this watcher is
// what keeps any OTHER caller safe.
watch(
  () => [props.categories, props.expectedFile?.name, props.file] as const,
  () => {
    docTitle.value = current.value.title ?? "";
    docLanguage.value = current.value.language ?? "en-US";
    error.value = null;
    if (fileInput.value) fileInput.value.value = "";
  },
);
const languageOptions = computed(() => {
  const own = current.value.language;
  return own && !REMEDIATION_LANGUAGES.some((l) => l.code.toLowerCase() === own.toLowerCase())
    ? [{ code: own, name: `${own} (the document's current language)` }, ...REMEDIATION_LANGUAGES]
    : REMEDIATION_LANGUAGES;
});

const config = useRuntimeConfig();
const enabled = Boolean(config.public.remediationEnabled);

// Phase machine: idle → uploading → finalizing → (navigates away) or error.
// Each phase shows a distinct, unambiguous visual + copy state so a
// second click is obviously redundant (button visibly busy + label
// explains what's happening).
type Phase = "idle" | "uploading" | "finalizing";

const phase = ref<Phase>("idle");
const error = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

// Escalating copy: after a beat the "Sending PDF…" line is replaced by
// "Server is processing your upload — this can take a few seconds…"
// so a slow upload doesn't look like a frozen UI.
const slowCopyVisible = ref(false);
let slowCopyTimer: ReturnType<typeof setTimeout> | null = null;

const visible = computed(() => {
  if (!enabled) return false;
  return true;
});

// Already-accessible files (score ≥ 90) don't benefit from automated
// remediation — the button stays visible but is disabled so the user
// understands their file has been checked and is in good shape.
const alreadyAccessible = computed(() => props.inputScore !== null && props.inputScore >= 90);

const busy = computed(() => phase.value !== "idle");
const disabledForClick = computed(() => busy.value || alreadyAccessible.value);

const phaseCopy = computed(() => {
  if (phase.value === "uploading") {
    return slowCopyVisible.value
      ? "Server is processing your upload — this can take a few seconds…"
      : "Sending PDF to the remediation server…";
  }
  if (phase.value === "finalizing") {
    return "Opening the progress page…";
  }
  return "";
});

const buttonLabel = computed(() => {
  if (phase.value === "uploading") return "Starting remediation…";
  if (phase.value === "finalizing") return "Opening…";
  return "Attempt remediation";
});

function clearSlowTimer(): void {
  if (slowCopyTimer) {
    clearTimeout(slowCopyTimer);
    slowCopyTimer = null;
  }
  slowCopyVisible.value = false;
}

async function startRemediation(file: File): Promise<void> {
  phase.value = "uploading";
  error.value = null;
  clearSlowTimer();
  slowCopyTimer = setTimeout(() => {
    slowCopyVisible.value = true;
  }, 2_500);
  try {
    const fd = new FormData();
    fd.append("file", file);
    if (docTitle.value.trim()) fd.append("title", docTitle.value.trim());
    if (docLanguage.value) fd.append("language", docLanguage.value);
    const res = await $fetch<{
      jobId: string;
      downloadToken: string;
      inputScore: number;
      inputGrade: string;
    }>("/api/remediate", {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    phase.value = "finalizing";
    clearSlowTimer();
    await navigateTo(`/remediate/${res.jobId}?t=${encodeURIComponent(res.downloadToken)}`);
  } catch (e) {
    const err = e as { status?: number; data?: { error?: string } };
    error.value = err.data?.error ?? (e as Error).message ?? "Could not start remediation.";
    phase.value = "idle";
    clearSlowTimer();
  }
}

async function handleClick(): Promise<void> {
  if (busy.value) return;
  if (props.file) {
    await startRemediation(props.file);
    return;
  }
  // The file is no longer held in memory (a batch frees each one once it is
  // audited; a report restored after a reload never had one). Ask for it
  // again — the text beside the button says which file, and the picker's
  // answer is checked before anything is sent.
  error.value = null;
  fileInput.value?.click();
}

async function handlePickerChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const picked = input.files?.[0];
  if (!picked) return;
  // Clear the input so choosing the SAME wrong file twice still fires
  // `change`, and so a stale selection never lingers across batch tabs.
  input.value = "";
  const match = matchReselectedFile(props.expectedFile, picked);
  if (!match.ok) {
    // Refuse: the title and language in this form belong to another document.
    error.value = match.message;
    return;
  }
  await startRemediation(picked);
}

/** True when clicking the button will open a file picker rather than send. */
const needsReselect = computed(() => !props.file && !alreadyAccessible.value);

onBeforeUnmount(() => {
  clearSlowTimer();
});
</script>

<template>
  <div
    v-if="visible"
    class="w-full max-w-2xl rounded-xl px-5 sm:px-8 py-5 sm:py-6 text-center transition-all duration-200"
    :class="
      alreadyAccessible
        ? 'border border-[var(--border)] bg-[var(--surface-card)]'
        : busy
          ? 'border-2 border-blue-400/70 bg-blue-950/40 shadow-[0_0_28px_rgba(59,130,246,0.25)] animate-pulse-soft'
          : 'border border-blue-700/40 bg-blue-950/20'
    "
    :aria-busy="busy ? 'true' : 'false'"
  >
    <p
      class="text-xs uppercase tracking-wide mb-3"
      :class="
        alreadyAccessible ? 'text-[var(--text-muted)]' : busy ? 'text-blue-200' : 'text-blue-300/80'
      "
    >
      {{
        alreadyAccessible
          ? "No further automated remediation needed"
          : busy
            ? "Starting remediation"
            : "Optional next step"
      }}
    </p>
    <div
      v-if="!alreadyAccessible && !busy"
      class="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] text-left max-w-xl mx-auto"
    >
      <label class="block text-sm">
        <span class="text-[var(--text-secondary)] font-medium">Document title</span>
        <span class="block text-xs text-[var(--text-muted)]">
          What a screen reader announces when the PDF opens. Leave blank to keep the current one.
        </span>
        <input
          v-model="docTitle"
          data-testid="remediate-title"
          type="text"
          maxlength="200"
          class="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-deep)] px-3 py-2 text-[var(--text)]"
          placeholder="For example: Annual Report 2025"
        />
      </label>
      <label class="block text-sm">
        <span class="text-[var(--text-secondary)] font-medium">Language</span>
        <span class="block text-xs text-[var(--text-muted)]">The language the text is in.</span>
        <select
          v-model="docLanguage"
          data-testid="remediate-language"
          class="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-deep)] px-3 py-2 text-[var(--text)]"
        >
          <option v-for="l in languageOptions" :key="l.code" :value="l.code">{{ l.name }}</option>
        </select>
      </label>
    </div>
    <!-- Says, before the click, that a file picker is coming and WHICH file
         to choose. Without it the button silently opened a picker and took
         whatever was picked. Tied to the button with aria-describedby. -->
    <p
      v-if="needsReselect && !busy"
      id="remediate-reselect-note"
      data-testid="remediate-reselect-note"
      class="mb-3 text-sm text-[var(--text-secondary)] max-w-xl mx-auto break-words"
    >
      <template v-if="expectedFile?.name">
        The file itself is no longer held in this browser. Choose
        <strong class="font-semibold text-[var(--text-heading)]">{{ expectedFile.name }}</strong>
        again to repair it.
      </template>
      <template v-else>
        The file itself is no longer held in this browser. Choose the same PDF again to repair it.
      </template>
    </p>
    <UButton
      :aria-describedby="needsReselect && !busy ? 'remediate-reselect-note' : undefined"
      :color="alreadyAccessible ? 'neutral' : 'primary'"
      :variant="alreadyAccessible ? 'subtle' : 'solid'"
      size="xl"
      :loading="busy"
      :disabled="disabledForClick"
      :class="[
        'w-full sm:w-auto',
        alreadyAccessible ? 'opacity-60 cursor-not-allowed' : '',
        busy ? 'ring-2 ring-blue-300/60 ring-offset-2 ring-offset-blue-950 cursor-wait' : '',
      ]"
      @click="handleClick"
    >
      <template v-if="!busy" #leading>
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
          />
        </svg>
      </template>
      {{ buttonLabel }}
    </UButton>

    <!-- Busy state: explicit, animated status line below the button so
         users have an unambiguous signal something is happening. -->
    <div
      v-if="busy"
      class="mt-4 flex items-center justify-center gap-2 text-sm text-blue-100"
      aria-live="polite"
    >
      <span class="inline-flex gap-1">
        <span
          class="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce"
          style="animation-delay: -0.32s"
        />
        <span
          class="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce"
          style="animation-delay: -0.16s"
        />
        <span class="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" />
      </span>
      <span>{{ phaseCopy }}</span>
    </div>

    <p
      v-if="!busy && alreadyAccessible"
      class="text-sm text-[var(--text-muted)] mt-3 max-w-lg mx-auto"
    >
      This PDF already scored {{ props.inputScore }} on the audit and won't benefit from additional
      automated remediation. We still recommend a manual review pass in Adobe Acrobat (All tools →
      Prepare for accessibility → Check for accessibility) to verify alt text, reading order, and
      table semantics.
    </p>
    <div
      v-else-if="!busy"
      class="mt-3 text-sm text-[var(--text-muted)] max-w-xl mx-auto space-y-2 text-left sm:text-center"
    >
      <p>
        Attempts to add structure tags, fix metadata, and re-audit the file.
        <strong class="text-[var(--text-secondary)]">Results vary by source document</strong> — a
        re-audit will show you exactly what improved.
      </p>
      <details class="text-xs">
        <summary
          class="cursor-pointer text-[var(--link)] hover:text-[var(--link-hover)] inline-block"
        >
          Why do some PDFs remediate better than others?
        </summary>
        <div class="mt-2 space-y-2 text-[var(--text-muted)]">
          <p>
            <span class="text-[var(--text-secondary)]">Usually large gains:</span>
            text-heavy PDFs exported from Word with real heading styles, or simple single-column
            reports — the underlying structure is there, it just needs to be tagged.
          </p>
          <p>
            <span class="text-[var(--text-secondary)]">Modest gains:</span>
            PDFs exported from InDesign or LaTeX with partial tagging, or documents with a mix of
            text and simple tables.
          </p>
          <p>
            <span class="text-[var(--text-secondary)]">Smaller or no gains:</span>
            scanned image-only PDFs (no real text), Canva or design-tool exports without structure,
            heavily multi-column layouts, complex forms, and documents dominated by images or
            complex tables. These typically need manual work in Adobe Acrobat after the automated
            pass.
          </p>
          <p>
            Either way, the tool will refuse to give you back a file whose score got worse — if the
            result regresses, you'll see a "couldn't remediate" message instead of a damaged PDF.
            Manual review for alt text and table headers is recommended on every output.
          </p>
        </div>
      </details>
    </div>
    <p
      v-if="error"
      class="text-sm text-[var(--status-error)] mt-3 break-words"
      role="alert"
      data-testid="remediate-error"
    >
      {{ error }}
    </p>
    <input
      ref="fileInput"
      type="file"
      accept="application/pdf,.pdf"
      class="hidden"
      data-testid="remediate-file-input"
      tabindex="-1"
      aria-hidden="true"
      @change="handlePickerChange"
    />
  </div>
</template>

<style scoped>
/* Slower, calmer pulse than Tailwind's default — pairs with the blue
   glow shadow to make the busy panel obviously alive without strobing.
   Falls back to no animation if the user prefers reduced motion. */
@keyframes pulse-soft {
  0%,
  100% {
    box-shadow: 0 0 24px rgba(59, 130, 246, 0.18);
  }
  50% {
    box-shadow: 0 0 32px rgba(59, 130, 246, 0.32);
  }
}
.animate-pulse-soft {
  animation: pulse-soft 2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .animate-pulse-soft {
    animation: none;
  }
}
</style>
