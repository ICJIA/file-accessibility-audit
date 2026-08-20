# Link text from tags, untagged links, named drift pages, text-box figures (v1.83.0)

**Date:** 2026-08-20 ·
**Trigger:** an independent re-verification of a shared report
(`FFY24 SCIP Plan.pdf`, a 46-page Word export, **69/D**) against the file
itself, with a pikepdf structure-tree walk. Every count in the report
reproduced. The score stood. Four things the report *said* did not: the link
text it displayed (and therefore which links it flagged), a real defect it
left to the PDF/UA panel, a reading-order count with no page numbers, and
alt-text advice that would have hidden text from screen readers.

---

## Paste-ready — reply to the person who sent the file

> **Your score is unchanged (69/D) — the fixes below are to our report, not
> your document — but two things in it now read differently, and one is new.**
>
> **Links.** Three links whose visible text is just "here" (two on page 21,
> one on page 27) need wording that says where they go — our earlier report
> caught only one, because it was reading the whole line under each link
> rather than the link itself. The "PA" it flagged was a false alarm: it's the
> first word of a wrapped "PA 102-1116" link.
>
> **New: six links on page 22 have no tag.** The links inside the
> "LEGISLATIVE TIMELINE" box exist on the page, but nothing in the document's
> tag structure wraps them, so a screen reader following the tags never meets
> them. In Word, links inside text boxes export this way — move that content
> into the main text (or a table) and re-export. In Acrobat Pro: Tags panel →
> Options (⋮) → Find → "Unmarked Links" → Find → Tag Element, repeated until
> none remain.
>
> **Reading order.** The six pages that read out of sequence are 5, 6, 27, 32,
> 37 and 39. On 5, 32 and 37 the chart's numbers are tagged *before* the page's
> first heading — a screen reader hears "74, 67, 38, 112, 244…" before
> "EXECUTIVE SUMMARY". Acrobat's Order panel on those pages will show it.
>
> **Images — please read before adding alt text.** 16 of the 26 "images"
> without alt text are really boxes of text (the sidebars, the timeline, the
> "ERPO / FRO FACTS" page, chart title bars). Do **not** describe those: a
> figure's alt text *replaces* its contents for a screen reader, so a
> description would hide the text inside. Instead change their tag (Tags panel
> → right-click the `<Figure>` → Properties → Type → Section), or in Word keep
> that content out of text boxes. The cover images, the map on page 23 and the
> real charts still need descriptions.

## Paste-ready — internal team note

> **The 69/D was right; four things the report said were not.** (1) Link text
> was read geometrically — every text item whose *origin* fell inside the
> annotation rectangle, whole item included — so "here" followed by
> ". FOID statistics are available" in the same run scored as descriptive (two
> misses on p21) and a wrapped link produced the fragment "PA" (one false
> positive). Link text now comes from the `<Link>` element's own
> marked-content runs, the same id mapping the heading outline uses.
> (2) Six page-22 link annotations have no structure element at all; veraPDF
> reported them (7.18.5-1) but the main report didn't — they're now a
> "Links Not Tagged" block, a 1.3.1 conformance failure, and a computed
> Acrobat-parity row. (3) "6 page(s) had noticeable drift" now names the
> pages with their match %. (4) 16 alt-less figures are Word text boxes with
> text inside; the alt-text card and the action plan now say "retag, don't
> describe" for those. Link Quality 97 → 89 on re-analysis; overall stays 69
> (Critical cap).

---

## What was wrong

### 1. Link text was geometry, not structure

`findLinkText()` in `pdfjsService.ts` collected every pdf.js text item whose
origin `(transform[4], transform[5])` lay inside the link annotation's `/Rect`
(±5 pt) and joined them — whole items, so a run that *started* inside the
rectangle contributed all of its text. Consequences on this file:

| Link | True tag text | Text the report used | Verdict given | Correct |
| --- | --- | --- | --- | --- |
| p21 FOID lifecycle chart | `here` | `here . FOID statistics are available` | descriptive | vague |
| p21 FOID statistics | `here` | `here . As of September 2023, t` | descriptive | vague |
| p22 Public Act 102-1116 (wrapped, untagged) | — | `PA` | vague phrase | untagged |
| p45 Pew Research | `Gun deaths among U.S. kids rose 50%…` | `https://gunresponsibility.org/… Gun deaths among…` | raw URL | descriptive |

The classifier was fine; its input was wrong. Two real 2.4.4 findings were
missed and one was invented, and the raw-URL and descriptive lists were
scrambled (harmless to the score, wrong on the page).

### 2. Untagged links were invisible to the main report

Six `/Link` annotations on page 22 — the links inside Word's "LEGISLATIVE
TIMELINE" text box — are referenced by no structure element (no OBJR anywhere
in the tree). A screen reader following the tags never meets them; with
`/Tabs /S` (structure tab order, which this file sets) they cannot be tabbed
to. veraPDF's `7.18.5-1` counted exactly six, in the PDF/UA panel. The Link
category, the conformance verdict, and the Acrobat-parity table
(`tagged_annotations: not_computed`) said nothing, and the only trace in the
main report was the "PA" false positive built from text near one of them.

### 3. Drift pages were counted, not named

`computeReadingOrderFidelity` knew which pages fell under 80% agreement and
reported only how many. On this file the six are genuine: Word tagged each
chart's data labels (`Chart → Sect → Textbox → P → Span`) at the *top* of the
page's tag tree, before the H1, on pages 5, 32 and 37, and a floating table
ahead of its paragraph on 27. A reader of "6 page(s) had noticeable drift" had
nothing to open.

### 4. "Add alt text" was the wrong fix for 16 of the 26 figures

