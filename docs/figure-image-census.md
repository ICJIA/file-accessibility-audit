# Images Judged by the Run They Are Painted In (v1.166.1)

**Date:** 2026-10-26
**Version:** v1.166.1
**Scope:**
- `packages/analyzer`:
  - `pdfjsService.ts`: every counted content image records the marked-content ids of the runs it is painted inside (`nonArtifactImageRuns`).
  - `scoring/common.ts`: `untaggedContentImageCount` judges each image by those runs against the tag tree's reachable ids (`structTreeMcidsByPage`), and keeps the old subtraction only for inputs without per-image evidence. Used by the alt-text scorer and the conformance gate alike.
- Traps 223 and 224 (PDF), both FOUND A REAL BUG.
- Tests: `figureImageCensus` (7, new, full pipeline).

---

## 1. The report

A user asked whether two PDFs deserved the D they were given "for missing alt tags". Both had been checked by hand first, independently of the app: the tag tree read with pikepdf, every image traced to the marked-content run that paints it, and the pages rendered.

- **The training calendar's D was right.** Its only image is the agency's logo, the only place the agency's full name appears, and its `<Figure>` has no `/Alt`. With alt text added to a copy, it grades 100/A.
- **The course catalog's D was wrong.** Its logo is described, and it is drawn as **two images inside the one run its `<Figure>` owns**: the picture, and beneath it a flat-black image with a soft, logo-shaped mask. That is its drop shadow, which this real Word for Microsoft 365 export drew as an image of its own. A decorative divider on page 8 is drawn the same way (a vector line plus a shadow strip).

## 2. The defect: a count cannot tell which image belongs to which tag

The census estimated untagged images as **images painted minus `<Figure>` tags**, clamped at zero. It had been written for one known shape, many vector figures over few rasters (44 over 5 in `controls/`), and that clamp could never invent an untagged image there. Two shapes break it:

1. **One figure, several images.** The catalog paints 3 images under 2 figures, so 1 was reported as "not tagged as `<Figure>` at all — missing from the reading order entirely". Coverage fell from 1 of 2 (50, Moderate) to 1 of 3 (33, Critical), and the grade from 79/C to 69/D. A fully repaired copy (divider artifacted, title added) still graded 79/C, and its report said both "All 1 tagged image(s) have alternative text" and "1 further content image(s) … not tagged". An image inside a `<Formula>` was counted a second time the same way.
2. **More figure tags than images.** The clamp hid any image no tag reached. An agency report in the test set graded **100/A** while its front and back covers were full-page images on pages with no tags at all: the report's title, both organisations' logos, and their addresses and phone numbers, none of it reachable by a screen reader.

## 3. The rule now

An image is untagged exactly when the finding says so: **none of the marked-content runs it is painted inside is reachable from the live tag tree.** Either it is painted outside marked content, or inside a run nothing in the tree claims. Reachability is the per-page id set qpdf already traces from the tree's root for the reading-order check, so a detached subtree reaches nothing.

| An image painted… | Before | Now |
|---|---|---|
| inside a figure, with another image beside it (picture + shadow) | the extra one "untagged" | covered by the figure |
| inside a figure's child element, or a `<Formula>` | counted again when images outnumbered tags | covered |
| outside every tag, beside vector-only figures | hidden by the clamp | untagged |
| inside a run the tree never claims (an orphan id) | counted only when images outnumbered tags | untagged |
| inside a text element (`<Sect>`, `<P>`) | counted only when images outnumbered tags | **left alone** (see §5) |

## 4. Verified rather than assumed

- **Test-first.** `figureImageCensus.test.ts` builds each case as a real one-page PDF and runs the full pipeline (qpdf + pdf.js + scorer). Five failed on the released code for the predicted reason (50 for 100, 33 for 50, 100 for 66). The orphan-run case already passed and was proven by breaking it: treating any run with an id as tagged fails exactly that test. The text-element case failed against a first, stricter cut that counted every image outside a figure or formula. That cut was withdrawn because it went beyond the rule the user approved (§5).
- **Traps 223 and 224.** The released v1.166.0 analyzer fails both with their stated symptoms: 223 at 79/C (alt 50, "the shadow was counted as a second image"), 224 at 100/A ("the untagged photograph was hidden by the figure count"). With the fix they grade 100/A and 79/C.
- **The two real files**, re-scored: calendar 69/D (unchanged, correct), catalog 79/C (was 69/D; an undescribed decorative divider and a missing title), the repaired catalog 100/A.
- **Every moved ledger row was traced to the image that moved it**, with pikepdf and the rendered page:

| Document | Change | Why |
|---|---|---|
| Budget impasse article | alt 60 → 68 | 26 images inside 23 figures: three phantoms gone |
| Lewd Sexual Display 2024 (original and remediated) | alt 11 → 16 | 9 images, all tagged inside text elements: no longer reported as missing from the reading order |
| DVFR Biennial Report 2024 | **100/A → 79/C** (alt 100 → 60) | front and back covers: full-page images, pages with no tags |
| Clinton, Cook and Douglas county profiles | alt 100 → 84 / 81 / 81, grade unchanged | the cover's county map and sidebar art, in a run the tree never claims |
| SEED brief (fixed) | alt 26 → 20, grade unchanged | 23 images on pages with no tags |

## 5. Open decision: images tagged inside a text element

An image painted inside a `<Sect>` or `<P>` run *is* in the reading order, but it has no description of its own; a screen reader passes over it. Examples in the test set include a back cover's state seal and social-media icons (COVID Death in Custody), a "DataNet" logo inside a section (the county profiles) and chart tiles 12×7 pixels wide. The census leaves these alone, because its finding says "missing from the reading order entirely" and that would be false of them. Judging them is a separate rule (PDF/UA expects meaningful graphics to be figures), and needs the tiny-image skip made reliable first (§6).

## 6. Follow-up: the tiny-image skip is not deterministic

pdf.js skips images under 50 px a side (`MIN_IMAGE_DIM`), but only reads an image's size from its decoded object, and an image may not be decoded yet when the operator list is walked. In both real files in §1, none was, so every image counted whatever its size; in small uncompressed fixtures, every one was. pdf.js puts each image's width and height in the operator's own arguments (`[objId, w, h]`), which would make the skip deterministic. Not changed here: it moves image counts across the corpus on its own and deserves its own ledger review.
