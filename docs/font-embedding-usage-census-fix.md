# Font-embedding false positives fix (v1.79.0)

**Date:** 2026-08-17 · **Tag:** `v1.79.0` ·
**Trigger:** two user-reported PDFs that Adobe's preflight tools pass but this
audit marked down for "fonts not embedded" — a newsletter
(`newsletter-accessible.pdf`, 89/B) and a set of meeting minutes
(`dvfrc-meeting-minutes-052124-A0.pdf`, 89/B). With the fix the minutes score
**100/A**; the newsletter's Text Extractability rises from **85/Minor to
100/A** (its overall stays 89 on an unrelated table-markup finding).

---

## Paste-ready — reply to the person who reported it

> **Issue:** Several documents were flagged for "fonts not embedded" even
> though Adobe's preflight tools pass them. Both reports were false alarms,
> for two different reasons. In one file, the un-embedded font is only ever
> used to draw the *spaces between words* — word processors quietly switch to
> the paragraph's default font for whitespace, and a space paints nothing, so
> it can't display incorrectly. In the other, the flagged fonts are leftover
> bookkeeping that Acrobat's **own repair process** leaves inside the file —
> no page actually uses them at all.
> **Mitigation:** We've updated the audit engine to evaluate fonts the way
> Adobe does: a font is flagged only when it is both un-embedded **and**
> actually used to display visible text. Fonts nothing can select, and fonts
> used only for whitespace, no longer count against the score — and the
> report now says exactly why, per font. A font that genuinely displays text
> without being embedded is still flagged exactly as before. Note that
> previously saved reports keep their original evaluation — re-running the
> audit on the same file shows the corrected result.

## Paste-ready — internal team note

> **Thanks for flagging the fonts disagreement with Adobe — both files were
> false positives, from two different causes.** The newsletter's ArialMT is
> real and un-embedded, but its only use in the entire document is five
> single-space text runs (`( )Tj`) — Word emits inter-run whitespace in the
> paragraph default font, and a space has no glyph to garble. The meeting
> minutes' three flagged fonts exist only as styling metadata Acrobat left in
> the structure tree after its own font-embedding fixup re-embedded everything
> the pages actually use (`pdffonts` shows 6/6 embedded). v1.79.0 makes the
> check match Adobe's "fonts used for rendering" evaluation; the minutes now
> score **100/A (up from 89/B)** and the newsletter's text category is clean.
> Files already in the audit database keep their stored evaluation until
> they're re-analyzed (`force=true` on `/api/audit-url`), because the fix
> changes what the analyzers extract, not just how it's scored.

---

## What was wrong

The check inventoried **every `/Type /FontDescriptor` object in the raw PDF
object table** and flagged any without a `/FontFile`/`/FontFile2`/`/FontFile3`
(Type3 fonts exempt since v1.36.x). That measures "font descriptors present in
the file," not "fonts used to render text" — which is the population Adobe
Preflight evaluates and the one the PDF/A / PDF/UA embedding rules define
("the font programs for all fonts **used for rendering** shall be embedded").
Two real-world patterns split those populations:

1. **Whitespace-only usage** (`newsletter-accessible.pdf`): non-embedded
   ArialMT sits in the page's `/Resources /Font` as `/TT3` and is selected
   five times — each run painting exactly one space. Decoded content streams:
   `0.459 0 Td ( )Tj` × 5, nothing else. No visible glyph ever comes from the
   missing font program, and text *extraction* comes from the encoding/
   ToUnicode tables, not the font program.
