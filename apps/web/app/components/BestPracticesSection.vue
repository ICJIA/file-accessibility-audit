<!-- apps/web/app/components/BestPracticesSection.vue
     The Best Practices scorecard — the surface for the catalog built in
     Tasks 2-6 (~/utils/bestPractices). Renders one row per practice that
     applies to this document's format, already evaluated. Sits directly
     above ActionPlan's own "Above and beyond" group and shares its sky
     visual language on purpose (the icon, the card border/background):
     same doctrine, same tier, same non-obligation, read as a sibling. Its
     own "BEST PRACTICE — NOT SCORED" chip was dropped (fix round 1) as a
     duplicate of what the h2 below already says.

     NOTHING HERE IS SCORED, and NOT MET reads as WORTH DOING, never a
     failure — see ~/utils/bestPractices/types.ts's own doctrine comment.
     Two catalog facts drive the copy below rather than a fifth status:

       - CORRECTED (fix round 3, audit sweep): the original design brief
         claimed three practices (docx-layout-grids, xlsx-pivot-tables,
         xlsx-merged-cells) can never reach MET. Read directly: all three
         have live, reachable MET branches and correctly report it on a
         clean document — that claim was never true of the actual catalog
         code. It never had to be, either: this component renders
         fix.source/fix.app generically for any NOT MET row regardless, so
         whatever nuance one practice's fix carries — a real structural
         action, or (xlsx-pivot-tables) "No structural fix applies… review
         manually" — already comes through from the catalog text itself,
         with nothing hardcoded by id.
       - Four practices (heading-content, single-h1, character-mapping,
         content-in-tag-tree) have no MET branch in the catalog at all — the
         analyzer only speaks up when something looks wrong, so a flawless
         document lands them on NOT CHECKED. Exactly four: list-labels does
         reach MET, but it gets there by reading the analyzer's PER-LIST
         detail lines and requiring every one to show "<Lbl> ✓" (pdf.ts,
         off supplementary.ts:198) — not by treating a top-level census
         line plus the absence of an advisory as a pass, which was tried
         and proved unsound (task-7-report.md, fix round 3). The
         empirically-verified flawless-PDF split is pinned by the "headline
         invariant" test, not restated here. NEVER a "N of 19" fraction
         anywhere — a denominator beside a status is read as a grade in
         this product.
       - A NOT CHECKED row is not one thing: `result.reason` (types.ts)
         tells "silent" (the check ran, found nothing to say — the analyzer
         genuinely only speaks up on trouble) from "not-run" (the category
         itself is absent from this report, so the check never ran at all —
         there was no silence to interpret). Conflating the two told a
         reader "silence is fine" on a row that was never examined; the two
         reassurance strings below must never merge back into one.

     Self-hides entirely when evaluateBestPractices() returns nothing (a
     page-audit row with no categories, an unrecognized format, or a
     forged/corrupted stored report — /report/[id] renders attacker-
     controlled stored JSON, so nothing below may throw). -->
