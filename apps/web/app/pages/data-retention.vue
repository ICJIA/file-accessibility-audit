<script setup lang="ts">
// Public page — no auth middleware. Agency staff, auditors, lawyers,
// records-retention officers, and the general public should be able to
// read this without logging in.
import { useRouter } from "vue-router";
import { onMounted, ref } from "vue";

definePageMeta({ middleware: [] });

const router = useRouter();
// When opened in a new tab from the footer link, browser history is
// empty — the back button has no useful destination. Detect that and
// link home instead.
const hasHistory = ref(false);
onMounted(() => {
  hasHistory.value = typeof window !== "undefined" && window.history.length > 1;
});

function goBack(): void {
  if (hasHistory.value) {
    router.back();
  } else {
    void router.push("/");
  }
}

const runtimeConfig = useRuntimeConfig();

useHead({
  title: "Data Retention Policy",
  meta: [
    {
      name: "description",
      content:
        "Auditor-ready data retention policy: how uploaded files (PDF, Word, PowerPoint, Excel) are stored, processed, and deleted; AI usage statement; lifecycle audit trail; retention periods; contact information.",
    },
  ],
  link: [
    {
      rel: "canonical",
      href: `${runtimeConfig.public.siteUrl}/data-retention`,
    },
  ],
});

const POLICY_VERSION = "1.1";
const POLICY_EFFECTIVE = "2026-07-03";
const TOOL_VERSION = runtimeConfig.public.appVersion;

