<template>
  <div>
    <!-- Error state -->
    <div v-if="analysisError" class="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 p-6">
      <h3 class="font-semibold text-[var(--status-error)] mb-2">{{ analysisError.error }}</h3>
      <p v-if="analysisError.details" class="text-sm text-[var(--text-muted)]">{{ analysisError.details }}</p>
      <UButton class="mt-4" variant="outline" color="neutral" @click="clearResults">
        Try Another File
      </UButton>
    </div>

    <!-- Results state -->
    <div v-else-if="result">
      <!-- Scanned warning banner -->
      <div v-if="result.isScanned" class="mb-6 rounded-xl bg-orange-500/10 border border-orange-500/30 p-4">
        <p class="text-[var(--status-warning-orange)] font-medium text-sm">
          This PDF appears to be a scanned image. Screen readers cannot access its content. OCR and full remediation are required.
        </p>
      </div>

      <!-- Warnings -->
      <div v-if="result.warnings?.length" class="mb-6 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4">
        <p v-for="w in result.warnings" :key="w" class="text-[var(--status-warning-yellow)] text-sm">{{ w }}</p>
      </div>

      <!-- Score Hero -->
      <div class="text-center mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-8">
        <ScoreCard :result="result" />
      </div>

      <!-- Methodology -->
      <div class="mb-8 rounded-xl border border-[var(--border-alt)] bg-[var(--surface-card-alt)] px-6 py-5">
        <h2 class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3 text-center">How Scores Are Derived</h2>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed mb-4 text-center">
          This tool uses established open-source libraries to extract and analyze PDF structure. Scores are calculated against
          <a href="https://www.w3.org/WAI/WCAG21/quickref/" target="_blank" rel="noopener noreferrer" class="text-[var(--link)] hover:text-[var(--link-hover)]">WCAG 2.1 Level AA</a>
          success criteria and
          <a href="https://www.ada.gov/resources/title-ii-rule/" target="_blank" rel="noopener noreferrer" class="text-[var(--link)] hover:text-[var(--link-hover)]">ADA Title II</a>
          digital accessibility requirements.
        </p>
        <div class="flex flex-wrap justify-center gap-2 mb-4">
          <a href="https://qpdf.readthedocs.io/" target="_blank" rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] bg-[var(--surface-hover)] hover:bg-[var(--surface-icon)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition-colors">
            <svg class="w-3.5 h-3.5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" /></svg>
            QPDF
            <span class="text-[var(--text-muted)]">— PDF structure &amp; tag extraction</span>
          </a>
          <a href="https://mozilla.github.io/pdf.js/" target="_blank" rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] bg-[var(--surface-hover)] hover:bg-[var(--surface-icon)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition-colors">
            <svg class="w-3.5 h-3.5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" /></svg>
            PDF.js <span class="text-[var(--text-muted)]">(Mozilla)</span>
            <span class="text-[var(--text-muted)]">— content &amp; metadata analysis</span>
          </a>
        </div>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed text-center">
          Nine categories are weighted by impact — from text extractability (the most fundamental barrier) to reading order. Categories that don't apply are excluded and weights renormalized.
        </p>
      </div>

      <!-- Score Table -->
      <div class="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden">
        <div class="px-5 py-3 border-b border-[var(--border)]">
          <h2 class="text-sm font-semibold text-[var(--text-secondary)]">Category Scores</h2>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--border)] text-[var(--text-secondary)] text-xs uppercase tracking-wide">
              <th class="text-left px-5 py-2 font-medium">Category</th>
              <th class="text-center px-3 py-2 font-medium">Score</th>
              <th class="text-center px-3 py-2 font-medium">Grade</th>
              <th class="text-center px-3 py-2 font-medium">Severity</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="cat in scoredCategories"
              :key="cat.id"
              class="border-b border-[var(--border-subtle)] last:border-0"
            >
              <td class="px-5 py-2.5 text-[var(--text-secondary)]">{{ cat.label }}</td>
              <td class="text-center px-3 py-2.5 font-mono" :style="{ color: catColor(cat) }">
                {{ cat.score }}
              </td>
              <td class="text-center px-3 py-2.5">
                <span
                  v-if="cat.grade"
                  class="inline-flex w-6 h-6 rounded-full text-xs font-bold items-center justify-center"
                  :style="{ backgroundColor: catColor(cat) + '20', color: catColor(cat) }"
                >{{ cat.grade }}</span>
                <span v-else class="text-[var(--text-muted)]">—</span>
              </td>
              <td class="text-center px-3 py-2.5">
                <span
                  v-if="cat.severity"
                  class="text-xs px-2 py-0.5 rounded-full"
                  :style="{ backgroundColor: sevColor(cat.severity) + '15', color: sevColor(cat.severity) }"
                >{{ cat.severity }}</span>
                <span v-else class="text-[var(--text-muted)] text-xs">—</span>
              </td>
            </tr>
          </tbody>
          <tbody v-if="naCategories.length">
            <tr class="border-t border-[var(--border)]">
              <td colspan="4" class="px-5 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide bg-[var(--surface-deep)]">
                Not Included in Scoring
              </td>
            </tr>
            <tr
              v-for="cat in naCategories"
              :key="cat.id"
              class="border-b border-[var(--border-subtle)] last:border-0"
            >
              <td class="px-5 py-2.5 text-[var(--text-muted)]">{{ cat.label }}</td>
              <td class="text-center px-3 py-2.5 font-mono text-[var(--text-muted)]">N/A</td>
              <td class="text-center px-3 py-2.5 text-[var(--text-muted)]">—</td>
              <td class="text-center px-3 py-2.5 text-[var(--text-muted)] text-xs">N/A</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- PDF Metadata -->
      <div v-if="result.pdfMetadata" class="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden">
        <div class="px-5 py-3 border-b border-[var(--border)]">
          <h2 class="text-sm font-semibold text-[var(--text-secondary)]">Document Metadata</h2>
          <p class="text-xs text-[var(--text-muted)] mt-0.5">Informational only — not included in the accessibility score</p>
        </div>
        <div class="divide-y divide-[var(--border-subtle)]">
          <div v-for="item in metadataItems" :key="item.label" class="flex px-5 py-2.5 text-sm">
            <span class="w-40 flex-shrink-0 text-[var(--text-muted)]">{{ item.label }}</span>
            <span :class="item.value ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)] italic'">
              {{ item.value || 'Not set' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Detailed Findings -->
      <h2 class="text-lg font-semibold mb-4">Detailed Findings</h2>

      <div class="space-y-4">
        <div
          v-for="cat in scoredCategories"
          :key="cat.id"
          class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5"
        >
          <div class="flex items-center gap-3 mb-3">
            <h3 class="font-semibold text-[var(--text-heading)]">{{ cat.label }}</h3>
            <span class="text-sm font-mono" :style="{ color: catColor(cat) }">
              {{ cat.score !== null ? `${cat.score}/100` : 'N/A' }}
            </span>
            <span
              v-if="cat.severity"
              class="text-xs px-2 py-0.5 rounded-full ml-auto"
              :style="{ backgroundColor: sevColor(cat.severity) + '15', color: sevColor(cat.severity) }"
            >{{ cat.severity }}</span>
          </div>

          <p v-if="cat.explanation" class="text-sm text-[var(--text-secondary)] bg-[var(--surface-deep)] rounded-lg px-4 py-3 border border-[var(--border-subtle)] mb-3">
            <span class="text-[var(--text-muted)] font-medium">What this checks:</span>
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
                :style="findingIconStyle(cat)"
              >{{ findingIcon(cat) }}</span>
              <span>{{ finding }}</span>
            </li>
          </ul>

          <div v-if="cat.helpLinks?.length" class="mt-3 pt-3 border-t border-[var(--border-subtle)]">
            <span class="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Learn more</span>
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
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Not Included in Scoring -->
      <div v-if="naCategories.length">
        <h2 class="text-lg font-semibold mb-4 mt-8 text-[var(--text-secondary)]">Not Included in Scoring</h2>

        <div class="space-y-4">
          <div
            v-for="cat in naCategories"
            :key="cat.id"
            class="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5"
          >
            <div class="flex items-center gap-3 mb-3">
              <h3 class="font-semibold text-[var(--text-muted)]">{{ cat.label }}</h3>
              <span class="text-sm font-mono text-[var(--text-muted)]">N/A</span>
            </div>

            <p v-if="cat.explanation" class="text-sm text-[var(--text-secondary)] bg-[var(--surface-deep)] rounded-lg px-4 py-3 border border-[var(--border-subtle)] mb-3">
              <span class="text-[var(--text-muted)] font-medium">What this checks:</span>
              {{ cat.explanation }}
            </p>

            <ul class="space-y-1.5 max-h-96 overflow-y-auto">
              <li
                v-for="(finding, i) in cat.findings"
                :key="i"
                class="text-sm text-[var(--text-muted)] flex gap-2"
              >
                <span class="flex-shrink-0 mt-0.5 font-bold" :style="{ color: 'var(--icon-na)' }">–</span>
                <span>{{ finding }}</span>
              </li>
            </ul>

            <div v-if="cat.helpLinks?.length" class="mt-3 pt-3 border-t border-[var(--border-subtle)]">
              <span class="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Learn more</span>
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
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Export & Share -->
      <div class="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 report-actions">
        <!-- Download row -->
        <p class="text-sm font-medium text-[var(--text-muted)] mb-3 text-center">Download Report</p>
        <div class="flex flex-wrap gap-2 justify-center">
          <UButton variant="soft" color="neutral" size="sm" @click="exportDocx(result)" :loading="exporting">
            <template #leading>
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            </template>
            Word (.docx)
          </UButton>
          <UButton variant="soft" color="neutral" size="sm" @click="exportHtml(result)">
            <template #leading>
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>
            </template>
            HTML (.html)
          </UButton>
          <UButton variant="soft" color="neutral" size="sm" @click="exportMarkdown(result)">
            <template #leading>
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            </template>
            Markdown (.md)
          </UButton>
          <UButton variant="soft" color="neutral" size="sm" @click="exportJSON(result)">
            <template #leading>
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>
            </template>
            JSON (.json)
          </UButton>
        </div>

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
              @click="handleShare"
              :loading="sharing"
            >
              <template #leading>
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
              </template>
              Create Shareable Link
            </UButton>
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-2 text-center">Creates a public link anyone can view. Expires in 30 days.</p>
          <p v-if="shareError" class="text-xs text-[var(--status-error)] mt-1">{{ shareError }}</p>
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
            >
            <UButton variant="soft" color="neutral" size="sm" @click="copyShareUrl">
              {{ copied ? 'Copied!' : 'Copy' }}
            </UButton>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton variant="soft" color="primary" size="sm" @click="emailShareUrl">
              <template #leading>
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
              </template>
              Email Link
            </UButton>
            <UButton variant="ghost" color="neutral" size="xs" @click="clearShare">
              Dismiss
            </UButton>
          </div>
        </div>
      </div>

      <div class="mt-4 text-center">
        <UButton variant="outline" color="neutral" @click="clearResults">
          Analyze Another File
        </UButton>
      </div>
    </div>

    <!-- Processing overlay -->
    <ProcessingOverlay v-else-if="processing" :stage="processingStage" />

    <!-- Drop zone (idle state) -->
    <div v-else>
      <div class="mb-8 text-center">
        <h2 class="text-2xl font-bold tracking-tight mb-3 text-[var(--accent-green)]">Check your PDFs for accessibility</h2>
        <p class="text-[var(--text-secondary)] font-medium max-w-xl mx-auto leading-relaxed">
          Upload a PDF to get an instant accessibility score based on
          <a href="https://www.w3.org/WAI/WCAG21/quickref/" target="_blank" rel="noopener noreferrer" class="text-[var(--accent-orange)] hover:text-[var(--accent-orange)] font-semibold">WCAG 2.1</a>
          and
          <a href="https://www.ada.gov/resources/title-ii-rule/" target="_blank" rel="noopener noreferrer" class="text-[var(--accent-orange)] hover:text-[var(--accent-orange)] font-semibold">ADA Title II</a>
          requirements. The audit checks nine categories — text extractability, heading structure, alt text, table markup, and more — and returns a detailed report with actionable findings.
        </p>
      </div>

      <!-- Drop hint banner -->
      <Transition name="fade">
        <div v-if="showDropHint" class="mb-4 rounded-xl bg-blue-500/10 border border-blue-500/25 px-5 py-3 text-center">
          <p class="text-sm text-blue-400 font-medium">Drop a PDF file on the area below, or click it to browse your files.</p>
        </div>
      </Transition>

      <DropZone @file-selected="analyzeFile" />

      <div class="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
        <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5">
          <div class="text-3xl font-black text-[var(--accent-green)] mb-2">9 Categories</div>
          <p class="text-sm text-[var(--text-muted)]">Accessibility categories scored across structure, navigation, and content</p>
        </div>
        <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5">
          <div class="text-3xl font-black text-[var(--accent-green)] mb-2">Accessibility Readiness</div>
          <p class="text-sm text-[var(--text-muted)]">Letter grade with severity levels so you know what to fix first</p>
        </div>
        <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5">
          <div class="text-3xl font-black text-[var(--accent-green)] mb-2">Export & Share</div>
          <p class="text-sm text-[var(--text-muted)]">Download reports as Word, HTML, Markdown, or JSON and share via link</p>
        </div>
      </div>
    </div>

    <!-- Technical Details (always visible, expandable) -->
    <details class="mt-12 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden group">
      <summary class="px-6 py-4 cursor-pointer text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-heading)] transition-colors select-none flex items-center gap-2">
        <svg class="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        Technical Details: How This Tool Analyzes PDFs
      </summary>
      <div class="px-6 pb-6 space-y-6 text-sm text-[var(--text-secondary)] leading-relaxed border-t border-[var(--border)]">

        <!-- Overview -->
        <div class="pt-5">
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">Overview: What This Tool Does</h3>
          <p class="text-[var(--text-muted)] mb-3">
            This tool checks whether a PDF document can be read by people who use <strong>assistive technology</strong> — screen readers, braille displays, and other tools used by people with disabilities. It does this by examining the internal structure of the PDF file, not just its visual appearance. A PDF that looks fine on screen may be completely unreadable to a screen reader if it lacks the right internal markup.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            The tool evaluates PDFs against <a href="https://www.w3.org/WAI/WCAG21/quickref/" target="_blank" rel="noopener noreferrer" class="text-[var(--link)] hover:text-[var(--link-hover)]">WCAG 2.1 Level AA</a> (the international standard for web content accessibility) and <a href="https://www.ada.gov/resources/title-ii-rule/" target="_blank" rel="noopener noreferrer" class="text-[var(--link)] hover:text-[var(--link-hover)]">ADA Title II</a> digital accessibility requirements (U.S. federal law requiring state and local government digital content to be accessible, effective April 2026).
          </p>

          <h3 class="font-semibold text-[var(--text-heading)] mb-2 mt-5">How It Works</h3>
          <p class="text-[var(--text-muted)] mb-3">
            When you upload a PDF, the server runs two independent, open-source analysis tools <strong>in parallel</strong> — one reads the PDF's internal structure (tags, bookmarks, form fields), the other extracts text and metadata from every page. Their combined output feeds a scorer that evaluates nine accessibility categories and produces a weighted overall score. No data is sent to third-party services or AI models — all processing happens locally on the server.
          </p>
          <div class="mt-3 rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
            PDF → [validate file type &amp; size] → parallel { QPDF (structure), PDF.js (content) } → Scorer (9 categories) → Weighted Score → Report
          </div>
        </div>

        <!-- QPDF -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">Tool 1: QPDF (PDF Structure Extraction)</h3>
          <p class="text-[var(--text-muted)] mb-3">
            <a href="https://qpdf.readthedocs.io/" target="_blank" rel="noopener noreferrer" class="text-[var(--link)] hover:text-[var(--link-hover)]">QPDF</a>
            is an open-source C++ command-line program for inspecting and transforming PDF files. It is maintained by Jay Berkenbilt and is widely used in PDF archival libraries, digital preservation projects, and accessibility workflows. Think of QPDF as a tool that can "open up" a PDF and read its internal blueprint — not just the words on the page, but the hidden structural information that tells assistive technology how the document is organized.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            <strong>How it's called:</strong> The server invokes QPDF as a subprocess with the <code class="text-xs bg-[var(--surface-deep)] px-1.5 py-0.5 rounded">--json</code> flag, which outputs the PDF's complete internal object graph as machine-readable JSON. The server writes the uploaded PDF to a temporary file, runs <code class="text-xs bg-[var(--surface-deep)] px-1.5 py-0.5 rounded">qpdf --json /tmp/&lt;uuid&gt;.pdf</code>, parses the resulting JSON, and immediately deletes the temp file. The subprocess has a 30-second timeout and a 50 MB output buffer to handle complex documents safely.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            <strong>Why QPDF?</strong> A PDF file is not a simple document — internally, it is a collection of numbered "objects" (text streams, images, fonts, bookmarks, form fields, tags) connected by cross-references. QPDF can decode and dump this entire object graph as structured data, which lets the tool inspect every accessibility-relevant feature without relying on visual rendering. No other open-source tool provides this level of structural access to PDFs.
          </p>
          <h4 class="font-medium text-[var(--text-secondary)] mb-2 text-xs uppercase tracking-wide">What QPDF extracts</h4>
          <div class="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
            <table class="w-full text-xs">
              <thead>
                <tr class="border-b border-[var(--border)] text-[var(--text-muted)] uppercase tracking-wide">
                  <th class="text-left px-4 py-2 font-medium">Data</th>
                  <th class="text-left px-4 py-2 font-medium">PDF Source</th>
                  <th class="text-left px-4 py-2 font-medium">Used For</th>
                </tr>
              </thead>
              <tbody class="text-[var(--text-muted)]">
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">StructTreeRoot</td>
                  <td class="px-4 py-2">Catalog <code>/StructTreeRoot</code></td>
                  <td class="px-4 py-2">Whether the PDF is "tagged" (has a semantic structure tree)</td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Language declaration</td>
                  <td class="px-4 py-2">Catalog <code>/Lang</code></td>
                  <td class="px-4 py-2">Language accessibility (screen reader pronunciation)</td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Headings (H1–H6)</td>
                  <td class="px-4 py-2">Structure elements with <code>/S</code> = <code>/H</code>, <code>/H1</code>…<code>/H6</code></td>
                  <td class="px-4 py-2">Heading presence, hierarchy validation, level-skip detection</td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Outlines / Bookmarks</td>
                  <td class="px-4 py-2"><code>/Outlines</code> → <code>/First</code>/<code>/Next</code> chain</td>
                  <td class="px-4 py-2">Bookmark count for navigation scoring</td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Tables &amp; headers</td>
                  <td class="px-4 py-2">Structure elements <code>/Table</code>, <code>/TH</code>, <code>/TD</code></td>
                  <td class="px-4 py-2">Whether data tables have accessible header markup</td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Images &amp; figures</td>
                  <td class="px-4 py-2">XObjects (<code>/Image</code>) + structure elements (<code>/Figure</code> with <code>/Alt</code>)</td>
                  <td class="px-4 py-2">Image detection and alt text presence</td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Form fields</td>
                  <td class="px-4 py-2">Widget annotations + <code>/AcroForm</code> <code>/Fields</code> + <code>/TU</code> tooltip</td>
                  <td class="px-4 py-2">Whether form fields have accessible labels</td>
                </tr>
                <tr>
                  <td class="px-4 py-2">Reading order MCIDs</td>
                  <td class="px-4 py-2">Numeric <code>/K</code> values (Marked Content IDs) in structure tree</td>
                  <td class="px-4 py-2">Content sequence validation — detects out-of-order reading</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- PDF.js -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">Tool 2: PDF.js (Content &amp; Metadata Extraction)</h3>
          <p class="text-[var(--text-muted)] mb-3">
            <a href="https://mozilla.github.io/pdf.js/" target="_blank" rel="noopener noreferrer" class="text-[var(--link)] hover:text-[var(--link-hover)]">PDF.js</a>
            is Mozilla's open-source JavaScript PDF renderer — the same library that powers Firefox's built-in PDF viewer, used by hundreds of millions of people. While QPDF reads the internal blueprint, PDF.js reads the PDF the way a human would: it renders each page and extracts the actual text content, metadata (title, author, language), and interactive elements like links. It runs server-side via Node.js, processing every page of the uploaded document.
          </p>
          <h4 class="font-medium text-[var(--text-secondary)] mb-2 text-xs uppercase tracking-wide">What PDF.js extracts</h4>
          <div class="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
            <table class="w-full text-xs">
              <thead>
                <tr class="border-b border-[var(--border)] text-[var(--text-muted)] uppercase tracking-wide">
                  <th class="text-left px-4 py-2 font-medium">Data</th>
                  <th class="text-left px-4 py-2 font-medium">Method</th>
                  <th class="text-left px-4 py-2 font-medium">Used For</th>
                </tr>
              </thead>
              <tbody class="text-[var(--text-muted)]">
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Text content</td>
                  <td class="px-4 py-2"><code>page.getTextContent()</code> per page</td>
                  <td class="px-4 py-2">Text extractability (minimum 50 chars = "has text")</td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Title, Author, Language</td>
                  <td class="px-4 py-2"><code>doc.getMetadata()</code></td>
                  <td class="px-4 py-2">Title/language scoring (filename-like titles are rejected)</td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Links &amp; link text</td>
                  <td class="px-4 py-2"><code>page.getAnnotations()</code> + spatial text matching</td>
                  <td class="px-4 py-2">Link quality — detects raw URLs vs. descriptive text</td>
                </tr>
                <tr class="border-b border-[var(--border-subtle)]">
                  <td class="px-4 py-2">Image count</td>
                  <td class="px-4 py-2"><code>page.getOperatorList()</code> per page</td>
                  <td class="px-4 py-2">Fallback image detection — counts paint operations when QPDF can't find tagged images</td>
                </tr>
                <tr>
                  <td class="px-4 py-2">Outlines</td>
                  <td class="px-4 py-2"><code>doc.getOutline()</code></td>
                  <td class="px-4 py-2">Bookmark detection (cross-referenced with QPDF)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-[var(--text-muted)] mt-3">
            <strong>Link text extraction</strong> uses a spatial matching algorithm: for each link annotation, PDF.js finds text items whose coordinates fall within the link's bounding rectangle (±5px tolerance), then joins them to determine the visible link text. This is how the tool distinguishes descriptive links ("View the full report") from raw URLs ("https://example.com/report.pdf").
          </p>
        </div>

        <!-- Why two tools -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">Why Two Tools?</h3>
          <p class="text-[var(--text-muted)] mb-3">
            No single open-source library can extract both the low-level PDF structure (tag trees, object references, XObjects) <em>and</em> the rendered text content. Each tool sees a different layer of the document:
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3">
              <p class="font-medium text-[var(--text-secondary)] mb-1 text-xs">QPDF sees:</p>
              <p class="text-xs text-[var(--text-muted)]">Structure tags, heading hierarchy, table markup, image objects, form field labels, bookmark chains, reading order markers — the "skeleton" of the document.</p>
            </div>
            <div class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3">
              <p class="font-medium text-[var(--text-secondary)] mb-1 text-xs">PDF.js sees:</p>
              <p class="text-xs text-[var(--text-muted)]">Rendered text content, document title and metadata, link URLs and their visible text, page count, image rendering operations — the "surface" of the document as a user would read it.</p>
            </div>
          </div>
          <p class="text-[var(--text-muted)] mt-3">
            By cross-referencing both outputs, the scorer can answer questions that neither tool could answer alone. For example: "Does this image have alt text?" requires QPDF to find the image object and its Figure tag, while "Is there any readable text on this page at all?" requires PDF.js to attempt text extraction. Running both tools in parallel hides their individual processing time.
          </p>
        </div>

        <!-- Scoring -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">How Scores Are Calculated</h3>
          <p class="text-[var(--text-muted)] mb-3">
            The scorer evaluates nine accessibility categories. Each category receives a score from 0 to 100 (or N/A if the category doesn't apply to the document). The overall score is a <strong>weighted average</strong> of applicable categories, with weights renormalized to exclude N/A categories.
          </p>

          <h4 class="font-medium text-[var(--text-secondary)] mb-2 text-xs uppercase tracking-wide">Category scoring logic</h4>
          <div class="space-y-3">
            <div class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3">
              <p class="font-medium text-[var(--text-secondary)] mb-1">Text Extractability (20% weight — highest)</p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> Can a screen reader actually read the words in this PDF? Some PDFs are just pictures of text (scanned documents) — they look normal on screen but are completely invisible to assistive technology.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>100</strong> = extractable text + structure tags (a properly tagged PDF). <strong>50</strong> = text is present but no tags (an untagged PDF — readable but poorly structured). <strong>25</strong> = tags are present but no extractable text (a scanned document that has been partially remediated with OCR). <strong>0</strong> = no text and no tags (an unremediated scanned image — completely inaccessible). This category carries the highest weight because if text can't be extracted, nothing else matters.
              </p>
            </div>
            <div class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3">
              <p class="font-medium text-[var(--text-secondary)] mb-1">Title &amp; Language (15%)</p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> The document title is the first thing a screen reader announces when a user opens the PDF. The language tag controls how the screen reader pronounces words — without it, an English document might be read with a French accent, making it incomprehensible.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> 50 points for a meaningful document title (filenames like "report_final.pdf" are automatically rejected as non-meaningful), plus 50 points for a declared language tag. Both are checked in QPDF's catalog <code>/Lang</code> and PDF.js metadata.
              </p>
            </div>
            <div class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3">
              <p class="font-medium text-[var(--text-secondary)] mb-1">Heading Structure (15%)</p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> Headings (H1, H2, H3, etc.) are how screen reader users navigate and skim documents — the same way sighted users scan bold section titles. Without headings, a blind user must listen to the entire document from start to finish to find the section they need.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>100</strong> = H1–H6 tags present with logical hierarchy (no level skips). <strong>60</strong> = numbered headings present but hierarchy is broken (e.g., jumps from H1 to H3 with no H2). <strong>40</strong> = only generic <code>/H</code> tags (not properly numbered H1–H6). <strong>0</strong> = no heading tags at all.
              </p>
            </div>
            <div class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3">
              <p class="font-medium text-[var(--text-secondary)] mb-1">Alt Text on Images (15%)</p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> Every informative image in a PDF must have "alternative text" — a short description that a screen reader reads aloud. Without alt text, a blind user hears nothing when they encounter a chart, photo, or diagram.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> The percentage of detected images that have alt text. QPDF identifies image objects (<code>/Image</code> XObjects) and matches them to their <code>/Figure</code> structure elements, then checks whether each Figure has an <code>/Alt</code> attribute. If QPDF finds no tagged images, PDF.js provides a fallback by counting image rendering operations — if images exist but aren't tagged, the category scores <strong>0</strong> (Critical) instead of N/A. <strong>N/A</strong> only if no images are detected by either tool.
              </p>
            </div>
            <div class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3">
              <p class="font-medium text-[var(--text-secondary)] mb-1">Bookmarks / Navigation (10%)</p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> Bookmarks act as a clickable table of contents in the PDF viewer's sidebar. For longer documents, they're essential for all users — and required by ADA Title II for documents over a certain length.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>N/A</strong> for documents under 10 pages (short documents don't require bookmarks). For longer documents: <strong>100</strong> = outline entries present and populated. <strong>25</strong> = outline structure exists but is empty. <strong>0</strong> = no outlines at all. Checked in both QPDF's <code>/Outlines</code> object chain and PDF.js's <code>getOutline()</code>.
              </p>
            </div>
            <div class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3">
              <p class="font-medium text-[var(--text-secondary)] mb-1">Table Markup (10%)</p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> When a sighted user looks at a data table, they can glance at the column headers to understand what each number means. Screen readers need explicit <code>/TH</code> (table header) tags to provide the same context — without them, a screen reader just reads a flat stream of numbers with no structure.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>N/A</strong> if no tables are detected. <strong>100</strong> = all <code>/Table</code> elements contain <code>/TH</code> header tags. <strong>40</strong> = tables exist but lack proper header markup.
              </p>
            </div>
            <div class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3">
              <p class="font-medium text-[var(--text-secondary)] mb-1">Link Quality (5%)</p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> Screen reader users often navigate by tabbing through links. Hearing "https://www.example.com/documents/2024/report-final-v3.pdf" read aloud character by character is unusable. Descriptive link text like "Download the 2024 Annual Report" tells users where the link goes.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>N/A</strong> if no links. Percentage of links with descriptive text. A link is flagged as non-descriptive if its visible text starts with <code>http://</code>, <code>https://</code>, or <code>www.</code>. PDF.js extracts the visible text overlapping each link annotation using spatial coordinate matching.
              </p>
            </div>
            <div class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3">
              <p class="font-medium text-[var(--text-secondary)] mb-1">Form Accessibility (5%)</p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> If a PDF contains fillable form fields (text boxes, checkboxes, dropdowns), each field needs a label that assistive technology can read. Without labels, a screen reader user hears "edit text" or "checkbox" with no indication of what the field is for.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>N/A</strong> if no form fields. Percentage of widget annotations (form fields) that have a <code>/TU</code> (tooltip) attribute, which serves as the accessible label. QPDF checks both the widget annotation and the <code>/AcroForm</code> fields array.
              </p>
            </div>
            <div class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3">
              <p class="font-medium text-[var(--text-secondary)] mb-1">Reading Order (5%)</p>
              <p class="text-xs text-[var(--text-muted)] mb-2">
                <em>What it means:</em> PDFs with multi-column layouts, sidebars, or callout boxes can confuse screen readers if the reading order isn't explicitly defined. A sighted user can see that a sidebar is separate from the main text, but a screen reader reads content in the order defined by the structure tree — if that order is wrong, the document becomes a jumble of unrelated sentences.
              </p>
              <p class="text-xs text-[var(--text-muted)]">
                <em>How it's scored:</em> <strong>100</strong> = structure tree has depth &gt;1 and fewer than 20% of Marked Content IDs (MCIDs) are out of sequence. <strong>50</strong> = more than 20% of MCIDs are out of order. <strong>30</strong> = structure tree is flat (depth ≤1, indicating minimal structure). <strong>0</strong> = no structure tree at all. MCIDs are numeric identifiers that link content on each page to its position in the tag tree; when they're out of order relative to the page content stream, it indicates a reading order problem.
              </p>
            </div>
          </div>
        </div>

        <!-- Weight renormalization -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">Weight Renormalization</h3>
          <p class="text-[var(--text-muted)]">
            When a category scores N/A (e.g., a text-only document has no images, tables, links, or forms), its weight is redistributed proportionally to the remaining categories. For example, if Alt Text (15%), Table Markup (10%), and Form Fields (5%) are all N/A, the remaining 70% of weights are renormalized to sum to 100%. This ensures documents are only scored on criteria that actually apply to them.
          </p>
        </div>

        <!-- Scanned detection -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">Scanned Document Detection</h3>
          <p class="text-[var(--text-muted)]">
            A PDF is flagged as a scanned image when <strong>both</strong> conditions are true: PDF.js extracts fewer than 50 characters of text content (indicating no real text layer) and QPDF finds no StructTreeRoot (indicating no semantic tags). This combination means the document is an unremediated scanned image that screen readers cannot access at all.
          </p>
        </div>

        <!-- Limitations -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">Limitations &amp; What This Tool Cannot Do</h3>
          <p class="text-[var(--text-muted)] mb-3">
            This tool provides a thorough <em>automated</em> assessment, but no automated tool can fully replace manual accessibility testing. Important limitations:
          </p>
          <ul class="space-y-2 text-xs text-[var(--text-muted)]">
            <li class="flex gap-2"><span class="text-[var(--text-secondary)] font-bold flex-shrink-0">1.</span><span><strong>Alt text quality:</strong> The tool can detect <em>whether</em> alt text exists, but not whether it's <em>meaningful</em>. An image tagged with alt text "image1.png" technically passes the automated check, but it's useless to a screen reader user. Human review is still needed to assess alt text quality.</span></li>
            <li class="flex gap-2"><span class="text-[var(--text-secondary)] font-bold flex-shrink-0">2.</span><span><strong>Color contrast:</strong> PDF color contrast analysis requires rendering each page as an image and analyzing pixel colors. This tool focuses on structural accessibility (tags, metadata, markup) and does not currently assess color contrast.</span></li>
            <li class="flex gap-2"><span class="text-[var(--text-secondary)] font-bold flex-shrink-0">3.</span><span><strong>Natural language clarity:</strong> The tool cannot evaluate whether the text itself is written clearly. WCAG 3.1.5 recommends content be written at a lower secondary education reading level — this requires human judgment.</span></li>
            <li class="flex gap-2"><span class="text-[var(--text-secondary)] font-bold flex-shrink-0">4.</span><span><strong>Decorative images:</strong> Not all images need alt text — decorative images should be marked as artifacts. The tool cannot distinguish informative images from decorative ones; it reports all images without alt text as a potential issue.</span></li>
            <li class="flex gap-2"><span class="text-[var(--text-secondary)] font-bold flex-shrink-0">5.</span><span><strong>Complex layouts:</strong> While reading order is assessed via MCID sequence analysis, extremely complex layouts (e.g., multi-column magazine spreads, nested pull quotes) may have subtle ordering issues that the 20% disorder threshold doesn't catch.</span></li>
          </ul>
          <p class="text-[var(--text-muted)] mt-3">
            For a complete accessibility evaluation, this tool's automated analysis should be supplemented with manual testing using an actual screen reader (e.g., NVDA, JAWS, or VoiceOver) and the <a href="https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html" target="_blank" rel="noopener noreferrer" class="text-[var(--link)] hover:text-[var(--link-hover)]">Adobe Acrobat Accessibility Checker</a>.
          </p>
        </div>

        <!-- Security / privacy -->
        <div>
          <h3 class="font-semibold text-[var(--text-heading)] mb-2">Privacy &amp; Security</h3>
          <p class="text-[var(--text-muted)]">
            Uploaded files are written to a temporary directory, analyzed, and immediately deleted — they are never stored on the server after analysis completes. The file is held in memory only for the duration of the analysis (typically under 10 seconds). A concurrency semaphore limits the server to two simultaneous analyses to prevent resource exhaustion. Encrypted (password-protected) PDFs are rejected with a clear error before analysis begins. The entire process runs server-side; no PDF data is transmitted to external APIs, cloud services, or AI models.
          </p>
        </div>

        <!-- Source code -->
        <div class="rounded-lg bg-[var(--surface-deep)] border border-[var(--border-subtle)] px-4 py-3">
          <p class="text-[var(--text-muted)]">
            <strong class="text-[var(--text-secondary)]">Verify for yourself:</strong> The complete source code for the analysis pipeline is open source.
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <a href="https://github.com/ICJIA/file-accessibility-audit/tree/main/apps/api/src/services" target="_blank" rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"/></svg>
              Analysis Services (scorer, QPDF, PDF.js)
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
            </a>
            <a href="https://github.com/ICJIA/file-accessibility-audit/blob/main/audit.config.ts" target="_blank" rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"/></svg>
              Configuration &amp; Weights (audit.config.ts)
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
            </a>
            <a href="https://github.com/ICJIA/file-accessibility-audit" target="_blank" rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"/></svg>
              Full Repository
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
            </a>
          </div>
        </div>

      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const resetSignal = inject<Ref<number>>('resetSignal')
const {
  exportMarkdown, exportJSON, exportDocx, exportHtml,
  shareReport, shareUrl, shareError, sharing, clearShare,
  exporting,
} = useReportExport()

const processing = ref(false)
const processingStage = ref('')
const result = ref<any>(null)
const analysisError = ref<any>(null)

const showDropHint = ref(false)
let dropHintTimer: ReturnType<typeof setTimeout> | null = null

watch(() => resetSignal?.value, () => {
  // If already in default/idle state, show a hint to use the drop zone
  if (!result.value && !processing.value && !analysisError.value) {
    showDropHint.value = true
    if (dropHintTimer) clearTimeout(dropHintTimer)
    dropHintTimer = setTimeout(() => { showDropHint.value = false }, 4000)
    return
  }
  clearResults()
})

async function analyzeFile(file: File) {
  processing.value = true
  analysisError.value = null
  result.value = null

  try {
    processingStage.value = 'Uploading…'
    const formData = new FormData()
    formData.append('file', file)

    processingStage.value = 'Extracting PDF structure…'

    const response = await $fetch('/api/analyze', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })

    processingStage.value = 'Building report…'
    await new Promise(r => setTimeout(r, 300)) // Brief pause for UX

    result.value = response
  } catch (err: any) {
    if (err.status === 401) {
      navigateTo('/login')
      return
    }
    analysisError.value = err.data || { error: 'Analysis failed. Please try again.' }
  } finally {
    processing.value = false
  }
}

function clearResults() {
  result.value = null
  analysisError.value = null
  clearShare()
}

const scoredCategories = computed(() =>
  result.value?.categories?.filter((c: any) => c.score !== null) || []
)
const naCategories = computed(() =>
  result.value?.categories?.filter((c: any) => c.score === null) || []
)

function formatMetaDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return iso }
}

const metadataItems = computed(() => {
  const m = result.value?.pdfMetadata
  if (!m) return []
  return [
    { label: 'Source Application', value: m.creator },
    { label: 'PDF Producer', value: m.producer },
    { label: 'PDF Version', value: m.pdfVersion },
    { label: 'Page Count', value: m.pageCount?.toString() },
    { label: 'Author', value: m.author },
    { label: 'Subject', value: m.subject },
    { label: 'Keywords', value: m.keywords },
    { label: 'Created', value: formatMetaDate(m.creationDate) },
    { label: 'Last Modified', value: formatMetaDate(m.modDate) },
    { label: 'Encrypted', value: m.isEncrypted ? 'Yes' : 'No' },
  ]
})

const gradeColors: Record<string, string> = {
  A: '#22c55e', B: '#14b8a6', C: '#eab308', D: '#f97316', F: '#ef4444',
}

function catColor(cat: any): string {
  if (cat.grade) return gradeColors[cat.grade] || '#666'
  return '#555'
}

function sevColor(severity: string): string {
  const map: Record<string, string> = {
    Pass: '#22c55e', Minor: '#3b82f6', Moderate: '#eab308', Critical: '#ef4444',
  }
  return map[severity] || '#999'
}

function findingIcon(cat: any): string {
  if (cat.score === null) return '–'
  if (cat.score >= 90) return '✓'
  if (cat.score >= 70) return '•'
  return '✗'
}

function findingIconStyle(cat: any): Record<string, string> {
  if (cat.score === null) return { color: 'var(--icon-na)' }
  if (cat.score >= 90) return { color: 'var(--icon-pass)' }
  if (cat.score >= 70) return { color: 'var(--icon-info)' }
  if (cat.score >= 40) return { color: 'var(--icon-na)' }
  return { color: 'var(--icon-fail)' }
}

const copied = ref(false)

async function handleShare() {
  if (!result.value) return
  await shareReport(result.value)
}

async function copyShareUrl() {
  if (!shareUrl.value) return
  try {
    await navigator.clipboard.writeText(shareUrl.value)
  } catch {
    // Fallback for non-secure contexts or denied permissions
    const textarea = document.createElement('textarea')
    textarea.value = shareUrl.value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function emailShareUrl() {
  if (!shareUrl.value || !result.value) return
  const subject = encodeURIComponent(`PDF Accessibility Report: ${result.value.filename}`)
  const body = encodeURIComponent(
    `Here is the accessibility report for "${result.value.filename}":\n\n` +
    `Score: ${result.value.overallScore}/100 (Grade ${result.value.grade})\n\n` +
    `View the full report:\n${shareUrl.value}\n\n` +
    `This link expires in 30 days.`
  )
  window.open(`mailto:?subject=${subject}&body=${body}`, '_self')
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
