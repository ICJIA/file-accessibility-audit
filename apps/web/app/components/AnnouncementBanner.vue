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
      {{ current.text }}
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
}>;
const wcagVersion = String(pub.wcagVersion ?? "2.2");

// runtimeConfig.public is static after hydration, so this is computed once at
// setup — no reactive wrapper needed. Newest = index 0; filter out entries
// gated to a different WCAG version.
const current = announcements.find(
  (a) => !a.requiresWcagVersion || a.requiresWcagVersion === wcagVersion,
);

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
