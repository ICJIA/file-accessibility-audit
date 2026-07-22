# Orphaned-figure false-positive fix (v1.36.2)

**Date:** 2026-07-22 · **Tag:** `v1.36.2` · **Trigger:** a user-reported PDF
(`controls/2022-DVFR-Annual-Report-A0.pdf`) that scored **89/B** on a false
"3 of 6 images missing alt text" finding. With the fix it scores **96/A** with
an accurate verdict.

---

## Paste-ready — reply to the person who reported it

> **Issue:** The 2022 DVFR Annual Report was flagged for "images missing alt
> text," but that was a false positive — the file carries leftover "phantom"
> figure tags from its original design software that no screen reader actually
> reads, and the audit was mistakenly counting those as untagged images.
> **Mitigation:** We've fixed the audit engine to ignore those disconnected
> phantom tags and to recognize when a page's images are correctly marked as
> decorative; with the fix, the report scores **96/A** (up from 89/B). The
> correction ships with our next update.

## Paste-ready — internal team note

> **Thanks for flagging the 2022 DVFR Annual Report — it was a false positive.**
> The audit was reporting "images missing alt text" for leftover *phantom*
> figure tags that Adobe/InDesign leaves in the file's structure but that no
> screen reader ever reads (the actual images on pages 1 and 38 are correctly
> marked as decorative). We shipped a fix (v1.36.2) so the audit ignores those
> disconnected phantom tags and recognizes when a page's images are all
> intentionally decorative and need no description. With the fix, that report
> scores **96/A (up from 89/B)**, and we verified the change touched *only* this
> false-positive pattern — every other test document scored identically.

---

## What happened (correlation with the reporter's analysis)

The reporter's screenshot was **right that it's a false positive** but **wrong
about the mechanism**. It guessed the tool does "a shallow scan for the string
`/Figure` in the content stream." It does not — the tool correctly walks the
structure tree. The real cause:

- The file's 4 visible images (pages 1 and 38) are all wrapped in `/Artifact`
  marked-content — correctly decorative, correctly skipped by assistive tech.
- The struct tree also carries **6 `<Figure>` objects**, but all 6 are
  **orphaned**: no `/P` parent, and named by no element's `/K`. Nothing in the
  live tree reaches them — they're export leftovers (InDesign → Acrobat).
- The qpdf walk collected every object with `/S /Figure`, orphans included, so
  the 3 without `/Alt` were reported as content images missing alt text.

## The fix (two parts, both PDF-path)

1. **Orphaned `<Figure>` phantoms are dropped** — `packages/analyzer/src/qpdfService.ts`.
   A figure survives only if it is reachable in the live tree: it carries a
   `/P`, or some element names it in a `/K` (`collectStructKidRefs` builds the
   referenced-ref set; the filter runs after the object walk).
2. **Fully-artifacted image sets read as "no content images"** —
   `pdfjsService.ts` now reports `nonArtifactImageCount` (painted images outside
   any `/Artifact` run); `scoring/pdf.ts` uses it so that with 0 figures and
   every painted image artifacted, the category is a clean N/A ("all images are
   decorative artifacts") instead of the "images but no `<Figure>`" advisory.

Both changes are score-neutral except where intended (`alt_text` is notAssessed
either way), so no other control document's score moves.

## Regression fixtures (added to `controls/` this release)

`controls/` is `.gitignore`d; these were committed with `git add -f`. Expected
scores under v1.36.2 (re-run `pnpm tsx` against the analyzer to check):

| File | Overall | alt_text | Role |
| --- | :--- | :--- | --- |
| `2022-DVFR-Annual-Report-A0.pdf` | **96/A** | N/A (all artifacts) | **The bug repro** — was 89/B before the fix |
| `2022_DVFR_Annual_Report_Final_a688e16b10_a00d65b63f.pdf` | 92/A | 100 (2 tagged figures) | Clean sibling — properly tagged images |
| `DVFR_Biennial_Report_2024_FINAL_PUBLISHED_d01bf7bffd.pdf` | 95/A | 100 (3 tagged figures) | 2024 biennial |
| `2026_dvfrc_biennial_report_A1_c33b9d5430.pdf` | 100/A | N/A (all artifacts) | 2026 biennial |

## Verification

- Controls corpus: **only the A0 file moved** (89/B → 96/A); the other 22 PDFs
  are byte-identical before/after.
- Tests **1,537 → 1,541** (API 999 / Web 493 / CLI 49); build and typecheck
  clean. New coverage: orphaned-figure exclusion + `/K`-reachability
  (`qpdfParser.test.ts`), artifact-aware alt-text N/A (`scorer.test.ts`).
