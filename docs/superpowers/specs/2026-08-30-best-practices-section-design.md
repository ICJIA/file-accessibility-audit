# Best Practices section — design

**Date:** 2026-08-30
**Status:** approved design, not yet planned or implemented

## The problem

Everything this checker reports that WCAG 2.1 does not require is currently
rendered three different ways, none of which tells an author what to do:

1. **`ActionPlan.vue`'s "Above and beyond" group** shows them as flat
   bullets — category label, then the raw analyzer sentence. No description,
   no document-specific evidence, no links, no show/hide.
2. **`ReportContent.vue`'s "TIER 2" block** repeats the same strings per
   category card, in the Detailed view only.
3. **The Technical signals panel** holds the computed evidence — the actual
   heading tree, the skip list, the link texts, the font names — anonymous,
   collapsed, and disconnected from the prose that explains why any of it
   matters.

The evidence an author needs is therefore *already computed and already in the
payload*, but it never appears next to the practice it belongs to. The
canonical example: `pdf.ts:808-809` emits

```
--- Heading Tree ---
  H1 → H2 → H1 → H1
```

which is exactly what someone needs to see under "your heading order is
wrong" — and it renders three sections away from that sentence, unlabelled.

## What ships

A **Best Practices** section: a scorecard of every best practice this checker
knows about for the document's format, each row carrying the practice's name,
a plain-language description, its status **for this document**, the specific
evidence behind that status, and links.

It renders on four surfaces (§5) and replaces the flat bullet list in "Above
and beyond", which narrows to veraPDF's verdict alone (§6).

### Non-negotiable framing

Nothing in this section may ever read as an obligation. The grade measures
WCAG 2.1 A/AA only — the standard ADA Title II and Illinois IITAA require —
and every row here is outside it. The section states that once, plainly, at
the top; no row carries a REQUIRED chip; the phrase "required by law" may not
appear. This continues the v1.130–v1.133 WCAG/PDF-UA split
(`project-wcag-pdfua-split-2026-08-29`).

## 1. Four states, not three

The section renders **every** practice for the format, always — including the
ones the document already satisfies. That is only honest if status comes from
evidence rather than from silence, so there are four states:

| Status | Set when | Source example |
|---|---|---|
| **NOT MET** | the analyzer emitted the advisory finding | `PDF/UA only — not scored: found 12 heading tags, but the level order has gaps…` |
| **MET** | the analyzer emitted the *positive* line | `All fonts are embedded — text will render correctly regardless of the user's installed fonts` |
| **NOT APPLICABLE** | the document genuinely has none of the thing | no tables in the file → the `/Scope` row |
| **NOT CHECKED** | the practice applies to this format but produced no signal either way | reading order when MCID overlap was insufficient; heading content when `markedContentAttributionReliable()` returned false; a stored report predating this feature |

