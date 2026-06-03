# Design: Prominent filename banner across all reports

- **Date:** 2026-06-03
- **Status:** Approved (pending spec review)
- **Author:** cschweda + Claude

## Problem

Every human-readable report leads with the generic title **"PDF Accessibility Report"**. The actual audited filename appears only in small gray text — inside the `ScoreCard` on-screen, and as a `**File:**` metadata line in the Word / Markdown exports. The HTML export's `<title>` is the only place the filename leads.

When a report is downloaded or shared, the recipient can be left guessing **which file** the report describes. We want the filename in a prominent place across the top of every report so there is no mistaking the subject.

## Decision

Add a **full-width filename banner** across the very top of each report, above the report title. The banner shows a document icon, the eyebrow label **"ACCESSIBILITY REPORT FOR"**, the **filename in bold**, and `N pages · PDF` beneath.

```
┌────────────────────────────────────────────────┐
│ 📄  ACCESSIBILITY REPORT FOR                    │
│     budget-report-2026.pdf                      │   ← bold, wraps if long
│     12 pages · PDF                              │
└────────────────────────────────────────────────┘
```

Chosen over "filename as the headline" and "bordered bar below the title" because it gives the filename the strongest, first-thing-you-see separation. Confirmed via mockups during brainstorming.

## Scope

Every human-readable report surface gets the banner. JSON is data-only and already carries the filename; the remediation receipt is deferred.

| Surface | File | Change |
|---|---|---|
| Live audit result | `apps/web/app/pages/index.vue` | Banner at top of result block (reflects the active file / batch tab) |
| Shared report | `apps/web/app/pages/report/[id].vue` | Banner above the "Accessibility Report" title block |
| HTML export | `apps/web/app/composables/useReportExport.ts` → `buildHtml` | Styled banner `<div>` at top (filename already in `<title>`) |
| Word export | `useReportExport.ts` → `buildDocx` | Shaded/bordered filename block before the title paragraph |
| Markdown export | `useReportExport.ts` → `buildMarkdown` | Filename becomes the leading `# H1` + subtitle line |
| PDF (browser print) | — | Inherits the on-screen banner; made print-legible |
| JSON export | `useReportExport.ts` → `exportJSON` | **No change** — `file.name` already present |

**Out of scope:**
- Remediation receipt (`apps/web/app/pages/remediate/[jobId].vue`) — before/after of the *same* file across two `ScoreCard`s; a single banner there is an optional later follow-up.
- Restyling JSON (it is machine-readable data, not a visual report).
- The `/publist` publications list (`apps/cli`) — separate surface; not part of this change.

## Components

### New: `apps/web/app/components/ReportFileBanner.vue`

A small, presentational, reusable component — the single source of the on-screen banner so `index.vue` and `report/[id].vue` stay identical.

**Props**
```ts
defineProps<{
  filename: string;
  pageCount: number;
  isScanned?: boolean;
}>();
```

**Renders** a full-width card matching the existing report-card styling (`border border-[var(--border)] bg-[var(--surface-card)] rounded-xl`) so it prints with the same fidelity as sibling cards:
- A document icon (inline SVG, consistent with the icon style already used on the pages).
- Eyebrow: `ACCESSIBILITY REPORT FOR` — `text-xs uppercase tracking-wide text-[var(--text-muted)]`.
- Filename: bold, prominent (`text-lg sm:text-xl font-bold text-[var(--text-heading)]`), with **`break-words`** so long names wrap fully and are **never truncated** — the file must always be unmistakable.
- Sub-line: `{{ pageCount }} page{{ pageCount === 1 ? '' : 's' }} · PDF`, muted.
- When `isScanned`, a small inline "Scanned" chip after the sub-line.

### Changed: `apps/web/app/components/ScoreCard.vue`

The gray `{{ result.filename }} — N pages` line (currently lines 3–7) is now redundant wherever the banner is shown. Add a prop to suppress it without affecting the remediation page:

```ts
const props = withDefaults(defineProps<{
  result: { /* unchanged */ };
  showFilename?: boolean;
}>(), { showFilename: true });
```

Wrap the existing filename `<p>` in `v-if="showFilename"`. Default `true` preserves current behavior — the remediation before/after `ScoreCard`s are untouched.