<template>
  <section
    v-if="rows.length || waitingLine"
    data-testid="best-practices"
    class="rounded-2xl border-2 border-sky-500/40 bg-sky-500/5 px-5 sm:px-6 py-5"
    aria-labelledby="best-practices-title"
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span aria-hidden="true" class="text-2xl leading-none text-sky-400">○</span>
      <h2
        id="best-practices-title"
        class="text-lg sm:text-xl font-bold text-[var(--text-heading)] m-0"
      >
        Best practices — not scored
      </h2>
    </div>

    <!-- Deliberately NOT the beyond-group's own intro (ActionPlan.vue) —
         that block sits inches below this one on the page and opens with
         near the same sentence. This paragraph says what THIS section adds
         instead of restating that framing.

         CORRECTED (fix round 3): the first draft said "was checked against
         this document" — a universal claim sitting directly above a NOT
         CHECKED chip and rows admitting a check has no data at all
         (row.reason === "not-run"). Say what is structurally true of every
         row (it carries a status and this document's own evidence, whatever
         that status is) rather than a claim about what happened. -->
    <p class="text-sm text-[var(--text-muted)] mt-2.5 leading-relaxed">
      Each practice below carries its own status and this document's own evidence.
      <strong class="font-semibold text-[var(--text-secondary)]"
        >None of this affected your grade.</strong
      >
    </p>

    <!-- Counts come from the rendered rows, never a literal. -->
    <div class="mt-3.5 flex flex-wrap gap-2" data-testid="best-practices-summary">
      <span
        v-for="chip in summaryChips"
        :key="chip.key"
        class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-[var(--text-secondary)]"
      >
        <span class="text-sky-400 font-bold">{{ chip.count }}</span> {{ chip.label }}
      </span>
    </div>

    <!-- The rows the extra-credit filter hid, COUNTED (2026-09-02). "0 worth
         doing · 1 met" on a 43/F untagged brief read as a nearly clean bill;
         six rows were blocked by the scored heading failure and ten more
         could not be judged until the document is tagged. The rows stay
         hidden; the count is owed. Absent when nothing is blocked. -->
    <p
      v-if="waitingLine"
      data-testid="best-practices-waiting"
      class="mt-3 text-sm text-[var(--text-muted)] leading-relaxed"
    >
      {{ waitingLine }}
    </p>

    <ul class="mt-4 space-y-2 list-none p-0 m-0">
      <li
        v-for="row in rows"
        :key="row.practice.id"
        :data-practice="row.practice.id"
        :data-status="row.status"
        class="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-deep)]"
      >
        <!-- The header button and the "why not checked?" control are SIBLINGS,
             never nested: a <button> inside a <button> is invalid HTML and
             browsers recover from it unpredictably. -->
        <div class="flex items-center">
          <button
            type="button"
            class="bp-row-header flex-1 min-w-0 flex items-center gap-2 text-left px-3 py-2.5 cursor-pointer"
            :aria-expanded="open.has(row.practice.id) ? 'true' : 'false'"
            :aria-controls="`bp-body-${row.practice.id}`"
            @click="toggle(row.practice.id)"
          >
            <span aria-hidden="true" class="flex-shrink-0" :class="statusIconClass(row.status)">{{
              statusIcon(row.status)
            }}</span>
            <span class="flex-1 text-sm font-semibold text-[var(--text-heading)]">{{
              row.practice.label
            }}</span>
            <span
              class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap border"
              :class="statusPillClass(row.status)"
              >{{ statusLabel(row.status) }}</span
            >
            <span
              class="text-xs text-[var(--link)] whitespace-nowrap w-[72px] text-right flex-shrink-0"
              data-export-exclude
              >{{ open.has(row.practice.id) ? "Hide" : "Show" }}</span
            >
          </button>
        </div>

        <div
          v-show="open.has(row.practice.id)"
          :id="`bp-body-${row.practice.id}`"
          class="bp-body px-3 pb-3 space-y-2"
        >
          <!-- What this is / Your document / Why it matters / Does this affect
               my grade? / How to fix / Read more — in that order. The evidence
               block is a REAL <pre>: prettier reflows a whitespace-pre div,
               which collapsed 12 blocks in this repo before (v1.53.0). -->
          <div>
            <p
              class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide m-0"
            >
              What this is
            </p>
            <p class="text-sm text-[var(--text-secondary)] mt-1">{{ row.practice.description }}</p>
          </div>

          <div>
            <p
              class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide m-0"
            >
              Your document
            </p>
            <ul v-if="row.evidence.length" class="mt-1 space-y-1 list-none p-0 m-0">
              <li
                v-for="(line, i) in row.evidence"
                :key="i"
                class="text-sm text-[var(--text-secondary)] flex gap-2"
              >
                <span aria-hidden="true" class="flex-shrink-0 text-[var(--text-muted)]">•</span>
                <span>{{ line }}</span>
              </li>
            </ul>
            <!-- Two DIFFERENT reasons look identical from the outside, so
                 they get two different sentences (row.reason, types.ts):
                 "silent" is the check running and finding nothing to flag —
                 reassuring, because staying quiet is how this catalog
                 reports "fine". "not-run" is the category being absent from
                 this report — there was no silence to interpret, and saying
                 otherwise would contradict this feature's own "silence is
                 never a pass" doctrine one line under the evidence that
                 proves it. "error" (detect() threw, caught by
                 evaluateBestPractices) gets NEITHER — its own evidence
                 sentence already says the check could not complete. -->
            <p
              v-if="row.status === 'not-checked' && (!row.reason || row.reason === 'silent')"
              class="text-sm text-[var(--text-secondary)] mt-1.5"
            >
              This checker did not confirm this one either way — it only speaks up when something
              looks wrong, so staying silent here is not a sign of trouble. A person can typically
              confirm it in a minute.
            </p>
            <p
              v-else-if="row.status === 'not-checked' && row.reason === 'not-run'"
              class="text-sm text-[var(--text-secondary)] mt-1.5"
            >
              This report has no data for this check on this document, so it was not looked at
              either way.
            </p>
            <p v-if="row.block" class="text-[11px] text-[var(--text-muted)] mt-2 mb-1">
              {{ row.block.caption }}
            </p>
            <pre
              v-if="row.block"
              class="text-xs font-mono text-[var(--text-secondary)] bg-[var(--surface-raised)] rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap"
              >{{ row.block.lines.join("\n") }}</pre>
          </div>

          <div>
            <p
              class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide m-0"
            >
              Why it matters
            </p>
            <p class="text-sm text-[var(--text-secondary)] mt-1">{{ row.practice.why }}</p>
          </div>

          <!-- NOT rendered on a NOT APPLICABLE row (2026-08-31 WCAG audit).
               Today's scored-band diverts land here with evidence reading
               "That is counted in your score — see the action plan above";
               an unconditional "No, this is optional" printed two blocks
               below that contradicted the row and undid the divert. For a
               genuine N/A ("this document has no tables") the question does
               not arise either.
               "Optional" is also gone from the answer that remains: it is a
               claim about the LAW, and this catalog holds practices the law
               does reach — vague link text is WCAG 2.4.4 Level A, unscored
               only because the surrounding sentence is not machine-readable.
               What is true of every remaining row is the SCORE claim. -->
          <div v-if="row.status !== 'not-applicable'">
            <p
              class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide m-0"
            >
              Does this affect my grade?
            </p>
            <p class="text-sm text-[var(--text-secondary)] mt-1">
              No — this practice does not change your score.
            </p>
          </div>

          <div v-if="row.fix">
            <p
              class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide m-0"
            >
              How to fix
            </p>
            <p class="text-sm text-[var(--text-secondary)] mt-1">
              <span class="font-semibold text-[var(--text-heading)]">{{
                sourceFixLabel(row.practice)
              }}</span
              >{{ " " }}{{ row.fix.source }}
            </p>
            <!-- PDF: a second labelled route — Office documents have no
                 exported-file editing tool, so OFFICE_FIX_APP (office.ts) is
                 a re-export reminder, not a second route, and a heading
                 above it once contradicted its own sentence ("fixed at the
                 source, not after export"). Same information, no heading. -->
            <p
              v-if="isPdfPractice(row.practice)"
              class="text-sm text-[var(--text-secondary)] mt-1.5"
            >
              <span class="font-semibold text-[var(--text-heading)]"
                >In the exported PDF (Acrobat):</span
              >{{ " " }}{{ row.fix.app }}
            </p>
            <p v-else class="text-xs text-[var(--text-muted)] mt-1.5">{{ row.fix.app }}</p>
          </div>

          <!-- standard and links are independent facts about the practice —
               a practice can carry a citation with no links (display-doc-title:
               "PDF/UA (ISO 14289) clause 7.1", links: []), so each is its own
               guard rather than the citation nesting inside the links check. -->
          <div v-if="row.practice.standard || row.links.length">
            <p
              class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide m-0"
            >
              Read more
            </p>
            <p
              v-if="row.practice.standard"
              class="text-[11px] text-[var(--text-muted)] mt-1 mb-1.5"
            >
              {{ row.practice.standard }}
            </p>
            <ul v-if="row.links.length" class="mt-1 space-y-1 list-none p-0 m-0">
              <li v-for="link in row.links" :key="link.label + '|' + link.url" class="text-sm">
                <a
                  :href="link.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-[var(--link)] underline break-words"
                  >{{ link.label }}</a
                >
              </li>
            </ul>
          </div>
        </div>
      </li>
    </ul>

    <div v-if="otherNotes.length" data-testid="best-practices-other-notes" class="mt-5">
      <p class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide m-0">
        Also noted in this report
      </p>
      <p class="text-xs text-[var(--text-muted)] mt-1">
        Advisories the analyzer raised that none of the practices above covers — its own words.
      </p>
      <ul class="mt-2 space-y-1.5 list-none p-0 m-0">
        <li v-for="(n, i) in otherNotes" :key="`note-${i}`" class="text-xs flex gap-2">
          <span aria-hidden="true" class="flex-shrink-0 mt-0.5 text-sky-400">○</span>
          <span class="text-[var(--text-secondary)]"
            ><span class="font-semibold">{{ n.label }}: </span>{{ n.text }}</span
          >
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  evaluateBestPractices,
  bestPracticeBacklog,
  backlogSentence,
  sortBestPractices,
  summarizeBestPractices,
  uncoveredNotScored,
} from "~/utils/bestPractices";
import type {
  BestPractice,
  BestPracticeLink,
  BestPracticeStatus,
  EvaluatedPractice,
} from "~/utils/bestPractices";
import { resolveRowLinks } from "~/utils/bestPractices/links";
import { useWcag } from "~/composables/useWcag";

