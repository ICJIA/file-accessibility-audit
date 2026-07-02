<template>
  <div>
        <!-- Score Table -->
        <div
          class="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-x-auto"
        >
          <div class="px-3 sm:px-5 py-3 border-b border-[var(--border)]">
            <h2 class="text-sm font-semibold text-[var(--text-secondary)]">
              Category Scores
            </h2>
          </div>
          <table class="w-full text-sm min-w-[420px]">
            <thead>
              <tr
                class="border-b border-[var(--border)] text-[var(--text-secondary)] text-xs uppercase tracking-wide"
              >
                <th class="text-left px-3 sm:px-5 py-2 font-medium">
                  Category
                </th>
                <th class="text-center px-2 sm:px-3 py-2 font-medium">Score</th>
                <th class="text-center px-2 sm:px-3 py-2 font-medium">Grade</th>
                <th class="text-center px-2 sm:px-3 py-2 font-medium">
                  Severity
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="cat in scoredCategories"
                :key="cat.id"
                class="border-b border-[var(--border-subtle)] last:border-0"
              >
                <td class="px-3 sm:px-5 py-2.5 text-[var(--text-secondary)]">
                  {{ cat.label }}
                </td>
                <td
                  v-if="cat.score !== null"
                  class="text-center px-2 sm:px-3 py-2.5 font-mono"
                  :style="{ color: catColor(cat) }"
                >
                  {{ cat.score }}
                </td>
                <td v-else class="text-center px-2 sm:px-3 py-2.5 font-mono">
                  <NaCell :cat-id="cat.id" :not-assessed="cat.notAssessed" />
                </td>
                <td class="text-center px-2 sm:px-3 py-2.5">
                  <span
                    v-if="cat.grade"
                    class="inline-flex w-6 h-6 rounded-full text-xs font-bold items-center justify-center"
                    :style="{
                      backgroundColor: catColor(cat) + '20',
                      color: catColor(cat),
                    }"
                    >{{ cat.grade }}</span
                  >
                  <span
                    v-else
                    class="text-[var(--text-muted)]"
                    aria-hidden="true"
                    >—</span
                  >
                </td>
                <td class="text-center px-2 sm:px-3 py-2.5">
                  <span
                    v-if="cat.severity"
                    class="text-xs px-2 py-0.5 rounded-full"
                    :style="{
                      backgroundColor: sevColor(cat.severity) + '15',
                      color: sevColor(cat.severity),
                    }"
                    >{{ cat.severity }}</span
                  >
                  <span
                    v-else
                    class="text-[var(--text-muted)] text-xs"
                    aria-hidden="true"
                    >—</span
                  >
                </td>
              </tr>
            </tbody>
            <tbody v-if="naCategories.length">
              <tr class="border-t border-[var(--border)]">
                <td
                  colspan="4"
                  class="px-3 sm:px-5 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide bg-[var(--surface-deep)]"
                >
                  Not Included in Scoring
                </td>
              </tr>
              <tr
                v-for="cat in naCategories"
                :key="cat.id"
                class="border-b border-[var(--border-subtle)] last:border-0"
              >
                <td class="px-3 sm:px-5 py-2.5 text-[var(--text-muted)]">
                  {{ cat.label }}
                </td>
                <td
                  class="text-center px-3 py-2.5 font-mono text-[var(--text-muted)]"
                >
                  <NaCell :cat-id="cat.id" :not-assessed="cat.notAssessed" />
                </td>
                <td
                  class="text-center px-3 py-2.5 text-[var(--text-muted)]"
                  aria-hidden="true"
                >
                  —
                </td>
                <td
                  class="text-center px-3 py-2.5 text-[var(--text-muted)] text-xs"
                  aria-hidden="true"
                >
                  —
                </td>
              </tr>
            </tbody>
          </table>
          <div
            v-if="hasAnyNaRow"
            class="px-3 sm:px-5 py-3 border-t border-[var(--border)] bg-[var(--surface-deep)] text-xs text-[var(--text-muted)] leading-relaxed space-y-1.5"
            data-testid="category-scores-footnote"
          >
            <p class="font-medium text-[var(--text-secondary)]">
              About the N/A rows
            </p>
            <p>
              <strong>N/A</strong> means this analyzer abstained from a
              score for that category under the active mode — it does
              <em>not</em> mean the category is exempt from WCAG, ADA, or
              IITAA.
              <strong>Hover or keyboard-focus the
                <span
                  class="inline-flex w-4 h-4 items-center justify-center rounded-full border border-[var(--border)] text-[10px] align-text-bottom"
                  aria-hidden="true"
                  >i</span></strong>
              on any N/A cell to read the specific reason (Strict doesn't
              include a PDF/UA category; Reading Order requires page-stream
              analysis this tool hasn't implemented; Color Contrast needs
              rendered-PDF sampling; small documents don't require
              bookmarks; etc.).
            </p>
          </div>
        </div>

        <!-- PDF Metadata -->
        <div
          v-if="result.pdfMetadata"
          class="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden"
        >
          <div class="px-5 py-3 border-b border-[var(--border)]">
            <h2 class="text-sm font-semibold text-[var(--text-secondary)]">
              Document Metadata
            </h2>
            <p class="text-xs text-[var(--text-muted)] mt-0.5">
              Informational only — not included in the accessibility score
            </p>
          </div>
          <div class="divide-y divide-[var(--border-subtle)]">
            <div
              v-for="item in metadataItems"
              :key="item.label"
              class="flex flex-col sm:flex-row px-3 sm:px-5 py-2 sm:py-2.5 text-sm"
            >
              <span
                class="sm:w-40 sm:flex-shrink-0 text-[var(--text-muted)] text-xs sm:text-sm"
                >{{ item.label }}</span
              >
              <span
                :class="
                  item.value
                    ? 'text-[var(--text-secondary)]'
                    : 'text-[var(--text-muted)] italic'
                "
              >
                {{ item.value || "Not set" }}
              </span>
            </div>
          </div>
        </div>

        <!-- Detailed Findings -->
        <h2 class="text-base sm:text-lg font-semibold mb-4">
          Detailed Findings
        </h2>

        <div class="space-y-4">
          <div
            v-for="cat in scoredCategories"
            :id="`cat-${cat.id}`"
            :key="cat.id"
            class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-3 sm:p-5"
          >
            <div class="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
              <h3 class="font-semibold text-[var(--text-heading)]">
                {{ cat.label }}
              </h3>
              <span class="text-sm font-mono" :style="{ color: catColor(cat) }">
                {{ cat.score !== null ? `${cat.score}/100` : "N/A" }}
              </span>
              <span
                v-if="cat.severity"
                class="text-xs px-2 py-0.5 rounded-full"
                :style="{
                  backgroundColor: sevColor(cat.severity) + '15',
                  color: sevColor(cat.severity),
                }"
                >{{ cat.severity }}</span
              >
              <div
                v-if="partitionCardFindings(cat.findings).signalCount > 0"
                class="flex items-center gap-2 ml-auto"
              >
                <span class="text-xs text-[var(--text-muted)]">
                  {{ partitionCardFindings(cat.findings).signalCount }} technical signals
                </span>
                <button
                  class="flex items-center gap-2 text-xs cursor-pointer select-none rounded-full px-2.5 py-1 border transition-colors duration-200"
                  :class="
                    advancedCards[cat.id]
                      ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  "
                  :title="advancedCards[cat.id] ? 'Hide technical signals' : 'Show technical signals'"
                  :aria-expanded="!!advancedCards[cat.id]"
                  data-export-exclude
                  @click="toggleAdvanced(cat.id)"
                >
                  <span class="font-medium">{{
                    advancedCards[cat.id] ? "Advanced" : "Basic"
                  }}</span>
                  <span
                    class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200"
                    :class="
                      advancedCards[cat.id] ? 'bg-blue-500' : 'bg-emerald-500'
                    "
                  >
                    <span
                      class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200"
                      :class="
                        advancedCards[cat.id]
                          ? 'translate-x-[18px]'
                          : 'translate-x-[3px]'
                      "
                    />
                  </span>
                </button>
              </div>
            </div>

            <p v-if="cat.explanation" class="text-sm text-[var(--text-secondary)] bg-[var(--surface-deep)] rounded-lg px-4 py-3 border border-[var(--border-subtle)] mb-3">
              <span class="text-[var(--text-muted)] font-medium">What this checks:</span>
              {{ cat.explanation }}
            </p>

            <ul class="space-y-1.5 max-h-[32rem] overflow-y-auto">
              <li
                v-for="(finding, i) in partitionCardFindings(cat.findings).main"
                :key="i"
                :class="
                  isGuidanceFinding(finding)
                    ? 'text-sm text-[var(--text-muted)] flex gap-2 bg-amber-500/8 rounded px-2 py-1.5 border-l-2 border-amber-500/40'
                    : 'text-sm text-[var(--text-muted)] flex gap-2'
                "
              >
                <template v-if="isGuidanceFinding(finding)">
                  <span class="flex-shrink-0 mt-0.5 text-amber-400">&#9656;</span>
                  <span>{{ finding }}</span>
                </template>
                <template v-else>
                  <span
                    class="flex-shrink-0 mt-0.5 font-bold"
                    :style="findingIconStyle(cat)"
                    >{{ findingIcon(cat) }}</span
                  >
                  <span>{{ finding }}</span>
                </template>
              </li>
            </ul>

            <div
              v-if="advancedCards[cat.id] && partitionCardFindings(cat.findings).signalCount > 0"
              class="mt-4 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-[var(--border)] bg-[var(--surface-deep)] px-4 py-3"
              data-testid="technical-signals-panel"
            >
              <div class="text-xs uppercase tracking-wide text-[var(--text-muted)] font-medium mb-3">
                Technical signals · {{ partitionCardFindings(cat.findings).signalCount }}
              </div>
              <div
                v-for="group in partitionCardFindings(cat.findings).signals"
                :key="group.heading || `__group_${group.items[0] || ''}`"
                class="mb-3 last:mb-0"
              >
                <div
                  v-if="group.heading"
                  class="text-xs font-semibold text-[var(--text-secondary)] mb-1"
                >
                  {{ group.heading }}
                </div>
                <ul class="space-y-0.5">
                  <li
                    v-for="item in group.items"
                    :key="item"
                    class="text-xs font-mono text-[var(--text-muted)] pl-3"
                  >
                    {{ item }}
                  </li>
                </ul>
              </div>
            </div>

            <!-- Adobe Acrobat Remediation Guide -->
            <div
              v-if="partitionCardFindings(cat.findings).acrobat.length"
              class="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden"
            >
              <div
                class="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20"
              >
                <svg
                  class="w-4 h-4 text-amber-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.049.58.025 1.194-.14 1.743"
                  />
                </svg>
                <span class="text-sm font-semibold text-amber-300"
                  >How to Fix in Adobe Acrobat</span
                >
              </div>
              <ol class="px-4 py-3 space-y-2">
                <li
                  v-for="(step, j) in partitionCardFindings(cat.findings)
                    .acrobat"
                  :key="j"
                  class="text-sm text-[var(--text-muted)] flex gap-2.5"
                >
                  <span
                    class="flex-shrink-0 text-amber-400/70 font-mono text-xs mt-0.5 w-4 text-right"
                    >{{ j + 1 }}.</span
                  >
                  <span>{{ step }}</span>
                </li>
              </ol>
            </div>

            <div
              v-if="getWcagCriteria(cat.id).length && cat.score !== null"
              class="mt-4 rounded-lg border border-indigo-500/30 bg-indigo-500/5 overflow-hidden"
            >
              <div
                class="flex items-start gap-2.5 px-4 py-3 bg-indigo-500/10 border-b border-indigo-500/20"
              >
                <svg
                  class="w-4 h-4 text-indigo-300 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
                  />
                </svg>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold text-indigo-200">
                    WCAG {{ wcag.version }} References
                  </div>
                  <div class="text-xs text-[var(--text-muted)] mt-0.5">
                    This score is tied to the following Web Content
                    Accessibility Guidelines success criteria. Click any
                    reference to verify the definition on the official W3C site.
                  </div>
                </div>
              </div>
              <ul class="divide-y divide-indigo-500/15">
                <li v-for="c in getWcagCriteria(cat.id)" :key="c.id + c.name">
                  <a
                    :href="wcag.understandingUrl(c.slug)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-500/10 transition-colors group"
                  >
                    <span
                      class="font-mono text-sm text-indigo-300 flex-shrink-0 w-12"
                      >{{ c.id }}</span
                    >
                    <span
                      class="flex-1 text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-heading)]"
                      >{{ c.name }}</span
                    >
                    <span
                      class="text-[10px] font-semibold uppercase tracking-wider text-indigo-300 bg-indigo-500/15 border border-indigo-500/20 rounded px-1.5 py-0.5 flex-shrink-0"
                      >Level {{ c.level }}</span
                    >
                    <svg
                      class="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-indigo-300 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                      />
                    </svg>
                  </a>
                </li>
              </ul>
              <p
                v-if="wcag.version === '2.2' && getWcagMeta(cat.id)?.wcag22Note"
                role="note"
                class="px-4 py-2.5 text-xs text-amber-200/90 bg-amber-500/10 border-t border-amber-500/20"
              >
                {{ getWcagMeta(cat.id)?.wcag22Note }}
              </p>
            </div>

            <div v-if="cat.helpLinks?.length" class="mt-3 pt-3 border-t border-[var(--border-subtle)]">
              <span class="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Learn more</span>
              <div class="mt-2 flex flex-wrap gap-2">
                <a
                  v-for="link in cat.helpLinks"
                  :key="link.url"
                  :href="safeHttpUrl(link.url)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors"
                >
                  {{ link.label }}
                  <svg
                    class="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- Not Included in Scoring -->
        <div v-if="naCategories.length">
          <h2
            class="text-base sm:text-lg font-semibold mb-4 mt-8 text-[var(--text-secondary)]"
          >
            Not Included in Scoring
          </h2>

          <div class="space-y-4">
            <div
              v-for="cat in naCategories"
              :id="`cat-${cat.id}`"
              :key="cat.id"
              class="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 sm:p-5"
            >
              <div class="flex items-center gap-2 sm:gap-3 mb-3">
                <h3 class="font-semibold text-[var(--text-muted)]">
                  {{ cat.label }}
                </h3>
                <span class="text-sm font-mono text-[var(--text-muted)]"
                  >N/A</span
                >
              </div>

              <p
                v-if="cat.explanation"
                class="text-sm text-[var(--text-secondary)] bg-[var(--surface-deep)] rounded-lg px-4 py-3 border border-[var(--border-subtle)] mb-3"
              >
                <span class="text-[var(--text-muted)] font-medium"
                  >What this checks:</span
                >
                {{ cat.explanation }}
              </p>

              <ul class="space-y-1.5 max-h-96 overflow-y-auto">
                <li
                  v-for="(finding, i) in cat.findings"
                  :key="i"
                  class="text-sm text-[var(--text-muted)] flex gap-2"
                >
                  <span
                    class="flex-shrink-0 mt-0.5 font-bold"
                    :style="{ color: 'var(--icon-na)' }"
                    >–</span
                  >
                  <span>{{ finding }}</span>
                </li>
              </ul>

              <div
                v-if="cat.helpLinks?.length"
                class="mt-3 pt-3 border-t border-[var(--border-subtle)]"
              >
                <span
                  class="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide"
                  >Learn more</span
                >
                <div class="mt-2 flex flex-wrap gap-2">
                  <a
                    v-for="link in cat.helpLinks"
                    :key="link.url"
                    :href="safeHttpUrl(link.url)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors"
                  >
                    {{ link.label }}
                    <svg
                      class="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import {
  gradeColor,
  severityColor,
  safeHttpUrl,
  type CategoryResult,
  type ScoringMode,
} from "@file-audit/shared";
import { categoriesForScoringMode } from "~/utils/scoringProfiles";
import { partitionCardFindings, isGuidanceFinding } from "~/utils/findings";
import { getWcagCriteria, getWcagMeta } from "~/utils/wcag";
import { useWcag } from "~/composables/useWcag";

