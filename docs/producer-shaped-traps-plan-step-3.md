# Producer-Shaped Traps: Plan Step 3 (v1.165.0)

**Date:** 2026-10-06
**Version:** v1.165.0
**Scope:**
- `packages/analyzer`:
  - `pptxService.ts`: bullets resolved through the slide's layout; the slide background followed to the layout and master; shape fills read strictly.
  - `placeholderAlt.ts` (new), used by `ooxml.ts`, `docxService.ts`, `qpdfService.ts` and `pdfjsService.ts`.
  - `scoring/common.ts`: `placeholderAltFinding`, wired into the four alt-text scorers.
- Traps 206–216 (210 is the PDF one).
- Gate: `office-encoding-invariance` grows to 85 encodings.
- Tests: `pptxBulletInheritance` (8), `placeholderAltText` (28), `pptxInheritedBackground` (16), `qpdfParser` (+3).

Step 3 of the plan the user approved on 2026-10-06: every program that writes Office files has its own habits, and each new document can bring one no trap anticipated. Step 3 covers the producers that run on this machine. Google Docs, Sheets and Slides, and Apple Pages and Keynote, wait on files the user is gathering (see §5).

---

## 1. Method

The gate's report was built with each producer's own API, plus the usual recipe where the API has no feature. Each file was then run through the checker, its reading compared with what the file actually contains, and the XML read.

| Producer | What was generated |
|---|---|
| **LibreOffice 26.2.4** | All 81 gate encodings re-saved by LibreOffice (Word, PowerPoint, Excel) |
| **python-docx 1.2.0, python-pptx 1.0.2, openpyxl 3.1.5** | The report, deck and workbook, from a scratch virtual environment |
| **docx.js 9.8.1** | The report, via its documented API |
| **Google Slides** | Two real exports already in the test set (`sample-1.pptx`, `sample-2.pptx`), identified by their "Simple Light" and "Modern Writer" themes, the `mac:vml` namespace, and the missing properties parts |

Every producer claim in the code, the traps and this note was checked by generating a file, except where a real export is cited.

## 2. One checker misread, fixed

**Bullets a slide's layout switched off were never read.** PowerPoint resolves a placeholder paragraph's bullet through a chain: the paragraph, its shape's own list style, the matching placeholder on the slide's layout (by `idx`, else by type), and then the master's text style. The parser read the master alone. As a result:

- **python-pptx's default template** (PowerPoint's own layouts) gave three bullets as **five** list items. The Title Slide's subtitle has bullets off in its layout (`<a:buNone/>`), and a slide-number placeholder uses the master's bullet-free "other" style.
- **A real agency deck** (`Communication_with_Federal_Employees_and_Grantees`) types four bullets as "•" plus a tab, in a placeholder whose layout switches bullets off. The checker had counted them as real list items. Read through the layout, it is a typed list: **100/A → 89/B** (list structure 75, Minor, 1.3.1 named).

Footer, date, slide-number and header placeholders now take no bullets. At most 256 distinct layouts are read per deck.

## 3. Two user decisions

### 3a. Alt text that is a file name or placeholder counts as missing ("count it as missing")

Producers fill in a description when the author writes none:

- **Google Slides** writes the uploaded file name ("GA details.png"); `sample-1.pptx` has nine.
- **python-pptx** writes the image's file name (`descr="chart.png"`, verified).
- **openpyxl** writes `descr="Picture"` on every image (its own source, `spreadsheet_drawing.py`).
- **Real PDFs:** "image 1" to "image 4" in a Canva newsletter, and "image 1" in a remediated report.

WCAG lists all of these as a failure of 1.1.1 (F30). The checker had counted them as described.

**The rule (`isPlaceholderAltText`) catches exact matches only.** The whole description must be either:
- an image file name or path (at most eight words, and no comma-separated clauses), or
- one placeholder word, optionally numbered: picture, image, img, photo, photograph, graphic, figure, spacer, placeholder, untitled.

It applies in every format, so parity holds. Each scorer names what the picture carries.

**Real text that merely mentions a picture stands.** A scan of the whole corpus found 19 hits, all true placeholders or file names, and 13 near misses correctly left alone ("Image related to 2008", "Image result for anger clipart").

**Corpus movement:**

| Document | Change |
|---|---|
| `sample-1.pptx` | 79/C → 69/D |
| ILHEALS newsletter and its remediated copy | 89/B → 69/D |
| Elder Abuse (remediated) | alt text 100 → 0 |
| CIEG | alt text 83 → 81 |

CIEG's hit is a descriptive file name ("Map of Illinois coverage by Megs and TFs.jpg"). It is still a file name, so it falls under the rule as approved.

### 3b. A slide's background is followed to its layout and master ("follow it")

A slide with no background of its own shows its layout's, else its master's. That is the default in PowerPoint's, Google Slides' and python-pptx's templates, yet the parser read only the slide's own background, so explicitly coloured text on those slides was never assessed.

