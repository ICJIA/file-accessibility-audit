<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

// Polling cadence
const POLL_OK_MS = 20_000; // happy path: check every 20s when last result was ok
const POLL_RETRY_MS = 2_500; // when unknown/down: retry every 2.5s up to MAX_FAST_RETRIES
const MAX_FAST_RETRIES = 5; // ~12.5s of fast retries before settling into slow polling
const PROBE_TIMEOUT_MS = 4_000;

// "degraded" is new: /api/health now reports the SAME verdict /status
// computes (stale backup, low disk, a dead engine), not merely "is this
// process alive". Without it the header showed a confident green "online"
// while /status said degraded — the one always-visible signal on the site
// contradicting the status page.
type Status = "unknown" | "ok" | "degraded" | "down";

/** One system behind the verdict, as /api/health reports it. `ok: null` is
 *  "not established" (engine not yet probed, backup never recorded) — shown
 *  as its own thing, never dressed up as up or down. */
interface HealthSystem {
  id: string;
  label: string;
  ok: boolean | null;
  state: string;
}

const status = ref<Status>("unknown");
const uptime = ref<string | null>(null);
const degraded = ref<string[]>([]);
const systems = ref<HealthSystem[]>([]);
let timer: ReturnType<typeof setTimeout> | null = null;
let consecutiveFailures = 0;

async function probe(): Promise<void> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch("/api/health", {
      method: "GET",
      signal: ctrl.signal,
      credentials: "same-origin",
      cache: "no-store",
    });
    clearTimeout(t);
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as {
        status?: string;
        uptime?: string;
        degraded?: string[];
        systems?: HealthSystem[];
      } | null;
      if (json?.status === "ok" || json?.status === "degraded") {
        status.value = json.status === "degraded" ? "degraded" : "ok";
        uptime.value = json.uptime ?? null;
        degraded.value = Array.isArray(json.degraded) ? json.degraded : [];
        systems.value = Array.isArray(json.systems)
          ? json.systems.filter((s) => s && typeof s.label === "string")
          : [];
        consecutiveFailures = 0;
      } else {
        markDown();
      }
    } else {
      markDown();
    }
  } catch {
    markDown();
  }
}

function markDown(): void {
  status.value = "down";
  uptime.value = null;
  degraded.value = [];
  // A failed probe establishes nothing about the systems behind the API, so
  // the tooltip must not keep asserting last-known states as current.
  systems.value = [];
  consecutiveFailures += 1;
}

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

// Self-scheduling poll loop. Uses setTimeout (not setInterval) so each
// tick can pick a fresh delay based on the current state:
//   - status === 'ok'                       → POLL_OK_MS (slow)
//   - status !== 'ok' && retries < cap      → POLL_RETRY_MS (fast)
//   - status !== 'ok' && retries >= cap     → POLL_OK_MS (slow, give up retrying fast)
//
// This is what fixes the "stuck gray on first dev-server launch" case:
// the very first probe sometimes loses the race against the Nitro proxy
// fully wiring up `/api/**`. Old code waited 20s for the next attempt;
// new code retries within 2.5s.
async function scheduleNext(): Promise<void> {
  clearTimer();
  await probe();
  const delay =
    status.value === "ok"
      ? POLL_OK_MS
      : consecutiveFailures <= MAX_FAST_RETRIES
        ? POLL_RETRY_MS
        : POLL_OK_MS;
  timer = setTimeout(() => {
    void scheduleNext();
  }, delay);
}

function handleVisibilityChange(): void {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "visible") {
    // Tab re-focused — probe right now (don't wait out the current sleep).
    void scheduleNext();
  }
}

onMounted(() => {
  void scheduleNext();
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
});

onBeforeUnmount(() => {
  clearTimer();
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }
});

const dotClass = computed(() => {
  if (status.value === "ok") return "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.7)]";
  if (status.value === "degraded") return "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.7)]";
  if (status.value === "down") return "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]";
  return "bg-[var(--text-muted)]";
});

const pulseClass = computed(() => {
  if (status.value === "ok") return "animate-ping bg-green-500";
  if (status.value === "degraded") return "animate-ping bg-amber-500";
  return "animate-ping bg-red-500";
});

const statusText = computed(() => {
  if (status.value === "ok") return "audit server online";
  // Not "online" — the whole point is that this is no longer the same state.
  if (status.value === "degraded") return "degraded — see status";
  if (status.value === "down") return "audit server offline";
  return "audit server…";
});

// Theme-aware tokens, not raw Tailwind shades: green-500/amber-500 measured
// ~2:1 on the light header — under the 4.5:1 AA floor for what is now a
// link's visible name. The tokens carry a palette per theme, and the test
// measures them on both the resting AND the hover surface.
const statusTextClass = computed(() => {
  if (status.value === "ok") return "text-[var(--status-success)]";
  if (status.value === "degraded") return "text-[var(--status-warning-yellow)]";
  if (status.value === "down") return "text-[var(--status-error)]";
  return "text-[var(--text-muted)]";
});

