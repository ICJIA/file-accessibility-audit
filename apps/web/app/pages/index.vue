<template>
  <div>
    <!-- Error state (single file mode) -->
    <div
      v-if="!isBatchMode && analysisError"
      class="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 p-6"
    >
      <h3 class="font-semibold text-[var(--status-error)] mb-2">
        {{ analysisError.error }}
      </h3>
      <p v-if="analysisError.details" class="text-sm text-[var(--text-muted)]">
        {{ analysisError.details }}
      </p>
      <UButton
        class="mt-4"
        variant="outline"
        color="neutral"
        @click="clearResults"
      >
        Try Another File
      </UButton>
    </div>

    <!-- Results state (show only after all batch items finish, or single result) -->
    <div v-else-if="hasAnyResult && !batchProcessing">
      <!-- Batch completion banner -->
      <div
        v-if="batchItems.length > 1 && showBatchBanner"
        class="mb-4 rounded-xl bg-green-500/10 border border-green-500/25 px-5 py-3 flex items-center justify-between"
      >
        <p class="text-sm text-green-400 font-medium">
          <svg
            class="w-4 h-4 inline-block mr-1.5 -mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          All {{ batchItems.length }} files processed. Click any tab below to
          view its report.
        </p>
        <button
          class="text-green-400/60 hover:text-green-400 text-sm ml-4 flex-shrink-0"
          @click="showBatchBanner = false"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>

      <!-- Batch tab bar -->
      <div
        v-if="batchItems.length > 1"
        class="mb-6 grid gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-1.5"
        role="tablist"
        :aria-label="`${batchItems.length} file results`"
        :style="`grid-template-columns: repeat(${batchItems.length}, minmax(0, 1fr))`"
      >
        <AppTooltip
          v-for="(item, idx) in batchItems"
          :key="item.id"
          :text="item.filename"
          v-slot="{ tooltipId }"
        >
          <button
            role="tab"
            :aria-selected="activeTabIndex === idx"
            :aria-describedby="tooltipId"
            class="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-all w-full min-w-0 cursor-pointer"
            :class="
              activeTabIndex === idx
                ? 'bg-gradient-to-b from-[var(--surface-hover)] to-[var(--surface-card)] text-[var(--text-heading)] font-medium shadow-sm border border-[var(--border)]'
                : 'bg-gradient-to-b from-[var(--surface-deep)] to-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:from-[var(--surface-hover)] hover:to-[var(--surface-deep)] border border-transparent'
            "
            @click="switchTab(idx)"
          >
            <span class="truncate min-w-0" :aria-label="item.filename">{{
              item.filename
            }}</span>
            <span
              v-if="item.status === 'done' && item.result?.grade"
              class="flex-shrink-0 inline-flex w-5 h-5 rounded-full text-[10px] font-bold items-center justify-center"
              :style="{
                backgroundColor: gradeColors[item.result.grade] + '20',
                color: gradeColors[item.result.grade],
              }"
              :aria-label="`Grade ${item.result.grade}`"
              >{{ item.result.grade }}</span
            >
            <svg
              v-else-if="item.status === 'error'"
              class="w-4 h-4 text-red-500 flex-shrink-0"
              aria-label="Error"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <svg
              v-else-if="item.status === 'cancelled'"
              class="w-4 h-4 text-[var(--text-muted)] flex-shrink-0"
              aria-label="Cancelled"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </button>
        </AppTooltip>
      </div>

      <!-- Active tab error -->
      <div
        v-if="activeItem?.status === 'error'"
        class="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 p-6"
      >
        <h3 class="font-semibold text-[var(--status-error)] mb-2">
          {{ activeItem.error?.error || "Analysis failed" }}
        </h3>
        <p
          v-if="activeItem.error?.details"
          class="text-sm text-[var(--text-muted)]"
        >
          {{ activeItem.error.details }}
        </p>
      </div>

      <!-- Active tab cancelled -->
      <div
        v-else-if="activeItem?.status === 'cancelled'"
        class="mb-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border)] p-6 text-center"
      >
        <p class="text-[var(--text-muted)]">
          Analysis was cancelled for this file.
        </p>
      </div>

      <!-- Active tab result -->
      <template v-if="result">
        <!-- Scanned warning banner -->
        <div
          v-if="result.isScanned"
          class="mb-6 rounded-xl bg-orange-500/10 border border-orange-500/30 p-4"
        >
          <p class="text-[var(--status-warning-orange)] font-medium text-sm">
            This PDF appears to be a scanned image. Screen readers cannot access
            its content. OCR and full remediation are required.
          </p>
        </div>

        <!-- Warnings -->
        <div
          v-if="result.warnings?.length"
          class="mb-6 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4"
        >
          <p
            v-for="w in result.warnings"
            :key="w"
            class="text-[var(--status-warning-yellow)] text-sm"
          >
            {{ w }}
          </p>
        </div>

        <!-- Score Hero -->
        <div
          class="text-center mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-8"
        >
          <ScoreCard
            v-model:selected-mode="selectedScoreMode"
            :result="result"
          />
        </div>

        <!-- Methodology -->
        <div
          class="mb-8 rounded-xl border border-[var(--border-alt)] bg-[var(--surface-card-alt)] px-3 sm:px-6 py-4 sm:py-5"
        >
          <h2
            class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3 text-center"
          >
            How Scores Are Derived
          </h2>
          <p
            class="text-xs text-[var(--text-muted)] leading-relaxed mb-4 text-center"
          >
            This tool uses established open-source libraries to extract and
            analyze PDF structure. Scores are calculated against
            <a
              href="https://www.w3.org/WAI/WCAG21/quickref/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >WCAG 2.1 Level AA</a
            >
            success criteria and
            <a
              href="https://www.ada.gov/resources/title-ii-rule/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >ADA Title II</a
            >
            digital accessibility requirements.
          </p>
          <div class="flex flex-wrap justify-center gap-2 mb-4">
            <a
              href="https://qpdf.readthedocs.io/"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] bg-[var(--surface-hover)] hover:bg-[var(--surface-icon)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition-colors"
            >
              <svg
                class="w-3.5 h-3.5 text-[var(--text-muted)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
                />
              </svg>
              QPDF
              <span class="text-[var(--text-muted)]"
                >— PDF structure &amp; tag extraction</span
              >
            </a>
            <a
              href="https://mozilla.github.io/pdf.js/"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] bg-[var(--surface-hover)] hover:bg-[var(--surface-icon)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition-colors"
            >
              <svg
                class="w-3.5 h-3.5 text-[var(--text-muted)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
                />
              </svg>
              PDF.js <span class="text-[var(--text-muted)]">(Mozilla)</span>
              <span class="text-[var(--text-muted)]"
                >— content &amp; metadata analysis</span
              >
            </a>
          </div>
          <p
            class="text-xs text-[var(--text-muted)] leading-relaxed text-center"
          >
            Both <strong>Strict</strong> and <strong>Practical</strong>
            evaluate the same document using <strong>WCAG</strong>
            guidelines. Strict weighs nine categories anchored to
            <strong>WCAG 2.1 AA</strong> and <strong>IITAA §E205.4</strong>
            and does not include a PDF/UA category. Practical uses different
            category weights and adds a
            <em>PDF/UA Compliance Signals</em> category plus partial-credit
            floors on heading and table structure. Both methodologies are
            valid — pick whichever view (or both) matches what you're trying
            to learn. Categories that don't apply are excluded and weights
            renormalized in both modes.
          </p>
        </div>

        <!-- Score Table -->
        <div
          class="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-x-auto"
        >
          <div class="px-3 sm:px-5 py-3 border-b border-[var(--border)]">
            <h2 class="text-sm font-semibold text-[var(--text-secondary)]">
              Category Scores
            </h2>
            <p
              v-if="result.scoreProfiles?.remediation"
              class="mt-1 text-xs text-[var(--text-muted)]"
            >
              {{
                remediationModeActive
                  ? CATEGORY_TABLE_PRACTICAL_PREFIX
                  : CATEGORY_TABLE_STRICT_PREFIX
              }}
              <a
                :href="IITAA_PDFUA_URL"
                target="_blank"
                rel="noopener noreferrer"
                class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
                >§504.2.2 PDF Export</a
              >{{
                remediationModeActive
                  ? CATEGORY_TABLE_PRACTICAL_SUFFIX
                  : CATEGORY_TABLE_STRICT_SUFFIX
              }}
            </p>
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
                  class="text-center px-3 py-2.5 font-mono"
                  :style="{ color: catColor(cat) }"
                >
                  {{ cat.score }}
                </td>
                <td v-else class="text-center px-3 py-2.5 font-mono">
                  <NaCell :cat-id="cat.id" :mode="selectedScoreMode" />
                </td>
                <td class="text-center px-3 py-2.5">
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
                <td class="text-center px-3 py-2.5">
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
                  <NaCell :cat-id="cat.id" :mode="selectedScoreMode" />
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
              <span
                data-testid="category-mode-badge"
                :aria-label="`Scored under ${MODE_BUTTON_LABELS[selectedScoreMode]} mode`"
                class="text-[11px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border"
                :class="
                  selectedScoreMode === 'strict'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                "
                >{{ MODE_BUTTON_LABELS[selectedScoreMode] }}</span
              >
              <span
                v-if="
                  cat.id === 'pdf_ua_compliance' &&
                  selectedScoreMode === 'remediation'
                "
                data-testid="pdf-ua-badge"
                class="text-[11px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-amber-400/60 bg-amber-400/15 text-amber-200"
                >PDF/UA signals</span
              >
              <button
                v-if="hasAdvancedFindings(cat.findings)"
                class="flex items-center gap-2 text-xs cursor-pointer select-none ml-auto rounded-full px-2.5 py-1 border transition-colors duration-200"
                :class="
                  advancedCards[cat.id]
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                "
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

            <ModeCompareBox
              v-if="result.scoreProfiles"
              v-bind="compareProps(cat.id)"
              @update:selected-mode="selectedScoreMode = $event"
            />

            <p
              v-if="cat.explanation"
              class="text-sm text-[var(--text-secondary)] bg-[var(--surface-deep)] rounded-lg px-4 py-3 border border-[var(--border-subtle)] mb-3"
            >
              <span class="text-[var(--text-muted)] font-medium"
                >What this checks:</span
              >
              {{ cat.explanation }}
            </p>

            <ul class="space-y-1.5 max-h-[32rem] overflow-y-auto">
              <li
                v-for="(finding, i) in splitAcrobatGuide(cat.findings, cat.id)
                  .regular"
                :key="i"
                :class="
                  finding.startsWith('---')
                    ? 'text-sm text-[var(--text-secondary)] font-semibold mt-2 pt-2 border-t border-[var(--border-subtle)]'
                    : finding.startsWith('  ')
                      ? 'text-xs font-mono text-[var(--text-muted)] pl-6 opacity-80'
                      : isGuidanceFinding(finding)
                        ? 'text-sm text-[var(--text-muted)] flex gap-2 bg-amber-500/8 rounded px-2 py-1.5 border-l-2 border-amber-500/40'
                        : 'text-sm text-[var(--text-muted)] flex gap-2'
                "
              >
                <template v-if="finding.startsWith('---')">
                  {{ finding.replace(/^-{3}\s*/, "").replace(/\s*-{3}$/, "") }}
                </template>
                <template v-else-if="finding.startsWith('  ')">
                  {{ finding }}
                </template>
                <template v-else-if="isGuidanceFinding(finding)">
                  <span class="flex-shrink-0 mt-0.5 text-amber-400"
                    >&#9656;</span
                  >
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

            <!-- Adobe Acrobat Remediation Guide -->
            <div
              v-if="splitAcrobatGuide(cat.findings, cat.id).acrobat.length"
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
                  v-for="(step, j) in splitAcrobatGuide(cat.findings, cat.id)
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
                    WCAG 2.1 References
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
                    :href="c.url"
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
            </div>

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
                  :href="link.url"
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

              <ModeCompareBox
                v-if="result.scoreProfiles && hasCrossModeSignal(cat.id)"
                v-bind="compareProps(cat.id)"
                @update:selected-mode="selectedScoreMode = $event"
              />

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
                    :href="link.url"
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

        <!-- Export & Share -->
        <div
          class="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-3 sm:p-5 report-actions"
        >
          <!-- Download row -->
          <p
            class="text-sm font-medium text-[var(--text-muted)] mb-3 text-center"
          >
            Download Report
          </p>
          <div class="flex flex-wrap gap-2 justify-center">
            <UButton
              variant="soft"
              color="neutral"
              size="sm"
              @click="exportDocx(result)"
              :loading="exporting"
            >
              <template #leading>
                <svg
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              </template>
              Word (.docx)
            </UButton>
            <UButton
              variant="soft"
              color="neutral"
              size="sm"
              @click="exportHtml(result)"
            >
              <template #leading>
                <svg
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
                  />
                </svg>
              </template>
              HTML (.html)
            </UButton>
            <UButton
              variant="soft"
              color="neutral"
              size="sm"
              @click="exportMarkdown(result)"
            >
              <template #leading>
                <svg
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              </template>
              Markdown (.md)
            </UButton>
            <UButton
              variant="soft"
              color="neutral"
              size="sm"
              @click="exportJSON(result)"
            >
              <template #leading>
                <svg
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
                  />
                </svg>
              </template>
              JSON (.json)
            </UButton>
          </div>

          <!-- Share divider -->
          <div class="border-t border-[var(--border)] my-4" />

          <!-- Share row -->
          <p
            class="text-sm font-medium text-[var(--text-muted)] mb-3 text-center"
          >
            Share Report
          </p>

          <div v-if="!shareUrl">
            <div class="flex flex-wrap gap-2 justify-center">
              <UButton
                variant="soft"
                color="neutral"
                size="sm"
                @click="handleShare"
                :loading="sharing"
              >
                <template #leading>
                  <svg
                    class="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                    />
                  </svg>
                </template>
                Create Shareable Link
              </UButton>
            </div>
            <p class="text-xs text-[var(--text-muted)] mt-2 text-center">
              Creates a public link anyone can view. Expires in 15 days.
            </p>
            <p
              v-if="shareError"
              class="text-xs text-[var(--status-error)] mt-1"
            >
              {{ shareError }}
            </p>
          </div>

          <!-- Share URL display -->
          <div v-else class="space-y-3">
            <div class="flex gap-2">
              <input
                type="text"
                :value="shareUrl"
                readonly
                class="flex-1 bg-[var(--surface-body)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] font-mono select-all"
                @focus="($event.target as HTMLInputElement).select()"
              />
              <UButton
                variant="soft"
                color="neutral"
                size="sm"
                @click="copyShareUrl"
              >
                {{ copied ? "Copied!" : "Copy" }}
              </UButton>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                variant="soft"
                color="primary"
                size="sm"
                @click="emailShareUrl"
              >
                <template #leading>
                  <svg
                    class="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                    />
                  </svg>
                </template>
                Email Link
              </UButton>
              <UButton
                variant="ghost"
                color="neutral"
                size="xs"
                @click="clearShare"
              >
                Dismiss
              </UButton>
            </div>
          </div>
        </div>

        <!-- AI-Ready Analysis (only shown when there's something to remediate) -->
        <div
          v-if="hasRemediationItems"
          class="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-6"
        >
          <div class="flex items-start gap-3 mb-4">
            <div
              class="flex-shrink-0 w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center"
            >
              <svg
                class="w-5 h-5 text-purple-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0 text-left">
              <h2
                class="text-base sm:text-lg font-semibold text-[var(--text-heading)]"
              >
                For Use with AI Assistants
              </h2>
              <p
                class="text-xs sm:text-sm text-[var(--text-muted)] mt-1 leading-relaxed"
              >
                Copy a plain-text summary of this audit — what's working, what
                isn't, WCAG references, and guided questions — into ChatGPT,
                Claude, or any LLM to study the results or get step-by-step
                remediation advice.
              </p>
            </div>
          </div>

          <ul class="text-xs text-[var(--text-muted)] space-y-1 mb-4 pl-1">
            <li class="flex items-start gap-2">
              <span class="text-purple-400 mt-0.5">•</span
              ><span>Overall verdict, grade, and score</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-purple-400 mt-0.5">•</span
              ><span>Passing categories (what's working)</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-purple-400 mt-0.5">•</span
              ><span
                >Failing categories with findings and WCAG 2.1 references</span
              >
            </li>
            <li class="flex items-start gap-2">
              <span class="text-purple-400 mt-0.5">•</span
              ><span>A set of remediation questions for the AI to answer</span>
            </li>
          </ul>

          <label
            for="ai-analysis-preview"
            class="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2"
            >AI Analysis Preview</label
          >
          <textarea
            id="ai-analysis-preview"
            readonly
            class="block w-full min-h-[18rem] sm:min-h-[22rem] max-h-[32rem] bg-[var(--surface-body)] border border-[var(--border-input)] rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-mono text-[var(--text-secondary)] leading-relaxed resize-y"
            :value="aiAnalysisPreview"
          />

          <div
            class="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-2"
          >
            <UButton
              variant="solid"
              color="primary"
              size="md"
              block
              class="sm:w-auto"
              data-testid="copy-ai-analysis"
              @click="handleCopyAiAnalysis"
            >
              <template #leading>
                <svg
                  v-if="!aiCopied"
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
                  />
                </svg>
                <svg
                  v-else
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
              </template>
              {{ aiCopied ? "Copied to clipboard!" : "Copy Analysis for AI" }}
            </UButton>
          </div>
          <p
            v-if="aiCopyError"
            class="text-xs text-[var(--status-error)] mt-2 text-center"
          >
            Clipboard copy failed. Use the preview above to select and copy
            manually.
          </p>
        </div>

        <div class="mt-4 text-center">
          <UButton variant="outline" color="neutral" @click="clearResults">
            Analyze More Files
          </UButton>
        </div>
      </template>

      <!-- Always show reset button on error/cancelled tabs -->
      <div
        v-if="
          !result &&
          (activeItem?.status === 'error' || activeItem?.status === 'cancelled')
        "
        class="mt-4 text-center"
      >
        <UButton variant="outline" color="neutral" @click="clearResults">
          Analyze More Files
        </UButton>
      </div>
    </div>

    <!-- Batch processing progress -->
    <BatchProgress
      v-else-if="isBatchMode && batchProcessing"
      :items="batchItems"
      @cancel="cancelBatch"
    />

    <!-- Processing overlay (single file) -->
    <ProcessingOverlay v-else-if="processing" :stage="processingStage" />

    <!-- Drop zone (idle state) -->
    <div v-else>
      <div class="mb-8 text-center">
        <h2
          class="text-xl sm:text-2xl font-bold tracking-tight mb-3 text-[var(--accent-green)]"
        >
          Check your PDFs for accessibility
        </h2>
        <p
          class="text-[var(--text-secondary)] font-medium max-w-xl mx-auto leading-relaxed"
        >
          Upload a PDF to get an instant accessibility score based on
          <a
            href="https://www.w3.org/WAI/WCAG21/quickref/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--accent-orange)] hover:text-[var(--accent-orange)] font-semibold"
            >WCAG 2.1</a
          >
          and
          <a
            href="https://www.ada.gov/resources/title-ii-rule/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--accent-orange)] hover:text-[var(--accent-orange)] font-semibold"
            >ADA Title II</a
          >
          requirements. The audit checks nine categories — text extractability,
          heading structure, alt text, table markup, and more — and returns a
          detailed report with actionable findings.
        </p>
      </div>

      <!-- Drop hint banner -->
      <Transition name="fade">
        <div
          v-if="showDropHint"
          class="mb-4 rounded-xl bg-blue-500/10 border border-blue-500/25 px-5 py-3 text-center"
        >
          <p class="text-sm text-blue-400 font-medium">
            Drop a PDF file on the area below, or click it to browse your files.
          </p>
        </div>
      </Transition>

      <DropZone @file-selected="analyzeFile" @files-selected="analyzeBatch" />
    </div>

    <!-- Technical Details (always visible, expandable) -->
    <details
      class="mt-12 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden group technical-details"
    >
      <summary
        class="px-3 sm:px-6 py-4 cursor-pointer text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-heading)] transition-colors select-none flex items-center gap-2"
      >
        <svg
          class="w-4 h-4 transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8.25 4.5l7.5 7.5-7.5 7.5"
          />
        </svg>
        Technical Details: How This Tool Analyzes PDFs
      </summary>
      <div
        class="px-3 sm:px-6 pb-6 space-y-6 text-sm text-[var(--text-secondary)] leading-relaxed border-t border-[var(--border)]"
      >
        <!-- Overview -->
        <div class="pt-5">
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">
            Overview: What This Tool Does
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            This tool checks whether a PDF document can be read by people who
            use <strong>assistive technology</strong> — screen readers, braille
            displays, and other tools used by people with disabilities. It does
            this by examining the internal structure of the PDF file, not just
            its visual appearance. A PDF that looks fine on screen may be
            completely unreadable to a screen reader if it lacks the right
            internal markup.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            The tool evaluates PDFs against
            <a
              href="https://www.w3.org/WAI/WCAG21/quickref/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >WCAG 2.1 Level AA</a
            >
            (the international standard for web content accessibility) and
            <a
              href="https://www.ada.gov/resources/title-ii-rule/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >ADA Title II</a
            >
            digital accessibility requirements (U.S. federal law requiring state
            and local government digital content to be accessible, effective
            April 2026).
          </p>

          <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
            How It Works
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            When you upload a PDF, the server runs two independent, open-source
            analysis tools <strong>in parallel</strong> — one reads the PDF's
            internal structure (tags, bookmarks, form fields), the other
            extracts text and metadata from every page. Their combined output
            feeds a scorer that evaluates nine accessibility categories and
            produces a weighted overall score. No data is sent to third-party
            services or AI models — all processing happens on the server (hosted
            on
            <a
              href="https://www.digitalocean.com/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >DigitalOcean</a
            >
            cloud infrastructure). The uploaded PDF is deleted immediately after
            analysis — no PDF content is retained on the server.
          </p>
          <div
            class="mt-3 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)]"
          >
            PDF → [validate file type &amp; size] → parallel { QPDF (structure),
            PDF.js (content) } → Scorer (9 categories) → Weighted Score → Report
          </div>
        </div>

        <!-- App Architecture -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">
            Application Architecture
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            The application is a monorepo with two components, both running on
            the same DigitalOcean droplet:
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1 text-xs">
                Frontend (port 5102)
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                A <strong>Nuxt 4</strong> (Vue 3) web application that provides
                the user interface — the upload form, progress indicators, score
                cards, export buttons, and shareable report pages. Styled with
                Tailwind CSS and Nuxt UI. Served as a server-rendered app via
                Nitro.
              </p>
            </div>
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1 text-xs">
                Backend API (port 5103)
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                An <strong>Express</strong> (Node.js/TypeScript) server that
                handles file uploads, runs QPDF and PDF.js analysis, scores the
                results, manages authentication (passwordless OTP via email),
                and stores shared reports in a <strong>SQLite</strong> database
                (WAL mode). Managed by PM2 in production.
              </p>
            </div>
          </div>
          <p class="text-[var(--text-muted)] mt-3">
            Both processes are managed by <strong>PM2</strong> behind an
            <strong>nginx</strong> reverse proxy on a single DigitalOcean
            droplet provisioned via <strong>Laravel Forge</strong>. The frontend
            proxies API requests to the backend — the user's browser never
            communicates directly with the API server.
          </p>
        </div>

        <!-- QPDF -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">
            Tool 1: QPDF (PDF Structure Extraction)
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            <a
              href="https://qpdf.readthedocs.io/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >QPDF</a
            >
            is an open-source C++ command-line program for inspecting and
            transforming PDF files. It is maintained by Jay Berkenbilt and is
            widely used in PDF archival libraries, digital preservation
            projects, and accessibility workflows. Think of QPDF as a tool that
            can "open up" a PDF and read its internal blueprint — not just the
            words on the page, but the hidden structural information that tells
            assistive technology how the document is organized.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            <strong>How it's called:</strong> The server invokes QPDF as a
            subprocess with the
            <code class="text-xs bg-[var(--surface-deep)] px-1.5 py-0.5 rounded"
              >--json</code
            >
            flag, which outputs the PDF's complete internal object graph as
            machine-readable JSON. The server writes the uploaded PDF to a
            temporary file, runs
            <code class="text-xs bg-[var(--surface-deep)] px-1.5 py-0.5 rounded"
              >qpdf --json /tmp/&lt;uuid&gt;.pdf</code
            >, parses the resulting JSON, and immediately deletes the temp file.
            The subprocess has a 30-second timeout and a 50 MB output buffer to
            handle complex documents safely.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            <strong>Why QPDF?</strong> A PDF file is not a simple document —
            internally, it is a collection of numbered "objects" (text streams,
            images, fonts, bookmarks, form fields, tags) connected by
            cross-references. QPDF can decode and dump this entire object graph
            as structured data, which lets the tool inspect every
            accessibility-relevant feature without relying on visual rendering.
            No other open-source tool provides this level of structural access
            to PDFs.
          </p>
          <h4
            class="font-medium text-[var(--text-secondary)] mb-2 text-xs uppercase tracking-wide"
          >
            What QPDF extracts
          </h4>
          <div
            class="rounded-lg border border-[var(--border-subtle)] overflow-x-auto"
          >
            <table class="w-full text-xs">
              <thead>
                <tr
                  class="border-b border-[var(--border)] text-[var(--text-muted)] uppercase tracking-wide"
                >
                  <th class="text-left px-4 py-2 font-medium">Data</th>
                  <th class="text-left px-4 py-2 font-medium">PDF Source</th>
                  <th class="text-left px-4 py-2 font-medium">Used For</th>
                </tr>
              </thead>
              <tbody class="text-[var(--text-muted)]">
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">StructTreeRoot</td>
                  <td class="px-4 py-2">
                    Catalog <code>/StructTreeRoot</code>
                  </td>
                  <td class="px-4 py-2">
                    Whether the PDF is "tagged" (has a semantic structure tree)
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Language declaration</td>
                  <td class="px-4 py-2">Catalog <code>/Lang</code></td>
                  <td class="px-4 py-2">
                    Language accessibility (screen reader pronunciation)
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Headings (H1–H6)</td>
                  <td class="px-4 py-2">
                    Structure elements with <code>/S</code> = <code>/H</code>,
                    <code>/H1</code>…<code>/H6</code>
                  </td>
                  <td class="px-4 py-2">
                    Heading presence, hierarchy validation, level-skip detection
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Outlines / Bookmarks</td>
                  <td class="px-4 py-2">
                    <code>/Outlines</code> → <code>/First</code>/<code
                      >/Next</code
                    >
                    chain
                  </td>
                  <td class="px-4 py-2">
                    Bookmark count for navigation scoring
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Tables &amp; structure</td>
                  <td class="px-4 py-2">
                    Structure elements <code>/Table</code>, <code>/TR</code>,
                    <code>/TH</code>, <code>/TD</code>, <code>/Caption</code>,
                    <code>/Scope</code>, <code>/Headers</code>
                  </td>
                  <td class="px-4 py-2">
                    Header cells, scope attributes, row structure, nesting,
                    captions, column consistency, header-data associations
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Images &amp; figures</td>
                  <td class="px-4 py-2">
                    XObjects (<code>/Image</code>) + structure elements (<code
                      >/Figure</code
                    >
                    with <code>/Alt</code>)
                  </td>
                  <td class="px-4 py-2">
                    Image detection and alt text presence
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Form fields</td>
                  <td class="px-4 py-2">
                    Widget annotations + <code>/AcroForm</code>
                    <code>/Fields</code> + <code>/TU</code> tooltip
                  </td>
                  <td class="px-4 py-2">
                    Whether form fields have accessible labels
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Reading order MCIDs</td>
                  <td class="px-4 py-2">
                    Numeric <code>/K</code> values (Marked Content IDs) in
                    structure tree
                  </td>
                  <td class="px-4 py-2">
                    Content sequence validation — detects out-of-order reading
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Lists</td>
                  <td class="px-4 py-2">
                    Structure elements <code>/L</code>, <code>/LI</code>,
                    <code>/Lbl</code>, <code>/LBody</code>
                  </td>
                  <td class="px-4 py-2">
                    List detection, well-formedness (label + body per item),
                    nesting depth
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Paragraphs</td>
                  <td class="px-4 py-2">
                    Structure elements with <code>/S</code> = <code>/P</code>
                  </td>
                  <td class="px-4 py-2">
                    Text organization — whether body text is structurally tagged
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">MarkInfo &amp; artifacts</td>
                  <td class="px-4 py-2">
                    Catalog <code>/MarkInfo</code> → <code>/Marked</code>
                  </td>
                  <td class="px-4 py-2">
                    Whether content is distinguished from artifacts (headers,
                    footers, watermarks)
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Role mapping</td>
                  <td class="px-4 py-2">
                    <code>/RoleMap</code> on Catalog or StructTreeRoot
                  </td>
                  <td class="px-4 py-2">
                    Custom tag mappings to standard PDF roles (e.g.,
                    <code>Title → H1</code>)
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Tab order</td>
                  <td class="px-4 py-2">Page objects <code>/Tabs</code></td>
                  <td class="px-4 py-2">
                    Whether keyboard navigation follows the structure tree
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Font embedding</td>
                  <td class="px-4 py-2">
                    FontDescriptor <code>/FontFile</code>,
                    <code>/FontFile2</code>, <code>/FontFile3</code>
                  </td>
                  <td class="px-4 py-2">
                    Whether fonts are embedded (non-embedded fonts can cause
                    garbled text)
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Language spans</td>
                  <td class="px-4 py-2">
                    Structure elements with their own <code>/Lang</code>
                  </td>
                  <td class="px-4 py-2">
                    Inline language declarations for foreign-language content
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">PDF/UA identifier</td>
                  <td class="px-4 py-2">
                    XMP metadata stream (<code>pdfuaid:part</code>)
                  </td>
                  <td class="px-4 py-2">
                    Whether the document claims PDF/UA (ISO 14289) accessibility
                    conformance
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Artifact elements</td>
                  <td class="px-4 py-2">
                    Structure elements with <code>/S</code> =
                    <code>/Artifact</code>
                  </td>
                  <td class="px-4 py-2">
                    Decorative content (headers, footers, watermarks)
                    distinguished from real content
                  </td>
                </tr>
                <tr>
                  <td class="px-4 py-2">ActualText &amp; expansion</td>
                  <td class="px-4 py-2">
                    <code>/ActualText</code> and <code>/E</code> on structure
                    elements
                  </td>
                  <td class="px-4 py-2">
                    Screen reader text overrides for ligatures, symbols, and
                    abbreviation expansions
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- PDF.js -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">
            Tool 2: PDF.js (Content &amp; Metadata Extraction)
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            <a
              href="https://mozilla.github.io/pdf.js/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >PDF.js</a
            >
            is Mozilla's open-source JavaScript PDF renderer — the same library
            that powers Firefox's built-in PDF viewer, used by hundreds of
            millions of people. While QPDF reads the internal blueprint, PDF.js
            reads the PDF the way a human would: it renders each page and
            extracts the actual text content, metadata (title, author,
            language), and interactive elements like links. It runs server-side
            via Node.js, processing every page of the uploaded document.
          </p>
          <h4
            class="font-medium text-[var(--text-secondary)] mb-2 text-xs uppercase tracking-wide"
          >
            What PDF.js extracts
          </h4>
          <div
            class="rounded-lg border border-[var(--border-subtle)] overflow-x-auto"
          >
            <table class="w-full text-xs">
              <thead>
                <tr
                  class="border-b border-[var(--border)] text-[var(--text-muted)] uppercase tracking-wide"
                >
                  <th class="text-left px-4 py-2 font-medium">Data</th>
                  <th class="text-left px-4 py-2 font-medium">Method</th>
                  <th class="text-left px-4 py-2 font-medium">Used For</th>
                </tr>
              </thead>
              <tbody class="text-[var(--text-muted)]">
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Text content</td>
                  <td class="px-4 py-2">
                    <code>page.getTextContent()</code> per page
                  </td>
                  <td class="px-4 py-2">
                    Text extractability (minimum 50 chars = "has text")
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Title, Author, Language</td>
                  <td class="px-4 py-2"><code>doc.getMetadata()</code></td>
                  <td class="px-4 py-2">
                    Title/language scoring (filename-like titles are rejected)
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Links &amp; link text</td>
                  <td class="px-4 py-2">
                    <code>page.getAnnotations()</code> + spatial text matching
                  </td>
                  <td class="px-4 py-2">
                    Link quality — detects raw URLs vs. descriptive text
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Image count (approx.)</td>
                  <td class="px-4 py-2">
                    <code>page.getOperatorList()</code> + image object
                    resolution
                  </td>
                  <td class="px-4 py-2">
                    Fallback image detection when QPDF finds no tagged images —
                    deduplicates per page, filters out images smaller than 50px
                    (spacers, borders). Count is approximate and may include
                    decorative graphics.
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Outlines</td>
                  <td class="px-4 py-2"><code>doc.getOutline()</code></td>
                  <td class="px-4 py-2">
                    Bookmark detection (cross-referenced with QPDF)
                  </td>
                </tr>
                <tr>
                  <td class="px-4 py-2">Empty pages</td>
                  <td class="px-4 py-2">Per-page text length &lt; 10 chars</td>
                  <td class="px-4 py-2">
                    Detects blank pages or pages with content only as images
                    (may need OCR)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-[var(--text-muted)] mt-3">
            <strong>Link text extraction</strong> uses a spatial matching
            algorithm: for each link annotation, PDF.js finds text items whose
            coordinates fall within the link's bounding rectangle (±5px
            tolerance), then joins them to determine the visible link text. This
            is how the tool distinguishes descriptive links ("View the full
            report") from raw URLs ("https://example.com/report.pdf").
          </p>
        </div>

        <!-- Why two tools -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">
            Why Two Tools?
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            No single open-source library can extract both the low-level PDF
            structure (tag trees, object references, XObjects) <em>and</em> the
            rendered text content. Each tool sees a different layer of the
            document:
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1 text-xs">
                QPDF sees:
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                Structure tags, heading hierarchy, table markup, image objects,
                form field labels, bookmark chains, reading order markers — the
                "skeleton" of the document.
              </p>
            </div>
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1 text-xs">
                PDF.js sees:
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                Rendered text content, document title and metadata, link URLs
                and their visible text, page count, image rendering operations —
                the "surface" of the document as a user would read it.
              </p>
            </div>
          </div>
          <p class="text-[var(--text-muted)] mt-3">
            By cross-referencing both outputs, the scorer can answer questions
            that neither tool could answer alone. For example: "Does this image
            have alt text?" requires QPDF to find the image object and its
            Figure tag, while "Is there any readable text on this page at all?"
            requires PDF.js to attempt text extraction. Running both tools in
            parallel hides their individual processing time.
          </p>
        </div>

        <!-- Scoring -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">
            How Scores Are Calculated
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            The scorer evaluates up to eleven accessibility categories.
            <strong>Strict</strong> weighs nine of them (anchored to
            WCAG 2.1 AA and IITAA §E205.4) and does not include a PDF/UA
            category. <strong>Practical</strong> uses different category
            weights and additionally weights a PDF/UA Compliance Signals
            category. Both methodologies evaluate the same document using
            WCAG guidelines. Each category receives a score from 0 to 100
            (or N/A if the category doesn't apply to the document). The
            overall score is a <strong>weighted average</strong> of
            applicable categories, with weights renormalized to exclude N/A
            categories.
          </p>
          <div class="overflow-x-auto mb-4">
            <table
              class="w-full text-xs border border-[var(--border-subtle)] rounded-lg"
            >
              <thead>
                <tr
                  class="bg-[var(--surface-deep)] text-[var(--text-secondary)] uppercase tracking-wide"
                >
                  <th class="text-left px-3 py-2 font-medium">Category</th>
                  <th class="text-right px-3 py-2 font-medium">
                    Strict weight
                    <span class="block text-[9px] normal-case text-emerald-300 font-normal"
                      >WCAG + IITAA §E205.4</span
                    >
                  </th>
                  <th class="text-right px-3 py-2 font-medium">
                    Practical weight
                    <span class="block text-[9px] normal-case text-amber-300 font-normal"
                      >WCAG + PDF/UA</span
                    >
                  </th>
                </tr>
              </thead>
              <tbody
                class="text-[var(--text-muted)] divide-y divide-[var(--border-subtle)]"
              >
                <tr>
                  <td class="px-3 py-1.5">Text Extractability</td>
                  <td class="px-3 py-1.5 text-right font-mono">20%</td>
                  <td class="px-3 py-1.5 text-right font-mono">17.5%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Title &amp; Language</td>
                  <td class="px-3 py-1.5 text-right font-mono">15%</td>
                  <td class="px-3 py-1.5 text-right font-mono">13%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Heading Structure</td>
                  <td class="px-3 py-1.5 text-right font-mono">15%</td>
                  <td class="px-3 py-1.5 text-right font-mono">13%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Alt Text on Images</td>
                  <td class="px-3 py-1.5 text-right font-mono">15%</td>
                  <td class="px-3 py-1.5 text-right font-mono">13%</td>
                </tr>
                <tr class="bg-amber-500/5">
                  <td class="px-3 py-1.5 font-medium">
                    PDF/UA Compliance Signals
                    <span class="text-[10px] uppercase tracking-wide text-amber-400 ml-1"
                      >Practical only</span
                    >
                  </td>
                  <td class="px-3 py-1.5 text-right font-mono">N/A</td>
                  <td class="px-3 py-1.5 text-right font-mono">9.5%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Bookmarks / Navigation</td>
                  <td class="px-3 py-1.5 text-right font-mono">10%</td>
                  <td class="px-3 py-1.5 text-right font-mono">8.5%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Table Markup</td>
                  <td class="px-3 py-1.5 text-right font-mono">10%</td>
                  <td class="px-3 py-1.5 text-right font-mono">8.5%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Color Contrast</td>
                  <td class="px-3 py-1.5 text-right font-mono">N/A</td>
                  <td class="px-3 py-1.5 text-right font-mono">4.5%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Link Quality</td>
                  <td class="px-3 py-1.5 text-right font-mono">5%</td>
                  <td class="px-3 py-1.5 text-right font-mono">4.5%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Reading Order</td>
                  <td class="px-3 py-1.5 text-right font-mono">5%</td>
                  <td class="px-3 py-1.5 text-right font-mono">4%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Form Accessibility</td>
                  <td class="px-3 py-1.5 text-right font-mono">5%</td>
                  <td class="px-3 py-1.5 text-right font-mono">4%</td>
                </tr>
                <tr
                  class="bg-[var(--surface-deep)] text-[var(--text-secondary)] font-semibold"
                >
                  <td class="px-3 py-1.5">Total</td>
                  <td class="px-3 py-1.5 text-right font-mono">100%</td>
                  <td class="px-3 py-1.5 text-right font-mono">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 mb-4 space-y-2"
          >
            <p class="font-medium text-[var(--text-secondary)]">
              Two scoring methodologies, one document
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              Both <strong>Strict</strong> and <strong>Practical</strong>
              correctly evaluate the <strong>same document</strong> using
              <strong>WCAG</strong> guidelines. They differ in two ways:
              category weights, and whether the
              <strong>PDF/UA Compliance Signals</strong> category is scored.
              Both are valid evaluations — neither is “right.”
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              <strong>Strict</strong> weighs nine categories anchored to
              <strong>WCAG 2.1 AA</strong> and
              <strong>IITAA §E205.4</strong>. It does not include a PDF/UA
              category and emphasizes
              <strong>programmatically determinable</strong> structure —
              real headings, real table-header relationships, and logical
              reading order.
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              <strong>Practical</strong> uses different category weights
              than Strict and adds a dedicated PDF/UA Compliance Signals
              category (MarkInfo, tab order, list/table legality, PDF/UA
              identifiers). It also applies partial-credit floors on heading
              and table structure. These floors and weights are judgment
              calls built into this tool, not published standards.
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              <strong>Why the two scores can differ.</strong>
              <strong>Practical can score higher than Strict</strong> when a
              document has remediation scaffolding that Strict does not
              credit — for example, rich tagged body structure plus
              bookmarks instead of real H1–H6 tags (Practical gives a
              70-point floor), or valid table rows without <code>&lt;TH&gt;</code>
              (Practical gives a 70-point floor there too), or strong PDF/UA
              signals like a PDF/UA identifier and complete tab order (these
              are scored in Practical but not in Strict).
              <strong>Practical can score lower than Strict</strong> when a
              document has solid WCAG semantics (real H1–H6, real
              <code>&lt;TH&gt;</code>, bookmarks) but is missing
              PDF/UA-specific markers (no <code>MarkInfo /Marked true</code>,
              no PDF/UA identifier in metadata, incomplete tab order) — the
              9.5% PDF/UA Compliance Signals category can drag down
              Practical's weighted average, while Strict does not count that
              category at all.
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              Illinois IITAA 2.1 references PDF/UA in
              <a
                href="https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html"
                target="_blank"
                rel="noopener noreferrer"
                class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
                >§504.2.2 PDF Export</a
              >
              for authoring-tool export capability, while
              <strong>§E205.4</strong> frames final non-web document
              accessibility through WCAG 2.1. Neither profile is a final
              legal determination.
            </p>
          </div>

          <h4
            class="font-medium text-[var(--text-secondary)] mb-2 text-xs uppercase tracking-wide"
          >
            Category scoring logic
          </h4>
          <div class="space-y-3">
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1">
                Text Extractability (20% weight — highest)
              </p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> Can a screen reader actually read the
                words in this PDF? Some PDFs are just pictures of text (scanned
                documents) — they look normal on screen but are completely
                invisible to assistive technology.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>100</strong> = extractable
                text + structure tags + all fonts embedded.
                <strong>85 (cap)</strong> = any non-embedded fonts detected
                (prevents Pass — non-embedded fonts can cause garbled screen
                reader output). <strong>50</strong> = text is present but no
                tags (an untagged PDF). <strong>25</strong> = tags are present
                but no extractable text (partially remediated scan).
                <strong>0</strong> = no text and no tags (unremediated scanned
                image). This category carries the highest weight because if text
                can't be extracted, nothing else matters.
              </p>
            </div>
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1">
                Title &amp; Language (15%)
              </p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> The document title is the first thing a
                screen reader announces when a user opens the PDF. The language
                tag controls how the screen reader pronounces words — without
                it, an English document might be read with a French accent,
                making it incomprehensible.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> 50 points for a meaningful document
                title (filenames like "report_final.pdf" are automatically
                rejected as non-meaningful), plus 50 points for a declared
                language tag. Both are checked in QPDF's catalog
                <code>/Lang</code> and PDF.js metadata.
              </p>
            </div>
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1">
                Heading Structure (15%)
              </p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> Headings (H1, H2, H3, etc.) are how
                screen reader users navigate and skim documents — the same way
                sighted users scan bold section titles. Without headings, a
                blind user must listen to the entire document from start to
                finish to find the section they need.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>100</strong> = H1–H6 tags
                present with logical hierarchy (no level skips, exactly one H1).
                <strong>75</strong> = multiple H1 headings (a document should
                have exactly one H1 for the title). <strong>60</strong> =
                numbered headings present but hierarchy is broken (e.g., jumps
                from H1 to H3 with no H2). <strong>55</strong> = both multiple
                H1s and hierarchy gaps. <strong>40</strong> = only generic
                <code>/H</code> tags (not properly numbered H1–H6).
                <strong>0</strong> = no heading tags at all.
              </p>
            </div>
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1">
                Alt Text on Images (15%)
              </p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> Every informative image in a PDF must
                have "alternative text" — a short description that a screen
                reader reads aloud. Without alt text, a blind user hears nothing
                when they encounter a chart, photo, or diagram.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> The percentage of detected images that
                have alt text. QPDF identifies image objects (<code
                  >/Image</code
                >
                XObjects) and matches them to their
                <code>/Figure</code> structure elements, then checks whether
                each Figure has an <code>/Alt</code> attribute. If QPDF finds no
                tagged images, PDF.js provides a fallback by counting image
                rendering operations — if images exist but aren't tagged, the
                category scores <strong>0</strong> (Critical) instead of N/A.
                <strong>N/A</strong> only if no images are detected by either
                tool.
              </p>
            </div>
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-amber-500/30 px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1">
                PDF/UA Compliance Signals
                <span
                  class="text-[10px] uppercase tracking-wide text-amber-400 ml-1"
                  >Practical only — 9.5%</span
                >
              </p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> A family of PDF/UA-oriented structural
                signals (tagging, MarkInfo, tab order, PDF/UA identifiers,
                list/table legality) that some remediation vendors and
                PAC-style tools weight explicitly. This category is scored
                in <strong>Practical</strong> and not in Strict — Strict
                does not include a PDF/UA category. IITAA §504.2.2
                references PDF/UA for authoring-tool export capability,
                while §E205.4 frames final-document accessibility through
                WCAG 2.1. Strict therefore surfaces this category as N/A
                with guidance; Practical includes it in its weighted
                average.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>0</strong> if the document
                has no StructTreeRoot (untagged). Otherwise the score starts at
                <strong>25</strong> for a tagged document and accumulates:
                <strong>MarkInfo /Marked true</strong> (+20) or present-only
                (+10), <strong>PDF/UA identifier</strong> in metadata (+15),
                <strong>tab order</strong> on every page (+10) or some pages
                (+5), <strong>list legality</strong> up to +15 based on
                <code>&lt;Lbl&gt;</code>/<code>&lt;LBody&gt;</code> well-formedness,
                and <strong>table legality</strong> up to +15 from row
                structure, consistent columns, and no nested tables. The
                numbers here are the original developer's judgment calls, not
                a published standard, and the total is a readiness signal —
                not a PDF/UA conformance verdict. PAC and Matterhorn remain
                the formal conformance checks.
              </p>
            </div>
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1">
                Bookmarks / Navigation (10%)
              </p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> Bookmarks act as a clickable table of
                contents in the PDF viewer's sidebar. For longer documents,
                they're essential for all users — and required by ADA Title II
                for documents over a certain length.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>N/A</strong> for documents
                under 10 pages (short documents don't require bookmarks). For
                longer documents: <strong>100</strong> = outline entries present
                and populated. <strong>25</strong> = outline structure exists
                but is empty. <strong>0</strong> = no outlines at all. Checked
                in both QPDF's <code>/Outlines</code> object chain and PDF.js's
                <code>getOutline()</code>.
              </p>
            </div>
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1">
                Table Markup (10%)
              </p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> When a sighted user looks at a data
                table, they can glance at the column headers to understand what
                each number means. Screen readers need explicit markup to
                provide the same context — without it, a screen reader reads a
                flat stream of numbers with no structure. This category checks
                seven aspects of table accessibility.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>N/A</strong> if no tables are
                detected. Seven sub-checks contribute to the score:
                <strong>Header cells</strong> (40 pts) — <code>/TH</code> tags
                present on header cells (most critical).
                <strong>Row structure</strong> (20 pts) — cells are grouped in
                <code>/TR</code> rows. <strong>Scope attributes</strong> (10
                pts) — each <code>/TH</code> has a <code>/Scope</code> (/Column
                or /Row) so screen readers know which axis the header applies
                to. <strong>No nested tables</strong> (10 pts) — nested tables
                confuse screen reader navigation.
                <strong>Column consistency</strong> (10 pts) — all rows have the
                same number of cells. <strong>Caption</strong> (5 pts) —
                <code>/Caption</code> element describes the table's purpose.
                <strong>Header associations</strong> (5 pts) — explicit
                <code>/Headers</code> attributes on data cells for complex table
                navigation.
              </p>
            </div>
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1">
                Link Quality (5%)
              </p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> Screen reader users often navigate by
                tabbing through links. Hearing
                "https://www.example.com/documents/2024/report-final-v3.pdf"
                read aloud character by character is unusable. Descriptive link
                text like "Download the 2024 Annual Report" tells users where
                the link goes.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>N/A</strong> if no links.
                Percentage of links with descriptive text. A link is flagged as
                non-descriptive if its visible text starts with
                <code>http://</code>, <code>https://</code>, or
                <code>www.</code>. PDF.js extracts the visible text overlapping
                each link annotation using spatial coordinate matching.
              </p>
            </div>
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1">
                Form Accessibility (5%)
              </p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> If a PDF contains fillable form fields
                (text boxes, checkboxes, dropdowns), each field needs a label
                that assistive technology can read. Without labels, a screen
                reader user hears "edit text" or "checkbox" with no indication
                of what the field is for.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>N/A</strong> if no form
                fields. Percentage of widget annotations (form fields) that have
                a <code>/TU</code> (tooltip) attribute, which serves as the
                accessible label. QPDF checks both the widget annotation and the
                <code>/AcroForm</code> fields array.
              </p>
            </div>
            <div
              class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
            >
              <p class="font-medium text-[var(--text-secondary)] mb-1">
                Reading Order (5%)
              </p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> PDFs with multi-column layouts,
                sidebars, or callout boxes can confuse screen readers if the
                reading order isn't explicitly defined. A sighted user can see
                that a sidebar is separate from the main text, but a screen
                reader reads content in the order defined by the structure tree
                — if that order is wrong, the document becomes a jumble of
                unrelated sentences.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>100</strong> = structure tree
                has depth &gt;1 and fewer than 20% of Marked Content IDs (MCIDs)
                are out of sequence. <strong>50</strong> = more than 20% of
                MCIDs are out of order. <strong>30</strong> = structure tree is
                flat (depth ≤1, indicating minimal structure).
                <strong>0</strong> = no structure tree at all. MCIDs are numeric
                identifiers that link content on each page to its position in
                the tag tree; when they're out of order relative to the page
                content stream, it indicates a reading order problem.
              </p>
            </div>
          </div>

          <h4
            class="font-medium text-[var(--text-secondary)] mb-2 mt-4 text-xs uppercase tracking-wide"
          >
            Supplementary analysis
          </h4>
          <p class="text-xs text-[var(--text-muted)] mb-3">
            In addition to the nine scored categories, the tool appends
            additional findings to relevant categories. Most are informational
            only, but some (marked below) do affect scoring. These provide
            deeper insight into the document's accessibility posture.
          </p>
          <div
            class="rounded-lg border border-[var(--border-subtle)] overflow-x-auto"
          >
            <table class="w-full text-xs">
              <thead>
                <tr
                  class="border-b border-[var(--border)] text-[var(--text-muted)] uppercase tracking-wide"
                >
                  <th class="text-left px-4 py-2 font-medium">Check</th>
                  <th class="text-left px-4 py-2 font-medium">Appended To</th>
                  <th class="text-left px-4 py-2 font-medium">
                    What It Reports
                  </th>
                </tr>
              </thead>
              <tbody class="text-[var(--text-muted)]">
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">List structure</td>
                  <td class="px-4 py-2">Reading Order</td>
                  <td class="px-4 py-2">
                    Per-list breakdown of <code>&lt;LI&gt;</code>,
                    <code>&lt;Lbl&gt;</code>,
                    <code>&lt;LBody&gt;</code> presence and nesting depth
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Marked content &amp; artifacts</td>
                  <td class="px-4 py-2">Text Extractability</td>
                  <td class="px-4 py-2">
                    <code>/MarkInfo</code> status, paragraph tag count, empty
                    page detection
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Font embedding</td>
                  <td class="px-4 py-2">Text Extractability</td>
                  <td class="px-4 py-2">
                    Per-font embedded/not-embedded listing —
                    <strong>scored:</strong> non-embedded fonts cap the category
                    at 85 (Minor)
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Role mapping &amp; tab order</td>
                  <td class="px-4 py-2">Reading Order</td>
                  <td class="px-4 py-2">
                    Custom tag role mappings, per-page tab order configuration
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Language spans</td>
                  <td class="px-4 py-2">Title &amp; Language</td>
                  <td class="px-4 py-2">
                    Inline language declarations for foreign-language content
                    within the document
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Alt text quality</td>
                  <td class="px-4 py-2">Alt Text on Images</td>
                  <td class="px-4 py-2">
                    Heuristic check for non-human-readable alt text: hex-encoded
                    data, filenames, generic placeholders, long strings without
                    spaces
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">PDF/UA identifier</td>
                  <td class="px-4 py-2">Text Extractability</td>
                  <td class="px-4 py-2">
                    Checks XMP metadata for <code>pdfuaid:part</code> —
                    indicates if the document claims PDF/UA (ISO 14289)
                    conformance
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Artifact tagging</td>
                  <td class="px-4 py-2">Text Extractability</td>
                  <td class="px-4 py-2">
                    Counts <code>/Artifact</code> structure elements — headers,
                    footers, and watermarks should be tagged as artifacts so
                    screen readers skip them
                  </td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">ActualText &amp; expansion</td>
                  <td class="px-4 py-2">Reading Order</td>
                  <td class="px-4 py-2">
                    <code>/ActualText</code> for glyph/ligature overrides and
                    <code>/E</code> for abbreviation expansions — help screen
                    readers pronounce content correctly
                  </td>
                </tr>
                <tr>
                  <td class="px-4 py-2">Acrobat remediation guide</td>
                  <td class="px-4 py-2">All categories</td>
                  <td class="px-4 py-2">
                    When a category scores below "Pass", appends the exact Adobe
                    Acrobat Full Check rule names, menu paths, and step-by-step
                    fix instructions specific to that category
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Weight renormalization -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">
            Weight Renormalization
          </h3>
          <p class="text-[var(--text-muted)]">
            When a category scores N/A (e.g., a text-only document has no
            images, tables, links, or forms), its weight is redistributed
            proportionally to the remaining categories. For example, if Alt Text
            (15%), Table Markup (10%), and Form Fields (5%) are all N/A, the
            remaining 70% of weights are renormalized to sum to 100%. This
            ensures documents are only scored on criteria that actually apply to
            them.
          </p>
          <p class="text-[var(--text-muted)] mt-3">
            This renormalization is useful because it prevents a text-only file
            from being unfairly penalized for lacking tables, images, links, or
            forms that are not present. But it does <strong>not</strong> make
            the remaining categories less important. A higher normalized score —
            especially in <strong>Practical</strong> mode — can still coexist
            with unresolved semantic issues that matter for ADA/WCAG/ITTAA
            review. For Illinois agency publication decisions, normalization is
            best treated as a scoring convenience, not as a substitute for the
            stricter category findings.
          </p>
        </div>

        <!-- Scanned detection -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">
            Scanned Document Detection
          </h3>
          <p class="text-[var(--text-muted)]">
            A PDF is flagged as a scanned image when
            <strong>both</strong> conditions are true: PDF.js extracts fewer
            than 50 characters of text content (indicating no real text layer)
            and QPDF finds no StructTreeRoot (indicating no semantic tags). This
            combination means the document is an unremediated scanned image that
            screen readers cannot access at all.
          </p>
        </div>

        <!-- Limitations -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">
            Limitations &amp; What This Tool Cannot Do
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            This tool provides a thorough <em>automated</em> assessment, but no
            automated tool can fully replace manual accessibility testing.
            Important limitations:
          </p>
          <ul class="space-y-2 text-xs text-[var(--text-muted)]">
            <li class="flex gap-2">
              <span class="text-[var(--text-secondary)] font-bold flex-shrink-0"
                >1.</span
              ><span
                ><strong>Alt text quality:</strong> The tool detects whether alt
                text exists and runs a heuristic check for obviously poor alt
                text (hex-encoded strings, filenames like "IMG_001.jpg", generic
                placeholders like "image", and long strings without spaces).
                However, it cannot evaluate whether alt text is
                <em>semantically meaningful</em> — for example, "a chart"
                technically passes all automated checks, but "Bar chart showing
                2024 crime rates by county" is far more useful. Human review is
                still needed to assess alt text quality beyond the heuristic
                flags.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-secondary)] font-bold flex-shrink-0"
                >2.</span
              ><span
                ><strong>Color contrast:</strong> PDF color contrast analysis
                requires rendering each page as an image and analyzing pixel
                colors. This tool focuses on structural accessibility (tags,
                metadata, markup) and does not currently assess color
                contrast.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-secondary)] font-bold flex-shrink-0"
                >3.</span
              ><span
                ><strong>Natural language clarity:</strong> The tool cannot
                evaluate whether the text itself is written clearly. WCAG 3.1.5
                recommends content be written at a lower secondary education
                reading level — this requires human judgment.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-secondary)] font-bold flex-shrink-0"
                >4.</span
              ><span
                ><strong>Decorative images:</strong> Not all images need alt
                text — decorative images should be marked as artifacts. The tool
                cannot distinguish informative images from decorative ones; it
                reports all images without alt text as a potential issue.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-secondary)] font-bold flex-shrink-0"
                >5.</span
              ><span
                ><strong>Complex layouts:</strong> While reading order is
                assessed via MCID sequence analysis, extremely complex layouts
                (e.g., multi-column magazine spreads, nested pull quotes) may
                have subtle ordering issues that the 20% disorder threshold
                doesn't catch.</span
              >
            </li>
          </ul>
          <p class="text-[var(--text-muted)] mt-3">
            For a complete accessibility evaluation, this tool's automated
            analysis should be supplemented with manual testing using an actual
            screen reader (e.g., NVDA, JAWS, or VoiceOver) and the
            <a
              href="https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >Adobe Acrobat Accessibility Checker</a
            >.
          </p>
        </div>

        <!-- Security / privacy -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">
            Privacy &amp; Security
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            The application is hosted on <strong>DigitalOcean</strong> cloud
            infrastructure (managed via Laravel Forge). When you upload a PDF:
          </p>
          <ul class="space-y-1.5 text-xs text-[var(--text-muted)] mb-3">
            <li class="flex gap-2">
              <span class="text-[var(--text-secondary)] font-bold flex-shrink-0"
                >1.</span
              ><span
                >The file is written to a temporary directory on the server,
                analyzed by QPDF and PDF.js, and
                <strong>immediately deleted</strong> — no PDF content is
                retained after analysis completes.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-secondary)] font-bold flex-shrink-0"
                >2.</span
              ><span
                >The file exists in server memory only for the duration of
                analysis (typically under 10 seconds).</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-secondary)] font-bold flex-shrink-0"
                >3.</span
              ><span
                >No PDF data is transmitted to external APIs, cloud services, or
                AI models — all analysis runs on the server itself.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-secondary)] font-bold flex-shrink-0"
                >4.</span
              ><span
                >Encrypted (password-protected) PDFs are rejected with a clear
                error before analysis begins.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-secondary)] font-bold flex-shrink-0"
                >5.</span
              ><span
                >A concurrency semaphore limits the server to two simultaneous
                analyses to prevent resource exhaustion.</span
              >
            </li>
          </ul>
          <p class="text-[var(--text-muted)] mb-2">
            <strong>Shared reports:</strong> When you click "Share Report," the
            analysis <em>results only</em> — scores, category findings, grade,
            metadata (title, author, page count) — are saved to a
            <strong
              >SQLite database file on the same DigitalOcean droplet</strong
            >. Specifically:
          </p>
          <ul class="space-y-1.5 text-xs text-[var(--text-muted)]">
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                >The <strong>original PDF file is never saved</strong> — only
                the structured audit results (JSON) are stored.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                >Shared links expire after <strong>15 days</strong>. After
                expiration, the stored results are eligible for permanent
                deletion. The expiration exists to limit data retention — there
                is no reason to store results indefinitely.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                >Anyone with the link can view the report without logging in. No
                account is required to view a shared report.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                >The database is stored locally on the server filesystem — it is
                not replicated to external storage or backup services.</span
              >
            </li>
          </ul>
        </div>

        <!-- Source code -->
        <div
          class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3"
        >
          <p class="text-[var(--text-muted)]">
            <strong class="text-[var(--text-secondary)]"
              >Verify for yourself:</strong
            >
            The complete source code for the analysis pipeline is open source.
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <a
              href="https://github.com/ICJIA/file-accessibility-audit/tree/main/apps/api/src/services"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"
                />
              </svg>
              Analysis Services (scorer, QPDF, PDF.js)
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
            <a
              href="https://github.com/ICJIA/file-accessibility-audit/blob/main/audit.config.ts"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"
                />
              </svg>
              Configuration &amp; Weights (audit.config.ts)
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
            <a
              href="https://github.com/ICJIA/file-accessibility-audit"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"
                />
              </svg>
              Full Repository
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
    </details>

    <!-- Info cards -->
    <div class="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
      <div
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5"
      >
        <div
          class="text-2xl sm:text-3xl font-black text-[var(--accent-green)] mb-2"
        >
          9 Categories
        </div>
        <p class="text-sm text-[var(--text-muted)]">
          Accessibility categories scored across structure, navigation, and
          content
        </p>
      </div>
      <div
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5"
      >
        <div
          class="text-2xl sm:text-3xl font-black text-[var(--accent-green)] mb-2"
        >
          Accessibility Readiness
        </div>
        <p class="text-sm text-[var(--text-muted)]">
          Letter grade with severity levels so you know what to fix first
        </p>
      </div>
      <div
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5"
      >
        <div
          class="text-2xl sm:text-3xl font-black text-[var(--accent-green)] mb-2"
        >
          Export & Share
        </div>
        <p class="text-sm text-[var(--text-muted)]">
          Download reports as Word, HTML, Markdown, or JSON and share via link
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getWcagCriteria } from "~/utils/wcag";
import ModeCompareBox from "~/components/ModeCompareBox.vue";
import NaCell from "~/components/NaCell.vue";
import {
  type ScoringMode,
  categoriesForScoringMode,
  CATEGORY_TABLE_PRACTICAL_PREFIX,
  CATEGORY_TABLE_PRACTICAL_SUFFIX,
  CATEGORY_TABLE_STRICT_PREFIX,
  CATEGORY_TABLE_STRICT_SUFFIX,
  IITAA_PDFUA_URL,
  MODE_BUTTON_LABELS,
} from "~/utils/scoringProfiles";

