# Page-report dead-link fix (v1.82.0)

**Date:** 2026-08-18 · **Tag:** `v1.82.0` ·
**Trigger:** a fleet-audit report linked
`https://audit.icjia.app/page-report/ad1fabf53a709b1088f6a8dd3d9bb3a5` and the
link answered a Nuxt 404 — while `GET /api/reports/<same id>` served the
stored report (an axe page audit of an ICJIA researchhub article, 98/A)
perfectly.

---

## What was wrong

`POST /api/audit-url-page` — the fleet pipeline's HTML-page companion to the
PDF endpoint — has returned
`reportUrl: <base>/page-report/<id>` since the day it shipped (`1c8546f`,
v1.26-era). The web app never had a `/page-report/[id]` page. Not renamed,
not removed: **never built**, on any branch, ever. A comment in the API route
even described the sanitizer as guarding "the public /report/:id and
/page-report/:id pages" — the second page existed only in that comment.

Every reportUrl the endpoint ever emitted was therefore a dead link:
**5,854 unexpired page-audit rows** in prod `shared_reports` at the time of
the fix, their links baked into published fleet bundles.

## Why nothing caught it

The fleet pipeline consumes the JSON (score/grade into CSV cells) and never
follows the link. The API suite asserts the response *shape* — that
`reportUrl` is a string of the right form — not that the URL resolves.
Classic wiring gap: both sides individually green, the seam between them
never exercised.

## The fix

`apps/web/app/pages/page-report/[id].vue` — a standalone share view in the
mold of `/report/[id]`: fetches the same `GET /api/reports/:id`, renders the
page-audit payload (grade ring, score, four axe severity buckets, violation
cards with selectors and "how to fix" links, incomplete checks as a
"needs manual review" section open by default, expiry footer), with the same
404/410/error messaging. Theming uses the token palette (`useTokenColors`,
`--link`) so light mode keeps AA contrast; links are always underlined.

Because the URL scheme is unchanged, the fix **retroactively heals every
link already published** — no data migration, no fleet-side change, no
re-run needed.

Stored-payload trust boundary: `url` and `nodes[].target` originate in the
*audited* page (its address, its DOM), `pageTitle` in its `<title>`. Nothing
from the payload becomes an `href` unless it parses as plain http(s);
everything renders through Vue's default escaping (no `v-html`).

## The guard

`pageReportWiring.test.ts` carries a route **contract test**: it extracts
the path segment from `buildPageReportUrl` in the API route's own source and
requires `apps/web/app/pages/<segment>/[id].vue` to exist. Either side
renaming without the other now fails the suite instead of prod silently
serving 404s. Thirteen further real-mount tests pin fetch wiring, rendered
facts, error states, and the no-unsafe-hrefs rule.

## Verification

- Full local end-to-end: `POST /api/audit-url-page` against the dev API for
  the same researchhub article → stored row → `/page-report/<id>` on the
  dev web server → **HTTP 200**, rendered correctly (screenshot reviewed,
  dark theme, links underlined in the themed link color).
- Suites: web 1,074 → **1,088**, all green; api/cli untouched and green in
  CI's scope; root `typecheck`, `lint`, `format:check`, `build` all exit 0.
- `regradeStoredReport` confirmed a pass-through for page payloads (no
  `categories` array → untouched), so stored rows serve byte-identical.

## Note for fleet users

Old links start working the moment this deploys — including links in
bundles generated months ago. Nothing needs regenerating. A link answers
410 only once its 365-day expiry passes, same as document reports.
