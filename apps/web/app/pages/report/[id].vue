<template>
  <div class="min-h-screen bg-[var(--surface-body)] text-[var(--text-primary)]">
    <main class="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
      <!-- Loading -->
      <div v-if="pending" class="text-center py-20">
        <div
          class="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"
        />
        <p class="text-[var(--text-muted)]">Loading report...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="text-center py-20">
        <div
          class="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4"
        >
          <span class="text-3xl">!</span>
        </div>
        <h2 class="text-xl font-semibold text-[var(--status-error)] mb-2">
          Report Not Available
        </h2>
        <p class="text-[var(--text-muted)] text-sm">{{ errorMessage }}</p>
      </div>

      <!-- Report -->
      <div v-else-if="data">
        <!-- Header -->
        <div class="text-center mb-8">
          <div class="flex justify-end mb-4">
            <button
              class="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              :aria-label="
                colorMode.value === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              "
              @click="toggleColorMode"
            >
              <svg
                v-if="colorMode.value === 'dark'"
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
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
                  d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
                />
              </svg>
            </button>
          </div>
          <h1 class="text-xl sm:text-2xl font-bold mb-1">
            {{ appName.replace("Audit", "Report") }}
          </h1>
          <p class="text-sm text-[var(--text-secondary)] mt-2">
            <a
              :href="auditUrl"
              class="text-[var(--link)] hover:text-[var(--link-hover)] underline transition-colors"
              >{{ appName }}</a
            >
          </p>
          <p class="text-sm text-[var(--text-secondary)] mt-2">
            {{
              data.sharedBy && data.sharedBy !== "anonymous"
                ? `Shared by ${data.sharedBy} on`
                : "Shared on"
            }}
            {{ formatDate(data.createdAt) }}
          </p>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Shareable links expire after 15 days
          </p>
        </div>

        <!-- Score Hero -->
        <div
          class="text-center mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-8"
        >
          <ScoreCard
            v-model:selected-mode="selectedScoreMode"
            :result="(data as any).report"
          />
        </div>

        <!-- Scanned warning -->
        <div
          v-if="data.report.isScanned"
          class="mb-6 rounded-xl bg-orange-500/10 border border-orange-500/30 p-4"
        >
          <p class="text-[var(--status-warning-orange)] font-medium text-sm">
            This PDF appears to be a scanned image. Screen readers cannot access
            its content. OCR and full remediation are required.
          </p>
        </div>

        <!-- Warnings -->
        <div
          v-if="data.report.warnings?.length"
          class="mb-6 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4"
        >
          <p
            v-for="w in data.report.warnings"
            :key="w"
            class="text-[var(--status-warning-yellow)] text-sm"
          >
            {{ w }}
          </p>
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
            Nine categories are weighted by impact — from text extractability
            (the most fundamental barrier) to reading order. Categories that
            don't apply are excluded and weights renormalized.
            <a
              :href="auditUrl"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >View the full scoring rubric</a
            >
            on the audit tool.
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
              v-if="data.report.scoreProfiles?.remediation"
              class="mt-1 text-xs text-[var(--text-muted)]"
            >
              <template v-if="remediationModeActive">
                Practical does not mean a different document. It is the same
                document viewed through a valid remediation/progress lens. The
                score, grade, and severity shown below now reflect the softer
                practical-readiness scoring, while Strict remains the valid
                semantics-first lens on that same file. Use Strict for agency
                publication and ADA/WCAG/ITTAA-oriented legal accessibility
                review. Practical also includes a dedicated PDF/UA-oriented
                category. Illinois IITAA 2.1 expressly references PDF/UA in
                <a
                  href="https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
                  >§504.2.2 PDF Export</a
                >
                for authoring tools, while E205.4 frames document-level
                electronic content accessibility through WCAG 2.1 for non-web
                documents.
              </template>
              <template v-else>
                Switching to Practical does not switch to a different document.
                It applies a different valid accessibility lens to the same
                file. Strict remains the better primary view for agency
                publication and ADA/WCAG/ITTAA-oriented legal accessibility
                review, while Practical is a valid remediation/progress view
                that adds a broader weighted schema including PDF/UA-oriented
                audits. Illinois IITAA 2.1 expressly references PDF/UA in
                <a
                  href="https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
                  >§504.2.2 PDF Export</a
                >
                for authoring tools, while E205.4 still frames non-web document
                accessibility through WCAG 2.1, so Strict remains the better
                primary view.
              </template>
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
                  class="text-center px-2 sm:px-3 py-2.5 font-mono"
                  :style="{ color: catColor(cat) }"
                >
                  {{ cat.score }}
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
                  <span v-else class="text-[var(--text-muted)]">—</span>
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
                  <span v-else class="text-[var(--text-muted)] text-xs">—</span>
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
                  N/A
                </td>
                <td class="text-center px-3 py-2.5 text-[var(--text-muted)]">
                  —
                </td>
                <td
                  class="text-center px-3 py-2.5 text-[var(--text-muted)] text-xs"
                >
                  N/A
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- PDF Metadata -->
        <div
          v-if="data.report.pdfMetadata"
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
              v-if="data?.report?.scoreProfiles"
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
                v-if="data?.report?.scoreProfiles && hasCrossModeSignal(cat.id)"
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

        <!-- Downloads + CTA -->
        <div
          class="mt-8 text-center rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6"
        >
          <div class="flex flex-col items-center gap-3">
            <p
              class="text-xs text-[var(--text-secondary)] uppercase tracking-wide font-medium"
            >
              Download Report
            </p>
            <div class="flex flex-wrap justify-center gap-3">
              <button
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--surface-body)] text-sm text-[var(--text-muted)] hover:bg-[rgba(34,197,94,0.15)] hover:text-[var(--accent-green)] hover:border-[rgba(34,197,94,0.3)] transition-colors"
                @click="downloadDocx"
              >
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
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Word
              </button>
              <button
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--surface-body)] text-sm text-[var(--text-muted)] hover:bg-[rgba(34,197,94,0.15)] hover:text-[var(--accent-green)] hover:border-[rgba(34,197,94,0.3)] transition-colors"
                @click="downloadMarkdown"
              >
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
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Markdown
              </button>
              <button
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--surface-body)] text-sm text-[var(--text-muted)] hover:bg-[rgba(34,197,94,0.15)] hover:text-[var(--accent-green)] hover:border-[rgba(34,197,94,0.3)] transition-colors"
                @click="downloadJson"
              >
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
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                JSON
              </button>
            </div>
            <p class="text-xs text-[var(--text-muted)]">
              Word and Markdown for reading, JSON for LLMs (includes WCAG
              mappings and remediation plan)
            </p>
          </div>
          <div class="mt-4 pt-4 border-t border-[var(--border-subtle)]">
            <p class="text-sm text-[var(--text-muted)] mb-3">
              Want to audit your own PDF?
            </p>
            <a
              :href="auditUrl"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-semibold transition-colors"
            >
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
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                />
              </svg>
              Audit Your PDF
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div class="mt-6 pt-6 border-t border-[var(--border)] text-center">
          <p class="text-xs text-[var(--text-muted)]">
            Report generated by
            <a
              :href="auditUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
              >{{ appName }}</a
            >
            — {{ formatDate(data.createdAt) }}
          </p>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { getWcagCriteria } from "~/utils/wcag";
