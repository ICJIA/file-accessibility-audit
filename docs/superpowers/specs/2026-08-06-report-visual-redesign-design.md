# Report Visual Redesign — Design Spec

**Date:** 2026-08-06
**Status:** Approved by user (visual companion session, `.superpowers/brainstorm/62105-1786040785/`)
**Rollback point:** git tag `pre-report-redesign` (pushed to origin)

## Problem

Users report that audit results return so much information per file that they cannot
tell where to start remediation. Root causes found in the current UI:

1. **Each issue appears up to 3 times** — in the WCAG conformance panel (inside
   `ScoreCard.vue`), in "Issues to fix" (`IssuesSummary.vue`), and in "Detailed
   Findings" (`ReportContent.vue`) — with different wording each time. No listing is
   authoritative.
2. **No ordered path.** Severity sorting exists but nothing says "do this first."
   Fix steps hide behind collapsed rows.
3. **Everything is prose lists.** The only visual element is the grade circle; there
   is no hierarchy separating "act on this" from reference material.

The shared report page (`report/[id].vue`), the live result (`index.vue`), and the
HTML export (live-DOM snapshot) all render the same component subtree, so one
redesign fixes all three surfaces.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Audience | Non-technical document authors (state/local gov staff). Plain language first; source-document fixes before Acrobat surgery. |
| "Where do I start" model | Numbered Action Plan, ordered by severity. |
| Duplication | One home per fact. Everything technical collapses behind a single "Full technical report" expander. |
| Header treatment | Big centered grade circle (current style, unchanged) **first**, severity stat tiles beneath it as the explanation row. Category score table replaced by labeled horizontal bars. |
| Action Plan layout | Vertical timeline rail; step 1 auto-expanded, others behind "Show how". |
| Progress checkboxes | None. Re-uploading the fixed file is the progress check. |
| Content source | Web-side mapper (`utils/actionPlan.ts`), dictionary keyed by category id. No analyzer/API/DB changes. Old stored shared reports get the new UI for free. |
| Escape hatch (added mid-plan by user) | A **Visual / Detailed view toggle** in the upper right of the report on BOTH surfaces (live result and shared report). Visual = the new design and the default; Detailed = today's report, kept intact. Preference persists per device (localStorage); shared-report recipients are mostly non-technical, so Visual-by-default is right there too. |

## View toggle and data parity (governing rule)

Both surfaces render one of two views, switched by a small segmented control in
the upper right of the report (next to the shared page's color-mode toggle;
top-right of the results block on the live page):

- **Visual view (default)** — the new layout below. Aimed at non-technical
  readers; less intimidating, infographic-style.
- **Detailed view** — today's report, byte-for-byte the same component stack as
  currently shipped (`ScoreCard`, `ReportActionBanner`, `IssuesSummary`,
  PDF/UA panels, `MethodologyCard`, `ReportContent`). Nothing about it changes.

**Data parity is a hard requirement: every fact visible in Detailed view is
visible (possibly behind the technical expander) in Visual view, and vice
versa.** The two differ only in layout and emphasis. Concretely this means the
category bars carry score AND grade AND severity per row (full score-table
parity, including the N/A explanations), the conformance block inside the
technical expander keeps the failing-criteria links, the not-assessed list, and
the standards-basis text, and `SourceDocumentNotice` (live page) renders in both
views.

Preference persists in `localStorage` (`far:report-view`); default is `visual`
on both surfaces (shared-report recipients are mostly non-technical). SSR
renders the default; the stored preference applies on mount (brief flicker for
detailed-preference users is accepted). The toggle carries
`data-export-exclude`; the HTML export snapshots whichever view is active.
The `pre-report-redesign` git tag remains the hard rollback; the toggle is the
soft, always-available one.

## Page composition — Visual view (top to bottom)

