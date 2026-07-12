<template>
    <!-- 1. Scope -->
    <section id="scope" class="scroll-mt-8">
      <h2 class="text-2xl font-bold text-[var(--text-heading)] mb-3">
        1. Scope &amp; applicable systems
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        This policy applies to all files — PDF, Word (.docx), PowerPoint (.pptx), and Excel (.xlsx)
        — processed by the ICJIA File Accessibility Audit tool — both the public production
        deployment at
        <code class="text-xs font-mono">https://audit.icjia.app</code> and any derivative deployment
        running the same source code. The infrastructure is hosted on
        <strong>DigitalOcean</strong> (a U.S.-based cloud provider), managed via
        <strong>Laravel Forge</strong>, and runs on a single virtual private server (VPS) located in
        a DigitalOcean data center. No content is replicated to external storage, content delivery
        networks, or backup services.
      </p>
      <p class="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
        Two distinct processing pipelines exist within the tool:
      </p>
      <ul class="text-sm text-[var(--text-secondary)] list-disc list-inside ml-2 space-y-1.5">
        <li>
          The <strong>audit pipeline</strong> (always available) — analyzes an uploaded document
          (PDF, Word, PowerPoint, or Excel) for WCAG 2.2 AA (a superset of 2.1 AA) / ADA Title II /
          Illinois IITAA 2.1 accessibility conformance signals and returns a score and findings.
        </li>
        <li>
          The <strong>remediation pipeline</strong> (optional, gated by the server-side
          <code class="text-xs font-mono">REMEDIATION_ENABLED</code>
          environment flag) — produces a tagged, more-accessible version of the uploaded PDF.
        </li>
      </ul>
      <p class="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
        Both pipelines are described separately below because their data lifecycle differs. The
        audit pipeline operates entirely in memory; the remediation pipeline requires brief on-disk
        storage during processing, which is described in detail with corresponding deletion
        verification.
      </p>
    </section>
</template>

<script setup lang="ts">
// Static content extracted verbatim from pages/data-retention.vue
// (Phase F, task F2: section split) -- 1. Scope & applicable systems. No reactive state;
// the page's own script setup (TOOL_VERSION etc.) is untouched and
// still lives in the page component per the version test's source scan.
</script>
