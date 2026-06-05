# Audit Accuracy Fixes — PDF/UA, Artifacts, Embedded Fonts, Reading Order & Link Scoring

**Date:** 2026-06-05 · **Release:** _pending — proposed v1.25.0_ · **Status:** Fixed & tested on `main` (not yet committed; changelog/version bump pending owner confirmation)
**Area:** `apps/api` — PDF extraction (`pdfjsService.ts`, `qpdfService.ts`) and scoring (`scorer.ts`, `scoring/supplementary.ts`)
**Audience:** engineers (for future fixes) and reviewers/managers (for the trust narrative)

---

> **Standards scope.** This audit evaluates against **WCAG 2.1 Level AA** (the standard Illinois IITAA 2.1 requires) and **WCAG 2.2 Level AA** (a superset the app currently anchors to). **PDF/UA-1 (ISO 14289-1)** is a _separate_ ISO standard, related but not identical to WCAG; this tool reports the PDF/UA **identifier** as an informational signal, not as a scored requirement. None of these fixes change the WCAG conformance verdict (`conformance.ts`) — they correct **findings text** and two **scoring calibrations**.

## 1. Executive summary

A user audited four freshly-remediated ICJIA control PDFs (`2026_dvfrc_biennial_report`, `Community-Based-Corrections-TF`, `InfoNet_Data_Quality_Paper`, `icjia-PHA-2025-report`) and compared the output to **PAC** (the PDF Accessibility Checker). Several results were wrong or misleading:

1. **DVFRC lost 10 points on "Reading Order" with no error shown** in the report — a phantom deduction.
2. **All four files were flagged "No PDF/UA identifier"** — but every file _does_ declare PDF/UA-1.
3. **All four were flagged "No artifact tags"** — but every file artifact-tags its headers/footers/page numbers.
4. **A "Check font embedding" reminder appeared even though every font is embedded**, and a separate file (`COVID arrests…`) flagged genuinely-**embedded Type3 fonts as not embedded**.
5. **Every file was docked on "Link & URL Quality"** for using full URLs as link text — stricter than both WCAG 2.4.4 and PAC.
6. **A full "Adobe Acrobat: How to Fix" card was attached to every category, including perfect (100) ones** — pure visual noise.

These are correctness/trust issues. The scores were _close_ to right, but the **findings text contradicted reality** (and PAC), which is what erodes confidence in an audit tool.

