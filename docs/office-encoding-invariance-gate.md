# The Office Encoding-Invariance Gate (v1.164.0)

**Date:** 2026-10-06
**Version:** v1.164.0
**Scope:**
- `scripts/office-encoding-invariance.ts`: the new gate (`pnpm office-encoding-invariance`, in CI).
- `packages/analyzer/src/ooxml.ts`:
  - `decodeXmlEntities` and the parser's entity decoder;
  - `decodeXmlBytes`, used by `readCapped`;
  - `xsdBoolean`, `onOffEnabled`, `relationshipIdsOf`, `resolveRelTarget`;
  - `drawingAltText`'s decorative mark.
- `docxService.ts`: bold read by value in `runProps`, `buildStyleInfo` and `isLargeRun`.
- `pptxService.ts`: `b` and `show` read as xsd:boolean; slide order from the relationship id, with targets resolved the OPC way.
- `xlsxService.ts`: bold read by value; `cellReferences` (rows and cells without `r=`).
- Traps 199–205. Tests: `officeEncodings.test.ts` (21).

This is step 2 of the plan the user approved on 2026-10-06: after table traps, find the classes of document that every new producer brings and that no trap anticipated.

---

## 1. Why

The PDF gate (`scripts/encoding-invariance.ts`) exists because, in late August, five author disputes in two days had one shape: **the same meaning, encoded a legal way the checker did not anticipate.** Each was found by a real agency file after a wrong grade had been published.

Word, PowerPoint and Excel files have the same problem. ECMA-376 lets one document be written many ways, and every producer picks differently. The user put it this way: "people create documents and each document adds something new that isn't adequately accounted for."

## 2. How the gate works

The gate builds **one** Word document, **one** deck and **one** workbook. It re-emits each in every legal encoding of the same meaning and requires an **identical verdict within each family**. The verdict has two parts:

- **Scores:** the score, the grade, and every category's score and severity.
- **A fingerprint of what the parser read:**
  - Word: headings, typed headings, images, tables, links, lists, contrast pairs.
  - PowerPoint: slide titles in presentation order, plus the same.
  - Excel: sheets, tables, images, links, contrast pairs.

The fingerprint catches a misread that happens not to move a score, such as alt text with `&#xA;` left in it. Images are compared as a set: no finding reports an image's position, and Word collects VML pictures after DrawingML ones.

**Each baseline is built so that any misread changes the verdict.** Three examples:

- Contrast runs sit on both sides of the large-text line. One run is 14 pt bold `#808080` (passes only as large text); another is 14 pt *not* bold in the same colour (fails). A misread bold flag flips one of them.
- The deck's slide parts are stored out of presentation order (`slide3.xml` is shown second), so falling back to file-name order changes the slide list.
- The deck has a hidden, untitled slide holding a typed heading, and a visible untitled slide whose 16 pt line is a typed heading only while its bold reads as bold. Every family has a decorative picture. Misreading any of these changes a score.

**81 encodings in all** (Word 37, PowerPoint 22, Excel 22):

- **Family-specific encodings.** Word:
  - language on docDefaults, on the Normal style, or on every run;
  - headings by built-in style, German localized style ids, template styles based on the built-ins, outline-level styles, or direct outline level;
  - list numbering on the paragraph or on the style;
  - the header row by Repeat Header Rows (bare or `w:val="true"`), by the Header Row box, or by legacy hex;
  - borders on the table, from a style, or on every cell;
  - the image as DrawingML, legacy VML, or `mc:AlternateContent`;
  - the link as an element, a simple field, or a complex field;
  - colours by value or by theme slot;
  - bold on as bare, `1`, `true` or `on`; bold off as absent, `0`, `false` or `off`, on the run itself or from a paragraph style based on a bold one;
  - the decorative mark as `1` or `true`.

  PowerPoint: `ctrTitle`; language on `defPPr`, on `lvl1pPr`, on the master only, or on every run; scheme colours; a picture inside a group or in `mc:AlternateContent`; `firstRow`, `b`, `show` and the decorative mark as `true`/`false`; `r:id` written before `id`.

  Excel: inline or rich-text strings; `headerRowCount` explicit; theme and indexed-palette colours; bold as `val` forms; the decorative mark; rows and cells without `r=`; no `<dimension>`.