2. **Unreachable remediation leftovers** (`dvfrc-meeting-minutes-052124-A0.pdf`):
   the flagged TimesNewRomanPSMT / ArialMT / TimesNewRomanPS-BoldMT are
   referenced **only** from `/ADBE_FT-Style` attribute dictionaries
   (`adbe_style_NNNNNN` entries in the struct tree's ClassMap) — style
   metadata written by Acrobat's tagging machinery. The fonts the pages
   actually use are the re-embedded `YKHLTW+` subsets of the same faces.
   A content stream can only select fonts named in a `/Font` resource
   dictionary; these can never render. `pdffonts` (which walks page
   resources) reports 6 fonts, all embedded — our walker counted 10
   descriptors.

## The fix — a two-stage census

**Stage 1 — rendering reachability (`packages/analyzer/src/qpdfService.ts`).**
A descriptor enters the census only when a font referenced from a `/Font`
resource dictionary (pages, form XObjects, annotation appearance streams,
AcroForm `/DR`; indirect resource dicts resolved; Type0 fonts followed through
`/DescendantFonts` to the CIDFont's descriptor) points at it. Each census
entry also records the referencing fonts' `/BaseFont` names (`baseFonts`),
because the descriptor's `/FontName` ("Arial") and the font dict's
`/BaseFont` ("ArialMT") routinely differ — and pdfjs/pdffonts report the
BaseFont. This mirrors the struct-tree orphan pruning the same walker has
done for phantom Figure/List/Table tags since v1.36.x — same disease,
different organ.

**Stage 2 — visible-text usage (`packages/analyzer/src/pdfjsService.ts`).**
The existing per-page operator-list walk now tracks the current font
(`setFont` → `commonObjs` → the translated font's BaseFont-style `.name`,
which pdfjs preserves even for non-embedded fonts), the text rendering mode
(`Tr`, with q/Q save/restore), and every show-text operator. A font enters
`visibleTextFontNames` when it paints at least one glyph outside **render
mode 3** (invisible — the OCR-text-layer carve-out ISO 19005 also makes)
whose unicode is not pure whitespace. Conservative in every ambiguity: a
glyph with no unicode mapping counts as visible; if any visible run's font
cannot be resolved the whole signal is withheld (`undefined`), which disables
exemptions entirely.

**Scoring (`splitNonEmbeddedFonts` in `packages/analyzer/src/scoring/common.ts`).**
Non-embedded fonts split into *flagged* (name — subset prefixes stripped —
intersects the usage census) and *exempt* (provably never display visible
text). Only flagged fonts cap Text Extractability at 85/Minor; the same split
drives the Adobe-parity character-encoding rule. `visibleTextFontNames === undefined`
(every stored report from before v1.79.0) → all non-embedded fonts flagged,
the legacy behavior, pinned by test.

## Honest reporting, and a wording contract

- Per-font lines stay factual: `Arial — NOT embedded (never displays visible
  text — no impact)`. The census counts ("6 font(s) found: 5 embedded, 1 not
  embedded") and the PDF/UA signals panel stay raw — only the finding and the
  cap apply the exemption.
- When every non-embedded font is exempt the summary reads "All fonts used to
  display text are embedded. …" — the unconditional "All fonts are embedded"
  line appears only when it is literally true.
- **The exempt-path wording must never contain the phrase "non-embedded
  font".** `apps/web/app/utils/actionPlan.ts` selects the "Embed the fonts"
  fix step via `/non-embedded font/i` over the category's findings; an exempt
  file must not be told to embed harmless fonts. A scorer test asserts no
  finding matches that regex when all non-embedded fonts are exempt.

## What deliberately did not change

- A non-embedded font that displays visible text: flagged, 85/Minor cap,
  identical wording and fix steps.
- Stored reports regrade on read as always — but regrading re-scores stored
  *signals*, and pre-v1.79.0 payloads carry neither the reachability-filtered
  census nor the usage signal, so **their evaluation is unchanged until the
  file is re-analyzed** (`POST /api/audit-url` with `force=true`, or a fresh
  upload). This is the fail-safe direction: old reports can only be
  over-strict, never silently lenient.
- Fonts with no descriptor at all (untracked standard-14 usage) were never
  part of the census and still aren't.

## Verification

- 18 new tests, every driver watched failing first: 6 reachability census
  tests (struct-tree-only exclusion, orphan exclusion, `baseFonts`, Type0
  chain, `/DR`, indirect dicts) in `qpdfParser.test.ts`; 5 real-pdfjs usage
  tests on hand-built PDFs in `pdfjsFontUsage.test.ts`; 7 scoring tests
  (exempt / flagged / subset-prefix correlation / legacy-absent fallback /
  honest wording / action-plan trigger guard / Adobe-parity pass) in
  `scorer.test.ts`.
- Both reported files re-audited through the real CLI: minutes 89/B → 100/A
  ("6 font(s) found: 6 embedded"); newsletter Text Extractability 85 → 100
  with the exempt wording, census still factually "5 embedded, 1 not
  embedded".
- Full suites 2,288 → 2,307 (API 1,196 / web 1,062 / CLI 49 — the web +1 is
  the same-release "What's New" banner heading); build, typecheck, lint,
  format all green.
