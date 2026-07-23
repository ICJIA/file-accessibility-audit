# PDF/UA verdict: reframe the veraPDF failure count

**Date:** 2026-07-23
**Status:** Approved (design)
**Type:** UI copy + one latent-bug fix in the veraPDF mapper. No scoring change.

## Problem

A PDF can earn a strong WCAG 2.2 AA letter grade (e.g. "A") and, in the same
report, show a veraPDF verdict of "Fail — 6941 rule failures". Users read that
as a contradiction and as an impossible workload.

Neither reading is accurate:

- **They are different standards.** The letter grade is WCAG 2.2 AA — a graded,
  partial-credit *barrier* standard (can a real assistive-tech user get through
  the document?). veraPDF checks PDF/UA-1 (ISO 14289-1) — a **binary**
  file-format *conformance* standard where a single structural/syntactic
  nonconformity means Fail. Their scopes barely overlap; a document can clear
  the WCAG bar while tripping PDF/UA syntax rules that don't block a human, and
  vice-versa.
- **The big number is inflated.** veraPDF emits one failure **per occurrence**.
  "6941" is a *sum of occurrences*, not a count of distinct problems. One
  systemic root cause (e.g. figures without alt text) fires once per object, so
  a handful of distinct rules produces thousands of occurrences. The number of
  things you actually fix is the count of **distinct rules** — already grouped
  in `failures[]`.

The user identified the inflated number as the primary source of confusion.

## Goal

Reframe the veraPDF verdict panel so the **actionable** number leads (distinct
rule types), the occurrence sum is demoted to secondary context, and a short
explainer plus a Pareto callout make "few root causes" self-evident. Presentation
only.

## Non-goals

- No change to the WCAG grade, the overall score, or any scoring logic. The
  veraPDF verdict stays informational and non-scoring (reproducibility: it is
  config-gated behind veraPDF being installed; folding it into the score would
  make the same PDF score differently on different servers).
- No relabeling of "Fail" (it is the honest word for a binary conformance test).
- No change to the deterministic "N of 6 essentials" readiness card
  (`PdfUaSignalsCard.vue`).
- No themed/bucketed rollup of rules (considered as option C, deferred — it
  addresses "what do I do", a different pain than the number inflation).

## Design

### 1. Copy — the Fail state of `PdfUaVerdict.vue`

Current headline:

```
!  PDF/UA-1 machine checks (veraPDF): Fail — 6941 rule failures
```

New:

```
!  PDF/UA-1 machine checks (veraPDF): Fail
   18 rule types to fix  ·  6,941 total occurrences        (count emphasized, total muted)

   veraPDF counts every occurrence separately. These 18 rule types
   account for all 6,941 — and the top 3 cause ~82% of them.

   [ existing "Machine-checkable conditions only (ISO 14289-1)… manual review…" line — unchanged ]

   [ Show the 18 rule types (most frequent first) ↓ ]
       7.1-1  figure lacks alt text ……………… (4,102)
              Fix: Add alt text to each figure…
       …
```

- The distinct-rule count (`18 rule types to fix`) is the visually emphasized
  number. The occurrence total (`6,941 total occurrences`) is muted secondary
  text. Both use thousands separators via `toLocaleString("en-US")`.
- Singular handled: `1 rule type to fix`, `1 total occurrence`.
- **Render guard:** the reframed secondary line + explainer render only when
  `distinctRuleCount > 0 && totalFailureCount > 0`. If a Fail somehow carries
  neither (e.g. veraPDF reports non-compliant but lists no failing rules), fall
  back to the plain `Fail` headline — no invented "0 rule types" copy. This is
  the single suppression condition referenced by the edge table below.

### 2. The explainer + Pareto honesty gate

Explainer sentence, assembled from parts:

- Base (always, when `distinctRuleCount > 0`):
  `veraPDF counts every occurrence separately. {These N rule types account | This rule type accounts} for all {total}.`
- Pareto clause (appended only when it is genuinely Pareto-shaped):
  ` — and the top 3 cause ~{pct}% of them.`

**Pareto gate — show the clause only when BOTH hold:**

- `distinctRuleCount >= 4` (so "top 3" is a real subset), and
- `topThreeShare >= 0.60` (the top 3 genuinely dominate).

If the distribution is flat (`topThreeShare < 0.60`), drop the clause and keep
only the base explainer — we never dress up a flat spread as a Pareto.

`topThreeShare = sum(count of the 3 highest-count rules) / totalFailureCount`.
`totalFailureCount` is the true denominator (it may exceed the sum of the stored
top-20 counts on documents with >20 distinct rules; that only makes the share
conservative, which is fine). `pct = min(100, round(topThreeShare * 100))`.

### 3. The toggle + list

- Toggle label when not truncated: `Show the {N} rule types (most frequent first)`.
- Toggle label when truncated (`distinctRuleCount > failures.length`, i.e. more
  than 20 distinct rules): `Show the top {failures.length} of {distinctRuleCount} rule types (most frequent first)`.
- The list renders `failures` **sorted by count desc** (see §4 — sorted at the
  source, and defensively re-sorted in the component so legacy stored verdicts
  display correctly too). Each per-rule count uses `toLocaleString("en-US")`.
- Item structure (clause · ruleId — description (count) + "Fix:" hint) is
  otherwise unchanged.

### 4. Data model + latent-bug fix

**`apps/api/src/services/veraPdf.ts` — `extractVerdict()`:**

