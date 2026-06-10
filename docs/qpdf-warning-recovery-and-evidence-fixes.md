# Audit Accuracy Fixes — qpdf Warning Recovery, JSON-v2 Refs & Conformance Evidence

**Date:** 2026-06-10 · **Branch:** `fix/qpdf-exit3-and-accuracy-fixes` · **Status:** Fixed, tested, independently code-reviewed, pending release
**Area:** `apps/api` — PDF structure parsing (`qpdfService.ts`, `pdfjsService.ts`), scoring (`scorer.ts`), conformance gate (`scoring/conformance.ts`), veraPDF wrapper (`veraPdf.ts`)
**Audience:** engineers (for future fixes) and reviewers/managers (for the trust narrative)

---

> **Standards scope.** Unchanged: the audit evaluates against **WCAG 2.1/2.2 Level AA** (IITAA 2.1 / ADA Title II). These fixes do not change what standard is checked — they fix cases where the *checker itself* reported things that were not true (false "untagged document" verdicts, false confirmed-failure claims, inflated structure counts) and cases where real signals were missed.

## 1. Executive summary

A full review of the auditing algorithms (2026-06-10) found two verified production bugs, one verified detection gap, and a set of high-confidence false-positive/false-negative generators. All are fixed in this branch, test-first.

| #   | Defect                                                                                                                                                                            | Impact                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | **qpdf exit code 3 ("succeeded with warnings") discarded the entire qpdf analysis.** The complete JSON on stdout was thrown away.                                                  | **Severe.** A tagged PDF with any recoverable defect (damaged xref, missing trailer `/Size`) was reported as untagged: verified A/B showed the *identical* document scoring **100 (A)** clean vs **42 (F)** with one trivial warning, with false "Document is NOT tagged" / "No heading tags found" Critical findings. |
| 2   | **The v1.24.1 nested-table fix was a no-op on qpdf ≥ 11 (JSON v2).** Object-map keys are `obj:N 0 R` but `/K` reference values are `N 0 R`; the exclusion compared one against the other and never matched. The regression tests passed because their fixtures used a hybrid format real qpdf never emits. | The original "more rows than the PDF has" symptom was still live on modern qpdf (verified: 1-table PDF → 2 tables, 3 rows). Same root cause silently killed the AcroForm `/Fields` fallback and the `/Pages`-tree page-map fallback. |
| 3   | **PDF/UA identifiers in XMP *attribute form* were invisible** (`<rdf:Description … pdfuaid:part="1"/>`). pdfjs's parser only reads child elements.                                  | False "does not claim PDF/UA conformance" for files from producers that compact XMP properties as attributes.               |
| 4   | **The title heuristic erased real titles** (any no-space title, e.g. "Budget2024", "Introduction") and then asserted a *confirmed* WCAG 2.4.2 failure claiming "no title in metadata". | Factually false confirmed-failure claims; −50 in Title & Language.                                                          |
| 5   | **1.3.2 Meaningful Sequence was asserted from heuristic scores.** A flat-but-correctly-ordered tree (heuristic score 30) tripped the "confirmed reading-order violation" gate with no order comparison ever run. | Unconfirmed claims in the conformance verdict — against the gate's own "confirmed violations only" doctrine.                |
| 6   | **Radio groups counted as N unlabeled fields.** `/TU` lives on the parent field; each kid widget was counted as its own field without it.                                          | A 5-option radio group produced five false "missing tooltip" findings plus a false 4.1.2 confirmed failure.                 |
| 7   | **Column-consistency ignored `/ColSpan`//`/RowSpan`.**                                                                                                                              | Correctly spanned tables flagged "inconsistent column counts" (−10) — while the fix text itself recommended using colspan.  |
| 8   | **Lists required `<Lbl>` on every item.** ISO 32000 permits label-less items; common tooling emits LBody-only lists.                                                                | Over-strict *confirmed* 1.3.1 failures for conformant lists. Now: `<LBody>` required, `<Lbl>` advisory.                     |
| 9   | **veraPDF failures displayed `ruleId: "FAILED"`** — the mapping read `ruleStatus` (a status) instead of the rule identifier.                                                        | Every failing rule in the remediation receipt showed "FAILED" instead of "7.1-1"-style identifiers.                          |
| 10  | **The Acrobat fix guide for forms never rendered** (guide keyed `form_fields`, category id is `form_accessibility`).                                                                | Failing form categories shipped without their How-to-Fix steps.                                                             |
| 11  | **How-to-fix steps and help links had drifted.** WebAIM links used a nonexistent `#702` anchor (verified live); W3C links hardcoded WCAG 2.1 while the app audits 2.2; several Acrobat paths predated the tool renames; the Scope instruction described a panel path that does not exist. | Users following the steps hit dead anchors and missing menus.                                                               |

