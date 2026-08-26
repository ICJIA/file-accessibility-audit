<template>
  <!-- The cookie-banner-style half of the automation-honesty pair (user
       request, 2026-08-26): the visitor has to actively acknowledge that
       automated checkers only test a subset of accessibility — "like the
       european data use popups", but deliberately NOT a modal: nothing is
       blocked, focus is not stolen, no backdrop, the page stays usable
       ("not too invasive — but a user has to be proactive with it").

       Client-only by construction: the decision needs localStorage, so it
       reveals in onMounted. That costs no CLS because the bar is fixed —
       unlike the announcement banner, which is in-flow and SSR-rendered for
       exactly that reason. Dismissal lasts AUTOMATION_ACK_HOURS (a week),
       then the bar returns; see audit.config.ts.

       z-40 — same layer as ScrollToTop, later in the DOM, so the bar paints
       over the button at the bottom edge until it is acknowledged, and the
       full-screen ProcessingOverlay (z-50) still covers everything.

       automationAck.test.ts pins the copy, the proactive dismissal, the 72h
       return, and the not-a-modal constraints. -->
  <section
    v-if="visible"
    data-testid="automation-ack"
    aria-labelledby="automation-ack-lead"
    class="fixed inset-x-0 bottom-0 z-40 border-t border-amber-500/40 bg-[var(--surface-raised)] px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.25)] sm:px-6"
    :style="{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }"
  >
    <div class="mx-auto flex max-w-4xl flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-5">
      <p class="text-xs sm:text-[13px] leading-relaxed text-[var(--text-secondary)]">
        <span id="automation-ack-lead" class="font-semibold text-[var(--text-heading)]">
          Automated checkers can only test part of accessibility — studies put it around 30–40% of
          issues.
        </span>
        {{ " " }}That's true of this site, Adobe Acrobat's checker, PAC, and Word's. The rest —
        whether the alt text really describes the image, whether the reading order makes sense —
        needs a person. Questions? Ask your agency accessibility coordinator.
      </p>
      <button
        type="button"
        data-testid="automation-ack-btn"
        class="shrink-0 self-start rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 sm:self-auto"
        @click="acknowledge"
      >
        I understand
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { needsAutomationAck, recordAutomationAck } from "~/utils/automationAck";

const visible = ref(false);

onMounted(() => {
  visible.value = needsAutomationAck();
});

function acknowledge(): void {
  recordAutomationAck();
  visible.value = false;
}
</script>