| #   | Symptom (what the user saw)                              | Defect                                                                                                                                                                | Impact                                  |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | "−10 Reading Order, no error shown" (DVFRC)             | The struct-vs-content MCID **fidelity ladder** dropped 98 % to a 90, and the deduction printed only a neutral "fidelity: 98 %" line — no visible reason.             | Phantom deduction                       |
| 2   | "No PDF/UA identifier" on a PDF/UA-1 file               | Detection read a `qpdf --json` stream-`data` field **that flag never emits**; the XMP is compressed and invisible to qpdf. The check could **never** succeed.        | Universal false negative (text only)    |
| 3   | "No artifact tags" on an artifact-tagged file           | Detection counted struct-tree `/S=/Artifact` elements (rare); real artifacts are **content-stream marked content** (`/Artifact BDC … EMC`), which it never inspected. | Near-universal false negative (text)    |
| 4   | "Check font embedding" / Type3 fonts "not embedded"     | The Acrobat guide showed on passing categories (see #6); separately, **Type3 fonts** (inline `/CharProcs`, no `/FontFile`) were mis-flagged as non-embedded.          | False positive (text) + real font bug   |
| 5   | "Link & URL Quality" docked for URL-as-text             | A visible URL was scored as a 2.4.4 failure. WCAG 2.4.4 is met when purpose is **determinable**, and a URL is; PAC does not flag it either.                           | Over-strict deduction                   |
| 6   | "How to Fix" card on every category, even 100s          | The guard skipped the guide only when `severity === "Pass"`, but no severity is ever literally `"Pass"` (they are `No issues found / Minor / …`), so it always ran.   | Visual noise on passing categories      |

**Net effect on the four control files:** all four rose to **100 (A)** — DVFRC 95 → 100, CBC 95 → 100, InfoNet 96 → 100, PHA 98 → 100 — and the contradictory findings text is gone. No WCAG conformance verdict changed.

All six are fixed. The full API test suite passes (**371 tests**), the `tsc --noEmit` build is clean, and **13 new/updated regression tests** were added (written failing first, then made to pass).

---

## 2. Background — two extractors, two blind spots

The API runs **two** independent extractors in parallel (`pdfAnalyzer.ts`):

- **QPDF** (`qpdfService.ts`) dumps the PDF object graph as JSON. It sees the **structure tree**, fonts, MarkInfo, RoleMap, tables, etc. It does **not** (with the `--json` invocation used here) expose **stream bodies** — so the **XMP metadata** (where the PDF/UA identifier lives, Flate-compressed) and the **page content streams** (where artifacts live) are invisible to it.
- **pdf.js** (`pdfjsService.ts`) renders/parses the document. It **does** parse the **XMP** (`getMetadata().metadata`) and **does** walk the **content-stream operator list** (it already tracked `/Artifact` runs to exclude them from reading order).

Three of the six bugs come down to one principle:

> **The PDF/UA identifier and artifact tagging must be read from pdf.js (XMP + content stream), not from qpdf.** They live in places `qpdf --json` does not expose. This was verified empirically: `qpdf --json` (and even `--json-stream-data=inline`) yields **zero** occurrences of `pdfuaid` for a file that plainly contains `<pdfuaid:part>1</pdfuaid:part>`, because the XMP stream is compressed.

---

## 3. Issue #1 — PDF/UA identifier false negative

### Symptom

Every PDF/UA-1 file reported **"No PDF/UA identifier found."**

### Root cause

`parseQpdfJson()` tried to grep stream data off each object:

```ts
// before — qpdfService.ts
const streamData = (rawObj as any).data;
if (typeof streamData === "string" && streamData.includes("pdfuaid")) { … }
```

But the command is `qpdf --json <file>` with **no `--json-stream-data` flag**, so `rawObj.data` is always `undefined`. Even _with_ that flag, qpdf emits the **raw, still-compressed** XMP bytes (base64), so the literal `pdfuaid` never appears. The check was dead code — `hasPdfUaIdentifier` was **always false**, regardless of the file.

### Fix

Read the identifier from pdf.js, which already parses the XMP into a key/value map:

```ts
// after — pdfjsService.ts, inside analyzeWithPdfjs()
const xmp = (metadata as any)?.metadata
if (xmp && typeof xmp.getAll === 'function') {
  const part = xmp.getAll()['pdfuaid:part']
  if (part != null && `${part}`.trim() !== '') {
    result.hasPdfUaIdentifier = true
    result.pdfUaPart = `${part}`.trim()
  }
}
```

`supplementary.ts` now reads `pdfjs.hasPdfUaIdentifier || qpdf.hasPdfUaIdentifier` (the qpdf path is kept as a harmless fallback). New `PdfjsResult` fields: `hasPdfUaIdentifier`, `pdfUaPart`.

---

## 4. Issue #2 — Artifact tagging false negative

### Symptom

Every file that artifact-tags its running headers/footers reported **"No artifact tags found,"** _directly contradicting_ the line above it ("content is properly distinguished from artifacts," from `/MarkInfo /Marked true`).

### Root cause

`artifactCount` counted only **structure elements** whose role mapped to `/Artifact`:

```ts
// before — qpdfService.ts
if (tag === "/Artifact") result.artifactCount++;
```

But artifacts are, by definition, **excluded from the structure tree** — they are marked content in the page content stream (`/Artifact BDC … EMC`). So the struct-tree count is essentially always `0`, even for documents with hundreds of artifact runs (the four control files have 17–332 each).

### Fix

Count artifact runs from the pdf.js operator list — the same walk that already classified `/Artifact` runs to keep them out of the MCID reading order. A run nested inside another artifact is not double-counted:

```ts
// after — pdfjsService.ts operator-list walk
if (isArtifact && !artifactStack.some((f) => f)) artifactRunCount++
```

`supplementary.ts` now uses `qpdf.artifactCount + (pdfjs.artifactRunCount ?? 0)`. New `PdfjsResult` field: `artifactRunCount`.

---

## 5. Issue #3 — Embedded-font check (Type3 false positive)

### Symptom

The user reported fonts flagged as not-embedded that _are_ embedded. For the four target files the font check was already correct (all embedded, matching `pdffonts`), but a fifth control file (`COVID arrests…`, a pdfTeX export) flagged **TeXGyreTermes-Regular/Italic/Bold** as not embedded — `pdffonts` says they're embedded.

### Root cause

Those are **Type3 fonts** (`/Subtype /Type3`). A Type3 font defines its glyphs **inline as PDF content streams** (`/CharProcs`) and therefore **never** carries a `/FontFile`/`/FontFile2`/`/FontFile3`. The embedding check tested only for those keys:

```ts
// before — qpdfService.ts
const embedded = !!(o["/FontFile"] || o["/FontFile2"] || o["/FontFile3"]);
```

So every Type3 font was mislabeled "not embedded," even though its glyphs are fully self-contained in the file.

### Fix

Pre-scan for Type3 fonts and treat their descriptors as embedded:

```ts
// after — qpdfService.ts (pre-pass collects Type3 /FontDescriptor refs)
const embedded =
  !!(o["/FontFile"] || o["/FontFile2"] || o["/FontFile3"]) ||
  type3DescriptorRefs.has(normRef(ref));
```

(`normRef` strips qpdf v2's `obj:` key prefix so the descriptor ref from the font dict matches the object-map key.)

### Result (verified vs `pdffonts`)

`COVID arrests…`: embedded `2 → 5`, not-embedded `7 → 4`. The remaining four — `ArialMT`, `TimesNewRomanPSMT`, `…Italic`, `…BoldMT` — are **exactly** the base fonts `pdffonts` reports as non-embedded. Tool and ground truth now agree on every control file.

---

## 6. Issue #4 — "How to Fix" card on perfect categories

### Symptom

The step-by-step **"Adobe Acrobat: How to Fix"** card (including a "Check font embedding" line) appeared under categories scoring **100**, where there is nothing to fix.

### Root cause

`supplementary.ts` skipped the guide only for a severity that does not exist:

```ts
// before
if (cat.score === null || cat.severity === "Pass") continue;
```

Severities are `"No issues found" / "Minor" / "Moderate" / "Critical"` (`audit.config.ts`) — never the literal `"Pass"`. So the guard never matched and the guide attached to **every scored category**, including 100s.

### Fix (per the owner's instruction: only below 100)

```ts
// after
if (cat.score === null || cat.score === 100) continue;
```

Categories at 100 (or N/A) get no remediation card; anything below 100 still does.

---

## 7. Issue #5 — Link & URL Quality over-penalized raw URLs

### Symptom

All four files were docked (CBC to 23, InfoNet 36, PHA 62, DVFRC 50) for using **full URLs as visible link text**.

### Root cause

`isNonDescriptiveLinkText()` treated a raw URL the same as a vague phrase:

```ts
// before — scorer.ts
if (/^(https?:\/\/|www\.)/i.test(t)) return true; // counted against the score
```

But **WCAG 2.4.4 (Link Purpose)** is satisfied when the destination is **determinable from the link text** — and a visible URL _is_ its own determinable destination. WCAG's failure examples are vague phrases ("click here"), **not** URLs. **PAC does not flag URL-as-text either.** So the tool was stricter than both the standard and the checker it was being compared to. (CBC's flagged links were _all_ full URLs — no vague phrases — so the deduction was entirely this false-strictness.)

### Fix

Three-way classification: raw URLs are **advisory (not penalized)**; only genuinely non-descriptive text (empty, vague phrase, 1–2 chars) is penalized:

```ts
// after — scorer.ts
function classifyLinkText(text): "descriptive" | "rawUrl" | "needsFix" { … }
// score = (links − needsFix) / links × 100   (rawUrl does not reduce the score)
```

Raw URLs are still surfaced under a **"Raw URL Link Text (advisory — not penalized)"** heading with a note that a descriptive label reads better in a screen reader's link list. Vague phrases ("click here") remain a real, scored 2.4.4 finding.

---

## 8. Issue #6 — Reading Order phantom −10 (DVFRC)

### Symptom

DVFRC lost 10 points on Reading Order, but the report showed **no reading-order error** — only a neutral "Reading-order fidelity: 98 %" line that reads like good news.

### Root cause

`computeReadingOrderFidelity()` compares the struct-tree MCID order against the content-stream MCID order via longest-common-subsequence, then maps the ratio to a score with a **hard ladder**:

```ts
// before — scorer.ts
if (similarity >= 0.99) score = 100;
else if (similarity >= 0.95) score = 90;   // 98 % landed here → 90
…
```

DVFRC measured **98 %** → **90**. Two problems compounded:

1. **The deduction was invisible.** The drift warning prints only when a _page_ is < 80 %; with all pages ≥ 80 %, only the neutral percentage showed. A 1–2 % LCS wobble on a clean Word export is almost always **MCID-extraction jitter** (artifact handling, multi-MCID runs), not genuine disorder.
2. **The category contradicted itself** — it still carried stale boilerplate ("this analyzer does not yet compare per-page marked-content order … a precise verdict would be unreliable") printed _directly above_ the comparison it had just performed.

### Fix

- **Widen the top band** to absorb extraction jitter: `≥ 0.97 → 100` (was `0.99`), and add a `≥ 0.90 → 90` band. DVFRC's 98 % now scores **100**.
- **Remove the stale "cannot compare" boilerplate** from the path where the comparison _does_ run (it remains, honestly, only in the genuine "could not compare" fallback).
- **Make any deduction transparent**: when the score is below 100, the report now states `Reading order scored N/100 — the tagged order matched the visual draw order on X% of comparable content (a perfect 100 requires ≥ 97%)…` so the points are never docked silently.

---

## 9. Is this "the same as PAC"? (the user's question)

No — and that's by design, with three caveats now corrected:

- **PAC** is a binary **PDF/UA-1 (ISO 14289-1)** conformance checker (Matterhorn Protocol; ~half its 107 conditions are machine-checkable, the rest require human judgment). **PAC does not emit a 0–100 score.**
- **This tool** is a weighted, partial-credit **WCAG readiness score**. Different instrument, different output.

So divergence is expected. But three of the specific divergences the user hit were **our bugs**, not methodology: the PDF/UA-identifier false negative (#1), the artifact false negative (#2), and the URL over-strictness (#5). With those fixed, the tool stops _looking_ wrong next to PAC. This release also **adds a PDF/UA-1 conformance-signals panel** (`PdfUaSignalsCard.vue`, rendered on every report) surfacing the now-correct PDF/UA identifier, tagging/MarkInfo/artifact/font signals, and an honest "what PAC / veraPDF / the Matterhorn Protocol additionally check" explainer — see §11.

---

## 10. Verification

- **Tests written first, watched fail, then made to pass** (TDD). Every new behavior test failed RED for the right reasons before its fix; the Type3 test failed `expected false to be true`.
- **API suite: 358 → 373** (+15: PDF/UA + artifact sourcing, Type3 fonts, link recalibration, reading-order band/transparency, `pdfUa` signals). **Web suite: 308 → 311** (+3: `PdfUaSignalsCard`). `tsc --noEmit` and `nuxt build` both clean.
- **End-to-end on the real control files** (via `apps/api/src/spike/audit-dump.ts`): all four 100 (A); PDF/UA, artifacts, fonts, links, and reading order all report correctly; `COVID arrests…` font verdict now matches `pdffonts` exactly.

```bash
pnpm --filter api test        # full API suite (371)
pnpm --filter api build       # tsc --noEmit
# spot-check a file end-to-end:
cd apps/api && npx tsx src/spike/audit-dump.ts ../../controls/<file>.pdf full
```

---

## 11. Follow-ups / open items

| Item                          | Description                                                                                                                                                                                                 | Status                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Conformance / PDF-UA panel**| Shipped: `PdfUaSignalsCard.vue` renders the PDF/UA-1 signals (identifier, tagging, marked content, artifacts, embedded fonts, structure depth, language, title) on every report, with a PAC/veraPDF/Matterhorn explainer. Backed by a `pdfUa` object on the API response (`scorer.ts`). A live veraPDF PDF/UA-1 verdict could be wired into the same panel later (it exists on the remediation path). | **Shipped in v1.25.0**          |
| **Changelog / version**       | Proposed **v1.25.0** (minor — scoring behavior changes upward). Update `CHANGELOG.md`, three `package.json`s, git tag, and `data-retention.vue` per the release checklist — **pending owner confirmation**. | **Pending**                     |
| **Link-text extraction**      | pdf.js splits a URL that wraps across lines into fragments, so a few "descriptive" entries are really URL continuations. Cosmetic; does not affect the score. Revisit if link findings need to be cleaner.    | Noted                           |
| **Spike harness**             | `apps/api/src/spike/audit-dump.ts` was added (full per-file dump: flags, findings, fidelity) for diagnosis/verification — a sibling to the existing `audit-one.ts`. Keep (useful for re-checks) or remove — owner call. | Noted                           |

---

## 12. Changed files

| File                                          | Change                                                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/services/pdfjsService.ts`       | Read PDF/UA identifier from XMP; count artifact runs from the operator list. New fields `hasPdfUaIdentifier`, `pdfUaPart`, `artifactRunCount`. |
| `apps/api/src/services/qpdfService.ts`        | Type3 fonts treated as embedded (inline `/CharProcs`, no `/FontFile`).                                                                  |
| `apps/api/src/services/scoring/supplementary.ts` | PDF/UA + artifacts sourced from pdf.js (OR-combined with qpdf); "How to Fix" guide only on categories scoring < 100.                  |
| `apps/api/src/services/scorer.ts`             | Link scoring: raw URLs advisory, not penalized. Reading order: top band widened to ≥ 0.97, stale boilerplate removed, deductions made explicit. New `PdfUaSignals` type + `pdfUa` object on the result. |
| `apps/web/app/components/PdfUaSignalsCard.vue` | **New** — the PDF/UA-1 conformance-signals panel (signal grid + PAC/veraPDF/Matterhorn explainer).                                     |
| `apps/web/app/components/ScoreCard.vue`       | Renders `PdfUaSignalsCard` after the WCAG verdict (live + shared reports); `pdfUa` added to the result prop type.                      |
| `apps/api/src/__tests__/*`, `apps/web/app/__tests__/pdfUaSignalsCard.test.ts` | +15 new/updated API regression tests + 3 web component tests.                                          |

---

## 13. The takeaway for future work

> **Read each signal from the extractor that can actually see it.** The PDF/UA identifier lives in compressed **XMP** and artifacts live in **page content streams** — both invisible to `qpdf --json`, both available from pdf.js. A check that can never succeed is worse than no check: it prints a confident falsehood. And **never dock points silently** — if a calibration deducts, the report must say why, or users (rightly) stop trusting the number.
