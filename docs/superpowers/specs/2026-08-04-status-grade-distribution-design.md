# `/status` grade distribution — design spec

**Date:** 2026-08-04 · **Status:** design, pre-implementation
**Type:** Additive `/status` field + HTML rendering. **No scoring change. JSON contract stays backward-compatible.**

## Goal

Show the **distribution of letter grades** across the audited corpus on `/status`, per
time window, so a non-technical reader can see at a glance that most audited documents
are nowhere near accessible — rather than seeing only a bare count of documents audited.

Requested framing: *"24 A documents, 100 C documents, 506 F documents."*

## Why this is cheap

The data already exists and there is an exact structural precedent:

- `audit_log.grade TEXT` and `audit_log.created_at DATETIME` are populated on every
  audit by `recordAudit()` (`apps/api/src/services/auditLog.ts:62`, called from
  `analyze.ts`).
- `countDocumentsByFormat(db, sinceMs)` (`apps/api/src/services/status.ts:224`) is
  already a `GROUP BY` over the same table with the same window predicate and the same
  `DOCUMENT_TYPES` event filter. The grade version is a direct copy with `grade` in
  place of `FORMAT_CASE`.
- Grade letters are `A`/`B`/`C`/`D`/`F` (`packages/shared/src/scoring.ts:115-124`), and
  `GRADE_COLORS` already maps each to the exact hex the app uses — so the status page
  can render bars in colors consistent with the report UI, with no new palette.

## Design

### 1. Types (`apps/api/src/services/status.ts`)

```ts
export interface GradeCounts {
  A: number; B: number; C: number; D: number; F: number;
  /** Rows with a NULL/unrecognized grade. MUST be surfaced — see "reconciliation". */
  ungraded: number;
}
```

Extend `DocumentCounts`:

```ts
export interface DocumentCounts {
  last_24h: number;
  last_30d: number;
  total: number;
  by_format_30d: FormatCounts;
  by_format_total: FormatCounts;
  by_grade_24h: GradeCounts;   // new
  by_grade_30d: GradeCounts;   // new
  by_grade_total: GradeCounts; // new
}
```

Purely additive — existing monitors and the fleet-audit consumer are unaffected.

### 2. Query

`countDocumentsByGrade(db, sinceMs)`, mirroring `countDocumentsByFormat` exactly:
same `event_type IN (...)` filter, same `created_at > datetime(?, 'unixepoch')`
window, `GROUP BY grade`. Follow the existing pattern of seeding a zeroed struct and
only assigning keys that already exist on it, so an unexpected `grade` value in the DB
cannot inject a key.

### 3. The reconciliation trap

`audit_log.grade` is nullable, and rows exist where it is NULL (failed or pre-column
audits). If those rows are silently dropped, **the distribution will not sum to the
`total` printed directly above it on the same page** — two numbers side by side that
don't reconcile, which reads as a bug and undermines trust in the whole page.

The `ungraded` bucket is therefore mandatory, and the renderer must show it whenever
it is non-zero. A test should assert `sum(GradeCounts) === total` for each window.

### 4. Rendering (`apps/web/server/utils/statusHtml.ts`)

The existing page is a colour-coded collapsible tree with a `.bar` toolbar. Add a
compact horizontal distribution per window — count, percentage, and a proportional bar
in `GRADE_COLORS`. No JS: a `<div>` with a percentage width inside a track, which
matches the page's existing no-script posture (the CSP has no `unsafe-inline` for
scripts).

Keep the raw numbers in the JSON tree as well, so `?json` consumers get the same data.

### 5. The honesty caveat — non-negotiable

The audited corpus is **self-selected**: people upload documents they already suspect
are bad, plus development and test files, plus the same document re-audited many times.

A manager reading "72% F" will cite it as *"72% of our documents are inaccessible."*
The number does not support that claim — it is a statistic about *what people chose to
upload to this tool*, not about any agency's document population.

Given this codebase's verdict-integrity posture, the page must say so in one line
adjacent to the distribution:

> Distribution across documents submitted to this tool. Submissions are self-selected
> (and may include repeat uploads of the same file), so this describes what people
> bring here to check — not the overall state of any agency's documents.

Without that line, the feature manufactures a misleading statistic. With it, the
feature does exactly what was asked: gives a non-technical reader a real sense of scale.

## Open decisions

| Question | Options | Recommendation |
|---|---|---|
| **24h window** | Show it, or suppress below N | **Show it.** Consistent with the existing counters. Recent volume is genuinely low (8 in the last 24h at time of writing), so a distribution over it is noise — but the caveat line covers that, and suppression creates its own confusion ("why did the section disappear?"). |
| **Repeat uploads** | Raw row counts, or `COUNT(DISTINCT content_hash)` | **Ship raw counts first.** `audit_log.content_hash` exists and is indexed (migration 9, `status.ts` neighbours), so a distinct variant is a follow-up if the raw numbers look inflated. Do not build both up front. |
| **Also break down by format?** | grade × format matrix | **No.** Combinatorial explosion on a page whose value is being scannable in five seconds. |

## Tests

`apps/api/src/__tests__/` already drives `status.ts` against a real in-memory SQLite
handle (`StatusDb` is structural specifically to allow this), so:

- Seed rows across grades and timestamps; assert per-window counts.
- Assert NULL-grade rows land in `ungraded`.
- **Assert each window's `GradeCounts` sums to that window's document total** — this is
  the reconciliation guard.
- Assert an unrecognized grade value in the DB does not add a key to the struct.
- `apps/web/app/__tests__/statusHtml.test.ts` — bars render, percentages are correct,
  the caveat line is present, and `ungraded` is shown only when non-zero.

## Effort

**~2–3 hours** including tests and rendering. Smaller than either format spec.

## Note on wording

"**Inaccessible**" is the correct word — *unaccessible* is not standard English.
Worth pinning, since this phrasing will end up in visitor-facing copy.
