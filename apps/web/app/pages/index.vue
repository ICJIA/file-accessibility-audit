<template>
  <div>
    <!-- Error state (single file mode) -->
    <div
      v-if="!isBatchMode && analysisError"
      role="alert"
      class="mx-auto max-w-4xl mb-6 rounded-xl bg-red-500/10 border border-red-500/20 p-6"
    >
      <!-- Never an empty red box: describeAnalysisError() always supplies a
           message and a next step, and the fallback here covers an error
           object from any other source. -->
      <h3 class="font-semibold text-[var(--status-error)] mb-2">
        {{ analysisError.error || "The audit could not be completed." }}
      </h3>
      <p v-if="analysisError.details" class="text-sm text-[var(--text-muted)]">
        {{ analysisError.details }}
      </p>
      <UButton class="mt-4" variant="outline" color="neutral" @click="clearResults">
        Try Another File
      </UButton>
    </div>

    <!-- Results state (show only after all batch items finish, or single result) -->
    <div v-else-if="hasAnyResult && !batchProcessing">
      <!-- Batch completion: the focus target and announcement for a finished
           batch, as the results heading below is for a single file. Focus
           used to stay on the progress screen's now-removed Cancel button,
           so a screen-reader user was told nothing when the batch ended. -->
      <h2
        v-if="isBatchMode"
        ref="batchDoneHeadingRef"
        tabindex="-1"
        class="sr-only"
        data-testid="batch-done-heading"
      >
        {{ batchDoneSummary }}
      </h2>

      <!-- Batch file switcher — the scoreboard of per-file report cards.
           Owns the file-switching buttons AND the completion message (there is no
           separate banner: the element that announces "N reports" is the one
           used to switch between them). -->
      <BatchFileSwitcher
        v-if="batchItems.length > 1"
        :items="batchItems"
        :active-index="activeTabIndex"
        @switch="switchTab"
      />

      <!-- Every file in the batch side by side, sortable by score, with a
           CSV to take away. Above the per-file report it switches between. -->
      <BatchSummaryTable
        v-if="batchItems.length > 1"
        :items="batchItems"
        :active-index="activeTabIndex"
        @view="switchTab"
      />

      <!-- A finished batch too large for this tab's storage is lost on a
           reload; say so, since the browser's own leave-page prompt cannot
           say why. -->
      <p
        v-if="batchUnsaved"
        data-testid="batch-unsaved-note"
        class="mb-6 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-4 py-2 text-xs text-[var(--text-secondary)]"
      >
        These reports are kept only while this page stays open. Download the summary or the reports
        you need before you reload or close the tab.
      </p>

      <!-- Active tab error. An alert when the reader switches to this tab —
           but NOT at the moment a batch finishes on it: focus has just moved
           to the batch heading above, which already says how many files
           could not be analyzed, and two announcements at once talk over
           each other. -->
      <div
        v-if="activeItem?.status === 'error'"
        :role="batchJustFinished ? undefined : 'alert'"
        data-testid="batch-tab-error"
        class="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 p-6"
      >
        <h3 class="font-semibold text-[var(--status-error)] mb-2">
          {{ activeItem.error?.error || "Analysis failed" }}
        </h3>
        <p v-if="activeItem.error?.details" class="text-sm text-[var(--text-muted)]">
          {{ activeItem.error.details }}
        </p>
      </div>

      <!-- Active tab cancelled -->
      <div
        v-else-if="activeItem?.status === 'cancelled'"
        class="mb-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border)] p-6 text-center"
      >
        <p class="text-[var(--text-muted)]">Analysis was cancelled for this file.</p>
      </div>

      <!-- Active tab result -->
      <template v-if="result">
        <!-- Focus target for post-analysis focus management: visually
             hidden, but gives screen-reader users an unambiguous "results
             are ready" announcement + a sane place for focus to land
             instead of staying wherever it was (often the now-hidden drop
             zone). See focusResultsHeading() below. -->
        <h2 ref="resultsHeadingRef" tabindex="-1" class="sr-only" data-testid="results-heading">
          Analysis results for {{ result.filename }}
        </h2>

        <!-- Floating back-to-top button (mounted only while a result shows) -->
        <ScrollToTop />

        <!-- Quick actions: start over, or jump to the export options below -->
        <!-- In the Visual view these two live in the report hero, beside the
             view switch (the #actions slot below). -->
        <div v-if="viewMode !== 'visual'" class="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
          <button
            type="button"
            class="group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-[var(--border-input)] bg-[var(--surface-card-50)] px-4 py-5 sm:py-6 hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] transition-all"
            @click="clearResults"
          >
            <span
              class="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-[var(--surface-icon)] text-[var(--text-secondary)] group-hover:scale-105 transition-transform"
            >
              <svg
                class="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M16.023 9.348h4.992V4.356M4.982 19.644v-4.992h4.992M19.94 15.06a8.001 8.001 0 0 1-14.06 1.32M4.06 8.94a8.001 8.001 0 0 1 14.06-1.32"
                />
              </svg>
            </span>
            <span class="text-sm sm:text-base font-semibold text-[var(--text-heading)]">Reset</span>
            <span class="text-xs text-[var(--text-muted)] text-center"
              >Clear and analyze a new file</span
            >
          </button>
          <button
            type="button"
            class="group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-blue-500/50 bg-blue-500/10 px-4 py-5 sm:py-6 hover:border-blue-400 hover:bg-blue-500/20 transition-all"
            @click="scrollToExport"
          >
            <span
              class="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-ink)] group-hover:scale-105 transition-transform"
            >
              <svg
                class="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
            </span>
            <span class="text-sm sm:text-base font-semibold text-[var(--text-heading)]"
              >Export Results</span
            >
            <span class="text-xs text-[var(--text-muted)] text-center"
              >Jump to download &amp; share options</span
            >
          </button>
        </div>

        <!-- Before and after. Shown open, with its own heading, when this
             upload re-checks a file already checked in this tab; otherwise a
             control for adding an earlier report (a JSON export or a share
             link). Outside the exported subtree: it is about two reports,
             not part of this one. -->
        <ReportComparison
          v-if="compareOnTop"
          :result="result"
          :earlier="isBatchMode ? null : earlierResult"
          :recheck-of="!isBatchMode && earlierResult ? result.filename : null"
          @dismiss="dismissComparison"
        />

        <!-- The way back, first thing above the report (user request,
             2026-11-25): the only Reset was a small button among the hero's
             controls, and a reader who wanted to check another file went to
             the site title instead. Outside the exported subtree. -->
        <div class="mb-6">
          <button type="button" class="pk-btn" data-testid="start-over" @click="clearResults">
            <span aria-hidden="true" class="mr-2">←</span>Start over<span class="hidden sm:inline"
              >&nbsp;— check another file</span
            >
          </button>
        </div>

        <!-- Report content — the exact subtree the HTML export snapshots, so
             the download is identical to the live results. Interactive-only
             controls inside are marked data-export-exclude. -->
        <div data-report-content>
          <!-- Prominent filename banner — first thing identifying which file
             this result (and any download/print) belongs to, incl. batch tabs -->
          <ReportFileBanner
            v-if="viewMode !== 'visual'"
            :filename="result.filename"
            :page-count="result.pageCount"
            :is-scanned="result.isScanned"
            :file-type="result.fileType"
            class="mb-6"
          />

          <!-- Full width, above the report. It was a small right-aligned
               strip and got missed — a reader looking for the step-by-step
               plan could not find the control that shows it. -->
          <div v-if="viewMode !== 'visual'" class="mb-6">
            <ReportViewToggle :model-value="viewMode" @update:model-value="switchView" />
          </div>

          <!-- VISUAL VIEW -->
          <ReportVisualView
            v-if="viewMode === 'visual'"
            :result="result"
            :verapdf-url="String(runtimeConfig.public.verapdfUrl ?? '')"
          >
            <!-- In the Visual view the banner heads the summary column, beside
                 the grade block; the Detailed view keeps it above (see the
                 v-if on the banner there). Same component, same props. -->
            <template #banner>
              <ReportFileBanner
                compact
                :filename="result.filename"
                :page-count="result.pageCount"
                :is-scanned="result.isScanned"
                :file-type="result.fileType"
                class="mb-6"
              />
            </template>
            <!-- The view switch and Export, in the hero (Start over is above the
                 report). data-export-exclude:
                 controls have no place in a downloaded report. -->
            <template #actions>
              <div class="flex flex-wrap items-center gap-3" data-export-exclude>
                <ReportViewToggle
                  compact
                  :model-value="viewMode"
                  @update:model-value="switchView"
                />
                <button type="button" class="pk-btn pk-btn-brand" @click="scrollToExport">
                  Export Results
                </button>
              </div>
            </template>
            <!-- Before and after, as a block beside the standards block. When
                 this upload re-checks a file the comparison is the news, and
                 it stays at the top of the page instead (compareOnTop).
                 data-export-exclude: it is about two reports, not this one. -->
            <template v-if="!compareOnTop" #compare>
              <div data-export-exclude>
                <ReportComparison
                  :result="result"
                  :earlier="isBatchMode ? null : earlierResult"
                  :recheck-of="!isBatchMode && earlierResult ? result.filename : null"
                  @dismiss="dismissComparison"
                />
              </div>
            </template>
            <template #notice>
              <SourceDocumentNotice variant="audit" :file-type="result?.fileType" class="mb-4" />
            </template>
            <template #cta>
              <!-- Auto-Remediate (component self-hides on score ≥ 90 or when
               REMEDIATION feature is off). Identical element/props/wrapper to
               the Detailed view's instance below, so the default (Visual)
               view keeps the remediation CTA. -->
              <div
                v-if="result?.fileType === 'pdf'"
                class="mb-6 flex justify-center"
                data-export-exclude
              >
                <RemediateButton
                  :key="remediateKey"
                  :file="activeFile"
                  :expected-file="activeExpectedFile"
                  :input-score="result?.overallScore ?? null"
                  :categories="result?.categories"
                />
              </div>
            </template>
          </ReportVisualView>

          <!-- DETAILED VIEW -->
          <div v-else class="mx-auto max-w-4xl">
            <!-- Scanned warning banner -->
            <div
              v-if="result.isScanned"
              class="mb-6 rounded-xl bg-orange-500/10 border border-orange-500/30 p-4"
            >
              <p class="text-[var(--status-warning-orange)] font-medium text-sm">
                This PDF appears to be a scanned image. Screen readers cannot access its content.
                OCR and full remediation are required.
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
              class="text-center mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-8"
            >
              <ScoreCard
                :result="result"
                :show-filename="false"
                :show-pdf-ua-signals="false"
                :link-manual-review="true"
              />
            </div>

            <!-- BLOCKING information first. The PDF/UA panel below can show a
             green "Pass" on a document that still has Critical WCAG failures
             — they answer different questions, and only these decide whether
             the document is publishable. Ordered above the informational
             panels so an author (especially a non-technical one) cannot read
             a machine-check pass as "done" before ever seeing what blocks
             publication. Do not move these below PdfUaVerdict; the ordering
             is pinned by app/__tests__/reportSectionOrder.test.ts. -->
            <ReportActionBanner
              v-if="result?.categories"
              :categories="result.categories"
              :conformance="result.conformance"
              :file-type="result?.fileType"
              class="mb-4"
            />

            <IssuesSummary v-if="result?.categories" :categories="result.categories" class="mb-8" />

            <!-- Best practices — reported, never scored. Mirrors the Visual
                 view's reading order: obligations, then the optional work,
                 then what only a person can judge. Deliberately NOT in
                 ReportContent: TechnicalReport embeds that inside
                 ReportVisualView, so a section placed there would render
                 twice on one page in the Visual view. -->
            <BestPracticesSection v-if="result?.categories" :result="result" class="mb-8" />

            <!-- See the note on the shared-report page: IssuesSummary renders
                 nothing when there are no findings, which left a clean report's
                 Detailed view empty below the hero. -->
            <ManualReviewCard
              v-if="result?.categories"
              :categories="result.categories"
              :conformance="result.conformance"
              :file-type="result.fileType"
              :wcag-verdict="result.wcagVerdict"
              class="mb-8"
            />

            <!-- Same printable plan the Visual view offers. Someone reading the
                 detailed report is just as likely to be the person who has to go
                 and make the fixes. -->
            <PrintPlanButton :result="result" class="mb-8" />

            <!-- Auto-Remediate (component
             self-hides on score ≥ 90 or when REMEDIATION feature is off).
             In batch mode this targets the currently-active tab — each
             tab can be remediated independently. PDF-only: the remediation
             pipeline does not apply to Word, PowerPoint, or Excel documents,
             so gate on the positive fileType === 'pdf' (a negative !== check
             regresses every time a new format ships). -->
            <div
              v-if="result?.fileType === 'pdf'"
              class="mb-6 flex justify-center"
              data-export-exclude
            >
              <RemediateButton
                :key="remediateKey"
                :file="activeFile"
                :expected-file="activeExpectedFile"
                :input-score="result?.overallScore ?? null"
                :categories="result?.categories"
              />
            </div>

            <!-- Best path to a11y starts at the source document -->
            <div class="mb-8">
              <SourceDocumentNotice variant="audit" :file-type="result?.fileType" />
            </div>

            <!-- PDF/UA-1 signals (ISO 14289-1) — INFORMATIONAL. Lifted out of
             ScoreCard (which rendered it at the very top of the report, above
             the blocking issues) so conformance-flavoured markers can no longer
             be mistaken for a clean bill of health. Grouped here with the
             veraPDF verdict: both are PDF/UA, both are secondary to the WCAG
             issues above. -->
            <PdfUaSignalsCard
              v-if="result?.pdfUa"
              :signals="result.pdfUa"
              :categories="result?.categories"
              class="max-w-2xl mx-auto mb-6"
            />

            <!-- PDF/UA-1 machine-check verdict (veraPDF) — INFORMATIONAL, and
             deliberately below the blocking issues above: a "Pass" here does
             not mean the document is publishable, only that the formal
             machine-checkable PDF/UA-1 rules were met. Rendered for EVERY
             PDF (v1.91.0): when veraPDF did not run the component shows an
             explicit "did not run" disclosure instead of silently hiding —
             a missing machine-check layer must never read as a pass. -->
            <PdfUaVerdict
              v-if="result?.fileType === 'pdf'"
              :verdict="result.pdfUaVerdict ?? null"
              :grade="result?.grade"
              :categories="result?.categories"
              :verapdf-url="String(runtimeConfig.public.verapdfUrl ?? '')"
              class="mb-6"
            />
            <!-- v1.97.0: veraPDF's WCAG 2.2 second opinion; renders nothing
                 when the field is absent (pre-feature reports, feature off). -->
            <WcagMachineChecks
              v-if="result?.fileType === 'pdf'"
              :verdict="result.wcagVerdict"
              :verapdf-url="String(runtimeConfig.public.verapdfUrl ?? '')"
              class="mb-6"
            />

            <!-- The report's findings regrouped under the Matterhorn
             Protocol's 31 checkpoints (v1.93.0). Collapsed by default;
             self-hides for non-PDF reports. Never a second score. -->
            <MatterhornReportPanel v-if="result" :result="result" class="mb-6" />

            <MethodologyCard :file-type="result?.fileType" />

            <ReportContent :result="result" />
          </div>
        </div>
        <!-- /report content -->

        <!-- Download and Share side by side; the AI summary below them across
             the full width — it holds a long text preview that needs the room. -->
        <div class="mt-1 grid gap-1 lg:grid-cols-3 items-stretch">
          <!-- Export & Share -->
          <div
            id="export-section"
            class="lg:col-span-3 grid gap-1 sm:grid-cols-2 report-actions scroll-mt-6"
          >
            <!-- Download block -->
            <div class="bg-[var(--surface-card)] p-5 sm:p-7 min-w-0">
              <p class="pk-label text-[var(--text-muted)] mb-4">Download Report</p>
              <ReportDownloadBar :result="result" />
            </div>

            <!-- Share block -->
            <div class="bg-[var(--surface-card)] p-5 sm:p-7 min-w-0">
              <!-- Share row -->
              <p class="pk-label text-[var(--text-muted)] mb-4">Share Report</p>

              <div v-if="!shareUrl">
                <div ref="shareCreateRef" class="flex flex-wrap gap-2 justify-start">
                  <UButton
                    variant="soft"
                    color="neutral"
                    size="sm"
                    :loading="sharing"
                    @click="handleShare"
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
                <p class="text-xs text-[var(--text-muted)] mt-2">
                  Creates a public link anyone can view. Expires in {{ shareExpiryDays }} days.
                </p>
                <!-- role="alert": the message appears without a page change, so
                 it has to announce itself. Focus stays on the button, which
                 is still here to try again. -->
                <p
                  v-if="shareError"
                  role="alert"
                  data-testid="share-error"
                  class="text-xs text-[var(--status-error)] mt-2"
                >
                  {{ shareError }}
                </p>
              </div>

              <!-- Share URL display -->
              <div v-else class="space-y-3">
                <div class="flex gap-2">
                  <!-- The Create button is removed the moment the link exists,
                   taking keyboard focus with it — handleShare() moves focus
                   here, and the label says what the field holds. -->
                  <input
                    ref="shareUrlInputRef"
                    type="text"
                    aria-label="Shareable report link"
                    data-testid="share-url"
                    :value="shareUrl"
                    readonly
                    class="flex-1 bg-[var(--surface-body)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] font-mono select-all"
                    @focus="($event.target as HTMLInputElement).select()"
                  />
                  <UButton variant="soft" color="neutral" size="sm" @click="copyShareUrl">
                    {{ copied ? "Copied!" : "Copy" }}
                  </UButton>
                </div>
                <div class="flex flex-wrap gap-2">
                  <UButton variant="soft" color="primary" size="sm" @click="emailShareUrl">
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
                  <UButton variant="ghost" color="neutral" size="xs" @click="dismissShare">
                    Dismiss
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <!-- AI-Ready Analysis — shown whenever the hand-off has something to
             fix: a Critical or Moderate category, or a confirmed WCAG 2.1
             failure in a category that is only Minor in extent. -->
          <div
            v-if="hasRemediationItems"
            data-testid="ai-analysis-panel"
            class="lg:col-span-3 bg-[var(--surface-card)] p-5 sm:p-7 min-w-0"
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
                <h2 class="text-base sm:text-lg font-semibold text-[var(--text-heading)]">
                  For Use with AI Assistants
                </h2>
                <p class="text-xs sm:text-sm text-[var(--text-muted)] mt-1 leading-relaxed">
                  Copy a plain-text summary of this audit — what's working, what isn't, WCAG
                  references, and guided questions — into ChatGPT, Claude, or any LLM to study the
                  results or get step-by-step remediation advice.
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
                ><span>Every category that lost points — Critical, Moderate and Minor</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-purple-400 mt-0.5">•</span
                ><span>The findings and the WCAG 2.1 criteria each one fails</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-purple-400 mt-0.5">•</span
                ><span>What passed, what this tool could not check, and questions for the AI</span>
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

            <div class="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-2">
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
            <p v-if="aiCopyError" class="text-xs text-[var(--status-error)] mt-2 text-center">
              Clipboard copy failed. Use the preview above to select and copy manually.
            </p>
          </div>
        </div>

        <div class="mt-8">
          <UButton
            block
            size="xl"
            variant="solid"
            color="neutral"
            class="justify-start px-7 py-6 text-2xl sm:text-3xl font-black tracking-tight cursor-pointer"
            @click="clearResults"
          >
            Analyze More Files
          </UButton>
        </div>
      </template>

      <!-- Always show reset button on error/cancelled tabs -->
      <div
        v-if="!result && (activeItem?.status === 'error' || activeItem?.status === 'cancelled')"
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
      class="mx-auto max-w-4xl"
      :items="batchItems"
      @cancel="cancelBatch"
    />

    <!-- Processing overlay (single file) -->
    <ProcessingOverlay
      v-else-if="processing"
      class="mx-auto max-w-4xl"
      :stage="processingStage"
      :rotate="processingRotate"
      :file-type="processingFileType"
      :filename="processingFilename"
      :steps="processingSteps"
    />

    <!-- Drop zone (idle state) -->
    <div v-else>
      <!-- Plakat hero: the brand block carries the headline and what the tool
           does; the upload box and the by-link form sit beside it. -->
      <section class="grid lg:grid-cols-12 gap-y-6 lg:gap-x-8 mb-6">
        <div
          class="pk-block lg:col-span-7 flex flex-col justify-between gap-10 p-6 sm:p-10 lg:min-h-[36rem]"
        >
          <p class="pk-label flex flex-wrap justify-between gap-x-6 gap-y-1">
            <span>Document accessibility check</span>
            <span>WCAG 2.1 A/AA</span>
          </p>
          <div>
            <h2 class="pk-display text-[clamp(2.5rem,6.2vw,5rem)]">
              {{ heroTitle }}
            </h2>
            <!-- Two short sentences (2026-11-24): what you upload and what you
                 get; then the standard the grade measures. It was one 90-word
                 sentence that led with WCAG 2.2's criteria for interactive forms
                 — true, and not what a first-time visitor needs before the drop
                 zone. That nuance has its own page, linked on the line below. -->
            <p class="mt-8 max-w-xl font-medium leading-relaxed" data-testid="hero-intro">
              Upload a {{ heroUploadNoun }} and get an accessibility grade with a plain-language
              list of what to fix. The grade measures
              <a
                href="https://www.w3.org/WAI/WCAG21/quickref/"
                target="_blank"
                rel="noopener noreferrer"
                class="font-semibold"
                >WCAG 2.1</a
              >
              A/AA — the standard
              <a
                href="https://www.ada.gov/resources/title-ii-rule/"
                target="_blank"
                rel="noopener noreferrer"
                class="font-semibold"
                >ADA Title II</a
              >
              and the Illinois
              <a
                href="https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html"
                target="_blank"
                rel="noopener noreferrer"
                class="font-semibold"
                >IITAA 2.1</a
              >
              require.
            </p>
            <p class="mt-4 text-sm" data-testid="hero-links">
              <NuxtLink to="/sample-report" :prefetch="false" class="font-semibold"
                >See a sample report</NuxtLink
              >{{ " " }}<span aria-hidden="true">·</span>{{ " " }}
              <NuxtLink to="/wcag-2-2" :prefetch="false">What about WCAG 2.2?</NuxtLink>
            </p>
          </div>
        </div>

        <div class="lg:col-span-5 flex flex-col">
          <!-- Drop hint banner -->
          <Transition name="fade">
            <div
              v-if="showDropHint"
              class="mb-4 rounded-xl bg-blue-500/10 border border-blue-500/25 px-5 py-3 text-center"
            >
              <p class="text-sm text-blue-400 font-medium">
                Drop a {{ heroUploadNoun }} on the area below, or click it to browse your files.
              </p>
            </div>
          </Transition>

          <DropZone class="flex-1" @file-selected="analyzeFile" @files-selected="analyzeBatch" />

          <!-- The same audit, for a document that is already on the web. -->
          <UrlAuditForm :pending="pendingLink" @submit="analyzeUrl" />
        </div>
      </section>

      <AnnouncementBanner />
    </div>

    <!-- Home-page material: how the tool works, the Matterhorn checklist and
         the feature tiles. Shown with the upload box and while
         a file is being checked — not under a finished report, which shows
         the report's own data and nothing else (user request, 2026-11-25). -->
    <template v-if="!showingReport">
      <div class="mx-auto max-w-4xl">
        <LazyTechnicalExplainer hydrate-on-visible />

        <!-- Checkpoint-by-checkpoint Matterhorn Protocol coverage — the trust
         disclosure, placed directly beneath the Technical Details expander
         so it sits near the fold instead of below every tile (user request,
         v1.94.0). Collapsible; the What's New banner's /#matterhorn link
         auto-opens it. Data in ~/data/matterhorn.ts; honesty-critical
         entries pinned by matterhornChecklist.test.ts. -->
        <MatterhornChecklist />
      </div>

      <!-- Feature stats (infographic style) -->
      <div class="mt-20 mb-2">
        <h2 class="pk-display text-4xl sm:text-6xl text-[var(--text-heading)]">
          What This Tool Does
        </h2>
        <p class="mt-5 text-base text-[var(--text-secondary)] max-w-3xl">
          Audit any PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) document for WCAG 2.1 AA
          accessibility — and (optionally) auto-remediate PDFs — all on infrastructure you control,
          with no AI and no per-document fees.
        </p>
      </div>

      <div class="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
        <!-- Audit -->
        <div class="pk-rule pt-4">
          <!-- "9" counts SCORED (weighed) categories — the basis llms.txt and
             MethodologyCard use: PDF 9, PowerPoint 9, Word 8, Excel 6 (7 until v1.175.0, when Sheet Names became reported-not-graded). The
             report additionally shows always-"Not Assessed" placeholder rows
             (PDF displays 10 in total), so do NOT "correct" this to 10 —
             that recount happened once (v1.73.1's README) and was itself the
             error, reverted in v1.73.2. -->
          <div class="pk-display font-black text-6xl sm:text-7xl text-[var(--text-heading)] mb-5">
            9
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">
            WCAG categories audited
          </div>
          <p class="text-xs text-[var(--text-muted)] leading-relaxed">
            <!-- "Serious" was named here for a long time and the scorer has never
               emitted it: the severities are Critical / Moderate / Minor. On a
               page whose job is telling staff what the grades mean, inventing a
               fourth level is the same class of error as the grade cap fixed. -->
            Each document scored across up to 9 categories, counting only
            <strong>WCAG 2.1 Level A/AA</strong> criteria — the standard ADA Title II and the
            Illinois IITAA require. Critical / Moderate / Minor severity per category so you know
            what to fix first, and an A–F letter grade capped by the worst issue found — so a
            document is never graded above its most serious problem.
          </p>
        </div>

        <!-- Auto-Remediate -->
        <div class="pk-rule pt-4">
          <div class="pk-display font-black text-6xl sm:text-7xl text-[var(--text-heading)] mb-5">
            <!-- Not "F → A" (user decision 2026-11-18): auto-tagging cannot
               write image descriptions, and real files rarely reach an A from
               it alone. The tile says what the step does. -->
            Auto-tag
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">
            Auto-remediation (optional)
          </div>
          <p class="text-xs text-[var(--text-muted)] leading-relaxed">
            Tags untagged PDFs and writes the title and language you give it, using the qpdf →
            <a
              href="https://github.com/opendataloader-project/opendataloader-pdf"
              target="_blank"
              rel="noopener noreferrer"
              class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
              >OpenDataLoader</a
            >
            →
            <a
              href="https://verapdf.org/"
              target="_blank"
              rel="noopener noreferrer"
              class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
              >veraPDF</a
            >
            pipeline. A result that makes any category worse, or fails a WCAG rule the original
            passed, is thrown away. It cannot describe images, so most files still need a person to
            finish them.
          </p>
        </div>

        <!-- Standards alignment -->
        <div class="pk-rule pt-4">
          <!-- v1.94.0: veraPDF runs the ua2 flavour when a document declares
             PDF/UA-2, so the headline is the family, not just part 1. -->
          <div class="pk-display font-black text-6xl sm:text-7xl text-[var(--text-heading)] mb-5">
            PDF/UA
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">Standards aligned</div>
          <p class="text-xs text-[var(--text-muted)] leading-relaxed">
            WCAG 2.1 Level AA, ADA Title II (compliance due April 26, 2027 for larger entities, 2028
            for smaller), Illinois IITAA 2.1, and PDF/UA-1 (ISO 14289-1) via veraPDF — with PDF/UA-2
            (ISO 14289-2) validated when a document declares it. Full lifecycle audit trail with
            deletion verification for compliance reporting.
          </p>
        </div>

        <!-- Privacy -->
        <div class="pk-rule pt-4">
          <div class="pk-display font-black text-6xl sm:text-7xl text-[var(--text-heading)] mb-5">
            0
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">Files retained</div>
          <p class="text-xs text-[var(--text-muted)] leading-relaxed">
            Uploaded files exist on the server only as long as the pipeline requires. Audited files:
            in-memory, gone in seconds. Remediated outputs: deleted on first download or after 30
            minutes — and the deletion is then checked, not assumed.
          </p>
        </div>

        <!-- No AI / no third-party -->
        <div class="pk-rule pt-4">
          <div class="pk-display font-black text-6xl sm:text-7xl text-[var(--text-heading)] mb-5">
            $0
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">
            No AI, no third-party APIs
          </div>
          <p class="text-xs text-[var(--text-muted)] leading-relaxed">
            Every audit step runs on this server. No data is sent to vision models, hosted AI
            services, or commercial PDF/Office SDKs. The toolchain (qpdf, pdfjs, OpenDataLoader,
            veraPDF) is entirely open source — no per-document fees, no SDK licensing. Page views
            are counted by ICJIA's own self-hosted, cookie-free
            <!-- :prefetch="false" — /data-retention is a ~600 KB chunk, and a
               link in a tile at the bottom of the home page is no reason to
               download it for every visitor. -->
            <NuxtLink
              to="/data-retention"
              :prefetch="false"
              class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
              >Plausible</NuxtLink
            >
            — never document data.
          </p>
        </div>

        <!-- Open source / cost -->
        <div class="pk-rule pt-4">
          <div class="pk-display font-black text-6xl sm:text-7xl text-[var(--text-heading)] mb-5">
            100%
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">Open source</div>
          <p class="text-xs text-[var(--text-muted)] leading-relaxed">
            Every line of code is on
            <a
              href="https://github.com/ICJIA/file-accessibility-audit"
              target="_blank"
              rel="noopener noreferrer"
              class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
              >GitHub</a
            >
            — fork it, audit it, run it on your own infrastructure. Underlying tools use Apache 2.0
            / MIT / MPL licenses. Designed for state agencies that need control over their
            accessibility pipeline.
          </p>
        </div>

        <!-- Use and testing: three more cells of this grid. -->
        <HomeLiveNumbers />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// The landing hero uses the wide (poster) measure; the results, progress and
// error states below are held to the reading measure in the template.
definePageMeta({ wide: true });

import ReportActionBanner from "~/components/ReportActionBanner.vue";
import IssuesSummary from "~/components/IssuesSummary.vue";
import ReportFileBanner from "~/components/ReportFileBanner.vue";
import MethodologyCard from "~/components/MethodologyCard.vue";
import ScrollToTop from "~/components/ScrollToTop.vue";
import ReportDownloadBar from "~/components/ReportDownloadBar.vue";
import ReportVisualView from "~/components/ReportVisualView.vue";
import ReportViewToggle from "~/components/ReportViewToggle.vue";
import BatchFileSwitcher from "~/components/BatchFileSwitcher.vue";
import MatterhornChecklist from "~/components/MatterhornChecklist.vue";
import MatterhornReportPanel from "~/components/MatterhornReportPanel.vue";
import { uploadNoun } from "~/utils/uploadFormats";
import {
  analyzeWithProgress,
  resumeWithProgress,
  describeAnalysisError,
  POLL_LOST_CONTACT_MESSAGE_NO_RESUME,
  type AnalyzeJobStatus,
  type AnalyzeJobStepKey,
} from "~/utils/analyzeJob";
import { runBatch } from "~/utils/batchRun";
import { aiAnalysisHasFixes } from "~/utils/exportFormats/aiAnalysis";
import { fileTypeLabel } from "~/utils/reportBanner";
import {
  clearAuditSession,
  readAuditSession,
  saveFinishedAudit,
  saveRunningAudit,
} from "~/utils/auditSession";
import UrlAuditForm from "~/components/UrlAuditForm.vue";
import BatchSummaryTable from "~/components/BatchSummaryTable.vue";
import ReportComparison from "~/components/ReportComparison.vue";
import {
  clearPreviousResult,
  readPreviousResult,
  savePreviousResult,
} from "~/utils/comparePrevious";
import { clearBatchSession, readBatchSession, saveBatchSession } from "~/utils/batchSession";
import { describeUrlAuditError, isApprovedHost } from "~/utils/urlAudit";
import { ANALYZE_JOB, SHARED_REPORTS } from "../../../../audit.config";
import { type AnalysisResult } from "@file-audit/shared";
import type { PrefillError } from "~/composables/usePrefill";

// Word / PowerPoint / Excel support can each be disabled server-side
// (DOCX_ENABLED / PPTX_ENABLED / XLSX_ENABLED = "false"); mirror that in the
// hero copy so we never invite a format the API will reject.
const runtimeConfig = useRuntimeConfig();
const uploadFlags = computed(() => ({
  docx: runtimeConfig.public.docxEnabled !== false,
  pptx: runtimeConfig.public.pptxEnabled !== false,
  xlsx: runtimeConfig.public.xlsxEnabled !== false,
}));
const anyOfficeFormat = computed(
  () => uploadFlags.value.docx || uploadFlags.value.pptx || uploadFlags.value.xlsx,
);
const heroTitle = computed(() =>
  anyOfficeFormat.value
    ? `Check your ${uploadNoun(uploadFlags.value, "and")} files for accessibility`
    : "Check your PDFs for accessibility",
);
const heroUploadNoun = computed(() => `${uploadNoun(uploadFlags.value)} file`);
// How long a share link lives — read from the one place that decides it
// (audit.config.ts SHARED_REPORTS.EXPIRY_DAYS), not typed out twice here.
const shareExpiryDays = SHARED_REPORTS.EXPIRY_DAYS;

interface BatchItem {
  id: string;
  filename: string;
  // Nulled out once the item reaches a terminal state (done/error/cancelled)
  // to free the in-memory File — utils/batchRun.ts does it. So on a finished
  // batch this is ALWAYS null; see activeFile / activeExpectedFile below.
  file: File | null;
  /** The file's size in bytes — kept after the File is freed, so a file
   *  re-selected for repair can be checked against the one that was audited. */
  fileSize: number | null;
  status: "queued" | "processing" | "done" | "error" | "cancelled";
  result: AnalysisResult | null;
  error: PrefillError | null;
  /** Set by runBatch while this file waits out a busy server. */
  note?: string | null;
}

// The batch run currently OWNING the page, if any. Each run gets its own
// AbortController and its own items array, both captured in its closure — a
// run that is no longer `batchRun` is stale and must never write to page
// state (see utils/batchRun.ts for what went wrong when one did).
let batchRun: { controller: AbortController } | null = null;
// The same for a single-file audit (an upload, or one rejoined after a page
// load). Reset aborts it, and a run that is no longer `singleRun` writes
// nothing — its poll used to keep going and drop a finished report, or an
// error, onto the page the visitor had just cleared.
let singleRun: { controller: AbortController } | null = null;
function beginSingleRun() {
  singleRun?.controller.abort();
  const run = { controller: new AbortController() };
  singleRun = run;
  return run;
}

const resetSignal = inject<Ref<number>>("resetSignal");
const {
  shareReport,
  shareUrl,
  shareError,
  sharedReport,
  sharing,
  clearShare,
  copyAiAnalysis,
  aiCopied,
  buildAiAnalysisText,
} = useReportExport();

const { mode: viewMode, setMode: setViewMode } = useReportView();
// A finished report (or batch of reports) is on screen — the same condition
// the template's results branch uses.
const showingReport = computed(() => hasAnyResult.value && !batchProcessing.value);
// Where the before-and-after comparison sits: above the report in the
// Detailed view and whenever this upload re-checks an earlier file; as a block
// near the foot of the Visual view otherwise.
const compareOnTop = computed(
  () => viewMode.value !== "visual" || (!isBatchMode.value && !!earlierResult.value),
);
// Switching view replaces the control that was just pressed (the Visual view
// carries its own compact switch in the report hero), so put keyboard focus
// back on the pressed option of whichever switch is now on the page.
async function switchView(mode: Parameters<typeof setViewMode>[0]) {
  setViewMode(mode);
  await nextTick();
  document.querySelector<HTMLElement>('[data-view-toggle] button[aria-pressed="true"]')?.focus();
}

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
// The same test the AI text itself uses to decide it has fixes to ask about
// (exportFormats/aiAnalysis.ts) — so the panel is never hidden for a report
// whose text says there is work to do.
const hasRemediationItems = computed(() => aiAnalysisHasFixes(result.value));

// --- Single file state (preserved for single-file UX) ---
const processing = ref(false);
const processingStage = ref("");
// v1.99.0: single-file uploads use the overlay's rotating check queue (the
// server reports nothing until done, so index.vue's old hand-set stage
// strings sat frozen — and claimed "PDF structure" for Word files). URL
// audits keep narrating their own real milestones via processingStage.
const processingRotate = ref(false);
const processingFileType = ref<"pdf" | "docx" | "pptx" | "xlsx" | null>(null);
// The file the overlay is currently working on, so the spinner can say which
// document it belongs to. Cleared with the other processing state.
const processingFilename = ref<string | null>(null);
// v1.100.0: REAL per-pass step rows from the job endpoints. Null until the
// first status poll answers, so the overlay opens in rotate mode and
// upgrades to observed states the moment they exist.
const processingSteps = ref<Array<{
  key: string;
  label: string;
  state: "pending" | "running" | "done" | "skipped";
  startedAt?: number;
}> | null>(null);
const JOB_STEP_LABELS: Record<string, string> = {
  analysis: "Audit engine — structure, content, and scoring",
  veraPdfUa: "veraPDF: PDF/UA conformance",
  veraPdfWcag: "veraPDF: WCAG machine checks",
};
function mapJobSteps(status: AnalyzeJobStatus) {
  processingSteps.value = (Object.keys(JOB_STEP_LABELS) as AnalyzeJobStepKey[]).map((key) => ({
    key,
    label: JOB_STEP_LABELS[key]!,
    state: status.steps[key]?.state ?? "pending",
    startedAt: status.steps[key]?.startedAt,
  }));
}
function fileTypeFromName(name: string): "pdf" | "docx" | "pptx" | "xlsx" | null {
  const m = /\.(pdf|docx|pptx|xlsx)$/i.exec(name);
  return m ? (m[1]!.toLowerCase() as "pdf" | "docx" | "pptx" | "xlsx") : null;
}
const singleResult = ref<AnalysisResult | null>(null);
const singleFile = ref<File | null>(null);
// The size of the single file that was audited, when this page load saw it.
const singleFileSize = ref<number | null>(null);
const analysisError = ref<PrefillError | null>(null);

// --- Before and after (2026-11-24) ---
// When a file is uploaded again under the same name in this tab, the report
// it replaces is kept so the new one can say what changed.
//   lastSingleResult — the most recent single report this tab produced. It
//     outlives Reset on purpose: "Reset, then upload the fixed file" is the
//     ordinary way to re-check. Memory only; gone with the page.
//   earlierResult    — the earlier report being compared against RIGHT NOW,
//     set when the new upload's filename matches. Also kept in this tab's
//     sessionStorage (utils/comparePrevious.ts) so a reload keeps the
//     comparison, exactly as the current report is kept.
// Nothing is sent anywhere, and a different filename drops both.
let lastSingleResult: AnalysisResult | null = null;
const earlierResult = ref<AnalysisResult | null>(null);
const sameName = (a: string, b: string) =>
  a.normalize("NFC").toLowerCase() === b.normalize("NFC").toLowerCase();
function dismissComparison() {
  earlierResult.value = null;
  clearPreviousResult();
}
/** Call when a single report arrives for `filename`. */
function offerComparison(response: AnalysisResult) {
  const candidate = lastSingleResult;
  if (candidate && candidate !== response && sameName(candidate.filename, response.filename)) {
    earlierResult.value = candidate;
    savePreviousResult({
      result: candidate as unknown as Record<string, any>,
      appVersion: String(runtimeConfig.public.appVersion ?? ""),
    });
  } else {
    dismissComparison();
  }
  lastSingleResult = response;
}

// Focus target for post-analysis focus management (Task F6) — see the
// sr-only <h2 ref="resultsHeadingRef"> at the top of the results template.
const resultsHeadingRef = ref<HTMLElement | null>(null);
function focusResultsHeading() {
  nextTick(() => {
    resultsHeadingRef.value?.focus();
  });
}

// --- Batch state ---
const batchItems = ref<BatchItem[]>([]);
const activeTabIndex = ref(0);
const batchProcessing = ref(false);
const isBatchMode = computed(() => batchItems.value.length > 0);

// The active result — from batch tab or single file
const activeItem = computed(() => batchItems.value[activeTabIndex.value] || null);
const result = computed(() => {
  if (isBatchMode.value) {
    return activeItem.value?.result || null;
  }
  return singleResult.value;
});

// Active File — used by RemediateButton. Held only for a single-file upload
// made in this page load. In a batch it is ALWAYS null: runBatch frees each
// File the moment its audit finishes (utils/batchRun.ts — up to
// BATCH.MAX_FILES documents of 25 MB each do not belong in memory), and a
// report restored after a reload never had one. RemediateButton then asks
// for the file again and checks the answer against `activeExpectedFile`.
const activeFile = computed<File | null>(() => {
  if (isBatchMode.value) {
    return activeItem.value?.file || null;
  }
  return singleFile.value;
});
// What the page still knows about the audited file once the File itself is
// gone: its name, and its size when it was uploaded in this page load.
// RemediateButton refuses a re-selected file that does not match.
const activeExpectedFile = computed(() => {
  if (!result.value) return null;
  if (isBatchMode.value) {
    const item = activeItem.value;
    return item ? { name: item.filename, size: item.fileSize ?? null } : null;
  }
  return { name: result.value.filename, size: singleFile.value?.size ?? singleFileSize.value };
});
// One RemediateButton instance per report: its title and language fields are
// seeded from the report, and a reused instance kept document A's title on
// screen while document B's file was sent.
const remediateKey = computed(() =>
  isBatchMode.value
    ? `batch:${activeItem.value?.id ?? activeTabIndex.value}`
    : `single:${result.value?.filename ?? ""}`,
);

const hasAnyResult = computed(() => {
  if (isBatchMode.value) {
    return batchItems.value.some(
      (i) => i.status === "done" || i.status === "error" || i.status === "cancelled",
    );
  }
  return !!singleResult.value;
});

// Publish "an audit is running" so the navigation guard and the site-title
// reset can warn before discarding it. Both states count: a single file is an
// in-flight fetch owned by this page, a batch is a client-side loop — neither
// survives leaving. See composables/useAuditInProgress.ts.
const auditInProgress = useAuditInProgress();
// True only while the CURRENT single-file audit is one a reloaded tab could
// rejoin: the job endpoints answered, and its id and token actually reached
// sessionStorage. Both halves matter — the synchronous fallback has no job to
// rejoin, and a storage write can be refused (blocked site data, full quota),
// in which case leaving really does lose the audit and the warning is right.
const singleAuditResumable = ref(false);
watchEffect(() => {
  auditInProgress.value =
    (processing.value && !singleAuditResumable.value) || batchProcessing.value;
});
// REQUIRED, not tidiness: after a confirmed departure this page unmounts while
// the flag is still true, and a stuck flag would prompt on every later click.
onBeforeUnmount(() => {
  auditInProgress.value = false;
  // A batch still running has no page left to report to.
  batchRun?.controller.abort();
  batchRun = null;
  // A single-file poll likewise — but its server job and its session are
  // left alone, so the audit can still be rejoined after a navigation.
  singleRun?.controller.abort();
  singleRun = null;
});

// --- Rejoining an audit after a page load (v1.147.0) ---
// The visitor clicked "Status" (a Nitro route, so a real document
// navigation), or reloaded, or followed any in-app link, while their document
// was being audited. The audit never stopped — it runs on the server, and its
// job holds the finished report until a page collects it — so all this has to
// do is find the job again and carry on watching it.
//
// Client-only: sessionStorage does not exist during SSR, and restoring on the
// server would render a report into the HTML of a page anyone could be
// served.
onMounted(async () => {
  // ?prefill= owns the page when present: it is an explicit instruction to
  // audit a named URL, and it must not lose to whatever the tab did last.
  if (new URLSearchParams(window.location.search).has("prefill")) return;

  const session = readAuditSession({
    now: Date.now(),
    appVersion: String(runtimeConfig.public.appVersion ?? ""),
    ttlMs: ANALYZE_JOB.TTL_MS,
  });
  if (!session) {
    restoreBatch();
    return;
  }

  if (session.kind === "result") {
    singleResult.value = session.result;
    lastSingleResult = session.result;
    // A re-check's earlier report, if this tab was showing a comparison.
    const previous = readPreviousResult({
      appVersion: String(runtimeConfig.public.appVersion ?? ""),
    });
    earlierResult.value =
      previous && sameName(String(previous.filename), session.result.filename)
        ? (previous as unknown as AnalysisResult)
        : null;
    // The File itself is not storable — not serialisable, and a 7 MB PDF
    // would blow the quota that the report barely fits inside. The one
    // consumer, RemediateButton, already handles a null file by opening a
    // picker (it has to: shared report views never had one either), so a
    // restored report offers remediation with one extra click.
    singleFile.value = null;
    return;
  }

  // A job that was still running. Show the same overlay it had before, then
  // pick the polling back up where it left off.
  processing.value = true;
  singleAuditResumable.value = true;
  processingRotate.value = true;
  processingFileType.value = session.fileType;
  processingFilename.value = session.filename;
  processingSteps.value = null;
  processingStage.value = "";
  analysisError.value = null;

  const run = beginSingleRun();
  try {
    const response = await resumeWithProgress(
      session.jobId,
      session.token,
      $fetch as never,
      mapJobSteps,
      { signal: run.controller.signal },
    );
    if (singleRun !== run) return;
    singleResult.value = response;
    lastSingleResult = response;
    saveFinishedAudit({
      result: response,
      filename: session.filename,
      savedAt: Date.now(),
      appVersion: String(runtimeConfig.public.appVersion ?? ""),
    });
    focusResultsHeading();
  } catch (err: unknown) {
    if (singleRun !== run) return; // reset — the page has moved on
    // Lost contact is not a terminal answer: the job may still be running,
    // so the session that lets a reload rejoin it is kept.
    if (!(err as { lostContact?: boolean })?.lostContact) clearAuditSession();
    // A job that is simply gone is not an error the visitor made or needs
    // explaining in red: it expired, another tab collected it, or the API
    // restarted. Return the page to its ordinary state and let them upload.
    if ((err as { jobGone?: boolean })?.jobGone) return;
    analysisError.value = describeAnalysisError(err);
  } finally {
    if (singleRun === run) endSingleRun();
  }
});

// --- A finished batch across a page load (2026-11-24) ---
// Only a single report used to survive a reload; a batch of 25 audits was
// gone the moment the tab refreshed. A finished batch is now kept in this
// tab's sessionStorage the same way (utils/batchSession.ts) — when it fits.
// When it does not, `batchUnsaved` turns on the browser's leave-page prompt
// and a line of text that says why.
const batchUnsaved = ref(false);
const BATCH_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function persistBatch() {
  const finished = batchItems.value.filter(
    (i) => i.status === "done" || i.status === "error" || i.status === "cancelled",
  );
  if (batchItems.value.length < 2 || finished.length !== batchItems.value.length) return;
  const saved = saveBatchSession({
    items: batchItems.value.map((i) => ({
      id: i.id,
      filename: i.filename,
      fileSize: i.fileSize,
      status: i.status as "done" | "error" | "cancelled",
      result: i.result as Record<string, any> | null,
      error: i.error,
    })),
    activeIndex: activeTabIndex.value,
    savedAt: Date.now(),
    appVersion: String(runtimeConfig.public.appVersion ?? ""),
  });
  // Nothing to lose when no file produced a report.
  batchUnsaved.value = !saved && batchItems.value.some((i) => i.status === "done");
}

function restoreBatch() {
  const stored = readBatchSession({
    now: Date.now(),
    appVersion: String(runtimeConfig.public.appVersion ?? ""),
    ttlMs: BATCH_SESSION_TTL_MS,
  });
  if (!stored) return;
  batchItems.value = stored.items.map((i) => ({
    id: i.id,
    filename: i.filename,
    // The File was freed when its audit finished and was never storable.
    file: null,
    fileSize: i.fileSize,
    status: i.status,
    result: i.result as AnalysisResult | null,
    error: i.error,
  }));
  activeTabIndex.value = stored.activeIndex;
  batchProcessing.value = false;
}

function warnBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  // Legacy browsers need a value; the text itself is never shown.
  e.returnValue = "";
}
watch(batchUnsaved, (on) => {
  if (typeof window === "undefined") return;
  if (on) window.addEventListener("beforeunload", warnBeforeUnload);
  else window.removeEventListener("beforeunload", warnBeforeUnload);
});
onBeforeUnmount(() => {
  if (typeof window !== "undefined") window.removeEventListener("beforeunload", warnBeforeUnload);
});