// ---------------------------------------------------------------------------
// Tooltip: WHAT "online" is actually claiming.
//
// A real on-page tooltip, not a `title` attribute — title needs a ~1s mouse
// hover, never appears on touch, and is not announced to screen readers (the
// same reasons the "Don't Panic" chip dropped it in v1.37.5). This one opens
// on hover OR keyboard focus, stays open while either remains (the tooltip is
// inside the hover area, so the pointer can move onto it), and Escape
// dismisses it without moving focus — the three WCAG 1.4.13 requirements.
//
// It is linked with aria-describedby, so a screen reader announces the
// per-system detail after the link's name whether or not it is visible.
// ---------------------------------------------------------------------------
const tipOpen = ref(false);
const tipDismissed = ref(false);
const tipId = "server-status-tooltip";

function openTip(): void {
  if (!tipDismissed.value) tipOpen.value = true;
}
function closeTip(): void {
  tipOpen.value = false;
  tipDismissed.value = false; // a fresh hover/focus may reopen
}
function dismissTip(): void {
  // Escape: hide without moving focus, and stay hidden until pointer/focus
  // leaves and returns.
  tipOpen.value = false;
  tipDismissed.value = true;
}

/** Glyph + word per system — never colour alone (WCAG 1.4.1). */
function systemMark(s: HealthSystem): string {
  if (s.ok === true) return "✓";
  if (s.ok === false) return "✕";
  return "—";
}

const tipIntro = computed(() => {
  if (status.value === "ok") return "All systems accounted for. Click for the full status page.";
  if (status.value === "degraded")
    return "Something needs attention. Click for the full status page.";
  if (status.value === "down")
    return "The audit service is not answering, so nothing below could be checked. The status page may still explain why.";
  return "Checking the audit service…";
});
</script>

<template>
  <span
    class="relative inline-flex"
    @mouseenter="openTip"
    @mouseleave="closeTip"
    @focusin="openTip"
    @focusout="closeTip"
    @keydown.escape="dismissTip"
  >
    <!-- A plain <a>, NOT <NuxtLink>: /status is a Nitro server route, and
         client-side navigation renders the SPA 404. ?html mirrors every other
         in-site status link (v1.42.1). -->
    <a
      href="/status?html"
      data-testid="server-status-link"
      :aria-describedby="tipId"
      class="inline-flex items-center gap-1.5 rounded px-1 -mx-1 cursor-pointer hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]"
    >
      <span class="relative inline-flex items-center justify-center w-3 h-3" aria-hidden="true">
        <span
          v-if="status !== 'unknown'"
          class="absolute inline-flex w-2 h-2 rounded-full opacity-40"
          :class="pulseClass"
        />
        <span
          class="relative inline-flex w-2 h-2 rounded-full transition-colors duration-300"
          :class="dotClass"
        />
      </span>
      <!-- The visible text IS the link's accessible name (WCAG 2.5.3), and a
           polite live region so a change to "degraded" is announced. On
           screens too narrow to show it, sr-only keeps the name intact. -->
      <span
        role="status"
        class="sr-only sm:not-sr-only sm:inline text-[11px] whitespace-nowrap tracking-wide transition-colors duration-300"
        :class="statusTextClass"
      >
        {{ statusText }}
      </span>
    </a>

    <!-- Always in the DOM (aria-describedby reads it even while hidden);
         v-show only controls visibility. Directly adjacent to the trigger so
         the pointer can travel onto it without a gap. -->
    <span
      :id="tipId"
      role="tooltip"
      data-testid="server-status-tooltip"
      class="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-[var(--border-alt)] bg-[var(--surface-raised)] px-3.5 py-3 text-left shadow-lg"
      :class="tipOpen ? '' : 'hidden'"
    >
      <span class="block text-xs leading-relaxed text-[var(--text-secondary)]">
        {{ tipIntro }}
      </span>
      <span v-if="systems.length" class="mt-2 block space-y-1">
        <span
          v-for="s in systems"
          :key="s.id"
          class="flex items-baseline justify-between gap-3 text-xs"
        >
          <span class="text-[var(--text-heading)]">
            <span aria-hidden="true" class="inline-block w-3.5">{{ systemMark(s) }}</span>
            {{ s.label }}
          </span>
          <span class="shrink-0 text-[var(--text-secondary)]">{{ s.state }}</span>
        </span>
      </span>
      <span
        v-if="status === 'ok' && uptime"
        class="mt-2 block text-xs text-[var(--text-secondary)]"
      >
        Up {{ uptime }}
      </span>
    </span>
  </span>
</template>
