# Scoring calibration + disclosure completeness — 2026-08-08

Six fixes from an adversarial review of the analyzer against the `controls/`
corpus. The review's headline finding was that **every conformance failure and
every pass verified by hand was factually true** — these fixes address the
residual class of problems: opinions leaking into the letter grade, and
honesty gaps at the edges of a clean report.

The governing principle: a sub-100 category score becomes a severity, and a
severity **caps the grade** (`SEVERITY_GRADE_CAPS`). So only findings with a
standards or tool-precedent basis may score below 100; conventions stay as
advisory findings.

## 1. Multiple H1s are advisory, not scored

`scoring/pdf.ts` dropped `heading_structure` to 75 (55 with a skip) for more
than one H1. No WCAG success criterion, PDF/UA-1 clause, or Matterhorn
condition requires a single H1 — PDF/UA explicitly permits repeated H1s — and
Acrobat/PAC do not flag it. Because 75 is the Minor band, the convention
capped conformance-clean documents at **B**:
`controls/DVFR_Biennial_Report_2024` (5×H1, its only sub-100 category) was
denied its A by a rule no standard states. Now an advisory finding with its
basis stated; hierarchy **skips** keep their 60 (Matterhorn 13-004, WCAG
G141). This also removes a cross-format inconsistency — the DOCX scorer never
had a multiple-H1 rule.

## 2. Single-column tables are layout, not data

The conformance gate skips one-column constructs for the 1.3.1 no-headers
failure (`(t.columnCounts[0] ?? 2) >= 2`) and the DOCX/XLSX scorers skip them
explicitly — but the PDF *score* docked them for missing `<TH>` anyway
(`controls/2022_DVFR_Annual_Report`: 26 single-column tables → 75).
`scoreTableMarkup` now partitions on the **same expression** the gate uses, so
score and gate can never disagree; single-column tables still appear in the
overview, marked "layout, not scored", and an all-layout document gets N/A
with guidance instead of a dock.

**Known limitation carried forward** (already in the 2026-07-26 ledger): the
classifier keys on the *first row's* effective span, so a real data table
whose producer omitted `/ColSpan` on a merged title row reads as single-column
and is now consistently excluded (`Full_DJJ_Recidivism_Report` moved 59/F →
66/D through this + fix 1). The gate already treated those tables this way —
the score just agrees now. The right long-term fix is measuring merged rows
properly, which stays on the ledger.

## 3. Bookmarks: framing corrected, score unchanged

The missing-bookmarks finding cited "Bookmarks map to WCAG 2.4.5" as the rule.
2.4.5 Multiple Ways is scoped to a **set of web pages**; no criterion strictly
requires bookmarks inside a single document (W3C's PDF2 technique *relates*
bookmarks to 2.4.5). The finding now says exactly that and cites the honest
precedent — Acrobat's own checker flags long documents without bookmarks. The
45/Moderate score is deliberately unchanged: unlike multiple-H1 there is real
tool precedent and real navigation impact.

## 4. Alt text that declares itself decorative

`controls/DVFR_Biennial_Report_2024` carries three `<Figure>`s with `/Alt
"Decorative border"` — announced three times by a screen reader as pure noise.
A genuinely decorative image belongs outside the reading order as an
`/Artifact`, not inside it with a self-cancelling description.
`detectSuspiciousAltText` now flags alt matching `^decorat…` (or bare
"border"/"spacer"/"divider"/…) with that advice. Advisory only — no score
penalty — and anchored at the start so alt that *depicts* decoration ("Photo
of decorative ironwork…") is untouched.

## 5. The not-assessed disclosure was materially incomplete

`conformance.notAssessed` — the source of the manual-review card's "not
checked by this tool at all" list — held only contrast and (conditionally)
reading order, implying everything else was covered. Five criteria that apply
to every document and are genuinely never assessed are now disclosed on every
verdict, all four formats: **3.1.2 Language of Parts, 1.4.1 Use of Color,
1.4.5 Images of Text, 1.4.11 Non-text Contrast, 1.3.3 Sensory
Characteristics**. The live counterexample that forced this:
`controls/2022-DVFR-Annual-Report-A0.pdf` (100/A) declares `no, de, da, it`
spans in an English document — Word autodetect noise, squarely 3.1.2
territory, previously undisclosed. For PDFs the 3.1.2 entry cites the
document's own measured span languages when present (compared by primary
subtag, so `en` vs `en-US` is not "foreign"). Deliberately excluded: 1.4.4
Resize Text and 1.4.10 Reflow (viewer behavior as much as file, contested for
fixed layout) and the web-UI-only 2.2 criteria (documented on /wcag-2-2).

## 6. The manual-review card went silent exactly where it mattered most

`manualChecks()` emitted prompts only for `score === 100` categories, so a
null-scored category contributed nothing.
`controls/2026_dvfrc_biennial_report.pdf` scores 100/A with **four images
hidden as artifacts — one a 612×423pt half-page cover image marked as a
"Pagination/Header" artifact**. Its alt-text category is null+`notAssessed`,
so the card whose premise is "each passing check contributes the judgment
automation could not make" said nothing about images on exactly the report
that most needed the prompt. Now: a category with `score === null &&
notAssessed === true` and an entry in `NOT_ASSESSED_CHECKS` (only `alt_text`
today) emits a **caution-tone** prompt — rendered with `!` in amber, never the
passed-check ✓, on the card **and** on the printable plan (the tone travels to
paper; wiring pinned by tests on both surfaces). `color_contrast` is
deliberately not in the map — its exclusion is already disclosed as 1.4.3 in
the criteria list, and a second entry would double-report it.

## Verification

- **2,233 tests green** (API 1206 / Web 978 / CLI 49), lint clean,
  `pnpm build` exit 0.
- **All 32 auditable controls re-run before/after. Zero conformance-verdict
  changes.** Four scores moved, all upward, each traceable to fix 1 and/or 2:

  | Control | Before | After | Cause |
  |---|---|---|---|
  | DVFR_Biennial_Report_2024 | 89/B | **100/A** | 5×H1 advisory (was its only finding) |
  | WomenInPolicing2021-remediated | 88/B | 89/B | 8×H1 advisory; still capped by title-is-filename Minor |
  | 2022_SFS_Process_Evaluation | 73/C | 77/C | multiple-H1 advisory; grade unchanged |
  | Full_DJJ_Recidivism_Report | 59/F | 66/D | multiple-H1 advisory + merged-first-row tables now excluded like the gate (see §2 limitation) |

- The decorative-alt advisory fires on the real "Decorative border" file with
  no score change; the 3.1.2 disclosure cites the real `no, de, da, it` spans.

Stored/shared reports keep their stored category scores (regrade-on-read
re-derives only the aggregate), so old links are unchanged; a fresh audit of
the same file can now score higher. Same scale-drift class as v1.58.x — the
/status grade-distribution caveat already covers it.