## Page integration

### `apps/web/app/pages/report/[id].vue`
- Import `ReportFileBanner`.
- Insert `<ReportFileBanner :filename="data.report.filename" :page-count="data.report.pageCount" :is-scanned="data.report.isScanned" class="mb-6" />` at the **top of the report block** (inside `<div v-else-if="data">`, before the `<!-- Header -->` block at line 27).
- Pass `:show-filename="false"` to the `<ScoreCard>` at line 96.

### `apps/web/app/pages/index.vue`
- Import `ReportFileBanner`.
- Insert the banner at the **top of `<template v-if="result">`** (before the scanned-warning block at line 158), bound to the active `result`. This makes the active file unmistakable in batch mode.
- Pass `:show-filename="false"` to the `<ScoreCard>` at line 187.

The on-screen banner is plain page content (not `.print-hide`), so the **PDF-via-print** path on both pages inherits it automatically.

## Export changes (`useReportExport.ts`)

### `buildMarkdown`
Lead with the filename as the H1; drop the now-redundant `**File:**` metadata line. Keep Pages / Date / Score / Grade.
```md
# budget-report-2026.pdf

**Accessibility Report** · 12 pages · PDF

**Date:** …
**Overall Score:** …/100
**Grade:** …
```

### `buildDocx`
Insert a banner block **before** the existing "PDF Accessibility Report" title paragraph: a `Paragraph` with light `shading` fill and a bottom `border`, containing the eyebrow run `ACCESSIBILITY REPORT FOR` (small, gray), the filename run (bold, size ~32), and a `N pages · PDF` run (gray). Drop the now-redundant `File:` entry from the `metaLines` block; keep Pages / Date / Score / Grade.

### `buildHtml`
Insert a `.file-banner` `<div>` immediately after `<div class="container">` (line 1274), before the `<h1>` (line 1276): bordered box, document glyph, uppercase eyebrow, bold filename (`word-break:break-word`), and `N pages · PDF`. Remove the redundant gray `${filename} — N page(s)` line from the score-hero block (line 1280). Add an `@media print` rule so the banner's filename stays legible (dark text) on the white print background. The `<title>` is unchanged.

### `exportJSON`
No change. Confirm `file.name` remains in the output (currently lines 336–340).

## Edge cases

- **Long filenames:** wrap via `break-words` (Vue/HTML) and Word's natural paragraph wrapping. Never truncate.
- **Escaping:** Vue `{{ }}` auto-escapes; HTML export uses the existing `escapeHtml`; Word passes text as `TextRun` content.
- **Single page:** "1 page" (no plural).
- **Scanned documents:** "Scanned" chip on-screen; existing scanned warnings are unchanged.
- **Print contrast:** the banner matches sibling report-card styling, so it prints exactly as the existing cards do; the HTML export adds an explicit print rule. (Dark-mode-on-paper fidelity of all cards is a pre-existing condition, not introduced here.)

## Testing

- **New** component test for `ReportFileBanner` — renders the filename, the `N pages · PDF` sub-line, pluralization (1 vs N), a long filename without truncation, and the scanned chip when `isScanned`.
- **Export tests** — assert the HTML output contains the banner block and the filename; the Markdown output's first H1 line is the filename; the docx output contains the filename near the top. Extend the existing export coverage in `apps/web/app/__tests__/`.
- **Build gate:** run `pnpm build` (tsc `--noEmit`) before pushing — Vitest's esbuild path does not catch type errors.

## Acceptance criteria

1. The filename appears in a prominent banner across the top of: the live result page, the shared report page, and the HTML / Word / Markdown exports.
2. Saving any of those pages to PDF via the browser print dialog includes the banner, legibly.
3. The filename is no longer duplicated in small gray text directly beneath the banner on the live and shared pages.
4. Long filenames wrap and remain fully readable everywhere.
5. The remediation before/after page is visually unchanged.
6. JSON export still includes the filename as `file.name`.
7. `pnpm build` and the test suite pass.

## Follow-ups (not in this change)

- Optional single banner at the top of the remediation receipt (`remediate/[jobId].vue`).
- README + CHANGELOG + version bump per the project release checklist, once implemented.
