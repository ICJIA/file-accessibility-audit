<template>
  <div
    v-if="visible && current"
    role="region"
    aria-label="Site announcement"
    class="mb-6 flex items-start gap-3 rounded-xl border border-[var(--border-alt)] bg-[var(--surface-card-alt)] px-4 py-3"
  >
    <span
      class="mt-0.5 shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-300"
      >{{ current.badge }}</span
    >
    <p class="flex-1 text-sm text-[var(--text-secondary)] leading-relaxed">
      {{ current.text }}
      <NuxtLink
        v-if="current.linkTo"
        :to="current.linkTo"
        class="font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
        >{{ current.linkText }}</NuxtLink
      >
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
  requiresWcagVersion?: string | null;
}>;
const wcagVersion = String(pub.wcagVersion ?? "2.2");

// runtimeConfig.public is static after hydration, so this is computed once at
// setup — no reactive wrapper needed. Newest = index 0; filter out entries
// gated to a different WCAG version.
const current = announcements.find(
  (a) => !a.requiresWcagVersion || a.requiresWcagVersion === wcagVersion,
);

// Render only after a client-side mount check so a dismissed banner never
// flashes during SSR/hydration.
const visible = ref(false);

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
  visible.value = !readDismissed().includes(current.id);
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