definePageMeta({ middleware: "auth" });

interface BatchItem {
  id: string;
  filename: string;
  file: File;
  status: "queued" | "processing" | "done" | "error" | "cancelled";
  result: any | null;
  error: any | null;
}

// Abort controller for batch cancellation
let batchAbortController: AbortController | null = null;

const resetSignal = inject<Ref<number>>("resetSignal");
const {
  exportMarkdown,
  exportJSON,
  exportDocx,
  exportHtml,
  shareReport,
  shareUrl,
  shareError,
  sharing,
  clearShare,
  exporting,
  copyAiAnalysis,
  aiCopied,
  buildAiAnalysisText,
} = useReportExport();

const aiCopyError = ref(false);
async function handleCopyAiAnalysis() {
  if (!result.value) return;
  aiCopyError.value = false;
  const ok = await copyAiAnalysis(result.value);
  if (!ok) aiCopyError.value = true;
}
const aiAnalysisPreview = computed(() => {
  if (!result.value) return "";
  return buildAiAnalysisText(result.value);
});
const hasRemediationItems = computed(() => {
  const cats = result.value?.categories || [];
  return cats.some(
    (c: any) => c.severity === "Critical" || c.severity === "Moderate",
  );
});

// --- Single file state (preserved for single-file UX) ---
const advancedCards = reactive<Record<string, boolean>>({});
const processing = ref(false);
const processingStage = ref("");
const singleResult = ref<any>(null);
const analysisError = ref<any>(null);

