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

## Page composition (both report surfaces, top to bottom)

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
7. **Category bars** — "Where the score comes from": one labeled horizontal bar per
   scored category (grade-colored fill, numeric value right-aligned, `aria-label`
   with full text). N/A categories listed beneath in muted text with their reason
   (reusing `naReason`). Replaces the Category Scores table.
8. **Full technical report** — ONE expander (aria-expanded button, closed by
   default) containing, in order: Detailed Findings cards (evidence, technical
   signals toggle, per-category Acrobat guide, WCAG references, help links —
   i.e. today's `ReportContent` minus the score table), failing WCAG criteria list,
   PDF/UA signals card + veraPDF verdict, `MethodologyCard`, Document Metadata.
   Content unchanged — relocated, not rewritten.
9. **Downloads + CTA + footer** — unchanged.

Blocking-before-informational ordering is preserved (PDF/UA panels stay below the
plan, now inside the expander). `reportSectionOrder.test.ts` updates to pin the new
order.

## Components

**New**
- `ReportGradeHero.vue` — grade circle + score + verdict label (zone 2).
- `SeverityTiles.vue` — zone 3.
- `VerdictStrip.vue` — zone 4 (props: conformance verdict, wcag version).
- `ActionPlan.vue` — zone 6 (rail, expand state, `data-export-exclude` on toggles,
  `aria-expanded` so the export snapshot auto-expands).
- `CategoryBars.vue` — zone 7.
- `TechnicalReport.vue` — zone 8 wrapper (expander + existing content components).
- `utils/actionPlan.ts` — pure mapper + dictionary (below).

**Changed**
- `pages/report/[id].vue` and `pages/index.vue` (results block): swap to the new
  stack. `data-report-content` wrapper stays.
- `ReportContent.vue` — score table + metadata panel move out (bars replace the
  table; metadata renders inside TechnicalReport); detailed-findings rendering is
  otherwise kept as the body of TechnicalReport.
- `utils/exportFormats/html.ts` (`buildHtml`) — rebuilt to mirror the new order
  with everything expanded (static file). Content set unchanged.
- Print CSS — expand the technical section, preserve tile/bar colors
  (`print-color-adjust`), sensible page breaks around plan steps.

**Removed from report pages (superseded)**
- `IssuesSummary.vue` and `ReportActionBanner.vue` — replaced by ActionPlan + the
  hero verdict. Delete if no other usages remain (verify at implementation).

**Untouched**
- `ScoreCard.vue` — still used by remediation before/after cards. Report pages just
  stop importing it.
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

## Testing

- `actionPlan.test.ts`: every enumerated category id has a dictionary entry;
  ordering; PDF two-route vs OOXML one-route; Acrobat-block preference; unknown-id
  fallback; malformed-input guards; clean-pass empty plan.
- Component tests: rail expand/collapse + `aria-expanded`; step-1 auto-open;
  `data-export-exclude` on interactive controls; technical expander contains
  findings/PDF-UA/methodology/metadata; tiles render zeros muted.
- `reportSectionOrder.test.ts`: new pinned order (verdict + plan above PDF/UA).
- Export: buildHtml contains plan + full detail expanded; snapshot path still
  expands `aria-expanded="false"` nodes.
- Existing suites must stay green (`pnpm build` before push, per project rule).

## Rollback

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