1. After building and filtering `failures`, **sort by `count` desc before the
   `.slice(0, 20)`.** Today the array is sliced in veraPDF's own emission order,
   so the stored "top 20" is not guaranteed to be the actual 20 highest-count
   rules — which would make both "most frequent first" and the Pareto math wrong.
   This is a real latent bug; the sort fixes it. (JS `Array.sort` is stable on
   Node 22, so ties keep emission order.)
2. Capture `distinctRuleCount = failures.length` **before** the slice — the true
   count of distinct failing rules, independent of the 20-item storage cap.
3. Return `distinctRuleCount` alongside `failures` (sliced) and
   `totalFailureCount`.

Add `distinctRuleCount: 0` to the early-return stubs in `runVeraPdf`,
`extractVerdict` (the no-`validation` / error branches), and
`runVeraPdfOnBuffer` for explicitness (they already return `failures: []`).

**Types — add `distinctRuleCount?: number` (optional) to both parallel verdict
interfaces:**

- `VeraPdfVerdict` in `apps/api/src/services/veraPdf.ts`
- `PdfUaVerdict` in `packages/shared/src/types.ts`

Optional because reports saved before this change lack the field. The route
attaches the structurally-identical API verdict to `AnalysisResult.pdfUaVerdict`
as today; no route logic changes.

**`PdfUaVerdict.vue` legacy fallback:**

- `distinctRuleCount = verdict.distinctRuleCount ?? sortedFailures.length`
- `sortedFailures = [...verdict.failures].sort((a, b) => b.count - a.count)` —
  defensive client-side sort so "most frequent first" and the Pareto top-3 are
  correct even for verdicts stored before the source-side sort existed.

No DB migration: the verdict rides inside the report JSON blob; the new optional
field simply appears on new reports and is absent (→ fallback) on old ones.

## Edge cases

| Case | Behavior |
| --- | --- |
| `passed === true` | Existing green "Pass" line, no failures list. Unchanged. |
| `couldNotValidate` (error + total 0) | Existing neutral "Could not validate" state. Unchanged. |
| `distinctRuleCount === 1` | "1 rule type to fix"; explainer "This rule type accounts for all N"; no Pareto. |
| 2–3 distinct rules | Reframed count + base explainer; no Pareto clause (gate needs ≥4). |
| ≥4 rules but flat (top-3 < 60%) | Reframed count + base explainer; no Pareto clause. |
| >20 distinct rules | List shows top 20; toggle "top 20 of N"; `distinctRuleCount` = true N; Pareto uses true total as denominator. |
| Legacy verdict (no `distinctRuleCount`) | Falls back to `failures.length`; client-side sort keeps display correct. |
| `totalFailureCount === 0` on a Fail | Reframed secondary line suppressed; plain "Fail" headline. |

## Testing

**API — `extractVerdict` (`apps/api/src/services/__tests__/veraPdf*.test.ts`):**

- Rule summaries supplied out of count-order and numbering >20 distinct rules →
  returned `failures` are sorted count-desc, length capped at 20, first element
  is the max, and `distinctRuleCount` equals the true pre-slice distinct count.
- Small case (3 rules) → `distinctRuleCount === 3`, no truncation.
- Error / no-validation branches → `distinctRuleCount: 0`.

**Web — `PdfUaVerdict.vue` (`apps/web/app/__tests__/pdfUaVerdict.test.ts`):**

- Fail with `distinctRuleCount: 18`, `totalFailureCount: 6941`, top-3 ≥60% →
  text contains "18 rule types to fix", "6,941 total occurrences", the base
  explainer, and "top 3 cause ~82% of them" (assert the computed pct).
- Flat distribution (top-3 < 60%) → base explainer present, Pareto clause absent.
- `distinctRuleCount: 3` → no Pareto clause.
- `distinctRuleCount: 1` → "1 rule type to fix", singular explainer, no Pareto.
- `distinctRuleCount: 34`, `failures.length: 20` → toggle reads "top 20 of 34".
- Props with unsorted `failures` → after expanding, the first listed rule is the
  highest-count one (client-side sort).
- Legacy verdict omitting `distinctRuleCount` → renders "{failures.length} rule
  types" (no crash).
- Pass and couldNotValidate existing tests stay green.

Determinism: format all numbers with `toLocaleString("en-US")` so "6,941"
renders identically across CI locales; tests assert the comma form.

## Files touched

- `packages/shared/src/types.ts` — `distinctRuleCount?: number` on `PdfUaVerdict`.
- `apps/api/src/services/veraPdf.ts` — sort-before-slice, capture
  `distinctRuleCount`, add to interface + returns.
- `apps/api/src/services/veraPdfBuffer.ts` — `distinctRuleCount: 0` in stubs.
- `apps/web/app/components/PdfUaVerdict.vue` — headline reframe, explainer,
  Pareto gate, sorted list, ">20 of N" toggle wording, `toLocaleString`.
- Tests: `veraPdf*` (API) + `pdfUaVerdict.test.ts` (web).

## Rollout

Patch release (v1.37.2 candidate). Per the release checklist: on ship, sync
`CHANGELOG.md` + the three `package.json` versions, tag, and update the
README/data-retention entries if warranted — confirm with the user first.
`pnpm build` before push. Not live until the droplet `./rebuild.sh`. Behavior is
identical where veraPDF isn't installed (`available: false`).