## 2. Fix details

### Issue 1 — qpdf warning recovery (`qpdfService.ts`)

qpdf exits **3** when the input had recoverable defects but the operation succeeded — and still writes the complete document JSON to stdout. `execFile`/`execFileSync` surface any non-zero exit as an error; `handleQpdfError` returned an empty result without reading the attached `err.stdout` (which `execQpdfAsync` was already capturing). The fix recovers `err.stdout` **only for exit code 3** (`err.status`/`err.code`) and only when the payload is document-shaped (`qpdf`/`objects` key present), after the existing encrypted/timeout guards; anything else still falls back to the "QPDF parsing failed" result. Exit 2 ("errors — file not processed correctly") is deliberately NOT recovered: the conformance gate refuses to assert failures when `qpdf.error` is set, and recovering disclaimed output would let it assert confirmed WCAG failures from bad data. Version-independent (no reliance on `--warning-exit-0`).

### Issue 2 — qpdf JSON v2 reference normalization (`qpdfService.ts`)

qpdf ≥ 11 emits JSON v2: the object map is keyed `"obj:N 0 R"` while indirect-reference *values* stay `"N 0 R"`. A module-level `normRef()` now bridges every key↔value comparison: table candidates vs. descendant-table refs, widget/field refs vs. AcroForm `/Fields` entries, and the `/Pages`-tree fallback page map. The AcroForm fallback also resolves `/AcroForm` itself when it is an indirect ref (it previously only worked for inline dicts). **Test fidelity:** new regression fixtures use the *real* v2 shape (`obj:` keys + `{ value: … }` wrappers); the older hybrid fixtures remain to cover v1-format parsing (qpdf ≤ 10).

### Issues 3–8 — detection & evidence corrections

- **PDF/UA (pdfjs):** when `getAll()` lacks `pdfuaid:part`, the raw XMP packet (`metadata.getRaw()`) is scanned for the element *and* attribute forms.
- **Title:** `analyzeWithPdfjs` never nulls a title. A narrowed, exported `isFilenameLikeTitle()` flags real filename/tool-generated patterns (extensions, `Microsoft Word - …`, `scan_20240115`, separator-no-space names) and deliberately leaves plain single words alone. Scoring gives a flagged title partial credit (25/50) with an advisory; the 2.4.2 conformance failure fires only when no title exists at all.
- **1.3.2:** the rigorous struct-tree vs. content-stream MCID comparison moved to `scoring/readingOrderFidelity.ts`, shared by the scorer and the conformance gate. The gate now consumes the comparison itself (score ≤ 40 ⇒ < 80 % order match) — heuristic category scores can no longer assert a confirmed violation.
- **Forms:** kid widgets walk their `/Parent` chain to the owning field (`/T`), the field is counted once, and `/TU` is read from the widget or any ancestor up to the field. Non-terminal container fields in `/Fields` are skipped (their kid fields are counted individually).
- **Tables:** per-row cell counts became effective *grid* columns — `/ColSpan` widens a cell, `/RowSpan` carries columns into following rows.
- **Lists:** `isWellFormed` = every `<LI>` has an `<LBody>`. Missing `<Lbl>` is reported as an optional, non-penalized note. **Recorded decision:** an `<LI>` containing only an `<Lbl>` (no `<LBody>`) is still a confirmed failure — ISO 32000 technically permits Lbl-only items, but content without an `<LBody>` is not programmatically associated, matching PAC/Acrobat behavior.

### Issues 9–11 — reporting accuracy

- veraPDF rule rows now read `clause-testNumber` ("7.1-1"); the receipt UI suppresses the clause when the id already starts with it.
- The Acrobat guide map key matches the category id (`form_accessibility`).
- Help links: WebAIM anchors repointed to the verified series pages (`…/acrobat/reviewing#repairs`, `…/reviewing#order`, `…/other#bookmarks`); W3C "Understanding" links now follow `WCAG.VERSION` (2.2 by default, 2.1 when reverted); Acrobat steps name the current tools (All tools → Prepare for accessibility → *Check for accessibility* / *Automatically tag PDF* / *Fix reading order*) with classic-UI fallbacks, and the table-Scope instruction now goes through the Reading Order tool's **Table Editor** (the previously documented "TH Properties → Scope" path does not exist).

