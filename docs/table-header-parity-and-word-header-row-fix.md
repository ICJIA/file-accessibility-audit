# Table Header Parity & Word's Header Row Checkbox (v1.157.0)

**Date:** 2026-10-05
**Version:** v1.157.0
**Scope:** `packages/shared` (one shared constant), `packages/analyzer` — the Word parser (`docxService.ts`) and the table scorers for all three Office formats — plus fix-it copy in the analyzer and web app. Five defects, one trigger document.

---

## 1. Context

A real agency meeting agenda (`Ocotber  13th USCS Task Force Meeting Agenda.docx`, now a pinned control) graded **69/D**. Every category scored 100 except Table Markup: one bordered roll-call table (*Task Force Member | Present | Absent*, a bold first row, blank attendance cells) reported "1 data table(s) have no header row" at 30/Critical — and a Critical caps the whole document at 69.

Auditing that one finding against the file, the tool, and the published guidance turned up five separate defects. Two are about the grade the table earned; three are about how the checker decided whether it was a data table with a header at all.

## 2. Findings

### 2.1 The same failure scored three different grades by file format

A data table whose header row is not marked fails WCAG 1.3.1 the same way (W3C failure F91) whatever program made the file. The tool scored it:

| Format | Rule | Category | Ceiling for an otherwise-clean file |
|---|---|---|---|
| Word | fixed 30 per table, averaged | 30 Critical | **69/D** |
| PowerPoint | fixed 30 per table, averaged | 30 Critical | **69/D** |
| PDF | component rubric (0 of the 40 header points) | 45 Moderate | **79/C** |
| Excel | 100 − 30 **per table** | 70 Minor | **89/B** |

Pinned single-defect traps proved it (`synthetic-105` Word 69/D, `synthetic-76` PDF 79/C, `synthetic-136` Excel 89/B). The Word and PowerPoint values were written 2026-07-01/02 and Excel's on 07-02 — five weeks **before** the severity cap (2026-08-07) turned a category's band into a grade ceiling. Back then a 30 in a 12%-weight category cost a few points; afterwards it was a D. Nobody re-checked parity, and the trap fixtures added 2026-08-28/29 pinned whatever the scorers already produced, so CI enforced the mismatch. Excel's per-table subtraction also piled up: two headerless tables scored 40, four scored 0.

**Fix:** one shared value, `UNHEADERED_DATA_TABLE_SCORE = 45` (`packages/shared/src/scoring.ts`), used by all three Office scorers, averaged per data table. 45 is what the PDF rubric already awards a lone TH-less table. **Moderate** is the principled band: a confirmed Level A failure (so not Minor), but the cells' text is all present and reads in order (so not the Critical tier of an untagged PDF or a file with neither title nor language).

### 2.2 Word ignored the checkbox Microsoft tells authors to use

The Word parser accepted exactly one header mark: **Table Layout → Repeat Header Rows** (`w:tblHeader` on the first row). It ignored **Table Design → Header Row** (`w:tblLook` `firstRow`), which is:

- **Microsoft's documented method.** "Make your Word documents accessible to people with disabilities": *"On the Design tab, choose the Table Styles Options group, and then choose Header row."*
- **Accepted by Microsoft's own Accessibility Checker.** Rule "Tables specify column header information": *"Tables and/or blocks of cells have the header box selected or a header row indicated."*
- **What Word 365 tags as `<TH>` when saving to PDF.** axes4 (makers of PAC), accessible-pdf.info: *"up to and including version 2016, these options only affect the visual formatting, but not the PDF output. In the 365 version, the header cells are automatically tagged correctly."*
- **What this tool already honored in PowerPoint and Excel** — their identical Table Design → Header Row checkbox has always been the header mark (`pptxService.ts`, `xlsxService.ts`).

The web app's own fix advice also told Word authors to "check Header Row" (`actionPlan.ts`, `SourceDocumentNotice.vue`, `pdfUaFixHint.ts`) — so an author who followed the report's advice was still flagged by the report.

The agenda's table had the box ticked (`w:tblLook w:val="04A0" w:firstRow="1"` — Word's default for every new table). The finding was a false positive.

**Fix:** `hasHeaderRow` is true for a first-row `w:tblHeader` **or** `w:tblLook` firstRow — the explicit attribute, or bit `0x0020` of the legacy hex `w:val` Word 2007 wrote (an explicit attribute wins). The checkbox deliberately does **not** count as a data-table indicator in the layout heuristic: Word ticks it on every table, so it says nothing about whether a bare grid holds data. The agenda re-grades **69/D → 100/A**; a census of every Word table in the corpus showed it is the only control document whose result changes.

The fix-it text for the Word finding, the conformance verdict, the WCAG map's remediation, and the bare-grid advisory now lead with Table Design → Header Row; the WCAG map keeps one accurate note that Word 2016 and earlier also need Repeat Header Rows before a saved PDF marks the row.

### 2.3 Layout tables diluted the penalty in Word and PowerPoint

Word and PowerPoint averaged the table score over **every** table, counting a layout grid or one-row strip as a passing 100 — so the same unheadered table scored 45 alone but 73 (Minor) beside a layout grid. The PDF rubric has always scored only its data tables. **Fix:** all three Office scorers now average over data tables only (Word: ≥2×2 and not layout-like; PowerPoint: ≥2×2; Excel: multi-column defined tables). A document with no data tables keeps its 100.

