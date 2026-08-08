<template>
  <!-- 10. Security audits -->
  <section id="security-audits" class="scroll-mt-8">
    <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
      10. Security audit history (red/blue team reviews)
    </h2>

    <!-- Plain-language explainer for non-technical readers -->
    <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6 mb-5">
      <h3 class="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
        What is a red/blue team audit, in plain language?
      </h3>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        Imagine the tool is a bank vault. <strong>The red team</strong> plays the role of someone
        trying to break in — looking for unlocked doors, weak walls, or ways to trick the guards.
        They aren't actually attackers; they're security-minded reviewers who deliberately think
        like attackers. <strong>The blue team</strong> plays the defenders — documenting every lock,
        alarm, and procedure that's supposed to keep the vault safe.
      </p>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        A red/blue team audit is when both teams sit down together — often the same person playing
        both roles — and systematically work through everything that could go wrong:
        <em
          >"What if someone uploads a poisoned file?" "What if two people try to download the same
          thing at once?" "What if the server runs out of memory mid-job?"</em
        >
        For each scenario, they identify whether existing protections are adequate, what could fail,
        and how to fix it.
      </p>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        The output is a list of <strong>findings</strong>, each rated by severity:
      </p>
      <ul class="space-y-1.5 text-sm text-[var(--text-secondary)] list-disc list-inside ml-2 mb-3">
        <li>
          <strong>P0 — critical:</strong> the system is broken right now and users are exposed. Must
          be fixed immediately, before any release.
        </li>
        <li>
          <strong>P1 — serious:</strong> a real vulnerability that could be exploited. Must be fixed
          before the upcoming release.
        </li>
        <li>
          <strong>P2 — moderate:</strong> a real concern, but its impact is bounded by other
          protections. Documented; sometimes accepted as a known limitation if mitigation is in
          place.
        </li>
        <li>
          <strong>P3 — minor:</strong> a small concern or theoretical risk. Tracked; addressed when
          convenient.
        </li>
      </ul>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
        <strong>Why this matters for compliance:</strong> ADA Title II, Illinois IITAA 2.1, and most
        state-agency procurement standards require a "reasonable" level of security. A documented
        red/blue team audit before each release is concrete evidence of due diligence — it
        demonstrates that the development team didn't just hope nothing would go wrong, they
        systematically checked. For an external auditor, this section IS the documentation of that
        diligence.
      </p>
    </div>

    <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
      Audit entries below are in reverse-chronological order (most recent first). Each entry lists
      the findings discovered during that release's review and what was done about them.
    </p>

    <!-- One card per release. The entries live in ~/data/securityAudits; this
         is the only place their markup exists. -->
    <!-- eslint-disable vue/no-v-html -- Every v-html below renders a string authored in ~/data/securityAudits.ts by the maintainers and compiled into the bundle. This component takes no props, makes no requests, and reads no database, so nothing user-supplied or request-derived can reach them; securityAudits.test.ts asserts the data file contains only <a>/<br>/<code>/<em>/<strong>, no event handler, no style, no src, no data:/javascript: URI, and no interpolation. -->
    <article
      v-for="(entry, i) in SECURITY_AUDIT_ENTRIES"
      :key="entry.version"
      class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6"
      :class="i < SECURITY_AUDIT_ENTRIES.length - 1 ? 'mb-4' : ''"
    >
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
  </section>
</template>

<script setup lang="ts">
// 10. Security audit history.
//
// This component used to BE the history: 65 hand-written <article> blocks,
// 3,273 lines, ~46 of them boilerplate per release. The entries now live as
// data in ~/data/securityAudits.ts and this file is the only place their
// markup exists — so a styling change happens once instead of 65 times, and
// adding a release is a few lines of prose rather than a copied block.
//
// ON THE v-html. Entries carry inline emphasis mid-sentence (<strong>, <em>,
// <code>, <br>, a couple of <a>), so their text is markup and is rendered as
// markup. This is safe for exactly one reason, and it is worth stating
// plainly: the strings are authored in the repository by the maintainers and
// compiled into the bundle. Nothing user-supplied, request-derived, or read
// from the database reaches this component — it takes no props and makes no
// requests. securityAudits.test.ts pins that, by asserting the data file
// contains only inline formatting tags and no script/handler/URL-bearing
// attribute. If an entry ever needs to include something a user typed, escape
// it at the source; do not relax the check.
import { SECURITY_AUDIT_ENTRIES, type AuditBadge } from "~/data/securityAudits";

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
