<template>
  <div class="text-center space-y-4">
    <div
      v-if="hasAlternateProfile"
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
            Current view:
            {{ selectedMode === "strict" ? "Strict" : "Practical" }}
          </span>
        </div>
        <div>
          <h2
            class="text-sm sm:text-base font-semibold text-[var(--text-heading)]"
            data-testid="mode-recommendation-title"
          >
            {{ recommendationTitle }}
          </h2>
          <p
            class="mt-2 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed"
            data-testid="mode-recommendation-summary"
          >
            {{ recommendationSummary }}
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

    <p class="text-sm text-[var(--text-muted)]">
      {{ result.filename }} — {{ result.pageCount }} page{{
        result.pageCount !== 1 ? "s" : ""
      }}
    </p>

    <div
      v-if="hasAlternateProfile"
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
          @click="setSelectedMode(mode)"
        >
          {{ modeButtonLabel(mode) }}
        </button>
      </div>
      <p class="mt-3 text-xs text-[var(--text-muted)] leading-relaxed">
        {{ displayedProfile.description }}
      </p>
      <p
        v-if="selectedMode === 'strict'"
        class="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-left text-xs text-emerald-100/95 leading-relaxed"
        data-testid="strict-mode-rationale"
      >
        Choose Strict for the stronger ADA/WCAG/ITTAA-facing signal. It
        prioritizes programmatically determinable semantics — real headings,
        table headers, and logical structure — which makes it the better primary
        mode for agency publication and legal accessibility review.
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
        Practical does not mean a different document. It is the same document
        viewed through a broader remediation/progress lens. That lens is valid
        for tracking improvement and vendor-style accessibility workflows
        because it rewards usable improvements such as bookmarks, broader
        tagging, cleaner table grids, and a dedicated PDF/UA-oriented category
        covering signals like MarkInfo, tab order, list/table legality, and
        PDF/UA identifiers. Illinois has not indicated that PDF/UA or Matterhorn
        is itself the controlling legal requirement, so use Strict for agency
        publication and legal accessibility decisions.
      </p>
    </div>

    <!-- Grade circle -->
    <div class="flex justify-center">
      <div
        class="w-28 h-28 sm:w-40 sm:h-40 rounded-full flex items-center justify-center border-4"
        :style="{ borderColor: gradeColor, backgroundColor: gradeColor + '15' }"
      >
        <span
          class="text-5xl sm:text-7xl font-black"
          :style="{ color: gradeColor }"
        >
          {{ displayedProfile.grade }}
        </span>
      </div>
    </div>

    <!-- Score -->
    <p class="text-3xl font-bold">
      {{ displayedProfile.overallScore
      }}<span class="text-lg text-[var(--text-secondary)]">/100</span>
    </p>

    <!-- Label -->
    <p class="text-sm font-medium" :style="{ color: gradeColor }">
      {{ gradeLabel }}
    </p>

    <!-- Verdict explanation (counts) -->
    <p
      v-if="verdictExplanation"
      data-testid="verdict-explanation"
      class="text-sm text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed"
      v-html="verdictExplanation"
    />

    <!-- Summary -->
    <p
      class="text-sm text-[var(--text-muted)] max-w-lg mx-auto leading-relaxed"
      v-html="highlightedSummary"
    />

    <!-- Caveat -->
    <div
      class="max-w-lg mx-auto mt-5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border-alt)] px-5 py-4"
    >
      <p class="text-xs text-[var(--text-secondary)] leading-relaxed">
        This automated audit provides a reliable initial assessment, but it
        cannot catch every issue. For the most thorough evaluation, test your
        PDF directly in
        <a
          href="https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
          >Adobe Acrobat's Accessibility Checker</a
        >. Whenever possible, ensure your source document (Word, InDesign, etc.)
        is accessible before generating the PDF — retrofitting accessibility
        after export is more difficult and less reliable.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  type ScoreProfile,
  type ScoringMode,
  categoriesForScoringMode,
} from "~/utils/scoringProfiles";

interface Category {
  id: string;
  label: string;
  score: number | null;
  grade: string | null;
  severity: string | null;
  findings?: string[];
}

interface ScoreProfileView extends ScoreProfile {
  mode?: ScoringMode;
}