import ModeCompareBox from "~/components/ModeCompareBox.vue";
import {
  type ScoringMode,
  categoriesForScoringMode,
  MODE_BUTTON_LABELS,
} from "~/utils/scoringProfiles";

definePageMeta({ layout: false });

const route = useRoute();
const id = route.params.id as string;
const config = useRuntimeConfig();
const auditUrl = config.public.siteUrl as string;
const appName = config.public.appName as string;
const colorMode = useColorMode();

function toggleColorMode() {
  colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
}

const advancedCards = reactive<Record<string, boolean>>({});
const selectedScoreMode = ref<ScoringMode>("strict");

const { data, pending, error } = await useFetch(`/api/reports/${id}`);

const { exportJSON, exportMarkdown, exportDocx } = useReportExport();

function downloadJson() {
  if (data.value) {
    exportJSON((data.value as any).report);
  }
}

function downloadMarkdown() {
  if (data.value) {
    exportMarkdown((data.value as any).report);
  }
}

function downloadDocx() {
  if (data.value) {
    exportDocx((data.value as any).report);
  }
}

const errorMessage = computed(() => {
  if (!error.value) return "";
  const status = (error.value as any)?.statusCode;
  if (status === 410) return "This report link has expired.";
  if (status === 404)
    return "This report was not found. It may have been removed or the link may be incorrect.";
  return "Unable to load this report. Please try again later.";
});

watch(
  data,
  (value) => {
    const report = (value as any)?.report;
    selectedScoreMode.value =
      report?.scoringMode === "remediation" &&
      report?.scoreProfiles?.remediation
        ? "remediation"
        : "strict";
  },
  { immediate: true },
);

const displayedCategories = computed(() =>
  categoriesForScoringMode(
    (data.value as any)?.report?.categories,
    (data.value as any)?.report?.scoreProfiles,
    selectedScoreMode.value,
  ),
);
const remediationModeActive = computed(
  () =>
    selectedScoreMode.value === "remediation" &&
    !!(data.value as any)?.report?.scoreProfiles?.remediation,
);

function compareProps(catId: string) {
  const report = (data.value as any)?.report;
  const strict = report?.scoreProfiles?.strict?.categories?.find(
    (c: any) => c.id === catId,
  );
  const practical = report?.scoreProfiles?.remediation?.categories?.find(
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

function hasCrossModeSignal(catId: string): boolean {
  const { strictScore, practicalScore } = compareProps(catId);
  return strictScore !== practicalScore;
}

const scoredCategories = computed(() =>
  displayedCategories.value.filter((c: any) => c.score !== null),
);
const naCategories = computed(() =>
  displayedCategories.value.filter((c: any) => c.score === null),
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
  const m = (data.value as any)?.report?.pdfMetadata;
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
</script>