1. **File banner** — `ReportFileBanner`, unchanged.
2. **Grade hero** — the current big centered grade circle + `score/100` +
   plain-English grade label extended with a verdict ("Poor — not ready to
   publish"). Visually identical scale to today's circle. Verdict phrase =
   `gradeLabel(grade)` + a publication clause derived from the severity tally
   (absorbing today's `ReportActionBanner` copy logic): critical > 0 → "not ready
   to publish"; moderate only → "fix recommended before publishing"; minor only /
   none → "ready to publish".
3. **Severity tiles** — three stat tiles (icon + count + label): ⛔ Critical,
   ⚠ Moderate, ⓘ Minor. Never color alone. On a clean pass all tiles show 0 in
   muted styling.
4. **Legal verdict strip** — one line: "✗ Does not yet meet WCAG 2.2 AA
   (IITAA 2.1 / ADA Title II) · N criteria failing — details ↓" linking into the
   technical report. Green variant when no automated failures. Replaces the tall
   conformance panel currently rendered inside ScoreCard; the full failing-criteria
   list (with W3C links) moves into the technical report section.
5. **Alert strips** (conditional): scanned-document warning and `warnings[]`, styled
   as today, directly above the Action Plan.
6. **Action Plan (the hero)** — timeline rail:
   - Steps ordered Critical → Moderate → Minor (stable sort; ties keep category
     order as emitted by the analyzer).
   - Step 1 auto-expanded; the rest show title + severity chip + "Show how ▾".
   - Each expanded step: plain-language imperative title, one-line "why it
     matters", WCAG criterion chip(s), and a fix-routes box:
     - **PDF:** route A "📝 Easiest — in Word/PowerPoint (source)", route B
       "🔧 No source file? In Acrobat" (reuses the analyzer's per-report Acrobat
       steps when present, else dictionary default).
     - **DOCX/PPTX/XLSX:** single route — fix in the authoring app (the upload *is*
       the source).
   - "Evidence & technical detail ↓" link jumps to the category's card inside the
     technical report.
   - Clean pass: the rail is replaced by a green "Nothing to fix — this document
     passes" card, which keeps the "not evaluated automatically" manual-review
     reminder.
7. **Category bars** — "Where the score comes from": one row per scored category
   with label, grade-colored horizontal bar, numeric score, grade letter badge,
   and severity chip (`aria-label` carries the full sentence). Full data parity
   with the Detailed view's Category Scores table. N/A categories listed beneath
   in muted text with their reason (reusing `naReason`). Replaces the table in
   the Visual view only.
8. **Full technical report** — ONE expander (real `<button aria-expanded>`,
   closed by default, body `v-show` + `.tech-report-body` class so print CSS can
   force it visible) containing, in order:
   - the full WCAG conformance block (failing criteria with W3C links,
     not-assessed list, standards-basis text — parity with today's ScoreCard
     panel),
   - `ReportContent` with a new `showScoreTable: false` prop (Document Metadata
     panel + Detailed Findings cards with evidence, technical-signals toggle,
     per-category Acrobat guide, WCAG references, help links — all unchanged),
   - PDF/UA signals card + veraPDF verdict,
   - `MethodologyCard`.
   Content unchanged — relocated, not rewritten.
9. **Downloads + CTA + footer** — unchanged.

Blocking-before-informational ordering is preserved (PDF/UA panels stay below the
plan, now inside the expander). `reportSectionOrder.test.ts` updates to pin the new
order.

## Components

**New**
- `composables/useReportView.ts` — `{ mode: Ref<"visual"|"detailed">, setMode }`,
  localStorage-backed, SSR-safe (default `visual` server-side).
- `ReportViewToggle.vue` — segmented Visual/Detailed control, upper right,
  `data-export-exclude`.
- `ReportGradeHero.vue` — grade circle + score + verdict label (zone 2).
- `SeverityTiles.vue` — zone 3.
- `VerdictStrip.vue` — zone 4 (props: conformance verdict, wcag version).
- `ActionPlan.vue` — zone 6 (rail, expand state, `aria-expanded` toggles so the
  export snapshot auto-expands; step bodies `v-show` + `.plan-step-body` for
  print).
- `CategoryBars.vue` — zone 7 (score + grade + severity per row).
- `TechnicalReport.vue` — zone 8 wrapper (expander + conformance block +
  embedded ReportContent + PDF/UA components + methodology).
- `ReportVisualView.vue` — assembles zones 2–8 so both pages stay thin.
- `utils/actionPlan.ts` — pure mapper + dictionary (below) + `verdictPhrase`.

**Changed**
- `pages/report/[id].vue` and `pages/index.vue` (results block): add the toggle
  and render `ReportVisualView` when mode is `visual`, today's exact stack when
  `detailed`. Template blocks delimited by `<!-- VISUAL VIEW -->` /
  `<!-- DETAILED VIEW -->` comment markers (the section-order test slices on
  them). `data-report-content` wrapper stays around both.
- `ReportContent.vue` — gains one additive prop `showScoreTable` (default
  `true`; Detailed view unchanged). `false` hides only the score-table block for
  the Visual view's embedding (bars carry that data there).
- `utils/exportFormats/html.ts` (`buildHtml`) — rebuilt to mirror the Visual
  view's order with everything expanded (static file). Content set unchanged
  (keeps executive summary, score profiles, full findings).
- Print CSS — force `.tech-report-body` and `.plan-step-body` visible, preserve
  tile/bar colors (`print-color-adjust: exact`), avoid page breaks inside plan
  steps.

**Kept (Detailed view, unchanged)**
- `ScoreCard.vue` (also still used by remediation before/after cards),
  `ReportActionBanner.vue`, `IssuesSummary.vue` — no changes, no deletions.

**Untouched**
- Analyzer, API, DB, markdown/text/JSON/AI exports.

## Data flow: `utils/actionPlan.ts`

```ts
interface FixRoute { tool: "word" | "powerpoint" | "excel" | "acrobat"; label: string; steps: string[] }
interface PlanStep {
  rank: number;            // 1-based, after severity sort
  categoryId: string;
  title: string;           // imperative, plain language
  why: string;             // one sentence, no jargon
  severity: "Critical" | "Moderate" | "Minor";
  wcagRefs: { sc: string; name: string }[];   // from WCAG_CATEGORY_MAP
  routes: FixRoute[];      // 2 for PDF (source + acrobat), 1 for OOXML
  detailAnchor: string;    // `#cat-${categoryId}` inside TechnicalReport
}
buildActionPlan(categories, fileType): PlanStep[]
```

- Input filter: categories with severity Critical/Moderate/Minor (same filter as
  today's IssuesSummary).
- Dictionary keyed by category id (~14 ids: `text_extractability`,
  `title_language`, `heading_structure`, `alt_text`, `bookmarks`, `table_markup`,
  `link_quality`, `reading_order`, `form_accessibility`, `color_contrast`,
  `list_structure`, `slide_titles`, `sheet_names`, plus any found during
  implementation — enumerated from the analyzer source, pinned by test). Entries
  provide title/why/routes per file type.
- Acrobat route preference: if the category's findings carry an
  `--- Adobe Acrobat: How to Fix ---` block (via `partitionCardFindings`), use
  those steps verbatim (they're per-document specific); else dictionary default.
- **Unknown category id fallback:** title = category label, why = first actionable
  finding (`firstActionableFinding`), routes = whatever Acrobat block exists.
  Never blank, never a throw. Same array guards as `partitionCardFindings`
  (stored reports are attacker-controllable).

## Accessibility of the new UI itself

- Tiles and severity chips: icon + text label + count — never color alone.
- Bars: each row `role="img"`-free plain markup with an `aria-label` ("Document
  tags: 0 out of 100, grade F"); the full per-category data remains available as
  text inside the technical report (table-equivalent).
- Rail toggles and the technical expander: real `<button aria-expanded>` — this
  also makes the existing export-snapshot expand-all work unchanged.
- Focus states per existing `:focus-visible` conventions; "Evidence" links move
  focus to the target card.
- Both color modes styled (shared page has a light/dark toggle); severity/grade
  hexes keep AA contrast on both surfaces — verify with the contrastcap MCP during
  implementation.

## Edge cases

- **Clean pass:** zeros in muted tiles, green verdict strip, green "nothing to fix"
  card (with manual-review reminder), bars all green, technical report still
  available.
- **Scanned PDF:** existing orange callout above the plan; OCR is naturally step 1.
- **Old stored shared reports (pre-v1.21 profiles, missing fileType, etc.):**
  mapper needs only `id`/`label`/`severity`/`findings`; missing fileType → treat as
  PDF (matches current metadata-panel fallback behavior).
- **Forged stored reports:** all new code array-guards its inputs (non-array
  `categories`/`findings` render as empty, not 500) — same standard as
  `partitionCardFindings`.
- **URL page-audit reports (`/api/audit-url-page`, fleet pipeline):** stored in
  the same `shared_reports` table but carry axe results and **no
  `categories[]`**. The Visual view must not read "no categories" as "passes":
  when `categories` is missing/empty, render the grade hero WITHOUT the
  publication clause and hide SeverityTiles, ActionPlan (including the green
  pass card), CategoryBars, and TechnicalReport — mirroring how the Detailed
  view's conditional components already self-hide for these reports. The green
  pass card requires a non-empty categories array that simply contains no
  Critical/Moderate/Minor entries.

## Testing

- `actionPlan.test.ts`: every enumerated category id has a dictionary entry;
  ordering; PDF two-route vs OOXML one-route; Acrobat-block preference; unknown-id
  fallback; malformed-input guards; clean-pass empty plan.
- Component tests: rail expand/collapse + `aria-expanded`; step-1 auto-open;
  `data-export-exclude` on interactive controls; technical expander contains
  findings/PDF-UA/methodology/metadata; tiles render zeros muted.
- `reportSectionOrder.test.ts`: slices each page's source on the
  `<!-- VISUAL VIEW -->` / `<!-- DETAILED VIEW -->` markers; asserts the existing
  blocking-before-informational invariants inside the Detailed slice (unchanged
  components) and the new ones inside the Visual slice (hero < plan <
  TechnicalReport; verdict strip < plan).
- `useReportView` + `ReportViewToggle` tests: default visual, persistence write,
  stored `detailed` applied on mount, `data-export-exclude` present.
- `CategoryBars` parity: every scored row renders score, grade letter, and
  severity chip; N/A rows render their reason.
- Export: buildHtml contains plan + full detail expanded; snapshot path still
  expands `aria-expanded="false"` nodes.
- Existing suites must stay green (`pnpm build` before push, per project rule).

## Rollback

- **Soft (runtime):** the Detailed view IS the old UI, one toggle click away, on
  every report, for every user. Nothing is deleted.
- Tag `pre-report-redesign` (origin) marks the pre-redesign state (v1.53.0 + README
  docs commit).
- The change is web-only: `git revert` of the redesign commits fully restores the
  current UI. No data-shape, API, or DB migration is involved, so stored/shared
  reports are unaffected in both directions. Emergency: redeploy from the tag.

## Out of scope

- Remediation pages (`remediate/[jobId].vue`) and `ScoreCard.vue`.
- Markdown/text/JSON/AI export formats.
- Analyzer scoring or finding-text changes (the 9 open scoring findings stay a
  separate workstream).
- Server-side/share-state progress tracking.

## Release notes for the eventual ship

Visitor-meaningful → follows the full release checklist including the
`ANNOUNCEMENTS` banner, CHANGELOG, versions ×3, README §Security + screenshots
refresh, data-retention §10 entry, annotated tag.
