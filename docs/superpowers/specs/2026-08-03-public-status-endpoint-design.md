# Public `/status` endpoint — design

**Date:** 2026-08-03
**Status:** Approved for planning
**Related:** `icjia-nodemailer` `lib/status.js` (the sibling implementation this follows)

## Goal

Serve a public JSON status document at `https://audit.icjia.app/status` so anyone —
operators, managers, or an uptime monitor — can see at a glance that the service is
alive, that its audit engines actually work, and how many documents it has audited.

The page must be excluded from search indexing and must never disclose anything about
*who* used the service or *what* they audited.

## Non-goals

- Not a dashboard. Raw JSON only; no HTML view, no charts.
- Not a rewrite of `/healthz`. That route is untouched — see
  [Relationship to /healthz](#relationship-to-healthz) for why it survives despite `/status`
  becoming the monitor target.
- Not authenticated. The payload is designed so that it does not need to be.

## Audience

Two readers, and the payload has to work for both:

1. **A non-technical manager** who opens the URL to answer "is it working, and is anyone
   using it?" Every key must be self-explanatory. A metric that prompts a follow-up
   question has failed.
2. **An uptime monitor** that needs a machine-readable verdict and a meaningful HTTP status.

Requirement (1) is why several otherwise-available metrics are deliberately excluded —
see [Considered and rejected](#considered-and-rejected).

## Topology

Production nginx routes `/api/*` **straight to Express**, bypassing Nuxt. A route that must
answer at `audit.icjia.app/status` therefore has to be served by the Nuxt tier. This is the
same constraint documented in `apps/web/server/routes/healthz.ts`, and this design
mirrors that route's structure.

| Route | Tier | Responsibility |
|---|---|---|
| `GET /api/status` | Express | Real work: DB aggregates + engine probes. Source of truth. |
| `GET /status` | Nitro | Proxies over loopback, adds `web`/`api`, sets headers, selects 200/503. |

Logic lives in pure, probe-injected units (`services/status.ts`, `server/utils/status.ts`)
so both tiers unit-test without a live API, a live database, or an installed engine — the
pattern already established by `server/utils/health.ts`.

### Which tier owns which field

`web` and `api` are **not** produced by Express — neither can meaningfully self-report.
They are decided at the Nitro tier by construction, exactly as `/healthz` does it:

- `web: "ok"` — true whenever the handler runs at all.
- `api: "ok"` — true when the loopback probe returned a payload; `"down"` when it did not.

Everything else in the payload originates in Express.

### When the API is unreachable

`/status` returns `503` with a minimal, honest payload rather than a partial one:

```json
{ "status": "down", "web": "ok", "api": "down" }
```

No `engines`, no counts, no `version` — none of it is knowable without the API. Consumers
must treat every field except `status`, `web`, and `api` as optional.

`uptime` / `uptime_seconds` describe the **API process** (Express `startedAt`), which is the
process that performs audits. The Nuxt tier's own uptime is not reported.

## Payload

```json
{
  "status": "ok",
  "version": "1.38.2",
  "uptime_seconds": 431520,
  "uptime": "4d 23h 52m",
  "checked_at": "2026-08-03T14:22:10Z",
  "checked_at_chicago": "Aug 3, 2026, 9:22:10 AM CDT",

  "web": "ok",
  "api": "ok",
  "database": "ok",

  "engines": {
    "checked_at": "2026-08-03T14:19:44Z",
    "qpdf":     { "ok": true, "version": "12.3.2" },
    "verapdf":  { "ok": true, "version": "1.26.1" },
    "chromium": { "ok": true }
  },

  "documents_audited": {
    "last_24h": 37,
    "last_30d": 812,
    "total": 14203,
    "by_format_30d":   { "pdf": 700,   "docx": 84,   "pptx": 18,  "xlsx": 10,  "other": 0 },
    "by_format_total": { "pdf": 12010, "docx": 1600, "pptx": 380, "xlsx": 210, "other": 3 }
  },
  "last_audit_at": "2026-08-03T14:02:55Z",
  "last_audit_at_chicago": "Aug 3, 2026, 9:02:55 AM CDT",

  "remediation": {
    "enabled": true,
    "jobs_24h": { "complete": 4, "failed": 0 }
  }
}
```

Timestamps are UTC ISO plus an `America/Chicago` rendering, matching `lib/status.js`. The
Chicago field is `null` if Node was built without full ICU; the UTC field is always present.

### Degraded shape

```json
{
  "status": "degraded",
  "degraded": ["verapdf"],
  "engines": { "verapdf": { "ok": false, "reason": "timeout" } }
}
```

`degraded` is present only when non-empty, so the happy path stays clean.

## Data sources

### Document counts

`audit_log` has no `format` column. The split is derived from the stored `filename`
extension at query time:

```sql
SELECT
  CASE
    WHEN lower(filename) LIKE '%.pdf'  THEN 'pdf'
    WHEN lower(filename) LIKE '%.docx' THEN 'docx'
    WHEN lower(filename) LIKE '%.pptx' THEN 'pptx'
    WHEN lower(filename) LIKE '%.xlsx' THEN 'xlsx'
    ELSE 'other'
  END AS format,
  COUNT(*) AS n
FROM audit_log
WHERE event_type IN ('analyze', 'analyze-url', 'audit-url', 'bulk-from-inventory')
GROUP BY format
```

**Derivation over migration, deliberately.** Adding a `format` column would only populate
going forward, so every one of the 365 retained days of history would read as zero until
the table turned over. Deriving from the extension is correct for historical *and* new rows.

`other` catches URL-derived filenames that arrive without an extension. Legacy `.doc` /
`.xls` cannot appear — the app rejects them at upload.

### Event-type taxonomy

| Event type | Counted as a document? |
|---|---|
| `analyze` | Yes — browser upload |
| `analyze-url` | Yes — document fetched from a URL |
| `audit-url` | Yes — document audited via the API |
| `bulk-from-inventory` | Yes — fleet bulk run |
| `audit-url-page` | **No** — a web page, not a document |
| `login`, `logout`, `otp_request` | **No** — auth events |

`audit-url-page` records `filename: result.url` (`apps/api/src/routes/audit-url-page.ts:216`),
i.e. it stores a URL in the filename column. Counting it as a document would both inflate the
figure and make the format split meaningless.

### Other sources

- `database` — `SELECT 1`.
- `remediation.enabled` — `REMEDIATION.ENABLED` config flag.
- `remediation.jobs_24h` — `COUNT(*) … GROUP BY status` over `remediation_jobs`
  (30-day retention, so this is a 24h window on a short-lived table; safe).
- `version` — `apps/api/package.json`. All three package versions are bumped in sync by the
  release checklist, so any of them is authoritative.

## Engine probes

| Engine | Probe | Rationale |
|---|---|---|
| `qpdf` | `execFile(QPDF_BIN, ["--version"])` | `QPDF_BIN` is already resolved at module load in `qpdfService.ts:25`. Cheap. |
| `verapdf` | `execFile(VERAPDF_PATH, ["--version"])` | An existence check cannot tell you the JVM is broken. Running it is the only real working/not-working signal. Same check `rebuild.sh:171` already performs. |
| `chromium` | `puppeteer.executablePath()` + `fs.access(X_OK)` | Launching a real browser per status ping is disproportionate. |

All probes take a short timeout and are covered by the 10-minute engine cache, so a monitor
cannot spawn a JVM on every ping.

veraPDF probing must **not** bypass the concurrency semaphore added in v1.38.0. `--version`
does not go through `veraPdfBuffer.ts`, so there is no interaction — but any future change
that routes the probe through the analysis path must acquire a slot.

## Privacy and security constraints

These are hard requirements, enforced by test — not conventions.

1. **No filesystem paths.** Not `REMEDIATION_VERAPDF_PATH`, not `QPDF_BIN`, not temp
   directories. **v1.38.0 fixed a veraPDF path-disclosure bug; this endpoint must not
   reintroduce it.**
2. **No raw error strings from spawned processes.** Subprocess stderr routinely embeds
   absolute paths. Failures collapse to a fixed enum:
   `reason ∈ { "not_configured", "not_executable", "timeout", "error" }`.
   The full error is logged server-side only.
3. **No filenames, emails, IP addresses, or user-agents.** Every figure is a `COUNT(*)`.
   Filenames are read *inside SQLite* by the `CASE` expression; no row ever reaches the
   response.
4. **No per-user or per-document detail of any kind** — no grades, no scores, no hashes.
5. `X-Robots-Tag: noindex, nofollow` on every response, plus `Disallow: /status` in
   `robots.txt`. Both, because robots.txt is advisory and the header is not.

There is **no sitemap module in this app** (`@nuxtjs/sitemap` is not installed and no
`sitemap.xml` is generated), so sitemap exclusion requires no action.

### Accepted disclosure

Engine **version strings** (`qpdf 12.3.2`, `veraPDF 1.26.1`) are included. This is mild
fingerprinting, accepted because it answers a real operational question — "did the deploy
pick up the new qpdf?" — and because these are local command-line tools, not
network-reachable services. Reducing them to bare `ok` booleans is a one-line change if
that trade stops being worth it.

## Failure semantics

| Tier | Members | Effect |
|---|---|---|
| Core | `api`, `database`, `qpdf` | `503`, `status: "down"` |
| Optional | `verapdf`, `chromium` | `200`, `status: "degraded"` |

veraPDF or Chromium being unavailable degrades the PDF/UA verdict and page audits, but
ordinary document auditing still works. Returning 503 for those would page an operator for
something that is not an outage — the reason this design does not mirror `lib/status.js`,
which has exactly one dependency where this one has four.

## Relationship to `/healthz`

`/status` becomes the UptimeRobot target once shipped. `/healthz` is nevertheless **kept**,
and this is a deliberate decision rather than an oversight.

Nothing consumes `/healthz` at runtime today — no deploy script, no nginx config, no client
code (the footer's `ServerStatusIndicator` polls `/api/health` directly). Its only references
are documentation, `robots.txt`, and its own tests. Removing it would be safe.

It is kept because **`/status` has strictly more ways to fail.** It spawns subprocesses,
maintains two caches, and runs aggregate SQL; a hung probe, a cache defect, or a slow query
can degrade it. `/healthz` does none of that — one loopback fetch and a branch. When
`/status` misbehaves, `/healthz` is what still answers "the process is alive," which is
exactly the question you need answered at that moment.

The cost of keeping it is zero at runtime and 52 lines at rest. The cost of removing it is
edits to four README sections, `robots.txt`, and the deletion of 8 passing tests — churn
without benefit.

**Documentation must change even though the code does not.** README currently calls
`/healthz` "the single uptime-monitor URL" and instructs the reader to point UptimeRobot at
it. That becomes wrong the moment this ships. README should present `/status` as the monitor
target and `/healthz` as the dependency-free liveness fallback.

## Caching and rate limiting

**Two caches, deliberately, because the two halves of the payload have very different costs.**

| Layer | TTL | Why |
|---|---|---|
| DB aggregates | 5s | SQL only. Not a cost control — just burst coalescing. |
| Engine probes | 10 min | Each miss spawns processes, including a **veraPDF JVM**. |

Both use in-flight coalescing so concurrent requests share one computation — the
`checkMailgun` pattern from `lib/status.js`.

The split exists because `/status` is intended as the uptime-monitor target. A single short TTL
would mean a monitor polling at UptimeRobot's 5-minute default misses the cache on **every
check**, starting a JVM roughly 288 times a day purely to answer monitoring traffic. A 10-min
engine TTL decouples probe cost from poll frequency entirely: probe cost is bounded by the
TTL, not by how often anyone asks.

The aggregate TTL was **60s in v1.39.0–1.39.2 and reduced to 5s in v1.39.3.** The original
value mistakenly applied the probe-cost reasoning to queries that have no such cost: a
`COUNT(*)` over a few thousand rows is sub-millisecond, and a flood is already bounded by this
endpoint's own 120/min per-IP limiter. In practice the minute-long window meant auditing a
document and then checking `/status` showed the count unchanged — which reads as the page
being broken rather than merely cached. Freshness is worth far more here than the handful of
scans the cache saved. **The engine TTL is the one that matters; do not conflate them.**

`checked_at` reflects when the DB aggregates were computed. Each engine carries its own
`checked_at` so a reader can tell how stale a `verapdf: ok` claim is — a 10-minute-old
success is a meaningfully weaker statement than a fresh one, and the payload should not hide
that.

Probes are individually timeboxed and a probe failure is caught and converted to
`{ ok: false, reason }`. A hung or missing engine must never delay or fail the response —
`/status` reporting "veraPDF is broken" is the feature, not an error condition.

**Rate limit:** `/api/status` gets its own limiter, mounted **before** `globalLimiter`.
Nitro's loopback proxy shares the `127.0.0.1` rate bucket (the problem documented in the
429-handling comment in `server/utils/health.ts`), so leaving `/status` behind the global
100/min limiter would let ordinary site traffic starve it.

## Considered and rejected

### `pages_audited`

Available and trivial to compute — `audit-url-page` events — but cut deliberately. The
document-versus-page distinction is inscrutable to a non-technical reader and raises more
questions than it answers.

**Plumbing is still built.** The counting helper is generic over event types and
`PAGE_EVENT_TYPES` is exported alongside `DOCUMENT_EVENT_TYPES`, so exposing it later is a
one-line payload change. A test asserts the key is currently **absent**, so it cannot
reappear without a deliberate decision.

### `document_reports_shared`

Rejected, for two independent reasons. The first is fatal on its own.

**1. Sharing is not observable.** A report row is created whenever a report is *generated*.
Nothing records whether the resulting link was ever copied to the clipboard, pasted into an
email, or sent to another human. No schema change fixes this — the event happens outside the
system. Any figure published under the word "shared" would be an assertion the application
cannot support.

**2. The population is not what the name implies.** Even setting aside (1),
`shared_reports` rows are created from four sites, and only one involves a person at all:

| Site | Trigger |
|---|---|
| `reports.ts:44` | A person clicks "share" |
| `audit-url.ts:185` | Automatic, every `/api/audit-url` audit |
| `audit-url-page.ts:198` | Automatic, every **page** audit |
| `bulk-from-inventory.ts:331` | Automatic, every fleet bulk audit |

The count is dominated by machine-created rows from the fleet crawler, and it silently
re-introduces page audits — the very thing excluded above.

(`reports.ts` happens to be the only insert omitting `content_hash`, which would *almost*
discriminate the human path — but that is an incidental column difference rather than a
designed flag, and rows predating migration 9 also have NULL `content_hash`. It would not
rescue the metric even if reason 1 did not already sink it.)

`documents_audited` is the honest measure of usage, and it is sufficient.

## Files

**New**

- `apps/api/src/services/status.ts` — payload builder; probes and clock injected
- `apps/api/src/routes/status.ts` — Express router
- `apps/web/server/utils/status.ts` — pure 200/503 selection and `web` merge
- `apps/web/server/routes/status.ts` — Nitro route (unsuffixed so it answers HEAD as well as GET)
- `apps/api/src/__tests__/status.test.ts`
- `apps/api/src/__tests__/statusPrivacy.test.ts`
- `apps/web/app/__tests__/status.test.ts`

**Edited**

- `apps/api/src/index.ts` — mount the router ahead of `globalLimiter`
- `apps/web/public/robots.txt` — `Disallow: /status`
- `audit.config.ts` — `STATUS` block: both cache TTLs (aggregates 5s, engine probes 10 min),
  per-probe timeouts, and the event-type lists
- `README.md` — `/status` becomes the documented monitor target; `/healthz` is re-described
  as the liveness fallback (see [Relationship to /healthz](#relationship-to-healthz))

## Testing

- **Payload shape** — every documented key present with the right type.
- **Event-type split** — a seeded in-memory DB proves `audit-url-page` and auth events are
  excluded from `documents_audited`, and that the format buckets land correctly, including
  `other` for an extension-less filename.
- **Tiered status** — 200 / `degraded` / 503 across each engine-failure combination, with
  core versus optional failures producing different HTTP codes.
- **Privacy leak test** — serialize the payload from a DB seeded with a distinctive filename,
  email, and IP, then assert the JSON string contains none of them, no `@`, and no
  path-shaped substring. This is the test that guards constraint 1.
- **API unreachable** — the Nitro route returns 503 and the minimal
  `{ status, web, api }` payload when the loopback probe throws, with no partial fields.
- **Independent cache TTLs** — with a clock stub: at 90s the DB aggregates have refreshed
  while the engine probes have **not** re-run; past 10 min the probes run again. This is the
  test that protects a monitor from spawning a JVM per poll, so it asserts probe *invocation
  counts*, not elapsed time.
- **Concurrent calls coalesce** to a single computation rather than N parallel probe runs.
- **A hung probe cannot hang the response** — a probe that never resolves yields
  `{ ok: false, reason: "timeout" }` within the timeout, and the rest of the payload is
  still served.
- **Absent-by-design** — `pages_audited` and `document_reports_shared` are not present.

## Release chores

Per the standing release checklist, the release carrying this must update: `CHANGELOG.md`,
README § Security, the `ANNOUNCEMENTS` banner in `audit.config.ts` (prepend, index 0
renders), `apps/web/app/pages/data-retention.vue` § 10, and the version in all three
`package.json` files.

The data-retention page needs a genuine entry here, not a formality: a new public endpoint
that reports usage aggregates is exactly the kind of change that page exists to disclose.

## Follow-up (does not block implementation)

Point the outstanding UptimeRobot monitor at `https://audit.icjia.app/status` after deploy.
Beyond plain up/down it supports keyword alerting on `"degraded"`, which catches a silently
broken veraPDF that `/healthz` cannot see — the engine could be dead for weeks while
`/healthz` reports a perfectly healthy 200.

The 10-minute engine-probe TTL is what makes this affordable at any poll interval; do not
lower it to match a monitor's frequency.
