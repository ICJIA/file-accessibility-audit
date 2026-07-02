# PPTX + XLSX Checkers — Phase 4: Web Frontend + Docs/SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire PowerPoint (`.pptx`) and Excel (`.xlsx`) audit results through every web surface — dropzone, report UI, exports, hero/SEO copy, docs pages, and the audit-flow diagram — and fix the latent remediation-guard bug (`!== 'docx'` → `=== 'pdf'`).

**Architecture:** The API (Phases 2–3) already detects, analyzes, and scores both formats; this phase extends the frontend `fileType` union at its mapped mirror sites, centralizes format labels in `utils/reportBanner.ts` and upload-format strings in a new `utils/uploadFormats.ts`, and adds per-format copy (source-document guidance, methodology, fix paths) mirroring the Word treatment. No API code changes.

**Tech Stack:** Nuxt 4 / Nuxt UI 4, Vue 3 `<script setup>`, Vitest + @vue/test-utils (happy-dom), mermaid → static SVG via `scripts/generate-diagrams.mjs` (system Chrome).

**Spec:** `docs/superpowers/specs/2026-07-02-pptx-xlsx-checkers-design.md` §Frontend and §Release bind this plan. Master plan: `docs/superpowers/plans/2026-07-02-pptx-xlsx-checkers.md` (§"Phase 4 consumes" is the interface contract).

## Preconditions (delivered by Phases 2–3 — verify before starting)

- `audit.config.ts` exports `PPTX` and `XLSX` blocks, each with `.ENABLED` (`process.env.PPTX_ENABLED !== "false"` / `process.env.XLSX_ENABLED !== "false"`). Verify: `grep -n "export const PPTX\|export const XLSX" audit.config.ts` prints both lines.
- The API's `AnalysisResult.fileType` union is `"pdf" | "docx" | "pptx" | "xlsx"`, and `pageCount` carries **slide count** for pptx and **sheet count** for xlsx. Verify: `grep -n '"pptx"' apps/api/src/services/pdfAnalyzer.ts`.
- If either precondition fails, STOP — Phases 2–3 are not merged yet.

## Global Constraints (from the master plan — every task inherits these)

- **PDF pipeline: frozen.** No PDF-specific file under `apps/api/src/services/` may change. (This phase touches no API code at all.)
- **DOCX pipeline: behaviorally frozen.** Word-facing rendered copy stays byte-identical wherever this plan says "unchanged"; the API docx test suites are untouched.
- **No new dependencies** in any package.json.
- **Feature flags default ON:** frontend reads `config.public.pptxEnabled !== false` / `xlsxEnabled !== false` (mirroring `docxEnabled`) so a missing key means enabled.
- **TDD throughout:** failing test first → watch it fail → minimal code → watch it pass → commit. Pure-copy tasks (SEO strings, docs prose, README) verify by exact grep instead of a test.
- **Commit style:** conventional commits (`feat:`, `fix:`, `test:`, `docs:`). **Never add a Co-Authored-By or any AI-attribution trailer.**
- **Build gate:** `pnpm build` (repo root) green before pushing; full `npx vitest run` green in `apps/api` and `apps/web` at the phase boundary (Task 12).
- All web test commands run from `apps/web`: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/<file>.test.ts`.
- The label vocabulary is fixed project-wide: `pdf` → "PDF", `docx` → "Word", `pptx` → "PowerPoint", `xlsx` → "Excel"; page nouns: "page" (pdf, docx), "slide" (pptx), "sheet" (xlsx).

## File Structure

| File | Responsibility in this phase |
|---|---|
| `apps/web/nuxt.config.ts` | Expose `pptxEnabled`/`xlsxEnabled` runtime flags; SEO copy (description, featureList, keywords) |
| `apps/web/app/__tests__/test-helpers.ts` | Runtime-config stub gains the three format flags |
| `apps/web/app/utils/reportBanner.ts` | Shared format-label map (`fileTypeLabel`), page-noun map (`pageNoun`), slides/sheets meta line |
| `apps/web/app/utils/uploadFormats.ts` (new) | Flag-driven accept attr, extension allowlist, and "PDF, Word, PowerPoint, or Excel" noun strings for DropZone + hero |
| `apps/web/app/components/DropZone.vue` | Accept/reject + copy per flag |
| `apps/web/app/pages/index.vue` | Remediation guard fix, hero copy, drop-hint copy, stats-card copy, Word-vs-PDF prose addendum |
| `apps/web/app/components/SourceDocumentNotice.vue` | PowerPoint/Excel source-document framing + fix-step lists |
| `apps/web/app/components/MethodologyCard.vue` | Per-format methodology prose + library notes |
| `apps/web/app/components/ScoreCard.vue` | Per-format Accessibility Checker caveat + conformance fix-path copy |
| `apps/web/app/components/ReportFileBanner.vue` | Prop union widened (labels flow from reportBanner) |
| `apps/web/app/composables/useReportExport.ts` | 4-value union; export titles/AI-analysis wording via shared labels |
| `audit.config.ts` | New `ANNOUNCEMENTS` entry (config-only edit — no API logic) |
| `apps/web/app/pages/technical-details.vue`, `apps/web/app/layouts/default.vue`, `scripts/generate-diagrams.mjs` | Docs prose, rubric modal, audit-flow diagram source + regenerated SVG |
| `README.md` | Feature prose (not badges/counts — Phase 5 owns those) |

Not changed (verified against the code): `apps/web/app/components/ReportContent.vue` (its `fileType` prop at line 594 is already `string`), `apps/web/app/pages/report/[id].vue` (passes `(data as any).report.fileType` untyped at lines 36 and 147 — flows through automatically), `apps/web/app/pages/remediate/[jobId].vue` (its `SourceDocumentNotice` has no `file-type` prop → defaults to `pdf`, correct because remediation is PDF-only), `apps/web/app/utils/modeDivergence.ts` (pptx/xlsx omit their inapplicable categories entirely rather than emitting N/A rows, and the generic `naReason` fallback covers any residual null-score row).

---

### Task 1: Runtime flags in nuxt.config + test-helpers stub

**Files:**
- Modify: `apps/web/nuxt.config.ts:1` (import), `:132` (runtimeConfig.public)
- Modify: `apps/web/app/__tests__/test-helpers.ts` (useRuntimeConfig stub)

**Interfaces:**
- Consumes: `PPTX.ENABLED` / `XLSX.ENABLED` from `audit.config.ts` (Phases 2–3).
- Produces: `config.public.pptxEnabled: boolean` and `config.public.xlsxEnabled: boolean` — read by Tasks 3 and 4 as `config.public.pptxEnabled !== false`. Test stub keys `docxEnabled: true, pptxEnabled: true, xlsxEnabled: true` — every component test inherits flags-on.

This is config wiring (no behavior change while the flags are all true), so it follows the copy-task cycle: edit → verify by grep + test run → commit.

- [ ] **Step 1: Extend the audit.config import in nuxt.config.ts**

In `apps/web/nuxt.config.ts`, replace line 1:

```ts
import { BRANDING, DEPLOY, REMEDIATION, WCAG, ANNOUNCEMENTS, DOCX } from '../../audit.config'
```

with:

```ts
import { BRANDING, DEPLOY, REMEDIATION, WCAG, ANNOUNCEMENTS, DOCX, PPTX, XLSX } from '../../audit.config'
```

- [ ] **Step 2: Expose the two flags in runtimeConfig.public**

In the same file, inside `runtimeConfig.public`, replace:

```ts
      docxEnabled: DOCX.ENABLED,
```

with:

```ts
      docxEnabled: DOCX.ENABLED,
      pptxEnabled: PPTX.ENABLED,
      xlsxEnabled: XLSX.ENABLED,
```

- [ ] **Step 3: Add the flags to the test stub**

In `apps/web/app/__tests__/test-helpers.ts`, inside the object returned by `_global.useRuntimeConfig`, replace:

```ts
    remediationEnabled: false,
```

with:

```ts
    remediationEnabled: false,
    docxEnabled: true,
    pptxEnabled: true,
    xlsxEnabled: true,
```

(Note: `docxEnabled` was previously absent from the stub — components treated `undefined !== false` as enabled. Making all three explicit keeps that behavior and gives flag-off tests a value to override.)

- [ ] **Step 4: Verify by grep**

Run:
```bash
grep -n "pptxEnabled\|xlsxEnabled" /Volumes/satechi/webdev/file-accessibility-audit/apps/web/nuxt.config.ts /Volumes/satechi/webdev/file-accessibility-audit/apps/web/app/__tests__/test-helpers.ts
```
Expected: 4 lines — `pptxEnabled: PPTX.ENABLED,` and `xlsxEnabled: XLSX.ENABLED,` in nuxt.config.ts; `pptxEnabled: true,` and `xlsxEnabled: true,` in test-helpers.ts.

- [ ] **Step 5: Run the full web suite (no behavior change expected)**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run`
Expected: all test files pass (312 tests at phase start).

