<template>
  <div>
    <header class="border-b border-[var(--border)] px-3 sm:px-6 py-4">
      <!-- Wider than <main> on purpose (max-w-6xl vs 4xl): the nav rows carry
           seven items and were forcing labels to wrap in half at laptop
           widths ("What's / New"). Chrome may run wide; prose may not. -->
      <div class="mx-auto max-w-6xl flex flex-wrap items-center justify-between gap-y-2">
        <!-- The title is the way to start a new audit — the redundant
             "Analyze" nav links were removed in v1.41.0.
             It is an <a href="/">, not a bare @click on the <h1>, because it
             is now the ONLY route back: a click handler on a heading is not
             focusable, not keyboard-operable, and invisible to assistive
             technology. On an accessibility auditing tool that would be an
             especially poor thing to ship. As a link it gets keyboard focus,
             Enter activation, middle-click/open-in-new-tab and no-JS
             behaviour for free; @click.prevent adds the state reset. -->
        <h1 class="text-base sm:text-lg font-semibold tracking-tight">
          <a
            href="/"
            class="cursor-pointer hover:text-[var(--text-secondary)] transition-colors"
            @click.prevent="goAnalyze"
          >
            {{ config.public.appName }}
          </a>
        </h1>
        <div class="flex items-center gap-2 sm:gap-4">
          <!-- Always-visible site links. There is no auth state to gate on —
               the tool has no accounts or sign-in (v1.68.0) — so every
               header link renders for every visitor, always.

               Two of the links use DIFFERENT elements on purpose:
                 /announcements is a Vue page  -> NuxtLink (SPA navigation)
                 /status is a Nitro SERVER route -> plain <a>

               A NuxtLink to /status would navigate client-side, find no
               matching Vue route, and render the SPA "Page not found:
               /status" without ever contacting the server. That exact bug
               shipped in v1.39.0 and was fixed in v1.39.1 — do not
               "tidy" this into a NuxtLink. -->
          <nav aria-label="Site information" class="flex items-center gap-3 sm:gap-4">
            <!-- FIRST on purpose (user request, 2026-08-28): the skeptic's
                 question leads the nav. /trust is a real Vue route since
                 v1.119.0, so NuxtLink is correct. Pinned by trustPage.test.ts. -->
            <NuxtLink
              to="/trust"
              class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors whitespace-nowrap"
            >
              Can I trust this?
            </NuxtLink>
            <a
              v-if="config.public.faqsUrl"
              :href="config.public.faqsUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors whitespace-nowrap"
            >
              FAQs
              <!-- external-link icon to signal this opens in a new tab
                   (same glyph the footer uses for its external links) -->
              <svg
                class="w-3 h-3 opacity-60"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
              <span class="sr-only">(opens in a new tab)</span>
            </a>
            <NuxtLink
              to="/announcements"
              class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors whitespace-nowrap"
            >
              What's New
            </NuxtLink>
            <!-- Plain <a>, NOT NuxtLink — see the note above.
                 Same tab, deliberately: this opened in a new one originally,
                 to protect an in-progress audit, but that left a stray tab
                 behind on every visit. The status page now carries its own
                 link back to the app, so the round trip is a normal one. -->
            <a
              href="/status?html"
              class="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors whitespace-nowrap"
            >
              Status
            </a>
          </nav>
          <!-- Color mode toggle -->
          <button
            class="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            :aria-label="
              colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
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
          <!-- Server status indicator (green = online, red = down) -->
          <ServerStatusIndicator />
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-4xl px-3 sm:px-6 py-4 sm:py-8">
      <slot />
    </main>

    <footer class="border-t border-[var(--border)] px-3 sm:px-6 py-4">
      <!-- max-w-6xl + flex-wrap + nowrap labels: rows wrap as WHOLE items,
           never mid-label (see the header note; pinned by trustPage.test.ts). -->
      <div class="mx-auto max-w-6xl">
        <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <a
            v-if="config.public.githubUrl"
            :href="config.public.githubUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors whitespace-nowrap"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"
              />
            </svg>
            GitHub
          </a>
          <span v-if="config.public.githubUrl" class="text-[var(--border)]">|</span>
          <a
            v-if="config.public.githubUrl"
            :href="`${config.public.githubUrl}/blob/main/CHANGELOG.md`"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors whitespace-nowrap"
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
                d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
              />
            </svg>
            Changelog
          </a>
          <span v-if="config.public.githubUrl" class="text-[var(--border)]">|</span>
          <UModal
            title="Scoring Rubric"
            description="How accessibility scores are calculated for PDF, Word, PowerPoint, and Excel documents"
          >
            <button
              class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
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
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
                />
              </svg>
              Scoring
            </button>
            <template #content="{ close }">
              <div class="max-w-2xl mx-auto">
                <div class="flex items-center justify-between px-3 sm:px-6 pt-5 pb-3">
                  <div>
                    <h2 class="text-lg font-semibold text-[var(--text-heading)]">Scoring Rubric</h2>
                    <p class="text-sm text-[var(--text-muted)]">
                      How accessibility scores are calculated for PDF, Word, PowerPoint, and Excel
                      documents
                    </p>
                  </div>
                  <button
                    class="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--surface-icon)] transition-colors"
                    @click="close"
                  >
                    <svg
                      class="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <div class="px-3 sm:px-6 pb-6 space-y-6 text-sm max-h-[70vh] overflow-y-auto">
                  <p class="text-[var(--text-muted)] leading-relaxed">
                    Each PDF, Word, PowerPoint, or Excel document is scored across accessibility
                    categories — and the score counts only WCAG 2.1 Level A/AA criteria, the
                    standard named by
                    <a
                      href="https://www.ada.gov/resources/title-ii-rule/"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-[var(--link)] hover:text-[var(--link-hover)]"
                      >ADA Title II</a
                    >
                    and the Illinois
                    <a
                      href="https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-[var(--link)] hover:text-[var(--link-hover)]"
                      >IITAA 2.1</a
                    >. The audit also checks
                    <a
                      href="https://www.w3.org/WAI/WCAG22/quickref/"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-[var(--link)] hover:text-[var(--link-hover)]"
                      >WCAG 2.2</a
                    >'s added criteria are flagged for manual review on documents with interactive
                    forms — marked as beyond the standard being measured — and are never counted. A
                    category that doesn't apply to a document (e.g., tables in a document with no
                    tables) counts as passing and keeps its weight — a document is never penalized
                    for content it doesn't have. Only a category the tool could not assess (color
                    contrast on PDFs) sits outside the weighted score.
                  </p>

                  <div class="rounded-lg border border-[var(--border)] overflow-x-auto">
                    <table class="w-full text-sm min-w-[480px]">
                      <thead>
                        <tr
                          class="border-b border-[var(--border)] text-[var(--text-secondary)] text-xs uppercase tracking-wide"
                        >
                          <th class="text-left px-3 sm:px-4 py-2 font-medium">Category</th>
                          <th class="text-center px-2 sm:px-3 py-2 font-medium">Weight</th>
                          <th class="text-left px-3 sm:px-4 py-2 font-medium">Why It Matters</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="cat in rubricCategories"
                          :key="cat.id"
                          class="border-b border-[var(--border-subtle)] last:border-0"
                        >
                          <td
                            class="px-3 sm:px-4 py-2.5 text-[var(--text-secondary)] font-medium whitespace-nowrap"
                          >
                            {{ cat.label }}
                          </td>
                          <td
                            class="text-center px-2 sm:px-3 py-2.5 font-mono text-[var(--text-muted)]"
                          >
                            {{ cat.weight }}%
                          </td>
                          <td class="px-3 sm:px-4 py-2.5 text-[var(--text-muted)] leading-relaxed">
                            {{ cat.rationale }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p class="text-[var(--text-muted)] text-xs leading-relaxed">
                    The weights above are the
                    <strong class="text-[var(--text-secondary)]">PDF</strong> rubric.
                    <strong class="text-[var(--text-secondary)]">Word (.docx)</strong> documents use
                    the same categories with three differences: color contrast <em>is</em> checked
                    (Word stores real text colors, unlike PDF), a
                    <strong>List Structure</strong> category (real lists vs. typed bullets) applies
                    in place of PDF-only Bookmarks, and Reading Order and Form Accessibility show as
                    <strong>N/A</strong> (Word manages reading order in its linear document flow).
                    <strong class="text-[var(--text-secondary)]">PowerPoint (.pptx)</strong>
                    replaces heading structure with a <strong>Slide Titles</strong> category (every
                    slide needs a unique title placeholder) and actively checks
                    <strong>Reading Order</strong> (the slide title should be the first shape a
                    screen reader encounters); bookmarks and forms don't apply.
                    <strong class="text-[var(--text-secondary)]">Excel (.xlsx)</strong> replaces
                    heading structure with a <strong>Sheet Names</strong> category (no default
                    "Sheet1" tabs), weights <strong>Table Markup</strong> heaviest (real table
                    objects with header rows; merged cells are advisories), scores Title &amp;
                    Language on the title alone (Excel stores no document language), and omits
                    reading order, lists, bookmarks, and forms. Each format's rubric is its own
                    weight table; within it, a category that doesn't apply to a given document
                    counts as passing rather than being dropped from the base.
                  </p>

                  <div>
                    <h3 class="font-semibold text-[var(--text-secondary)] mb-3">Grade Scale</h3>
                    <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      <div
                        v-for="g in grades"
                        :key="g.grade"
                        class="text-center rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] py-2.5"
                      >
                        <span class="text-lg font-black block" :style="{ color: g.color }">{{
                          g.grade
                        }}</span>
                        <span class="text-xs text-[var(--text-muted)]"
                          >{{ g.min }}–{{ g.max }}</span
                        >
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 class="font-semibold text-[var(--text-secondary)] mb-3">Severity Levels</h3>
                    <div class="space-y-2">
                      <div v-for="s in severities" :key="s.label" class="flex items-center gap-3">
                        <span
                          class="text-xs px-2 py-0.5 rounded-full w-20 text-center"
                          :style="{ backgroundColor: withAlpha(s.color, 8), color: s.color }"
                          >{{ s.label }}</span
                        >
                        <span class="text-[var(--text-muted)]">{{ s.description }}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 class="font-semibold text-[var(--text-secondary)] mb-3">
                      Reference Documents
                    </h3>
                    <div class="flex flex-wrap gap-2">
                      <a
                        v-for="link in referenceLinks"
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

                  <p class="text-[var(--text-muted)] text-xs leading-relaxed">
                    Scoring aligns with WCAG 2.1 Level AA success criteria — the standard ADA Title
                    II and the Illinois IITAA 2.1 both require. WCAG 2.2 adds criteria on top of
                    2.1; none of them is counted here. The highest-weighted categories reflect the
                    most fundamental barriers to access — if a document has no extractable text, no
                    other accessibility feature can compensate.
                  </p>
                </div>
              </div>
            </template>
          </UModal>
          <span class="text-[var(--border)]">|</span>
          <!-- Plain-language counterpart to the technical Changelog above.
               This is the ONLY route to past announcements once the home-page
               banner is dismissed — dismissal is permanent per id, and the
               banner shows just the newest entry — so it must live somewhere
               that renders on every page regardless of banner state. -->
          <a
            href="/announcements"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors whitespace-nowrap"
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
                d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253 1.171.613 2.3 1.068 3.374 1.101 2.597 2.512 2.026 3.135-.71a48.5 48.5 0 0 0 .924-6.354m-5.127 3.69c1.68.145 3.313.435 4.885.855m0-9.31a48.5 48.5 0 0 1-4.885.856m4.885-.856c.377 1.984.643 4.006.79 6.062m0 0a3 3 0 0 1-.53 5.94"
              />
            </svg>
            What's New
          </a>
          <span class="text-[var(--border)]">|</span>
          <!-- /trust is a Vue route (v1.119.0); a plain <a> still routes fine
               and matches its footer neighbors. -->
          <a
            href="/trust"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors whitespace-nowrap"
          >
            <svg
              class="w-3.5 h-3.5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
              />
            </svg>
            Can I trust this?
          </a>
          <span class="text-[var(--border)]">|</span>
          <a
            href="/data-retention"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors whitespace-nowrap"
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
            class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors whitespace-nowrap"
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
import { SCORING_PROFILES, GRADE_THRESHOLDS, SEVERITY_COLORS, withAlpha } from "@file-audit/shared";

const config = useRuntimeConfig();
const goAnalyze = inject<() => void>("goAnalyze");

const colorMode = useColorMode();

function toggleColorMode() {
  colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
}

// Weights come straight from the engine's strict profile so this modal can
// never drift from how documents are actually scored (it did once:
// bookmarks/reading_order were swapped for several releases). Labels and
// rationale prose are UI copy and stay here.
const strictWeights = SCORING_PROFILES.strict.weights;
const rubricCategories = [
  {
    id: "text_extractability",
    label: "Text Extractability",
    rationale:
      "WCAG 2.1 SC 1.3.1 — The most fundamental requirement. If a PDF is a scanned image with no real text, screen readers have nothing to read. No other fix matters until this is resolved.",
  },
  {
    id: "title_language",
    label: "Title & Language",
    rationale:
      "WCAG 2.1 SC 2.4.2 & 3.1.1 — The document title is the first thing a screen reader announces. The language tag controls pronunciation. Both are required under Title II.",
  },
  {
    id: "heading_structure",
    label: "Heading Structure",
    rationale:
      "WCAG 2.1 SC 1.3.1 & 2.4.6 — Headings (H1–H6) are the primary way screen reader users navigate and skim documents, equivalent to how sighted users scan bold section titles.",
  },
  {
    id: "alt_text",
    label: "Alt Text on Images",
    rationale:
      "WCAG 2.1 SC 1.1.1 — Every informative image must have a text alternative. Without it, blind users get no indication of what the image shows.",
  },
  {
    id: "reading_order",
    label: "Reading Order",
    rationale:
      "WCAG 2.1 SC 1.3.2 — Only a document with no structure tree at all scores here: no programmatic reading sequence exists. Measured divergence between tag order and draw order is reported for manual review, never deducted — remediated documents re-order tags on purpose.",
  },
  {
    id: "table_markup",
    label: "Table Markup",
    rationale:
      "WCAG 2.1 SC 1.3.1 — Without header cells (TH), screen readers read table data in a flat stream with no way to identify which column or row a value belongs to.",
  },
  {
    id: "link_quality",
    label: "Link Quality",
    rationale:
      'WCAG 2.1 SC 1.3.1 & 2.4.4 — What scores here is a link no tag claims: assistive technology following the structure never reaches it. Link wording (raw URLs, "click here") is reported as an advisory only — 2.4.4 allows a link\'s purpose to come from its surrounding context.',
  },
  {
    id: "form_accessibility",
    label: "Form Fields",
    rationale:
      'WCAG 2.1/2.2 SC 1.3.1 & 4.1.2 — Unlabeled form fields are unusable with assistive technology. Users hear "text field" with no indication of what to enter.',
  },
  {
    id: "bookmarks",
    label: "Bookmarks",
    rationale:
      "Not a WCAG 2.1 requirement — no criterion requires bookmarks inside a single document, so this category can never subtract points. Missing bookmarks on a 10+ page document are reported as a clearly labelled advisory; the category's weight only ever counts in a document's favour.",
  },
]
  .map((c) => ({
    ...c,
    weight: Math.round((strictWeights[c.id as keyof typeof strictWeights] ?? 0) * 100),
  }))
  .filter((c) => c.weight > 0)
  .sort((a, b) => b.weight - a.weight);

const grades = GRADE_THRESHOLDS.map((t, i) => ({
  grade: t.grade,
  min: t.min,
  max: i === 0 ? 100 : GRADE_THRESHOLDS[i - 1]!.min - 1,
  color: t.color,
}));

const referenceLinks = [
  { label: "WCAG 2.1 Quick Reference", url: "https://www.w3.org/WAI/WCAG21/quickref/" },
  {
    label: "What's New in WCAG 2.2 (W3C)",
    url: "https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/",
  },
  { label: "ADA Title II Final Rule (2024)", url: "https://www.ada.gov/resources/title-ii-rule/" },
  {
    label: "Illinois IITAA 2.1 Standards",
    url: "https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html",
  },
  { label: "Section 508 Standards", url: "https://www.section508.gov/manage/laws-and-policies/" },
  { label: "PDF/UA (ISO 14289-1)", url: "https://pdfa.org/resource/pdfua-in-a-nutshell/" },
  {
    label: "Adobe: Creating Accessible PDFs",
    url: "https://helpx.adobe.com/acrobat/using/creating-accessible-pdfs.html",
  },
  { label: "WebAIM: PDF Accessibility", url: "https://webaim.org/techniques/acrobat/" },
];

const severities = [
  {
    label: "Pass",
    color: SEVERITY_COLORS.Pass!,
    description: "Category score of 100 — no machine-detectable issues found.",
  },
  {
    label: "Minor",
    color: SEVERITY_COLORS.Minor!,
    description: "Category score 70–99. Small improvements recommended.",
  },
  {
    label: "Moderate",
    color: SEVERITY_COLORS.Moderate!,
    description: "Category score 40–69. Should be addressed before publishing.",
  },
  {
    label: "Critical",
    color: SEVERITY_COLORS.Critical!,
    description: "Category score 0–39. Must be fixed — represents a significant barrier to access.",
  },
];
</script>
