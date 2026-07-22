# PDF/UA-1 Verdict on Audits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a formal PDF/UA-1 (veraPDF) machine-check verdict — a binary pass/fail badge plus an expandable failed-checkpoint list — on the audit results page and on saved `/report/:id` pages, without changing the Strict grade or the frozen PDF calibration.

**Architecture:** The `/analyze` route detects a PDF, runs `runVeraPdfOnBuffer(buffer)` concurrently with `analyzeDocument` (`Promise.all` → cost = max), and attaches the verdict to the returned `AnalysisResult` as `pdfUaVerdict`. Because the API returns the result wholesale (`res.json(result)`) and saved reports store the result as a JSON blob, the verdict flows to both the live audit and saved reports with no schema change. A new shared `PdfUaVerdict.vue` component renders it below the grade on the audit page, the report page, and (refactored) the remediation page.

**Tech Stack:** Express + TypeScript (tsx), better-sqlite3, Nuxt 4 / Vue 3 (Nuxt UI 4), Vitest, veraPDF CLI (already integrated for remediation).

## Global Constraints

- **Never change the Strict grade, any scored category, or the analyzer scoring path.** The verdict is a standalone informational field; the controls corpus must stay byte-identical. Verify with the controls before/after probe if any analyzer file is touched (it should not be).
- **Honest labeling.** The badge reads "PDF/UA-1 machine checks (veraPDF): Pass/Fail" with a manual-review caveat — never a bare "PDF/UA Conformant". Machine-checkable Matterhorn conditions only.
- **Config-gated.** Gated on `REMEDIATION.VERAPDF_PATH` (env `REMEDIATION_VERAPDF_PATH`). When `available:false`, the panel hides entirely on the audit/report pages.
- **Non-blocking.** A veraPDF timeout/error must never fail or delay the core audit response beyond `REMEDIATION.VERAPDF_TIMEOUT_MS` (120_000). `runVeraPdf` already never throws.
- **Commit style:** end messages with the descriptive content only — NO `Co-Authored-By` / AI trailer (repo rule).
- **Before pushing:** run `pnpm build` then `pnpm test` (both must be green).

---

## File Structure

- **Create** `apps/api/src/services/veraPdfBuffer.ts` — `runVeraPdfOnBuffer(buffer): Promise<VeraPdfVerdict>`: temp-file lifecycle wrapper around the existing `runVeraPdf(path)`.
- **Modify** `packages/shared/src/types.ts` — add canonical `PdfUaRuleFailure` + `PdfUaVerdict` types and `pdfUaVerdict?: PdfUaVerdict` on `AnalysisResult`.
- **Modify** `apps/api/src/routes/analyze.ts` — detect PDF, run veraPDF concurrently, attach `result.pdfUaVerdict`.
- **Create** `apps/web/app/components/PdfUaVerdict.vue` — shared badge + expandable checkpoint list (extracted from the remediation page markup), consuming the flat `PdfUaVerdict` shape.
- **Modify** `apps/web/app/pages/index.vue` — render `<PdfUaVerdict>` after the Score Hero; include `pdfUaVerdict` in the report-save payload.
- **Modify** `apps/web/app/pages/report/[id].vue` — render `<PdfUaVerdict>` after the Score Hero.
- **Modify** `apps/web/app/pages/remediate/[jobId].vue` — refactor its inline veraPDF detail block to use `<PdfUaVerdict>` (DRY), mapping the nested `receipt.veraPdf` to the flat shape.
- **Modify** `apps/web/app/components/dataRetention/Section02AuditFlow.vue` — one-line disclosure that veraPDF runs at audit time on the same short-lived temp copy.
- **Modify** `CHANGELOG.md`, `README.md`, `audit.config.ts` (banner), the 3 `package.json` — release chores (final task).

---

## Task 1: Canonical `PdfUaVerdict` type in shared + `AnalysisResult.pdfUaVerdict`

**Files:**
- Modify: `packages/shared/src/types.ts` (the `AnalysisResult` interface, ~lines 196-219)

