# Reader / Auditor toggle — report page density redesign

**Date:** 2026-05-04
**Branch:** `feature/reader-auditor-toggle`
**Status:** spec — pending user approval before plan
**Affects:** `apps/web/app/pages/report/[id].vue`, `apps/web/app/pages/index.vue`
**Does not affect:** API, scoring engine, data model, route shape, exports

## Problem

Three accessibility lenses (Strict, Practical, Adobe Acrobat parity) are useful for auditors and gold for compliance review, but the post-upload page and the shareable-link page now read like five reports stacked together. The author audience — described by the project owner as "I just want my mistakes fixed ASAP, accessibility is incidental" — gets a wall of methodology, mode-explainer paragraphs, WCAG citations, and parity tallies between them and the actionable Adobe Acrobat fix steps that they actually came for.

The existing per-card Basic/Advanced toggle only filters lines prefixed with `---` or two-space indent inside the findings list. It does not touch the methodology block, the Strict-vs-Practical explainer paragraph, the Adobe Parity card, the per-card "What this checks" copy, the WCAG references panel, the Learn-more link strip, the PDF Metadata block, or the Not-Included-in-Scoring section — i.e., the actual sources of density.

## Goals

- Cut roughly 40% of the default scroll length on `/report/:id` for a typical PDF with 3–5 issues, without removing or repositioning any block.
- Surface a severity-ordered "what to fix" list above the detailed cards so an author can read the punch list at a glance.
- Preserve every existing block, badge, panel, and explainer for users who want it — including external users outside the agency who have built habits around the current layout.
- Keep the Adobe Acrobat fix-steps panel prominent in every mode. (Project owner: this is users' favorite feature.)
- Keep the Strict score as the headline. Practical and Adobe parity remain available as secondary signals; neither is removed.
- Lay out the page so the eventual in-house remediation tool (alpha, ETA 2–4 months) can drop in alongside the Acrobat steps without re-architecture. **The remediation tool is explicitly out of scope for this branch — no UI affordances are reserved or hinted at.**

## Non-goals

- No "Fix automatically" / one-click remediation buttons or visual placeholders for them. The remediation tool is in early alpha from a different developer; this branch does not promise or pre-stage anything.
- No removal of any existing block, panel, badge, or explainer.
- No repositioning of the score hero, grade circle, Adobe Parity card, Category Scores table, or Detailed Findings cards in Auditor mode. Auditor preserves today's layout byte-for-byte.
- No changes to the Strict/Practical mode toggle on the Category Scores table or the per-card Basic/Advanced toggle. Both keep working exactly as today.
- No changes to dark mode, the existing `useColorMode` flow, or the dark-mode toggle button position.
- No API, route, scoring, or data-model changes. Pure presentational refactor on two pages.
- No refactor of `pages/index.vue` or `pages/report/[id].vue` into shared components. The two pages already duplicate large amounts of template code; deduping that is a separate, follow-up engagement and explicitly not part of this branch's scope.
- No rewording of existing copy beyond what the new disclosure-widget labels and the new action banner / Issues summary require.

## Audience model

- **Primary (Reader-mode default):** non-technical authors who want "tell me what's wrong, tell me how to fix it." Accessibility is not their craft. They want the verdict, the punch list, and the Adobe Acrobat steps. Methodology, WCAG citations, and the parity panel are noise to them at first read.
- **Secondary (Auditor-mode opt-in):** auditors, compliance reviewers, and accessibility specialists who need every signal inline — WCAG references per category, Strict-vs-Practical comparison, Adobe parity 32-rule grid, methodology paragraph, "what this checks" copy. They are also the audience least likely to be surprised by a toggle, since they read deliberately.

The toggle defaults to Reader. An auditor flips it once on the post-upload page and the preference is sticky in localStorage. On the shareable page, every recipient lands in Reader regardless of any localStorage preference, because the recipient is treated as a fresh non-technical reader.

## Architecture

### Mode model

Single page-level toggle in the page header (top right, near the existing dark-mode button). Pill-style two-segment control: `Reader · Auditor`. Active segment uses the existing emerald (Reader) or amber (Auditor) accent already used elsewhere on the page for Strict/Practical pills.

The toggle controls a single reactive `mode` ref of type `"reader" | "auditor"`. Every disclosure widget on the page reads from this ref to decide whether to default open or closed. The widgets are still individually clickable — `mode = "reader"` does not lock them shut, it only sets the default `open` attribute. A user in Reader who clicks a single disclosure to open it can do so without flipping the mode.

When the user toggles the mode pill explicitly, all disclosure widgets snap to the new mode's defaults (Reader closes everything optional; Auditor opens everything). User-driven open/close on individual widgets after that point is preserved until the next mode toggle or page reload.

### Per-page defaults

| Page | First-visit default | Persistence |
|---|---|---|
| `pages/report/[id].vue` (shareable link) | **Reader** | None — every visit resets to Reader. The recipient is treated as a fresh non-technical reader regardless of any localStorage value. |
| `pages/index.vue` (post-upload) | **Reader** | localStorage key `audit:reportMode` set to `"reader"` or `"auditor"`. Read on mount; written when the user toggles. |

Rationale for ignoring localStorage on the shareable page: a recipient may share the link with a colleague who is a different audience entirely; persisting one viewer's preference into another viewer's session is wrong. The shareable page is intentionally a clean slate every time.

### What stays exactly as-is in Auditor mode

Every block on today's `/report/:id` and post-upload page is preserved with full content in its current position when Auditor is active:

- Filename + share metadata header.
- Score hero (`ScoreCard.vue`) with grade circle, dual Strict/Practical score pills, methodology link copy.
- Methodology block (`How Scores Are Derived`) with QPDF and PDF.js badges and the 9-categories explanation paragraph.
- Adobe Parity card (`AdobeParityCard.vue`) above Category Scores, with all interactive tallies, vacuous-pass annotations, authority callout, and 32-rule grid.
- Category Scores table with the Strict/Practical mode switch, the long Strict-vs-Practical explainer paragraph, and the N/A footnote.
- PDF Metadata block (10 metadata fields).
- Detailed Findings cards: per-card Basic/Advanced toggle, mode badge, ModeCompareBox, "What this checks" paragraph, full findings list, Adobe Acrobat fix steps panel, WCAG references panel, Learn-more pill links.
- Not Included in Scoring section with N/A categories and explainer footnote.
- Downloads + CTA.
- Footer.
- Dark mode (`useColorMode`) and the dark-mode toggle button.

The only differences in Auditor versus today are the additions described under "New blocks" below.

### What collapses in Reader mode

#### Page-level disclosures

These blocks become single-line disclosure widgets (a `<details>` element styled to match the app, with a chevron and a short label). Each is fully expandable on click without flipping the mode toggle.

- **Methodology block** → `▸ Methodology and scoring sources`. Inside: the QPDF/PDF.js badges, the 9-categories explainer paragraph, the WCAG/ADA reference links.
- **Strict-vs-Practical explainer paragraph** above the Category Scores table → `▸ How Strict and Practical differ`. The Category Scores *table itself* stays visible — only the explainer paragraph collapses.
- **Adobe Parity card** → `▸ How Adobe Acrobat would score this`. Inside: the existing `AdobeParityCard.vue` with all of today's content. Position in the stack: same as today (above Category Scores), it just defaults closed.
- **PDF Metadata block** → `▸ Document metadata`. Inside: the existing 10-field metadata table.
- **Not Included in Scoring section** → `▸ Categories not included in scoring`. Inside: the existing N/A category cards and footnote.

#### Per-card disclosures

Inside each Detailed Findings card, when Reader mode is active:

- **"What this checks" paragraph** → `▸ What this category checks`.
- **WCAG 2.1 references panel** → `▸ WCAG 2.1 references — N success criteria` (count populated from `getWcagCriteria(catId).length`).
- **Learn more pill-links strip** → `▸ Learn more — N reference links` (count populated from `cat.helpLinks.length`).

What stays expanded inline in every Reader-mode Detailed Findings card:

- Card header row (category name, score, severity pill, mode badge).
- ModeCompareBox (when present — small Strict/Practical pill row).
- Findings list. The per-card Basic/Advanced toggle keeps its current default (Basic) in both Reader and Auditor — page-level mode does not override per-card toggle state. A user who flips a single card to Advanced retains that override regardless of the page-level toggle.
- **Adobe Acrobat fix-steps panel** when present (i.e., when `splitAcrobatGuide(cat.findings, cat.id).acrobat.length > 0`). This is the load-bearing element for the author audience and stays inline in both modes. Cards without Acrobat steps render the same as today — no placeholder, no empty panel.

Each per-card disclosure is conditional on its existing render condition: the `What this category checks` disclosure only appears when `cat.explanation` is truthy; the `WCAG 2.1 references` disclosure only appears when `getWcagCriteria(cat.id).length > 0 && cat.score !== null`; the `Learn more` disclosure only appears when `cat.helpLinks?.length > 0`. No empty disclosures.

The Category Scores table's in-table Strict/Practical mode switch is preserved in Reader mode with its current behavior (defaults to Strict; user can flip to Practical at any time). Only the long explainer paragraph above the table collapses into the page-level disclosure.

### New blocks

Two additive blocks, visible in *both* modes. Tinted blue with a small "NEW" tag in mockups; in production they are styled with the app's standard surface and accent colors. Both blocks hide entirely when the report has zero issues at or above Minor severity.

#### Action banner

Single-line text under the score hero. Copy is generated from the report's severity tally:

| Tally | Banner copy |
|---|---|
| ≥1 Critical | `N critical, M moderate issues must be fixed before publishing.` (omit the "M moderate" clause if M=0) |
| 0 Critical, ≥1 Moderate | `M moderate issues found. Recommended to fix before publishing.` |
| 0 Critical, 0 Moderate, ≥1 Minor | `M minor issues found. Optional fixes — PDF passes Illinois accessibility.` |
| 0 issues at Minor or above | `This PDF passes Illinois IITAA + WCAG 2.1 AA accessibility checks.` (and the entire Issues summary block hides) |

Wording is deliberately factual and not framed as judgment of the author. "Must be fixed before publishing" is the strongest phrasing and is reserved for Critical-bearing reports, where it accurately describes the IITAA bar.

#### Issues to fix — severity-ordered summary

A new card below the action banner. Lists issue rows in severity order: Critical → Moderate → Minor. Pass-grade categories do not appear. Each row contains:

- Severity pill (Critical / Moderate / Minor) using the existing severity colors.
- Category name (from `cat.label`).
- One-line plain-English summary derived from the category's first non-guidance finding (`cat.findings[0]`), truncated with ellipsis at row width.
- A jump anchor `↓ Fix steps` linking to that category's Detailed Findings card by `id="cat-${cat.id}"`. Smooth scroll on click using `scrollIntoView({ behavior: "smooth", block: "start" })` — same pattern already used in `pages/index.vue` for the Category Scores anchor.

The plain-English summary is derived from the category's first finding that is not a guidance line, using the existing `isGuidanceFinding(finding)` helper already defined on both pages. Truncate at row width with CSS ellipsis; do not summarize or rewrite the finding text.

When Reader is active, clicking the jump anchor scrolls to the Detailed Findings card and ensures its Adobe Acrobat steps panel is in view (already inline in Reader). When Auditor is active, the same anchor scrolls to the same card.

If the report has 0 issues at Minor or above, this block is hidden entirely (no empty-state row, no celebratory copy — that's already handled by the action banner).

### Layout order in Reader

```
Filename + share metadata header (with toggle pill at top right)
Score hero
Action banner [NEW]
Issues to fix [NEW]
▸ Methodology and scoring sources
▸ How Strict and Practical differ
▸ How Adobe Acrobat would score this
Category Scores table  (no explainer paragraph above; that's collapsed)
▸ Document metadata
Detailed Findings cards (Reader-mode body — Acrobat steps inline; What-checks / WCAG / Learn-more collapsed)
▸ Categories not included in scoring
Downloads + CTA
Footer
```

### Layout order in Auditor

```
Filename + share metadata header (with toggle pill at top right)
Score hero
Action banner [NEW]
Issues to fix [NEW]
Methodology block (full)
Adobe Parity card (full)
Category Scores table (with explainer paragraph above)
PDF Metadata block (full)
Detailed Findings cards (Auditor-mode body — every panel inline; matches today)
Not Included in Scoring section (full)
Downloads + CTA
Footer
```

## Implementation surface

### Files modified

- `apps/web/app/pages/report/[id].vue` — add toggle, wrap optional blocks in disclosure widgets, render new blocks, anchor IDs on Detailed Findings cards.
- `apps/web/app/pages/index.vue` — same as above, with localStorage persistence.
- `apps/web/app/composables/useReportMode.ts` (**new**) — exposes `mode`, `setMode`, and a `persist` flag. Pages opt into persistence by passing `persist: true`.

### Files added

- `apps/web/app/components/ReportModeToggle.vue` — the two-segment pill control.
- `apps/web/app/components/ReportActionBanner.vue` — the new action-banner block. Pure prop-driven; takes the categories array and computes the banner copy.
- `apps/web/app/components/IssuesSummary.vue` — the new Issues-to-fix list. Takes the categories array, sorts by severity, renders rows with jump anchors.

### Files left untouched

- `ScoreCard.vue`, `AdobeParityCard.vue`, `ModeCompareBox.vue`, `NaCell.vue`, `useReportExport.ts`, the API, the scorer, the data model, the routes, and every other component outside the three new files above.

### State and persistence

- localStorage key: `audit:reportMode`. Allowed values: `"reader"` | `"auditor"`. Read once on mount in `pages/index.vue`. Never read in `pages/report/[id].vue`.
- The composable's `persist` flag controls whether `setMode` writes to localStorage. `pages/report/[id].vue` passes `persist: false` so toggling does not contaminate the localStorage value used by the post-upload page.

### Disclosure widget convention

Default to native `<details>`/`<summary>` styled to match the app's dark palette via scoped CSS. Native `<details>` is keyboard-accessible by default (Enter/Space toggles, Tab focuses the summary), exposes correct ARIA semantics without manual wiring, renders open/closed state correctly under SSR, and degrades gracefully without JavaScript. The widget binds its `open` attribute to the page-level `mode` ref through a one-way watcher: when `mode` changes, every widget snaps to the new mode's default; when a user clicks a single widget, that local override is preserved until the next mode change.

Avoid `v-if` for the collapsed state — the content must be present in the DOM and SSR-rendered so screen readers, search engines, and accessibility audits of this page itself reach it. (Critical: this is an accessibility audit tool. The page must itself be accessible. Validate with axe and lighthouse on the deployed branch before merge.)

If during plan we discover that `@nuxt/ui 4.5.1` ships a Collapsible component that meets the SSR and accessibility bar with less custom CSS, swap to it. Otherwise stay with native `<details>`.

### Anchor IDs and smooth scroll

Each Detailed Findings card gets an `id="cat-${cat.id}"` attribute. The Issues summary jump links use those anchors. Scroll behavior uses `scrollIntoView({ behavior: "smooth", block: "start" })`. Note: the existing in-page anchor on `pages/index.vue` for Category Scores uses the same API; the implementation should follow that precedent.

Anchor IDs use the category id from `cat.id` directly (e.g., `cat-alt_text_images`). These ids are already stable across reports and exports.

## Testing

The existing test pattern (read `.vue` source as text and regex over it) failed to catch the v1.16.3 SSR `gradeColors` ReferenceError because it never SSR-rendered the page with valid data. This branch's tests should fix that gap for the parts of the page being touched.

### New tests

- **SSR smoke test** covering `pages/report/[id].vue` and `pages/index.vue`: store a scrubbed copy of a real report payload at `apps/web/app/__tests__/fixtures/sample-report.json` (sourced from a representative prod row, with filename and any identifying metadata replaced). Mount each page with that payload and assert `renderToString` completes without throwing and returns a non-empty HTML string containing the expected markers (e.g., the category names from the fixture). Catches reference errors like the v1.16.3 `gradeColors` bug, which the existing source-grep tests miss.
- **Mode-toggle behavior test** (component-level on `ReportModeToggle.vue`): default is Reader, click flips to Auditor, click flips back, emits the correct events.
- **Action banner copy test** (`ReportActionBanner.vue`): given each of the four severity-tally cases above, asserts the rendered copy.
- **Issues summary ordering test** (`IssuesSummary.vue`): given mixed-severity input, asserts rows are emitted Critical → Moderate → Minor and Pass categories are excluded.
- **Disclosure default-open test**: with `mode = "auditor"`, every disclosure widget's `<details>` element renders with `open`. With `mode = "reader"`, none do.
- **localStorage persistence test** (`pages/index.vue`): mounting reads the key; toggling writes the key. Mounting `pages/report/[id].vue` does *not* read the key.

### Manual verification before merge

- Seed the prod payload into local SQLite (already documented in conversation context). Hit `/report/:id` locally on this branch; confirm Reader renders correctly and the toggle flips to Auditor matching today's layout exactly.
- Upload a real PDF on `pages/index.vue`; confirm Reader is the default first-visit, toggle to Auditor, refresh, confirm Auditor sticks.
- Confirm dark mode still works with the `useColorMode` toggle in both modes.
- Confirm the jump anchors from Issues summary scroll to the right Detailed Findings card.
- Run an accessibility audit (axe / lighthouse) on the page itself in both modes — this is an accessibility tool, the page must pass.

## Out of scope (explicit)

- Refactoring `pages/index.vue` and `pages/report/[id].vue` into shared composables/components beyond the three new files listed above. The two pages duplicate large amounts of template code; that's a known tech-debt item and a separate engagement.
- Any UI affordance — visible or reserved — for the in-house remediation tool currently in alpha.
- Any change to scoring logic, score weights, the Adobe parity rule mappings, or the Strict/Practical profile definitions.
- Any change to the Strict/Practical mode toggle on the Category Scores table.
- Any change to the per-card Basic/Advanced findings-filter toggle.
- Any change to the page's URL, routing, or API contract.
- Server-side persistence of mode preference (the localStorage approach is intentional — no DB write per toggle).

## Open items / decisions deferred to plan

- Whether to use native `<details>` or `@nuxt/ui 4.5.1`'s Collapsible component if one exists with adequate SSR + accessibility behavior. Default is native `<details>`; swap only if the Nuxt UI primitive measurably reduces custom CSS without weakening accessibility.
- Severity tally derivation: today the page does not expose a top-level severity count. The action banner needs `criticalCount`, `moderateCount`, `minorCount` derived from `report.categories`. Recommended location: a pure function in `apps/web/app/utils/severityTally.ts` (testable in isolation, importable by both pages and the Issues summary component).
- Toggle position in `pages/index.vue` versus `pages/report/[id].vue`. The two pages have different headers; the toggle should sit consistently near the existing dark-mode button on each, but exact placement is a plan-time call. Both pages must show the toggle in the rendered viewport without scrolling.
- Test framework for SSR smoke test: vitest + `@vue/server-renderer` plus Nuxt's `mountSuspended` helper from `@nuxt/test-utils` if needed for composable resolution. Confirm during plan.
