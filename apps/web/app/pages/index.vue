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
            <span
              class="text-sm sm:text-base font-semibold text-[var(--text-heading)]"
              >Reset</span
            >
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
            <span
              class="text-sm sm:text-base font-semibold text-[var(--text-heading)]"
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
          class="text-center mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-8"
        >
          <ScoreCard :result="result" :show-filename="false" />
        </div>

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
          <RemediateButton
            :file="activeFile"
            :input-score="result?.overallScore ?? null"
          />
        </div>

        <!-- Best path to a11y starts at the source document -->
        <div class="mb-8">
          <SourceDocumentNotice variant="audit" :file-type="result?.fileType" />
        </div>

        <ReportActionBanner
          v-if="result?.categories"
          :categories="result.categories"
          class="mb-4"
        />

        <IssuesSummary
          v-if="result?.categories"
          :categories="result.categories"
          class="mb-8"
        />

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
              @click="exportText(result)"
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
              Text (.txt)
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
            <UButton
              variant="soft"
              color="neutral"
              size="sm"
              :title="'Opens the browser print dialog — pick &quot;Save as PDF&quot; as the destination.'"
              @click="exportPdfViaBrowserPrint(result)"
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
                    d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"
                  />
                </svg>
              </template>
              PDF (browser print)
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
              Creates a public link anyone can view. Expires in 365 days.
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
                >Failing categories with findings and WCAG 2.2 references</span
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
      <AnnouncementBanner />

      <div class="mb-8 text-center">
        <h2
          class="text-xl sm:text-2xl font-bold tracking-tight mb-3 text-[var(--accent-green)]"
        >
          {{ heroTitle }}
        </h2>
        <p
          class="text-[var(--text-secondary)] font-medium max-w-xl mx-auto leading-relaxed"
        >
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
          standard). The audit checks nine categories — text extractability,
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
        Technical Details: How This Tool Analyzes & Remediates PDFs
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
              href="https://www.w3.org/WAI/WCAG22/quickref/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >WCAG 2.2 Level AA</a
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
            April 2026), as adopted in Illinois by the IITAA 2.1 standard.
          </p>

          <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
            What Is a PDF, Really? (And Why It's Different from Word)
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            To understand why some PDFs are accessible and others aren't —
            and why "fixing" an inaccessible PDF can be so much harder than
            it looks — it helps to know what a PDF actually <em>is</em>
            under the hood. Most people use PDFs every day without ever
            thinking about it. Here's the short version.
          </p>

          <p class="text-[var(--text-muted)] mb-3">
            <strong>A PDF is an export, not a source document.</strong>
            Adobe created the Portable Document Format in 1993 to solve a
            specific problem: making a file that <em>looks identical</em>
            on every printer, every monitor, every operating system. You
            don't <em>write</em> in a PDF — you write in Word, InDesign,
            Pages, or Google Docs, and then you <em>export to</em> PDF when
            you want to share the finished result. PDF is the printed-and-
            mailed envelope at the end of the workflow, not the
            word-processor you used to draft the letter.
          </p>

          <p class="text-[var(--text-muted)] mb-3">
            <strong>The difference between Word and PDF is about
            <em>what each format stores</em>:</strong>
          </p>
          <div
            class="mt-2 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
          >Word (.docx) says:
  &lt;h1&gt;Annual Report 2024&lt;/h1&gt;
  &lt;p&gt;In fiscal year 2024…&lt;/p&gt;
  &lt;img alt="Bar chart showing arrests by month" src="…" /&gt;

PDF says:
  Page 1, x=72,  y=720, font=Arial-Bold, size=24pt: glyph 'A'
  Page 1, x=85,  y=720, font=Arial-Bold, size=24pt: glyph 'n'
  Page 1, x=98,  y=720, font=Arial-Bold, size=24pt: glyph 'n'
  Page 1, x=72,  y=680, font=Arial,      size=11pt: glyph 'I'
  Page 1, x=78,  y=680, font=Arial,      size=11pt: glyph 'n'
  Page 1, x=72,  y=200, image XObject ref=42 (768 x 432 pixels)
  …</div>
          <p class="text-[var(--text-muted)] mt-3 mb-3">
            Word stores the <em>meaning</em> of your content. The
            <code class="text-xs font-mono">&lt;h1&gt;</code> tag tells
            <em>any</em> program reading the file: "this is a top-level
            heading." The <code class="text-xs font-mono">&lt;img&gt;</code>
            tag has an
            <code class="text-xs font-mono">alt</code> attribute that
            describes the picture. A screen reader can read a Word file and
            navigate it like a webpage because the meaning is right there
            in the file.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            PDF stores <em>where every glyph goes on the page</em>. That's
            it. A PDF doesn't natively know which glyphs are a heading and
            which are a paragraph — only that this letter is here, that
            letter is there, in this font, in this color. When you read a
            PDF, your brain does the work of recognizing "the big bold text
            at the top must be a heading." A screen reader can't do that
            from glyph positions alone — it would just read each glyph in
            sequence, which sounds like gibberish.
          </p>

          <p class="text-[var(--text-muted)] mb-3">
            <strong>So how can a PDF be accessible at all?</strong>
            Starting in 2001 (PDF version 1.4), Adobe added an
            <em>optional</em> second layer to the format called the
            <strong>structure tree</strong> (or "tags"). This is a separate
            invisible layer that runs alongside the visual content and says
            "the glyphs that draw 'Annual Report 2024' belong to a
            <code class="text-xs font-mono">&lt;H1&gt;</code> element. The
            image at x=72, y=200 is a
            <code class="text-xs font-mono">&lt;Figure&gt;</code> element with
            alt-text 'Bar chart showing arrests by month'." Screen readers
            read the structure tree first, then jump to the visual content
            based on what the tree tells them.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            A PDF that has this layer is called a
            <strong>"tagged PDF."</strong> A PDF without it is
            <strong>"untagged."</strong> Whether a PDF gets tagged depends
            on how it was exported. In Word: <em>File → Save As → PDF →
            Options → "Document structure tags for accessibility"</em>
            (checked by default in recent versions, but commonly turned off
            on older Office installs or "minimum size" exports). In
            InDesign: <em>File → Export → Adobe PDF (Print) → "Create
            Tagged PDF"</em>. Pages and Google Docs are similar. If that
            box is unchecked, you get an untagged PDF — visually identical,
            but invisible to screen readers.
          </p>

          <p class="text-[var(--text-muted)] mb-3">
            <strong>The structure tree itself looks like a webpage's DOM
            tree,</strong>
            because it borrows the same ideas:
          </p>
          <div
            class="mt-2 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
          >StructTreeRoot
└── Document
    ├── H1 "Annual Report 2024"
    ├── P  "In fiscal year 2024, the agency processed…"
    ├── Figure  (/Alt "Bar chart showing arrests by month")
    ├── H2 "Methodology"
    ├── P  "Data was collected from…"
    └── Table
        ├── TR
        │    ├── TH (Scope=Col) "County"
        │    ├── TH (Scope=Col) "Arrests"
        │    └── TH (Scope=Col) "Year"
        └── TR
             ├── TD "Cook"
             ├── TD "12,345"
             └── TD "2024"</div>
          <p class="text-[var(--text-muted)] mt-3 mb-3">
            Standard tag types include
            <code class="text-xs font-mono">Document</code>,
            <code class="text-xs font-mono">Sect</code>,
            <code class="text-xs font-mono">H1</code> through
            <code class="text-xs font-mono">H6</code>,
            <code class="text-xs font-mono">P</code>,
            <code class="text-xs font-mono">L</code> /
            <code class="text-xs font-mono">LI</code> (list / list item),
            <code class="text-xs font-mono">Table</code> /
            <code class="text-xs font-mono">TR</code> /
            <code class="text-xs font-mono">TH</code> /
            <code class="text-xs font-mono">TD</code>,
            <code class="text-xs font-mono">Figure</code>,
            <code class="text-xs font-mono">Caption</code>,
            <code class="text-xs font-mono">Form</code>,
            <code class="text-xs font-mono">Link</code>, and
            <code class="text-xs font-mono">Artifact</code> (used for
            purely decorative content that screen readers should skip).
            Each can carry attributes like
            <code class="text-xs font-mono">/Alt</code> (alt text for
            figures), <code class="text-xs font-mono">/Lang</code>
            (language declaration), and
            <code class="text-xs font-mono">Scope</code> (whether a
            <code class="text-xs font-mono">TH</code> is a row or column
            header).
          </p>

          <p class="text-[var(--text-muted)] mb-3">
            Linking these tags back to the glyphs they describe uses
            <strong>Marked Content Identifiers</strong> (MCIDs). Each chunk
            of content in the page's drawing instructions is wrapped in a
            marker (<code class="text-xs font-mono">/MCID 7 … /EMC</code>),
            and the corresponding structure tree node points back at that
            marker. It's the same idea as <code class="font-mono">id</code>
            attributes connecting HTML elements to JavaScript handlers —
            a separate identifier layer that knits two parallel
            representations together.
          </p>

          <p class="text-[var(--text-muted)] mb-3">
            <strong>This architecture is why retrofitting accessibility
            into an existing PDF is so much harder than getting it right at
            export.</strong>
            When Word exports a tagged PDF, it already knows your headings
            are headings — it just copies that semantic information into
            the structure tree. When somebody hands you an untagged PDF
            and asks you to fix it, the only thing left is the glyph
            positions. Reverse-engineering "what was this heading?" from
            "14-pt bold text at the top of page 2" is what auto-remediation
            tools attempt, but with the same fundamental limitation a human
            would have: it's a guess based on visual cues, not a recall of
            authorial intent.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            <strong>The practical takeaway:</strong> the most reliable path
            to an accessible PDF is to fix accessibility issues in the
            <em>source document</em> (Word, InDesign, etc.) and re-export
            with tagging enabled. The next-best path — and what this tool's
            optional auto-remediation feature does — is to take an
            already-exported PDF and add structure tags after the fact. The
            audit results page surfaces this distinction in the "Best path
            to accessibility starts at the source" notice.
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
            tabindex="0"
          >
            PDF → [validate file type &amp; size] → parallel { QPDF (structure),
            PDF.js (content) } → Scorer (9 categories) → Weighted Score → Report
          </div>

          <div class="mt-4">
            <DiagramFigure
              name="audit-flow"
              title="Audit pipeline — visual flow"
              desc="Browser uploads PDF; the server validates magic bytes and size, holds the file in memory, runs qpdf and pdfjs in parallel against it, combines the results, scores nine categories, returns the grade and findings to the browser, and discards the memory buffer."
            />
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

          <div class="mt-4">
            <DiagramFigure
              name="architecture"
              title="Application architecture"
              desc="Browser talks to Nginx reverse proxy. Nginx routes to either the Nuxt web app (port 5102) or the Express API (port 5103). The web app makes some API calls back to Express. Express shells out to qpdf, OpenDataLoader Java, and veraPDF Java; it reads and writes SQLite locally. No external services."
            />
          </div>
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

          <div class="mt-4">
            <DiagramFigure
              name="two-tool"
              title="Two-tool parallel analysis"
              desc="The uploaded buffer runs through qpdf (structure tree, language, outlines, images, tables) and pdfjs (text, metadata, content order) in parallel. Their results combine in the scorer for a weighted score across 9 categories."
            />
          </div>
        </div>

        <!-- Scoring -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">
            How Scores Are Calculated
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            The scorer weighs nine accessibility categories anchored to
            <strong>WCAG 2.2 AA</strong> and <strong>IITAA 2.1 §E205.4</strong> —
            the rules that govern non-web document accessibility in Illinois.
            Each category receives a score from 0 to 100 (or N/A if the
            category doesn't apply to the document). The overall score is a
            <strong>weighted average</strong> of applicable categories, with
            weights renormalized to exclude N/A categories.
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
                    Weight
                    <span class="block text-[9px] normal-case text-emerald-300 font-normal"
                      >WCAG + IITAA §E205.4</span
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
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Title &amp; Language</td>
                  <td class="px-3 py-1.5 text-right font-mono">15%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Heading Structure</td>
                  <td class="px-3 py-1.5 text-right font-mono">15%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Alt Text on Images</td>
                  <td class="px-3 py-1.5 text-right font-mono">15%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Bookmarks / Navigation</td>
                  <td class="px-3 py-1.5 text-right font-mono">5%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Table Markup</td>
                  <td class="px-3 py-1.5 text-right font-mono">10%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Link Quality</td>
                  <td class="px-3 py-1.5 text-right font-mono">5%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Reading Order</td>
                  <td class="px-3 py-1.5 text-right font-mono">10%</td>
                </tr>
                <tr>
                  <td class="px-3 py-1.5">Form Accessibility</td>
                  <td class="px-3 py-1.5 text-right font-mono">5%</td>
                </tr>
                <tr
                  class="bg-[var(--surface-deep)] text-[var(--text-secondary)] font-semibold"
                >
                  <td class="px-3 py-1.5">Total</td>
                  <td class="px-3 py-1.5 text-right font-mono">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 mb-4 space-y-2"
          >
            <p class="font-medium text-[var(--text-secondary)]">
              About this score
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              This is a <strong>WCAG-based</strong> evaluation. It aligns
              with <strong>WCAG 2.2 Level AA</strong>,
              <strong>ADA Title II</strong>, and Illinois
              <strong>IITAA 2.1 §E205.4</strong> — the rules that govern non-web
              document accessibility in Illinois. The scorer emphasizes
              <strong>programmatically determinable</strong> structure (real
              headings, real table-header relationships, logical reading
              order) because that's what assistive technology can actually
              use.
            </p>
            <p class="text-xs text-[var(--text-muted)]">
              For a formal <strong>PDF/UA-1 (ISO 14289-1) conformance
              verdict</strong>, run the optional remediation pipeline — it
              includes a <a
                href="https://verapdf.org/"
                target="_blank"
                rel="noopener noreferrer"
                class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
                >veraPDF</a> check. PDF/UA is referenced by IITAA only in
              <a
                href="https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html"
                target="_blank"
                rel="noopener noreferrer"
                class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
                >§504.2.2</a> for authoring-tool export capability, not for
              the final PDF artifact itself, so the WCAG-anchored score above
              is what governs publication decisions.
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
            the remaining categories less important. A higher normalized score
            can still coexist with unresolved semantic issues that matter for
            ADA/WCAG/IITAA review. For Illinois agency publication decisions,
            normalization is best treated as a scoring convenience, not as a
            substitute for the per-category findings.
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

        <!-- ============================================================ -->
        <!-- PDF AUTO-REMEDIATION (developer-facing technical reference)  -->
        <!-- ============================================================ -->

        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
            PDF Auto-Remediation: Pipeline Overview
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            As of <strong>v1.18.0</strong>, the tool also exposes an optional
            PDF auto-remediation feature behind the
            <code class="text-xs font-mono">REMEDIATION_ENABLED=true</code> env
            flag. When enabled, the audit results page surfaces an
            <em>Attempt remediation</em> button next to the score. Clicking
            it spawns a detached worker that runs a four-stage pipeline,
            validates the output, and either serves the remediated file to the
            user (single-use download, deleted on stream close) or rejects it
            and surfaces a fallback message. The user re-uploads to remediate;
            no PDF is cached between the audit and remediation stages.
          </p>
          <div
            class="mt-3 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
          >POST /api/remediate (multipart PDF) →
  [magic-byte check] → [page count cap (500)] → [pre-flight audit] →
  [job row created, sha256 content_hash recorded] →
  [spawn detached child: tsx src/jobs/remediate.ts &lt;jobId&gt;] →
  ◄ { jobId, downloadToken } (HTTP 202)

Worker pipeline:
  [Stage 1: preparing] qpdf --object-streams=disable input → normalized
  [Stage 2: tagging]   OpenDataLoader convert(normalized) → tagged-pdf
  [Stage 3: validating] qpdf --check tagged → validity verdict
                        verapdf --flavour ua1 --format json tagged → conformance verdict
  [Stage 4: comparing] re-audit tagged → output_audit
                        guard: reject if Overall|Strict regresses

Output finalized OR job marked failed. Scratch dir wiped in `finally`.</div>

          <div class="mt-4">
            <DiagramFigure
              name="remediation-flow"
              title="Remediation pipeline — visual flow"
              desc="The user re-uploads the PDF. qpdf normalizes it; original deleted with verification. OpenDataLoader adds structure tags; normalized intermediate deleted with verification. qpdf check + veraPDF validate the output. A re-audit confirms no score profile regressed. If all clear, output is held for 30 minutes; user downloads via single-use token; output deleted with verification."
            />
          </div>
        </div>

        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
            Why Auditing Is Easy and Remediation Is Hard
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            Auditing a PDF is a <em>read-only</em> operation: walk the
            document's internal structure, ask "does it have a tagged
            StructTreeRoot? Are figures marked? Is the language declared?"
            and report what you find. The PDF specification
            (<a
              href="https://www.iso.org/standard/75839.html"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >ISO 32000-2</a
            >) is unambiguous about how to <em>read</em> these structures;
            the libraries that parse them (qpdf, pdfjs, veraPDF) are mature
            and battle-tested; the answers don't change between runs. A
            PDF can be audited a thousand times and produce the same
            result every time.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            Remediation is a <em>read-modify-write</em> operation, and PDFs
            make that uniquely hard for several reasons that are baked into
            the format itself:
          </p>
          <ol class="space-y-2 text-xs text-[var(--text-muted)] list-decimal list-inside ml-2">
            <li>
              <strong>PDF was designed for fixed-layout printing, not
              semantic content.</strong> Adobe published it in 1993 to make
              "documents that look identical on every printer." The
              accessibility layer
              (<code class="text-xs font-mono">StructTreeRoot</code>, marked
              content, role mapping) was bolted on in
              <strong>PDF 1.4 (2001)</strong> and is <em>optional</em> —
              valid PDFs can have none of it. Auto-tagging means
              reverse-engineering semantic meaning from raw visual
              presentation, which is much harder than reading existing
              semantic markers.
            </li>
            <li>
              <strong>There is no canonical mapping from visual layout to
              semantic role.</strong> Is a 14-pt bold line of text an
              <code class="text-xs font-mono">&lt;H2&gt;</code> or just
              emphasized body text? Is a 100×100-pixel image content (needs
              alt text) or decoration (mark as
              <code class="text-xs font-mono">/Artifact</code>)? A human
              reader judges from context; software guesses heuristically and
              is wrong some of the time.
            </li>
            <li>
              <strong>The content stream and the structure tree are coupled
              but separable.</strong> Every glyph and image in a PDF lives in
              a per-page content stream. Each one is wrapped in a "marked
              content" section
              (<code class="text-xs font-mono">/MCID 7 … /EMC</code>) that
              links it back to a node in the
              <code class="text-xs font-mono">StructTreeRoot</code>. Adding
              an alt-text to one image means mutating
              <em>both</em> sides coherently — write the new
              <code class="text-xs font-mono">/Alt</code> property on the
              Figure structure element AND ensure the MCID linkage stays
              valid. Many PDF libraries handle reading one side or the
              other, but not modifying both at once.
            </li>
            <li>
              <strong>The content layer can be in any of several
              representations.</strong> A scanned PDF has no text layer — it's
              just raster images, requiring OCR before any semantic
              remediation can happen. An optimized PDF compresses objects
              into "object streams" (a PDF 1.5+ feature) that some libraries
              can't safely round-trip. An encrypted PDF requires a password
              even to read. Each case is its own engineering minefield, and
              they layer onto each other (scanned-and-encrypted is worse
              than either alone).
            </li>
            <li>
              <strong>No single PDF library does everything well.</strong>
              <code class="text-xs font-mono">pdf-lib</code> (JavaScript, in
              the Node ecosystem) reads and writes metadata easily but has
              no StructTreeRoot builder. Apache PDFBox (Java) has the deepest
              structure-tree support but is Java-only. Ghostscript can
              rewrite PDFs but silently degrades tag structure.
              OpenDataLoader (Java, used here) is the only open-source tool
              that produces a tagged PDF from an untagged one — and even it
              cannot judge whether the result is <em>meaningful</em>.
            </li>
            <li>
              <strong>The "tagged PDF" specification is permissive.</strong>
              You can produce a PDF that satisfies all the technical
              requirements of <em>being</em> tagged (MarkInfo=true,
              StructTreeRoot exists, every page has marked content) and is
              still inaccessible to screen readers (e.g., every paragraph
              wrapped in a single
              <code class="text-xs font-mono">&lt;P&gt;</code> with no
              heading structure). PDF/UA-1 (ISO 14289-1) narrows this
              somewhat but doesn't eliminate it. Automated remediation
              tools often produce tagged-but-shallow output that machine
              validators accept but assistive technology can't navigate.
            </li>
            <li>
              <strong>Mistakes compound badly.</strong> A wrong heading level
              might confuse a screen reader user. A corrupted cross-reference
              (xref) table makes the entire PDF unreadable by any viewer.
              Remediation tools have to be conservative — when in doubt,
              don't touch. The qpdf preprocessing step in this pipeline
              exists precisely because OpenDataLoader's PDF writer
              occasionally corrupts the xref on round-trip with certain
              inputs (the InDesign 18.x / Word 365 case described above);
              we accept the cost of an extra normalization pass to avoid
              serving a damaged file.
            </li>
            <li>
              <strong>Round-trip fidelity is the highest bar.</strong>
              Remediation must <em>add</em> semantic markup
              while <em>preserving</em> every visual nuance: embedded fonts,
              raster + vector images, color spaces, ICC profiles, page
              labels, bookmarks, hyperlinks, form fields, digital
              signatures, embedded multimedia. The user doesn't want their
              report to look different after remediation; they want the
              <em>same document</em> with structure added. Read-modify-write
              while changing only the semantic layer is a class of problem
              the format simply wasn't designed to make easy.
            </li>
          </ol>
          <p class="text-[var(--text-muted)] mt-3">
            The result is that PDF auto-remediation works well for the
            machine-checkable parts of accessibility (structure presence,
            metadata, language declaration, tagged content stream) and
            falls back to human judgment for the semantically-judged parts
            (alt-text quality, reading-order intent, decorative vs.
            informative classification). The roadmap for this tool
            (see
            <code class="text-xs font-mono"
              >docs/archive/pdf-remediation-alt-text-walkthrough-spec.md</code
            >) is an interactive walkthrough that augments the
            machine-checkable foundation with human-authored alt text —
            without any AI in the loop, because the regulatory durability
            of agency-authored content is higher than the durability of
            AI-generated content.
          </p>
        </div>

        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
            Why OpenDataLoader Changes the Cost Equation
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            Until <strong>2024–2025</strong>, programmatically tagging a PDF
            (auto-generating
            <code class="text-xs font-mono">StructTreeRoot</code>, marking
            figures, tables, headings) was something only a handful of
            commercial vendors could do, and they priced accordingly. The
            economics of PDF accessibility have historically been brutal for
            state agencies: PDF/UA expertise is rare, specialized, and was
            locked behind commercial walls for decades.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            <strong>Commercial PDF remediation, today:</strong>
          </p>
          <ul class="space-y-1.5 text-xs text-[var(--text-muted)] mb-3">
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                ><strong>Apryse / PDFTron SDK:</strong> enterprise-quoted,
                typically <strong>$1,500/yr minimum</strong> for the entry
                SDK and considerably more for the auto-tagging add-on. On-prem
                deployable but you pay for the privilege of running their
                Java/C++ binary in your own data center.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                ><strong>Adobe PDF Services API:</strong> Accessibility
                Auto-Tag endpoint, free tier of 500 transactions per month
                (about 50 pages — exhausted by a single annual report).
                Beyond the free tier:
                <strong>enterprise-quoted</strong>, scaling per-document. Your
                PDF leaves your network for the API call.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                ><strong>PDFix SDK, AbleDocs ADapi, CommonLook API:</strong>
                all enterprise-quoted, all opaque pricing, all aimed at large
                organizations.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                ><strong>Manual remediation services:</strong>
                <strong>$5–$50 per page</strong> for hand-remediation of
                tagged-and-reviewed output. A typical 50-page agency report
                costs <strong>$250–$2,500</strong> to remediate this way, and
                that's per document. State agencies producing dozens of
                reports per year face annual remediation bills in the tens
                of thousands.</span
              >
            </li>
          </ul>
          <p class="text-[var(--text-muted)] mb-3">
            <strong>Why so expensive?</strong> The skill is rare — there are
            relatively few practitioners who can read a structure tree and
            judge whether it's correct. The labor is real — even with good
            tooling, a 50-page report can require 4–8 hours of expert work.
            The market is small, the demand is regulated (ADA Title II,
            IITAA, Section 508), and the buyers are mostly governments and
            large organizations that aren't price-sensitive. The result is
            a niche industry with high prices and slow innovation.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            <strong
              >OpenDataLoader PDF, released as Apache 2.0 in 2024 and
              continuously developed since, is the first credible
              open-source PDF auto-tagger.</strong
            >
            It does what previously required a $1,500/year SDK subscription:
            takes an untagged PDF and produces a tagged one. It's developed
            by
            <a
              href="https://sdk.hancom.com/en"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >Hancom</a
            >
            (a Korean office-software vendor with deep PDF expertise) in
            collaboration with the
            <a
              href="https://pdfa.org/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >PDF Association</a
            >
            and
            <a
              href="https://www.duallab.com/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >Dual Lab</a
            >
            (the same people behind the veraPDF validator). It ranks #1
            overall (0.907) in 2026 PDF-extraction accuracy benchmarks — not
            just "as good as the commercial tools," better than them on the
            published metrics.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            <strong>For this tool, OpenDataLoader is load-bearing.</strong>
            The pipeline architecture (qpdf preprocess → ODL tag → veraPDF
            check → re-audit) takes the most expensive part of commercial
            PDF remediation — the auto-tagging step — and replaces it with
            an
            <code class="text-xs font-mono"
              >apt install openjdk-17-jre-headless</code
            >. The other open-source tools we pair it with
            (<a
              href="https://qpdf.sourceforge.io/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >qpdf</a
            >
            for preprocessing,
            <a
              href="https://verapdf.org/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >veraPDF</a
            >
            for PDF/UA-1 conformance validation) are also free and mature.
            Together they form a complete pipeline that until very recently
            did not exist in open source.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            What ODL <em>doesn't</em> do — and no auto-tagger does — is
            judge whether the resulting structure is <em>meaningful</em>. It
            can mark every image as a Figure but can't write an alt-text. It
            can mark every table cell but can't decide which row is the
            header. Those remain human judgment calls. The economic shift
            ODL enables is from "$1,500/year + per-document manual labor"
            to "<strong>$0 of software + the manual labor for the parts a
            machine genuinely cannot do</strong>." That's an order-of-magnitude
            cost reduction for the agencies it serves, with no loss of
            output quality.
          </p>
        </div>

        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
            Tool 3: OpenDataLoader PDF (Auto-Tagging)
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            <a
              href="https://github.com/opendataloader-project/opendataloader-pdf"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >OpenDataLoader PDF</a
            >
            (ODL) is an Apache-2.0-licensed Java application that takes an
            untagged PDF and writes a Tagged PDF with a populated
            <code class="text-xs font-mono">StructTreeRoot</code>. It is the
            first open-source tool to offer this transformation; it ranks #1
            overall (0.907) in 2026 PDF-extraction benchmarks across reading
            order, table extraction, and heading detection. ICJIA maintains a
            fork at
            <a
              href="https://github.com/ICJIA/opendataloader-pdf"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >ICJIA/opendataloader-pdf</a
            >
            as a hedge against future license changes upstream.
          </p>
          <ul class="space-y-1 text-xs text-[var(--text-muted)] mb-3">
            <li>
              <strong>Invocation:</strong>
              <code class="font-mono"
                >@opendataloader/pdf</code
              >
              v2.4.3 npm wrapper around a bundled JAR
              (<code class="font-mono">lib/opendataloader-pdf-cli.jar</code>).
            </li>
            <li>
              <strong>Runtime:</strong> OpenJDK 17+
              (<code class="font-mono">java -version</code> ≥ 11 required;
              install via
              <code class="font-mono">apt install openjdk-17-jre-headless</code>
              on Ubuntu 22.x).
            </li>
            <li>
              <strong>JVM heap cap:</strong>
              <code class="font-mono">JAVA_TOOL_OPTIONS=-Xmx768m</code>
              set per-invocation by the worker as a safety rail against
              pathological documents.
            </li>
            <li>
              <strong>Convert options used:</strong>
              <code class="font-mono"
                >{ outputDir, format: 'tagged-pdf', quiet: true }</code
              >. Hybrid mode (docling-fast + SmolVLM) is deliberately not
              used in v1 — see the spike report for why.
            </li>
            <li>
              <strong>Wall-clock timeout:</strong>
              <code class="font-mono">REMEDIATION.WORKER_TIMEOUT_MS</code>
              (5 min default); the JVM child is killed on overrun.
            </li>
          </ul>
          <p class="text-[var(--text-muted)] mb-3">
            <strong>Why a Java tool</strong> in a Node.js codebase: every other
            open-source PDF/UA-targeted auto-tagger is either commercial
            (Apryse, Adobe PDF Services API), Java-only, or both. The
            tradeoff is one additional system dependency (JRE) on the deploy
            box in exchange for free, locally-hosted auto-tagging with no
            outbound API calls.
          </p>
        </div>

        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
            qpdf Preprocessing: <code class="text-xs font-mono">--object-streams=disable</code>
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            Stage 1 of the remediation pipeline pipes the input through
            <code class="text-xs font-mono"
              >qpdf --object-streams=disable INPUT NORMALIZED</code
            >
            before ODL ever touches it. This decompresses PDF 1.5+ compressed
            object streams to traditional uncompressed objects. Without this
            preprocessing, ODL's Java PDF writer corrupts the output xref
            table on certain inputs — specifically, tagged PDFs emitted by
            modern Adobe InDesign (18.x) and Microsoft Word 365.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            This bug was discovered during the OpenDataLoader feasibility spike
            on the
            <code class="text-xs font-mono">FY_22_ICJIA_Annual_Report</code>
            (InDesign 18.2) and
            <code class="text-xs font-mono">2022 SFS Process Evaluation Report</code>
            (Word 365) fixtures. Without preprocessing, ODL emits a PDF that
            <code class="text-xs font-mono">qpdf --check</code> reports as
            damaged: <em>xref num N not found</em>,
            <em>Invalid object stream</em>,
            <em>Catalog object is wrong type (null)</em>. With preprocessing,
            both PDFs round-trip cleanly and the score moves from F to D-grade
            improvement. See
            <code class="font-mono">docs/archive/spike-remediation-results.md</code>
            for the full reproducer + results.
          </p>
        </div>

        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
            Output Validation: qpdf --check + veraPDF
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            Every remediated PDF passes through two independent validators
            before the worker is allowed to serve it. The output is rejected
            (job marked <code class="font-mono">failed</code>, file deleted)
            on any failure, even though the upstream pipeline succeeded.
          </p>
          <ul class="space-y-1 text-xs text-[var(--text-muted)] mb-3">
            <li>
              <strong
                ><code class="font-mono">qpdf --check &lt;output&gt;</code
                >:</strong
              >
              parses the entire PDF structure and reports warnings on damaged
              xref tables, malformed object streams, broken catalogs, etc.
              The worker treats <em>"operation succeeded with warnings"</em>
              as a failure — better to discard a borderline file than serve
              a damaged one.
            </li>
            <li>
              <strong
                ><code class="font-mono"
                  >verapdf --flavour ua1 --format json &lt;output&gt;</code
                >:</strong
              >
              runs the
              <a
                href="https://verapdf.org/"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[var(--link)] hover:text-[var(--link-hover)]"
                >veraPDF</a
              >
              open-source PDF/UA-1 conformance validator (from the PDF
              Association + Dual Lab). Configured via
              <code class="font-mono">REMEDIATION_VERAPDF_PATH</code>;
              optional — when not configured, the receipt records
              <em>verapdf_unavailable</em> and skips this step. veraPDF's
              verdict is <strong>informational, not blocking</strong>: even
              a PDF that veraPDF flags as non-conformant is still served if
              the audit score didn't regress. The result page surfaces this
              honestly in the IITAA compliance disclaimer.
            </li>
          </ul>
        </div>

        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
            Regression Guards
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            After successful tagging + validation, the worker re-audits the
            output and compares against the pre-flight audit stored at job
            creation time. Three independent comparisons run:
          </p>
          <div
            class="mt-2 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
          >if (output.overallScore                                  &lt; input.overallScore                                  ||
    output.scoreProfiles.strict.overallScore             &lt; input.scoreProfiles.strict.overallScore       ||
    output.scoreProfiles.remediation.overallScore        &lt; input.scoreProfiles.remediation.overallScore) {
  recordEvent(jobId, 'validation_failed', { regressed_profiles: [...] })
  await deleteAndVerify(jobId, taggedPath, 'cleanup')
  setFailed(jobId, `auto-remediation regressed: ${regressed.join(', ')}`)
  return
}</div>
          <p class="text-[var(--text-muted)] mt-3">
            <strong>Why all three:</strong> the headline overall score uses
            whichever profile is the active scoring mode, which can mask a
            regression on the other profile. Checking both profiles plus the
            displayed overall ensures the user never sees a metric that
            decreased. The
            <code class="font-mono">validation_failed</code> event payload
            records all six numbers (input/output × overall + strict +
            practical) plus the
            <code class="font-mono">regressed_profiles</code> array, so any
            auditor query can identify exactly which profile failed and by
            how much.
          </p>
        </div>

        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
            Lifecycle Audit Trail: <code class="text-xs font-mono">remediation_events</code>
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            Every remediation produces an append-only series of timestamped
            lifecycle events in the <code class="font-mono">remediation_events</code>
            SQLite table (<code class="font-mono">apps/api/data/audit.db</code>).
            The table is the canonical source for the receipt displayed on
            the result page, the auditor evidence trail, and any future
            compliance reporting. PDF content is never stored — only structural
            metadata.
          </p>
          <div
            class="mt-2 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
          >CREATE TABLE remediation_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        TEXT    NOT NULL,
  event         TEXT    NOT NULL,
  occurred_at   INTEGER NOT NULL,
  details       TEXT,     -- JSON, content-free metadata only
  FOREIGN KEY (job_id) REFERENCES remediation_jobs(id)
);</div>
          <p class="text-[var(--text-muted)] mt-3 mb-2">
            <strong>Event vocabulary (closed set, typed at compile time):</strong>
          </p>
          <ul class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-[var(--text-muted)] font-mono">
            <li>received</li>
            <li>processing_started</li>
            <li>normalize_complete</li>
            <li>input_deleted</li>
            <li>tagging_complete</li>
            <li>intermediate_deleted</li>
            <li>validation_passed</li>
            <li>validation_failed</li>
            <li>verapdf_passed</li>
            <li>verapdf_failed</li>
            <li>verapdf_unavailable</li>
            <li>output_ready</li>
            <li>downloaded</li>
            <li>output_deleted</li>
            <li>verified_absent</li>
            <li>verify_failed</li>
            <li>expired</li>
            <li>error</li>
          </ul>
          <p class="text-[var(--text-muted)] mt-3">
            The <code class="font-mono">verified_absent</code> event is the
            critical compliance signal. It is emitted after the worker (or
            cleanup sweep, or download handler) calls
            <code class="font-mono">fs.unlink</code> on a job artifact AND
            <code class="font-mono">fs.stat</code> returns
            <code class="font-mono">ENOENT</code>. The details payload
            contains a SHA-256 hash of the deleted path string (not file
            content) so auditors can reconcile event entries against expected
            paths without storing the paths themselves in the log.
          </p>
        </div>

        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
            Privacy & Retention (Remediation-Specific)
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            The remediation pipeline maintains the same posture as the audit
            pipeline (no PDF content persisted) with three additional rules:
          </p>
          <ol class="space-y-2 text-xs text-[var(--text-muted)] list-decimal list-inside">
            <li>
              <strong>No between-stage cache.</strong> The just-audited PDF
              is <em>not</em> cached on disk waiting for the user to click
              Remediate. Clicking Remediate prompts a re-upload. UX cost:
              one extra upload. Privacy cost of caching: declined.
            </li>
            <li>
              <strong>Inputs deleted between pipeline stages.</strong> The
              worker writes
              <code class="font-mono">work/input.pdf</code>, normalizes it
              to <code class="font-mono">work/normalized.pdf</code>, then
              <code class="font-mono">deleteAndVerify(work/input.pdf)</code>.
              Once ODL produces
              <code class="font-mono">work/odl/&lt;name&gt;_tagged.pdf</code>,
              the normalized intermediate is deleted. At any moment, at most
              one copy of the PDF exists on disk per job. The entire scratch
              dir is wiped in a <code class="font-mono">finally</code> block
              regardless of pipeline outcome.
            </li>
            <li>
              <strong>Output deleted on first download.</strong>
              <code class="font-mono">GET /api/remediate/:id/download</code>
              streams via <code class="font-mono">createReadStream + pipe</code>
              (no memory buffering); the response
              <code class="font-mono">'close'</code> handler triggers
              <code class="font-mono">deleteAndVerify(outputPath, 'download')</code>.
              The job row is marked
              <code class="font-mono">status='expired'</code> <em>before</em>
              the stream begins, so a concurrent second download request
              sees <code class="font-mono">410 Gone</code>. Files not
              downloaded within <code class="font-mono">REMEDIATION.OUTPUT_TTL_MS</code>
              (30 min default) are deleted by the cleanup sweep.
            </li>
          </ol>
          <p class="text-[var(--text-muted)] mt-3">
            Filesystem permissions are
            <code class="font-mono">0700</code> on
            <code class="font-mono">apps/api/data/remediation/</code> and
            <code class="font-mono">0600</code> on output files. Output
            filenames are
            <code class="font-mono">&lt;jobId&gt;.pdf</code> where
            <code class="font-mono">jobId</code> is a UUIDv4 (122 bits of
            entropy) — not derivable from the user's input. The
            <code class="font-mono">remediation_events</code> rows are
            retained per
            <code class="font-mono">REMEDIATION.EVENT_LOG_RETENTION_DAYS</code>
            (7 years default — typical state-agency records-retention
            schedule); the
            <code class="font-mono">remediation_jobs</code> row is purged
            separately at
            <code class="font-mono">REMEDIATION.JOB_ROW_RETENTION_DAYS</code>
            (30 days default).
          </p>
        </div>

        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">
            Deploy Topology (Ubuntu 22.04 + PM2 + Nginx + DigitalOcean)
          </h3>
          <p class="text-[var(--text-muted)] mb-3">
            The API spawns the worker via
            <code class="font-mono"
              >spawn(process.execPath, ['--import', 'tsx', WORKER_PATH, jobId], { detached: true, stdio: 'ignore' }).unref()</code
            >.
            PM2 does not manage the worker — it's a transient child of the
            API process, killed by the OS when the pipeline completes or
            crashes. Worker stdout is suppressed; all signals flow through
            the database (<code class="font-mono">remediation_jobs.status</code>,
            <code class="font-mono">progress_pct</code>,
            <code class="font-mono">step</code>) which the frontend polls
            via
            <code class="font-mono">GET /api/remediate/:id/status</code>
            every 2 seconds.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            <strong>System packages required on the deploy box:</strong>
            <code class="font-mono">qpdf ≥ 10.x</code>,
            <code class="font-mono">openjdk-17-jre-headless</code>, and
            (optional) the veraPDF CLI from
            <a
              href="https://verapdf.org/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--link)] hover:text-[var(--link-hover)]"
              >verapdf.org</a
            >. The
            <code class="font-mono">rebuild.sh</code> preflight verifies all
            three on every deploy and emits warnings if any are missing or
            below required version. The feature flag
            <code class="font-mono">REMEDIATION_ENABLED</code> is forwarded
            from the parent shell through
            <code class="font-mono">ecosystem.config.cjs</code>'s env block,
            so the deploy idiom is:
          </p>
          <div
            class="mt-3 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)] whitespace-pre overflow-x-auto"
          >sudo apt install -y openjdk-17-jre-headless     # one-time
echo 'REMEDIATION_ENABLED=true' | sudo tee -a /etc/environment
source /etc/environment
./rebuild.sh                                     # pulls, builds, pm2 restart

# Rollback to audit-only without redeploying:
sudo sed -i '/^REMEDIATION_ENABLED=/d' /etc/environment
pm2 restart ecosystem.config.cjs</div>
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
          <p class="text-[var(--text-muted)] mt-3">
            <strong>These limitations apply to auto-remediation too.</strong>
            When the optional auto-remediation feature runs, OpenDataLoader
            can add a <code class="text-xs font-mono">/Figure</code>
            structure element for an image — but it cannot author a
            meaningful description. The same human-judgment gap applies to
            color contrast, reading-order ambiguity in multi-column layouts,
            distinguishing decorative from informative images, and writing
            text at a clear reading level. Auto-remediation is genuinely
            helpful for the machine-checkable parts of accessibility
            (structure, metadata, language declaration); it is not a
            substitute for the human-judgment parts. The result page is
            explicit about this in the IITAA compliance disclaimer.
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
                >The file exists in server memory for the duration of
                analysis (typically under 10 seconds); the qpdf analyzer
                briefly works from a randomly named temp copy that is deleted
                in the same request.</span
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
                >Shared links expire after <strong>365 days</strong>. After
                expiration, the stored results are eligible for permanent
                deletion. The 365-day window is sized for the auditor / fleet
                inventory use case — fleet reports run on a multi-month cadence
                and reviewers need report links to stay valid for at least a
                year. Older results are deleted by the periodic cleanup
                sweep.</span
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

          <!-- Remediation-specific privacy details -->
          <p class="text-[var(--text-muted)] mt-5 mb-2">
            <strong>When auto-remediation is enabled</strong> (the optional
            v1.18.0 feature behind
            <code class="text-xs font-mono">REMEDIATION_ENABLED=true</code>),
            the file lifecycle differs from a plain audit. The remediation
            worker needs the PDF on disk briefly to run external tools (qpdf,
            OpenDataLoader, veraPDF). The posture remains "as short-lived as
            the work requires, then deleted with verification":
          </p>
          <ul class="space-y-1.5 text-xs text-[var(--text-muted)]">
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                ><strong>No between-stage cache.</strong> A PDF is never
                stored on disk waiting for the user to click "Remediate"
                after an audit. Clicking the button prompts a fresh
                multipart upload — the just-audited buffer is not preserved
                server-side.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                ><strong>Inputs deleted between pipeline stages.</strong>
                After qpdf normalizes the uploaded file, the original input
                is deleted. After OpenDataLoader produces the tagged
                output, the normalized intermediate is deleted. At any
                moment, at most one copy of the PDF exists on disk per
                job. The entire scratch directory is wiped in a
                <code class="text-xs font-mono">finally</code> block
                regardless of pipeline outcome (including crashes).</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                ><strong>Output deleted on first download.</strong> The
                remediated PDF is served via a single-use download token.
                The file is deleted as soon as the response stream closes,
                and an
                <code class="text-xs font-mono">fs.stat</code> call
                verifies the deletion succeeded (the
                <code class="text-xs font-mono">verified_absent</code>
                event in the audit log is the auditor evidence). Concurrent
                or repeat download attempts return
                <code class="text-xs font-mono">410 Gone</code>.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                ><strong>Maximum 30-minute output retention.</strong> If
                the user never downloads, a cleanup sweep removes the file
                after
                <code class="text-xs font-mono">REMEDIATION.OUTPUT_TTL_MS</code>
                (default 30 minutes) and marks the job
                <code class="text-xs font-mono">status='expired'</code>.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                ><strong>Lifecycle events contain no PDF content.</strong>
                Each step (received, normalize_complete, tagging_complete,
                validation_passed, output_ready, downloaded, output_deleted,
                verified_absent, etc.) writes a row to
                <code class="text-xs font-mono">remediation_events</code>
                with a server-side timestamp and a JSON payload of structural
                metadata only. File paths are recorded as SHA-256 hashes
                rather than literal strings.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                ><strong>No external API calls.</strong> The remediation
                pipeline runs entirely on this server. OpenDataLoader and
                veraPDF execute locally; the file never leaves the droplet.
                AI-based alt text generation (which would call a hosted
                vision API) is explicitly not used in v1 — see the
                <code class="text-xs font-mono"
                  >docs/archive/pdf-remediation-alt-text-walkthrough-spec.md</code
                >
                roadmap document for the AI-free Phase 1 approach.</span
              >
            </li>
            <li class="flex gap-2">
              <span class="text-[var(--text-muted)]">•</span
              ><span
                ><strong>Per-user concurrency limit.</strong> Each user can
                have at most one remediation job in flight at a time
                (<code class="text-xs font-mono"
                  >REMEDIATION.MAX_CONCURRENT_JOBS_PER_USER</code
                >). The 50 MB file-size cap, 500-page count cap, 5-minute
                wall-clock timeout, and 768 MB JVM heap cap are additional
                resource-exhaustion guards.</span
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
            The complete source code for the analysis
            <em>and</em> auto-remediation pipelines is open source.
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
              href="https://github.com/ICJIA/file-accessibility-audit/tree/main/apps/api/src/jobs"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"
                />
              </svg>
              Remediation Services (worker, ODL, veraPDF)
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

    <!-- Feature stats (infographic style) -->
    <div class="mt-12 mb-2 text-center">
      <h2 class="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--text-muted)]">
        What This Tool Does
      </h2>
      <p class="mt-2 text-sm text-[var(--text-secondary)] max-w-2xl mx-auto">
        Audit any PDF or Word (.docx) document for WCAG 2.2 AA accessibility — and
        (optionally) auto-remediate PDFs — all on infrastructure you control, with
        no AI and no per-document fees.
      </p>
    </div>

    <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-center">
      <!-- Audit -->
      <div
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6"
      >
        <div
          class="text-4xl sm:text-5xl font-black text-[var(--accent-green)] mb-3 leading-none"
        >
          9
        </div>
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">
          WCAG categories audited
        </div>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          Each PDF scored across 9 categories aligned with
          <strong>WCAG 2.2 Level AA</strong> and ADA Title II. A–F letter grade plus
          Critical / Serious / Moderate severity per category so you know what to
          fix first.
        </p>
      </div>

      <!-- Auto-Remediate -->
      <div
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6"
      >
        <div
          class="text-4xl sm:text-5xl font-black text-[var(--accent-green)] mb-3 leading-none"
        >
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
          pipeline. Output never regresses any score profile, and manual review is
          still recommended for IITAA compliance.
        </p>
      </div>

      <!-- Standards alignment -->
      <div
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6"
      >
        <div
          class="text-4xl sm:text-5xl font-black text-[var(--accent-green)] mb-3 leading-none"
        >
          PDF/UA-1
        </div>
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">
          Standards aligned
        </div>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          WCAG 2.2 Level AA, ADA Title II (effective April 2026), Illinois IITAA 2.1,
          and PDF/UA-1 (ISO 14289-1) via veraPDF. Full lifecycle audit trail with
          deletion verification for compliance reporting.
        </p>
      </div>

      <!-- Privacy -->
      <div
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6"
      >
        <div
          class="text-4xl sm:text-5xl font-black text-[var(--accent-green)] mb-3 leading-none"
        >
          0
        </div>
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">
          PDFs retained
        </div>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          Uploaded files exist on the server only as long as the pipeline requires.
          Audited files: in-memory, gone in seconds. Remediated outputs: deleted on
          first download or 30-minute TTL, then
          <code class="font-mono text-[10px]">fs.stat</code>-verified absent.
        </p>
      </div>

      <!-- No AI / no third-party -->
      <div
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6"
      >
        <div
          class="text-4xl sm:text-5xl font-black text-[var(--accent-green)] mb-3 leading-none"
        >
          $0
        </div>
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">
          No AI, no third-party APIs
        </div>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          Every step runs on this server. No data is sent to vision models, hosted
          AI services, or commercial PDF SDKs. The toolchain (qpdf, pdfjs,
          OpenDataLoader, veraPDF) is entirely open source — no per-document fees,
          no SDK licensing.
        </p>
      </div>

      <!-- Open source / cost -->
      <div
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-6"
      >
        <div
          class="text-4xl sm:text-5xl font-black text-[var(--accent-green)] mb-3 leading-none"
        >
          100%
        </div>
        <div class="text-sm font-semibold text-[var(--text-heading)] mb-1">
          Open source
        </div>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          Every line of code is on
          <a
            href="https://github.com/ICJIA/file-accessibility-audit"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >GitHub</a
          >
          — fork it, audit it, run it on your own infrastructure. Underlying tools
          use Apache 2.0 / MIT / MPL licenses. Designed for state agencies that need
          control over their accessibility pipeline.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getWcagCriteria, getWcagMeta } from "~/utils/wcag";
