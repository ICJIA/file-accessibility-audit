<template>
    <!-- 14. Contact -->
    <section
      id="contact"
      class="scroll-mt-8 rounded-xl border-2 border-blue-700/40 bg-blue-950/15 p-5 sm:p-7"
    >
      <h2 class="text-2xl font-bold text-blue-200 mb-3">14. Contact &amp; questions</h2>
      <p class="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
        For questions about this policy, requests for technical details beyond what's documented
        here, requests to inspect a specific job's audit trail, or any concern about how this tool
        handles data:
      </p>
      <div class="space-y-1 text-sm">
        <p class="text-[var(--text-heading)] font-semibold">
          Innovation and Digital Services (IDS)
        </p>
        <p class="text-[var(--text-secondary)]">Illinois Criminal Justice Information Authority</p>
        <p class="text-[var(--text-secondary)]">
          <a
            href="mailto:cja.info@illinois.gov"
            class="text-[var(--link)] hover:text-[var(--link-hover)] font-mono font-semibold"
            >cja.info@illinois.gov</a
          >
        </p>
      </div>
      <p class="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed">
        Source code and issue tracker:
        <a
          href="https://github.com/ICJIA/file-accessibility-audit"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[var(--link)] hover:text-[var(--link-hover)]"
          >github.com/ICJIA/file-accessibility-audit</a
        >.
      </p>
    </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 15. Contact & questions. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>
