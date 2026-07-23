<template>
  <div>
    <!-- Error state (single file mode) -->
    <div
      v-if="!isBatchMode && analysisError"
      role="alert"
      class="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 p-6"
    >
      <h3 class="font-semibold text-[var(--status-error)] mb-2">
        {{ analysisError.error }}
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
          All {{ batchItems.length }} files processed. Click any tab below to view its report.
        </p>
        <button
          class="text-green-400/60 hover:text-green-400 text-sm ml-4 flex-shrink-0"
          aria-label="Dismiss"
          @click="showBatchBanner = false"
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
          v-slot="{ tooltipId }"
          :text="item.filename"
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
            <span class="truncate min-w-0" :aria-label="item.filename">{{ item.filename }}</span>
            <span
              v-if="item.status === 'done' && item.result?.grade"
              class="flex-shrink-0 inline-flex w-5 h-5 rounded-full text-[10px] font-bold items-center justify-center"
              :style="{
                backgroundColor: gradeColor(item.result.grade) + '20',
                color: gradeColor(item.result.grade),
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
        role="alert"
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
        <div class="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
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
            class="group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-green-500/40 bg-green-500/5 px-4 py-5 sm:py-6 hover:border-green-400 hover:bg-green-500/10 transition-all"
            @click="scrollToExport"
          >
            <span
              class="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-green-500/15 text-green-400 group-hover:scale-105 transition-transform"
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

        <!-- Report content — the exact subtree the HTML export snapshots, so
             the download is identical to the live results. Interactive-only
             controls inside are marked data-export-exclude. -->
        <div data-report-content>
          <!-- Prominent filename banner — first thing identifying which file
             this result (and any download/print) belongs to, incl. batch tabs -->
          <ReportFileBanner
            :filename="result.filename"
            :page-count="result.pageCount"
            :is-scanned="result.isScanned"
            :file-type="result.fileType"
            class="mb-6"
          />
          <!-- Scanned warning banner -->
          <div
            v-if="result.isScanned"
            class="mb-6 rounded-xl bg-orange-500/10 border border-orange-500/30 p-4"
          >
            <p class="text-[var(--status-warning-orange)] font-medium text-sm">
              This PDF appears to be a scanned image. Screen readers cannot access its content. OCR
              and full remediation are required.
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
            <ScoreCard :result="result" :show-filename="false" />
          </div>

          <!-- PDF/UA-1 machine-check verdict (veraPDF) — informational,
             subordinate to the Strict grade above; self-hides when the
             verdict is absent (non-PDF, or veraPDF unavailable). -->
          <PdfUaVerdict
            v-if="result?.pdfUaVerdict"
            :verdict="result.pdfUaVerdict"
            :grade="result?.grade"
            :verapdf-url="String(runtimeConfig.public.verapdfUrl ?? '')"
            class="mb-6"
          />

          <!-- Auto-Remediate (visible right under the score; component
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
            <RemediateButton :file="activeFile" :input-score="result?.overallScore ?? null" />
          </div>

          <!-- Best path to a11y starts at the source document -->
          <div class="mb-8">
            <SourceDocumentNotice variant="audit" :file-type="result?.fileType" />
          </div>

          <ReportActionBanner
            v-if="result?.categories"
            :categories="result.categories"
            :file-type="result?.fileType"
            class="mb-4"
          />

          <IssuesSummary v-if="result?.categories" :categories="result.categories" class="mb-8" />

          <MethodologyCard :file-type="result?.fileType" />

          <ReportContent :result="result" />
        </div>
        <!-- /report content -->

        <!-- Export & Share -->
        <div
          id="export-section"
          class="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-3 sm:p-5 report-actions scroll-mt-6"
        >
          <!-- Download row -->
          <p class="text-sm font-medium text-[var(--text-muted)] mb-3 text-center">
            Download Report
          </p>
          <ReportDownloadBar :result="result" />

          <!-- Share divider -->
          <div class="border-t border-[var(--border)] my-4" />

          <!-- Share row -->
          <p class="text-sm font-medium text-[var(--text-muted)] mb-3 text-center">Share Report</p>

          <div v-if="!shareUrl">
            <div class="flex flex-wrap gap-2 justify-center">
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
            <p class="text-xs text-[var(--text-muted)] mt-2 text-center">
              Creates a public link anyone can view. Expires in 365 days.
            </p>
            <p v-if="shareError" class="text-xs text-[var(--status-error)] mt-1">
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
              <UButton variant="ghost" color="neutral" size="xs" @click="clearShare">
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
              ><span>Passing categories (what's working)</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-purple-400 mt-0.5">•</span
              ><span>Failing categories with findings and WCAG 2.2 references</span>
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
                  <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </template>
              {{ aiCopied ? "Copied to clipboard!" : "Copy Analysis for AI" }}
            </UButton>
          </div>
          <p v-if="aiCopyError" class="text-xs text-[var(--status-error)] mt-2 text-center">
            Clipboard copy failed. Use the preview above to select and copy manually.
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
      :items="batchItems"
      @cancel="cancelBatch"
    />

    <!-- Processing overlay (single file) -->
    <ProcessingOverlay v-else-if="processing" :stage="processingStage" />

    <!-- Drop zone (idle state) -->
    <div v-else>
      <AnnouncementBanner />

      <div class="mb-8 text-center">
        <h2 class="text-xl sm:text-2xl font-bold tracking-tight mb-3 text-[var(--accent-green)]">
          {{ heroTitle }}
        </h2>
        <p class="text-[var(--text-secondary)] font-medium max-w-xl mx-auto leading-relaxed">
          Upload a {{ heroUploadNoun }} to get an instant accessibility score based on
          <a
            href="https://www.w3.org/WAI/WCAG22/quickref/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--accent-orange)] hover:text-[var(--accent-orange)] font-semibold"
            >WCAG 2.2</a
          >
          and
          <a
            href="https://www.ada.gov/resources/title-ii-rule/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--accent-orange)] hover:text-[var(--accent-orange)] font-semibold"
            >ADA Title II</a
          >
          requirements (and the Illinois
          <a
            href="https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--accent-orange)] hover:text-[var(--accent-orange)] font-semibold"
            >IITAA 2.1</a
          >
          standard). The audit checks up to nine categories — text extractability, heading
          structure, alt text, table markup, and more — and returns a detailed report with
          actionable findings.
        </p>
      </div>

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

      <DropZone @file-selected="analyzeFile" @files-selected="analyzeBatch" />
    </div>

    <LazyTechnicalExplainer hydrate-on-visible />

    <!-- Feature stats (infographic style) -->
    <div class="mt-12 mb-2 text-center">
      <h2 class="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--text-muted)]">
        What This Tool Does
      </h2>
      <p class="mt-2 text-sm text-[var(--text-secondary)] max-w-2xl mx-auto">
        Audit any PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) document for WCAG 2.2 AA
        accessibility — and (optionally) auto-remediate PDFs — all on infrastructure you control,
        with no AI and no per-document fees.
      </p>
    </div>

    <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-center">
      <!-- Audit -->
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6">
        <div class="text-4xl sm:text-5xl font-black text-[var(--accent-green)] mb-3 leading-none">
          9
        </div>
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">
          WCAG categories audited
        </div>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          Each document scored across up to 9 categories aligned with
          <strong>WCAG 2.2 Level AA</strong> and ADA Title II. A–F letter grade plus Critical /
          Serious / Moderate severity per category so you know what to fix first.
        </p>
      </div>

      <!-- Auto-Remediate -->
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6">
        <div class="text-4xl sm:text-5xl font-black text-[var(--accent-green)] mb-3 leading-none">
          F → A
        </div>
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">
          Auto-remediation (optional)
        </div>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          Tag untagged PDFs in seconds with the qpdf →
          <a
            href="https://github.com/opendataloader-project/opendataloader-pdf"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >OpenDataLoader</a
          >
          →
          <a
            href="https://verapdf.org/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >veraPDF</a
          >
          pipeline. Output never regresses any score profile, and manual review is still recommended
          for IITAA compliance.
        </p>
      </div>

      <!-- Standards alignment -->
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6">
        <div class="text-4xl sm:text-5xl font-black text-[var(--accent-green)] mb-3 leading-none">
          PDF/UA-1
        </div>
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">Standards aligned</div>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          WCAG 2.2 Level AA, ADA Title II (effective April 2026), Illinois IITAA 2.1, and PDF/UA-1
          (ISO 14289-1) via veraPDF. Full lifecycle audit trail with deletion verification for
          compliance reporting.
        </p>
      </div>

      <!-- Privacy -->
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6">
        <div class="text-4xl sm:text-5xl font-black text-[var(--accent-green)] mb-3 leading-none">
          0
        </div>
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">Files retained</div>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          Uploaded files exist on the server only as long as the pipeline requires. Audited files:
          in-memory, gone in seconds. Remediated outputs: deleted on first download or 30-minute
          TTL, then
          <code class="font-mono text-[10px]">fs.stat</code>-verified absent.
        </p>
      </div>

      <!-- No AI / no third-party -->
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6">
        <div class="text-4xl sm:text-5xl font-black text-[var(--accent-green)] mb-3 leading-none">
          $0
        </div>
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">
          No AI, no third-party APIs
        </div>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          Every step runs on this server. No data is sent to vision models, hosted AI services, or
          commercial PDF/Office SDKs. The toolchain (qpdf, pdfjs, OpenDataLoader, veraPDF) is
          entirely open source — no per-document fees, no SDK licensing.
        </p>
      </div>

      <!-- Open source / cost -->
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6">
        <div class="text-4xl sm:text-5xl font-black text-[var(--accent-green)] mb-3 leading-none">
          100%
        </div>
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">Open source</div>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          Every line of code is on
          <a
            href="https://github.com/ICJIA/file-accessibility-audit"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >GitHub</a
          >
          — fork it, audit it, run it on your own infrastructure. Underlying tools use Apache 2.0 /
          MIT / MPL licenses. Designed for state agencies that need control over their accessibility
          pipeline.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ReportActionBanner from "~/components/ReportActionBanner.vue";
import IssuesSummary from "~/components/IssuesSummary.vue";
import ReportFileBanner from "~/components/ReportFileBanner.vue";
import MethodologyCard from "~/components/MethodologyCard.vue";
import ScrollToTop from "~/components/ScrollToTop.vue";
import ReportDownloadBar from "~/components/ReportDownloadBar.vue";
import { uploadNoun } from "~/utils/uploadFormats";
import { gradeColor, type AnalysisResult } from "@file-audit/shared";
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

definePageMeta({ middleware: "auth" });

interface BatchItem {
  id: string;
  filename: string;
  // Nulled out once the item reaches a terminal state (done/error/cancelled)
  // to free the in-memory File — see processNext()/the queued-item sweep
  // below, both of which null it out after use.
  file: File | null;
  status: "queued" | "processing" | "done" | "error" | "cancelled";
  result: AnalysisResult | null;
  error: PrefillError | null;
}

// Abort controller for batch cancellation
let batchAbortController: AbortController | null = null;

const resetSignal = inject<Ref<number>>("resetSignal");
const {
  shareReport,
  shareUrl,
  shareError,
  sharing,
  clearShare,
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
  return cats.some((c) => c.severity === "Critical" || c.severity === "Moderate");
});

