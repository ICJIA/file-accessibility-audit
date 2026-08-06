<template>
  <section id="technical-report" class="scroll-mt-4">
    <button
      type="button"
      class="w-full flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-deep)] px-4 py-3 text-left cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
      :aria-expanded="open"
      aria-controls="technical-report-body"
      @click="open = !open"
    >
      <svg
        class="w-3.5 h-3.5 text-[var(--text-muted)] transition-transform flex-shrink-0"
        :class="{ 'rotate-90': open }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-bold text-[var(--text-secondary)]"
          >Full technical report</span
        >
        <span class="block text-xs text-[var(--text-muted)]">
          WCAG criteria detail · findings &amp; evidence · technical signals · PDF/UA checks ·
          methodology · document metadata
        </span>
      </span>
      <span class="text-xs text-[var(--link)] flex-shrink-0" data-export-exclude>{{
        open ? "Collapse" : "Expand"
      }}</span>
    </button>

    <div v-show="open" id="technical-report-body" class="tech-report-body mt-4">
      <!-- Executive summary — parity with the Detailed view's ScoreCard,
           which renders result.executiveSummary above its conformance panel. -->
      <div
        v-if="result.executiveSummary"
        data-testid="tech-executive-summary"
        class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] px-5 py-4 mb-6"
      >
        <p class="text-sm font-semibold text-[var(--text-secondary)]">Executive summary</p>
        <p class="text-xs text-[var(--text-secondary)] leading-relaxed mt-2">
          {{ result.executiveSummary }}
        </p>
      </div>

      <!-- Audit-scope caveat — copy mirrored verbatim from ScoreCard.vue so the
           two views can never drift in meaning; do not edit one without the other. -->
      <div
        class="rounded-xl border border-[var(--border-alt)] bg-[var(--surface-hover)] px-5 py-4 mb-6"
      >
        <p v-if="sourceApp" class="text-xs text-[var(--text-secondary)] leading-relaxed">
          This automated audit provides a reliable initial assessment, but it cannot catch every
          issue. For the most thorough evaluation, run
          {{ sourceApp }}'s built-in
          <a
            href="https://support.microsoft.com/en-us/office/improve-accessibility-with-the-accessibility-checker-a16f6de0-2f39-4a2b-8bd8-5ad801426c7f"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
            >Accessibility Checker (Review → Check Accessibility)</a
          >. Because this {{ sourceApp }} file is the source document, fixing issues here corrects
          them at the root — and any PDF you export from it inherits the fixes automatically.
        </p>
        <p v-else class="text-xs text-[var(--text-secondary)] leading-relaxed">
          This automated audit provides a reliable initial assessment, but it cannot catch every
          issue. For the most thorough evaluation, test your PDF directly in
          <a
            href="https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
            >Adobe Acrobat's Accessibility Checker</a
          >. Whenever possible, ensure your source document (Word, InDesign, etc.) is accessible
          before generating the PDF — retrofitting accessibility after export is more difficult and
          less reliable.
        </p>
      </div>

      <!-- Full WCAG conformance detail — parity with the Detailed view's
           ScoreCard panel: failures with W3C links, not-assessed list,
           standards basis. -->
      <div
        v-if="result.conformance"
        data-testid="conformance-detail"
        class="rounded-xl border px-5 py-4 mb-6"
        :class="
          result.conformance.status === 'fail'
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-[var(--border)] bg-[var(--surface-card)]'
        "
      >
        <p
          class="text-sm font-semibold"
          :class="
            result.conformance.status === 'fail'
              ? 'text-[var(--status-error)]'
              : 'text-[var(--text-secondary)]'
          "
        >
          {{ conformanceHeading(result.conformance, wcagVersion) }}
        </p>
        <p class="text-xs text-[var(--text-secondary)] leading-relaxed mt-2">
          {{ result.conformance.headline }}
        </p>
        <ul v-if="result.conformance.failures?.length" class="mt-3 space-y-1.5 list-none pl-0">
          <li
            v-for="(f, i) in result.conformance.failures"
            :key="i"
            class="text-xs text-[var(--text-secondary)] leading-relaxed"
          >
            <a
              :href="safeHttpUrl(f.url)"
              target="_blank"
              rel="noopener noreferrer"
              class="font-mono font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
              >{{ f.sc }} {{ f.name }}</a
            ><span class="text-[var(--text-muted)]"> (Level {{ f.level }})</span> — {{ f.issue }}
          </li>
        </ul>
        <p
          v-if="result.conformance.notAssessed?.length"
          class="text-xs text-[var(--text-muted)] leading-relaxed mt-3"
        >
          Not evaluated automatically:
          <template v-for="(n, i) in notAssessedList" :key="n.sc"
            ><a
              :href="safeHttpUrl(n.url)"
              target="_blank"
              rel="noopener noreferrer"
              class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
              >{{ n.sc }} {{ n.name }}</a
            ><template v-if="i < notAssessedList.length - 1">, </template></template
          >. These still require manual review.
        </p>
        <p
          class="text-xs text-[var(--text-muted)] leading-relaxed mt-3 pt-3 border-t border-[var(--border-subtle)]"
        >
          {{ standardsBasis(wcagVersion) }}
        </p>
      </div>

      <ReportContent :result="result" :show-score-table="false" />

      <PdfUaSignalsCard
        v-if="result.pdfUa"
        :signals="result.pdfUa"
        :categories="result.categories"
        class="max-w-2xl mx-auto my-6"
      />
      <PdfUaVerdict
        v-if="result.pdfUaVerdict"
        :verdict="result.pdfUaVerdict"
        :grade="result.grade"
        :categories="result.categories"
        :verapdf-url="verapdfUrl || ''"
        class="my-6"
      />

      <MethodologyCard :file-type="result.fileType" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { safeHttpUrl } from "@file-audit/shared";
import ReportContent from "~/components/ReportContent.vue";
import PdfUaSignalsCard from "~/components/PdfUaSignalsCard.vue";
import PdfUaVerdict from "~/components/PdfUaVerdict.vue";
import MethodologyCard from "~/components/MethodologyCard.vue";
import { conformanceHeading, standardsBasis } from "~/utils/exportFormats/shared";

const props = defineProps<{
  // Deliberately loose (plain `any`, not `Record<string, any>`): the
  // shared-report page feeds raw stored JSON, and ReportContent's stricter
  // ReportLike shape would otherwise reject it at the call below.
  // (@typescript-eslint/no-explicit-any is off repo-wide — see eslint.config.mjs.)
  result: any;
  verapdfUrl?: string;
  wcagVersion: string;
}>();

const open = defineModel<boolean>("open", { default: false });

// "Word" | "PowerPoint" | "Excel" when the audited file is an editable Office
// source document; null for PDF — mirrors ScoreCard.vue's sourceApp computed
// exactly, since the audit-scope caveat above reuses that component's copy.
const sourceApp = computed<string | null>(() => {
  switch (props.result?.fileType) {
    case "docx":
      return "Word";
    case "pptx":
      return "PowerPoint";
    case "xlsx":
      return "Excel";
    default:
      return null;
  }
});

// `result` is deliberately `any`, so vue-tsc can't narrow the notAssessed
// array inside a template v-for — its loop index unifies to `string |
// number`, which breaks the `i < length - 1` comparison used for the comma
// separator. Give the template an explicitly typed list instead.
const notAssessedList = computed(
  () =>
    (props.result?.conformance?.notAssessed ?? []) as {
      sc: string;
      name: string;
      url: string;
    }[],
);
</script>