**The fourth state is load-bearing.** A `detect()` that matches neither the
advisory nor the positive line returns NOT CHECKED — never MET. This is the
same doctrine as `CategoryResult.notAssessed` (a null score means "not
applicable" or "not assessed", never "fine"), the same doctrine as
`PdfUaVerdict`'s `available:false` disclosure, and it is the specific failure
mode that produced the DoIT dispute: a correctly-built document presented as
comprehensively broken because a UI inferred a verdict the analyzer never
gave. Silence is not a pass.

Practically this also means every stored report ever written degrades
gracefully. Old reports lack nothing — the strings are already there — but
where a phrasing has drifted, the row reads NOT CHECKED rather than lying in
either direction.

## 2. The catalog

New module `apps/web/app/utils/bestPractices.ts`. A declarative array, one
entry per practice:

```ts
export type BestPracticeStatus = "met" | "not-met" | "not-applicable" | "not-checked";

export interface BestPractice {
  id: string;                       // stable slug, used as a test anchor
  formats: FileType[];              // which of pdf/docx/pptx/xlsx it applies to
  categoryId: string;               // the CategoryResult it reads from
  label: string;                    // "Heading level order"
  description: string;              // what the practice is, one or two sentences
  why: string;                      // who it helps and how, in plain language
  standard?: string;                // "PDF/UA (ISO 14289) clause 7.4 · Matterhorn 13-004"
  links: BestPracticeLink[];        // §4
  detect(ctx: DetectContext): BestPracticeResult;
}

export interface BestPracticeResult {
  status: BestPracticeStatus;
  /** The document-specific evidence, already formatted for display. */
  evidence: string[];
  /** Optional preformatted block — the heading tree, a link list. */
  block?: { caption: string; lines: string[] };
  /** What to do about it, source-route and export-route. */
  fix?: { source: string; app: string };
}
```

`DetectContext` carries the category's `findings: string[]`, its
`signals` groups (already parsed by `partitionCardFindings`), the file type,
`notAssessed`, and the top-level result fields a practice may need
(`pageCount`, `pdfUaVerdict`).

### Matching contract

`detect` matches against the existing finding strings. It follows the
conservative pattern already proven in
`apps/web/app/components/pdfUaFixHint.ts`:

- keyword / prefix matching on lowercased text, **most specific first**;
- no match → NOT CHECKED, never a guess;
- **ordering is load-bearing** and must be commented at each site where one
  practice's text could satisfy another's matcher (the `/Scope` advisory names
  `<TH>`, which the table-structure matcher would otherwise claim).

**No analyzer change. No new payload field. No migration.** Consequences: it
works on every stored report, the score ledger is untouched, no scoring gate
moves, and `synthetic-controls` / `synthetic-office-controls` /
`score-ledger` / `resave-invariance` are unaffected.

### Robustness (SSR, attacker-controlled input)

`/report/[id]` renders **stored JSON** server-side. This is why
`partitionCardFindings` carries its `Array.isArray` guard and its
`filter((f): f is string => typeof f === "string")` narrowing: a forged or
corrupted stored report previously 500'd the shared page during SSR.

Every `detect()` inherits that requirement:

- never assume `findings` is an array or its entries are strings;
- never assume a captured regex group exists;
- never throw — a `detect()` that cannot decide returns NOT CHECKED;
- the section as a whole is wrapped so one bad practice cannot take down the page.

### Inventory

~38 practices. Only the report's own format renders, so a given report shows
between 3 and 19 rows.

**PDF (19)** — heading level order (Matterhorn 13-004); consistent heading
convention, no generic `<H>` mixed with `H1`–`H6` (Matterhorn 14-002);
numbered heading levels rather than all-generic `<H>` (PDF/UA 7.4); headings
that read like headings; one top-level heading; reading order matches the
content stream; bookmarks on a long document; fonts embedded (PDF/UA 7.21);
DisplayDocTitle viewer preference (PDF/UA 7.1); table header `/Scope` on
simple tables; `/Scope` alongside `/Headers` associations; no nested tables;
descriptive link text; link text that is not a raw URL; nested structure tree
rather than flat; every glyph maps to text (Matterhorn 10); content inside the
tag structure (Matterhorn 01); list labels `<Lbl>`; footnote `/ID` present and
unique (Matterhorn 19-003 / 19-004).

**Word (9)** — first heading is Heading 1; no skipped heading levels; no empty
Heading-styled paragraphs; paragraph spacing rather than runs of blank
paragraphs; layout grids given a table style or marked as data tables; no
nested tables; merged and split cells reviewed; no entirely empty table rows;
link text that is not a raw URL.

**PowerPoint (3)** — every slide has a title; slide titles are distinct; link
text that is not a raw URL.

**Excel (7)** — descriptive sheet names; data ranges defined as Excel Tables;
all data inside the defined tables; pivot tables reviewed; data starts near
A1; merged cells reviewed; link text that is not a raw URL.

### Explicit boundary: what stays in Technical signals

`supplementary.ts` emits its advisories **indented**, so
`partitionCardFindings` routes them into the signals panel before
`isNotScoredFinding` is ever consulted. Most are export artifacts an author
cannot act on — RoleMap circularity and standard-type remaps, optional-content
layer `/AS` auto-states, reference XObjects, attachment `/Desc`. They stay in
the Technical signals panel unchanged.

The line: **a practice enters the catalog when a document author has a
concrete action in Word, InDesign, or Acrobat.** That admits list `<Lbl>` and
footnote `/ID`; it excludes the rest. The alternative — a 50-row scorecard of
PDF internals — fails the standing rule that finding copy is written for a
non-technical reader.

## 3. What a row looks like

Collapsed, a row is label + status. Expanded (`show/hide` per row):

```
▸ Heading level order                                    NOT MET

    What this is
      Headings should step down one level at a time — H1, then H2, then H3.
      Jumping a level leaves a gap in the outline.

    Your document
      H1 → H2 → H1 → H1 → H3 → H5

      2 places skip a level:
        H1 → H3   (skipped H2)
        H3 → H5   (skipped H4)

    Why it matters
      Screen-reader users navigate by jumping between headings. A skipped
      level reads as a missing section — they cannot tell whether they
      missed something or whether the document simply has a gap.

    Does this affect my grade?
      No. W3C's own guidance is that a skipped level is not a WCAG failure,
      so it is not counted. PDF/UA and the Matterhorn Protocol do ask for it.

    How to fix
      In the source file  Apply the built-in heading styles in order …
      In the PDF          Tags panel → renumber the H tags so levels …

    Read more
      Matterhorn Protocol 13-004 · WCAG technique G141 · Understanding 1.3.1
```

MET rows collapse to the label, the status, and the positive evidence
(`All 47 link(s) use descriptive text`). NOT APPLICABLE and NOT CHECKED rows
say plainly why — `no tables in this document`, `reading order could not be
verified: the tag and content-stream sequences did not overlap enough to
compare`.

A summary line heads the section: *N met · N not met · N not applicable ·
N not checked*, with a standing statement that **none of it affected the
grade**.

Every count in this section is computed from the rendered rows or written
countless. No literal totals — the build-brief banned-pattern guard and the
`feedback_trust_page_stats` rule both apply.

## 4. Links

Three sources, all already in the repo:

- **WCAG** — `useWcag().understandingUrl(slug)` and `wcagQuickref`, from
  `composables/useWcag.ts`. Techniques (G141 and friends) are linked by their
  stable `w3.org/WAI/WCAG22/Techniques/` addresses.
- **Matterhorn** — `MATTERHORN_CHECKPOINTS` in `app/data/matterhorn.ts` gives
  every checkpoint's id, name, and summary. **Coupling:** per the standing
  rule, any change to that file promotes its test pin in the same commit.
- **Category help** — each `CategoryResult.helpLinks` already carries
  vendor documentation for the category the practice belongs to.

Every URL passes `safeHttpUrl` before rendering — the shared page's links
arrive from stored JSON.

## 5. Where it renders — four surfaces

New component `apps/web/app/components/BestPracticesSection.vue`.

| # | Surface | Placement |
|---|---|---|
| 1 | **Visual view** (`ActionPlan.vue`) | between the numbered steps / pass card and `plan-beyond-group` — after the "Everything the law requires is above ↑" seam |
| 2 | **Detailed view** (`pages/index.vue`) | after `IssuesSummary`, before `ManualReviewCard` |
| 3 | **Shareable report** (`pages/report/[id].vue`) | Visual branch inherits #1 via `ReportVisualView`; Detailed branch matches #2 exactly |
| 4 | **Print-friendly plan** (`utils/printablePlan.ts`) | its own `<h2>` section between "What to fix" and "Still worth checking by hand" |

### The double-render trap

The section must **not** be placed in `ReportContent.vue`.
`TechnicalReport.vue:154` embeds `ReportContent` inside the technical
expander, and `TechnicalReport` is itself inside `ReportVisualView` — so a
section added there renders **twice** on one page in the Visual view. This is
the same class of mistake as the v1.85 child-component ordering bug: when
placing a section, grep what child components render, not just the page
template.

### Print-friendly specifics

`printablePlan.ts` is a standalone, self-contained, ink-friendly HTML
document — no scripts, no external requests, opened as a blob URL. The
section is rendered there **fully expanded**, because there is no show/hide on
paper and the person holding the printout may not be the person who chose the
route. Both fix routes are always shown, matching how the fix steps already
behave there.

Two required changes:

- **`PrintPlanButton.vue`'s prop type must widen.** Its `categories` is typed
  `Array<{ id?; label?; score?; severity? }>` — no `findings`. The full
  `CategoryResult` is passed at runtime, so this is a type widening only, but
  without it the catalog has no input.
- **`hasSomethingToPrint` must grow a best-practices clause.** Today it is
  `steps.length || checks.length || notAssessed.length`. A document whose only
  remaining items are best practices would otherwise print nothing.

All interpolated values pass `escapeHtml` — the evidence quotes
document-derived strings (heading text, link labels, sheet names, font names).

Page-audit rows (`pages/page-report/[id].vue`) carry no `categories`, so the
section is gated off there, consistent with `TwoStandardsStrip` and the plan.

## 6. What moves

- **`beyondItems` leaves the beyond-group.** `ActionPlan.vue:434` and the
  `<ul>` at :285 are removed; "Above and beyond" narrows to what it does best
  — veraPDF's verdict verbatim, every failing rule, its ISO clause, its count,
  its error. Nothing appears twice on the page.
- **`showBeyondGroup` reduces** to the veraPDF condition alone
  (`v?.available && (v.error || v.passed === false)`).
- **The beyond-group's stat chips** lose the "N optional items from this
  report" chip, which now belongs to the new section's summary line.
- **`isNotScoredFinding()` gains the `"note — not scored"` prefix.**
  `app/utils/findings.ts:51-54` recognises only `"pdf/ua only — not scored"` and
  `"advisory — not scored"`, so six `"Note — not scored:"` lines — Word merged
  cells, Word empty table rows, Excel out-of-table ranges, Excel pivot tables,
  Excel far-from-A1 starts, Excel merged cells — fall through to `main` and
  render today under the Tier-1 heading *"Required by WCAG 2.1 — ADA Title II ·
  Illinois IITAA (this is what your score measures)"*. That is a mislabel of
  unscored advice as legally required, and it is fixed here.
- **`ReportContent.vue`'s TIER 2 block stays.** It is per-category detail in
  the card list; the new section is the document-level scorecard. They serve
  different readers and do not collide.

## 7. Out of scope

Not touched, and deliberately so:

- `exportFormats/html.ts`, `markdown.ts`, `text.ts`, `json.ts` — the
  downloadable report formats.
- The `.docx` and `.pdf` report downloads.
- `exportFormats/aiAnalysis.ts` already reads `notScored` and continues to
  work unchanged; its instruction #5 guardrail about never presenting
  unscored items as legally required still holds.
- Any analyzer or scoring change. No category score moves. No ledger row
  changes.

## 8. Testing

New:

- `bestPractices.test.ts` — per practice, for every status: a fixture finding
  set producing NOT MET with the expected evidence, one producing MET, one
  producing NOT APPLICABLE, and the empty/absent case producing NOT CHECKED.
  Explicitly: **silence must never produce MET.**
- Ordering pins for every matcher whose text could satisfy another's, in the
  style of `pdfUaFixHint`'s existing order tests.
- Malformed-input tests: `findings` as a non-array, entries as numbers /
  null / objects, and a finding whose quoted document text contains the
  matcher's own keywords. None may throw.
- `bestPracticesSection.test.ts` — the component renders every status, the
  show/hide works, and no row carries a REQUIRED chip or the phrase
  "required by law".
- Print: the section appears in `printablePlan` output, fully expanded, with
  every document-derived string escaped.

Amended:

- `reportSectionOrder.test.ts` — the new component takes its pinned place in
  both views, and the blocking-before-informational invariant still holds.
- `pdfUaCosign.test.ts` — its assertions that `beyondItems` render *inside*
  `plan-beyond-group` move to the new section (see especially the
  `no /Scope` assertion at :333 and the `Above and beyond` group tests at
  :329-342 and :615-642).
- `actionPlan.test.ts` — the `Above and beyond` assertion at :855.
- `printPlan` tests — the widened prop type and the new
  `hasSomethingToPrint` clause.

Per the standing rule that a gate which has only ever passed proves nothing:
each new guard gets a sabotage check confirming it can actually fire.

## 9. Release checklist coupling

This is visitor-meaningful, so the full release ritual applies: CHANGELOG,
versions ×6, README §Security, data-retention §10 via `SECURITY_AUDIT_ENTRIES`,
an `ANNOUNCEMENTS` entry, annotated tag, `pnpm build-brief` before the release
commit, and `pnpm prod-sentinels` after the user deploys.

`scripts/brief-stats.json` needs its test count updated. The trust brief's
in-app twin (`trustBody.ts`) fails the suite if it diverges from the template.
