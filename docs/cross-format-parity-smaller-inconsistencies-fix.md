# Cross-Format Parity: The Smaller Inconsistencies (v1.160.0)

**Date:** 2026-10-05
**Version:** v1.160.0
**Scope:** `packages/shared` (`shareScore`); `packages/analyzer` — the PDF, Word, PowerPoint and Excel scorers and the Office conformance-gate rules, `docxService.ts`, `pptxService.ts`, `xlsxService.ts`, `ooxml.ts` (two language-sample helpers), `scoring/common.ts` (`judgeDeclaredLanguage` and its report copy). This is follow-up #5 from `table-header-parity-and-word-header-row-fix.md` §5, plus three more differences found while closing it. Two directions were user decisions (§6, §7).

---

## 1. One ratio rule for alt text and link names

**Before:** Alt text and link names are scored as the share of items that pass, but the formats computed that share differently:

- PDF floored the share, so a failing document never rounded up into a better band and never reached 100.
- Word, PowerPoint and Excel rounded the share, then capped any failing category at 85. That cap was a "cross-format convention" from v1.36.0, before the severity cap existed, and PDF never adopted it.

At band edges the two rules disagreed on the letter. 16 of 23 images described scored 69 as a PDF (Moderate, C ceiling) and 70 as a Word file (Minor, B ceiling). Higher up, the cap made Office the harsher one: 9 of 10 described was 90 as a PDF and 85 in Office.

**After:** every format uses `shareScore(passed, total)` = `floor(passed / total × 100)`, from `packages/shared`. It applies to alt text and link quality in all four scorers.

**Not changed:** Office colour contrast keeps its own round-and-cap-at-85 rule. PDF does not score contrast, so there is no difference between formats to close. Aligning contrast with `shareScore` would be a separate decision about the contrast rubric itself.

## 2. "Could not be read" is not "missing", in PowerPoint and Excel

**Before:** Word has kept two cases apart since 2026-09-01:

- A core-properties part that **cannot be parsed** says nothing about the title. That half is not scored, and the gate asserts no 2.4.2.
- A part that is **absent**, or parses with no title, really has no title.

PowerPoint and Excel read the same part with no such guard. A damaged `docProps/core.xml` therefore became a confirmed "has no title" and a WCAG 2.4.2 failure about a title the checker never saw.

**After:**

- **Parsers:** `pptxService` and `xlsxService` record `parse.coreState` (`ok` / `absent` / `unparseable`).
- **Scorers:** an unparseable part leaves the title half unscored, and the report says the title "could not be read".
- **Gates:** both 2.4.2 rules skip an unparseable part.
- **Tests:** `coreGuardParity.test.ts` runs end to end in all three Office formats. A corrupt part is never accused; a readable part with no title still is.

## 3. PowerPoint layout grids — Word's rule

**Before:** Word has never scored or gated a bare grid. A bare grid is a table with no style, borders, shading or header marks anywhere (`looksLikeLayout`, the 2026-08-29 legal-only sweep). PowerPoint scored the same grid as an unheadered data table: 45, 1.3.1 asserted, and the deck capped at 79/C. An agenda lined up in a stripped table cost a deck a grade it never cost the Word file.

**After:** `pptxService` marks a table `looksLikeLayout` when all of these hold:

- It has no header row.
- It has no table style, or PowerPoint's "No Style, No Grid" style (`{2D5ABB26-0587-4C30-8999-92F81FD0307C}`).
- No cell has a visible border (`lnL`/`lnR`/`lnT`/`lnB` with a fill and no `noFill`).
- No cell has a fill.

The scorer and the gate skip such a table, and the report gives Word's bare-grid advisory. This exempts only tables an author deliberately stripped: Insert → Table always writes a style, so every real table in the corpus keeps one.

## 4. Excel text on a cell with no fill — checked against the white grid

