<!-- /security — every security review of this tool, findings beside fixes.

     Added 2026-11-25 (owner request): the reviews already existed, as § 10 of
     the data-retention policy and as README § Security, but neither is where
     someone looks for "has this been attacked, and what happened". This page
     is the same record on its own address: the SAME entries
     (data/securityAudits.ts), drawn by the SAME card (Section10AuditEntry),
     so the two can never tell different stories.

     Layout, as asked: the newest review is open; every earlier one is its own
     folded row carrying its version, its date and its scope. Native
     <details>, so each opens without script, with the keyboard, and
     find-in-page still reaches the text of a row once it is opened. -->
<template>
  <div class="mx-auto max-w-4xl">
    <p class="pk-label text-[var(--text-secondary)]">Security</p>
    <h1 class="pk-page-title mt-2">Security reviews</h1>
    <p class="mt-5 text-base leading-relaxed text-[var(--text-secondary)]">
      Every release of this tool is reviewed for security before it goes out, and the larger changes
      are attacked on purpose: one reviewer tries to break the change (the red team) and another
      fixes what was found (the blue team). This page is the full record. Each review lists what was
      found beside the fix that closed it.
    </p>
    <p class="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
      {{ entries.length }} reviews, newest first. The newest is open; select any earlier one to open
      it. For what happens to a file you upload, see the
      <NuxtLink
        to="/data-retention"
        :prefetch="false"
        class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
        >data policy</NuxtLink
      >. For how the checker's accuracy is tested, see
      <NuxtLink to="/trust" class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
        >Can I trust this?</NuxtLink
      >
    </p>

    <section class="mt-10" aria-labelledby="security-latest">
      <h2 id="security-latest" class="pk-label mb-3 text-[var(--text-secondary)]">
        Latest review<template v-if="newestDate"> · {{ newestDate }}</template>
      </h2>
      <Section10AuditEntry :entry="newest" data-testid="security-latest" />
    </section>

    <section class="mt-12" aria-labelledby="security-earlier">
      <h2 id="security-earlier" class="pk-label mb-3 text-[var(--text-secondary)]">
        Earlier reviews · {{ earlier.length }}
      </h2>
      <details
        v-for="entry in earlier"
        :key="entry.version"
        class="pk-note mb-2"
        data-testid="security-earlier"
      >
        <summary>
          <span class="min-w-0">
            <span class="font-bold text-[var(--text-heading)]">{{ entry.version }}</span>
            <span v-if="dateOf(entry)" class="ml-2 text-sm text-[var(--text-secondary)]">{{
              dateOf(entry)
            }}</span>
            <span class="block text-sm text-[var(--text-secondary)]">{{ scopeOf(entry) }}</span>
          </span>
        </summary>
        <div class="px-2 pb-2">
          <Section10AuditEntry :entry="entry" />
        </div>
      </details>
    </section>
  </div>
</template>

<script setup lang="ts">
import { SECURITY_AUDIT_ENTRIES, type SecurityAuditEntry } from "~/data/securityAudits";
import Section10AuditEntry from "~/components/dataRetention/Section10AuditEntry.vue";
import { reviewDate, reviewScope } from "~/utils/securityLog";

const entries = SECURITY_AUDIT_ENTRIES;
const newest = entries[0]!;
const earlier = entries.slice(1);
const newestDate = reviewDate(newest.meta);
const dateOf = (e: SecurityAuditEntry) => reviewDate(e.meta);
const scopeOf = (e: SecurityAuditEntry) => reviewScope(e.meta);

const DESCRIPTION =
  "Every security review of this document accessibility checker: what each red-team and blue-team audit found, beside the fix that closed it.";

useHead({
  title: "Security reviews — Accessibility Audit",
  meta: [{ name: "description", content: DESCRIPTION }],
});
</script>