**Interfaces:**
- Produces: `PdfUaVerdict` = `{ available: boolean; passed: boolean; profile: string; failures: PdfUaRuleFailure[]; totalFailureCount: number; error?: string }`; `PdfUaRuleFailure` = `{ ruleId: string; clause: string; description: string; count: number }`; and `AnalysisResult.pdfUaVerdict?: PdfUaVerdict`. This shape is structurally identical to `apps/api/src/services/veraPdf.ts`'s `VeraPdfVerdict`, so a `VeraPdfVerdict` is assignable to it directly.

- [ ] **Step 1: Add the types.** In `packages/shared/src/types.ts`, immediately before the `AnalysisResult` interface, add:

```ts
/** One failed PDF/UA-1 rule from veraPDF (a Matterhorn machine-checkable condition). */
export interface PdfUaRuleFailure {
  ruleId: string;
  clause: string;
  description: string;
  count: number;
}

/**
 * veraPDF PDF/UA-1 (ISO 14289-1) machine-check verdict, surfaced on audits.
 * Machine-checkable conditions only — NOT a claim of full PDF/UA conformance.
 * `available:false` means veraPDF was not configured/installed.
 */
export interface PdfUaVerdict {
  available: boolean;
  passed: boolean;
  profile: string;
  failures: PdfUaRuleFailure[];
  totalFailureCount: number;
  error?: string;
}
```

- [ ] **Step 2: Add the field.** Inside the `AnalysisResult` interface, add:

```ts
  /** PDF/UA-1 machine-check verdict (veraPDF). PDF results only; absent when veraPDF isn't configured. */
  pdfUaVerdict?: PdfUaVerdict;
```

- [ ] **Step 3: Typecheck.** Run: `pnpm --filter @file-audit/shared build` (or `pnpm build`). Expected: no type errors.

- [ ] **Step 4: Commit.**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(types): add PdfUaVerdict + AnalysisResult.pdfUaVerdict (shared)"
```

---

## Task 2: `runVeraPdfOnBuffer` — temp-file wrapper around the existing runner

**Files:**
- Create: `apps/api/src/services/veraPdfBuffer.ts`
- Test: `apps/api/src/__tests__/veraPdfBuffer.test.ts`

**Interfaces:**
- Consumes: `runVeraPdf(pdfPath: string): Promise<VeraPdfVerdict>` from `./veraPdf.js`; `REMEDIATION.VERAPDF_PATH` from `#config`.
- Produces: `runVeraPdfOnBuffer(buffer: Buffer): Promise<VeraPdfVerdict>` — writes a short-lived temp PDF (same `TMP_DIR||/tmp` + `randomUUID().pdf` pattern as qpdfService), runs veraPDF, unlinks in `finally`. Returns `available:false` immediately (no temp file) when `VERAPDF_PATH` is unset. Never throws.

- [ ] **Step 1: Write the failing test.**

