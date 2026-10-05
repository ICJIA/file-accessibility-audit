# One Title Line Is Not Sections — in Every Format (v1.158.0)

**Date:** 2026-10-05
**Version:** v1.158.0
**Scope:** `packages/shared` (the threshold, moved from `pdf.ts`), the Word and PowerPoint heading scorers and their conformance-gate mirrors. Follow-up #1 from `table-header-parity-and-word-header-row-fix.md` §5.

---

## 1. The defect

A document with no heading markup fails WCAG 1.3.1 only if it **visually** has section headings the markup does not convey. PDF has applied an evidence rule since 2026-09-02 (`VISUAL_HEADINGS_FOR_FAILURE = 2`), adopted after a one-page chart graded 69/D on page count alone: **one** heading-looking line is the document's title, and **two or more** are sections.

Word and PowerPoint never adopted it:

| Format | One heading-looking line, no heading markup | Grade ceiling |
|---|---|---|
| PDF | not scored | A |
| Word | −70 → 30/Critical | **D** |
| PowerPoint (one typed heading, no titled slide) | −15 → 85/Minor | **B** |

A one-page memo with a bold title line graded D as a .docx and A as a PDF. The Word value dates from 2026-07-01, before the severity cap existed.

## 2. The fix

`VISUAL_HEADINGS_FOR_FAILURE` now lives in `packages/shared/src/scoring.ts` and is read by all three scorers and all three gate rules:

- **Word** (`scoreDocxHeadings`, gate rule 3b): no Heading-styled paragraphs and **one** fake heading → heading_structure is not scored. The finding names the line, using the same wording as PDF ("a single title does not make sections, so nothing is scored"). If blank Heading-styled lines are also present, the category is still scored for them, and the lone title appears as an advisory. Two or more fake headings, or any fake heading beside real Heading styles, stay scored and gated as before.
- **PowerPoint** (`scorePptxSlideTitles` and its gate rule): no visible slide with a title and **one** typed heading → an advisory, slide_titles stays at 100. Two or more, or a typed heading beside titled slides, stay scored as before.
- **PDF**: unchanged; it now reads the shared constant.

## 3. Verification

- **Unit tests, test-first:** four Word and three PowerPoint scorer tests. Three of them failed before the change; the other four guard behavior that must not move.
- **Parity test:** `headingTitleParity.test.ts` (10 tests) pins the threshold in all three formats. With the old Word and PowerPoint rules restored, exactly the Word and PowerPoint lone-title assertions fail.
- **One fixture changed:** an existing PowerPoint test fixture (a one-slide deck, one typed heading, no title) was exactly the lone-title case. Its typed heading now sits beside a titled slide, so it still proves that a typed heading is scored.
- **Traps:**
  - **163:** a Word memo with one bold title line → 100/A. Chip: FOUND A REAL BUG.
  - **164:** two bold section lines → still caught, 69/D.
  - **165:** a one-slide deck with a typed title → 100/A.
  - **Sabotage:** the old rules fail 163 ("a lone title line was scored 30", 69/D) and 165 ("a lone typed title cost 15 points", 89/B). Traps 101 and 145 (several fake or typed headings) are unchanged.
- **Ledger:** one real control moved. `ICJIA_Freshservice_Quick_Guide.docx` went 59/F → 69/D: its only heading-like line is its own title, "Freshservice Quick Guide", in a one-row banner table. The detection verified on 2026-09-01 still runs and names that line; it is just no longer scored. The guide stays a D for its other failures (no title or language, typed bullets, contrast). Re-blessed at 296 rows.

## 4. Still open

At **two or more** heading-like lines the formats still differ in *severity*. PowerPoint caps typed headings at −40, so two read 70 (Minor) and three or more 60 (Moderate). Word and PDF go to Critical. That is §5 item 3 of the table write-up: its own decision.
