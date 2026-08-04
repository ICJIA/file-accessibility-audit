# Legacy binary Office formats + CSV — design spec

**Date:** 2026-08-04 · **Status:** design, pre-implementation
**Type:** Upload-path rejection copy + format recognition. **No change to any scored path.**

## Summary

Two related asks, which turn out to have the *same* answer for different reasons:

1. **Legacy binary Office (`.doc` / `.xls` / `.ppt`, plus `.rtf`)** — recognize them by
   content and reject with specific, actionable guidance instead of a generic
   "unsupported" list. Part of this already exists client-side; three server paths
   bypass it.
2. **CSV** — do **not** build a scored CSV audit. A CSV has no accessibility metadata
   to inspect, so every CSV scores identically. Recognize it and answer with guidance,
   reusing the exact machinery from (1).

Both land as *recognition + copy*, not as new analysis pipelines.

---

# Part 1 — Legacy binary Office formats

## What already exists

`legacyFormatMessage()` in `apps/web/app/utils/uploadFormats.ts:118` maps
`.xls`/`.doc`/`.ppt` to a specific message. It is called from exactly one place:
`DropZone.processFiles()` (`apps/web/app/components/DropZone.vue:216`), and it matches
on the **filename extension**, client-side.

So drag-and-drop in a browser is already handled well. Nothing else is.

## The gaps (verified in code)

| Path | Today | Problem |
|---|---|---|
| Browser drag/drop `.doc` | ✅ specific message | none |
| Direct `POST /api/analyze` (CLI, curl, the fleet-audit project) | `uploadFileFilter` → `acceptedFormatsMessage` → *"Only PDF, Word (.docx), … are accepted"* (`uploadMiddleware.ts:62`) | generic; no next step |
| **`.doc` renamed to `.docx`** | passes client check, passes multer, `detectFileType` → `null` → *"check that you are not uploading a renamed file of another type (e.g., .zip, .jpg)"* (`analyze.ts:88`) | **actively misleading** — it *is* a Word file, just the wrong Word format |
| URL audit / `bulk-from-inventory` fetching a remote `.doc` | *"Fetched content is not a supported document."* (`urlAuditPipeline.ts:113`) | highest-volume case — agency inventory sweeps hit this in bulk |

The renamed case is the worst of the four: the copy tells a user holding a genuine Word
document to check whether they uploaded a `.zip` or `.jpg`. The inventory case is the
highest-impact: an agency scanning its own document inventory gets a wall of generic
failures with no indication that the fix is "these are all legacy format."

## Non-goals

- **No parsing or scoring of `.doc`/`.xls`/`.ppt`.** These are OLE2/CFB compound
  binaries — a different container from OOXML, so zero reuse of the `ooxml.ts` core.
  MS-DOC is a ~600-page spec, and the verdict it would produce is a constant
  ("legacy format cannot carry accessibility structure").
- **No LibreOffice / headless conversion.** Converting and scoring the *result* means
  reporting on a file that does not exist — LibreOffice's converter invents structure
  (maps visual formatting to styles, guesses heading levels), so the report describes
  LibreOffice's output, not the user's document. That contradicts the verdict-integrity
  posture (`docs/verdict-integrity-and-cross-format-accuracy-fixes.md`) and roughly
  doubles the untrusted-input binary surface on a public anonymous endpoint.
- **No new HTTP status codes.** `analyze.ts` returns 400 and `urlAuditPipeline`
  returns 422 for unsupported types today. Both stay. The fleet-audit project is a
  separate codebase calling `/api/audit-url`; changing status codes is a compat risk
  for zero user benefit. Only the message body changes, plus an additive `code` field.
- **No change to any scored category, weight, or the controls corpus.**

## Detection design

### Signature

OLE2/CFB header, bytes 0–7: `D0 CF 11 E0 A1 B1 1A E1`. That identifies the *family*
(Word/Excel/PowerPoint 97–2003, and also `.msg`, `.vsd`, and others).

To name the specific application you need the CFB directory entry names:

| Stream name | Format |
|---|---|
| `WordDocument` | Word 97–2003 (`.doc`) |
| `Workbook` | Excel 97–2003, BIFF8 (`.xls`) |
| `Book` | Excel 5.0/95, BIFF5 (`.xls`) |
| `PowerPoint Document` | PowerPoint 97–2003 (`.ppt`) |

### Do NOT write a CFB parser

Reading those names "properly" means parsing the CFB header (sector shift at `0x1E`,
first directory sector at `0x30`), walking the FAT chain, and decoding 128-byte
directory entries — ~100+ lines of new parser against untrusted input, for the sole
purpose of composing a rejection sentence.

**Instead:** the directory entry names are stored as UTF-16LE. Scan a **bounded prefix
(first 8 KB)** for the UTF-16LE byte sequences of the four names above. ~15 lines, no
parser, no unbounded loops, no allocation proportional to input.