const props = defineProps<{ result: unknown; analyzedAt?: string | null }>();

// Version-aware WCAG Understanding links are resolved once here, not in the
// catalog — the base URL lives in runtime config behind useWcag(), which a
// module-scope array cannot call.
const wcag = useWcag();

/** A row plus its fully-resolved link list, computed once per row per
 *  re-evaluation rather than twice per render from the template (once for
 *  the "is there anything to show" guard, once for the v-for) — each call
 *  re-parses every URL through safeHttpUrl, so doing it here instead of
 *  inline also removes a template-only path where the "Read more" guard
 *  and the list it guards could independently drift apart. */
interface DisplayRow extends EvaluatedPractice {
  links: BestPracticeLink[];
}

// NOT MET first (the actionable ones), then MET, then NOT APPLICABLE, then
// NOT CHECKED last — sortBestPractices (bestPractices/index.ts) is the ONE
// place this order is defined; the printable plan calls it too, so the two
// surfaces cannot drift apart on the same document.
const rows = computed<DisplayRow[]>(() =>
  sortBestPractices(
    evaluateBestPractices(props.result, undefined, { analyzedAt: props.analyzedAt }),
  ).map((r) => ({
    ...r,
    links: resolveRowLinks(r, wcag.understandingUrl),
  })),
);

