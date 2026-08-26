<template>
  <!-- The acknowledgment gate. Legal-compliance control (2026-08-26): people
       must understand this tool checks only PART of accessibility, so the
       disclosure is not merely displayed — it is REQUIRED before any file can
       be checked or remediated. DropZone, index.vue's analyze entry points,
       and RemediateButton all refuse to work while `blocked` is true.

       Still deliberately NOT a modal: no backdrop, no focus trap, no
       aria-modal, and the page stays readable and scrollable (the FAQs,
       Technical Details, and the Matterhorn checklist are all reachable
       without acknowledging anything). What is gated is starting WORK, not
       reading the site — a focus trap would add an accessibility defect to an
       accessibility tool, and this is the one product that cannot afford
       that. The gate does the compliance job; the trap would only add risk.

       It DOES pull focus on demand: when a gated surface is used anyway, it
       bumps `nudge`, and the bar takes focus and flashes so the block always
       names its own remedy instead of reading as a dead drop zone.

       Fails closed for the disclosure: unreadable/absent/junk/future-dated
       storage all leave the bar up and the tool gated (see automationAck.ts).
       Dismissal is one localStorage timestamp — never a cookie, never sent to
       the server, no identity recorded. It proves the disclosure was made and
       required on this device, not who agreed to it.

       Client-only reveal (needs localStorage) costs no CLS because the bar is
       fixed — unlike the in-flow announcement banner, which is SSR-rendered
       for exactly that reason. z-40, same layer as ScrollToTop but later in
       the DOM, so it paints over it; ProcessingOverlay (z-50) still covers
       everything. automationAck.test.ts pins all of the above. -->
  <section
    v-if="visible"
    ref="barEl"
    data-testid="automation-ack"
    aria-labelledby="automation-ack-lead"
    class="fixed inset-x-0 bottom-0 z-40 border-t bg-[var(--surface-raised)] px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.25)] transition-shadow sm:px-6"
    :class="
      flashing
        ? 'border-amber-400 shadow-[0_-8px_32px_rgba(251,191,36,0.45)]'
        : 'border-amber-500/40'
    "
    :style="{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }"
  >
    <div class="mx-auto flex max-w-4xl flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-5">
      <p class="text-xs leading-relaxed text-[var(--text-secondary)] sm:text-[13px]">
        <span id="automation-ack-lead" class="font-semibold text-[var(--text-heading)]">
          This tool checks only part of accessibility — studies put automated coverage at around
          30–40% of issues.
        </span>
        {{ " " }}That's true of every checker, including Adobe Acrobat's, PAC, and Word's. The rest
        — whether the alt text really describes the image, whether the reading order makes sense —
        has to be checked by a person. Questions? Ask your agency accessibility coordinator.
      </p>
      <button
        ref="btnEl"
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
import { computed, onMounted, ref, watch } from "vue";
import { useAutomationAck } from "~/composables/useAutomationAck";

const { acknowledged, nudge, resolve, acknowledge } = useAutomationAck();

const barEl = ref<HTMLElement | null>(null);
const btnEl = ref<HTMLButtonElement | null>(null);
const flashing = ref(false);
let flashTimer: ReturnType<typeof setTimeout> | null = null;

// Only once the answer is known — never during SSR or the tick before mount.
const visible = computed(() => acknowledged.value === false);

onMounted(resolve);

// Someone tried to start work while blocked: take them to the answer.
watch(nudge, (n, prev) => {
  if (n === prev || !visible.value) return;
  flashing.value = true;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashing.value = false;
  }, 1_200);
  // focus() also scrolls it into view; the bar is fixed, so this is only
  // about where the keyboard is, not where the page is.
  btnEl.value?.focus();
});
</script>
