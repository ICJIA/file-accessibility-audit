# PDF/UA verdict number reframe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the veraPDF verdict panel so the actionable count (distinct rule types) leads, the raw occurrence sum is demoted to context, and a gated Pareto line makes "few root causes" self-evident — plus fix a latent sort-before-truncate bug in the mapper.

**Architecture:** Two layers. (1) The API mapper `extractVerdict()` sorts failing rules by occurrence count *before* truncating to 20 and records the true pre-truncation `distinctRuleCount` on the verdict. (2) The `PdfUaVerdict.vue` component reads those fields to lead with distinct rule types, demote the occurrence total, and conditionally show a Pareto callout. Presentation only — the WCAG grade and score are untouched.

**Tech Stack:** TypeScript (Express API via `tsx`), Vue 3 SFC (Nuxt 4 / Nuxt UI 4), Vitest + @vue/test-utils, pnpm workspaces.

## Global Constraints

- **Commit messages: NEVER add a `Co-Authored-By` line or any AI-attribution trailer.** End with the descriptive content. (User rule, every commit.)
- **Code style:** ESLint + Prettier — `semi: true`, **double quotes**. Match surrounding code.
- **`distinctRuleCount` is optional** (`distinctRuleCount?: number`) on *both* verdict interfaces (`VeraPdfVerdict` in the API, `PdfUaVerdict` in shared) so pre-existing saved reports and existing test mocks (which omit it) still typecheck. Live code always sets it.
- **Number formatting:** always `n.toLocaleString("en-US")` (locale-fixed → "6,941" renders identically in CI regardless of host locale).
- **Pareto honesty gate:** show the "top 3 cause ~X%" clause only when `distinctRuleCount >= 4` **AND** `topThreeShare >= 0.60`.
- **No scoring change.** Do not touch scorer, grade, or the `PdfUaSignalsCard.vue` readiness card.
- **Before any push:** run `pnpm build` (Vitest uses esbuild and won't catch `tsc --noEmit` type errors).
- Node >= 22. Ports: API 5103, web 5102 (not needed for these unit tests).

---

### Task 1: API — sort veraPDF failures by count and record `distinctRuleCount`

**Files:**
- Modify: `apps/api/src/services/veraPdf.ts` (interface `VeraPdfVerdict` ~lines 27–40; `extractVerdict` return ~lines 200–209; stub returns at ~lines 53–59, 80–87, 99–106, 131–139)
- Modify: `apps/api/src/services/veraPdfBuffer.ts` (two stub returns, lines ~16 and ~24–28)
- Modify: `packages/shared/src/types.ts` (`PdfUaVerdict`, ~lines 201–208)
- Test: `apps/api/src/__tests__/veraPdf.test.ts` (append a new `describe` block)

**Interfaces:**
- Produces: `VeraPdfVerdict` / `PdfUaVerdict` now carry optional `distinctRuleCount?: number` — the count of distinct failing rules **before** the 20-item truncation. `extractVerdict(parsed, fellbackToErrorStdout)` returns `failures` sorted by `count` descending. Task 2 (web) consumes `verdict.distinctRuleCount`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/__tests__/veraPdf.test.ts`:

```ts
describe("extractVerdict — sorting and distinct-rule count", () => {
  it("sorts failing rules by occurrence count (desc) before truncation", () => {
    const parsed = {
      report: {
        jobs: [
          {
            validationResult: [
              {
                profileName: "PDF/UA-1 validation profile",
                isCompliant: false,
                details: {
                  failedChecks: 16,
                  ruleSummaries: [
                    { specification: "ISO 14289-1", clause: "7.1", testNumber: 1, failedChecks: 2, description: "a" },
                    { specification: "ISO 14289-1", clause: "7.2", testNumber: 1, failedChecks: 9, description: "b" },
                    { specification: "ISO 14289-1", clause: "7.3", testNumber: 1, failedChecks: 5, description: "c" },
                  ],
                },
              },
            ],
          },
        ],
      },
    };
    const v = extractVerdict(parsed, false);
    expect(v.failures.map((f) => f.count)).toEqual([9, 5, 2]);
    expect(v.failures[0].ruleId).toBe("7.2-1");
    expect(v.distinctRuleCount).toBe(3);
  });

  it("caps the stored list at 20 but keeps the true distinct count and the highest-count rules", () => {
    const ruleSummaries = Array.from({ length: 25 }, (_, i) => ({
      specification: "ISO 14289-1",
      clause: "8." + (i + 1),
      testNumber: 1,
      failedChecks: i + 1,
      description: "rule " + (i + 1),
    }));
    const parsed = {
      report: { jobs: [{ validationResult: [{ profileName: "PDF/UA-1", isCompliant: false, details: { failedChecks: 325, ruleSummaries } }] }] },
    };
    const v = extractVerdict(parsed, false);
    expect(v.failures).toHaveLength(20);
    expect(v.distinctRuleCount).toBe(25);
    expect(v.failures[0].count).toBe(25); // highest kept, sorted first
    expect(Math.min(...v.failures.map((f) => f.count))).toBe(6); // counts 1..5 dropped
  });

  it("reports distinctRuleCount 0 when veraPDF output has no validation result", () => {
    const v = extractVerdict({}, false);
    expect(v.distinctRuleCount).toBe(0);
    expect(v.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api exec vitest run src/__tests__/veraPdf.test.ts`
Expected: the 3 new tests FAIL — `distinctRuleCount` is `undefined` (property absent) and `v.failures.map(count)` is `[2, 9, 5]` (unsorted).

- [ ] **Step 3: Add `distinctRuleCount` to the shared type**

In `packages/shared/src/types.ts`, in `interface PdfUaVerdict`, add the field after `totalFailureCount`:

```ts
export interface PdfUaVerdict {
  available: boolean;
  passed: boolean;
  profile: string;
  failures: PdfUaRuleFailure[];
  totalFailureCount: number;
  /** Distinct failing rules before the 20-item truncation — the honest "how many kinds of problem" count. Optional: absent on reports saved before this field existed. */
  distinctRuleCount?: number;
  error?: string;
}
```

- [ ] **Step 4: Add `distinctRuleCount` to the API interface**

In `apps/api/src/services/veraPdf.ts`, in `interface VeraPdfVerdict`, add the same field after `totalFailureCount`:

```ts
  /** Total failure count across all rules (before truncation) */
  totalFailureCount: number;
  /** Distinct failing rules before the 20-item truncation (optional for legacy/mocked verdicts). */
  distinctRuleCount?: number;
  /** Human-readable error if veraPDF itself errored out */
  error?: string;
```

- [ ] **Step 5: Sort before truncation + capture the count in `extractVerdict`**

In `apps/api/src/services/veraPdf.ts`, immediately after the `const failures: VeraPdfRuleFailure[] = ruleSummariesRaw.map(...).filter((f) => f.count > 0);` statement (before the `totalFailureCount` calculation), insert:

```ts
  // Sort by occurrence count desc BEFORE truncating, so the stored top-20 is
  // genuinely the 20 highest-count rules — the UI lists them "most frequent
  // first" and the Pareto rollup depends on it. Array.sort is stable on Node 22.
  failures.sort((a, b) => b.count - a.count);

  // True number of distinct failing rules, captured before the slice(0, 20).
  const distinctRuleCount = failures.length;
```

Then add `distinctRuleCount` to the final success return object:

```ts
  return {
    available: true,
    passed: isCompliant && !fellbackToErrorStdout,
    profile: profileName,
    failures: failures.slice(0, 20),
    totalFailureCount,
    distinctRuleCount,
  };
```

- [ ] **Step 6: Add `distinctRuleCount: 0` to every stub return**

In `apps/api/src/services/veraPdf.ts`, add `distinctRuleCount: 0,` alongside `totalFailureCount: 0,` in each of the four early-return stubs:
1. `runVeraPdf` — veraPDF binary not configured (the `if (!bin)` block).
2. `runVeraPdf` — catch branch with no stdout (`if (!stdout)`).
3. `runVeraPdf` — JSON parse failure (`catch` around `JSON.parse`).
4. `extractVerdict` — the `if (!validation)` no-validation branch.

Example (apply the same one-line addition to all four):

```ts
    return {
      available: true,
      passed: false,
      profile: "ua1",
      failures: [],
      totalFailureCount: 0,
      distinctRuleCount: 0,
      error: "could not parse veraPDF JSON output",
    };
```

- [ ] **Step 7: Add `distinctRuleCount: 0` to the buffer stubs**

In `apps/api/src/services/veraPdfBuffer.ts`, add `distinctRuleCount: 0,` to both stub returns (the `if (!REMEDIATION.VERAPDF_PATH)` return and the `catch` return):

```ts
  if (!REMEDIATION.VERAPDF_PATH) {
    return { available: false, passed: false, profile: "ua1", failures: [], totalFailureCount: 0, distinctRuleCount: 0 };
  }
```

```ts
    return {
      available: true, passed: false, profile: "ua1",
      failures: [], totalFailureCount: 0, distinctRuleCount: 0,
      error: err?.message ? String(err.message) : "veraPDF invocation failed",
    };
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter api exec vitest run src/__tests__/veraPdf.test.ts`
Expected: all tests PASS (the 4 pre-existing + 3 new).

- [ ] **Step 9: Typecheck the shared + API packages**

Run: `pnpm --filter @file-audit/shared build && pnpm --filter api build`
Expected: both succeed with no type errors.

- [ ] **Step 10: Run the full API veraPDF suites to confirm no regressions**

Run: `pnpm --filter api exec vitest run src/__tests__/veraPdf.test.ts src/__tests__/veraPdfBuffer.test.ts src/__tests__/analyzeVeraPdf.test.ts`
Expected: all PASS (sibling tests use per-field `.toBe()` / `objectContaining`, so the new optional field does not break them).

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/services/veraPdf.ts apps/api/src/services/veraPdfBuffer.ts packages/shared/src/types.ts apps/api/src/__tests__/veraPdf.test.ts
git commit -m "feat(pdfua): sort veraPDF failures by count + record distinctRuleCount

Sort failing rules by occurrence count before truncating to 20 (the stored
top-20 was previously in veraPDF emission order, so 'most frequent first' and
any count-based rollup could be wrong), and record the true pre-truncation
distinct-rule count on the verdict. Optional field; no scoring change."
```

---

### Task 2: Web — reframe the `PdfUaVerdict.vue` panel

**Files:**
- Modify: `apps/web/app/components/PdfUaVerdict.vue` (`<script setup>` computeds + template headline/explainer/toggle/list)
- Test: `apps/web/app/__tests__/pdfUaVerdict.test.ts` (append a new `describe` block; existing tests must stay green)

**Interfaces:**
- Consumes: `verdict.distinctRuleCount?` and `verdict.failures[].count` from Task 1. Falls back to `sortedFailures.length` when `distinctRuleCount` is absent (legacy report).

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/app/__tests__/pdfUaVerdict.test.ts`:

```ts
describe("PdfUaVerdict.vue — number reframe", () => {
  const failVerdict = (over = {}) => ({
    available: true,
    passed: false,
    profile: "ua1",
    distinctRuleCount: 4,
    totalFailureCount: 1000,
    failures: [
      { ruleId: "7.1-1", clause: "7.1", description: "figure lacks alt text", count: 500 },
      { ruleId: "8.4-2", clause: "8.4", description: "TH cell missing Scope", count: 300 },
      { ruleId: "7.2-1", clause: "7.2", description: "heading skip", count: 100 },
      { ruleId: "6.3-1", clause: "6.3", description: "metadata missing", count: 100 },
    ],
    ...over,
  });

  it("leads with distinct rule types and demotes the occurrence total", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: failVerdict() } });
    expect(w.text()).toMatch(/4 rule types to fix/);
    expect(w.text()).toMatch(/1,000 total occurrences/);
  });

  it("explains that veraPDF counts every occurrence", () => {
    const w = mount(PdfUaVerdict, { props: { verdict: failVerdict() } });
    expect(w.text()).toMatch(/counts every occurrence separately/i);
    expect(w.text()).toMatch(/These 4 rule types account for all 1,000/);
  });

  it("shows the Pareto clause when the top 3 dominate (>=4 types, >=60%)", () => {
    // top 3 = 500 + 300 + 100 = 900 of 1000 = 90%
    const w = mount(PdfUaVerdict, { props: { verdict: failVerdict() } });
    expect(w.text()).toMatch(/top 3 cause ~90% of them/);
  });

  it("omits the Pareto clause for a flat distribution (<60%)", () => {
    const flat = failVerdict({
      distinctRuleCount: 6,
      totalFailureCount: 600,
      failures: Array.from({ length: 6 }, (_, i) => ({
        ruleId: "9." + (i + 1) + "-1",
        clause: "9." + (i + 1),
        description: "rule " + (i + 1),
        count: 100,
      })),
    });
    const w = mount(PdfUaVerdict, { props: { verdict: flat } });
    expect(w.text()).toMatch(/counts every occurrence separately/i);
    expect(w.text()).not.toMatch(/top 3 cause/);
  });

  it("omits the Pareto clause when there are fewer than 4 rule types", () => {
    const three = failVerdict({
      distinctRuleCount: 3,
      totalFailureCount: 520,
      failures: [
        { ruleId: "7.1-1", clause: "7.1", description: "a", count: 500 },
        { ruleId: "7.2-1", clause: "7.2", description: "b", count: 10 },
        { ruleId: "7.3-1", clause: "7.3", description: "c", count: 10 },
      ],
    });
    const w = mount(PdfUaVerdict, { props: { verdict: three } });
    expect(w.text()).toMatch(/3 rule types to fix/);
    expect(w.text()).not.toMatch(/top 3 cause/);
  });

  it("uses singular copy for a single rule type", () => {
    const one = failVerdict({
      distinctRuleCount: 1,
      totalFailureCount: 42,
      failures: [{ ruleId: "7.1-1", clause: "7.1", description: "a", count: 42 }],
    });
    const w = mount(PdfUaVerdict, { props: { verdict: one } });
    expect(w.text()).toMatch(/1 rule type to fix/);
    expect(w.text()).toMatch(/This rule type accounts for all 42/);
    expect(w.text()).not.toMatch(/top 3 cause/);
  });

  it("shows 'top N of M' in the toggle when more distinct rules exist than were stored", () => {
    const many = failVerdict({
      distinctRuleCount: 34,
      totalFailureCount: 5000,
      failures: Array.from({ length: 20 }, (_, i) => ({
        ruleId: "8." + (i + 1) + "-1",
        clause: "8." + (i + 1),
        description: "rule " + (i + 1),
        count: 20 - i,
      })),
    });
    const w = mount(PdfUaVerdict, { props: { verdict: many } });
    expect(w.text()).toMatch(/34 rule types to fix/);
    expect(w.find("button").text()).toMatch(/top 20 of 34 rule types/i);
  });

  it("falls back to the shown list length when distinctRuleCount is absent (legacy report)", () => {
    const legacy = {
      available: true,
      passed: false,
      profile: "ua1",
      totalFailureCount: 8,
      failures: [
        { ruleId: "7.1-1", clause: "7.1", description: "a", count: 5 },
        { ruleId: "7.2-1", clause: "7.2", description: "b", count: 3 },
      ],
    };
    const w = mount(PdfUaVerdict, { props: { verdict: legacy } });
    expect(w.text()).toMatch(/2 rule types to fix/);
  });

  it("orders the expanded list most-frequent-first even if props arrive unsorted", async () => {
    const unsorted = failVerdict({
      distinctRuleCount: 3,
      totalFailureCount: 16,
      failures: [
        { ruleId: "AAA-1", clause: "7.1", description: "low", count: 2 },
        { ruleId: "BBB-1", clause: "7.2", description: "high", count: 9 },
        { ruleId: "CCC-1", clause: "7.3", description: "mid", count: 5 },
      ],
    });
    const w = mount(PdfUaVerdict, { props: { verdict: unsorted } });
    await w.find("button").trigger("click");
    const items = w.findAll("li");
    expect(items[0].text()).toContain("BBB-1"); // count 9 first
    expect(items[2].text()).toContain("AAA-1"); // count 2 last
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web exec vitest run app/__tests__/pdfUaVerdict.test.ts`
Expected: the new tests FAIL (no "rule types to fix" copy yet); the pre-existing tests still PASS.

- [ ] **Step 3: Add the reframe computeds to `<script setup>`**

In `apps/web/app/components/PdfUaVerdict.vue`, after the existing `couldNotValidate` computed, add:

```ts
// Defensive client-side sort so "most frequent first" and the Pareto top-3
// hold even for verdicts saved before the API sorted them (Task 1).
const sortedFailures = computed(() => [...(props.verdict?.failures ?? [])].sort((a, b) => b.count - a.count));

// True distinct-rule count; falls back to the shown list length for reports
// saved before distinctRuleCount was recorded.
const distinctRuleCount = computed(() => props.verdict?.distinctRuleCount ?? sortedFailures.value.length);
const shownCount = computed(() => sortedFailures.value.length);
const truncated = computed(() => distinctRuleCount.value > shownCount.value);
const totalOccurrences = computed(() => props.verdict?.totalFailureCount ?? 0);

// Reframed secondary line renders only for a real, counted Fail.
const showReframe = computed(
  () => !couldNotValidate.value && !props.verdict?.passed && distinctRuleCount.value > 0 && totalOccurrences.value > 0,
);

// Pareto honesty gate: claim "top 3 dominate" only with >=4 rule types AND the
// top 3 genuinely covering >=60% of occurrences.
const topThreeShare = computed(() => {
  const total = totalOccurrences.value;
  if (total <= 0) return 0;
  return sortedFailures.value.slice(0, 3).reduce((s, f) => s + f.count, 0) / total;
});
const showPareto = computed(() => distinctRuleCount.value >= 4 && topThreeShare.value >= 0.6);
const paretoPct = computed(() => Math.min(100, Math.round(topThreeShare.value * 100)));

// The toggle's scope phrase ("the 4" / "the top 20 of 34").
const toggleScope = computed(() =>
  truncated.value ? `the top ${shownCount.value} of ${fmt(distinctRuleCount.value)}` : `the ${fmt(distinctRuleCount.value)}`,
);

// Locale-fixed formatting so CI renders "6,941" regardless of host locale.
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
```

- [ ] **Step 4: Reframe the headline + explainer in the template**

In `apps/web/app/components/PdfUaVerdict.vue`, replace the current Fail headline `<p v-else>` block (the one containing `{{ verdict.passed ? "Pass" : "Fail" }}` and the `— {{ verdict.totalFailureCount }} rule failure...` span) with a plain headline plus the reframed lines:

```html
        <p v-else class="font-medium mb-1">
          PDF/UA-1 machine checks (veraPDF): {{ verdict.passed ? "Pass" : "Fail" }}
        </p>

        <!-- Reframed count: distinct rule types lead; occurrence sum demoted. -->
        <template v-if="showReframe">
          <p class="mb-1 text-sm">
            <span class="font-semibold text-[var(--text)]"
              >{{ fmt(distinctRuleCount) }} rule type{{ distinctRuleCount === 1 ? "" : "s" }} to fix</span
            ><span class="text-[var(--text-muted)] font-normal">
              · {{ fmt(totalOccurrences) }} total occurrence{{ totalOccurrences === 1 ? "" : "s" }}</span
            >
          </p>
          <p class="text-xs text-[var(--text-muted)] leading-relaxed mb-2">
            veraPDF counts every occurrence separately.
            <template v-if="distinctRuleCount === 1"
              >This rule type accounts for all {{ fmt(totalOccurrences) }}</template
            ><template v-else
              >These {{ fmt(distinctRuleCount) }} rule types account for all {{ fmt(totalOccurrences) }}</template
            ><template v-if="showPareto"> — and the top 3 cause ~{{ paretoPct }}% of them</template>.
          </p>
        </template>
```

Leave the existing `couldNotValidate` error `<p v-if="couldNotValidate">{{ verdict.error }}</p>` and the "Machine-checkable conditions only…" paragraph exactly as they are (they follow this block; `couldNotValidate` and `showReframe` are mutually exclusive).

- [ ] **Step 5: Update the toggle label and list source in the template**

In the same file, in the failed-checkpoints block: change the toggle's `v-if` and label, and iterate `sortedFailures` with formatted counts.

Change the wrapper `v-if` from `verdict.failures?.length` to `sortedFailures.length`:

```html
        <div v-if="!couldNotValidate && !verdict.passed && sortedFailures.length" class="mt-3">
```

Replace the button label line (currently `{{ open ? "Hide" : "Show" }} failed checkpoints ({{ verdict.failures.length }}) {{ open ? "↑" : "↓" }}`) with:

```html
            {{ open ? "Hide" : "Show" }} {{ toggleScope }} rule type{{ distinctRuleCount === 1 && !truncated ? "" : "s" }} (most frequent first)
            {{ open ? "↑" : "↓" }}
```

Change the list's `v-for` source from `verdict.failures` to `sortedFailures`, and format the count with `fmt`:

```html
          <ul v-if="open" class="mt-2 text-xs space-y-1.5 text-[var(--text-muted)]">
            <li v-for="f in sortedFailures" :key="f.ruleId + '|' + f.clause">
              <span class="font-mono text-[var(--text)]">{{ f.clause }}</span>
              <span
                v-if="f.ruleId && f.ruleId !== f.clause && !String(f.ruleId).startsWith(f.clause + '-')"
              >
                · {{ f.ruleId }}</span
              >
              <span v-if="f.description"> — {{ f.description }}</span>
              <span class="text-amber-400 ml-1">({{ fmt(f.count) }})</span>
              <div class="mt-0.5 text-[var(--text-secondary)]">
                <span class="text-emerald-300/80">Fix:</span> {{ pdfUaFixHint(f) }}
              </div>
            </li>
          </ul>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter web exec vitest run app/__tests__/pdfUaVerdict.test.ts`
Expected: ALL tests PASS — the new reframe block plus every pre-existing test (Fail badge, collapsed-by-default, expand, Fix hint, ruleId regression, Pass, Could-not-validate).

- [ ] **Step 7: Run the full web + API suites**

Run: `pnpm --filter web exec vitest run && pnpm --filter api exec vitest run`
Expected: all PASS.

- [ ] **Step 8: Lint + full build (catches tsc/vue-tsc errors Vitest misses)**

Run: `pnpm lint && pnpm build`
Expected: no lint errors; all three package builds succeed (`@file-audit/analyzer`, `api`, `web`). If Prettier flags the SFC, run `pnpm format` and re-run.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/components/PdfUaVerdict.vue apps/web/app/__tests__/pdfUaVerdict.test.ts
git commit -m "feat(pdfua): reframe veraPDF verdict — distinct rule types lead, gated Pareto

Headline now leads with the actionable count (distinct rule types) and demotes
the raw occurrence sum to context, with a 'counts every occurrence' explainer
and a Pareto callout gated to >=4 rule types and >=60% top-3 share. List is
sorted most-frequent-first (defensively, for legacy verdicts too); toggle reads
'top 20 of N' when truncated. distinctRuleCount falls back to the shown length
for pre-existing reports. Presentation only."
```

---

## Release (after both tasks land — confirm with the user first)

Not a coding task. Per the release checklist memory, a patch release (**v1.37.2** candidate) should, once the user approves:
- `CHANGELOG.md` entry under a new `## v1.37.2` heading.
- Bump `version` in root `package.json`, `apps/web/package.json`, `apps/api/package.json` (all to `1.37.2`).
- README § test counts if they changed (adds ~10 tests: 3 API + ~7 web).
- Consider whether the data-retention § security-log needs a line (likely not — no data-handling change).
- Tag `v1.37.2` on the merge commit; remind the user it is **not live** until the droplet `./rebuild.sh` (behavior is unchanged where veraPDF isn't installed).

## Self-Review

- **Spec coverage:** headline reframe (Task 2 §4), demoted total (§4), "counts every occurrence" explainer (§4), Pareto gate ≥4 & ≥60% (§3 computeds + §4 template + tests), sort-before-truncate + `distinctRuleCount` (Task 1 §5), optional field + legacy fallback (Task 1 §3–4, Task 2 §3 + legacy test), ">20 of N" toggle (Task 2 §5 + test), singular copy (§4 + test), no scoring change (nothing touches scorer). All spec sections map to a task. ✓
- **Placeholder scan:** no TBD/TODO; every code step shows full code. ✓
- **Type consistency:** `distinctRuleCount` optional in both interfaces; `sortedFailures`, `distinctRuleCount`, `shownCount`, `truncated`, `totalOccurrences`, `showReframe`, `topThreeShare`, `showPareto`, `paretoPct`, `toggleScope`, `fmt` all defined in Task 2 §3 and used consistently in §4–5. `extractVerdict` return shape matches the interface. ✓
