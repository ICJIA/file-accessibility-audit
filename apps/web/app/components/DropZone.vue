<template>
  <div>
    <!-- Validation error (shown even without staged files) -->
    <div
      v-if="validationError && stagedFiles.length === 0"
      class="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3"
    >
      <p class="text-xs text-[var(--status-error)]">{{ validationError }}</p>
    </div>

    <!-- Staged file list (shown when multiple files selected but not yet submitted) -->
    <div v-if="stagedFiles.length > 0" class="mb-4">
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm font-medium text-[var(--text-heading)]">
            {{ stagedFiles.length }} {{ stagedFiles.length === 1 ? "file" : "files" }} selected
          </p>
          <button
            class="text-xs text-[var(--text-muted)] hover:text-[var(--status-error)] transition-colors"
            @click="clearStaged"
          >
            Clear all
          </button>
        </div>
        <ul class="space-y-2">
          <li
            v-for="(f, i) in stagedFiles"
            :key="i"
            class="flex items-center justify-between rounded-lg bg-[var(--surface-deep)] px-3 py-2 text-sm"
          >
            <span class="text-[var(--text-secondary)] truncate mr-3">{{ f.name }}</span>
            <div class="flex items-center gap-2 flex-shrink-0">
              <span class="text-xs text-[var(--text-muted)]">{{ formatSize(f.size) }}</span>
              <button
                class="text-[var(--text-muted)] hover:text-[var(--status-error)] transition-colors"
                title="Remove file"
                @click="removeStaged(i)"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </li>
        </ul>
        <div v-if="validationError" class="mt-3 text-xs text-[var(--status-error)]">
          {{ validationError }}
        </div>
        <div class="mt-3 flex gap-2 justify-center">
          <button
            class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-green-600"
            :disabled="blocked"
            @click="submitStaged"
          >
            Analyze {{ stagedFiles.length }} {{ stagedFiles.length === 1 ? "File" : "Files" }}
          </button>
          <button
            class="px-4 py-2 rounded-lg border border-[var(--border-input)] text-[var(--text-secondary)] text-sm hover:bg-[var(--surface-hover)] transition-colors"
            @click="openPicker"
          >
            Add More
          </button>
        </div>
      </div>
    </div>

    <div
      class="flex flex-col items-center justify-center min-h-[50vh] border-2 border-dashed rounded-2xl transition-all"
      :class="[
        blocked
          ? 'cursor-not-allowed border-amber-500/40 bg-[var(--surface-card-50)] opacity-70'
          : 'cursor-pointer',
        !blocked && dragging
          ? 'border-green-400 bg-green-400/5 scale-[1.01]'
          : !blocked
            ? 'border-[var(--border-input)] hover:border-[var(--border-hover)] bg-[var(--surface-card-50)]'
            : '',
      ]"
      :aria-disabled="blocked ? 'true' : 'false'"
      @dragover.prevent
      @dragenter.prevent="onDragEnter"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="handleDrop"
      @click="openPicker"
    >
      <div class="text-center space-y-4 p-8">
        <div
          class="mx-auto w-16 h-16 rounded-full bg-[var(--surface-icon)] flex items-center justify-center"
        >
          <svg
            class="w-8 h-8 text-[var(--text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        </div>

        <!-- Gated state (v1.102.0, legal compliance): the disclosure that
             this tool checks only part of accessibility must be acknowledged
             before any file can be checked. The zone says so in place rather
             than failing silently — a drop target that quietly does nothing
             is the worst version of this. -->
        <div v-if="blocked" data-testid="dropzone-blocked">
          <p class="text-lg font-medium text-[var(--text-heading)]">
            One thing first — this tool checks only part of accessibility
          </p>
          <p class="mt-1 text-sm text-[var(--text-secondary)]">
            {{ AUTOMATION_ACK_GATE_NOTE }}
          </p>
        </div>
        <div v-else>
          <p
            class="text-lg font-medium"
            :class="dragging ? 'text-green-400' : 'text-[var(--text-heading)]'"
          >
            {{ dragging ? dropLabelActive : dropLabelIdle }}
          </p>
          <p class="text-sm text-[var(--text-muted)] mt-1">
            or click to browse — up to 5 files, max 25 MB each
          </p>
          <!-- v1.99.0 (user request): set the timing expectation up front —
               a design-heavy PDF measured ~26 s in production, and a silent
               wait that long reads as "stuck". -->
          <p class="text-xs text-[var(--text-muted)] mt-2" data-testid="dropzone-timing-note">
            Analysis isn't instant — most files finish in seconds, but large or design-heavy
            documents can take up to a minute while the full check suite runs.
          </p>
        </div>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      :accept="acceptAttr"
      multiple
      class="hidden"
      @change="handleFileInput"
    />
  </div>
</template>

<script setup lang="ts">
import {
  uploadAcceptAttr,
  uploadExtensions,
  uploadNoun,
  uploadNounWithExts,
  unsupportedFormatHint,
} from "~/utils/uploadFormats";
import { AUTOMATION_ACK_GATE_NOTE } from "~/composables/useAutomationAck";

const props = withDefaults(
  defineProps<{
    /** True while the automation-coverage disclosure is unacknowledged. The
     *  zone then refuses every route in: no picker, no drop, no staged
     *  submit. The page owns the flag (useAutomationAck) and guards its own
     *  analyze entry points too — this is the visible half of that gate, not
     *  the only half. */
    blocked?: boolean;
  }>(),
  { blocked: false },
);

