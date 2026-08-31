<template>
  <div
    v-if="visible && current"
    role="region"
    aria-label="Site announcement"
    class="mb-6 flex items-start gap-3 rounded-xl border border-[var(--border-alt)] bg-[var(--surface-raised)] px-4 py-3"
  >
    <span
      class="mt-0.5 shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-300"
      >{{ current.badge }}</span
    >
    <p class="flex-1 text-sm text-[var(--text-secondary)] leading-relaxed">
      <!-- Standing label (user request, matching the fleet site's banner): the
           entry text alone read as static site copy — visitors didn't realize
           it described a recent change. -->
      <span class="block text-xs font-bold uppercase tracking-wide text-[var(--text-heading)] mb-1"
        >What's New</span
      >
      <!-- The OPENING of the entry, not all of it. Entries run to ~900
           characters and this banner sits directly above the drop zone, so
           the full text pushed the tool itself off the first screen. The cut
           is at a sentence boundary and /announcements has the whole thing —
           see summarizeAnnouncement. -->
      {{ summary.text }}
      <template v-if="summary.truncated">
        <!-- Rendered only when something was actually cut, so the link never
             promises more text than exists. Deliberately NOT an in-place
             expander: the archive already holds the full entry, and a second
             way to read it is a second thing to keep true. -->
        <NuxtLink
          to="/announcements"
          class="font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
          >Read the full update</NuxtLink
        ><!-- An EXPLICIT space, not template whitespace. Vue's condense mode
             drops whitespace-only text between two elements when it contains a
             newline, so an entry that is both cut AND carries its own link
             rendered "Read the full updateHow the audit works" — two
             underlined links touching. -->{{ " " }}
      </template>
      <!-- `external` forces a real document navigation instead of a client-side
           route change. Required for targets that are Nitro SERVER routes
           (e.g. /status) rather than Vue pages: the Vue router has no match
           for those, so a normal NuxtLink renders the SPA 404 without ever
           contacting the server. See linkExternal in audit.config.ts. -->
      <NuxtLink
        v-if="current.linkTo"
        :to="current.linkTo"
        :external="current.linkExternal === true"
        class="font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
        >{{ current.linkText }}</NuxtLink
      >
      <!-- Every WCAG criterion this entry names, as a link to the rule
           itself (standing rule, 2026-08-31): naming a criterion without a
           way to read it asks the reader to take our word for the law. -->
      <template v-for="ref in current.wcagRefs ?? []" :key="ref.sc"
        >{{ " "
        }}<a
          :href="wcag.understandingUrl(ref.slug)"
          target="_blank"
          rel="noopener noreferrer"
          class="font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
          >WCAG {{ ref.sc }}: {{ ref.name }}</a
        ></template
      >

      <span class="mt-1 block text-xs text-[var(--text-muted)]">
        <template v-if="current.date">Updated {{ current.date }} · </template>
        <!-- /announcements is a Vue page, so no `external` needed here.

             The accessible name CONTAINS the visible text (WCAG 2.5.3 Label
             in Name): a speech-input user says what they can see, so "see all
             updates" has to match. The old label was "See all previous
             announcements" — saying the visible words matched nothing, and
             Lighthouse flagged it as the site's only accessibility failure,
             on an accessibility tool. -->
        <NuxtLink
          to="/announcements"
          class="underline hover:text-[var(--text-heading)]"
          aria-label="See all updates — previous announcements"
          >See all updates</NuxtLink
        >
      </span>
    </p>
    <button
      type="button"
      class="shrink-0 rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--surface-icon)] transition-colors"
      aria-label="Dismiss announcement"
      @click="dismiss"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
// Explicit import rather than Nuxt's app/utils auto-import: this component is
// mounted in plain vitest, which applies the `~` alias but not Nuxt's
// auto-imports, so an auto-imported helper would be undefined under test.
import { summarizeAnnouncement } from "~/utils/announcementSummary";

const STORAGE_KEY = "a11y-audit:dismissed-announcements";

const pub = useRuntimeConfig().public;
const announcements = (pub.announcements ?? []) as Array<{
  id: string;
  badge: string;
  text: string;
  linkText?: string;
  linkTo?: string;
  /** Set true when linkTo is a server route rather than a Vue page. */
  linkExternal?: boolean;
  date?: string;
  requiresWcagVersion?: string | null;
  /** WCAG criteria this entry names, rendered as links to the rules. */
  wcagRefs?: Array<{ sc: string; name: string; slug: string }>;
}>;
const wcagVersion = String(pub.wcagVersion ?? "2.2");
// Understanding-page URLs for any criterion an entry names.
const wcag = useWcag();

// runtimeConfig.public is static after hydration, so this is computed once at
// setup — no reactive wrapper needed. Newest = index 0; filter out entries
// gated to a different WCAG version.
const current = announcements.find(
  (a) => !a.requiresWcagVersion || a.requiresWcagVersion === wcagVersion,
);

// Computed once alongside `current`, for the same reason: runtimeConfig.public
// is static after hydration. Falls back to an untruncated empty summary when
// there is no announcement, so the template can read it without a guard.
const summary = summarizeAnnouncement(current?.text ?? "");

// Rendered during SSR by DEFAULT, then hidden on mount if this visitor has
// dismissed it.
//
// The reverse — starting hidden and revealing on mount — is what this used to
// do, to stop a dismissed banner flashing. That traded the wrong way round.
// The banner is ~250px tall and sits above everything, so appearing after
// hydration pushed the heading, the drop zone and the whole page down: a
// single 0.067 layout shift, essentially the landing page's entire CLS
// (0.104 throttled, over Google's 0.1 "good" threshold). Every first-time
// visitor paid that, to spare returning dismissers a brief flash — and a
// first-time visitor is precisely who the banner is written for.
//
// Now the common case shifts not at all. The residual is honest and much
// smaller: someone who previously dismissed this announcement sees it for a
// frame before it goes. Removing that too would need the dismissal to be
// readable on the SERVER — a cookie instead of localStorage — which is a new
// piece of client-side storage on a tool that documents every one it keeps,
// and not worth it for a frame.
const visible = ref(true);

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Guard against corrupt/non-array values left under this key.
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

onMounted(() => {
  if (!current) return;
  // Only ever hides. The server already rendered it visible, so assigning
  // true here would be a no-op that still counted as a hydration write.
  if (readDismissed().includes(current.id)) visible.value = false;
});

function dismiss() {
  visible.value = false;
  if (!current) return;
  try {
    const set = new Set(readDismissed());
    set.add(current.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* storage unavailable (private mode) — dismissal is session-only, acceptable */
  }
}
</script>
