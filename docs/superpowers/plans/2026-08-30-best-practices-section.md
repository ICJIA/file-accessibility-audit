# Best Practices Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a document-level "Best practices" scorecard between the numbered action-plan steps and the "Above and beyond" group, listing every non-scored best practice for the file's format with its status, the specific evidence from *this* document, and links — rendered in the Visual view, the Detailed view, the shareable report, and the print-friendly plan.

**Architecture:** A declarative catalog (`apps/web/app/utils/bestPractices.ts`) whose entries each carry a `detect()` that reads the **existing** `CategoryResult.findings` strings the analyzer already emits. No analyzer change, no new payload field, no migration — so every stored report works and no accuracy gate moves. A single `BestPracticesSection.vue` renders it on three web surfaces; `printablePlan.ts` renders the same data as static, fully-expanded HTML for paper.

**Tech Stack:** Nuxt 4.5.2, Nuxt UI 4.11.0, Vue 3 `<script setup>` + TypeScript, Vitest + `@vue/test-utils`, Tailwind v4, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-30-best-practices-section-design.md`

## Global Constraints

- **Repo root is `/Volumes/satechi/webdev/file-accessibility-audit`. Run all `pnpm` root scripts FROM THE REPO ROOT** — `pnpm build` / `lint` / `format:check` / `typecheck` from an app dir exit 254 "command not found".
- **`pnpm lint` does NOT cover `pnpm format:check`.** CI runs both. Run both before pushing.
- **`pnpm build` does NOT typecheck `apps/web`.** Run root `pnpm typecheck` (api `tsc --noEmit` + `nuxt typecheck`) before every push.
- **Never pipe `pnpm build` through `tail`/`grep`** — the pipe's exit code hides failure. Gate on `$?`.
- **No AI co-author trailer on any commit.** No `Co-Authored-By: Claude`, no `🤖 Generated with`. End commit messages with the descriptive content.
- **`apps/web` has NO `#config` alias.** Web code imports the root config by relative path (`../../../../audit.config`). The alias exists in api/cli only.
- **Copy rules, all binding:** written for a NON-TECHNICAL reader; never the word "strong" (use "high"); never gender or identify people ("the author", "a reader"); the phrase **"required by law" may not appear anywhere in this feature**; nothing here may carry a REQUIRED chip.
- **Counts must be computed or countless** — never a hardcoded total. The build-brief banned-pattern guard and `feedback_trust_page_stats` both apply.
- **Every URL passes `safeHttpUrl`** before rendering. Every interpolated value in `printablePlan.ts` passes `escapeHtml`.
- **`/report/[id]` renders attacker-controlled stored JSON through SSR.** No `detect()` may throw. Narrow to strings, never assume array shape, never assume a regex group exists.
- **Dark mode only** in the web UI; use CSS custom properties (`var(--text-muted)`, `var(--surface-deep)`, `var(--border-subtle)`), never raw hex, except the documented on-badge contrast exemptions.
- **Tailwind v4:** never put a negative margin (`-mb-*`/`-mt-*`) on a direct child of a `space-y-*` container — v4's zero-specificity `:where()` makes it REPLACE the gap, overlapping content.
- **Vue condense mode drops whitespace-only text containing a newline between two elements.** Two inline links on separate template lines render touching — use an explicit `{{ " " }}`.
- **The web `NuxtLink` test stub is `<a><slot /></a>`**, so props fall through as raw attributes. Assert `attributes("to")`, never `attributes("href")`.
- **Test command:** `pnpm --filter web test` runs the whole suite. To scope to ONE file use
  `pnpm --filter web exec vitest run <path>` — `pnpm ... test -- <path>` does **NOT** scope
  (pnpm forwards a bare `--` into the script, and vitest ignores it: verified 2026-08-30,
  it ran all 92 files).
  The web package is named **`web`**, NOT `@file-audit/web`. This matters: a
  `--filter` that matches nothing prints "No projects matched the filters" and
  **still exits 0**, so a wrong filter reads as a passing suite. Ground truth on
  this branch at Task 2: **91 test files, 1351 tests**. If your run reports far
  fewer, or no counts at all, your filter is wrong — do not report success.
  (Only `@file-audit/shared` and `@file-audit/analyzer` carry the scope; `api` is
  `api` and the CLI is `@icjia/a11y-audit`.)

---

## Category ID Reference

**Every practice's `categoryId` must be one of these exact strings.** They are
not guessable — font embedding is not `"fonts"`, links are not `"links"`.
Verified against `packages/analyzer/src/scoring/` on 2026-08-30.

**PDF** — `alt_text`, `bookmarks`, `color_contrast`, `form_accessibility`,
`heading_structure`, `link_quality`, `reading_order`, `table_markup`,
`text_extractability`, `title_language`

**Word** — the PDF set minus `bookmarks`, plus `list_structure`
**PowerPoint** — as Word, plus `slide_titles` and `strict`, minus `heading_structure`
**Excel** — `alt_text`, `color_contrast`, `form_accessibility`, `link_quality`,
`sheet_names`, `table_markup`, `text_extractability`, `title_language`

| Practice | `categoryId` | Why it is not where you would guess |
|---|---|---|
| `heading-level-order`, `heading-convention`, `heading-numbered-levels`, `heading-content`, `single-h1` | `heading_structure` | |
| `reading-order-fidelity`, `nested-structure-tree` | `reading_order` | the flat-tree advisory is emitted by the reading-order scorer |
| `bookmarks` | `bookmarks` | |
| `font-embedding`, `character-mapping`, `content-in-tag-tree` | `text_extractability` | **there is no `fonts` category** — all three are emitted inside the text-extractability scorer |
| `display-doc-title` | `title_language` | |
| `table-scope-simple`, `table-scope-with-headers`, `nested-tables` | `table_markup` | |
| `descriptive-link-text`, `raw-url-link-text` | `link_quality` | |
| `list-labels`, `footnote-ids` | `reading_order` | `supplementary.ts` appends both via `findCat("reading_order")`, **not** to `list_structure` |
| `docx-first-heading-is-h1`, `docx-heading-skips`, `docx-empty-headings` | `heading_structure` | |
| `docx-empty-paragraph-runs` | `text_extractability` | emitted by `scoreDocxText` |
| `docx-layout-grids`, `docx-nested-tables`, `docx-merged-cells`, `docx-empty-table-rows` | `table_markup` | |
| `docx-raw-url-link-text`, `pptx-raw-url-link-text`, `xlsx-raw-url-link-text` | `link_quality` | |
| `pptx-slide-titles`, `pptx-distinct-slide-titles` | `slide_titles` | |
| `xlsx-sheet-names` | `sheet_names` | |
| `xlsx-defined-tables`, `xlsx-data-outside-tables`, `xlsx-pivot-tables`, `xlsx-data-start`, `xlsx-merged-cells` | `table_markup` | all five come from `scoreXlsxTableMarkup` |

Re-verify before writing each entry:

```bash
grep -oE '^\s*"[a-z_]+",' packages/analyzer/src/scoring/<format>.ts | tr -d ' ",' | sort -u
```

---

## File Structure

**Create**

| Path | Responsibility |
|---|---|
| `apps/web/app/utils/bestPractices/types.ts` | Shared types + `DetectContext` builder + matcher primitives. No practice data. |
| `apps/web/app/utils/bestPractices/links.ts` | Link resolution: WCAG Understanding/Techniques, Matterhorn checkpoints, `safeHttpUrl` guarding. |
| `apps/web/app/utils/bestPractices/pdf.ts` | The 19 PDF practices. |
| `apps/web/app/utils/bestPractices/office.ts` | The 19 Word / PowerPoint / Excel practices. |
| `apps/web/app/utils/bestPractices/index.ts` | `CATALOG`, `evaluateBestPractices()`, `summarizeBestPractices()`. The only import surface. |
| `apps/web/app/components/BestPracticesSection.vue` | The rendered scorecard. |
| `apps/web/app/__tests__/bestPracticesCore.test.ts` | Types, context builder, matcher primitives, malformed input. |
| `apps/web/app/__tests__/bestPracticesPdf.test.ts` | Every PDF practice × every status. |
| `apps/web/app/__tests__/bestPracticesOffice.test.ts` | Every Office practice × every status. |
| `apps/web/app/__tests__/bestPracticesSection.test.ts` | The component. |

Split by responsibility, not layer: the PDF and Office catalogs change independently and neither should force the other into context. `index.ts` is the single import surface so consumers never reach into a format file.

**Modify**

| Path | Change |
|---|---|
| `apps/web/app/utils/findings.ts:51-55` | `isNotScoredFinding` gains the `"note — not scored"` prefix. |
| `apps/web/app/components/ActionPlan.vue` | Render the section; delete `beyondItems` and its `<ul>`; narrow `showBeyondGroup`; drop the "N optional items" chip. |
| `apps/web/app/pages/index.vue` | Render the section in the Detailed branch. |
| `apps/web/app/pages/report/[id].vue` | Render the section in the Detailed branch. |
| `apps/web/app/components/PrintPlanButton.vue` | Widen the `categories` prop type; extend `hasSomethingToPrint`; pass practices through. |
| `apps/web/app/utils/printablePlan.ts` | New `bestPractices` option + its rendered section + styles. |
| `apps/web/app/__tests__/pdfUaCosign.test.ts` | Move the `beyondItems` assertions to the new section. |
| `apps/web/app/__tests__/actionPlan.test.ts:855` | The `Above and beyond` assertion. |
| `apps/web/app/__tests__/reportSectionOrder.test.ts` | Pin the new component's place in both views. |
| `apps/web/app/__tests__/findings.test.ts` | The new prefix. |

---

### Task 1: Fix the mislabelled "Note — not scored" findings

Six analyzer lines — Word merged cells, Word empty table rows, Excel out-of-table ranges, Excel pivot tables, Excel far-from-A1 starts, Excel merged cells — use the prefix `"Note — not scored:"`. `isNotScoredFinding` recognises only `"pdf/ua only — not scored"` and `"advisory — not scored"`, so all six fall through to `main` and render under the Tier-1 heading *"Required by WCAG 2.1 — ADA Title II · Illinois IITAA (this is what your score measures)"*. Unscored advice is presented as legally required. This task is independent of everything else and ships on its own.

**Files:**
- Modify: `apps/web/app/utils/findings.ts:51-55`
- Test: `apps/web/app/__tests__/findings.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isNotScoredFinding(finding: string): boolean` — unchanged signature, widened behaviour. Task 5 relies on the `"Note — not scored:"` Office lines landing in `partitionCardFindings().notScored`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/app/__tests__/findings.test.ts`:

```ts
describe("isNotScoredFinding — the analyzer's prefix contract", () => {
  it("recognises all three not-scored prefixes the analyzer emits", () => {
    expect(
      isNotScoredFinding(
        "PDF/UA only — not scored: only generic <H> tags were found (not H1–H6).",
      ),
    ).toBe(true);
    expect(
      isNotScoredFinding("Advisory — not scored: the structure tree is flat (no meaningful nesting)"),
    ).toBe(true);
    expect(
      isNotScoredFinding("Advisory — not scored against you: 3 link(s) show the raw URL"),
    ).toBe(true);
    // The six Word/Excel lines that render today under "Required by WCAG 2.1".
    expect(
      isNotScoredFinding("Note — not scored: 12 merged cell(s) across the table(s)."),
    ).toBe(true);
  });

  it("does not claim ordinary findings or the guidance prefix", () => {
    expect(isNotScoredFinding("Note: this is informational")).toBe(false);
    expect(isNotScoredFinding("5 image(s) found, none have alt text")).toBe(false);
    expect(isNotScoredFinding("")).toBe(false);
  });
});
```

Add `isNotScoredFinding` to the existing import block at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
pnpm --filter web test -- app/__tests__/findings.test.ts -t "prefix contract"
```

Expected: FAIL — `expected false to be true` on the `"Note — not scored:"` case.

- [ ] **Step 3: Widen the prefix check**

In `apps/web/app/utils/findings.ts`, replace the body of `isNotScoredFinding`:

```ts
/** A finding the analyzer marked as reported-but-unscored. The analyzer owns
 *  the wording; these three prefixes are its contract with the UI.
 *
 *  "Note — not scored" was missing until 2026-08-30, so six Word/Excel lines
 *  (merged cells, empty table rows, out-of-table ranges, pivot tables,
 *  far-from-A1 starts, merged cells) fell through to `main` and rendered
 *  under the Tier-1 heading "Required by WCAG 2.1 — this is what your score
 *  measures". Unscored advice must never be presented as legally required. */
export function isNotScoredFinding(finding: string): boolean {
  if (!finding) return false;
  const f = finding.trim().toLowerCase();
  return (
    f.startsWith("pdf/ua only — not scored") ||
    f.startsWith("advisory — not scored") ||
    f.startsWith("note — not scored")
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter web test -- app/__tests__/findings.test.ts
```

Expected: PASS, whole file.

- [ ] **Step 5: Run the full web suite — this changes a shared partition**

```bash
pnpm --filter web test
```

Expected: PASS. If a card-rendering test now finds a finding in `notScored` that it expected in `main`, that test was pinning the bug — update it and say so in the commit body.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/utils/findings.ts apps/web/app/__tests__/findings.test.ts
git commit -m "fix(report): stop labelling 'Note — not scored' findings as required by WCAG 2.1

isNotScoredFinding recognised only two of the analyzer's three not-scored
prefixes, so six Word/Excel advisory lines rendered under the Tier-1
heading that says the score measures them."
```

---

### Task 2: Catalog types, context builder, and matcher primitives

The shared foundation every practice is built on. No practice data yet — this task produces only the types and the four matcher primitives, and proves they cannot throw on malformed input.

**Files:**
- Create: `apps/web/app/utils/bestPractices/types.ts`
- Test: `apps/web/app/__tests__/bestPracticesCore.test.ts`

**Interfaces:**
- Consumes: `partitionCardFindings`, `TechnicalGroup` from `~/utils/findings`; `FileType` from `@file-audit/shared`.
- Produces — every later task depends on these exact names:
  - `type BestPracticeStatus = "met" | "not-met" | "not-applicable" | "not-checked"`
  - `interface BestPracticeLink { label: string; url: string }`
  - `interface EvidenceBlock { caption: string; lines: string[] }`
  - `interface BestPracticeResult { status: BestPracticeStatus; evidence: string[]; block?: EvidenceBlock; fix?: { source: string; app: string } }`
  - `interface DetectContext { findings: string[]; notScored: string[]; main: string[]; signals: TechnicalGroup[]; fileType: FileType; notAssessed: boolean; categoryPresent: boolean; pageCount: number }`
  - `interface BestPractice { id: string; formats: FileType[]; categoryId: string; label: string; description: string; why: string; standard?: string; links: BestPracticeLink[]; detect(ctx: DetectContext): BestPracticeResult }`
  - `buildContext(category: unknown, fileType: FileType, pageCount: number): DetectContext`
  - `matchNotScored(ctx: DetectContext, ...needles: string[]): string | null`
  - `matchAny(ctx: DetectContext, ...needles: string[]): string | null`
  - `signalLines(ctx: DetectContext, headingNeedle: string): string[]`
  - `firstNumber(text: string | null): number | null`

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/bestPracticesCore.test.ts`:

