# Verdict Integrity & Cross-Format Accuracy Fixes (v1.36.0 / v1.36.1)

**Date:** 2026-07-19
**Versions:** v1.36.0 (the full P0/P1/P2 fix set) and v1.36.1 (static-XFA / indirect-reference patch)
**Scope:** `packages/analyzer` — all four format pipelines (PDF, DOCX, PPTX, XLSX), the scoring layer, and the conformance gate.

---

## 1. Context

A dedicated accuracy review of the audit algorithms ran on 2026-07-19: four parallel review agents (one per format pipeline, one for the scoring/verdict layer) read the analyzer end to end **and executed the real pipeline** against the repo's control corpus — 19 real ICJIA PDFs (including three professionally remediated before/after pairs), both sample decks, two published datasets, and crafted proof files. Top findings were demonstrated end-to-end, not inferred from code reading.

The review found one recurring root pattern behind almost every serious defect:

> **An unresolvable value was silently given a *default* instead of an *unknown*, and the default then drove a confirmed WCAG claim or a Critical score.**

Backgrounds defaulted to white; absent deck-level language defaulted to "none declared"; unreadable link text defaulted to "empty"; an unresolved indirect reference defaulted to "missing". The conformance gate itself — deliberately designed to assert only *confirmed* violations — was well built; it was being fed false confirmations.

The fix campaign therefore added a doctrine amendment, now enforced in code across every format:

> **Never assert a confirmed violation (or a Critical score) from a defaulted or unresolved value. Unresolved ⇒ notAssessed / advisory.**

## 2. Verdict-integrity fixes (false confirmed failures, and one severe silent pass)

### 2.1 AT-blocked encrypted PDFs (the worst silent pass)
`qpdf --json`'s top-level `encrypt` key was never read. A legacy-encrypted PDF with the accessibility permission denied — a document conforming viewers will not let a screen reader read *at all* — scored **100/A with a clean verdict** (demonstrated on a re-encrypted control). `QpdfResult` now carries `isEncrypted` / `accessibilityAllowed`; `accessibility: false` produces a Critical text-extractability finding and a confirmed 1.1.1 failure (PDF/UA 7.16 / Matterhorn 26-002), with a targeted Acrobat fix. The Adobe-parity panel simultaneously stopped blanket-failing *every* encrypted document (modern AES-256 cannot deny accessibility).

### 2.2 Short born-digital PDFs are not "scanned images"
`hasText` is a ~50-character scoring heuristic, but the gate asserted a confirmed 1.1.1 — *"No extractable text was found — the document appears to be scanned images of text"* — from it alone. A 30-character born-digital notice scored **0/F** with a factually false claim demanding OCR. The confirmed claim (and `isScanned`) now require `textLength === 0` **and** page images; the scoring branches keep their thresholds with honest "minimal text" wording.

### 2.3 Contrast: never compare against an assumed background
- **DOCX** resolved backgrounds as run-shd → paragraph-shd → *white*. Table-cell shading, table-style banding, and shape fills were invisible, so the canonical accessible pattern — white bold text on a dark header row — was asserted as a confirmed 1.4.3 failure at "1:1". The contrast walk is now structure-aware (cell shading resolved; styled-table and text-box contexts unresolved-never-white).
- **PPTX** resolved slide backgrounds as own-shape fill → slide `bgPr` → *white*, missing `bgRef`, layout/master backgrounds, and card shapes — both real sample decks falsely failed 1.4.3 (22 runs at "1.04:1" on one). Contrast now requires background *provenance* (explicit same-shape or explicit slide `bgPr` fill); everything else is honestly unresolved. Runs whose font size is inherited (unknown) are no longer held to the 4.5:1 bar inside the 3.0–4.5 band.

### 2.4 Text boxes are not images (DOCX)
Every `w:drawing` was pushed as an "image", so a pull-quote text box without `descr` became a confirmed 1.1.1 failure. Drawings are now classified by `a:graphicData@uri`: pictures/charts/SmartArt require alt; text-bearing `wordprocessingShape`s do not (their words are read directly and audited by the text walks).

### 2.5 Run-level slide language (PPTX)
Language was read only from the presentation default / master. PresentationML stores language on each run's `a:rPr@lang` — Google Slides exports systematically omit the deck default while stamping every run — so decks declaring `lang="en"` on *every run* got confirmed 3.1.1 failures. A dominant run-language fallback now applies; 3.1.1 fires only when no language exists anywhere.

### 2.6 Excel link text comes from the cells
Link text was read from the `<hyperlink display>` attribute, which real Excel does not write — a real published workbook had **2,430 of 2,430** links flagged "(empty)" (link_quality 0, 65/D overall). Text now resolves from the referenced cell (shared strings incl. rich-text runs, inline strings, cached values; a range ref uses its first cell; `display` is the fallback), and links with no resolvable text are excluded from judgment rather than counted as violations.

