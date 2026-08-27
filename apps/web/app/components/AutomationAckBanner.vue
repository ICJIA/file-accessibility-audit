<template>
  <!-- The acknowledgment gate. Legal-compliance control: people must
       understand this tool checks only PART of accessibility, so the
       disclosure is required, not merely displayed — DropZone, index.vue's
       analyze entry points, and RemediateButton all refuse while `blocked`.

       v1.103.0 (user request): the page is FROZEN until it is acknowledged.
       That changes what this has to be. A scroll lock with no dialog
       semantics is the worst of both worlds — a keyboard user would still
       tab into content they can no longer scroll to, and a screen-reader
       user would get no signal that the page behind is inert. So freezing
       promotes this to a real dialog: role="dialog" + aria-modal, focus
       moved in and held, a dim backdrop so sighted users can see WHY the
       page stopped responding, and the scroll lock itself.

       This reverses v1.102.0's "deliberately not a modal" — recorded rather
       than quietly changed. The earlier reasoning was that a focus trap is
       an accessibility defect; that is only true of a BADLY built one. A
       dialog that announces itself, holds focus, and is dismissed by the one
       control inside it is the standard accessible pattern (ARIA APG), and
       it is not a WCAG 2.1.2 keyboard trap because its own button releases
       it. What would be a defect is freezing the page without any of that.

       No Escape handler on purpose: the acknowledgment is required, so the
       only way out is the button. That is also why focus starts ON the
       button — the remedy is the first thing a keyboard or screen-reader
       user lands on.

       Fails closed: unreadable/absent/junk/future-dated storage all leave
       the gate up (see automationAck.ts). Dismissal is one localStorage
       timestamp — never a cookie, never sent to the server, no identity
       recorded. It proves the disclosure was made and required on this
       device, not who agreed to it.

       automationAck.test.ts pins all of the above. -->
  <div v-if="visible" data-testid="automation-ack-root">
    <!-- Backdrop: the visible reason the page stopped scrolling. -->
    <div
      data-testid="automation-ack-backdrop"
      class="fixed inset-0 z-40 bg-black/70"
      @touchmove.prevent
    />

    <section
      ref="dialogEl"
      role="dialog"
      aria-modal="true"
      data-testid="automation-ack"
      aria-labelledby="automation-ack-title"
      aria-describedby="automation-ack-body"
      class="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto border-t-2 bg-[var(--surface-raised)] px-4 py-5 shadow-[0_-8px_32px_rgba(0,0,0,0.5)] transition-colors sm:px-6"
      :class="flashing ? 'border-amber-300' : 'border-amber-400'"
      :style="{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }"
    >
      <div class="mx-auto flex max-w-3xl flex-col gap-4">
        <div>
          <h2
            id="automation-ack-title"
            class="text-base font-bold text-[var(--text-heading)] sm:text-lg"
          >
            Before you check a file
          </h2>
          <div
            id="automation-ack-body"
            class="mt-2 space-y-2 text-sm leading-relaxed text-[var(--text-secondary)]"
          >
            <p>
              <strong class="text-[var(--text-heading)]"
                >This tool finds some accessibility problems — not all of them.</strong
              >
              {{ " " }}Checkers like this one, including the ones built into Adobe Acrobat and
              Microsoft Word, catch only about 30–40% of the problems in a document.
            </p>
            <p>
              The rest can only be found by a person opening the file and looking: whether the
              description of a photo actually describes it, whether the pages read aloud in an order
              that makes sense, whether a table still makes sense read one cell at a time.
            </p>
            <p>
              So a good score here means the document passed the checks a computer can run. It does
              not mean the document is accessible. Questions? Ask your agency accessibility
              coordinator.
            </p>
          </div>
        </div>
        <button
          ref="btnEl"
          type="button"
          data-testid="automation-ack-btn"
          class="self-start rounded-lg bg-amber-400 px-6 py-2.5 text-sm font-bold text-black hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          @click="acknowledge"
        >
          I understand
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from "vue";
import { useAutomationAck } from "~/composables/useAutomationAck";

const { acknowledged, nudge, resolve, acknowledge } = useAutomationAck();

const dialogEl = ref<HTMLElement | null>(null);
const btnEl = ref<HTMLButtonElement | null>(null);
const flashing = ref(false);
let flashTimer: ReturnType<typeof setTimeout> | null = null;

// Only once the answer is known — never during SSR or the tick before mount.
const visible = computed(() => acknowledged.value === false);

// --- Scroll lock -----------------------------------------------------------
// Both elements: browsers disagree about which one owns the document scroll.
// The width compensation stops the page shifting sideways as the scrollbar
// disappears, which otherwise reads as the layout breaking at the exact
// moment the gate appears.
let prevHtmlOverflow = "";
let prevBodyOverflow = "";
let prevBodyPaddingRight = "";
let locked = false;

function lockScroll(): void {
  if (locked || typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;
  const gap = window.innerWidth - html.clientWidth;
  prevHtmlOverflow = html.style.overflow;
  prevBodyOverflow = body.style.overflow;
  prevBodyPaddingRight = body.style.paddingRight;
  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
  if (gap > 0) body.style.paddingRight = `${gap}px`;
  locked = true;
}

function unlockScroll(): void {
  if (!locked || typeof document === "undefined") return;
  document.documentElement.style.overflow = prevHtmlOverflow;
  document.body.style.overflow = prevBodyOverflow;
  document.body.style.paddingRight = prevBodyPaddingRight;
  locked = false;
}

// --- Focus containment -----------------------------------------------------
// With the page frozen, focus must not land on content the visitor can no
// longer scroll to. aria-modal tells assistive tech the same thing; this
// enforces it for everyone else. The dialog holds one control, so anything
// that escapes is simply returned to it.
function onFocusIn(e: FocusEvent): void {
  if (!visible.value) return;
  const el = dialogEl.value;
  const target = e.target as Node | null;
  if (el && target && !el.contains(target)) btnEl.value?.focus();
}

onMounted(() => {
  resolve();
  document.addEventListener("focusin", onFocusIn);
});

onBeforeUnmount(() => {
  document.removeEventListener("focusin", onFocusIn);
  if (flashTimer) clearTimeout(flashTimer);
  // Never leave the page frozen behind us.
  unlockScroll();
});

watch(
  visible,
  async (isVisible) => {
    if (isVisible) {
      lockScroll();
      await nextTick();
      btnEl.value?.focus();
    } else {
      unlockScroll();
    }
  },
  { immediate: true },
);

// Someone tried to start work anyway (they can still reach the drop zone by
// keyboard before focus settles, and the gate outlives a slow hydration).
watch(nudge, (n, prev) => {
  if (n === prev || !visible.value) return;
  flashing.value = true;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashing.value = false;
  }, 1_200);
  btnEl.value?.focus();
});
</script>