import NaCell from "~/components/NaCell.vue";
import ReportActionBanner from "~/components/ReportActionBanner.vue";
import IssuesSummary from "~/components/IssuesSummary.vue";
import ReportFileBanner from "~/components/ReportFileBanner.vue";
import MethodologyCard from "~/components/MethodologyCard.vue";
import ScrollToTop from "~/components/ScrollToTop.vue";
import { partitionCardFindings } from "~/utils/findings";


// Word (.docx) support can be disabled server-side (DOCX_ENABLED=false); mirror
// that in the hero copy so we never invite a format the API will reject.
const runtimeConfig = useRuntimeConfig();
const docxEnabled = computed(() => runtimeConfig.public.docxEnabled !== false);
const heroTitle = computed(() =>
  docxEnabled.value
    ? "Check your PDFs and Word docs for accessibility"
    : "Check your PDFs for accessibility",
);
const heroUploadNoun = computed(() =>
  docxEnabled.value ? "PDF or Word document" : "PDF",
);

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
  exportText,
  exportHtml,
  exportPdfViaBrowserPrint,
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
const processing = ref(false);
const processingStage = ref("");
const singleResult = ref<any>(null);
const singleFile = ref<File | null>(null);
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

function scrollToExport() {
  document
    .getElementById("export-section")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const subject = encodeURIComponent(
    `PDF Accessibility Report: ${result.value.filename}`,
  );
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
