# PDF/UA-1 verdict on audits — design spec

**Date:** 2026-07-22 · **Status:** approved design, pre-implementation ·
**Supersedes:** the May-2026 deferral captured in `project_verapdf_audit_panel_deferred`.

## Goal

Surface a formal **PDF/UA-1 (ISO 14289-1) machine-check verdict** on the audit
results page and on saved `/report/:id` pages, using the veraPDF integration that
already exists in the remediation path. This is the automatable equivalent of the
"PAC checks" a user asked for — PAC itself is a closed-source Windows GUI with no
CLI/API and cannot be integrated; veraPDF implements the same machine-checkable
subset of the Matterhorn Protocol that PAC reports against.

## Non-goals (explicit)

- **Does NOT change the Strict grade or any scored category.** The verdict is a
  separate informational panel, subordinate to the grade. The PDF scoring path
  and the controls-corpus calibration stay frozen and byte-identical.
- **Does NOT claim full PDF/UA conformance.** veraPDF covers only the
  machine-checkable Matterhorn failure conditions; the human-verifiable
  checkpoints (meaningful alt text, logical reading order) are out of scope and
  must be surfaced as a caveat, not silently implied.
- **Not on the CLI.** `apps/cli` audits are unchanged; this is a web/API feature.
- **No on-demand re-run.** The file is discarded seconds after the audit; the
  verdict is produced during the audit request or not at all.

## Background facts (verified in code)

- `apps/api/src/services/veraPdf.ts` exposes `runVeraPdf(pdfPath): Promise<VeraPdfVerdict>`
  — never throws; returns `available:false` when `REMEDIATION.VERAPDF_PATH` is
  unset. `VeraPdfVerdict = { available, passed, profile, failures: {ruleId, clause, description, count}[], totalFailureCount, error? }`,
  already truncated to the top 20 failures for storage.
- The audit already writes a short-lived temp PDF to disk: `analyzeWithQpdfAsync`
  writes `/tmp/<uuid>.pdf`, runs qpdf, and `unlinkSync`s it in `finally`
  (`packages/analyzer/src/qpdfService.ts`). The data-retention docs already
  disclose this qpdf temp copy. **veraPDF reading a temp file therefore adds no
  new privacy tradeoff** — the May deferral's biggest objection is moot.
- The audit route uploads via `multer.memoryStorage()`
  (`apps/api/src/middleware/uploadMiddleware.ts`).
- The remediation UI already renders a veraPDF verdict
  (`apps/web/app/pages/remediate/[jobId].vue`) — reuse it.

## Architecture

Run veraPDF **at the API audit route, concurrently with `analyzePDF`** — the
frozen analyzer package is not touched.

1. Route has the uploaded buffer. Write one short-lived temp file
   `/tmp/<uuid>.pdf` (mirroring the qpdf pattern; `TMP_DIR`-aware).
2. `const [analysis, vera] = await Promise.all([analyzePDF(buffer, filename), runVeraPdf(tmpPath)])`
   — wall-cost is `max(analyze, veraPDF)`, not the sum.
3. `unlinkSync(tmpPath)` in `finally`.
4. Attach `vera` (the `VeraPdfVerdict`) to the audit response under a new
   `pdfUaVerdict` field. PDF file-type only; omitted/undefined for DOCX/PPTX/XLSX.

**Alternative considered — integrate veraPDF inside the analyzer to share qpdf's
exact temp file.** Rejected: it moves a JVM dependency into the "pure analysis"
package, touches the frozen PDF pipeline, and saves only one temp-file write.

## Data model & persistence

- Extend the `POST /api/reports` payload and the stored report record with the
  `pdfUaVerdict` object (JSON; ≤20 failures keeps it compact). One additive DB
  migration on `PRAGMA user_version` (`apps/api/src/db/migrations.ts`), storing
  the verdict either as a JSON column or inside the existing report JSON blob —
  match whatever the report store already does for `categories`.
- `/report/:id` reads it back and renders the same panel, so shared links match
  the live audit.

## UI

- **Extract** the remediation page's veraPDF display into a shared component
  (e.g. `components/PdfUaVerdict.vue`); the remediation page and the audit/report
  pages both consume it.
- **Badge (honest labeling):** `PDF/UA-1 machine checks (veraPDF): Pass` /
  `Fail`. NOT a bare "PDF/UA Conformant". A one-line note: "Machine-checkable
  conditions only — full PDF/UA conformance also requires manual review."
- **Expandable list:** the failed checkpoints — `clause` + `description` +
  `count`, most-frequent first — collapsed by default (it's usually non-empty).
- **Placement:** below the Strict grade, visually subordinate, on both the audit
  result and `/report/:id`.

## Config-gating, performance, failure handling

- Gated on `REMEDIATION.VERAPDF_PATH`. When unset (`available:false`) the panel
  **hides entirely** — no "not available" message (matches the May condition:
  "a dev box without veraPDF simply doesn't render the panel").
- Bounded by `REMEDIATION.VERAPDF_TIMEOUT_MS`; a timeout or veraPDF error yields
  `available:true, passed:false, error:…` → panel shows "Could not validate"
  rather than blocking or failing the audit.
- Batch audits: one `runVeraPdf` per file; the existing per-request concurrency
  limits apply. Verdict production never blocks the core audit result.
- **Deploy note:** the audit server must have the veraPDF binary installed and
  `VERAPDF_PATH` set. Today that's only guaranteed where remediation runs; until
  installed on the audit tier, the panel is simply hidden (safe default).

## Docs

- `apps/web/app/pages/data-retention.vue` (Section 02 audit flow / Section 07
  retention table): one line noting veraPDF now also runs at audit time, on the
  **same** short-lived temp copy already disclosed for qpdf — no new disk
  exposure, still deleted in the same request.
- CHANGELOG + README on release, per the standing release checklist.

## Testing

- API route: `pdfUaVerdict` attached when `VERAPDF_PATH` set (veraPDF mocked);
  omitted/hidden when `available:false`; temp file always unlinked; a veraPDF
  timeout/error degrades to "could not validate" without failing the audit.
- Persistence round-trip: `POST /api/reports` stores the verdict and `/report/:id`
  returns it.
- Web: the shared component renders Pass, Fail-with-checkpoints, and hidden
  (`available:false`) states; the badge never reads bare "Conformant".

## Rough size

API route wiring + one shared UI component + report persistence (one migration)
+ a data-retention line + tests. The ~v1.22-sized feature the May note predicted,
minus the disk-privacy blocker (now moot) and minus building the veraPDF runner
(already exists).