// Must match the advertised copy below ("up to 5 files") — they drifted once
// (copy said 5, limit was 3) and users hit "Maximum 3 files allowed" under a
// label promising five. dropZoneLimits.test.ts pins both sides.
const MAX_FILES = 5;
const MAX_SIZE = 25 * 1024 * 1024;

const config = useRuntimeConfig();
// Word / PowerPoint / Excel support can each be turned off server-side
// (DOCX_ENABLED / PPTX_ENABLED / XLSX_ENABLED = "false"); mirror that in the
// dropzone so we never invite a file the API will reject.
const uploadFlags = computed(() => ({
  docx: config.public.docxEnabled !== false,
  pptx: config.public.pptxEnabled !== false,
  xlsx: config.public.xlsxEnabled !== false,
}));
const acceptAttr = computed(() => uploadAcceptAttr(uploadFlags.value));
const fileNoun = computed(() => uploadNoun(uploadFlags.value));
const dropLabelIdle = computed(() => `Drop ${fileNoun.value} files here`);
const dropLabelActive = computed(() => `Drop your ${fileNoun.value} files here`);

const emit = defineEmits<{
  "file-selected": [file: File];
  "files-selected": [files: File[]];
  /** Someone tried to start a check while the disclosure is unacknowledged.
   *  The page uses this to send them to the acknowledgment bar. */
  "blocked-attempt": [];
}>();

const dragging = ref(false);
const dragCounter = ref(0);
const fileInput = ref<HTMLInputElement | null>(null);
const stagedFiles = ref<File[]>([]);
const validationError = ref("");

// Prevent browser from opening dropped files anywhere on the page
onMounted(() => {
  const prevent = (e: DragEvent) => e.preventDefault();
  document.addEventListener("dragover", prevent);
  document.addEventListener("drop", prevent);
  onUnmounted(() => {
    document.removeEventListener("dragover", prevent);
    document.removeEventListener("drop", prevent);
  });
});

// Every route into a check passes through this. Blocked = the automation
// coverage disclosure has not been acknowledged; the caller is sent to the
// bar instead of being ignored.
function refuseWhileBlocked(): boolean {
  if (!props.blocked) return false;
  validationError.value = "";
  emit("blocked-attempt");
  return true;
}

function onDragEnter() {
  if (props.blocked) return;
  dragCounter.value++;
  dragging.value = true;
}

function onDragLeave() {
  dragCounter.value--;
  if (dragCounter.value <= 0) {
    dragCounter.value = 0;
    dragging.value = false;
  }
}

function openPicker() {
  if (refuseWhileBlocked()) return;
  fileInput.value?.click();
}

function handleDrop(e: DragEvent) {
  dragCounter.value = 0;
  dragging.value = false;
  if (refuseWhileBlocked()) return;
  const files = Array.from(e.dataTransfer?.files || []);
  processFiles(files);
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = ""; // Reset so same files can be re-selected
  if (refuseWhileBlocked()) return;
  processFiles(files);
}

function processFiles(files: File[]) {
  if (refuseWhileBlocked()) return;
  validationError.value = "";

  const exts = uploadExtensions(uploadFlags.value);
  const accepted = files.filter((f) => exts.some((ext) => f.name.toLowerCase().endsWith(ext)));
  if (accepted.length === 0) {
    // A legacy binary Office file (.doc/.xls/.ppt/.rtf) or a CSV gets
    // specific, actionable copy instead of the generic unsupported-formats
    // list — the two say different things, because converting a .doc is the
    // right advice and converting a CSV is not.
    const hint = files.map((f) => unsupportedFormatHint(f.name)).find(Boolean);
    validationError.value = hint || `Please select ${uploadNounWithExts(uploadFlags.value)} files`;
    return;
  }

  const oversized = accepted.filter((f) => f.size > MAX_SIZE);
  if (oversized.length) {
    validationError.value = `${oversized.map((f) => f.name).join(", ")} exceed${oversized.length === 1 ? "s" : ""} the 25 MB limit`;
    return;
  }

  const combined = [...stagedFiles.value, ...accepted];
  if (combined.length > MAX_FILES) {
    validationError.value = `Maximum ${MAX_FILES} files allowed (you have ${combined.length})`;
    return;
  }

  // Single file with nothing staged → emit immediately (original behavior)
  if (accepted.length === 1 && stagedFiles.value.length === 0) {
    // Non-null: the length check above guarantees index 0 exists.
    emit("file-selected", accepted[0]!);
    return;
  }

  // Multiple files or adding to existing staged → stage them
  stagedFiles.value = combined;
}

function removeStaged(index: number) {
  stagedFiles.value.splice(index, 1);
  validationError.value = "";
}

function clearStaged() {
  stagedFiles.value = [];
  validationError.value = "";
}

function submitStaged() {
  if (stagedFiles.value.length === 0) return;
  // Files staged before the acknowledgment expired must not slip through.
  if (refuseWhileBlocked()) return;
  if (stagedFiles.value.length === 1) {
    // Non-null: the length check above guarantees index 0 exists.
    emit("file-selected", stagedFiles.value[0]!);
  } else {
    emit("files-selected", [...stagedFiles.value]);
  }
  stagedFiles.value = [];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>
