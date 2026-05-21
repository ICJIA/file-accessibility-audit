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

    <!-- WCAG conformance verdict — deliberately independent of the score
         above. The score is a prioritised-readiness metric with partial
         credit; this is the honest pass/fail answer. -->
    <div
      v-if="conformance"
      data-testid="conformance-gate"
      class="max-w-lg mx-auto mt-5 rounded-lg border px-5 py-4 text-left"
      :style="{
        borderColor: conformanceFail
          ? 'var(--icon-fail)'
          : 'var(--border-alt)',
        backgroundColor: conformanceFail
          ? 'rgba(239, 68, 68, 0.08)'
          : 'var(--surface-hover)',
      }"
    >
      <p
        class="text-sm font-semibold flex items-start gap-2"
        :style="{
          color: conformanceFail
            ? 'var(--icon-fail)'
            : 'var(--text-secondary)',
        }"
      >
        <span aria-hidden="true">{{ conformanceFail ? "⚠" : "ⓘ" }}</span>
        <span>{{ conformanceHeading }}</span>
      </p>
      <p class="text-xs text-[var(--text-secondary)] leading-relaxed mt-2">
        {{ conformance.headline }}
      </p>
      <ul
        v-if="conformance.failures.length"
        class="mt-3 space-y-1.5 list-none pl-0"
      >
        <li
          v-for="(f, i) in conformance.failures"
          :key="i"
          class="text-xs text-[var(--text-secondary)] leading-relaxed"
        >
          <a
            :href="f.url"
            target="_blank"
            rel="noopener noreferrer"
            class="font-mono font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
            >{{ f.sc }} {{ f.name }}</a
          ><span class="text-[var(--text-muted)]"> (Level {{ f.level }})</span>
          — {{ f.issue }}
        </li>
      </ul>
      <p
        v-if="conformance.notAssessed.length"
        class="text-xs text-[var(--text-muted)] leading-relaxed mt-3"
      >
        Not evaluated automatically:
        <template
          v-for="(n, i) in conformance.notAssessed"
          :key="n.sc"
          ><a
            :href="n.url"
            target="_blank"
            rel="noopener noreferrer"
            class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
            >{{ n.sc }} {{ n.name }}</a
          ><template v-if="i < conformance.notAssessed.length - 1"
            >, </template
          ></template
        >. These still require manual review.
      </p>
      <p
        class="text-xs text-[var(--text-muted)] leading-relaxed mt-3 pt-3 border-t"
        :style="{ borderColor: 'var(--border-alt)' }"
      >
        This audit checks documents against <strong>WCAG 2.1 Level AA</strong>
        — the accessibility standard adopted by the Illinois Information
        Technology Accessibility Act (IITAA) and the U.S. Department of
        Justice's ADA Title II rule for state and local government.
      </p>
    </div>

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

interface ConformanceFinding {
  sc: string;
  name: string;
  level: "A" | "AA";
  category: string;
  issue: string;
  url: string;
}

interface ConformanceVerdict {
  status: "fail" | "no-automated-failures" | "incomplete";
  failures: ConformanceFinding[];
  notAssessed: {
    sc: string;
    name: string;
    level: "A" | "AA";
    reason: string;
    url: string;
  }[];
  headline: string;
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
    conformance?: ConformanceVerdict;
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

// WCAG conformance verdict — independent of the numeric score. The score is a
// prioritised-readiness metric with partial credit; this is the pass/fail
// answer (a document can score 90+ and still fail WCAG Level A).
const conformance = computed(() => props.result.conformance ?? null);
const conformanceFail = computed(() => conformance.value?.status === "fail");
const conformanceHeading = computed(() => {
  const s = conformance.value?.status;
  if (s === "fail") return "Does not meet WCAG 2.1 Level AA";
  if (s === "incomplete") return "WCAG verdict could not be determined";
  return "No automated WCAG failures detected";
});

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