- [ ] **Step 6: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/nuxt.config.ts apps/web/app/__tests__/test-helpers.ts
git commit -m "feat(web): expose PPTX/XLSX feature flags via runtimeConfig.public"
```

---

### Task 2: Shared format-label map + slides/sheets meta line (`reportBanner.ts`)

**Files:**
- Modify: `apps/web/app/utils/reportBanner.ts` (whole file — it is 19 lines)
- Modify: `apps/web/app/components/ReportFileBanner.vue:53` (prop union)
- Test: `apps/web/app/__tests__/reportBanner.test.ts`, `apps/web/app/__tests__/ReportFileBanner.test.ts`

**Interfaces:**
- Consumes: nothing (leaf util).
- Produces (used by Tasks 7–8 and by `ReportFileBanner.vue`):
  - `export type ReportFileType = "pdf" | "docx" | "pptx" | "xlsx"`
  - `export const FILE_TYPE_LABELS: Record<ReportFileType, string>` — `{ pdf: "PDF", docx: "Word", pptx: "PowerPoint", xlsx: "Excel" }`
  - `export function fileTypeLabel(fileType?: string): string` — label with a "PDF" fallback for unknown/absent values (stored `/report/:id` JSON is attacker-controlled and may carry any string; the old ternary already treated non-"docx" as PDF — keep that posture)
  - `export function pageNoun(fileType?: string): string` — `"page" | "slide" | "sheet"` (singular), "page" fallback
  - `export function bannerMetaLine(pageCount: number, fileType?: string): string` — e.g. `"9 slides · PowerPoint"`, `"1 sheet · Excel"`, `"12 pages · PDF"`

- [ ] **Step 1: Write the failing tests**

In `apps/web/app/__tests__/reportBanner.test.ts`, replace the import line:

```ts
import { BANNER_EYEBROW, bannerMetaLine } from "../utils/reportBanner";
```

with:

```ts
import {
  BANNER_EYEBROW,
  bannerMetaLine,
  fileTypeLabel,
  pageNoun,
} from "../utils/reportBanner";
```

and add these tests inside the existing `describe("reportBanner", ...)` block, after the docx test:

```ts
  it("labels PowerPoint decks and counts slides", () => {
    expect(bannerMetaLine(9, "pptx")).toBe("9 slides · PowerPoint");
    expect(bannerMetaLine(1, "pptx")).toBe("1 slide · PowerPoint");
  });

  it("labels Excel workbooks and counts sheets", () => {
    expect(bannerMetaLine(4, "xlsx")).toBe("4 sheets · Excel");
    expect(bannerMetaLine(1, "xlsx")).toBe("1 sheet · Excel");
  });

  it("falls back to pages · PDF for an unknown stored fileType", () => {
    // /report/:id renders attacker-controlled stored JSON — an unrecognized
    // fileType string must degrade to the PDF wording, never throw.
    expect(bannerMetaLine(2, "exe")).toBe("2 pages · PDF");
    expect(bannerMetaLine(2, undefined)).toBe("2 pages · PDF");
  });

  it("exposes the shared label and noun lookups", () => {
    expect(fileTypeLabel("pptx")).toBe("PowerPoint");
    expect(fileTypeLabel("xlsx")).toBe("Excel");
    expect(fileTypeLabel("docx")).toBe("Word");
    expect(fileTypeLabel(undefined)).toBe("PDF");
    expect(pageNoun("pptx")).toBe("slide");
    expect(pageNoun("xlsx")).toBe("sheet");
    expect(pageNoun("docx")).toBe("page");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/reportBanner.test.ts`
Expected: FAIL — `does not provide an export named 'fileTypeLabel'` (module-load error), or once exports exist, `expected '9 pages · PDF' to be '9 slides · PowerPoint'`.

- [ ] **Step 3: Rewrite `reportBanner.ts`**

Replace the entire contents of `apps/web/app/utils/reportBanner.ts` with:

```ts
/**
 * Single source of truth for the prominent "report for <file>" banner that
 * sits across the top of every report surface — the live result page, the
 * shared report page, and the HTML / text / Markdown exports. Keeping the
 * eyebrow label, the format labels, and the page-count line here keeps the
 * wording identical everywhere so a downloaded or shared report is never
 * mistaken for another file's.
 */

export const BANNER_EYEBROW = "ACCESSIBILITY REPORT FOR";

/** Every file type a report can carry. Mirrors the API's DetectedFileType. */
export type ReportFileType = "pdf" | "docx" | "pptx" | "xlsx";

/** User-facing format label, shared by every surface that names the format. */
export const FILE_TYPE_LABELS: Record<ReportFileType, string> = {
  pdf: "PDF",
  docx: "Word",
  pptx: "PowerPoint",
  xlsx: "Excel",
};

/** What one "page" of the document is called, per format (singular). */
const PAGE_NOUNS: Record<ReportFileType, string> = {
  pdf: "page",
  docx: "page",
  pptx: "slide",
  xlsx: "sheet",
};

/**
 * Format label with a PDF fallback. Accepts any string because stored
 * /report/:id JSON is caller-controlled; unknown values degrade to "PDF"
 * (the same posture as the old non-docx → PDF ternary).
 */
export function fileTypeLabel(fileType?: string): string {
  return FILE_TYPE_LABELS[(fileType ?? "pdf") as ReportFileType] ?? "PDF";
}

/** "page" / "slide" / "sheet" (singular), with a "page" fallback. */
export function pageNoun(fileType?: string): string {
  return PAGE_NOUNS[(fileType ?? "pdf") as ReportFileType] ?? "page";
}

/** e.g. "12 pages · PDF" / "1 page · Word" / "9 slides · PowerPoint" */
export function bannerMetaLine(
  pageCount: number,
  fileType: ReportFileType | string = "pdf",
): string {
  const noun = pageNoun(fileType);
  return `${pageCount} ${noun}${pageCount === 1 ? "" : "s"} · ${fileTypeLabel(fileType)}`;
}
```

(The `fileType` parameter widened from `"pdf" | "docx"` to `ReportFileType | string`, so every existing call site — including `useReportExport.ts`'s still-narrow union until Task 8 — keeps compiling.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/reportBanner.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Write the failing component tests for the banner flow-through**

Add to `apps/web/app/__tests__/ReportFileBanner.test.ts`, inside the existing `describe("ReportFileBanner", ...)` block:

```ts
  it("renders slide counts for PowerPoint files", () => {
    const wrapper = mount(ReportFileBanner, {
      props: { filename: "deck.pptx", pageCount: 9, fileType: "pptx" },
    });
    expect(wrapper.text()).toContain("9 slides · PowerPoint");
  });

  it("renders sheet counts for Excel files", () => {
    const wrapper = mount(ReportFileBanner, {
      props: { filename: "budget.xlsx", pageCount: 4, fileType: "xlsx" },
    });
    expect(wrapper.text()).toContain("4 sheets · Excel");
  });
```

- [ ] **Step 6: Run to verify current state**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/ReportFileBanner.test.ts`
Expected: the two new tests PASS at runtime already (the labels come from `bannerMetaLine`), but the prop is still typed `"pdf" | "docx"` — that is a `pnpm build` (tsc/vue-tsc) failure waiting to happen, so widen it now regardless.

- [ ] **Step 7: Widen the ReportFileBanner prop union**

In `apps/web/app/components/ReportFileBanner.vue`, replace:

```ts
withDefaults(
  defineProps<{
    filename: string;
    pageCount: number;
    isScanned?: boolean;
    fileType?: "pdf" | "docx";
  }>(),
  { fileType: "pdf" },
);
```

with:

```ts
withDefaults(
  defineProps<{
    filename: string;
    pageCount: number;
    isScanned?: boolean;
    fileType?: "pdf" | "docx" | "pptx" | "xlsx";
  }>(),
  { fileType: "pdf" },
);
```

- [ ] **Step 8: Run both test files, then the full web suite**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/reportBanner.test.ts app/__tests__/ReportFileBanner.test.ts && npx vitest run`
Expected: PASS everywhere.

- [ ] **Step 9: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/utils/reportBanner.ts apps/web/app/components/ReportFileBanner.vue apps/web/app/__tests__/reportBanner.test.ts apps/web/app/__tests__/ReportFileBanner.test.ts
git commit -m "feat(web): shared format-label map; slides/sheets banner meta line"
```

---

### Task 3: Upload-format util + DropZone accepts `.pptx`/`.xlsx` behind flags

**Files:**
- Create: `apps/web/app/utils/uploadFormats.ts`
- Modify: `apps/web/app/components/DropZone.vue:99-110` (computeds) and `:165-177` (`processFiles` allowlist + error copy)
- Test: `apps/web/app/__tests__/uploadFormats.test.ts` (new), `apps/web/app/__tests__/components.test.ts` (DropZone describe)

**Interfaces:**
- Consumes: `config.public.docxEnabled` / `pptxEnabled` / `xlsxEnabled` (Task 1).
- Produces (used again by Task 4's hero):
  - `export interface UploadFlags { docx: boolean; pptx: boolean; xlsx: boolean }`
  - `export function uploadAcceptAttr(flags: UploadFlags): string` — extensions then MIME types, comma-joined
  - `export function uploadExtensions(flags: UploadFlags): string[]` — e.g. `[".pdf", ".docx", ".pptx", ".xlsx"]`
  - `export function uploadNoun(flags: UploadFlags, conjunction?: "or" | "and"): string` — `"PDF, Word, PowerPoint, or Excel"` (default `"or"`)
  - `export function uploadNounWithExts(flags: UploadFlags): string` — `"PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx)"`

- [ ] **Step 1: Write the failing util tests**

Create `apps/web/app/__tests__/uploadFormats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  uploadAcceptAttr,
  uploadExtensions,
  uploadNoun,
  uploadNounWithExts,
} from "../utils/uploadFormats";

const ALL_ON = { docx: true, pptx: true, xlsx: true };
const ALL_OFF = { docx: false, pptx: false, xlsx: false };

describe("uploadFormats", () => {
  it("builds the accept attribute for all four formats", () => {
    expect(uploadAcceptAttr(ALL_ON)).toBe(
      ".pdf,.docx,.pptx,.xlsx," +
        "application/pdf," +
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
        "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("is PDF-only when every optional flag is off", () => {
    expect(uploadAcceptAttr(ALL_OFF)).toBe(".pdf,application/pdf");
    expect(uploadExtensions(ALL_OFF)).toEqual([".pdf"]);
    expect(uploadNoun(ALL_OFF)).toBe("PDF");
  });

  it("drops exactly the disabled format", () => {
    expect(uploadExtensions({ docx: true, pptx: false, xlsx: true })).toEqual([
      ".pdf",
      ".docx",
      ".xlsx",
    ]);
    expect(uploadNoun({ docx: true, pptx: false, xlsx: true })).toBe(
      "PDF, Word, or Excel",
    );
  });

  it("keeps two-format wording comma-free and supports 'and'", () => {
    expect(uploadNoun({ docx: true, pptx: false, xlsx: false })).toBe(
      "PDF or Word",
    );
    expect(uploadNoun({ docx: true, pptx: false, xlsx: false }, "and")).toBe(
      "PDF and Word",
    );
  });

  it("lists all four formats with an Oxford comma", () => {
    expect(uploadNoun(ALL_ON)).toBe("PDF, Word, PowerPoint, or Excel");
    expect(uploadNoun(ALL_ON, "and")).toBe("PDF, Word, PowerPoint, and Excel");
  });

  it("adds extensions to the optional formats in error copy", () => {
    expect(uploadNounWithExts(ALL_ON)).toBe(
      "PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx)",
    );
    expect(uploadNounWithExts(ALL_OFF)).toBe("PDF");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/uploadFormats.test.ts`
Expected: FAIL — cannot resolve `../utils/uploadFormats` (module does not exist).

- [ ] **Step 3: Create the util**

Create `apps/web/app/utils/uploadFormats.ts`:

```ts
/**
 * Which optional upload formats the server has enabled, and the strings the
 * upload surfaces (DropZone, index-page hero) derive from them. PDF is always
 * on; Word / PowerPoint / Excel can each be disabled server-side
 * (DOCX_ENABLED / PPTX_ENABLED / XLSX_ENABLED = "false") and the frontend
 * must never invite a format the API will reject.
 */

export interface UploadFlags {
  docx: boolean;
  pptx: boolean;
  xlsx: boolean;
}

interface UploadFormat {
  label: string;
  ext: string;
  mime: string;
}

const PDF_FORMAT: UploadFormat = {
  label: "PDF",
  ext: ".pdf",
  mime: "application/pdf",
};

const OPTIONAL_FORMATS: Array<UploadFormat & { key: keyof UploadFlags }> = [
  {
    key: "docx",
    label: "Word",
    ext: ".docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    key: "pptx",
    label: "PowerPoint",
    ext: ".pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  {
    key: "xlsx",
    label: "Excel",
    ext: ".xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
];

function enabledFormats(flags: UploadFlags): UploadFormat[] {
  return [PDF_FORMAT, ...OPTIONAL_FORMATS.filter((f) => flags[f.key])];
}

/** "PDF" / "PDF or Word" / "PDF, Word, or PowerPoint" (Oxford comma at 3+). */
function joinList(items: string[], conjunction: "or" | "and"): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items[items.length - 1]}`;
}

/** `accept` attribute for the file input: extensions, then MIME types. */
export function uploadAcceptAttr(flags: UploadFlags): string {
  const formats = enabledFormats(flags);
  return [...formats.map((f) => f.ext), ...formats.map((f) => f.mime)].join(",");
}

/** Lower-case extension allowlist for client-side validation. */
export function uploadExtensions(flags: UploadFlags): string[] {
  return enabledFormats(flags).map((f) => f.ext);
}

/** "PDF, Word, PowerPoint, or Excel" — conjunction selectable for headlines. */
export function uploadNoun(
  flags: UploadFlags,
  conjunction: "or" | "and" = "or",
): string {
  return joinList(
    enabledFormats(flags).map((f) => f.label),
    conjunction,
  );
}

/** "PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx)" for error copy. */
export function uploadNounWithExts(flags: UploadFlags): string {
  return joinList(
    enabledFormats(flags).map((f) =>
      f.ext === ".pdf" ? f.label : `${f.label} (${f.ext})`,
    ),
    "or",
  );
}
```

- [ ] **Step 4: Run to verify the util tests pass**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/uploadFormats.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Update the DropZone tests (existing assertions change; new coverage added)**

In `apps/web/app/__tests__/components.test.ts`, inside `describe("DropZone", ...)`:

Replace the first test's assertion:

```ts
    expect(wrapper.text()).toContain("Drop PDF or Word files here");
```

with:

```ts
    expect(wrapper.text()).toContain(
      "Drop PDF, Word, PowerPoint, or Excel files here",
    );
```

Replace the rejection test's copy assertion:

```ts
    expect(wrapper.text()).toContain("Please select PDF or Word (.docx) files");
```

with:

```ts
    expect(wrapper.text()).toContain(
      "Please select PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) files",
    );
```

Replace the drag-active assertion:

```ts
    expect(wrapper.text()).toContain("Drop your PDF or Word files here");
```

with:

```ts
    expect(wrapper.text()).toContain(
      "Drop your PDF, Word, PowerPoint, or Excel files here",
    );
```

Then add these new tests at the end of the DropZone describe block:

```ts
  it("emits file-selected for a valid .pptx", async () => {
    const wrapper = mount(DropZone);
    const file = new File(["pptx"], "deck.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, "files", {
      value: [file],
      writable: true,
    });
    await input.trigger("change");
    expect(wrapper.emitted("file-selected")).toBeTruthy();
    expect(wrapper.emitted("file-selected")![0][0]).toEqual(file);
  });

  it("emits file-selected for a valid .xlsx", async () => {
    const wrapper = mount(DropZone);
    const file = new File(["xlsx"], "budget.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, "files", {
      value: [file],
      writable: true,
    });
    await input.trigger("change");
    expect(wrapper.emitted("file-selected")).toBeTruthy();
  });

  it("advertises the pptx and xlsx MIME types in the accept attr", () => {
    const wrapper = mount(DropZone);
    const accept = wrapper.find('input[type="file"]').attributes("accept")!;
    expect(accept).toContain(".pptx");
    expect(accept).toContain(".xlsx");
    expect(accept).toContain(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(accept).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("rejects .pptx and drops it from copy when pptxEnabled is false", async () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      public: { docxEnabled: true, pptxEnabled: false, xlsxEnabled: true },
    }));
    try {
      const wrapper = mount(DropZone);
      expect(
        wrapper.find('input[type="file"]').attributes("accept"),
      ).not.toContain("presentationml");
      expect(wrapper.text()).toContain(
        "Drop PDF, Word, or Excel files here",
      );
      const file = new File(["pptx"], "deck.pptx", {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
      const input = wrapper.find('input[type="file"]');
      Object.defineProperty(input.element, "files", {
        value: [file],
        writable: true,
      });
      await input.trigger("change");
      expect(wrapper.emitted("file-selected")).toBeFalsy();
      expect(wrapper.text()).toContain(
        "Please select PDF, Word (.docx), or Excel (.xlsx) files",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects .xlsx when xlsxEnabled is false", async () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      public: { docxEnabled: true, pptxEnabled: true, xlsxEnabled: false },
    }));
    try {
      const wrapper = mount(DropZone);
      const file = new File(["xlsx"], "budget.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const input = wrapper.find('input[type="file"]');
      Object.defineProperty(input.element, "files", {
        value: [file],
        writable: true,
      });
      await input.trigger("change");
      expect(wrapper.emitted("file-selected")).toBeFalsy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
```

(`vi.stubGlobal` + `vi.unstubAllGlobals` is the established pattern from `AnnouncementBanner.test.ts` — it restores the test-helpers stub afterwards.)

- [ ] **Step 6: Run to verify they fail**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/components.test.ts`
Expected: FAIL — `expected 'Drop PDF or Word files here…' to contain 'Drop PDF, Word, PowerPoint, or Excel files here'`, the `.pptx`/`.xlsx` files rejected (no `file-selected` emitted), accept attr missing `presentationml`.

- [ ] **Step 7: Rewire DropZone**

In `apps/web/app/components/DropZone.vue`, replace this script block:

```ts
const config = useRuntimeConfig()
// Word support can be turned off server-side (DOCX_ENABLED=false); mirror that
// in the dropzone so we never invite a file the API will reject.
const docxEnabled = computed(() => config.public.docxEnabled !== false)
const acceptAttr = computed(() =>
  docxEnabled.value
    ? '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : '.pdf,application/pdf',
)
const fileNoun = computed(() => (docxEnabled.value ? 'PDF or Word' : 'PDF'))
const dropLabelIdle = computed(() => `Drop ${fileNoun.value} files here`)
const dropLabelActive = computed(() => `Drop your ${fileNoun.value} files here`)
```

with:

```ts
import {
  uploadAcceptAttr,
  uploadExtensions,
  uploadNoun,
  uploadNounWithExts,
} from '~/utils/uploadFormats'

const config = useRuntimeConfig()
// Word / PowerPoint / Excel support can each be turned off server-side
// (DOCX_ENABLED / PPTX_ENABLED / XLSX_ENABLED = "false"); mirror that in the
// dropzone so we never invite a file the API will reject.
const uploadFlags = computed(() => ({
  docx: config.public.docxEnabled !== false,
  pptx: config.public.pptxEnabled !== false,
  xlsx: config.public.xlsxEnabled !== false,
}))
const acceptAttr = computed(() => uploadAcceptAttr(uploadFlags.value))
const fileNoun = computed(() => uploadNoun(uploadFlags.value))
const dropLabelIdle = computed(() => `Drop ${fileNoun.value} files here`)
const dropLabelActive = computed(() => `Drop your ${fileNoun.value} files here`)
```

And in `processFiles(files: File[])`, replace:

```ts
  const exts = docxEnabled.value ? ['.pdf', '.docx'] : ['.pdf']
  const accepted = files.filter(f =>
    exts.some(ext => f.name.toLowerCase().endsWith(ext)),
  )
  if (accepted.length === 0) {
    validationError.value = docxEnabled.value
      ? 'Please select PDF or Word (.docx) files'
      : 'Please select PDF files'
    return
  }
```

with:

```ts
  const exts = uploadExtensions(uploadFlags.value)
  const accepted = files.filter(f =>
    exts.some(ext => f.name.toLowerCase().endsWith(ext)),
  )
  if (accepted.length === 0) {
    validationError.value = `Please select ${uploadNounWithExts(uploadFlags.value)} files`
    return
  }
```

- [ ] **Step 8: Run to verify they pass, then the full suite**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/components.test.ts app/__tests__/uploadFormats.test.ts && npx vitest run`
Expected: PASS everywhere (no other test pins the old DropZone copy).

- [ ] **Step 9: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/utils/uploadFormats.ts apps/web/app/components/DropZone.vue apps/web/app/__tests__/uploadFormats.test.ts apps/web/app/__tests__/components.test.ts
git commit -m "feat(web): accept .pptx/.xlsx uploads in DropZone behind their flags"
```

---

### Task 4: index.vue — remediation guard fix + hero/noun copy

**Files:**
- Modify: `apps/web/app/pages/index.vue:272-286` (guard), `:750-753` (drop hint), `:3143-3147` ("What This Tool Does" line), `:3163-3168` (stats-card line), `:844-873` area (Word-vs-PDF prose addendum), `:3305-3316` (hero computeds)
- Test: `apps/web/app/__tests__/remediationGuard.test.ts` (new)

**Interfaces:**
- Consumes: `uploadNoun(flags, conjunction)` from Task 3; `config.public.docxEnabled/pptxEnabled/xlsxEnabled` from Task 1.
- Produces: nothing consumed downstream; the guard `result?.fileType === 'pdf'` is the regression pin. (Safe for live results: the API's `AnalysisResult.fileType` is a required field and `pdfAnalyzer.ts:120` always sets `"pdf"` for PDFs.)

- [ ] **Step 1: Write the failing guard test**

`index.vue` is not mountable under bare @vue/test-utils (it needs the full Nuxt page context), so pin the guard with the repo's established source-assertion seam (`responsive.test.ts:106` and `accessibility.test.ts` both `readFileSync` page sources). Create `apps/web/app/__tests__/remediationGuard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// The PDF auto-remediation pipeline must be offered ONLY for PDF results.
// The old guard (fileType !== 'docx') would show the PDF RemediateButton for
// PowerPoint and Excel results. index.vue isn't mountable in this test env,
// so pin the template condition at the source level (same seam as
// responsive.test.ts / accessibility.test.ts).
describe("index.vue remediation guard", () => {
  const source = readFileSync(
    resolve(__dirname, "..", "pages/index.vue"),
    "utf-8",
  );

  it("gates the RemediateButton on fileType === 'pdf'", () => {
    expect(source).toContain(`v-if="result?.fileType === 'pdf'"`);
  });

  it("no longer uses the negative !== 'docx' guard anywhere", () => {
    expect(source).not.toContain("fileType !== 'docx'");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/remediationGuard.test.ts`
Expected: FAIL — both tests (the source still contains `v-if="result?.fileType !== 'docx'"`).

- [ ] **Step 3: Fix the guard**

In `apps/web/app/pages/index.vue`, replace:

```html
        <!-- Auto-Remediate (visible right under the score; component
             self-hides on score ≥ 90 or when REMEDIATION feature is off).
             In batch mode this targets the currently-active tab — each
             tab can be remediated independently. PDF-only: the remediation
             pipeline does not apply to Word (.docx) documents. -->
        <div
          v-if="result?.fileType !== 'docx'"
          class="mb-6 flex justify-center"
          data-export-exclude
        >
```

with:

```html
        <!-- Auto-Remediate (visible right under the score; component
             self-hides on score ≥ 90 or when REMEDIATION feature is off).
             In batch mode this targets the currently-active tab — each
             tab can be remediated independently. PDF-only: the remediation
             pipeline does not apply to Word, PowerPoint, or Excel documents,
             so gate on the positive fileType === 'pdf' (a negative !== check
             regresses every time a new format ships). -->
        <div
          v-if="result?.fileType === 'pdf'"
          class="mb-6 flex justify-center"
          data-export-exclude
        >
```

- [ ] **Step 4: Run to verify the guard test passes**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/remediationGuard.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit the guard fix on its own**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/pages/index.vue apps/web/app/__tests__/remediationGuard.test.ts
git commit -m "fix(web): offer PDF auto-remediation only for fileType === 'pdf' results"
```

- [ ] **Step 6: Update the hero computeds**

Still in `apps/web/app/pages/index.vue` (script setup, ~line 3305), replace:

```ts
// Word (.docx) support can be disabled server-side (DOCX_ENABLED=false); mirror
// that in the hero copy so we never invite a format the API will reject.
const runtimeConfig = useRuntimeConfig();
const docxEnabled = computed(() => runtimeConfig.public.docxEnabled !== false);
const heroTitle = computed(() =>
  docxEnabled.value
    ? "Check your PDFs and Word docs for accessibility"
    : "Check your PDFs for accessibility",
);
const heroUploadNoun = computed(() =>
  docxEnabled.value ? "PDF or Word document" : "PDF",
);
```

with:

```ts
// Word / PowerPoint / Excel support can each be disabled server-side
// (DOCX_ENABLED / PPTX_ENABLED / XLSX_ENABLED = "false"); mirror that in the
// hero copy so we never invite a format the API will reject.
const runtimeConfig = useRuntimeConfig();
const uploadFlags = computed(() => ({
  docx: runtimeConfig.public.docxEnabled !== false,
  pptx: runtimeConfig.public.pptxEnabled !== false,
  xlsx: runtimeConfig.public.xlsxEnabled !== false,
}));
const anyOfficeFormat = computed(
  () =>
    uploadFlags.value.docx || uploadFlags.value.pptx || uploadFlags.value.xlsx,
);
const heroTitle = computed(() =>
  anyOfficeFormat.value
    ? `Check your ${uploadNoun(uploadFlags.value, "and")} files for accessibility`
    : "Check your PDFs for accessibility",
);
const heroUploadNoun = computed(() => `${uploadNoun(uploadFlags.value)} file`);
```

and add this import next to the other `~/utils/` imports at the top of the script block (after `import { partitionCardFindings } from "~/utils/findings";`):

```ts
import { uploadNoun } from "~/utils/uploadFormats";
```

Rendered defaults (all flags on): heroTitle = "Check your PDF, Word, PowerPoint, and Excel files for accessibility"; the paragraph reads "Upload a PDF, Word, PowerPoint, or Excel file to get an instant accessibility score…". (Deliberate copy change from "PDF or Word document" to "…file" — one noun pattern for all formats.)

- [ ] **Step 7: Update the drop-hint banner**

Replace:

```html
          <p class="text-sm text-blue-400 font-medium">
            Drop a PDF file on the area below, or click it to browse your files.
          </p>
```

with:

```html
          <p class="text-sm text-blue-400 font-medium">
            Drop a {{ heroUploadNoun }} on the area below, or click it to browse your files.
          </p>
```

- [ ] **Step 8: Update the "What This Tool Does" copy**

Replace:

```html
      <p class="mt-2 text-sm text-[var(--text-secondary)] max-w-2xl mx-auto">
        Audit any PDF or Word (.docx) document for WCAG 2.2 AA accessibility — and
        (optionally) auto-remediate PDFs — all on infrastructure you control, with
        no AI and no per-document fees.
      </p>
```

with:

```html
      <p class="mt-2 text-sm text-[var(--text-secondary)] max-w-2xl mx-auto">
        Audit any PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) document
        for WCAG 2.2 AA accessibility — and (optionally) auto-remediate PDFs — all
        on infrastructure you control, with no AI and no per-document fees.
      </p>
```

and in the first stats card just below it, replace:

```html
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          Each PDF scored across 9 categories aligned with
          <strong>WCAG 2.2 Level AA</strong> and ADA Title II. A–F letter grade plus
          Critical / Serious / Moderate severity per category so you know what to
          fix first.
        </p>
```

with:

```html
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          Each document scored across up to 9 categories aligned with
          <strong>WCAG 2.2 Level AA</strong> and ADA Title II. A–F letter grade plus
          Critical / Serious / Moderate severity per category so you know what to
          fix first.
        </p>
```

- [ ] **Step 9: Extend the Word-vs-PDF education prose**

In the "What Is a PDF, Really?" section (~line 863), the paragraph ending "…because the meaning is right there in the file." is followed by the "PDF stores *where every glyph goes*…" paragraph. Insert a new paragraph between them. Replace:

```html
          <p class="text-[var(--text-muted)] mb-3">
            PDF stores <em>where every glyph goes on the page</em>. That's
```

with:

```html
          <p class="text-[var(--text-muted)] mb-3">
            PowerPoint (.pptx) and Excel (.xlsx) files store meaning the same
            way Word does — all three are the same Office Open XML family
            under the hood — which is why this tool can audit all of them
            directly as source documents.
          </p>
          <p class="text-[var(--text-muted)] mb-3">
            PDF stores <em>where every glyph goes on the page</em>. That's
```

- [ ] **Step 10: Run the full web suite**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run`
Expected: PASS — no test pins the old hero copy ("Check your PDFs and Word docs…" appears in no test file; verify with `grep -rn "Check your PDFs" apps/web/app/__tests__/` → no matches).

- [ ] **Step 11: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/pages/index.vue
git commit -m "feat(web): PowerPoint/Excel in hero, upload noun, and tool-overview copy"
```

---

### Task 5: SourceDocumentNotice — PowerPoint and Excel variants

**Files:**
- Modify: `apps/web/app/components/SourceDocumentNotice.vue` (prop union at :8, computeds, main paragraph branch, per-format tips list)
- Test: `apps/web/app/__tests__/SourceDocumentNotice.test.ts` (new)

**Interfaces:**
- Consumes: `fileType` prop passed by `index.vue:290` (`:file-type="result?.fileType"` — already in place, no page change needed).
- Produces: prop union `'pdf' | 'docx' | 'pptx' | 'xlsx'`. Word and PDF rendered copy unchanged.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/__tests__/SourceDocumentNotice.test.ts`:

```ts
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SourceDocumentNotice from "../components/SourceDocumentNotice.vue";

describe("SourceDocumentNotice", () => {
  it("keeps the PDF fallback framing by default", () => {
    const wrapper = mount(SourceDocumentNotice);
    expect(wrapper.text()).toContain("PDF remediation");
    expect(wrapper.text()).toContain("source document");
    expect(wrapper.text()).toContain("Adobe InDesign");
  });

  it("keeps the Word source framing for docx", () => {
    const wrapper = mount(SourceDocumentNotice, {
      props: { fileType: "docx" },
    });
    expect(wrapper.text()).toContain("A Word document is the source document");
    expect(wrapper.text()).toContain("fix it in Word, then re-check");
  });

  it("shows PowerPoint framing with slide-title and checker steps for pptx", () => {
    const wrapper = mount(SourceDocumentNotice, {
      props: { fileType: "pptx" },
    });
    expect(wrapper.text()).toContain(
      "A PowerPoint deck is the source document",
    );
    expect(wrapper.text()).toContain("fix it in PowerPoint, then re-check");
    expect(wrapper.text()).toContain("Check Accessibility");
    expect(wrapper.text()).toContain("Outline View");
    expect(wrapper.text()).toContain("Home → Layout");
    expect(wrapper.text()).not.toContain("Adobe InDesign");
  });

  it("shows Excel framing with Format-as-Table and sheet-rename steps for xlsx", () => {
    const wrapper = mount(SourceDocumentNotice, {
      props: { fileType: "xlsx" },
    });
    expect(wrapper.text()).toContain(
      "An Excel workbook is the source document",
    );
    expect(wrapper.text()).toContain("fix it in Excel, then re-check");
    expect(wrapper.text()).toContain("Format as Table");
    expect(wrapper.text()).toContain("Rename");
    expect(wrapper.text()).not.toContain("Adobe InDesign");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/SourceDocumentNotice.test.ts`
Expected: FAIL — the pptx/xlsx tests render the PDF fallback branch ("PDF remediation…", contains "Adobe InDesign"), because the prop union doesn't include the new values and `isDocx` is the only branch.

- [ ] **Step 3: Extend the component**

In `apps/web/app/components/SourceDocumentNotice.vue`, replace the script block:

```ts
interface Props {
  /** Tighter visual on result page, default for audit page. */
  variant?: 'audit' | 'result'
  /** Analyzed file type — a .docx IS the source, so the framing flips. */
  fileType?: 'pdf' | 'docx'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'audit',
  fileType: 'pdf',
})

const isResult = computed(() => props.variant === 'result')
const isDocx = computed(() => props.fileType === 'docx')
```

with:

```ts
interface Props {
  /** Tighter visual on result page, default for audit page. */
  variant?: 'audit' | 'result'
  /** Analyzed file type — an OOXML file IS the source, so the framing flips. */
  fileType?: 'pdf' | 'docx' | 'pptx' | 'xlsx'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'audit',
  fileType: 'pdf',
})

const isResult = computed(() => props.variant === 'result')
const isDocx = computed(() => props.fileType === 'docx')
const isPptx = computed(() => props.fileType === 'pptx')
const isXlsx = computed(() => props.fileType === 'xlsx')
```

In the template, immediately after the existing `v-if="isDocx"` paragraph (which stays byte-identical), insert the two new paragraphs so the chain is `v-if="isDocx"` → `v-else-if="isPptx"` → `v-else-if="isXlsx"` → `v-else` (PDF paragraph unchanged):

```html
        <p
          v-else-if="isPptx"
          class="text-sm text-[var(--text)] leading-relaxed mb-3"
        >
          A PowerPoint deck is the <strong>source document</strong> — the best
          place to fix accessibility. Correcting issues here (slide titles from
          the built-in layouts, alt text, table header rows, real bulleted
          lists) fixes them at the root, and any PDF you export from this deck
          inherits that structure automatically. There's no separate
          remediation step: fix it in PowerPoint, then re-check.
        </p>
        <p
          v-else-if="isXlsx"
          class="text-sm text-[var(--text)] leading-relaxed mb-3"
        >
          An Excel workbook is the <strong>source document</strong> — the best
          place to fix accessibility. Correcting issues here (descriptive sheet
          tab names, real table objects with header rows, alt text on charts
          and images) fixes them at the root, and any PDF you export from this
          workbook inherits that structure automatically. There's no separate
          remediation step: fix it in Excel, then re-check.
        </p>
```

Then replace the single `<ul>` inside the `<details>` block with a three-way branch. The existing `<ul class="mt-3 space-y-2 …">` (Word / InDesign / Google Docs / Pages / When-exporting list) becomes the `v-else` case, contents unchanged; add these two lists before it:

```html
          <ul
            v-if="isPptx"
            class="mt-3 space-y-2 text-[var(--text-muted)] text-xs leading-relaxed"
          >
            <li>
              <strong class="text-[var(--text)]">Run the checker:</strong>
              <em>Review → Check Accessibility</em> finds and fixes most issues
              before you share or export the deck.
            </li>
            <li>
              <strong class="text-[var(--text)]">Slide titles:</strong> give
              every slide a unique title using the built-in title placeholder —
              pick a layout with a title via <em>Home → Layout</em>, or add
              titles quickly in <em>View → Outline View</em>. A text box that
              merely looks like a title is not one.
            </li>
            <li>
              <strong class="text-[var(--text)]">Alt text:</strong> right-click
              each image, chart, or SmartArt graphic → <em>View Alt Text</em>;
              describe it, or check <em>Mark as decorative</em>.
            </li>
            <li>
              <strong class="text-[var(--text)]">Reading order:</strong> open
              <em>Review → Check Accessibility → Reading Order pane</em> —
              screen readers follow the shape order, not the visual layout, and
              the slide title should come first.
            </li>
            <li>
              <strong class="text-[var(--text)]">Tables:</strong> use
              <em>Insert → Table</em> (not text boxes arranged as a grid) and
              keep <em>Header Row</em> checked under Table Design.
            </li>
          </ul>
          <ul
            v-else-if="isXlsx"
            class="mt-3 space-y-2 text-[var(--text-muted)] text-xs leading-relaxed"
          >
            <li>
              <strong class="text-[var(--text)]">Run the checker:</strong>
              <em>Review → Check Accessibility</em> finds and fixes most issues
              before you share or export the workbook.
            </li>
            <li>
              <strong class="text-[var(--text)]">Sheet names:</strong> rename
              every tab (double-click the tab, or right-click →
              <em>Rename</em>) from the default "Sheet1" to a name that says
              what the sheet contains, and unhide or remove sheets you don't
              need.
            </li>
            <li>
              <strong class="text-[var(--text)]">Real tables:</strong> select
              each data region and use <em>Home → Format as Table</em> with
              <em>My table has headers</em> checked — screen readers announce
              header cells only for real table objects.
            </li>
            <li>
              <strong class="text-[var(--text)]">Merged cells:</strong> avoid
              them inside data regions — they break the row/column
              relationships screen readers rely on.
            </li>
            <li>
              <strong class="text-[var(--text)]">Alt text:</strong> right-click
              each chart or image → <em>View Alt Text</em>; describe it, or
              check <em>Mark as decorative</em>.
            </li>
          </ul>
```

(The existing `<ul class="mt-3 space-y-2 text-[var(--text-muted)] text-xs leading-relaxed">` directly after these gets `v-else` added to its tag: `<ul v-else class="mt-3 space-y-2 text-[var(--text-muted)] text-xs leading-relaxed">`. Its five `<li>` items are untouched.)

- [ ] **Step 4: Run to verify they pass**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/SourceDocumentNotice.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/components/SourceDocumentNotice.vue apps/web/app/__tests__/SourceDocumentNotice.test.ts
git commit -m "feat(web): PowerPoint and Excel source-document guidance"
```

---

### Task 6: MethodologyCard — per-format methodology prose

**Files:**
- Modify: `apps/web/app/components/MethodologyCard.vue` (prop at :7, computeds, intro sentence at :55-57, bottom paragraphs at :110-135)
- Test: `apps/web/app/__tests__/MethodologyCard.test.ts` (new)

**Interfaces:**
- Consumes: `fileType` prop from `index.vue:305` and `report/[id].vue:147` (both already bind `result.fileType` — no page change).
- Produces: prop union `'pdf' | 'docx' | 'pptx' | 'xlsx'`. PDF and Word rendered copy unchanged.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/__tests__/MethodologyCard.test.ts`:

```ts
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MethodologyCard from "../components/MethodologyCard.vue";

describe("MethodologyCard", () => {
  it("names the PDF toolchain by default", () => {
    const wrapper = mount(MethodologyCard);
    expect(wrapper.text()).toContain("QPDF");
    expect(wrapper.text()).toContain("PDF.js (Mozilla)");
    expect(wrapper.text()).toContain("Nine categories");
  });

  it("keeps the Word methodology for docx", () => {
    const wrapper = mount(MethodologyCard, { props: { fileType: "docx" } });
    expect(wrapper.text()).toContain("JSZip");
    expect(wrapper.text()).toContain("unzips the .docx (OOXML) package");
    expect(wrapper.text()).toContain("Eight categories");
    expect(wrapper.text()).not.toContain("QPDF");
  });

  it("describes the PowerPoint methodology for pptx", () => {
    const wrapper = mount(MethodologyCard, { props: { fileType: "pptx" } });
    expect(wrapper.text()).toContain("unzips the .pptx (OOXML) package");
    expect(wrapper.text()).toContain("the PowerPoint presentation's");
    expect(wrapper.text()).toContain("slide titles");
    expect(wrapper.text()).toContain(
      "Accessibility Checker rules for PowerPoint",
    );
    expect(wrapper.text()).not.toContain("QPDF");
  });

  it("describes the Excel methodology for xlsx", () => {
    const wrapper = mount(MethodologyCard, { props: { fileType: "xlsx" } });
    expect(wrapper.text()).toContain("unzips the .xlsx (OOXML) package");
    expect(wrapper.text()).toContain("the Excel workbook's");
    expect(wrapper.text()).toContain("sheet names");
    expect(wrapper.text()).toContain("no document-language property");
    expect(wrapper.text()).toContain("Accessibility Checker rules for Excel");
    expect(wrapper.text()).not.toContain("QPDF");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/MethodologyCard.test.ts`
Expected: FAIL — pptx/xlsx mounts render the PDF branch (contain "QPDF"), and the docx test passes but pins the copy we must preserve.

- [ ] **Step 3: Extend the component script**

In `apps/web/app/components/MethodologyCard.vue`, replace the whole `<script setup>` body:

```ts
const props = withDefaults(
  defineProps<{
    /** Analyzed file type — selects the library list, category count, and copy. */
    fileType?: 'pdf' | 'docx'
  }>(),
  { fileType: 'pdf' },
)

const isDocx = computed(() => props.fileType === 'docx')

// The open-source libraries named in the badge row, per format.
const libraries = computed(() =>
  isDocx.value
    ? [
        {
          href: 'https://stuk.github.io/jszip/',
          name: 'JSZip',
          note: '— unzips the .docx (OOXML) package',
        },
        {
          href: 'https://github.com/NaturalIntelligence/fast-xml-parser',
          name: 'fast-xml-parser',
          note: '— OOXML structure & content analysis',
        },
      ]
    : [
        {
          href: 'https://qpdf.readthedocs.io/',
          name: 'QPDF',
          note: '— PDF structure & tag extraction',
        },
        {
          href: 'https://mozilla.github.io/pdf.js/',
          name: 'PDF.js (Mozilla)',
          note: '— content & metadata analysis',
        },
      ],
)
```

with:

```ts
const props = withDefaults(
  defineProps<{
    /** Analyzed file type — selects the library list, category count, and copy. */
    fileType?: 'pdf' | 'docx' | 'pptx' | 'xlsx'
  }>(),
  { fileType: 'pdf' },
)

const isDocx = computed(() => props.fileType === 'docx')
const isPptx = computed(() => props.fileType === 'pptx')
const isXlsx = computed(() => props.fileType === 'xlsx')
/** All three Office formats share the JSZip + fast-xml-parser pipeline. */
const isOoxml = computed(() => isDocx.value || isPptx.value || isXlsx.value)

/** Possessive subject for the intro sentence, per OOXML format. */
const ooxmlSubject = computed(() =>
  isDocx.value
    ? "the Word document's"
    : isPptx.value
      ? "the PowerPoint presentation's"
      : "the Excel workbook's",
)

// The open-source libraries named in the badge row, per format.
const libraries = computed(() =>
  isOoxml.value
    ? [
        {
          href: 'https://stuk.github.io/jszip/',
          name: 'JSZip',
          note: `— unzips the .${props.fileType} (OOXML) package`,
        },
        {
          href: 'https://github.com/NaturalIntelligence/fast-xml-parser',
          name: 'fast-xml-parser',
          note: '— OOXML structure & content analysis',
        },
      ]
    : [
        {
          href: 'https://qpdf.readthedocs.io/',
          name: 'QPDF',
          note: '— PDF structure & tag extraction',
        },
        {
          href: 'https://mozilla.github.io/pdf.js/',
          name: 'PDF.js (Mozilla)',
          note: '— content & metadata analysis',
        },
      ],
)
```

- [ ] **Step 4: Extend the template**

Replace the intro sentence fragment:

```html
      This tool uses established open-source libraries to
      <template v-if="isDocx"
        >read the Word document's Office Open XML (OOXML) structure</template
      ><template v-else>extract and analyze PDF structure</template>. Scores are
```

with:

```html
      This tool uses established open-source libraries to
      <template v-if="isOoxml"
        >read {{ ooxmlSubject }} Office Open XML (OOXML) structure</template
      ><template v-else>extract and analyze PDF structure</template>. Scores are
```

Then, between the existing `v-if="isDocx"` bottom paragraph (unchanged) and the existing `v-else` PDF paragraph (unchanged), insert:

```html
    <p
      v-else-if="isPptx"
      class="text-xs text-[var(--text-muted)] leading-relaxed text-center"
    >
      Nine categories are weighed against <strong>WCAG 2.2 AA</strong> (a
      superset of the WCAG 2.1 AA required by <strong>IITAA 2.1 §E205.4</strong>
      and ADA Title II) — the rules that govern non-web document accessibility in
      Illinois. PowerPoint-specific checks include <strong>slide titles</strong>
      (every slide needs a unique title placeholder — Microsoft's
      highest-severity PowerPoint rule) and a title-first
      <strong>reading order</strong> check; categories that don't apply to
      PowerPoint (heading structure, form fields, bookmarks) are omitted and the
      remaining weights renormalized. Color contrast is checked directly,
      because PowerPoint stores explicit and theme colors. Machine checks are
      benchmarked against Microsoft's own Accessibility Checker rules for
      PowerPoint. This score is the compliance benchmark for publication.
    </p>
    <p
      v-else-if="isXlsx"
      class="text-xs text-[var(--text-muted)] leading-relaxed text-center"
    >
      Seven categories are weighed against <strong>WCAG 2.2 AA</strong> (a
      superset of the WCAG 2.1 AA required by <strong>IITAA 2.1 §E205.4</strong>
      and ADA Title II) — the rules that govern non-web document accessibility in
      Illinois. Excel-specific checks include <strong>sheet names</strong> (no
      default "Sheet1" tabs on visible sheets) and <strong>table markup</strong>
      (data in real table objects with header rows; merged cells are flagged as
      advisories). Excel stores no document-language property, so the language
      half of Title &amp; Language is reported as not assessed and the title is
      scored alone; categories that don't apply to Excel (heading structure,
      reading order, list structure, form fields) are omitted and the remaining
      weights renormalized. Color contrast is checked directly from explicit
      font and fill colors. Machine checks are benchmarked against Microsoft's
      own Accessibility Checker rules for Excel. This score is the compliance
      benchmark for publication.
    </p>
```

(The chain order in the template becomes: `v-if="isDocx"` → `v-else-if="isPptx"` → `v-else-if="isXlsx"` → `v-else` PDF.)

- [ ] **Step 5: Run to verify they pass, plus the source-pin suite**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/MethodologyCard.test.ts app/__tests__/responsive.test.ts`
Expected: PASS — `responsive.test.ts` asserts "ADA Title II" / "IITAA §E205.4" / "veraPDF" / "PDF/UA-1" across index.vue + MethodologyCard combined; all still present.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/components/MethodologyCard.vue apps/web/app/__tests__/MethodologyCard.test.ts
git commit -m "feat(web): per-format methodology copy for PowerPoint and Excel"
```

---

### Task 7: ScoreCard — per-format fix-path guidance

**Files:**
- Modify: `apps/web/app/components/ScoreCard.vue` (prop union at :259, `isDocx` at :270 → `sourceApp`, caveat block at :152-186, `conformanceBody` at :397-425)
- Test: `apps/web/app/__tests__/components.test.ts` (ScoreCard describe)

**Interfaces:**
- Consumes: `result.fileType` from callers (already bound; the remediate-page ScoreCards pass PDF audit results whose `fileType` is `"pdf"`).
- Produces: prop union `fileType?: "pdf" | "docx" | "pptx" | "xlsx"`. Word rendered strings unchanged: "run Word's built-in Accessibility Checker…", "fix the issues directly in Word (Review → Check Accessibility)".

- [ ] **Step 1: Write the failing tests**

In `apps/web/app/__tests__/components.test.ts`, add to the end of `describe("ScoreCard", ...)`:

```ts
  it.each([
    { fileType: "docx", app: "Word" },
    { fileType: "pptx", app: "PowerPoint" },
    { fileType: "xlsx", app: "Excel" },
  ])(
    "points $fileType results at $app's built-in Accessibility Checker",
    ({ fileType, app }) => {
      const wrapper = mount(ScoreCard, {
        props: { result: { ...baseResult, fileType } },
      });
      expect(wrapper.text()).toContain(`${app}'s built-in`);
      expect(wrapper.text()).toContain(
        `Because this ${app} file is the source document`,
      );
      expect(wrapper.text()).not.toContain("Adobe Acrobat");
    },
  );

  it("keeps the Acrobat caveat for PDF results", () => {
    const wrapper = mount(ScoreCard, {
      props: { result: { ...baseResult, fileType: "pdf" } },
    });
    expect(wrapper.text()).toContain("Adobe Acrobat's Accessibility Checker");
  });

  it("names the source app in the warning-tone conformance fix path", () => {
    const wrapper = mount(ScoreCard, {
      props: {
        result: {
          ...baseResult,
          grade: "F",
          overallScore: 20,
          fileType: "pptx",
          conformance: {
            status: "fail",
            headline: "Confirmed failures found.",
            failures: [
              {
                sc: "1.1.1",
                name: "Non-text Content",
                level: "A",
                category: "alt_text",
                issue: "2 images have no alt text",
                url: "https://example.org",
              },
            ],
            notAssessed: [],
          },
        },
      },
    });
    expect(wrapper.text()).toContain(
      "fix the issues directly in PowerPoint (Review → Check Accessibility)",
    );
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/components.test.ts`
Expected: FAIL — pptx/xlsx mounts render the PDF caveat (contain "Adobe Acrobat"), and the conformance test shows the Acrobat fix path.

- [ ] **Step 3: Replace `isDocx` with format-aware computeds**

In `apps/web/app/components/ScoreCard.vue`, replace the prop type line:

```ts
      fileType?: "pdf" | "docx";
```

with:

```ts
      fileType?: "pdf" | "docx" | "pptx" | "xlsx";
```

and replace:

```ts
const isDocx = computed(() => props.result.fileType === "docx");
```

with:

```ts
/**
 * "Word" | "PowerPoint" | "Excel" when the audited file is an editable Office
 * source document; null for PDF and for unknown stored fileType strings (the
 * public /report/:id page renders caller-controlled JSON, so unknown values
 * must fall back to the PDF framing, matching the old isDocx behavior).
 */
const sourceApp = computed<string | null>(() => {
  switch (props.result.fileType) {
    case "docx":
      return "Word";
    case "pptx":
      return "PowerPoint";
    case "xlsx":
      return "Excel";
    default:
      return null;
  }
});

/** Per-format manual-review clause for the positive conformance body. */
const manualReviewNote = computed(() => {
  switch (props.result.fileType) {
    case "docx":
      return "the correctness of alt text, headings, and reading order can only be confirmed by manual review.";
    case "pptx":
      return "the correctness of alt text, slide titles, and reading order can only be confirmed by manual review.";
    case "xlsx":
      return "the correctness of alt text, sheet names, and table structure can only be confirmed by manual review.";
    default:
      return "color contrast is not evaluated here, and the correctness of alt text, headings, reading order, and tags can only be confirmed by manual review.";
  }
});
```

- [ ] **Step 4: Generalize the caveat block**

Replace the caveat paragraphs (inside the `<!-- Caveat -->` container):

```html
      <p
        v-if="isDocx"
        class="text-xs text-[var(--text-secondary)] leading-relaxed"
      >
        This automated audit provides a reliable initial assessment, but it
        cannot catch every issue. For the most thorough evaluation, run Word's
        built-in
        <a
          href="https://support.microsoft.com/en-us/office/improve-accessibility-with-the-accessibility-checker-a16f6de0-2f39-4a2b-8bd8-5ad801426c7f"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
          >Accessibility Checker (Review → Check Accessibility)</a
        >. Because this Word file is the source document, fixing issues here
        corrects them at the root — and any PDF you export from it inherits the
        fixes automatically.
      </p>
```

with (the `v-else` PDF paragraph below it stays byte-identical):

```html
      <p
        v-if="sourceApp"
        class="text-xs text-[var(--text-secondary)] leading-relaxed"
      >
        This automated audit provides a reliable initial assessment, but it
        cannot catch every issue. For the most thorough evaluation, run
        {{ sourceApp }}'s built-in
        <a
          href="https://support.microsoft.com/en-us/office/improve-accessibility-with-the-accessibility-checker-a16f6de0-2f39-4a2b-8bd8-5ad801426c7f"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[var(--link)] hover:text-[var(--link-hover)] underline"
          >Accessibility Checker (Review → Check Accessibility)</a
        >. Because this {{ sourceApp }} file is the source document, fixing
        issues here corrects them at the root — and any PDF you export from it
        inherits the fixes automatically.
      </p>
```

(One Microsoft support URL covers Word, PowerPoint, and Excel — it is Microsoft's cross-app Accessibility Checker page. Keep `{{ sourceApp }}'s built-in` and `Because this {{ sourceApp }} file is the source` each on a single template line so `wrapper.text()` contains the phrases contiguously.)

- [ ] **Step 5: Generalize `conformanceBody`**

Replace inside the `conformanceBody` computed:

```ts
    return `No automated WCAG failures were detected, and this file earned a grade of ${grade}. This is still not a determination of full conformance — ${
      isDocx.value
        ? "the correctness of alt text, headings, and reading order can only be confirmed by manual review."
        : "color contrast is not evaluated here, and the correctness of alt text, headings, reading order, and tags can only be confirmed by manual review."
    }`;
```

with:

```ts
    return `No automated WCAG failures were detected, and this file earned a grade of ${grade}. This is still not a determination of full conformance — ${manualReviewNote.value}`;
```

and replace:

```ts
    const howToFix = isDocx.value
      ? "Correcting them is manual work — fix the issues directly in Word (Review → Check Accessibility), then re-run this audit to confirm the fixes landed."
      : "Correcting them is manual work — fix the document in Adobe Acrobat's Accessibility Checker, or repair the source file (Word, InDesign) and re-export the PDF, then re-run this audit to confirm the fixes landed.";
```

with:

```ts
    const howToFix = sourceApp.value
      ? `Correcting them is manual work — fix the issues directly in ${sourceApp.value} (Review → Check Accessibility), then re-run this audit to confirm the fixes landed.`
      : "Correcting them is manual work — fix the document in Adobe Acrobat's Accessibility Checker, or repair the source file (Word, InDesign) and re-export the PDF, then re-run this audit to confirm the fixes landed.";
```

(`isDocx` is now unused in ScoreCard — delete any remaining declaration of it; `tsc` in the phase gate will confirm nothing else references it.)

- [ ] **Step 6: Run to verify they pass, then the full suite**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/components.test.ts && npx vitest run`
Expected: PASS everywhere (the docx `it.each` row also proves the Word wording survived).

- [ ] **Step 7: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/components/ScoreCard.vue apps/web/app/__tests__/components.test.ts
git commit -m "feat(web): PowerPoint/Excel fix-path guidance in ScoreCard"
```

---

### Task 8: useReportExport — 4-value union + format-aware export wording

**Files:**
- Modify: `apps/web/app/composables/useReportExport.ts` (`:37` union; import at `:3`; buildHtml h1 at `:812`; buildAiAnalysis at `:881`, `:887`, `:892`, `:918`, `:922`, `:928`, `:993`; buildJSON prompt at `:443`)
- Test: `apps/web/app/__tests__/reportExportBanner.test.ts`, `apps/web/app/__tests__/ai-analysis.test.ts`

**Interfaces:**
- Consumes: `fileTypeLabel(fileType?)` and `pageNoun(fileType?)` from Task 2; `bannerMetaLine` already handles the new types (the calls at `:193`, `:483`, `:808` need no edit — extending the union makes them correct).
- Produces: `ReportResult.fileType?: "pdf" | "docx" | "pptx" | "xlsx"`. PDF/Word export wording unchanged.

- [ ] **Step 1: Write the failing export-banner tests**

Add to `apps/web/app/__tests__/reportExportBanner.test.ts` (top level, after the existing describes):

```ts
describe("format-aware export labels", () => {
  it("labels a PowerPoint export with slides and the PowerPoint title", () => {
    const result = baseResult({
      filename: "deck.pptx",
      pageCount: 9,
      fileType: "pptx",
    });
    const md = buildMarkdown(result, branding);
    expect(md).toContain("9 slides · PowerPoint");
    const html = buildHtml(result, branding);
    expect(html).toContain("PowerPoint Accessibility Report");
    expect(html).toContain("9 slides · PowerPoint");
  });

  it("labels an Excel export with sheets and the Excel title", () => {
    const result = baseResult({
      filename: "budget.xlsx",
      pageCount: 4,
      fileType: "xlsx",
    });
    const txt = buildText(result, branding);
    expect(txt).toContain("4 sheets · Excel");
    const html = buildHtml(result, branding);
    expect(html).toContain("Excel Accessibility Report");
  });

  it("keeps the PDF wording for results without a fileType", () => {
    const html = buildHtml(baseResult(), branding);
    expect(html).toContain("PDF Accessibility Report");
    expect(html).toContain("12 pages · PDF");
  });
});
```

- [ ] **Step 2: Write the failing AI-analysis tests**

Add to `apps/web/app/__tests__/ai-analysis.test.ts`, inside `describe("buildAiAnalysis", ...)`:

```ts
  it("titles the analysis by file type and counts slides for pptx", () => {
    const out = buildAiAnalysis(
      baseResult({ filename: "deck.pptx", pageCount: 9, fileType: "pptx" }),
    );
    expect(out).toContain("# PowerPoint Accessibility Audit — For AI Analysis");
    expect(out).toContain("Slides: 9");
    expect(out).toContain("I ran an automated PowerPoint accessibility audit");
    expect(out).toContain("Please verify the PowerPoint file");
    expect(out).toContain("Microsoft PowerPoint itself");
    expect(out).not.toContain("Adobe Acrobat Pro");
  });

  it("counts sheets and uses the Excel fix framing for xlsx", () => {
    const out = buildAiAnalysis(
      baseResult({ filename: "budget.xlsx", pageCount: 4, fileType: "xlsx" }),
    );
    expect(out).toContain("# Excel Accessibility Audit — For AI Analysis");
    expect(out).toContain("Sheets: 4");
    expect(out).toContain("Microsoft Excel itself");
  });

  it("keeps the PDF wording, Pages label, and Acrobat step for pdf", () => {
    const out = buildAiAnalysis(baseResult({ fileType: "pdf" }));
    expect(out).toContain("# PDF Accessibility Audit — For AI Analysis");
    expect(out).toContain("Pages: 12");
    expect(out).toContain("Adobe Acrobat Pro");
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/reportExportBanner.test.ts app/__tests__/ai-analysis.test.ts`
Expected: FAIL — `expected … to contain '9 slides · PowerPoint'` (buildMarkdown emits "9 pages · PDF" because the union rejects/ignores "pptx"), `to contain '# PowerPoint Accessibility Audit'` (emits "# PDF …"), `to contain 'Slides: 9'`.

- [ ] **Step 4: Extend the composable**

In `apps/web/app/composables/useReportExport.ts`:

(a) Replace the import at line 3:

```ts
import { BANNER_EYEBROW, bannerMetaLine } from "~/utils/reportBanner";
```

with:

```ts
import {
  BANNER_EYEBROW,
  bannerMetaLine,
  fileTypeLabel,
  pageNoun,
} from "~/utils/reportBanner";
```

(b) Replace the union at line 37:

```ts
  fileType?: "pdf" | "docx";
```

with:

```ts
  fileType?: "pdf" | "docx" | "pptx" | "xlsx";
```

(c) Add this helper right after the `gradeLabel` function (~line 123):

```ts
/** "- Pages: 12" / "- Slides: 9" / "- Sheets: 4" for the AI-analysis export. */
function pageCountLine(result: ReportResult): string {
  const noun = pageNoun(result.fileType);
  return `- ${noun.charAt(0).toUpperCase()}${noun.slice(1)}s: ${result.pageCount}`;
}
```

(d) In `buildJSON`, replace the `llmContext.prompt` opening:

```ts
      prompt:
        `You are reviewing a PDF accessibility audit for "${result.filename}" (${result.pageCount} pages). ` +
```

with:

```ts
      prompt:
        `You are reviewing a ${fileTypeLabel(result.fileType)} accessibility audit for "${result.filename}" (${result.pageCount} ${pageNoun(result.fileType)}${result.pageCount === 1 ? "" : "s"}). ` +
```

(e) In `buildHtml`, replace the report title line:

```html
  <h1 style="text-align:center;font-size:24px;margin-bottom:4px">${result.fileType === "docx" ? "Word" : "PDF"} Accessibility Report</h1>
```

with:

```html
  <h1 style="text-align:center;font-size:24px;margin-bottom:4px">${fileTypeLabel(result.fileType)} Accessibility Report</h1>
```

(f) In `buildAiAnalysis`, replace the heading push:

```ts
  lines.push(
    `# ${result.fileType === "docx" ? "Word" : "PDF"} Accessibility Audit — For AI Analysis`,
  );
```

with:

```ts
  lines.push(
    `# ${fileTypeLabel(result.fileType)} Accessibility Audit — For AI Analysis`,
  );
```

(g) In the no-failures branch of `buildAiAnalysis`, replace:

```ts
    lines.push(
      `An automated PDF accessibility audit completed with no failing categories. The document passed every applicable check against WCAG ${wcagVersion} Level AA and ADA Title II requirements. No remediation is needed at this time.`,
    );
```

with:

```ts
    lines.push(
      `An automated ${fileTypeLabel(result.fileType)} accessibility audit completed with no failing categories. The document passed every applicable check against WCAG ${wcagVersion} Level AA and ADA Title II requirements. No remediation is needed at this time.`,
    );
```

and in the same branch replace `` lines.push(`- Pages: ${result.pageCount}`); `` with `lines.push(pageCountLine(result));`.

(h) In the failing branch of `buildAiAnalysis`, replace:

```ts
  lines.push(
    `I ran an automated PDF accessibility audit and I'd like your help remediating the failing items listed below. The audit checks WCAG ${wcagVersion} Level AA and ADA Title II digital accessibility requirements. Only failing categories (Critical or Moderate severity) are included — passing items are omitted to keep the context focused on what needs to be fixed.`,
  );
  lines.push("");
  lines.push(
    `**Please verify the PDF file (\`${result.filename}\`) is attached to this conversation before you answer.** If it is not attached, ask me to upload it first — your remediation guidance will be far more accurate if you can inspect the actual tag tree, reading order, alt text, and form fields directly rather than reasoning only from the summary below.`,
  );
```

with:

```ts
  const formatLabel = fileTypeLabel(result.fileType);
  const isPdfResult = !result.fileType || result.fileType === "pdf";
  lines.push(
    `I ran an automated ${formatLabel} accessibility audit and I'd like your help remediating the failing items listed below. The audit checks WCAG ${wcagVersion} Level AA and ADA Title II digital accessibility requirements. Only failing categories (Critical or Moderate severity) are included — passing items are omitted to keep the context focused on what needs to be fixed.`,
  );
  lines.push("");
  lines.push(
    `**Please verify the ${formatLabel} file (\`${result.filename}\`) is attached to this conversation before you answer.** If it is not attached, ask me to upload it first — your remediation guidance will be far more accurate if you can inspect the ${
      isPdfResult
        ? "actual tag tree, reading order, alt text, and form fields"
        : "document's actual structure, alt text, and content"
    } directly rather than reasoning only from the summary below.`,
  );
```

and replace the second `` lines.push(`- Pages: ${result.pageCount}`); `` with `lines.push(pageCountLine(result));`.

(i) Still in the failing branch, replace the "What I'd like from you" step 2:

```ts
  lines.push(
    `2. For each failing category, give me 2–4 concrete remediation steps. Call out which steps belong in the source document (Word, InDesign) and which can be done in Adobe Acrobat Pro after export.`,
  );
```

with:

```ts
  lines.push(
    isPdfResult
      ? `2. For each failing category, give me 2–4 concrete remediation steps. Call out which steps belong in the source document (Word, InDesign) and which can be done in Adobe Acrobat Pro after export.`
      : `2. For each failing category, give me 2–4 concrete remediation steps in Microsoft ${formatLabel} itself (start from Review → Check Accessibility) — this ${formatLabel} file is the source document, so every fix belongs there.`,
  );
```

- [ ] **Step 5: Run to verify they pass, then the full suite**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run app/__tests__/reportExportBanner.test.ts app/__tests__/ai-analysis.test.ts && npx vitest run`
Expected: PASS — the pre-existing ai-analysis tests (no `fileType` in their fixtures) still pass because `fileTypeLabel(undefined)` is "PDF" and `pageCountLine` yields "- Pages: 12".

- [ ] **Step 6: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/composables/useReportExport.ts apps/web/app/__tests__/reportExportBanner.test.ts apps/web/app/__tests__/ai-analysis.test.ts
git commit -m "feat(web): format-aware export titles, AI-analysis wording, slides/sheets counts"
```

---

### Task 9: Announcement entry + SEO copy in nuxt.config

**Files:**
- Modify: `audit.config.ts:153-165` (`ANNOUNCEMENTS` — prepend one entry)
- Modify: `apps/web/nuxt.config.ts:9` (appDesc), `:67` and `:71` (featureList), `:110` (keywords)

**Interfaces:**
- Consumes: the `ANNOUNCEMENTS` item shape rendered by `AnnouncementBanner.vue` (`id`, `badge`, `text`, `linkText`, `linkTo`, `date`, `requiresWcagVersion`) — index 0 is rendered; dismissal is per-`id`.
- Produces: copy only.

Pure-copy task: edit → verify by grep + suite run → commit.

- [ ] **Step 1: Prepend the announcement**

In `audit.config.ts`, replace:

```ts
export const ANNOUNCEMENTS = [
  {
    id: "docx-support-2026-07",
```

with:

```ts
export const ANNOUNCEMENTS = [
  {
    id: "pptx-xlsx-support-2026-07",
    badge: "New",
    text: "Now supporting Microsoft PowerPoint (.pptx) and Excel (.xlsx) files — upload a presentation or workbook for the same WCAG 2.2 AA accessibility audit as PDFs and Word documents, with findings and fix guidance tailored to each app.",
    linkText: "",
    linkTo: "",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "July 2, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "docx-support-2026-07",
```

(The existing docx entry and everything after it are untouched. If the v1.33.0 ship date moves, Phase 5's release checklist updates `date` — same field, same format as the Word entry's "July 1, 2026".)

- [ ] **Step 2: Update the SEO description**

In `apps/web/nuxt.config.ts`, replace:

```ts
const appDesc = 'Upload a PDF or Word document and get an instant accessibility score across WCAG 2.2 (and 2.1) Level AA, ADA Title II, and Illinois IITAA categories with detailed findings and remediation guidance.'
```

with:

```ts
const appDesc = 'Upload a PDF, Word, PowerPoint, or Excel document and get an instant accessibility score across WCAG 2.2 (and 2.1) Level AA, ADA Title II, and Illinois IITAA categories with detailed findings and remediation guidance.'
```

(`appDesc` feeds meta description, OG description, OG image alt, Twitter description/alt, and the JSON-LD `description` — all update together.)

- [ ] **Step 3: Update the JSON-LD featureList**

Replace:

```ts
        'PDF and Word (.docx) accessibility scoring across WCAG 2.2 Level AA categories',
```

with:

```ts
        'PDF, Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) accessibility scoring across WCAG 2.2 Level AA categories',
```

and fix the stale export bullet in the same array (the Word/.docx **export** was replaced by plain text in v1.28.0 — extending it to PowerPoint/Excel would be wrong, so correct it instead). Replace:

```ts
        'Export reports as Word, HTML, Markdown, or JSON',
```

with:

```ts
        'Export reports as text, HTML, Markdown, or JSON',
```

- [ ] **Step 4: Update the keywords meta**

Replace:

```ts
        { name: 'keywords', content: 'PDF accessibility, Word accessibility, .docx accessibility, WCAG 2.2, WCAG 2.1, ADA Title II, IITAA, Illinois Information Technology Accessibility Act, Section 508, accessibility audit, PDF checker, Word checker, screen reader, accessibility score, document remediation' },
```

with:

```ts
        { name: 'keywords', content: 'PDF accessibility, Word accessibility, .docx accessibility, PowerPoint accessibility, .pptx accessibility, Excel accessibility, .xlsx accessibility, presentation accessibility, spreadsheet accessibility, WCAG 2.2, WCAG 2.1, ADA Title II, IITAA, Illinois Information Technology Accessibility Act, Section 508, accessibility audit, PDF checker, Word checker, PowerPoint checker, Excel checker, screen reader, accessibility score, document remediation' },
```

- [ ] **Step 5: Verify by grep + suite**

Run:
```bash
grep -c "PowerPoint" /Volumes/satechi/webdev/file-accessibility-audit/apps/web/nuxt.config.ts
grep -n "pptx-xlsx-support-2026-07" /Volumes/satechi/webdev/file-accessibility-audit/audit.config.ts
cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run
```
Expected: first grep prints `4` or more; second prints the id line; suite passes. Also run `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/api && npx vitest run` — `audit.config.ts` is imported by the API, so confirm nothing there pins `ANNOUNCEMENTS[0]`.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add audit.config.ts apps/web/nuxt.config.ts
git commit -m "feat(web): announce PowerPoint + Excel support; extend SEO description/keywords"
```

---

### Task 10: technical-details page, scoring-rubric modal, audit-flow diagram

**Files:**
- Modify: `apps/web/app/pages/technical-details.vue` (lines noted per edit below)
- Modify: `apps/web/app/layouts/default.vue:47`, `:74-82`
- Modify: `scripts/generate-diagrams.mjs:88-105` (`INLINE_SOURCES["audit-flow"]`)
- Regenerate: `apps/web/app/assets/diagrams/audit-flow.svg`

**Interfaces:**
- Consumes: category facts fixed by the spec — PPTX: 9 categories incl. `slide_titles` + active `reading_order`, omits headings/forms/bookmarks; XLSX: 7 categories incl. `sheet_names`, title-only `title_language`, omits headings/reading order/lists/forms.
- Produces: copy + one regenerated SVG (`DiagramFigure name="audit-flow"` resolves it from `app/assets/diagrams/`).

Pure-copy/docs task: edit → verify by grep + script output + suite → commit.

- [ ] **Step 1: technical-details.vue — head description**

Replace:

```ts
      content:
        'How the ICJIA File Accessibility Audit tool analyzes PDF and Word (.docx) documents and remediates PDFs — pipeline diagrams, open-source toolchain, and why PDF remediation is fundamentally limited.',
```

with:

```ts
      content:
        'How the ICJIA File Accessibility Audit tool analyzes PDF, Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) documents and remediates PDFs — pipeline diagrams, open-source toolchain, and why PDF remediation is fundamentally limited.',
```

- [ ] **Step 2: §1 What this tool does**

Replace:

```html
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        The tool answers two questions about a document (PDF or Word .docx):
      </p>
```

with:

```html
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        The tool answers two questions about a document (PDF, Word .docx,
        PowerPoint .pptx, or Excel .xlsx):
      </p>
```

and replace:

```html
          <strong>Audit</strong> (PDF and Word .docx): "How accessible is this
```

with:

```html
          <strong>Audit</strong> (PDF, Word, PowerPoint, and Excel): "How accessible is this
```

- [ ] **Step 3: §2 audit-pipeline prose + diagram figure**

Replace the Word-path paragraph:

```html
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
        <strong>Word (.docx)</strong> files take a simpler, fully in-process
        route: a .docx is just a ZIP of XML, so the server unzips it in memory
        and reads the accessibility-relevant structure directly with two small
        JavaScript libraries (JSZip + fast-xml-parser) — no external binary, no
        subprocess, and no temp file at all. The extracted structure feeds the
        same scorer. Nothing is uploaded to a directory, cached, or retained in
        either path. The flowchart below shows both paths.
      </p>
```

with:

```html
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
        <strong>Word (.docx), PowerPoint (.pptx), and Excel (.xlsx)</strong>
        files take a simpler, fully in-process route: each is just a ZIP of XML
        (Office Open XML), so the server unzips it in memory and reads the
        accessibility-relevant structure directly with two small JavaScript
        libraries (JSZip + fast-xml-parser) — no external binary, no
        subprocess, and no temp file at all. The extracted structure feeds the
        same scorer. Nothing is uploaded to a directory, cached, or retained in
        either path. The flowchart below shows both paths.
      </p>
```

Replace the DiagramFigure:

```html
      <DiagramFigure
        name="audit-flow"
        title="Audit pipeline — PDF and Word"
        :desc="`The browser uploads a file; the server validates it and detects the format. A PDF gets a short-lived qpdf temp copy and is read by qpdf (structure) and pdfjs (content) in parallel; a Word .docx is unzipped in memory (JSZip) and parsed as OOXML (fast-xml-parser) with no temp file or subprocess. Both paths feed the scorer, which produces a grade, an independent WCAG ${wcag.version} conformance verdict, and category findings; the result returns to the browser and the memory buffer is discarded.`"
      />
```

with:

```html
      <DiagramFigure
        name="audit-flow"
        title="Audit pipeline — PDF, Word, PowerPoint, and Excel"
        :desc="`The browser uploads a file; the server validates it and detects the format. A PDF gets a short-lived qpdf temp copy and is read by qpdf (structure) and pdfjs (content) in parallel; a Word, PowerPoint, or Excel file is unzipped in memory (JSZip) and parsed as OOXML (fast-xml-parser) with no temp file or subprocess. Both paths feed the scorer, which produces a grade, an independent WCAG ${wcag.version} conformance verdict, and category findings; the result returns to the browser and the memory buffer is discarded.`"
      />
```

Replace the two-tools closing sentence:

```html
        both gives the scorer a richer signal than either alone. Word needs only
        one parser, because its structure (headings, alt text, table headers,
        lists) is already explicit in the OOXML — there is no separate visual
        layer to reconcile against.
```

with:

```html
        both gives the scorer a richer signal than either alone. The Office
        formats need only one parser, because their structure (headings or
        slide titles, alt text, table headers, sheet names) is already explicit
        in the OOXML — there is no separate visual layer to reconcile against.
```

- [ ] **Step 4: §2 rubric-table framing + per-format difference paragraphs**

Replace:

```html
        evaluates. The weights below are the <strong>PDF</strong> rubric; Word
        (.docx) uses the same categories with a few differences, noted after the
        table:
```

with:

```html
        evaluates. The weights below are the <strong>PDF</strong> rubric; the
        Office formats (Word, PowerPoint, Excel) use format-specific category
        sets, noted after the table:
```

Directly after the existing "**Word (.docx) differs in three ways.**" paragraph (unchanged), add:

```html
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mt-3">
        <strong>PowerPoint (.pptx) swaps in slide-centric categories.</strong>
        A <strong>Slide Titles</strong> category (2.4.2 — every slide needs a
        unique title placeholder, Microsoft's highest-severity PowerPoint rule)
        applies in place of heading structure, and
        <strong>Reading Order</strong> is actively checked (1.3.2 — the title
        should be the first shape a screen reader encounters on each slide).
        Color contrast and list structure are scored as for Word; bookmarks and
        form accessibility don't apply to presentations and are omitted.
      </p>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mt-3">
        <strong>Excel (.xlsx) is table-first.</strong> A
        <strong>Sheet Names</strong> category (no default "Sheet1" tabs on
        visible sheets) applies in place of heading structure, and
        <strong>Table Markup</strong> carries the most weight — data belongs in
        real table objects with header rows, and merged cells are flagged as
        advisories. Excel stores no document-language property, so Title &amp;
        Language scores on the title alone and the language half is reported as
        not assessed. Reading order, lists, bookmarks, and forms don't apply
        and are omitted.
      </p>
```

- [ ] **Step 5: §4 source-format primer + §8 toolchain table + related-docs card**

Replace the section heading and first paragraph:

```html
      <h3 class="text-lg font-semibold text-[var(--text-heading)] mt-6 mb-2">
        And a Word (.docx) file?
      </h3>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        A <strong>.docx is the opposite of a PDF</strong>: it is a
        <em>source</em> format, and its structure is native, not bolted on.
        Under the hood it is a ZIP archive of XML (the Office Open XML
        standard) — headings, lists, tables, alt text, and language are stored
        as explicit, semantic markup, because that is how Word represents the
        document you are editing. That is why Word is the best place to fix
        accessibility: correct it in the source, and every PDF you export from
        it inherits the structure automatically.
      </p>
```

with:

```html
      <h3 class="text-lg font-semibold text-[var(--text-heading)] mt-6 mb-2">
        And the Office formats (.docx, .pptx, .xlsx)?
      </h3>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
        <strong>Word, PowerPoint, and Excel files are the opposite of a
        PDF</strong>: they are <em>source</em> formats, and their structure is
        native, not bolted on. Under the hood each is a ZIP archive of XML (the
        Office Open XML standard) — headings, slide titles, sheet names, lists,
        tables, alt text, and language are stored as explicit, semantic markup,
        because that is how the Office apps represent the document you are
        editing. That is why the source file is the best place to fix
        accessibility: correct it there, and every PDF you export from it
        inherits the structure automatically.
      </p>
```

and in the paragraph after it, replace the two Word-specific sentences:

```html
        It also makes the audit simpler and safer for Word than for PDF — the
        tool reads structure that is already there rather than inferring it from
        glyph positions. Because a .docx is still untrusted input, the parser is
```

with:

```html
        It also makes the audit simpler and safer for the Office formats than
        for PDF — the tool reads structure that is already there rather than
        inferring it from glyph positions. Because an OOXML file is still untrusted input, the parser is
```

In the §8 toolchain table, replace the jszip and fast-xml-parser rows:

```html
              <td class="py-2.5 pr-4 font-mono">jszip</td>
              <td class="py-2.5 pr-4">Unzip the .docx (OOXML) package</td>
              <td class="py-2.5 pr-4">MIT / GPLv3</td>
              <td class="py-2.5">Audit (Word)</td>
```

with:

```html
              <td class="py-2.5 pr-4 font-mono">jszip</td>
              <td class="py-2.5 pr-4">Unzip the OOXML package (.docx / .pptx / .xlsx)</td>
              <td class="py-2.5 pr-4">MIT / GPLv3</td>
              <td class="py-2.5">Audit (Office formats)</td>
```

and:

```html
              <td class="py-2.5 pr-4 font-mono">fast-xml-parser</td>
              <td class="py-2.5 pr-4">Parse OOXML structure &amp; content</td>
              <td class="py-2.5 pr-4">MIT</td>
              <td class="py-2.5">Audit (Word)</td>
```

with:

```html
              <td class="py-2.5 pr-4 font-mono">fast-xml-parser</td>
              <td class="py-2.5 pr-4">Parse OOXML structure &amp; content</td>
              <td class="py-2.5 pr-4">MIT</td>
              <td class="py-2.5">Audit (Office formats)</td>
```

In the §9 related-documents "Audit page" card, replace:

```html
            Upload a PDF or Word document and run the audit. Full prose
```

with:

```html
            Upload a PDF, Word, PowerPoint, or Excel document and run the audit. Full prose
```

- [ ] **Step 6: Scoring-rubric modal in layouts/default.vue**

Replace the intro sentence:

```html
                      Each PDF or Word document is scored across accessibility categories based on
```

with:

```html
                      Each PDF, Word, PowerPoint, or Excel document is scored across accessibility categories based on
```

and replace the per-format differences paragraph:

```html
                    <p class="text-[var(--text-muted)] text-xs leading-relaxed">
                      The weights above are the <strong class="text-[var(--text-secondary)]">PDF</strong> rubric.
                      <strong class="text-[var(--text-secondary)]">Word (.docx)</strong> documents use the same
                      categories with three differences: color contrast <em>is</em> checked (Word stores real
                      text colors, unlike PDF), a <strong>List Structure</strong> category (real lists vs. typed
                      bullets) applies in place of PDF-only Bookmarks, and Reading Order and Form Accessibility
                      show as <strong>N/A</strong> (Word manages reading order in its linear document flow).
                      Weights are renormalized across whichever categories apply to the document.
                    </p>
```

with:

```html
                    <p class="text-[var(--text-muted)] text-xs leading-relaxed">
                      The weights above are the <strong class="text-[var(--text-secondary)]">PDF</strong> rubric.
                      <strong class="text-[var(--text-secondary)]">Word (.docx)</strong> documents use the same
                      categories with three differences: color contrast <em>is</em> checked (Word stores real
                      text colors, unlike PDF), a <strong>List Structure</strong> category (real lists vs. typed
                      bullets) applies in place of PDF-only Bookmarks, and Reading Order and Form Accessibility
                      show as <strong>N/A</strong> (Word manages reading order in its linear document flow).
                      <strong class="text-[var(--text-secondary)]">PowerPoint (.pptx)</strong> replaces heading
                      structure with a <strong>Slide Titles</strong> category (every slide needs a unique title
                      placeholder) and actively checks <strong>Reading Order</strong> (the slide title should be
                      the first shape a screen reader encounters); bookmarks and forms don't apply.
                      <strong class="text-[var(--text-secondary)]">Excel (.xlsx)</strong> replaces heading
                      structure with a <strong>Sheet Names</strong> category (no default "Sheet1" tabs), weights
                      <strong>Table Markup</strong> heaviest (real table objects with header rows; merged cells
                      are advisories), scores Title &amp; Language on the title alone (Excel stores no document
                      language), and omits reading order, lists, bookmarks, and forms.
                      Weights are renormalized across whichever categories apply to the document.
                    </p>
```

- [ ] **Step 7: Update the diagram source and regenerate the SVG**

In `scripts/generate-diagrams.mjs`, replace the `INLINE_SOURCES` entry:

```js
const INLINE_SOURCES = {
  // Audit pipeline, PDF + Word (.docx) branch. PDF fans out to the two-tool
  // (qpdf + pdfjs) path; Word runs fully in-process (JSZip + fast-xml-parser).
  "audit-flow": `flowchart TD
  U[Browser uploads file] --> V[Validate magic bytes and size]
  V --> D{PDF or Word?}
  D -->|PDF| T[Short-lived qpdf temp copy]
  T --> Q[qpdf analyzes structure]
  T --> J[pdfjs extracts content]
  D -->|Word .docx| Z[Unzip in memory with JSZip]
  Z --> X[Parse OOXML with fast-xml-parser]
  Q --> S[Scorer combines results]
  J --> S
  X --> S
  S --> G[Grade + WCAG verdict + findings]
  G --> B[Return to browser]
  B --> K[Discard memory buffer]`,
};
```

with:

```js
const INLINE_SOURCES = {
  // Audit pipeline, PDF + Office (.docx/.pptx/.xlsx) branch. PDF fans out to
  // the two-tool (qpdf + pdfjs) path; the Office formats run fully in-process
  // (JSZip + fast-xml-parser).
  "audit-flow": `flowchart TD
  U[Browser uploads file] --> V[Validate magic bytes and size]
  V --> D{PDF or Office file?}
  D -->|PDF| T[Short-lived qpdf temp copy]
  T --> Q[qpdf analyzes structure]
  T --> J[pdfjs extracts content]
  D -->|Word .docx / PowerPoint .pptx / Excel .xlsx| Z[Unzip in memory with JSZip]
  Z --> X[Parse OOXML with fast-xml-parser]
  Q --> S[Scorer combines results]
  J --> S
  X --> S
  S --> G[Grade + WCAG verdict + findings]
  G --> B[Return to browser]
  B --> K[Discard memory buffer]`,
};
```

Then regenerate (launches system Chrome via `channel: 'chrome'`; if Chrome lives elsewhere set `PUPPETEER_EXECUTABLE_PATH`):

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
node scripts/generate-diagrams.mjs
```
Expected output:
```
Rendering 1 diagrams: audit-flow
  ✓ audit-flow.svg (<N> bytes)
Done. SVGs written to apps/web/app/assets/diagrams/
```
(Only `audit-flow` renders — the other six diagrams' page-embedded sources were removed in v1.28.0 and are not in `INLINE_SOURCES`, so their SVGs are untouched.)

- [ ] **Step 8: Verify**

Run:
```bash
grep -c "PowerPoint" /Volumes/satechi/webdev/file-accessibility-audit/apps/web/app/assets/diagrams/audit-flow.svg
grep -c "PowerPoint" /Volumes/satechi/webdev/file-accessibility-audit/apps/web/app/pages/technical-details.vue
grep -c "PowerPoint" /Volumes/satechi/webdev/file-accessibility-audit/apps/web/app/layouts/default.vue
cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run
```
Expected: every grep ≥ 1 (the SVG embeds the edge-label text because the generator uses `htmlLabels: false`); web suite passes (`responsive.test.ts` layout pins — "md:hidden", nav links, etc. — are unaffected).

- [ ] **Step 9: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/pages/technical-details.vue apps/web/app/layouts/default.vue scripts/generate-diagrams.mjs apps/web/app/assets/diagrams/audit-flow.svg
git commit -m "docs(web): technical-details, rubric modal, and audit-flow diagram cover PowerPoint/Excel"
```

---

### Task 11: README feature prose

**Files:**
- Modify: `README.md` (intro line ~9, "What it does" table rows ~15 and ~21, Batch Upload section ~216-221)

Do **NOT** touch the version/tests badges, the §Security tables, the changelog section, or test counts — Phase 5's release checklist owns all release bookkeeping. Note: the README's headline prose currently reads PDF-only (it was never extended for the v1.30.0 Word release), so these edits bring it current for all four formats rather than just appending two.

- [ ] **Step 1: Update the intro line**

Replace (line ~9):

```markdown
A web tool that **audits and (optionally) remediates** PDF accessibility against [WCAG 2.2 AA](https://www.w3.org/WAI/WCAG22/quickref/)
```

with:

```markdown
A web tool that **audits** PDF, Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) accessibility — and **(optionally) auto-remediates** PDFs — against [WCAG 2.2 AA](https://www.w3.org/WAI/WCAG22/quickref/)
```

(Keep the rest of that sentence — the WCAG 2.1/IITAA/ADA links and the `WCAG_VERSION=2.1` note — exactly as is.)

- [ ] **Step 2: Update the "What it does" table**

Replace the first row:

```markdown
| **9** | WCAG categories audited | Each PDF scored across 9 accessibility categories — a weighted 0–100 score (A–F grade) plus a separate, binary pass/fail **WCAG 2.2 conformance verdict**. |
```

with:

```markdown
| **9** | WCAG categories audited | Each document (PDF, Word, PowerPoint, or Excel) scored across the WCAG-aligned categories that apply to its format (up to 9) — a weighted 0–100 score (A–F grade) plus a separate, binary pass/fail **WCAG 2.2 conformance verdict**. |
```

and the batch row:

```markdown
| **3** | PDFs per batch | Upload up to 3 PDFs at once; per-tab remediation. `POST /api/analyze-url` for programmatic auditing of public PDFs. |
```

with:

```markdown
| **3** | Files per batch | Upload up to 3 files (PDF, Word, PowerPoint, or Excel) at once; per-tab remediation for PDFs. `POST /api/analyze-url` for programmatic auditing of public PDFs. |
```

- [ ] **Step 3: Update the Batch Upload section**

Replace:

```markdown
Upload up to **3 PDF files** at once. Files are analyzed in parallel (2 at a time) and results are displayed in a tab bar — click any tab to see its full report, export, or share.
```

with:

```markdown
Upload up to **3 files** (PDF, Word, PowerPoint, or Excel) at once. Files are analyzed in parallel (2 at a time) and results are displayed in a tab bar — click any tab to see its full report, export, or share.
```

and:

```markdown
- **Drop or select multiple PDFs** — the drop zone accepts multiple files. Files are staged with a preview list before analysis begins.
```

with:

```markdown
- **Drop or select multiple files** — the drop zone accepts multiple PDF, Word, PowerPoint, or Excel files. Files are staged with a preview list before analysis begins.
```

- [ ] **Step 4: Verify by grep**

Run:
```bash
grep -n "PowerPoint" /Volumes/satechi/webdev/file-accessibility-audit/README.md | head -5
grep -n "Each PDF scored" /Volumes/satechi/webdev/file-accessibility-audit/README.md
```
Expected: first grep shows the new intro/table/batch lines; second prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add README.md
git commit -m "docs(readme): PowerPoint + Excel in feature prose"
```

---

### Task 12: Phase gate

**Files:** none (verification only; fix-forward commits if anything fails).

- [ ] **Step 1: Full build**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
pnpm build
```
Expected: `tsc --noEmit` (api) clean and `nuxt build` (web) completes with no type errors. This is the step that catches any `fileType` union mirror site missed by the runtime tests (Vitest uses esbuild and does not typecheck).

- [ ] **Step 2: Full API suite**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit/apps/api && npx vitest run
```
Expected: all API tests pass (this phase touched `audit.config.ts` only additively — the ANNOUNCEMENTS prepend).

- [ ] **Step 3: Full web suite**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && npx vitest run
```
Expected: all web tests pass, including the new files: `uploadFormats.test.ts`, `remediationGuard.test.ts`, `SourceDocumentNotice.test.ts`, `MethodologyCard.test.ts`, plus the extended `reportBanner.test.ts`, `ReportFileBanner.test.ts`, `components.test.ts`, `reportExportBanner.test.ts`, `ai-analysis.test.ts`.

- [ ] **Step 4: Manual smoke (dev servers)**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm dev
```
Then in a browser at `http://localhost:5102`: (1) the hero reads "Check your PDF, Word, PowerPoint, and Excel files for accessibility"; (2) drop a real `.pptx` — the banner reads "N slides · PowerPoint", the ScoreCard caveat names PowerPoint's Accessibility Checker, and **no Remediate button appears**; (3) drop a `.pdf` — the Remediate button appears (when `REMEDIATION_ENABLED=true`); (4) download the HTML export of the pptx result and confirm the snapshot matches the live page; (5) open `/technical-details` and confirm the regenerated audit-flow diagram shows the PDF/Word/PowerPoint/Excel branch. (Phases 2–3 committed `accessible.pptx` / `accessible.xlsx` fixtures under `apps/api/src/__tests__/fixtures/` — use those.)

- [ ] **Step 5: Do not push yet**

Phase 5 (red/blue audit + release checklist) follows. Per project rule, `pnpm build` must be green before any push, and pushing ≠ deployed (prod requires the manual droplet `./rebuild.sh`).

---

## Self-Review (performed against the spec)

- **Spec §Frontend coverage:** union mirror sites — `useReportExport.ts:37` (Task 8), `reportBanner.ts` label map + slides/sheets meta line (Task 2), `ScoreCard.vue` (Task 7), `SourceDocumentNotice.vue` (Task 5), `MethodologyCard.vue` (Task 6), `ReportFileBanner.vue` (Task 2), `ReportContent.vue:594` already `string` (no-op, documented). DropZone accept/extensions/noun on both flags (Task 3). Per-format fix-path copy (Tasks 5–7). `index.vue:278` guard → `=== 'pdf'` with regression test (Task 4). Hero/SEO/keywords/featureList + ANNOUNCEMENTS (Tasks 4, 9). technical-details + audit-flow diagram regen (Task 10). Rubric modal per-format differences (Task 10). CLI is Phases 2–3 (per master plan), release bookkeeping is Phase 5 — both out of scope here.
- **Placeholder scan:** every code step contains the complete code or the exact old→new replacement blocks; no TBDs, no "similar to Task N".
- **Type consistency:** `ReportFileType` / `FILE_TYPE_LABELS` / `fileTypeLabel(fileType?: string)` / `pageNoun(fileType?: string)` defined in Task 2 and consumed with those exact names in Task 8; `UploadFlags` / `uploadAcceptAttr` / `uploadExtensions` / `uploadNoun` / `uploadNounWithExts` defined in Task 3 and consumed in Task 4; every widened prop union uses the identical 4-value literal `'pdf' | 'docx' | 'pptx' | 'xlsx'`.
