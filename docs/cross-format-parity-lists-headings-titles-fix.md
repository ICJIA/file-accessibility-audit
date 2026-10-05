# Cross-Format Parity: Typed Lists, PowerPoint Section Headings, Office Titles (v1.159.0)

**Date:** 2026-10-05
**Version:** v1.159.0
**Scope:** `packages/shared` (`TYPED_LIST_FLOOR`); `packages/analyzer` — a new `titleShape.ts` (moved from `pdfjsService.ts`, re-exported there), the Word, PowerPoint and Excel scorers and their conformance-gate rules; the web action plan's title step. Follow-ups #2–#4 from `table-header-parity-and-word-header-row-fix.md` §5. Each direction was a user decision.

---

## 1. Typed lists — Moderate floor (Word, PowerPoint)

**Before:** Word and PowerPoint scored lists as the share of real list items (`round(real / total × 100)`, capped at 85 when any item is typed). A list typed entirely by hand therefore scored **0 — Critical, a D ceiling**. That is the harshest outcome in any format, for a failure whose words all survive and read in order. Only the list structure (count, nesting) is missing.

**After:** the score is floored at `TYPED_LIST_FLOOR`. That constant is deliberately equal to `UNHEADERED_DATA_TABLE_SCORE` (45, Moderate): a confirmed Level A failure (1.3.1) with the content intact, the same band as an unmarked table. Partly typed lists that already scored above the floor are unchanged (1 real + 1 typed = 50; 9 real + 1 typed = 85).

**PDF** still does not score typed bullets. It could only infer them from text extracted from tagged paragraphs, where Word's evidence is exact (a paragraph with no numbering properties that starts with a bullet character). That is a documented automation limit, recorded in PDF trap 25's own truth — the same reasoning that keeps PDF's empty-heading check unscored.

## 2. PowerPoint section headings — Word's formula

**Before:** a deck with no titled slide and two or more headings typed into text boxes scored at most −40. Two typed headings read 70 (Minor, B ceiling) and four or more 60 (Moderate). The same defect scored 30 in Word and 0 in PDF, both Critical: sections that exist only visually, with the outline missing entirely.

**After:** PowerPoint uses Word's exact formula: 70 points off when no visible slide has a title, or 15 per typed heading (max 40) beside titled slides. The lone-title exemption from v1.158.0 is unchanged. `headingTitleParity.test.ts` now pins the Critical band at the threshold in all three formats.

## 3. Titles — F25 in every format

**Before:** a title that is a bare file name or a tool default fails WCAG 2.4.2 (W3C failure F25). PDF has scored it since the legal-only sweep: half the title credit and a confirmed 2.4.2. Word, PowerPoint and Excel never checked titles at all. No format recognized PowerPoint's own default, **"PowerPoint Presentation"**. The agency template in the control corpus (`16_9_ICJIA_Powerpoint_Template_2020.pptx`) carries that default, so every deck made from it does too.

**After:**
- `classifyTitleShape` and its regexes move to `packages/analyzer/src/titleShape.ts`, so the Office scorers do not import PDF.js. `pdfjsService.ts` re-exports them.
- The tool-default list gains `(Microsoft) PowerPoint Presentation [N]` in every format.
- Word, PowerPoint and Excel titles are scored exactly as PDF's:
  - **"tool-generated":** half the title credit, so 75 in every format (Excel's category is title-only), and a 2.4.2 F25 failure from the format's gate rule.
  - **"filename-shaped"** (file-name machinery around real words): full credit plus an unscored advisory.

## 4. The action plan's title step

`TITLE_PROBLEM` matched only PDF's strings, and missed PDF's own F25 scorer line ("is a filename…"; only the verdict says "looks like a filename…"). Every Office title problem and every PDF F25 therefore fell through to "Give the document a title and set its language", including on files whose language was set. The matchers now know the Office strings. Excel gets its own step, "Give the workbook a title", because a workbook has no language to set.

## 5. Verification

- **Tests, test-first:**
  - 30 API tests were RED for the predicted reasons: the classifier, three scorers, the parity file, and the 70 → 30 pin. Then 5 web tests.
  - `titleParity.test.ts` (32) gives one title string to all four formats and requires one verdict.
- **Traps:**
  - New: 166 (Word typed list → 45, 79/C), 167 (PowerPoint default title → 89/B, FOUND A REAL BUG), 168 (Word file-name title → 89/B), 169 (Excel file-name-shaped title → 100/A, advisory).
  - Updated: 145 (two typed headings → 30 Critical, 69/D) and 152 (PowerPoint typed list → 45, 79/C).
  - Restoring the old analyzer fails all six with the old behavior's exact symptoms.
- **Ledger, re-blessed at 300 rows.** Two real controls changed a category without changing their grade:
  - `16_9_ICJIA_Powerpoint_Template_2020.pptx`: title 100 → 75, still 69/D for its alt text.
  - `ICJIA_Freshservice_Quick_Guide.docx`: typed list 0 → 45, still 69/D for its title, language and contrast.

  No PDF moved.