- **Nine package-level encodings, applied to all three:** pretty-printed, a UTF-8 byte order mark, UTF-16 parts, numeric character references, renamed namespace prefixes (every prefix renamed `ns0:`, `ns1:` …, and default-namespace elements given an explicit prefix, as ElementTree or the Open XML SDK write them), ISO/IEC 29500 Strict namespaces, absolute relationship targets, STORED (uncompressed) ZIP entries, and no ZIP directory entries.

**Deliberately out of scope: renaming parts.** OPC allows any part name. The parsers read the conventional names (`word/document.xml`, `ppt/slideMasters/slideMaster1.xml`, …) directly. Every producer seen so far, and every real file in `controls/`, uses those names; all nine real decks have one master named `slideMaster1` with `theme1`.

## 3. What it found: seven defects on its first run

Each defect is pinned by a trap with a `bug` chip and a row on the trust page. Producer behaviour marked *verified* was checked by generating files with that library, version noted; the other forms are legal by the standards and are not claimed for any particular producer.

1. **Numeric character references were never decoded** (all three formats). The parser library decodes `&#…;` only behind a deprecated switch. Real PowerPoint writes every line break inside alt text that way (*verified on corpus decks*: `descr="A picture containing icon&#xA;&#xA;Description automatically generated"`). Alt text therefore carried a literal `&#xA;`, and a description made only of line breaks counted as a description.

   **Fix:** a decoder that does exactly what XML 1.0 defines. It handles the five predefined entities and numeric references in one pass, so `&amp;#233;` stays literal. A reference to a forbidden character is left as written. Nothing else is expanded: a DOCTYPE is still rejected before parsing, and each reference yields at most one character.

   **Trap 199:** two pictures, one described with line breaks and one described *only* by line breaks. Before the fix, `alt_text` read 100; after, it reads 50 with 1.1.1 named.

2. **A file whose parts are UTF-16 was refused** as "not a supported document". OPC allows UTF-8 or UTF-16, and Word reads both. Every part was decoded as UTF-8, both in format detection and in the parsers.

   **Fix:** `decodeXmlBytes` tells the encoding by its byte order mark, which XML requires for UTF-16, and drops a UTF-8 BOM.

   **Trap 200:** a UTF-16 memo. Before the fix it was refused; after, it reads 100/A.

3. **Word: "bold switched off" was read as bold.** python-docx writes `run.bold = False` as `<w:b w:val="0"/>` (*verified*, python-docx 1.2.0). The typed-heading check took the element's presence for bold, so any short line of 14 pt or more written that way was a "heading typed as text", a 1.3.1 deduction. The large-text check also missed `w:val="off"`.

   **Fix:** one ST_OnOff reading (`onOffEnabled`) everywhere bold is decided.

   **Trap 201:** before the fix 89/B; after, 100/A.

4. **Excel: "bold switched off" was read as bold** — the opposite harm. 14 pt grey text with `<b val="0"/>` passed as large text, so a 1.4.3 failure was missed. (openpyxl 3.1.5 does *not* write this form; it omits `<b>` when bold is off. The form is legal and was misread.)

   **Trap 202:** before the fix, contrast 100; after, the failure is scored and 1.4.3 is named.

5. **PowerPoint and DrawingML: `true`/`false` were not understood.** `b`, `show` and the decorative mark are xsd:boolean values, so `"true"` means what `"1"` means. The parser compared against `"1"` and `"0"` only. A slide hidden with `show="false"` was judged for its missing title and typed heading, `b="true"` was not bold, and a picture marked decorative with `val="true"` read as undescribed (in all three formats).

   **Fix:** `xsdBoolean`.

   **Trap 203:** a hidden slide and a decorative picture spelled that way. Before the fix 69/D; after, 100/A.