**Before:** Word has always checked unshaded text against the page, which is white unless the document sets a background. Excel left every no-fill cell unresolved. Light-grey text typed straight onto the grid is a confirmed 1.4.3 failure on screen, but it was never caught in a workbook. The same text in a Word document was always caught.

**After:** the background for a cell with no fill is white. "No fill" means `patternType="none"` (Excel's fill 0), a bare `<patternFill/>` with neither a type nor a colour, or an empty `<fill/>`. Three cases stay unresolved, because their real background is not one colour:

- Non-solid patterns (`gray125`, `darkGrid` and the rest).
- Gradients.
- Cells on a sheet with a background picture (Page Layout → Background).

Excel writes an explicit font colour (`<color theme="1"/>`) on its default font. Most workbooks' contrast is therefore now **checked and passing**, where it used to be "not assessed". One real control (`DVFRWebsite Changes.xlsx`) moved from null to 100; its overall score did not move, because it is already capped at 79/C by another category.

## 5. Word and PowerPoint language declarations — PDF's two checks

**Before:** PDF has checked two things since 2026-08-29:

- That the declared language is a usable code. `english` and `en_US` defeat a screen reader's pronunciation switching.
- That the text does not overwhelmingly contradict it (`languagePlausibility.ts`, four guards, deliberately hard to trigger).

Word and PowerPoint gave **any** declaration full credit. A Spanish notice declared `en-US` therefore passed as a .docx and failed 3.1.1 as its PDF.

**After:** `judgeDeclaredLanguage` (`scoring/common.ts`) runs PDF's two checks for Word and PowerPoint, in the scorer and in a new gate rule 2b. Either failure earns half the language credit and names 3.1.1. Office adds one guard of its own, because Office also declares language **per run**: a language the file declares anywhere (on a run, a style or a paragraph default) is never called a mismatch.

- Word's automatic language detection, or Review → Language → Set Proofing Language on a selection, marks Spanish runs `es-ES`.
- PowerPoint stamps a language on every run.

Either way a screen reader switches to that language where the file says so. That is why the report's fix advice ("select the text → Set Proofing Language") also clears the finding.

**Inputs:**

- Each parser builds a 4,000-character text sample (`languageSample`), the same size PDF takes.
- Each parser builds a census of declared language subtags (`addLanguagePrimary`, bounded at 32).
- Word samples its body. PowerPoint samples its visible slides.
- The sample never leaves the OOXML worker: only `metadata` and `scoring` cross the IPC boundary, so no document text is stored with a report.

**Word's document language is now read from where Word declares it.** Before, `stylesDefaultLang` returned the first `w:lang` with a value **anywhere** in `styles.xml`, which could be any style's. A "French Quote" character style could therefore become the language of an English document, and the new mismatch check would then have accused it. It now reads, in order:

1. `docDefaults` → `rPrDefault`.
2. The default paragraph style (`w:default="1"`).
3. The core properties, unchanged.

No control in the corpus changed: every real Word file declares its language in `docDefaults`.

**Not changed:** Excel. A workbook declares no document language at all, so 3.1.1 is always "not assessed" there.

**Corpus census before shipping:** no real Word or PowerPoint file in the controls has an unusable code or a mismatch. Every one declares `en`/`en-US` over English text, or declares nothing.

## 6. Header and footer images — kept scored, now explained (user decision)

A letterhead logo is the commonest image in an agency document, and it lives in the page header.

- **Word:** the logo counts toward alt text.
- **PDF:** Word's tagged-PDF export marks header and footer content as artifacts (page decoration screen readers skip), so the same logo is usually not counted.

**Decision:** keep scoring header and footer images, because an undescribed logo is still an undescribed image, and explain them.

**After:**

- `docxService` records `location` (`header` / `footer` / `note`) on every image outside the body.
- When undescribed images sit in a header or footer, the alt-text finding names them.
- The finding gives the route for a purely decorative logo: Alt Text → Mark as decorative, which stops it counting.
- It says to describe the logo instead when it carries information: a certifying seal, or the only place the agency is named.
- It explains why the PDF may not flag the same image.

## 7. The action plan's language step, for Word and PowerPoint

The action plan picks a title or language step by matching the scorer's own lines. It had two gaps:

- `LANG_PROBLEM` knew only PDF's "no language" line. Word's ("No document language is declared") and PowerPoint's ("No default presentation language is declared") were never matched.
- The language-only step required a `Document title:` line, and PowerPoint writes `Presentation title:`.

An Office file with a fine title and a language problem therefore fell to the combined default, "Give the document a title and set its language", the copy error the 2026-08-29 audit fixed for PDF. From this release that included a PowerPoint deck with a mismatched language. Both matchers now know the Office lines; `actionPlan.test.ts` pins five Office cases plus the combined default.

## 8. Not changed, by decision or by limit

- **Proportional scoring stays (user decision).** Alt text and link names are scored as a share, so a sparse document and a rich one with the same single defect score differently: one undescribed image out of one is 0, and one out of ten is 90. That is deliberate. In the first document all of the visual information is lost; in the second, a tenth. `shareScore` carries the reasoning in its doc-comment.
- **Fixed in v1.161.0 — see `untagged-visual-headings-and-text-language-fix.md`.** **PDF cannot see a visual heading beside real heading tags.** Word and PowerPoint score a fake heading beside real ones (15 each, at most 40). PDF's visual-heading census (`visualHeadings.ts`) runs only when a document has **no** heading tags. Matching rendered lines against tagged headings, to find the untagged one among them, is not reliable enough to accuse on. This is a documented automation limit, not a severity difference.

## 9. Verification

- **Tests, test-first.** Every new behaviour had a RED test for the predicted reason before the change:
  - `ratioParity.test.ts` (new, 13): `shareScore`, and the same share in four formats.
  - `coreGuardParity.test.ts` (new, 6): end to end in three formats.
  - `languageParity.test.ts` (new, 19): the same declaration and text in PDF, Word and PowerPoint. The Office guard holds in both directions, and Word reads its default language from where Word declares it.
  - PowerPoint layout grids: `pptxService.test.ts` and `tableHeaderParity.test.ts`.
  - The Excel white grid: `xlsxService.test.ts`, five tests, three of them guards.
  - Header and footer images: `docxService.test.ts`, four tests.
  - The action plan: `actionPlan.test.ts`, six tests (three RED before the change).
- **Traps 170–178** (178 in all):

  | Trap | Document | Result | Chip |
  |---|---|---|---|
  | 170 | PowerPoint bare layout grid | 100/A | FOUND A REAL BUG |
  | 171 | Excel light grey on the plain grid | contrast 0, 69/D | |
  | 172 | Twin of 171 | 100/A | |
  | 173 | Word Spanish declared en-US | title and language 75, 89/B | |
  | 174 | Twin of 173, Spanish marked `es-ES` | 100/A | |
  | 175 | PowerPoint damaged core part | 100/A | FOUND A REAL BUG |
  | 176 | Word header logo with no alt text | alt text 50, 79/C, advice given | |
  | 177 | Twin of 176, logo decorative | 100/A | |
  | 178 | Word, 16 of 23 images described | alt text 69, 79/C | FOUND A REAL BUG |

  - Four new twin orderings: 160 < 170, 171 < 172, 173 < 174, 176 < 177.
  - With the analyzer changes stashed, all seven caught and bug traps fail with the old behaviour's exact symptoms. The two held twins (174, 177) pass both ways, as over-correction guards should.
- **Ledger, re-blessed at 309 rows.** Three real controls moved a category, and no overall score or grade changed:
  - `DVFRWebsite Changes.xlsx`: contrast null → 100.
  - `POWERPOINT_Dynamics_of_Domestic_Violence…pptx`: alt text 62 → 61.
  - `sample-2.pptx`: alt text 85 → 92, the cap removed.

  All three were already capped at 79/C by another category.