This is the right tradeoff *because we are not auditing the file*. We need enough
signal to write a sentence, not enough to score it. A future reader will be tempted to
"do this properly" — the answer is no; if the scan finds nothing we degrade to a
generic "legacy Microsoft Office file", which is still far better than today.

Check `Workbook` before `Book`. In UTF-16LE they don't collide (`Book` starts `42 00`
= uppercase `B`; the `book` inside `Workbook` is `62 00` = lowercase), but order the
checks so the intent is obvious to the next reader.

### RTF is a separate case

`.rtf` is **not** OLE2 — it's text starting `{\rtf1`. Same user problem ("an old Word
file"), same inability to carry accessibility structure, so it belongs in the same
feature with its own signature check.

### API

Add to `packages/analyzer/src/analyzer.ts`, alongside `detectFileType`:

```ts
export type LegacyFormat = "doc" | "xls" | "ppt" | "rtf" | "ole-unknown";

/** Best-effort identification of a legacy binary Office file, for rejection
 *  copy only. Never parses the container; see the design spec for why. */
export function detectLegacyFormat(buffer: Buffer): LegacyFormat | null;
```

**Do not change `detectFileType`'s signature.** Its `null` return is load-bearing at
three call sites plus the veraPDF dispatch in `analyze.ts:45`. `detectLegacyFormat` is
called **only on the failure path** — when `detectFileType` has already returned
`null`. Zero cost on the happy path, zero ripple.

## Where the code goes

The canonical strings must not drift between client and server, so:

1. **Move `LEGACY_FORMAT_HINTS` + the message builder into `packages/shared/src/`.**
   Both `apps/api` and `apps/web` already import it. Re-export from
   `apps/web/app/utils/uploadFormats.ts` so the existing `DropZone` call site needs no
   change.
2. Extend the hint table with `.rtf` and the `ole-unknown` fallback.
3. Wire three server call sites:
   - `uploadMiddleware.ts:uploadFileFilter` — **keep rejecting on extension** (do not
     start accepting `.doc`, that uploads up to 15 MB of a file we will reject anyway);
     just emit the legacy message when the extension matches.
   - `analyze.ts` `UNSUPPORTED_FILE_TYPE` catch — call `detectLegacyFormat(file.buffer)`
     and swap the details string. **This is the renamed-file fix.**
   - `urlAuditPipeline.ts:110` — same, on the fetched buffer. **This is the inventory fix.**

## Message copy

Current client copy is good but frames it purely as a format complaint. Add the
accessibility *why*, and one critical expectation-setting sentence:

> **This is a legacy Excel 97–2003 file (.xls).** Legacy Office formats can't store the
> accessibility information this audit checks for — table headers, alt text, document
> language — which is why Excel's own Accessibility Checker is unavailable for them.
>
> Open it in Excel → **File → Save As → Excel Workbook (.xlsx)**, then upload that.
>
> Note that converting preserves *content*, not *accessibility structure*: you will
> likely still need to add headers and alt text in the `.xlsx` before it scores well.

**That last sentence is load-bearing.** Without it, users convert, re-upload, get a poor
score, and feel misled by the tool that told them to convert.

For `ole-unknown`, drop the app name and the Save As path; say it's a legacy Microsoft
Office binary and to re-save from the originating application in a modern format.

## Tests

Follow the existing per-file vitest convention.

- `packages/analyzer/src/__tests__/` — `detectLegacyFormat` unit tests. **Build
  synthetic fixtures in-test** (the 8-byte OLE2 header + a UTF-16LE stream name inside
  the first 8 KB). That is honest, because the detector reads only those bytes. Do not
  commit real `.doc`/`.xls` binaries — repo hygiene and size.
- Negative cases: a real `.docx` (ZIP) must return `null`; a PDF must return `null`;
  a truncated/empty buffer must return `null` and not throw.
- Bound check: a buffer where the stream name appears *after* 8 KB returns
  `"ole-unknown"`, not the specific format — pins the bound.
- `apps/api/src/__tests__/` — `uploadFileFilter` emits legacy copy for `.doc`;
  `analyze.ts` renamed-`.doc`-as-`.docx` returns the legacy message (this is the
  regression test for the misleading-copy bug).
- `apps/web/app/__tests__/uploadFormats.test.ts` — extend for `.rtf`, and assert the
  shared module and the web re-export produce identical strings.

## Effort

**~0.5–1 day** including tests. Small, self-contained, no scored path touched.

---

# Part 2 — CSV

## The finding that decides it

Map CSV onto the XLSX categories that already exist (`audit.config.ts` →
`XLSX.SCORING_WEIGHTS`):

| XLSX category | Weight | CSV |
|---|---|---|
| `table_markup` | .25 | **N/A** — no header-row *declaration* exists in the format |
| `alt_text` | .18 | **N/A** — no images |
| `sheet_names` | .18 | **N/A** — one unnamed table |
| `title_language` | .12 | **N/A** — no metadata |
| `color_contrast` | .12 | **N/A** — no color |
| `link_quality` | .10 | **N/A** — no hyperlinks |
| `text_extractability` | .05 | auto-passes — it is literally text |

