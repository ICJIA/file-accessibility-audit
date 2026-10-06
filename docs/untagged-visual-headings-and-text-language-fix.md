# Untagged Visual Headings, the Language on the Text, and PowerPoint Layout Grids (v1.161.0)

**Date:** 2026-10-06
**Version:** v1.161.0
**Scope:**
- `packages/analyzer`:
  - `visualHeadings.ts`: a shared `candidateLines`, and a new `untaggedVisualHeadings`.
  - `pdfjsService.ts`: `markedContentIdsOf` and `collectStructAttribution`.
  - `scoring/pdf.ts` and gate rule 6c in `scoring/conformance.ts`.
  - `ooxml.ts`: `predominantLanguage`.
  - Word's text-language tally (`docxService.ts`) and PowerPoint's (`pptxService.ts`).
  - The Office language copy, in the scorers and gate rules.
- `apps/web`:
  - The `pptx-layout-grids` best-practice row.
  - The action plan's Office language steps.

These are the three items left open by `cross-format-parity-smaller-inconsistencies-fix.md` §8. Two directions were user decisions (§1, §2).

---

## 1. PDF: lines that look like headings, tagged as ordinary text (user decision: score it like Word)

**Before:** Word has always scored a paragraph formatted to look like a heading in a document that also has real Heading styles: 15 points each, at most 40, WCAG 1.3.1. PDF could not see the same defect. Its visual-heading census (`visualHeadings.ts`, 2026-09-02) ran only on documents with **no** heading tags. Two agency annual reports in the corpus, SFY24 and SFY25, tag 3 of their headings and roughly 70 section titles as plain paragraphs. Both read "Heading Structure 100 — No issues found".

**Measured first.** A spike over the corpus found 281 candidate lines outside heading tags, in the 13 tagged PDFs that have both. The false ones fell into recognisable shapes:

- cover pages ("A REPORT TO THE GOVERNOR…", "Prepared by:");
- letterheads;
- the short last line of a large-print pull quote ("carry out its mandates.");
- a TOC's "CONTENTS";
- wrapped titles.

Each guard below removes one shape. What survived was 160 lines in four reports, and every one, read by hand, is a real section heading.

**After:** `untaggedVisualHeadings` takes the census's own candidate lines (`candidateLines` is now shared, so the two can never disagree about what a heading-like line is) and keeps a line only when all of these hold:

- Its text is tagged, on a page whose text could be attributed to its tags at all.
- No part of it is inside a heading element, including a `<P>` nested in an `<H1>`.
- It sits in **one** block element, whose role (after the RoleMap) is `<P>` or `<NonStruct>`. That rules out a caption, cell, list body, TOC entry, quote, link, figure or title.
- The line is at least 60% of that element's text, so the element *is* the line, not part of a longer paragraph.
- It does not end with `. , ; :`, and is not a caption or source line ("Figure…", "Table…", "Source…").
- Kept lines appear on **at least two pages**. Sections recur through a document; a cover page or letterhead sits on one.

**Plumbing in `pdfjsService`:**

- `markedContentIdsOf` gives each text item its innermost marked-content id. It uses the same stack walk as `buildMarkedContentTextMap`, so the two always agree.
- `collectStructAttribution` records each id's heading membership and nearest block element.

**Scoring:**

- `scoreHeadingStructure` deducts `min(40, 15 × n)` in both of its has-headings paths, exactly Word's formula. It names each line with its page and gives the fix (retag as H2/H3, or apply Heading styles at the source and export again).
- Gate rule 6c names 1.3.1.
- A PDF with **no** heading tags is still judged only by the zero-tags census.

Unlike Word, PDF never counts a line on only one page. That is the guard against cover pages; PDF's evidence is inferred from rendered fonts, while Word's is exact.

**Proven guards.** Each of the nine guards was removed in turn, and each removal fails a named test. Two clauses turned out to be implied by others and were deleted rather than kept untested:

- The element-length cap: a candidate line is at most 80 characters and at least 60% of its element.
- The untagged check: an untagged item resolves to no element.

The held traps were proven end to end the same way, and that caught a fixture flaw. pdf.js cannot name a non-embedded standard font, so a **bold** Helvetica caption never reached the check at all. Trap 183's captions are set a size larger instead. Real documents embed their fonts, so this is a limit of the fixture, not of the check.

**Corpus effect:** four real reports. Their heading scores drop from a false clean result; all four stay D for other failures.

| Report | Heading score | Overall |
|---|---|---|
| FINAL REPORT (housing record checks) | 100 → 70 | 69 → 64 |
| Juvenile Justice 2007 annual report | 100 → 60 | 68 → 62 |
| SFY24 annual report | 100 → 60 | 69 → 66 |
| SFY25 annual report | 100 → 60 | 69 → 67 |