```ts
/**
 * The catalog's foundation.
 *
 * Two things are pinned here and must never regress:
 *   1. NOTHING throws. /report/[id] renders stored JSON through SSR, and a
 *      forged report has 500'd that page before (v1.68.0). Every primitive
 *      takes `unknown` and narrows.
 *   2. Silence is never a pass. A context with no matching finding yields
 *      null, and the practices built on these primitives turn null into
 *      NOT CHECKED — never MET.
 */
import { describe, it, expect } from "vitest";
import {
  buildContext,
  matchNotScored,
  matchAny,
  signalLines,
  firstNumber,
} from "../utils/bestPractices/types";

const category = {
  id: "heading_structure",
  label: "Heading Structure",
  findings: [
    "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 13-004), not a WCAG 2.1 failure, so your grade is not affected.",
    "--- Heading Tree ---",
    "  H1 → H2 → H1 → H1 → H3 → H5",
    "  Heading hierarchy skip: H1 → H3 (skipped H2)",
    "  Heading hierarchy skip: H3 → H5 (skipped H4)",
    "Found 6 heading tags with logical hierarchy",
  ],
};

describe("buildContext", () => {
  it("splits a category into the partitions a practice reads", () => {
    const ctx = buildContext(category, "pdf", 12);
    expect(ctx.fileType).toBe("pdf");
    expect(ctx.pageCount).toBe(12);
    expect(ctx.categoryPresent).toBe(true);
    expect(ctx.notScored[0]).toMatch(/level order has gaps/);
    expect(ctx.main).toContain("Found 6 heading tags with logical hierarchy");
    expect(ctx.signals[0]?.heading).toBe("Heading Tree");
  });

  it("marks an absent category as not present, with empty partitions", () => {
    const ctx = buildContext(undefined, "pdf", 0);
    expect(ctx.categoryPresent).toBe(false);
    expect(ctx.findings).toEqual([]);
    expect(ctx.notScored).toEqual([]);
    expect(ctx.signals).toEqual([]);
  });

  it("survives every malformed shape a forged stored report can carry", () => {
    // Each of these previously had a route to throwing during SSR.
    const hostile: unknown[] = [
      null,
      "a string, not an object",
      42,
      { findings: "not an array" },
      { findings: null },
      { findings: [1, 2, 3] },
      { findings: [null, undefined, {}, []] },
      { findings: [{ toString: () => { throw new Error("boom"); } }] },
    ];
    for (const c of hostile) {
      expect(() => buildContext(c, "pdf", 0)).not.toThrow();
      const ctx = buildContext(c, "pdf", 0);
      expect(Array.isArray(ctx.findings)).toBe(true);
      expect(ctx.findings.every((f) => typeof f === "string")).toBe(true);
    }
  });
});

describe("matchNotScored", () => {
  it("returns the matching not-scored line", () => {
    const ctx = buildContext(category, "pdf", 12);
    expect(matchNotScored(ctx, "level order has gaps")).toMatch(/Matterhorn 13-004/);
  });

  it("returns null when nothing matches — silence is never a pass", () => {
    const ctx = buildContext(category, "pdf", 12);
    expect(matchNotScored(ctx, "no bookmarks")).toBeNull();
  });

  it("only searches the not-scored partition, never the scored findings", () => {
    const ctx = buildContext(category, "pdf", 12);
    // This phrase exists in `main`, not in `notScored`.
    expect(matchNotScored(ctx, "logical hierarchy")).toBeNull();
    expect(matchAny(ctx, "logical hierarchy")).toMatch(/Found 6 heading tags/);
  });
});

describe("signalLines", () => {
  it("returns a technical-signal group's items by its heading", () => {
    const ctx = buildContext(category, "pdf", 12);
    expect(signalLines(ctx, "Heading Tree")).toEqual([
      "H1 → H2 → H1 → H1 → H3 → H5",
      "Heading hierarchy skip: H1 → H3 (skipped H2)",
      "Heading hierarchy skip: H3 → H5 (skipped H4)",
    ]);
  });

  it("returns an empty array for an absent group", () => {
    const ctx = buildContext(category, "pdf", 12);
    expect(signalLines(ctx, "Bookmark Outline")).toEqual([]);
  });
});

describe("firstNumber", () => {
  it("reads a count out of a finding, including a thousands separator", () => {
    expect(firstNumber("Advisory — not scored: 12 merged cell(s)")).toBe(12);
    expect(firstNumber("this document has 1,240 pages and no bookmarks")).toBe(1240);
  });

  it("returns null rather than guessing", () => {
    expect(firstNumber(null)).toBeNull();
    expect(firstNumber("no digits here")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
pnpm --filter web test -- app/__tests__/bestPracticesCore.test.ts
```

Expected: FAIL — `Cannot find module '../utils/bestPractices/types'`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/utils/bestPractices/types.ts`:

```ts
/**
 * The Best Practices catalog's foundation: its types, its context builder,
 * and the four matcher primitives every practice is written against.
 *
 * WHY THE CATALOG READS STRINGS. The evidence an author needs is already
 * computed and already in the payload — pdf.ts:808-809 emits the heading
 * tree, the link census names every link, the font census names every font.
 * Reading the findings the analyzer already writes means this feature works
 * on EVERY stored report ever created, with no new payload field and no
 * migration, and it moves no scoring gate.
 *
 * TWO RULES THAT MUST NOT REGRESS.
 *
 * 1. NOTHING HERE MAY THROW. /report/[id] renders stored JSON server-side.
 *    That JSON is attacker-controlled: a forged report whose `findings` is a
 *    string rather than an array 500'd the shared page for an hour in
 *    v1.68.0 while the suite stayed green. Every entry point takes `unknown`
 *    and narrows.
 *
 * 2. SILENCE IS NEVER A PASS. A matcher that finds nothing returns null, and
 *    the practice turns null into NOT CHECKED — never MET. Inferring a
 *    verdict the analyzer never gave is the exact failure that produced the
 *    DoIT dispute, where a correctly-built form was presented as broken.
 */
import { partitionCardFindings, type TechnicalGroup } from "~/utils/findings";
import type { FileType } from "@file-audit/shared";

export type BestPracticeStatus = "met" | "not-met" | "not-applicable" | "not-checked";

export interface BestPracticeLink {
  label: string;
  /** Rendered only after safeHttpUrl — see bestPractices/links.ts. */
  url: string;
}

/** A preformatted evidence block: the heading tree, a list of link texts. */
export interface EvidenceBlock {
  caption: string;
  lines: string[];
}

export interface BestPracticeResult {
  status: BestPracticeStatus;
  /** Plain sentences of document-specific evidence. */
  evidence: string[];
  block?: EvidenceBlock;
  /** Both routes, always — the person reading may not be the person who
   *  chose whether to fix the source file or the export. */
  fix?: { source: string; app: string };
}

export interface DetectContext {
  /** Every finding, narrowed to strings. */
  findings: string[];
  /** The analyzer's not-scored lines (all three prefixes). */
  notScored: string[];
  /** The scored findings — where the POSITIVE evidence lives. */
  main: string[];
  /** The `--- Heading ---` technical-signal groups. */
  signals: TechnicalGroup[];
  fileType: FileType;
  /** The category's own notAssessed flag. */
  notAssessed: boolean;
  /** False when the report has no such category at all. */
  categoryPresent: boolean;
  pageCount: number;
}

export interface BestPractice {
  /** Stable slug — the test anchor and the DOM `data-practice` value. */
  id: string;
  formats: FileType[];
  /** The CategoryResult this practice reads from. */
  categoryId: string;
  label: string;
  /** What the practice is. */
  description: string;
  /** Who it helps and how, in plain language. */
  why: string;
  /** "PDF/UA (ISO 14289) clause 7.4 · Matterhorn 14-002" */
  standard?: string;
  links: BestPracticeLink[];
  detect(ctx: DetectContext): BestPracticeResult;
}

/** Narrow anything to a string array. Never throws: a hostile entry whose
 *  own toString() throws is dropped rather than coerced. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export function buildContext(
  category: unknown,
  fileType: FileType,
  pageCount: number,
): DetectContext {
  const cat = category && typeof category === "object" ? (category as Record<string, unknown>) : null;
  const findings = toStringArray(cat?.findings);
  const parts = partitionCardFindings(findings);
  return {
    findings,
    notScored: parts.notScored,
    main: parts.main,
    signals: parts.signals,
    fileType,
    notAssessed: cat?.notAssessed === true,
    categoryPresent: cat !== null,
    pageCount: Number.isFinite(pageCount) ? pageCount : 0,
  };
}

/** The first not-scored line containing every needle, or null. Case-insensitive. */
export function matchNotScored(ctx: DetectContext, ...needles: string[]): string | null {
  return findIn(ctx.notScored, needles);
}

/** The first finding ANYWHERE containing every needle, or null. Use for the
 *  POSITIVE lines ("All fonts are embedded…"), which live in `main`. */
export function matchAny(ctx: DetectContext, ...needles: string[]): string | null {
  return findIn(ctx.findings, needles);
}

function findIn(haystack: string[], needles: string[]): string | null {
  if (needles.length === 0) return null;
  const lowered = needles.map((n) => n.toLowerCase());
  for (const line of haystack) {
    const l = line.toLowerCase();
    if (lowered.every((n) => l.includes(n))) return line;
  }
  return null;
}

/** A technical-signal group's items, by its `--- Heading ---`. Empty when absent. */
export function signalLines(ctx: DetectContext, headingNeedle: string): string[] {
  const needle = headingNeedle.toLowerCase();
  const group = ctx.signals.find((g) => (g.heading ?? "").toLowerCase().includes(needle));
  return group ? [...group.items] : [];
}

/** The first integer in a finding, thousands separators tolerated. Null
 *  rather than a guess — a count this cannot read must render countless. */