95% of the weight is not applicable; the remaining 5% always passes. The scorer
renormalizes across applicable categories, so **every CSV scores 100, always.** That is
a scoring engine emitting a constant.

The subtle point: a "header row" in CSV is a **convention, not a declaration**. Nothing
in the format states that row 1 is headers — which is precisely what `table_markup`
checks for in XLSX. You cannot audit for a declaration the format has no syntax to
express.

## The architectural cost of an ungraded format

`AnalysisResult` (`packages/shared/src/types.ts:220`) declares:

```ts
overallScore: number;   // required
grade: string;          // required
```

`grade` / `overallScore` are referenced **137 times across 35 non-test files** —
`ScoreCard.vue`, `ReportContent.vue`, all five export formats
(`exportFormats/{text,html,markdown,json,aiAnalysis}.ts`), `report/[id].vue`,
`BatchProgress.vue`, the CLI's `csv.ts` / `html.ts` / `colors.ts`, `auditLog.ts`, and
the `bulk-from-inventory` path.

So "a format with no grade" is **not a new scorer — it is a change to the result
contract**, touching every consumer. That materially raises the cost of any CSV
feature that flows through `AnalysisResult`.

## Options

| Option | Verdict |
|---|---|
| **A.** Score CSV like the other formats | **Rejected.** Emits a constant 100. Actively misleading in both directions: a green score is false comfort, since the format *cannot* demonstrate compliance. |
| **B.** New `CsvCheckResult` type + dedicated UI | Clean semantics, but a new response shape that does not flow through `/report/:id` sharing, batch mode, CLI table output, or the inventory bulk path. Large surface for a low-value format. |
| **C.** Reuse `AnalysisResult` with `grade: null` | Requires making two required fields optional and auditing 137 call sites. Highest risk, and every existing consumer would need a null branch. |
| **D. Recognize CSV, answer with guidance — reuse Part 1's machinery.** | **Recommended.** |

## Recommendation — Option D

Treat CSV exactly like a legacy format: recognize it, don't audit it, explain why, and
say what to do instead. Cost is a signature check plus copy — it rides entirely on
Part 1's infrastructure and touches no scored path and no result contract.

The copy is different from the legacy case, because CSV is not a *broken* choice:

> **This is a CSV data file.** CSV has no accessibility structure to audit — no table
> headers, alt text, language, or formatting — so there is nothing here for this tool
> to check. That is not a defect: for raw tabular data, CSV is often the right format.
>
> Accessibility for a published CSV is a property of **the page that links it**, not the
> file: describe what the data contains, state the format and size, and identify the
> header row. If the CSV is the only form the data is published in, consider also
> offering an accessible HTML table or a structured `.xlsx`.

Detection: no magic bytes exist for CSV, so gate on extension (`.csv`/`.tsv`) plus a
cheap sanity check (valid UTF-8 prefix, consistent delimiter in the first N lines) to
avoid claiming "CSV" for arbitrary text. Never guess CSV from content alone.

**Effort: ~2 hours** on top of Part 1.

## If a real CSV check is wanted later

Only build this if the data justifies it (see below). It would be an **advisory,
explicitly ungraded** check — Option B — covering the checks that genuinely affect
whoever opens the file in Excel or a screen reader:

1. Plausible header row (row 1 non-empty, non-numeric, unique values)
2. Consistent column count per row — ragged rows break AT table navigation
3. Encoding: valid UTF-8, BOM presence, CP1252 mojibake risk
4. No preamble rows above the header (a title/date row is the single most common thing
   that breaks tabular data in any consumer)
5. No empty or duplicate column headers
6. Delimiter consistency (comma vs semicolon vs tab — European exports)

These are **data-quality** checks with an indirect accessibility benefit, not WCAG
conformance checks. They must never produce a letter grade, because a grade implies
comparability with the PDF/DOCX/XLSX grades and there is none.

## Prerequisite: get the data first

`audit_log` does not record **rejected** uploads, so "many people have older formats"
is currently an assumption. Log rejections by extension for ~30 days and the question
answers itself — you would know whether `.doc` is 3 attempts or 300, and whether CSV
appears at all.

That instrumentation is a prerequisite for justifying Part 2 beyond Option D, and it is
a natural companion to Part 1 (both live on the rejection path). It also feeds the
`/status` grade-distribution work specced separately.

---

## Recommended sequencing

1. **Part 1** (~1 day) — real bug fix; the renamed-file copy is actively wrong today
   and the inventory path is the highest-volume case.
2. **CSV Option D** (~2 hours) — rides on Part 1.
3. **Rejection logging** (~2 hours) — turns the remaining questions into data.
4. Revisit a real CSV check only if step 3 shows the volume.
