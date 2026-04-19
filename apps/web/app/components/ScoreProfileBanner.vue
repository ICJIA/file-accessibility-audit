<template>
  <div
    data-testid="mode-recommendation-card"
    class="max-w-2xl mx-auto rounded-2xl border px-4 py-4 sm:px-5 sm:py-5 text-left shadow-sm"
    :class="
      selectedMode === 'strict'
        ? 'border-emerald-500/30 bg-emerald-500/10'
        : 'border-amber-500/35 bg-amber-500/10'
    "
  >
    <div class="flex flex-col gap-3">
      <!-- Header strip -->
      <div
        class="flex flex-wrap items-center justify-between gap-2"
        :class="
          selectedMode === 'strict' ? 'text-emerald-200' : 'text-amber-200'
        "
      >
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em]">
          Recommendation for Illinois agency use
        </p>
        <span
          data-testid="mode-recommendation-current"
          class="rounded-full border px-2.5 py-1 text-[11px] font-medium"
          :class="
            selectedMode === 'strict'
              ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100'
              : 'border-amber-400/35 bg-amber-400/10 text-amber-100'
          "
        >
          Current view: {{ MODE_BUTTON_LABELS[selectedMode] }}
        </span>
      </div>

      <!-- Recommendation title + summary -->
      <div>
        <h2
          class="text-sm sm:text-base font-semibold text-[var(--text-heading)]"
          data-testid="mode-recommendation-title"
        >
          {{ MODE_RECOMMENDATION_TITLES[selectedMode] }}
        </h2>
        <p
          class="mt-2 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed"
          data-testid="mode-recommendation-summary"
        >
          {{ MODE_RECOMMENDATION_SUMMARIES[selectedMode] }}
        </p>
      </div>

      <!-- Clickable mode cards (also act as the mode toggle) -->
      <div
        class="grid gap-2 sm:grid-cols-2"
        role="group"
        aria-label="Scoring profile toggle"
      >
        <button
          type="button"
          :aria-pressed="selectedMode === 'strict'"
          data-testid="score-mode-strict"
          class="group text-left rounded-xl border px-3 py-3 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]"
          :class="
            selectedMode === 'strict'
              ? 'border-emerald-400/60 bg-emerald-500/15 ring-1 ring-emerald-400/30'
              : 'border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] hover:border-[var(--border)]'
          "
          @click="$emit('update:selectedMode', 'strict')"
        >
          <p
            class="text-xs font-semibold text-[var(--text-heading)] flex items-center gap-1.5"
          >
            Strict
            <span
              v-if="selectedMode === 'strict'"
              class="text-[10px] uppercase tracking-wide text-emerald-300 font-medium"
              >Active</span
            >
          </p>
          <p class="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
            Valid semantics-first lens on this same document. Best primary
            mode for publication and ADA/WCAG/ITTAA-oriented legal
            accessibility review.
          </p>
        </button>
        <button
          type="button"
          :aria-pressed="selectedMode === 'remediation'"
          data-testid="score-mode-remediation"
          class="group text-left rounded-xl border px-3 py-3 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]"
          :class="
            selectedMode === 'remediation'
              ? 'border-amber-400/60 bg-amber-500/15 ring-1 ring-amber-400/30'
              : 'border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] hover:border-[var(--border)]'
          "
          @click="$emit('update:selectedMode', 'remediation')"
        >
          <p
            class="text-xs font-semibold text-[var(--text-heading)] flex items-center gap-1.5"
          >
            Practical
            <span
              v-if="selectedMode === 'remediation'"
              class="text-[10px] uppercase tracking-wide text-amber-300 font-medium"
              >Active</span
            >
          </p>
          <p class="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
            Valid remediation/progress lens on this same document. Useful for
            progress tracking, but not the stronger legal or
            conformance-facing score. Also includes additional PDF/UA-oriented
            audits.
          </p>
        </button>
      </div>

      <!-- Mode-specific rationale (keeps the strict/practical context blocks) -->
      <p
        v-if="selectedMode === 'strict'"
        class="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100/95 leading-relaxed"
        data-testid="strict-mode-rationale"
      >
        {{ STRICT_MODE_RATIONALE_TEXT }}
      </p>
      <p
        v-else
        class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/95 leading-relaxed"
        data-testid="strict-findings-note"
      >
        {{ PRACTICAL_FINDINGS_NOTE_PREFIX }}
        <a
          :href="IITAA_PDFUA_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="underline text-amber-100 hover:text-white"
          data-testid="iitaa-pdfua-link"
          >§504.2.2 PDF Export</a
        >{{ PRACTICAL_FINDINGS_NOTE_SUFFIX }}
      </p>

      <!-- Alternate-profile score -->
      <p
        v-if="comparisonProfile"
        class="text-xs text-[var(--text-secondary)]"
        data-testid="alternate-score-summary"
      >
        Also available: <strong>{{ comparisonProfile.label }}</strong> —
        {{ comparisonProfile.overallScore }}/100 ({{ comparisonProfile.grade }})
      </p>

      <!-- Weights collapsible -->
      <details
        class="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-deep)] px-3 py-2"
        data-testid="profile-weights-details"
      >
        <summary
          class="cursor-pointer text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-heading)] transition-colors select-none"
        >
          View category weights for both modes
        </summary>
        <table
          class="mt-3 w-full text-xs"
          data-testid="profile-weights-table"
        >
          <thead>
            <tr
              class="text-[var(--text-muted)] border-b border-[var(--border-subtle)]"
            >
              <th class="text-left py-1 font-medium">Category</th>
              <th class="text-right py-1 font-medium">Strict</th>
              <th class="text-right py-1 font-medium">Practical</th>
            </tr>
          </thead>
          <tbody class="text-[var(--text-muted)] font-mono">
            <tr v-for="row in WEIGHT_ROWS" :key="row.id">
              <td class="py-1 pr-2 font-sans">
                {{ row.label
                }}<span
                  v-if="row.practicalOnly"
                  class="ml-1 text-[10px] uppercase tracking-wide text-amber-400"
                  >Practical</span
                >
              </td>
              <td class="py-1 text-right">{{ row.strict }}</td>
              <td class="py-1 text-right">{{ row.practical }}</td>
            </tr>
            <tr
              class="border-t border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold"
            >
              <td class="py-1 pr-2 font-sans">Total</td>
              <td class="py-1 text-right">100%</td>
              <td class="py-1 text-right">100%</td>
            </tr>
          </tbody>
        </table>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