// --- Single file state (preserved for single-file UX) ---
const processing = ref(false);
const processingStage = ref("");
const singleResult = ref<AnalysisResult | null>(null);
const singleFile = ref<File | null>(null);
const analysisError = ref<PrefillError | null>(null);

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
const showBatchBanner = ref(false);
const isBatchMode = computed(() => batchItems.value.length > 0);

// The active result — from batch tab or single file
const activeItem = computed(() => batchItems.value[activeTabIndex.value] || null);
const result = computed(() => {
  if (isBatchMode.value) {
    return activeItem.value?.result || null;
  }
  return singleResult.value;
});

// Active File — used by RemediateButton. In batch mode each tab carries
// its own File; the button targets whichever tab is currently selected
// so the user can remediate each batch entry independently.
const activeFile = computed<File | null>(() => {
  if (isBatchMode.value) {
    return activeItem.value?.file || null;
  }
  return singleFile.value;
});

const hasAnyResult = computed(() => {
  if (isBatchMode.value) {
    return batchItems.value.some(
      (i) => i.status === "done" || i.status === "error" || i.status === "cancelled",
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

// --- Prefill: auto-analyze a PDF from the ?prefill=<url> query param ---
// filecap-cli generates audit links of the form:
//   https://audit.icjia.app/?prefill=https%3A%2F%2Fexample.com%2Freport.pdf
// On page load usePrefill reads the param, calls POST /api/analyze-url,
// and feeds the result into the same single-file UI used for uploads.
usePrefill({
  onStart(url) {
    processing.value = true;
    analysisError.value = null;
    singleResult.value = null;
    batchItems.value = [];
    processingStage.value = `Fetching ${url}…`;
  },
  onResult(result) {
    processingStage.value = "Building report…";
    singleResult.value = result;
    focusResultsHeading();
  },
  onError(err) {
    analysisError.value = err;
  },
  onDone() {
    processing.value = false;
  },
});

// --- Single file analysis (unchanged behavior) ---
async function analyzeFile(file: File) {
  processing.value = true;
  analysisError.value = null;
  singleResult.value = null;
  singleFile.value = file;
  batchItems.value = [];

  try {
    processingStage.value = "Uploading…";
    const formData = new FormData();
    formData.append("file", file);

    processingStage.value = "Extracting PDF structure…";

    const response = await $fetch<AnalysisResult>("/api/analyze", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    processingStage.value = "Building report…";
    await new Promise((r) => setTimeout(r, 300)); // Brief pause for UX

    singleResult.value = response;
    focusResultsHeading();
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
      // Non-null: idx was captured from nextIndex while it was still less
      // than batchItems.value.length (the while condition above), and
      // batchItems.value is only ever appended to elsewhere, never spliced
      // shorter during this loop, so the slot at idx is always present.
      const item = batchItems.value[idx]!;
      item.status = "processing";

      try {
        const formData = new FormData();
        // Non-null: this item just transitioned queued -> processing above,
        // and file is only ever nulled out AFTER a terminal state is reached
        // (below, and in the cancelled-sweep after this loop) — so the very
        // first read here always sees the real File.
        formData.append("file", item.file!);

        const response = await $fetch<AnalysisResult>("/api/analyze", {
          method: "POST",
          body: formData,
          credentials: "include",
          signal,
        });

        item.result = response;
        item.status = "done";
        item.file = null; // Free browser memory
      } catch (err: any) {
        if (signal.aborted) {
          item.status = "cancelled";
          item.file = null;
          return;
        }
        if (err.status === 401) {
          navigateTo("/login");
          return;
        }
        item.error = err.data || { error: "Analysis failed." };
        item.status = "error";
        item.file = null; // Free browser memory
      }
    }
  }

  // Launch concurrent workers
  const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => processNext());
  await Promise.all(workers);

  // Mark remaining queued items as cancelled
  for (const item of batchItems.value) {
    if (item.status === "queued") {
      item.status = "cancelled";
      item.file = null;
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

function scrollToExport() {
  document.getElementById("export-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const subject = encodeURIComponent(`PDF Accessibility Report: ${result.value.filename}`);
  const body = encodeURIComponent(
    `Here is the accessibility report for "${result.value.filename}":\n\n` +
      `Score: ${result.value.overallScore}/100 (Grade ${result.value.grade})\n\n` +
      `View the full report:\n${shareUrl.value}\n\n` +
      `This link expires in 365 days.`,
  );
  window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
}

// ------------------------------------------------------------------
// Mermaid diagram sources for the Technical Details expandable.
// Kept deliberately simple — flowchart TD only, short labels, no
// subgraphs, no HTML-in-labels. The standalone /technical-details
// page uses the same diagrams. Reliability over richness.
// ------------------------------------------------------------------
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