## 3. Verification

- **TDD throughout** — every fix has a regression test that was written first and watched fail (e.g. the v2 nested-table fixture failed with "expected length 1 but got 2"; the attribute-form XMP test failed against real pdfjs parsing before the fallback existed).
- **Suites:** API **436** (was 358) across 14 files; Web **311** across 19 files; total **747**. `pnpm build` (tsc `--noEmit` + nuxt build): clean.
- **End-to-end against real qpdf 12.3.2** (hand-built PDFs, real binary):
  - identical tagged document, clean vs. trailer-missing-`/Size`: **100 (A) / 100 (A)** (was 100 / 42-F with false "NOT tagged" findings);
  - 1-visible-table nested-table document: **1 table, 2 rows** (was 2 tables, 3 rows);
  - `/Info` title "Budget2024": preserved, full credit, **no 2.4.2 failure** (was erased + failure);
  - `/Info` title "report_v3_final.pdf": preserved, 25/50 + advisory, no false conformance failure.

## 4. Follow-ups / open items

| Item                       | Description                                                                                                                                                   | Status       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Layout tables**          | Pre-existing: tables tagged `/Table` with no `<TH>` still produce a confirmed 1.3.1 failure even when they are layout tables. Known from v1.22 follow-ups.     | Open         |
| **Suspicious-alt heuristic** | `detectSuspiciousAltText` flags all-CJK/Cyrillic/Arabic alt text ("mostly non-ASCII"). Advisory-only, no score effect, but noisy for non-Latin documents.     | Open (minor) |
| **Standard-14 fonts**      | Fonts without a `FontDescriptor` (standard 14) are absent from the font list, so `allFontsEmbedded` is vacuously true. Signals panel already says "vacuously". | Open (minor) |
| **`parsePdfDate` timezone** | The offset is parsed but discarded (timestamps shift by their zone). Display-only metadata.                                                                   | Open (minor) |

## 5. Changed files

| File                                                 | Change                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/services/qpdfService.ts`               | exit-3 stdout recovery; `normRef()` + v2-key normalization; AcroForm ref resolution; multi-widget field collapsing; span-aware column grid; LBody-only list policy |
| `apps/api/src/services/pdfjsService.ts`              | title preserved + `isFilenameLikeTitle()` (exported); `titleLooksLikeFilename` flag; raw-XMP attribute-form PDF/UA fallback |
| `apps/api/src/services/scorer.ts`                    | filename-like title partial credit; version-aware W3C help links; fixed WebAIM links; corrected Acrobat fix strings; fidelity check extracted |
| `apps/api/src/services/scoring/readingOrderFidelity.ts` | new — shared rigorous reading-order comparison                                                                       |
| `apps/api/src/services/scoring/conformance.ts`       | 1.3.2 from rigorous evidence only; LBody-based list failure wording                                                  |
| `apps/api/src/services/scoring/supplementary.ts`     | `form_accessibility` guide key; Lbl-advisory list findings; Acrobat tool renames & corrected paths                   |
| `apps/api/src/services/scoring/adobeParity.ts`       | list-rule note wording (placement, not `<Lbl>` presence)                                                             |
| `apps/api/src/services/veraPdf.ts`                   | `extractVerdict` exported; rule ids from clause + testNumber                                                         |
| `apps/web/app/pages/remediate/[jobId].vue`           | suppress clause repetition next to the new rule ids                                                                  |
| `apps/api/src/__tests__/…`                           | +78 tests: exit-3 recovery + exit-code gating, real-v2 fixtures, spans (incl. multi-row RowSpan carry), lists, multi-widget fields (incl. merged-dict dedupe), title classifier + real-pdfjs wiring (new file), XMP forms (new file), veraPDF mapping (new file), help-link accuracy, 1.3.2 evidence |

## 6. The takeaway for future work

> **Two lessons.** (1) *Test fixtures must mirror the real tool output byte-for-byte.* The nested-table fix shipped green against a JSON shape qpdf never emits; one `obj:` prefix made it a production no-op. When a parser wraps an external binary, derive at least one fixture from the binary's actual output. (2) *A non-zero exit code is not the same as "no output".* Recovery-style tools (qpdf, ffmpeg, ImageMagick) routinely succeed with warnings; discard their stdout only after trying to use it.
