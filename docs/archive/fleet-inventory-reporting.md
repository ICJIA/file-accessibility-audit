# Fleet inventory reporting — integration brief

This document tells a **fleet inventory tool** (or any automation that
enumerates PDFs across ICJIA sites) how to enrich each row in its
HTML / CSV output with an accessibility score and a click-through
link to the full audit report on this tool.

The single endpoint to integrate against is:

```
POST  https://audit.icjia.app/api/audit-url
```

This endpoint fetches a PDF by URL, runs the same audit pipeline the
interactive web app uses, persists the result, and returns a trimmed
CSV-friendly payload — strict score + practical score + a stable link
to the full report. One HTTP call per PDF; everything you need for a
row is in the response.

Related endpoints (`/api/analyze-url`, `/api/bulk-from-inventory`) and
their tradeoffs are listed in the main `README.md` under
[Fleet PDF Auditing](../README.md#fleet-pdf-auditing-post-apiaudit-url).

---

## 1. Authentication

The endpoint requires a Personal Access Token (PAT). One token covers
the entire fleet job.

1. In a browser, sign in to `https://audit.icjia.app`.
2. Go to **Account → Personal Access Tokens** and create a token.
3. Treat the returned token (`fap_...`) as a secret. Put it in your
   CI environment as `ICJIA_AUDIT_PAT` (or similar). Do **not** commit it.
4. PATs can be revoked from the same UI without affecting browser
   sessions.

Every request must send:

```
Authorization: Bearer fap_<your-token>
Content-Type: application/json
```

Without a token (or with an invalid/revoked one), the endpoint returns
`401 Unauthorized`.

---

## 2. Request shape

One PDF per request:

```http
POST /api/audit-url
Authorization: Bearer fap_…
Content-Type: application/json

{
  "url": "https://agency.icjia-api.cloud/uploads/some-file.pdf"
}
```

Optional `"force": true` — see [§ 6 Dedup](#6-dedup-you-dont-have-to-do-anything).

---

## 3. Response shape (200 OK)

Every top-level field is a scalar or a `{ score, grade }` pair. No
nested arrays, no per-category breakdown. Designed for direct
flattening into a CSV row.

```json
{
  "filename":        "some-file.pdf",
  "pageCount":       16,
  "audited":         "2026-05-18T19:05:38.488Z",
  "strict":    { "score": 52, "grade": "F" },
  "practical": { "score": 56, "grade": "F" },
  "reportId":        "f7d005990c6bea51eaae365fdbdf9997",
  "reportUrl":       "https://audit.icjia.app/report/f7d005990c6bea51eaae365fdbdf9997",
  "reportExpiresAt": "2027-05-18T19:05:38.488Z",
  "cached":          false
}
```

| Field | Type | Meaning |
|---|---|---|
| `filename` | string | Derived from the URL path; max 200 chars. |
| `pageCount` | integer | PDF page count from the audit pipeline. |
| `audited` | ISO 8601 | When this audit row was created. On dedup hits, the original audit timestamp. |
| `strict.score` | 0-100 | Strict scoring profile — anchored to WCAG 2.1 AA + IITAA §E205.4. |
| `strict.grade` | A/B/C/D/F | Letter grade for the strict score. |
| `practical.score` | 0-100 | Practical scoring profile — adds PDF/UA compliance signals and partial-credit floors. |
| `practical.grade` | A/B/C/D/F | Letter grade for the practical score. |
| `reportId` | 32 hex chars | Opaque report identifier. |
| `reportUrl` | URL | Absolute URL of the full audit report (human-readable). |
| `reportExpiresAt` | ISO 8601 | When the report row + URL become invalid (365 days from creation). |
| `cached` | boolean | `true` if this was a dedup hit on an existing report; `false` for a fresh audit. |

**The two scores can differ.** Strict and Practical are both valid
WCAG-based evaluations that emphasize different signals — there is no
"correct" one. Show both. Auditors and managers consult both depending
on the question they're answering.

---

## 4. Recommended CSV / HTML columns

Add **eight columns** to whatever the fleet inventory already emits
per row:

| Column name | Source | Example | Notes |
|---|---|---|---|
| `strict_score` | `.strict.score` | `52` | 0-100; null if audit failed |
| `strict_grade` | `.strict.grade` | `F` | A / B / C / D / F |
| `practical_score` | `.practical.score` | `56` | 0-100 |
| `practical_grade` | `.practical.grade` | `F` | |
| `page_count` | `.pageCount` | `16` | useful for sort / filter |
| `report_url` | `.reportUrl` | `https://audit.icjia.app/report/…` | clickable in HTML; bare URL in CSV |
| `report_expires_at` | `.reportExpiresAt` | `2027-05-18T19:05:38.488Z` | ISO 8601 |
| `audited_at` | `.audited` | `2026-05-18T19:05:38.488Z` | ISO 8601 |

You may also want an `audit_error` column for rows that failed (see
[§ 5 Error handling](#5-error-handling)).

### HTML report rendering

Render `report_url` as:

```html
<a href="https://audit.icjia.app/report/…" target="_blank" rel="noopener">
  View report ↗
</a>
```

Color-code the grade cells (red F · amber D · yellow C · light-green B
· green A) so a manager scanning the fleet report can spot regressions
at a glance.

### CSV rendering

Emit `report_url` as a bare URL — Excel and most CSV consumers will
linkify it automatically. Quote the field if your CSV writer doesn't
do that by default, since some URLs may contain characters that need
escaping.

### Header row

```csv
url,filename,page_count,strict_score,strict_grade,practical_score,practical_grade,report_url,report_expires_at,audited_at,audit_error
```

(`url` is whatever your inventory already has; the rest come from
audit-url.)

### Flattening with `jq`

```bash
curl -sS https://audit.icjia.app/api/audit-url \
  -H "Authorization: Bearer fap_$ICJIA_AUDIT_PAT" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://agency.icjia-api.cloud/uploads/some-file.pdf"}' \
| jq -r '[
    .filename,
    .pageCount,
    .strict.score, .strict.grade,
    .practical.score, .practical.grade,
    .reportUrl,
    .reportExpiresAt,
    .audited
  ] | @csv'
```

Pipe one of these per PDF into the inventory CSV, prepending the
inventory's existing `url` field, and append an empty `audit_error`
column. That's the entire integration in shell.

---

## 5. Error handling

The endpoint returns standard HTTP status codes with a JSON body. When
an audit fails, **still emit the inventory row** with empty score
columns and a populated `audit_error` column — auditors need to see
"we tried but couldn't analyze this one" rather than have rows
silently disappear.

| HTTP | Meaning | What to write to `audit_error` |
|---|---|---|
| `200` | Audit succeeded | (empty — populate score columns instead) |
| `400` | URL malformed or not in allowlist | `body.details` |
| `401` | PAT missing / invalid / revoked | "auth error: check PAT" |
| `413` | Fetched PDF exceeded 100 MB cap | "PDF too large (> 100 MB)" |
| `422` | Fetched content is not a PDF | `body.details` |
| `429` | Rate-limited (shared with `/api/analyze`) | "rate-limited — back off and retry" |
| `502` | Upstream fetch from the PDF host failed (404, timeout, etc.) | `body.error` |
| `503` | Audit server busy (analysis semaphore full) | "server busy — retry with backoff" |
| `5xx` | Unexpected server error | `body.error` if present, else status code |

### Pseudocode

```python
def audit_one(pdf_url: str) -> dict:
    resp = requests.post(
        "https://audit.icjia.app/api/audit-url",
        headers={"Authorization": f"Bearer {PAT}"},
        json={"url": pdf_url},
        timeout=120,
    )
    if resp.status_code == 200:
        return resp.json()
    body = (resp.json() if "application/json" in resp.headers.get("content-type", "") else {})
    return {
        "audit_error": body.get("details") or body.get("error") or f"HTTP {resp.status_code}",
    }
```

### Retry policy

- `429` / `503` — retry up to 3 times with exponential backoff (e.g.,
  10 s → 30 s → 90 s). Both indicate transient overload.
- `502` — retry **once** after 30 s (could be a flaky CMS); don't
  retry indefinitely.
- `4xx` other than `429` — do not retry. The PDF or request is
  fundamentally bad; record the error and move on.

---

## 6. Dedup (you don't have to do anything)

The server hash-dedups by **byte content per caller**. After fetching
each PDF the server computes `sha256(bytes)` and looks for a non-expired
report owned by the same caller (PAT) with the same hash.

| Scenario | `cached` field | `reportId` returned |
|---|---|---|
| First time you audit this PDF | `false` | newly minted |
| You audit the **same byte content** again | `true` | same `reportId` as before |
| You audit a **different PDF at the same URL** (file was updated) | `false` | a new `reportId` |

**Operational consequence:** when you re-run the fleet job next
quarter, unchanged PDFs return the same `reportUrl` and your CSV
diff cleanly distinguishes "this row changed" (new URL) from "row
unchanged" (same URL). No client-side caching needed.

### When to use `"force": true`

Only when you specifically want a fresh audit on identical bytes —
e.g., proving "yes, this PDF still has the same issues after a year"
or testing that the audit pipeline itself produces the same result.
Don't pass `force` by default; it just generates duplicate rows in
the database.

---

## 7. Pacing and rate limits

The endpoint shares the `analyzeLimiter` rate limit with the rest of
the audit API. **Do not parallelize beyond 1-2 concurrent requests.**
Each audit holds an analysis semaphore slot server-side; flooding the
endpoint produces 429s and 503s.

Recommended pacing for a fleet of 100-500 PDFs:

- **Serial** processing, one request at a time.
- 0-second sleep between requests is fine — the server processes each
  in 2-15 seconds depending on PDF size.
- If you hit 429 or 503, back off as described in
  [§ 5 Error handling](#5-error-handling).

A 500-PDF fleet at an average of 5 s per audit completes in roughly
**40 minutes**. Plan the job accordingly.

---

## 8. URL allowlist

Only PDFs hosted on these domains can be audited. Each entry matches
the host exactly or any subdomain of it.

| Allowed host | Coverage |
| --- | --- |
| `illinois.gov` | every Illinois state agency subdomain (e.g., `icjia.illinois.gov`, `idph.illinois.gov`, `doit.illinois.gov`) |
| `icjia.cloud` | `*.icjia.cloud` (ICJIA-owned services) |
| `icjia.app` | `*.icjia.app` (production `audit.icjia.app` and siblings) |
| `icjia-api.cloud` | `*.icjia-api.cloud` (`agency`, `dvfr`, `i2i`, `vpp`, `infonet`, etc.) |
| `ilheals.com` | `*.ilheals.com` (program partner) |

Look-alike domains are rejected — `illinois.gov.evil.com` does *not*
match `illinois.gov` (no dot before the allowed host), and
`fakeillinois.gov` does not match either (no subdomain separator).

Any URL on another host returns `400 Bad Request` with the message
`host '<host>' is not in the allowlist`. To add a new domain, either:

- Open a PR or issue against
  [github.com/ICJIA/file-accessibility-audit](https://github.com/ICJIA/file-accessibility-audit)
  to update `DEFAULT_ALLOWED_HOSTS` in
  `apps/api/src/routes/analyze-url.ts`, **or**
- Pass `ANALYZE_URL_ALLOWED_HOSTS=newhost.example.com` as a comma-separated
  env var on the audit-tool deployment (per-deploy override, no code
  change required).

The fleet inventory tool should **filter to allowlisted hosts before
calling** the API — it's cheaper to skip a known-bad URL than to make
a round-trip and get a 400.

---

## 9. TTL and re-running the fleet job

- Report links stay valid **365 days** from the audit creation date
  (`reportExpiresAt`).
- After expiration, the report row is purged by the periodic cleanup
  sweep and the URL returns `404 Not Found`.
- **Recommendation:** run the fleet job at least every **11 months**
  so report links rotate cleanly before they expire. If you discover
  links expiring in your published HTML / CSV report, just re-run the
  fleet job — unchanged PDFs will get fresh `reportExpiresAt`
  timestamps via the next audit-url call (dedup hit returns the
  cached row's `reportExpiresAt`, so consider passing `"force": true`
  for a guaranteed-fresh row when expiration is the goal).

---

## 10. Smoke test before going live

Before kicking off a full fleet run, smoke-test against three known
PDFs spanning the grade range:

| Test | Expected |
|---|---|
| 1. Fresh audit of a low-scoring PDF | `cached: false`, strict score < 60, valid `reportUrl` that renders an HTML report when curled |
| 2. Same URL called immediately again | `cached: true`, **same** `reportId` as test 1 |
| 3. A deliberately bad URL (404, non-PDF, non-allowlisted host) | 4xx / 5xx with a readable `error` in the JSON body |

Three current production PDFs that can serve as the smoke baseline:

```
https://agency.icjia-api.cloud/uploads/NCHIP_Live_Scan_NOFO_Instructions_512683ab2c.pdf
  → 16 pp, strict 52/F, practical 56/F

https://agency.icjia-api.cloud/uploads/ICJIA_Budget_Committee_Minutes_022626_b5ac397c30.pdf
  → 11 pp, strict 74/C, practical 74/C

https://agency.icjia-api.cloud/uploads/Winter_2026_Newsletter_2b3b173f43.pdf
  →  2 pp, strict 93/A, practical 95/A
```

(Scores are point-in-time; they may shift if the PDF is replaced
upstream or if the scoring engine is updated.)

---

## 11. Open questions / things to flag during integration

- **PAT scope.** Each PAT is bound to the user who created it. If
  the fleet job is operated by a team account, decide who owns the
  PAT and how rotation is handled.
- **Audit-error visibility.** When a PDF can't be audited, the fleet
  report should show *something* to the reviewer — empty score cells
  with a populated `audit_error` column is the recommendation, but
  it's worth deciding whether to highlight error rows visually so
  they don't get lost in a 200-row report.
- **Privacy of audit results.** A report link
  (`https://audit.icjia.app/report/<id>`) is publicly accessible to
  anyone with the URL — no auth required to view it. That's
  intentional (it's how share-links work), but if any of the fleet's
  PDFs contain sensitive content, the report itself (which surfaces
  filename, findings, and category-level issues) becomes publicly
  visible to anyone who has the URL. Most agency PDFs are already
  public, so this is usually fine; flag any edge cases before they
  ship into a shared report.

---

## 12. Where to file issues

- **Audit tool bugs / feature requests:**
  [github.com/ICJIA/file-accessibility-audit/issues](https://github.com/ICJIA/file-accessibility-audit/issues)
- **Adding a new domain to the URL allowlist:** same repo —
  open an issue or PR against `apps/api/src/routes/analyze-url.ts`
  `DEFAULT_ALLOWED_HOSTS`.
- **PAT management:** in-app under Account → Personal Access Tokens.

---

*This document describes `/api/audit-url` as of v1.19.0. See
`CHANGELOG.md` for version-specific notes.*
