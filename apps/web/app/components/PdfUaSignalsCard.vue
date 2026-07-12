<template>
  <section
    data-testid="pdfua-signals-card"
    class="rounded-2xl border-2 border-teal-500/30 bg-teal-500/[0.04] px-4 py-4 sm:px-6 sm:py-5 shadow-sm text-left"
  >
    <!-- Header -->
    <header>
      <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-300">
        Conformance signals · beyond the WCAG score
      </p>
      <h2 class="mt-1 text-lg sm:text-xl font-semibold text-[var(--text-heading)]">
        PDF/UA-1 signals (ISO 14289-1)
      </h2>
      <p class="mt-1 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
        The machine-checkable PDF/UA-1 markers this audit can read directly from the file. These are
        <strong>signals, not a conformance verdict</strong> — a formal PDF/UA-1 validation needs PAC
        or veraPDF (see below).
      </p>
    </header>

    <!-- Signal grid -->
    <ul class="mt-4 grid gap-2 sm:grid-cols-2" role="list" data-testid="pdfua-signal-list">
      <li
        v-for="s in signals"
        :key="s.label"
        class="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
      >
        <span
          class="mt-px shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
          :class="toneClass(s.tone)"
          aria-hidden="true"
          >{{ toneIcon(s.tone) }}</span
        >
        <span class="min-w-0">
          <span class="block text-xs sm:text-sm font-medium text-[var(--text-heading)]">{{
            s.label
          }}</span>
          <span class="block text-[11px] sm:text-xs text-[var(--text-secondary)]">{{
            s.value
          }}</span>
        </span>
      </li>
    </ul>

    <!-- PAC / veraPDF / Matterhorn explainer -->
    <div
      class="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 sm:px-5 sm:py-4 text-sky-100"
      role="note"
      aria-label="How to get a formal PDF/UA-1 verdict"
    >
      <p class="text-[11px] font-semibold uppercase tracking-[0.14em]">
        For a formal PDF/UA-1 verdict, run PAC or veraPDF
      </p>
      <p class="mt-2 text-xs sm:text-sm leading-relaxed">
        This tool scores against WCAG and reports the signals above; it does
        <strong>not</strong> run the full PDF/UA-1 conformance test.
        <a
          href="https://pdfua.foundation/en/pac-download/"
          target="_blank"
          rel="noopener noreferrer"
          class="underline decoration-dotted underline-offset-2 hover:text-sky-50"
          >PAC</a
        >
        (free) and
        <a
          href="https://verapdf.org/"
          target="_blank"
          rel="noopener noreferrer"
          class="underline decoration-dotted underline-offset-2 hover:text-sky-50"
          >veraPDF</a
        >
        (<code class="font-mono">verapdf --flavour ua1</code>) check the full
        <strong>Matterhorn Protocol</strong> (31 checkpoints / 136 failure conditions) — including
        things only they or a human reviewer can confirm:
      </p>
      <ul class="mt-2 ml-4 list-disc text-xs sm:text-sm leading-relaxed space-y-1">
        <li>
          <strong>Reading-order correctness</strong> — this tool estimates tag vs. visual order; PAC
          surfaces it for human confirmation.
        </li>
        <li>
          Whether each heading, list, and table relationship is
          <strong>semantically correct</strong>, not merely present.
        </li>
        <li>
          That <strong>all</strong> real content is tagged and all decoration is artifacted — no
          stray untagged content anywhere.
        </li>
        <li>
          Role-map validity, nested-structure rules, and the remaining Matterhorn conditions that
          require human judgment.
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";

type Tone = "good" | "warn" | "bad" | "info";

interface PdfUaSignals {
  hasIdentifier: boolean;
  part: string | null;
  isTagged: boolean;
  isMarkedContent: boolean;
  artifactRunCount: number;
  structTreeDepth: number;
  fontCount: number;
  embeddedFontCount: number;
  allFontsEmbedded: boolean;
  hasLanguage: boolean;
  hasTitle: boolean;
}

const props = defineProps<{ signals: PdfUaSignals }>();

interface SignalRow {
  label: string;
  value: string;
  tone: Tone;
}

const signals = computed<SignalRow[]>(() => {
  const s = props.signals;
  const rows: SignalRow[] = [
    {
      label: "PDF/UA-1 identifier",
      value: s.hasIdentifier ? `Declared — Part ${s.part ?? "1"}` : "Not declared in XMP metadata",
      tone: s.hasIdentifier ? "good" : "warn",
    },
    {
      label: "Tagged (logical structure)",
      value: s.isTagged ? "StructTreeRoot present" : "No structure tree",
      tone: s.isTagged ? "good" : "bad",
    },
    {
      label: "Marked content",
      value: s.isMarkedContent
        ? "Real content distinguished from artifacts"
        : "MarkInfo /Marked not set",
      tone: s.isMarkedContent ? "good" : "warn",
    },
    {
      label: "Artifacts tagged",
      value:
        s.artifactRunCount > 0
          ? `${s.artifactRunCount} artifact run${s.artifactRunCount === 1 ? "" : "s"} in the content stream`
          : "None detected",
      tone: s.artifactRunCount > 0 ? "good" : "info",
    },
    {
      label: "Fonts embedded",
      value:
        s.fontCount === 0
          ? "No fonts in document"
          : `${s.embeddedFontCount} of ${s.fontCount} embedded`,
      tone: s.fontCount === 0 ? "info" : s.allFontsEmbedded ? "good" : "warn",
    },
    {
      label: "Structure depth",
      value: `${s.structTreeDepth} level${s.structTreeDepth === 1 ? "" : "s"}`,
      tone: s.structTreeDepth >= 2 ? "good" : "warn",
    },
    {
      label: "Document language",
      value: s.hasLanguage ? "Declared" : "Missing",
      tone: s.hasLanguage ? "good" : "bad",
    },
    {
      label: "Document title",
      value: s.hasTitle ? "Present" : "Missing",
      tone: s.hasTitle ? "good" : "warn",
    },
  ];
  return rows;
});

function toneIcon(tone: Tone): string {
  switch (tone) {
    case "good":
      return "✓";
    case "warn":
      return "!";
    case "bad":
      return "✕";
    case "info":
      return "·";
  }
}

function toneClass(tone: Tone): string {
  switch (tone) {
    case "good":
      return "bg-emerald-500/15 text-emerald-300 border border-emerald-400/30";
    case "warn":
      return "bg-amber-500/15 text-amber-300 border border-amber-400/30";
    case "bad":
      return "bg-rose-500/15 text-rose-300 border border-rose-400/30";
    case "info":
      return "bg-slate-500/15 text-slate-300 border border-slate-400/30";
  }
}
</script>