**How it works:**
- The background resolves slide → layout → master.
- A `bgRef` theme reference resolves through the theme's fill-style lists, under the master's **colour map** (dark templates map `bg1` to `dk1`). A slide's `clrMapOvr` override is honoured.
- **Every colour is read strictly:** any modifier (`lumMod`, `tint`, `alpha`), gradient or picture stays unknown.
- What the master and layout **paint** lies beneath slide content, unless `showMasterSp="0"` hides it.
- Placeholders inherit their **position and fill** from the matching layout placeholder, then the master's.
- A shape's **own** fill is read the same strict way, including a theme-style fill reference (`p:style/a:fillRef`).

That last point is required for safety. Without it, white text in an accent-filled shape would have been judged against the newly resolved white slide behind it, a false 1:1. Two tests fail when it is reverted.

**Corpus movement:**
- `sample-2.pptx`: contrast newly assessed, 100.
- `sample-1.pptx`: contrast 100 → 85. Two of its slides carry a **second, invisible title** in the band's own blue (`#304FFE` on `#304FFE`), beside the visible white one. On slide 2 the invisible title differs from the visible one: a screen reader announces "Progressive Enhancement" while sighted readers see "Discoverability and PWA's". Text the colour of what lies beneath it is the real 1:1 case (trap 150 pins it).
- DEI deck: contrast 48 → 50, from more runs checked.

## 4. Producer behaviour the checker already reads correctly

These are now pinned as traps 214–216 (caught/held).

- **docx.js** writes **no language anywhere**: no `w:lang`, no theme language, no `dc:language`. A docx.js report is always caught under 3.1.1 until the developer sets one. Its heading styles are named "Heading 1" with **no outline level**, and are read by name.
- **python-docx** has no way to mark a table's header row and writes no picture description. Both are caught. Its `bold = False` (`<w:b w:val="0"/>`) has been read correctly since v1.164.0.

**LibreOffice 26.2** changes files when it re-saves them, and in every case the checker reports the file as written:

1. It drops PowerPoint's **Header Row** mark and table style (an empty `<a:tblPr/>`), baking the formatting into cells (trap 215).
2. It drops a legacy VML picture's alt text when re-saving a `.docx`.
3. It writes a slide background given as the theme's `bg1` as **solid black**, and replaces the deck's theme with its own colours.
4. It loses a workbook's **custom indexed palette**: the font colours vanish.
5. It refuses packages whose `[Content_Types].xml` or `.rels` parts use a namespace prefix, while files with prefixed content parts open. The checker reads both, so that gate variant stays.
6. It loses the title when `docProps/core.xml` uses renamed prefixes.

## 5. Follow-ups and waiting

- **The remediation tagger writes placeholder alt text.** OpenDataLoader (the pipeline's auto-tagger) labels figures "image N" and "Table (page N)". Nothing in this repository writes either.
  - The approved rule catches "image N", so remediated files carrying it now score their alt text honestly.
  - "Table (page N)" is a label, not a description, but falls outside the narrow rule.
  - Whether to widen the rule, or have the pipeline leave figures undescribed rather than placeholder-described, is a decision for the user.
- **PowerPoint text colour inheritance.** Most PowerPoint text inherits its colour from placeholder and master text styles, which the contrast walk does not resolve. That text stays "not assessed". It is a coverage feature, not a misread.
- **Waiting on the user:** exports from Google Docs, Google Sheets, Google Slides, Apple Pages and Apple Keynote ("over the next few days").

## 6. Verification

- **Test-first:**
  - `pptxBulletInheritance`: 6 RED, 2 guards.
  - `placeholderAltText` and `qpdfParser`: RED, then GREEN in every format.
  - `pptxInheritedBackground`: 10 RED, and 4 "must stay not assessed" guards. The 2 shape-fill guards were written after the code, and **fail when the fill reading is reverted**.
  - One test written vacuously (a layout adding bullets at a level the test master already bulleted) was rewritten at level 3 before any fix.
- **Traps:** 206–216 all pass. **The stashed analyzer fails 206–213 and 210 with the old symptoms:**
  - 206: list 100;
  - 207: "5 real list items";
  - 208, 209 and 210: the placeholder counted as a description;
  - 211, 212 and 213: contrast not assessed.

  214–216 pass on both, as regression guards for shapes the checker already read correctly.
- **Gate:** four new PowerPoint variants: the background from the master, as the master's own colour, and from a layout, and the bullets from a layout. All diverge on the stashed analyzer and agree now. 85 encodings, one verdict per family.
- **Ledger:** 347 rows. The only changed lines are the 13 verified movements in §2 and §3; the rest are the 11 new trap rows.
- **Gates:** legal-basis and best-practice-basis pass (331 documents), as do both batteries, re-save invariance and both encoding gates.
- **Tests:** 4,081 (API 2,100 · Web 1,931 · CLI 50) across 226 files.
