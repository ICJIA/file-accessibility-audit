# Table Traps, Round 2: PDF Tables Judged by What They Draw, and Headers That Label Nothing (v1.163.0)

**Date:** 2026-10-06
**Version:** v1.163.0
**Scope:**
- `packages/analyzer`:
  - `qpdfStructTree.ts`: `contentIds`, `pdfjsContentId`.
  - `pdfjsService.ts`: `paintedPathBoxes`, `tableRegionsForPage`, `TableRegion`, the region pass.
  - `scoring/common.ts`: `pdfTableDrawsNothing`, `isPdfDataTable`.
  - `scoring/pdf.ts` and gate rules 7 and 7c in `scoring/conformance.ts`.
  - Empty-header detection in the Word, PowerPoint and PDF parsers, and Excel's default-name detection.
- Traps 193–198. Traps 08, 27 and 76 now draw ruled lines.

These are the three questions left open by round 1 (`table-traps-round-1-word-tables-drawn-not-marked.md` §4). Each direction was a user decision.

---

## 1. PDF tables that draw nothing (decision: "detect drawn lines")

**The gap:** Word has never scored a bare grid, a table that draws nothing and carries no header marks. The same grid saved as a PDF became a `<Table>` with no `<TH>`, and PDF accused it of a missing header row.

**Measured first.** Every `<Table>` in the corpus PDFs was checked for whether its page draws anything in the table's area:

- **38 header-less tables draw lines.** They include the real budget tables in the FY21, FY22 and SFY24 annual reports; they are still accused, correctly.
- **7 header-less tables draw nothing.** All are in the Juvenile Justice 2007 report, and all are prose that an autotagger cut into "cells". None is a data table.
- **5 tables that do have `<TH>` also draw nothing.** Borderless data tables exist; the decision accepts that one *without* header cells would be read as layout.

**How it works:**

- **`analyzeTable`** records the first marked-content ids of each table's cells in pdf.js's own form (`p12R_mc3`), taking the page from the cell, an ancestor, or an MCR dict.
- **`paintedPathBoxes`** walks pdf.js's operator list to find the page-space boxes of every path the page *visibly* paints. It tracks the current transform (`cm`, `q`/`Q`, form XObjects) and the fill and stroke colours. A near-white or transparent paint draws nothing, and a clipping path is never painted.
- **`tableRegionsForPage`** gives each `<Table>`'s area on a page (the union of its cells' text boxes) and whether any painted path lies in it. Shapes more than 4× the table's area are backgrounds and don't count. A table with no attributable text gives no region.
- **`pdfTableDrawsNothing`** requires three things: the table has no header cells, at least one region matches its ids, and every matched region drew nothing. **No match means no evidence**, and the old rule stands: a data table.
- **`isPdfDataTable`** is the one predicate the scorer and gate rules 7 and 7c now share.

A bare table is excluded from scoring, as single-column scaffolds always were. A new advisory says the table has "no header cells and nothing drawn" and asks a person to look.

**Corpus effect:** no real document moved. The JJ 2007 prose "tables" sit on pages whose text cannot be reliably attributed to their tags, so they offer no evidence and keep the old verdict.

**Fixtures.** The battery's PDF table builders never drew a line, so three existing traps whose defects live in *data* tables (08, 27, 76) now draw ruled lines, as real exporters do; InDesign tables carry 1-pt rules by default.

- Trap 27's check is strengthened. It only looked for the word "inconsistent", which the overview still printed while the table went unscored. It must now lose points and name 1.3.1.
- Trap 08's fixture gives pdf.js an empty structure tree, so 08 rests on the no-evidence path. It is ruled anyway, for robustness.

## 2. Headers that label nothing (decisions: report, don't score)

**Empty header cells, in every format.** A header row is marked but none of its cells holds text (PDF: no text and no `/Alt`):

- **Word and PowerPoint** set `emptyHeaderRow`. Word only reports it for data tables, since its layout rule never reads the Header Row box.
- **PDF regions** set `emptyHeaders`.

The header structure exists, so 1.3.1 is met on paper. The finding reads "Advisory — not scored: … header row whose cells are all empty" (PDF: "header cells (`<TH>`) with no text").

**Excel's default names.** Excel names header cells "Column1", "Column2" … when a range becomes a table without one. `defaultHeaderNames` lists any still present (or blank), and the advisory quotes them.

The new fields are optional and written only when they say something, so stored payloads and exact-shape tests are unchanged.

## 3. Verification

- **Tests, test-first:**
  - `pdfTableDrawn.test.ts` (new, 16): content ids, painted boxes, regions, the predicate, and scoring.
  - `tableHeaderLabels.test.ts` (new, 10): every format.
  - Every new test was RED for the predicted reason; the guards passed.
- **Traps:**

  | Trap | Document | Result | Chip |
  |---|---|---|---|
  | 193 | Header-less PDF table drawing nothing | 100/A, advisory | held |
  | 194 | Same table, ruled | 45, 79/C | caught |
  | 195 | PDF `<TH>` cells all empty | 100/A, advisory | caught |
  | 196 | Word header row, all cells empty | 100/A, advisory | caught |
  | 197 | PowerPoint header row, all cells empty | 100/A, advisory | caught |
  | 198 | Excel "Column1, Column2" | 100/A, advisory | caught |

  - The stashed analyzer fails 193 and 195–198 with the old symptoms.
  - Blinding the drawn-line detector fails 27, 76 and 194; each would be wrongly exempted as layout.
- **Ledger:** re-blessed at 329 rows. Only the six new trap rows; no score moved.
- **Gates:** all pass.
- **`pnpm audit --prod`:** the same 6 as v1.162.0.