`best-practice-basis` asked for three new pairings to be reviewed: `heading-level-order`, `heading-content` and `single-h1`, each beside the new 1.3.1. All three are about headings that are tagged (their levels, their wording, their count), not about lines that are missing a tag. The reasons are recorded in `scripts/best-practice-basis.json`.

## 2. Word and PowerPoint: the language declared on most of the text (user decision: one rule)

**Before:**

- **Word** read its document language only from `docDefaults`, the default paragraph style, or the core properties. Microsoft's documented route, which was also this report's advice, is select all → Review → Language → Set Proofing Language. That marks every *run*, so a file fixed exactly as advised was still accused of declaring no language.
- **PowerPoint** read run languages, but credited **any** run's language, so one stray marked word stood in for a whole deck.

**After:** both formats share one rule, `predominantLanguage` (`ooxml.ts`). With no document-wide default, the language declared on **more than half of the text, by characters**, is the document's language.

- The majority is taken by language, so en-US and en-GB together are English, and the most-used tag of that language is reported.
- A non-code value ("english") still counts as a declaration, so the scorer can call it unusable rather than missing.
- **Word's run language** is the run's own `w:lang`, else its character style's, else its paragraph style's (the default paragraph style when the paragraph names none), each resolved through `basedOn`.
- **PowerPoint's run language** is the run's `a:rPr@lang`, else its paragraph's `a:pPr/a:defRPr@lang`, over visible slides.

The finding says where the language came from: "Document language: en-US (declared on the text itself — the document sets no default language)". The no-language advice, in the scorers, gate rules and action plan, now says to select the text first; that is the step that makes it work.

**Corpus effect:** none. Both real decks with no deck default mark 100% of their text, and no real Word file marks a language only on its runs.

## 3. PowerPoint best-practice row for bare layout grids

`docx-layout-grids` was Word-only. Since v1.160.0, PowerPoint reports a bare grid the same way, and nothing in the catalog read that line for a deck. `pptx-layout-grids` mirrors the Word row:

- **Era date:** the advisory's ship date, 2026-10-05.
- **MET:** sound in both eras, because a bare grid has no header row by construction, so the absence of the headerless-table line proves there is none.
- **NOT CHECKED** on an older payload where that line is present.
- **NOT APPLICABLE** on a current payload, because there the line is a scored failure.

The catalog is now 43 practices (PDF 21 · Word 9 · PowerPoint 5 · Excel 8). The README's "41 · PowerPoint 3" had been stale since PowerPoint's descriptive-link row was added.

## 4. Verification

- **Tests, test-first:**
  - `visualHeadings.test.ts`: 8 → 35. Every guard has a test, and removing any one fails it.
  - `headingTitleParity.test.ts` (+6): Word and PDF cost the same, 70 for two lines and 60 for three or more, with 1.3.1 named.
  - `languageParity.test.ts` (+8): the majority rule in both formats, the stray run, en-US with en-GB, a style-inherited language.
  - `bestPracticesOffice.test.ts` (+7).
- **Traps 179–185** (185 in all):

  | Trap | Document | Result | Chip |
  |---|---|---|---|
  | 179 | Untagged section titles beside an H1 | heading 60, 79/C | FOUND A REAL BUG |
  | 180 | Twin of 179, titles tagged H2 | 100/A | |
  | 181 | Cover page | 100/A | |
  | 182 | Pull quote | 100/A | |
  | 183 | Captions | 100/A | |
  | 184 | Word file with the language only on its runs | 100/A | FOUND A REAL BUG |
  | 185 | Deck whose only language mark is one French word | 79/C | |

  - With the analyzer changes stashed, 179, 184 and 185 fail with the old behaviour's exact symptoms.
  - Removing each guard fails its held trap end to end: two pages → 181, line share → 182, captions → 183.
- **Ledger, re-blessed at 316 rows.** The four reports above moved, plus seven new trap rows. No Office row moved.
- **`pnpm audit --prod` for this release: 12** (3 critical, 8 high, 1 moderate). Ten are new since v1.160.0; none is reachable in production.
  - **Dev or build tooling only, absent from the production bundle:**
    - `simple-git` ×4, through Nuxt devtools;
    - `seroval` and `postcss-selector-parser`, at build time;
    - `braces` and `node-forge`, already disclosed with no fix.
  - **`source-map-js`** ships in the web server bundle (a dependency of Vue's template compiler), but its flaw is in parsing indexed source maps, which no server code does.
  - **`proxy-addr`** (critical, the API's client-IP parser): the flaw is in subnet trust matching. The API sets `trust proxy` to the hop count `1`, which Express compiles to `(a, i) => i < 1` without calling that code.
  - **`@vue/server-renderer`** (high): the flaw needs attribute *names* from untrusted input. The web app binds no object-spread attributes.

  The dependency pass follows immediately as v1.161.1.
