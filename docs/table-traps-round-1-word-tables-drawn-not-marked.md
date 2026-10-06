# Table Traps, Round 1: Word Tables Judged by What They Draw (v1.162.0)

**Date:** 2026-10-06
**Version:** v1.162.0
**Scope:** `packages/analyzer/src/docxService.ts`: `isVisibleBorder`, `drawsBorders`, `buildTableStyleDraws`, and the `looksLikeLayout` rule in `extractTables`. The Word bare-grid advisory wording, in `scoring/docx.ts` and the `docx-layout-grids` best-practice row. Traps 186–192.

The user asked for more table traps after noticing that tables cause the most problems. The record agrees: 7 of the first 15 bugs on the trust page's bug card were table bugs. Every trap here was written and run **before** any fix, so each one shows how the checker actually behaved.

---

## 1. The probe

Eight encodings of one 2×3 Word table were run through the real parser before anything else was written:

| Encoding | `looksLikeLayout` | Table score | Verdict |
|---|---|---|---|
| Bare grid: no style, borders or shading | true | 100 | right |
| Table borders all `w:val="nil"` | **false** | **45** | wrong: an invisible grid accused |
| Table borders all `w:val="none"` | **false** | **45** | wrong |
| Visible table borders | false | 45 | right |
| Visible borders on the **cells** only (`w:tcBorders`) | **true** | **100** | wrong: a drawn data table never checked |
| Named style "a" that draws nothing (Google Docs' shape) | **false** | **45** | wrong |
| Style "Table Grid" (draws every border) | false | 45 | right |
| Style "TableNormal" (Word's Normal Table, draws nothing) | **false** | **45** | wrong |

Since the 2026-08-29 legal-only sweep, the rule has been: a table with nothing drawn and no header marks is a layout construct. It is never scored or gated, and an advisory asks a person to glance at it. The implementation tested which **elements** a table carried, not what they **draw**:

- any `w:tblBorders` counted, even with every edge switched off;
- any `w:tblStyle` counted, even a style that draws nothing;
- borders on the table's own cells were never looked at.

This is the border twin of v1.157.0's "no shading" bug (trap 162). An explicit "no" was read as a "yes".

## 2. The fix

- **`isVisibleBorder`:** a border edge whose `w:val` is `nil` or `none` draws nothing.
- **`drawsBorders`:** a `w:tblBorders` or `w:tcBorders` container draws only if at least one edge is visible.
- **`buildTableStyleDraws`:** a table style draws if its table, cell or conditional-format (`w:tblStylePr`) properties carry a visible border or shading, following `w:basedOn`.
  - A style the styles part does not define is treated as drawn. That was the old behaviour for every named style, and nothing proves such a style draws nothing.
  - The one exception is Word's built-in Normal Table (`TableNormal`), which by definition never draws.
- **`looksLikeLayout`** now requires all of these:
  - no header marks;
  - no style that draws;
  - no visible table border;
  - no visible border on the table's **own** cells (rows → cells, not nested tables);
  - no visible shading.

The bare-grid advisory now says "nothing drawn (no visible border or shading from the table, its cells, or its style)" instead of "no table style, borders, shading". A grid can carry a style and still be bare.

## 3. The traps (Office battery 186–190, PDF battery 191–192)

| Trap | Shape | Before the fix | Truth |
|---|---|---|---|
| 186 | Layout grid, every border `w:val="nil"` | 45, 79/C, 1.3.1 | layout: 100/A with the advisory (FOUND A REAL BUG) |
| 187 | Layout grid with style "a" that draws nothing | 45, 79/C | layout: 100/A with the advisory |
| 188 | Data table, cell borders only, no header row | 100/A (missed) | 45, 79/C, 1.3.1 |
| 189 | Twin of 188, Header Row ticked | 100/A | 100/A |
| 190 | Data table bordered by the Table Grid style, no header row | 45, 79/C | 45, 79/C, the guard for the style rule |
| 191 | PDF table grouped in `<THead>`/`<TBody>`/`<TFoot>` | 100/A | 100/A |
| 192 | PDF schedule with headers down the first column, no Scope | 100/A | 100/A, Scope reported but not scored |

**Proven guards.** Each held trap fails when the code it guards is removed:

- Making table styles never draw fails 190: a styled data table slips through as layout.
- Ignoring THead/TBody/TFoot fails 191: the table silently drops out of scoring.
- Ignoring the row-header direction fails 192 at 89/B.

Traps 186–188 failed on the code before the fix, which is the trap-first proof.

## 4. What the probe did not change, and why

- **PDF layout grids.** A Word bare grid is not scored; the same grid saved as a PDF becomes a `<Table>` with no `<TH>`, and PDF accuses it. No real PDF in the test set shows the gap: its 30-plus-row tables without headers, in the FY21, FY22 and SFY24 annual reports, are genuine budget tables. The only evidence a PDF offers is the borders drawn in its page content. **Open question for the user.**
- **Header cells that are empty**, in any format, and **Excel tables still headed "Column1, Column2…"** (the defaults Excel inserts when an author skips headers). The header row exists, so 1.3.1 is met structurally, but it labels nothing. **Open question for the user**, likely advisory-only.
- **Nested tables.** Word and PDF both skip a table nested inside another when judging headers. That matches the 2026-08-29 rule (nesting is reported, not scored), so it is not a difference between formats.
- **Word's "First Column" box** is ticked on every new table by default (`tblLook` 04A0), so it cannot serve as evidence of row headers.

## 5. Verification

- **Tests:** `docxService.test.ts` +8, covering both off values, one visible edge among none, cell borders on and off, a style that draws nothing, a style that draws through `basedOn` or a conditional format, and an undefined style.
- **Ledger:** re-blessed at 323 rows. Only the seven new trap rows were added; no real document moved. No real Word file in the test set carries a table style, which is itself the finding: Google Docs and LibreOffice exports were never represented.
- **Gates:** `legal-basis`, `best-practice-basis`, `resave-invariance` and `encoding-invariance` all pass.
- **`pnpm audit --prod`:** 6, the same six as v1.161.1 (`simple-git` ×4 through Nuxt devtools, `braces`, `node-forge`).
