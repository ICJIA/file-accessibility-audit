<template>
  <!-- One release's audit card. Extracted from Section10SecurityAudits.vue
       (v1.96.0) so the newest-open + earlier-collapsed layout can render the
       same markup in two places without duplicating it. -->
  <!-- eslint-disable vue/no-v-html -- Every v-html below renders a string authored in ~/data/securityAudits.ts by the maintainers and compiled into the bundle. The entry arrives as a prop from Section10SecurityAudits.vue, which itself takes no props, makes no requests, and reads no database, so nothing user-supplied or request-derived can reach these; securityAudits.test.ts asserts the data file contains only <a>/<br>/<code>/<em>/<strong>, no event handler, no style, no src, no data:/javascript: URI, and no interpolation. -->
  <article class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6">
    <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
      <h3 class="text-lg font-bold text-[var(--text-heading)]">{{ entry.version }}</h3>
      <span class="text-xs text-[var(--text-muted)]" v-html="entry.meta" />
    </header>

    <template v-for="(block, b) in entry.body" :key="b">
      <p
        v-if="block.kind === 'p'"
        class="text-sm text-[var(--text-secondary)] leading-relaxed"
        :class="b > 0 ? 'mt-3' : ''"
        v-html="block.html"
      />

      <h4
        v-else-if="block.kind === 'h'"
        class="text-sm font-semibold text-[var(--text-heading)] mb-2"
        :class="b > 0 ? 'mt-5' : ''"
      >
        {{ block.text }}
      </h4>

      <ul
        v-else
        class="text-sm text-[var(--text-secondary)]"
        :class="[
          block.kind === 'findings' ? 'space-y-3' : 'space-y-1 list-disc list-inside ml-2',
          b > 0 ? 'mt-3' : '',
        ]"
      >
        <li v-for="(item, n) in block.items" :key="n">
          <span v-if="item.badge" :class="badgeClass(item.badge)">{{ item.badge }}</span>
          <span v-html="item.html" />
          <p
            v-if="item.note"
            class="text-xs text-[var(--text-muted)] mt-1 leading-relaxed"
            v-html="item.note"
          />
        </li>
      </ul>
    </template>
  </article>
  <!-- eslint-enable vue/no-v-html -->
</template>

<script setup lang="ts">
import type { SecurityAuditEntry, AuditBadge } from "~/data/securityAudits";

defineProps<{ entry: SecurityAuditEntry }>();

// Colour is presentation, so it is decided here rather than stored 75 times
// alongside the labels it is a pure function of.
const BADGE_TONE: Record<AuditBadge, string> = {
  P1: "bg-red-700/30 text-red-200",
  P2: "bg-amber-700/30 text-amber-200",
  P3: "bg-blue-700/30 text-blue-200",
  Note: "bg-amber-700/30 text-amber-200",
  OPS: "bg-amber-700/30 text-amber-200",
  API: "bg-blue-700/30 text-blue-200",
  Fix: "bg-blue-700/30 text-blue-200",
  Fixed: "bg-emerald-700/30 text-emerald-200",
  New: "bg-emerald-700/30 text-emerald-200",
  UX: "bg-emerald-700/30 text-emerald-200",
  Hardened: "bg-sky-700/30 text-sky-200",
};

function badgeClass(badge: AuditBadge): string {
  return `inline-block px-1.5 py-0.5 rounded text-[10px] font-mono uppercase mr-2 ${BADGE_TONE[badge]}`;
}
</script>
