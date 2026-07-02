# Structural Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the six approved items from the 2026-07-02 structural review: fix the rubric-weight drift bug, extract a shared `ReportContent` component, extract `services/urlPolicy.ts`, create `packages/shared` (types + browser-safe scoring constants), delete dead code, and test the remediation subsystem.

**Architecture:** A new `packages/shared` workspace package becomes the single home for scoring constants and report-payload types; `audit.config.ts` re-exports them so all `#config` consumers are untouched. The web app's duplicated report subtree collapses into one `ReportContent.vue`. The API's URL/SSRF policy moves from a route file into a service so tests can import the real functions.

**Tech Stack:** pnpm workspaces, Express + tsx (API), Nuxt 4 + Nuxt UI 4 (web), better-sqlite3, Vitest (API: node env; web: happy-dom + @vue/test-utils).

## Global Constraints

- **Never add `Co-Authored-By` or any AI attribution trailer to commits** (user's global rule; overrides all defaults).
- Run `pnpm build` (tsc --noEmit for api + nuxt build for web) before declaring any task complete that touches TS — Vitest uses esbuild and misses tsc errors.
- **PDF scoring behavior must not change**: strict-profile outputs stay byte-identical; the `scoreProfiles.remediation` **alias emission in `scoreDocument` stays** (documented back-compat for stored shared reports). Only *unreachable* code is removed.
- Keep `SCORING_PROFILES.remediation` in the config object and the `ScoringMode` union — removing them changes `keyof typeof SCORING_PROFILES` and breaks the payload alias typing.
- The HTML-export snapshot depends on: the `[data-report-content]` wrapper staying in **both pages** (component renders inside it), `:aria-expanded` on the Basic/Advanced pill, and `data-export-exclude` markers. Preserve all three.
- The `catColor` grade-color map must stay **inside the function body** in any `<script setup>` (prod SSR regression, commit `0f39c96`). Keep the explaining comment.
- Do NOT reconcile `apps/web/app/utils/wcag.ts`'s criteria lists with `WCAG_CATEGORY_MAP` — they intentionally(?) differ (e.g. `text_extractability`: config says 1.1.1+1.3.1, web says 1.3.1+1.4.5). That is a content/policy decision for the maintainer; flag it, don't change it.
- Node >= 22; all commands from repo root `/Volumes/satechi/webdev/file-accessibility-audit` unless stated.
- Work on branch `refactor/structural-review-fixes` (create from `main` at start).

---

### Task 1: Fix the Scoring Rubric weight drift (user-facing bug)

The engine's strict profile (`audit.config.ts:317,346`) weights `bookmarks: 0.05` and `reading_order: 0.10`. The Scoring Rubric modal shows the opposite (Bookmarks 10, Reading Order 5). Swap the two numbers and re-order the rows so the table stays sorted by weight. Task 3 later makes these values *derived* so this class of drift becomes impossible; this task ships the user-facing fix immediately.

**Files:**
- Modify: `apps/web/app/layouts/default.vue:307-317` (the `rubricCategories` array)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing relied on by later tasks (Task 3 rewrites this block).

- [ ] **Step 1: Create the working branch**

```bash
git checkout -b refactor/structural-review-fixes
```

- [ ] **Step 2: Apply the fix**

In `apps/web/app/layouts/default.vue`, inside `rubricCategories`:
1. On the `bookmarks` entry change `weight: 10` → `weight: 5`.
2. On the `reading_order` entry change `weight: 5` → `weight: 10`.
3. Re-order entries so the array stays weight-descending: move the `reading_order` entry up to sit immediately after `alt_text` (next to `table_markup`, both 10), and move `bookmarks` down next to `link_quality` / `form_accessibility` (all 5). Do not change any `label`/`rationale` text.

- [ ] **Step 3: Verify existing web tests still pass**

Run: `pnpm --filter web test`
Expected: PASS (same counts as before — no test pins these literals).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/layouts/default.vue
git commit -m "fix(web): correct Scoring Rubric weights for Bookmarks/Reading Order

The rubric modal showed Bookmarks 10% / Reading Order 5%, but the engine's
strict profile (audit.config.ts) weights them 5% / 10%. The modal now matches
the engine. Derivation from the config lands in the packages/shared refactor."
```

---

### Task 2: Extract `services/urlPolicy.ts` and make the SSRF tests real

`routes/analyze-url.ts:11-175` doubles as the URL/SSRF-policy module; three sibling routes import from it, and the route tests re-implement `isAllowedUrl` and test the copy. Move the policy block verbatim into `services/urlPolicy.ts`, rewire the four routes, add an honest unit-test file for the real exports, and delete the re-implementations from the three route test files.

**Files:**
- Create: `apps/api/src/services/urlPolicy.ts`
- Create: `apps/api/src/__tests__/urlPolicy.test.ts`
- Modify: `apps/api/src/routes/analyze-url.ts` (delete lines 11-175, import from the new service)
- Modify: `apps/api/src/routes/audit-url.ts:9-16`, `apps/api/src/routes/audit-url-page.ts:8`, `apps/api/src/routes/bulk-from-inventory.ts:8` (import path swap)
- Modify: `apps/api/src/__tests__/analyze-url.test.ts`, `audit-url.test.ts`, `bulk-from-inventory.test.ts` (remove local re-implementations, import real functions)

**Interfaces:**
- Produces: `services/urlPolicy.ts` exporting `MAX_PDF_BYTES: number`, `FETCH_TIMEOUT_MS: number`, `isAllowedUrl(rawUrl: string): { ok: boolean; reason?: string; parsed?: URL }`, `sendSafeFetchError(res: Response, err: SafeFetchError): void`, `validateUrlForFetch(u: URL): void`, `validateUrlPublic(u: URL): void`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/urlPolicy.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isAllowedUrl,
  validateUrlForFetch,
  validateUrlPublic,
  sendSafeFetchError,
  MAX_PDF_BYTES,
  FETCH_TIMEOUT_MS,
} from '../services/urlPolicy.js'
import { SafeFetchError } from '../services/safeFetch.js'
import { ANALYSIS } from '#config'

// These tests exercise the REAL policy module — the previous route tests
// re-implemented isAllowedUrl locally and validated a copy that could drift.

describe('urlPolicy constants', () => {
  it('caps URL fetches at the direct-upload size', () => {
    expect(MAX_PDF_BYTES).toBe(ANALYSIS.MAX_FILE_SIZE_MB * 1024 * 1024)
  })
  it('uses a 30s fetch timeout', () => {
    expect(FETCH_TIMEOUT_MS).toBe(30_000)
  })
})

describe('isAllowedUrl', () => {
  it('rejects malformed URLs', () => {
    expect(isAllowedUrl('not a url').ok).toBe(false)
    expect(isAllowedUrl('not a url').reason).toContain('malformed')
  })

  it('rejects non-http(s) schemes', () => {
    expect(isAllowedUrl('ftp://icjia.illinois.gov/x.pdf').ok).toBe(false)
    expect(isAllowedUrl('file:///etc/passwd').ok).toBe(false)
  })

  it('rejects private/local hostnames (SSRF)', () => {
    for (const host of [
      'http://localhost/x.pdf',
      'http://127.0.0.1/x.pdf',
      'http://0.0.0.0/x.pdf',
      'http://[::1]/x.pdf',
      'http://foo.local/x.pdf',
      'http://svc.internal/x.pdf',
      'http://10.1.2.3/x.pdf',
      'http://192.168.1.1/x.pdf',
      'http://172.16.0.1/x.pdf',
      'http://172.31.255.255/x.pdf',
      'http://169.254.169.254/latest/meta-data',
    ]) {
      const r = isAllowedUrl(host)
      expect(r.ok, host).toBe(false)
      expect(r.reason, host).toContain('not allowed')
    }
  })

  it('allows allowlisted hosts and their subdomains', () => {
    expect(isAllowedUrl('https://illinois.gov/a.pdf').ok).toBe(true)
    expect(isAllowedUrl('https://icjia.illinois.gov/a.pdf').ok).toBe(true)
    expect(isAllowedUrl('https://dvfr.icjia-api.cloud/a.pdf').ok).toBe(true)
    expect(isAllowedUrl('https://audit.icjia.app/a.pdf').ok).toBe(true)
  })

  it('rejects lookalike suffixes (no substring matching)', () => {
    // evil-illinois.gov must NOT match the 'illinois.gov' entry
    expect(isAllowedUrl('https://evil-illinois.gov/a.pdf').ok).toBe(false)
    expect(isAllowedUrl('https://notillinois.gov/a.pdf').ok).toBe(false)
  })

  it('rejects hosts not on the allowlist', () => {
    const r = isAllowedUrl('https://example.com/a.pdf')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('allowlist')
  })

  describe('ANALYZE_URL_ALLOWED_HOSTS env extension', () => {
    const OLD = process.env.ANALYZE_URL_ALLOWED_HOSTS
    beforeEach(() => {
      process.env.ANALYZE_URL_ALLOWED_HOSTS = 'example.org, foo.example.net'
    })
    afterEach(() => {
      if (OLD === undefined) delete process.env.ANALYZE_URL_ALLOWED_HOSTS
      else process.env.ANALYZE_URL_ALLOWED_HOSTS = OLD
    })

    it('honors operator-added hosts at call time', () => {
      expect(isAllowedUrl('https://example.org/a.pdf').ok).toBe(true)
      expect(isAllowedUrl('https://sub.example.org/a.pdf').ok).toBe(true)
      expect(isAllowedUrl('https://foo.example.net/a.pdf').ok).toBe(true)
      expect(isAllowedUrl('https://example.net/a.pdf').ok).toBe(false)
    })
  })
})

describe('validateUrlForFetch', () => {
  it('throws SafeFetchError(malformed_url) for a disallowed host', () => {
    expect(() => validateUrlForFetch(new URL('https://example.com/a.pdf')))
      .toThrowError(SafeFetchError)
  })
  it('passes for an allowlisted host', () => {
    expect(() => validateUrlForFetch(new URL('https://illinois.gov/a.pdf')))
      .not.toThrow()
  })
})

describe('validateUrlPublic (privileged)', () => {
  it('allows any public http(s) URL', () => {
    expect(() => validateUrlPublic(new URL('https://example.com/a.pdf')))
      .not.toThrow()
  })
  it('still rejects non-http(s) schemes', () => {
    expect(() => validateUrlPublic(new URL('ftp://example.com/a.pdf')))
      .toThrowError(SafeFetchError)
  })
})

describe('sendSafeFetchError status mapping', () => {
  function mockRes() {
    const res: any = {
      statusCode: 0,
      body: null,
      status(c: number) { this.statusCode = c; return this },
      json(b: unknown) { this.body = b; return this },
    }
    return res
  }

  const cases: Array<[string, number]> = [
    ['malformed_url', 400],
    ['redirect_invalid', 400],
    ['private_ip', 400],
    ['oversized', 413],
    ['timeout', 504],
    ['too_many_redirects', 502],
    ['redirect_loop', 502],
    ['dns_failed', 502],
    ['network_error', 502],
  ]

  it.each(cases)('%s → HTTP %i', (code, status) => {
    const res = mockRes()
    sendSafeFetchError(res, new SafeFetchError(code as any, 'boom'))
    expect(res.statusCode).toBe(status)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api exec vitest run src/__tests__/urlPolicy.test.ts`
Expected: FAIL — cannot resolve `../services/urlPolicy.js`.

- [ ] **Step 3: Create `apps/api/src/services/urlPolicy.ts`**

Move lines 11-175 of `routes/analyze-url.ts` **verbatim** (the two exported constants, the allowlist comment block, `DEFAULT_ALLOWED_HOSTS`, `getAllowedHosts`, `isAllowedUrl`, `sendSafeFetchError`, `validateUrlForFetch`, `validateUrlPublic` — including every comment) into the new file, prefixed with this header and imports:

```ts
/**
 * URL / SSRF policy for every URL-fetch audit path (analyze-url, audit-url,
 * audit-url-page, bulk-from-inventory). Extracted from routes/analyze-url.ts
 * so it can be imported — and unit-tested — without dragging in the router,
 * auth middleware, and DB singleton. The route files are thin adapters over
 * these functions; safeFetch re-validates via validateUrlForFetch on every
 * redirect hop.
 */
import type { Response } from 'express'
import { SafeFetchError } from './safeFetch.js'
import { ANALYSIS } from '#config'
```

(`sendSafeFetchError`'s `Response` type comes from the `import type` above; nothing else changes.)

- [ ] **Step 4: Rewire the four routes**

1. `routes/analyze-url.ts`: delete the moved lines 11-175; add to its imports:
   ```ts
   import {
     MAX_PDF_BYTES,
     FETCH_TIMEOUT_MS,
     sendSafeFetchError,
     validateUrlForFetch,
     validateUrlPublic,
   } from '../services/urlPolicy.js'
   ```
   Remove now-unused imports from its header if any (check: `SafeFetchError` is still used in the handler's `catch` — keep it; `ANALYSIS` becomes unused — remove it).
2. `routes/audit-url.ts`: change `from './analyze-url.js'` → `from '../services/urlPolicy.js'` (line 16's import block).
3. `routes/audit-url-page.ts:8`: `import { isAllowedUrl } from '../services/urlPolicy.js'`.
4. `routes/bulk-from-inventory.ts:8`: `import { validateUrlForFetch } from '../services/urlPolicy.js'`.

Verification: `grep -rn "from './analyze-url" apps/api/src/routes/` → no matches.

- [ ] **Step 5: Run the new test to verify it passes**

Run: `pnpm --filter api exec vitest run src/__tests__/urlPolicy.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Delete the re-implementations from the three route test files**

In `analyze-url.test.ts`, `audit-url.test.ts`, `bulk-from-inventory.test.ts`: locate every locally re-declared copy of `DEFAULT_ALLOWED_HOSTS`, `isAllowedUrl`, `getAllowedHosts`, or `validateUrlForFetch` (in `analyze-url.test.ts` it's the block at ~lines 40-66 with the stale comment about `#config` not resolving). Replace each local declaration with an import of the real function from `../services/urlPolicy.js`, keeping the files' existing assertions. Delete the stale "resolving #config alias not available in vitest" comments. If an assertion in those files duplicates one now in `urlPolicy.test.ts` verbatim, delete the duplicate rather than keep two copies.

Verification: `grep -rn "function isAllowedUrl\|const DEFAULT_ALLOWED_HOSTS" apps/api/src/__tests__/` → no matches.

- [ ] **Step 7: Run the full API suite + build**

Run: `pnpm --filter api test && pnpm --filter api build`
Expected: all tests PASS; tsc clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/urlPolicy.ts apps/api/src/routes/ apps/api/src/__tests__/
git commit -m "refactor(api): extract URL/SSRF policy into services/urlPolicy.ts

routes/analyze-url.ts doubled as the URL-policy module — three sibling routes
imported the allowlist helpers from it, and because importing a route drags in
the router/auth/db chain, the route tests re-implemented isAllowedUrl and
asserted against a copy. The policy now lives in services/urlPolicy.ts, all
four routes import it, and urlPolicy.test.ts exercises the real exports
(allowlist + subdomain matching, private-host SSRF rejection, env extension,
privileged validator, SafeFetchError status mapping)."
```

---

### Task 3: Create `packages/shared` and point web at it

Move the four pure scoring constants out of `audit.config.ts` into a browser-safe workspace package, re-export them from `audit.config.ts` (so every `#config` consumer is untouched), move the report-payload types out of `scorer.ts` the same way, and replace the web app's hand-forked constants with imports.

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/src/index.ts`, `packages/shared/src/scoring.ts`, `packages/shared/src/types.ts`
- Modify: `pnpm-workspace.yaml`, root `package.json`, `apps/api/package.json`, `apps/web/package.json`
- Modify: `audit.config.ts` (remove the four constant blocks, re-export from the package)
- Modify: `apps/api/src/services/scorer.ts` (types move out, re-export)
- Modify: `apps/web/nuxt.config.ts` (transpile entry)
- Modify: `apps/web/app/utils/scoringProfiles.ts`, `apps/web/app/layouts/default.vue`, `apps/web/app/components/ScoreCard.vue`, `apps/web/app/composables/useReportExport.ts`, `apps/web/app/composables/useRemediationJob.ts`
- Test: `apps/web/app/__tests__/shared-constants.test.ts`

**Interfaces:**
- Produces (package `@file-audit/shared`, all from `src/index.ts`):
  - Constants: `SCORING_PROFILES`, `SCORING_WEIGHTS`, `GRADE_THRESHOLDS`, `SEVERITY_THRESHOLDS`, `WCAG_CATEGORY_MAP` (moved verbatim from `audit.config.ts`).
  - Derived: `GRADE_COLORS: Record<string, string>`, `SEVERITY_COLORS: Record<string, string>`, `gradeForScore(score: number | null): string | null`, `severityForScore(score: number | null): string | null`, `gradeColor(grade: string | null | undefined): string`, `severityColor(severity: string | null | undefined): string`.
  - Types: `ScoringMode`, `HelpLink`, `WcagCriterion`, `CategoryResult`, `ScoreProfileResult` (moved from `scorer.ts`).
- Task 4 consumes `CategoryResult`, `ScoringMode`, `GRADE_COLORS`, `SEVERITY_COLORS` in the new component.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/shared-constants.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SCORING_PROFILES,
  GRADE_THRESHOLDS,
  SEVERITY_THRESHOLDS,
  GRADE_COLORS,
  SEVERITY_COLORS,
  gradeForScore,
  severityForScore,
  WCAG_CATEGORY_MAP,
} from "@file-audit/shared";

// Proves the web app can import the engine's real scoring constants —
// the drift-proof replacement for the hand-copied rubric/colors.

describe("@file-audit/shared scoring constants", () => {
  it("strict profile weights sum to 1.0", () => {
    const sum = Object.values(SCORING_PROFILES.strict.weights).reduce(
      (a, b) => a + b,
      0,
    );
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("bookmarks is 5% and reading_order is 10% in strict (the drift bug)", () => {
    expect(SCORING_PROFILES.strict.weights.bookmarks).toBe(0.05);
    expect(SCORING_PROFILES.strict.weights.reading_order).toBe(0.1);
  });

  it("grade thresholds are descending and colors derive from them", () => {
    const mins = GRADE_THRESHOLDS.map((t) => t.min);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
    expect(GRADE_COLORS.A).toBe("#22c55e");
    expect(GRADE_COLORS.F).toBe("#ef4444");
  });

  it("gradeForScore / severityForScore follow the thresholds", () => {
    expect(gradeForScore(90)).toBe("A");
    expect(gradeForScore(89)).toBe("B");
    expect(gradeForScore(0)).toBe("F");
    expect(gradeForScore(null)).toBeNull();
    expect(severityForScore(100)).toBe("No issues found");
    expect(severityForScore(99)).toBe("Minor");
    expect(severityForScore(69)).toBe("Moderate");
    expect(severityForScore(39)).toBe("Critical");
    expect(severityForScore(null)).toBeNull();
  });

  it("severity colors cover both UI labels and API labels", () => {
    expect(SEVERITY_COLORS.Pass).toBe("#22c55e");
    expect(SEVERITY_COLORS["No issues found"]).toBe("#22c55e");
    expect(SEVERITY_COLORS.Minor).toBe("#3b82f6");
    expect(SEVERITY_COLORS.Moderate).toBe("#eab308");
    expect(SEVERITY_COLORS.Critical).toBe("#ef4444");
  });

  it("every positively-weighted strict category has a WCAG map entry", () => {
    // pdf_ua_compliance and color_contrast carry weight 0 in strict;
    // pdf_ua_compliance deliberately has no WCAG mapping.
    const weightedKeys = Object.entries(SCORING_PROFILES.strict.weights)
      .filter(([, w]) => w > 0)
      .map(([k]) => k);
    for (const k of weightedKeys) {
      expect(WCAG_CATEGORY_MAP[k], k).toBeDefined();
    }
    expect(WCAG_CATEGORY_MAP.list_structure).toBeDefined(); // DOCX-only category
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run app/__tests__/shared-constants.test.ts`
Expected: FAIL — cannot resolve `@file-audit/shared`.

- [ ] **Step 3: Create the package skeleton**

`packages/shared/package.json`:

```json
{
  "name": "@file-audit/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Browser-safe scoring constants and report-payload types shared by api, web, and cli. No Node APIs, no process.env — pure data and pure functions only.",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}
```

`packages/shared/src/index.ts`:

```ts
export * from "./scoring.js";
export * from "./types.js";
```

`pnpm-workspace.yaml` becomes:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Add `"@file-audit/shared": "workspace:*"` to `dependencies` in **root** `package.json` (create the `dependencies` key — root currently has only `devDependencies`; the root-level `audit.config.ts` imports the package at runtime under tsx), and to `dependencies` in `apps/api/package.json` and `apps/web/package.json`. Then run `pnpm install`.

- [ ] **Step 4: Create `packages/shared/src/scoring.ts`**

Move these blocks **verbatim, comments included,** from `audit.config.ts` (current line refs): `SCORING_PROFILES` (285-373), `SCORING_WEIGHTS` (374), `GRADE_THRESHOLDS` (390-401 incl. its comment banner from 376), `SEVERITY_THRESHOLDS` (403-426 region incl. banner), `WCAG_CATEGORY_MAP` (445-487 incl. banner). Then append the derived section:

```ts
// ---------------------------------------------------------------------------
// DERIVED HELPERS (single home for grade/severity → label/color logic that
// was previously hand-copied across the web app)
// ---------------------------------------------------------------------------

export type ScoringMode = keyof typeof SCORING_PROFILES;

/** Grade letter → hex color, derived from GRADE_THRESHOLDS. */
export const GRADE_COLORS: Record<string, string> = Object.fromEntries(
  GRADE_THRESHOLDS.map((t) => [t.grade, t.color]),
);

/**
 * Severity label → hex color. Includes both the API label for a perfect
 * category ("No issues found") and the UI legend label ("Pass") — the two
 * render identically.
 */
export const SEVERITY_COLORS: Record<string, string> = {
  Pass: "#22c55e",
  "No issues found": "#22c55e",
  Minor: "#3b82f6",
  Moderate: "#eab308",
  Critical: "#ef4444",
};

export function gradeForScore(score: number | null): string | null {
  if (score === null) return null;
  for (const t of GRADE_THRESHOLDS) {
    if (score >= t.min) return t.grade;
  }
  return "F";
}

export function severityForScore(score: number | null): string | null {
  if (score === null) return null;
  for (const t of SEVERITY_THRESHOLDS) {
    if (score >= t.min) return t.severity;
  }
  return "Critical";
}

export function gradeColor(grade: string | null | undefined): string {
  return (grade && GRADE_COLORS[grade]) || "#666";
}

export function severityColor(severity: string | null | undefined): string {
  return (severity && SEVERITY_COLORS[severity]) || "#999";
}
```

In `audit.config.ts`, replace the five removed blocks with a re-export (placed where `SCORING_PROFILES` used to start, keeping a pointer comment):

```ts
// ---------------------------------------------------------------------------
// SCORING PROFILES / GRADE / SEVERITY / WCAG MAP — moved to packages/shared
// ---------------------------------------------------------------------------
// These are pure, browser-safe data consumed by the web UI as well as the
// API scorer, so they live in @file-audit/shared (packages/shared/src/
// scoring.ts). Re-exported here so every existing `#config` import keeps
// working unchanged. Edit them THERE.
// ---------------------------------------------------------------------------
export {
  SCORING_PROFILES,
  SCORING_WEIGHTS,
  GRADE_THRESHOLDS,
  SEVERITY_THRESHOLDS,
  WCAG_CATEGORY_MAP,
} from "@file-audit/shared";
```

- [ ] **Step 5: Create `packages/shared/src/types.ts` and slim `scorer.ts`**

Move **verbatim** from `apps/api/src/services/scorer.ts`: `HelpLink` (27-30), `WcagCriterion` (32-38), `CategoryResult` (40-62, incl. the notAssessed/wcagCriteria doc comments), and `ScoreProfileResult` (117-137). Prepend to types.ts:

```ts
import type { ScoringMode } from "./scoring.js";
```

(`ScoreProfileResult.mode: ScoringMode` now refers to the shared union.)

In `scorer.ts`:
1. Delete the four moved declarations.
2. Delete line 115 (`export type ScoringMode = keyof typeof SCORING_PROFILES;`).
3. Add to the top imports:
   ```ts
   import type {
     CategoryResult,
     HelpLink,
     WcagCriterion,
     ScoreProfileResult,
     ScoringMode,
   } from "@file-audit/shared";
   export type {
     CategoryResult,
     HelpLink,
     WcagCriterion,
     ScoreProfileResult,
     ScoringMode,
   };
   ```
   (The re-export keeps `apps/cli` — which imports `CategoryResult` from `scorer.js` — and every internal `./scorer.js` type import working unchanged.)

- [ ] **Step 6: Verify api + cli still typecheck and pass**

Run: `pnpm --filter api build && pnpm --filter api test`
Expected: tsc clean, all tests PASS (constants are identical objects re-exported; no behavior change).
Also run: `cd apps/cli && pnpm build && cd ../..` (tsup bundles the analyzer; confirms the CLI's relative imports still resolve).

- [ ] **Step 7: Point the web app at the package**

1. `apps/web/nuxt.config.ts`: add `'@file-audit/shared'` to `build.transpile` (create `build: { transpile: ['@file-audit/shared'] }` if no `build` key exists).
2. `apps/web/app/utils/scoringProfiles.ts`: delete the hardcoded `gradeForScore`/`severityForScore` bodies (lines 30-45) and the local `ScoringMode` type (line 11); replace with:
   ```ts
   import {
     gradeForScore,
     severityForScore,
     type ScoringMode,
   } from "@file-audit/shared";
   export { gradeForScore, severityForScore };
   export type { ScoringMode };
   ```
   Keep `ScoredCategoryLike`, `ScoreProfile`, and `categoriesForScoringMode` (deliberately lite view types) unchanged, including the v1.21.0 explainer comment.
3. `apps/web/app/layouts/default.vue`: replace the `rubricCategories` literal weights and the `grades` literal with derived values:
   ```ts
   import {
     SCORING_PROFILES,
     GRADE_THRESHOLDS,
     SEVERITY_COLORS,
   } from '@file-audit/shared'

   // Weights come straight from the engine's strict profile so this modal
   // can never drift from how documents are actually scored (it did once:
   // bookmarks/reading_order were swapped for several releases).
   const strictWeights = SCORING_PROFILES.strict.weights
   const rubricCategories = [
     { id: 'text_extractability', label: 'Text Extractability', rationale: /* keep existing text */ },
     // ... keep all nine entries with their existing label + rationale text,
     // but DELETE every `weight:` property ...
   ]
     .map((c) => ({
       ...c,
       weight: Math.round(
         (strictWeights[c.id as keyof typeof strictWeights] ?? 0) * 100,
       ),
     }))
     .filter((c) => c.weight > 0)
     .sort((a, b) => b.weight - a.weight)

   const grades = GRADE_THRESHOLDS.map((t, i) => ({
     grade: t.grade,
     min: t.min,
     max: i === 0 ? 100 : GRADE_THRESHOLDS[i - 1].min - 1,
     color: t.color,
   }))
   ```
   In the `severities` legend array, replace each hex literal with `SEVERITY_COLORS.Pass`, `SEVERITY_COLORS.Minor`, `SEVERITY_COLORS.Moderate`, `SEVERITY_COLORS.Critical` (descriptions unchanged).
4. `apps/web/app/components/ScoreCard.vue`: replace the `gradeMap` literal (lines 271-277) with:
   ```ts
   import { GRADE_THRESHOLDS } from "@file-audit/shared";
   const gradeMap: Record<string, { color: string; label: string }> =
     Object.fromEntries(
       GRADE_THRESHOLDS.map((t) => [t.grade, { color: t.color, label: t.label }]),
     );
   ```
5. `apps/web/app/composables/useReportExport.ts`: in `buildHtml`, replace the `gc`/`sc` closure map literals (lines ~629-648) with:
   ```ts
   import { gradeColor, severityColor } from "@file-audit/shared";
   // inside buildHtml:
   const gc = (grade: string) => gradeColor(grade);
   const sc = (sev: string | null) => severityColor(sev);
   ```
   (Add the import at the top of the file; keep the call sites unchanged.)
6. `apps/web/app/composables/useRemediationJob.ts`: delete the local `export interface CategoryResult` (lines 54-62) and replace with `export type { CategoryResult } from "@file-audit/shared";` — `AuditResultLite` keeps referencing `CategoryResult` and existing importers keep working. (The full type's required `findings`/`explanation`/`weight`/`helpLinks` fields are always present in stored audit JSON; if tsc flags a call site constructing a partial literal, widen that literal, not the type.)

- [ ] **Step 8: Run the new test and both suites, then build**

Run: `pnpm --filter web exec vitest run app/__tests__/shared-constants.test.ts`
Expected: PASS.
Run: `pnpm test && pnpm build`
Expected: API + web suites PASS; both builds clean. (If the Nuxt build fails resolving the package, confirm the `build.transpile` entry and that `pnpm install` ran after the workspace change.)

- [ ] **Step 9: Commit**

```bash
git add packages/ pnpm-workspace.yaml package.json pnpm-lock.yaml audit.config.ts \
  apps/api/package.json apps/api/src/services/scorer.ts \
  apps/web/package.json apps/web/nuxt.config.ts apps/web/app/
git commit -m "feat(shared): packages/shared — one home for scoring constants and report types

Moves SCORING_PROFILES, SCORING_WEIGHTS, GRADE_THRESHOLDS, SEVERITY_THRESHOLDS,
and WCAG_CATEGORY_MAP out of audit.config.ts into @file-audit/shared (re-exported
from audit.config.ts so every #config consumer is untouched), and moves the
report-payload types (CategoryResult, HelpLink, WcagCriterion, ScoreProfileResult,
ScoringMode) out of scorer.ts the same way. The web app now derives the Scoring
Rubric weights, grade table, and every grade/severity color from the package
instead of hand-copied literals (the copies had already drifted once), and
useRemediationJob re-exports the real CategoryResult instead of a lossy subset."
```

---

### Task 4: Extract `<ReportContent>` and delete the dead components

Collapse the duplicated Score Table / Document Metadata / Detailed Findings / Not-Included-in-Scoring subtree (index.vue 307-860 ≈ report/[id].vue 149-691) into one component, test-first. Then delete `CategoryRow.vue` (256 lines, zero consumers, but pinned by mount tests) and `AdobeParityCard.vue` (492 lines, zero consumers, zero tests), porting the dead tests' assertions to the live component.

**Files:**
- Create: `apps/web/app/components/ReportContent.vue`
- Test: `apps/web/app/__tests__/report-content.test.ts`
- Modify: `apps/web/app/pages/index.vue`, `apps/web/app/pages/report/[id].vue`
- Delete: `apps/web/app/components/CategoryRow.vue`, `apps/web/app/components/AdobeParityCard.vue`
- Modify: `apps/web/app/__tests__/components.test.ts`, `accessibility.test.ts`, `color-mode.test.ts`, `responsive.test.ts`, `scoring-display.test.ts`

**Interfaces:**
- Consumes: `CategoryResult`, `ScoringMode`, `gradeColor`, `severityColor` from `@file-audit/shared` (Task 3); `partitionCardFindings`, `isGuidanceFinding` from `~/utils/findings`; `naReason` from `~/utils/modeDivergence`; `categoriesForScoringMode` from `~/utils/scoringProfiles`; `useWcag`; `NaCell` component.
- Produces: `<ReportContent :result="reportLike" />` where `result` needs `categories`, and optionally `scoreProfiles`, `pdfMetadata`, `fileType`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/report-content.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReportContent from "../components/ReportContent.vue";
import { GRADE_COLORS } from "@file-audit/shared";

// Behavioral coverage for the shared report subtree (Score Table, Document
// Metadata, Detailed Findings, Not Included in Scoring). Replaces the old
// CategoryRow.vue tests, which pinned a component the app never rendered.

function cat(over: Record<string, unknown> = {}) {
  return {
    id: "heading_structure",
    label: "Heading Structure",
    weight: 0.15,
    score: 85,
    grade: "B",
    severity: "Minor",
    findings: ["Found 12 headings with logical hierarchy"],
    explanation: "Headings create a navigable outline.",
    helpLinks: [{ label: "WCAG 1.3.1", url: "https://example.org" }],
    ...over,
  };
}

function mountReport(categories: unknown[], extra: Record<string, unknown> = {}) {
  return mount(ReportContent, {
    props: { result: { categories, ...extra } },
    global: { stubs: { NaCell: true, AppTooltip: true } },
  });
}

describe("ReportContent — score table", () => {
  it("renders one row per scored category with the grade color", () => {
    const wrapper = mountReport([
      cat(),
      cat({ id: "alt_text", label: "Alt Text on Images", score: 95, grade: "A", severity: "Minor" }),
    ]);
    const html = wrapper.html();
    expect(html).toContain("Heading Structure");
    expect(html).toContain("Alt Text on Images");
    expect(html).toContain(GRADE_COLORS.B);
    expect(html).toContain(GRADE_COLORS.A);
  });

  it("splits N/A categories into the Not Included in Scoring section", () => {
    const wrapper = mountReport([
      cat(),
      cat({ id: "forms", label: "Form Fields", score: null, grade: null, severity: null }),
    ]);
    expect(wrapper.html()).toContain("Not Included in Scoring");
    // the N/A category must not appear in the scored table body
    const scoredTable = wrapper.find("table");
    expect(scoredTable.html()).not.toContain("Form Fields");
  });

  it("omits the Not Included section when every category is scored", () => {
    const wrapper = mountReport([cat()]);
    expect(wrapper.html()).not.toContain("Not Included in Scoring");
  });
});

describe("ReportContent — detailed findings", () => {
  it("renders findings only for scored categories", () => {
    const wrapper = mountReport([
      cat(),
      cat({ id: "forms", label: "Form Fields", score: null, grade: null, severity: null, findings: ["should not render"] }),
    ]);
    expect(wrapper.html()).toContain("Found 12 headings");
    expect(wrapper.html()).not.toContain("should not render");
  });

  it("keeps the aria-expanded technical-signals toggle (export snapshot contract)", () => {
    const wrapper = mountReport([
      cat({
        findings: [
          "Found 12 headings with logical hierarchy",
          "--- Technical signals ---",
          "  StructTree depth 4",
        ],
      }),
    ]);
    expect(wrapper.html()).toContain("aria-expanded");
  });
});

describe("ReportContent — document metadata", () => {
  it("renders the metadata card when pdfMetadata is present", () => {
    const wrapper = mountReport([cat()], {
      pdfMetadata: {
        creator: "Word",
        producer: "Acrobat Distiller",
        pdfVersion: "1.7",
        pageCount: 12,
        author: "A",
        subject: null,
        keywords: null,
        creationDate: null,
        modDate: null,
        isEncrypted: false,
      },
    });
    expect(wrapper.html()).toContain("Document Metadata");
    expect(wrapper.html()).toContain("Acrobat Distiller");
  });

  it("omits the metadata card without pdfMetadata", () => {
    const wrapper = mountReport([cat()]);
    expect(wrapper.html()).not.toContain("Document Metadata");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run app/__tests__/report-content.test.ts`
Expected: FAIL — cannot resolve `../components/ReportContent.vue`.

- [ ] **Step 3: Create `apps/web/app/components/ReportContent.vue`**

**Template:** cut from `apps/web/app/pages/report/[id].vue` — the block starting at the `<!-- Score Table -->` comment (line 149) through the closing `</div>` of the Not-Included-in-Scoring section (line 691, i.e. everything **before** the `</div>` + `<!-- /report content -->` pair). Use the REPORT page's version (it carries the `px-2 sm:px-3` responsive-padding fix the live page never got). Wrap in a single `<template><div> ... </div></template>` root. Then inside the new component template replace every `(data as any).report.` and `data.report.` with `result.` and verify: `grep -c "data" apps/web/app/components/ReportContent.vue` → only hits inside `data-export-exclude`/`data-report-content` attribute names (no `data.report` refs).

**Script** (`<script setup lang="ts">`):

```ts
import { computed, reactive } from "vue";
import {
  gradeColor,
  severityColor,
  type CategoryResult,
  type ScoringMode,
} from "@file-audit/shared";
import { categoriesForScoringMode } from "~/utils/scoringProfiles";
import { partitionCardFindings, isGuidanceFinding } from "~/utils/findings";
import { naReason } from "~/utils/modeDivergence";

/**
 * The shared report subtree: Score Table, Document Metadata, Detailed
 * Findings, and Not Included in Scoring. Rendered identically by the live
 * audit page (index.vue) and the shared-report page (report/[id].vue) —
 * extracted because the two copies had already drifted and caused a
 * production 500 (see catColor below). Renders INSIDE each page's
 * [data-report-content] wrapper so the HTML-export snapshot is unchanged.
 */
interface ReportLike {
  categories: CategoryResult[];
  scoreProfiles?: Partial<
    Record<
      ScoringMode,
      {
        categories?: CategoryResult[];
        categoryScores?: Record<string, number | null>;
      }
    >
  >;
  pdfMetadata?: {
    creator?: string | null;
    producer?: string | null;
    pdfVersion?: string | null;
    pageCount?: number | null;
    author?: string | null;
    subject?: string | null;
    keywords?: string | null;
    creationDate?: string | null;
    modDate?: string | null;
    isEncrypted?: boolean;
  } | null;
  fileType?: string;
}

const props = defineProps<{ result: ReportLike }>();

const wcag = useWcag();

const displayedCategories = computed(() =>
  categoriesForScoringMode(
    props.result.categories,
    props.result.scoreProfiles,
    "strict",
  ),
);

const scoredCategories = computed(() =>
  displayedCategories.value.filter((c) => c.score !== null),
);
const naCategories = computed(() =>
  displayedCategories.value.filter((c) => c.score === null),
);
const hasAnyNaRow = computed(
  () =>
    naCategories.value.length > 0 ||
    scoredCategories.value.some((c) => c.score === null),
);

// Per-category expand state for the Basic/Advanced technical-signals pill.
// The pill carries :aria-expanded — the HTML-export snapshot clicks every
// [aria-expanded="false"] to fully expand before cloning. Don't remove it.
const advancedCards = reactive<Record<string, boolean>>({});
function toggleAdvanced(catId: string): void {
  advancedCards[catId] = !advancedCards[catId];
}

function formatMetaDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const metadataItems = computed(() => {
  const m = props.result.pdfMetadata;
  if (!m) return [];
  return [
    { label: "Source Application", value: m.creator },
    { label: "PDF Producer", value: m.producer },
    { label: "PDF Version", value: m.pdfVersion },
    { label: "Page Count", value: m.pageCount?.toString() },
    { label: "Author", value: m.author },
    { label: "Subject", value: m.subject },
    { label: "Keywords", value: m.keywords },
    { label: "Created", value: formatMetaDate(m.creationDate) },
    { label: "Last Modified", value: formatMetaDate(m.modDate) },
    { label: "Encrypted", value: m.isEncrypted ? "Yes" : "No" },
  ];
});

function catColor(cat: { grade?: string | null }): string {
  // Keep the lookup INSIDE the function. A top-level <script setup> const
  // got dropped from catColor's scope in the production SSR build (only
  // catColor is referenced by the template), throwing "ReferenceError" —
  // a 500 on every report page. Regressed before; see commit 0f39c96.
  // gradeColor is a module import, which the compiler preserves, but the
  // call stays wrapped here so the template contract has one name.
  if (cat.grade) return gradeColor(cat.grade);
  return "#555";
}

function sevColor(severity: string): string {
  return severityColor(severity);
}

function isAcrobatHeading(finding: string): boolean {
  return (
    finding.startsWith("---") && finding.toLowerCase().includes("adobe acrobat")
  );
}

function findingIcon(cat: { score: number | null }): string {
  if (cat.score === null) return "–";
  if (cat.score >= 90) return "✓";
  if (cat.score >= 70) return "•";
  return "✗";
}

function findingIconStyle(cat: { score: number | null }): Record<string, string> {
  if (cat.score === null) return { color: "var(--icon-na)" };
  if (cat.score >= 90) return { color: "var(--icon-pass)" };
  if (cat.score >= 70) return { color: "var(--icon-info)" };
  if (cat.score >= 40) return { color: "var(--icon-na)" };
  return { color: "var(--icon-fail)" };
}
```

Note the **dead cluster is deliberately not carried over**: `isAdvancedFinding`, `hasAdvancedFindings`, `filteredFindings`, `splitAcrobatGuide` (the template migrated to `partitionCardFindings` long ago). If the template errors on a missing binding not listed above, the report page's script (lines 930-1066) is the source of truth — move that one definition in, adapting `data.report` → `props.result`.

- [ ] **Step 4: Run the component test until green**

Run: `pnpm --filter web exec vitest run app/__tests__/report-content.test.ts`
Expected: PASS. Iterate on missing bindings/imports until it does.

- [ ] **Step 5: Rewire both pages**

1. `apps/web/app/pages/report/[id].vue`: replace the cut block (149-691) with:
   ```html
   <ReportContent :result="(data as any).report" />
   ```
   Then delete from its script (930-1066): `displayedCategories`, `scoredCategories`, `naCategories`, `hasAnyNaRow`, `formatMetaDate`, `metadataItems`, `catColor`, `sevColor`, `isAdvancedFinding`, `hasAdvancedFindings`, `toggleAdvanced`, `filteredFindings`, `isGuidanceFinding`, `isAcrobatHeading`, `splitAcrobatGuide`, `findingIcon`, `findingIconStyle`, and the `advancedCards` reactive + `categoriesForScoringMode` import if now unused. **Keep** `formatDate` (used by the page header) and everything else.
2. `apps/web/app/pages/index.vue`: replace its copy of the block (307-860, from `<!-- Score Table -->` to the `</div>` before the `data-report-content` closer) with:
   ```html
   <ReportContent :result="result" />
   ```
   Then delete the same helper cluster from its script: lines 3959-3966 (`displayedCategories`) and 4180-4305 (`scoredCategories` through `findingIconStyle`, including the top-level `gradeColors` const and the dead `isAdvancedFinding`/`hasAdvancedFindings`/`filteredFindings`/`splitAcrobatGuide`), plus `advancedCards`/`toggleAdvanced` (3924, 4256) and the `wcag = useWcag()` binding **only if** unreferenced elsewhere in the page.
3. For every deleted identifier run a guard grep before deleting, e.g.:
   ```bash
   grep -n "scoredCategories\|naCategories\|metadataItems\|catColor\|sevColor\|findingIcon\|advancedCards\|displayedCategories" apps/web/app/pages/index.vue
   ```
   Expected after edits: zero hits. Repeat for `report/[id].vue`.

- [ ] **Step 6: Delete the dead components and rewire their tests**

1. `git rm apps/web/app/components/AdobeParityCard.vue apps/web/app/components/CategoryRow.vue`
2. `components.test.ts`: delete the `import CategoryRow...` (line 7) and the whole `describe("CategoryRow", ...)` block (lines ~267 to just before `describe("ProcessingOverlay"...)` at 404).
3. `scoring-display.test.ts`: delete the `import CategoryRow` (line 8) and every `it`/`describe` that mounts `CategoryRow` (the grade-color cases ~67-99, the N/A cases ~224-301, and any severity-badge cases mounting it). Equivalent behavior is now covered by `report-content.test.ts`. Keep all ScoreCard-based tests.
4. `responsive.test.ts`: delete the `import CategoryRow` (line 8), the `describe("Responsive — CategoryRow", ...)` block (~104-157 incl. the `readSource("components/CategoryRow.vue")` case).
5. `accessibility.test.ts`: delete the `import CategoryRow` (line 9) and the `describe('CategoryRow Accessibility', ...)` block (~286+); in the source-scan file list (line 153) replace `'components/CategoryRow.vue'` with `'components/ReportContent.vue'`.
6. `color-mode.test.ts`: in its scanned-file list (line 207) replace `'components/CategoryRow.vue'` with `'components/ReportContent.vue'`.
7. Verification: `grep -rn "CategoryRow\|AdobeParityCard" apps/web/app` → zero hits.

- [ ] **Step 7: Full web suite + build**

Run: `pnpm --filter web test && pnpm build`
Expected: PASS / clean. The source-scan suites (contrast, color-mode, responsive) now scan `ReportContent.vue` — fix any real violations they surface (the markup is unchanged, so expect none).

- [ ] **Step 8: In-browser parity check (live page, shared page, HTML export)**

```bash
pnpm dev   # api :5103, web :5102 — leave running in background
# audit a real control fixture through the API:
curl -s -F "file=@controls/ILHEALSFallWinter2022FINAL.pdf" http://localhost:5103/api/analyze -o /tmp/audit.json
```

Then in a browser (chrome-devtools MCP or manual): open `http://localhost:5102`, upload the same PDF, confirm the Score Table / Metadata / Findings / Not-Included sections render as before; use Share to create `/report/:id` and confirm the shared page matches; download the HTML export and confirm it still snapshots fully expanded with no dead toggle pills (the v1.31.1 contract).

- [ ] **Step 9: Commit**

```bash
git add -A apps/web/app
git commit -m "refactor(web): extract ReportContent — one report subtree for live + shared pages

index.vue and report/[id].vue carried byte-duplicated copies of the Score
Table / Document Metadata / Detailed Findings / Not Included in Scoring
subtree (~635 template lines + ~14 script helpers each). The copies had
already drifted (responsive padding fix on one page only) and caused a
production 500 once (commit 0f39c96). Both pages now render
<ReportContent :result>, which uses the report page's newer markup and the
shared grade/severity colors. Also deletes the dead CategoryRow.vue and
AdobeParityCard.vue (zero consumers) and ports CategoryRow's mount tests to
report-content.test.ts, so the suite pins the component users actually see.
The [data-report-content] wrapper and aria-expanded semantics are unchanged,
so the HTML-export snapshot behaves identically."
```

---

### Task 5: Delete the API dead weight

Remove the unreachable `"remediation"`-mode branches from the category scorers, the two never-called helpers, and take `src/spike/` out of the build gate. **Keep** `SCORING_PROFILES.remediation`, the `ScoringMode` union, and the `scoreProfiles.remediation` alias emission (documented back-compat).

**Files:**
- Modify: `apps/api/src/services/scorer.ts` (four branch sites + two dead helpers + three signatures)
- Modify: `apps/api/tsconfig.json` (exclude spike)

**Interfaces:**
- Consumes: nothing new.
- Produces: `scoreHeadingStructure(qpdf: QpdfResult): CategoryResult`, `scoreTableMarkup(qpdf: QpdfResult): CategoryResult`, `scoreReadingOrder(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult` — `mode` parameter dropped from all three; `buildCategories` updates its three call sites. `aggregateScore` keeps its `mode` param (used for profile label/description).

- [ ] **Step 1: Capture a behavior baseline**

Run: `pnpm --filter api exec vitest run src/__tests__/scorer.test.ts`
Expected: PASS. (These tests exercise `scoreDocument`, which only ever runs strict — they are the regression net proving the deletions change nothing.)

- [ ] **Step 2: Delete the four unreachable branches**

All in `scorer.ts` (current line refs — locate by the quoted code, not the numbers):
1. **`aggregateScore` PDF/UA lift block (811-819):** delete the whole `if (mode === "remediation") { ... }` block *and* its 20-line explanatory comment above (792-810, "Bonus-only PDF/UA in Practical mode…"). `overallScore` stays `weightedAverage(applicable)`.
2. **`scoreHeadingStructure` (1083-1100):** delete the `if (mode === "remediation" && hasRemediationSignals) { ... return {...} }` block and the now-unused `hasRemediationSignals` const (1066-1069). Keep `roleMappedParagraphs` (still used by the findings push above it).
3. **`scoreTableMarkup` (1809-1830):** delete the `qualifiesForRemediationPartialCredit` const and its `if (qualifiesForRemediationPartialCredit) { ... }` branch; promote the `else if (withHeaders === 0 && withRows === n)` branch to a plain `if`.
4. **`scoreReadingOrder` (2186-2220):** delete the whole `if (mode === "remediation") { ... return {...} }` block (from `if (mode === "remediation") {` through the closing brace before the `// Strict mode — rigorous verdict when we have enough data.` comment).

- [ ] **Step 3: Drop the dead params and helpers**

1. Remove `mode: ScoringMode` from the signatures of `scoreHeadingStructure` (1041-1044), `scoreTableMarkup` (1556), `scoreReadingOrder` (2112-2116), and update their three call sites inside `buildCategories` (694-717). `buildCategories` and `aggregateScore` keep their `mode` params (used by `applyProfileWeights` / profile labels).
2. Delete `listLegalityScore` (739-743) and `tableLegalityScore` (745-762) — zero call sites (verify: `grep -n "listLegalityScore\|tableLegalityScore" apps/api/src/services/scorer.ts` → only the definitions before deleting, nothing after).
3. Grep for any newly unused imports/locals: `grep -n "hasRemediationSignals\|qualifiesForRemediationPartialCredit" apps/api/src/services/scorer.ts` → zero hits.

- [ ] **Step 4: Exclude `src/spike/` from the build gate**

In `apps/api/tsconfig.json` change:

```json
  "exclude": ["node_modules", "dist"]
```

to:

```json
  "exclude": ["node_modules", "dist", "src/spike"]
```

(The four spike scripts are manual `tsx` scratch harnesses imported by nothing; `include: ["src/**/*"]` was making `tsc --noEmit` — the build/CI gate — type-check them for no benefit. They still run via `tsx` on demand.)

- [ ] **Step 5: Verify behavior is unchanged**

Run: `pnpm --filter api test && pnpm --filter api build`
Expected: identical pass counts to Step 1's baseline; tsc clean. Specifically re-run `scorer.test.ts` and `integration.test.ts` — all green with no snapshot/score changes.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/scorer.ts apps/api/tsconfig.json
git commit -m "refactor(api): remove unreachable remediation-mode scoring branches

scoreDocument has built only the strict profile since v1.21.0 (Practical was
retired; scoreProfiles.remediation is a documented alias of strict, which this
change KEEPS). The mode === 'remediation' branches inside scoreHeadingStructure,
scoreTableMarkup, scoreReadingOrder, and aggregateScore's PDF/UA lift block were
therefore unreachable, as were listLegalityScore/tableLegalityScore (zero call
sites). Also excludes src/spike/ (manual tsx scratch harnesses) from the tsc
build gate. No behavior change — scorer/integration suites pass unchanged."
```

---

### Task 6: Test the remediation subsystem

`remediationJobs.ts`, `remediationEvents.ts`, and `remediationCleanup.ts` perform irreversible deletes, single-use token verification, and TTL expiry with zero direct tests. Test them against a real temp SQLite DB (the modules prepare statements against the singleton at import, so `DB_PATH` must be set **before** dynamic import — vitest gives each test file its own module registry, so this is safe per-file).

**Files:**
- Test: `apps/api/src/__tests__/remediationJobs.test.ts`
- Test: `apps/api/src/__tests__/remediationLifecycle.test.ts` (events + cleanup share one temp-DB setup)

**Interfaces:**
- Consumes: `createJob`, `getJob`, `setRunning`, `setStep`, `setScores`, `setComplete`, `setFailed`, `setExpired`, `countActiveJobsForEmail`, `verifyDownloadToken` from `remediationJobs.js`; `recordEvent`, `getEventsForJob`, `verifyAbsent`, `deleteAndVerify` from `remediationEvents.js`; `runCleanup`, `startCleanupInterval`, `stopCleanupInterval` from `remediationCleanup.js`.

- [ ] **Step 1: Write the failing jobs test**

Create `apps/api/src/__tests__/remediationJobs.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The db singleton reads DB_PATH at import time and the remediation modules
// prepare statements against it at import time — so the env var MUST be set
// before the dynamic import below. Each vitest file has its own module
// registry, so this isolated DB never leaks into other test files.
const tmpDir = mkdtempSync(join(tmpdir(), 'remediation-jobs-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')

let jobs: typeof import('../services/remediationJobs.js')

beforeAll(async () => {
  jobs = await import('../services/remediationJobs.js')
})

function makeJob(email = 'user@example.com') {
  return jobs.createJob({
    email,
    inputFilename: 'report.pdf',
    originalFilename: 'FY 22 Report (final).pdf',
    contentHash: 'abc123',
    pageCount: 12,
  })
}

describe('createJob', () => {
  it('creates a pending job and returns a one-time token, storing only its hash', () => {
    const { job, downloadToken } = makeJob()
    expect(job.status).toBe('pending')
    expect(job.progressPct).toBe(0)
    expect(job.originalFilename).toBe('FY 22 Report (final).pdf')
    expect(job.expiresAt).toBeGreaterThan(job.createdAt)
    // token is NOT stored raw
    expect(job.downloadTokenHash).not.toBe(downloadToken)
    const expected = createHash('sha256').update(downloadToken).digest('hex')
    expect(job.downloadTokenHash).toBe(expected)
  })

  it('round-trips through getJob; unknown ids return null', () => {
    const { job } = makeJob()
    expect(jobs.getJob(job.id)?.id).toBe(job.id)
    expect(jobs.getJob('nonexistent-id')).toBeNull()
  })
})

describe('status transitions', () => {
  it('pending → running → stepped → complete refreshes expiry and clears step', () => {
    const { job } = makeJob()
    jobs.setRunning(job.id)
    expect(jobs.getJob(job.id)?.status).toBe('running')
    expect(jobs.getJob(job.id)?.progressPct).toBe(5)

    jobs.setStep(job.id, 'tagging', 40)
    expect(jobs.getJob(job.id)?.step).toBe('tagging')
    expect(jobs.getJob(job.id)?.progressPct).toBe(40)

    jobs.setScores(job.id, 42, 96, true)
    const scored = jobs.getJob(job.id)!
    expect(scored.inputScore).toBe(42)
    expect(scored.outputScore).toBe(96)
    expect(scored.outputValid).toBe(true)

    const before = jobs.getJob(job.id)!.expiresAt
    jobs.setComplete(job.id, '/tmp/out.pdf')
    const done = jobs.getJob(job.id)!
    expect(done.status).toBe('complete')
    expect(done.step).toBeNull()
    expect(done.progressPct).toBe(100)
    expect(done.outputPath).toBe('/tmp/out.pdf')
    expect(done.completedAt).not.toBeNull()
    expect(done.expiresAt).toBeGreaterThanOrEqual(before)
  })

  it('setFailed records the reason; setExpired clears the output path', () => {
    const a = makeJob().job
    jobs.setFailed(a.id, 'worker timeout')
    expect(jobs.getJob(a.id)?.status).toBe('failed')
    expect(jobs.getJob(a.id)?.failureReason).toBe('worker timeout')

    const b = makeJob().job
    jobs.setComplete(b.id, '/tmp/out.pdf')
    jobs.setExpired(b.id)
    const expired = jobs.getJob(b.id)!
    expect(expired.status).toBe('expired')
    expect(expired.outputPath).toBeNull()
  })
})

describe('countActiveJobsForEmail', () => {
  it('counts only pending/running jobs for that email', () => {
    const email = `active-${Date.now()}@example.com`
    const p = makeJob(email).job          // pending
    const r = makeJob(email).job
    jobs.setRunning(r.id)                 // running
    const f = makeJob(email).job
    jobs.setFailed(f.id, 'x')             // terminal — not counted
    makeJob('other@example.com')          // different user — not counted
    expect(jobs.countActiveJobsForEmail(email)).toBe(2)
    expect(p.id).not.toBe(r.id)
  })
})

describe('verifyDownloadToken', () => {
  it('accepts the issued token exactly once-verifiable and rejects everything else', () => {
    const { job, downloadToken } = makeJob()
    expect(jobs.verifyDownloadToken(job, downloadToken)).toBe(true)
    expect(jobs.verifyDownloadToken(job, downloadToken.slice(0, -1) + 'x')).toBe(false)
    expect(jobs.verifyDownloadToken(job, '')).toBe(false)
    expect(
      jobs.verifyDownloadToken({ ...job, downloadTokenHash: null }, downloadToken),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run it (should pass immediately — these are characterization tests)**

Run: `pnpm --filter api exec vitest run src/__tests__/remediationJobs.test.ts`
Expected: PASS. If any assertion fails, STOP — that is a real finding about the subsystem, not a test bug; investigate before changing the assertion.

- [ ] **Step 3: Write the lifecycle (events + cleanup) test**

Create `apps/api/src/__tests__/remediationLifecycle.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpDir = mkdtempSync(join(tmpdir(), 'remediation-lifecycle-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')

let jobs: typeof import('../services/remediationJobs.js')
let events: typeof import('../services/remediationEvents.js')
let cleanup: typeof import('../services/remediationCleanup.js')
let db: typeof import('../db/sqlite.js')['default']

beforeAll(async () => {
  jobs = await import('../services/remediationJobs.js')
  events = await import('../services/remediationEvents.js')
  cleanup = await import('../services/remediationCleanup.js')
  db = (await import('../db/sqlite.js')).default
})

function makeJob() {
  return jobs.createJob({
    email: 'user@example.com',
    inputFilename: 'r.pdf',
    contentHash: 'h',
    pageCount: 1,
  }).job
}

describe('remediationEvents', () => {
  it('records and returns events in order, with details round-tripped', () => {
    const job = makeJob()
    events.recordEvent(job.id, 'received', { bytes: 123 })
    events.recordEvent(job.id, 'processing_started')
    const log = events.getEventsForJob(job.id)
    expect(log.map((e) => e.event)).toEqual(['received', 'processing_started'])
    expect(log[0].details).toEqual({ bytes: 123 })
    expect(log[1].details).toBeNull()
  })

  it('verifyAbsent: true + verified_absent event on ENOENT; false + verify_failed if present', async () => {
    const job = makeJob()
    const missing = join(tmpDir, 'never-existed.pdf')
    expect(await events.verifyAbsent(job.id, missing)).toBe(true)

    const present = join(tmpDir, 'still-here.pdf')
    writeFileSync(present, 'x')
    expect(await events.verifyAbsent(job.id, present)).toBe(false)

    const names = events.getEventsForJob(job.id).map((e) => e.event)
    expect(names).toContain('verified_absent')
    expect(names).toContain('verify_failed')
  })

  it('deleteAndVerify removes the file, records output_deleted + verified_absent, and never exposes the raw path', async () => {
    const job = makeJob()
    const target = join(tmpDir, 'output.pdf')
    writeFileSync(target, 'pdf-bytes')
    expect(await events.deleteAndVerify(job.id, target, 'ttl_expired')).toBe(true)
    expect(existsSync(target)).toBe(false)

    const log = events.getEventsForJob(job.id)
    const del = log.find((e) => e.event === 'output_deleted')!
    expect(del.details?.trigger).toBe('ttl_expired')
    // compliance log stores a hash, not the path
    expect(JSON.stringify(del.details)).not.toContain('output.pdf')
    expect(log.some((e) => e.event === 'verified_absent')).toBe(true)
  })

  it('deleteAndVerify on an already-absent file still verifies absent (idempotent)', async () => {
    const job = makeJob()
    const missing = join(tmpDir, 'gone.pdf')
    expect(await events.deleteAndVerify(job.id, missing, 'cleanup')).toBe(true)
  })
})

describe('remediationCleanup.runCleanup', () => {
  it('expires a complete job past its TTL: deletes the output, flips status, records events', async () => {
    const job = makeJob()
    const out = join(tmpDir, `${job.id}-output.pdf`)
    writeFileSync(out, 'x')
    jobs.setComplete(job.id, out)
    // force the TTL into the past
    db.prepare('UPDATE remediation_jobs SET expires_at = ? WHERE id = ?').run(
      Date.now() - 1000,
      job.id,
    )

    const result = await cleanup.runCleanup()
    expect(result.expiredOutputs).toBeGreaterThanOrEqual(1)
    expect(existsSync(out)).toBe(false)
    expect(jobs.getJob(job.id)?.status).toBe('expired')
    expect(jobs.getJob(job.id)?.outputPath).toBeNull()
    const names = events.getEventsForJob(job.id).map((e) => e.event)
    expect(names).toContain('expired')
  })

  it('marks pending/running jobs stuck for >10min as failed', async () => {
    const job = makeJob()
    jobs.setRunning(job.id)
    db.prepare('UPDATE remediation_jobs SET created_at = ? WHERE id = ?').run(
      Date.now() - 11 * 60_000,
      job.id,
    )
    const result = await cleanup.runCleanup()
    expect(result.stuckJobs).toBeGreaterThanOrEqual(1)
    const j = jobs.getJob(job.id)!
    expect(j.status).toBe('failed')
    expect(j.failureReason).toContain('stuck')
  })

  it('is idempotent — a second sweep finds nothing new and reports no errors', async () => {
    const again = await cleanup.runCleanup()
    expect(again.errors).toEqual([])
    expect(again.expiredOutputs).toBe(0)
    expect(again.stuckJobs).toBe(0)
  })

  it('startCleanupInterval is a no-op when REMEDIATION is disabled (default in tests)', () => {
    // REMEDIATION_ENABLED is unset in the test env → ENABLED false → no timer.
    cleanup.startCleanupInterval()
    cleanup.stopCleanupInterval() // must not throw either way
  })
})
```

- [ ] **Step 4: Run the lifecycle test**

Run: `pnpm --filter api exec vitest run src/__tests__/remediationLifecycle.test.ts`
Expected: PASS. Same rule as Step 2: a failing assertion is a subsystem finding — stop and report, don't paper over. (One foreseeable adjustment: if `REMEDIATION.ENABLED` defaults **on** in the test env, the interval test's comment is wrong — assert via `stopCleanupInterval()` cleanup instead and note the default.)

- [ ] **Step 5: Full API suite**

Run: `pnpm --filter api test`
Expected: PASS, with the two new files adding ~15 tests. Confirm no other file's DB was affected (the temp `DB_PATH` isolates them).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/__tests__/remediationJobs.test.ts apps/api/src/__tests__/remediationLifecycle.test.ts
git commit -m "test(api): cover the remediation subsystem (jobs, events, cleanup)

remediationJobs/remediationEvents/remediationCleanup performed irreversible
deletes, single-use hashed download tokens, and TTL expiry with zero direct
tests. Characterization tests now run them against a real temp-file SQLite DB
(DB_PATH set before dynamic import): token hashing + constant-time verify,
status transitions, active-job counting, event ordering + path-hash privacy,
delete-and-verify semantics, TTL expiry sweep, stuck-job failure, and sweep
idempotency."
```

---

### Task 7: Whole-repo verification + doc sync

**Files:**
- Modify: `README.md` (test counts — the repo's standing rule is to keep them in sync)

- [ ] **Step 1: Full build + full test sweep**

```bash
pnpm build
pnpm test
```
Expected: both apps build clean; record the final API/web test counts from the output.

- [ ] **Step 2: Sync README test counts**

Update the test-count figures in `README.md` (search for the current totals, e.g. "827") to the new totals from Step 1. Do not touch the version badge or any other section (out of scope for this plan; flagged separately).

- [ ] **Step 3: Behavioral spot-check of the API (scoring unchanged)**

```bash
pnpm --filter api exec vitest run src/__tests__/scorer.test.ts src/__tests__/integration.test.ts src/__tests__/conformance.test.ts
```
Expected: PASS — proves the strict scoring path is byte-identical after Tasks 3+5.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: sync README test counts after structural-review fixes"
```

- [ ] **Step 5: Report completion**

Summarize per task: what changed, test deltas, and the two flagged follow-ups that were deliberately NOT done: (a) `utils/wcag.ts` criteria lists differ from `WCAG_CATEGORY_MAP` (content decision needed); (b) README version badge still says 1.27.0 (hygiene list, not in the approved six). Ask the user about the changelog/version-bump workflow (their release checklist requires CHANGELOG + versions + tag together — their call whether this warrants a version).