const props = defineProps<{
  result: {
    filename: string;
    pageCount: number;
    overallScore: number;
    grade: string;
    executiveSummary: string;
    categories?: Category[];
    scoringMode?: ScoringMode;
    scoreProfiles?: Partial<Record<ScoringMode, ScoreProfile>>;
  };
  selectedMode?: ScoringMode;
}>();

const emit = defineEmits<{
  "update:selectedMode": [mode: ScoringMode];
}>();

const gradeMap: Record<string, { color: string; label: string }> = {
  A: { color: "#22c55e", label: "Excellent" },
  B: { color: "#14b8a6", label: "Good" },
  C: { color: "#eab308", label: "Needs Improvement" },
  D: { color: "#f97316", label: "Poor" },
  F: { color: "#ef4444", label: "Failing" },
};

const internalSelectedMode = ref<ScoringMode>("strict");

watch(
  () => props.result,
  (value) => {
    internalSelectedMode.value =
      value.scoringMode === "remediation" && value.scoreProfiles?.remediation
        ? "remediation"
        : "strict";
  },
  { immediate: true },
);

function modeButtonLabel(mode: ScoringMode): string {
  return mode === "remediation" ? "Practical" : "Strict";
}

function profileLabel(mode: ScoringMode): string {
  return mode === "remediation"
    ? "Practical readiness score"
    : "Strict semantic score";
}

function profileDescription(mode: ScoringMode): string {
  return mode === "remediation"
    ? "Valid remediation/progress lens on the same document. More generous and more closely aligned to broader weighted remediation workflows, including a dedicated PDF/UA-oriented category."
    : "Valid semantics-first lens on the same document. Prioritizes programmatically determinable headings, table semantics, and logical structure for ADA/WCAG/ITTAA-oriented review.";
}

const normalizedProfiles = computed<
  Record<ScoringMode, ScoreProfileView | null>
>(() => ({
  strict: {
    mode: "strict",
    label: profileLabel("strict"),
    description: profileDescription("strict"),
    overallScore:
      props.result.scoreProfiles?.strict?.overallScore ??
      props.result.overallScore,
    grade: props.result.scoreProfiles?.strict?.grade ?? props.result.grade,
    executiveSummary:
      props.result.scoreProfiles?.strict?.executiveSummary ??
      props.result.executiveSummary,
  },
  remediation: props.result.scoreProfiles?.remediation
    ? {
        mode: "remediation",
        label: profileLabel("remediation"),
        description: profileDescription("remediation"),
        overallScore: props.result.scoreProfiles.remediation.overallScore,
        grade: props.result.scoreProfiles.remediation.grade,
        executiveSummary:
          props.result.scoreProfiles.remediation.executiveSummary,
      }
    : null,
}));

const availableModes = computed(() =>
  (["strict", "remediation"] as ScoringMode[]).filter(
    (mode) => normalizedProfiles.value[mode],
  ),
);
const hasAlternateProfile = computed(() => availableModes.value.length > 1);
const selectedMode = computed(() => {
  const requestedMode = props.selectedMode;
  return requestedMode && availableModes.value.includes(requestedMode)
    ? requestedMode
    : internalSelectedMode.value;
});
const displayedProfile = computed(
  () =>
    normalizedProfiles.value[selectedMode.value] ||
    normalizedProfiles.value.strict!,
);
const comparisonProfile = computed(() => {
  const otherMode = availableModes.value.find(
    (mode) => mode !== selectedMode.value,
  );
  return otherMode ? normalizedProfiles.value[otherMode] : null;
});

const displayedCategories = computed(() =>
  categoriesForScoringMode(
    props.result.categories,
    props.result.scoreProfiles,
    selectedMode.value,
  ),
);

