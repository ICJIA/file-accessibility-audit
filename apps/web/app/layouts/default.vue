<template>
  <div>
    <header class="border-b border-[var(--border)] px-6 py-4">
      <div class="mx-auto max-w-4xl flex items-center justify-between">
        <h1 class="text-lg font-semibold tracking-tight cursor-pointer hover:text-[var(--text-secondary)] transition-colors" @click="goAnalyze">
          {{ config.public.appName }}
        </h1>
        <div class="flex items-center gap-4">
          <nav v-if="user" class="flex items-center gap-4">
            <a href="/" class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors cursor-pointer" @click.prevent="goAnalyze">
              Analyze
            </a>
            <UModal title="Scoring Rubric" description="How accessibility scores are calculated for PDFs">
              <button class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors cursor-pointer">
                Scoring
              </button>
              <template #content="{ close }">
                <div class="max-w-2xl mx-auto">
                  <div class="flex items-center justify-between px-6 pt-5 pb-3">
                    <div>
                      <h2 class="text-lg font-semibold text-[var(--text-heading)]">Scoring Rubric</h2>
                      <p class="text-sm text-[var(--text-muted)]">How accessibility scores are calculated for PDFs</p>
                    </div>
                    <button class="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--surface-icon)] transition-colors" @click="close">
                      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div class="px-6 pb-6 space-y-6 text-sm max-h-[70vh] overflow-y-auto">
                    <p class="text-[var(--text-muted)] leading-relaxed">
                      Each PDF is scored across nine accessibility categories based on
                      <a href="https://www.w3.org/WAI/WCAG21/quickref/" target="_blank" rel="noopener noreferrer" class="text-[var(--link)] hover:text-[var(--link-hover)]">WCAG 2.1</a>
                      and
                      <a href="https://www.ada.gov/resources/title-ii-rule/" target="_blank" rel="noopener noreferrer" class="text-[var(--link)] hover:text-[var(--link-hover)]">ADA Title II</a>
                      requirements. Categories that don't apply to a document (e.g., tables in a document with no tables) are excluded and the remaining weights are renormalized.
                    </p>

                    <div class="rounded-lg border border-[var(--border)] overflow-hidden">
                      <table class="w-full text-sm">
                        <thead>
                          <tr class="border-b border-[var(--border)] text-[var(--text-secondary)] text-xs uppercase tracking-wide">
                            <th class="text-left px-4 py-2 font-medium">Category</th>
                            <th class="text-center px-3 py-2 font-medium">Weight</th>
                            <th class="text-left px-4 py-2 font-medium">Why It Matters</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="cat in rubricCategories" :key="cat.id" class="border-b border-[var(--border-subtle)] last:border-0">
                            <td class="px-4 py-2.5 text-[var(--text-secondary)] font-medium whitespace-nowrap">{{ cat.label }}</td>
                            <td class="text-center px-3 py-2.5 font-mono text-[var(--text-muted)]">{{ cat.weight }}%</td>
                            <td class="px-4 py-2.5 text-[var(--text-muted)] leading-relaxed">{{ cat.rationale }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <h3 class="font-semibold text-[var(--text-secondary)] mb-3">Grade Scale</h3>
                      <div class="grid grid-cols-5 gap-2">
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
                      Scoring aligns with WCAG 2.1 Level AA success criteria and ADA Title II digital accessibility requirements effective April 2026. The highest-weighted categories reflect the most fundamental barriers to access — if a document has no extractable text, no other accessibility feature can compensate.
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
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-4xl px-6 py-8">
      <slot />
    </main>

    <footer class="border-t border-[var(--border)] px-6 py-4">
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
          <span class="text-xs text-[var(--text-muted)]">v{{ config.public.appVersion }}</span>
        </div>
      </div>
    </footer>

  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const user = inject<Ref<any>>('user')
const goAnalyze = inject<() => void>('goAnalyze')
const logout = inject<() => void>('logout')

const colorMode = useColorMode()

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const rubricCategories = [
  { id: 'text_extractability', label: 'Text Extractability', weight: 20, rationale: 'WCAG 1.3.1 — The most fundamental requirement. If a PDF is a scanned image with no real text, screen readers have nothing to read. No other fix matters until this is resolved.' },
  { id: 'title_language', label: 'Title & Language', weight: 15, rationale: 'WCAG 2.4.2 & 3.1.1 — The document title is the first thing a screen reader announces. The language tag controls pronunciation. Both are required under Title II.' },
  { id: 'heading_structure', label: 'Heading Structure', weight: 15, rationale: 'WCAG 1.3.1 & 2.4.6 — Headings (H1–H6) are the primary way screen reader users navigate and skim documents, equivalent to how sighted users scan bold section titles.' },
  { id: 'alt_text', label: 'Alt Text on Images', weight: 15, rationale: 'WCAG 1.1.1 — Every informative image must have a text alternative. Without it, blind users get no indication of what the image shows.' },
  { id: 'bookmarks', label: 'Bookmarks', weight: 10, rationale: 'WCAG 2.4.5 — For documents over 10 pages, bookmarks provide a navigable table of contents. Required under Title II for longer documents.' },
  { id: 'table_markup', label: 'Table Markup', weight: 10, rationale: 'WCAG 1.3.1 — Without header cells (TH), screen readers read table data in a flat stream with no way to identify which column or row a value belongs to.' },
  { id: 'link_quality', label: 'Link Quality', weight: 5, rationale: 'WCAG 2.4.4 — Raw URLs are meaningless when read aloud. Descriptive link text tells users where a link goes without needing to see the URL.' },
  { id: 'form_accessibility', label: 'Form Fields', weight: 5, rationale: 'WCAG 1.3.1 & 4.1.2 — Unlabeled form fields are unusable with assistive technology. Users hear "text field" with no indication of what to enter.' },
  { id: 'reading_order', label: 'Reading Order', weight: 5, rationale: 'WCAG 1.3.2 — The tag structure must define a logical reading sequence. Without it, screen readers may announce sidebar content before the main body.' },
]

const grades = [
  { grade: 'A', min: 90, max: 100, color: '#22c55e' },
  { grade: 'B', min: 80, max: 89, color: '#14b8a6' },
  { grade: 'C', min: 70, max: 79, color: '#eab308' },
  { grade: 'D', min: 60, max: 69, color: '#f97316' },
  { grade: 'F', min: 0, max: 59, color: '#ef4444' },
]

const referenceLinks = [
  { label: 'WCAG 2.1 Quick Reference', url: 'https://www.w3.org/WAI/WCAG21/quickref/' },
  { label: 'ADA Title II Final Rule (2024)', url: 'https://www.ada.gov/resources/title-ii-rule/' },
  { label: 'Section 508 Standards', url: 'https://www.section508.gov/manage/laws-and-policies/' },
  { label: 'PDF/UA (ISO 14289-1)', url: 'https://pdfa.org/resource/pdfua-in-a-nutshell/' },
  { label: 'Adobe: Creating Accessible PDFs', url: 'https://helpx.adobe.com/acrobat/using/creating-accessible-pdfs.html' },
  { label: 'WebAIM: PDF Accessibility', url: 'https://webaim.org/techniques/acrobat/' },
]

const severities = [
  { label: 'Pass', color: '#22c55e', description: 'Category score 90–100. Meets accessibility standards.' },
  { label: 'Minor', color: '#3b82f6', description: 'Category score 70–89. Small improvements recommended.' },
  { label: 'Moderate', color: '#eab308', description: 'Category score 40–69. Should be addressed before publishing.' },
  { label: 'Critical', color: '#ef4444', description: 'Category score 0–39. Must be fixed — represents a significant barrier to access.' },
]
</script>
