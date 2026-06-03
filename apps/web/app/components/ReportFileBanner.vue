<template>
  <div
    class="flex items-start gap-3 sm:gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] px-4 py-4 sm:px-6 sm:py-5"
    data-testid="report-file-banner"
  >
    <!-- Document icon -->
    <svg
      class="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 text-[var(--text-muted)]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="1.5"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>

    <div class="min-w-0">
      <p
        class="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]"
      >
        {{ BANNER_EYEBROW }}
      </p>
      <p
        class="text-lg sm:text-xl font-bold leading-snug text-[var(--text-heading)] break-words"
      >
        {{ filename }}
      </p>
      <p class="mt-0.5 text-sm text-[var(--text-muted)]">
        {{ bannerMetaLine(pageCount) }}
        <span
          v-if="isScanned"
          class="ml-2 inline-flex items-center rounded-full bg-orange-500/15 px-2 py-0.5 align-middle text-xs font-medium text-[var(--status-warning-orange)]"
          >Scanned</span
        >
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BANNER_EYEBROW, bannerMetaLine } from "~/utils/reportBanner";

defineProps<{
  filename: string;
  pageCount: number;
  isScanned?: boolean;
}>();
</script>
