# Audit Accuracy Fixes — Table Structure & Heading Order

**Date:** 2026-06-05 · **Release:** v1.24.1 · **Status:** Fixed, tested, merged
**Area:** `apps/api` — PDF structure parsing (`qpdfService.ts`) and scoring (`scorer.ts`)
**Audience:** engineers (for future fixes) and reviewers/managers (for the trust narrative)

---

> **Standards scope.** This audit evaluates against **WCAG 2.1 Level AA** (the standard Illinois IITAA 2.1 requires) and **WCAG 2.2 Level AA** (a superset the app currently anchors to). Tables and headings are governed by **Success Criterion 1.3.1, Info and Relationships (Level A)** — a criterion _within_ WCAG 2.1 and 2.2 that is **unchanged between the two versions** (2.1 → 2.2 only _added_ criteria; verified against the W3C "What's New in WCAG 2.2"). Below, "WCAG 2.1/2.2 SC 1.3.1" names that criterion within the standard — it is not a separate standard. None of these fixes depend on the WCAG version.

## 1. Executive summary

SA user reported that the audit was **mis-diagnosing tables and headings**:

1. **Tables showed more rows than the PDF actually contained.**
2. **A table passed every visible check but still lost 5 points.**
3. **The heading list at the bottom of the report was out of order** (e.g. the H1 appeared _last_).

These are correctness/trust issues: an audit tool that miscounts structure or docks points it can't justify will not be trusted, regardless of how the underlying file is built.

Investigation found **two distinct defects**, one of which had a single shared root cause behind two of the three symptoms:

| #   | Symptom                       | Defect                                                                                                                                                                                   | Severity                                |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | "More rows than the PDF has"  | Tables **nested inside another table's cell** were counted as separate top-level tables, inflating the table count and the summed row count.                                             | Visible mis-report                      |
| 2   | "Passed everything, still −5" | The 5-point **header-association** check credited _only_ the explicit `/Headers` attribute and ignored `/Scope` — so a simple table correctly built with `/Scope` could never reach 100. | Unjustified deduction                   |
| 3   | "Heading list reversed"       | Headings (and tables) were collected in **object-number order, not document/reading order**, because the parser scanned the flat object map instead of walking the structure tree.       | Display defect **+ latent mis-scoring** |

**Root cause shared by #1 and #3:** the parser discovered structural elements by iterating the flat QPDF object map (`Object.entries(objects)`) and keying on the element type, rather than traversing the PDF structure tree (`StructTreeRoot` → `/K`) in reading order. Object-number order is _not_ reading order, and the flat scan also picked up tables that should not have been top-level.

All three are fixed. The full API test suite passes (**357 tests**), the type-check build is clean, and four new regression tests were added (written failing first, then made to pass).

---

## 2. Background — how the audit reads a PDF

The API shells out to **QPDF** to dump a PDF's internal objects as JSON, then `parseQpdfJson()` (`apps/api/src/services/qpdfService.ts`) extracts the accessibility-relevant structure: headings, tables, lists, form fields, images, language, etc. That structured result (`QpdfResult`) is handed to `scorer.ts`, which produces per-category scores and findings.

Two facts matter for these bugs:

- **A tagged PDF's logical structure is a tree** rooted at `StructTreeRoot`, where each element's `/K` ("kids") array defines the **reading order** of its children. The only correct way to read document order is to walk that tree.
- **QPDF's object map is keyed by object number** (`"12 0 R"`), and iterating it yields objects in object-number/emission order. That order has **no guaranteed relationship to reading order** — it depends entirely on how the producing tool assigned object numbers. Tools that tag incrementally (including remediation passes) routinely assign numbers out of reading order.

The parser already contained a correct document-order tree walker (`collectStructTreeMcidsByPage`, used for the reading-order check), but the heading/table collection did **not** use it.

---

## 3. Issue #1 — Inflated table & row counts

### Symptom

A document with one visible data table reported **two tables**, and the "Table Structure Overview" / total row count exceeded the rows actually present ("more rows than what's actually in the pdf").

### Root cause

`parseQpdfJson()` collected a table for **every** object whose structure type mapped to `/Table`:

```ts
// before — inside the flat object-map loop
if (tag === "/Table") {
  result.tables.push(analyzeTable(o, objects, roleMap));
}
```

