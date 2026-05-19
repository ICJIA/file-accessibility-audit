<template>
  <div class="text-center space-y-4">
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
import {
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

const props = defineProps<{
  result: {
    filename: string;
    pageCount: number;
    overallScore: number;
    grade: string;
    executiveSummary: string;
    categories?: Category[];
    scoreProfiles?: Partial<Record<ScoringMode, ScoreProfile>>;
  };
}>();

const gradeMap: Record<string, { color: string; label: string }> = {
  A: { color: "#22c55e", label: "Excellent" },
  B: { color: "#14b8a6", label: "Good" },
  C: { color: "#eab308", label: "Needs Improvement" },
  D: { color: "#f97316", label: "Poor" },
  F: { color: "#ef4444", label: "Failing" },
};

const displayedProfile = computed(() => {
  const strict = props.result.scoreProfiles?.strict;
  return {
    overallScore: strict?.overallScore ?? props.result.overallScore,
    grade: strict?.grade ?? props.result.grade,
    executiveSummary:
      strict?.executiveSummary ?? props.result.executiveSummary,
  };
});

const displayedCategories = computed(() =>
  categoriesForScoringMode(
    props.result.categories,
    props.result.scoreProfiles,
    "strict",
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

  if (!props.result.categories || props.result.categories.length === 0) {
    return "Scored against WCAG 2.1 AA and IITAA §E205.4 — the rules that govern non-web document accessibility in Illinois. Emphasizes programmatically determinable structure: real headings, real table-header relationships, logical reading order.";
  }

  if (parts.length === 0) {
    return "Scored against WCAG 2.1 AA and IITAA §E205.4. Every scored category passed with no critical or moderate issues — a strong structural signal, though not a final legal determination.";
  }
  return `Scored against WCAG 2.1 AA and IITAA §E205.4. The scored categories below show ${joinParts(parts)} — review the detailed findings before treating the file as publication-ready.`;
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