6. **PowerPoint slide order depended on attribute order and target form.** `<p:sldId id="256" r:id="rId2"/>` carries two ids, and with namespace prefixes stripped only the last one written survives. `r:id` written first therefore lost the slide. An absolute target such as `/ppt/slides/slide1.xml` resolved to `ppt/ppt/…`. Either way the order silently fell back to file names, and the report named the wrong slide.

   **Fix:** `relationshipIdsOf` reads the attribute bound to the relationships namespace (transitional or Strict) from a prefix-keeping parse, and `resolveRelTarget` resolves targets the OPC way.

   **Trap 204:** before the fix the report named "slide 3"; after, "slide 2".

7. **Excel: rows and cells without `r=` lost their position.** The attribute is optional on both. A row without one follows the last row, and a cell without one follows the previous cell. Link text and the first data cell were read only from the attribute, so links in such a workbook went unassessed.

   **Fix:** `cellReferences` computes every cell's reference.

   **Trap 205:** before the fix, link quality was unassessed; after, it is assessed and the link's "Click here" is reported.

**What held on the first run.** Every other encoding gave an identical verdict: the language, heading, list, header-row, border, VML/field/AlternateContent, theme-colour and group variants; pretty-printing; a UTF-8 BOM; renamed prefixes; Strict; and absolute targets in Word and Excel. openpyxl writes absolute worksheet targets and inline strings (*verified*, 3.1.5), and both already read correctly.

## 4. Verification

- **Test-first:** `officeEncodings.test.ts` (21). 20 were RED for the predicted reason; the 21st is the baseline slide-order guard, which passes by design.
- **Traps:** 199–205 pass. **The stashed analyzer fails all seven, each with the old symptom:**
  - 199: `alt_text` 100;
  - 200: "not a supported document";
  - 201: 89/B;
  - 202: contrast 100;
  - 203: 69/D;
  - 204: "slide 3";
  - 205: link quality unassessed.
- **Per-fix sabotage:** each of the 13 individual fixes was reverted alone. Every reversion was caught by the unit tests **and** by the gate; nine were also caught by a trap.

  | Fix reverted | Unit tests failing | Gate variants diverging | Traps failing |
  |---|---|---|---|
  | Numeric references decoded | 3 | numeric-character-references (×3 families) | 199 |
  | UTF-16 recognised | 1 | utf16-parts (×3) | 200 |
  | Word run bold read by value | 3 | not-bold-as-val-0, -false, -off | 201 |
  | Word large-text bold: `off` | 1 | not-bold-as-val-off | — |
  | Word style bold: `off` | 1 | not-bold-from-a-style-as-val-off ¹ | — |
  | Excel bold read by value | 2 | not-bold-as-val-0, -false | 202 |
  | PowerPoint typed-heading bold: `true` | 1 | bold-as-true ¹ | — |
  | PowerPoint contrast bold: `true` | 1 | bold-as-true | — |
  | PowerPoint `show="false"` | 1 | hidden-slide-as-false | 203 |
  | Decorative mark `true` | 1 | decorative-as-val-true (×3) | 203 |
  | Slide relationship id by namespace | 1 | slide-id-attribute-order | 204 |
  | Absolute targets resolved | 1 | absolute-relationship-targets | 204 |
  | Excel cells without `r=` | 2 | cells-without-references | 205 |

  ¹ The first sabotage round found two fixes that only the unit tests caught: Word's style-level bold, and PowerPoint's bold on a *visible* typed heading. The gate was extended to cover both: two style-route variants, and a sixth slide whose 16 pt typed heading takes the same bold spelling as the contrast run. Re-run, both reversions now diverge.

- **Gates:**
  - The new gate reports "EVERY LEGAL ENCODING PRODUCED THE IDENTICAL VERDICT" (81 encodings).
  - Score ledger: **no score moved** in any of the 329 existing rows, real documents included. It is re-blessed at 336 with only the seven new trap rows.
  - Legal basis, best-practice basis, both trap batteries, re-save invariance and PDF encoding invariance are green.
- **Tests:** 4,026 (API 2,045 · Web 1,931 · CLI 50) across 223 files.