Word exports text boxes, sidebars, SmartArt and chart title bars as `<Figure>`
with the text nested inside (`Figure → Textbox → P → Span`). The p42
"ERPO / FRO FACTS" sidebar alone is a Figure holding 108 text runs. A
Figure's `/Alt` replaces its contents for assistive technology, so following
the card's advice — "enter a description in the Alternate Text field" — would
have *hidden* that text. The chart title bars are a second trap: the Figure is
only the title strip; the chart's numbers live in a sibling `Chart → Sect`,
so the alt-text flag lands on the wrong element even though the chart as a
whole does need a text alternative.

## The fix

**pdfjsService.ts** — the page loop fetches the struct tree once and shares it.
New `collectStructTreeLinks(tree, textById)` returns each `Link` node's
content text (via the new shared `structNodeText`) and the annotation ids it
references — pdf.js serializes an OBJR kid as `{type:"object", id:"<ref>"}`,
or `{type:"annotation", id:"pdfjs_internal_id_<ref>"}` when the OBJR is the
element's only kid, so both are normalized to the bare ref that
`getAnnotations()` reports as `annot.id`. `links[]` is now one entry per
*link* (a wrapped link spanning several annotations is one entry) with
`tagged: true` and a `page`; an annotation no element claims keeps the
geometric fallback text and is `tagged: false`. `linkAnnotationCount` /
`untaggedLinkAnnotationCount` count every visible `/Link` annotation (external
and internal; Hidden/NoView excluded, as PDF/UA 7.18.1 excludes them). New
`collectTextBearingFigures(tree, textById, page)` records each Figure whose
descendants carry text, with an 80-character preview to find it by
(`textBearingFigures`, capped at 200). `buildMarkedContentTextMap` now treats
pdf.js's `hasEOL` — on an item or as a separate `{str:"", hasEOL:true}` item
— as a word boundary, so a wrapped link no longer reads
"RevocationEnforcement". All three new fields are absent on stored reports
from before this release; every consumer treats absence as "unknown" and
behaves exactly as before.

**scoring/pdf.ts** — `scoreLinkQuality(qpdf, pdfjs)`: in a tagged document
with the census present, `tagged: false` links are **not** judged on their
(geometric) text; they fail for the tagging reason alone, listed under
`--- Links Not Tagged ---` with page numbers and a fix that names Word's
text-box export behaviour and Acrobat's Unmarked Links finder. Score =
(links − vague − untagged) / links. The vague list gains page numbers and
says "too short to describe a destination" for 1–2-character text instead of
"vague phrase". Untagged documents and pre-census reports classify every link
on its text, as before (no second penalty for a missing tree). The
reading-order card lists `page N (M%)` for up to 12 drift pages. The alt-text
card appends `--- Figures That Contain Text ---` with page + preview lines and
the instruction not to describe them but to change the tag.

**scoring/conformance.ts** — 7b: in a tagged, content-bearing document,
untagged link annotations assert **1.3.1 Info and Relationships (A)** under
`link_quality` (W3C technique PDF11; PDF/UA 7.18.5). Mechanical and certain:
the annotation exists and nothing references it.

**scoring/adobeParity.ts** — `tagged_annotations` is computed from the census
(passed / failed `N of M` / vacuous when there are no link annotations /
failed outright in an untagged document), with the note stating that only
link annotations are checked. Pre-census reports stay `not_computed`.

**scoring/supplementary.ts** — the per-document Acrobat block (which the web
action plan renders as its "Fix the PDF in Acrobat" route) gains the Unmarked
Links path when untagged links exist, and the retag path when text-bearing
figures exist.

**apps/web/app/utils/actionPlan.ts** — `planCopyFor` now consults
findings-keyed variants for `alt_text` ("Describe the pictures — and turn the
text boxes back into text", keyed on the new block) and `link_quality` ("Tag
the links so screen readers can find them", keyed on `--- Links Not Tagged
---`, with a real Acrobat route instead of the source-only label). Both are
InDesign-aware; unmatched findings keep today's copy byte-for-byte.

## Verification

- `pdfjsLinkText.test.ts` builds a one-page tagged PDF whose link rectangle
  also contains the origin of the following text run — the exact bleed — and
  asserts the tagged link reads `annual report`, not
  `annual report today. Visit www.example.org`; a second, untagged annotation
  is reported as such with the census at 2 / 1.
- On the trigger file, re-analysis now reports: Link Quality **97 → 89**
  (three "here" links on p21/p21/p27, six untagged on p22, no "PA"); a
  second conformance failure (1.3.1, six untagged links); Acrobat parity
  "Tagged annotations: failed, 6 of 176"; drift pages
  `5 (58%), 6 (76%), 27 (51%), 32 (53%), 37 (54%), 39 (56%)`; 16 text-bearing
  figures listed by page. Overall **69/D unchanged** (Critical cap).
- The independent pikepdf walk that found all of this reproduced every other
  count in the report exactly (fonts, figures, headings, tables, lists,
  artifacts — `artifactRunCount` 540 is `/Artifact BMC` 451 + `BDC` 89),
  which is why the score was left alone.
- Suite 2,341 → 2,387 (API 1,202 → 1,241; web 1,090 → 1,097; CLI 49).

## Not changed, on purpose

- The fidelity exclusion still covers only a Figure's *direct* MCIDs
  (v1.81.0's "nested captions stay text"). Text inside `Figure → Textbox → P`
  therefore still counts as drift — page 39 would read 100% rather than 56%
  if all Figure descendants were excluded. That is a scoring-model decision,
  not a reporting fix, and is left for a deliberate change.
- Stored reports are never rewritten. A shared link made before this release
  keeps the text it was stored with; re-analysing the file produces a new
  report with the corrected findings.
