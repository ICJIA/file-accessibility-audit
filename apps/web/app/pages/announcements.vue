<script setup lang="ts">
// Archive of every landing-page announcement, newest first.
//
// The banner shows only ANNOUNCEMENTS[0] and can be dismissed permanently per
// id, so without this page an update a visitor dismissed (or that was
// superseded before they next visited) becomes unreachable. This is a plain
// Vue page, so the banner's link to it needs no `external` — unlike /status,
// which is a Nitro server route.
definePageMeta({ middleware: [] });

interface Announcement {
  id: string;
  badge: string;
  text: string;
  linkText?: string;
  linkTo?: string;
  linkExternal?: boolean;
  date?: string;
  requiresWcagVersion?: string | null;
  /** WCAG criteria this entry names, rendered as links to the rules. */
  wcagRefs?: Array<{ sc: string; name: string; slug: string }>;
}

const pub = useRuntimeConfig().public;
const wcagVersion = String(pub.wcagVersion ?? "2.1");
// Understanding-page URLs for any criterion an entry names.
const wcag = useWcag();
const siteUrl = String(pub.siteUrl ?? "");

// Same WCAG-version filter the banner applies: an announcement that does not
// describe the running configuration would be misleading here too.
const announcements = ((pub.announcements ?? []) as Announcement[]).filter(
  (a) => !a.requiresWcagVersion || a.requiresWcagVersion === wcagVersion,
);

useHead({
  title: "What's new",
  meta: [
    {
      name: "description",
      content:
        "Every update announced on the ICJIA File Accessibility Audit landing page, newest first — what changed, and when.",
    },
  ],
  link: siteUrl ? [{ rel: "canonical", href: `${siteUrl}/announcements` }] : [],
});
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-10">
    <p class="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
      Update archive
    </p>
    <h1 class="text-3xl font-black text-[var(--text-heading)] mb-4">What's new</h1>
    <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-8">
      Every update announced on the home page, newest first. The banner there shows only the most
      recent one and can be dismissed, so this is the full list.
    </p>

    <ol v-if="announcements.length" class="space-y-4 list-none p-0">
      <li
        v-for="(item, index) in announcements"
        :key="item.id"
        class="rounded-xl border border-[var(--border-alt)] bg-[var(--surface-card-alt)] px-5 py-4"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
          <span
            class="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-300"
            >{{ item.badge }}</span
          >
          <span v-if="item.date" class="text-xs text-[var(--text-muted)]">{{ item.date }}</span>
          <span
            v-if="index === 0"
            class="text-xs font-semibold text-[var(--text-muted)]"
            aria-label="Most recent update"
            >· current</span
          >
        </div>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
          {{ item.text }}
          <!-- `external` matters for server routes such as /status: without it
               the Vue router has no match and renders its own 404. -->
          <NuxtLink
            v-if="item.linkTo"
            :to="item.linkTo"
            :external="item.linkExternal === true"
            class="font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
            >{{ item.linkText }}</NuxtLink
          >
          <!-- The criteria this entry names, linked to the rules themselves. -->
          <template v-for="ref in item.wcagRefs ?? []" :key="ref.sc"
            >{{ " "
            }}<a
              :href="wcag.understandingUrl(ref.slug)"
              target="_blank"
              rel="noopener noreferrer"
              class="font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
              >WCAG {{ ref.sc }}: {{ ref.name }}</a
            ></template
          >
        </p>
      </li>
    </ol>

    <p v-else class="text-sm text-[var(--text-muted)]">There are no announcements yet.</p>

    <div class="mt-10">
      <NuxtLink
        to="/"
        class="text-sm font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
        >Back to the audit tool</NuxtLink
      >
    </div>
  </div>
</template>
