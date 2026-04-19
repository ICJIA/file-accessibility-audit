<template>
  <div class="text-center space-y-4">
    <ScoreProfileBanner
      v-if="hasAlternateProfile"
      :selected-mode="selectedMode"
      :available-modes="availableModes"
      :comparison-profile="comparisonProfile"
      @update:selected-mode="setSelectedMode"
    />

    <p class="text-sm text-[var(--text-muted)]">
      {{ result.filename }} — {{ result.pageCount }} page{{
        result.pageCount !== 1 ? "s" : ""
      }}
    </p>

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
import ScoreProfileBanner from "./ScoreProfileBanner.vue";
import {
  MODE_PROFILE_DESCRIPTIONS,
  MODE_PROFILE_LABELS,
  categoriesForScoringMode,
  type ScoreProfile,
  type ScoringMode,
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

const normalizedProfiles = computed<
  Record<ScoringMode, ScoreProfileView | null>
>(() => ({
  strict: {
    mode: "strict",
    label: MODE_PROFILE_LABELS.strict,
    description: MODE_PROFILE_DESCRIPTIONS.strict,
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
        label: MODE_PROFILE_LABELS.remediation,
        description: MODE_PROFILE_DESCRIPTIONS.remediation,
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
      return "Practical is a valid remediation/progress lens on the same document, not a different document state. It can rise when bookmarks, broader tagging, cleaner table grids, or dedicated PDF/UA-oriented audit signals improve usability, even if semantic headings or table-header relationships are still incomplete. Illinois IITAA 2.1 expressly references PDF/UA in §504.2.2 for authoring-tool PDF export capability, while E205.4 frames document-level accessibility through WCAG 2.1 for non-web documents. For agency publication and ADA/WCAG/ITTAA-oriented legal accessibility review, Strict remains the better primary view.";
    }
    return `Practical is a valid remediation/progress lens on the same document, not a different document state. It can score differently when usability signals or dedicated PDF/UA-oriented audits improve, but ${joinParts(parts)} still remain in the scored categories below. Illinois IITAA 2.1 expressly references PDF/UA in §504.2.2 for authoring-tool PDF export capability, while E205.4 frames document-level accessibility through WCAG 2.1 for non-web documents. For agency publication and ADA/WCAG/ITTAA-oriented legal accessibility review, Strict remains the better primary view.`;
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
  text = text.replace(
    /(\d+ critical(?: accessibility)? issues?)/gi,
    '<span style="color: var(--icon-fail); font-weight: 600;">$1</span>',
  );
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