// --- Batch state ---
const batchItems = ref<BatchItem[]>([]);
const activeTabIndex = ref(0);
const batchProcessing = ref(false);
const showBatchBanner = ref(false);
const isBatchMode = computed(() => batchItems.value.length > 0);

// The active result — from batch tab or single file
const activeItem = computed(
  () => batchItems.value[activeTabIndex.value] || null,
);
const result = computed(() => {
  if (isBatchMode.value) {
    return activeItem.value?.result || null;
  }
  return singleResult.value;
});

const selectedScoreMode = ref<ScoringMode>("strict");

watch(
  result,
  (value) => {
    selectedScoreMode.value =
      value?.scoringMode === "remediation" && value?.scoreProfiles?.remediation
        ? "remediation"
        : "strict";
  },
  { immediate: true },
);

const displayedCategories = computed(() =>
  categoriesForScoringMode(
    result.value?.categories,
    result.value?.scoreProfiles,
    selectedScoreMode.value,
  ),
);
const remediationModeActive = computed(
  () =>
    selectedScoreMode.value === "remediation" &&
    !!result.value?.scoreProfiles?.remediation,
);

function compareProps(catId: string) {
  const strict = result.value?.scoreProfiles?.strict?.categories?.find(
    (c: any) => c.id === catId,
  );
  const practical = result.value?.scoreProfiles?.remediation?.categories?.find(
    (c: any) => c.id === catId,
  );
  return {
    categoryId: catId,
    strictScore: strict?.score ?? null,
    strictGrade: strict?.grade ?? null,
    practicalScore: practical?.score ?? null,
    practicalGrade: practical?.grade ?? null,
    selectedMode: selectedScoreMode.value,
  };
}