const gradeColor = computed(
  () => gradeMap[displayedProfile.value.grade]?.color || "#666",
);
const gradeLabel = computed(
  () => gradeMap[displayedProfile.value.grade]?.label || "",
);
const recommendationTitle = computed(() =>
  selectedMode.value === "strict"
    ? "Use Strict as the primary mode for legal accessibility review."
    : "Practical is not the primary legal/compliance score.",
);
const recommendationSummary = computed(() =>
  selectedMode.value === "strict"
    ? "Strict and Practical score the same document through different valid accessibility lenses. Strict is the semantics-first lens: it emphasizes programmatically determinable headings, table headers, and logical structure, making it the better primary signal for Illinois agency publication and ADA/WCAG/ITTAA-oriented review."
    : "Strict and Practical score the same document through different valid accessibility lenses. Practical is the remediation/progress lens: it can score differently because it more closely follows a broader weighted remediation schema, including a dedicated PDF/UA-oriented category for signals such as MarkInfo, tab order, list/table legality, and PDF/UA identifiers. Illinois has not indicated that PDF/UA or Matterhorn is itself the controlling legal requirement, so switch back to Strict for publication and legal accessibility decisions.",
);

const severityCounts = computed(() => {
  const cats = displayedCategories.value;
  return {
    critical: cats.filter((c) => c.severity === "Critical").length,
    moderate: cats.filter((c) => c.severity === "Moderate").length,
  };
});

function setSelectedMode(mode: ScoringMode): void {
  internalSelectedMode.value = mode;
  emit("update:selectedMode", mode);
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function joinParts(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

const verdictExplanation = computed(() => {
  const { critical, moderate } = severityCounts.value;
  const parts: string[] = [];
  if (critical > 0) {
    parts.push(
      `<span style="color: var(--icon-fail); font-weight: 600;">${pluralize(critical, "critical issue")}</span>`,
    );
  }
  if (moderate > 0) {
    parts.push(
      `<span style="color: var(--icon-na); font-weight: 600;">${pluralize(moderate, "moderate issue")}</span>`,
    );
  }

  if (selectedMode.value !== "strict") {
    if (parts.length === 0) {
      return "Practical is a valid remediation/progress lens on the same document, not a different document state. It can rise when bookmarks, broader tagging, cleaner table grids, or dedicated PDF/UA-oriented audit signals improve usability, even if semantic headings or table-header relationships are still incomplete. Illinois has not indicated that PDF/UA or Matterhorn is itself the controlling legal requirement, so for agency publication and ADA/WCAG/ITTAA-oriented legal accessibility review, Strict remains the better primary view.";
    }
    return `Practical is a valid remediation/progress lens on the same document, not a different document state. It can score differently when usability signals or dedicated PDF/UA-oriented audits improve, but ${joinParts(parts)} still remain in the scored categories below. Illinois has not indicated that PDF/UA or Matterhorn is itself the controlling legal requirement, so for agency publication and ADA/WCAG/ITTAA-oriented legal accessibility review, Strict remains the better primary view.`;
  }

  if (!props.result.categories || props.result.categories.length === 0) {
    return "Strict is a valid semantics-first lens on the same document, and it is the better primary view for agency publication and ADA/WCAG/ITTAA-oriented legal accessibility review because it emphasizes programmatically determinable structure.";
  }

  if (parts.length === 0) {
    return "Strict is a valid semantics-first lens on the same document, and it is the better primary view for agency publication and ADA/WCAG/ITTAA-oriented legal accessibility review because it emphasizes programmatically determinable structure. Every scored category passed with no critical or moderate issues, which is a strong structural signal, though it is still not a final legal determination.";
  }
  return `Strict is a valid semantics-first lens on the same document, and it is the better primary view for agency publication and ADA/WCAG/ITTAA-oriented legal accessibility review because it emphasizes programmatically determinable structure. The scored categories below still show ${joinParts(parts)}, so review the detailed findings before treating the file as publication-ready.`;
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightSeverities(raw: string): string {
  let text = escapeHtml(raw);
  // Highlight "critical" phrases in red
  text = text.replace(
    /(\d+ critical(?: accessibility)? issues?)/gi,
    '<span style="color: var(--icon-fail); font-weight: 600;">$1</span>',
  );
  // Highlight "moderate" phrases in yellow
  text = text.replace(
    /(\d+ moderate(?: accessibility)? issues?)/gi,
    '<span style="color: var(--icon-na); font-weight: 600;">$1</span>',
  );
  return text;
}

const highlightedSummary = computed(() =>
  highlightSeverities(displayedProfile.value.executiveSummary),
);
</script>