/**
 * The shared report subtree: Score Table, Document Metadata, Detailed
 * Findings, and Not Included in Scoring. Rendered identically by the live
 * audit page (index.vue) and the shared-report page (report/[id].vue) —
 * extracted because the two copies had already drifted and caused a
 * production 500 (see catColor below). Renders INSIDE each page's
 * [data-report-content] wrapper so the HTML-export snapshot is unchanged.
 */
interface ReportLike {
  categories: CategoryResult[];
  scoreProfiles?: Partial<
    Record<
      ScoringMode,
      {
        categories?: CategoryResult[];
        categoryScores?: Record<string, number | null>;
      }
    >
  >;
  pdfMetadata?: {
    creator?: string | null;
    producer?: string | null;
    pdfVersion?: string | null;
    pageCount?: number | null;
    author?: string | null;
    subject?: string | null;
    keywords?: string | null;
    creationDate?: string | null;
    modDate?: string | null;
    isEncrypted?: boolean;
  } | null;
  fileType?: string;
}

const props = defineProps<{ result: ReportLike }>();

const wcag = useWcag();

// Coerce to an array before anything iterates it. The shared-report page
// renders the raw stored JSON, so a forged report could set `categories` to
// a non-array and 500 the page during SSR (findings gets the same guard in
// partitionCardFindings).
const safeCategories = computed<CategoryResult[]>(() =>
  Array.isArray(props.result.categories) ? props.result.categories : [],
);