### 2.7 Reading order: draw order is not reading order
The fidelity metric compares struct-tree MCID order against the content stream's **draw** order — but the struct tree exists precisely to override draw order, and Acrobat remediation (this tool's own prescribed fix) deliberately re-orders tags away from it. A professionally remediated control was docked to 70/C, and ≤40 asserted a confirmed 1.3.2 ("assistive technology will read the document out of sequence") the comparison cannot prove. Now: no confirmed 1.3.2 from this metric — heavy divergence becomes an explicit 1.3.2 *notAssessed* manual-review entry; bands soften to 100/90/85/**65**/**30** (v1.36.1 finished the lower bands — 50–80% agreement is routine for correctly tagged forms and is a Moderate "verify manually" signal, not Critical); all prose says "draw order" and explains that divergence means disagreement, not error.

### 2.8 Content that no user is presented cannot drive a verdict
- **Hidden Excel sheets** (`state="hidden"/"veryHidden"`) — lookup tables, reference images, and styles on them were producing confirmed 1.3.1/1.1.1/1.4.3 claims. Hidden sheets are now excluded from content collection entirely and disclosed.
- **Hidden/NoView form fields** (`/F` bits 2/6) were counted as confirmed unlabeled-field failures — controls no user (AT included) can reach. Skipped.
- **Hidden slides** (`show="0"`) are excluded from title/order judgment and disclosed.
- **XFA forms**: v1.36.0 returned `incomplete` for any `/XFA` (the analyzable page of a *dynamic* LiveCycle form is just the "please update your viewer" placeholder). v1.36.1 narrowed this to dynamic XFA only (`/NeedsRendering` true): **static XFA ships a full conventional rendering that is exactly what every viewer displays** and is audited normally, with a not-scored disclosure that the XFA template layer itself wasn't separately audited. Prompted by a real accessible static-XFA form that was being refused a verdict.
- **DOCX gains the `incomplete` verdict state** (the PDF gate had it since v1.22; DOCX silently lacked it): an unparseable `document.xml` previously yielded a false-clean "no-automated-failures" over content that was never analyzed, and unreadable `styles.xml`/`core.xml` produced confirmed 3.1.1/2.4.2 claims from parts that were never read. Per-part parse state now distinguishes "the part said nothing" from "the part could not be read".

### 2.9 Indirect catalog references (v1.36.1)
Designer/LiveCycle output stores catalog values as indirect references. `/Lang → "252 0 R" → "en-US"` was displayed as *language "252 0 R"*, and `/ViewerPreferences /DisplayDocTitle → ref → true` was read as *missing* (a false −15 on the title). Scalar reference targets now resolve (qpdf v2 `{value}` wrappers and v1 bare scalars both normalized); `/NeedsRendering` gets the same treatment.

## 3. Cross-format equity fixes

The same logical barrier previously carried materially different grade consequences depending on the upload format:

| Barrier | Before | After |
|---|---|---|
| 10 links shown as raw URLs | PDF 100 · DOCX **0** (plus an 85-cap) · PPTX/XLSX penalized, but "click here" passed | One doctrine (`classifyLinkText` in `scoring/common.ts`): raw URLs satisfy 2.4.4 → advisory everywhere; empty/vague/too-short penalized everywhere |
| 1 of 40 images missing alt | PDF 97 · DOCX 85 · PPTX/XLSX 98; all-decorative → PPTX/XLSX vacuous 100, DOCX N/A | OOXML convention unified: cap 85 (Minor ceiling) when any alt is missing; all-decorative → N/A. Title-only alt (AT reads *Description*, not Title) counts as missing, with a targeted advisory |
| Short doc with no headings | PDF 0/Critical (→ 70/C overall) · DOCX N/A (→ 100/A) | Short heading-less PDFs with no heading-like signals → N/A like DOCX; substantive documents keep the 0 |
| Missing document title | XLSX zeroed the whole category; others scored 50 | XLSX 50, like every other format |
| 95 of 100 slides titled | slide_titles **0/Critical** (identical to 0 titled) | Proportional with floor 40 / cap 85 (sheet names likewise); heading-skip deduction caps at −30 |
| "Advisory:" findings that deduct (XLSX) | plain-range −10, merged cells −5·n | Advisory means unscored: merged cells are a note; a workbook with *no* header semantics anywhere caps table_markup at 60 with honest wording; pivot sheets stop receiving impossible "Insert → Table" advice |
| TH missing `/Scope`, `/Headers` present (v1.36.1) | −10 | `/Headers` association is complete and spec-correct (the gate and PAC already accepted it) — missing Scope there is a belt-and-braces advisory |

