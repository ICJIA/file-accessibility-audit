<template>
  <NuxtLoadingIndicator color="#22c55e" />
  <div class="min-h-screen bg-[var(--surface-body)] text-[var(--text-primary)]">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">
const appConfig = useAppConfig();

// Inject WebApplication JSON-LD structured data
if (appConfig.jsonLd) {
  useHead({
    script: [
      {
        type: "application/ld+json",
        innerHTML: JSON.stringify(appConfig.jsonLd),
      },
    ],
  });
}

// Provide a signal that child pages can watch to reset state
const resetSignal = ref(0);

// Clicking the site title clears results and starts a new file. It is the
// only reset path, and mid-batch it abandons the queue — but it navigates to
// the page it is already on, so neither the router guard nor beforeunload
// sees it. It has to ask for itself. Silent when nothing is running.
const auditInProgress = useAuditInProgress();

function goAnalyze() {
  if (!guardNavigation(auditInProgress.value, (message) => window.confirm(message))) return;
  resetSignal.value++;
  navigateTo("/");
}

provide("resetSignal", resetSignal);
provide("goAnalyze", goAnalyze);
</script>