const displayedCategories = computed(() =>
  categoriesForScoringMode(
    safeCategories.value,
    props.result.scoreProfiles,
    "strict",
  ),
);

const scoredCategories = computed(() =>
  displayedCategories.value.filter((c) => c.score !== null),
);
const naCategories = computed(() =>
  displayedCategories.value.filter((c) => c.score === null),
);
const hasAnyNaRow = computed(
  () =>
    naCategories.value.length > 0 ||
    scoredCategories.value.some((c) => c.score === null),
);

// Per-category expand state for the Basic/Advanced technical-signals pill.
// The pill carries :aria-expanded — the HTML-export snapshot clicks every
// [aria-expanded="false"] to fully expand before cloning. Don\'t remove it.
const advancedCards = reactive<Record<string, boolean>>({});
function toggleAdvanced(catId: string): void {
  advancedCards[catId] = !advancedCards[catId];
}

function formatMetaDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const metadataItems = computed(() => {
  const m = props.result.pdfMetadata;
  if (!m) return [];
  return [
    { label: "Source Application", value: m.creator },
    { label: "PDF Producer", value: m.producer },
    { label: "PDF Version", value: m.pdfVersion },
    { label: "Page Count", value: m.pageCount?.toString() },
    { label: "Author", value: m.author },
    { label: "Subject", value: m.subject },
    { label: "Keywords", value: m.keywords },
    { label: "Created", value: formatMetaDate(m.creationDate) },
    { label: "Last Modified", value: formatMetaDate(m.modDate) },
    { label: "Encrypted", value: m.isEncrypted ? "Yes" : "No" },
  ];
});

function catColor(cat: { grade?: string | null }): string {
  // Keep the lookup INSIDE the function. A top-level <script setup> const
  // got dropped from catColor\'s scope in the production SSR build (only
  // catColor is referenced by the template), throwing "ReferenceError" —
  // a 500 on every report page. Regressed before; see commit 0f39c96.
  // gradeColor is a module import, which the compiler preserves, but the
  // call stays wrapped here so the template contract has one name.
  if (cat.grade) return gradeColor(cat.grade);
  return "#555";
}

function sevColor(severity: string): string {
  return severityColor(severity);
}

function findingIcon(cat: { score: number | null }): string {
  if (cat.score === null) return "\u2013";
  if (cat.score >= 90) return "\u2713";
  if (cat.score >= 70) return "\u2022";
  return "\u2717";
}

function findingIconStyle(cat: {
  score: number | null;
}): Record<string, string> {
  if (cat.score === null) return { color: "var(--icon-na)" };
  if (cat.score >= 90) return { color: "var(--icon-pass)" };
  if (cat.score >= 70) return { color: "var(--icon-info)" };
  if (cat.score >= 40) return { color: "var(--icon-na)" };
  return { color: "var(--icon-fail)" };
}
</script>
