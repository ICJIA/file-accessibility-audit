<template>
  <div class="space-y-4">
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
        <div class="grid gap-2 sm:grid-cols-2">
          <div
            class="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-3"
          >
            <p class="text-xs font-semibold text-[var(--text-heading)]">
              Strict
            </p>
            <p class="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
              Valid semantics-first lens on this same document. Best primary
              mode for publication and ADA/WCAG/ITTAA-oriented legal
              accessibility review.
            </p>
          </div>
          <div
            class="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-3"
          >
            <p class="text-xs font-semibold text-[var(--text-heading)]">
              Practical
            </p>
            <p class="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
              Valid remediation/progress lens on this same document. Useful for
              progress tracking, but not the stronger legal or
              conformance-facing score. Also includes additional PDF/UA-oriented
              audits.
            </p>
          </div>
        </div>
      </div>
    </div>

    <div
      class="max-w-lg mx-auto rounded-xl border border-[var(--border-alt)] bg-[var(--surface-card-alt)] px-4 py-3"
    >
      <p
        class="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
      >
        Score profile
      </p>
      <div
        class="mt-3 inline-flex rounded-lg border border-[var(--border-input)] bg-[var(--surface-body)] p-1"
        role="group"
        aria-label="Scoring profile toggle"
      >
        <button
          v-for="mode in availableModes"
          :key="mode"
          type="button"
          class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          :class="
            selectedMode === mode
              ? 'bg-[var(--surface-hover)] text-[var(--text-heading)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          "
          :aria-pressed="selectedMode === mode"
          :data-testid="`score-mode-${mode}`"
          @click="$emit('update:selectedMode', mode)"
        >
          {{ MODE_BUTTON_LABELS[mode] }}
        </button>
      </div>
      <p class="mt-3 text-xs text-[var(--text-muted)] leading-relaxed">
        {{ MODE_PROFILE_DESCRIPTIONS[selectedMode] }}
      </p>
      <p
        v-if="selectedMode === 'strict'"
        class="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-left text-xs text-emerald-100/95 leading-relaxed"
        data-testid="strict-mode-rationale"
      >
        {{ STRICT_MODE_RATIONALE_TEXT }}
      </p>
      <p
        v-if="comparisonProfile"
        class="mt-2 text-xs text-[var(--text-secondary)]"
        data-testid="alternate-score-summary"
      >
        Also available: <strong>{{ comparisonProfile.label }}</strong> —
        {{ comparisonProfile.overallScore }}/100 ({{ comparisonProfile.grade }})
      </p>
      <p
        v-if="selectedMode !== 'strict'"
        class="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-200/95 leading-relaxed"
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
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  IITAA_PDFUA_URL,
  MODE_BUTTON_LABELS,
  MODE_PROFILE_DESCRIPTIONS,
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