### 2.4 "No shading" counted as shading (latent)

The Word layout heuristic treated any `<w:shd>` element as evidence of a styled data table. Content pasted from a web page, Outlook or Teams carries `<w:shd w:val="clear" w:color="auto" w:fill="auto"/>` on every cell and run — the explicit mark for **no** shading — so a borderless pasted layout grid read as a data table, which is scored and accused of 1.3.1 when no header row is marked. The agenda's table carried exactly these marks (it also had real borders, so it was a data table for the right reason). **Fix:** `isVisibleShading()` — `w:val="nil"` and `clear`+`auto`/absent fill are no shading; a hex fill, a theme fill, or any pattern value is.

### 2.5 The PDF advice promised that Word writes `/Scope`. Its built-in Save as PDF does not.

Five places told authors that ticking Header Row in Word and re-exporting means "Word writes the scopes for you". Checked against the corpus:

| Export path | Files checked | `<TH>` cells | `/Scope` or `/Headers` |
|---|---|---|---|
| Producer "Microsoft® Word for Microsoft 365" (Windows Save as PDF) | 4 | 8 – 57 each | **none, in any file** |
| Acrobat PDFMaker add-in for Word (9.1, 20) | 3 | yes | `/Scope` present |
| Creator "Microsoft Word", no Producer recorded | 4 | yes | `/Scope` present |

axes4 says the same of Word 365's export: *"these `<TH>` tags lack the Scope attribute."* For a two-axis table — the only case where missing Scope is scored — the advice sent authors in a loop: re-export, still flagged. **Fix:** the copy in `scoring/pdf.ts` (two findings), `bestPractices/pdf.ts`, `pdfUaFixHint.ts`, and `actionPlan.ts` now says Word's built-in Save as PDF leaves Scope off, that Acrobat's PDFMaker add-in for Word writes it on marked header cells, and that Scope can be set in Acrobat after exporting.

## 3. Verification

- **Test-first.** `tableHeaderParity.test.ts` (27 tests, new) failed 9 ways before the scorer change and 3 more before the data-tables-only average, each for the predicted reason; `docxService.test.ts` gained 8 — four RED before the parser change (Header Row, the legacy hex bit, explicit-wins, no-fill shading) and four guards that held throughout (unticked, repeat-only, the default box never makes a bare grid data, a real fill still counts).
- **Traps.** Six new — `157` the agenda as authored (Header Row ticked → 100/A), `158` box unticked and no repeat (→ 45 Moderate, 79/C, 1.3.1 named), `159` Repeat Header Rows only (→ 100/A), `162` the pasted borderless grid (→ layout, never accused), `160`/`161` the first PowerPoint table pair. Traps 105, 136 and the PDF traps 08 and 76 now assert the identical parity truth (`unheaderedTableParity` in both batteries).
- **Sabotage.** Restoring the old value (30) fails 105, 136 and 160 — "severity Critical, not Moderate", 69/D. Restoring the old Word parser fails 157 ("Header Row ticked, yet the table scored 45") and 162 ("a pasted layout grid was scored 45 as a data table").
- **Ledger.** Exactly the intended movement: 105 69/D → 79/C, 136 89/B → 79/C, seven new rows (the agenda + six traps); every other row — all real PDF, Word, PowerPoint and Excel controls — unchanged. Re-blessed in the same commit: 293 rows.
- **Gates.** legal-basis, best-practice-basis, both trap batteries, resave-invariance, encoding-invariance — all green.

## 4. Not changed

- PDF scoring — 45 was already the reference; only two PDF findings' fix-it sentences changed.
- Which tables are gated: the conformance predicates (`conformance.ts` rule 4 and its PowerPoint/Excel twins) are unchanged; they read `hasHeaderRow`, which now honors the checkbox.
- The severity bands and grade ceilings.

## 5. Found, not fixed (follow-ups)

A cross-format sweep run alongside this fix found the same class of mismatch elsewhere — Office values set before the severity cap, never re-checked. In order of impact:

1. **Fixed in v1.158.0 — see `one-title-line-heading-parity-fix.md`.** **One bold title line in a document with no heading styles:** Word 30/Critical (D), PowerPoint 85/Minor (B), PDF not scored (A). The PDF rule — "two or more is sections; one is a title" (2026-09-02) — was settled after a real one-page document graded D; Word and PowerPoint never adopted it.
2. **A list typed entirely by hand:** Word and PowerPoint 0/Critical (D); PDF does not detect typed bullets (A).
3. **Several fake headings and no real ones:** PDF and Word Critical (D); PowerPoint 70/Minor (B) for two, Moderate at three or more.
4. **A title that is a filename or tool default ("Document1"):** PDF 75/Minor under W3C F25; never checked in Office.
5. Smaller: Excel leaves default-white contrast unassessed where Word assumes white; Office rounds alt-text and link ratios with an 85 cap PDF never adopted; PowerPoint and Excel lack Word's guard for an unreadable properties part; PowerPoint has no layout-grid exemption for tables.

Each is a scoring-policy decision and is left for its own release.