/** Put the single-file processing state back to idle. Only ever called by
 *  the run that still owns the page, or by a reset. */
function endSingleRun() {
  singleRun = null;
  processing.value = false;
  singleAuditResumable.value = false;
  processingRotate.value = false;
  processingFileType.value = null;
  processingFilename.value = null;
  processingSteps.value = null;
}

const showDropHint = ref(false);
let dropHintTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => resetSignal?.value,
  () => {
    // If already in default/idle state, show a hint to use the drop zone
    if (!result.value && !processing.value && !analysisError.value && !batchProcessing.value) {
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

// --- Checking a document by its web address ---
// Two ways in, one run: the "check a document by link" field under the drop
// zone, and ?prefill=<url> (filecap-cli builds audit links of the form
//   https://audit.icjia.app/?prefill=https%3A%2F%2Fexample.com%2Freport.pdf ).
// Both call analyzeUrl(), which POSTs /api/analyze-url and feeds the answer
// into the same single-file UI an upload uses.
//
// It runs under the SAME ownership as an upload (beginSingleRun): its own
// AbortController, and it writes to the page only while it is still
// `singleRun`. The prefill path used to have neither — a reset mid-request
// left the overlay up and the report still arrived on the cleared page.
async function analyzeUrl(url: string) {
  // A batch still running is superseded, exactly as an upload supersedes it.
  batchRun?.controller.abort();
  batchRun = null;
  batchProcessing.value = false;
  batchJustFinished.value = false;

  processing.value = true;
  analysisError.value = null;
  if (singleResult.value) lastSingleResult = singleResult.value;
  earlierResult.value = null;
  singleResult.value = null;
  singleFile.value = null;
  singleFileSize.value = null;
  batchItems.value = [];
  activeTabIndex.value = 0;
  clearShare();
  // A report saved by an earlier upload must not come back on reload in
  // place of the one being made now.
  clearAuditSession();
  clearBatchSession();
  batchUnsaved.value = false;

  const run = beginSingleRun();
  // The server reports nothing until it is done, so the overlay narrates the
  // one real milestone there is.
  processingRotate.value = false;
  processingFileType.value = null;
  processingFilename.value = null;
  processingSteps.value = null;
  processingStage.value = `Fetching ${url}…`;
  try {
    const response = await $fetch<AnalysisResult>("/api/analyze-url", {
      method: "POST",
      body: { url },
      credentials: "include",
      signal: run.controller.signal,
    });
    // Reset, or replaced by a newer audit, while this one was in flight.
    if (singleRun !== run) return;
    singleResult.value = response;
    offerComparison(response);
    // Kept for this tab like an uploaded file's report, so a reload — which
    // no longer re-runs ?prefill= — still shows it.
    saveFinishedAudit({
      result: response,
      filename: response.filename,
      savedAt: Date.now(),
      appVersion: String(runtimeConfig.public.appVersion ?? ""),
    });
    focusResultsHeading();
  } catch (err: unknown) {
    if (singleRun !== run) return; // reset — the page has moved on
    // Says, in plain words, when the site is not one that can be checked by
    // link — and that uploading the file always works.
    analysisError.value = describeUrlAuditError(err);
  } finally {
    if (singleRun === run) {
      endSingleRun();
      processingStage.value = "";
    }
  }
}

// A `?prefill=` link starts by itself only for a host on the approved list
// (the fleet tool's links). For any other site the address is put in the
// field and waits for the button: since v1.180.0 the server will fetch from
// any public host, and a link on someone else's page must not be able to
// spend a visitor's hourly budget, or aim this server at a third site, just
// by being followed (red-team review 2026-11-25).
const pendingLink = ref("");
usePrefill({
  onUrl(url) {
    if (isApprovedHost(url)) return analyzeUrl(url);
    pendingLink.value = url;
  },
  onError(err) {
    // Normalised like every other failure, so the alert always has a message.
    analysisError.value = describeAnalysisError({ data: err });
  },
});

// --- Single file analysis (unchanged behavior) ---
async function analyzeFile(file: File) {
  processing.value = true;
  analysisError.value = null;
  if (singleResult.value) lastSingleResult = singleResult.value;
  earlierResult.value = null;
  singleResult.value = null;
  singleFile.value = file;
  singleFileSize.value = file.size;
  batchItems.value = [];
  clearBatchSession();
  batchUnsaved.value = false;

  const run = beginSingleRun();
  const { signal } = run.controller;
  try {
    processingRotate.value = true;
    processingFileType.value = fileTypeFromName(file.name);
    processingFilename.value = file.name;
    processingSteps.value = null;
    processingStage.value = "";

    // v1.100.0: the job endpoints report REAL per-pass progress. If this
    // deployment doesn't have them (deploy skew), fall back to the
    // synchronous endpoint with the v1.99.0 rotating queue — uploads must
    // never break on the progress feature.
    let response: AnalysisResult;
    try {
      response = await analyzeWithProgress(file, $fetch as never, mapJobSteps, {
        // The audit runs on the server and its job outlives this page; these
        // two strings are all a reloaded tab needs to rejoin it.
        onJobCreated: ({ jobId, token }) => {
          singleAuditResumable.value = saveRunningAudit({
            jobId,
            token,
            filename: file.name,
            fileType: fileTypeFromName(file.name),
            startedAt: Date.now(),
            appVersion: String(runtimeConfig.public.appVersion ?? ""),
          });
        },
        signal,
      });
    } catch (jobErr: any) {
      if (!jobErr?.jobUnsupported) throw jobErr;
      if (singleRun !== run) return;
      // No job endpoints on this deployment: nothing to rejoin, so leaving
      // really would discard this audit and the warning must come back.
      singleAuditResumable.value = false;
      clearAuditSession();
      processingSteps.value = null;
      const formData = new FormData();
      formData.append("file", file);
      response = await $fetch<AnalysisResult>("/api/analyze", {
        method: "POST",
        body: formData,
        credentials: "include",
        signal,
      });
    }

    // Reset while this audit was in flight: its answer belongs to no one.
    if (singleRun !== run) return;
    singleResult.value = response;
    // The same filename as the last report in this tab: show what changed.
    offerComparison(response);
    // The server deletes a finished job the moment a page collects it, so
    // from here on this browser is the only place the report exists. Keeping
    // it means a visitor who reads the report, checks the status page, and
    // comes back still has it. A failure to store is not a failure to audit.
    saveFinishedAudit({
      result: response,
      filename: file.name,
      savedAt: Date.now(),
      appVersion: String(runtimeConfig.public.appVersion ?? ""),
    });
    focusResultsHeading();
  } catch (err: unknown) {
    if (singleRun !== run) return; // reset — the page has moved on
    // Always a message and a next step — an nginx 502 page has no JSON body,
    // and the alert used to render as an empty red box.
    const lostContact = (err as { lostContact?: boolean })?.lostContact === true;
    if (lostContact && singleAuditResumable.value) {
      // Not a terminal answer: the job may still be running on the server.
      // Keep the session so a reload can rejoin it — the message says so.
      analysisError.value = describeAnalysisError(err);
    } else {
      clearAuditSession();
      analysisError.value = lostContact
        ? { ...POLL_LOST_CONTACT_MESSAGE_NO_RESUME }
        : describeAnalysisError(err);
    }
  } finally {
    if (singleRun === run) endSingleRun();
  }
}

// --- Batch analysis ---
async function analyzeBatch(files: File[]) {
  // A batch already running is superseded, not joined.
  batchRun?.controller.abort();
  const run = { controller: new AbortController() };
  batchRun = run;
  // …and so is a single-file audit still in flight.
  if (singleRun) {
    singleRun.controller.abort();
    endSingleRun();
  }
  batchJustFinished.value = false;
  // The page now belongs to this batch: no earlier report or batch may come
  // back in its place on a reload.
  clearAuditSession();
  clearBatchSession();
  batchUnsaved.value = false;
  dismissComparison();

  singleResult.value = null;
  analysisError.value = null;
  batchProcessing.value = true;
  activeTabIndex.value = 0;
  clearShare();

  batchItems.value = files.map((file, i) => ({
    id: `batch-${i}-${Date.now()}`,
    filename: file.name,
    file,
    fileSize: file.size,
    status: "queued",
    result: null,
    error: null,
  }));
  // THIS run's items: the reactive array just assigned. A reset or a newer
  // batch replaces `batchItems.value` with a different array, so whatever
  // this run does after that lands on a list the page no longer shows.
  const items = batchItems.value;

  // Each file goes through the same JOB endpoints a single upload uses: the
  // upload returns at once and the page polls for the answer, so a slow
  // document cannot outlast a proxy's read timeout the way one long
  // synchronous request can. If this deployment has no job endpoints (deploy
  // skew), every file in the batch falls back to the synchronous endpoint —
  // found out once, on the first file, not once per file.
  let jobsUnsupported = false;
  const analyzeSync = (file: File, signal: AbortSignal) => {
    const formData = new FormData();
    formData.append("file", file);
    return $fetch<AnalysisResult>("/api/analyze", {
      method: "POST",
      body: formData,
      credentials: "include",
      signal,
    });
  };

  await runBatch<AnalysisResult, PrefillError>({
    items,
    signal: run.controller.signal,
    // Matches MAX_CONCURRENT_ANALYSES on the API. A 429 or 503 is waited out
    // and the file tried again — see utils/batchRun.ts.
    concurrency: 2,
    analyze: async (file, signal) => {
      if (jobsUnsupported) return analyzeSync(file, signal);
      try {
        return await analyzeWithProgress(file, $fetch as never, () => {}, { signal });
      } catch (jobErr: any) {
        if (!jobErr?.jobUnsupported) throw jobErr;
        jobsUnsupported = true;
        return analyzeSync(file, signal);
      }
    },
    describeError: describeAnalysisError,
  });

  // Reset, or replaced by a newer batch, while this one was still running:
  // the page belongs to someone else now. Touch nothing.
  if (batchRun !== run) return;
  batchRun = null;
  batchProcessing.value = false;

  // Auto-select first successful result
  const firstDone = items.findIndex((i) => i.status === "done");
  if (firstDone >= 0) activeTabIndex.value = firstDone;

  batchJustFinished.value = true;
  persistBatch();
  focusBatchDoneHeading();
}

function cancelBatch() {
  batchRun?.controller.abort();
}

// Batch completion, in words — read out when focus lands on its heading.
const batchDoneHeadingRef = ref<HTMLElement | null>(null);
// True from the moment a batch finishes until the reader picks a tab: the
// focused heading is the one announcement for that moment.
const batchJustFinished = ref(false);
const batchDoneSummary = computed(() => {
  const total = batchItems.value.length;
  const count = (status: BatchItem["status"]) =>
    batchItems.value.filter((i) => i.status === status).length;
  const done = count("done");
  const failed = count("error");
  const cancelled = count("cancelled");
  const parts = [`Batch finished: ${done} of ${total} ${total === 1 ? "file" : "files"} analyzed`];
  if (failed) parts.push(`${failed} could not be analyzed`);
  if (cancelled) parts.push(`${cancelled} cancelled`);
  return `${parts.join(", ")}.`;
});
function focusBatchDoneHeading() {
  nextTick(() => {
    batchDoneHeadingRef.value?.focus();
  });
}

function switchTab(idx: number) {
  batchJustFinished.value = false;
  activeTabIndex.value = idx;
  clearShare(); // Reset share state on tab switch
  // Remember which report was open, so a reload returns to it.
  if (!batchProcessing.value && !batchUnsaved.value) persistBatch();
}

function scrollToExport() {
  // Programmatic scrolling honours "reduce motion": jump, do not glide.
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  document
    .getElementById("export-section")
    ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function clearResults() {
  // Stop a batch that is still running. Without this its loop carried on and
  // later wrote over whatever the page was doing next.
  batchRun?.controller.abort();
  batchRun = null;
  // And a single-file audit: abort its upload/poll and return the page to
  // idle now, rather than when a stale run eventually comes back.
  if (singleRun) {
    singleRun.controller.abort();
    endSingleRun();
  }
  batchJustFinished.value = false;
  clearAuditSession();
  clearBatchSession();
  batchUnsaved.value = false;
  // Kept in memory for a re-check of the same filename; the stored copy of
  // any comparison goes with everything else Reset clears.
  if (singleResult.value) lastSingleResult = singleResult.value;
  dismissComparison();
  singleResult.value = null;
  singleFile.value = null;
  singleFileSize.value = null;
  // Belt and braces: every single-file run (upload, rejoin, link) is a
  // `singleRun` and was ended above, but nothing may leave the overlay up
  // after a reset.
  processing.value = false;
  processingStage.value = "";
  analysisError.value = null;
  batchItems.value = [];
  activeTabIndex.value = 0;
  batchProcessing.value = false;
  clearShare();
  // Back to the top: the report is replaced by the home page, and the control
  // that was pressed ("Analyze More Files" is the last thing on a report) would
  // otherwise leave the reader at the foot of a page whose upload box is at
  // the head of it. A jump, not a glide — the content under the reader has
  // changed completely, and a jump also honours "reduce motion".
  if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
}

const copied = ref(false);

// Focus management for the share row: the Create button is removed once a
// link exists, and the link field is removed on Dismiss — in both cases the
// control that had keyboard focus disappears, so focus is handed on.
const shareUrlInputRef = ref<HTMLInputElement | null>(null);
const shareCreateRef = ref<HTMLElement | null>(null);

async function handleShare() {
  if (!result.value) return;
  // Posted exactly as received from the API (seal included) — see
  // useReportExport.shareReport.
  const startedFrom = document.activeElement;
  const url = await shareReport(result.value);
  if (!url) return; // the error is announced by its role="alert"
  // Is focus still where the request left it? Read BEFORE the button is
  // removed. If the reader has since moved on to something else, it stays
  // there — a link arriving must not pull focus away from what they are doing.
  const before = document.activeElement;
  const stillOnShare =
    !before ||
    before === document.body ||
    before === startedFrom ||
    !!shareCreateRef.value?.contains(before);
  await nextTick();
  if (stillOnShare) shareUrlInputRef.value?.focus();
}

async function dismissShare() {
  clearShare();
  await nextTick();
  shareCreateRef.value?.querySelector<HTMLElement>("button")?.focus();
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
  // The name and score come from the report the link was MADE for, never
  // from whichever report is on screen — the two were once free to differ.
  const shared = sharedReport.value;
  if (!shareUrl.value || !shared) return;
  // "Word Accessibility Report" for a Word file — it used to say "PDF" for
  // every format.
  const subject = encodeURIComponent(
    `${fileTypeLabel(shared.fileType)} Accessibility Report: ${shared.filename}`,
  );
  const body = encodeURIComponent(
    `Here is the accessibility report for "${shared.filename}":\n\n` +
      `Score: ${shared.overallScore}/100 (Grade ${shared.grade})\n` +
      // For most recipients this email IS the report. Deliberately
      // unconditional — humans stay in the loop at every grade, and a test
      // asserts no grade gate creeps back in here.
      `(The score covers automated checks only — roughly the 30–40% of accessibility a machine can test; a person still needs to confirm the rest, starting with a screen reader.)\n\n` +
      `View the full report:\n${shareUrl.value}\n\n` +
      `This link expires in ${shareExpiryDays} days.`,
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
