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
      the findings discovered during that release's review and what was done about them. Every
      release since v1.18.0 has an entry.
    </p>
    <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
      <strong>On dates.</strong> Some entries are marked <em>"entry recorded 2026-08-08"</em>. Those
      releases were reviewed at the time, but this plain-language write-up of them was reconstructed
      later from the project's own change log — 27 releases, mostly small follow-up corrections, had
      been left out of this section. The distinction is marked rather than smoothed over: a record
      that quietly backdates itself is worth less than one that says which of its entries were
      written after the fact. An automated check now prevents a release from shipping without an
      entry here, so the gap cannot reopen.
    </p>

    <!-- One card per release. The entries live in ~/data/securityAudits and
         the card markup lives in Section10AuditEntry.vue. Only the MOST
         RECENT review is expanded (v1.96.0, user request): the history below
         it is one <details> fold, the same pattern the project changelog
         uses — every entry stays in the DOM (and in the accessibility tree),
         it just doesn't spend two hundred screens of space by default. -->
    <Section10AuditEntry :entry="newest" />

    <details class="mt-4">
      <summary
        class="cursor-pointer select-none rounded-xl border border-[var(--border)] bg-[var(--surface-card)] px-5 py-4 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-heading)] transition-colors"
      >
        Earlier reviews — {{ earlier.length }} of them ({{ earlier[0]?.version }} →
        {{ earlier[earlier.length - 1]?.version }}) — click to expand
      </summary>
      <div class="mt-4 space-y-4">
        <Section10AuditEntry v-for="entry in earlier" :key="entry.version" :entry="entry" />
      </div>
    </details>
  </section>
</template>

<script setup lang="ts">
// 10. Security audit history.
//
// This component used to BE the history: 65 hand-written <article> blocks,
// 3,273 lines, ~46 of them boilerplate per release. The entries now live as
// data in ~/data/securityAudits.ts and the card markup lives in
// Section10AuditEntry.vue — imported explicitly (plain-vitest mounts have no
// Nuxt auto-import). Only the newest review renders expanded; the rest sit
// inside one native <details> fold, all still present in the DOM, which is
// what securityAudits.test.ts counts.
//
// ON THE v-html (in the child): the strings are authored in the repository by
// the maintainers and compiled into the bundle. Nothing user-supplied,
// request-derived, or read from the database reaches these components — this
// one takes no props and makes no requests, and the child receives entries
// only from the compiled data file. securityAudits.test.ts pins that, by
// asserting the data file contains only inline formatting tags and no
// script/handler/URL-bearing attribute. If an entry ever needs to include
// something a user typed, escape it at the source; do not relax the check.
import { SECURITY_AUDIT_ENTRIES } from "~/data/securityAudits";
import Section10AuditEntry from "./Section10AuditEntry.vue";

const newest = SECURITY_AUDIT_ENTRIES[0]!;
const earlier = SECURITY_AUDIT_ENTRIES.slice(1);
</script>
