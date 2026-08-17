# Reading-order figure-exclusion fix (v1.81.0)

**Date:** 2026-08-17 · **Tag:** `v1.81.0` ·
**Trigger:** a user-reported Excel-exported PDF (`orderform-accessible.pdf`)
scoring **89/B** with a reading-order deduction (90/Minor) whose only
divergence was the company logo, plus a table finding. With the fix, Reading
Order scores **100**; the overall stays **89** on the table finding — which
was verified **genuine** (see below).

---

## Paste-ready — reply to the person who sent the file

> **Issue:** Your order form was marked down on two counts. One was a false
> alarm on our side, now fixed: the "reading order" check compared the order
> content is *drawn* against the order it's *tagged* for screen readers, and
> Excel draws images last no matter where they belong — your logo is tagged
> first (correctly — it's at the top of the page) but drawn last, and the
> check counted that against you. Image drawing order is invisible to screen
> readers, so it's no longer part of the comparison.
> **Still to fix:** the second finding is real. Your table has header cells
> both across the top *and* down the first column, but none of them declare
> their **scope** — so a screen reader can't tell whether a header applies
> to its row or its column. Adobe Acrobat's own checker doesn't test for
> this, which is why it showed all green. The fix takes about two minutes:
> Acrobat Pro → open the table in the **Table Editor** → right-click each
> header cell → Table Cell Properties → set Scope to **Column** (top row) or
> **Row** (first column). Re-check the file here afterward and it should
> score 100.

## Paste-ready — internal team note

> **The order form's 89 was half right.** The reading-order deduction was a
> heuristic artifact: the ONLY divergence between tag order and draw order
> was the logo `/Figure` (alt "Office Supply") — tagged first, at the top
> inch of the page, painted last by Excel. 27/28 marked-content runs agreed
> (96.4%), just missing the 97% "perfect" band. v1.81.0 excludes figure
> MCIDs from the fidelity comparison (image paint order is z-order, not
> reading order); displaced TEXT deducts exactly as before. The **table
> finding stands**: 8 of 8 `<TH>` in a two-way header table carry no
> `/Scope` and no `/Headers` (verified in the raw structure — the elements
> have no attribute dictionaries at all). Acrobat's checker doesn't test
> Scope, which is why the sender believed the file was 100% accessible.

---

## What was wrong

`computeReadingOrderFidelity` compares the structure-tree MCID sequence
(logical tag order — what screen readers follow) against the content-stream
MCID sequence (draw order) with a longest-common-subsequence ratio, and its
top band (≥97% = 100) exists to absorb extraction jitter. Two facts collide
on short pages:

1. **Office exporters paint images by z-order, typically last**, regardless
   of where the image is tagged. That is correct rendering behavior and
   carries zero reading-order information.
2. **One displaced element on a page with fewer than ~34 comparable runs
   busts the 97% band arithmetically** (27/28 = 96.4%). So a one-page
   document whose only "divergence" is a top-of-page logo painted last
   lost 10 points and took a Minor — for being tagged correctly.

## The fix

- `qpdfService.ts` now emits `figureMcidsByPage`: the DIRECT MCIDs of
  `/Figure` elements per page, role-mapped figures included (Excel's
  `Diagram → Figure`), collected in the same struct-tree walk that builds
  `structTreeMcidsByPage`. MCIDs of elements *nested inside* a figure
  (captions) are not marked — their text order stays comparable.
- `readingOrderFidelity.ts` filters those MCIDs out of both sequences
  before the LCS. Text displacement deducts exactly as before (test-pinned
  with a real text swap alongside a moved figure).
- Stored reports from before v1.81.0 lack the census and keep the legacy
  all-MCIDs comparison until re-analyzed — the fail-safe direction (old
  reports can only be over-strict).
- The finding copy states the exclusion, and the technical explainer's
  reading-order description — which still described a pre-fidelity
  "20% of MCIDs" model that no longer exists — was rewritten to match the
  real bands (97/90/85/65/30, flat-tree 30, no-tree 0, N/A when too short
  to compare).

## Why not "tolerate any single displaced element"?

Rejected deliberately: an existing test pins that one adjacent TEXT swap in
a 20-item page (95%) deducts, transparently — and a single displaced heading
IS a real problem. LCS cannot distinguish "one adjacent swap" from "one
long-range move", but *what kind of element moved* can: image paint position
is never reading-order evidence, text position sometimes is. Excluding
figures removes exactly the non-signal and nothing else.

## Verification

- 6 new tests, drivers watched failing first: 3 parser (figure census,
  role-mapped figures, nested-caption exclusion) in `qpdfParser.test.ts`;
  3 scoring (the Excel logo case → 100; legacy payload without the census →
  90 unchanged; moved figure + real text swap → still deducts) in
  `scorer.test.ts`.
- Real files: orderform Reading Order 90 → 100 (overall stays 89 on the
  genuine table finding); the other two 2026-08-17 incident files
  byte-identical scores (newsletter 89, minutes 100).
- Full suites 2,319 → 2,325 (API 1,202 / web 1,074 / CLI 49); build,
  typecheck, lint, format all green.