export function firstNumber(text: string | null): number | null {
  if (!text) return null;
  const m = /(\d[\d,]*)/.exec(text);
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter web test -- app/__tests__/bestPracticesCore.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Typecheck**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/utils/bestPractices/types.ts apps/web/app/__tests__/bestPracticesCore.test.ts
git commit -m "feat(report): best-practices catalog types and matcher primitives

Reads the findings the analyzer already emits, so it works on every stored
report with no payload change. Narrows all input: the shared report page
renders stored JSON through SSR. A matcher that finds nothing returns null,
never a pass."
```

---

### Task 3: Link resolution

Resolves each practice's `links[]`. Three sources, all already in the repo, all guarded by `safeHttpUrl` because the shared page's data is attacker-controlled.

**Files:**
- Create: `apps/web/app/utils/bestPractices/links.ts`
- Test: append to `apps/web/app/__tests__/bestPracticesCore.test.ts`

**Interfaces:**
- Consumes: `MATTERHORN_CHECKPOINTS` from `~/data/matterhorn`; `safeHttpUrl` from `@file-audit/shared`; `BestPracticeLink` from `./types`.
- Produces:
  - `matterhornLink(id: string): BestPracticeLink | null` — `id` is the two-digit checkpoint, e.g. `"13"`.
  - `techniqueLink(code: string): BestPracticeLink` — e.g. `"G141"`.
  - `understandingLink(slug: string, label: string, understandingUrl: (s: string) => string): BestPracticeLink | null`
  - `safeLinks(links: BestPracticeLink[]): BestPracticeLink[]` — drops any whose URL fails `safeHttpUrl`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/app/__tests__/bestPracticesCore.test.ts`. Put the `import`
in the file's top import block, not beside the `describe` — ESM hoists it
either way, but the file's existing convention is one import section.

```ts
// → top of file, with the other imports
import {
  matterhornLink,
  techniqueLink,
  understandingLink,
  safeLinks,
} from "../utils/bestPractices/links";

describe("link resolution", () => {
  it("names a Matterhorn checkpoint from the shipped protocol data", () => {
    const l = matterhornLink("13");
    expect(l).not.toBeNull();
    expect(l!.label).toMatch(/^Matterhorn 13 —/);
    expect(l!.url).toMatch(/^https:\/\//);
  });

  it("returns null for a checkpoint the protocol does not define", () => {
    expect(matterhornLink("99")).toBeNull();
  });

  it("builds a W3C technique link", () => {
    const l = techniqueLink("G141");
    expect(l.label).toBe("WCAG technique G141");
    expect(l.url).toBe("https://www.w3.org/WAI/WCAG22/Techniques/general/G141");
  });

  it("builds an Understanding link through the injected version-aware builder", () => {
    const l = understandingLink(
      "info-and-relationships",
      "Understanding 1.3.1",
      (s) => `https://www.w3.org/WAI/WCAG22/Understanding/${s}.html`,
    );
    expect(l!.url).toBe(
      "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html",
    );
  });

  it("drops links whose URL is not http(s) — the shared page's data is stored JSON", () => {
    const kept = safeLinks([
      { label: "ok", url: "https://example.org/a" },
      { label: "script", url: "javascript:alert(1)" },
      { label: "data", url: "data:text/html,<script>alert(1)</script>" },
      { label: "empty", url: "" },
    ]);
    expect(kept.map((l) => l.label)).toEqual(["ok"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test -- app/__tests__/bestPracticesCore.test.ts -t "link resolution"
```

Expected: FAIL — `Cannot find module '../utils/bestPractices/links'`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/utils/bestPractices/links.ts`:

```ts
/**
 * Where a reader goes to check the practice against the standard itself.
 *
 * Every URL leaves here through safeHttpUrl. On /report/[id] the surrounding
 * data is attacker-controlled stored JSON, and a link is the one thing on the
 * page a reader is invited to click.
 */
import { MATTERHORN_CHECKPOINTS } from "~/data/matterhorn";
import { safeHttpUrl } from "@file-audit/shared";
import type { BestPracticeLink } from "./types";

/** The PDF Association's Matterhorn Protocol landing page. Checkpoints are
 *  not separately addressable, so every checkpoint links here and carries its
 *  number and name in the label. */
const MATTERHORN_URL = "https://pdfa.org/resource/the-matterhorn-protocol/";

/** W3C techniques are filed by their letter prefix: G=general, PDF=pdf,
 *  H=html, F=failures. Only G and PDF are cited by this catalog. */
const TECHNIQUE_DIR: Record<string, string> = { G: "general", PDF: "pdf", H: "html", F: "failures" };

export function matterhornLink(id: string): BestPracticeLink | null {
  const cp = MATTERHORN_CHECKPOINTS.find((c) => c.id === id);
  if (!cp) return null;
  return { label: `Matterhorn ${cp.id} — ${cp.name}`, url: MATTERHORN_URL };
}

export function techniqueLink(code: string): BestPracticeLink {
  const prefix = /^[A-Z]+/.exec(code)?.[0] ?? "G";
  const dir = TECHNIQUE_DIR[prefix] ?? "general";
  return {
    label: `WCAG technique ${code}`,
    url: `https://www.w3.org/WAI/WCAG22/Techniques/${dir}/${code}`,
  };
}

export function understandingLink(
  slug: string,
  label: string,
  understandingUrl: (s: string) => string,
): BestPracticeLink | null {
  if (!slug) return null;
  return { label, url: understandingUrl(slug) };
}

/** Drop anything that is not a plain http(s) address. */
export function safeLinks(links: BestPracticeLink[]): BestPracticeLink[] {
  return links
    .map((l) => ({ ...l, url: safeHttpUrl(l.url) ?? "" }))
    .filter((l) => l.url !== "");
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter web test -- app/__tests__/bestPracticesCore.test.ts
```

Expected: PASS, 15 tests.

If `matterhornLink("13")` fails, read `apps/web/app/data/matterhorn.ts` and confirm the id format is the zero-padded two-digit string (`"13"`, not `"3"`). **Suspect the fixture before the code** — that has been right 4 times out of 4 on this repo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/utils/bestPractices/links.ts apps/web/app/__tests__/bestPracticesCore.test.ts
git commit -m "feat(report): link resolution for the best-practices catalog

Matterhorn checkpoints from the shipped protocol data, W3C techniques, and
version-aware Understanding pages. Every URL leaves through safeHttpUrl."
```

---

### Task 4: The PDF catalog

19 practices. This is the largest task; it is one task because the practices share a fixture corpus and a reviewer gates them together.

**Files:**
- Create: `apps/web/app/utils/bestPractices/pdf.ts`
- Test: `apps/web/app/__tests__/bestPracticesPdf.test.ts`

**Interfaces:**
- Consumes: everything from `./types` and `./links` (Tasks 2–3).
- Produces: `export const PDF_PRACTICES: BestPractice[]` — 19 entries. Task 6's `CATALOG` concatenates it.

**Practice ids** (later tasks and tests reference these verbatim):
`heading-level-order`, `heading-convention`, `heading-numbered-levels`, `heading-content`, `single-h1`, `reading-order-fidelity`, `bookmarks`, `font-embedding`, `display-doc-title`, `table-scope-simple`, `table-scope-with-headers`, `nested-tables`, `descriptive-link-text`, `raw-url-link-text`, `nested-structure-tree`, `character-mapping`, `content-in-tag-tree`, `list-labels`, `footnote-ids`.

- [ ] **Step 1: Write the failing test for the flagship practice**

Create `apps/web/app/__tests__/bestPracticesPdf.test.ts`:

```ts
/**
 * The PDF catalog, one describe per practice, four statuses each.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: an empty or unrecognised findings
 * list yields NOT CHECKED, never MET. The section renders every practice
 * always, which is only honest while a green check requires the analyzer to
 * have actually said so.
 *
 * Every fixture string below is copied VERBATIM from packages/analyzer. If a
 * test here fails after an analyzer change, the catalog's matcher is stale —
 * fix the matcher, do not loosen the test.
 */
import { describe, it, expect } from "vitest";
import { PDF_PRACTICES } from "../utils/bestPractices/pdf";
import { buildContext } from "../utils/bestPractices/types";

const practice = (id: string) => {
  const p = PDF_PRACTICES.find((x) => x.id === id);
  if (!p) throw new Error(`no practice with id "${id}"`);
  return p;
};

const run = (id: string, findings: string[], pageCount = 10) =>
  practice(id).detect(buildContext({ findings }, "pdf", pageCount));

// ---- verbatim analyzer output, packages/analyzer/src/scoring/pdf.ts -------

const HEADING_GAPS =
  "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 13-004), not a WCAG 2.1 failure, so your grade is not affected. Screen-reader users may still wonder what they missed at the skipped level.";
const HEADING_TREE_GROUP = [
  "--- Heading Tree ---",
  "  H1 → H2 → H1 → H1 → H3 → H5",
  "  Heading hierarchy skip: H1 → H3 (skipped H2)",
  "  Heading hierarchy skip: H3 → H5 (skipped H4)",
];
const HEADING_OK = "Found 6 heading tags with logical hierarchy";

describe("heading-level-order", () => {
  it("is NOT MET and shows the document's own heading sequence and each skip", () => {
    const r = run("heading-level-order", [HEADING_GAPS, ...HEADING_TREE_GROUP]);
    expect(r.status).toBe("not-met");
    // The specific thing an author asked to see.
    expect(r.block?.lines).toContain("H1 → H2 → H1 → H1 → H3 → H5");
    expect(r.evidence.join(" ")).toMatch(/H1 → H3 \(skipped H2\)/);
    expect(r.evidence.join(" ")).toMatch(/H3 → H5 \(skipped H4\)/);
    expect(r.fix?.source).toBeTruthy();
    expect(r.fix?.app).toBeTruthy();
  });

  it("is MET when the analyzer says the hierarchy is sound", () => {
    const r = run("heading-level-order", [HEADING_OK, ...HEADING_TREE_GROUP.slice(0, 2)]);
    expect(r.status).toBe("met");
    expect(r.block?.lines).toContain("H1 → H2 → H1 → H1 → H3 → H5");
  });

  it("is NOT APPLICABLE when the document has no headings at all", () => {
    const r = run("heading-level-order", [
      "No heading tags found in the document structure",
    ]);
    expect(r.status).toBe("not-applicable");
  });

  it("is NOT CHECKED — never MET — when the analyzer said nothing either way", () => {
    expect(run("heading-level-order", []).status).toBe("not-checked");
    expect(run("heading-level-order", ["Structure tree depth: 7 level(s)"]).status).toBe(
      "not-checked",
    );
  });
});

describe("every PDF practice", () => {
  it("returns NOT CHECKED for an empty document — silence is never a pass", () => {
    for (const p of PDF_PRACTICES) {
      const r = p.detect(buildContext({ findings: [] }, "pdf", 0));
      expect(r.status, `${p.id} must not claim a pass on silence`).not.toBe("met");
    }
  });

  it("never throws on malformed stored findings", () => {
    const hostile = [null, { findings: "nope" }, { findings: [1, null, {}] }, 42];
    for (const p of PDF_PRACTICES) {
      for (const c of hostile) {
        expect(() => p.detect(buildContext(c, "pdf", 0)), `${p.id}`).not.toThrow();
      }
    }
  });

  it("has unique ids, non-empty copy, and no forbidden phrasing", () => {
    const ids = PDF_PRACTICES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PDF_PRACTICES) {
      expect(p.label.length, p.id).toBeGreaterThan(0);
      expect(p.description.length, p.id).toBeGreaterThan(0);
      expect(p.why.length, p.id).toBeGreaterThan(0);
      const copy = `${p.label} ${p.description} ${p.why} ${p.standard ?? ""}`;
      // Nothing in this section is a legal obligation, and the product is
      // kept free of "strong".
      expect(copy, p.id).not.toMatch(/required by law/i);
      expect(copy, p.id).not.toMatch(/\bstrong\b/i);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test -- app/__tests__/bestPracticesPdf.test.ts
```

Expected: FAIL — `Cannot find module '../utils/bestPractices/pdf'`.

- [ ] **Step 3: Write `heading-level-order` and the file scaffold**

Create `apps/web/app/utils/bestPractices/pdf.ts`:

```ts
/**
 * The PDF best-practice catalog.
 *
 * Each entry reads the findings packages/analyzer already emits and turns
 * them into: a status for THIS document, the evidence behind it, and both
 * fix routes. Nothing here is scored, and nothing here may read as an
 * obligation — the grade measures WCAG 2.1 A/AA only.
 *
 * MATCHER ORDER IS LOAD-BEARING within a detect(): several analyzer lines
 * contain each other's keywords. Where that is true it is commented at the
 * site.
 */
import {
  matchAny,
  matchNotScored,
  signalLines,
  type BestPractice,
  type BestPracticeResult,
} from "./types";
import { matterhornLink, techniqueLink } from "./links";

/** The heading tree the analyzer prints as a technical signal — the exact
 *  "H1 → H2 → H1 → H1" sequence, lifted out of the collapsed panel and put
 *  next to the practice it is evidence for. */
function headingTreeBlock(ctx: Parameters<BestPractice["detect"]>[0]) {
  const lines = signalLines(ctx, "Heading Tree");
  // The first line is the level flow; the rest are the skip annotations.
  const flow = lines.find((l) => l.includes("→") && !l.startsWith("Heading hierarchy skip"));
  return flow ? { caption: "Your heading order, in document order", lines: [flow] } : undefined;
}

const notChecked = (why: string): BestPracticeResult => ({
  status: "not-checked",
  evidence: [why],
});

export const PDF_PRACTICES: BestPractice[] = [
  {
    id: "heading-level-order",
    formats: ["pdf"],
    categoryId: "heading_structure",
    label: "Heading level order",
    description:
      "Headings should step down one level at a time — H1, then H2, then H3. Jumping a level leaves a gap in the outline.",
    why: "Screen-reader users move through a document by jumping between headings. A skipped level reads as a missing section: they cannot tell whether they missed something or whether the document simply has a gap.",
    standard: "Matterhorn Protocol 13-004 · WCAG technique G141",
    links: [matterhornLink("13"), techniqueLink("G141")].filter(
      (l): l is NonNullable<typeof l> => l !== null,
    ),
    detect(ctx) {
      const gaps = matchNotScored(ctx, "level order has gaps");
      if (gaps) {
        const skips = signalLines(ctx, "Heading Tree").filter((l) =>
          l.startsWith("Heading hierarchy skip"),
        );
        return {
          status: "not-met",
          evidence: [
            "The heading levels in this document skip at least one step.",
            ...skips.map((s) => s.replace(/^Heading hierarchy skip:\s*/, "Skips a level: ")),
          ],
          block: headingTreeBlock(ctx),
          fix: {
            source:
              "In Word or InDesign, apply the built-in heading styles in order — do not jump from Heading 1 to Heading 3 — then re-export with tags on.",
            app: "In Acrobat's Tags panel, renumber the heading tags so the levels never skip a step.",
          },
        };
      }
      // The positive line. Only the analyzer's own words earn a pass.
      if (matchAny(ctx, "heading tags with logical hierarchy")) {
        return {
          status: "met",
          evidence: ["Every heading level steps down one at a time."],
          block: headingTreeBlock(ctx),
        };
      }
      if (matchAny(ctx, "no heading tags")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no heading tags, so there is no level order to check."],
        };
      }
      return notChecked("This document's heading levels were not evaluated.");
    },
  },
];
```

- [ ] **Step 4: Run the test — the flagship describe should pass, the sweeps should fail**

```bash
pnpm --filter web test -- app/__tests__/bestPracticesPdf.test.ts
```

Expected: the four `heading-level-order` tests PASS; the three `every PDF practice` tests PASS trivially (one entry). This confirms the shape before scaling.

- [ ] **Step 5: Commit the scaffold**

```bash
git add apps/web/app/utils/bestPractices/pdf.ts apps/web/app/__tests__/bestPracticesPdf.test.ts
git commit -m "feat(report): heading level order as the first catalogued best practice

Puts the heading tree the analyzer already computes next to the sentence it
is evidence for, with both fix routes."
```

- [ ] **Step 6: Add the remaining 18 PDF practices, one at a time**

For each, follow the same five-step cycle: write its `describe` with all four statuses using **verbatim** analyzer strings, run it red, implement the entry, run it green, commit.

Read the exact source string before writing each fixture:

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
grep -n "not scored\|not penalized" packages/analyzer/src/scoring/pdf.ts
grep -n "not scored" packages/analyzer/src/scoring/supplementary.ts
```

The matcher needle and positive line for each:

| id | NOT MET needle (`matchNotScored`) | MET needle (`matchAny`) | N/A needle | Evidence source |
|---|---|---|---|---|
| `heading-convention` | `generic <h> heading(s) appear alongside` | `heading tags with logical hierarchy` | `no heading tags` | count from the advisory |
| `heading-numbered-levels` | `only generic <h> tags were found` | `heading tags with logical hierarchy` | `no heading tags` | — |
| `heading-content` | `may not read as headings` | `heading tags with logical hierarchy` | `no heading tags` | `signalLines(ctx, "Do the Headings Read Like Headings")` |
| `single-h1` | *(none — see note)* | — | `no heading tags` | `matchAny(ctx, "h1 headings")` + `firstNumber` |
| `reading-order-fidelity` | `tagged order agreed with the content stream` | `reading-order fidelity` | `it is a form` | the percentage, via `firstNumber` |
| `bookmarks` | `pages and no bookmarks` | — | `pageCount < 10` | `ctx.pageCount`; `signalLines(ctx, "Bookmark Outline")` |
| `font-embedding` | `non-embedded font(s)` | `all fonts are embedded` | — | `signalLines(ctx, "Font Embedding")` |
| `display-doc-title` | `displaydoctitle viewer preference is off` | `title` in `main` | — | — |
| `table-scope-simple` | `header cell(s) across` + `have no /scope` | `all <th> cells have scope attributes` | `categoryPresent === false` | counts via `firstNumber` |
| `table-scope-with-headers` | `rely on /headers associations without /scope` | `all tables associate data cells with headers` | `categoryPresent === false` | count |
| `nested-tables` | `a nested table is not a wcag failure` | `all table(s) have proper row structure` | `categoryPresent === false` | — |
| `descriptive-link-text` | `link(s) use non-descriptive text` | `link(s) use descriptive text` | `categoryPresent === false` | `signalLines(ctx, "Links With Non-Descriptive Text")` |
| `raw-url-link-text` | `use the raw url as their visible text` | `link(s) use descriptive text` | `categoryPresent === false` | `signalLines(ctx, "Raw URL Link Text")` |
| `nested-structure-tree` | `the structure tree is flat` | `structure tree depth` in `main` | — | the depth measurement |
| `character-mapping` | `symbol-font bullets or dingbats` | — | — | `signalLines(ctx, "Character Mapping")` |
| `content-in-tag-tree` | `stray export residue` | — | — | `signalLines(ctx, "Content Outside the Tag Structure")` |
| `list-labels` | `have no <lbl>` | — | `categoryPresent === false` | `signalLines(ctx, "List Structure Analysis")` |
| `footnote-ids` | `note(s) have no /id` OR `note(s) reuse another note's /id` | — | `categoryPresent === false` | `signalLines(ctx, "Footnotes")` |

**`single-h1` is deliberately different.** The analyzer emits no not-scored prefix for it — the line is `Found N H1 headings. No WCAG criterion requires a single H1, so this does not affect the score…` in `main`. Match it with `matchAny(ctx, "h1 headings")`, read the count with `firstNumber`, and set NOT MET only when the count is greater than 1. It is a style convention, not a standard, so it carries **no** `standard` and **no** Matterhorn link — say plainly in `why` that many style guides recommend a single top-level heading and that PDF/UA explicitly permits repeated H1s.

**REAL-WORLD FIXTURE RULE — a NOT MET fixture must carry every line a real document emits, not just the one your matcher targets.**

`pdf.ts:924` pushes `` `Found ${levels.length} heading tags with logical hierarchy` `` **unconditionally** — after the `hierarchyBroken` block at :906 and after the content-verdict block at :915. So a document WITH skipped levels emits BOTH the gap advisory AND that positive line. The same is true for every heading practice: the mixed-conventions advisory (:893), the heading-content advisory (:920), and the multiple-H1 line (:880) are all emitted alongside :924.

Two consequences, both binding:

1. **Branch order inside `detect()` is load-bearing and must be commented at the site.** The NOT MET check must run BEFORE the MET check for all five heading practices. Reverse them and a document with skipped levels renders "Every heading level steps down one at a time" — the exact opposite of the truth, in user-facing copy.

2. **Every NOT MET fixture must include the positive line too.** A fixture of `[ADVISORY, ...TREE]` alone does NOT exercise the coexistence, so a branch reorder would keep the suite green. Write `[ADVISORY, ...TREE, POSITIVE]` and the test then genuinely pins the ordering.

Apply the same discipline to any practice whose category emits an unconditional summary line. Before writing a NOT MET fixture, read the scorer function end-to-end and include every line it would push for that document — a fixture that is a subset of reality tests less than it appears to.

**PARTITION MAP — which array each practice must actually search.** `partitionCardFindings` routes a finding by its FIRST CHARACTERS, before any keyword is considered: starts with `---` → opens a `signals` group; starts with two spaces → appended to the current `signals` group; otherwise starts with a not-scored prefix → `notScored`; otherwise → `main`. A non-indented line that FOLLOWS a `---` heading does **not** join that group — it falls through to `main`. Verified against the analyzer source on 2026-08-30:

| Practice | Lands in | Use | Why |
|---|---|---|---|
| `character-mapping` | **BOTH** | `matchNotScored` **and** `signalLines(ctx, "Character Mapping")` | pdf.ts:335 is un-indented (large count → `notScored`); pdf.ts:339 IS indented (small count → `signals`). One practice, two variants — check both, or a small-count document silently reads NOT CHECKED. |
| `content-in-tag-tree` | signals | `signalLines(ctx, "Content Outside the Tag Structure")` | pdf.ts:381 is indented |
| `footnote-ids` | signals | `signalLines(ctx, "Footnotes")` | supplementary.ts:257 and :262 are indented |
| `list-labels` | **`main`** | **`matchAny`**, NOT `matchNotScored` | supplementary.ts:205 begins `${withoutLabels} list(s) have no <Lbl>…` — no not-scored prefix at all, so it falls through to `main`. `matchNotScored` would never find it. |
| `raw-url-link-text` (PDF) | **`main`** | **`matchAny`**, NOT `matchNotScored` | pdf.ts:1995 begins `${rawUrls.length} link(s) use the raw URL…` — un-prefixed, so `main`. **The Office variants differ**: docx/pptx/xlsx use `"Advisory — not scored against you:"`, which IS prefixed and lands in `notScored`. One implementation does not serve both. |

**NOT APPLICABLE — the exact needles, and one dangerous collision.** Verified against `packages/analyzer/src/scoring/pdf.ts` on 2026-08-30:

| Practice group | Exact N/A line | Safe needle |
|---|---|---|
| headings | `No heading tags found in the document structure` (pdf.ts:777) | `no heading tags` |
| tables | `No tables detected in this document — this category does not affect the score` (pdf.ts:1511) | **`no tables detected in this document`** — see the warning below |
| links | `No links found in this document — this category does not affect the score` (pdf.ts:1900) | `no links found in this document` |
| images | `No images detected in this document — this category does not affect the score` (pdf.ts:1141) | `no images detected in this document` |
| reading order (form) | `Not scored for this document: it is a form (${n} field(s))…` (pdf.ts:2263) | `it is a form` |
| reading order (no data) | `Automated reading-order verification could not be performed…` (pdf.ts:2307) | `could not be performed` → this is **NOT CHECKED**, not NOT APPLICABLE |

🚫 **NEVER use `"no tables"` as the N/A needle.** Two opposite strings begin with it:

- pdf.ts:1511 — `No tables detected in this document…` → genuinely NOT APPLICABLE
- pdf.ts:1642 — `No tables have <TR> row structure — cells are not grouped into rows, which breaks screen reader table navigation` → a **FAILURE**

A `"no tables"` needle matches both, so a document with structurally broken tables would be reported as having no tables at all — a false all-clear on a real defect. Match the full phrase `no tables detected in this document`. The Office scorers have no such collision (`No tables were found.` is unambiguous there), which is exactly why a PDF needle must never be reused for Office or vice versa.

**COUNTS — `firstNumber` is naive; these are the only safe call sites.** `firstNumber` returns the FIRST digit run anywhere in the string, with no semantics. It is SAFE on the lines below only because the not-scored prefixes contain no digits and the count leads the sentence. Verified 2026-08-30:

| Line | Safe? | Note |
|---|---|---|
| pdf.ts:288 fonts, :893 generic `<H>`, :908 gaps, :920 sound-order, :1473 bookmarks, :1701 `/Headers`, :2290 reading order | ✅ safe | first digit run IS the count (`2.1` in the bookmarks line comes after the page count) |
| pdf.ts:1692 `/Scope` | ⚠️ **two** counts | `${cells} header cell(s) across ${n} table(s)` — `firstNumber` returns only the cells. Match both with a targeted regex at the call site. |
| pdf.ts:1952 links | ⚠️ **two** counts | `${needsFix} of ${total} link(s)` — same treatment. |
| pdf.ts:441 DisplayDocTitle, :833 generic-only, :1755 nested tables, :2204 flat tree | 🚫 **never call `firstNumber`** | these carry NO count. :441 ends "(clause 7.1)" and would render **7** as if it were a count. These practices state their evidence in words, not numbers. |

Where a count cannot be read, write the sentence countless ("This document contains merged or split table cells") rather than guessing — the project's standing rule is that every number is computed or the copy is countless.

Every other PDF practice in the table above reads `notScored` via `matchNotScored` — each confirmed un-indented and prefixed at its source line. Re-verify any needle you are unsure of with `sed -n '<line>p' packages/analyzer/src/scoring/pdf.ts | cat -A | head -1` (a leading `  ` means signals).

- [ ] **Step 7: Run the whole PDF suite**

```bash
pnpm --filter web test -- app/__tests__/bestPracticesPdf.test.ts
```

Expected: PASS. `PDF_PRACTICES.length === 19`; add that assertion to the `every PDF practice` describe.

- [ ] **Step 8: Sabotage-verify the central guard**

A gate that has only ever passed proves nothing. Temporarily change one `detect()`'s fallback from `notChecked(...)` to `{ status: "met", evidence: [] }`, run the suite, and confirm `every PDF practice → returns NOT CHECKED for an empty document` FAILS. Then revert.

```bash
pnpm --filter web test -- app/__tests__/bestPracticesPdf.test.ts -t "silence is never a pass"
```

Expected while sabotaged: FAIL naming the practice. Expected after revert: PASS. **Do not commit the sabotage.** Note in the commit body that the guard was proven able to fire.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/utils/bestPractices/pdf.ts apps/web/app/__tests__/bestPracticesPdf.test.ts
git commit -m "feat(report): the 19 PDF best practices

Each reads the analyzer's existing findings and reports a status for this
document with the evidence behind it. Sabotage-verified: forcing any
detect() to fall back to MET fails the silence-is-never-a-pass guard."
```

---

### Task 5: The Office catalog

19 practices across Word, PowerPoint, and Excel. Six of them are the `"Note — not scored:"` lines Task 1 unblocked.

**Files:**
- Create: `apps/web/app/utils/bestPractices/office.ts`
- Test: `apps/web/app/__tests__/bestPracticesOffice.test.ts`

**Interfaces:**
- Consumes: `./types`, `./links`.
- Produces: `export const OFFICE_PRACTICES: BestPractice[]` — 19 entries.

**Practice ids:** Word — `docx-first-heading-is-h1`, `docx-heading-skips`, `docx-empty-headings`, `docx-empty-paragraph-runs`, `docx-layout-grids`, `docx-nested-tables`, `docx-merged-cells`, `docx-empty-table-rows`, `docx-raw-url-link-text`. PowerPoint — `pptx-slide-titles`, `pptx-distinct-slide-titles`, `pptx-raw-url-link-text`. Excel — `xlsx-sheet-names`, `xlsx-defined-tables`, `xlsx-data-outside-tables`, `xlsx-pivot-tables`, `xlsx-data-start`, `xlsx-merged-cells`, `xlsx-raw-url-link-text`.

- [ ] **Step 1: Read the exact analyzer strings**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
grep -n "not scored" packages/analyzer/src/scoring/docx.ts
grep -n "not scored" packages/analyzer/src/scoring/pptx.ts
grep -n "not scored" packages/analyzer/src/scoring/xlsx.ts
```

Copy each into the test file verbatim. Do not paraphrase — a paraphrased fixture passes while the real string does not match.

- [ ] **Step 2: Write the failing test**

Create `apps/web/app/__tests__/bestPracticesOffice.test.ts` with the same shape as `bestPracticesPdf.test.ts`: one `describe` per practice covering all four statuses, plus the three sweeps (`silence is never a pass`, `never throws`, `unique ids and no forbidden phrasing`). Add a fourth sweep asserting the format gating:

```ts
it("gates each practice to its own format", () => {
  for (const p of OFFICE_PRACTICES) {
    expect(p.formats.length, p.id).toBeGreaterThan(0);
    expect(p.formats.every((f) => ["docx", "pptx", "xlsx"].includes(f)), p.id).toBe(true);
    if (p.id.startsWith("docx-")) expect(p.formats).toEqual(["docx"]);
    if (p.id.startsWith("pptx-")) expect(p.formats).toEqual(["pptx"]);
    if (p.id.startsWith("xlsx-")) expect(p.formats).toEqual(["xlsx"]);
  }
});
```

Include this specific regression test for Task 1's fix:

```ts
describe("the six 'Note — not scored' lines Task 1 unblocked", () => {
  it("reads Word merged cells out of the not-scored partition", () => {
    const r = practice("docx-merged-cells").detect(
      buildContext(
        {
          findings: [
            "Note — not scored: 12 merged cell(s) across the table(s). Merged and split cells can confuse screen-reader navigation (Microsoft's own checker flags them); whether they harm depends on placement — review manually.",
          ],
        },
        "docx",
        0,
      ),
    );
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/12/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter web test -- app/__tests__/bestPracticesOffice.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `office.ts`, one practice at a time**

A complete worked entry — every other practice in this file follows this exact
shape, changing only the id, category, copy, needles, and evidence:

```ts
/**
 * The Word, PowerPoint, and Excel best-practice catalog.
 *
 * Six of these read "Note — not scored:" lines that only reached the
 * not-scored partition on 2026-08-30. Before that fix they rendered under the
 * Tier-1 heading claiming the score measures them.
 */
import {
  firstNumber,
  matchAny,
  matchNotScored,
  type BestPractice,
  type BestPracticeResult,
} from "./types";

const notChecked = (why: string): BestPracticeResult => ({ status: "not-checked", evidence: [why] });

export const OFFICE_PRACTICES: BestPractice[] = [
  {
    id: "docx-merged-cells",
    formats: ["docx"],
    categoryId: "table_markup",
    label: "Merged and split table cells",
    description:
      "A merged cell spans more than one row or column, so the grid a screen reader walks no longer matches the grid a sighted reader sees.",
    why: "Someone listening to a table moves cell by cell and hears each one announced with its headers. Where cells are merged, that announcement can name the wrong header or skip a position entirely. Whether it actually causes trouble depends on where the merge sits, which is why this is reported for review rather than counted.",
    // No standard is cited: no WCAG criterion and no PDF/UA clause forbids a
    // merged cell. Microsoft's own checker flags them, and that is the whole
    // basis — say so in `why`, claim nothing more.
    links: [],
    detect(ctx) {
      const line = matchNotScored(ctx, "merged cell(s) across the table");
      if (line) {
        const n = firstNumber(line);
        return {
          status: "not-met",
          evidence: [
            n === null
              ? "This document contains merged or split table cells."
              : `This document has ${n} merged cell${n === 1 ? "" : "s"} across its tables.`,
            "Check each one with a screen reader: confirm every data cell is still announced with the header that belongs to it.",
          ],
          fix: {
            source:
              "In Word, select the merged cell and choose Layout → Split Cells, so each row has one cell per column. Where the merge is a visual grouping rather than data, consider splitting the table in two.",
            app: "Merged cells cannot be reliably unpicked after export — fix this in the Word file and re-export.",
          },
        };
      }
      // NO MET BRANCH, deliberately. scoreDocxTables emits only
      // "No tables were found.", "N table(s) found.", and the missing-header
      // line — it has no "no merged cells" positive. Under the catalog's
      // central rule, a practice with no positive line from its own scorer
      // can never be MET: silence is not a pass. This one reports NOT MET,
      // NOT APPLICABLE, or NOT CHECKED only.
      if (!ctx.categoryPresent || matchAny(ctx, "no tables were found")) {
        return {
          status: "not-applicable",
          evidence: ["This document has no tables."],
        };
      }
      return notChecked(
        "This document has tables, but they were not checked for merged cells.",
      );
    },
  },
];
```

**WITNESS LINES — how a practice earns MET when the scorer has no "all clear" line.**

Most Office scorers never say "this is clean"; they emit advisory prose when something is wrong and nothing when it is not. Taken naively that leaves a flawless Word document showing nine grey NOT CHECKED rows and nothing green, which reads as "this tool checked nothing" — worse than saying nothing at all.

The fix is a **witness line**: a census line proving the scorer examined this aspect of the document. Where one exists, `MET = witness present AND no advisory`.

**The qualifying rule, and it is strict.** A line is a valid witness ONLY if the scorer emits it *unconditionally whenever it runs* — never only when it finds a problem. This is exactly the distinction that inverted `heading-content` in the PDF catalog: its `--- Do the Headings Read Like Headings? ---` group is pushed only *after* an early return for the clean case, so gating MET on it meant MET fired only on flagged documents. Before using any line as a witness, read its scorer and confirm it is pushed before, and independently of, every advisory branch.

Verified witnesses (2026-08-30):

| Witness | Emitted | Serves |
|---|---|---|
| `${total} real heading(s) found.` — docx.ts:162 | unconditionally once `total > 0`, before every advisory | `docx-first-heading-is-h1`, `docx-heading-skips`, `docx-empty-headings` |
| `${a.tables.length} table(s) found.` — docx.ts:290 | unconditionally once tables exist (the no-tables case early-returns above) | `docx-layout-grids`, `docx-nested-tables`, `docx-merged-cells`, `docx-empty-table-rows` |

Check every remaining Office practice for a witness of its own the same way. Where none qualifies, keep NOT CHECKED — an unqualified witness is worse than none, because it produces the inverted gate.

**A witness-backed MET must say what was actually established**, not more. "This document's tables were checked and none use merged or split cells." — not "this document is accessible".

**The verified Office positive lines.** Each format's MET branch may use only
its OWN scorer's positive line. Never reuse a PDF string — `"All N table(s)
have proper row structure"` and `"All N link(s) use descriptive text"` are
`pdf.ts` only. Confirmed present on 2026-08-30:

| Format | Positive line (MET) | "None of the thing" line (NOT APPLICABLE) |
|---|---|---|
| Excel | `` `All ${n} visible sheet(s) have descriptive names.` `` | `"No visible sheets were found."` · `"No tables or sizable data ranges were found."` · `"No hyperlinks were found."` |
| PowerPoint | `` `All ${n} visible slide(s) have a distinct title.` `` · `"Every titled slide's title reads first in tab order."` | `"No slides were found."` · `"No tables were found."` |
| Word | — its table scorer has **no** positive line | `"No tables were found."` |

Where a format emits no positive line for a practice, **drop the MET branch
entirely**, as the worked example above does — that practice reports NOT MET,
NOT APPLICABLE, or NOT CHECKED only. Verify each with:

```bash
grep -oE '`(All|No|Every|Found)[^`]{0,120}`|"(All|No|Every|Found)[^"]{0,120}"' \
  packages/analyzer/src/scoring/<format>.ts
```

**PARTITION AND COUNT MAP FOR OFFICE — verified against source 2026-08-30.** Unlike the PDF catalog, the Office side is uniform: **every** advisory listed below is prefixed and un-indented, so all of them land in `notScored` and `matchNotScored` is the right matcher throughout. No `signalLines` calls are needed anywhere in this file.

Sources: docx.ts:90, 169, 178, 184, 298, 305, **311**, **316**, 361 · pptx.ts:154, 168, 474 · xlsx.ts:171, 232, **236**, **243**, **259**, **273**, 450. (The six in bold are the `"Note — not scored:"` lines that only started reaching this partition after Task 1.) The two `"Interactive form fields need accessible labels…"` lines — docx.ts:498, xlsx.ts:482 — are explanatory prose, not practices; they are not in this catalog.

`firstNumber` safety on the Office lines:

| Line | Safe? | Note |
|---|---|---|
| docx:90, :178, :184, :298, :361 · pptx:168, :474 · xlsx:243, :273, :450 | ✅ safe | the leading digit run IS the count |
| docx:311, :316 | ✅ safe | `"Note — not scored:"` carries no digits |
| docx:169 first-heading | ✅ safe, but it is a LEVEL not a count | `"the first heading is Heading ${level}, not Heading 1"` — say "starts at Heading 3", never "3 headings" |
| **xlsx:171 sheet names** | 🚫 **never call `firstNumber`** | `rename "${s.name}" to describe its contents` — the evidence is the sheet NAME, and a default name like `Sheet1` would make `firstNumber` return **1** as if it were a count. Extract the quoted name instead. Emitted once PER SHEET, so collect every matching line with a filter over `ctx.notScored`, not just the first. |
| **pptx:154 untitled slides** | 🚫 **never call `firstNumber`** | the evidence is a LIST of slide numbers (`slides 3, 7, 12`); `firstNumber` would return only the first. Quote the list. |
| xlsx:232, :236 | — | no count; state in words |

Notes that will otherwise cost a debugging cycle:

- The Word and PowerPoint raw-URL lines use the prefix **`"Advisory — not scored against you:"`**. That starts with `"advisory — not scored"`, so `isNotScoredFinding` already claims it and `matchNotScored` works — but the needle must be `use the raw url as their visible text` / `show the raw url as their visible text`, which differ between `docx.ts` (`show`) and `pptx.ts`/`xlsx.ts` (`show`). Match on `raw url as their visible text`, which is common to all three.
- The PowerPoint untitled-slides advisory is built from a template expression spanning several lines (`pptx.ts:154`). Read the assembled string, not the source lines.
- `xlsx-sheet-names` is emitted **once per sheet**, so `matchNotScored` returns only the first. Collect all of them with a filter over `ctx.notScored` and list each renamed sheet as separate evidence.

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter web test -- app/__tests__/bestPracticesOffice.test.ts
```

Expected: PASS. Assert `OFFICE_PRACTICES.length === 19`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/utils/bestPractices/office.ts apps/web/app/__tests__/bestPracticesOffice.test.ts
git commit -m "feat(report): the 19 Word, PowerPoint, and Excel best practices

Includes the six 'Note — not scored' lines that reached the not-scored
partition for the first time in this branch."
```

---

### Task 6: The catalog's public surface

One import surface. Consumers never reach into a format file.

**Files:**
- Create: `apps/web/app/utils/bestPractices/index.ts`
- Test: append to `apps/web/app/__tests__/bestPracticesCore.test.ts`

**Interfaces:**
- Consumes: `PDF_PRACTICES`, `OFFICE_PRACTICES`, `buildContext`, all types.
- Produces:
  - `export const CATALOG: BestPractice[]`
  - `interface EvaluatedPractice extends BestPracticeResult { practice: BestPractice }`
  - `evaluateBestPractices(result: unknown): EvaluatedPractice[]`
  - `interface BestPracticeSummary { met: number; notMet: number; notApplicable: number; notChecked: number; total: number }`
  - `summarizeBestPractices(rows: EvaluatedPractice[]): BestPracticeSummary`
  - Re-exports of every type from `./types`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/app/__tests__/bestPracticesCore.test.ts`:

```ts
import {
  CATALOG,
  evaluateBestPractices,
  summarizeBestPractices,
} from "../utils/bestPractices";

describe("evaluateBestPractices", () => {
  const pdfReport = {
    fileType: "pdf",
    pageCount: 40,
    categories: [
      {
        id: "heading_structure",
        label: "Heading Structure",
        findings: [
          "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 13-004), not a WCAG 2.1 failure, so your grade is not affected.",
          "--- Heading Tree ---",
          "  H1 → H2 → H1 → H1",
        ],
      },
    ],
  };

  it("returns only the practices for the report's own format", () => {
    const rows = evaluateBestPractices(pdfReport);
    expect(rows.length).toBe(CATALOG.filter((p) => p.formats.includes("pdf")).length);
    expect(rows.every((r) => r.practice.formats.includes("pdf"))).toBe(true);
    expect(rows.some((r) => r.practice.id.startsWith("docx-"))).toBe(false);
  });

  it("evaluates each practice against its own category", () => {
    const rows = evaluateBestPractices(pdfReport);
    const order = rows.find((r) => r.practice.id === "heading-level-order");
    expect(order?.status).toBe("not-met");
    expect(order?.block?.lines).toContain("H1 → H2 → H1 → H1");
  });

  it("returns nothing for a page-audit row with no categories", () => {
    expect(evaluateBestPractices({ fileType: "pdf" })).toEqual([]);
    expect(evaluateBestPractices({ fileType: "pdf", categories: [] })).toEqual([]);
  });

  it("returns nothing for an unknown or absent file type", () => {
    expect(evaluateBestPractices({ categories: [{ id: "x", findings: [] }] })).toEqual([]);
    expect(evaluateBestPractices(null)).toEqual([]);
    expect(evaluateBestPractices("hostile")).toEqual([]);
  });

  it("never throws on a forged stored report", () => {
    const hostile = [
      { fileType: "pdf", categories: "not an array" },
      { fileType: "pdf", categories: [null, 42, "x"] },
      { fileType: 99, categories: [{ findings: [1] }] },
    ];
    for (const h of hostile) expect(() => evaluateBestPractices(h)).not.toThrow();
  });
});

describe("summarizeBestPractices", () => {
  it("counts each status and totals them", () => {
    const rows = evaluateBestPractices({
      fileType: "pdf",
      pageCount: 40,
      categories: [{ id: "heading_structure", findings: ["Found 6 heading tags with logical hierarchy"] }],
    });
    const s = summarizeBestPractices(rows);
    expect(s.met + s.notMet + s.notApplicable + s.notChecked).toBe(s.total);
    expect(s.total).toBe(rows.length);
    expect(s.met).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test -- app/__tests__/bestPracticesCore.test.ts -t "evaluateBestPractices"
```

Expected: FAIL — module not found.

**REQUIRED ADDITIONAL TEST — the feature's central claim.** The whole point of this section is that a document can satisfy WCAG 2.1 and still have work worth doing. Prove it here, at the level where a whole report is evaluated:

```ts
describe("a document that PASSES WCAG still has best practices to meet", () => {
  // A report with NO failing WCAG criterion — the grade is A, the score is
  // 100, conformance.failures is empty — that nonetheless carries several
  // not-scored advisories. This is the exact shape the section exists for.
  const wcagCleanButImperfect = {
    fileType: "pdf",
    pageCount: 40,
    overallScore: 100,
    grade: "A",
    conformance: { failures: [], notAssessed: [] },
    categories: [
      {
        id: "heading_structure",
        label: "Heading Structure",
        score: 100,
        grade: "A",
        severity: "No issues found",
        findings: [
          "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 13-004), not a WCAG 2.1 failure, so your grade is not affected.",
          "--- Heading Tree ---",
          "  H1 → H2 → H1 → H1 → H3 → H5",
          "--- Heading Outline ---",
          "  Heading hierarchy skip: H1 → H3 (skipped H2)",
          "Found 6 heading tags with logical hierarchy",
        ],
      },
      {
        id: "bookmarks",
        label: "Bookmarks",
        score: 100,
        grade: "A",
        severity: "No issues found",
        findings: [
          "Advisory — not scored: this document has 40 pages and no bookmarks. No WCAG 2.1 criterion requires bookmarks in a single document (2.4.5 Multiple Ways applies to sets of pages), so your grade is not affected.",
        ],
      },
    ],
  };

  it("reports unmet best practices even though no WCAG criterion is failing", () => {
    const rows = evaluateBestPractices(wcagCleanButImperfect);
    const notMet = rows.filter((r) => r.status === "not-met");
    expect(notMet.length).toBeGreaterThan(0);
    expect(notMet.map((r) => r.practice.id)).toContain("heading-level-order");
    expect(notMet.map((r) => r.practice.id)).toContain("bookmarks");
  });

  it("carries the document's own evidence on each unmet row", () => {
    const rows = evaluateBestPractices(wcagCleanButImperfect);
    const order = rows.find((r) => r.practice.id === "heading-level-order");
    expect(order?.block?.lines.join(" ")).toContain("H1 → H2 → H1 → H1 → H3 → H5");
    expect(order?.evidence.join(" ")).toMatch(/H1 → H3 \(skipped H2\)/);
  });

  it("never marks an unmet best practice as a WCAG obligation", () => {
    const rows = evaluateBestPractices(wcagCleanButImperfect);
    for (const r of rows) {
      const copy = `${r.practice.label} ${r.practice.description} ${r.practice.why} ${r.evidence.join(" ")}`;
      expect(copy, r.practice.id).not.toMatch(/required by law/i);
      expect(copy, r.practice.id).not.toMatch(/WCAG 2\.1 failure/i);
    }
  });
});
```

Write the equivalent for a WCAG-clean **Word** report (skipped heading levels plus merged cells, both advisory-only) so the claim is proven for the Office half too.

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/utils/bestPractices/index.ts`:

```ts
/**
 * The catalog's only import surface.
 *
 * Consumers pass a whole report and get back one row per practice that
 * applies to its format, already evaluated. Everything is narrowed here so a
 * component never has to: /report/[id] renders stored JSON server-side.
 */
import { PDF_PRACTICES } from "./pdf";
import { OFFICE_PRACTICES } from "./office";
import { buildContext, type BestPractice, type BestPracticeResult } from "./types";
import type { FileType } from "@file-audit/shared";

export * from "./types";
export const CATALOG: BestPractice[] = [...PDF_PRACTICES, ...OFFICE_PRACTICES];

export interface EvaluatedPractice extends BestPracticeResult {
  practice: BestPractice;
}

export interface BestPracticeSummary {
  met: number;
  notMet: number;
  notApplicable: number;
  notChecked: number;
  total: number;
}

const FILE_TYPES: FileType[] = ["pdf", "docx", "pptx", "xlsx"];

export function evaluateBestPractices(result: unknown): EvaluatedPractice[] {
  const r = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
  if (!r) return [];

  const fileType = r.fileType;
  if (typeof fileType !== "string" || !FILE_TYPES.includes(fileType as FileType)) return [];
  const ft = fileType as FileType;

  // A page-audit row shares the shared_reports table and carries no
  // categories. No categories, no evidence, no section.
  const categories = Array.isArray(r.categories) ? r.categories : [];
  if (categories.length === 0) return [];

  const pageCount = typeof r.pageCount === "number" ? r.pageCount : 0;
  const byId = new Map<string, unknown>();
  for (const c of categories) {
    if (c && typeof c === "object") {
      const id = (c as Record<string, unknown>).id;
      if (typeof id === "string") byId.set(id, c);
    }
  }

  return CATALOG.filter((p) => p.formats.includes(ft)).map((practice) => {
    const ctx = buildContext(byId.get(practice.categoryId), ft, pageCount);
    return { practice, ...practice.detect(ctx) };
  });
}

export function summarizeBestPractices(rows: EvaluatedPractice[]): BestPracticeSummary {
  const s: BestPracticeSummary = { met: 0, notMet: 0, notApplicable: 0, notChecked: 0, total: rows.length };
  for (const r of rows) {
    if (r.status === "met") s.met++;
    else if (r.status === "not-met") s.notMet++;
    else if (r.status === "not-applicable") s.notApplicable++;
    else s.notChecked++;
  }
  return s;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter web test -- app/__tests__/bestPracticesCore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm typecheck
git add apps/web/app/utils/bestPractices/index.ts apps/web/app/__tests__/bestPracticesCore.test.ts
git commit -m "feat(report): evaluateBestPractices — the catalog's public surface

Format-gated, category-matched, and narrowed at the boundary. A page-audit
row with no categories yields no rows."
```

---

### Task 7: The BestPracticesSection component

**Files:**
- Create: `apps/web/app/components/BestPracticesSection.vue`
- Test: `apps/web/app/__tests__/bestPracticesSection.test.ts`

**Interfaces:**
- Consumes: `evaluateBestPractices`, `summarizeBestPractices`, `EvaluatedPractice` from `~/utils/bestPractices`; `safeLinks` from `~/utils/bestPractices/links`; `useWcag`.
- Produces: a component taking `defineProps<{ result: unknown }>()` and rendering nothing when `evaluateBestPractices` returns `[]`.
- DOM contract later tasks and tests assert:
  - root `data-testid="best-practices"`
  - summary `data-testid="best-practices-summary"`
  - one row per practice, `data-practice="<id>"`, with `data-status="<status>"`
  - the disclosure button `aria-expanded` / `aria-controls`, body id `bp-body-<id>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/bestPracticesSection.test.ts`:

```ts
/**
 * The Best Practices scorecard.
 *
 * Pinned here: it never reads as an obligation, it renders every status
 * distinctly, a MET row never appears without the analyzer having said so,
 * and the section self-hides when there is nothing to show.
 */
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BestPracticesSection from "../components/BestPracticesSection.vue";

const pdfResult = {
  fileType: "pdf",
  pageCount: 40,
  categories: [
    {
      id: "heading_structure",
      label: "Heading Structure",
      findings: [
        "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 13-004), not a WCAG 2.1 failure, so your grade is not affected.",
        "--- Heading Tree ---",
        "  H1 → H2 → H1 → H1",
        "  Heading hierarchy skip: H1 → H3 (skipped H2)",
      ],
    },
  ],
};

const mountSection = (result: unknown) =>
  mount(BestPracticesSection, { props: { result } });

describe("BestPracticesSection", () => {
  it("renders the practice, its status, and the document's own heading order", () => {
    const w = mountSection(pdfResult);
    const row = w.find('[data-practice="heading-level-order"]');
    expect(row.exists()).toBe(true);
    expect(row.attributes("data-status")).toBe("not-met");
    expect(w.text()).toContain("H1 → H2 → H1 → H1");
  });

  it("never reads as a legal obligation", () => {
    const html = mountSection(pdfResult).html();
    expect(html).not.toMatch(/required by law/i);
    expect(html).not.toMatch(/REQUIRED BY WCAG/i);
    expect(html).toMatch(/not scored/i);
  });

  it("states plainly that none of it affected the grade", () => {
    expect(mountSection(pdfResult).text()).toMatch(/none of (this|it) affected your grade/i);
  });

  it("computes the summary counts rather than hardcoding them", () => {
    const w = mountSection(pdfResult);
    const summary = w.find('[data-testid="best-practices-summary"]');
    expect(summary.exists()).toBe(true);
    const rows = w.findAll("[data-practice]");
    const notMet = w.findAll('[data-status="not-met"]').length;
    expect(summary.text()).toContain(String(notMet));
    expect(rows.length).toBeGreaterThan(1);
  });

  it("renders every status with its own label", () => {
    // NOTE the category ids: font embedding lives under text_extractability.
    // There is no "fonts" category — see the Category ID Reference.
    const w = mountSection({
      fileType: "pdf",
      pageCount: 2,
      categories: [
        { id: "heading_structure", findings: ["Found 3 heading tags with logical hierarchy"] },
        {
          id: "text_extractability",
          findings: [
            "All fonts are embedded — text will render correctly regardless of the user's installed fonts",
          ],
        },
      ],
    });
    expect(w.find('[data-status="met"]').exists()).toBe(true);
    expect(w.find('[data-status="not-checked"]').exists()).toBe(true);
    expect(w.text()).toMatch(/not checked/i);
  });

  it("expands and collapses a row", async () => {
    const w = mountSection(pdfResult);
    const btn = w.find('[data-practice="heading-level-order"] button');
    expect(btn.attributes("aria-expanded")).toBe("false");
    await btn.trigger("click");
    expect(btn.attributes("aria-expanded")).toBe("true");
    expect(w.find("#bp-body-heading-level-order").isVisible()).toBe(true);
    await btn.trigger("click");
    expect(btn.attributes("aria-expanded")).toBe("false");
  });

  it("renders nothing at all when there is nothing to show", () => {
    expect(mountSection({ fileType: "pdf" }).find('[data-testid="best-practices"]').exists()).toBe(false);
    expect(mountSection(null).find('[data-testid="best-practices"]').exists()).toBe(false);
  });

  it("does not throw on a forged stored report", () => {
    expect(() => mountSection({ fileType: "pdf", categories: "nope" })).not.toThrow();
    expect(() => mountSection({ fileType: 42, categories: [null] })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web test -- app/__tests__/bestPracticesSection.test.ts
```

Expected: FAIL — component not found.

- [ ] **Step 3: Write the component**

Create `apps/web/app/components/BestPracticesSection.vue`. The row markup
carries the DOM contract every other task asserts against, so it is given in
full — the rest of the template follows from the requirements below it.

```vue
<template>
  <section
    v-if="rows.length"
    data-testid="best-practices"
    class="rounded-2xl border-2 border-sky-500/40 bg-sky-500/5 px-5 sm:px-6 py-5"
    aria-labelledby="best-practices-title"
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span aria-hidden="true" class="text-2xl leading-none text-sky-400">○</span>
      <h2 id="best-practices-title" class="text-lg sm:text-xl font-bold text-[var(--text-heading)] m-0">
        Best practices — not scored
      </h2>
      <span
        class="text-[11px] font-bold px-2.5 py-1 rounded-full border border-sky-500/50 text-sky-400 whitespace-nowrap tracking-wide"
        >BEST PRACTICE — NOT SCORED</span
      >
    </div>

    <p class="text-sm text-[var(--text-muted)] mt-2.5 leading-relaxed">
      The numbered fixes above are everything WCAG 2.1 — the standard Illinois (IITAA) and federal
      law (ADA Title II) require — asks of this document. Everything here is optional work that
      helps real readers.
      <strong class="font-semibold text-[var(--text-secondary)]"
        >None of this affected your grade.</strong
      >
    </p>

    <!-- Counts come from the rendered rows, never a literal. -->
    <div class="mt-3.5 flex flex-wrap gap-2" data-testid="best-practices-summary">
      <span
        v-for="chip in summaryChips"
        :key="chip.key"
        class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-[var(--text-secondary)]"
      >
        <span class="text-sky-400 font-bold">{{ chip.count }}</span> {{ chip.label }}
      </span>
    </div>

    <ul class="mt-4 space-y-2 list-none p-0 m-0">
      <li
        v-for="row in rows"
        :key="row.practice.id"
        :data-practice="row.practice.id"
        :data-status="row.status"
        class="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-deep)]"
      >
        <button
          type="button"
          class="w-full flex items-center gap-2 text-left px-3 py-2.5 cursor-pointer"
          :aria-expanded="open.has(row.practice.id) ? 'true' : 'false'"
          :aria-controls="`bp-body-${row.practice.id}`"
          @click="toggle(row.practice.id)"
        >
          <span aria-hidden="true" class="flex-shrink-0" :class="statusIconClass(row.status)">{{
            statusIcon(row.status)
          }}</span>
          <span class="flex-1 text-sm font-semibold text-[var(--text-heading)]">{{
            row.practice.label
          }}</span>
          <span
            class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap border"
            :class="statusPillClass(row.status)"
            >{{ statusLabel(row.status) }}</span
          >
          <span
            class="text-xs text-[var(--link)] whitespace-nowrap w-[72px] text-right flex-shrink-0"
            data-export-exclude
            >{{ open.has(row.practice.id) ? "Hide" : "Show" }}</span
          >
        </button>

        <div
          v-show="open.has(row.practice.id)"
          :id="`bp-body-${row.practice.id}`"
          class="px-3 pb-3 space-y-2"
        >
          <!-- What this is / Your document / Why it matters / Does this affect
               my grade? / How to fix / Read more — in that order. The evidence
               block is a REAL <pre>: prettier reflows a whitespace-pre div,
               which collapsed 12 blocks in this repo before (v1.53.0). -->
          <pre
            v-if="row.block"
            class="text-xs font-mono text-[var(--text-secondary)] bg-[var(--surface-raised)] rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap"
            >{{ row.block.lines.join("\n") }}</pre
          >
        </div>
      </li>
    </ul>
  </section>
</template>
```

**NOT MET MUST READ AS "WORTH DOING", NEVER AS A FAILURE.** Nothing in this section is scored, so no row is a failure — but three practices make that especially load-bearing, because an author can never reach MET on them at all: `docx-layout-grids`, `xlsx-pivot-tables` and `xlsx-merged-cells` all mean "a person should look at this", and `office.ts` says so outright ("No structural fix applies"). A workbook containing pivot tables will therefore carry that row for the rest of its life, no matter what its author does.

Rather than add a fifth status, carry it in the copy and the visual weight:

- The NOT MET pill reads **`WORTH DOING`** — never `FAILED`, `ISSUE`, or a bare `✗`. Use the sky palette the beyond-group already uses, never red or amber.
- The section's own heading and intro must say, before any row, that none of this is required and none of it affected the grade.
- Where a practice can only ever be reviewed rather than fixed, its row must say so plainly — "This one needs a person's judgment; there is no change that settles it automatically" — so a reader does not hunt for a fix that does not exist.
- Order the rows so NOT MET comes first (the actionable ones), then MET, then NOT APPLICABLE, then NOT CHECKED. Never sort by severity — there is no severity here.

**FOUR PRACTICES CAN NEVER REPORT MET — the summary must not read as four failures.** `heading-content`, `single-h1`, `character-mapping` and `content-in-tag-tree` have no MET branch at all, because the analyzer emits no positive line for them: when they are fine it simply says nothing. Manufacturing a pass from that silence is the one thing this catalog exists to prevent, so those rows land on NOT CHECKED for a flawless document.

Consequence: **a perfect PDF shows `15 met · 0 not met · 4 not checked`**, never `19 met`. Design for that, or the section reads as if a clean document still has four problems.

- The summary chips must never imply the not-checked rows are failures. Give NOT CHECKED a neutral tone — muted or amber, never red — and place it last.
- Where a practice can never report MET, its NOT CHECKED row must say so plainly rather than leaving the reader to guess: something like "This checker cannot confirm this one automatically — the analysis only reports it when something looks wrong, so no news is good news here. A person can confirm it in a minute."
- Do NOT add a "N of 19" fraction anywhere. A denominator invites the reader to treat the four as a shortfall, and the project's standing rule is that any number out of a total beside a status is read AS a grade.

Requirements for the rest, all asserted by the tests above:

- Root `<section data-testid="best-practices" aria-labelledby="best-practices-title">`, rendered only when `rows.length > 0`.
- An `<h2 id="best-practices-title">` reading **"Best practices — not scored"**, and a `BEST PRACTICE — NOT SCORED` chip in the sky palette, matching the existing beyond-group's visual language (`border-sky-500/40`, `bg-sky-500/5`, `text-sky-400`).
- An intro paragraph stating that the numbered fixes above are everything WCAG 2.1 asks of the document, that everything here is extra, and — in a `<strong>` — **"None of this affected your grade."**
- `data-testid="best-practices-summary"` chips built from `summarizeBestPractices(rows)`. Every number interpolated from the summary; **no literal totals**.
- One row per practice: `:data-practice="row.practice.id"`, `:data-status="row.status"`, a status pill (met = emerald ✓, not-met = sky ○, not-applicable = muted —, not-checked = amber ?), and a disclosure `<button>` with `:aria-expanded` and `:aria-controls="'bp-body-' + row.practice.id"`.
- The expanded body renders, in order: **What this is** (`description`), **Your document** (`evidence[]`, plus `block` in a real `<pre>` — never a `whitespace-pre` div, which prettier reflows), **Why it matters** (`why`), **Does this affect my grade?** → "No.", **How to fix** (both `fix.source` and `fix.app` when present), and **Read more** (`safeLinks(row.practice.links)` as `<a target="_blank" rel="noopener noreferrer">`).
- Independent open state per row (`Set<string>`), unlike the plan's exclusive accordion — a reader comparing two practices should be able to hold both open.
- `[data-export-exclude]` on the Show/Hide affordance, matching the plan's steps.
- Between two inline links, an explicit `{{ " " }}` — Vue's condense mode drops a whitespace-only text node containing a newline.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter web test -- app/__tests__/bestPracticesSection.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Lint, format, typecheck**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
pnpm lint && pnpm format:check && pnpm typecheck
```

Expected: all exit 0. `pnpm lint` does not cover `format:check`; CI runs both.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/components/BestPracticesSection.vue apps/web/app/__tests__/bestPracticesSection.test.ts
git commit -m "feat(report): the Best Practices scorecard component

Every practice for the file's format, its status for this document, the
evidence behind it, both fix routes, and links. Self-hides when empty; all
counts computed from the rendered rows."
```

---

### Task 8: Wire into the Visual view and narrow "Above and beyond"

**THE BEYOND-GROUP INTRO IS NOW FACTUALLY WRONG — rewriting it is not cosmetic.** `ActionPlan.vue`'s beyond-group currently reads:

> "The numbered fixes above are everything WCAG 2.1 — the standard Illinois (IITAA) and federal law (ADA Title II) require — asks of this document. Everything here is extra: PDF/UA (ISO 14289) rules **and best practices like bookmarks, heading conventions, and navigation labels**, for authors who want to go past the legal floor."

Bookmarks, heading conventions and navigation labels are exactly what the new Best Practices section now covers, practice by practice, with this document's own evidence. Leaving that sentence in place points a reader at the wrong block for the thing it names.

After this task the beyond-group carries **only veraPDF's verdict** — an independent validator's verbatim findings, which is the one thing the new section does not and should not reproduce. Rewrite the intro to say that and nothing more. Task 7 already differentiated the new section's own intro to "Every practice below was checked against this document specifically — its own status, and its own evidence, for each one," so the two must now read as a pair rather than as two attempts at the same paragraph.

Also drop the duplicated `BEST PRACTICE — NOT SCORED` chip from ONE of the two blocks — they are inches apart and identical. Keep it on the new section (whose heading is "Best practices — not scored") and let the beyond-group's heading carry veraPDF's name instead.


**Files:**
- Modify: `apps/web/app/components/ActionPlan.vue`
- Modify: `apps/web/app/__tests__/pdfUaCosign.test.ts`
- Modify: `apps/web/app/__tests__/actionPlan.test.ts:855`

**Interfaces:**
- Consumes: `BestPracticesSection` (Task 7).
- Produces: `ActionPlan` gains a `result` prop — `defineProps<{ …existing…; result?: unknown }>()` — passed straight to the section. The existing `categories` prop stays; Task 9 relies on `ReportVisualView` passing `:result="result"`.

- [ ] **Step 1: Write the failing test**

In `apps/web/app/__tests__/pdfUaCosign.test.ts`, replace the `beyondItems` assertions (the `no /Scope` expectation around :333 and the group tests at :329-342 and :615-642) with:

```ts
describe("the plan's two tiers after the best-practices split (2026-08-30)", () => {
  it("puts the unscored items in the Best Practices section, above the beyond group", () => {
    const w = mountPlanWithResult(SCOPE_RESULT);
    const bp = w.find('[data-testid="best-practices"]');
    const beyond = w.find('[data-testid="plan-beyond-group"]');
    expect(bp.exists()).toBe(true);
    expect(bp.text()).toMatch(/scope/i);
    // The section sits between the steps and the beyond group.
    expect(w.html().indexOf('data-testid="best-practices"')).toBeLessThan(
      w.html().indexOf('data-testid="plan-beyond-group"'),
    );
  });

  it("no longer repeats those items inside the beyond group", () => {
    const w = mountPlanWithResult(SCOPE_RESULT);
    const beyond = w.find('[data-testid="plan-beyond-group"]');
    expect(beyond.text()).not.toMatch(/no \/Scope/);
    expect(beyond.text()).toMatch(/veraPDF/);
  });

  it("hides the beyond group entirely when veraPDF has nothing to say", () => {
    const w = mountPlanWithResult({ ...SCOPE_RESULT, pdfUaVerdict: null });
    expect(w.find('[data-testid="plan-beyond-group"]').exists()).toBe(false);
  });
});
```

Define `SCOPE_RESULT` as a report carrying the `/Scope` not-scored finding plus a failing `pdfUaVerdict`, and `mountPlanWithResult` as the existing `mountPlan` with `result` added to `props`.

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter web test -- app/__tests__/pdfUaCosign.test.ts
```

Expected: FAIL — no `best-practices` testid; the beyond group still contains `no /Scope`.

**FIXTURE TRAP — the existing ActionPlan tests will silently yield zero rows.** `pdfUaCosign.test.ts` mounts with `props: { steps: [step], categories: [{ label, findings }] }`. Those fixtures carry **no category `id`**, and there is no `result` prop anywhere in that file. But `evaluateBestPractices()` matches practices to categories **by `id`** (it builds a `Map` keyed on `c.id`) and gates on `result.fileType`. Reusing the current fixture shape therefore produces zero rows, the section does not render, and the failure reads as `best-practices testid not found` — which looks like a component bug rather than a fixture gap.

Every new test must pass a whole result object:

```ts
const SCOPE_RESULT = {
  fileType: "pdf",
  pageCount: 12,
  categories: [
    {
      id: "table_markup",          // REQUIRED — the catalog matches on this
      label: "Table Markup",
      findings: [
        "All 1 table(s) have header cells (TH)",
        "PDF/UA only — not scored: 2 header cell(s) across 1 table(s) have no /Scope.",
      ],
    },
  ],
  pdfUaVerdict: { available: true, passed: false, totalFailureCount: 5, distinctRuleCount: 1, failures: [SCOPE_FAILURE] },
};
const mountPlanWithResult = (result: unknown) =>
  mount(ActionPlan, { props: { steps: [step], result, pdfUaVerdict: (result as any).pdfUaVerdict } });
```

Add `mountPlanWithResult` as a SECOND helper — do not extend the existing `mountPlan(verdict)`, which forwards only `steps` and `pdfUaVerdict`. The veraPDF co-sign tests that use it must keep working unchanged.

- [ ] **Step 3: Change `ActionPlan.vue`**

1. Add `result?: unknown` to `defineProps`.
2. Insert directly after the pass card and **before** the `showBeyondGroup` div, inside the existing seam:

```vue
<BestPracticesSection v-if="result" :result="result" class="mt-8" />
```

Move the `Everything the law requires is above ↑` seam **above** the new section — it introduces both non-required tiers, not just the beyond group.

3. Delete the `beyondItems` computed (:434) and the `<ul v-if="beyondItems.length">` (:285).
4. Narrow `showBeyondGroup`:

```ts
/** The beyond group is now purely veraPDF's verdict — the referee's own
 *  words. Our unscored findings moved to BestPracticesSection (2026-08-30),
 *  where each gets a description, this document's evidence, and links. */
const showBeyondGroup = computed(() => {
  const v = props.pdfUaVerdict;
  return Boolean(v?.available && (v.error || v.passed === false));
});
```

5. Delete the `v-if="beyondItems.length"` "N optional items from this report" chip; that count now lives in the section's summary.
6. Retitle the beyond group's `<h3>` to **"Above and beyond — veraPDF's verdict"** and rewrite its intro to describe only the independent validator.
7. Remove the now-unused `partitionCardFindings` import if nothing else in the file uses it.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter web test -- app/__tests__/pdfUaCosign.test.ts app/__tests__/actionPlan.test.ts
```

Expected: PASS. Update the `Above and beyond` assertion at `actionPlan.test.ts:855` to the new heading.

- [ ] **Step 5: Run the full web suite**

```bash
pnpm --filter web test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/components/ActionPlan.vue apps/web/app/__tests__/pdfUaCosign.test.ts apps/web/app/__tests__/actionPlan.test.ts
git commit -m "feat(report): Best Practices section between the plan and Above and Beyond

The unscored items leave the beyond group's flat bullet list and become
rows with a description, this document's evidence, both fix routes, and
links. Above and beyond narrows to what only veraPDF can say."
```

---

### Task 9: Wire into the Detailed view and the shareable report

**Files:**
- Modify: `apps/web/app/pages/index.vue` (Detailed branch, after `IssuesSummary`)
- Modify: `apps/web/app/pages/report/[id].vue` (Detailed branch, after `IssuesSummary`)
- Modify: `apps/web/app/components/ReportVisualView.vue` (pass `:result` to `ActionPlan`)
- Modify: `apps/web/app/__tests__/reportSectionOrder.test.ts`

**Interfaces:**
- Consumes: `BestPracticesSection`, and `ActionPlan`'s new `result` prop (Task 8).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/app/__tests__/reportSectionOrder.test.ts`:

```ts
describe("Best Practices placement (2026-08-30)", () => {
  it("sits between IssuesSummary and ManualReviewCard in both Detailed views", () => {
    for (const page of ["index.vue", "report/[id].vue"]) {
      const src = pageSource(page);
      const issues = at(src, "IssuesSummary");
      const bp = at(src, "BestPracticesSection");
      const manual = at(src, "ManualReviewCard");
      expect(issues, page).toBeLessThan(bp);
      expect(bp, page).toBeLessThan(manual);
    }
  });

  it("stays above the informational PDF/UA panels — the blocking-first invariant", () => {
    for (const page of ["index.vue", "report/[id].vue"]) {
      const src = pageSource(page);
      expect(at(src, "BestPracticesSection"), page).toBeLessThan(at(src, "PdfUaVerdict"));
    }
  });

  it("renders ONCE per view — never via ReportContent, which TechnicalReport embeds", () => {
    // ReportContent is rendered inside TechnicalReport, which is inside
    // ReportVisualView. A section placed there would appear twice on one
    // page in the Visual view.
    expect(componentSource("ReportContent.vue")).not.toContain("BestPracticesSection");
    const visual = componentSource("ReportVisualView.vue");
    expect(visual.match(/<BestPracticesSection/g) ?? []).toHaveLength(0);
    expect(visual).toMatch(/<ActionPlan[\s\S]*?:result="result"/);
  });

  it("keeps ReportContent's per-category not-scored tier — it is card detail, not the scorecard", () => {
    // Spec §6: the two serve different readers. Removing TIER 2 would strip
    // the not-scored items out of the per-category cards entirely.
    expect(componentSource("ReportContent.vue")).toContain('data-testid="not-scored-tier"');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter web test -- app/__tests__/reportSectionOrder.test.ts
```

Expected: FAIL — `BestPracticesSection not found in source`.

- [ ] **Step 3: Make the three edits**

In `apps/web/app/components/ReportVisualView.vue`, add `:result="result"` to the `<ActionPlan>` binding.

In **both** `pages/index.vue` and `pages/report/[id].vue`, directly after the Detailed branch's `<IssuesSummary>` and before `<ManualReviewCard>`:

```vue
<!-- Best practices — reported, never scored. Mirrors the Visual view's
     reading order: obligations, then the optional work, then what only a
     person can judge. Deliberately NOT in ReportContent: TechnicalReport
     embeds that inside ReportVisualView, so a section placed there would
     render twice on one page in the Visual view. -->
<BestPracticesSection
  v-if="result?.categories"
  :result="result"
  class="mb-8"
/>
```

On `report/[id].vue` the binding is `data.report`, not `result` — use `v-if="data?.report?.categories"` and `:result="data.report"`, matching the surrounding components.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter web test -- app/__tests__/reportSectionOrder.test.ts
pnpm --filter web test
```

Expected: PASS.

- [ ] **Step 5: Verify in the real app — one render, not two**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm dev
```

Upload a PDF with heading skips. In the **Visual** view confirm the section appears exactly once between the plan and the beyond group — expand the Technical Details panel and confirm it does **not** appear a second time inside it. Switch to **Detailed** and confirm it appears once, below the issues. Then open a shared report link and repeat both.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/pages/index.vue "apps/web/app/pages/report/[id].vue" apps/web/app/components/ReportVisualView.vue apps/web/app/__tests__/reportSectionOrder.test.ts
git commit -m "feat(report): Best Practices in the Detailed view and shared reports

Placed after the scored issues and above the informational PDF/UA panels,
so the blocking-first invariant holds. Pinned out of ReportContent, which
TechnicalReport embeds inside the Visual view."
```

---

### Task 10: The print-friendly plan

**TWO PRINT PATHS — do not conflate them.** Different documents, different failure modes; both must carry this section.

| | Path A — printing the in-app report | Path B — the standalone printable plan (THIS task) |
|---|---|---|
| Trigger | `useReportExport.ts:191` calls `window.print()` on the live page | `PrintPlanButton` opens `buildPrintablePlan()` output as a blob URL |
| Styling | `apps/web/app/assets/css/main.css:216`'s `@media print` block | the plan's own inline `@media print` at `printablePlan.ts:111` |
| Collapsed content | **JavaScript does not run.** `main.css:266` force-shows `.tech-report-body, .plan-step-body`; anything without one of those classes prints as a bare header | nothing is collapsible — everything renders expanded by construction |
| Fixed by | Task 7 (adds a `bp-body` class and extends that CSS rule) | this task |

Path A was a real defect caught in Task 7's review: the section's body carried `bp-body-<id>` as an **id**, not a class, so a printed report showed 19 header rows and nothing beneath them. If you touch collapsible markup anywhere, check `main.css:266` — that rule is all that stands between a collapsed section and an empty printout.


**Files:**
- Modify: `apps/web/app/utils/printablePlan.ts`
- Modify: `apps/web/app/components/PrintPlanButton.vue`
- Test: `apps/web/app/__tests__/printablePlanBestPractices.test.ts` (create)

**Interfaces:**
- Consumes: `EvaluatedPractice`, `evaluateBestPractices` from `~/utils/bestPractices`.
- Produces: `PrintablePlanOptions` gains `bestPractices?: EvaluatedPractice[]`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/printablePlanBestPractices.test.ts`:

```ts
/**
 * The printout is read next to Word or Acrobat by whoever does the fixing —
 * who may not be the person who generated it. So the best practices print
 * FULLY EXPANDED, with both fix routes, and every document-derived string
 * escaped: findings quote heading text, link labels, sheet and font names.
 */
import { describe, it, expect } from "vitest";
import { buildPrintablePlan } from "../utils/printablePlan";
import { evaluateBestPractices } from "../utils/bestPractices";

const report = {
  fileType: "pdf",
  pageCount: 40,
  categories: [
    {
      id: "heading_structure",
      findings: [
        "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 13-004), not a WCAG 2.1 failure, so your grade is not affected.",
        "--- Heading Tree ---",
        "  H1 → H2 → H1 → H1",
      ],
    },
  ],
};

const build = (extra: Record<string, unknown> = {}) =>
  buildPrintablePlan({
    filename: "report.pdf",
    steps: [],
    bestPractices: evaluateBestPractices(report),
    ...extra,
  });

describe("printable plan — best practices", () => {
  it("prints the section with the document's own heading order", () => {
    const html = build();
    expect(html).toContain("Best practices");
    expect(html).toContain("H1 → H2 → H1 → H1");
  });

  it("prints every row expanded, with both fix routes", () => {
    const html = build();
    expect(html).toMatch(/In the source file/i);
    expect(html).toMatch(/In the PDF/i);
    // No interactive affordance survives onto paper.
    expect(html).not.toMatch(/Show how|aria-expanded/);
  });

  it("says plainly that none of it is scored, and never that it is required", () => {
    const html = build();
    expect(html).toMatch(/not scored/i);
    expect(html).not.toMatch(/required by law/i);
  });

  it("escapes document-derived text", () => {
    const hostile = evaluateBestPractices({
      fileType: "pdf",
      pageCount: 40,
      categories: [
        {
          id: "heading_structure",
          findings: [
            'PDF/UA only — not scored: found 2 heading tags, but the level order has gaps — <img src=x onerror="alert(1)">',
            "--- Heading Tree ---",
            "  H1 → <script>alert(1)</script>",
          ],
        },
      ],
    });
    const html = buildPrintablePlan({ filename: "x.pdf", steps: [], bestPractices: hostile });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain("&lt;script&gt;");
  });

  it("omits the section entirely when there is nothing to print", () => {
    expect(build({ bestPractices: [] })).not.toContain("Best practices");
    expect(buildPrintablePlan({ filename: "x.pdf", steps: [] })).not.toContain("Best practices");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter web test -- app/__tests__/printablePlanBestPractices.test.ts
```

Expected: FAIL — `bestPractices` is not a recognised option; the string is absent.

- [ ] **Step 3: Extend `printablePlan.ts`**

1. Add to `PrintablePlanOptions`:

```ts
  /** Best practices, already evaluated. Printed FULLY EXPANDED — there is no
   *  show/hide on paper, and the holder of the printout may not be the person
   *  who chose which fix route to take. */
  bestPractices?: EvaluatedPractice[];
```

2. Add the status labels and the section builder, placed **between** `steps` and `checks` in the returned template:

```ts
const STATUS_LABEL: Record<string, string> = {
  met: "Already done",
  "not-met": "Worth doing",
  "not-applicable": "Does not apply",
  "not-checked": "Not checked",
};

const practices = (o.bestPractices ?? []).length
  ? `<h2>Best practices — not scored</h2>` +
    `<p class="sub">None of this affected the grade. The fixes above are everything ` +
    `WCAG 2.1 asks of this document; everything here is optional work that helps real readers.</p>` +
    `<ul class="bp">` +
    (o.bestPractices ?? [])
      .map(
        (r) =>
          `<li><h3>${escapeHtml(r.practice.label)} — ${escapeHtml(STATUS_LABEL[r.status] ?? r.status)}</h3>` +
          `<p class="bp-what">${escapeHtml(r.practice.description)}</p>` +
          (r.evidence.length
            ? `<p class="bp-doc"><strong>Your document:</strong> ${r.evidence.map(escapeHtml).join(" ")}</p>`
            : "") +
          (r.block
            ? `<p class="bp-cap">${escapeHtml(r.block.caption)}</p>` +
              `<pre class="bp-block">${r.block.lines.map(escapeHtml).join("\n")}</pre>`
            : "") +
          `<p class="bp-why">${escapeHtml(r.practice.why)}</p>` +
          (r.fix
            ? `<p class="bp-fix"><strong>In the source file:</strong> ${escapeHtml(r.fix.source)}</p>` +
              `<p class="bp-fix"><strong>In the ${o.filename.toLowerCase().endsWith(".pdf") ? "PDF" : "exported file"}:</strong> ${escapeHtml(r.fix.app)}</p>`
            : "") +
          (r.practice.links.length
            ? `<p class="bp-links">` +
              r.practice.links
                .map((l) => {
                  const safe = safeHttpUrl(l.url);
                  const label = escapeHtml(l.label);
                  return safe ? `<a href="${escapeHtml(safe)}">${label}</a>` : label;
                })
                .join(" · ") +
              `</p>`
            : "") +
          `</li>`,
      )
      .join("") +
    `</ul>`
  : "";
```

3. Interpolate `${practices}` into the returned template between `${steps}` and `${checks}`.

4. Add to `STYLE`, following the existing `li.step` page-break convention — a practice and its evidence must not straddle a page break:

```css
ul.bp{list-style:none;padding:0;margin:0}
ul.bp>li{border:1px solid #bbb;border-radius:8px;padding:12px 14px;margin:0 0 12px;
 break-inside:avoid;page-break-inside:avoid}
.bp-cap{margin:8px 0 2px;font-size:12px;color:#555}
pre.bp-block{margin:0 0 8px;padding:8px 10px;background:#f4f4f4;border:1px solid #ddd;
 border-radius:4px;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.bp-fix{margin:4px 0}
.bp-links{margin:6px 0 0;font-size:12px;color:#444}
```

The evidence block must be a real `<pre>`. A `whitespace-pre` div gets reflowed by prettier, which has collapsed 12 preformatted blocks in this repo before (fixed in v1.53.0).

- [ ] **Step 4: Update `PrintPlanButton.vue`**

Widen the prop type — the full `CategoryResult` is already passed at runtime, so this is a type change only:

```ts
    categories?: Array<{
      id?: string;
      label?: string;
      score?: number | null;
      severity?: string | null;
      /** Widened 2026-08-30: the best-practices catalog reads these. */
      findings?: string[];
    }>;
```

Add `pageCount?: number` to the `result` prop type, compute the rows, extend the gate, and pass them through:

```ts
const bestPractices = computed(() => evaluateBestPractices(props.result));

// A document whose only remaining items are best practices must still print.
const hasSomethingToPrint = computed(
  () =>
    steps.value.length > 0 ||
    checks.value.length > 0 ||
    notAssessed.value.length > 0 ||
    bestPractices.value.length > 0,
);
```

Add `bestPractices: bestPractices.value` to the `buildPrintablePlan` call, and update `blurb` to mention the best practices when there are any.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter web test -- app/__tests__/printablePlanBestPractices.test.ts
pnpm --filter web test
```

Expected: PASS.

- [ ] **Step 6: Verify the real printout**

```bash
pnpm dev
```

Upload a PDF with heading skips, click **Print the plan**, and confirm in the new tab: the Best practices section sits between "What to fix" and "Still worth checking by hand"; every row is expanded; the heading tree renders as a preformatted block; no row straddles a page break in the browser's print preview.

- [ ] **Step 7: Lint, format, typecheck, commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
pnpm lint && pnpm format:check && pnpm typecheck
git add apps/web/app/utils/printablePlan.ts apps/web/app/components/PrintPlanButton.vue apps/web/app/__tests__/printablePlanBestPractices.test.ts
git commit -m "feat(report): print the best practices with the plan

Fully expanded with both fix routes — there is no show/hide on paper, and
the person holding the printout may not be the one who generated it.
PrintPlanButton's categories prop widens to carry findings, and a document
whose only remaining items are best practices now prints."
```

---

### Task 11: Release

**Files:**
- Modify: `CHANGELOG.md`; `package.json` ×6 (root + `apps/api` + `apps/web` + `apps/cli` + `packages/shared` + `packages/analyzer`); `README.md` §Security; `apps/web/app/data/securityAudits.ts`; `audit.config.ts` (`ANNOUNCEMENTS`); `scripts/brief-stats.json`
- Verify: `docs/brief/checker-brief.html` via `pnpm build-brief`

**Interfaces:** none.

- [ ] **Step 1: Run the full verification chain**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
pnpm lint && pnpm format:check && pnpm typecheck && pnpm build
echo "build exit: $?"
pnpm test
```

Gate on the exit code — never pipe `pnpm build` through `tail` or `grep`; the pipe's status hides a tsc failure, which shipped a broken v1.49.0.

- [ ] **Step 2: Update the brief stats and rebuild the brief**

Update the test count in `scripts/brief-stats.json` to the number `pnpm test` just reported. Trap count and ledger rows are unchanged — this feature adds no traps and moves no scores.

```bash
pnpm build-brief
```

Expected: exit 0. If the banned-pattern guard fires on a hardcoded count, the offending copy is in this feature — make it placeholder-driven or countless.

- [ ] **Step 3: Bump the version in all six package.json files**

Minor bump — this is a visitor-meaningful feature. All six must match exactly.

- [ ] **Step 4: Write the release entries**

- `CHANGELOG.md` — a new entry describing the section, the beyond-group narrowing, and the `Note — not scored` fix.
- `README.md` §Security — one entry.
- `apps/web/app/data/securityAudits.ts` — **prepend** to `SECURITY_AUDIT_ENTRIES`. Its test fails the release if either this or the README entry is missing.
- `audit.config.ts` — **prepend** to `ANNOUNCEMENTS`. If the entry links to `/status`, it needs `linkExternal: true` beside `linkTo` — `/status` is a Nitro server route and `<NuxtLink>` renders the SPA 404. Never hardcode a count in `linkText`; a guard test fails on it.

- [ ] **Step 5: Re-run the suite after the data edits**

```bash
pnpm test
```

Expected: PASS. `securityAudits.test.ts` and `AnnouncementBanner.test.ts` walk the real data and fail on a missing or malformed entry.

- [ ] **Step 6: Commit and tag**

```bash
git add -A
git commit -m "release: vX.Y.0 — best practices, with your document's own evidence

Every non-scored best practice for the file's format now renders as a row
with a status, the evidence from this document, both fix routes, and links
— in the Visual view, the Detailed view, shared reports, and the printout.
Above and beyond narrows to veraPDF's verdict. Six 'Note — not scored'
findings stop rendering under the heading that says the score measures them."
git tag -a vX.Y.0 -m "vX.Y.0 — Best practices section"
```

- [ ] **Step 7: Check CI**

```bash
gh run list --branch main --workflow CI
```

Always pass `--workflow CI`. An unfiltered listing shows Dependabot runs that fail on every release and read as CI failures.

- [ ] **Step 8: Hand off the deploy**

**Do not deploy.** Deploys are the user's: Forge → site → Deploy, or `./rebuild.sh` over SSH. Never both at once — a concurrent `rebuild.sh` and `publish.sh` corrupted the nuxt cache and produced 41+ PM2 crash loops on 2026-08-17.

Tell the user the release is tagged and CI is green, and that after they deploy:

```bash
pnpm prod-sentinels
```

must run — after every deploy, without exception.


---

### Task 12: Corpus traps — WCAG-clean documents that still have best practices to meet

The feature's central claim is that a document can satisfy WCAG 2.1 and still have work worth doing. Task 6 proves that at the report level with fixtures. This task proves it against **real files the analyzer actually parses**, in the project's own CI-gated corpus, so the claim cannot quietly stop being true.

**Files:**
- Modify: `scripts/synthetic-controls.ts` (new `SAMPLES` entries)
- Modify: `scripts/synthetic-office-controls.ts` (new entries)
- Regenerated: `scripts/trap-manifest.json`, `scripts/trap-manifest-office.json`
- Re-blessed: `scripts/score-ledger.json`
- Updated: `scripts/brief-stats.json`
- Verify: the /trust trap modal via `pnpm build-brief`

**Interfaces:** none exported. A `Sample` is `{ file, truth, build: () => Buffer, check: (r: AnalysisResult) => string | null }`; `check` returns `null` to pass or a message to fail, and an `"OBSERVE:"` prefix records behavior without failing the run.

- [ ] **Step 1: Add the PDF trap**

Append to `SAMPLES` in `scripts/synthetic-controls.ts`. Model it on `synthetic-01-well-built.pdf`, which is already a conformance-clean document — this one is that document plus best-practice debt:

```ts
{
  file: "synthetic-wcag-clean-bp-debt.pdf",
  truth:
    "A document can satisfy WCAG 2.1 completely and still carry best-practice work. This one is tagged, titled, language-tagged, every figure has alt text, and no WCAG criterion fails — so it must score in the A band with no Critical or Moderate category. It nonetheless skips a heading level (H1 -> H3), runs to enough pages to want bookmarks and has none, and leaves DisplayDocTitle off. None of those is a WCAG 2.1 failure, so none may move the score; all three must be reported as not-scored advisories.",
  build: () => { /* … */ },
  check: (r) => {
    const bad = r.categories.filter((c) => c.severity === "Critical" || c.severity === "Moderate");
    if (bad.length) return `WCAG-clean document accused of ${bad.map((c) => `${c.id}(${c.severity})`).join(", ")}`;
    if (r.overallScore < 89) return `score ${r.overallScore} < 89 — best-practice debt must not move the grade`;
    if ((r.conformance?.failures ?? []).length) {
      return `conformance failures present: ${(r.conformance?.failures ?? []).map((f) => f.sc).join(", ")}`;
    }
    const notScored = r.categories
      .flatMap((c) => c.findings)
      .filter((f) => /^(pdf\/ua only|advisory|note) — not scored/i.test(f.trim()));
    if (notScored.length < 3) {
      return `expected at least 3 not-scored advisories, found ${notScored.length}`;
    }
    const all = notScored.join("\n").toLowerCase();
    for (const needle of ["level order has gaps", "no bookmarks", "displaydoctitle"]) {
      if (!all.includes(needle)) return `missing the designed advisory: ${needle}`;
    }
    return null;
  },
},
```

The build must produce a document that is genuinely WCAG-clean: tagged, `/MarkInfo << /Marked true >>`, `/Lang (en-US)`, a real `/Title`, alt text on every figure, and a valid struct tree — then introduce ONLY the three best-practice defects. Reuse the helpers already in the file (`buildPdf`, `stream`, `FONT`, `GRAY_IMG`, `LONG`).

⚠️ **`LONG()` exists because pdf.js silently truncates a single unbroken `Tj` run wider than the page (~112 chars at 11pt).** Paint line by line; a hand-built fixture that ignores this fails for a reason that has nothing to do with the trap.

Page count must clear `ANALYSIS.BOOKMARKS_PAGE_THRESHOLD` (10) or the bookmarks advisory never fires.

- [ ] **Step 2: Run it and confirm the designed truth holds**

```bash
pnpm synthetic-controls
```

Expected: every sample holds, including the new one, and `trap-manifest.json` is rewritten with the new entry. **If it fails, suspect the FIXTURE before the app** — on this project that instinct has been right every time so far.

- [ ] **Step 3: Add the Office traps**

Append to `scripts/synthetic-office-controls.ts`: one Word document and one Excel workbook that are each WCAG-clean but carry advisory-only debt — for Word, a skipped heading level plus merged table cells; for Excel, default sheet names (`Sheet1`) plus data laid out as plain ranges rather than defined Tables. Same `check` doctrine: no Critical/Moderate category, no conformance failure, and the designed advisories present.

```bash
pnpm synthetic-office-controls
```

- [ ] **Step 4: Re-bless the score ledger IN THE SAME COMMIT**

New corpus files add ledger rows, and the gate fails until a human re-blesses.

```bash
pnpm score-ledger          # expect: FAIL, naming the new unblessed rows
pnpm score-ledger --bless  # re-record
pnpm score-ledger          # expect: PASS
```

Read the diff on `scripts/score-ledger.json` before committing and confirm **only the new rows appear** — a blessing that moves an existing row is a scoring regression hiding inside a corpus change, and this gate exists precisely to catch that.

- [ ] **Step 5: Update the trap counts and rebuild the brief**

The trap totals are computed from both manifests and surface on the /trust page. Update `scripts/brief-stats.json`, then:

```bash
pnpm build-brief
```

Expected: exit 0. The banned-pattern guard fails on any hardcoded count — every figure must be placeholder-driven or the copy countless.

- [ ] **Step 6: Full verification**

```bash
pnpm --filter web test && pnpm typecheck && pnpm lint && pnpm format:check
pnpm synthetic-controls && pnpm synthetic-office-controls && pnpm score-ledger && pnpm resave-invariance
```

All must pass. `trustPage.test` pins the trap-card count, so it fails until `brief-stats.json` matches the manifests.

- [ ] **Step 7: Commit — corpus, manifests, and ledger together**

```bash
git add scripts/synthetic-controls.ts scripts/synthetic-office-controls.ts \
        scripts/trap-manifest.json scripts/trap-manifest-office.json \
        scripts/score-ledger.json scripts/brief-stats.json controls/
git commit -m "test(corpus): traps proving a WCAG-clean document still has best practices to meet

Three new controls that pass WCAG 2.1 completely — no failing criterion, no
Critical or Moderate category — while carrying skipped heading levels, absent
bookmarks, DisplayDocTitle off, merged cells, and undefined Excel tables. Each
must be reported and none may move the score. Ledger re-blessed in the same
commit; only the new rows move."
```
