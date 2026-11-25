<template>
  <!-- "…or check a document by link." A real form: Enter submits, the field
       has a visible label, and the error is tied to the field and announced.
       The server decides which sites may be fetched; this only catches what
       is plainly not a web address before a request is made. -->
  <form class="mt-6 text-left" data-testid="url-audit-form" novalidate @submit.prevent="submit">
    <label :for="inputId" class="block text-lg font-bold tracking-tight text-[var(--text-heading)]">
      …or check a document by link
    </label>
    <p :id="hintId" class="mt-0.5 text-xs text-[var(--text-muted)]">
      Paste the web address of a document on an approved government site, for example an Illinois
      state agency site. For anything else, upload the file.
    </p>
    <div class="mt-3 flex flex-col sm:flex-row">
      <input
        :id="inputId"
        v-model="value"
        type="url"
        name="document-url"
        inputmode="url"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :maxlength="maxLength"
        placeholder="https://"
        data-testid="url-audit-input"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? `${errorId} ${hintId}` : hintId"
        class="min-w-0 flex-1 border-2 border-[var(--text-heading)] bg-[var(--surface-body)] px-3 py-3 text-sm text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
        @input="error = ''"
      />
      <button
        type="submit"
        data-testid="url-audit-submit"
        class="shrink-0 bg-[var(--text-heading)] px-5 py-3 text-sm font-bold text-[var(--surface-body)] transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
      >
        Check this link
      </button>
    </div>
    <!-- role="alert": appears in response to pressing the button, with no
         page change. -->
    <p
      v-if="error"
      :id="errorId"
      role="alert"
      data-testid="url-audit-error"
      class="mt-2 text-xs text-[var(--status-error)]"
    >
      {{ error }}
    </p>
  </form>
</template>

<script setup lang="ts">
import { ref, useId } from "vue";
import { DOCUMENT_URL_MAX_LENGTH, validateDocumentUrl } from "~/utils/urlAudit";

const emit = defineEmits<{ submit: [url: string] }>();

const uid = useId();
const inputId = `url-audit-${uid}`;
const hintId = `url-audit-hint-${uid}`;
const errorId = `url-audit-error-${uid}`;
// A little past the limit, so pasting an over-long address reaches the
// validator and gets its explanation instead of being silently cut short.
const maxLength = DOCUMENT_URL_MAX_LENGTH + 200;

const value = ref("");
const error = ref("");

function submit() {
  const checked = validateDocumentUrl(value.value);
  if (!checked.ok) {
    error.value = checked.message;
    return;
  }
  error.value = "";
  emit("submit", checked.url);
}
</script>
