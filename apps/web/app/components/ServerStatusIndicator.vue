<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

// Polling cadence
const POLL_OK_MS = 20_000; // happy path: check every 20s when last result was ok
const POLL_RETRY_MS = 2_500; // when unknown/down: retry every 2.5s up to MAX_FAST_RETRIES
const MAX_FAST_RETRIES = 5; // ~12.5s of fast retries before settling into slow polling
const PROBE_TIMEOUT_MS = 4_000;

type Status = "unknown" | "ok" | "down";

const status = ref<Status>("unknown");
const uptime = ref<string | null>(null);
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
      } | null;
      if (json?.status === "ok") {
        status.value = "ok";
        uptime.value = json.uptime ?? null;
        consecutiveFailures = 0;
      } else {
        status.value = "down";
        uptime.value = null;
        consecutiveFailures += 1;
      }
    } else {
      status.value = "down";
      uptime.value = null;
      consecutiveFailures += 1;
    }
  } catch {
    status.value = "down";
    uptime.value = null;
    consecutiveFailures += 1;
  }
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

const label = computed(() => {
  if (status.value === "ok") {
    return uptime.value
      ? `Audit & remediation server online — uptime ${uptime.value}`
      : "Audit & remediation server online";
  }
  if (status.value === "down") return "Audit & remediation server offline";
  return "Checking audit & remediation server…";
});

const dotClass = computed(() => {
  if (status.value === "ok") return "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.7)]";
  if (status.value === "down") return "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]";
  return "bg-[var(--text-muted)]";
});

const pulseClass = computed(() =>
  status.value === "ok" ? "animate-ping bg-green-500" : "animate-ping bg-red-500",
);

const statusText = computed(() => {
  if (status.value === "ok") return "audit server online";
  if (status.value === "down") return "audit server offline";
  return "audit server…";
});

const statusTextClass = computed(() => {
  if (status.value === "ok") return "text-green-500/90";
  if (status.value === "down") return "text-red-500/90";
  return "text-[var(--text-muted)]";
});
</script>

<template>
  <span class="inline-flex items-center gap-1.5" role="status" :aria-label="label" :title="label">
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
    <span
      class="hidden sm:inline text-[11px] whitespace-nowrap tracking-wide transition-colors duration-300"
      :class="statusTextClass"
    >
      {{ statusText }}
    </span>
  </span>
</template>
