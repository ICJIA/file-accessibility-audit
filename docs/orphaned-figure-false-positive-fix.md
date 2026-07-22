# Orphaned struct-tag false positives fix (v1.36.2 + v1.36.3)

**Date:** 2026-07-22 · **Tags:** `v1.36.2` (figures) + `v1.36.3` (lists & tables) ·
**Trigger:** a user-reported PDF (`controls/2022-DVFR-Annual-Report-A0.pdf`) that
scored **89/B** on false phantom-tag findings. With both fixes it scores
**100/A** with an accurate verdict.

---

## Paste-ready — reply to the person who reported it

> **Issue:** The 2022 DVFR Annual Report was flagged for "images missing alt
> text" and for broken ("incomplete") lists and tables — all false positives.
> The file carries leftover "phantom" tags from its original design software
> (images, plus dozens of empty list and table tags) that no screen reader
> actually reads, and the audit was counting them as real content.
> **Mitigation:** We've fixed the audit engine to ignore any tag that isn't
> connected to the document's live structure tree, and to recognize when a
> page's images are correctly marked as decorative. With the fix, the report
> scores **100/A** (up from 89/B). The correction ships with our next update.

## Paste-ready — internal team note

> **Thanks for flagging the 2022 DVFR Annual Report — the alt-text, list, and
> table findings were all false positives from the same cause.** Adobe/InDesign
> left "phantom" tags in the file's structure (6 images, 27 empty lists, 3
> tables) that aren't part of what a screen reader reads, and the audit was
> scoring them as real content. We shipped two patches (v1.36.2 for images,
> v1.36.3 for lists/tables) so the audit ignores any tag not reachable in the
> live structure tree. That report now scores **100/A (up from 89/B)**, and we
> verified the change touched *only* this false-positive pattern — every other
> test document scored identically.

---

## What happened

The reporter's screenshot was **right that it's a false positive** but **wrong
about the mechanism** (it guessed a "shallow scan for the string `/Figure`" — the
tool actually walks the structure tree correctly). The real cause is one class of
bug affecting three tag types:

- The file's visible images (pages 1 and 38) are all wrapped in `/Artifact`
  marked-content — correctly decorative, correctly skipped by assistive tech.
- The struct tree also carries **orphaned phantom objects**: 6 `<Figure>`, **27
  `<L>` lists**, and 3 `<Table>` — each carrying `/S` but with **no `/P` parent
  and named by no element's `/K`**. Nothing in the live tree reaches them
  (InDesign → Acrobat export leftovers).
- The qpdf walk collected *every* object with `/S`, orphans included — so the 3
  alt-less figures became "images missing alt text", the 27 empty lists became
  "incomplete structure" (and a false WCAG 1.3.1 conformance failure), and the 3
  phantom tables dragged `table_markup` to 70.

## The fix

**v1.36.2 (figures):**

1. Orphaned `<Figure>` phantoms dropped; a figure survives only if reachable.
2. Fully-artifacted image sets read as a clean "all images are decorative
   artifacts" N/A (via pdfjs `nonArtifactImageCount`) instead of an "images but
   no `<Figure>`" advisory.

**v1.36.3 (generalized) — `packages/analyzer/src/qpdfService.ts`:**

3. The reachability gate now covers `<Figure>`, `<L>`, and `<Table>` alike. An
   element is collected only if `structReachable` — it carries a `/P` or is named
   in some `/K`. The reachable-ref set (`referencedStructRefs`) is built in a
   pre-pass, guarded by `docHasStructTree` so an untagged document (no
   StructTreeRoot) is never pruned. Headings, paragraphs, MCIDs and other signal
   counts are **not** gated — no control document carries orphaned ones.

All changes are score-neutral except where intended, so no other control
document's score moves.

## Regression fixtures (tracked in `controls/`)

`controls/` is `.gitignore`d; these were committed with `git add -f`. Expected
scores under v1.36.3 (re-run the analyzer to check):

| File | Overall | Role |
| --- | :--- | --- |
| `2022-DVFR-Annual-Report-A0.pdf` | **100/A** | **The bug repro** — 89/B (pre-fix) → 96/A (v1.36.2) → 100/A (v1.36.3) |
| `2022_DVFR_Annual_Report_Final_a688e16b10_a00d65b63f.pdf` | 92/A | Clean sibling — properly tagged images |
| `DVFR_Biennial_Report_2024_FINAL_PUBLISHED_d01bf7bffd.pdf` | 95/A | 2024 biennial |
| `2026_dvfrc_biennial_report_A1_c33b9d5430.pdf` | 100/A | 2026 biennial |

## Verification

- Controls corpus: **only the A0 file moved** (89/B → 100/A across the two
  patches; v1.36.3 leg: lists 71 → 44, tables 5 → 2, `table_markup` 70 → 100,
  conformance failures 1 → 0); the other 22 PDFs are byte-identical.
- Tests **1,537 → 1,544** (API 1002 / Web 493 / CLI 49); build and typecheck
  clean. Coverage: orphaned figure/list/table pruning + `/K`-reachability +
  treeless guard (`qpdfParser.test.ts`), artifact-aware alt-text N/A
  (`scorer.test.ts`).