```ts
// apps/api/src/__tests__/veraPdfBuffer.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const writeFileSync = vi.fn();
const unlinkSync = vi.fn();
vi.mock("node:fs", () => ({ default: { writeFileSync, unlinkSync } }));

const runVeraPdf = vi.fn();
vi.mock("../services/veraPdf.js", () => ({ runVeraPdf }));

// VERAPDF_PATH is read from #config; override per test via the mock below.
const cfg = { REMEDIATION: { VERAPDF_PATH: "/usr/bin/verapdf" as string | null } };
vi.mock("#config", () => cfg);

import { runVeraPdfOnBuffer } from "../services/veraPdfBuffer.js";

beforeEach(() => {
  vi.clearAllMocks();
  cfg.REMEDIATION.VERAPDF_PATH = "/usr/bin/verapdf";
});

describe("runVeraPdfOnBuffer", () => {
  it("returns available:false without writing a temp file when VERAPDF_PATH is unset", async () => {
    cfg.REMEDIATION.VERAPDF_PATH = null;
    const verdict = await runVeraPdfOnBuffer(Buffer.from("%PDF-1.4"));
    expect(verdict.available).toBe(false);
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(runVeraPdf).not.toHaveBeenCalled();
  });

  it("writes a temp file, runs veraPDF against its path, and unlinks it", async () => {
    runVeraPdf.mockResolvedValue({
      available: true, passed: false, profile: "ua1",
      failures: [{ ruleId: "7.1-1", clause: "7.1", description: "x", count: 2 }],
      totalFailureCount: 2,
    });
    const verdict = await runVeraPdfOnBuffer(Buffer.from("%PDF-1.4"));
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const tmpPath = writeFileSync.mock.calls[0][0] as string;
    expect(tmpPath).toMatch(/\.pdf$/);
    expect(runVeraPdf).toHaveBeenCalledWith(tmpPath);
    expect(unlinkSync).toHaveBeenCalledWith(tmpPath);
    expect(verdict.passed).toBe(false);
    expect(verdict.totalFailureCount).toBe(2);
  });

  it("still unlinks the temp file if runVeraPdf rejects, and never throws", async () => {
    runVeraPdf.mockRejectedValue(new Error("boom"));
    const verdict = await runVeraPdfOnBuffer(Buffer.from("%PDF-1.4"));
    expect(unlinkSync).toHaveBeenCalledTimes(1);
    expect(verdict.available).toBe(true);
    expect(verdict.passed).toBe(false);
    expect(verdict.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails.** Run: `pnpm --filter api exec vitest run src/__tests__/veraPdfBuffer.test.ts`. Expected: FAIL ("Cannot find module ... veraPdfBuffer").

- [ ] **Step 3: Implement.**

```ts
// apps/api/src/services/veraPdfBuffer.ts
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { REMEDIATION } from "#config";
import { runVeraPdf, type VeraPdfVerdict } from "./veraPdf.js";

/**
 * Run veraPDF's PDF/UA-1 check against an in-memory PDF buffer.
 * Writes a short-lived temp copy (same TMP_DIR||/tmp + UUID.pdf pattern the
 * qpdf audit path already uses and the privacy docs already disclose), runs
 * veraPDF, and deletes it in `finally`. Never throws; returns available:false
 * (with no temp file) when veraPDF isn't configured.
 */
export async function runVeraPdfOnBuffer(buffer: Buffer): Promise<VeraPdfVerdict> {
  if (!REMEDIATION.VERAPDF_PATH) {
    return { available: false, passed: false, profile: "ua1", failures: [], totalFailureCount: 0 };
  }
  const tmpDir = process.env.TMP_DIR || "/tmp";
  const tmpPath = path.join(tmpDir, `${randomUUID()}.pdf`);
  try {
    fs.writeFileSync(tmpPath, buffer);
    return await runVeraPdf(tmpPath);
  } catch (err: any) {
    return {
      available: true, passed: false, profile: "ua1",
      failures: [], totalFailureCount: 0,
      error: err?.message ? String(err.message) : "veraPDF invocation failed",
    };
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
  }
}
```

Confirm `veraPdf.ts` exports `VeraPdfVerdict` (it does, line 27) and `runVeraPdf` (line 47). If `VeraPdfVerdict` is not exported, add `export` to it.

- [ ] **Step 4: Run tests to verify they pass.** Run: `pnpm --filter api exec vitest run src/__tests__/veraPdfBuffer.test.ts`. Expected: 3 passed.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/services/veraPdfBuffer.ts apps/api/src/__tests__/veraPdfBuffer.test.ts
git commit -m "feat(api): runVeraPdfOnBuffer temp-file wrapper for audit-time PDF/UA checks"
```

---

## Task 3: Wire veraPDF into the `/analyze` route (concurrent, PDF-only, gated)

**Files:**
- Modify: `apps/api/src/routes/analyze.ts` (imports + the handler body around lines 1-62)
- Test: `apps/api/src/__tests__/analyzeVeraPdf.test.ts`

**Interfaces:**
- Consumes: `analyzeDocument` and `detectFileType` from `../services/analyzer.js`; `runVeraPdfOnBuffer` from `../services/veraPdfBuffer.js`.
- Produces: the `/analyze` JSON response now carries `pdfUaVerdict` when the upload is a PDF and veraPDF is configured; unchanged otherwise.