A **nested table** (a `/Table` inside another table's `/TD` cell) is itself an object with type `/Table`. So it was pushed as its own top-level table **in addition to** being detected as a nested table on its parent (`hasNestedTable = true`). The report then listed it as a second table and summed its rows into the total.

### Fix

Collect tables as _candidates with their object ref_, then exclude any table that appears in another table's subtree. The parent still records `hasNestedTable`; the nested table is simply not re-reported as top-level.

- New helper `collectDescendantTableRefs()` walks a table's subtree and records the object refs of any descendant `/Table` elements.
- `parseQpdfJson()` builds `tableCandidates`, computes the set of nested refs, and only calls `analyzeTable()` on candidates that are **not** nested.

(Bonus correctness: `analyzeTable()` now runs _after_ the object loop, so it sees the fully-assembled RoleMap — previously a custom-role table could be mis-analyzed if its RoleMap object had a higher object number.)

### Tests

`apps/api/src/__tests__/qpdfParser.test.ts`:

- `detects nested tables` — strengthened to assert `result.tables` has length **1** (was implicitly 2 before).
- `does not inflate row counts by hoisting a nested table to top level` — one 2-row table whose cell holds a 3-row nested table must report **one** table with **2** rows and a total of **2** rows (not two tables totalling 5).

---

## 4. Issue #2 — Table docked 5 points despite passing every check

### Symptom

A simple data table with header cells, `/Scope` attributes, proper rows, consistent columns, no nesting, and a caption — i.e. fully conformant — still scored **95**, not 100. Every check the user recognized as a requirement showed as satisfied.

### Root cause

`scoreTableMarkup()` (`apps/api/src/services/scorer.ts`) awards a 5-point "header association" item, but it only credited the explicit `/Headers` attribute:

```ts
// before
const withAssoc = qpdf.tables.filter((t) => t.hasHeaderAssociation).length;
if (withAssoc > 0) score += 5;
```

Under **WCAG 2.1/2.2 SC 1.3.1** (Info and Relationships), headers can be programmatically associated with data cells by **either** technique:

- **`/Scope`** — the recommended approach for **simple** tables.
- **`/Headers`** (explicit cell-id association) — intended for **complex** tables (merged cells, multi-level headers).

A correctly built simple table uses `/Scope` and does _not_ need `/Headers`. Crediting only `/Headers` guaranteed that such a table lost 5 points it should have earned — the "passed everything, still −5" report.

A second instance of the same flaw surfaced in testing: a `/Scope`-based table with **inconsistent columns** was docked _both_ the 10 column points _and_ the 5 association points (scored 85). It should lose only the 10 (→ 90).

### Fix

Credit header association when a table has **`/Scope` OR explicit `/Headers`**:

```ts
// after
const withExplicitHeaders = qpdf.tables.filter(
  (t) => t.hasHeaderAssociation,
).length;
const withAssoc = qpdf.tables.filter(
  (t) => t.hasHeaderAssociation || t.hasScope,
).length;
if (withAssoc > 0) {
  score += 5;
  // finding text distinguishes /Headers vs /Scope association
}
```

This change is surgical: **every previously-tested table that had `/Scope` also had `/Headers`**, so all existing passing tests were unaffected. The bug lived entirely in the untested "`/Scope`, no `/Headers`" case — exactly the common, conformant simple table.

### Tests

`apps/api/src/__tests__/scorer.test.ts`:

- `scope-only conformant table reaches 100 (scope satisfies header association)` — new; was 95, now 100.
- `inconsistent columns reduces score` — expectation corrected 85 → **90** (the table has `/Scope`, so it is no longer double-penalized; it loses only the 10 for inconsistent columns).

### Known residual (intentional, not a bug)

A conformant simple table that has **no `<Caption>`** still caps at **95**, because caption is a separate 5-point item. WCAG 2.1/2.2 SC 1.3.1 does not require a caption, so this is arguably the same class of issue, but it is a **rubric-philosophy decision** that would shift more historical scores and was deliberately left unchanged in this fix. See §7.

---

## 5. Issue #3 — Heading list out of order

### Symptom

The heading outline at the bottom of the report displayed levels in the wrong order — e.g. `H2 → H3 → H2 → H1`, with the H1 at the end instead of the start.

### Root cause

Same as Issue #1's root: headings were collected during the flat object-map scan:

```ts
// before — inside the flat object-map loop, in object-number order
if (tag === "/H1" || tag === "/H2" /* … */) {
  result.headings.push({ level: /* … */, tag: o["/S"] });
}
```

So `result.headings` came out in **object-number order**. When a tool tags the H1 last (common in remediation), the H1 gets a high object number and lands at the end of the list.

### Does it affect scoring?

**For the specific reported example, no — but the same root cause is a latent scoring bug.** The heading hierarchy-skip detector (`scorer.ts`) walks `qpdf.headings` _in array order_ and flags an "H𝑛 → H𝑚 skip" whenever an upward jump greater than 1 occurs. The reported sequence `[2,3,2,1]` has no upward jump > 1, so it still scored 100 — purely a confusing display. **But** a document whose true order is `H1 → H2 → H3`, scrambled by object order into `[1,3,2]`, produces a **false "H1 → H3 skip"**, dropping the Heading Structure category (weight 15) from 100 to ~60. The fix removes that latent mis-scoring as well.

### Fix

After the object loop (when the RoleMap is fully assembled and the struct tree is known), re-collect headings by walking the structure tree in document order:

- New helper `collectHeadingsInOrder()` walks `StructTreeRoot → /K` depth-first, in array order, mapping types through the RoleMap exactly as the flat scan did, and returns headings in reading order.
- The result **replaces** `result.headings` only when the walk yields at least one heading; otherwise the flat-scan result is kept as a fallback (covers untagged/malformed inputs and test fixtures whose elements aren't linked into a tree).

No frontend change was needed: the report's heading display and the hierarchy check both read `qpdf.headings` directly, so fixing the order at the source corrects both.

### Tests

`apps/api/src/__tests__/qpdfParser.test.ts`:

- `returns headings in document (structure-tree) order, not object-number order` — a tree whose H1 has the **highest** object number must still yield `[H1, H2, H3]`. (Flat scan yielded `[H3, H2, H1]`.)

---

## 6. Verification

- **Tests written first, watched fail, then made to pass** (TDD). The scorer reproduction failed with `expected 95 to be 100` — exactly the reported "−5".
- **Full API suite: 357 passed** (was 354; +1 scorer, +2 parser). Web suite unchanged (308). Project total 665.
- **`tsc --noEmit`: clean (exit 0).**

Run locally:

```bash
pnpm test:api        # full API suite
pnpm test:scoring    # scoring tests only
pnpm --filter api build   # tsc --noEmit type check
```

---

## 7. Follow-ups / open items

| Item                  | Description                                                                                                                                                                                                                       | Status                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Caption rubric**    | A simple table conformant under WCAG 2.1/2.2 SC 1.3.1 with no `<Caption>` still caps at 95. Caption is not a WCAG requirement; making it a non-blocking bonus would let such tables reach 100, but shifts more historical scores. | **Deferred — owner decision** |
| **Lists**             | Lists (`/L`) are still collected in object-map order (`qpdfService.ts`), the same latent flaw as headings/tables. No one reported it and list ordering does not affect list scoring, so it was left untouched.                    | **Deferred**                  |
| **Off-tree elements** | The heading fix counts only tree-reachable headings (correct — off-tree elements aren't exposed to assistive tech). If a future case needs flat-scan elements surfaced, revisit the fallback.                                     | Noted                         |

---

## 8. Changed files

| File                                        | Change                                                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/services/qpdfService.ts`      | Table candidate collection + nested-table exclusion; document-order heading re-collection; new helpers `collectDescendantTableRefs`, `collectHeadingsInOrder`. |
| `apps/api/src/services/scorer.ts`           | Header-association credit for `/Scope` or `/Headers`.                                                                                                          |
| `apps/api/src/__tests__/qpdfParser.test.ts` | +2 tests (heading order, row-count inflation); strengthened nested-table assertion.                                                                            |
| `apps/api/src/__tests__/scorer.test.ts`     | +1 test (scope-only → 100); corrected inconsistent-columns expectation 85 → 90.                                                                                |

---

## 9. The takeaway for future work

> **Structural elements must be collected by traversing the structure tree (`StructTreeRoot → /K`) in document order — never by iterating the flat object map.** Object-number order is not reading order, and the flat map contains elements (nested tables, and potentially off-tree objects) that should not be reported as top-level. This single principle prevents both the row-count inflation and the heading-order class of bug, and should be applied if list/figure collection is ever revisited.
