# Remediation results match the findings + text-extractability step copy fix

**Date:** 2026-08-15 ·
**Trigger:** a user-reported PDF (`controls/ARIFactSheet-SFY26-20260427T20572257.pdf`,
the ARI SFY26 fact sheet, 60/D) whose audit was "graded down for *Make the text
readable by screen readers*" — mystifying, because the document's text is fully
readable — and whose auto-remediation results then said **nothing** about that
finding, neither changed nor unchanged.

---

## Paste-ready — reply to the person who reported it

> **Issue 1:** The fact sheet's text is actually fine — 5,447 characters extract
> cleanly and the document is properly tagged. The only text-layer deduction was
> three fonts not embedded in the file (Times New Roman ×2, Arial), a **Minor**
> 15-point advisory: on a computer without those fonts, text can display or read
> back garbled. The fix step was mislabeled with the much scarier copy written
> for scanned documents ("some or all of this document is a picture of text"),
> which is what made a small finish item read like a fundamental failure. The
> step now says what was actually found: *Embed the fonts so the text stays
> correct everywhere.* And to the "shouldn't this be the most critical thing?"
> question — it is, when it's real: a document whose text genuinely can't be
> read (a scan) scores **0 overall**, no matter what else it does well.
> **Issue 2:** The remediation results now list **every** finding from the audit
> with an explicit outcome — *fixed*, *improved — not fully fixed*, **no
> change**, *got worse*, or *newly flagged* — with before → after scores, so
> what the automatic pass did (or couldn't do) to each finding is stated
> outright. For this file: heading structure 0→100 (fixed), reading order 65→85
> and alt text 42→46 (improved), title/language 50→50, tables 75→75, and the
> font advisory 85→85 (no change — font embedding isn't something the automatic
> tagging pass does).

---

## What happened

### 1. One category id, four different problems, one (wrong) fix step

`text_extractability` covers four failure modes with very different remedies:

| Mode | Analyzer marker finding | Category score | Right fix |
| --- | --- | --- | --- |
| Security settings deny AT access | "…deny assistive-technology access…" | 0 | Security tab → allow text access |
| Scanned / no text | "No extractable text found" (± tags) | 0 / 25 | OCR, then tag |
| Text but no/empty tag tree | "Document is NOT tagged…" / "…present but EMPTY…" | 50 | Autotag |
| Non-embedded fonts only | "Document is tagged (StructTreeRoot present)" **+** "N non-embedded font(s)…" | capped at 85 (Minor) | Embed fonts |

The Visual view's action plan (`PLAN_COPY` in `apps/web/app/utils/actionPlan.ts`)
had **one** entry for the id, written for the scanned mode: title *"Make the
text readable by screen readers"*, why *"…right now some or all of this document
is a picture of text"*, steps *run OCR, then autotag*. For the ARI fact sheet —
text extracts, tags present, fonts unembedded — every word of that was wrong,
and the OCR advice was actively harmful for a text PDF.

**Fix:** `buildActionPlan` now picks the copy by failure mode, detected from the
finding strings the analyzer has emitted verbatim into every stored report
(`TEXT_EXTRACTABILITY_VARIANTS`, checked security → untagged → fonts). Anything
unrecognized — old reports, other formats — keeps the original entry, so a
failed match can only reproduce the previous behavior. All menu paths reuse
strings already verified in `docs/fix-step-accuracy-2026-08.md` and the
analyzer's own findings. The scoring itself was **not** changed: Minor is
correct for a fonts-only advisory, and the scanned guard already makes a truly
unreadable document score 0 overall.

### 2. Remediation results didn't state what happened to each finding

The result page (`apps/web/app/pages/remediate/[jobId].vue`) bucketed categories
by score movement: "Fully fixed" (rose to ≥80), "Improved but still low" (rose,
still <80), and severity-grouped "outstanding" lists. Reproduced on the ARI file
(pipeline run: 60/D → 77/C), two real defects:

- **A category could render twice, contradictorily** — reading_order 65→85
  appeared under BOTH "Fully fixed (+20)" AND "Minor issues still outstanding"
  (≥80 isn't clean; Minor is 80–89).
- **An unchanged category was never described as unchanged** — 85→85
  text_extractability appeared only in the Minor outstanding list, which showed
  its first three raw findings: `PDF contains extractable text`, `Document is
  tagged…`, `Extracted 5,729 characters…` — all positive; the font problem
  (finding #7) never rendered, and no before → after or "no change" statement
  existed anywhere.

**Fix:** new pure module `apps/web/app/utils/remediationOutcome.ts`
(`buildRemediationOutcome`) gives every category flagged before or after
remediation exactly one disposition — `fixed` / `improved` / `unchanged` /
`declined` / `new` — and the page renders one still-flagged list (severest
first) where each row shows the severity chip, the disposition in words
("**No change** — the automatic pass could not improve this…"), before → after
scores, the **action plan's own step copy** for that category (same
`buildActionPlan`, so both surfaces name each finding identically — including
the new font-mode copy), and the per-category Acrobat next step. The logic is a
separate module because the page can only be source-scanned in tests (same
pattern as `publishReadiness.ts`).

Also: the page's `acrobatStepsByCategory.text_extractability` hint now covers
the fonts case (Fonts tab + Preflight → Embed missing fonts).

## Verification

- Unit fixtures are the **real** before/after audits from running the actual
  pipeline (qpdf normalize → OpenDataLoader tag → re-audit) on the ARI file.
- Live check on the running dev app: a fresh audit of the file, stored as a
  shared report, SSRs *"Embed the fonts so the text stays correct everywhere"*
  with the old title and "picture of text" absent from the plan.
- Tests 2,214 → **2,239** (web 988 → 1,013): `actionPlan.test.ts` +8 variant
  tests, `remediationOutcome.test.ts` (new, 9), 
  `remediationResultsMatchFindings.test.ts` (new, 7, source-inspected wiring),
  `reportVisualView.test.ts` +1 fonts-mode wiring test. All preserved pins
  (details-open-by-default, download placement, version note, table semantics)
  still green.

## Where the strings live (for the next accuracy pass)

- `apps/web/app/utils/actionPlan.ts` — `TEXT_EXTRACTABILITY_VARIANTS` (fonts /
  untagged / security entries) + the unchanged `PLAN_COPY.text_extractability`
  default (scanned mode)
- `apps/web/app/utils/remediationOutcome.ts` — disposition rules
- `apps/web/app/pages/remediate/[jobId].vue` — still-flagged list markup,
  disposition labels, fonts-aware `text_extractability` Acrobat hint
