<template>
  <div>
    <header class="border-b border-[var(--border)] px-3 sm:px-6 py-4">
      <div class="mx-auto max-w-4xl flex items-center justify-between">
        <h1 class="text-base sm:text-lg font-semibold tracking-tight cursor-pointer hover:text-[var(--text-secondary)] transition-colors" @click="goAnalyze">
          {{ config.public.appName }}
        </h1>
        <div class="flex items-center gap-2 sm:gap-4">
          <!-- Mobile hamburger -->
          <button
            v-if="user"
            class="md:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            aria-label="Toggle menu"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <svg v-if="!mobileMenuOpen" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
            <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <!-- Desktop nav -->
          <nav v-if="user" class="hidden md:flex items-center gap-4">
            <a href="/" class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors cursor-pointer" @click.prevent="goAnalyze">
              Analyze
            </a>
            <UModal title="Scoring Rubric" description="How accessibility scores are calculated for PDF, Word, PowerPoint, and Excel documents">
              <button class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors cursor-pointer">
                Scoring
              </button>
              <template #content="{ close }">
                <div class="max-w-2xl mx-auto">
                  <div class="flex items-center justify-between px-3 sm:px-6 pt-5 pb-3">
                    <div>
                      <h2 class="text-lg font-semibold text-[var(--text-heading)]">Scoring Rubric</h2>
                      <p class="text-sm text-[var(--text-muted)]">How accessibility scores are calculated for PDF, Word, PowerPoint, and Excel documents</p>
                    </div>
                    <button class="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--surface-icon)] transition-colors" @click="close">
                      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div class="px-3 sm:px-6 pb-6 space-y-6 text-sm max-h-[70vh] overflow-y-auto">
                    <p class="text-[var(--text-muted)] leading-relaxed">
                      Each PDF, Word, PowerPoint, or Excel document is scored across accessibility categories based on
                      <a href="https://www.w3.org/WAI/WCAG22/quickref/" target="_blank" rel="noopener noreferrer" class="text-[var(--link)] hover:text-[var(--link-hover)]">WCAG 2.2</a>
                      and
                      <a href="https://www.ada.gov/resources/title-ii-rule/" target="_blank" rel="noopener noreferrer" class="text-[var(--link)] hover:text-[var(--link-hover)]">ADA Title II</a>
                      and <a href="https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html" target="_blank" rel="noopener noreferrer" class="text-[var(--link)] hover:text-[var(--link-hover)]">IITAA 2.1</a>
                      requirements. Categories that don't apply to a document (e.g., tables in a document with no tables) are excluded and the remaining weights are renormalized.
                    </p>

                    <div class="rounded-lg border border-[var(--border)] overflow-x-auto">
                      <table class="w-full text-sm min-w-[480px]">
                        <thead>
                          <tr class="border-b border-[var(--border)] text-[var(--text-secondary)] text-xs uppercase tracking-wide">
                            <th class="text-left px-3 sm:px-4 py-2 font-medium">Category</th>
                            <th class="text-center px-2 sm:px-3 py-2 font-medium">Weight</th>
                            <th class="text-left px-3 sm:px-4 py-2 font-medium">Why It Matters</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="cat in rubricCategories" :key="cat.id" class="border-b border-[var(--border-subtle)] last:border-0">
                            <td class="px-3 sm:px-4 py-2.5 text-[var(--text-secondary)] font-medium whitespace-nowrap">{{ cat.label }}</td>
                            <td class="text-center px-2 sm:px-3 py-2.5 font-mono text-[var(--text-muted)]">{{ cat.weight }}%</td>
                            <td class="px-3 sm:px-4 py-2.5 text-[var(--text-muted)] leading-relaxed">{{ cat.rationale }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <p class="text-[var(--text-muted)] text-xs leading-relaxed">
                      The weights above are the <strong class="text-[var(--text-secondary)]">PDF</strong> rubric.
                      <strong class="text-[var(--text-secondary)]">Word (.docx)</strong> documents use the same
                      categories with three differences: color contrast <em>is</em> checked (Word stores real
                      text colors, unlike PDF), a <strong>List Structure</strong> category (real lists vs. typed
                      bullets) applies in place of PDF-only Bookmarks, and Reading Order and Form Accessibility
                      show as <strong>N/A</strong> (Word manages reading order in its linear document flow).
                      <strong class="text-[var(--text-secondary)]">PowerPoint (.pptx)</strong> replaces heading
                      structure with a <strong>Slide Titles</strong> category (every slide needs a unique title
                      placeholder) and actively checks <strong>Reading Order</strong> (the slide title should be
                      the first shape a screen reader encounters); bookmarks and forms don't apply.
                      <strong class="text-[var(--text-secondary)]">Excel (.xlsx)</strong> replaces heading
                      structure with a <strong>Sheet Names</strong> category (no default "Sheet1" tabs), weights
                      <strong>Table Markup</strong> heaviest (real table objects with header rows; merged cells
                      are advisories), scores Title &amp; Language on the title alone (Excel stores no document
                      language), and omits reading order, lists, bookmarks, and forms.
                      Weights are renormalized across whichever categories apply to the document.
                    </p>

                    <div>
                      <h3 class="font-semibold text-[var(--text-secondary)] mb-3">Grade Scale</h3>
                      <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        <div v-for="g in grades" :key="g.grade" class="text-center rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] py-2.5">
                          <span class="text-lg font-black block" :style="{ color: g.color }">{{ g.grade }}</span>
                          <span class="text-xs text-[var(--text-muted)]">{{ g.min }}–{{ g.max }}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 class="font-semibold text-[var(--text-secondary)] mb-3">Severity Levels</h3>
                      <div class="space-y-2">
                        <div v-for="s in severities" :key="s.label" class="flex items-center gap-3">
                          <span class="text-xs px-2 py-0.5 rounded-full w-20 text-center" :style="{ backgroundColor: s.color + '15', color: s.color }">{{ s.label }}</span>
                          <span class="text-[var(--text-muted)]">{{ s.description }}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 class="font-semibold text-[var(--text-secondary)] mb-3">Reference Documents</h3>
                      <div class="flex flex-wrap gap-2">
                        <a v-for="link in referenceLinks" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer"
                          class="inline-flex items-center gap-1 text-xs text-[var(--link)] hover:text-[var(--link-hover)] bg-blue-500/10 hover:bg-blue-500/15 rounded-md px-2.5 py-1.5 transition-colors"
                        >
                          {{ link.label }}
                          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      </div>
                    </div>

                    <p class="text-[var(--text-muted)] text-xs leading-relaxed">
                      Scoring aligns with WCAG 2.2 Level AA success criteria — a superset of the WCAG 2.1 AA required by ADA Title II and the Illinois IITAA 2.1 standard (the legal minimum; WCAG 2.2 is stricter and optional/forward-looking). The highest-weighted categories reflect the most fundamental barriers to access — if a document has no extractable text, no other accessibility feature can compensate.
                    </p>
                  </div>
                </div>
              </template>
            </UModal>
            <a v-if="config.public.faqsUrl" :href="config.public.faqsUrl" target="_blank" rel="noopener noreferrer" class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors">
              FAQs
            </a>
            <template v-if="user.email !== 'anonymous'">
              <NuxtLink to="/my-history" class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors">
                My History
              </NuxtLink>
              <NuxtLink v-if="user.isAdmin" to="/history" class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors">
                Admin Logs
              </NuxtLink>
              <span class="text-xs text-[var(--text-muted)]">{{ user.email }}</span>
              <UButton size="xs" variant="ghost" color="neutral" @click="logout">
                Logout
              </UButton>
            </template>
          </nav>
          <!-- Color mode toggle -->
          <button
            class="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            :aria-label="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleColorMode"
          >
            <svg v-if="colorMode.value === 'dark'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
            </svg>
          </button>
          <!-- Server status indicator (green = online, red = down) -->
          <ServerStatusIndicator />
        </div>
      </div>
      <!-- Mobile nav dropdown -->
      <Transition name="slide-down">
        <nav v-if="user && mobileMenuOpen" class="md:hidden mx-auto max-w-4xl border-t border-[var(--border-subtle)] pt-3 pb-1 px-3 flex flex-col gap-2">
          <a href="/" class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors cursor-pointer px-2 py-1.5 rounded-lg hover:bg-[var(--surface-hover)]" @click.prevent="goAnalyze(); mobileMenuOpen = false">
            Analyze
          </a>
          <a v-if="config.public.faqsUrl" :href="config.public.faqsUrl" target="_blank" rel="noopener noreferrer" class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors px-2 py-1.5 rounded-lg hover:bg-[var(--surface-hover)]">
            FAQs
          </a>
          <template v-if="user.email !== 'anonymous'">
            <NuxtLink to="/my-history" class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors px-2 py-1.5 rounded-lg hover:bg-[var(--surface-hover)]" @click="mobileMenuOpen = false">
              My History
            </NuxtLink>
            <NuxtLink v-if="user.isAdmin" to="/history" class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors px-2 py-1.5 rounded-lg hover:bg-[var(--surface-hover)]" @click="mobileMenuOpen = false">
              Admin Logs
            </NuxtLink>
            <div class="flex items-center justify-between px-2 py-1.5">
              <span class="text-xs text-[var(--text-muted)]">{{ user.email }}</span>
              <UButton size="xs" variant="ghost" color="neutral" @click="logout(); mobileMenuOpen = false">
                Logout
              </UButton>
            </div>
          </template>
        </nav>
      </Transition>
    </header>

    <main class="mx-auto max-w-4xl px-3 sm:px-6 py-4 sm:py-8">
      <slot />
    </main>

    <footer class="border-t border-[var(--border)] px-3 sm:px-6 py-4">
      <div class="mx-auto max-w-4xl">

        <div class="flex items-center justify-center gap-4">
          <a
            v-if="config.public.githubUrl"
            :href="config.public.githubUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"/></svg>
            GitHub
          </a>
          <span v-if="config.public.githubUrl" class="text-[var(--border)]">|</span>
          <a
            v-if="config.public.githubUrl"
            :href="`${config.public.githubUrl}/blob/main/CHANGELOG.md`"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
            Changelog
          </a>
          <span v-if="config.public.githubUrl" class="text-[var(--border)]">|</span>
          <a
            href="/data-retention"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <svg
              class="w-3.5 h-3.5"
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
            Data Retention Policy
            <!-- external-link icon to signal this opens in a new tab -->
            <svg
              class="w-3 h-3 opacity-60"
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
          <span class="text-[var(--border)]">|</span>
          <a
            href="/technical-details"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <svg
              class="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
            Technical Details
            <svg
              class="w-3 h-3 opacity-60"
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
          <span class="text-[var(--border)]">|</span>
          <span class="text-xs text-[var(--text-muted)]">v{{ config.public.appVersion }}</span>
        </div>
      </div>
    </footer>

  </div>
</template>

<script setup lang="ts">
import {
  SCORING_PROFILES,
  GRADE_THRESHOLDS,
  SEVERITY_COLORS,
} from '@file-audit/shared'

const config = useRuntimeConfig()
const user = inject<Ref<any>>('user')
const goAnalyze = inject<() => void>('goAnalyze')
const logout = inject<() => void>('logout')

const colorMode = useColorMode()
const mobileMenuOpen = ref(false)

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

// Weights come straight from the engine's strict profile so this modal can
// never drift from how documents are actually scored (it did once:
// bookmarks/reading_order were swapped for several releases). Labels and
// rationale prose are UI copy and stay here.
const strictWeights = SCORING_PROFILES.strict.weights
const rubricCategories = [
  { id: 'text_extractability', label: 'Text Extractability', rationale: 'WCAG 2.1/2.2 SC 1.3.1 — The most fundamental requirement. If a PDF is a scanned image with no real text, screen readers have nothing to read. No other fix matters until this is resolved.' },
  { id: 'title_language', label: 'Title & Language', rationale: 'WCAG 2.1/2.2 SC 2.4.2 & 3.1.1 — The document title is the first thing a screen reader announces. The language tag controls pronunciation. Both are required under Title II.' },
  { id: 'heading_structure', label: 'Heading Structure', rationale: 'WCAG 2.1/2.2 SC 1.3.1 & 2.4.6 — Headings (H1–H6) are the primary way screen reader users navigate and skim documents, equivalent to how sighted users scan bold section titles.' },
  { id: 'alt_text', label: 'Alt Text on Images', rationale: 'WCAG 2.1/2.2 SC 1.1.1 — Every informative image must have a text alternative. Without it, blind users get no indication of what the image shows.' },
  { id: 'reading_order', label: 'Reading Order', rationale: 'WCAG 2.1/2.2 SC 1.3.2 — The tag structure must define a logical reading sequence. Without it, screen readers may announce sidebar content before the main body.' },
  { id: 'table_markup', label: 'Table Markup', rationale: 'WCAG 2.1/2.2 SC 1.3.1 — Without header cells (TH), screen readers read table data in a flat stream with no way to identify which column or row a value belongs to.' },
  { id: 'link_quality', label: 'Link Quality', rationale: 'WCAG 2.1/2.2 SC 2.4.4 — Raw URLs are meaningless when read aloud. Descriptive link text tells users where a link goes without needing to see the URL.' },
  { id: 'form_accessibility', label: 'Form Fields', rationale: 'WCAG 2.1/2.2 SC 1.3.1 & 4.1.2 — Unlabeled form fields are unusable with assistive technology. Users hear "text field" with no indication of what to enter.' },
  { id: 'bookmarks', label: 'Bookmarks', rationale: 'WCAG 2.1/2.2 SC 2.4.5 — For documents over 10 pages, bookmarks provide a navigable table of contents. Required under Title II for longer documents.' },
]
  .map((c) => ({
    ...c,
    weight: Math.round(
      (strictWeights[c.id as keyof typeof strictWeights] ?? 0) * 100,
    ),
  }))
  .filter((c) => c.weight > 0)
  .sort((a, b) => b.weight - a.weight)

const grades = GRADE_THRESHOLDS.map((t, i) => ({
  grade: t.grade,
  min: t.min,
  max: i === 0 ? 100 : GRADE_THRESHOLDS[i - 1]!.min - 1,
  color: t.color,
}))

const referenceLinks = [
  { label: 'WCAG 2.2 Quick Reference', url: 'https://www.w3.org/WAI/WCAG22/quickref/' },
  { label: "What's New in WCAG 2.2 (W3C)", url: 'https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/' },
  { label: 'ADA Title II Final Rule (2024)', url: 'https://www.ada.gov/resources/title-ii-rule/' },
  { label: 'Illinois IITAA 2.1 Standards', url: 'https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html' },
  { label: 'Section 508 Standards', url: 'https://www.section508.gov/manage/laws-and-policies/' },
  { label: 'PDF/UA (ISO 14289-1)', url: 'https://pdfa.org/resource/pdfua-in-a-nutshell/' },
  { label: 'Adobe: Creating Accessible PDFs', url: 'https://helpx.adobe.com/acrobat/using/creating-accessible-pdfs.html' },
  { label: 'WebAIM: PDF Accessibility', url: 'https://webaim.org/techniques/acrobat/' },
]

const severities = [
  { label: 'Pass', color: SEVERITY_COLORS.Pass!, description: 'Category score 90–100. Meets accessibility standards.' },
  { label: 'Minor', color: SEVERITY_COLORS.Minor!, description: 'Category score 70–89. Small improvements recommended.' },
  { label: 'Moderate', color: SEVERITY_COLORS.Moderate!, description: 'Category score 40–69. Should be addressed before publishing.' },
  { label: 'Critical', color: SEVERITY_COLORS.Critical!, description: 'Category score 0–39. Must be fixed — represents a significant barrier to access.' },
]
</script>
