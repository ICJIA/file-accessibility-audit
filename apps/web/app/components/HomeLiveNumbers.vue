<!-- Three tiles for the home page's "What This Tool Does" grid: how much the
     tool has been used and how it is tested (user request, 2026-11-25 — the
     same three numbers the trust page opens with).

     WHERE THE NUMBERS COME FROM
       check-ups   the public /status?format=json this site already serves,
                   fetched in the visitor's browser after the page mounts —
                   the count is live. The server render, and a visitor whose
                   fetch fails, get the count recorded at the last release.
       self-checks scripts/brief-stats.json, written by `pnpm release
       traps       --counts` from that release's own test run. "Live" would be
                   a lie here: they change only when the code does.

     No request-derived data and nothing about the visitor is involved.
     Multiple roots on purpose: each tile is a cell of the parent's grid. -->
<template>
  <div class="pk-rule pt-4" data-testid="live-number-checkups">
    <div class="pk-display font-black text-6xl sm:text-7xl text-[var(--text-heading)] mb-5">
      {{ fmt(checkups) }}
    </div>
    <h3 class="tracking-normal text-sm font-semibold text-[var(--text-heading)] mb-1">
      Check-ups run
    </h3>
    <p class="text-xs text-[var(--text-muted)] leading-relaxed">
      Documents checked with this tool so far, by ICJIA and by other agencies.
      {{ fmt(last30) }} in the last 30 days. This count is live; see
      <a href="/status" class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
        >the status page</a
      >
      for the breakdown.
    </p>
  </div>

  <div class="pk-rule pt-4" data-testid="live-number-tests">
    <div class="pk-display font-black text-6xl sm:text-7xl text-[var(--text-heading)] mb-5">
      {{ fmt(stats.tests) }}
    </div>
    <h3 class="tracking-normal text-sm font-semibold text-[var(--text-heading)] mb-1">
      Self-checks before every release
    </h3>
    <p class="text-xs text-[var(--text-muted)] leading-relaxed">
      Tests the software runs on itself before anything goes live. All of them must pass, or nothing
      ships.
      <!-- Plain <a>, a full-page load: /trust opens its inventory from the
           hash on arrival, as the What's New links into it do. -->
      <a href="/trust#all-tests" class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
        >How it is tested</a
      >
    </p>
  </div>

  <div class="pk-rule pt-4" data-testid="live-number-traps">
    <div class="pk-display font-black text-6xl sm:text-7xl text-[var(--text-heading)] mb-5">
      {{ fmt(stats.traps) }}<span class="text-[var(--text-muted)]">/</span>{{ fmt(stats.traps) }}
    </div>
    <h3 class="tracking-normal text-sm font-semibold text-[var(--text-heading)] mb-1">
      Trap documents judged correctly
    </h3>
    <p class="text-xs text-[var(--text-muted)] leading-relaxed">
      Documents built to fool the checker, each with a known right answer. Every one is judged
      correctly before a release goes out.
      <a href="/trust#all-traps" class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
        >See all {{ fmt(stats.traps) }}</a
      >
    </p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import stats from "../../../../scripts/brief-stats.json";
import { liveCheckupCounts } from "~/utils/liveNumbers";

// en-US fixed: the server and every browser must print the same string.
const fmt = (n: number) => n.toLocaleString("en-US");

const checkups = ref(stats.cache.audits_total);
const last30 = ref(stats.cache.audits_30d);

onMounted(async () => {
  try {
    const live = liveCheckupCounts(await $fetch("/status?format=json"));
    if (live) {
      checkups.value = live.total;
      last30.value = live.last30d;
    }
  } catch {
    // Keep the recorded numbers: a status hiccup must not blank the tile.
  }
});
</script>