// Show ModeCompareBox on an N/A card only when the two profiles actually
// disagree for that category (so the user can still see the side-by-side
// pills and click-to-switch mode without the box disappearing). Categories
// that are N/A in both modes (e.g. color_contrast) skip the box.
function hasCrossModeSignal(catId: string): boolean {
  const { strictScore, practicalScore } = compareProps(catId);
  return strictScore !== practicalScore;
}

// True when any batch item finished (done, error, or cancelled) or single result exists
const hasAnyResult = computed(() => {
  if (isBatchMode.value) {
    return batchItems.value.some(
      (i) =>
        i.status === "done" || i.status === "error" || i.status === "cancelled",
    );
  }
  return !!singleResult.value;
});

const showDropHint = ref(false);
let dropHintTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => resetSignal?.value,
  () => {
    // If already in default/idle state, show a hint to use the drop zone
    if (
      !result.value &&
      !processing.value &&
      !analysisError.value &&
      !batchProcessing.value
    ) {
      showDropHint.value = true;
      if (dropHintTimer) clearTimeout(dropHintTimer);
      dropHintTimer = setTimeout(() => {
        showDropHint.value = false;
      }, 4000);
      return;
    }
    clearResults();
  },
);

// --- Single file analysis (unchanged behavior) ---
async function analyzeFile(file: File) {
  processing.value = true;
  analysisError.value = null;
  singleResult.value = null;
  batchItems.value = [];
  Object.keys(advancedCards).forEach((k) => delete advancedCards[k]);

  try {
    processingStage.value = "Uploading…";
    const formData = new FormData();
    formData.append("file", file);

    processingStage.value = "Extracting PDF structure…";

    const response = await $fetch("/api/analyze", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    processingStage.value = "Building report…";
    await new Promise((r) => setTimeout(r, 300)); // Brief pause for UX

    singleResult.value = response;
  } catch (err: any) {
    if (err.status === 401) {
      navigateTo("/login");
      return;
    }
    analysisError.value = err.data || {
      error: "Analysis failed. Please try again.",
    };
  } finally {
    processing.value = false;
  }
}

// --- Batch analysis ---
async function analyzeBatch(files: File[]) {
  singleResult.value = null;
  analysisError.value = null;
  batchProcessing.value = true;
  activeTabIndex.value = 0;
  Object.keys(advancedCards).forEach((k) => delete advancedCards[k]);

  batchAbortController = new AbortController();
  const { signal } = batchAbortController;

  batchItems.value = files.map((file, i) => ({
    id: `batch-${i}-${Date.now()}`,
    filename: file.name,
    file,
    status: "queued",
    result: null,
    error: null,
  }));

  // Process with concurrency limit of 2 (matching MAX_CONCURRENT_ANALYSES)
  const concurrency = 2;
  let nextIndex = 0;

  async function processNext(): Promise<void> {
    while (nextIndex < batchItems.value.length) {
      if (signal.aborted) return;

      const idx = nextIndex++;
      const item = batchItems.value[idx];
      item.status = "processing";

      try {
        const formData = new FormData();
        formData.append("file", item.file);

        const response = await $fetch("/api/analyze", {
          method: "POST",
          body: formData,
          credentials: "include",
          signal,
        });

        item.result = response;
        item.status = "done";
        item.file = null as any; // Free browser memory
      } catch (err: any) {
        if (signal.aborted) {
          item.status = "cancelled";
          item.file = null as any;
          return;
        }
        if (err.status === 401) {
          navigateTo("/login");
          return;
        }
        item.error = err.data || { error: "Analysis failed." };
        item.status = "error";
        item.file = null as any; // Free browser memory
      }
    }
  }

  // Launch concurrent workers
  const workers = Array.from(
    { length: Math.min(concurrency, files.length) },
    () => processNext(),
  );
  await Promise.all(workers);

  // Mark remaining queued items as cancelled
  for (const item of batchItems.value) {
    if (item.status === "queued") {
      item.status = "cancelled";
      item.file = null as any;
    }
  }

  batchProcessing.value = false;
  batchAbortController = null;
  showBatchBanner.value = true;

  // Auto-select first successful result
  const firstDone = batchItems.value.findIndex((i) => i.status === "done");
  if (firstDone >= 0) activeTabIndex.value = firstDone;
}

function cancelBatch() {
  if (batchAbortController) {
    batchAbortController.abort();
  }
}

function switchTab(idx: number) {
  activeTabIndex.value = idx;
  clearShare(); // Reset share state on tab switch
}

function clearResults() {
  singleResult.value = null;
  analysisError.value = null;
  batchItems.value = [];
  activeTabIndex.value = 0;
  batchProcessing.value = false;
  showBatchBanner.value = false;
  clearShare();
}

// Keep categories anchored: a category that is scored in either profile (even
// if N/A in the currently-selected one) stays in Detailed Findings so the
// card does not jump sections when the user clicks a mode-compare pill that
// flips the global mode. Only categories that are N/A in both profiles drop
// to "Not Included in Scoring."
const scoredCategories = computed(() =>
  displayedCategories.value.filter(
    (c: any) => c.score !== null || hasCrossModeSignal(c.id),
  ),
);
const naCategories = computed(() =>
  displayedCategories.value.filter(
    (c: any) => c.score === null && !hasCrossModeSignal(c.id),
  ),
);
const hasAnyNaRow = computed(
  () =>
    naCategories.value.length > 0 ||
    scoredCategories.value.some((c: any) => c.score === null),
);

function formatMetaDate(iso: string | null): string | null {
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
  const m = result.value?.pdfMetadata;
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

const gradeColors: Record<string, string> = {
  A: "#22c55e",
  B: "#14b8a6",
  C: "#eab308",
  D: "#f97316",
  F: "#ef4444",
};

function catColor(cat: any): string {
  if (cat.grade) return gradeColors[cat.grade] || "#666";
  return "#555";
}

function sevColor(severity: string): string {
  const map: Record<string, string> = {
    Pass: "#22c55e",
    Minor: "#3b82f6",
    Moderate: "#eab308",
    Critical: "#ef4444",
  };
  return map[severity] || "#999";
}

function isAdvancedFinding(finding: string): boolean {
  return finding.startsWith("---") || finding.startsWith("  ");
}

function hasAdvancedFindings(findings: string[]): boolean {
  return findings.some((f) => isAdvancedFinding(f));
}

function toggleAdvanced(catId: string): void {
  advancedCards[catId] = !advancedCards[catId];
}

function filteredFindings(findings: string[], catId: string): string[] {
  if (advancedCards[catId]) return findings;
  return findings.filter((f) => !isAdvancedFinding(f));
}

function isGuidanceFinding(finding: string): boolean {
  const f = finding.toLowerCase();
  return (
    f.startsWith("how to fix:") ||
    f.startsWith("tip:") ||
    f.startsWith("fix:") ||
    f.startsWith("note:") ||
    f.startsWith("review these")
  );
}

function isAcrobatHeading(finding: string): boolean {
  return (
    finding.startsWith("---") && finding.toLowerCase().includes("adobe acrobat")
  );
}

function splitAcrobatGuide(
  findings: string[],
  catId: string,
): { regular: string[]; acrobat: string[] } {
  const filtered = filteredFindings(findings, catId);
  const idx = filtered.findIndex((f) => isAcrobatHeading(f));
  if (idx === -1) return { regular: filtered, acrobat: [] };
  return { regular: filtered.slice(0, idx), acrobat: filtered.slice(idx + 1) };
}

function findingIcon(cat: any): string {
  if (cat.score === null) return "–";
  if (cat.score >= 90) return "✓";
  if (cat.score >= 70) return "•";
  return "✗";
}

function findingIconStyle(cat: any): Record<string, string> {
  if (cat.score === null) return { color: "var(--icon-na)" };
  if (cat.score >= 90) return { color: "var(--icon-pass)" };
  if (cat.score >= 70) return { color: "var(--icon-info)" };
  if (cat.score >= 40) return { color: "var(--icon-na)" };
  return { color: "var(--icon-fail)" };
}

const copied = ref(false);

async function handleShare() {
  if (!result.value) return;
  await shareReport(result.value);
}

async function copyShareUrl() {
  if (!shareUrl.value) return;
  try {
    await navigator.clipboard.writeText(shareUrl.value);
  } catch {
    // Fallback for non-secure contexts or denied permissions
    const textarea = document.createElement("textarea");
    textarea.value = shareUrl.value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}

function emailShareUrl() {
  if (!shareUrl.value || !result.value) return;
  const subject = encodeURIComponent(
    `PDF Accessibility Report: ${result.value.filename}`,
  );
  const body = encodeURIComponent(
    `Here is the accessibility report for "${result.value.filename}":\n\n` +
      `Score: ${result.value.overallScore}/100 (Grade ${result.value.grade})\n\n` +
      `View the full report:\n${shareUrl.value}\n\n` +
      `This link expires in 15 days.`,
  );
  window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