Also: `DisplayDocTitle` is parsed (title present but unshown → 35/50 with the Initial-View fix; the Adobe-parity Title rule reports Acrobat's real verdict), parity list/nesting rules stopped fabricating "passed" (Appropriate Nesting now derives from the real skip detection), and the executive summary never claims "cleared every automated check" beside a category the table shows as Critical/Moderate.

## 4. Extraction-coverage additions

Content that previously couldn't be seen at all (every one a potential silent pass):

- **DOCX**: headers/footers (letterhead logos are the most common image in agency documents), footnotes/endnotes — images, hyperlinks (each part's own rels), and contrast; field-code hyperlinks (`fldSimple` + `instrText` begin/separate/end state machine); legacy VML images (`w:pict`/`v:imagedata`, alt from `v:shape@alt`); custom heading styles via resolved `w:outlineLvl` and `basedOn` chains plus direct paragraph `outlineLvl` (agency `ChapterTitle` templates were invisible *and* re-flagged as fake headings — a well-built probe document scored ≈49/F); style-level list numbering (built-in List Bullet/Number), `numId=0` ("numbering removed") excluded, numbered headings no longer counted as hand-typed bullets; empty Heading-styled paragraphs counted as an advisory instead of entering the outline; `mc:AlternateContent` walked Choice-only (the Fallback branch duplicates text-box content — one pull quote produced three fake-heading hits and doubled contrast counts).
- **PPTX**: master `bodyStyle` bullets inherited by body placeholders (PowerPoint-native decks carry no explicit `buChar` on slides — real lists computed 0/(0+manual)); decorative pictures excluded from "title reads first"; group-level alt/decorative covers member shapes (one announced object); consecutive runs of one hyperlink merged into one link + picture-level links collected; slide order resolved through `sldIdLst` (findings point at the slides the author sees after reordering); `firstRow` accepts ST_Boolean `"true"`.
- **XLSX**: chartsheets audited (chart-only dashboards previously vanished, alt review included) with rels paths derived from each part's own directory; used-range = max(declared `dimension`, actually-parsed cells) — streaming writers stub the dimension, which silently renormalized the format's highest-weight category away; text-extractability keyed to actual cell values with drawing-text-box disclosure (both published control datasets keep their entire narrative in a text box over an empty grid — the old category asserted "fully extractable text in real cells" unconditionally); localized default sheet names (Hoja/Feuil/Tabelle/…, copy suffixes); defined-table column spans recorded for the gate's single-column guard.
- **PDF**: qpdf v2 **stream objects unwrapped** — `{stream:{dict}}` carriers were invisible, so the image-XObject census was permanently zero on modern qpdf (masked by test fixtures in a hybrid shape real qpdf never emits; fixtures regenerated, SMask/Mask channels not double-counted); MarkInfo `/Suspects` surfaced as an advisory (the producer itself flagged the tags as unreliable); painted-images-beyond-figures advisory (a partially tagged document with 2 alt-ed Figures and 8 untagged images previously claimed "All images have alternative text").

## 5. Verification

- **TDD throughout**: every fix landed as a failing test first. Tests grew 1,418 → 1,537 (API 876 → 995). Roughly fifteen existing tests had *pinned the buggy behavior* (assumed-white contrast fixtures, the `display`-attribute link expectation, the 70/C minimal-document score, v1-shape qpdf fixtures, linear slide-title subtraction, advisory-labeled deductions) and were updated in lockstep with rationale comments.
- **Controls corpus, before (v1.35.0) → after (v1.36.1)** — the intended shape: PDFs essentially unchanged, decks/workbooks shed exactly their false confirmed failures:

| Document | Before | After |
|---|---|---|
| All 17 PDFs | — | ±3 points, identical failure counts (DisplayDocTitle docking vs reading-order softening) |
| `sample-1.pptx` | 83/B, fail(3) | **92/A, fail(1)** — dropped false 1.4.3 + 3.1.1; keeps the genuine missing-title 2.4.2 |
| `sample-2.pptx` | 61/D, fail(4) | **80/B, fail(2)** — dropped false 1.4.3 + 3.1.1; keeps genuine 1.1.1 + 2.4.2 |
| `rdca` datasets (×2) | 76/C | **90/A** — title/merge recalibration; honest text-box disclosure |
| `example-8` (accessible static XFA) | 90/A, verdict **refused** | **96/A, clean verdict** (v1.36.1) — remaining dent is the reading-order 65 manual-review signal |

- v1.36.1's band change moved **zero** of the 22 pre-existing controls (none sat in the lower bands).
- Post-deploy smoke (2026-07-19): `/healthz` 200 both-tiers, live PPTX and XLSX analyses on the droplet byte-match local results.

## 6. Deliberately not fixed

Kept, with reasons: the layout-table false positive in PDF *scoring* (the verdict side now has the ≥2×2 + indicator guards); `detectSuspiciousAltText`'s mostly-non-ASCII advisory; standard-14 fonts vacuously "embedded"; `parsePdfDate` timezone; PPTX speaker notes and merged slide-table cells unread; DOCX `numbering.xml` abstract formats not fully resolved; XLSX hidden rows/columns (lesser cousin of hidden sheets); and the missing-Title confirmed 2.4.2 for OOXML formats — a deliberate strictness policy, though WCAG2ICT accepts a descriptive filename and this makes FAIL verdicts near-universal for real-world Office files; revisit if verdict discrimination matters more than strictness.

The reading-order metric still measures draw-order *agreement* only. A deeper fix would corroborate divergence with pdfjs's per-item geometry before scoring below 85 — captured here as the known next step if the 65-band signal proves noisy in practice.