// Mermaid diagram sources. Deliberately simple — flowchart TD only,
// short labels, no subgraphs, no HTML in labels, no special chars.
// Reliability over richness.
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-10 space-y-10">
    <!-- Back navigation (works whether user opened in a new tab from
         the footer, navigated here directly, or arrived via a shared
         link). When history exists we use it; otherwise we land them
         on the home page. -->
    <nav class="-mb-4">
      <button
        type="button"
        class="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        @click="goBack"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
          />
        </svg>
        <span>{{ hasHistory ? "Back" : "Back to home" }}</span>
      </button>
    </nav>

    <!-- Header -->
    <header>
      <p class="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)] mb-3">
        Policy · v{{ POLICY_VERSION }}
      </p>
      <h1 class="text-3xl sm:text-5xl font-black text-[var(--text-heading)] leading-tight">
        Data Retention Policy
      </h1>
      <p class="mt-4 text-sm text-[var(--text-muted)]">
        Effective <strong>{{ POLICY_EFFECTIVE }}</strong> · Applies to tool version
        <strong>{{ TOOL_VERSION }}</strong> and newer · This document is part of the open-source
        project source code and is version-controlled at
        <code class="text-xs font-mono">apps/web/app/pages/data-retention.vue</code>.
      </p>
      <p class="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
        This policy describes how the ICJIA File Accessibility Audit tool ingests, processes,
        retains, and deletes uploaded files — PDF, Word (.docx), PowerPoint (.pptx), and Excel
        (.xlsx) documents — and related metadata. It is intended for managers, records-retention
        officers, accessibility auditors, legal counsel, and other stakeholders who need a complete
        and accurate account of the tool's data handling. Technical details are included verbatim —
        vague language has been avoided in favor of precision.
      </p>
    </header>

    <!-- AT-A-GLANCE: No AI banner -->
    <section
      class="rounded-2xl border-2 border-red-700/50 bg-gradient-to-br from-red-950/30 to-red-950/10 p-6 sm:p-8 text-center"
    >
      <div
        class="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-red-700/60 bg-red-950/40 mb-4"
      >
        <svg
          class="w-8 h-8 sm:w-10 sm:h-10 text-red-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
      </div>
      <p
        class="text-2xl sm:text-4xl font-black uppercase tracking-[0.15em] text-red-300 leading-tight mb-3"
      >
        No AI is used.
      </p>
      <p
        class="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl mx-auto"
      >
        Your file is <strong>never</strong> sent to <strong>ChatGPT</strong>,
        <strong>GPT-4</strong>, <strong>GPT-4o</strong>, <strong>Claude</strong>,
        <strong>Gemini</strong>, <strong>Copilot</strong>, or any other artificial-intelligence
        service. No machine-learning model is loaded on this server. The tool uses rule-based,
        deterministic, open-source software exclusively. See § 4 below for the complete exclusion
        list.
      </p>
    </section>

    <!-- Infographic stats grid -->
    <section>
      <h2 class="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4 text-center">
        Key facts at a glance
      </h2>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4">
          <div class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2">
            0
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            Files retained after processing
          </p>
        </div>
        <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4">
          <div class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2">
            ≤30 min
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            Maximum remediation-output retention
          </p>
        </div>
        <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4">
          <div class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2">
            0
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">AI services contacted</p>
        </div>
        <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4">
          <div class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2">
            0
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            Third-party data transmissions
          </p>
        </div>
        <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4">
          <div class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2">
            100%
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            Deletion verified via fs.stat
          </p>
        </div>
        <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4">
          <div class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2">
            7 yr
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            Audit-trail retention (configurable)
          </p>
        </div>
        <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4">
          <div class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2">
            100%
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">Open-source toolchain</p>
        </div>
        <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4">
          <div class="text-3xl sm:text-4xl font-black text-[var(--accent-green)] leading-none mb-2">
            3
          </div>
          <p class="text-[11px] text-[var(--text-muted)] leading-tight">
            Open-source tools (qpdf · ODL · veraPDF)
          </p>
        </div>
      </div>
    </section>

    <!-- Table of contents -->
    <section class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
        Contents
      </h2>
      <ol class="space-y-1 text-sm text-[var(--text-secondary)]">
        <li>
          <a href="#scope" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >1. Scope &amp; applicable systems</a
          >
        </li>
        <li>
          <a href="#audit-flow" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >2. Audit pipeline — how files are handled when you click "Audit"</a
          >
        </li>
        <li>
          <a href="#remediation-flow" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >3. Remediation pipeline — how PDFs are handled when you click "Remediate"</a
          >
        </li>
        <li>
          <a href="#ai" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >4. AI usage statement (none)</a
          >
        </li>
        <li>
          <a href="#tools" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >5. The open-source toolchain (qpdf · pdfjs · JSZip · fast-xml-parser · OpenDataLoader ·
            veraPDF)</a
          >
        </li>
        <li>
          <a href="#audit-trail" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >6. Lifecycle audit trail (the auditor's evidence)</a
          >
        </li>
        <li>
          <a href="#retention-table" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >7. Retention periods by data category</a
          >
        </li>
        <li>
          <a href="#stored" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >8. What is and isn't stored</a
          >
        </li>
        <li>
          <a href="#safeguards" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >9. Security &amp; technical safeguards</a
          >
        </li>
        <li>
          <a href="#security-audits" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >10. Security audit history (red/blue team reviews)</a
          >
        </li>
        <li>
          <a href="#inspect" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >11. Right to inspect &amp; verify</a
          >
        </li>
        <li>
          <a href="#standards" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >12. Standards &amp; compliance alignment</a
          >
        </li>
        <li>
          <a href="#glossary" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >13. Glossary of technical terms</a
          >
        </li>
        <li>
          <a href="#change-log" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >14. Change log for this policy</a
          >
        </li>
        <li>
          <a href="#contact" class="text-[var(--link)] hover:text-[var(--link-hover)]"
            >15. Contact &amp; questions</a
          >
        </li>
      </ol>
    </section>

    <DataRetentionSection01Scope />

    <DataRetentionSection02AuditFlow />

    <DataRetentionSection03RemediationFlow />

    <DataRetentionSection04Ai />

    <DataRetentionSection05Tools />

    <DataRetentionSection06AuditTrail />

    <DataRetentionSection07RetentionTable />

    <DataRetentionSection08Stored />

    <DataRetentionSection09Safeguards />

    <DataRetentionSection10SecurityAudits />

    <DataRetentionSection11Inspect />

    <DataRetentionSection12Standards />

    <DataRetentionSection13Glossary />

    <DataRetentionSection14ChangeLog />

    <!-- Related documents (linked source-of-truth references) -->
    <section class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4">
        Related documents & source code
      </h2>
      <p class="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
        Every claim in this policy is verifiable against publicly-available source code and
        documentation. Audit it yourself:
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href="https://github.com/ICJIA/file-accessibility-audit"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Source code
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            github.com/ICJIA/file-accessibility-audit
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            The complete TypeScript / Vue source for the API, web UI, and remediation worker. All
            claims here are verifiable against this repository.
          </p>
        </a>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Changelog
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">CHANGELOG.md</div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Version history of every behavior change, including the introduction of the
            auto-remediation feature in v1.18.0.
          </p>
        </a>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit/blob/main/README.md"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Project README
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">README.md</div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Feature overview, quick-start instructions, and the per-release security-audit log.
          </p>
        </a>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit/blob/main/docs/archive/pdf-remediation-integration-plan.md"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Integration plan
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            pdf-remediation-integration-plan.md
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Full architectural spec for the auto-remediation feature including threat model and the
            per-event audit-trail design.
          </p>
        </a>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit/blob/main/docs/archive/spike-remediation-results.md"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Feasibility spike
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            spike-remediation-results.md
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Results from testing OpenDataLoader against 12 representative ICJIA-style PDFs.
            Documents the rationale for the qpdf preprocessing step.
          </p>
        </a>
        <a
          href="https://github.com/ICJIA/file-accessibility-audit/blob/main/docs/archive/pdf-remediation-alt-text-walkthrough-spec.md"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-[var(--border)] bg-[var(--surface-deep)] p-4 hover:border-blue-700/40 transition-colors"
        >
          <div class="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Alt-text walkthrough spec
          </div>
          <div class="text-sm font-semibold text-[var(--text-heading)]">
            pdf-remediation-alt-text-walkthrough-spec.md
          </div>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            Design spec for the planned Phase 1 follow-on feature (interactive, AI-free alt-text
            authoring).
          </p>
        </a>
      </div>
    </section>

    <DataRetentionSection15Contact />
  </div>
</template>