const summary = computed(() => summarizeBestPractices(rows.value));

const waitingLine = computed(() =>
  backlogSentence(bestPracticeBacklog(props.result, undefined, { analyzedAt: props.analyzedAt })),
);

/** Not-scored lines from categories no practice covers (the static-XFA
 *  caveat lives in form_accessibility). The plan's beyond group used to list
 *  every such line; narrowing it to veraPDF alone dropped them from the
 *  Visual view. Shown verbatim — the analyzer's words, not a verdict. */
const otherNotes = computed(() => uncoveredNotScored(props.result));

/** What the ⓘ beside a NOT CHECKED pill says. Keyed on the SAME `reason`
 *  field the body copy branches on, so the two can never drift apart, and
 *  every branch opens by absolving the document — that is the whole point of
 *  the control. Kept to one or two sentences: it is a tooltip, and the row
 *  body carries the long form. */

// No "N of 19" fraction anywhere — a denominator beside a status is read as
// a grade in this product. Each chip stands alone. "worth doing" mirrors the
// row pill's own wording rather than "not met", which would contradict it.
const summaryChips = computed(() => [
  { key: "not-met", count: summary.value.notMet, label: "worth doing" },
  { key: "met", count: summary.value.met, label: "met" },
]);

// Independent open state per row — unlike the plan's exclusive accordion, a
// reader comparing two practices should be able to hold both open at once.
const open = ref<Set<string>>(new Set());
function toggle(id: string): void {
  const next = new Set(open.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  open.value = next;
}

const STATUS_ICON: Record<BestPracticeStatus, string> = {
  met: "✓",
  "not-met": "○",
  "not-applicable": "—",
  "not-checked": "?",
};
// Sky for NOT MET (never red/amber — nothing here is a failure), emerald for
// MET (this codebase's established "pass" colour — MatterhornReportPanel,
// PdfUaVerdict, ReportContent all agree), muted for NOT APPLICABLE, amber
// for NOT CHECKED (a neutral "unknown" tone, not a warning about the
// document itself).
const STATUS_ICON_CLASS: Record<BestPracticeStatus, string> = {
  met: "text-emerald-400",
  "not-met": "text-sky-400",
  "not-applicable": "text-[var(--text-muted)]",
  "not-checked": "text-amber-400",
};
const STATUS_LABEL: Record<BestPracticeStatus, string> = {
  met: "MET",
  "not-met": "WORTH DOING",
  "not-applicable": "NOT APPLICABLE",
  "not-checked": "NOT CHECKED",
};
const STATUS_PILL_CLASS: Record<BestPracticeStatus, string> = {
  met: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  "not-met": "border-sky-500/40 bg-sky-500/10 text-sky-400",
  "not-applicable":
    "border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-muted)]",
  "not-checked": "border-amber-500/40 bg-amber-500/10 text-amber-400",
};
// A NOT APPLICABLE row means one of two opposite things, and until v1.148.0
// both wore the same muted chip. "absent" is the honest one: there are no
// links, no tables — nothing of this kind exists and nothing was lost.
// "scored" is the reverse: the practice DOES apply, the document fails it,
// and it already cost points, so the row defers to the action plan instead of
// repeating it. A file with no headings at all showed five NOT APPLICABLE
// chips above a heading category scoring 0/Critical with WCAG 1.3.1 failing —
// which reads, reasonably, as "headings are irrelevant to my document".
//
// Back to a plain lookup (v1.148.1). Two extra labels were tried in one
// afternoon and both misled — see bestPractices/index.ts. A row whose defect
// is scored is no longer in this section at all, and a row that merely could
// not be judged is NOT CHECKED, which the vocabulary already covers.
function statusIcon(status: BestPracticeStatus): string {
  return STATUS_ICON[status];
}
function statusIconClass(status: BestPracticeStatus): string {
  return STATUS_ICON_CLASS[status];
}
function statusLabel(status: BestPracticeStatus): string {
  return STATUS_LABEL[status];
}
function statusPillClass(status: BestPracticeStatus): string {
  return STATUS_PILL_CLASS[status];
}

// Each catalog practice belongs to exactly one format family (pdf, or one of
// docx/pptx/xlsx) — never both — so this single check is enough to pick the
// right fix-route labels. PDF has a real second tool (Acrobat editing the
// exported file); Office documents do not, so their fix.app is a re-export
// reminder rather than a second labelled route — see the template.
function isPdfPractice(practice: BestPractice): boolean {
  return practice.formats.includes("pdf");
}
function sourceFixLabel(practice: BestPractice): string {
  return isPdfPractice(practice)
    ? "In the source file (Word, InDesign):"
    : "In the source file (Word, PowerPoint, Excel):";
}
</script>