const WEIGHT_ROWS = [
  {
    id: "text_extractability",
    label: "Text Extractability",
    strict: "20%",
    practical: "17.5%",
    practicalOnly: false,
  },
  {
    id: "title_language",
    label: "Title & Language",
    strict: "15%",
    practical: "13%",
    practicalOnly: false,
  },
  {
    id: "heading_structure",
    label: "Heading Structure",
    strict: "15%",
    practical: "13%",
    practicalOnly: false,
  },
  {
    id: "alt_text",
    label: "Alt Text on Images",
    strict: "15%",
    practical: "13%",
    practicalOnly: false,
  },
  {
    id: "pdf_ua_compliance",
    label: "PDF/UA Compliance Signals",
    strict: "N/A",
    practical: "9.5%",
    practicalOnly: true,
  },
  {
    id: "bookmarks",
    label: "Bookmarks / Navigation",
    strict: "10%",
    practical: "8.5%",
    practicalOnly: false,
  },
  {
    id: "table_markup",
    label: "Table Markup",
    strict: "10%",
    practical: "8.5%",
    practicalOnly: false,
  },
  {
    id: "color_contrast",
    label: "Color Contrast",
    strict: "N/A",
    practical: "N/A",
    practicalOnly: false,
  },
  {
    id: "link_quality",
    label: "Link Quality",
    strict: "5%",
    practical: "4.5%",
    practicalOnly: false,
  },
  {
    id: "reading_order",
    label: "Reading Order",
    strict: "5%",
    practical: "4%",
    practicalOnly: false,
  },
  {
    id: "form_accessibility",
    label: "Form Accessibility",
    strict: "5%",
    practical: "4%",
    practicalOnly: false,
  },
];

import {
  IITAA_PDFUA_URL,
  MODE_BUTTON_LABELS,
  MODE_RECOMMENDATION_SUMMARIES,
  MODE_RECOMMENDATION_TITLES,
  PRACTICAL_FINDINGS_NOTE_PREFIX,
  PRACTICAL_FINDINGS_NOTE_SUFFIX,
  STRICT_MODE_RATIONALE_TEXT,
  type ScoreProfile,
  type ScoringMode,
} from "~/utils/scoringProfiles";

defineProps<{
  selectedMode: ScoringMode;
  availableModes: ScoringMode[];
  comparisonProfile: ScoreProfile | null;
}>();

defineEmits<{
  "update:selectedMode": [mode: ScoringMode];
}>();
</script>