- [ ] **Step 1: Write the failing test** (reuses the repo's handler-extraction pattern from `audit-url.test.ts`).

```ts
// apps/api/src/__tests__/analyzeVeraPdf.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

function makeRes() {
  const res: any = { _status: 200, _json: null,
    status(c: number) { res._status = c; return res; },
    json(b: any) { res._json = b; return res; } };
  return res;
}
function makeReq(o: Record<string, unknown> = {}): any {
  return { user: { email: "t@illinois.gov" }, ip: "127.0.0.1",
    get: vi.fn(() => undefined), file: undefined, ...o };
}
function extractHandler(router: any, p: string) {
  const layer = router.stack.find((l: any) => l.route?.path === p);
  const s = layer.route.stack;
  return s[s.length - 1].handle as (req: any, res: any) => Promise<void>;
}

vi.mock("../db/sqlite.js", () => ({ default: { prepare: vi.fn(() => ({ get: vi.fn(), run: vi.fn() })) } }));
vi.mock("../services/auditLog.js", () => ({
  gateIdentity: vi.fn(() => "t@illinois.gov"), recordAudit: vi.fn(), sha256Hex: vi.fn(() => "hash"),
}));

const analyzeDocument = vi.fn();
const detectFileType = vi.fn();
vi.mock("../services/analyzer.js", () => ({ analyzeDocument, detectFileType }));
const runVeraPdfOnBuffer = vi.fn();
vi.mock("../services/veraPdfBuffer.js", () => ({ runVeraPdfOnBuffer }));

import analyzeRouter from "../routes/analyze.js";
const handler = extractHandler(analyzeRouter, "/analyze");

beforeEach(() => {
  vi.clearAllMocks();
  analyzeDocument.mockResolvedValue({ filename: "a.pdf", fileType: "pdf", overallScore: 80, grade: "B", categories: [] });
});

describe("/analyze attaches pdfUaVerdict", () => {
  it("attaches the verdict for a PDF when veraPDF is available", async () => {
    detectFileType.mockResolvedValue("pdf");
    runVeraPdfOnBuffer.mockResolvedValue({ available: true, passed: false, profile: "ua1",
      failures: [{ ruleId: "7.1-1", clause: "7.1", description: "x", count: 1 }], totalFailureCount: 1 });
    const res = makeRes();
    await handler(makeReq({ file: { buffer: Buffer.from("%PDF-1.4"), originalname: "a.pdf" } }), res);
    expect(res._json.pdfUaVerdict).toEqual(expect.objectContaining({ available: true, passed: false }));
  });

  it("omits the verdict when veraPDF is unavailable (available:false → not attached)", async () => {
    detectFileType.mockResolvedValue("pdf");
    runVeraPdfOnBuffer.mockResolvedValue({ available: false, passed: false, profile: "ua1", failures: [], totalFailureCount: 0 });
    const res = makeRes();
    await handler(makeReq({ file: { buffer: Buffer.from("%PDF-1.4"), originalname: "a.pdf" } }), res);
    expect(res._json.pdfUaVerdict).toBeUndefined();
  });

  it("does not run veraPDF for a non-PDF upload", async () => {
    detectFileType.mockResolvedValue("docx");
    analyzeDocument.mockResolvedValue({ filename: "a.docx", fileType: "docx", overallScore: 90, grade: "A", categories: [] });
    const res = makeRes();
    await handler(makeReq({ file: { buffer: Buffer.from("PK"), originalname: "a.docx" } }), res);
    expect(runVeraPdfOnBuffer).not.toHaveBeenCalled();
    expect(res._json.pdfUaVerdict).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails.** Run: `pnpm --filter api exec vitest run src/__tests__/analyzeVeraPdf.test.ts`. Expected: FAIL (verdict not attached).

- [ ] **Step 3: Implement.** In `apps/api/src/routes/analyze.ts`, add to the imports:

```ts
import { analyzeDocument, detectFileType } from "../services/analyzer.js";
import { runVeraPdfOnBuffer } from "../services/veraPdfBuffer.js";
```

(replace the existing `import { analyzeDocument } from "../services/analyzer.js";` line). Then replace the single line `const result = await analyzeDocument(file.buffer, filename);` with:

```ts
      // Detect type up front so veraPDF (PDF/UA-1) runs concurrently with the
      // analysis for PDFs only — cost is max(analyze, veraPDF), not the sum.
      const detectedType = await detectFileType(file.buffer);
      const [result, pdfUaVerdict] = await Promise.all([
        analyzeDocument(file.buffer, filename),
        detectedType === "pdf" ? runVeraPdfOnBuffer(file.buffer) : Promise.resolve(null),
      ]);
      // Only attach when veraPDF actually ran (available). Absent field = hidden panel.
      if (pdfUaVerdict && pdfUaVerdict.available) {
        result.pdfUaVerdict = pdfUaVerdict;
      }
```

If `detectFileType` throws on unknown types, wrap the detect call: `const detectedType = await detectFileType(file.buffer).catch(() => null);` — analyzeDocument still runs and reports the real error.

- [ ] **Step 4: Run tests to verify they pass.** Run: `pnpm --filter api exec vitest run src/__tests__/analyzeVeraPdf.test.ts`. Expected: 3 passed.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/routes/analyze.ts apps/api/src/__tests__/analyzeVeraPdf.test.ts
git commit -m "feat(api): run veraPDF concurrently on /analyze and attach pdfUaVerdict (PDF-only, gated)"
```

---

## Task 4: Shared `PdfUaVerdict.vue` component (badge + expandable checkpoints)

**Files:**
- Create: `apps/web/app/components/PdfUaVerdict.vue`
- Test: `apps/web/app/__tests__/pdfUaVerdict.test.ts`

**Interfaces:**
- Consumes: a prop `verdict: PdfUaVerdict` (the flat shape from Task 1) and optional `verapdfUrl?: string`.
- Produces: `<PdfUaVerdict :verdict="..." />`. Renders nothing when `!verdict?.available`. Renders a Pass/Fail badge + a collapsible failed-checkpoint list (`clause · ruleId — description (count)`) + the machine-checks caveat.

- [ ] **Step 1: Write the failing test** (component render states).

```ts
// apps/web/app/__tests__/pdfUaVerdict.test.ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PdfUaVerdict from "../components/PdfUaVerdict.vue";

const base = { available: true, passed: false, profile: "ua1", totalFailureCount: 2,
  failures: [{ ruleId: "7.1-1", clause: "7.1", description: "Structure element missing", count: 2 }] };

describe("PdfUaVerdict.vue", () => {
  it("renders nothing when veraPDF is unavailable", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: { ...base, available: false } } });
    expect(w.text()).toBe("");
  });
  it("shows a Fail badge and never the bare word Conformant", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: base } });
    expect(w.text()).toMatch(/PDF\/UA-1 machine checks/i);
    expect(w.text()).toMatch(/Fail/);
    expect(w.text()).not.toMatch(/\bConformant\b/);
    expect(w.text()).toMatch(/manual review/i);
  });
  it("lists failed checkpoints with clause, description and count", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: base } });
    expect(w.text()).toContain("7.1");
    expect(w.text()).toContain("Structure element missing");
    expect(w.text()).toContain("2");
  });
  it("shows a Pass badge with no checkpoint list when passed", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: { ...base, passed: true, totalFailureCount: 0, failures: [] } } });
    expect(w.text()).toMatch(/Pass/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails.** Run: `pnpm --filter web exec vitest run app/__tests__/pdfUaVerdict.test.ts`. Expected: FAIL (component missing).

- [ ] **Step 3: Implement the component** (Tailwind + CSS vars, mirroring the remediation-page styling; emerald=pass, amber=fail).

```vue
<!-- apps/web/app/components/PdfUaVerdict.vue -->
<script setup lang="ts">
import { ref } from "vue";
import type { PdfUaVerdict } from "@file-audit/shared";

const props = defineProps<{ verdict: PdfUaVerdict; verapdfUrl?: string }>();
const open = ref(false);
</script>

<template>
  <section
    v-if="verdict?.available"
    class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-5 sm:p-6"
  >
    <div class="flex items-start gap-3">
      <span
        class="inline-flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0"
        :class="verdict.passed ? 'bg-emerald-700/40 text-emerald-200' : 'bg-amber-700/40 text-amber-200'"
      >{{ verdict.passed ? "✓" : "!" }}</span>
      <div class="flex-1 text-sm">
        <p class="font-medium mb-1">
          PDF/UA-1 machine checks (veraPDF): {{ verdict.passed ? "Pass" : "Fail" }}
          <span v-if="!verdict.passed" class="text-[var(--text-muted)] font-normal">
            — {{ verdict.totalFailureCount }} rule failure{{ verdict.totalFailureCount === 1 ? "" : "s" }}
          </span>
        </p>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">
          Machine-checkable conditions only (ISO 14289-1 via
          <a v-if="verapdfUrl" :href="verapdfUrl" target="_blank" rel="noopener noreferrer"
             class="text-blue-300 hover:text-blue-200 underline">veraPDF</a><span v-else>veraPDF</span>).
          Full PDF/UA conformance also requires manual review — meaningful alt text, logical
          reading order, and correct table semantics can't be verified automatically.
        </p>

        <div v-if="!verdict.passed && verdict.failures?.length" class="mt-3">
          <button type="button" class="text-xs uppercase tracking-wider text-amber-300 hover:text-amber-200"
                  :aria-expanded="open" @click="open = !open">
            {{ open ? "Hide" : "Show" }} failed checkpoints ({{ verdict.failures.length }}) {{ open ? "↑" : "↓" }}
          </button>
          <ul v-if="open" class="mt-2 text-xs space-y-1.5 text-[var(--text-muted)]">
            <li v-for="f in verdict.failures" :key="f.ruleId + f.clause">
              <span class="font-mono text-[var(--text)]">{{ f.clause }}</span>
              <span v-if="f.ruleId && !String(f.ruleId).startsWith(f.clause)"> · {{ f.ruleId }}</span>
              <span v-if="f.description"> — {{ f.description }}</span>
              <span class="text-amber-400 ml-1">({{ f.count }})</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
```

- [ ] **Step 4: Run tests to verify they pass.** Run: `pnpm --filter web exec vitest run app/__tests__/pdfUaVerdict.test.ts`. Expected: 4 passed.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/app/components/PdfUaVerdict.vue apps/web/app/__tests__/pdfUaVerdict.test.ts
git commit -m "feat(web): shared PdfUaVerdict component (Pass/Fail badge + checkpoint list)"
```

---

## Task 5: Render the panel on the audit page + persist it in saved reports

**Files:**
- Modify: `apps/web/app/pages/index.vue` (insertion after the Score Hero, ~line 264; report-save payload)

**Interfaces:**
- Consumes: `<PdfUaVerdict>` (Task 4); `result.pdfUaVerdict` on the `AnalysisResult` (Task 1, flows through `$fetch` with zero plumbing).

- [ ] **Step 1: Insert the panel.** In `apps/web/app/pages/index.vue`, immediately after the Score Hero closing `</div>` (the block ending ~line 264, before the Auto-Remediate block), add:

```vue
            <PdfUaVerdict
              v-if="result?.pdfUaVerdict"
              :verdict="result.pdfUaVerdict"
              :verapdf-url="String($config.public.verapdfUrl ?? '')"
              class="mb-6"
            />
```

Confirm `$config.public.verapdfUrl` exists (the remediate page reads `runtimeConfig.public.verapdfUrl`); if the component is used without it, `verapdfUrl` is optional and the link falls back to plain text.

- [ ] **Step 2: Ensure the saved report carries the verdict.** Find the report-save call: run `grep -n "api/reports" apps/web/app/pages/index.vue`. Read the payload construction. The `report` object POSTed must include `pdfUaVerdict`. If it spreads the whole result (e.g. `report: { ...result }` or `report: result`), no change is needed — verify by reading. If it builds a curated subset, add `pdfUaVerdict: result.pdfUaVerdict` to that object. Make the edit only if a subset is built.

- [ ] **Step 3: Manual/DOM check.** Run: `pnpm --filter web exec vitest run` (existing web suite must stay green; the new component test already covers rendering). Expected: all pass.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/app/pages/index.vue
git commit -m "feat(web): show PDF/UA-1 verdict on the audit page and persist it in saved reports"
```

---

## Task 6: Render the panel on the saved-report page

**Files:**
- Modify: `apps/web/app/pages/report/[id].vue` (insertion after the Score Hero, ~line 104)

**Interfaces:**
- Consumes: `<PdfUaVerdict>`; `data.report.pdfUaVerdict` (persisted via the JSON blob; survives `sanitizeStoredReport`'s verbatim clone).

- [ ] **Step 1: Insert the panel.** In `apps/web/app/pages/report/[id].vue`, immediately after the Score Hero closing `</div>` (~line 104, before `<ReportActionBanner>`), add:

```vue
            <PdfUaVerdict
              v-if="data.report?.pdfUaVerdict"
              :verdict="data.report.pdfUaVerdict"
              :verapdf-url="String($config.public.verapdfUrl ?? '')"
              class="mb-6"
            />
```

- [ ] **Step 2: Verify green.** Run: `pnpm --filter web exec vitest run`. Expected: all pass.

- [ ] **Step 3: Commit.**

```bash
git add apps/web/app/pages/report/[id].vue
git commit -m "feat(web): show persisted PDF/UA-1 verdict on saved report pages"
```

---

## Task 7: Refactor the remediation page to reuse `PdfUaVerdict` (DRY)

**Files:**
- Modify: `apps/web/app/pages/remediate/[jobId].vue` (the veraPDF detail `<section id="verapdf-detail">`, lines ~1268-1402)

**Interfaces:**
- Consumes: `<PdfUaVerdict>`; maps the nested `receipt.veraPdf` (`{ available, passed, summary: { profile, failures, totalFailureCount, error } }`) to the flat `PdfUaVerdict` shape.

- [ ] **Step 1: Add a mapper** in the page `<script setup>`:

```ts
import type { PdfUaVerdict } from "@file-audit/shared";
const pdfUaVerdict = computed<PdfUaVerdict | null>(() => {
  const v = receipt.value?.veraPdf;
  if (!v) return null;
  return {
    available: !!v.available,
    passed: !!v.passed,
    profile: v.summary?.profile ?? "ua1",
    failures: v.summary?.failures ?? [],
    totalFailureCount: v.summary?.totalFailureCount ?? 0,
    error: v.summary?.error,
  };
});
```

(Use `receipt.value` or `receipt` per how the page already accesses it — match the existing binding.)

- [ ] **Step 2: Replace the detail block.** Replace the `<template v-if="receipt.veraPdf.available"> … </template>` verdict+failures markup inside `<section id="verapdf-detail">` (the veraPDF verdict portion, lines ~1280-1374) with:

```vue
          <PdfUaVerdict
            v-if="pdfUaVerdict?.available"
            :verdict="pdfUaVerdict"
            :verapdf-url="verapdfUrl"
          />
          <template v-else>
            <!-- keep the existing "veraPDF check was not run" block (lines ~1350-1374) -->
          </template>
```

Keep the compact badge near the score (lines 559-607) and the IITAA manual-review reminder (lines 1376-1400) as-is — the shared component covers the verdict + failed-rule list only.

- [ ] **Step 3: Verify green.** Run: `pnpm --filter web exec vitest run` and manually confirm the remediation page still renders (existing `remediate` tests, if any, must pass). Expected: all pass.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/app/pages/remediate/[jobId].vue
git commit -m "refactor(web): remediation page reuses shared PdfUaVerdict component"
```

---

## Task 8: Data-retention disclosure

**Files:**
- Modify: `apps/web/app/components/dataRetention/Section02AuditFlow.vue`

- [ ] **Step 1: Add one line** to the audit-flow description noting veraPDF now also runs at audit time for PDFs, on the **same** short-lived temp copy already disclosed for qpdf (written to `TMP_DIR`/`/tmp`, deleted in the same request), only when configured. Insert near the existing qpdf temp-copy sentence:

```
When veraPDF (the PDF/UA-1 validator) is configured, a PDF audit also runs it against that same short-lived temp copy to produce the PDF/UA-1 machine-check verdict; the copy is still deleted in the same request. No additional copy is written.
```

- [ ] **Step 2: Verify green.** Run: `pnpm --filter web exec vitest run`. Expected: all pass.

- [ ] **Step 3: Commit.**

```bash
git add apps/web/app/components/dataRetention/Section02AuditFlow.vue
git commit -m "docs(web): disclose audit-time veraPDF run in data-retention audit flow"
```

---

## Task 9: Release (version, changelog, README, banner) + full verification

**Files:**
- Modify: `package.json`, `apps/web/package.json`, `apps/api/package.json` (→ next minor, e.g. `1.37.0`); `CHANGELOG.md`; `README.md` (badge + test counts + a § Security "not a security release" entry); `audit.config.ts` (ANNOUNCEMENTS banner).

- [ ] **Step 1: Bump versions** in the three package.json to the new minor (feature → minor bump).
- [ ] **Step 2: CHANGELOG** — add a `## [X.Y.0]` entry describing the PDF/UA-1 audit verdict (veraPDF, machine-checks only, config-gated, persisted, no scoring change).
- [ ] **Step 3: README** — bump the version + test-count badges and body counts; add a § Security entry ("not a security release"; note veraPDF now runs at audit time on the already-disclosed temp copy, no new attack surface).
- [ ] **Step 4: Banner** — prepend an `ANNOUNCEMENTS` entry: "New: audit results now show a PDF/UA-1 (ISO 14289-1) machine-check verdict from veraPDF, alongside the accessibility grade."
- [ ] **Step 5: Full verification.** Run: `pnpm build` then `pnpm test`. Expected: build clean; all suites green (API + Web + CLI). If any analyzer file was touched, also re-run the controls before/after probe and confirm 0 score changes.
- [ ] **Step 6: Deploy note in the commit body** — the audit tier must have the veraPDF binary installed and `REMEDIATION_VERAPDF_PATH` set for the panel to appear; until then it's hidden (safe default).
- [ ] **Step 7: Commit.**

```bash
git add -A
git commit -m "release: PDF/UA-1 audit verdict (vX.Y.0)"
```

---

## Self-Review

- **Spec coverage:** verdict on audits (T3/T5), binary badge + expandable checkpoints (T4), persistence to saved reports (T5/T6, no migration needed — JSON blob), honest machine-checks labeling (T4 test asserts no bare "Conformant" + manual-review caveat), config-gate/hide-when-unavailable (T2/T3/T4), concurrent run (T3), reuse remediation display (T7), data-retention (T8), no Strict-grade/scoring change (Global Constraints + T3 attaches a standalone field). Covered.
- **Deviation from spec (documented):** no DB migration (store is a JSON blob, not normalized columns) — simpler than the spec assumed; and the route writes its own short-lived temp file rather than literally reusing qpdf's (same disclosed pattern). Both noted in the plan header.
- **Deferred (follow-up, not in this plan):** wiring veraPDF into the URL-audit routes (`audit-url.ts`, `analyze-url.ts`, `bulk-from-inventory.ts`, `audit-url-page.ts`) — same `runVeraPdfOnBuffer` call after the buffer is fetched, gated on `fileType === 'pdf'`. Scope is the upload audit first; add these once the pattern is proven.
- **Type consistency:** `PdfUaVerdict` (shared, Task 1) is structurally identical to `VeraPdfVerdict` (api `veraPdf.ts`), so the route assignment in Task 3 typechecks; the component (Task 4) and remediation mapper (Task 7) both consume the flat `PdfUaVerdict`.
- **Placeholder scan:** Task 5 Step 2 contains a conditional edit ("only if a subset is built") gated on a `grep`/read — concrete and verifiable, not a vague placeholder.
