# Changelog

All notable changes to this project will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/). Tags and releases are published on [GitHub](https://github.com/ICJIA/file-accessibility-audit/releases).

## [1.88.0] - 2026-08-22

### Added

- **Failed audits are recorded.** An audit the tool attempted and could not complete now leaves an `audit_log` row of its own — `analyze-failed`, `analyze-url-failed`, `audit-url-failed`, `audit-url-page-failed` or `bulk-from-inventory-failed` — with the same fields as a successful audit, NULL score/grade/content hash, and a one-word `reason` from a closed set: `unreadable`, `timeout`, `fetch-failed`, `navigation-failed`, `internal` (migration 13 → `user_version` 13). Never the error text. Capacity (503) and refusals are not failures and record nothing. The new event types sit outside every counting allow-list, so `/status` figures are unchanged — pinned by test.
- **Daily activity export.** The retention sweep (step 8) writes one CSV per complete America/Chicago calendar day of the `audit_log` table to `logs/activity-YYYY-MM-DD.csv` at the repository root on the server (`ACTIVITY_LOG_DIR` overrides), derived from the database, kept for the usage log's own 365 days (`SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS` — no second setting), pruned by file-name date, not in backups, not served. Columns `id, timestamp_utc, timestamp_chicago, event, filename, score, grade, content_hash, tier, reason`; RFC 4180 quoting, formula-injection guard, UTF-8 BOM, LF. The first sweep after deploy materialises the whole window; a missed midnight heals itself; a complete day's file is never rewritten. Runbook: `docs/activity-export.md`.

- **Application error log.** The API process tees everything it writes to stderr (`console.error`/`console.warn`, `util.format`-ed, stacks included) into `logs/errors-YYYY-MM-DD.log` — installed at startup, PM2's stream unchanged — so an unexpected error can be diagnosed from the same directory the activity files live in, without `~/.pm2/logs` and its 14-day rotation. Kept 30 days (`ACTIVITY_EXPORT.ERROR_LOG_RETENTION_DAYS`), pruned by the sweep; a day's file stops at 50 MB with a final notice so a crash loop cannot fill the disk; a write failure never throws. Holds what stderr holds — no IP, token, user agent or body is ever written there (tested for every app-written line).
- **The policy is pinned to the code.** `activityLogsPolicyConformance.test.ts` reads the data-retention sections and fails if their retention windows, directory name or reason list differ from the constants the sweep and writers use.

### Changed

- **Two log-noise trims.** A classified page-audit navigation failure or timeout (a fleet page URL that is really a download — 315 identical stack traces on 2026-08-19) now logs one line; the global error handler logs a 4xx (incl. the 413 "too large") as one line and keeps the stack for 5xx only. The handler moved to `middleware/errorHandler.ts` so it is tested. No response changed.
- `DEPLOY.LOCAL_TIME_ZONE` (`America/Chicago`) is now the one place the human-facing time zone lives; `/status`'s `*_chicago` fields read it. `defaultDataDir` and `sqliteUtcToIso` moved to their own modules (re-exported from `services/status.ts`).
- Data-retention policy → **v1.12**: § 7 row + sweep paragraph, § 8 bullets, § 8a schema (migration 13), § 14 entry.
- `docs/process-supervision.md` no longer promises gzipped PM2 logs: `pm2-logrotate` 3.0.0's `compress true` is ineffective (the module's `parseBool` accepts only the string `'true'`; pmx casts the stored value to a boolean). Rotated files are plain `.log`; the 14-file retention is what bounds the disk.

### Notes

- **No new surface.** No route was added or changed; nothing reads the activity files but the operator on the server.
- **Privacy.** Failure rows and activity files carry exactly the usage log's fields. No IP, token, user agent or body is written anywhere new; the one-line log formats are tested for it. The file name remains the one field that can carry personal information, and the policy says so.
- Tests: API +92 / web +7 → totals API 1,347 · web 1,134 · CLI 49 (2,530).

## [1.87.1] - 2026-08-21

### Changed

- **"What's New" entries that mention a page now link to it.** The landing-page security announcement said its details were "recorded in the security log" and "section 10 of the data-retention policy" but gave no link; it now carries **"Read the security review log" → `/data-retention#security-audits`** (§10, the on-site security review history). Two older status-related announcements gained **"View the status page" → `/status?html`** links as well. New standing practice: any announcement referencing a reachable page — the data-retention policy, changelog, security log, status page, or a GitHub repo page — carries a working link rather than bare prose.
- Conventions matched exactly: on-site Vue pages use a plain internal link (the §10 link deep-links via the `#security-audits` anchor); the status page is a Nitro server route, so those links keep `linkExternal: true` and the established `/status?html` form that avoids the SPA 404.

### Notes

- **Copy/navigation only — no new attack surface.** Three existing `ANNOUNCEMENTS` entries in `audit.config.ts` gained `linkText`/`linkTo` (and `linkExternal` for the two server-route links); no new announcement, no behavior, storage, retention, or dependency change. The security log is unchanged content — the announcement just points at it now. The on-site security log is §10 of the data-retention policy; the fuller technical version remains the README's Security section on GitHub. Tests 2,431 (unchanged); the announcement-archive and banner suites already cover link rendering, including the truncated-entry-plus-own-link spacing case.

## [1.87.0] - 2026-08-21

### Security

- **The app processes bind to loopback in production, closing the audit finding that they listened on `0.0.0.0`.** The 2026-08-20 review found the API (5103) and web (5102) reachable on every interface, with only the host firewall between them and the internet. Both now bind `127.0.0.1` in production — the API through a new `resolveBindHost` helper reading `DEPLOY.BIND_HOST`, the web (Nitro) through a `HOST` env var in `ecosystem.config.cjs`. nginx proxies to `127.0.0.1`, and nothing legitimate reaches the raw ports from off-host (the fleet uses `https://audit.icjia.app`), so this removes the exposure with no functional change. Verified at the socket level: a production start binds `127.0.0.1:5103`, a development start still binds all interfaces.
- **Scoped to this app only.** The change touches `apps/api/src/index.ts` and this repo's `ecosystem.config.cjs`, which defines only `file-audit-api` and `file-audit-web`. Other processes on the shared host (e.g. Strapi) run from their own configs and are untouched — no server-wide, nginx, or `/etc/environment` change.

### Notes

- **Production only, by design.** Development binds all interfaces unchanged: the Nuxt dev proxy targets `localhost:5103`, which resolves to IPv6 `::1` first on some systems, so an IPv4-only bind would break the dev proxy intermittently. Dev runs on a laptop where binding all interfaces is a non-issue, and the audit finding is about the production droplet. `resolveBindHost(isProduction, host)` returns the loopback host in production and `undefined` (all interfaces) in development.
- **Single source of truth.** `DEPLOY.BIND_HOST` (`"127.0.0.1"`) is what the API reads directly; the web reads the same value as the `HOST` env in `ecosystem.config.cjs`. `bindLoopback.test.ts` pins that the two agree and that the API binds through the helper, so neither can silently regress to `0.0.0.0`.
- **Deploy:** `rebuild.sh` already restarts with `pm2 restart ecosystem.config.cjs --update-env`, so the new web `HOST` env is picked up on a normal deploy — no re-register needed. Verify afterward with `ss -lntp | grep -E '510[23]'`: both should show `127.0.0.1`, not `0.0.0.0`/`*`. The API binds loopback the moment its process restarts; the web binds loopback once the refreshed env reaches Nitro.
- TDD throughout: the pure `resolveBindHost` helper (prod → loopback, dev → all-interfaces, passthrough of the configured value), the ecosystem/config agreement, the API wiring, plus a real socket-level check. No new external surface — it removes surface; no change to rate limits, SSRF controls, size caps, or dependencies. Tests 2,425 → 2,431 (API 1,255 / web 1,127 / CLI 49).

## [1.86.0] - 2026-08-21

### Added

- **The status page reports privileged-tier audit volume.** `/status` gains a "Trusted-tool (privileged) audits" card and a `privileged_audits` field (`last_24h` / `last_30d` / `total`), counting audits that came through the `API_PRIVILEGED_TOKEN` tier — the automated fleet inventory — separately from public uploads. After the shared token is rotated, this is the signal that confirms privileged volume matches the fleet's activity and nothing else is using the token. It counts a property of the shared service token, **never identity** — nothing about who made a request.

### Changed

- **`audit_log` gains a `privileged` column (migration → user_version 12).** Nullable on purpose: rows written before the migration have no recorded tier and read NULL (unknown), because writing `0` would falsely claim they were anonymous. `recordAudit` now requires the tier as an explicit field, so a new call site is caught by the compiler rather than silently mis-recording — the same enforce-at-the-writer discipline the filename clamp uses. Every one of the eight call sites (uploads, URL audits, page audits, bulk-from-inventory, refused uploads) was threaded with its real tier.
- **Data-retention policy → v1.11.** §8a documents the new column and names the request tier as one more thing `audit_log` can hold — flagged explicitly as a property of the shared service token, not an identity. §14 carries the change-log entry.

### Notes

- **Counting starts at the migration.** The 24-hour figure is accurate immediately; the 30-day and all-time figures climb from the deploy date, because pre-migration rows are NULL and are excluded by design (they are not fabricated as either tier). The status card and the policy both say so.
- It counts privileged **audits** (audit_log rows), not raw requests — a privileged request that is refused, errors, or is a dedup cache hit is not an audit and does not appear. That is the right measure for "does privileged volume match the fleet's activity."
- **Also recorded in this release:** the operational server hardening performed 2026-08-21 (privileged-token rotation, database/backup permission tightening, removal of an unused print service, OS patch) is disclosed in §10 of the data-retention policy — it rode this release rather than forcing a deploy of its own, as planned.
- No new external surface; no change to rate limits, SSRF controls, size caps, or dependencies. Tests 2,415 → 2,425 (API 1,249 / web 1,127 / CLI 49).

## [1.85.0] - 2026-08-20

### Security

- **Nuxt 4.4.7 → 4.5.2, closing six advisories — one of which was reachable in production.** The app defines no server islands, but the island endpoint was registered and answering anyway: `/__nuxt_island/<name>` returned 204 carrying this site's own CSP nonce and security headers, while sibling paths 404'd with a different, minimal CSP. That endpoint is the delivery path for **server-side RCE via runtime template injection in island props**, an unauthenticated out-of-memory crash via unbounded `v-for` expansion, and unauthenticated CPU exhaustion from parsing and hashing the island body before hash validation. Also fixed by the same bump: unauthorized component instantiation via island props, a runtime payload cache that could disclose one visitor's SSR data to another (`>=4.4.0 <=4.5.0`, which 4.4.7 was inside), and route rules being silently dropped for mixed-case paths. The last was tested directly before and after — this site's security headers were **not** affected on `/Announcements`, `/ANNOUNCEMENTS` or `/PubList` — but the version is no longer in range regardless.
- **`@nuxt/devtools` pinned to ^3.4.0** (resolved 3.4.1), clearing a **critical** advisory in 3.2.4: an unauthenticated DevTools RPC allowing arbitrary command execution on a developer's host while `nuxt dev` runs. It never shipped — verified absent from `.output/` — so this is a workstation exposure, not a production one, but it was live for anyone running the dev server.
- **`ip-address` pinned to ^10.5.0** (three advisories: octal/leading-zero octet confusion, CIDR-suffix suppression of special-use classification, and IPv4-mapped/NAT64 misclassification — all SSRF/trust-boundary bypasses) and **`nanoid@3` to ^3.3.18** (infinite loop on zero-size custom generators).
- Production advisory count: **1 critical / 8 high / 5 moderate → 0 critical / 1 high / 1 moderate.**

### Notes

- **The two remaining advisories are deliberate, not overlooked.** `extract-zip` has no non-vulnerable release — 2.0.1 is both the latest version and the vulnerable one — and it is reached only when Puppeteer downloads a browser build. `@nuxt/ui` requires ≥4.8.1 for the `UAuthForm`/`UForm` SSR `method` advisory; this app is on 4.5.1 and uses **neither** component (the login page it once applied to was deleted in v1.68.0), so the fix is a five-minor UI jump to close a hole the app cannot open. Both stay on the record rather than being suppressed.
- **Framework version bumps here have a history, and it was checked against it.** The 2026-08-03 attempt at this upgrade left `nuxt` at 4.4.7 precisely because 4.5.1 dragged in `unhead` 3 and `h3@2.0.1-rc.26`, giving two incompatible `H3Event` types and failing `pnpm typecheck` on every Nitro route. That does not reproduce on 4.5.2 with the `h3@1` and `unhead@2` overrides now in place. The upgrade was done as a **targeted** `pnpm --filter web update nuxt`, never `pnpm update -r`, and the declared range needed no widening — `^4.4.7` already admitted 4.5.2, only the lockfile pinned it.
- `fast-xml-parser` did **not** move, so the four OOXML control documents did not need re-verification (the parser is the engine behind every DOCX/PPTX/XLSX check, and a behaviour change there moves scores silently rather than throwing).
- No application code changed. Tests **2,415**, unchanged (API 1,241 / web 1,125 / CLI 49); lint, format, typecheck and build all clean on the new tree.

## [1.84.0] - 2026-08-20

### Changed

- **The landing-page "What's New" banner shows an update's first four sentences and links through for the rest.** User request, matching the fleet site's banner. Announcement copy has been *editorially* capped at "four or five sentences" since v1.61.0, but the entries outgrew the rule: the newest ran to 892 characters — about ten lines sitting directly above the drop zone — so the tool itself started below what a visitor sees first. The banner now renders only the opening `ANNOUNCEMENT_BANNER_SENTENCES` (4) sentences of the newest entry, followed by a **Read the full update** link to `/announcements`. That link appears **only** when something was actually cut, so it never promises text that does not exist, and short entries still render whole with no link at all.
- **`/announcements` is unchanged and remains the full record** — every entry, word for word, linked from the header and the footer of every page. Deliberately **not** an in-place expander: the archive already holds the full text, so a second way to read the same string would be a second thing to keep true, and the one that drifts is always the copy nobody re-reads. A test pins the asymmetry in both directions — the archive must render the raw entry and must never reach for the summarizer, while the banner must always use it. Without that, "Read the full update" could quietly start leading to the same truncated paragraph the visitor had just read.

### Notes

- **The cut is always at a sentence boundary**, never at a character count: a half-sentence reads as a rendering fault rather than an editorial choice, and there is nowhere to put an ellipsis that does not collide with the entry's own punctuation. The documented consequence is that a single very long sentence is shown whole, because there is no earlier boundary to stop at — the fix for that is a shorter opening sentence, not cutting words. Sentence detection is built against the copy actually shipped rather than against an idealized English: a terminator must be followed by whitespace, so `WCAG 2.2` and `PDF/UA-1 (ISO 14289-1)` are never boundaries; closing curly quotes and parentheses stay with the sentence they end; and a period followed by a lowercase word is read as an abbreviation rather than a break. All three cases are pinned by tests, and every one of the 38 shipped entries is run through the summarizer and asserted to yield a non-empty prefix of its own text.
- **One rendering defect was found and fixed before release.** An entry that is both cut *and* carries its own link rendered as `Read the full updateHow the audit works` — two underlined links touching — because Vue's condense mode drops whitespace-only text between two elements when it contains a newline. Fixed with an explicit space and pinned by a test. It was latent (no shipped entry currently sets `linkTo`) and would have appeared on the first release that used one.
- Presentation only: the change is confined to how much of an already-published, repository-authored string the home page renders. No route, parameter, payload, stored field, retention window, or dependency changed, and the data-retention policy is unaffected (stays at v1.10). Tests 2,387 → 2,415 (API 1,241 / web 1,125 / CLI 49).

## [1.83.0] - 2026-08-20

### Fixed

- **PDF link text is read from the link's tag, not from whatever text sits under its rectangle.** An independent re-verification of a shared report (a 46-page Word export, 69/D) against the file reproduced every count the report made — fonts, figures, headings, all eight tables, lists, artifacts, the reading-order percentage — and then found the link text wrong. The analyzer had been collecting every text item whose origin fell inside the link annotation's rectangle, whole items included, so a link on "here" followed by ". FOID statistics are available" in the same text run was scored as descriptive (two such links were missed), and a link wrapped across two lines produced the fragment "PA", flagged as too short (a false positive). Link text now comes from the `<Link>` structure element's own marked-content runs — the same id mapping the heading outline uses — one entry per link, with its page number; a line break inside a link is a word boundary ("Revocation Enforcement Fund", not "RevocationEnforcement"). Geometry remains only as the fallback for annotations no tag claims. On the trigger file Link Quality moves 97 → 89, with all three "here" links named by page; the overall score is unchanged.
- **Links with no tag are a finding now, everywhere they belong.** Six link annotations inside a Word text box on that file had no `<Link>` element at all — a screen reader following the tags never meets them, and with the tab order set to follow the structure they cannot be tabbed to. veraPDF had counted them (rule 7.18.5-1) in the PDF/UA panel; the main report said nothing. They now appear as a "Links Not Tagged" block in the Link category (counted against the score, and never judged on the text near them), as a confirmed **1.3.1** failure in the conformance verdict for tagged documents, as a computed Acrobat-parity "Tagged annotations" row (previously "not computed"), and in the Acrobat fix steps (Tags panel → Find → Unmarked Links → Tag Element). The action plan's link step gains a real Acrobat route for this case instead of "only fixable in the source document".
- **The reading-order card names its drift pages.** "6 page(s) had noticeable drift" gave an author nothing to open; the card now lists each page with its match — "page 5 (58%), page 6 (76%), …". On the trigger file the drift is genuine: Word tagged each chart's data labels ahead of the page's first heading on three pages, so a screen reader hears "74, 67, 38, 112, 244…" before "EXECUTIVE SUMMARY".
- **"Add alt text" is no longer the advice for figures that are really text boxes.** Word exports text boxes, sidebars, SmartArt and chart title bars as `<Figure>` with the text nested inside — 16 of the trigger file's 26 alt-less figures, one of them holding 108 text runs. A figure's alternate text _replaces_ its contents for assistive technology, so describing those would have hidden the text they hold. The alt-text card now lists them by page with a short preview under "Figures That Contain Text" and says to change the tag (Properties → Type → Section) rather than describe it; the Acrobat steps and the action plan's alt-text step say the same. Pictures and charts are handled exactly as before.

### Notes

- Every new signal — `tagged` and `page` on each link, the link-annotation census, the text-bearing-figure census, the drift-page list — is absent from reports stored before this release, and every consumer treats absence as "unknown" and behaves exactly as before: a shared link keeps the text it was stored with, and re-analysing the file produces the corrected report. The reading-order metric itself is unchanged (it still excludes only a figure's direct content, per v1.81.0). Stored reports now carry one more kind of document-derived string — an excerpt of up to 80 characters from each text-bearing figure, so the report can point at the right box — disclosed in the data-retention policy (v1.9 → v1.10). Full story, with paste-ready replies for the document's author: `docs/link-text-from-tags-fix.md`. Tests 2,341 → 2,387 (API 1,241 / web 1,097 / CLI 49).

## [1.82.1] - 2026-08-18

### Fixed

- **Analytics count web-page audit report views as `/page-report`, never as individual reports.** User report (Plausible dashboard screenshot): each visit to a page-audit report registered its own Top Pages row — `/page-report/<id>`, one visit apiece — the same per-file noise the v1.76.0 generalization eliminated for `/remediate/<uuid>` and `/report/<id>`. Cause: `analyticsPagePath` collapses the per-id routes it is taught, and nobody taught it `/page-report/[id]` when v1.82.0 shipped the page — so for part of one day, individual report addresses reached the analytics server against the data-retention policy's stated rule that per-file addresses never leave the visitor's browser. The route now collapses to its base, and a new contract test walks the real `pages/` directory and fails on any dynamic `[param]` route the normalizer does not collapse — the next per-id page type gets caught by CI, not by the dashboard.

### Notes

- The leaked path segment is the report's random identifier — the same one in the shareable link; it names a stored report, not a visitor, and query strings were never affected (reporting has been path-only since v1.76.0). Plausible never rewrites stored rows, so the handful recorded before the fix remain in the dashboard's historical date ranges (on ICJIA's self-hosted instance) while every later visit counts as the base route. Data-retention policy v1.8 → v1.9 (§ 8a and § 9 name the third collapsed route; § 14 discloses the gap). Tests 2,339 → 2,341 (API 1,202 / web 1,090 / CLI 49).

## [1.82.0] - 2026-08-18

### Fixed

- **Web-page audit report links open a report now instead of a 404 — the page they pointed at never existed.** User report: a fleet-audit report linked `https://audit.icjia.app/page-report/<id>` and got "Page not found," while the stored report behind it served perfectly from the API. `POST /api/audit-url-page` (the fleet pipeline's endpoint for auditing the HTML pages that link to documents) has returned `reportUrl: <base>/page-report/<id>` since the day it shipped (v1.26-era), but the web app never had a `/page-report/[id]` page — every link it ever emitted was dead: 5,854 unexpired page-audit reports in production at fix time, their links baked into published fleet bundles. The page exists now: a standalone share view in the mold of `/report/[id]`, fetching the same `GET /api/reports/:id` and rendering the axe page audit — grade ring and score, all four severity buckets (zeros included), violation cards with impact badges, affected-element selectors and "How to fix" links, incomplete checks as a "Needs manual review" section open by default, link-expiry footer, and the same 404/410 messaging. Because the URL scheme is unchanged, every previously published link starts working on deploy — no fleet-side regeneration needed.

### Notes

- Why nothing caught it: the fleet pipeline consumes the JSON (score/grade into CSV cells) and never follows the link, and the API suite asserts the response shape, not that the URL resolves. A new route **contract test** derives the reportUrl path segment from the API route's own source and requires the matching web page file to exist, so either side renaming without the other fails the suite instead of prod silently 404ing. Rendering trust boundary: `url`, `pageTitle`, and element selectors originate in the audited page; nothing from the payload becomes a link unless it parses as plain http(s), and links use the themed `--link` tokens (AA contrast in both themes) with persistent underlines. Full story: `docs/page-report-missing-page-fix.md`. Tests 2,325 → 2,339 (API 1,202 / web 1,088 / CLI 49).

## [1.81.0] - 2026-08-17

### Fixed

- **The reading-order check no longer penalizes images painted out of sequence — image paint order is not reading order.** User report (an "accessible" Excel-exported order form scoring 89): the only reading-order divergence was the company logo — a `/Figure` correctly tagged FIRST because it sits in the top inch of the page — which Excel painted LAST, as Office exporters do with images. 27 of 28 marked-content runs agreed (96.4%), just under the metric's 97% "perfect" band, so a correctly ordered one-page document lost 10 points and took a Minor. The fidelity comparison (tag order vs content-stream draw order, longest-common-subsequence) now **excludes Figure MCIDs** — role-mapped figures included (Excel's `Diagram → Figure`), captions nested inside figures still compared as text — because exporters paint images by z-order, which carries no reading-order information, while text paint order at least correlates. Displaced TEXT deducts exactly as before (test-pinned), and stored reports from before this release lack the new figure census and keep the legacy all-MCIDs comparison until re-analyzed.

### Notes

- The same order form's Table Markup finding was verified TRUE and stands: its 8 `<TH>` cells (a two-way header table — header row plus row headers) genuinely carry no `/Scope` and no `/Headers`, the one configuration where header association is ambiguous for assistive technology. Acrobat's built-in checker doesn't test Scope, which is why files like this arrive believed to be "100% accessible". The technical explainer's reading-order scoring description was also rewritten — it still described a pre-fidelity 20%-band model that no longer exists. Verified against the reported file (Reading Order 90 → 100; overall stays 89 on the genuine table finding) with no change to the other two 2026-08-17 incident files. Tests 2,319 → 2,325 (API 1,202 / web 1,074 / CLI 49).

## [1.80.0] - 2026-08-17

### Fixed

- **Multi-file results are now a visible scoreboard — resolving "I don't see the second tab."** User report: dropping two files appeared to show only the first file's report. Both results were in fact rendering; the inactive tab was styled as small muted text on a transparent gradient, visually indistinguishable from disabled chrome, while the Reset/Export cards and the giant grade circle below pulled the eye. The batch tab bar is now a **scoreboard of per-file report cards** (`BatchFileSwitcher.vue`): each card shows a grade ring in the grade's own color — a miniature of the report hero — plus the score out of 100 and the filename, with honest labels for errored ("Couldn't analyze") and cancelled files. Every card, active or not, carries full card chrome; the active card is raised. The "All N files processed" message is the scoreboard's own header now, replacing the separate dismissible green banner — the element that announces the reports is the element that switches between them.
- **The dropzone enforces the five-file limit its copy has always advertised.** The label said "up to 5 files, max 25 MB each"; the code capped at 3, so dropping four or five files hit "Maximum 3 files allowed" under a label promising five. The limit is now 5. Client-side batch concurrency stays at 2, matching the server's analysis semaphore — more files queue, they don't run hotter.

### Notes

- Frontend-only: the same per-file calls to the existing `/api/analyze` endpoint; no new routes, parameters, or dependencies. Pinned by 13 new tests including a page-wiring pin (the index page renders the switcher; the old inline tablist and banner are gone) and a copy-matches-limit pin on the dropzone. Verified in a real browser with five files, light and dark themes, including card switching. Tests 2,307 → 2,319 (API 1,196 / web 1,074 / CLI 49).

## [1.79.0] - 2026-08-17

### Fixed

- **The font-embedding check now flags only fonts actually used to display text — resolving two classes of false positive where Adobe's preflight passes a file this tool marked down.** User reports (two files, both "Adobe gives this a thumbs up"): a newsletter scored 89 for a non-embedded ArialMT whose every use in the content stream paints exactly one space character — word processors emit inter-run whitespace in the paragraph's default font, and a space paints no glyph and extracts from the document's encoding tables, not the font program, so it cannot garble anything. A set of meeting minutes was flagged for three non-embedded fonts that exist only as styling metadata in the structure tree (`/ADBE_FT-Style` attribute entries) — leftovers of Acrobat's **own** remediation, which had re-embedded every font the pages actually use; no content stream can select them. The check previously counted every `/FontDescriptor` object in the raw file; it now runs a two-stage census matching how Adobe Preflight (and the PDF/A / PDF/UA embedding rules) evaluate "fonts used for rendering":
  - **Reachability (qpdf):** a descriptor counts only when a font in a `/Font` resource dictionary — pages, form XObjects, annotation appearances, AcroForm `/DR`, with Type0 `/DescendantFonts` chains and indirect dictionaries resolved — references it. Orphaned descriptors and structure-tree-metadata leftovers are excluded, and the reported font census now matches `pdffonts`.
  - **Usage (pdfjs):** a new content-stream signal records which fonts paint at least one visible, non-whitespace glyph (text in invisible render mode 3 — the OCR text layer, which the PDF/A rules also exempt — doesn't count). A reachable non-embedded font that never displays visible text no longer caps the score; the report says so honestly, per font ("NOT embedded (never displays visible text — no impact)") and in the summary, while the font census stays factual. The Adobe-parity character-encoding rule applies the same evaluation.

### Added

- **The landing-page announcement banner now carries a standing "What's New" heading** (user request, matching the fleet site's banner) — the entry text alone read as static site copy, so visitors didn't realize it described a recent change.

### Notes

- Fail-safe by construction: the exemption applies only when the usage census is present and complete — stored reports from before this release (which lack the new signals) regrade under the legacy behavior, and a text run whose font pdfjs cannot resolve disables the exemption entirely, so an unknown font errs toward flagged, never toward silently passing. The exempt-path wording deliberately never contains the phrase "non-embedded font", which the action plan uses to select its "Embed the fonts" step — an exempt file can no longer be told to embed harmless fonts (pinned by test). Because the fix changes the analyzer's extracted signals rather than the scoring model, **previously stored reports keep their old finding until the file is re-analyzed** (`POST /api/audit-url` with `force=true`); read-time regrading alone cannot apply it. Verified against both reported files: the meeting minutes rise from 89/B to 100/A; the newsletter's Text Extractability rises from 85/Minor to 100/A (its overall score stays 89 due to an unrelated table-markup finding). Tests 2,288 → 2,307 (API 1,196 / web 1,062 / CLI 49).

## [1.78.1] - 2026-08-16

### Fixed

- **`POST /api/audit-url` dedup hits now regrade the stored report before answering — a cached score can no longer disagree with the report page it links to.** Operator report (fleet-inventory screenshots): the fleet table said F/30 while the linked report page said 47/100 — and F/19 beside a page saying 38/100. Cause: the endpoint's content-hash dedup branch returned `strict.score` exactly as stored on the original audit date, while the `reportUrl` in the **same response** serves through `/report/:id`, which has regraded stored reports to the current scoring model on read since v1.58.4 — one response, two eras of scoring. Every consumer that re-checked an unchanged file — the fleet-audit tool's re-runs above all — republished pre-rework scores beside links showing current ones. The dedup branch now applies the same `regradeStoredReport` before extracting the scalar pair, so fresh audits, cached answers, and report pages state one number.

### Notes

- Pinned by a wiring test that invokes the real route handler against the real stored payload of the report that exposed it ("2006 Annual Report.pdf", stored 30/F on 2026-05-21 → 47/F under the current model, matching production's served value). Stored rows stay byte-identical — the regrade remains a read-time derivation. Fleet inventories keep their own local score caches: after deploying, clear the fleet tool's cache (`~/.filecap/audit-cache.json`) and re-run its score refresh (without `force` — every re-check is a cheap dedup hit) to republish corrected numbers. Tests 2,287 → 2,288 (API 1,178 / web 1,061 / CLI 49).

## [1.78.0] - 2026-08-16

### Added

- **"About this document" card: the stored document metadata now shows where the fix steps are read.** Operator request (with screenshot): show the document metadata — source file type (Word, InDesign, etc.), date authored, "everything in the metadata so the fix steps make sense," in both views. The Visual view gains an About-this-document card between the WCAG verdict strip and the action plan showing every field the file records about itself — Source Application, PDF Producer, PDF Version, Page Count, Author, Subject, Keywords, Created, Last Modified, Encrypted (Title / Creator / Language / counts for Word, PowerPoint, and Excel uploads) — with an italic "Not set" where the file is silent, and a plain "This file doesn't record which program made it or when it was created" when there is no metadata at all.
- **A tie-in line names which app the fix steps target, and why — in both views.** An InDesign-made PDF reads "The fix steps in this report are written for Adobe InDesign because this document records it as its source application"; a Word-made PDF gets the Word equivalent; an unknown or missing creator gets the honest fallback ("…the most common source — if you know this document was made in a different program, make the same fixes there"); Word/PowerPoint/Excel uploads are told the uploaded file itself is the source. The Detailed view's existing Document Metadata panel carries the same line.

### Changed

- The metadata field inventory and date formatting moved to a shared util (`apps/web/app/utils/documentMetadata.ts`) consumed by both views, so the two surfaces cannot drift. The plan's InDesign detection is now exported as `isInDesignCreator` and shared with the tie-in line — a test pins that the card and the plan can never name different apps.

### Notes

- The Visual view's zone order is now hero → tiles → verdict → about-document → plan (pinned by the DOM-order test). Tests 2,271 → 2,287 (API 1,177 / web 1,061 / CLI 49).

## [1.77.0] - 2026-08-16

### Added

- **InDesign-aware fix steps: a PDF that says it was made with Adobe InDesign now gets InDesign instructions on the action plan's source route.** Operator report: "Many of the annual reports were made with InDesign — not Word," and every source-document route was written for Word menus (`File → Save As → PDF → Options…`) that an `.indd` author cannot follow. The analyzer has always stored each PDF's Creator metadata (shown as "Source Application" in the Detailed view); `buildActionPlan` now takes that creator, and when it matches InDesign the source route renders as "Easiest — fix the InDesign file, then re-export" with the real InDesign workflow per category: "Create Tagged PDF" on export, Paragraph Styles → Edit All Export Tags for headings (H1–H6), Object → Object Export Options → Alt Text, the Articles panel (plus anchored objects) for reading order, Table → Convert Rows → To Header, TOC-generated PDF bookmarks, File → File Info title with the export dialog's Language / Display Title settings, Buttons and Forms descriptions for form fields, and font-license guidance for embedding. All 11 PDF plan entries and all three `text_extractability` failure-mode variants carry the InDesign steps.
- **Detection fails safe.** Only a PDF whose stored Creator matches InDesign (any era, any case — "Adobe InDesign CC 2019" included) swaps the route. Word-made PDFs, scans, missing metadata, and old stored reports keep today's copy byte-for-byte — pinned by a routes-deep-equality test. OOXML uploads ignore the creator entirely (the upload IS the source). The Acrobat route is untouched.

### Changed

- **The fix-step version note now names InDesign.** Every InDesign menu path was verified 2026-08-16 against Adobe's current InDesign help ("Accessible PDFs", last updated June 2, 2026, and its linked task pages; current version InDesign 2026 / 21.4.x); `FIX_STEPS_WRITTEN_FOR` says so, and `docs/fix-step-accuracy-2026-08.md` gained the full InDesign path table for the next accuracy pass.

### Notes

- Wired and pinned on all three surfaces that render fix routes — the Visual action plan, the printable plan (source-scan: its `window.open` flow can't run in tests), and the HTML export (whose `ReportResult` type gained the optional `pdfMetadata`). The remediation receipt consumes only step titles/whys, so it needed no wiring. Completeness is enforced: every plan entry with PDF source steps must carry InDesign steps, and none of them may mention Word menus. Tests 2,260 → 2,271 (API 1,177 / web 1,045 / CLI 49).

## [1.76.0] - 2026-08-15

### Changed

- **Analytics now count routes, not files: `/remediate/<jobId>` and `/report/<id>` report to Plausible as `/remediate` and `/report`.** Operator report (dashboard screenshot): every remediation job registered its own single-visit page, so Top Pages was filling with per-file UUID rows — "the /remediate route is all that matters, not each individual file." The snippet switched from Plausible's stock auto-tracking `script.js` to `script.manual.js`, and a new client plugin (`plugins/plausible.client.ts`) sends one pageview per route change built as origin + `analyticsPagePath(route.path)` — a pure normalizer that collapses the two per-file routes and passes everything else through.

### Security

- **Query strings no longer reach the analytics server at all.** The stock script includes the full `location.href` in its event payload — on a remediation result page that meant the one-time download token (`?t=…`) was being sent to the (ICJIA-owned, but separate) analytics server. The reported URL is now built from the route *path* only, so no query parameter of any page can leave with the beacon. Data-retention policy **v1.7 → v1.8** (§ 14 entry; § 8a and § 9 now state the generalization).

### Notes

- The `/report/<id>` collapse follows the same rationale (shared-report links are per-file hashes); per-report visit counts are no longer distinguishable in the dashboard — say the word to revert that half if per-report visibility was wanted.
- CSP, `ANALYTICS` config contract, data-domain, and the no-SRI decision are all unchanged; `script.manual.js` keeps Plausible's own localhost exclusion, so the dev snippet stays unconditional.
- Pinned by `analyticsUrl.test.ts` (new) and a strengthened `plausibleAnalytics.test.ts` (manual script pinned, plugin sends normalized paths and never `location.href`/query). Tests 2,255 → 2,260 (API 1,177 / web 1,034 / CLI 49).

## [1.75.4] - 2026-08-15

### Changed

- **Accuracy-and-absoluteness pass over the source-document guidance.** Operator direction, starting from one sentence and applied to the whole `SourceDocumentNotice` component: "the PDF inherits that structure automatically and no remediation is needed" promised too much — it now reads "…exported with tagging turned on, the PDF carries that structure with it, and **in most cases** no further remediation is needed — re-check the exported PDF here to confirm." The same standard applied to the component's other claims: the Word/PowerPoint/Excel variants no longer say *any* exported PDF inherits structure *automatically* (only an export with tagging on does, and they now say so); the Office accessibility-checker tips no longer claim it "finds and fixes **most** issues" (it "finds many common issues and offers fixes" — this product's own automation-limit stance is precisely that automated checkers don't catch most of the job); and "the **#1 cause** of remediable PDFs **we see here**" — a statistic this tool does not collect — became "the classic cause of PDFs that need remediation," here and in the remediation page's source-first explainer.

### Notes

- Copy only; menu paths unchanged. Pinned by two new assertions blocks in `SourceDocumentNotice.test.ts` (the hedge is present, the absolute inherit/most-issues/#1-cause claims are absent in all four variants). Tests 2,253 → 2,255 (API 1,177 / web 1,029 / CLI 49).

## [1.75.3] - 2026-08-15

### Changed

- **The failed-remediation card now leads with the source-document route.** Operator direction: remediating a finished PDF — with this tool or any other — is always the last resort, and the easiest path to an accessible document is fixing the original Word/PowerPoint/InDesign/Google Docs file, re-exporting to PDF with tagging on, and re-auditing. The card's "Recommended next step" became two ordered steps — source first, Acrobat Pro as the no-source fallback (verified current + classic menu paths unchanged) — and the failed state now also renders the `SourceDocumentNotice` card with its per-app source-document steps, previously shown only on success. The card also gains the fix-step version note, per the standing rule that every card showing Acrobat menu paths carries it.

### Fixed

- **The "common reasons" list no longer claims scanned content is a common failure cause.** A scanned PDF scores 0 before and after tagging, and a 0→0 delta passes the worker's net-gains-only regression guard — so scanned files normally *complete* with a low score rather than fail. The list now names the real failure paths: an already-tagged PDF the re-tagging would have made worse (the attempt is discarded rather than serve a worse file), layouts the automatic tagger mis-reads, files the preparation/validation steps can't safely process, and the processing time limit.

### Notes

- Pinned by `remediationFailedCard.test.ts` (source route ordered before the Acrobat route, the scanned claim's absence, the version note, and the notice rendering on failure). Tests 2,245 → 2,253 (API 1,177 / web 1,027 / CLI 49).

## [1.75.2] - 2026-08-15

### Changed

- **The automation-limit band's headline now says "Even a high score is not a guarantee" (was "perfect score").** Operator wording call: the band appears for A *and* B grades, so "high" states the actual trigger where "perfect" overclaimed it. Swapped on every live surface the headline renders — the band component (both report views and the remediation cards), the downloaded HTML report, the printable plan, and the landing-page announcement (edited in place, same id — a one-word tightening shouldn't re-show a dismissed banner) — plus the README feature description. Dated records (CHANGELOG, §10 audit history, README §Security history) keep their original wording, append-only as always.

### Notes

- Copy only; the `shouldShowAutomationLimit` predicate, thresholds, and layout are untouched. Test pins updated to the new phrase across both suites that quote it. Tests unchanged at 2,245.

## [1.75.1] - 2026-08-15

### Fixed

- **The "← Back" button no longer overlaps the page eyebrow on /technical-details and /data-retention.** User-reported (screenshot): the Back link rendered on top of "TECHNICAL DETAILS" / "POLICY · V1.7". A Tailwind v3 idiom broke silently in the Tailwind v4 upgrade: the back nav used `-mb-4` to tighten the `space-y-10` section gap to 1.5rem, which worked in v3 (space-y set `margin-top` on the *next* sibling and the negative margin collapsed against it) but not in v4 (space-y sets the margin on the nav *itself* through a zero-specificity `:where()` selector, so the real `-mb-4` class replaces it outright — net −1rem, pulling the header up over the button). Both navs now state the intended gap directly (`mb-6`); a repo sweep found no other negative vertical margins under `space-y` containers.

### Notes

- Pinned by `backNavSpacing.test.ts` (both pages, with the v3→v4 mechanism documented in the test). Verified visually on both pages before and after.
- No behavior, storage, or dependency change. Tests 2,239 → 2,245 (API 1,177 / web 1,019 / CLI 49).

## [1.75.0] - 2026-08-15

### Fixed

- **The "Make the text readable by screen readers" step no longer catastrophizes a font-embedding advisory.** A user-reported fact sheet (`controls/ARIFactSheet-SFY26-20260427T20572257.pdf`, 60/D) has fully extractable text (5,447 characters) and a proper tag structure — its only text-layer flag was three non-embedded fonts, a Minor 15-point cap — yet the action plan presented the scanned-document copy ("some or all of this document is a picture of text") with OCR steps that would have been wrong to follow. One category id (`text_extractability`) covers four distinct problems; the plan step now picks its copy by the failure mode the analyzer actually found: non-embedded fonts on a clean text layer get a font-embedding step ("Embed the fonts so the text stays correct everywhere", with a why that says outright the text itself is readable), a missing or empty tag tree gets a tagging step, a security setting that denies assistive-technology access gets a security-settings step, and a genuinely scanned document keeps the original OCR copy. Detection keys on finding strings the analyzer has emitted verbatim into every stored report; unrecognized findings (old reports, other formats) keep today's copy, so a failed match can only reproduce previous behavior. Menu paths reuse strings already verified in the 2026-08 fix-step accuracy pass. **Scoring is untouched** — Minor is correct for a fonts-only advisory, and a document whose text truly cannot be read still scores 0 overall.

### Changed

- **Remediation results now match the audit findings: every flagged category states what the automatic pass did — or could not do.** Reproduced on the same fact sheet (60/D → 77/C after remediation): a category the pass could not improve (text extractability, 85→85) appeared only inside a severity list whose three visible findings were all positive statements — the actual font problem never rendered and nothing said "unchanged" — while reading order (65→85) was listed under BOTH "Fully fixed" and "Minor issues still outstanding". Every category flagged before or after remediation now gets exactly one disposition — *fixed*, *improved — not fully fixed*, **no change**, *got worse*, or *newly flagged after tagging* — with its before → after scores; unchanged rows state in words that the automatic pass could not improve them. Still-flagged rows carry the same plain-language step copy as the audit report's action plan (same builder, including the new failure-mode variants), so the two surfaces name each finding identically. "Fully fixed" now means the severity actually cleared, not "scored ≥ 80". The dispositions live in a pure, unit-tested module (`apps/web/app/utils/remediationOutcome.ts`) whose fixtures are the real remediation pipeline run on the reported file.

### Notes

- The remediation page's per-category Acrobat hint for text extractability now also covers the non-embedded-fonts case (Fonts tab + Preflight → Fix → Embed missing fonts).
- Preserved and re-verified: outstanding issues stay open by default, the download block's placement, the fix-step version note, and the shared publish verdict.
- Full writeup: `docs/remediation-results-and-text-extractability-copy-fix.md`.
- Tests 2,214 → 2,239 (API 1,177 / web 1,013 / CLI 49).

## [1.74.1] - 2026-08-14

### Changed

- **The "Even a perfect score is not a guarantee" warning got louder and moved up — the words are unchanged.** Operator feedback: the band works and the wording is fine, but non-technical managers stopped reading at the green "Excellent — ready to publish" line and never reached it — and this warning "is probably the most critical thing we can add". Two escalations: the band's headline now sits in a **solid amber header bar** (filled amber-400 with black text, ~10:1 contrast in both themes — the loudest element on the page after the grade itself), and the band moved **above the fix-progress meter**, directly under the verdict line, in both report views and the remediation cards — so the reassuring parts of the page cannot be reached without passing the warning. The downloaded HTML report's band leads with the same filled header. The compact lower-grade reminder, the printable plan's box, and all copy are unchanged.

### Notes

- Position and the filled header are test-pinned in both heroes (`automationLimitBand.test.ts` — band index precedes "Fix progress" in the rendered output).
- No behavior, threshold, storage, or dependency change. Tests 2,210 → 2,214 (API 1,177 / web 988 / CLI 49).

## [1.74.0] - 2026-08-14

### Added

- **The printable action plan now links every WCAG rule — with the address written out for paper.** On the operator's request: a printout can't click, so each criterion's W3C address should be printed for someone to type out. Every criterion in the plan is now a real link — the "Meets: WCAG 2.4.2 Page Titled" references on each fix step link to their W3C "Understanding" pages, the "Not checked by this tool at all" list links each criterion from the server's own per-criterion URL, and the footer adds "The full standard: WCAG 2.2 Level AA quick reference". In the browser-tab preview the links are clickable; on paper, the print stylesheet's existing `a[href^="http"]::after` rule writes each address out in full parentheses after the link text — no new print machinery.
- **The criterion→slug table moved to `@file-audit/shared`** (`WCAG_UNDERSTANDING_SLUGS` + `wcagSlugFor`), and the analyzer's conformance gate now imports it instead of holding its own private copy — one source, so the printed links and the API's conformance links can never drift apart. A criterion with no known slug falls back to the version's quick-reference page, exactly as the gate always has.

### Notes

- The address on a stored report's "not assessed" entry is attacker-controlled JSON on the shared page, so it passes `safeHttpUrl` before rendering — a non-http(s) address is dropped, not linked or printed (test-pinned, alongside a test that old callers passing no link options keep producing a link-free plan).
- The printable page remains fully standalone: `href` attributes load nothing, and the no-scripts/no-network tests still pass.
- No announcement banner — the "not a guarantee" banner from v1.73.0 stays up; this improvement is visible the next time anyone prints a plan.
- Tests 2,203 → 2,210 (API 1,177 / web 984 / CLI 49).

## [1.73.2] - 2026-08-14

### Fixed

- **Documentation-accuracy pass for auditors: every surface describing the scoring model now describes the CURRENT model.** Prompted by an operator review of the landing-page stat tiles. Four surfaces still described the pre-v1.58.3 renormalization — "categories that don't apply are excluded and the remaining weights renormalized" — which the scorer has not done since v1.58.3 (a non-applicable category counts as passing and keeps its weight; only not-assessed checks sit outside the score). Corrected in the technical-details explainer (section retitled "Categories That Don't Apply", with the removal's history stated), the site-wide scoring-rubric panel (two sentences), the report-page MethodologyCard (all four per-format paragraphs, which now also distinguish "no equivalent for this format" / "always Not Assessed" / "doesn't apply to this document"), and `llms.txt`/`llms-full.txt`.
- **The v1.58.x cap is now described by its actual mechanism** on /technical-details: the SCORE is capped by the worst open finding (Minor 89 / Moderate 79 / Critical 69, since v1.58.2) and the letter follows the score — the old text said "the letter is capped" (the interim v1.58.0 model whose correction cost three releases).
- **v1.73.1's README category recount is reverted as itself miscounted.** It changed "nine WCAG-aligned categories" to "up to ten", counting displayed category rows; the product's established basis (llms.txt, MethodologyCard, the landing tile) counts SCORED categories — 9 for PDF and PowerPoint, 8 for Word, 7 for Excel — with always-"Not Assessed" placeholder rows shown on top (which is where PDF's 10 rows come from). The README now states the scored basis with per-format numbers, and the landing tile's "9" carries a source comment so the same recount cannot happen a third time.

### Verified (no change needed)

- The landing stat tiles' operational claims were verified against code, all accurate: the remediation pipeline is qpdf → OpenDataLoader → veraPDF with a job-failing no-regression guard (`remediate.ts` fails the job if the overall or strict score drops); uploads use multer memory storage; remediated outputs are deleted on first download or the 30-minute `OUTPUT_TTL_MS`, with `deleteAndVerify`/`verifyAbsent` recording `output_deleted` and fs.stat-backed `verified_absent` lifecycle events; the audit trail (audit_log + remediation_events) has held no identity columns since v1.68.0.
- One tile updated for completeness rather than error: the "No AI, no third-party APIs" tile (last touched at v1.18.0, before analytics existed) now scopes itself to "every audit step" and discloses the self-hosted Plausible page-view counter, matching § 8a's qualified claim from v1.72.0.

### Notes

- No behavior change anywhere: prose, one tile link, versions, and this paperwork. No announcement banner — nothing changes for a visitor's use of the tool; the corrected pages are themselves the record.
- Tests 2,203 → 2,203.

## [1.73.1] - 2026-08-14

### Added

- **Humans stay in the loop at every grade: the score display is never silent about the human half.** v1.73.0 scoped the full "Even a perfect score is not a guarantee" band to the grades that look done (A/B). This release adds the other half of the rule — *always remind, no matter the grade*: every C/D/F (or unknown/junk) grade now shows a compact one-line reminder in the same spot instead — "Whatever the grade, automated checks are only part of the job — a person still has to review this document" — linking to "Still worth checking by hand" where the checklist exists. The two forms live in the same self-gating component, so no score display can render without one of them. The HTML export gains the same one-liner below the threshold, and the share email's qualifier is now deliberately unconditional (a test asserts no grade gate can creep back in). The printable plan already reminded at every grade via its footer.

### Changed

- **The word "strong" is retired from every live surface, per the operator's voice preference.** Seven strings, no logic: the v1.73.0 landing banner and § 10 entry now say "high score" / "high grade (A or B)"; ScoreCard's conformance body says "a high mark overall" and its verdict line "a good structural signal"; the PDF/UA verdict's reassurance reads "and it's high"; and the CLI fleet summary reads "High accessibility compliance" / "maintain this high standing". Dated audit-history records keep their original wording — they are append-only compliance records — and `<strong>` HTML emphasis tags are unaffected (markup, not voice).
- README accuracy: the score description said "nine WCAG-aligned categories"; the count varies by file type (ten for PDF and Word, nine for PowerPoint), so it now reads "up to ten … depending on file type".

### Notes

- v1.73.0's banner and § 10 wording were corrected in place rather than annotated: v1.73.0 was tagged but never deployed, so no visitor or auditor ever saw the original phrasing — this entry is the disclosure.
- Verified on request: the automation-limit band's "N WCAG criteria on this document were never machine-checked at all" count is computed per document from the audit's own conformance verdict (`notAssessed.length`), and no surface — band, banner, § 10, README — hardcodes a number. The 9 shown in the release screenshots was the live value for the control PDF (contrast + five universally-unassessed criteria + three WCAG 2.2 form criteria, since that document contains a form); other documents correctly show their own counts.
- No route, storage, retention, or dependency change. Tests 2,201 → 2,203 (API 1,177 / web 977 / CLI 49).

## [1.73.0] - 2026-08-14

### Added

- **The score now states its own limits, visually: an unmissable "Even a perfect score is not a guarantee" band under every good-looking grade.** Accessibility remediators keep having to explain the same thing about automated checkers: a 100 does not mean the document is accessible — it means the document handles the signals automated tests can measure, and it is in good shape; whether it actually works with a screen reader is a judgment only a person can make. The report already said this in prose ("Still worth checking by hand", the caveat box), but nothing said it *at the score*, which is exactly where a reader decides they are done. A new amber band (`AutomationLimitBand.vue`) sits directly under the score in both report views, splitting the job into two halves: **Automated checks — ✓ Done, this score** beside **Human review — ◯ Always still required**, the second drawn with an open dashed border (work that never closes automatically). It names what only a person can confirm — alt text that describes each image, headings that match their sections, a reading order that makes sense, a screen-reader pass — and reports the document's own count of WCAG criteria never machine-checked at all, linking to "Still worth checking by hand" where that list lives.

- **Shown only where the grade looks done: any grade over a 79 (A and B).** Under the severity caps, 80+ means the worst automated finding was Minor or nothing — exactly when a reader closes the tab satisfied. A C/D/F report already leads with an action plan full of work, so the band would be noise there; the ManualReviewCard still covers the human half on every report at every score. One predicate (`shouldShowAutomationLimit` in `utils/automationLimit.ts`) gates every surface, and the band gates *itself* on the same displayed grade shown above it, so no mount can forget the rule and the two report views can never disagree.

- **The message travels with the score.** The same warning appears on the remediation before/after score cards, as a dashed box directly under the `Grade A · 100/100` line of the printable action plan, as a band under the downloaded HTML report's hero, and as a one-line qualifier after `Score: N/100` in the share email — each gated by the same predicate.

### Notes

- **Deliberately no percentage.** The band never quotes an "automated tools catch ~30% of issues" industry statistic: any figure out of 100 beside a letter grade is read AS the grade no matter its label (the v1.58.1 lesson), and a canned statistic would be someone else's number about someone else's tool. The band's only number is this audit's own count of never-machine-checked criteria, and a test asserts no `%`, `/100`, or "of 100" can ever appear in it.
- A report without a conformance block (forged or legacy shared JSON) gets no count claim rather than a fabricated "0 criteria" — null and zero are different statements. Junk grades in forged reports fail closed to hidden.
- ReportGradeHero's grade label now carries `data-testid="grade-label"`; the page-audit "no publication clause" test asserts on that element (its old whole-hero em-dash scan tripped on the band's legitimate em-dashes).
- Tests 2,175 → 2,201 (API 1,177 / web 975 / CLI 49).

## [1.72.0] - 2026-08-14

### Added

- **Privacy-friendly page-view analytics: self-hosted Plausible, and the CSP's first — and only — external origin.** Every page now carries the standard Plausible snippet (`<script defer data-domain="audit.icjia.app" src="https://plausible.icjia.cloud/js/script.js">`), injected from `nuxt.config.ts`. The instance is Plausible running on ICJIA's own DigitalOcean droplet (`plausible.icjia.cloud`) — no commercial analytics provider, ad network, or tracker is involved, and the visitor's browser reports directly to that server; the audit application never receives or forwards the data. Plausible is cookie-free by design: per view it records the page URL, referrer, browser and OS family, device type, and country/region — never a stored IP address or user-agent — and it links one day's views with a salted hash that rotates every 24 hours, so activity cannot be connected across days or sites ([how Plausible approaches privacy](https://plausible.io/privacy-focused-web-analytics)).

  The wiring is centralized in a new `ANALYTICS` block in `audit.config.ts`, read by both consumers so they cannot drift: `nuxt.config.ts` builds the script tag from it, and `buildCspHeader` allows the origin in **both** `script-src` and `connect-src`. The two-directive contract matters because missing either fails silently — without `script-src` the script never loads; without `connect-src` it loads but the browser refuses every `/api/event` POST. Setting `ANALYTICS.PLAUSIBLE_HOST` to `""` removes the snippet and the CSP allowances together. The nonce-based `script-src` discipline is unchanged: still no `'unsafe-inline'`, and a new assertion pins the Plausible origin as the only `scheme://host` source in the entire policy, so a second external origin cannot ride in quietly.

  Because this is the first time anything about a *visit* leaves the page, the data-retention policy moves to **v1.7**: § 7 gains a retention row for the analytics store, § 8's "never stored" analytics and fingerprint bullets are reworked to name what the counter does collect, § 8a's "No AI services, analytics, or trackers receive data" verification row is qualified (dated 2026-08-14) rather than silently left overclaiming, § 9 describes the safeguard with a link to Plausible's privacy page, and § 14 records the change. A landing-page announcement discloses it to visitors, and the README documents it in the Tech Stack and Security sections.

### Notes

- New `plausibleAnalytics.test.ts` pins the three silent failure modes: the snippet is built from `ANALYTICS` rather than a hardcoded copy that could drift from the CSP; `data-domain` equals `DEPLOY.PRODUCTION_URL`'s hostname (the self-hosted instance discards events for any site it doesn't know); and the origin is https with no trailing slash, since it is used verbatim in both the CSP and the script URL.
- `/status` remains JavaScript-free — the snippet rides the Nuxt app head, and `/status` is rendered by its own Nitro route that never loads it (its existing no-`<script>` test still passes) — so uptime-monitor traffic is not counted.
- No server or nginx change is needed to deploy this: the beacon goes browser → `plausible.icjia.cloud` directly and never transits this application or its proxy.
- **Deliberately no `integrity=` (SRI) attribute on the snippet, on the record:** the self-hosted `script.js` is a rolling file that changes whenever the Plausible server is upgraded, so an SRI hash would silently kill analytics at the next upgrade — precisely the failure mode the new tests exist to prevent. SRI is for immutable, versioned URLs on infrastructure you don't control; this origin is ICJIA's own droplet, in the same trust domain as the site, and the CSP still confines what any loaded script may contact. If that trade-off is ever revisited, the right alternative is Plausible's same-origin proxy pattern (serving the script through this site's own nginx), which removes the external origin entirely.
- First release to ship the 2026-08-13 `DEPLOY.NGINX_CLIENT_MAX_BODY_SIZE_MB` contract pin and `deployLimits.test.ts` (`b52e84c`, documented under v1.70.0's corrected deploy note below).
- Tests 2,163 → 2,175 (API 1,177 / web 949 / CLI 49).

## [1.71.0] - 2026-08-13

### Added

- **Every rate-limit rejection is now logged, and a rejected privileged token says so on the caller's first request.** On 2026-08-12 a fleet-audit run was reported as the audit server being "offline". It was not: the host had been up four days, both PM2 processes 29 hours with zero unstable restarts, no OOM kills in seven days, and nginx had logged no 5xx or upstream error all day. The run was simply calling `/api/audit-url` with no privileged token, sat in the anonymous tier (500/hour, 100/min), and spent its wall-clock honoring `Retry-After` — which from the client side is indistinguishable from a dead server.

  What made it expensive to diagnose is that nothing recorded it. This site's nginx vhost sets `access_log off`, and the limiters rejected silently, so the single most useful fact had to be reconstructed from process uptime and an absence of errors. `rateLimiter.ts` now emits one line per 429 — `[rate-limit] 429 limiter=… tier=… auth=… path=… limit=N/Ns` — wired into all five limiters (`analyze`, `global`, `reports`, `remediationStatus`, `status`) through a shared `loggedHandler`. `authOutcome()` distinguishes a **wrong** token from an **unconfigured server**: both silently degrade to the anonymous tier and were previously indistinguishable. `tokenAuditMiddleware` is mounted ahead of `globalLimiter` so a misconfigured client is named on its first request rather than only once it has been throttled, rate-limited to one warning a minute so it cannot flood the log.

  **No identifiers are logged** — no IP, no `Authorization` value, no user agent. The service stores no identity (v1.68.0) and the limiter buckets hold IPs in memory only; a log file is disk, and writing them there would contradict § 14. A test named _"NEVER writes the caller's IP or the token value to the log"_ guards it.

- **`/status` reports whether the privileged rate-limit tier is armed, so losing the token pages instead of going unnoticed.** New payload field `privileged_tier: "on" | "off"`. When `off`, `"privileged_tier"` joins the `degraded` array and the top-level status becomes `degraded` — so the **existing** UptimeRobot keyword alert on `degraded` fires with no new monitor and no new keyword.

  The failure it catches is real and silent: the token reaches the API only through the process environment (`ecosystem.config.cjs` reads `process.env.API_PRIVILEGED_TOKEN || ""`, sourced from `/etc/environment`, which PAM loads for **login** shells). A PM2 resurrect from a non-login shell after a reboot is enough to lose it, at which point `isPrivilegedRequest` fails closed, every caller is forced anonymous, and the weekly fleet audit quietly drops from 5,000/hour to 500/hour. Nothing else on the page moves — engines, database, disk and backup all stay green.

  Deliberately **not** a core failure: it stays HTTP 200, matching `disk` and `backup`. The service can still audit perfectly well; it is the fleet integration that loses its headroom, and a 503 would take the public tool down over it. Wired into **both** verdict paths (`getStatus` and `getHealthSummary`) with a test asserting the two agree — a card wired into only one surface has shipped here before. Privacy: on/off only, never the token, a prefix of it, its length, or a hash; added to the `statusPrivacy.test.ts` top-level allow-list deliberately.

### Notes

- **The rate limiter itself is unchanged.** No limit, window, or tier was altered. v1.70.0 already recorded that the two-tier system was correct and simply had no token configured; this release makes that state visible rather than adjusting it.
- **Companion change in the fleet client** (`icjia-fleet-audit` v1.41.0, separate repository): `AUDIT_ICJIA_TOKEN` is read from the environment, falling back to `~/.filecap/secrets.json`; the tier is announced at run start; and the retry layer now tallies 429s and total wait, reporting them at end of run so a throttled run reads as throttled rather than as a broken server.
- Three existing test files now set `API_PRIVILEGED_TOKEN` in setup. Without it they would assert the shape of an unhealthy service, and unrelated backup and disk assertions would fail for a reason that has nothing to do with backups or disks.
- Tests 2,145 → 2,163 (API 1,170 / web 944 / CLI 49).

## [1.70.0] - 2026-08-13

### Changed

- **The upload / fetched-file size cap rises from 15 MB to 25 MB** (`ANALYSIS.MAX_FILE_SIZE_MB`). The ICJIA fleet audit graded 1,966 PDFs on 2026-08-12/13 — its first complete pass since 2026-07-02 — and this cap refused six of them with HTTP 413. All six are legitimate published agency documents: a 17.3 MB budget-committee packet, a 20.9 MB HR newsletter, two ILFVCC protocol documents (17.5 / 18.5 MB), and two drone reports (49.4 / 59.7 MB). The boundary the run measured was exact — largest file graded 14.3 MB, smallest refused 17.3 MB.

  25 MB clears four of the six and holds worst-case buffer memory at `2 × 25 = 50 MB` under the unchanged `MAX_CONCURRENT_ANALYSES: 2`. It deliberately stops short of the 49.4 / 59.7 MB reports: admitting those needs a ~64 MB cap, which is past the 50 MB `audit.config.ts` already warns about on a 4 GB droplet, and a 60 MB PDF is its own accessibility problem rather than a reason to raise a shared server limit.

  Updated in every place the value is asserted or displayed: `audit.config.ts`, the hardcoded `MAX_FILE_BYTES` in `bulk-from-inventory.ts`, `DropZone.vue` (client check + copy), `technical-details.vue`, the data-retention sections (02, 09), `llms.txt` / `llms-full.txt`, the README limit tables and memory-exhaustion calculation, and three `components.test.ts` assertions (including the oversized-file fixture, which was a 16 MB file and would have passed under the new cap).

  **Deploy note:** nginx `client_max_body_size` lives in the Forge config, outside this repo, and must be at least **60 MB** on the `location /api/` block, or the proxy will reject uploads before they reach the API.

  > **Corrected 2026-08-13 — this note originally said 35 MB, and that figure is wrong.** It was derived from the 25 MB audit cap plus 10 MB of headroom, overlooking `REMEDIATION.MAX_FILE_SIZE_MB`, which is **50 MB** — deliberately double the audit cap, because remediation handles annual reports and multi-section dossiers. Acting on the 35 MB figure narrowed the proxy the same day and broke every remediation upload between 35 and 50 MB with a 413 from nginx: a live feature failing in production, with a green test suite and nothing in the application logs, because a request the proxy rejects never reaches the app. The binding constraint is remediation, not the audit cap: **50 + 10 = 60 MB.** The value is now recorded as `DEPLOY.NGINX_CLIENT_MAX_BODY_SIZE_MB` and pinned by `deployLimits.test.ts`, which fails the build if either cap outgrows it.

### Notes

- **No change to the rate limiter.** The 2026-08-12 fleet run spent eight hours throttled, but the two-tier system was already correct and complete — it simply had no token configured. Setting `API_PRIVILEGED_TOKEN` here and the matching client token in the fleet-audit pipeline moves that caller from 500/hour + 100/min to 5,000/hour + 1,000/min, which is what `RATE_LIMITS` was sized for.
- **No change to the 422 path.** Eight agency "PDFs" were refused with 422 during the same run. `urlAuditPipeline.ts` was right: those files are HTML — saved GitHub file-view pages uploaded into Strapi with a `.pdf` extension, served with `content-type: application/pdf` and HTTP 200. Loosening `detectFileType` to accept them would have masked eight broken documents on the agency site. Reported upstream instead.

## [1.69.0] - 2026-08-11

### Fixed

- **Every Word and Acrobat menu path in the fix steps was re-verified against current vendor documentation, and the stale ones corrected — prompted by a user who followed the steps and couldn't find the menus.** Root cause: Adobe replaced Acrobat's entire menu system in the "new experience" rolled out through 2023 (☰ menu + an **All tools** panel; `Tools → Accessibility` no longer exists), and pockets of the app still described the old interface. Worst was the remediation page's per-category Acrobat dictionary — classic-only paths throughout (`Tools → Accessibility → Set Alternate Text`, `Tools → Prepare Form`, `Tools → Print Production → Preflight`, plus one hint that was actually a **Word** menu). Every Acrobat step app-wide now leads with the current path and gives the classic path in parentheses where the two differ sharply — the same both-audiences convention the printable plan already uses for fix routes, chosen deliberately over a current/classic toggle (stored reports carry frozen Detailed-view steps a toggle can't rewrite, a printout can't toggle, and readers can't reliably name their Acrobat generation).
- **Word steps corrected where Microsoft's current docs disagree with our copy:** the hyperlink menu item is **Edit Hyperlink** (one string said "Edit Link"); the ribbon tab in Microsoft's own repeat-header article is **Table Layout** (one step said "Layout", and the older **Table Tools** location is now noted); and the right-click alt-text command is **View Alt Text** in Microsoft 365 but **Edit Alt Text** in perpetual Word 2019–2024 — both wordings now appear wherever the command is named (analyzer findings included, so Detailed-view guidance matches whichever Word the reader has). The Acrobat checker's rename is also reflected where the app describes it (Accessibility Check, formerly Full Check), and the source-document notice's Mac export tip now matches the current Word for Mac dialog (newer builds tag PDFs on plain Save As; the "Best for electronic distribution and accessibility" radio belongs to older builds).

### Added

- **A version-and-support note on every fix-step card, on all six surfaces** (Visual-view plan cards, Detailed-view "How to Fix in Adobe Acrobat" blocks, Issues-to-fix rows, the printable plan, the HTML export, and the remediation page): which app versions the steps were verified against (Microsoft 365 Word — Windows Version 2607, Mac 16.111 — and Acrobat Pro 26, August 2026), a one-line "which Acrobat am I looking at?" test (☰ + All tools = current; a Tools tab with an Accessibility toolset = classic → use the parenthesized paths), and the agency support line: contact IDS at ICJIA to make sure you have the most recent versions installed. The note lives in one place (`apps/web/app/utils/fixStepVersions.ts`); eleven new wiring tests pin it to each surface so no view can silently drop it.
- `docs/fix-step-accuracy-2026-08.md` — the verification record: the canonical current-vs-classic path table, exact versions and dates verified against, perpetual-license notes for IT (Acrobat 2020 support ended 2025-11-30; Acrobat Pro 2024 ships the *new* UI despite the "Classic" branding; the "Disable new Acrobat" toggle still exists), and the vendor-doc ambiguities already litigated so the next accuracy pass doesn't start from zero.

### Notes

Guidance-copy release plus one new UI element (the per-card note); no scoring, storage, retention, schema, or dependency change. Menu paths verified 2026-08-11 against live Adobe helpx and Microsoft support pages (Adobe's fetched via a real browser — helpx blocks plain HTTP clients). Old stored reports keep their frozen findings text; the note renders from the web layer, so they get it too. Tests 2,134 → 2,145 (web 933 → 944).

## [1.68.3] - 2026-08-10

### Changed

- **The landing-page announcement now says the sign-in system was never switched on, not merely that it was removed.** The v1.68.0 banner told visitors sign-in "has been removed" and stopped there, leaving the stronger — and fully checkable — fact unsaid: `AUTH.REQUIRE_LOGIN` was `false` in **every tagged release from v1.0.0 through v1.67.1** (verified tag by tag before this wording was written). `authMiddleware` returned the anonymous sentinel _before_ it ever verified a token, `remediate.ts` stored `null` where a job owner's email would have gone, and `audit_log.email` accordingly held `anon:<ip>` for everyone. Nobody ever needed an account here and no audit was ever tied to one. The banner now says that, and says why the unused machinery was deleted rather than left sitting in the code: the tool is in wide use and stays free and open, with nothing to register for.
- **Deliberately not phrased "never implemented."** The OTP login was built and shipped — v1.0.0's own changelog lists "OTP authentication" as a feature, and the middleware demanded a JWT unconditionally for the ~1 day before the toggle existed (it landed 2026-03-07 defaulting to `false`, the date the changelog gives v1.0.0). What the repository can back is that it was never _enabled_ in a released version, so that is what the banner claims. The distinction is exactly the one an auditor would test.
- The announcement `id` gains `-r2`, which re-shows the corrected wording to anyone who dismissed the weaker one — the banner is per-`id` permanently dismissible, so a silent edit would have reached only new visitors. This amendment is the release's banner step; no second `ANNOUNCEMENTS` entry was added, because the correction belongs to the announcement it corrects.

### Notes

Copy-only: one string and one id in `audit.config.ts`. No behavior, storage, retention, dependency, or schema change, and no new attack surface. Test count unchanged.

## [1.68.2] - 2026-08-09

### Fixed

- **The documentation-truth pass: 27 findings from an adversarial verification of the data-retention page, README, and technical-details surfaces against the v1.68.0 code.** The two that mattered most: the policy page's header still advertised **"Policy · v1.4"** while its own § 14 change log said v1.6 (the constant had been forgotten on two consecutive releases — a new test now pins the header to § 14's newest entry), and § 9 still listed "HTTP-only cookies for authentication" and a "per-user concurrency limit" citing a config key that no longer exists (replaced by the real safeguards: no cookies at all, and the in-memory per-IP daily cap). Also corrected: § 11's receipt URL now shows the required `?t=<token>` (a bare jobId 404s by design); § 7 gains a row for the host nginx access log (rotated daily, 52 kept — the one identifier-bearing store that had no retention listed) and names `PURGE_GRACE_DAYS` and `BACKUP_KEEP_COUNT`'s real home (a backup-script env var, not audit.config.ts); § 8a's Limitations paragraph, verdict-table attribution, and "standard web logs" cross-reference now match what the sections actually say; § 6 no longer promises an `audit_log` schema it doesn't show; § 2 scopes "the only thing an audit produces" to the browser-upload path (URL/fleet audits also persist a shared report); § 3's poll line carries the token; the §§ 12–15 HTML comments are renumbered.
- **Technical-details/explainer factual drift, some of it predating v1.68.0:** the last surviving identity claim (a "per-user concurrency limit" bullet) replaced with the real per-IP daily cap; Bookmarks/Reading Order weight percentages un-transposed (5%/10%, matching the file's own table); the PPTX and Excel category lists corrected (PPTX omits Heading Structure and Bookmarks — slide titles ARE the outline; Excel also omits Reading Order and List Structure); four "fully in-process, no subprocess" claims about OOXML parsing corrected to the real design (dedicated short-lived child process, in-memory hand-off, no temp file) — the page's own ASCII diagram had it right four lines away; the status-poll interval corrected to once per second with backoff; veraPDF described as conditional on configuration (it is configured in production) and its own short-lived temp copy disclosed alongside qpdf's.
- **One code change to make a promised guarantee true instead of softening the promise:** remediation outputs are now `chmod 0600` after the tagged file lands (`jobs/remediate.ts`) — the JVM wrote it under the process umask, so § 9's "0600 on output files" described only the input until now. Stale auth-era comments swept from audit.config.ts, auditLog.ts, remediationCleanup.ts, and scoring.ts.

### Notes

Copy + comments + one chmod; no behavior change beyond the file mode. Findings produced by two read-only verification agents cross-checking every claim against the code — the same pass that caught v1.68.1's broken shared-report links. Tests 2,133 → 2,134.

## [1.68.1] - 2026-08-09

### Fixed

- **Shared-report links were broken on production since v1.68.0 deployed — every `GET /api/reports/:id` returned 500.** Migration 11 dropped `shared_reports.email`, and this route's SELECT still named the column; better-sqlite3 threw "no such column" at prepare time and the catch-all turned it into a 500 for every stored report, including the fleet's stable reportUrls. The removal sweep caught every writer but missed this one reader, and no test exercised the route against the migrated schema — the suite stayed green while production broke. Found within the hour by the post-release documentation verification pass (an agent checking §8a's "every statement enumerated" claim against the code), confirmed live, fixed by dropping the column from the SELECT, and pinned by a new `reportsRoute.test.ts` that runs the real route against a real migrated database (200 / 404 / 410 paths, plus "nothing email-shaped in the payload").

## [1.68.0] - 2026-08-09

### Removed

- **The sign-in system, in its entirety.** The tool is free and open to use, and now the code says so: the OTP email flow, JWT sessions, the logout jti denylist, personal access tokens (`fap_`), the admin role, the login and My History and Admin Logs pages, the auth middleware on every route, and the mailer itself (OTP codes were the only email the service ever sent — there is no mail-sending code left, and `JWT_SECRET`/`SMTP_*`/`ADMIN_EMAILS`/`ALLOWED_DOMAINS` are no longer read). The `API_PRIVILEGED_TOKEN` fleet service credential is unchanged — it is a rate-tier/allowlist bypass for the fleet integration, not a user account, and never touched identity storage.
- **Identifier storage, at the schema level.** Migration 11 **drops the columns and their data**: `audit_log.email` (which held `anon:<ip>` sentinels for everyone since login was never required), `audit_log.ip_address`, `audit_log.user_agent`, `shared_reports.email`, `remediation_jobs.email`, and the whole `otp_codes` / `revoked_jtis` / `access_tokens` tables. What remains per audit is metadata about the event — file name (sanitized), score, grade, timestamp, content hash — data about the file, never the file, and nothing about the caller. `statusPrivacy.test.ts` now asserts the columns are physically absent, not merely unwritten. Old nightly snapshots carry the old shape until the keep-5 rotation ages them out (≈5 days).

### Changed

- **The remediation gates were rekeyed for an identity-free world.** The audit-before-remediate gate binds to the **content hash** alone: these exact bytes must have passed a recent audit (any path), which is still the property that stops callers bypassing the audit pipeline's rate limit. The per-caller daily cap moved to **process memory** (`remediationCap.ts`), keyed by the caller's IP used transiently — never written to disk, a row, or a log — with single-threaded check-and-reserve replacing the old P2.4 SQL transaction; it resets on API restart, which is acceptable for an abuse brake. Job status/download/receipt authorize by the job's **download token only** (the C5 anonymous path, now the only path — 404 on failure so existence never leaks). URL-audit dedup keys on content hash alone, which preserves the exact behavior production already had (every caller shared the `anonymous` identity). Per-IP rate limiting itself is unchanged and in-memory (express-rate-limit's MemoryStore).
- **Every policy and status surface now tells the identity-free story in "metadata" terms** — data about the file, never the file: the `/status` backup card (✗ column now includes "Who uploaded it"), data-retention §§ 2, 3, 4, 5, 6, 7, 7a, 8, 8a and § 11's sample SQL, the §&nbsp;4 no-AI diagram (Mailgun node removed — its mermaid source is now inline in `scripts/generate-diagrams.mjs`), and the technical explainer. § 8a is re-verified and dated 2026-08-09: four tables, no identity columns anywhere, no email can leave the server at all. Policy change log **v1.6**. The overclaim guards remain and got stronger: "no personal data"/"no PII"/"anonymized" are still banned phrases (a file name as uploaded can itself name a person; shared reports quote short labels), and the surfaces must now state the affirmative absences — no accounts or sign-in, and no email/IP/browser column in the schema for anything to fill.

### Notes

The header nav no longer has an auth-gated section or a mobile hamburger (its only cargo was My History/Admin/Logout); FAQs joined the always-visible links. `nodemailer`, `jsonwebtoken`, `bcryptjs`, and `cookie-parser` left the dependency tree. Origin: the user's decision, in their words — "it's more important that this be free of PII instead of an auth sign in."

## [1.67.1] - 2026-08-09

### Changed

- **The records are described as what they are: metadata about the audit event — wording only, for federal and state auditors.** The `/status` backup card's "why back up anything?" answer and the data-retention §&nbsp;7a lane now state that what is kept is *metadata about the audit* — date, file name, score, grade — "a record **about** the document, never a copy of any part of it — it says the file was checked, not what the file said." §&nbsp;7a also gains the reconciliation auditors need in one place: the policy **never claims the records are free of personal detail** — the personal fields are named (sign-in email for signed-in users; the connection log's IP address and browser user-agent, purged after 365 days; the file name as uploaded, which can itself name a person), and what the records never hold is the document or anything read from inside it. A blanket "no PII" claim was considered and rejected: §&nbsp;8a's own verification names the sign-in email and uploaded file name, and `backupsExplained.test.ts`'s overclaim guards fail any surface that claims otherwise — those guards forced one rewording of this very release's copy, which is them working. Policy change log gains **v1.5** recording the clarification. Nothing stored, used, or retained changed.

### Notes

Copy-only release; behavior, storage, and retention unchanged. Both pinned surfaces (`/status` card and §&nbsp;7a) updated together — `backupsExplained.test.ts` exists precisely because they once drifted.

## [1.67.0] - 2026-08-09

### Added

- **Word reports list the document's heading outline with its real text.** The DOCX heading card gains a `--- Heading Outline ---` technical-signals group listing every real heading as `H2 "Introduction"` — the analyzer had been capturing `{level, text}` for each heading and printing only counts. Paragraphs that merely *look* like headings (bold/large text, no Heading style) are listed verbatim under `--- Paragraphs Styled Like Headings ---` so an author can find each one and restyle it — those were the single most requested "what, exactly, is missing" detail for non-technical remediators. This is the first technical-signals content on any Office-format card, which also means DOCX heading cards get the Basic/Advanced pill for the first time. Outlines cap at 40 lines with a visible `... and N more` note; heading text truncates at 80 characters.
- **PDF heading cards show each heading's text, not just its level.** Below the existing `--- Heading Tree ---` level flow (`H1 → H2 → H2`), a new `--- Heading Outline ---` group gives every heading its text, resolved through pdf.js: `page.getStructTree()` content leaves and `getTextContent({ includeMarkedContent: true })` marked-content items share the same `p{pageObjId}_mc{mcid}` id format (verified against the installed pdfjs-dist 4.10.38 source before building on it), so a per-page id → text map plus a tree walk for H/H1–H6 roles recovers the outline. Text attribution follows the innermost marked-content run; an author-supplied `/Alt` or `/ActualText` on the heading node wins over painted text; headings with no resolvable text are skipped rather than listed blank. Extraction is never fatal — a page with a broken struct tree contributes nothing — and is bounded at 300 entries before the display cap of 40. The group is wired through the full real pipeline (qpdf binary + pdfjs + scorer) by a new integration assertion, not just unit-tested.

### Changed

- **Technical-signals panels start open.** Someone reading the Detailed view — or the Visual view's expanded "Full technical report" — has already asked for depth, so every category card's signals panel now renders expanded, with the Basic/Advanced pill starting on **Advanced** and existing to collapse rather than to reveal. By the report-view asymmetry rule (v1.61.1): hiding the specifics from someone who needed them costs more than showing them costs someone who didn't. The HTML export is unaffected — it already force-expands any `aria-expanded="false"` toggle before snapshotting, which is now simply a no-op in the default state.

### Notes

Tests 2,233 → 2,254 (API 1224 / web 981 / CLI 49, 136 files). Origin: a "where did the Basic/Advanced cards go?" investigation — they were never gone (the always-open-on-Visual default of v1.61.1 hid them behind one more click) — that turned into "the advanced view must carry as much concrete detail as possible: alt text, headings, table headers, by name."

## [1.66.0] - 2026-08-08

### Changed

- **Scoring conventions with no standards basis are now advisory instead of grade-capping.** From an adversarial review of the analyzer against the `controls/` corpus — whose headline verdict was that every conformance failure and every pass hand-checked at byte level came back **true** — the residual problem was opinion leaking into the letter grade. Because any sub-100 category score becomes a severity and a severity **caps the grade**, only findings with a standards or tool-precedent basis may now score below 100:
  - **Multiple H1 headings** no longer score 75/Minor. No WCAG criterion, PDF/UA-1 clause, or Matterhorn condition requires a single H1 — PDF/UA explicitly permits repeated H1s — and Acrobat/PAC do not flag it, yet it was capping conformance-clean documents at B (`DVFR_Biennial_Report_2024`: 5×H1, its only finding, now 100/A). The observation survives as an advisory finding with its basis stated; hierarchy **skips** keep their 60 (Matterhorn 13-004).
  - **Single-column tables** are excluded from the PDF table score using the conformance gate's exact expression (`(columnCounts[0] ?? 2) >= 2`), so the score can never again dock layout scaffolds the gate itself classifies as non-data — `2022_DVFR_Annual_Report`'s 26 single-column tables had it at table_markup 75. They still appear in the overview, marked "layout, not scored". The merged-first-row classifier weakness stays on the ledger — now consistently applied instead of contradictory.
  - **Bookmarks keep their 45/Moderate** (Acrobat's own checker flags long documents without them), but the finding no longer cites 2.4.5 as the requirement — Multiple Ways is scoped to a *set* of web pages, and the copy now says exactly what the basis is.

  Controls re-run before/after: **zero conformance-verdict changes**; four scores moved, all up, each traceable (`DVFR_Biennial_2024` 89→100/A, `WomenInPolicing-remediated` 88→89/B, `2022_SFS` 73→77/C, `Full_DJJ` 59/F→66/D). Stored shared reports keep their stored numbers — a fresh audit of the same file can now score higher, the same drift class as v1.58.x, already caveated on `/status`.

### Added

- **The "not checked by this tool at all" disclosure is now complete.** `conformance.notAssessed` held only contrast and (conditionally) reading order, implying everything else was covered. Five criteria that apply to every document and are genuinely never assessed are now disclosed on every verdict, all four formats: **3.1.2 Language of Parts, 1.4.1 Use of Color, 1.4.5 Images of Text, 1.4.11 Non-text Contrast, 1.3.3 Sensory Characteristics**. The live counterexample that forced it: a 100/A control declaring `no/de/da/it` spans in an English report — Word autodetect noise, squarely 3.1.2 territory, previously undisclosed. For PDFs the 3.1.2 entry cites the document's own measured span languages (primary-subtag compare, so `en` vs `en-US` is not "foreign").
- **The manual-review card and the printable plan warn when every image is excluded from scoring.** A 100/A control carries four images hidden as artifacts — one a 612×423pt half-page **cover image** marked as a "Pagination/Header" artifact — and the card whose premise is "each passing check contributes the judgment automation could not make" said nothing about images on exactly that report. A category with images present but excluded (score null + notAssessed) now emits a **caution-tone** prompt — amber `!`, never the passed-check ✓ — on the card and on paper.
- **Alt text that declares itself decorative is flagged.** Three `<Figure>`s in a control carry `/Alt "Decorative border"` — announced three times by a screen reader as pure noise. Alt matching `^decorat…` (or bare "border"/"spacer"/"divider"…) now draws an advisory to mark the image as an `/Artifact` instead. No score change, and anchored so alt that *depicts* decoration ("Photo of decorative ironwork…") is untouched.

### Fixed

- **`ecosystem.config.cjs` no longer claims `pm2 restart` re-evaluates the whole file.** True for environment, false for restart options — proved on production, where twenty deploys had left `max_restarts` unset. The comment and `docs/process-supervision.md` now document the real procedure (`pm2 delete` + `pm2 start` + `pm2 save`).

### Notes

Tests 2,215 → 2,233 (API 1206 / web 978 / CLI 49). Full writeup: `docs/scoring-calibration-and-disclosure-2026-08-08.md`. The review itself verified the analyzer's honesty end to end: all 33 controls batch-audited, ~12 hand-verified with qpdf/unzip, remediated pairs ordered correctly, and the empty-tag-tree detector caught a cosmetically-tagged "remediated" file exactly as designed.

## [1.65.1] - 2026-08-08

### Changed

- **The tooltip's glyphs are coloured: green ✓, red ✕, muted —.** Requested after using v1.65.0: the states were words with monochrome marks, and a coloured mark reads at a glance. Colour is added as a **second** channel beside the word, never instead of it (WCAG 1.4.1 was the reason the words exist), using the same status tokens the header text already uses — so the contrast test's measurements on `--surface-raised`, the tooltip's own background, cover these exact pairs in both palettes with nothing new to prove. "Not yet checked" deliberately stays muted: it is not good news or bad news, and painting it green would dress an unverified state up as up — the exact overclaim the tri-state exists to avoid. Verified in the browser in both themes.

### Notes

Tests 2,214 → 2,215.

## [1.65.0] - 2026-08-08

### Added

- **The header's status light is now a link to the status page, with a tooltip naming what "online" is actually claiming.** The one always-visible signal on the site was informational only; now it goes where its own message points ("degraded — see status"), and hovering or keyboard-focusing it lists every system behind the verdict — Database, Document audits (qpdf), PDF/UA checks (veraPDF), Web-page audits (Chromium), Nightly backup, Disk space — each with a glyph **and a word**, never colour alone (WCAG 1.4.1).

  `/api/health` gains a `systems` array carrying those per-system states. Three states, honestly: up, down/stale/low, and **"not yet checked" / "never recorded"** for anything not established — an engine `/status` has never probed, a backup that has never run. Claiming "up" about a system nothing has verified would be an unverified claim on the one signal visible on every page. The `degraded` list is derived from the same array, so the dot's colour and the tooltip's contents are structurally incapable of disagreeing, and the load-bearing "never triggers an engine probe" property is unchanged and still pinned.

  The tooltip is a real on-page element, not a `title` attribute — `title` needs a ~1s mouse hover, never appears on touch, and is silent to screen readers (the same reasons the "Don't Panic" chip dropped it in v1.37.5). It opens on hover **and** keyboard focus, Escape dismisses it without moving focus, a fresh hover reopens it (WCAG 1.4.13), and it is wired with `aria-describedby`, so a screen reader announces the full system list as the link's description. The visible text remains the link's accessible name (WCAG 2.5.3), and the polite live region still announces state changes. The link is a plain `<a href="/status?html">` — deliberately not a `NuxtLink`, which would client-side-navigate a Nitro server route into the SPA 404 — matching every other in-site status link.

### Fixed

- **The status text itself failed contrast on the light theme.** Verifying the tooltip on both themes exposed it: the text was raw `green-500`/`amber-500`, which measured **~2:1 on the light header** — under the 4.5:1 AA floor, on what is now a link's visible name, in an accessibility tool. It now uses the theme's status tokens, and the light `--status-success`/`--status-error` values darkened one step (green-700 → green-800, red-600 → red-700) because they measured **4.46:1 and 4.3:1 on the hover surface** (`--surface-raised`) — the same lesson as v1.60.0: measure on every surface the colour is actually painted on, not the one that comes to mind. A test now computes contrast for the tooltip's text and the status text against both the resting and hover surfaces, in both palettes, straight from `main.css`.

### Notes

Tests 2,193 → 2,214. Verified live in the browser in **both** themes: screenshots with the tooltip open, keyboard focus → open → Escape → dismissed → reopen, the accessibility tree showing the full system list as the link's description, and the click-through landing on `/status?html`. Sabotage-verified: removing the tooltip's role, un-wiring Escape, swapping the measured surface token, and paling a light token each fail their test.

## [1.64.0] - 2026-08-08

### Added

- **The security-audit record is complete: every release since v1.18.0 now has an entry in both places it belongs.** 27 releases had no § 10 entry on the data-retention page and 29 had no README § Security entry — overwhelmingly the small follow-up corrections (v1.24.x, v1.30.x–v1.32.x, v1.37.x, v1.41.x–v1.42.x, and the v1.58.x–v1.62.0 runs of 2026-08-07/08). Each has been written from that release's own changelog: § 10 in plain language for the non-technical reader the page is written for, README § Security in technical framing.

  **They are marked, not backdated.** Every backfilled entry carries *"entry recorded 2026-08-08"*, and both surfaces explain why in their own introduction. Those releases were reviewed at the time; this write-up of them was not. A compliance record that quietly presents a reconstruction as contemporaneous is worth less than one that says which of its entries were written after the fact — and an auditor cares about exactly that distinction.

  Two entries are worth calling out as deliberate. **v1.58.1** records an attempt that *failed* — relabelling the score instead of changing it, replaced the same day — because a failed attempt is part of the honest history of how the scoring was corrected, and because the lesson it produced ("any figure out of 100 beside a letter grade is read as the grade") is the one that settled the design. **v1.58.0**'s existing § 10 entry describes the *final* rule rather than the letter-cap it actually shipped; the README entry for it now says so explicitly rather than leaving the two records to disagree.

### Changed

- **`securityAudits.test.ts` now asserts completeness, not just the release in hand.** The v1.63.2 check — does the shipping version have an entry? — could not tell you anything about the archive behind it. Now that the archive is intact, that is worth pinning: every version in `CHANGELOG.md` at or above 1.18.0 must appear in § 10 **and** in the README's Review history, and the "recorded after the fact" markers must still be present. Sabotage-verified by deleting a mid-history entry from each and by stripping the markers.

### Notes

Tests 2,190 → 2,193.

## [1.63.2] - 2026-08-08

### Changed

- **§ 10 of the data-retention page — the security-audit history — is now data plus one renderer.** It was 3,273 lines of hand-written markup: 65 `<article>` blocks of ~46 lines each, 536 duplicated class attributes, and the same card copied and re-edited for every release. The entries now live in `apps/web/app/data/securityAudits.ts` (781 lines of prose in a typed structure) and the component is 161 lines. Adding a release is a few lines instead of fifty.

  **No record changed.** Verified by rendering the old component and the new one and comparing the text of all 65 entries — identical, character for character, once inter-element whitespace is ignored. Two content bugs surfaced doing it and were fixed: 28 findings' follow-up notes contained inline markup and were being rendered through text interpolation (so a reader would have seen a literal `<strong>`), and three sub-headings kept a raw `&amp;`.

  **On the `v-html`.** Entries use inline emphasis mid-sentence, so their text is markup and is rendered as markup. That is safe for one reason only: the strings are authored in the repository and compiled into the bundle — the component takes no props, makes no requests, and nothing user-supplied or database-derived can reach it. `securityAudits.test.ts` makes that a checked claim rather than a comment, asserting the data contains only `<a> <br> <code> <em> <strong>`, no event handler, no `style`, no `src`, no `data:`/`javascript:` URI, and no template interpolation. Each of those assertions was sabotage-verified.

### Fixed

- **A release can no longer ship without its auditor-facing entries.** § 10 (step 4) and the README § Security review history (step 3) were both documented in AGENTS.md and neither was enforced — v1.63.1 shipped without either, which is how this was found. Tests now fail until the version in `package.json` appears in both. v1.63.0, v1.63.1 and v1.63.2 are recorded in both.

  The checks cover the release in hand, not the archive. 27 earlier releases have no § 10 entry and 29 have no README entry, mostly the v1.58.x–v1.62.0 patch runs of 2026-08-07/08; those are worth backfilling deliberately, and are deliberately not backfilled by a test that would otherwise be satisfied with fabricated dated reviews. Nothing already published is wrong — § 10's v1.58.0 entry describes the *final* scoring rule, not the letter-cap version that was corrected two patches later.

### Notes

Tests 2,177 → 2,190.

## [1.63.1] - 2026-08-08

### Fixed

- **The header indicator now reports the same verdict as `/status`.** It polled `/api/health`, which answered only *"is this process alive"* — so the one signal visible on every page could show a confident green "audit server online" while `/status` reported a stale backup, a low disk or a dead engine. It now shows an amber **"degraded — see status"** and names what is degraded in its tooltip.

  Deliberately **not** by polling `/status`: that endpoint is capped at 120/min shared *globally*, because Nitro proxies it over loopback and every browser hit arrives as `127.0.0.1` in one bucket. At three requests a minute per open tab, roughly 40 concurrent tabs would exhaust the budget, `/status` would start answering `"unknown"`, and the uptime monitor's keyword alert would go blind. Making the header prettier by disabling the alarm is not a trade worth making.

  Instead `/api/health` carries the verdict, computed from state that is **already cached** — `getHealthSummary()` never triggers an engine probe, since those spawn processes (veraPDF starts a JVM) and a header polling every 20 seconds across every open tab would make the most expensive operation on the service its most frequent one. Pinned by a test that counts probe invocations and requires zero.

- **The printable plan no longer prints a dead link on the remediation page.** Its header carried the source URL, which there points back at a job that expires — and which cannot show the original audit either, since the file has already been remediated. A dead link on a printout is worse than no link. The audit report, which is a live shareable page, still prints its URL.

### Notes

Tests 2,171 → 2,177.

## [1.63.0] - 2026-08-08

### Added

- **Printer-friendly action steps.** The workflow this tool serves is *drop a file, get a grade, get fixes* — and that last step required keeping a browser tab open while working in Word or Acrobat. The fix steps are exactly the part someone needs beside the document rather than behind it. A large button on every report opens a self-contained page in a new tab: every fix expanded, **both** routes always shown (source document *and* Acrobat, because the person holding the printout may not be the one who chose the route), the human checks, and the unexamined WCAG criteria. Print it or save it as a PDF.

  Its own renderer rather than a reuse of the HTML export: that one reproduces the whole report — score tiles, category bars, technical signals — styled dark for screen. This is the opposite document, ink-friendly and instruction-first, with page-break rules so a fix and its steps never straddle a page. No scripts, no external requests, everything escaped.

- **The same button on the auto-remediation result**, printing what the automatic fixes could *not* repair, plus the human-only checks — retitled *"What still needs fixing"* since it prints a different thing.

- **The button appears in both the Visual and Detailed views**, on the audit page and on shared reports. Someone reading the detailed report is just as likely to be the person who has to go and make the fixes.

### Fixed

- **The audit report and the remediation result no longer contradict each other about publishing.** Reported on a real file: the audit page said *"ready to publish"* while the remediation page said *"Not ready to publish yet"* — same PDF, opposite answers to the only question a non-technical author actually has.

  Two different rules were answering it. The audit report used `publicationVerdict` (a severity tally: Critical blocks, Moderate cautions); the remediation page used `grade === "A"`. On a file graded B with three Minor findings and nothing worse, those disagree. The audit page's rule survives because it is the one the grade ladder already publishes everywhere: A = nothing found, B = only minor items, C = a real problem, D/F = do not publish. Treating B as unpublishable contradicted our own scale. Both surfaces now call the same function.

  The genuine caution about auto-remediation — that machine-generated structure can satisfy a checker without being good — has **not** been dropped. It moved out of the verdict into a note shown at *every* grade, which is where it belongs: it is equally true of an A, and previously a file good enough to publish never heard it.

  A regression caught by the existing suite while making this change: delegating naively made a missing or unreadable audit report *"ready to publish"*, because a severity tally of nothing finds nothing wrong. It now **fails closed** and says the file could not be re-checked. The old grade gate got that right by accident (`null !== "A"`); it is now right on purpose.

### Changed

- **The Visual/Detailed chooser reads as buttons**, on a raised surface (`--surface-raised`) with a heavier border, so it separates from the page background instead of floating on it. The announcement banner now shares that token — one "lifted off the page" surface rather than two with the same values.

- **In-app documentation** gained a *"How a report is presented"* section covering the two views, why the choice is not remembered, the human-check list, and the printable plan.

### Notes

Tests 2,149 → 2,171.

## [1.62.0] - 2026-08-08

### Changed

- **The Visual/Detailed chooser is now a chooser, not a hint.** It was two `text-xs` labels in a small right-aligned strip above the report — and it was missed: a reader looking for the step-by-step plan could not find the control that shows it, and reported the plan as gone. A toggle nobody sees is not a toggle; it is a hidden setting.

  It now runs full width above the report in both views, asks its own question ("How do you want to read this report?"), gives each option a glyph and a sentence saying what you actually get — *"Your grade, then a numbered plan — one fix at a time, in plain language"* vs *"The full technical report: every finding, WCAG criteria and evidence"* — and marks the active view with the word **Showing** rather than by background colour alone. Colour is not available to every reader, and this is an accessibility tool (WCAG 1.4.1).

- **The remediation result page shows outstanding issues by default.** They sat behind a closed "Show outstanding issues" disclosure, so the only thing visible after a successful remediation was a green panel and a one-line count. That is the moment someone is most likely to conclude the file is finished — the count reads as a footnote next to the success. The detail is now open whenever anything remains, and collapsed only when nothing does, since an expanded empty disclosure under "No issues remain" is noise. It is still collapsible; `open` is an initial state, not a lock.

### Notes

Tests 2,141 → 2,149. The toggle's new tests pin the properties that make it *findable* rather than merely present — "it renders" was already true while it was being missed.

## [1.61.1] - 2026-08-08

### Fixed

- **Every report opens in the Visual (stepper) view, for everyone, every time.** The Visual/Detailed choice used to persist per device, so anyone who opened the Detailed view once got it for every report afterwards. Reported as *"the stepper is gone"* — a reader who had toggled to Detailed earlier met the technical view on a fresh audit, and because the action plan has only ever existed in the Visual view, the plan appeared to have been deleted. It had not; it was one click away, behind a toggle whose state nobody remembered setting.

  The preference is no longer stored at all, and the legacy `far:report-view` key is cleared from the browser on mount, so a stale "detailed" cannot linger on anyone's device. The toggle still works — it applies to the report in front of you rather than to every report you will ever open.

  The default carries the product's whole intent: the stepper is the view written for non-technical document authors, and the cost of being wrong is asymmetric. Showing it to someone who wanted detail costs one click; hiding it from someone who needed it costs them the guidance.

- **The data-retention policy's v1.54.0 entry** stated the view preference "is kept on your own device (in your browser's local storage)". True when written, no longer true. Corrected in place rather than quietly deleted, with a pointer to the change — and § 10 gains its own entry, since this *removes* one of the few things the tool kept on a visitor's device.

### Notes

Tests 2,140 → 2,141. The load-bearing assertion mounts with a stored "detailed" preference — the exact state the reader was in — and requires Visual anyway.

## [1.61.0] - 2026-08-08

### Fixed

- **The landing page's layout shift (CLS 0.104 → effectively zero).** The announcement banner rendered only after hydration, so it appeared ~250px tall above everything and pushed the heading, the drop zone and the whole page down in one 0.067 shift — essentially the page's entire CLS, and over Google's 0.1 "good" threshold.

  The cause was a deliberate trade made the wrong way round: the banner started hidden and revealed itself on mount so that a *dismissed* banner never flashed. That made every **first-time** visitor pay a layout shift to spare returning dismissers a brief flash — and a first-time visitor is precisely who the banner is written for. It now renders during SSR and only ever *hides* on mount. Measured after the change: **0.0698 → 0.0001**.

  The residual is stated rather than hidden: someone who previously dismissed an announcement sees it for a frame before it goes. Removing that too would need the dismissal readable on the *server* — a cookie rather than localStorage — which is a new piece of client-side storage on a tool that documents every one it keeps, and not worth it for a frame.

- **`scrollbar-gutter: stable`.** A page growing past the viewport gained a scrollbar mid-render, jumping every centred element left by half its width. Small (0.0023) and free to fix; no amount of content reservation could, since the cause is the viewport narrowing rather than content moving.

### Changed

- **Announcement copy is capped at four or five sentences.** Today's two entries had grown to 135 and 247 words (six and eight sentences) and dominated the page they sit above; now 95 and 123 words, four and five sentences. Shorter copy also shrinks the residual shift for dismissers — the banner is 183px tall rather than 228px.

- **The banner gets its own surface** (`--surface-announce`: `#16191f` dark, `#eef2f7` light) rather than reusing the card colour, so it reads as distinct from the page without becoming a second card competing with the report below it. Text contrast measured 11.9:1 dark and 9.2:1 light.

### Notes

Tests 2,138 → 2,140. The regression test asserts the banner is visible in its *initial* render, deliberately without `await` — awaiting would let `onMounted` run and make it pass for the wrong reason, which is exactly the bug it guards. Sabotage-verified against the old behaviour.

## [1.60.1] - 2026-08-08

### Fixed

- **`/status` rendered the disk line in five-digit megabytes** — *"61112.6 MB free of 78284.0 MB"* for a 76 GB volume. `formatBytes` had been written for the backup row, whose only values are snapshot-sized (~28 MB), and capped there; the new disk line reused it. Technically correct, unreadable, and on the page written specifically for people who do not think in megabytes. It now scales to GB and TB: *"Disk 78% (59.7 GB free of 76.4 GB)"*.

  Caught on production rather than by test, because nothing asserted a gigabyte-scale value — the formatter had only ever been fed megabytes. Three tests now cover it, including that a backup-sized snapshot does not regress into "0.0 GB".

### Notes

Tests 2,135 → 2,138.

## [1.60.0] - 2026-08-07

Clearing the four items carried since the 2026-08-05 operational review.

### Added

- **Disk-space probe on `/status`.** A full disk breaks uploads *and* the nightly backup at the same time, silently, while every other check on the page stays green — the audit path holds files in memory and the backup writes elsewhere, so neither surfaces a disk problem as its own failure. The first symptom would otherwise be a failed restore months later. The payload gains a `disk` section (free bytes, total, percent) measured on the volume holding the database, and drops below `STATUS.DISK_LOW_FREE_PCT` (10%) into `degraded` — where the existing UptimeRobot keyword alert already watches. It is a degradation, never a 503: the service can still audit with a nearly-full disk, and paging about an outage that has not happened is how alerts get ignored. `unavailable` deliberately does **not** degrade — an unqueryable filesystem is a gap in our knowledge, not evidence of a problem. **No path is ever reported**; `statusPrivacy.test.ts` now asserts the section contains no path separator at all.

- **PM2 `max_restarts` + `min_uptime`, and a log-rotation runbook** (`docs/process-supervision.md`). Both were missing. Without them PM2 restarts an instantly-dying process for ever: a bad deploy becomes a silent hot loop that burns CPU and fills the log disk while `pm2 status` shows "online" between crashes. A process that cannot stay up 20s ten times running is now marked **errored** and left down — failing visibly beats failing invisibly. Exponential backoff keeps that from being trigger-happy, so a merely-slow dependency still recovers on its own. `pm2-logrotate` is a server-side module the repo cannot install, so the runbook carries the exact commands and the `pm2 save` that makes them survive a reboot.

### Fixed

- **Light-mode contrast on the grade and severity palette.** The colours are tuned for the dark UI (5.3–10.3:1). On the light theme the same colours measured **1.9–3.8:1 — every one of them below the 4.5:1 WCAG AA floor**, in a tool whose entire purpose is catching exactly that. Worst was Moderate yellow at 1.92:1.

  One palette cannot serve both backgrounds, so there are now two, selected by `useTokenColors()` from the active theme. The light values clear AA against **all three** light surfaces — a detail that mattered: yellow-700 passes on white and the body surface but lands at 4.47:1 on `#f3f4f6`, caught by test rather than by eye, which is why the test measures every surface rather than the one that came to mind.

  The obvious implementation — emitting `var(--grade-a)` and letting CSS choose — was built and rejected: these colours are consumed through inline `:style` bindings, and the test DOM drops any inline style containing `var()` or `color-mix()` **entirely**, which would have blinded every colour assertion in the suite. Deriving the hex in JS keeps the tests real.

  Along the way this removed two hard-coded copies of the palette (`BatchProgress.vue`, `my-history.vue`) that had drifted out of shared entirely — the reason those two surfaces would have stayed unreadable even after a CSS-only fix — and replaced 13 hand-written hex-alpha suffixes across 8 files with `withAlpha(color, percent)`.

- **A WCAG 2.5.3 Label in Name violation**, found by re-running Lighthouse: the announcement banner's "See all updates" link carried the accessible name *"See all previous announcements"*, so a speech-input user saying the visible words matched nothing. It was the site's only accessibility failure.

- **README's Lighthouse figures**, which claimed "95+ accessibility" and predated the v1.54 report redesign. Re-measured against production: **Accessibility 100, Best Practices 100, SEO 100, Performance 97.** The old figure was *understating* the real number — the less common way for a stale claim to be wrong, but stale either way. The remaining performance gap (CLS 0.104) is recorded rather than quietly dropped.

### Notes

Tests 2,099 → 2,135. The new `colorTokens.test.ts` measures both palettes against the surfaces they are actually painted on, asserts the two stay parallel, and includes a deliberately non-vacuous check that the *old* single palette really did fail — so the file cannot quietly start passing if the thresholds or surfaces drift.

## [1.59.2] - 2026-08-07

### Changed

- **The human-in-the-loop statement is now unconditional.** The manual-review card previously rendered only when it had passing checks or unassessed criteria to list — so a badly-failing document, the case that most needs a person, could get no such statement at all. Every report with categories now opens that card with a standing line, independent of the score: *"No automated audit — this one included — can tell you a document is accessible. It can only tell you where it definitely is not. Whatever the score, a person has to look at the document before it is published."* A document that still has findings additionally gets told that clearing the action plan is not the finish line, since a fixed plan is a stronger pull toward "done" than a 100 ever is.

- **`/status`: "Checking engines" → "Audit engines"**, and each engine now carries a plain-language description written for the page's actual audience. The people who open a status page are rarely developers; they are managers arriving sceptical — *what is this thing, and is it really doing what you say?* So each entry says what the program is, who maintains it, what it does here specifically, and what its running does and does not prove: qpdf reading the tag tree every PDF finding traces back to, veraPDF as the externally-maintained ISO 14289-1 validator that stops this being the tool marking its own homework, Chromium loading a page the way a visitor's browser would and never touching an uploaded file.

- **`/status` states its own freshness.** The always-visible strip now carries the moment the page was generated ("as of Aug 7, 2026, 4:30:00 PM CDT"). Both tiers already send `Cache-Control: no-store` and the counts behind the page have a 5-second TTL, so it was live — but a reader had to take that on trust, and a proxy quietly ignoring `no-store` would have been invisible. The one genuine exception is now stated where it applies rather than hidden: the engine probes are cached for `STATUS.ENGINE_PROBE_TTL_MS` because each spawns a process (veraPDF starts a JVM), so the engines card reports when its reading was actually taken.

### Notes

Tests 2,095 → 2,099. The whole-document "prose bounded" assertion was refocused rather than raised: it measured hidden text, so it failed the moment the engine descriptions landed, and deleting them to satisfy it would have been the tail wagging the dog. Its real intent — *a reader must not meet an essay* — is now measured outside the collapsed card bodies, which is all anyone sees on arrival, with a companion assertion that the explanations are genuinely present so the test cannot pass on a page that threw them away.

## [1.59.1] - 2026-08-07

### Fixed

- **The manual-review checklist reaches the Detailed view too.** v1.59.0 wired it into the Visual view only, while also changing ScoreCard's copy to point at "the manual-review list" — which, in the Detailed view, did not exist. Worse, `IssuesSummary` is `v-if="rows.length"`, so a document with no findings rendered **nothing at all** below the hero on that view. A reader's honest reaction was *"where are the findings?"*.

  The card now renders on all three report surfaces — the Visual view, and the Detailed view on both the audit page and the shared-report page — and a source-scan test pins each one, including that both `categories` and `conformance` are passed (without the verdict, the "not checked at all" half silently disappears, which is the half a perfect report most needs).

  The card reads its own WCAG version rather than taking it as a prop, since neither page had a binding to thread through.

### Notes

Tests 2,091 → 2,095.

## [1.59.0] - 2026-08-07

### Added

- **"Still worth checking by hand" — a real checklist on every report, including perfect ones.** A document scoring 100 got an empty action plan and a one-line green card listing bare criterion numbers, which left its author with the obvious question: *what should I still look at?*

  The honest answer is that these checks confirm accessibility structure **exists**; almost none can judge whether it is **correct**. Alt text of "image" passes. A heading that describes the wrong section passes. A reading order tagged in the wrong sequence passes if it is tagged at all. That gap is invisible on a clean report unless the report names it — so now it does.

  Every check that **passed** contributes an entry: what the automated check actually established, and the judgment only a person can make, phrased as something to go and do ("Read each description and ask whether it tells someone who cannot see the image what the image is doing there — 'image', 'logo' and a filename all pass this check and convey nothing"). Failing checks are deliberately absent; they are already the action plan. Below that, the WCAG criteria this tool does not evaluate at all are listed by name with links to their W3C pages, stated plainly as unexamined rather than failed.

  The card sits directly under the action plan, so on a clean report it is the first substantial thing the author reads. The plan's pass card now hands off to it instead of printing SC numbers, and the hero stops saying "fix the steps below" on a document with no steps.

### Notes

Tests 2,078 → 2,091. A completeness test asserts every scoring category that can pass has a prompt, so a category added to the profile later cannot silently vanish from an author's checklist; another asserts each prompt names a concrete action rather than restating the check it came from.

## [1.58.4] - 2026-08-07

### Fixed

- **Already-shared report links now recompute under the current scoring rule, not just the severity ceiling.** Found by verifying v1.58.3 on production: a shared link to `Public Notice of Meeting.docx` served **71 / C** while re-uploading the identical file gave **79 / C** — precisely the "an old link and a fresh audit disagree" problem that regrading on read exists to prevent.

  The cause was that `regradeStoredReport` only applied `capScoreBySeverity`, which is a one-way ceiling. It could pick up v1.58.0 and v1.58.2 (which only ever *lowered* a score) but was structurally incapable of picking up v1.58.3, which *raised* simple documents by counting inapplicable checks as passing.

  Stored reports carry every input the calculation needs — per-category `score`, `weight` and `notAssessed`, plus `isScanned` — so the raw score is now re-derived from them under current rules and the ceiling applied afterwards. Both guards travel with it: `notAssessed` categories stay excluded, and a stored scanned report scores 0 regardless of how its categories look. Where a row cannot support a recompute (a missing or malformed weight, a much older build), it falls back to capping the stored number so it still gets the ceiling rather than nothing.

  **Note this can now raise a stored score** — that is the point, and it is what makes an old link agree with a fresh audit. The severity cap applied afterwards remains one-way.

### Notes

Tests 2,075 → 2,078. The regrade fixture was replaced with the **real** production payload of the report that exposed this; the previous two-category stub recomputed to a different number and would not have caught it. Added cases pinning the `notAssessed` exclusion and the scanned guard on the stored path specifically, since it is a separate code path from a fresh audit.

## [1.58.3] - 2026-08-07

### Fixed

- **A document is no longer penalized for being simple.** Checks that don't apply now count as **passing** and stay in the denominator, instead of being dropped from it. A document with no tables does not have a table-markup problem — it has no tables.

  Reported from the field, on two Word files: a one-page public notice and a longer meeting agenda, both missing a document title and nothing else in common. The notice scored **71** and the agenda **79** — the notice *worse*, despite having strictly **fewer** findings (the agenda also had a minor heading issue). The cause was the original renormalization behaviour: only 3 of the notice's 10 categories could be checked at all, so its single fault was **58%** of its whole score, while the agenda's faults were spread across 7 checks and diluted to 20%. Capping first the letter (v1.58.0) and then the score (v1.58.2) had corrected the ordering of the *letters* while leaving the *numbers* inverted. **Both files now score 79 / C** — same worst finding, same result.

  Two guards, both found by test rather than by argument:
  - **`notAssessed` categories are still excluded** from the denominator. A null score means two different things and the reports already distinguish them: *"no tables were found"* (not applicable — nothing to fail) versus *"contrast could not be resolved in this version"* (not assessed — we don't know). Scoring the second as a pass would be an unverified claim.
  - **A scanned document still scores 0.** Its categories come back null because there is no extractable content to check, which is the opposite of "nothing wrong" — a screen reader gets nothing at all. Without the guard the scanned fixture scored **55**; the existing "overall score is 0" test caught it and now carries a note saying why it is load-bearing.

  Corpus impact: 2 of 31 grades change, both **F → D** on documents where fewer than half the checks applied. Both still carry Critical findings, are still capped at 69, and still read "do not publish". Nothing moves up into A or B.

### Notes

Tests 2,074 → 2,075. Distribution across the 31 controls: A:6 B:3 C:8 D:9 F:5.

## [1.58.2] - 2026-08-07

### Fixed

- **The severity cap moved from the letter grade onto the score, so the published scale holds again.** v1.58.0 capped the *letter* at the document's worst finding and left the weighted average alone, which severed the two: a report headline read `D` above `80/100`. Reported twice — *"a 'D' is not 80"*, then *"80 and above is a B. Not a C, and certainly not a D."* On the scale this tool publishes (90 = A, 80 = B, 70 = C, 60 = D, below that F) the report was wrong on its face.

  v1.58.1 tried to solve it by relabelling the number as "Fix progress"; that failed for the same reason, and a reader read "81 of 100" as a percentage grade within minutes. **Any figure out of 100 beside a letter grade is read as the grade.** The number itself had to change, not its packaging.

  The cap now lowers the **score** — Minor to 89, Moderate to 79, Critical to 69, ceilings *derived* from `GRADE_THRESHOLDS` so they cannot drift from the published bands — and the letter is derived from that score exactly as it always was. Every contradiction v1.58.0 fixed stays fixed: across the 31-document control corpus the grade distribution is byte-identical to the letter-cap version (A:6 B:3 C:8 D:7 F:7), with the two Word files sharing the same defect landing on the same letter and the two PDFs with the worse defect ranking below them. What changes is that 69 is now a D, 79 a C, and 71 a C — each by the same rule anyone reading the page already knows.

- **The four documents that drove this are now permanent controls.** Checked into `controls/`, bringing the corpus to 31.

### Added

- **`scorer.test.ts` gained THE INVARIANT test**: a real audit's grade always equals `gradeForScore(overallScore)`, for the document and for both published score profiles. Nothing in the suite tied the score to the letter, which is why v1.58.0 shipped green; sabotage-verified by re-introducing that exact bug, which the test catches with "score 92: expected 'C' to be 'A'". `severityGradeCap.test.ts` carries the same invariant as an exhaustive sweep over all 101 scores × 4 severities.

### Notes

Tests 2,069 → 2,074.

## [1.58.1] - 2026-08-07

### Fixed

- **The score is no longer presented as a peer of the letter grade.** v1.58.0 capped the letter at the document's worst finding but left the raw score rendering in bold directly beneath the grade circle, so a report headline read `D` above `80/100` — reported immediately, and verbatim: *"a 'D' is not 80."* That was more confusing than the contradiction the cap had just removed.

  The two now answer different questions and are shown as different things. The letter is the verdict. The number moves into a labelled **Fix progress** panel — `80 of 100`, a bar, and one sentence — sized as supporting detail, because progress across re-audits is the job the weighted average was always good at. Where the grade is capped, that sentence reconciles the two in the place the number actually appears ("How much of the automated checking already passes — but a critical issue is still open, and the grade follows the worst issue rather than the average. On the score alone this would be a B."); where it isn't, there is nothing to reconcile and the panel just says what it measures. Both report views changed identically, or switching views would have become its own contradiction.

### Notes

Tests 2,068 → 2,069. Three tests asserting the literal `/100` suffix — two of them predating this work — correctly went red and now pin the new form; `reportVisualView`'s DOM-order test had anchored the hero on `"/100"`, which after the change first matched inside the technical report far below, so the marker was pointing at the wrong element.

## [1.58.0] - 2026-08-07

Two contradictions the tool was showing to the people it exists to help: a grade that could rank a worse document higher, and a backup that looked like it contradicted "your file is never stored".

### Changed

- **The letter grade is now capped by the document's worst unresolved finding** — Minor caps at B, Moderate at C, Critical at D (F if the average is also failing). The weighted average still decides where a document sits *within* a band; the worst finding decides which band it can be in.

  Reported from the field: two shared reports "both have document title issues but look to be graded differently". They did. Renormalizing away inapplicable categories has two consequences, both confirmed against a 31-document corpus:

  1. **A single failure dominates a sparse document and is diluted in a rich one.** Two Word files with the *identical* defect — no document title, language present, Title & Language scoring 50/Moderate in both — graded **B (87)** and **C (71)**, because one had 7 of 10 applicable categories to average against and the other only 3. Same fault, different letter.
  2. **Four perfect categories outvoted one catastrophic one.** Two PDFs missing *both* title and language (0/Critical, two WCAG failures each) graded **B** — above the Word file with strictly the milder defect. Corpus-wide, 4 documents held an **A** while carrying an unresolved Moderate and 2 held a **B** while carrying a Critical.

  An averaged score cannot express "one thing here is disqualifying", but accessibility conformance is pass/fail per criterion, not a mean. The letters now carry a rule that fits in one sentence for staff deciding whether to publish: **A = nothing found · B = only minor items · C = a real problem to fix · D/F = do not publish.** Grade and publication verdict are now structurally incapable of disagreeing — the reported symptom was that ranking documents by letter gave the opposite of the truth. 11 of the 31 corpus documents change grade, all downward. The cap only ever lowers, never raises, so a poor average keeps its worse letter.

- **Already-shared report links self-correct.** The cap is a pure function of a report's own stored category severities, so the API applies it when *serving* a stored audit (shared reports and both remediation audits) rather than migrating the database. Stored rows stay byte-identical — they are an agency's evidence of what was computed on the day — while a link shared last week no longer disagrees with the same document re-audited today. The stored executive summary is regenerated rather than string-patched, because it *branches* on the grade: swapping the letter inside stale prose would leave the sentence arguing against its own grade.

- **Both report views explain a capped grade in place.** "Held at C by a moderate issue. The 87 average on its own would be a B — but the worst unresolved issue sets the grade." Shipping a C beside an 87 with no explanation would have traded one contradiction for another.

### Added

- **The `/status` backup card answers "why back up anything if nothing is stored?"** — asked by a real reader, and a fair question when the tool promises your file is never saved and then announces a nightly backup. The card now carries a ✓/✗ split of what a snapshot contains (one line per audit; sign-in emails; saved and shared reports; the routine connection log) against what it cannot (the document itself, its pages, anything a readable copy could be rebuilt from), then the resolution: the *document* is never saved, the *record* that it was checked is, and that is what the backup copies. The collapsed peek reads "of records, not documents" so a reader who never expands it does not read "28.0 MB" as 28 MB of files.
- **Data-retention § 7a, "Why anything is backed up when documents aren't stored"** — the same answer drawn as two side-by-side lanes, one ending in *discarded*, one in *backed up*, listed in the table of contents and linked from the status card.

  Both surfaces deliberately state what the records **do** carry — a sign-in email, the IP/user-agent connection log, and the file name as uploaded (a file named after a person stores that name). "Contains no personal data" would be false, and being caught on it once would discredit the rest of the policy.

### Fixed

- **The landing page advertised a severity level that does not exist** ("Critical / Serious / Moderate"). The scorer emits Critical / Moderate / Minor and always has — an invented fourth level on the page whose job is explaining what the grades mean.
- **Reading-order and contrast "not assessed" notes called every document a PDF.** Both render on Word, PowerPoint, and Excel reports too, where "this PDF" is simply wrong to the person reading it. Observed on a `.docx` report while verifying the grade cap.
- **`TechnicalExplainer` said the database "is not replicated to external storage or backup services"** — true as written, but it reads as *no backups at all*, which stopped being the case in v1.49.0.

### Notes

Tests 2,027 → 2,068. The two scorer tests that went red on the cap had encoded the behaviour it removes (a high average outranking a real finding) and were rewritten to assert both halves. The cap, the render-time regrade, and both explanation notes were each sabotage-verified; a premise guard in the new ladder tests caught a fixture that scored Moderate while claiming to test the Minor rung. The four documents that triggered the change are pinned by name, so a future change that re-inverts them fails with the original complaint spelled out.

## [1.57.0] - 2026-08-07

Follow-through on the adversarial review: the gaps it found in the safety net, and a status page that tells an operator how bad it is.

### Added

- **The `/status` HTML view gained a "Checking engines" card** listing each engine's state, version, failure reason, and — in plain words — what stops working without it. It opens itself whenever an engine is down. Previously a broken qpdf (nothing can be audited at all; the endpoint returns 503) rendered exactly like a broken Chromium (page audits only), so a reader could not tell an outage from a minor degradation without expanding the raw JSON and knowing which engine was which. The status strip now says **"Outage — document auditing unavailable"** for a core failure instead of the same amber "Degraded" it shows for everything else.
- **A contract test against real analyzer output.** `apps/web` imports nothing from the analyzer and every web test ran on hand-typed fixtures, so a renamed field or a changed severity string would have been caught by the API suite while the web suite stayed green and the UI broke. One real pipeline result is now captured as a fixture, the invariants the UI actually switches on are pinned (each cited to the component that consumes it, with the severity set checked against the live thresholds), and `ReportVisualView` is mounted against it so a field rename breaks a render rather than a schema assertion.
- **Prop-wiring tests for both report pages.** Changing `:result="data.report"` to `:result="data"` would have shown every visitor a blank hero while all 1,998 tests passed — no test referenced those bindings at all. They are now pinned at the source and by mounting the real page (inside a `Suspense` host, since its top-level `await useFetch` compiles to an async setup); both were verified by sabotage before being trusted.

### Changed

- **The raw status payload is now open by default** in the HTML view, while the interpretive cards stay folded. Operators and monitors come to this endpoint for the JSON; it should not cost a click.

### Fixed

- **"Evidence & technical detail" now moves focus, not just the scrollbar.** It scrolled the matching category card into view but left focus on the button, announced nothing, and sent the next Tab press back to the old position — on the exact path built for non-technical readers, in an accessibility tool. The cards are now focusable targets and receive focus without fighting the smooth scroll.

### Notes

Tests 1,998 → 2,027. Two of the new tests were confirmed to fail when the fix they cover is reverted, because a test that cannot fail is worse than no test — one of them caught that happy-dom does not gate `focus()` on `tabindex`, which would have left half the focus fix unverified.

## [1.56.0] - 2026-08-07

A whole-app adversarial review — six reviewers over UX, security, docs, ops, code health and test architecture — and the fixes it produced.

### Fixed

- **The grade and its publication verdict could contradict each other.** The grade is a weighted average; the verdict beside it was a raw severity tally, so a single Critical in a low-weight category (bookmarks at 39, everything else perfect) still averaged to an "A" and the report read **"Excellent — not ready to publish" in reassuring green**. Now the blocker leads on its own and counts itself — "Not ready to publish — 2 critical issues", coloured by severity — while moderate and clean results keep the familiar "Good — fix recommended before publishing" shape. The grade letter is unchanged and still tells the truth. The downloaded HTML report composes its hero identically, so an export can never contradict the screen.
- **A forged shared report could permanently break its own page.** Two long-standing gaps — a non-string entry inside a category's `findings[]`, and an array-like object forged into `scoreProfiles.strict.categories` — threw during render, returning HTTP 500 on every visit to that report's link. Both are fixed in the shared utilities, so the classic Detailed layout (which crashed identically) is protected too. No other report was ever affected.
- **The remediation page never listed Minor findings.** It filtered for a severity value, "Serious", that has never existed in the taxonomy, leaving that section permanently dead. Outstanding issues are now listed Critical → Moderate → Minor.
- **Two "No source file? Fix the PDF in Acrobat" routes told readers to go fix the source file** — the one thing that reader just said they don't have. Colour contrast and link quality now carry an honest "Only fixable in the source document" label and a straight answer.

### Changed

- **Acrobat steps now say Acrobat *Pro***, because every one of them routes through Pro-only menus that free Reader does not have.
- **Plain-language glosses at first use** for "structure tags", "OCR", and the raw tag names in the table and list steps — each fix step can be the only one a reader sees, so each explains its own jargon.
- **The "not scored" explanations no longer leak implementation detail** into the default view ("MCID fidelity check", "not yet implemented"); they lead with what the reader should do instead.
- Accessibility of the new report UI: `role="list"` on the three list-style-none containers (Safari/VoiceOver drops list semantics otherwise), "Step N of M" announced on action-plan steps whose numbers are decorative, and a real heading on the "Full technical report" trigger so heading navigation no longer skips the section.
- **The publish-readiness gate is now executable code with tests.** It previously existed only as page markup whose sole coverage was a source-text grep — a change could have inverted the ready/warning banner while every test stayed green.
- **CI gates formatting**, `rebuild.sh` preflights the Node version, and `apps/cli`, `packages/analyzer` and `packages/shared` rejoin the version line (the CLI's `--version` had reported 1.34.0 for 21 releases).

### Notes

Documentation corrections: a README bullet still advertised a "Recommendation card" removed in v1.21.0; the shared-report list described Detailed-view content as if it were the default; the backup runbook documented an 08:00 UTC cron for a job that runs at 00:00 UTC. Tests 1,973 → 1,998.

## [1.55.0] - 2026-08-07

The status page now opens as five one-line cards instead of a wall of tables.

### Changed

- **Every section of the `/status` HTML view is now a collapsible card, collapsed by default** — grade distribution, format split, refused uploads, the backup row, and the raw JSON tree. Each card's summary carries its headline fact as a right-aligned peek ("4,143 documents all-time · 12 in the last 24 h", "✓ 13.6 h ago · 28.0 MB"), so a collapsed card still answers its question without a click.
- **An always-visible status strip** sits above the cards: a colored pill (green "All systems normal" / amber "Degraded" / red otherwise), the version, humanized uptime, and the degraded list when present — the at-a-glance answer that must never hide behind a fold.
- **A stale backup card pre-opens.** The one card state that demands attention arrives expanded; healthy and never-run states stay compact.

### Notes

Still zero JavaScript — collapsing is native `<details>/<summary>`, keyboard-accessible, invisible to the CSP. The machine contract is untouched: the JSON body, the negotiation rules (`?json` monitor URL, wildcard-Accept → JSON), and the top-level key allow-list are byte-identical, so UptimeRobot's keyword alert is unaffected — all 67 pre-existing renderer tests pass unmodified, 12 new ones pin the folds and the strip. Tests 1,961 → 1,973.

## [1.54.1] - 2026-08-07

The remediation result now hands you the file with its verdict attached.

### Changed

- **The remediated-file download moved inside the "After Remediation" card.** The card now reads top to bottom: grade, score comparison and per-category explanation, then the download controls (filename recommendation and options unchanged) — instead of a separate download section below both cards.
- **A grade-driven readiness banner sits above the download.** Anything below an A carries an explicit warning that the auto-remediated file still has issues to fix — ideally in the source document — before publishing, absorbing the old blanket manual-review note. A grade-A result gets a "ready to publish" confirmation with a short nudge to spot-check alt text for accuracy, since automated checks verify presence, not meaning. The banner derives its grade exactly the way the score card above it does, so the two can never disagree.

### Notes

Presentation-only change to the remediation results page; the remediation pipeline, downloads, and API are untouched. Tests 1,956 → 1,961 (new source-inspection suite pinning the placement and the grade-A gate).

## [1.54.0] - 2026-08-07

The audit report now leads with a visual, plain-language view built for non-technical document authors — with the complete technical report one toggle away.

### Added

- **Visual report view (new default).** Both the live result and the shared report page open in an infographic-style layout: an oversized grade circle with the score and a plain-English verdict ("Poor — not ready to publish"), color-coded severity count tiles, a one-line WCAG 2.2 AA verdict strip, and a numbered **action plan** that orders fixes by severity — one step open at a time, each with big visual step numbers and plain-language instructions for the source document (Word / PowerPoint / Excel) plus, for PDFs, an Acrobat route drawn from the report's own findings where available. The remediation button stays available in the new view for eligible PDFs.
- **Visual / Detailed toggle.** The upper right of every report switches between the new view and the exact report layout that shipped before this release — nothing was removed, and the preference persists per device. The Detailed view is byte-identical to v1.53.0.
- **"Where the score comes from" bars** carry the score table's full data in the Visual view — score, grade, and severity per category, with the not-scored explanations beneath.
- **Full technical report expander** collects the WCAG criteria detail (with W3C links), executive summary, audit-scope caveat, detailed findings and evidence, PDF/UA checks, methodology, and document metadata behind a single control — full data parity with the Detailed view.
- **The downloaded HTML report mirrors the Visual view**: severity tiles, the verdict phrase, and the ordered action plan now open the file, every legacy section retained; the snapshot exporter forces all accordion steps visible so the download never hides content. Print styles expand everything and keep the tile/bar colors on paper.

### Fixed

- URL page audits (stored in the same shared-report table) can no longer render a false "nothing to fix" card or a blank score in the new view — category-less reports show the grade hero only, and the hero falls back to the page-audit score field.
- The action-plan rail and step badges meet WCAG AA contrast in dark mode, verified with a live contrast audit during development (105 checks passing).
- Legacy shared reports from before v1.21 now derive the same strict-profile grade, score, and categories in both views — the toggle can no longer show two different scores for the same report.

### Notes

Web-only change: no analyzer, API, or database modifications, so previously shared reports get the new view with no migration in either direction. Rollback is layered: the Detailed view itself (one click, always available) and the `pre-report-redesign` git tag. Tests grew **1,879 → 1,956** (web 679 → 756, 9 new test files); lint, typecheck, build green.

## [1.53.0] - 2026-08-05

Every technical code block on the explanatory pages is readable again — and the technical-details page got the full treatment.

### Fixed

- **Twelve mangled "code blocks" converted to real `<pre>` elements.** The schemas, ASCII pipeline flows, auditor SQL queries, sample JSON, the regression-guard snippet, and the deploy commands were rendered inside `whitespace-pre` styled divs. Prettier preserves genuine `<pre>` content but reflows div text, so every format pass re-wrapped these blocks into single horizontally-scrolling lines — worst in the deploy snippet, where shell comments merged into commands. Real `<pre>` elements are whitespace-safe by construction; all blocks were hand-restored to their intended multi-line form, color-coded (sky = structure/SQL keywords, emerald = tools and success events, amber = deletions/guards, purple = types and event names, muted = comments), and given `tabindex="0"` so keyboard users can scroll them.

- **The § 6 schema display had drifted from the real database.** Restored from `migrations.ts` verbatim: the displayed `remediation_jobs` gained the `original_filename` column (added v1.48.0) and shows the real `CHECK` status constraint instead of a comment.

### Added

- **Four new detailed blocks on `technical-details.vue`**: the full audit pipeline (memory-only buffer → per-format dispatch with all three PDF engines → scorer), a worked scoring example showing exactly how weights renormalize when categories don't apply (6525 ÷ 80 = 81.6 → 82, grade B), the structure-tree DOM of a tagged PDF, and the four-stage remediation flow with every delete-and-verify checkpoint marked.

### Notes

Zero-dependency by choice: coloring is inline spans with theme tokens, not a highlighter library — the CSP carries no third-party script and the build gains no weight. The one remaining `whitespace-pre-wrap` (dynamic failure text on the job page) is correct as-is. Tests unchanged at 1,879; lint, typecheck, build green.

## [1.52.0] - 2026-08-05

A silently dead backup job now pages someone.

### Changed

- **A stale backup joins the `/status` `degraded` list.** Since v1.50.0 the page *showed* the last successful backup; now a backup older than `STATUS.BACKUP_STALE_AFTER_HOURS` (30 — nightly cadence plus slack) also appends `"backup"` to `degraded` and flips the payload to `status: "degraded"`, which the uptime monitor's existing keyword alert matches with no monitor-side change. Deliberately unchanged, both pinned by test: `"unavailable"` (no backup has ever completed — the expected state of a fresh deployment) still does not degrade, and the backup can never contribute to `isCoreFailure`, so an overdue backup cannot turn `/status` into a 503 — the service keeps auditing either way.

### Notes

Residual, accepted and documented in the code: deleting `last-backup.json` demotes "stale" to "unavailable" and silences the signal; a live nightly job rewrites the file within 24 hours, so only the compound failure — file gone *and* job dead — stays quiet. The announcement banner is deliberately untouched (monitoring internals, not visitor-facing). Tests 1,877 → 1,879 (API 1,149 → 1,151); lint, typecheck, build green.

## [1.51.1] - 2026-08-05

Documentation release: the backup arrangement is now stated in the standing docs, in general terms.

### Changed

- **README § Security gains a standing "Nightly database backups" posture bullet** — nightly cadence, integrity checks, the five-newest rotation, general location (on-server, beside but outside the application, unreachable from the web), `/status` visibility, and the drill-tested restore path — so the guarantee no longer lives only in per-release history entries. AGENTS.md's repo map now lists `scripts/backup-db.sh` / `restore-db.sh`.

- **Public surfaces no longer print the literal backup directory.** The data-retention § 7 row and the README v1.50.0 entry described the exact location; both now say what a reader actually needs — that snapshots are on the same server, in a dedicated directory beside but outside the application, unreachable from the web. The operator runbook (`docs/database-backups.md`) deliberately keeps exact paths (its commands must be copy-pasteable), and CHANGELOG history is left as written.

### Notes

No code, test, or behavior change; tests unchanged at 1,877. The announcement banner is deliberately untouched — the standing Privacy banner from v1.51.0 already covers backups and shared-report deletion.

## [1.51.0] - 2026-08-05

Shared reports are now actually deleted, and retention no longer hangs off a feature flag. Closes findings #2 and part of #5 from the 2026-08-05 operational assessment.

### Added

- **Cleanup sweep step 8: physical deletion of expired `shared_reports` rows.** `SHARED_REPORTS.EXPIRY_DAYS` (365) has always disabled the link; nothing ever deleted the row, so the table — up to 1 MB of `report_json` per row, written per-file by four paths — grew without bound, and the config comment's "eligible for cleanup" described a cleanup that did not exist. Rows are now deleted once `PURGE_GRACE_DAYS` (30, new config) past expiry.

  **The grace window is the design decision worth recording.** The read gate deliberately answers `410 — This report link has expired` while the row exists: a visitor with a year-old link learns their link was real and aged out, rather than getting a bare `404`. Purging at the moment of expiry would erase that distinction for everyone; a 30-day grace preserves it for the realistic window in which an expired link still gets clicked, then lets the row — and the document-derived strings § 8a documents inside `report_json` — disappear for good. Total stored lifetime: ≈395 days, now stated exactly in the policy (§ 7, policy v1.4). Dedup lookups are unaffected by construction: they already filter to unexpired rows.

### Fixed

- **The retention sweep no longer stops when the remediation feature is off.** `startCleanupInterval()` early-returned when `REMEDIATION.ENABLED` was false — reasoning that predates v1.20.1, when the sweep was purely remediation housekeeping. Ever since, the audit_log purge, the revoked-token backstop, and (as of this release) the shared_reports purge all lived behind that gate: turning the feature off — or restarting PM2 from a shell that never sourced `/etc/environment`, which defaults the flag off — would silently reduce every periodic purge to "once per process restart." Never active in production (the flag is on), but latent, and exactly the kind of coupling that fails years later. The sweep now schedules unconditionally; the remediation-specific steps are cheap no-ops when the feature is off, and a test runs the interval with the flag disabled to hold the line.

### Notes

The sweep does not `VACUUM`: deleted pages are reused by SQLite for future inserts, so the purge bounds *growth*, which is the actual problem — shrinking the file would take a lock better scheduled by an operator than a 5-minute timer. Revisit only if disk pressure ever appears. Tests 1,874 → 1,877 (API 1,146 → 1,149); lint, typecheck, build green.

## [1.50.0] - 2026-08-05

The status page now answers "did last night's backup run?" — remotely, without SSH.

### Added

- **A `backup` section on `/status`,** read from the `last-backup.json` that the backup job writes only after a snapshot passes its integrity check: completion time (UTC + Chicago), age in hours, snapshot size, and the usage-log row count it contains. Rendered on the HTML view as a **Last successful backup** row; `"unavailable"` (with plain-words copy, not an alarm) until the first scheduled run completes; `"stale"` once older than `STATUS.BACKUP_STALE_AFTER_HOURS` (30 — nightly cadence plus slack).

  Privacy posture: the source file carries two absolute server paths; neither crosses into the payload, asserted by a unit test and by the page-wide privacy suite, whose top-level allow-list gains the one key deliberately. Deliberately **not** in the `degraded` list, so enabling the feature cannot trip the uptime monitor's keyword alert before the first backup has ever run; promoting `stale` into `degraded` is the intended follow-up once the cadence has history.

### Changed

- **Default backup location is now beside the repository checkout** — `~/audit.icjia.app/backups` on the production server — instead of `~/backups/audit-db`. Beside, never inside: backups inside the working tree would be deleted by the same `git clean -xdf` that would delete the database, which is the exact disaster they exist to survive. The shell wrapper and the API derive the identical default independently from their own file locations (no shared config to drift), pinned by test. `BACKUP_DIR` still overrides both.

- **The recommended Forge Scheduler command is now just the script path** — no log redirect. Forge captures each run's output itself, and the earlier redirect form could fail on the very first run: the shell opens `>> logfile` before the script executes, so a not-yet-existing log directory kills the job before the script (which creates directories itself) ever starts.

### Notes

Verified against the real pipeline: the local drill's `last-backup.json` renders the row end-to-end. Tests 1,857 → 1,874 (API 1,135 → 1,146; Web 673 → 679); lint, typecheck, build green.

## [1.49.0] - 2026-08-05

Nightly database backups — the top finding of the 2026-08-05 operational review — plus a dated, code-quoting verification of the data-retention policy's storage claims, published on the policy page as a new § 8a.

### Added

- **Nightly SQLite backups.** `apps/api/scripts/backup-db.mjs` snapshots the database with SQLite's online-backup API (better-sqlite3 `db.backup()`) — WAL-safe by construction, where the previously-suggested `cp` cron would miss every committed row still sitting in `audit.db-wal`. Safety properties, each pinned by one of 9 new tests: refuses a missing source (`fileMustExist` — a mispointed job cannot manufacture an empty database and "succeed"), refuses a database without `audit_log` (wrong file = loud error), runs `integrity_check` on the snapshot before keeping it, rotates **count-based** (the newest 5 kept, `BACKUP_KEEP_COUNT` to change; deliberately count- not age-based so disk use stays bounded regardless of manual runs), touches only its own `audit-*.db.gz` files, and writes `last-backup.json` atomically so a silently-stopped backup is observable. Plain JS on purpose — under cron's minimal PATH, `node <file>` is the whole toolchain.

- **Cron wrapper + scripted restore.** `scripts/backup-db.sh` (Forge Scheduler entry point; resolves the repo from its own location, probes for node, pins cwd to `apps/api`) and `scripts/restore-db.sh` (verifies the snapshot first; sets the current DB aside together with its `-wal`/`-shm` — a stale WAL beside a restored main file corrupts it — and deletes nothing). Backups live in `~/backups/audit-db`, outside the working tree, where a `git clean -xdf` cannot reach them. **Restore drill performed the same day**: 68 rows → snapshot → verified restore with a planted stale-WAL case. Setup + drill instructions: `docs/database-backups.md`.

- **§ 8a "Storage verification" on the data-retention page** — a dated evidence annex proving § 8 against the source: the complete seven-table inventory (no BLOB column exists — the DB is structurally incapable of holding file bytes; there is also no user-accounts table), the memory-only upload configuration, the random-name temp-file lifecycles with their `finally` deletes, the exhaustive filesystem-write audit (8 sites, all accounted for), what the process log and the single outbound email can contain, and a verdict table giving each § 8 claim a dated Verified / Qualified / Corrected ruling with the decisive evidence.

### Changed

- **Data-retention policy → v1.3.** The verification found one over-broad claim and the policy now says so instead of quietly narrowing: a **saved or shared** report quotes short strings from inside the document in its findings — metadata fields (title, author, subject, keywords), image alt-text values, link text and destinations, bookmark titles, form-field names — because naming a problem requires showing it. A plain unshared audit stores none of those strings, and page/paragraph text, images, form-field values, and file bytes are never stored anywhere. § 7 gains the backup-snapshot retention row and an honest note that a purged row persists in snapshots roughly 5 further days; § 8's backups bullet now describes the on-server snapshots instead of denying backups exist.

### Notes

The remediation-jobs table carries the same before/after report JSON for its 30-day row life; the `shared_reports` no-physical-delete finding from the 2026-08-05 assessment stands and is stated honestly on the page (the link stops working at 365 days). Tests 1,848 → 1,857 (API 1,126 → 1,135); lint, typecheck, build green.

## [1.48.1] - 2026-08-05

Documentation-accuracy release. Every explanatory surface — the data-retention policy, the technical/scoring pages, README, AGENTS.md — was audited against the code and brought current, and two user-visible corrections shipped alongside. No scored result, endpoint, or stored value changed.

### Fixed

- **The report legend contradicted the scorer.** The severity legend in the layout said Pass means "category score 90–100" and Minor "70–89" — but `SEVERITY_THRESHOLDS` reserves "No issues found" for exactly 100 and labels 70–99 Minor. A category scoring 95 was rendered as Minor by the report while the legend explaining it called the same score a pass. The legend now says 100 and 70–99.

- **`MethodologyCard.vue` hardcoded "WCAG 2.2"** in all four format variants and pinned the quickref link to WCAG22, so under the documented `WCAG_VERSION=2.1` fallback it would contradict every other surface. It now reads `useWcag()` like `technical-details.vue` does.

### Changed

- **Data-retention policy → v1.2** (effective 2026-08-05, § 14 has the dated entry). The corrections it records:
  - **§ 8 claimed IP addresses are never stored.** Every `audit_log` row records the caller's IP address and user-agent, and always has (`migrations.ts` columns, both write paths). Moved to the "stored" list; the policy now says so plainly.
  - **§ 7 claimed the audit log is retained indefinitely.** The cleanup sweep purges it past `SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS` (365) and has since v1.20.1; the sweep description said five tasks where the code runs seven. Also: OTP lifetime corrected to 15 minutes (`AUTH.OTP_EXPIRY_MINUTES`), and the shared-reports row now states what expiry means (the link stops working).
  - **Refused uploads (v1.46.0) are documented** in §§ 2, 7, and 8: a refusal stores the offered file name (sanitized) and a timestamp — no content, no content hash, no score.
  - **§ 10 was six releases behind** (newest entry v1.42.0). Back-filled v1.43.0–v1.47.0 and added the full plain-language entry for the v1.48.0 red/blue audit; the v1.39.0 entry's "publishes no score or grade" claim is now scoped to as-shipped, since v1.44.0 publishes grade distributions.
  - **§§ 12–15 headings were numbered one behind the table of contents** (two sections both rendered "11.") — renumbered, cross-references fixed.
  - § 5 and the stat tiles: veraPDF runs in the audit **and** remediation pipelines; the toolchain tile counts all six tools, not three.

- **v1.37.0's PDF/UA-on-audit change finally propagated.** Five surfaces still said veraPDF runs "only in the remediation pipeline": `technical-details.vue` (pipeline prose, diagram description, tool table), `TechnicalExplainer.vue` (How-It-Works prose, ASCII pipeline, PDF/UA paragraph, privacy bullet), `MethodologyCard.vue`, data-retention § 5, and the README scoring note. All now state that every PDF audit carries the veraPDF PDF/UA-1 verdict.

- **`TechnicalExplainer.vue`** additionally gains a short paragraph on refused formats (legacy binary Office, CSV — v1.45.0 behavior) and a link to the public status page.

- **README**: badges and test counts were ten releases stale (v1.37.5 / 1,594 → v1.48.0 / 1,848 across 111 files); sample `/status` payload refreshed.

- **AGENTS.md** was the worst offender: still described a PDF-only tool scoring "9 categories under two profiles", claimed 876 API tests (1,126), pointed the release checklist at a § 10 location that moved in the section split, and presented the API surface "as of v1.19.0" with PDF-only endpoint descriptions. All corrected; the missing `/api/status`, `/api/health`, `/api/logs` and Nuxt `/status`/`/healthz` routes are now listed.

### Notes

Tests unchanged at 1,848 — no behavior changed; the existing suites (including the source-scan tests over these exact files) pass as-is. Lint, typecheck, and build green.

## [1.48.0] - 2026-08-05

Full red/blue security audit of the whole application. Two findings, both fixed; no critical or high-severity issue found.

### Security

- **R1 — Unsanitised filename persisted from the upload filter (Low/Medium, fixed).** The multer file filter passed `file.originalname` straight to `recordRejectedUpload`, so a refused upload stored its filename verbatim. Confirmed empirically: a 4,040-character name carrying raw `<img src=x onerror=alert(1)>` was written to `audit_log.filename` unchanged, while the success path in `routes/analyze.ts` sanitised the same value correctly.

  It was not exploitable as stored XSS — those rows surface only through the admin-only `/api/logs` (`SELECT *`), and no `v-html` renders log data, so Vue's default escaping stood between it and execution. But it put untrusted, unbounded text into an authenticated UI with a single control in the way, and the rejection path is the *cheapest* request an attacker can make: refused at the filter, so the file body is never even uploaded.

  Fixed at the **writer** rather than the call sites — `recordRejectedUpload` now sanitises internally, so no future caller can reintroduce the gap by forgetting. `recordAudit` additionally clamps `filename` and `user_agent` to 512 characters as a backstop (length only, no character filtering, because `audit-url-page` deliberately stores a URL in that column). `routes/analyze.ts` now calls the same exported sanitiser, so the two paths cannot drift.

- **R2 — Newlines survived filename sanitisation (Low, fixed, pre-existing).** Found by the regression test written for R1. `FILENAME.ALLOWED_CHARS` is `/[a-zA-Z0-9._\-\s]/`, and `\s` matches `\n`, `\r` and `\t` as well as the ordinary space — so line breaks passed the allow-list and were stored. This predates R1 and affected the success path too. A filename is a single line by definition, and anything downstream rendering these rows line-by-line or exporting them as delimited text would inherit it.

  Fixed by collapsing all whitespace to a plain space *before* the allow-list runs, inside `sanitizeStoredFilename` rather than by narrowing the shared config regex — `routes/remediate.ts` uses the same constant to build on-disk names, and changing it there was out of scope for this fix.

### Notes

**Scope.** Endpoint inventory, authentication and authorisation, injection (SQL and template), SSRF, subprocess execution, denial of service and resource limits, secret handling, transport and CSP headers, and the client render path — plus a focused pass on everything added in v1.44.0–v1.47.0, which was the least-audited code in the tree.

**Verified sound, no change needed.** Auth is fail-closed: `authMiddleware` returns the anonymous sentinel *before* reaching JWT verification when `REQUIRE_LOGIN` is off, so the in-repo dev secret is unreachable in the deployed configuration, `adminMiddleware` rejects that sentinel explicitly, and `checkAuthConfig` refuses to boot on a missing or default `JWT_SECRET` when login is enabled. OTPs use `crypto.randomInt` and are bcrypt-hashed; JWT verification pins `algorithms: ["HS256"]`. Share IDs and access tokens are 128-bit and 256-bit random respectively, tokens SHA-256 hashed at rest. SSRF is defended by manual redirect walking with a private/loopback/link-local IP check at every hop. Every subprocess uses `execFile` (never a shell). All SQL is parameterised; the only interpolations are compile-time constants. CORS is pinned to one origin, CSP carries a per-request nonce with no `script-src 'unsafe-inline'`, and `object-src`/`base-uri`/`frame-ancestors` are all `'none'`. `audit_log` retention (365 days) bounds the new rejection rows. Only `.env.example` files are tracked, with placeholder values.

**The v1.44.0–v1.47.0 render path is clean.** Every interpolation in the three new `/status` sections is either wrapped in `escapeHtml` or a number validated through `asCount`; the sole unescaped value is a hex colour read from the compile-time `GRADE_THRESHOLDS` constant. `detectLegacyFormat` compares eight signature bytes and runs one bounded `Buffer.includes` over at most 8 KB, with no allocation proportional to input.

Tests 1,841 → 1,848 (API 1,119 → 1,126); lint, typecheck, build green.

### Deployment-layer findings (live probe of production; fixed in nginx, no code change)

A read-only probe of the deployed service — headers, TLS, exposed artefacts, direct-port reachability — plus a full adversarial suite (SSRF, zip bomb, XML entity-expansion, XXE, concurrency, remediation gate, admin authz, body caps) run against an isolated local instance so production traffic and statistics were untouched. The application tier defended every attack. Three findings, all in the Forge-managed nginx vhost, all **fixed and verified live**:

- **L1 — HSTS was missing on the frontend (Low, fixed).** Helmet sent `Strict-Transport-Security` on the Express API (`/api/*`), but the Nuxt tier — the HTML a browser actually navigates to and latches onto — did not, so the header was absent on every page. `http://` already 301s to `https://`, but without HSTS that first request is downgrade-interceptable. Fixed with `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;` at the nginx edge, which is where transport security belongs and which blankets both tiers and error pages at once. `preload` deliberately omitted (a one-way commitment needing apex-domain control); `includeSubDomains` scopes to `*.audit.icjia.app` only.

- **L2 — Conflicting `X-Frame-Options` on the frontend (Informational, fixed).** The Nuxt tier sent `DENY` and the nginx vhost added `SAMEORIGIN`; a repeated XFO with differing values is treated as invalid by some browsers. The app already sets its own on every proxied response, so the nginx line only ever produced a duplicate — removed it, leaving each tier one clean value (`DENY` frontend, `SAMEORIGIN` API). `frame-ancestors 'none'` in the CSP was the authoritative control throughout. The deprecated `X-XSS-Protection` line was dropped in the same edit.

- **L3 — Security headers absent on nginx-generated error responses (Low, fixed).** `add_header` without the `always` flag skips 4xx/5xx, so the `/.env` 403 (and other error pages) carried no security headers. Adding `always` restored them; verified against the live 403.

Everything else was confirmed sound at the edge: TLS 1.3 / AES-256-GCM, the API port not reachable externally, `.git`/`.env` denied, no source maps shipped, `http→https` redirect in place. The one residual is accepted: nginx's own 403 deny-page no longer carries `X-Frame-Options` (it has no framable content and never carried a CSP), which is the reason the "remove the duplicate" fix is clean rather than perfect.

## [1.47.0] - 2026-08-05

Two catch-all buckets on one page were both called `other` and meant opposite things.

### Changed

- **`documents_audited.by_format_*.other` is now `unknown_extension`.** It means *the document was audited normally, we just could not classify its filename* — in practice a URL audit whose path ends in something like `download?id=123`. It is near-always zero and exists so the format split always sums to the document total.

  `documents_rejected.by_format_*.other` keeps its name and now has the page to itself. It means the opposite: *refused, and not one of the named unauditable formats* — `.jpg`, `.zip`, and files whose extension lies.

  Sharing one name made the page actively misleading: a zero sitting beside a non-zero, apparently contradicting each other, with nothing on the page to say they were answering different questions. This is a **breaking change to the JSON**, made deliberately after confirming nothing external reads that key.

### Added

- **A "What was audited" section** between the grade distribution and the refusals, so the catch-all's meaning is visible without reading the raw JSON tree. The label there is **Unrecognized extension**, never "Other", and the caveat explains the term even in a window where the row itself is hidden for being zero — otherwise a reader meeting it for the first time in the tree has nothing to go on. It also states plainly that an unclassified filename **is not a refusal**.

  The page now reads as three distinct questions: how did audited documents score, what kinds of document were they, and what could not be checked at all.

### Notes

**One test's stated rationale was corrected rather than its assertion.** `statusHtml.test.ts` carried a test named *"carries no explanatory prose — just the tree and the toggle"*, commented *"the page is the JSON, formatted. Nothing else."* That stopped being true in v1.44.0 when the grade-distribution caveat was added deliberately; it only kept passing because its fixture lacked the fields that trigger the newer sections. It now guards what still matters — that the page does not become an essay with a tree at the bottom — and keeps the same length bound. A test whose stated reason contradicts the design is a trap for whoever reads it next.

Tests 1,833 → 1,841 (Web 665 → 673); lint, typecheck, build green.

## [1.46.0] - 2026-08-04

`/status` now counts what people bring that the tool cannot check at all.

### Added

- **`documents_rejected` on `/status`,** counting refused uploads over 24h / 30d / all time, split by the extension they were offered under (`doc`, `xls`, `ppt`, `rtf`, `csv`, `other`). Rendered on the HTML view as a **Files the tool could not check** section below the grade distribution.

  This answers a question the audit counts structurally cannot. A refused file never reaches the audit path, so it was never recorded anywhere — which is why `by_format_*.other` sat at zero and looked like dead weight. The information was not being bucketed wrongly; it was not being captured at all. Refusals are now recorded at all three rejection sites: the upload filter, the analyze route's content sniff, and the URL / inventory pipeline.

### Notes

**It is a sibling of `documents_audited`, never a bucket inside it.** A refusal has no score and no grade. Folding the two together would inflate the audit total *and* drop every refusal into the grade distribution's `ungraded` bucket, which would quietly destroy the figure v1.44.0 added. The separation is enforced by `STATUS.REJECTION_EVENT_TYPES` being disjoint from `DOCUMENT_EVENT_TYPES`, asserted directly by test rather than only observed through its effects.

**Rejection rows carry a NULL `content_hash`, deliberately.** The remediation audit-gate (`hasRecentAudit`) matches on `content_hash + email` with **no `event_type` filter**, so a hash on a refusal row would let *"this content was refused"* satisfy a check that means *"this content was audited"*. NULL can never match, closing it by construction rather than by remembering to filter — and the multer filter has no buffer to hash at that point anyway, so the guarantee and the mechanics agree. A test probes the gate's own SQL with three different hashes to pin it.

**`other` is genuinely populated in the new block**, unlike `FormatCounts.other`: it covers unrelated types (`.jpg`, `.zip`) and files whose extension lies — a `.doc` renamed to `.docx` is caught by content detection but buckets by its *stated* extension, since that is all the SQL can see.

**`by_format_*.other` was deliberately left in place.** Removing it was considered and rejected: an extension-less filename from a URL audit legitimately lands there (pinned by an existing test), so dropping the bucket would silently break the property that the format split sums to the document total.

**The caveat differs from the grade distribution's** — these are *attempts, not documents*, so one person retrying the same file counts each time, and the copy says so.

**Verified end-to-end** against a running server: four refusals plus one real PDF moved `documents_audited.total` by exactly one, left `by_grade_total.ungraded` at zero, and moved `documents_rejected.total` by four, with the renamed `.docx` landing in `other` as designed.

The JSON gains one top-level key, added to `statusPrivacy.test.ts`'s allow-list as a deliberate decision. Everything reported remains an aggregate `COUNT(*)`: filenames are consumed by the bucketing `CASE` inside SQLite and never cross the boundary.

Tests 1,815 → 1,833 (API 1,112 → 1,119; Web 654 → 665); lint, typecheck, build green.

## [1.45.0] - 2026-08-04

Files the tool recognizes but cannot audit now get an answer instead of a list of what it accepts.

### Added

- **Specific guidance for legacy binary Office files (`.doc`, `.xls`, `.ppt`, and `.rtf`).** These are OLE2 compound binaries — a different container from the OOXML this tool audits, not an older version of the same one — and they cannot store the headings, alt text, table headers or document language an accessibility check looks for. Word and Excel disable their own Accessibility Checker for them for exactly that reason.

  The message names the format, gives the Save As path to the modern equivalent, and states plainly that **converting carries content across but not accessibility structure**, so the user should expect to still add headings and alt text afterwards. That last sentence is pinned by test for all four formats: without it, people convert, re-upload, score badly, and feel misled by the tool that told them to convert.

- **Content-based recognition, so a renamed file is caught.** A `.doc` saved as `.docx` passes every extension check and previously failed with *"check that you are not uploading a renamed file of another type (e.g., .zip, .jpg)"* — told to a user holding a genuine Word document. `detectLegacyFormat` now sniffs the OLE2 signature and scans a bounded 8 KB prefix for the UTF-16LE CFB stream names (`WordDocument`, `Workbook`, `Book`, `PowerPoint Document`), falling back to a generic legacy-binary message for the rest of the family (`.msg`, `.vsd`).

  It deliberately does **not** parse the compound-file container. Doing that properly means reading the CFB header and walking the FAT — a new parser over untrusted input, to compose a sentence. We are not auditing these files, only explaining why we cannot.

- **CSV and TSV get the opposite advice, on purpose.** A CSV has no accessibility structure either, but that is not a defect and telling someone to convert it would be wrong: for raw tabular data CSV is often the right format, and converting it to `.xlsx` to score better produces a worse artifact and a meaningless grade. The message says there is nothing to check, that this is not a fault, and points at the page linking the file — describe the data, state the format and size, identify the header row. A test pins that this copy can never contain "Save As".

### Changed

- **The copy moved to `@file-audit/shared`.** It previously existed only in the browser drop zone, so three server paths still emitted the generic accepted-formats list: a direct `POST /api/analyze` (what the CLI, curl, and the fleet-audit integration actually see), the analyze route's content-detection failure, and the URL / inventory pipeline — the last being where legacy formats show up in bulk, as an agency's back catalogue of `.doc` returning a wall of identical generic failures with no sign that one action fixes all of them. All four call sites now share one source. `legacyFormatMessage` became `unsupportedFormatHint`, since "legacy" stopped being accurate once CSV joined it.

### Notes

**No scored path, response shape, or status code changed.** Rejections still return 400 from the upload filter and analyze route and 422 from the URL pipeline; only the message body differs, so the fleet-audit integration is unaffected. Legacy extensions are still refused at the filter rather than accepted-then-detected, so no upload bandwidth is spent on a file certain to be rejected. `.csv` is deliberately absent from the file input's `accept` attribute — the browse dialog should not offer a format the tool rejects, while a drag-and-drop still produces the explanation.

**Verified over real HTTP**, every path: an honest `.doc` at the extension filter, a `.doc` renamed to `.docx` through the content sniff, an unnamed OLE2 binary falling back correctly, `.rtf`, and `.csv`. Regression check on the controls corpus: `2022-DVFR-Annual-Report-A0.pdf` still scores 100 / A, unchanged.

Tests 1,787 → 1,815 (API 1,091 → 1,112; Web 647 → 654); lint, typecheck, build green.

## [1.44.0] - 2026-08-04

The status page now shows how the documents people check here have actually scored — with the sampling caveat printed beside the numbers rather than left for the reader to infer.

### Added

- **A letter-grade distribution on `/status`, over three time windows.** `documents_audited` gains `by_grade_24h`, `by_grade_30d`, and `by_grade_total`, each an `{A, B, C, D, F, ungraded}` breakdown. The HTML view renders them as a proportional bar plus an exact table per window.

  The counts were already derivable from the database but were not published, and as six bare numbers they say very little. Rendered as a proportion, the same data answers the question most people actually arrive with: are the documents we publish anywhere near accessible? For a manager who has never opened a screen reader, "2,560 of 4,122 scored F" carries a scale that a raw audit count does not.

  Colours and labels come from `GRADE_THRESHOLDS` in `@file-audit/shared` — the same source the report UI scores against — so an `F` is the same red here as on a report, and a future change to the scale cannot leave this page behind.

### Notes

**The sampling caveat is part of the feature, not decoration.** The corpus is self-selected: people upload documents they already suspect have problems, alongside test files, and the same file may be uploaded repeatedly. A reader who takes "62% F" as a population statistic about their agency's document library has been misled by the page. The caveat therefore sits *above* the numbers, and a test asserts it appears both in the section and ahead of the JSON tree on the assembled page, so it cannot drift below the fold in a later edit.

**The buckets reconcile, by construction.** `ungraded` is a real bucket rather than a dropped row: `audit_log.grade` is nullable (failed audits, and rows predating the column) and any unrecognized value funnels there too. Every window's buckets sum to the document total printed beside it, asserted per window by test — two figures on one page that disagree read as a broken page, and would undermine the caveat sitting directly above them. The row is rendered only when non-zero, so a normal day shows no permanent zero.

**The chart is accessible.** The proportional bars are `aria-hidden`; the meaning lives in a real `<table>` with `scope`d headers, inside a labelled `<section>`. The page also gained an `<h1>` — it had none, which would have left the new `<h2>` orphaned. An accessibility tool shipping an inaccessible chart would be its own worst advertisement.

**The machine contract is additive.** The new keys are nested inside `documents_audited`, so the top-level allow-list is untouched and every existing consumer — UptimeRobot's keyword alert on `degraded`, the fleet-audit project's `/api/audit-url` calls — reads exactly what it read before. A payload predating the fields renders no distribution rather than breaking, so shared reports and an older API build still work; pinned by test.

Verified by rendering the built output at production-shaped figures and inspecting it in both colour schemes and at a 390px viewport, where the three windows stack without horizontal overflow.

Tests 1,764 → 1,787 (API 1,084 → 1,091; Web 631 → 647); lint, typecheck, build green.

## [1.43.0] - 2026-08-04

The status page is no longer a dead end, it no longer costs you a browser tab, and a stray click can no longer discard a running audit without warning.

### Added

- **A link back to the audit tool on the HTML status page.** `/status` is a bare Nitro route with none of the site's chrome, so anyone arriving from a monitor alert, a bookmark, or a pasted link had no way into the app at all — the browser Back button only worked for people who came from the site. The toolbar now carries the app name with a back arrow on the left, opposite the existing "View raw JSON" toggle on the right. The label comes from `BRANDING.APP_SHORT_NAME` through `runtimeConfig` rather than being hardcoded, so it follows a rebrand; the arrow is `aria-hidden` so it is not announced ahead of the link name.

- **A warning before a click throws away a running audit.** An audit lives entirely in the page — a single file is an in-flight request, a batch is a client-side loop over the queue — so leaving discards it with no way back short of re-uploading and waiting again. Leaving now asks first.

  **It is silent unless an audit is actually running.** No banner, no caution text, no interception on an ordinary click. A permanent warning would fire on nearly every visit and become the kind of notice people dismiss unread, which is worse than none.

  Three separate exits needed covering, because the browser treats them as unrelated events: `beforeunload` catches real document navigations (the **Status** link — a plain `<a>` by design — plus FAQs, reload, and closing the tab, none of which the router ever sees); a router guard catches in-app links like **What's New**, which never unload the document; and `goAnalyze` asks for itself, since clicking the site title to reset navigates to the route it is already on and so trips neither hook, while mid-batch it abandons the queue. The prompt is the browser's native dialog rather than a bespoke modal — keyboard-operable, screen-reader announced and correctly modal for free, where a hand-rolled one would need a focus trap, `aria-modal`, Escape handling and focus restoration to match.

### Changed

- **The header "Status" link opens in the same tab.** It opened in a new one to protect an in-progress audit, but that left a stray tab behind on every visit — and the warning above now protects the audit directly, which the new tab only did by accident. Pinned by a test that fails if `target=` reappears on that anchor. The announcement-banner and "What's New" links to `/status` already navigated in-tab and are unchanged.

### Notes

**The machine contract is untouched.** `/status`, `/status?json`, and any wildcard-`Accept` request return exactly the JSON they returned before — same payload, same status codes, same `Link` header. Only the HTML representation changed. Verified against the built server with the API deliberately stopped, so the degraded path was exercised too: `/status?html` still renders the tree (`{"status":"down","web":"ok","api":"down"}`) with the back link intact, while `?json` and the bare URL both stayed `application/json`.

Both new hrefs and the app name are HTML-escaped like every other value on the page, asserted by test — they are our own config today, which is exactly why they would be easy to leave unescaped.

**Verified in a live browser** against the built server, every branch: idle, a synthetic `beforeunload` is not cancelled and an in-app navigation is never intercepted (0 prompts); with an audit running, `beforeunload` cancels, the router guard asks and answering "no" leaves the route unchanged while "yes" proceeds, and the site-title reset asks only while running. The flag clears on unmount, so a confirmed departure does not leave it stuck true and prompting on every later click.

Tests 1,748 → 1,764 (Web 615 → 631); lint, typecheck, build green.

## [1.42.1] - 2026-08-03

In-site links to `/status` now request the HTML view explicitly.

### Changed

- **Every link to `/status` from the site — the header "Status" link and both announcement-banner entries — now points at `/status?html`.** Browsers already received HTML through `Accept` negotiation, so this changes nothing a visitor sees; it makes the intent legible in the markup, survives any future change to how negotiation works, and mirrors `?json`, the monitor URL. Both audiences now have an explicit address rather than relying on a header. Pinned by test, including that no announcement entry links to the bare `/status`.

- **The in-page toggle and the `Link` header use the short form** (`/status?json`, `/status?html`) rather than `?format=`. `?format=json|html` still works and is unchanged.

Tests 1,747 → 1,748 (Web 614 → 615); lint, typecheck, build green.

## [1.42.0] - 2026-08-03

`/status` now renders as a readable JSON tree in a browser, while machines keep getting exactly the JSON they got before.

### Added

- **A human-readable HTML view of `/status`**, shown automatically to browsers. The payload is rendered as a syntax-coloured, collapsible JSON tree — the view a browser JSON formatter extension would give you — so someone curious about the service sees structure rather than a wall of text. No explanatory prose: the page is the JSON, formatted, plus a "View raw JSON" toggle.

- **`/status?json` — an explicit JSON URL for uptime monitors.** Pointing a monitor at this makes its contract self-describing and immune to any future change in content negotiation: the URL states what it wants, so no `Accept`-header behaviour can hand it HTML and silently blind a keyword alert. `?html` is the mirror image, and `?format=json|html` also works (that is what the in-page toggle links to).

### Notes

**This is additive; the machine contract is unchanged.** JSON remains the default for everything that is not unambiguously a browser. Only an explicit `text/html` in `Accept` selects the HTML view — a wildcard `Accept`, which UptimeRobot and curl send, still receives JSON. The payload itself is byte-identical and the top-level key allow-list in `statusPrivacy.test.ts` is untouched: the HTML view is advertised to JSON clients through a `Link: </status?format=html>; rel="alternate"` **header**, because adding a field for it would have changed the payload every monitor reads.

**The page contains no JavaScript.** Collapsing uses native `<details>`/`<summary>` and the toggle is an ordinary link. That keeps it clear of the app's nonce-based CSP (`script-src` has no `'unsafe-inline'`, so an inline script would need a nonce threaded through a non-Vue route), and it works with JS disabled — plausible for someone poking at an unfamiliar status URL. Every key and value is HTML-escaped, asserted by test, even though nothing in the payload is currently attacker-shaped.

Tests 1,725 → 1,747 (Web 592 → 614); lint, typecheck, build green.

## [1.41.2] - 2026-08-03

`rebuild.sh` now re-executes itself after `git pull`, so a deploy always runs the code it just fetched.

### Fixed

- **`rebuild.sh` pulled a new copy of *itself* and then kept executing the old one.** bash reads a script lazily, by byte offset — it does not read the whole file up front. When `git pull` (line 219) rewrites `rebuild.sh` mid-run, bash keeps reading from its saved offset into the **new** contents. The visible symptom: the v1.41.1 deploy fetched the fixed smoke checks but ran the v1.41.0 ones, so the same false `502` / `502000` output appeared even though the fix was already on disk. The worse, unobserved case is the offset landing mid-line and bash executing a fragment of a command.

  The script now re-execs once, immediately after the pull and only when the pull actually moved `HEAD`, so every later step runs the freshly fetched code. A guard environment variable prevents recursion, and the pre-pull SHA is carried across the re-exec so the failure banner still prints a rollback target that predates the deploy. Verified by simulation: re-execs exactly once when `HEAD` moves, not at all when it does not, and the rollback SHA survives.

### Notes

**The `Sourcemap is likely to be incorrect` warnings during `pnpm build` are cosmetic and expected.** They come from `@tailwindcss/vite` (and Nuxt's module-preload polyfill) transforming files without emitting a sourcemap, so Vite warns that the *server* build's sourcemap may be imprecise for those chunks. They do not affect the shipped application. Client sourcemaps are already disabled — the built client bundle contains **zero** `.map` files, so no source is exposed to browsers. No action needed.

## [1.41.1] - 2026-08-03

Fixes the post-deploy smoke checks added in v1.41.0, which reported false failures against a healthy deploy.

### Fixed

- **The smoke checks probed before the app was listening, reporting `502` on a perfectly healthy deploy.** `pm2 restart` returns as soon as the process is *spawned*, not when it is accepting connections, so the probes were measuring the script's own impatience. They now wait for `/healthz` to answer 200 (polling every 2s, up to 60s) before probing, and say explicitly when they gave up waiting so a slow start is not mistaken for a fault.

- **`HEAD` probes reported a nonsense `502000` status.** The probe used `-X HEAD`, which leaves curl waiting for a response body that a HEAD response never sends; curl blocked until `--max-time` and exited non-zero, printing the real code *and* the `|| echo "000"` fallback. Now uses `--head`, and the fallback can no longer concatenate — an absent response reads as a clean `000`.

Both bugs were in the deploy script's self-check only. **No application code was involved, and production was healthy throughout** — verified live during diagnosis: v1.41.0, `status: ok`, `GET` and `HEAD` both 200 on `/status` and `/healthz`.

The `robots.txt` / `favicon.ico` 404s the checks reported were **real** — an nginx configuration issue on the droplet, not a build problem. See the v1.41.0 notes below for the diagnosis. **Resolved on the server 2026-08-03**; all five smoke-check probes now pass.

## [1.41.0] - 2026-08-03

Header cleanup: adds a Status link, removes the redundant Analyze link, and makes the site title keyboard-operable. Adds post-deploy smoke checks that catch the production `robots.txt` 404.

### Added

- **A "Status" link in the header**, pointing at `/status`. It is a plain `<a>`, **not** a `<NuxtLink>` — `/status` is a Nitro *server* route with no Vue page behind it, so a NuxtLink would navigate client-side, find no match, and render the SPA "Page not found: /status" without ever contacting the server. That exact bug shipped in v1.39.0; a test now pins the element type so it cannot return. Opens in a new tab so clicking it mid-audit cannot discard an in-progress report.

- **Post-deploy smoke checks in `rebuild.sh`.** Non-fatal — PM2 has already restarted successfully by then, so a failed probe is information rather than a reason to abort a working deploy. Probes `/healthz`, `/status` (GET **and** HEAD), `/robots.txt` and `/favicon.ico`, and prints the exact nginx fix when the last two fail.

### Changed

- **The "Analyze" links are gone from both the desktop nav and the mobile dropdown.** Clicking the site title clears results and starts a new file — behaviour the title already had, now the single obvious way to do it. Both were removed so mobile and desktop do not end up with different navigation.

### Fixed

- **The site title is now keyboard-operable (WCAG 2.1.1).** It was a bare `<h1>` with an `@click` handler: no focus, no Enter activation, no role — unreachable without a mouse. Now that it is the *only* way to reset, that would have been a real barrier, and a poor one to ship on an accessibility auditing tool. It is an `<a href="/">` wrapped in the `<h1>`, which brings keyboard focus, Enter activation, middle-click/open-in-new-tab and no-JS behaviour for free; `@click.prevent` adds the state reset.

### Notes

**`/robots.txt` and `/favicon.ico` 404 in production, and this release does not fix it — the fix is on the server.** Diagnosed conclusively: every working static asset (`/favicon.png`, `/llms.txt`, `/og-image.png`) returns `etag` + `last-modified`, i.e. served by Nitro through the proxy; these two return nginx's own HTML 404 with no etag. They are precisely the two paths in Laravel Forge's default vhost template:

```nginx
location = /favicon.ico { access_log off; log_not_found off; }
location = /robots.txt  { access_log off; log_not_found off; }
```

An exact-match `location =` block outranks the `proxy_pass` to Nuxt and resolves against the vhost `root` (Forge's default `/home/forge/<site>/public`), which holds neither file for a Nuxt app — so nginx answers 404 itself and never forwards the request. **Fix:** delete those two blocks from the site's nginx config, then `sudo nginx -t && sudo service nginx reload`. Until then the entire `robots.txt` is missing in production; `/status` and `/healthz` are still covered by their `X-Robots-Tag` headers, but `/login`, `/my-history`, `/history` and `/publist` have no backstop.

> **RESOLVED 2026-08-03.** Both blocks were deleted from the production vhost and nginx reloaded. Verified live: `/robots.txt` returns `200 text/plain` with every `Disallow` intact, and `/favicon.ico` returns `200 image/vnd.microsoft.icon`. This also closes the unexplained `/favicon.ico` 404 that had been open since v1.28.0 — same root cause. The post-deploy smoke checks now pass all five probes.

Tests 1,722 → 1,725 (Web 589 → 592); lint, typecheck, build green.

## [1.40.3] - 2026-08-03

`/status` and `/healthz` now answer HEAD requests, which several uptime monitors send by default.

### Fixed

- **`GET /status` and `GET /healthz` returned 404 to HEAD requests.** Both were Nitro `*.get.ts` route files, so Nitro matched only GET. Several uptime monitors — UptimeRobot among them — send HEAD by default, and one configured that way would have reported the service **down while it was perfectly healthy**: the worst kind of monitoring failure, because it teaches you to ignore the alert. Both files are now unsuffixed (`status.ts`, `healthz.ts`), which matches any method, with an explicit guard narrowing that back to GET and HEAD; anything else gets `405` with an `Allow: GET, HEAD` header.

  A HEAD request runs the **real probe** rather than short-circuiting, so the status code reflects reality — a HEAD that always returned 200 would be worse than the 404 it replaced. Verified against the built server: with the API down, `GET` and `HEAD` both return 503; with it up, both return 200, and `POST`/`DELETE` return 405. `X-Robots-Tag: noindex, nofollow` is still set on every response.

`GET /api/status` on the Express tier already handled HEAD — Express routes GET handlers for HEAD automatically — so no API change was needed.

Tests 1,713 → 1,722 (Web 580 → 589); lint, typecheck, build green.

## [1.40.2] - 2026-08-03

Moves the Scoring Rubric from the top navigation to the footer.

### Changed

- **"Scoring" now lives in the footer link row** rather than the header nav, restyled to match the neighbouring Changelog / What's New / Data Retention links. The rubric dialog itself is unchanged — same content, same behaviour, just a different trigger location. This also moves it out of the auth-gated `<nav v-if="user">`, so its visibility no longer depends on login state.

### Fixed

- **Corrected a wrong comment and test rationale** introduced in v1.39.2. Both asserted that the header's `<nav v-if="user">` never renders for ordinary visitors. It does: `/api/auth/me` returns `{ "email": "anonymous" }` rather than `null` while `AUTH.REQUIRE_LOGIN` is `false`, so `user` is truthy. The "What's New" link's placement outside that nav is still correct — enabling login, or changing the anonymous sentinel to `null`, would silently hide anything inside it — but the stated reason was wrong and would have misled the next reader.

Tests unchanged at 1,713; lint, typecheck, build green.

## [1.40.1] - 2026-08-03

Clears the last fixable dependency advisory left after v1.40.0.

### Security

- **`esbuild` pinned to `^0.28.1`** (was 0.27.3), closing a low-severity advisory covering arbitrary file read via esbuild's *development* server — a surface this application does not expose in production, which is why it is low. The override is free: Vite 7.3.6 already declares `^0.27.0 || ^0.28.0`, and 0.28.1 was in the tree via nitropack; only `@nuxt/fonts` was still holding 0.27.3. The tree now resolves to a single esbuild version.

### Notes

One advisory remains open and is **not actionable**: a medium-severity `@nuxt/ui` issue where `UAuthForm` / `UForm` SSR markup omits `method`. No patched version exists yet. It also does not apply here — this application uses `UFormField` (a field wrapper), not `UForm` or `UAuthForm`, and only on the login page, which is inert while `AUTH.REQUIRE_LOGIN` is `false`. It will close when upstream ships a fix.

Tests unchanged at 1,713; lint, typecheck, build green.

## [1.40.0] - 2026-08-03

Dependency security release: clears every open Dependabot advisory. Adds a local-time field to `/status`.

### Security

- **All ~25 open dependency advisories are resolved,** including high-severity ones in `postcss`, `tar`, `brace-expansion`, `shell-quote`, `ws`, `js-yaml`, `lodash`, `linkify-it`, `picomatch`, and `vite`. Every one was a *transitive* dependency of build tooling (nuxt, nitropack, puppeteer, `@nuxt/ui`) rather than of application code.

- **Dependabot could not fix these itself, and its failing runs were the symptom rather than a broken CI job.** It reported `security_update_not_possible` — e.g. postcss `latest-resolvable-version: 8.5.8` against `lowest-non-vulnerable-version: 8.5.18` — because it attempts to bump a transitive package in isolation against the *locked* tree. The declared semver ranges already permitted the patched versions; nothing had refreshed the lockfile. Fixed with explicit `pnpm.overrides` pinning each affected package to its lowest non-vulnerable version, using version-scoped keys (`brace-expansion@2` / `@5`, `picomatch@2` / `@4`, `h3@1`, `vite@7`) where two major lines legitimately coexist.

- **Direct dependency bumps** from the three open Dependabot PRs: `fast-xml-parser` 5.9.3 → 5.10.1, `sharp` 0.34.5 → 0.35.0, `svgo` 4.0.1 → 4.0.2.

### Added

- **`last_audit_at_chicago` on `/status`** — the same instant as `last_audit_at`, rendered in `America/Chicago`. Derived from the UTC value rather than stored separately, so the two can never disagree; `null` when there is no audit yet or when Node lacks full ICU.

### Notes

**Framework versions are deliberately unchanged.** A blanket `pnpm update -r` does resolve every advisory, but it also performs in-range minor upgrades — `nuxt` 4.4.7 → 4.5.1 and `@nuxt/ui` 4.5.1 → 4.10.0 — and Nuxt 4.5.1 pulls `unhead` 3, which drags in `h3@2.0.1-rc.26`, a **release candidate**. Two incompatible `H3Event` types then coexist and `pnpm typecheck` fails on every Nitro route, including the pre-existing `/healthz`. Targeted overrides give the security fixes without moving the framework; upgrading Nuxt should be its own release with its own testing.

`fast-xml-parser` is the XML engine behind every DOCX/PPTX/XLSX check, so a behaviour change there would move scores silently rather than throw. Verified by auditing the four OOXML control documents on both 5.9.3 and 5.10.1: results are identical (92/A, 80/B, 90/A, 90/A).

Tests 1,711 → 1,713 (API 1,082 → 1,084); lint, typecheck, build green.

## [1.39.3] - 2026-08-03

The status page's document counts now refresh within seconds instead of up to a minute.

### Changed

- **`/status` database aggregates are cached for 5 seconds instead of 60.** Auditing a document and then checking the status page showed the count unchanged, which reads as the page being broken rather than merely cached. The original 60s value mistakenly applied the engine-probe cost reasoning to queries that have no such cost: a `COUNT(*)` over a few thousand rows is sub-millisecond, and a request flood is already bounded by the endpoint's own 120/min per-IP limiter. Freshness is worth far more here than the handful of scans the longer cache saved.

The **engine-probe cache is unchanged at 10 minutes** and is the one that actually matters — those probes spawn processes including a veraPDF JVM, so their cost must stay decoupled from how often a monitor polls. The two TTLs are deliberately independent; conflating them is what caused this.

Tests unchanged at 1,711 (they assert against the constant, not a literal); lint, typecheck, build green.

## [1.39.2] - 2026-08-03

Makes the v1.39.1 announcement archive actually reachable: "What's New" now appears in the header and footer.

### Added

- **A "What's New" link in the site header and footer,** both pointing at the `/announcements` archive. v1.39.1 added the archive but linked it only from the announcement banner — which shows one entry and is *permanently dismissible*, so the archive disappeared at exactly the moment it became useful. Both new links render on every page regardless of banner state.

### Fixed

- **The header link is placed outside the signed-in-only navigation.** The header's main `<nav>` is `v-if="user"`, and `AUTH.REQUIRE_LOGIN` is `false`, so that block never renders for ordinary visitors — a link added inside it would have looked correct in review while being invisible to essentially everyone. A test asserts the link is not inside that gated block.

### Notes

Wording is "What's New" rather than "Updates" because the footer already carries a "Changelog" link to the technical `CHANGELOG.md` on GitHub; two adjacent links named "Updates" and "Changelog" would invite the question of which is which, whereas "What's New" reads as the plain-language counterpart.

The banner entry was extended rather than replaced by a new one. v1.39.1's entry had not yet deployed, so prepending would have buried the status-page announcement a second time before any visitor had seen a working version of it.

Tests 1,701 → 1,711 (Web 570 → 580); lint, typecheck, build green.

## [1.39.1] - 2026-08-03

Hotfix for v1.39.0: the banner link to the new status page 404'd. Adds an archive of past announcements.

### Fixed

- **The "View the status page" link in the home-page banner no longer shows "Page not found: /status".** `/status` is a Nitro *server* route, not a Vue page, so the Vue router has no match for it. The banner used an ordinary `<NuxtLink>`, which navigates **client-side** — the router found nothing, rendered its own 404, and never contacted the server. Visiting the URL directly always worked, which is what made it look like a deploy problem rather than a link problem. Announcement entries now carry a `linkExternal` flag that forces a real document navigation; it is required for any link whose target is a server route. Both states are pinned by tests so this cannot ship broken again.

### Added

- **An archive of every past announcement at `/announcements`,** linked as "See all updates" from the banner. The banner shows only the most recent entry and can be dismissed permanently, so previous updates were otherwise unreachable. The archive applies the same WCAG-version filter the banner does, so it never shows an announcement that does not describe the running configuration.

### Notes

The banner entry for the status page had its `id` bumped rather than being replaced by a new entry. Prepending a new announcement would have buried the status-page one — which, because of the bug above, no visitor could successfully act on. Changing the id re-shows it once, including to anyone who had already dismissed it.

Tests 1,698 → 1,701 (Web 567 → 570); lint, typecheck, build green.

## [1.39.0] - 2026-08-03

Adds a public service-status page at **`https://audit.icjia.app/status`** — health, engine checks, and how many documents the tool has audited, as JSON. No scoring change: every score, grade and verdict is byte-identical to v1.38.2.

### Added

- **`GET /status` — a public, unauthenticated service-status document.** Reports both tiers (`web`, `api`), the database, live checks of all three audit engines (qpdf, veraPDF, Chromium), the API process's uptime, and aggregate usage: documents audited in the last 24h / 30d / all time, split by format (PDF, DOCX, PPTX, XLSX). It answers two questions that previously had no answer without SSH access — "is the service healthy?" and "is anyone using it?" — and is intended for internal developers and interested managers. Served by the Nuxt tier so a single URL covers both processes, since production nginx sends `/api/*` straight to Express.

- **Tiered failure semantics, so a monitor is not paged for a non-outage.** A core failure — API unreachable, database down, or qpdf missing — returns `503` with `"status":"down"`. An optional engine failing returns `200` with `"status":"degraded"` and a `degraded: […]` array naming it. veraPDF or Chromium being unavailable removes the PDF/UA verdict or page audits, but document auditing still works, so treating either as an outage would be wrong. Adding an uptime-monitor keyword alert on `degraded` is what catches a silently broken engine — veraPDF can die while every other signal reports a healthy 200.

- **Two independent cache TTLs.** Database aggregates refresh every 60s; engine probes every 10 minutes. The probes spawn processes including a veraPDF JVM, so a single short TTL would mean a monitor polling at UptimeRobot's 5-minute default misses the cache on *every* check — roughly 288 JVM starts a day purely to answer monitoring traffic. With the split, probe cost is bounded by the TTL rather than by poll frequency. `engines.checked_at` reports how stale a passing result is.

### Security

- **The status document discloses no identifying data, by construction and by test.** The endpoint is public, so every figure it reports is an aggregate `COUNT(*)` or a boolean about a local engine. No filename, email address, IP, user-agent, or content hash is serialized — filenames are consumed by the by-format `CASE` expression *inside SQLite* and never cross the module boundary. Probe failures collapse to a closed reason enum (`not_configured` / `not_executable` / `timeout` / `error`) rather than echoing subprocess stderr, which routinely embeds absolute paths; the real error is logged server-side only. This is the same class of leak v1.38.0 fixed for veraPDF, so it is enforced by a test that seeds identifying values and fails the build if any reaches the payload, plus an allow-list assertion on the top-level key set so a field cannot be added by accident.

- **`/api/status` is exempt from the global rate limiter and carries its own per-IP cap.** The Nuxt tier proxies `/status` over loopback, so every browser hit arrives at Express as `127.0.0.1` and shares one global bucket. Left under the global limiter, ordinary site traffic could exhaust that budget and 429 the status page — making it unavailable precisely when someone is checking whether the service is healthy.

- **Both `/status` and `/healthz` are excluded from search indexing**, via `robots.txt` and an `X-Robots-Tag: noindex, nofollow` response header. Both, because robots.txt is advisory and only consulted by well-behaved crawlers, while the header is honoured even when the URL is reached directly.

### Fixed

- **The qpdf check probes the binary the analyzer actually uses.** `qpdfService` resolves qpdf through a fallback chain (`$QPDF_PATH`, then `PATH`, then `/opt/homebrew/bin`, then `/usr/local/bin`); probing a bare `qpdf` instead would have reported a false **outage** anywhere PATH lacks those directories — the normal case under PM2 — returning 503 and paging an operator about a service that was auditing documents perfectly well. `QPDF_BIN` is now exported and shared.

- **A core failure reaches the caller with its diagnosis intact.** Express answers 503 *with* a full payload naming the broken component, but `$fetch` throws on any non-2xx, so the web tier would have discarded that body and reported a bare `"api":"down"` — throwing away the exact information the endpoint exists to deliver. When the API is genuinely unreachable the response is deliberately minimal (`{"status":"down","web":"ok","api":"down"}`) rather than partial, because without the API no count or engine result is knowable and emitting zeros would be a false statement rather than a missing one.

### Notes

Two metrics were considered and deliberately left out. **Page-audit counts** are available but excluded: the document-versus-web-page distinction is inscrutable to the non-technical readers this page is written for and raises more questions than it answers (the plumbing is generic over event types, so adding it later is a one-line change, and a test asserts the key is currently absent). **Report-sharing counts** are excluded because sharing is not observable — a row records that a report was *generated*, never whether its link was copied or sent to anyone — so any figure published under the word "shared" would be an assertion the application cannot support.

`/healthz` is unchanged and retained as a dependency-free liveness fallback: it runs no engine probes and touches no database, so it still answers when `/status` cannot.

Tests 1,644 → 1,698 (API 1,041 → 1,082 / Web 554 → 567 / CLI 49); lint, typecheck, build green.

## [1.38.2] - 2026-07-26

Completes the v1.38.1 reordering: the **second** PDF/UA panel now sits below the blocking issues too. No scoring change.

### Fixed

- **The "PDF/UA-1 signals" card no longer renders at the top of the report, above the critical issues.** v1.38.1 moved the veraPDF verdict below the blocking issues, but missed this second, separate PDF/UA surface — it is rendered by `ScoreCard` itself, so it appeared inside the score hero, above the "N critical issues must be fixed before publishing" banner. Both PDF/UA panels are now grouped together below the issues. `ScoreCard` gained a `showPdfUaSignals` prop (default `true`) so the remediation page's before/after cards are unchanged.

- **PDF/UA-1 signals are no longer presentable as a WCAG pass.** The card leads with a "Conformance signals · beyond the WCAG score" banner over a green "N of 6 essentials met" readiness box, which reads as a pass — on a document that may simultaneously carry critical WCAG failures. PDF/UA-1 essentials are *structural* markers (tagged, marked, fonts embedded); they cannot tell whether alt text is meaningful or the reading order makes sense, which is exactly what the grade measures. When Critical issues remain, the card now states that meeting the essentials does not mean the document is accessible, and names how many issues are still outstanding — counted with the same helper the action banner and the veraPDF panel use, so all three numbers agree.

Tests 1,637 → 1,644 (Web 547 → 554); lint, typecheck, build green.

## [1.38.1] - 2026-07-26

Report layout fix: blocking issues now come before the informational PDF/UA panel. No scoring change — every score, grade and verdict is byte-identical to v1.38.0.

### Fixed

- **Critical issues are now shown above the PDF/UA-1 (veraPDF) panel, not below it.** The two checks answer different questions, and only one of them decides whether a document can be published: PDF/UA-1 verifies the file's formal tagging, while the WCAG grade reflects whether people can actually use the document. Because of that, veraPDF can return a green "✓ Pass" on a document that still carries Critical WCAG failures — and the panel was rendering *above* the "N critical issues must be fixed before publishing" banner. An author, especially a non-technical one, reads the first green badge as "done" and stops scrolling. The order on both the audit page and shared reports is now: score → critical-issues banner → issues to fix (with fix steps) → auto-remediate / source-document notice → PDF/UA-1 panel → methodology → category scores. The ordering is pinned by a test so it cannot silently regress.

- **A PDF/UA-1 "Pass" no longer reads as a publishing green light while Critical issues remain.** When veraPDF passes but the document still has Critical WCAG failures, the panel now states plainly that this is not a green light, names how many critical issues are still outstanding, and explains the distinction in one sentence. It counts those issues with the same helper the action banner uses, so the two numbers can never disagree. A document that genuinely has no critical issues still shows the plain "Pass" exactly as before, and the panel is unchanged on the remediation page, which reuses it without category data.

Tests 1,624 → 1,637 (API 1041 / Web 534 → 547 / CLI 49); lint, typecheck, build green.

## [1.38.0] - 2026-07-26

A fresh-eyes review of the audit algorithms, followed by fixes for the five defects it confirmed. **This release changes scores and verdicts for some documents** — see the note at the end. It is also a **security release**: it closes a remotely-triggerable denial of service, a secret-inheritance gap, and a path-disclosure leak.

### Fixed

- **A structure tree that contains nothing is no longer treated as a tagged document.** Both the score and the WCAG verdict tested only whether a `StructTreeRoot` object *existed*. A file whose tag tree held nothing — every character of body text outside it — therefore earned a perfect Text Extractability (100) and a clean "no automated WCAG failures" verdict, while the **same file with the root stripped** correctly failed 1.3.1. Adding an empty root laundered a failing document into a passing one. Such a document now scores 50 (identical to untagged, which is what it is for a screen-reader user) and fails 1.3.1 with an explanation. The detection is a conjunction of independent signals, each of which must be *present-and-empty* rather than merely absent, so a gap in any single signal can only suppress the finding — never fabricate one.

- **Content images that were never tagged as `<Figure>` are now counted and failed.** They are *strictly worse* than a tagged figure with missing alt text — they are absent from the reading order entirely — yet the tool counted only tagged figures, so the worse case scored N/A and dropped out of the weighted average. A document with 10 untagged content images scored **100/A with a clean verdict**, while the same document with 1 of 10 figures missing `/Alt` scored 98/A and failed 1.1.1. Untagged content images now count against alt-text coverage and raise a confirmed 1.1.1 failure. The count is measured from PDF.js's artifact-aware content-stream walk, so graphics the author correctly marked as decorative `/Artifact`s are excluded — the noise that made this signal advisory-only before.

- **A `StructTreeRoot` written directly inside the Catalog is no longer invisible.** The root can be a direct dictionary rather than its own indirect object, in which case it is not an entry in the object map at all and the previous `/Type` scan could never find it. A real, populated structure tree consequently read as **depth 0** (reporting a false "flat tree" and dropping Reading Order to 30/Critical), headings fell back to object-number order instead of document order, the per-page MCID map came back empty so reading-order fidelity could never be computed, and the `/RoleMap` was only followed when the root was a reference — silently discarding role-mapped headings and tables. The root is now resolved through the Catalog's own pointer in either form, with the old scan kept as a fallback. `/RoleMap` resolution also moved to a pre-pass, so it no longer depends on the order objects happen to appear in.

- **A false "images painted beyond the tagged figures" advisory.** It compared the raw image count against the figure count, ignoring artifacts entirely — so a document whose only extra images were correctly artifacted decorative graphics was told they were "missing from the reading order entirely." It fired on a control that otherwise scored a perfect 100/A. Fixed as a consequence of the artifact-aware count above.

### Security

- **Denial of service via a crafted structure tree (fixed).** A PDF's structure tree is an object *graph*: nothing prevents a `/K` entry from naming an ancestor (a cycle) or two elements from sharing a child (a DAG). Four walkers — tree-depth measurement, list analysis, table analysis, and the page-tree fallback — resolved indirect references with no visited-set, so every *path* through the graph was re-expanded: cost grew exponentially in the depth limit rather than linearly in the object count. Measured against the unguarded code, a **three-object** cyclic tree took the depth walker **9 seconds** at a fanout of 2 and never returned at a fanout of 3. Because this work runs synchronously in the main API process (only the qpdf subprocess and the PDF.js pass were time-boxed), a single small upload could block the event loop for every other request, health checks included — and PM2's `max_memory_restart` could not catch it, since a blocked loop does not grow the heap. All four walkers now carry the same visited-set guard the other four walkers already had. Real documents are unaffected: all 23 control PDFs report byte-identical structure-tree depths.

- **veraPDF no longer inherits the API's secrets.** `buildChildSpawnEnv()` — the denylist already applied to qpdf and to the OOXML and remediation workers, precisely because they parse attacker-controlled bytes — was not applied to veraPDF, a JVM parsing hostile PDFs. As of v1.37.0 it runs on the main audit path for every PDF upload, so it was inheriting `JWT_SECRET`, `API_PRIVILEGED_TOKEN`, and the SMTP credentials on each one.

- **veraPDF concurrency is now bounded.** It runs alongside the analysis rather than inside it, and only the analysis took the 2-slot semaphore — so every in-flight upload spawned its own JVM, unbounded, on a box sized for two ~50 MB analyses. (The analyze rate limit bounds *rate*, not *concurrency*.) veraPDF now has its own budget, `REMEDIATION.VERAPDF_MAX_CONCURRENT`, acquired **before** the temporary file is written so a queued caller costs neither a JVM nor a copy of the upload on disk. If no slot frees up in time the PDF/UA panel is simply hidden — a supplementary check never takes the audit down with it.

- **Server paths no longer leak to clients.** When veraPDF failed, the underlying `Command failed: <binary path> --flavour ua1 … <temp path>` message was returned verbatim in the API response and persisted into shared reports. The detail now goes to the server log; callers get a generic message.

### Note on score changes

Re-auditing the same document can now produce a different score than it did on v1.37.5. Across the 23-document control corpus, **19 are byte-identical** and 4 changed — every one of them in the direction of catching a real barrier the tool previously missed, and no previously-clean document became failing except the one that genuinely should have. Shared reports saved before this release keep their original snapshot values, so a stored report and a fresh audit of the same file may disagree; the fresh audit is the correct one.

Tests 1,594 → 1,624 (API 1011 → 1041 / Web 534 / CLI 49); lint, typecheck, build green.

## [1.37.5] - 2026-07-23

Attribution and accessibility fix on the veraPDF panel's "Don't Panic" chip (follow-up to v1.37.4). No scoring change.

### Fixed

- **The "Don't Panic" chip now actually credits Douglas Adams — and is reachable by everyone.** The reference previously lived only in a native `title` tooltip, which requires a ~1s hover, never appears on touch devices, and is not announced to screen readers: for most people nothing happened, and the borrowed phrase read as uncredited. The chip is now a real `<button>` with `aria-expanded` that reveals an on-page footnote crediting **Douglas Adams** by name and citing _The Hitchhiker's Guide to the Galaxy_ (1979). A superscript asterisk marks it as a citation and is `relative`-positioned so it stays out of the line box — the chip's geometry is unchanged from v1.37.4. Collapsed by default; the `title` remains as a fast path for mouse users and now names Adams too.

Tests 1,591 → 1,594 (API 1011 / Web 534 / CLI 49); lint, typecheck, build green.

## [1.37.4] - 2026-07-23

Copy/UI polish on the veraPDF panel (follow-up to v1.37.3). No scoring change.

### Changed

- **The veraPDF verdict no longer leads with the word "Fail."** A non-conformant machine-check result now reads **"Additional checks could be addressed"** (the status icon softened from an amber `!` to a sky `+`), and "Fail" is gone from the reconciliation copy — framing PDF/UA-1 gaps as optional improvements rather than an alarm, consistent with the WCAG grade being the measure that matters for real users. The actual failing rules remain one click away in the existing "show the rule types" expander.
- **The "Don't Panic" reassurance badge is now larger and on its own line** (bold, uppercase), and its hover tooltip spells out the reference — _"In large, friendly letters. — The Hitchhiker's Guide to the Galaxy."_

Tests unchanged at 1,591 (API 1011 / Web 531 / CLI 49); lint, typecheck, build green.

## [1.37.3] - 2026-07-23

Follow-up to v1.37.2: makes the veraPDF panel reassuring and actionable when a strong WCAG grade sits beside a machine-check Fail. No scoring change (pure UI; controls corpus unchanged).

### Added

- **Grade-aware reconciliation on the veraPDF panel.** When PDF/UA-1 machine checks Fail, the panel now explains why that can coexist with a strong WCAG grade: a friendly **"Don't Panic"** badge when the grade is good (A/B), an honest "worth your attention" note when it's poor (C–F), and a neutral explainer when no grade is available (the remediation page's reuse of the panel). A collapsible "Why the tools differ — and what's worth doing" lays out that WCAG (graded, human-impact) and PDF/UA-1 (binary, formal file conformance) answer different questions — so Adobe Acrobat, PAC, and veraPDF can each differ from the grade — and frames the failures as a punch-list, not an alarm. The grade is threaded into the panel from the audit and shared-report pages.

### Fixed

- **CIDSet / font-embedding fix hint no longer recommends tag-stripping remediation.** The hint previously suggested "Distiller or Print-to-PDF," which flattens a tagged PDF and destroys its structure tree — trading a cosmetic conformance nit for a real accessibility regression. It now points to tag-preserving repairs (Acrobat Preflight font fix-ups, or a PDF/UA tool such as axesPDF) and explicitly warns against re-distilling.

Tests 1,584 → 1,591 (API 1011 / Web 531 / CLI 49); lint, typecheck, build green.

## [1.37.2] - 2026-07-23

Presentation fix for the veraPDF PDF/UA-1 verdict (v1.37.0): the panel no longer leads with the raw per-occurrence failure sum, which read as thousands of distinct problems and clashed with a strong WCAG grade on the same report. No scoring change (pure UI + verdict data-shape; controls corpus unchanged).

### Changed

- **The veraPDF verdict headlines the actionable count, not the occurrence sum.** veraPDF emits one failure _per occurrence_, so "Fail — 6,941 rule failures" overstated the work — it's really a handful of distinct rule types, each counted once per object. The panel now leads with **"N rule types to fix"** (the distinct-rule count), demotes the occurrence total to muted context, and adds a one-line explainer that veraPDF counts every occurrence separately — plus a Pareto callout ("the top 3 cause ~X% of them") shown only when there are ≥4 rule types **and** the top 3 genuinely cover ≥60% of occurrences (a flat spread is never dressed up as a Pareto). All counts use thousands separators; the checkpoint list renders most-frequent-first and reads "top 20 of N" when truncated.

### Fixed

- **veraPDF failures are now sorted by occurrence count before truncation.** The verdict stores the top 20 rules for compactness; previously they were sliced in veraPDF's emission order, so the stored list — and therefore both "most frequent first" and the new Pareto math — could omit the actual highest-count rules. Failures are sorted count-descending before the slice, and the true pre-truncation distinct-rule count is recorded on the verdict (`distinctRuleCount`, optional; reports saved earlier fall back to the shown-list length — no schema change).

Tests 1,572 → 1,584 (API 1011 / Web 524 / CLI 49); lint, typecheck, build green.

## [1.37.1] - 2026-07-22

Two follow-up enhancements that make the v1.37.0 PDF/UA-1 verdict actionable and at-a-glance. No scoring change (pure UI; controls corpus unchanged).

### Added

- **Per-checkpoint fix hints** on the veraPDF verdict panel: each failed Matterhorn checkpoint now shows a short, Acrobat-oriented "Fix:" line (e.g. untagged content → "Automatically tag PDF, then Fix reading order"; TH scope → "give each header cell a Scope of Row/Column"), keyed off the rule description with a safe generic fallback. Turns the panel from purely diagnostic into actionable.
- **PDF/UA-1 readiness headline** on the signals card: a deterministic "N of 6 PDF/UA-1 essentials met" rollup, computed from the always-runs signals (tagged, marked content, fonts embedded, language, title, PDF/UA identifier) — no veraPDF needed, so it's server-independent and shown on every PDF audit. Framed as structural essentials, distinct from the WCAG grade and the (config-gated) veraPDF verdict; structure depth and artifact count stay informational.

Tests 1,557 → 1,572 (API 1008 / Web 515 / CLI 49); lint, typecheck, build green.

## [1.37.0] - 2026-07-22

Feature: a **PDF/UA-1 (ISO 14289-1) machine-check verdict** on the audit results page and saved reports, via veraPDF — the automatable equivalent of PAC's Matterhorn checks (PAC itself is a Windows GUI with no CLI/API).

### Added

- **PDF/UA-1 verdict panel** on the audit page and `/report/:id`: a binary **Pass / Fail / "Could not validate"** badge plus an expandable list of failed Matterhorn checkpoints (clause · rule · description · count), honestly labeled as *machine-checkable conditions only* (never a bare "Conformant" — full PDF/UA conformance also needs manual review). Rendered by a shared `PdfUaVerdict.vue` component now reused by the remediation page too.
- veraPDF runs at `POST /api/analyze` **concurrently** with the analysis (`Promise.all`, cost = max), **PDF-only**, and **config-gated** on `REMEDIATION.VERAPDF_PATH` — the panel is hidden entirely when veraPDF isn't installed. A short-lived temp copy (its own, same pattern/lifecycle as the qpdf temp copy, deleted in the same request) feeds `verapdf --flavour ua1`; the verdict never throws and never blocks the audit. Audit-time runs use a shorter `VERAPDF_AUDIT_TIMEOUT_MS` (30 s) than the remediation job's 120 s, so a pathological PDF degrades to "Could not validate" instead of stalling.
- The verdict persists with saved reports (rides the existing whole-result JSON store — no schema change) and is disclosed in the data-retention audit-flow section.

### Notes

- **No scoring change.** The verdict is a standalone informational field beside the Strict grade — it does not affect the grade or any scored category. Verified against the 23-document controls corpus: 0/23 scores changed.
- **Deploy:** the audit tier needs the veraPDF binary installed and `REMEDIATION_VERAPDF_PATH` set for the panel to appear; consider veraPDF JVM memory/concurrency when enabling on a busy tier.

Tests 1,544 → 1,557 (API 1008 / Web 500 / CLI 49); lint, typecheck, build green.

## [1.36.3] - 2026-07-22

Follow-on to v1.36.2, same root cause. The user who reported the phantom-figure false positive on `controls/2022-DVFR-Annual-Report-A0.pdf` found the tool still counted **27 phantom `<L>` lists** (reported as "incomplete structure") and 3 phantom `<Table>` objects. v1.36.2 only de-phantomed `<Figure>`; this generalizes the reachability gate to all orphaned container tags. A0 goes 96/A → **100/A**.

### Fixed

- **Orphaned `<L>` and `<Table>` phantoms are pruned like `<Figure>`.** The qpdf walk collected every object carrying `/S` regardless of tree reachability, so InDesign/Acrobat export leftovers — container tags with no `/P` parent that are named by no element's `/K` — were scored as real structure: A0's 27 empty phantom lists produced 27 false "incomplete structure" list findings (and a false WCAG 1.3.1 malformed-list conformance failure), and 3 phantom tables dragged `table_markup` to 70. `<Figure>`, `<L>`, and `<Table>` are now collected only when reachable (`structReachable`), and the reachability set (`referencedStructRefs` + a `docHasStructTree` guard, so untagged documents are never pruned) is built in a pre-pass. Headings, paragraphs, MCIDs, and other signal counts are not gated (no control document carries orphaned ones).

Controls corpus: 22 of 23 PDFs byte-identical; A0 96/A → 100/A (lists 71 → 44, tables 5 → 2, `table_markup` 70 → 100, conformance failures 1 → 0). Tests 1,541 → 1,544.

## [1.36.2] - 2026-07-22

Accuracy patch prompted by a user-reported document (`controls/2022-DVFR-Annual-Report-A0.pdf`) that v1.36.1 scored 89/B with a false "3 of 6 images missing alt text" finding; it now scores 96/A with a clean, accurate verdict. Two related fixes to PDF image handling:

### Fixed

- **Orphaned `<Figure>` phantoms are no longer scored as images.** The qpdf walk collected every object carrying `/S /Figure`, including struct objects that are not reachable in the live structure tree — no `/P` parent and named by no element's `/K`. Design tools (notably InDesign → Acrobat) leave these phantom figures behind; a screen reader never encounters them, so counting them as real images (and flagging a missing `/Alt`) was a false positive. A figure now survives only if it is reachable (`figuresWithParent || referencedStructRefs`) — `qpdfService.collectStructKidRefs`. The reported document carried 6 such phantoms (3 without `/Alt`); every other control document has zero, so only that file's score moves.
- **Fully-artifacted image sets read as "no content images", not "untagged images".** When the struct tree has 0 figures but the page paints images, the scorer now consults pdfjs's new `nonArtifactImageCount` (painted images outside any `/Artifact` run). If every painted image is a decorative artifact — and qpdf sees no image objects beyond those — the category reports a clean N/A ("all images are decorative artifacts, no alt text required") instead of the alarming "images detected but no `<Figure>` elements" manual-review advisory. The advisory still fires for genuinely untagged content images.

Controls corpus: 22 of 23 PDFs byte-identical; the reported document 89/B → 96/A. Tests 1,537 → 1,541.

## [1.36.1] - 2026-07-19

Accuracy patch prompted by a real accessible static-XFA form (`controls/example-8`) that v1.36.0 scored 90/A with a refused ("incomplete — XFA") verdict; it now scores 96/A with a clean verdict. Four fixes:

### Fixed

- **Static XFA is audited normally.** The v1.36.0 "XFA → incomplete" rule now fires only for DYNAMIC XFA (catalog `/NeedsRendering` true — the placeholder-page case). Static XFA ships a full conventional rendering that is exactly what viewers display; refusing a verdict there wrongly withheld clean verdicts from accessible Designer forms. Static XFA gets a not-scored disclosure in Form Accessibility instead ("the XFA template layer itself was not separately audited").
- **Indirect catalog references are resolved.** Designer/LiveCycle output stores `/Lang` and `/ViewerPreferences /DisplayDocTitle` as indirect references; the parser read the raw reference string, reporting "252 0 R" as the document language and treating a set DisplayDocTitle as missing (a false −15 on the title). Scalar reference targets (v2 `{value}` wrappers and v1 bare scalars) now resolve; `/NeedsRendering` gets the same treatment.
- **Reading-order lower bands are Moderate, not Critical.** 50–80% tag-vs-draw-order agreement is routine for correctly tagged forms (fields paint in creation order; tags order logically) and the metric cannot say which side is wrong — the band now scores 65 (was 40) and <50% scores 30 (was 10); the 1.3.2 manual-review notAssessed entry covers both lower bands. No control-corpus document sat in these bands, so all 22 prior scores are unchanged.
- **`/Headers`-associated tables no longer lose Scope points.** The explicit `/Headers` attribute is a complete, spec-correct association method (the conformance gate and PAC already treat Scope-or-Headers as equivalent); missing `/Scope` on such tables is now a belt-and-braces advisory instead of a deduction.

Controls corpus: all 22 pre-existing documents byte-identical; example-8 90/A "incomplete" → 96/A "no-automated-failures". Tests 1,528 → 1,537.

## [1.36.0] - 2026-07-19

Accuracy & verdict-integrity release — the full P0/P1/P2 fix set from the 2026-07-19 four-agent review of the audit algorithms, across all four formats. Governing principle now enforced everywhere: **never assert a confirmed WCAG violation (or a Critical score) from a defaulted or unresolved value** — unresolved becomes notAssessed/advisory instead.

### Fixed — false confirmed verdicts and silent passes

- **AT-blocked encrypted PDFs are caught** (the worst silent pass): qpdf's `encrypt.capabilities.accessibility` is now read; legacy-encrypted files that deny screen-reader access were scoring 100/A with a clean verdict — they now fail 1.1.1 with a Critical text-extractability finding (PDF/UA 7.16 / Matterhorn 26-002). The Adobe-parity panel simultaneously stops failing *every* encrypted document.
- **Short born-digital PDFs are no longer "scanned images"**: the confirmed 1.1.1 scanned-document claim now requires truly zero extracted text AND page images (the 50-character `hasText` heuristic remains scoring-only, with honest "minimal text" wording); `isScanned` follows the same rule.
- **DOCX contrast** resolves table-cell shading (`w:tcPr/w:shd`) and treats styled-table and text-box backgrounds as unresolved — white-on-dark header rows (the correct practice) no longer produce confirmed 1.4.3 failures at "1:1". **PPTX contrast** requires background provenance (explicit same-shape or slide `bgPr` fill; layout/master/`bgRef` backgrounds are unresolved) and no longer holds inherited-size titles to the 4.5:1 bar in the 3.0–4.5 band.
- **Word text boxes are not images**: drawings are classified by `graphicData` URI, so text-bearing shapes no longer fail 1.1.1 for missing alt (pictures/charts/SmartArt still require it).
- **PPTX language**: run-level `a:rPr@lang` (where PowerPoint actually stores language) satisfies 3.1.1 via a dominant-language fallback — Google Slides exports no longer get false "no language declared" failures.
- **XLSX link text is read from the linked cells** (shared strings incl. rich runs, inline strings, cached values; range refs use their first cell; `display` is the fallback) — real workbooks had every link flagged "(empty)". Unresolvable links are excluded from judgment, never counted as violations.
- **Reading order**: the struct-tree vs content-stream comparison measures DRAW-order agreement, which cannot prove the tags are wrong — heavy divergence is now a notAssessed manual-review item instead of a confirmed 1.3.2, the 0.8–0.97 band deducts lightly (85), and all prose says "draw order". Professionally remediated documents are no longer punished for re-ordering tags.
- **Gate scope corrections**: PDF table claim gains the ≥2×2 layout filter the OOXML gates had; DOCX headerless-table claims skip layout-like tables (no style/borders/shading/header marks) and honor `w:tblHeader w:val="0"` + first-row semantics; XLSX skips single-column banded lists; hidden Excel sheets, hidden/NoView form fields, and hidden slides no longer drive findings; XFA (LiveCycle) forms return an honest `incomplete` instead of failing their placeholder page; DOCX gains the `incomplete` state for unparseable bodies plus per-part parse tracking (unreadable styles/core parts no longer produce confirmed 3.1.1/2.4.2 claims); Figure `/ActualText` counts as a text alternative; `mc:AlternateContent` is walked Choice-only (text-box content was double/triple-counted, inflating verdict evidence).

### Changed — cross-format scoring equity

- **One link-text doctrine** (`classifyLinkText` shared in scoring/common.ts): raw URLs satisfy 2.4.4 and are advisory-only in every format (DOCX previously scored an all-URL memo 0 while its PDF twin scored 100); vague phrases ("click here") are penalized everywhere (PPTX/XLSX previously let them pass).
- **One alt-text convention**: any missing alt caps the category at 85 (Minor ceiling) and all-decorative is N/A in DOCX, PPTX, and XLSX alike; Title-only alt (AT reads Description, not Title) counts as missing with a targeted advisory.
- **Proportional deductions with floors/caps** replace linear cliffs: slide titles and sheet names score by ratio (floor 40 / cap 85 — a 95%-titled 100-slide deck was scoring an identical 0 to an all-untitled one), heading-level skips cap at −30.
- **Parity**: a heading-less SHORT PDF scores heading_structure N/A like DOCX (same memo was 70/C as PDF, 100/A as DOCX; substantive documents keep the 0); missing XLSX title scores 50 like every other format (was a full-category 0); XLSX "Advisory:" labels no longer deduct (merged cells are a note; a workbook with no header semantics anywhere caps table_markup at 60 with honest wording; pivot sheets stop getting impossible "Insert → Table" advice); PPTX reading_order is N/A when no visible slide has a title (was a vacuous 100).
- **DisplayDocTitle** (`/ViewerPreferences`) is parsed: a title that viewers won't show earns 35/50 with a targeted fix, and the Adobe-parity Title rule now reports Acrobat's actual verdict; parity list/nesting rules stop fabricating "passed" (nesting derives from the real skip detection).
- Executive summary A/B branches never claim "cleared every check" beside a Critical/Moderate category.

### Added — extraction coverage

- DOCX: headers/footers, footnotes/endnotes (images, hyperlinks with per-part rels, contrast), field-code hyperlinks (`fldSimple` + `instrText` begin/separate/end), legacy VML images (`w:pict`/`v:imagedata` with `v:shape@alt`), custom heading styles via `outlineLvl`/`basedOn` chains and direct paragraph `outlineLvl` (agency `ChapterTitle` templates were invisible AND flagged fake), style-level list numbering + `numId=0` exclusion + numbered headings no longer "manual bullets", empty-heading advisory.
- PPTX: master-inherited bullets for body placeholders, decorative pics excluded from title-first, group-level alt/decorative covers members, consecutive link runs merged + picture-level links, slide order from `sldIdLst`, hidden-slide detection, `firstRow` ST_Boolean.
- XLSX: chartsheets audited (chart alt review) with generic rels-path resolution, used-range = max(declared dimension, real cells), text-extractability keyed to actual cell values with text-box disclosure, localized default sheet names (Hoja/Feuil/Tabelle/…, copy suffixes), pivot detection, defined-table column spans.
- PDF: MarkInfo `/Suspects` advisory, painted-images-beyond-figures advisory (partial tagging no longer claims full alt coverage), qpdf v2 stream-object unwrap (the image-XObject census was permanently zero on modern qpdf; test fixtures regenerated to the true v2 shape).

Verified against the 19-document controls corpus: PDF scores essentially unchanged (±3 — DisplayDocTitle docking vs reading-order softening), both sample decks and both public datasets shed exactly their false confirmed failures (sample-1 83/B fail(3) → 92/A fail(1); rdca datasets 76/C → 90/A). Tests 1,418 → 1,528 (API 986 / web 493 / CLI 49); lint, typecheck, build green.

## [1.35.0] - 2026-07-19

Uptime-monitoring release: one probe URL now proves both production processes are up.

### Added

- **`GET /healthz` aggregate health endpoint** (Nitro server route: `apps/web/server/routes/healthz.get.ts` + `server/utils/health.ts`). Production nginx routes `/api/*` straight to Express and everything else to Nuxt, so the two PM2 processes fail independently and no single URL proved both were up (`/` covers only the web tier, `/api/health` only the API). `/healthz` is served by the web process and probes the API's existing `/api/health` over loopback (3 s timeout, no retries; default `http://127.0.0.1:<API_PORT>`, overridable via `NUXT_API_INTERNAL_URL`): `200 {status:"ok",web:"ok",api:"ok",apiUptime}` only when both tiers answer, `503 {…,api:"down"}` otherwise — point one external uptime monitor (e.g. UptimeRobot) at `https://audit.icjia.app/healthz` and it alerts if either process, or nginx itself, is down. Deliberately independent of the dev-only Nitro `/api/**` proxy routeRule; responds `Cache-Control: no-store`; `robots.txt` disallows the path for crawlers (uptime monitors don't consult robots.txt).
- **Uptime-signal integrity:** a 429 from the API's own rate limiter counts as alive — `/healthz` itself is un-throttled on the Nitro tier while its loopback probe shares the API's `127.0.0.1` rate bucket, so without this a >100 req/min flood at `/healthz` could fabricate a false "API down" alert. Only 429 is special-cased; any other HTTP error still reports down.

### Changed

- README documents the health endpoints and monitoring setup (Deployment § Health checks & uptime monitoring); data-retention § 10 gains the auditor-facing entry.

Tests 1,410 → 1,418 (API 876 / web 493 / CLI 49); lint, typecheck, and build green; verified end-to-end against the built Nitro output (API up → 200; API killed → 503 in ~7 ms).

## [1.34.0] - 2026-07-12

Infrastructure, hardening, and structural-quality release from a five-track whole-app review: the codebase gains CI, linting, and a proper package boundary around the audit engine; the app gains five preventive security hardenings; the scoring engine and report output are unchanged (PDF and Word remain frozen for calibration — verified by the untouched 876-test API suite passing throughout).

### Added

- **GitHub Actions CI** (`.github/workflows/ci.yml`): every push and pull request runs install → lint → typecheck → build → all three test suites. This mechanically enforces the previously manual "build before push" convention (Vitest's esbuild pipeline does not catch `tsc` errors).
- **ESLint + Prettier + `.editorconfig`** repo-wide, with `pnpm lint` / `pnpm format`; the whole repo was formatted once in a dedicated logic-free commit.
- **`pnpm typecheck`** — API `tsc --noEmit` plus the web app via `nuxt typecheck` (`vue-tsc`); the Nuxt build previously never type-checked the web app.
- **Vitest v8 coverage** scripts in all three apps (non-gating), and the root `pnpm test` now runs the CLI suite too (it was silently skipped — the filter used the wrong package name).
- **Server-side session revocation.** Sign-out now revokes the JWT's `jti` in a denylist checked by the auth middleware, so a captured cookie is dead after logout instead of valid until expiry; legacy tokens without a `jti` simply age out.
- **Numbered SQLite migrations** on `PRAGMA user_version` replace the grown-per-release probe-and-`ALTER` blocks; an existing production database fast-forwards to the baseline without re-running DDL (dual-guarded and regression-tested against the literal legacy schema).

### Changed

- **The audit engine is now a workspace package: `@file-audit/analyzer`** (`packages/analyzer`) — the PDF/Word/PowerPoint/Excel analyzers, qpdf integration, OOXML child worker, and all scoring moved out of `apps/api` as a byte-identical closure; the API keeps thin re-export shims so every internal import (and all 876 API tests) is unchanged. The CLI now depends on the package instead of reaching into API source by relative path, declares its real dependencies, and its never-used `tsup` bundle/`bin` was removed (it runs via `tsx` everywhere).
- `scorer.ts` split into per-format modules (`services/scoring/{pdf,docx,pptx,xlsx,common}.ts`) behind a facade; qpdf struct-tree walkers extracted to a leaf module; the `analyze-url`/`audit-url` routes share one extracted fetch-and-detect pipeline service.
- **Web maintainability pass:** the homepage's 2,100-line technical explainer is a lazily-hydrated component (`hydrate-on-visible`) and the data-retention policy is split into per-section components — both proven byte-identical in SSR output; the history pages share one paginated table; the five export buttons are one `ReportDownloadBar` component; export builders are pure utils; `file-saver` was replaced by a native download helper; the report page's data path is fully typed against `@file-audit/shared` (no `as any` casts remain).
- The data-retention page now reports the real app version from runtime config (it was hardcoded at "1.18.0" while the app shipped 1.33.0), and the page-metadata `dateModified` derives from the last git commit at build time instead of manual edits.

### Fixed

- **Accessibility of the tool's own UI:** analysis progress and error banners are now announced to screen readers (`role="status"` / `role="alert"` live regions), every data table has `scope="col"` headers and a visually-hidden caption, and keyboard/screen-reader focus moves to the results heading when an analysis completes.
- `@types/express` matched to the installed Express 4 runtime (the v5 typings could bless code that breaks at runtime); multer typings aligned likewise.
- The CLI reports its real version (was hardcoded `1.0.0`) and renders its HTML grade palette from `@file-audit/shared` instead of hand-copied hex values.

### Security

- **Preventive hardening, no known exploitation:** OOXML packages are rejected before parsing if they exceed aggregate zip limits (entry count / total declared uncompressed size — a many-part zip-bomb fast-fail ahead of the existing per-part caps and child-process timeout); OOXML XML parts containing a `DOCTYPE` declaration are refused outright (entity-expansion defense); remediation job status/receipts in anonymous mode now require the job's private token and answer plain 404 otherwise (no job-existence oracle); application secrets were already stripped from child-process environments (v1.33.0) and the API process now carries top-level `unhandledRejection`/`uncaughtException` guards.

Tests 1,286 → 1,410 (API 876 / web 485 / CLI 49), build, lint, and typecheck green throughout.

## [1.33.0] - 2026-07-03

### Added

- **PowerPoint (`.pptx`) and Excel (`.xlsx`) accessibility auditing** — the tool now audits all four major document formats (PDF, Word, PowerPoint, Excel) through one scoring engine. Per-format WCAG 2.2 AA scoring (PowerPoint 9 categories, Excel 7) with a separate binary conformance verdict, matching the existing PDF/Word model.
- Fleet (`/api/audit-url`), bulk (`/api/bulk-from-inventory`), and the CLI `publist` command now audit all four formats, not PDF-only.
- Explicit rejection of legacy binary formats (`.xls` / `.doc` / `.ppt`) in the upload dropzone, with guidance to re-save as the modern format.
- The report's **Document Metadata** panel now renders for Word, PowerPoint, and Excel (title, creator, language, and page/slide/sheet counts as applicable), not only PDF.

### Changed

- OOXML analysis (Word/PowerPoint/Excel) now runs in an interruptible child process, so an analysis timeout genuinely cancels the work.
- App-wide copy sweep: every UI surface, doc page, diagram, and the social-preview image now present a four-format tool rather than a PDF-centric one.

### Security

- Full three-team red/blue re-audit of the four-format attack surface (parser/DoS, injection/XSS, logic/bypass); every confirmed finding fixed test-first: OOXML DoS hardening (cap-before-walk on shapes/text/cells, an XLSX drawing-part cumulative byte budget), a `publist` download-link scheme guard, `err.message` info-leak fixes on the bulk and page-audit routes, store-sanitize consistency across all shared-report inserts, a CSV formula-injection guard, and stripping application secrets from every child-process environment (OOXML, remediation, and the qpdf subprocess).

### Note

- The PDF and Word audit paths are unchanged (frozen for scoring calibration).

## [1.32.1] - 2026-07-02

Bugfix: the auto-remediation progress page no longer rate-limits itself. Clicking **Auto remediate this file** on any job longer than ~25 seconds made the page's own status polling (every 250 ms = 240 requests/min) drain the anonymous global rate-limit budget (100/min/IP), so the UI reported "Too many requests" mid-job — even though the remediation itself was completing fine on the server.

### Fixed

- **Remediation status polling is no longer counted against the global burst limiter.** `GET /api/remediate/:jobId/status` is skipped by the catch-all limiter and guarded by its own dedicated flood cap instead (`RATE_LIMITS.remediationStatus`, 600/min/IP — the endpoint is a single indexed SQLite read). The dedicated limiter runs ahead of the remediation feature-flag gate, so the cap holds even on servers with remediation disabled. Live-verified: 150 rapid status polls produce zero 429s while other routes still throttle at exactly 100/min; 650 polls admit exactly 600.
- **The progress page polls politely and recovers from throttling.** The poller now runs at 1 s (was 250 ms) on a self-scheduling timer that never stacks overlapping requests, backs off exponentially on any failure (2 s → 4 s → capped at 8 s), treats a 429 as silent back-off feedback rather than a job failure, and clears the error banner as soon as a poll succeeds — previously a transient error message stuck on screen forever.

13 new tests (API 613 / web 319 — 932 total).

A structural-quality pass across all three apps, a follow-up red/blue security audit of those changes, and CSP hardening — the browser now refuses injected inline scripts outright.

### Added

- **`packages/shared` (`@file-audit/shared`) — one source of truth for scoring.** The scoring profiles, grade/severity thresholds, category weights, and WCAG category map moved out of `audit.config.ts` (which now re-exports them, so every `#config` consumer is unchanged) into a browser-safe workspace package the web app imports directly; the report-payload types (`CategoryResult`, `ScoreProfileResult`, …) moved out of `scorer.ts` the same way. The web UI now **derives** the Scoring Rubric weights, the grade table, and every grade/severity colour from this package instead of hand-copied literals — the copies had already drifted (see the Bookmarks/Reading Order fix below). A grep of the built client bundle confirms the package carries no secrets into the browser.
- **Nonce-based `script-src` Content-Security-Policy.** Production `script-src` no longer allows `'unsafe-inline'`. A per-request nonce is minted in a Nitro plugin (`apps/web/server/plugins/csp.ts`) and stamped onto every `<script>` Nuxt emits (hydration payload, color-mode init, JSON-LD), so an injected inline script — or a `javascript:` URI — is refused by the browser. `style-src` keeps `'unsafe-inline'` (Vue `:style` object bindings emit inline style _attributes_, which nonces cannot cover). Verified against a production build in-browser: zero CSP violations, working hydration and color-mode, and an injected inline script blocked.

### Fixed

- **Scoring Rubric weights corrected.** The methodology modal showed Bookmarks **10%** / Reading Order **5%**, but the engine's strict profile weights them **5% / 10%** — the two were swapped for several releases. The modal now derives its numbers from the engine, so it cannot drift again.

### Changed

- **The live audit page and the shared-report page now render a single shared `ReportContent` component** (Score Table, Document Metadata, Detailed Findings, "Not Included in Scoring") instead of ~635 duplicated template lines plus ~14 duplicated helpers on each page. The copies had already drifted and previously caused a production 500 (`0f39c96`). The dead `CategoryRow` / `AdobeParityCard` components and the retired "Practical"-mode scoring branches (unreachable since v1.21.0) were removed, and `src/spike/` was taken out of the API build gate.
- **`services/urlPolicy.ts`.** The SSRF / URL-allowlist policy moved out of the `analyze-url` route into a service, so the four URL-fetch routes import one implementation and the SSRF tests exercise the real code instead of a re-implemented copy that could drift.

### Security

- **Follow-up red/blue audit** of the structural changes (three parallel red-team passes, every finding verified against the code). The two headline changes were clean — the URL-policy extraction is behaviour-preserving (a mutation test broke 22 tests, proving the suite gates the allowlist) and `@file-audit/shared` leaks no secrets into the client bundle. The audit surfaced and **fixed** two pre-existing issues on the public shared-report render path:
  - **Stored XSS via report help-link URLs.** `POST /api/reports` stored arbitrary JSON validating only `filename`/`overallScore`, so a report's `helpLinks[].url` was attacker-controlled and rendered into an `<a href>` unvalidated — a `javascript:` URL executed on click (CSP permitted it under `'unsafe-inline'`, since fixed above). Help-link URLs are now scheme-validated to `http(s)` at the store boundary (recursively, including nested `scoreProfiles.*.categories`) and again at the render sink, and the HTML export routes them through the same guard.
  - **Malformed stored reports could 500 the public page.** A forged report with a non-array `categories`/`findings`, or a `conformance` object missing its arrays, crashed SSR (`reading 'length' of undefined`). The render path now coerces those to safe defaults and the store boundary rejects a non-array `categories`.

### Tests

- **919 tests across 54 files** (`tsc --noEmit` and `nuxt build` clean). New coverage for the remediation subsystem (jobs, events, cleanup), the extracted URL policy, the shared scoring constants, the shared `ReportContent` component, the help-link URL-scheme guard, the report store-sanitizer, and the CSP header builder.

## [1.31.1] - 2026-07-01

### Fixed

- **HTML export drops the now-inert toggle controls.** Because the export is a static snapshot with everything pre-expanded, the interactive affordances it captured — the per-category **"Basic / Advanced"** technical-signals pill, the **"Show / Hide fix steps"** chevron on issue rows, and the "click a row" hint — had nothing to do: they were visible but dead. They are now removed from the export (marked `data-export-exclude`), while all the content they revealed stays fully expanded. The live page keeps them, unchanged. Pure-CSS affordances that still function in a static file (the N/A cell "i" tooltips, native `<details>`) are left intact. Verified in-browser on a PDF export: 4 Basic/Advanced pills on the live page → 0 in the export, with the technical-signals content shown in full.

## [1.31.0] - 2026-07-01

The downloadable HTML report is now a faithful snapshot of the live results — identical content and wording, fully expanded, no interaction required. For both PDF and Word.

### Changed

- **HTML export = the live report, exactly.** The HTML download was previously a separately hand-built document (`buildHtml()`), which drifted from the on-screen report: mismatched wording, and missing the methodology card, the disclaimer, and per-category detail. It now **snapshots the actual rendered results DOM** (`[data-report-content]`) and inlines the app's stylesheet + color mode so the file renders standalone. Collapsed sections are auto-expanded first (the document needs no interaction and shows everything), and interactive-only controls (Remediate button, action bar) are dropped. This guarantees the download can never disagree with what the author saw — critical for the reports sent back to authors when a file fails accessibility. `buildHtml()` is retained only as a fallback for when there is no live DOM (SSR / programmatic use). Verified end-to-end in-browser on a Word result: the export is byte-faithful to the live page (banner, grade, conformance, executive summary, disclaimer, issues with fix steps, methodology, scored + "Not Included in Scoring" tables, and all detailed findings).
- Markdown and plain-text exports retain the v1.30.3 scored-vs-N/A split.

## [1.30.3] - 2026-07-01

Extend the v1.30.2 export-parity fix to the Markdown and plain-text exports.

### Fixed

- **Markdown and plain-text exports** now use the same scored-vs-N/A split as the HTML export, the live page, and the shared report: scored categories in the category table, a separate "Not Included in Scoring" section for the N/A ones ("Not assessed" vs "Not applicable", with the reason), and detailed findings for scored categories only. All four surfaces (live, shared, HTML, Markdown/text) now present a Word (or PDF) result identically.

## [1.30.2] - 2026-07-01

Fix: the downloaded HTML report now matches the live page and shared report exactly.

### Fixed

- **HTML-export category parity.** The downloadable HTML report listed every category in one table (rendering N/A categories as a bare "N/A") and showed detailed findings for all of them, while the live page and the shared `/report/:id` page split categories into a scored table plus a separate **"Not Included in Scoring"** section — distinguishing "Not assessed" from "Not applicable" (as the `NaCell` component does) — and show detailed findings only for scored categories. The HTML export now mirrors that structure exactly. Most visible on Word (.docx) results, which have several N/A categories (reading order and forms always; tables / images / contrast when absent) — e.g. a document that shows 5 scored categories on the page previously showed 10 rows in the export.

## [1.30.1] - 2026-07-01

Documentation and diagram consistency for the v1.30.0 Word (.docx) feature — no code paths changed.

### Changed

- **The `/technical-details` page, the "What this tool does" hero, and the Scoring Rubric modal now reference both PDF and Word.** The audit pipeline is explained for both formats (PDF's two-tool qpdf/pdfjs path vs. Word's fully in-process JSZip + fast-xml-parser path), a `.docx` format primer and Word's rubric differences (contrast scored, List Structure category, Reading Order / Form Accessibility N/A) are documented, PDF-only sections (remediation, "why two tools") are labelled as such, and JSZip + fast-xml-parser are added to the open-source toolchain table.
- **The audit-pipeline flowchart is redrawn to show the PDF vs. Word branch**, regenerated from its mermaid source. The diagram generator now launches the system-installed Chrome (portable, no `puppeteer install` needed), and `mermaid` + `svgo` are re-added as dev-only dependencies for diagram generation (not shipped to the browser).

### Tests

- 880 tests pass; `tsc --noEmit` and `nuxt build` clean.

## [1.30.0] - 2026-07-01

Microsoft Word (`.docx`) accessibility auditing alongside PDF, plus a three-front adversarial red/blue audit of the new untrusted-input surface with all findings mitigated.

### Added

- **Word (`.docx`) accessibility checker.** Upload a `.docx` for the same WCAG 2.2 AA / IITAA / ADA Title II audit as PDFs. A `.docx` is parsed as OOXML in pure JS (`jszip` + `fast-xml-parser`, no external binary) and mapped onto the shared scoring model, conformance gate, report UI, exports, and CLI. It extracts document title/language, heading structure (with fake-heading detection), image alt text, table header rows, hyperlink text quality, list semantics, and **machine-checkable color contrast** (Word stores explicit + theme colors, so 1.4.3 is checked here — unlike PDF). Reading order and form accessibility show as N/A; `list_structure` is a new Word-specific category (WCAG 1.3.1). A single dropzone auto-detects PDF vs Word by file _content_; results, exports, hero copy, SEO/OG, and the CLI all adapt.
- **`DOCX_ENABLED` feature flag** (`audit.config.ts`, env `DOCX_ENABLED`). On by default; set `false` for a clean PDF-only fallback across the upload, URL, and CLI paths with no code change. The PDF pipeline is behaviourally unchanged.
- **Results-page UX.** A large Reset / Export-Results action bar atop each result and a floating back-to-top button. The source-document, methodology, and conformance cards adapt their copy for Word vs PDF, and the announcement banner promotes `.docx` with a visible "Updated" date.

### Security

- **Adversarial red/blue audit of the new `.docx` surface** (ZIP/XML parsing, DoS/concurrency, injection/XSS/dispatch/auth) with all confirmed findings fixed test-first: a **decompression-bomb** guard (streaming per-part uncompressed-size cap, `DOCX.MAX_UNCOMPRESSED_BYTES`); the docx path now shares the PDF **concurrency semaphore + a wall-clock timeout** plus a `MAX_PARAGRAPHS` cap; `escapeHtml` on the HTML export's numeric/grade fields + type-validation in the report store; and the URL route no longer echoes raw error messages. XXE, billion-laughs, prototype pollution, deep-nesting, zip-slip, ReDoS, and the docx-string XSS vector were verified already-safe. Full writeup in [README § Security](README.md#security).

### Fixed

- **Dev server: `TMPDIR=/tmp` for `nuxt dev`.** On macOS the default `$TMPDIR` made the vite-node dev socket path exceed the 104-char unix-socket limit, intermittently killing `pnpm dev`. Pinned in `apps/web` (dev-only; a no-op on Linux where `/tmp` is already the default).

### Tests

- API suite now **561**, Web **319**, total **880** (new: docx extractor, scorer, conformance, dispatcher, and integration suites, plus a zip-bomb streaming-cap test). `tsc --noEmit` and `nuxt build` clean.

## [1.29.0] - 2026-06-27

Two-tier rate limiting with an optional privileged bearer token, plus a strict revert of the anonymous limits left elevated by the fleet-audit campaign.

### Added

- **Privileged API token (`API_PRIVILEGED_TOKEN`).** A single static bearer token (env var; never committed) that promotes a request carrying `Authorization: Bearer <token>` from the strict anonymous tier to a generous one **and** lets it audit URLs outside the ICJIA / illinois.gov allowlist (any _public_ URL). It is independent of the OTP/JWT/DB-PAT auth system, which stays off. It grants only those two things: it never bypasses the private/reserved-IP SSRF block (enforced independently in both the `safeFetch` and headless-Chromium paths), the 15 MB cap, the http(s)-only rule, or the 2-slot concurrency semaphores — a leaked token cannot reach internal services. Unset/empty → feature off → every request is anonymous. Constant-time compare; read from `process.env` (mirrors the `JWT_SECRET` pattern).

### Changed

- **Anonymous rate limits reverted from the campaign bump and split into tiers.** `RATE_LIMITS.analyze`: anon **500/hour per IP** (was 5000 for everyone), privileged **5000/hour**. `RATE_LIMITS.global`: anon **100/min per IP** (was 1000 for everyone), privileged **1000/min**. The strict anonymous tier blocks the "thousands of requests an hour" abuse case while still admitting a known automated client (~320 single-IP files) with retry headroom; the privileged tier carries the fleet-audit pipeline. The true resource ceiling remains the 2-slot concurrency semaphore.

### Security

- Reverting the loose campaign-era anonymous limits tightens the public abuse surface, and the allowlist bypass is gated behind the token while never relaxing the SSRF (private-IP) controls. Running review history is in [README § Security](README.md#security).

### Tests

- API suite now **510** (13 new: `rateLimiter.test.ts` covering the constant-time token check, tier selection, and a live limiter test proving a token exceeds the anonymous cap on the same IP; plus a `pageAuditGuard` case proving the allowlist bypass still forces the private-IP check). Web **317**, total **827**. `tsc --noEmit` and `nuxt build` clean.

## [1.28.1] - 2026-06-10

### Fixed

- **Missing loading-spinner icon (404 on `/api/_nuxt_icon/...`).** `@nuxt/icon` (bundled by Nuxt UI) defaults its icon-data endpoint to `/api/_nuxt_icon`, which this app's `/api/**` proxy forwards to the Express backend — so icon requests (e.g. the Nuxt UI `:loading` spinner `lucide:loader-circle`, seen when starting an auto-remediation) 404'd. The v1.27.0 CSP (`connect-src 'self'`) also blocked the external Iconify fallback. Fixed by moving the icon endpoint off `/api` (`localApiEndpoint: '/_nuxt_icon'`), client-bundling the icons we use (so the spinner needs no runtime fetch), and disabling the external API fallback. Verified: the new endpoint returns the icon data and `lucide:loader-circle` is bundled into the client.

## [1.28.0] - 2026-06-10

Front-end simplification and performance: two heavy client dependencies removed, diagrams made static. No change to the audit/scoring engine.

### Changed

- **Word (.docx) export replaced with plain text (.txt).** The Word export pulled in the ~0.5 MB `docx` library for no real benefit over the existing Markdown/HTML/JSON formats. It is replaced with a dependency-free plain-text report (filename, scores, conformance verdict, category scores, detailed findings). The `docx` dependency is removed entirely.
- **Mermaid diagrams are now pre-rendered to static SVG.** The diagram sources never change at runtime, so they are rendered once at dev time (`scripts/generate-diagrams.mjs`) to dark-theme SVGs, SVGO-optimized, and served as lazy-loaded, cached `<img>` assets. This removes the ~640 KB mermaid runtime from the browser (the 7 SVGs gzip to ~11 KB total). Diagrams render identically, now with zero diagram JS.
- **Auth gating removed from `/history` and `/my-history`.** These already passed through in the default no-auth mode (`AUTH.REQUIRE_LOGIN=false`); the now-pointless `middleware: 'auth'` declarations are removed (also dropping a per-navigation `/api/auth/config` round-trip). The `auth` middleware is kept dormant — re-gate by restoring the one-line declaration and/or flipping `REQUIRE_LOGIN`.

### Performance

- ~1.1 MB of client JavaScript dependencies eliminated (`docx` + `mermaid`). Lighthouse accessibility stays **100** and axe-core reports **0 WCAG AA violations** across all pages (audited against production). The remaining mobile-perf ceiling on the content pages is the Nuxt UI + Vue framework baseline (documented for a future Astro-hybrid evaluation).

### Tests

- Web suite **316 → 317** (new `buildText` export tests replace the docx-banner tests). API unchanged. `tsc --noEmit` and `nuxt build` clean.

## [1.27.0] - 2026-06-10

Security-hardening release. Implements every fix identified by the 2026-06-10 comprehensive adversarial red/blue audit of the whole application (Nuxt frontend, Express API, audit pipeline, and the optional auto-remediation pipeline). The audit found **no live critical-severity issue** — SQL injection, command/argument injection, path traversal, insecure deserialization, stored/DOM XSS, and authentication bypass were each examined and verified clean — so the items below are denial-of-service or misconfiguration/forward-looking hardening. Running review history is in [README § Security](README.md#security). Per responsible disclosure, step-by-step exploit detail is kept private.

### Fixed (security)

- **Headless-browser page-audit SSRF.** `/api/audit-url-page` rendered a URL in Chromium behind only a string allowlist; Chromium resolved DNS and followed redirects itself. It now installs a request interceptor that blocks non-http(s) schemes, resolves and rejects private/reserved-IP targets on every request (navigation, redirect, subresource), and re-checks document navigations against the allowlist per hop. Verified end-to-end: loopback navigation blocked, legitimate allowlisted pages still render. A concurrency cap bounds simultaneous renders.
- **Auto-remediation worker had no enforced timeout.** `WORKER_TIMEOUT_MS` was defined but never used. Every pipeline subprocess (qpdf normalize, qpdf check, veraPDF) now passes a `timeout`, and the worker arms a master self-timer that SIGKILLs its whole process group (worker + the OpenDataLoader JVM) when the budget elapses.
- **In-process extractor parse timeout.** pdfjs had no wall-clock bound; a pathological PDF could pin an analysis slot. It now times out (HTTP 504) and frees the slot.
- **URL-fetch size cap.** URL-fetched PDFs were capped at 100 MB (6.6× the direct-upload cap), buffered before the concurrency gate. Lowered to match the upload cap.
- **Fail-closed auth startup + admin gate.** The API refuses to start when login is enabled without a strong `JWT_SECRET` (mirroring the SMTP check); the admin gate now rejects the anonymous sentinel and an empty admin list unconditionally.
- **IPv6 private-range classifier fail-open.** `isPrivateIP` returned false for bracketed/IPv4-mapped IPv6 forms (`[::1]`, `[::ffff:127.0.0.1]`); fixed with regression tests.
- **Defense-in-depth.** Content-Security-Policy + `X-Content-Type-Options`/`X-Frame-Options`/`Referrer-Policy`/`Permissions-Policy` on the web app (production); the HTML-export escaper now covers the single quote (shared, tested helper); the public share endpoint no longer returns the sharer's email; the dev OTP `000000` bypass is gated on an explicit `ALLOW_DEV_OTP_BYPASS` flag instead of `NODE_ENV`.

### Tests

- API suite **447 → 487**, Web **311 → 316**, total **803** across 39 files. New: `safeFetch`, `authConfig`, `pageAuditGuard`, `pdfAnalyzerTimeout`, `escapeHtml`, plus admin-gate and qpdf-normalize-timeout cases. `tsc --noEmit` and `nuxt build` clean.

### Follow-up

- Nonce-based `script-src` to drop `'unsafe-inline'` from the CSP is tracked for a later release; the headless-browser still runs `--no-sandbox` (deploy constraint) with the request interceptor as the SSRF control.

## [1.26.1] - 2026-06-10

Follow-up fixes to 1.26.0, surfaced by testing remediation on a damaged PDF and by the WomenInPolicing control pair.

### Fixed

- **Remediation no longer fails on damaged-but-recoverable PDFs.** Step 1 of the pipeline (qpdf normalization) treated qpdf exit code 3 — "operation succeeded with warnings", i.e. qpdf *repaired* the file and wrote valid output — as a hard failure, so exactly the files remediation exists for died with "qpdf normalization failed". Normalization now succeeds when the repaired output exists (mirroring the audit's 1.26.0 exit-3 recovery) and the job event log records `repaired_with_warnings`. The strict `qpdf --check` gate on the *output* is unchanged — a freshly written tagged PDF should be pristine.
- **Timestamped export filenames used as titles are now flagged.** The 1.26.0 calibration that protects legitimate single-hyphen titles ("COVID-19", "Section-508", "2024-2025") also let `Report-210525T15080148`-style export filenames through with full title credit — caught live on the remediated WomenInPolicing control, which scored 100 on a filename title. Timestamp patterns and long no-space tokens containing digits now get the filename advisory and partial credit (25/50); the protected titles remain unflagged.
- **Missing loading spinner / icon 404 in the dev console.** Nuxt UI 4's default loading icon (`lucide:loader-circle`, used by every button with a `:loading` state, e.g. the Remediate button) was never bundled because `@iconify-json/lucide` was not installed; the icon endpoint returned 404. The collection is now a web dependency so all Nuxt UI default icons are served locally.

### Tests

- API suite **436 → 447** (qpdf-normalize exit-3 contract — new `qpdfNormalize.test.ts`; timestamped-filename discriminators incl. the WomenInPolicing regression). Total **758** across 34 files. `tsc --noEmit` and `nuxt build` clean.

## [1.26.0] - 2026-06-10

Accuracy and trust fixes across the auditing algorithms, from a full review of the qpdf/pdfjs extraction and scoring pipeline: two production bugs verified end-to-end against real qpdf output, several false-positive/false-negative generators removed, and every "How to Fix" step and help link re-verified against current Adobe, WebAIM, and W3C documentation. Independently code-reviewed before tagging. Full write-up in [docs/qpdf-warning-recovery-and-evidence-fixes.md](docs/qpdf-warning-recovery-and-evidence-fixes.md).

### Fixed

- **A recoverable qpdf warning no longer wipes out the entire structural analysis.** qpdf exits with code 3 ("succeeded with warnings") on damaged-but-readable files — damaged xref, missing trailer `/Size` — while still writing complete JSON to stdout; that output was discarded as a failure. Verified A/B: the *identical* tagged document scored **100 (A)** clean vs **42 (F)** with one trivial warning, with false "Document is NOT tagged" / "No heading tags found" Critical findings. Recovery is gated on exit code 3 and a document-shaped payload; exit 2 ("errors") is deliberately still treated as a failure so the conformance gate never asserts findings from disclaimed data.
- **Nested tables were double-counted again on modern qpdf (JSON v2).** The 1.24.1 exclusion compared object-map keys (`obj:N 0 R`) against reference values (`N 0 R`) and never matched on qpdf ≥ 11 — its regression tests passed only because the fixtures used a hybrid JSON shape real qpdf never emits. Verified: a one-table PDF reported 2 tables / 3 rows; now 1 table / 2 rows. All key↔value comparisons are normalized, which also revived the AcroForm `/Fields` fallback (additionally fixed to resolve an indirect `/AcroForm` ref) and the `/Pages`-tree page-map fallback. New fixtures mirror real qpdf-v2 output exactly.
- **Real document titles were erased and reported as confirmed WCAG 2.4.2 failures.** Any no-space title ("Budget2024", "Introduction") was nulled as "filename-like", producing a false *confirmed* "no title in its metadata" conformance failure (−50 in Title & Language). Titles are now always preserved; a narrowed classifier flags genuinely filename-like titles ("report_v3_final.pdf", "Microsoft Word - …") for partial credit (25/50) with an advisory, and 2.4.2 fires only when no title exists. Single-token hyphenated titles ("COVID-19", "Section-508", "2024-2025") are never flagged.
- **1.3.2 Meaningful Sequence was asserted without evidence.** A flat-but-correctly-ordered structure tree (heuristic score 30) tripped the "confirmed reading-order violation" gate although no order comparison had run. The gate now consumes the rigorous struct-tree vs. content-stream MCID comparison directly (shared module `scoring/readingOrderFidelity.ts`) — and conversely, flat documents with *measured* drift are now caught.
- **Radio groups were reported as N unlabeled form fields.** `/TU` lives on the parent field dict in the split field/widget pattern; each kid widget was counted as its own unlabeled field, so a 5-option radio group produced five false "missing tooltip" findings plus a false 4.1.2 confirmed failure. Kid widgets now resolve their owning field via the `/Parent` chain and the field is counted once.
- **Correctly spanned tables were flagged "inconsistent column counts".** Per-row cell counts ignored `/ColSpan` and `/RowSpan`; rows are now measured in effective grid columns, with row-span carryover into following rows.
- **PDF/UA identifiers written in XMP attribute form were invisible** (`<rdf:Description … pdfuaid:part="1"/>`): pdf.js's metadata parser only reads child elements, so the signals panel denied valid claims. A raw-XMP fallback now reads both forms.
- **veraPDF failure rows showed "FAILED" as the rule identifier** — the mapping read `ruleStatus` (a status string) instead of the rule's identity. Rows now read `clause-testNumber` ("7.1-1"), matching veraPDF's own rendering.
- **The Acrobat "How to Fix" guide for forms never rendered** — the guide was keyed `form_fields` but the category id is `form_accessibility`.
- **Help links and Acrobat instructions corrected.** Five WebAIM links used a nonexistent `#702` anchor (verified against the live site) and now point to the correct series pages; W3C "Understanding" links follow the active `WCAG_VERSION` instead of hardcoded 2.1; Acrobat steps name the current tools (All tools → Prepare for accessibility → Check for accessibility / Automatically tag PDF / Fix reading order) with classic-UI fallbacks; the table-Scope instruction now describes the real path (Reading Order tool → Table Editor → Table Cell Properties); the bookmarks-from-structure and form-tooltip (Prepare a form) paths were also corrected.

### Changed

- **Lists: `<LBody>` required, `<Lbl>` advisory.** ISO 32000 permits label-less list items and common tooling emits LBody-only lists; requiring `<Lbl>` on every item produced over-strict *confirmed* 1.3.1 failures. A missing `<Lbl>` is now an optional, non-penalized note; an `<LI>` without `<LBody>` remains a confirmed failure (content not programmatically associated — matches PAC/Acrobat).

### Tests

- API suite **373 → 436** (qpdf exit-3 recovery + exit-code gating, real qpdf-v2 fixtures, span-aware column grids incl. multi-row RowSpan carry, multi-widget fields incl. merged-dict dedupe, LBody-only lists, title classifier + real-pdfjs wiring, XMP element/attribute forms through real pdfjs, veraPDF verdict mapping, 1.3.2 evidence gating, help-link accuracy). Web suite **311** (unchanged behavior; veraPDF clause display tweak). Total **747**. `tsc --noEmit` and `nuxt build` both clean.

## [1.25.0] - 2026-06-05

Accuracy fixes and a new PDF/UA-1 conformance-signals panel, prompted by a user auditing four PDF/UA-tagged ICJIA reports against PAC. Full write-up in [docs/pdfua-artifacts-fonts-and-scoring-fixes.md](docs/pdfua-artifacts-fonts-and-scoring-fixes.md).

### Fixed

- **"No PDF/UA identifier" reported on PDF/UA-1 files.** The detector read a `qpdf --json` stream field that flag never emits (and the XMP is Flate-compressed), so the check could never succeed. The PDF/UA identifier (`pdfuaid:part`) is now read from the parsed XMP via pdf.js. Findings text only — no score impact.
- **"No artifact tags" reported on artifact-tagged files.** The detector counted structure-tree `/S=/Artifact` elements (almost always zero); real artifacts are content-stream marked content (`/Artifact BDC … EMC`). Artifact runs are now counted from the pdf.js operator list. Findings text only.
- **Type3 fonts mis-flagged as not embedded.** Type3 fonts define their glyphs inline (`/CharProcs`) and never carry a `/FontFile`; they are now correctly treated as embedded. Verified against `pdffonts` across the control set.
- **Reading Order docked points silently.** A near-perfect document (98% tag-vs-visual reading-order fidelity) was dropped from 100 to 90 with no visible reason, and the category still carried stale boilerplate claiming it could not perform the comparison it had just performed. The top fidelity band is now ≥97% (absorbing MCID-extraction jitter), the stale text is gone, and any remaining deduction is stated explicitly.

### Changed

- **Raw URLs as link text are no longer penalized.** A visible URL satisfies WCAG 2.4.4 (the destination is determinable) and PAC does not flag it; it is now surfaced as a best-practice advisory rather than scored as a failure. Genuinely non-descriptive text ("click here", empty) is still penalized. Documents that cite full URLs score higher (e.g. four PDF/UA control files moved 95/95/96/98 → 100).
- **The Acrobat "How to Fix" guide no longer appears on categories scoring 100.** A guard checked a severity label that never existed, so the remediation card attached to every scored category, including perfect ones. It now appears only below 100.

### Added

- **PDF/UA-1 conformance-signals panel.** A new section on every report (live and shared) summarizes the machine-checkable PDF/UA-1 signals — identifier, tagging, marked content, artifacts, embedded fonts, structure depth, language, title — and explains honestly that these are *signals, not a verdict*, pointing to PAC and veraPDF for the full Matterhorn Protocol conformance test.

### Tests

- API suite **358 → 373** (PDF/UA + artifact sourcing, Type3 fonts, link recalibration, reading-order band/transparency, PDF/UA signals). Web suite **308 → 311** (PdfUaSignalsCard). `tsc --noEmit` and `nuxt build` both clean.

## [1.24.2] - 2026-06-05

Follow-up to 1.24.1: a table-scoring refinement and a docs reorganization.

### Changed

- **Table captions no longer reduce the score.** A `<Caption>` is a best-practice enhancement, not a WCAG 2.1/2.2 requirement (no success criterion mandates one). Previously a fully-conformant simple table without a caption capped at 95; the 5 caption points are now awarded unconditionally, and a missing caption is surfaced as an optional recommendation only. Combined with the 1.24.1 header-association fix, a simple table that is fully conformant via `/Scope` now scores 100. (Category impact: +5 for any table without a caption; small upward movement on affected documents' overall scores.)
- **`/docs` trimmed to the current set.** Only `table-and-heading-accuracy-fixes.md` remains in the `docs/` root; all design, deployment, integration, and roadmap documents now live in `docs/archive/` (with a README distinguishing the superseded docs from still-accurate reference docs). References in the README, `AGENTS.md`, `audit.config.ts`, API code comments, and the data-retention page's GitHub links were repointed to `docs/archive/`.

### Tests

- API suite **357 → 358**: new "captionless-but-conformant table scores 100" case; four existing table-scoring expectations updated because captions no longer deduct.

## [1.24.1] - 2026-06-05

Accuracy fixes for table-structure and heading diagnostics, reported by a user. Full write-up in [docs/table-and-heading-accuracy-fixes.md](docs/table-and-heading-accuracy-fixes.md).

### Fixed

- **Inflated table and row counts.** A table nested inside another table's cell was counted as a separate top-level table, inflating both the table count and the summed row count shown in the report ("more rows than the PDF actually has"). Nested tables are now excluded from the top-level list; the parent table still reports the nested-table flag.
- **Heading outline shown out of order.** Headings were listed in PDF object-number order rather than document reading order, so an H1 tagged late (e.g. during remediation) could appear at the *end* of the outline. Headings are now collected by walking the structure tree in reading order. This also removes a latent mis-scoring: object-order headings could trigger a false "heading hierarchy skip" and wrongly lower the Heading Structure category.
- **Table scored below 100 while passing every check.** The 5-point header-association check credited only the explicit `/Headers` attribute and ignored `/Scope`. A simple table correctly built with `/Scope` (the recommended technique for simple tables) was docked 5 points it should have earned. Header association is now satisfied by `/Scope` **or** `/Headers`, per **WCAG 2.1/2.2** Level AA (Success Criterion 1.3.1, Info and Relationships — unchanged between the two versions). This satisfies the IITAA 2.1 legal floor and the app's 2.2 anchor equally; no version dependence.

### Changed

- `parseQpdfJson` now collects headings and tables by traversing the structure tree (`StructTreeRoot` → `/K`) in document order, falling back to the flat object scan only when the tree yields nothing. Tables are also analyzed after the full object map is read, so custom-role tables map correctly regardless of object number.
- WCAG references in the scoring-rubric tooltips, the README category table, and the new accuracy doc now name the version explicitly ("WCAG 2.1/2.2 SC 1.3.1" rather than a bare "1.3.1"), so a reader scanning for WCAG 2.1/2.2 sees it up front. This is presentational only — the version-neutral criterion data that powers the version-aware UI and the `WCAG_VERSION` 2.1↔2.2 switch is unchanged.

### Compatibility

- No category-weight, API, schema, or export-format changes. Scores may move for affected files: a table using `/Scope` without `/Headers` gains up to 5 points in the Table Markup category (e.g. the inconsistent-columns + scope case now scores 90, was 85); documents whose headings were mis-ordered no longer incur false hierarchy-skip penalties; and table/row counts in the detail decrease where nested tables were previously over-counted.

### Tests

- API suite **354 → 357**: new coverage for document-order heading collection, nested-table exclusion, and `/Scope`-based header association; the inconsistent-columns expectation was corrected (85 → 90).

### Docs

- Added `docs/table-and-heading-accuracy-fixes.md` (diagnosis, fixes, tests, follow-ups).
- Trimmed `/docs` to the currently-applicable set; superseded and roadmap-only documents moved to `docs/archive/` (Phase 2/3/4, use-cases, the remediation feasibility spike, and the Adobe-parity note).

## [1.24.0] - 2026-06-03

### Added
- **WCAG 2.2 re-anchor.** The audit now reports against WCAG 2.2 Level AA (a strict superset of WCAG 2.1 AA). New 2.2 criteria are surfaced honestly as "not assessed — manual review"; the form-relevant ones (2.5.8 Target Size, 3.3.7 Redundant Entry, 3.3.8 Accessible Authentication) appear in the verdict only for PDFs with interactive form fields. Automated checks and score weights are unchanged.
- **Illinois IITAA 2.1** cited alongside WCAG + ADA Title II across the homepage, footer, conformance box, exports, and meta.
- **Reusable landing-page announcement banner** (permanently dismissible per announcement id).
- **New `/wcag-2-2` page** — plain-language manager guide to how WCAG 2.2 differs from 2.1.
- **`WCAG_VERSION` env flag** — set to `2.1` to revert all labels, links, and the 2.2 not-assessed criteria. The API reverts on restart; the web UI reverts on rebuild (Nuxt bakes runtimeConfig at build time). A normal redeploy does both.

### Changed
- 4.1.1 "Parsing" removed from criterion references (obsolete in WCAG 2.2).

## [1.23.0] — 2026-06-03

### Added — Prominent filename banner on every report

Every downloadable and shareable report now leads with a full-width banner across the top that names the audited file, so a saved or forwarded report can never be mistaken for another document.

- **New `ReportFileBanner` component** shows an `ACCESSIBILITY REPORT FOR` eyebrow, the filename in bold (wrapping, never truncated), and an `N pages · PDF` line. It sits at the top of the live audit result — including each batch tab — and the shared `/report/:id` page, and is inherited by the browser print / Save-as-PDF path.
- **Exports carry the same prominence.** The HTML export gains a styled banner above the title with a print-legible rule; the Word export gains a shaded, bordered filename block before the title; the Markdown export now leads with the filename as its top-level `#` heading. JSON is unchanged — it already carries `file.name`.
- **No duplicated filename.** `ScoreCard` gains a `showFilename` prop (default on); the live and shared pages turn it off so the filename is not repeated in gray beneath the new banner. The remediation before/after cards are unchanged.

### Tests

- Web suite grows to **301 tests** (from 280): new `reportBanner`, `ReportFileBanner`, and `reportExportBanner` suites plus a `ScoreCard` `showFilename` case. Project total: **651 tests** across 27 files.

## [1.22.3] — 2026-05-22

### Changed — Scoring follow-ups

A cleanup pass on the scoring engine following the v1.22.0 conformance-gate release. No category weights changed.

- **Executive summary reconciled with the conformance verdict.** `generateSummary` now takes the WCAG conformance verdict into account: a confirmed conformance failure outranks the numeric grade, so the summary no longer reads positively while the verdict box separately reports a failure. An incomplete analysis (encrypted or damaged file) is now summarised honestly as such.
- **Severity-label bug fixed in the summary.** The summary's issue-free category count filtered on the severity label `"Pass"`, which v1.22.0 renamed to `"No issues found"` — so for grade-B documents the count had silently read **0 of N** since v1.22.0. Fixed.
- **Coverage ratios floor instead of round.** Alt-text, link-quality, and form-accessibility category scores are now `floor((covered / total) × 100)`. Previously `round()` could lift a 99.5%-coverage ratio to a perfect 100 and a "No issues found" severity — a category looked flawless with an item still missing. A sub-100% ratio now always scores at most 99. Per-category impact is ≤ 1 point.

### Removed

- Deleted two confirmed-unreachable scoring functions from `scorer.ts` — `scorePdfUaCompliance` (~159 lines; the PDF/UA category was dropped from the audit in v1.21.0) and `refreshCategoryPresentation` — trimming dead, auditable surface.

### Compatibility

- No category-weight, API, schema, or export-format changes. The only score movement is the ≤ 1-point `floor` adjustment on the alt-text / link-quality / form-accessibility categories when coverage is not a whole percentage; an overall document score may therefore shift by a fraction of a point.

## [1.22.2] — 2026-05-22

### Changed

- **Conformance verdict copy for a failing document.** For a failing document (grade C/D/F), the verdict box heading now reads "This document needs **additional manual** remediation" (was "This document needs remediation"), and the body spells out the next step — the remaining fixes are hands-on: run the file through Adobe Acrobat's Accessibility Checker, or repair the source document (Word, InDesign) and re-export, then re-run the audit to confirm. It makes explicit that the automated audit and auto-remediation only go so far.

### Fixed

- **`README.md` `## Tests` section.** The per-file test tables and totals had drifted stale — they reported 236 API / 238 Web tests against an actual suite of **342 API / 280 Web (622 tests across 24 files)**. The tables now list every test file with its current count and coverage.

### Compatibility

- No API, schema, scoring, or export changes — UI copy and documentation only.

## [1.22.1] — 2026-05-22

### Changed — Conformance verdict presentation

A copy and presentation refinement of the WCAG conformance verdict introduced in v1.22.0, plus a small wording tweak to the server-status indicator. The verdict logic, the success criteria it checks, and the export wording are all unchanged — only how the on-page verdict box looks and reads.

- **The verdict box color now follows the grade**, not pass/fail: a green panel for an A or B grade, red for C/D/F, neutral grey when analysis could not complete. A strong document with a single flagged criterion is no longer shown an alarm-red box — but the box still lists every flagged criterion regardless of color, so nothing is hidden.
- **Grade-aware verdict copy.** The headline softens to "A few items still need attention" for an A/B document and "This document needs remediation" for C/D/F. For a high-scoring document the body now explains *why* a strict reading still flags it — WCAG conformance is all-or-nothing per success criterion, so a single missing tag flags the whole document — while affirming that the grade reflects a document in good shape.
- **The standards named in the verdict box footer are now clickable** — WCAG 2.1 Level AA links to the W3C quick reference, the **Illinois IITAA links to the IITAA 2.1 standards**, and ADA Title II links to the DOJ rule.
- The Word / HTML / Markdown / JSON exports keep the formal "does not meet WCAG 2.1 Level AA" wording — a downloaded report is a compliance record, where firmer language is appropriate.
- **Server status indicator** now reads "audit server online / offline" instead of "up / down".

### Compatibility

- No API, schema, or scoring changes. The `conformance` verdict data, the category fields, and all four export formats are byte-identical to v1.22.0; only the audit-page and saved-report-page rendering of the verdict box changed.

## [1.22.0] — 2026-05-21

### Added — WCAG 2.1 conformance gate

Every audit now produces a binary **WCAG 2.1 conformance verdict** alongside the 0–100 score — on the audit page, on saved-report pages, and in all four export formats (Word, HTML, Markdown, JSON). The score is a weighted, partial-credit *prioritised-readiness* metric, but WCAG conformance is all-or-nothing per success criterion, so a document can score 90+ ("A") and still fail WCAG. The gate answers that pass/fail question honestly and separately.

- **`apps/api/src/services/scoring/conformance.ts`** (new) — flags confirmed, machine-checkable WCAG 2.1 violations: untagged document (1.3.1), no extractable text (1.1.1), tagged figures missing alt text (1.1.1), no document language (3.1.1), no document title (2.4.2), malformed lists (1.3.1), tables without header cells (1.3.1), unlabeled form fields (4.1.2), and confirmed reading-order drift (1.3.2). Each failure links to its W3C "Understanding" page.
- The verdict is framed around **Level AA** — the bar the Illinois IITAA and the ADA Title II rule require. It never claims "conformant": a clean automated run reports "no automated failures detected — manual review still required." When an analyzer cannot process a file (encrypted/damaged) it reports `incomplete` rather than guessing.
- The verdict box names the standards basis in plain language (WCAG 2.1 AA / IITAA / ADA Title II) for non-technical reviewers.

### Changed — Scoring rigor

- **Reweighted** to match WCAG conformance levels: Reading Order 5% → 10% (1.3.2 is Level A — out-of-order content makes a document unusable), Bookmarks 10% → 5% (2.4.5 is Level AA and partly satisfiable by a clear heading structure). Weights still sum to 100%.
- **Missing bookmarks** softened from 0 / Critical to 45 / Moderate — an absent navigation aid for a Level-AA criterion is no longer scored as a critical failure.
- **Link Quality** now flags the canonical WCAG 2.4.4 failures — vague phrases such as "click here" and "read more" — not only raw URLs.
- **Per-category severity** "Pass" renamed to **"No issues found"** and reserved for a perfect 100; 70–99 is now "Minor". A category at 90–99 still has at least one finding, so it is no longer labelled issue-free.
- **N/A split** into "Not applicable" (the document genuinely has no tables/forms/links) and "Not assessed" (the tool did not or could not evaluate it). Color contrast now reads "Not assessed", never a silent pass.
- **Published WCAG success-criteria map** — each category declares the exact WCAG 2.1 success criteria and conformance level it evaluates; surfaced on the Technical Details page.

### Fixed

- The conformance gate emitted fabricated WCAG failures when an analyzer errored on a damaged or encrypted PDF. It now returns an honest `incomplete` verdict. Found in this release's adversarial scoring review; regression test added.

### Compatibility

- **Score discontinuity.** Because category weights, the bookmarks penalty, and the severity labels changed, **v1.22.0 scores are not directly comparable to pre-v1.22.0 scores.** A fleet audit spanning the upgrade will show score movement that reflects the methodology change, not the documents — re-baseline any in-progress campaign against v1.22.0.
- `audit_log`, `shared_reports`, and `remediation_jobs` schemas unchanged. The audit response gains a `conformance` object and each category gains optional `notAssessed` and `wcagCriteria` fields; consumers that ignore unknown fields are unaffected.
- Saved reports created before v1.22.0 carry no `conformance` data — the verdict box is simply hidden on those.

## [1.21.1] — 2026-05-19

### Fixed — Saved-report UI now matches the real-time audit page

v1.21.0 removed the Adobe Acrobat parity card from the real-time audit page when the dual Strict/Practical scoring toggle was retired, but the same card block was left behind on the shared-report page (`/report/:id`). Anyone receiving a saved-report link still saw the 32-rule Acrobat assessment that the live audit no longer showed, so two auditors comparing notes against the same content could end up looking at two different summaries depending on which URL they had.

- **`apps/web/app/pages/report/[id].vue`** — removed the `<AdobeParityCard :parity="data.report.adobeParity" />` block (5 lines net). The saved report now renders the same single Strict score, category table, and detailed findings as the real-time audit page.
- **No schema migration.** The `adobeParity` field is still persisted in `shared_reports.report_json` for backward compatibility with any external consumer that already parses it; only the rendered card is gone. Historical shared-report rows are unaffected.
- The per-finding "How to Fix in Adobe Acrobat" remediation guidance inside each category card was intentionally kept — that guidance also appears on the real-time audit page and is per-finding remediation advice, not a separate scoring profile.

### Changed — Analyze rate limit temporarily raised for the ICJIA fleet audit pass

- **`RATE_LIMITS.analyze`** raised from `35` to `5000` per hour per email (`audit.config.ts`) to support the in-flight ICJIA fleet audit campaign — the ~5000-PDF inventory is being re-audited across multiple passes over several days as content is remediated and re-checked, not a single one-shot pass. The comment in `audit.config.ts` documents the reason and the intent to revert once the campaign concludes. The daily remediation cap (`100/day/caller`), the 60-minute audit-gate hash check, the URL allowlist + SSRF protections, the upload size cap, and the auth gate are all unchanged.

### Compatibility

- `audit_log`, `shared_reports`, and `remediation_jobs` schemas unchanged.
- `result.scoreProfiles.remediation` and the `practical` key in `/api/audit-url` continue to be structural aliases of Strict (carried forward from v1.21.0); the alias will be removed in a future release once consumers have migrated.

## [1.21.0] — 2026-05-19

### Changed — Single Strict score, veraPDF promoted on the remediation page

User feedback consistently flagged the audit UI as information-dense — auditors and agency staff were toggling between two scoring profiles ("Strict" and "Practical") and trying to reconcile the difference instead of acting on the underlying findings. After review, **Practical was retired**. The remaining profile, **Strict (WCAG 2.1 AA + IITAA §E205.4)**, is the one anchored to actual legal accessibility requirements in Illinois, and is what every publication decision should be made on.

The PDF/UA signal that Practical tried to summarize (MarkInfo, tab order, PDF/UA identifiers, list/table legality, partial-credit floors on headings and tables) is now surfaced more authoritatively on the **remediation result page** via the optional **veraPDF** check (ISO 14289-1 conformance). The veraPDF verdict is a binary Pass/Fail against the published PDF/UA-1 standard, which is more useful to an auditor than a synthetic weighted readiness number.

Specifically:

- **Audit page and shared-report page**: no more Strict/Practical toggle. The score card shows a single number anchored to WCAG + IITAA §E205.4. The dual-score audit row, mode badge pill, PDF/UA signals pill, and the cross-mode `ModeCompareBox` are gone.
- **Remediation result page**: a compact **"PDF/UA-1: conformance passed / N rule failures / check not run"** badge now appears immediately below the After-remediation score, jumping to the existing veraPDF detail panel. The detail panel was renamed from "Compliance disclaimer" to "PDF/UA-1 conformance check" to match what it actually is.
- **Per-card Basic/Advanced toggle** in the audit kept as-is — it's a per-category control over how much detail to show, not a separate scoring profile.
- **`pdf_ua_compliance` category dropped from the audit** — its signals are still inspectable in the underlying audit JSON if needed, and veraPDF is the authoritative source on the remediation page.

### Compatibility / API contract

- `result.scoreProfiles.remediation` is emitted as a **structural alias of `scoreProfiles.strict`** (same score, same grade, same summary). Historical shared-report JSON, fleet CSVs, and any external `/api/audit-url` consumer keep parsing without changes — they just get the Strict number under both keys. The alias will be removed in a future release once consumers have migrated.
- `/api/audit-url` response retains both `strict` and `practical` keys (same scalar pair) for the same reason.
- `audit_log`, `shared_reports`, and `remediation_jobs` schemas are unchanged. Historical rows are not migrated.

### Removed

- `ScoreProfileBanner.vue` and `ModeCompareBox.vue` components (deleted).
- Mode-toggle plumbing on `index.vue`, `report/[id].vue`, and `remediate/[jobId].vue` (`selectedScoreMode`, `flipScoreTableMode`, `compareProps`, `hasCrossModeSignal`, `remediationModeActive`).
- `MODE_BUTTON_LABELS`, `MODE_PROFILE_DESCRIPTIONS`, `MODE_PROFILE_LABELS`, `MODE_RECOMMENDATION_*`, `CATEGORY_TABLE_PRACTICAL_*`, `STRICT_MODE_RATIONALE_TEXT`, `PRACTICAL_*` constants from `scoringProfiles.ts`.
- `DIVERGENCE_COPY`, `canCategoryDiverge`, `getDivergenceCopy` from `modeDivergence.ts`.
- `scorePdfUaCompliance` is no longer added to the audit categories list.
- The dedicated "Practical aggregate" describe blocks and the Practical-mode regression check on the remediation worker.

### Doc / changelog updates

- `apps/web/app/pages/index.vue` "How Scores Are Derived" + "How Scores Are Calculated" sections rewritten — single-mode, links to veraPDF for the PDF/UA story.
- `apps/web/app/pages/data-retention.vue` § 4 regression-guard pseudocode + § 9 regression-guard plain-language copy updated to drop the Practical reference. Historical v1.20.x audit entries left intact as the historical record at those versions.
- README, dateModified, and three `package.json` files bumped to 1.21.0.

## [1.20.1] — 2026-05-18

### Added — Remediation audit-gate, daily-cap, and unified audit_log

To address the "automated thousands-of-remediations" abuse case (and tighten the workflow generally), every call to `POST /api/remediate` now requires the same content to have been audited in the previous 60 minutes by the same caller. Identity is the authenticated email, or `anon:${ip}` in no-auth mode (see P2.1 below). The check matches on `sha256(bytes)` so any audit path counts — browser upload via `/api/analyze`, URL audit via `/api/analyze-url`, fleet bulk via `/api/bulk-from-inventory`, or persistent audit via `/api/audit-url`. Without a matching `audit_log` row in the window, the endpoint returns `403 { error: "Audit required before remediation." }` with a link back to the audit UI.

A daily cap of **100 remediations per caller per rolling 24-hour window** sits on top of the gate. Sized to comfortably cover a normal agency workflow (~50 PDFs/day) while blocking abuse at scale (3000+ PDFs would take ~30 days at the cap). Returns `429` with `{ limit, used }` when exceeded.

To make the gate work uniformly, **every audit endpoint now writes to `audit_log` with a content_hash**. Previously only the browser-upload path (`/api/analyze`) wrote to `audit_log`, and even that write omitted the hash. v1.20.1 wires `audit_log` writes — including the hash — into `/api/analyze`, `/api/analyze-url`, `/api/audit-url`, and `/api/bulk-from-inventory`. `audit_log` is now the canonical "this content has been audited by this caller" record.

A new `SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS = 365` constant adds a periodic purge of `audit_log` rows older than the window — matches the shared-report retention so audit-related records age out together. Closes the slow-burn growth vector (P2.3).

### Fixed — Six security findings from the post-feature red/blue team review

The v1.20.0 release added the `/api/audit-url` endpoint and the fleet integration story. The standard practice is to follow every feature with a fresh red/blue team review *before* tagging — we found six findings worth fixing, plus one previously-latent issue uncovered during the audit. All fixed in v1.20.1.

- **P1.1 / fixed — DNS rebinding bypassed the URL allowlist.** The previous `isAllowedUrl()` check ran against the hostname *string* before DNS resolution. An attacker who controlled DNS for any subdomain of an allowlisted apex (e.g., `evil.icjia-api.cloud`) could point it at `127.0.0.1` (or the API's own internal address, or any future internal service). The hostname passed the allowlist; `fetch()` then resolved DNS and connected to loopback, turning the audit pipeline into an SSRF proxy. **Fix:** new `apps/api/src/services/safeFetch.ts` resolves DNS in-process, rejects any private/loopback/link-local/multicast IP (IPv4 + IPv6, including IPv4-mapped IPv6 variants), and dials the resolved IP directly with `Host:` header set to the original hostname.
- **P1.2 / fixed — `redirect: 'follow'` chained into private networks.** Even with a strict allowlist, `fetch(..., { redirect: 'follow' })` followed up to 20 redirects *without re-validating*. An attacker who could plant content on an allowlisted host (e.g., a redirector at `https://agency.icjia-api.cloud/redirect.php`) could 302 us to `http://10.0.0.1/anything`. **Fix:** `safeFetch` handles redirects manually with the full allowlist + DNS check on every hop, capped at 3 hops.
- **P1.4 / fixed — `/api/bulk-from-inventory` had its own private `fetchWithTimeout` with NO allowlist check.** Caught during the SSRF review while migrating the URL-fetch endpoints to `safeFetch`. Authenticated callers could submit an NDJSON inventory listing arbitrary URLs — including internal addresses — and the server would fetch them, returning the response body and timing through the per-entry result. Textbook authenticated-SSRF. **Fix:** replaced with the same `safeFetch` + `validateUrlForFetch` plumbing used by the other URL-fetch endpoints.
- **P2.1 / fixed — Audit-gate identity collapse in anonymous mode.** With `AUTH.REQUIRE_LOGIN=false`, every caller's identity was a shared `'anonymous'` bucket. User A audits PDF X → User B can remediate PDF X because B's gate check matches A's `audit_log` row. **Fix:** new `gateIdentity()` helper returns `anon:${ip}` when not authenticated, so two different anonymous callers don't share a single bucket. Production deployments with `REQUIRE_LOGIN=true` were never affected.
- **P2.3 / fixed — `audit_log` grew unbounded.** No retention policy on the canonical `audit_log` table — a slow-burn DoS where an attacker floods `/api/analyze-url` with unique-hash PDFs to bloat the table indefinitely. **Fix:** new `SHARED_REPORTS.AUDIT_LOG_RETENTION_DAYS = 365` plus a step-6 cleanup pass in `remediationCleanup.runCleanup()` that purges expired rows alongside the existing remediation cleanup.
- **P2.4 / fixed — Race window on the daily-cap check.** The fast-path cap check happened before the expensive `analyzePDF` preflight; a second concurrent request could pass the same check and both create the (cap+1)th job. **Fix:** the cap check is now repeated inside a `db.transaction()` immediately before `createJob()`. SQLite serializes writes, so two concurrent requests now reliably reject the cap-exceeding one. The earlier fast-path check remains as a cheap early-exit for the obvious case.
- **P3.5 / verified clean — Cookie security flags.** `auth.ts` already sets `httpOnly: true`, `secure: isProduction`, `sameSite: 'strict'` in production. No change needed.

### P3 — Accepted with documented mitigation

These were reviewed and found to be theoretical, fully mitigated by existing controls, or accepted by design. Listed for transparency in the auditor record.

- **P1.3 / mitigated, not fixed** — Download token in query string ends up in nginx access logs. Single-use enforcement (`setExpired()` before stream) shrinks the replay window to near-zero. A hardline fix (token in POST body) would break the `<a href>` download UX. Accepted as-is.
- **P2.2 / partial mitigation** — Daily-cap bypass via multi-account creation. Mailgun has disposable-email signals; per-IP registration rate limit is reasonable future work. Not currently exploited; tracked for a future release if abuse surfaces.
- **P2.5 / mitigated, not fixed** — Future CVE in OpenJDK, OpenDataLoader, or one of ODL's deps could enable RCE in the worker via a crafted PDF. Existing mitigations: JVM heap cap, 5-min worker timeout, detached child process, no `--hybrid` (no ODL network fetches), pinned Java major version. Future hardening (dedicated unprivileged user, egress block) tracked.
- **P3.1 — SHA-256 collision in the audit-gate.** Computationally infeasible (2^128 work).
- **P3.2 — IPv4-mapped IPv6 SSRF.** Verified not exploitable against current `safeFetch` (the new `isPrivateIPv6()` check handles `::ffff:127.0.0.1` and similar forms).
- **P3.3 — Timing side-channel on gate check.** Indexed SQL SELECT is ~constant-time. Response code (200 vs 403) is the larger giveaway. Not meaningfully exploitable.
- **P3.4 — PDF embedded URLs trigger fetches.** Neither qpdf nor pdfjs fetches external resources. ODL doesn't in non-hybrid mode (our default).
- **P3.6 — Trust-proxy depth.** Production runs nginx directly behind DigitalOcean — no proxy chain to exploit.

### Methodology note (for auditors)

This release follows the team's standing practice: **every feature ships through a fresh red/blue team review before tagging**. The review examines the newly-introduced surface from a sophisticated-adversary perspective, catalogs findings by severity (P1 real-and-exploitable / P2 bounded / P3 theoretical or accepted), fixes everything that can be fixed in the same release window, and documents the rest for the audit record. v1.20.0 added the fleet-integration surface; v1.20.1 is the security-followup that resulted. The full review notes appear in `README.md` § Security and in plain language in the policy page (`/data-retention` § 10).

### Commits

(this section is filled in at commit time)

## [1.20.0] — 2026-05-18

### Added — CMS-aware remediation download dialog

Replaces the single "Download Remediated PDF" button with a three-option dialog that defaults to preserving the exact original filename — critical for CMS workflows where the file is replaced in place and existing links resolve by name.

- **"Keep original filename"** is selected by default and badged **Recommended**. Downloads the remediated PDF under the user's exact uploaded filename (spaces, unicode, every byte). Server uses RFC 6266 dual-name `Content-Disposition` (`filename="<ascii-safe>"; filename*=UTF-8''<percent-encoded>`) so the original characters survive intact in modern browsers and curl.
- **"Add a '_remediated' suffix"** is an opt-in for users who want to keep the original alongside the remediated copy (e.g., archive workflows, not CMS replacement).
- **"Use a different filename"** is the destructive path — it shows a warning explaining that a different filename breaks every existing link to the PDF and requires a second click of the Download button to actually proceed (an "are you sure?" confirm gate).
- Above the radios, an explainer paragraph states *why* keeping the name matters: CMS file replacement under the same name preserves every existing reference without redirects or fix-up.

Schema change: added `original_filename TEXT` column to `remediation_jobs` via the existing ALTER TABLE probe pattern. The upload handler captures `file.originalname` before sanitization so the exact name survives end-to-end. Pre-v1.20.0 jobs have null `originalFilename` and fall back to the existing `<basename>_remediated.pdf` behavior — no breakage for in-flight rows during the rollout.

### Added — PDF export for the audit report

Adds a "PDF (browser print)" button next to the existing Word / HTML / Markdown / JSON export buttons on `/` and `/report/:id`. Calls `window.print()` and lets the OS save the report as PDF (default destination on macOS, Windows, ChromeOS). Zero new dependencies — avoids puppeteer / playwright / pdfkit (~100 MB combined).

A print stylesheet in `apps/web/app/assets/css/main.css` (`@media print`) handles the visual switch to ink-on-paper:

- Hides site chrome (header, nav, footer, buttons)
- Switches to white background + black text
- Expands all `<details>` so collapsed Technical Details prints in full
- Scales mermaid SVGs to container width
- Avoids page breaks inside headings and card sections
- Surfaces external link `hrefs` as inline text on paper

### Added — Mermaid diagrams in the Technical Details expandable

The standalone `/technical-details` page already had four mermaid diagrams; the inline Technical Details `<details>` expandable on the main results page had none. Added matching diagrams at four subsections:

- "How It Works" → audit pipeline
- "Application Architecture" → architecture diagram
- "Why Two Tools?" → two-tool parallel analysis
- "PDF Auto-Remediation: Pipeline Overview" → remediation pipeline

Same diagram sources as the standalone page so they stay in sync.

### Added — `AGENTS.md` at repo root

Cross-tool agent orientation for Claude Code, Codex, Cursor, Gemini CLI, etc. Consolidates the conventions that previously lived only in the user's private global `~/.claude/CLAUDE.md` (stack basics, the `./start-dev-server.sh` requirement, no-AI-co-author commit rule, `pnpm build` before push, `#config` path alias, the ALTER TABLE migration pattern, current API surface, common pitfalls like Nuxt 4 not 3 and mermaid render ordering). One short read orients any agent without trial-and-error.

### Fixed — `/remediate` desktop CLS 0.252

The result page rendered three discrete `v-if` regions (loading spinner / running progress / result content) and the page height jumped roughly 3000px when the third one mounted, pushing every subsequent paragraph down. Reserved space with `min-h-[calc(100vh-4rem)]` on the page container so the layout stays consistent between status transitions. Lighthouse perf score on `/remediate` desktop went **84 → 96**; CLS dropped out of the top issues entirely.

### Fixed — Result sections appearing mid-animation

Result sections (score banner, comparison table, issues, receipt) used `v-if="status?.status === 'complete'"` and appeared as soon as the server reported done — which could be roughly halfway through the local progress animator's walk through the four stages. New `isVisuallyComplete` computed (`status === 'complete' && !isVisuallyRunning`) gates all five result-page `v-if` guards so the progress arc finishes before any result content paints. One visual beat instead of two.

### Commits

- `8ec23a5` — feat(v1.20.0-pre): AGENTS.md, CLS fix, remediation filename dialog, PDF export, tech-details diagrams

## [1.19.0] — 2026-05-18

### Added — Fleet inventory integration

The fleet-audit story is now end-to-end. ICJIA's fleet inventory tool (and any similar PDF enumerator across ICJIA / Illinois state agency sites) can enrich each PDF row in its HTML / CSV output with a strict score, a practical score, and a stable click-through link to the full audit report — one HTTP call per PDF.

- **New endpoint: `POST /api/audit-url`** — combined "analyze a PDF by URL **and** persist a shareable report" route. Returns a trimmed scalar-only response shape (filename, pageCount, audited, strict score+grade, practical score+grade, reportId, reportUrl, reportExpiresAt, cached). Designed for direct flattening into CSV columns.
- **Hash dedup (Policy A).** After fetching the PDF the server computes `sha256(bytes)` and looks for an unexpired `shared_reports` row matching `(email, content_hash)`. On a hit, the cached `reportUrl` is returned and no new audit runs (`cached: true`). On a miss, a fresh audit runs and a new report row is persisted. Re-running the fleet job for unchanged PDFs returns the same URL — quarterly CSV diffs cleanly distinguish "file changed" from "row unchanged" without client-side caching. Optional `force=true` (body field or `?force=true` query param) bypasses dedup.
- **`docs/archive/fleet-inventory-reporting.md`** — self-contained integration brief for the fleet tool author. Covers PAT setup, request/response shape, 8 recommended CSV columns mapped to response fields, HTML grade-cell color coding, per-PDF pseudocode, status-code matrix with retry policy, dedup behavior, pacing guidance (1-2 concurrent max), URL allowlist with look-alike rejection examples, TTL recommendations (< 11-month re-run cadence), and a smoke-test plan against three known production PDFs.
- **README § "Fleet PDF Auditing (`POST /api/audit-url`)"** — endpoint comparison table vs `/api/analyze-url` and `/api/bulk-from-inventory`, the trimmed response example, hash-dedup explanation, and a jq one-liner to flatten the response into a CSV row.

### Changed — URL allowlist (broader fleet coverage)

Added four bare-domain entries to `DEFAULT_ALLOWED_HOSTS` in `apps/api/src/routes/analyze-url.ts`:

- `illinois.gov` — covers every `*.illinois.gov` state agency subdomain (large surface but exactly the fleet-audit intent)
- `icjia.cloud` — covers `*.icjia.cloud`
- `icjia.app` — covers `*.icjia.app` (production `audit.icjia.app` + future siblings)
- `ilheals.com` — covers `*.ilheals.com` (program partner)

The matcher's `host === ah || host.endsWith('.' + ah)` rule means each bare-domain entry auto-covers all subdomains. Look-alike domains (`illinois.gov.evil.com`, `fakeillinois.gov`) are still rejected. Operators can extend per-deployment via the `ANALYZE_URL_ALLOWED_HOSTS` env var.

### Changed — Shared-report TTL: 15 days → 365 days

`SHARED_REPORTS.EXPIRY_DAYS` bumped from 15 to 365 in `audit.config.ts`. The auditor / fleet-inventory use case needs report links that stay valid for at least a year between scans. Database growth cost is real but accepted — the row payload is content-free metadata, and a 100-PDF fleet at 50 KiB per report adds ~5 MB per year.

All five UI surfaces that hardcoded "15 days" were updated to "365 days" (`apps/web/app/pages/report/[id].vue`, `apps/web/app/pages/data-retention.vue`, three places in `apps/web/app/pages/index.vue`).

### Fixed — `/api/audit-url` returned strict score in the practical slot

The scoring engine emits `scoreProfiles.strict` and `scoreProfiles.remediation`; the UI labels the latter "Practical readiness score." The v1.19.0-pre `audit-url` extractor looked for `scoreProfiles.practical` (the user-facing name), found nothing, and fell back to the top-level `overallScore` — which is the strict score. Every audit-url response showed practical = strict.

Fixed by mapping the user-facing `practical` → internal `remediation` key inside the extractor. The 8 inline test cases were updated to match. Verified post-fix against three ICJIA agency PDFs:

```
NCHIP_Live_Scan_NOFO_Instructions  16 pp  strict 52/F  practical 56/F
ICJIA_Budget_Committee_Minutes     11 pp  strict 74/C  practical 74/C
Winter_2026_Newsletter              2 pp  strict 93/A  practical 95/A
```

(PDF 2's identical pair is genuine — the file has no PDF/UA signals that would split the profiles. The other two show the expected 2-4 point divergence.)

### Fixed — Accessibility violations across `/data-retention` and `/technical-details`

A full `axecap + lightcap + viewcap` sweep across mobile, tablet, and desktop viewports caught seven axe-AA violations and three missing-canonical SEO failures. All fixed:

- **`aria-prohibited-attr`** — 7 MermaidDiagram instances carried `aria-label="..."` on a plain inner `<div>`, which is prohibited per the ARIA spec when no widget/landmark role is present. Dropped the duplicative attribute (the parent `<figure>`'s `<figcaption>` already provides the accessible name) and added `tabindex="0"` so keyboard users can focus the scroll viewport.
- **`scrollable-region-focusable`** — code-block wrappers and table wrappers on `/data-retention` (5 instances) and `/technical-details` (1 instance) were keyboard-inaccessible. Added `tabindex="0"` to all of them.
- **`link-in-text-block`** — inline body link in `/data-retention` § 10 v1.17.0 article relied on color alone. Added `underline` to its class list.
- **`canonical` missing** — `/data-retention` and `/technical-details` now emit per-page canonicals via `useHead` keyed off `runtimeConfig.public.siteUrl`. `/remediate/<id>` is correctly `noindex,nofollow` (private session-bound URL).

Each MermaidDiagram instance also gets a unique `aria-describedby` target via `useId()`. Previously every diagram referenced `id="mermaid-desc"`, which produced duplicate IDs on any page with multiple diagrams (a latent a11y bug not flagged by today's audit but worth fixing).

Post-fix scores:

```
/data-retention     desktop  axe 0  a11y 100  SEO 100   (was a11y 92, SEO 92)
/data-retention     mobile   axe 0  a11y 100             (was a11y 92)
/technical-details  desktop  axe 0  a11y 100  SEO 100   (was a11y 96, SEO 92)
/technical-details  mobile   axe 0  a11y 100             (was a11y 96)
/remediate/<id>     desktop  axe 0  a11y 100  SEO 58    (SEO low is intentional —
                                                          private noindex page)
```

### Commits

- `0ba8cf2` — fix(a11y,seo): resolve 7 axe violations + 3 canonical-missing pages
- `b9e6578` — feat(api): POST /api/audit-url for fleet inventory enrichment
- `017a2a1` — fix(audit-url,web): practical score mapping + stale 15-day TTL text
- `78c2f72` — docs(fleet): integration brief + expanded URL allowlist (4 new domains)

### Deferred to a later release

- `/remediate/:id/download?name=` filename-choice option + UI dialog (CMS replacement workflow)
- Audit report export to PDF / Markdown / HTML (new format dropdown next to the existing Word export)
- `reportPdfUrl` / `reportMdUrl` / `reportHtmlUrl` fields on the `/api/audit-url` response
- `AGENTS.md` at repo root to consolidate cross-tool agent guidance
- CLS 0.252 investigation on `/remediate` (likely score-banner shift after content loads)

## [1.18.1] — 2026-05-18

### Fixed — PDF/UA-1 conformance verdict and remediation result UX

Three correctness fixes against the v1.18.0 remediation feature, plus one preflight enhancement. All issues are operational; none affect data privacy or retention guarantees.

- **veraPDF 1.30.x verdict was always reported as "not compliant"** regardless of the input PDF. In v1.30.x the validator output reshapes `validationResult` from a single object to a single-element array (`.report.jobs[0].validationResult[0]`); the v1.18.0 extractor read the array as an object, so `compliant` was always `undefined` and the truthy-check fell through to `passed: false` for every PDF. Auditors consulting the PDF/UA-1 disclaimer card on the remediation result page would have seen a silently wrong verdict in any deploy running veraPDF 1.30.x or newer. **Fixed** by detecting the array shape and unwrapping to `[0]` before extraction. Older veraPDF (≤ 1.26.x) keeps working unchanged.
- **Rule-summary extraction could crash** on veraPDF 1.30.x output. The 1.30.x schema places rule data at `validationResult[0].details.ruleSummaries` (array) and `details.failedRules` (number, count of distinct rules — not an array). The extractor's fallback chain included `details.failedRules` as an array source; a `.map()` on a number would have thrown `TypeError`. **Fixed** by removing the `details.failedRules` fallback and reordering the chain newest-first.
- **`totalFailureCount` under-reported failures on heavily-non-compliant PDFs.** Previously summed only the displayed (top-20) rule summaries. **Fixed** by preferring veraPDF's server-reported `details.failedChecks` when present; falls back to the old sum when not (older versions).
- **"Fix steps" links on the remediation result page were dead.** The `IssuesSummary` component built `href="#cat-<id>"` anchors that only exist on the audit pages, not on the remediation result page. Clicks fell through to no-ops. **Fixed** by replacing the broken anchor links with inline accordion expansion — each row now opens a panel showing the full findings list and the numbered Adobe Acrobat fix steps directly. Same data source as the audit-page cards (`partitionCardFindings`), so the remediation page stays in sync without duplicating logic.

### Added — rebuild.sh preflight auto-detects veraPDF

The Ubuntu deploy script now auto-detects veraPDF at four common install paths (`/opt/verapdf`, `/home/forge/verapdf`, `$HOME/verapdf`, `/usr/local/bin`), exports `REMEDIATION_VERAPDF_PATH` for the deploy if found, and warns when the path isn't persisted in `/etc/environment` for PM2 to inherit across reboots. When veraPDF isn't installed at all, the script now prints inline copy-paste Ubuntu install instructions (download → izpack interactive installer → cleanup → persistence command) so a fresh server can get to PDF/UA-1 conformance reporting in one operator visit.

### Commits

- `49b9cca` — feat(deploy): rebuild.sh preflight auto-detects veraPDF + prints install instructions
- `d35bc6b` — fix(remediation): handle veraPDF 1.30.x array-shaped validationResult
- `6d9e193` — fix(remediation): correct veraPDF 1.30.x rule-summary path + use server total
- `24a3cd0` — fix(remediation): inline fix-step expansion in IssuesSummary

## [1.18.0] — 2026-05-18

### Added — PDF auto-remediation feature

Optional feature that produces a tagged, more-accessible PDF from an audited one. Gated behind `REMEDIATION_ENABLED=true`; disabled by default. Full architectural spec in [`docs/archive/pdf-remediation-integration-plan.md`](docs/archive/pdf-remediation-integration-plan.md); feasibility data behind every decision in [`docs/archive/spike-remediation-results.md`](docs/archive/spike-remediation-results.md); Phase 1 follow-up spec (interactive alt-text walkthrough) in [`docs/archive/pdf-remediation-alt-text-walkthrough-spec.md`](docs/archive/pdf-remediation-alt-text-walkthrough-spec.md).

**Pipeline:**

```
upload → qpdf --object-streams=disable (preprocess)
       → OpenDataLoader tagged-pdf (basic mode)
       → qpdf --check (validate output is a parseable PDF)
       → veraPDF --flavour ua1 (validate PDF/UA-1 conformance, optional)
       → re-audit (verify scores didn't regress on Overall, Strict, OR Practical)
       → finalize OR reject
```

**Privacy & retention:**

- PDFs are never persistently cached between audit and remediation — re-upload required.
- Inputs deleted between pipeline stages (after qpdf normalize, after ODL tag).
- Output deleted on first successful download (single-use token) OR after a 30-minute TTL.
- Lifecycle audit trail (`remediation_events` table) records every step including post-deletion `fs.stat` ENOENT verification (`verified_absent` event) — the auditor's evidence that the file is gone.

**UI:**

- "Auto-Remediate this PDF" button under the score on the audit results page, including in batch (per-tab) mode. Greyed-out + disabled with explanation for already-A files.
- `/remediate/[jobId]` progress + result page with Before/After ScoreCards (vertical, infographic banners), Strict + Practical score comparison table, "What we fixed" / "Improved but still needs review" / "Outstanding by severity" sections, veraPDF verdict + IITAA disclaimer with manual-review-required notice + links to [verapdf.org](https://verapdf.org/) and Illinois DOIT, source-document accessibility recommendation, and a processing receipt panel.
- Adobe Acrobat parity removed from the UI on both audit + remediation pages — visible metrics that can decrease (e.g., vacuous-pass dynamics) erode user trust. Backend still computes for data-shape stability.

**Backend:**

- New API routes: `POST /api/remediate`, `GET /:id/status`, `GET /:id/download`, `GET /:id/receipt`. All gated behind `REMEDIATION.ENABLED` (`404` when off).
- Detached child worker (`apps/api/src/jobs/remediate.ts`) preserves synchronous audit-pipeline performance.
- 5-step cleanup sweep on a configurable interval + on every API startup (expired outputs, stuck jobs, orphan files, purged old job + event rows).
- Per-user concurrent-job limit (1), file-size cap (50 MB), page-count cap (500), JVM heap cap (`-Xmx768m`).
- veraPDF integration via `REMEDIATION_VERAPDF_PATH` (optional; preflight warns when missing).
- Per-profile regression guard: rejects output if Overall, Strict, or Practical scores decrease.

**Deployment:**

- `ecosystem.config.cjs` forwards `REMEDIATION_*` env vars from the parent shell so `REMEDIATION_ENABLED=true ./rebuild.sh` flips the feature on without code changes.
- `rebuild.sh` preflight checks for OpenJDK 17, `qpdf --object-streams` support, and `REMEDIATION_VERAPDF_PATH` configuration. Non-blocking warnings except `pnpm` (hard requirement).

**Security audit:** see [README § Security](README.md#security). Two P1 issues caught and fixed before tagging (download-endpoint memory exhaustion + concurrent-download token race), two P2s mitigated/accepted, no P0s.

**Spike validation:** OpenDataLoader's basic mode tested against 12 representative ICJIA-style PDFs. Untagged inputs (5/5): avg +25 score, zero damaged outputs. Tagged inputs (4): two produced damaged outputs that the discovered qpdf preprocessing step fully mitigates. Hybrid mode and SmolVLM tested but deferred to roadmap.

### Added — `content_hash` on `audit_log` and `remediation_jobs`

SHA-256 of the input PDF bytes is recorded on every audit and remediation, enabling a future "did this file go through our tool?" verification endpoint (Phase 3 roadmap). Hash is pure metadata — no PDF content stored.

## [Unreleased]

### Added — `POST /api/analyze-url` and `?prefill=` web UI parameter

New endpoint and web integration that allow a PDF to be audited by URL rather than file upload.

**API (`POST /api/analyze-url`):**

```bash
curl -X POST https://audit.icjia.app/api/analyze-url \
  -H "Authorization: Bearer fap_yourtoken" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://icjia.illinois.gov/documents/2024/annual-report.pdf"}'
```

Returns the same `AnalysisResult` JSON shape as `POST /api/analyze`.

**Web UI (`?prefill=<url>`):**

Visiting `https://audit.icjia.app/?prefill=https%3A%2F%2Ficjia.illinois.gov%2Fdocs%2Freport.pdf` auto-fetches and analyzes the file on page load, displaying the result in the existing single-file analysis UI. This makes the "Audit Link" column generated by [filecap-cli](https://github.com/ICJIA/filecap-cli) work end-to-end — click a row link and the audit runs immediately.

**Security:**

- URL allowlist: only ICJIA-owned domains accepted by default; extendable via `ANALYZE_URL_ALLOWED_HOSTS` env var.
- SSRF block: localhost, RFC1918 private ranges, link-local, `.local`/`.internal` are rejected even if allowlisted.
- 100 MB per-file cap; 30 s fetch timeout; magic-bytes PDF check.
- Auth required (same `authMiddleware` + `analyzeLimiter` as `/api/analyze`).

**Files changed:**
- `apps/api/src/routes/analyze-url.ts` — new route
- `apps/api/src/index.ts` — route mount
- `apps/api/src/__tests__/analyze-url.test.ts` — unit tests
- `apps/web/app/composables/usePrefill.ts` — new composable
- `apps/web/app/pages/index.vue` — wires `usePrefill`
- `apps/web/app/__tests__/usePrefill.test.ts` — unit tests

### Added — Personal access tokens for CLI/API authentication

New `access_tokens` table and three token management endpoints so headless clients (e.g. [@icjia/filecap](https://github.com/ICJIA/filecap-cli)) can authenticate without a browser session.

**Endpoints:**

- `POST /api/tokens` — create a named token (session auth only; returns the raw token once)
- `GET /api/tokens` — list the caller's tokens (metadata only; raw tokens never returned)
- `DELETE /api/tokens/:id` — revoke a token by ID (session auth only; row retained for audit trail)

**Token format:** `fap_<32-hex-chars>` (128-bit entropy). The server stores only the SHA-256 hash.

**Auth middleware change:** `authMiddleware` now checks for an `Authorization: Bearer fap_xxx` header before falling through to the existing cookie/JWT check. Sets `req.user.authMethod` to `'pat'` or `'session'` so downstream route handlers can distinguish.

**Security:**
- Raw token shown once at creation; never stored or retrievable.
- PAT-authenticated requests cannot mint or revoke tokens (prevents a leaked token from compounding damage).
- `last_used_at` updated on each authenticated request; `revoked_at` retained for paper trail.
- Per-user cap of 10 active tokens (configurable via `MAX_TOKENS_PER_USER`).

**Migration:** `CREATE TABLE IF NOT EXISTS access_tokens` and its indexes are added to the existing startup `db.exec(...)` block in `db/sqlite.ts` — no separate migration step required for new installs. Existing installs: the table will be created on next startup.

---

### Added — `POST /api/bulk-from-inventory` endpoint (closes #9)

New endpoint that accepts a [filecap](https://github.com/ICJIA/filecap-cli) NDJSON inventory, fetches each PDF server-side by its public URL, runs the existing `analyzePDF` scoring pipeline, persists every result via `shared_reports`, and returns a manifest with per-file scores, grades, and shareable report links.

**Request (JSON body):**

```json
{ "inventory": "<NDJSON content>", "filterCategory": "pdf" }
```

**Request (raw text — for `curl --data-binary`):**

```bash
curl -X POST \
  -H "Cookie: token=<your-jwt>" \
  -H "Content-Type: text/plain" \
  --data-binary @inventory.ndjson \
  https://audit.icjia.app/api/bulk-from-inventory
```

**Response:**

```json
{
  "summary": { "total": 10, "analyzed": 9, "failed": 1, "skipped": 3 },
  "results": [
    { "path": "2024/report.pdf", "publicUrl": "...", "overallScore": 78, "grade": "C", "reportId": "...", "reportUrl": "/api/reports/..." },
    { "path": "2024/scan.pdf",   "publicUrl": "...", "error": "not a valid PDF (header bytes: ...)" }
  ]
}
```

**Key behaviors:**

- Parses filecap NDJSON: recognizes header/footer records, reconstructs `publicUrl` from `publicUrlBase` when individual entries omit it, filters to `category === filterCategory`.
- 5 MB inventory cap; 15 MB per-PDF cap (matches `ANALYSIS.MAX_FILE_SIZE_MB`); 100 files per request maximum.
- Processing is intentionally serial to respect the existing 2-at-a-time semaphore in `pdfAnalyzer.ts`.
- Auth required. Uses existing `authMiddleware` (cookie JWT) and `reportsLimiter`.
- Adds `express.text({ limit: '5mb', type: 'text/plain' })` in `index.ts` for the raw text/plain intake mode.

## [1.17.0] - 2026-05-04

### Added — Action banner + Issues to fix punch list

Two new in-page blocks under the score hero on both the shareable-report page (`/report/:id`) and the post-upload page (`pages/index.vue`):

- A one-line **action banner** with severity-keyed copy (e.g., `2 critical issues must be fixed before publishing.`) that gives an at-a-glance verdict in plain English. Tinted red for Critical, yellow for Moderate-only, blue for Minor-only, green when the PDF passes outright.
- A severity-ordered **Issues to fix** punch list with anchor links that jump straight to the matching Detailed Findings card. Sort order is Critical → Moderate → Minor; Pass and N/A categories are excluded. Each row shows the category name, severity pill, a one-line plain-English summary derived from the category's first actionable finding, and a `↓ Fix steps` jump anchor.

Each Detailed Findings card root div now carries a stable anchor id (`cat-${cat.id}`) so the punch-list jump links — and any future linkable export — can target it.

### Changed — Detailed Findings card layout

The technical-detail lines that some categories emit (the `--- Section ---` headers and their indented data lines) are no longer interleaved with plain findings. They now group into a clearly-labeled **Technical signals** panel within each card:

- The panel only renders when the per-card `Basic` / `Advanced` toggle is on **Advanced**.
- It uses a subtle left rule, dim text, and a monospace font to visually separate the data signals from the human-readable findings above it.
- A small `N technical signals` count label sits next to the toggle so the user knows what's available before flipping. Cards with zero technical signals hide the toggle and label entirely.

The plain findings list, the guidance lines (`Fix:` / `Tip:` / `Note:`), and the Adobe Acrobat fix-steps panel are unchanged in both modes — they always render the same way regardless of Basic / Advanced.

### Refactored — utility extraction

- `isGuidanceFinding` and a new `firstActionableFinding` helper extracted into `apps/web/app/utils/findings.ts` for reuse by the Issues summary component. The two duplicate copies in `pages/report/[id].vue` and `pages/index.vue` are intentionally left in place; deduping is a separate engagement.
- New `partitionCardFindings` helper in the same util splits a category's findings array into `{ main, signals, signalCount, acrobat }` in one pass, so each Detailed Findings card no longer has to chain `splitAcrobatGuide` + `filteredFindings` + per-line conditionals during rendering.
- New `tallySeverity` utility in `apps/web/app/utils/severityTally.ts` aggregates category severity counts for the action-banner copy.

### Tests

15 new unit tests across the new utilities and components: `tallySeverity` (3 cases), `findings` helpers including `partitionCardFindings` (14 cases), and the `ReportActionBanner` and `IssuesSummary` components. Total web suite: 283 / 283 passing.

## [1.16.3] - 2026-05-04

### Fixed

- Shareable report links (`/report/:id`) returned a 500 server error in production whenever the link resolved to a real `shared_reports` row. SSR rendering threw `ReferenceError: gradeColors is not defined` from `apps/web/app/pages/report/[id].vue`'s `catColor()`. The function was rewritten in v1.12.x to look up `gradeColors[cat.grade]`, but the `gradeColors` map was only added to `pages/index.vue` — not to the shared-report page. Local development never tripped it because the local SQLite usually has no row matching the prod link, so the page rendered the `v-else-if="error"` ("Report Not Available") branch and never hit `catColor`. Vitest tests parse `.vue` source as text rather than SSR-rendering with valid data, so they passed too. Fix: declare the same five-entry `gradeColors` map (`A → #22c55e` … `F → #ef4444`) directly above `catColor()` in `pages/report/[id].vue`. Verified by seeding the prod payload into local SQLite and confirming `/report/:id` now returns 200 with the full rendered report.

## [1.16.2] - 2026-04-22

### Docs

README's "Adobe Acrobat parity panel" section brought up to date with the v1.16.1 UX changes: card renamed to "the third view," placement above Category Scores documented, interactive-tallies behaviour described (click to filter, hover for rule-name tooltip, keyboard-navigable, vacuous pass marker in the tooltip), direct link to Adobe's 32-rule documentation called out. No code changes — docs-only release so deployed instances match the README's narrative.

## [1.16.1] - 2026-04-22

### Changed — Adobe parity card: prominence and interactivity

Follow-up polish for v1.16.0, shipped same day after live review. The parity card was sitting below the Category Scores table and reading as a secondary panel — users weren't registering that Acrobat's view was a *third* lens alongside Strict and Practical. The tallies were also static summary numbers with no path to "which rules passed vs failed?"

- **Card moved above Category Scores** on both `pages/index.vue` and `pages/report/[id].vue`. Report now reads: grade circle → Strict/Practical dual row → Acrobat parity card → Category Scores. The three lenses land in a single scan.
- **Eyebrow reframed** from "Reconciliation view" to "Third view · alongside Strict & Practical" so the pattern is explicit. Card itself now uses an indigo accent border (`border-2 border-indigo-500/30`) that differentiates it from the neutral-chrome Category Scores card.
- **Tallies enlarged.** Numbers jumped from `text-lg` to `text-2xl sm:text-3xl font-bold` and pills grew in padding. The five tallies now carry the visual weight of the section.
- **Tallies are interactive.** Each pill is now a `<button>` with `aria-pressed` state. Clicking a pill filters the rule detail list to just that bucket (Passed / Failed / Manual / Skipped / Not computed) and auto-expands the detail section with a smooth scroll-into-view. Clicking the active pill again clears the filter; a "Show all 32" button in the filtered-state banner does the same. Pills with 0 rules are disabled.
- **Hover tooltips via native `title`.** Hovering a pill previews the rule names in that bucket without opening the detail view, with vacuous passes marked `(vacuous)`. Works cross-platform with no custom tooltip library.
- **Direct link to Adobe's 32-rule reference.** Header subtitle and the authority callout both link to `https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html` so managers can verify Acrobat's ruleset against Adobe's own documentation with one click.
- **Internal reorder: tallies first, authority callout below.** The numbers land first (Acrobat-view at a glance), then the one-line vacuous-watch callout, then the "Adobe is not the canonical reference" amber box with WCAG / IITAA / PDF/UA / Matterhorn context. The authority callout still stays visible when rule detail is collapsed.
- **Accessibility.** Pills are keyboard-navigable via Tab, operate via Enter/Space, announce their count and pressed state to screen readers, and are visually ring-highlighted when active. The tally grid has `role="group"` with a descriptive `aria-label`.

## [1.16.0] - 2026-04-22

### Added — Adobe Acrobat parity panel

New **Adobe Acrobat parity** card on every report, mirroring Acrobat's 32-rule built-in Accessibility Checker alongside this tool's verdict. Purpose: close the expectation gap for managers and authors who anchor on "Acrobat says my PDF passes" as a compliance answer, and to surface that Acrobat is neither the Illinois compliance bar (WCAG 2.1 AA via IITAA §E205.4) nor the PDF/UA bar — it is a lightweight subset Adobe chose to automate.

- `apps/api/src/services/scoring/adobeParity.ts` — pure function mapping QPDF + pdfjs signals onto Acrobat's 32 rules, grouped by Acrobat's native categories (Document / Page Content / Forms / Alternate Text / Tables / Lists / Headings). Each rule returns status (passed / failed / manual / skipped / not_computed) plus a `vacuous: boolean` flag and a per-rule note explaining what this tool actually saw.
- Summary tallies (`passed`, `failed`, `manual`, `skipped`, `notComputed`, `vacuousPasses`, `total`) at the top of the card. **No aggregated "Adobe score" is exposed** — anchoring on that number would defeat the purpose. Parity is qualitative and rule-by-rule.
- `apps/web/app/components/AdobeParityCard.vue` — collapsible card with an always-visible authority callout. The callout names the references that do govern Illinois electronic-document accessibility (**WCAG 2.1 AA via IITAA §E205.4**) and positions PDF/UA (ISO 14289-1) as industry-standard but not required by Illinois law (IITAA §504.2.2 covers authoring-tool export capability only). Matterhorn Protocol is cited as the PDF Association's formal 136-condition PDF/UA test so readers understand Acrobat's 32 rules are well below either canonical standard.
- **Vacuous-pass annotations.** When Acrobat's rule clears its bar only because the relevant content type does not exist in the document (no tables → 4 table rules pass, no figures → all 5 alt-text rules pass, no headings → "Appropriate nesting" passes), the card tags the row `⚠ vacuous` and the per-rule note explains why. On documents with sparse structure, vacuous passes can dominate Acrobat's "Passed" count — on the ILHEAL control fixture Acrobat reports `28/32 passed` while ~20 of those 28 are vacuous.
- **`ScoringResult.adobeParity`** added to the API / JSON-export response. Shared reports gracefully degrade on older snapshots via `v-if="data.report.adobeParity"`.

### Tests

6 new scorer tests covering: always-32-rules shape in Acrobat's native 8/9/2/5/5/2/1 grouping, ILHEAL "Potemkin-tagged" case (StructTreeRoot present but empty → `tagged_pdf` and `tagged_content` as vacuous passes, `figures_alternate_text` note surfaces painted-but-untagged images), real-structure case on a well-tagged fixture (non-vacuous passes dominate, malformed lists produce `lbl_and_lbody` failure), invariant that `Summary` is always skipped and `Logical Reading Order` / `Color contrast` are always manual, and that no aggregated Adobe score leaks into the summary shape. 255 / 255 tests pass (6 new + 249 existing).

### References

Parity UI and README point to [Adobe's official Acrobat Accessibility Checker documentation](https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html) for anyone who wants to verify the 32-rule set against Adobe's own reference.

## [1.15.1] - 2026-04-20

### Fixed

- Production `tsc --noEmit` build failure introduced by v1.15.0. The new scorer invariant tests constructed `heading` fixtures with numeric `level` (`level: 1`) and `list` fixtures with non-interface properties (`hasLI`, `hasLbl`, `hasLBody`). Vitest uses esbuild which is permissive about these type mismatches, so local `pnpm test` passed, but production builds through `tsc --noEmit` in `apps/api/package.json` caught them. Fixtures are now type-correct: `level` is `"1"` / `"2"` (the canonical string-form the parser emits) and lists use `hasLabels`, `hasBodies`, `nestingDepth` matching the `ListAnalysis` interface.

## [1.15.0] - 2026-04-20

### Added

- **Always-visible dual-score audit row** under the main grade circle in `ScoreCard`. Renders `Strict X/100` in emerald and `Practical Y/100` in amber side-by-side, regardless of which mode is selected via the toggle. Auditors no longer need to flip the mode switch to confirm both numbers. `data-testid="dual-score-audit-row"`, `role="group"`, and per-pill `aria-label` attributes for screen readers.
- **Export parity.** The Markdown / AI-analysis / plain-text exports now emit both scores: `Strict score (WCAG / IITAA §E205.4): X/100 (grade)` followed by `Practical score (WCAG + PDF/UA): Y/100 (grade)`. When the Strict floor lifts Practical, the export line also includes `(raw weighted-average: Z/100; floored to Strict)` so downstream consumers can reconstruct the pre-floor math.
- **`scoreProfiles.remediation.rawOverallScore`** and **`scoreProfiles.remediation.flooredToStrict`** on the API / JSON-export response. `rawOverallScore` is always the pre-floor weighted-average number; `flooredToStrict` is true when the floor lifted the displayed `overallScore`. Strict profile mirrors `rawOverallScore = overallScore` and `flooredToStrict = false`.

### Changed — `Strict ≤ Practical, always` invariant

The scorer now guarantees `Practical.overallScore ≥ Strict.overallScore` for every document. If the raw Practical weighted-average math produces a lower number (because Practical's different category weights moved scoring mass onto a category that happened to score low, or for any reason a future document might surface), Practical is lifted up to Strict. The per-category Practical scores are unchanged — only the overall aggregate is floored — so the raw category math remains inspectable.

This subsumes the v1.14.1 bonus-only PDF/UA rule (still in place as an internal first pass) and gives users a single simple invariant to remember: "Practical can only add points to Strict, never subtract."

### Changed — clearer framing of what each score covers

- **Strict** is now positioned as **the canonical score covering WCAG 2.1 AA + ADA Title II + Illinois IITAA §E205.4** — the three rules that actually govern non-web document accessibility in Illinois. This is the number to cite in legal-compliance contexts, agency sign-off, FOIA responses, and audits with groups (e.g. Illinois DoIT) that evaluate documents against IITAA without a PDF/UA overlay.
- **Practical** adds an **ISO 14289-1 (PDF/UA) layer** on top of Strict. The description in the homepage / mode-toggle / export copy now explicitly notes that PDF/UA is *not* a legal requirement for final PDFs under Illinois rules — IITAA §504.2.2 references PDF/UA only for authoring-tool export capability, not for the PDF artifact itself.

### Simplified — user-facing explanatory text

The "Why the two scores can differ" technical-details paragraph is rewritten around the single `Strict ≤ Practical` invariant. The previous three-paragraph version (higher / lower / bonus-only) is replaced by one paragraph describing Strict's coverage and one describing the relationship. The `PDF/UA is a bonus-only contribution` subsection in the README is replaced by a fuller `Strict is the canonical score and the floor for Practical` section.

### Tests

Three new scorer invariant tests: (a) `Practical.overallScore >= Strict.overallScore` for every document, (b) `rawOverallScore` and `flooredToStrict` are always present and correctly populated, (c) non-floor cases retain `flooredToStrict = false`. 500 tests pass in total (251 web + 249 api).

## [1.14.1] - 2026-04-20

### Changed — PDF/UA becomes a bonus-only contribution in Practical

The 9.5% `pdf_ua_compliance` category used to be aggregated into Practical's weighted average like any other category, which meant a weak PDF/UA score could drag the Practical aggregate below what a WCAG-only renormalization would produce. That was counterintuitive — a "practical readiness" profile shouldn't punish a document for missing PDF/UA markers that have no bearing on WCAG conformance.

**Now:** Practical computes its overall score two ways and keeps the higher number:

1. With `pdf_ua_compliance` included in the weighted average (historical behavior).
2. With `pdf_ua_compliance` excluded and the remaining weights renormalized (WCAG-only Practical).

When the document's PDF/UA signals are strong, path (1) wins and PDF/UA lifts the aggregate as before. When they're weak, path (2) wins and the PDF/UA category is silently dropped from the aggregate, surfacing the WCAG-only Practical score instead. The `pdf_ua_compliance` row still appears in the per-category breakdown with its own score, so the signal is visible to auditors — only the aggregation step is guarded.

### Control-fixture effect

| Fixture | Strict | Practical v1.14.0 | Practical v1.14.1 |
|---|---|---|---|
| FY_22 Annual Report (baseline) | 39 | 57 | 57 (unchanged — PDF/UA 75 lifts) |
| FY_22 Annual Report (remediated) | 67 | 83 | 83 (unchanged — PDF/UA 85 lifts) |
| WomenInPolicing 2021 (baseline) | 65 | 65 | 65 (unchanged — PDF/UA 65 neutral) |
| **WomenInPolicing 2021 (remediated)** | **81** | **80** | **81** (no longer drops below Strict) |

Strict is unaffected by this rule (its `pdf_ua_compliance` weight is 0; the category is surfaced as N/A with guidance text).

### Documentation

- **Homepage "Why the two scores can differ" section** expanded to explain (1) that weight differences alone can make Practical score below Strict even without PDF/UA in the mix (different weight-mass on the same categories), and (2) the bonus-only PDF/UA rule with a plain-language explanation.
- **README "Scoring Rubric" section** rewritten with a control-fixture table showing the before/after impact on both fixture pairs and clear language that Practical is "Strict with different weights, plus an extra PDF/UA category" — not "Strict + a bonus."
- Four new scorer tests lock in the invariants: (a) Practical overall ≥ WCAG-only Practical score for every document, (b) the `pdf_ua_compliance` row is still present with its own score, (c) a strong PDF/UA signal lifts Practical above WCAG-only, (d) Strict is not affected by the bonus-only rule.

497 tests pass (251 web + 246 api).

## [1.14.0] - 2026-04-20

### Added

- **Rigorous per-page reading-order check in Strict mode.** When the analyzer can extract a structure-tree MCID sequence (logical tag order from QPDF) and a content-stream MCID sequence (visual draw order from pdfjs-dist) for the same page, it computes a longest-common-subsequence ratio, weights across pages, and produces a 0–100 Strict score with bands at 100% / 95% / 80% / 50% / <50%. When the sequences don't overlap sufficiently (fewer than 2 shared MCIDs per page), Strict falls back to an honest N/A.
- **New `QpdfResult.structTreeMcidsByPage`** (`Record<number, number[]>`) built in `qpdfService.ts`: walks the StructTreeRoot, tracks enclosing `/Pg` references, resolves MCR dicts that may override the page, and skips OBJR (non-content) kids. Cycle-guarded and depth-limited.
- **New `PdfjsResult.contentStreamMcidsByPage`** (`Record<number, number[]>`) built in `pdfjsService.ts`: piggybacks on the existing operator-list loop, captures MCIDs from `OPS.beginMarkedContentProps`, and skips `/Artifact`-tagged runs (which don't participate in logical reading order). Handles pdfjs-dist's two tag shapes (plain string vs. `{name: string}`) and the two properties shapes (bare MCID number vs. dict).
- **New `computeReadingOrderFidelity()` and `longestCommonSubsequence()` helpers** in `scorer.ts`. LCS is O(m·n) with negligible cost at typical PDF MCID counts (tens to low hundreds per page).
- **Practical mode gains an informational finding** reporting the rigorous fidelity percentage; the Practical score itself still uses its proxy formula (unchanged).
- **Six new scorer tests** cover the rigorous path: perfect match, partial drift, reverse order (worst case), N/A fallback when MCIDs don't overlap, Practical still uses proxies, fidelity finding appears in Strict output.
- Control-fixture validation: baseline annual-report → Strict reading_order 70 (C); remediated → 70 (C). Strict overall 37 → 39 / 66 → 67 (tiny uptick from the reading_order category no longer being excluded via null).
- UI copy on `ModeCompareBox` and `NaCell` updated to describe what Strict now does instead of "abstains because not yet implemented."

### Changed

- **`MAX_FILE_SIZE_MB` lowered from 50 to 15.** Updated `audit.config.ts`, the `.env.example.local` / `.env.example.production` hints, `DropZone.vue` client-side check + drop-zone copy, error messages in `apps/api/src/index.ts` (now interpolated from config), `llms.txt` / `llms-full.txt`, README table + memory-exhaustion mitigation calc, and two `components.test.ts` assertions.

### Tagged

- `revert-point-pre-reading-order` — safe restore point pinned at v1.13.8. If the reading-order work needs to be undone: `git reset --hard revert-point-pre-reading-order && git push --force-with-lease origin main`.

## [1.13.8] - 2026-04-20

### Added

- **Compact Strict / Practical mode switch in the Category Scores header.** Lets users flip the active scoring mode in place without scrolling back to the top-of-page ScoreProfileBanner toggle. Segmented pair of `<button>` elements with `aria-pressed` state and `role="group"` / `aria-label="Switch scoring mode"` for screen-reader context. Active side uses emerald (Strict) or amber (Practical) tinting; inactive side is muted with a hover state.
- **Scroll-preservation** on the switch: `categoryScoresAnchor` ref captures the card's viewport top before the flip, and `window.scrollBy` cancels the delta after `nextTick` + one `requestAnimationFrame`. The card stays visually pinned while the table rows and descriptive header copy re-render at different heights. Same pattern used in `ModeCompareBox.flipMode` (v1.13.5).
- Mirrored on `pages/index.vue` and `pages/report/[id].vue`.
- 251 web tests still pass.

## [1.13.7] - 2026-04-20

### Changed

- **ModeCompareBox's divergence badge is now visually prominent.** Bumped text from 10px to 11px, raised weight to `font-semibold`, gave it a larger pill (`px-2.5 py-1`), and added a leading glyph (`=` for matching scores, `⚠` for divergent). The "same" state uses emerald tinting (previously muted gray that faded into the background); the "diverges" state stays amber.
- **Badge label** on non-branching categories updated from "Same in both modes" to "Same score in both modes" so the badge can't be read as "same scoring mode."
- **New inline explainer** rendered immediately below the pills when scores match: "Both pills show the same score because this category scores the same under both methodologies — only the profile weight differs, which affects the overall grade. Not a bug."

## [1.13.6] - 2026-04-20

### Added

- **Accessible N/A tooltips in the Category Scores table.** Each N/A cell now renders a small focusable "i" button that exposes an `aria-describedby` tooltip explaining *why* the analyzer abstained — e.g. "Strict does not include a PDF/UA category" or "Reading Order requires per-page marked-content vs. page-stream comparison, which this analyzer doesn't yet perform." Shows on mouse hover and keyboard focus-within; screen readers announce the reason via the `aria-label` on the button plus the `role="tooltip"` element.
- **New `<NaCell>` component** (`apps/web/app/components/NaCell.vue`) drives the tooltip. Backed by a new `naReason(catId, mode)` helper in `modeDivergence.ts` with distinct copy for `pdf_ua_compliance`, `reading_order`, `color_contrast`, `bookmarks`, and the image/table/link/form "none detected" cases.
- **Footnote below the Category Scores table** spelling out that N/A is an analyzer abstention, not a WCAG/ADA/IITAA exemption, with a visual hint to hover/focus the "i" button for the specific reason per row.
- **`na-cell.test.ts`** (3 tests) locks in the a11y contract — `aria-describedby`, `aria-label`, `role="tooltip"`, and per-category reason strings. 247 web tests pass.

### Changed

- Score cells where `cat.score === null` now render the `<NaCell>` instead of an empty string (previously blank under Strict for PDF/UA and Reading Order).
- Grade / Severity em-dash placeholders for N/A rows are now `aria-hidden="true"` so the tooltip becomes the single accessible source of truth.

## [1.13.5] - 2026-04-20

### Changed

- **Clicking a Strict/Practical pill no longer causes the viewport to jump.** The ScoreProfileBanner's rationale paragraph and several mode-dependent badges re-render at different heights when the active mode flips; that shifted the clicked card up or down relative to the viewport. `ModeCompareBox.vue` now captures its own `getBoundingClientRect().top` before emitting the mode change and, after Vue has flushed the DOM and one animation frame has elapsed, calls `window.scrollBy` to cancel out any delta. The clicked card stays visually static across the flip.
- No-op when the click is for the already-active mode, and no-op in SSR contexts where `window` is undefined.

## [1.13.4] - 2026-04-20

### Changed

- **Divergent categories (PDF/UA, heading_structure, table_markup, reading_order) now stay anchored in Detailed Findings** regardless of which mode is active. Previously, flipping to Strict via the PDF/UA mode-compare pill moved the card out of Detailed Findings into "Not Included in Scoring," which shifted the viewport — the next card underneath (often Text Extractability at 100/100 in both modes) scrolled into view and looked like the pill scores had changed. They hadn't; a different card had taken the position.
- `scoredCategories` filter now keeps any category that is scored in at least one profile (via `hasCrossModeSignal`); `naCategories` only catches categories that are N/A in both profiles (currently just `color_contrast`). The Detailed Findings card header gracefully displays `N/A` when the active mode is null for that category.
- Applied to both `index.vue` and `report/[id].vue`.

## [1.13.3] - 2026-04-20

### Changed

- **ModeCompareBox now renders inside "Not Included in Scoring" cards too** when the two profiles diverge for that category (e.g. PDF/UA Compliance Signals: Strict = N/A, Practical = scored). Previously clicking the Strict pill on a PDF/UA Practical card flipped mode to Strict, which moved the card out of Detailed Findings into the N/A section — and the mode-compare pills disappeared because the N/A section didn't render ModeCompareBox. Now the pills travel with the card so Strict = N/A and Practical = its score stay visible across the toggle.
- **New `hasCrossModeSignal(catId)` helper** on both `index.vue` and `report/[id].vue` gates the N/A-card ModeCompareBox so categories that are N/A in both modes (e.g. `color_contrast` without rendered-contrast analysis) don't get a useless "N/A vs N/A" box.
- **New `mode-compare-stable.test.ts`** locks in the invariant that ModeCompareBox's two pill scores stay put when `selectedMode` flips — 244 web tests now pass.

## [1.13.2] - 2026-04-20

### Changed

- **Practical mode's rationale block is now a single paragraph** instead of two. Dropped the redundant "NOTE:" amber banner — its content ("both evaluate the same document under WCAG … pick whichever view") duplicated the top-level `mode-recommendation-summary` directly above it.
- **The remaining Practical paragraph is tightened to match Strict's word count** (~36 vs. ~35 words): "Practical adds a PDF/UA Compliance Signals category (MarkInfo, tab order, list/table legality, PDF/UA identifiers) plus partial-credit floors on heading and table structure. Useful for tracking PDF/UA tools and authoring exports referenced in IITAA §504.2.2 PDF Export."
- **Keeps the §504.2.2 PDF Export link** and the indicator that Practical is useful for tracking PDF/UA tools per IITAA guidelines.
- `data-testid="practical-disclaimer"` now points at the single remaining Practical paragraph (the element previously carrying `strict-findings-note`).
- Test assertions updated; all 243 web tests pass.

## [1.13.1] - 2026-04-20

### Changed

- **Mode-compare boxes inside Detailed Findings are now clickable.** The per-category Strict / Practical score pills in `ModeCompareBox.vue` are rendered as `<button>` elements with `aria-pressed` state. Clicking either pill emits `update:selectedMode`, which the index and report pages bind to `selectedScoreMode` so the global mode flips from any category card.
- **The active profile's rationale paragraph moves to the top** of the "Why Strict matters / Why Practical matters" stack and gets an `· active view` tail indicator. Switching modes reorders the paragraphs in place so the relevant rationale is read first.
- **All 243 web tests still pass.**

## [1.13.0] - 2026-04-20

### Changed — profile messaging rewrite (no scoring-logic changes)

This release rewrites how the two scoring profiles are described throughout the app, exports, docs, and LLM files. Scoring weights, partial-credit floors, and scoring branches are unchanged. Stored reports continue to render identically. Internal profile keys (`strict`, `remediation`) are unchanged.

Motivation: ICJIA has not yet formally adopted a rubric, so framing Strict as "ICJIA's rubric" was premature. The previous messaging also unnecessarily positioned Practical as a "developer extension" with less standing than Strict. The new framing describes both profiles neutrally as two scoring methodologies that evaluate the same document using WCAG guidelines — differing only in category weights and whether PDF/UA signals are included.

- **Removed "ICJIA's rubric" and "developer extension / developer-added" language** from all user-facing copy: `apps/web/app/pages/index.vue`, `ScoreProfileBanner.vue`, `ScoreCard.vue`, `scoringProfiles.ts`, `modeDivergence.ts`, `useReportExport.ts`, `audit.config.ts`, `public/llms.txt`, `public/llms-full.txt`, `README.md`, `docs/archive/00-master-design.md`, `docs/archive/10-scoring-reconciliation.md`.
- **Profile labels** changed:
  - Strict: `Strict semantic score (ICJIA rubric)` → `Strict semantic score (WCAG + IITAA §E205.4)`
  - Practical: `Practical readiness score (developer extension)` → `Practical readiness score (WCAG + PDF/UA)`
- **Origin tags** changed (this is a machine-visible JSON-export change — downstream consumers filtering on origin need to update):
  - Strict: `icjia.iitaa.wcag21` → `wcag.iitaa.strict`
  - Practical: `developer-extension.pdfua` → `wcag.pdfua.practical`
- **Origin labels** changed:
  - Strict: `ICJIA / IITAA-aligned` → `WCAG + IITAA §E205.4`
  - Practical: `Developer extension — adds PDF/UA` → `WCAG + PDF/UA signals`
- **New explanatory section on the homepage** ("Why the two scores can differ") explicitly addresses when Practical scores higher than Strict (remediation scaffolding such as 70-point floors, PDF/UA signals that Strict doesn't count) and when Practical scores lower (solid WCAG semantics combined with missing PDF/UA markers like `MarkInfo /Marked true`, PDF/UA identifier, complete tab order — the 9.5% PDF/UA Compliance Signals category drags down Practical while Strict ignores it).
- **Color Contrast row in the ScoreProfileBanner weights table** now correctly displays `4.5%` for Practical (the config has always included it; the display row was stale at `N/A`).
- **Test assertions updated** to match the new copy across `components.test.ts`, `scoring-display.test.ts`, and `responsive.test.ts`. All 243 web tests pass.
- **Profile weights verified** to sum to 100% in both profiles (Strict: 20 + 15×3 + 10×2 + 5×3 = 100%; Practical: 17.5 + 13×3 + 9.5 + 8.5×2 + 4.5×2 + 4×2 = 100%).

### Breaking

- JSON-export consumers filtering on `profile.origin` must update from `icjia.iitaa.wcag21` → `wcag.iitaa.strict` and from `developer-extension.pdfua` → `wcag.pdfua.practical`. Stored reports generated before this release retain the old tags.

## [1.12.10] - 2026-04-19

### Changed

- **`docs/archive/00-master-design.md` updated to match v1.12.9 attribution** (doc version bumped from 1.7 → 1.8). Project Overview now states explicitly that the app computes two attributed profiles (Strict = ICJIA's rubric, Practical = developer-introduced extension) and that only Strict speaks for ICJIA. A new **Scoring Profiles & Attribution** table at the top of §5 Scoring Model pins the origin tags (`icjia.iitaa.wcag21` / `developer-extension.pdfua`), authority, weight scope, and role of each profile. Added "Attribution-first scoring" to the Core Principles list so the architectural invariant is surfaced at the top of the design doc.

## [1.12.9] - 2026-04-19

### Changed — attribution overhaul (no scoring-logic changes)

This release is entirely about **honestly attributing** the two scoring profiles. No weights, partial-credit floors, or scoring branches were altered. Stored reports continue to render identically. Internal profile keys (`strict`, `remediation`) are unchanged — only labels, disclaimers, and docs.

The correction is: **Strict is ICJIA's rubric** (anchored to WCAG 2.1 AA and Illinois IITAA §E205.4). **Practical is a developer-introduced extension** that layers PDF/UA-oriented checks on top of ICJIA's Strict rubric — it is NOT ICJIA's rubric and NOT required by Illinois accessibility law. IITAA §504.2.2 references PDF/UA only for authoring-tool export capability; §E205.4 governs final-document accessibility through WCAG 2.1.

### Added

- **Origin tags on both profiles** in `audit.config.ts` — `strict.origin = "icjia.iitaa.wcag21"` and `remediation.origin = "developer-extension.pdfua"` — carried through the JSON export so downstream consumers can filter on rubric authority.
- **Yellow `practical-disclaimer` banner** inside the Score Profile card that appears only when Practical is selected. It explicitly states Practical is a developer extension, not ICJIA's rubric, and not required by Illinois accessibility law, with references to IITAA §504.2.2 vs §E205.4.
- **Header labels in the Strict/Practical weights table** now read "Strict weight · ICJIA rubric" and "Practical weight · developer extension" so the weight columns are self-attributing.
- **Comment header** in `audit.config.ts` above `SCORING_PROFILES` spelling out the attribution and the fact that Practical's weights and partial-credit floors are judgment calls, not published standards.

### Changed

- **All public-facing Practical copy** (MODE_PROFILE_LABELS, MODE_PROFILE_DESCRIPTIONS, MODE_RECOMMENDATION_TITLES, MODE_RECOMMENDATION_SUMMARIES, STRICT_MODE_RATIONALE_TEXT, PRACTICAL_FINDINGS_NOTE_*, CATEGORY_TABLE_* in `apps/web/app/utils/scoringProfiles.ts`) rewritten to frame Strict as ICJIA's rubric and Practical as a developer extension. Practical is no longer described as a "valid accessibility lens" — it is described as a progress / vendor-reconciliation lens that adds PDF/UA signals.
- **Mode-divergence copy** in `apps/web/app/utils/modeDivergence.ts` — every "Why Practical matters" line was rewritten to (a) identify the relevant partial-credit or weight as a developer judgment call, and (b) explicitly note that the Practical score is not an Illinois accessibility-law signal. Applies to `heading_structure`, `table_markup`, `reading_order`, and `pdf_ua_compliance` card explainers.
- **Methodology summary card** under the score hero now frames Strict as ICJIA's rubric and Practical as the developer-added extension.
- **Technical Details "Scoring modes and legal interpretation" panel** and the PDF/UA Compliance Signals per-category card rewritten with the corrected attribution.
- **AI-analysis payload** (`useReportExport.ts` → `buildAiAnalysis`) now emits a parenthetical disclaimer next to the Practical readiness score line so anything pasted into ChatGPT/Claude carries the attribution correction.
- **Export profile labels and descriptions** (`useReportExport.ts` → `profileLabel`, `profileDescription`) updated to qualify each profile with its origin. Exports to Word, HTML, Markdown, and JSON now display "Strict semantic score (ICJIA rubric)" and "Practical readiness score (developer extension)".
- **README "Two scoring modes, one document" section** renamed to "Two profiles, one document — and only one of them is ICJIA's rubric" and rewritten with a prominent attribution block, a "Caveats about Practical" checklist, and explicit guidance that Strict is the score to cite in Illinois accessibility-law contexts.
- **`docs/archive/10-scoring-reconciliation.md`** rewritten with a new "Attribution" section at the top, rewritten profile descriptions, rewritten Matterhorn / PDF-UA note, a specific worked example (the ICJIA annual-report fixture), and stricter "Recommended usage" guidance (do not cite Practical for Illinois publication decisions).
- **`llms.txt` and `llms-full.txt`** updated so that LLMs consuming these files describe Strict as ICJIA's rubric and Practical as a developer extension — preventing downstream tools from citing Practical as an Illinois accessibility-law signal.

### Fixed

- **Two test assertions in `components.test.ts`** that pinned the old recommendation-title phrases ("Use Strict as the primary mode" / "not the primary legal/compliance score") updated to match the new attribution-first copy; added two new assertions that verify the `practical-disclaimer` banner renders and contains the key disavowals ("not ICJIA's rubric", "not required by Illinois accessibility law").

### What does NOT change

- No scoring weights moved.
- No partial-credit floor numbers moved.
- No scoring branch behavior changes.
- Internal profile keys (`strict`, `remediation`) unchanged.
- Stored reports render identically; no data migration required.

## [1.12.8] - 2026-04-19

### Added

- **Per-card "How each mode scores this category" box** in every Detailed Findings card on both the main page and the shared report. The box shows the Strict score and the Practical score side by side (highlighting the active mode), labels whether the category actually diverges between modes, and includes three short rationale lines: *Why the scores differ*, *Why Strict matters*, and *Why Practical matters*. Four categories branch on the scoring mode and get category-specific copy: `heading_structure` (Practical credits rich tagged body structure + bookmarks + role-mapped heading-like tags), `table_markup` (Practical credits well-formed row structure and consistent columns even without `<TH>` header cells), `reading_order` (Practical scores proxies when Strict defers to N/A), and `pdf_ua_compliance` (Practical-only category, framed against IITAA §504.2.2 vs §E205.4). All other categories show a "Same in both modes" label with a note that only the weight differs.
- **New `apps/web/app/utils/modeDivergence.ts`** containing a `DIVERGENCE_COPY` lookup, `getDivergenceCopy()` helper, and `canCategoryDiverge()` predicate so the rationale copy is a single source of truth reused by the box and by tests.
- **New `apps/web/app/components/ModeCompareBox.vue`** — the presentational component that renders the side-by-side score pills and the rationale text.
- **Three new tests** in `scoring-display.test.ts` (one markup check across both pages, two unit tests over `modeDivergence.ts`). Suite total: 243 web tests (up from 240).

## [1.12.7] - 2026-04-19

### Changed

- **Merged the Recommendation card and the Score Profile card into a single consolidated card** in `ScoreProfileBanner.vue`. Instead of two stacked panels with overlapping responsibilities, the report now has one visual card that contains the Illinois agency recommendation, the mode-aware title/summary, two clickable Strict/Practical cards (which act as the mode toggle), the mode-specific rationale block (emerald for Strict, amber for Practical with the §504.2.2 IITAA link), the alternate-profile score, and the collapsible category weights table. No loss of functionality: every previous data-testid is preserved (`mode-recommendation-card`, `mode-recommendation-current`, `mode-recommendation-title`, `mode-recommendation-summary`, `score-mode-strict`, `score-mode-remediation`, `strict-mode-rationale`, `strict-findings-note`, `alternate-score-summary`, `iitaa-pdfua-link`, `profile-weights-details`, `profile-weights-table`), so existing mode-switching and assertions continue to work. The removed pieces were purely duplicated: the separate "Score profile" header, the redundant `MODE_PROFILE_DESCRIPTIONS` paragraph (the clickable cards already carry equivalent copy), and the secondary pill-button toggle group (the cards themselves are now the toggle).

## [1.12.6] - 2026-04-19

### Added

- **Profile badge on every Detailed Findings card** (main page and shared report). Each card header now shows a `Strict` or `Practical` pill driven by `MODE_BUTTON_LABELS[selectedScoreMode]` — emerald tint in Strict, amber tint in Practical — so readers can see at a glance which scoring lens produced the per-category score shown on that card.
- **Dedicated `PDF/UA signals` pill on the `pdf_ua_compliance` card in Practical mode**. The extra pill appears only when `cat.id === 'pdf_ua_compliance'` and Practical is selected, using a slightly stronger amber tint to distinguish PDF/UA-oriented signals from the other scored categories.
- **Two new tests in `scoring-display.test.ts`** verifying the badge markup and conditional rendering in both `pages/index.vue` and `pages/report/[id].vue`. Suite total: 240 web tests (up from 238).

### Notes

- In Strict mode the `pdf_ua_compliance` card falls into N/A (its score is `null` by design); the PDF/UA pill is therefore intentionally not shown in Strict mode. The Practical card surfaces the full scored findings and the new pill.

## [1.12.5] - 2026-04-19

### Changed

- **Strict and Practical description cards in the Score Profile banner are now clickable** — they act as the primary mode selector in addition to the toggle buttons below. Inactive cards show a hover background and pointer cursor; the active card is tinted (emerald for Strict, amber for Practical) with an `Active` pill inside the heading. Cards are real `<button>` elements with `aria-pressed`, focus-visible rings, and native keyboard support (Enter/Space).

## [1.12.4] - 2026-04-19

### Added

- **PDF/UA Compliance Signals card now renders correctly in Practical mode** — `ScoreProfileResult` now carries a full per-profile `categories: CategoryResult[]` array (not just scores), and `categoriesForScoringMode` prefers the mode-specific array when it's supplied. The `pdf_ua_compliance` card now shows real Practical findings (tagged PDF detected, MarkInfo state, PDF/UA identifier, tab order, list/table legality) when Practical is selected, and the Strict-mode guidance text when Strict is selected.
- **Eleven-row weights comparison table in the Technical Details expandable**, showing Strict vs Practical weights side-by-side for every category, including the Practical-only PDF/UA Compliance Signals row (9.5%) and the reserved Color Contrast row.
- **Dedicated PDF/UA Compliance Signals per-category card in Technical Details** documenting what it measures, the scoring formula (+tags, +MarkInfo, +PDF/UA id, +tab order, +list legality, +table legality), and why it is Practical-only with IITAA §504.2.2 / §E205.4 context.
- **Collapsible `View category weights for both modes` table inside the Score Profile banner** so the full Strict/Practical weight breakdown is reachable from the hero without scrolling to Technical Details.
- **Extensive README "Two scoring modes, one document" section** that explains why two modes is a good thing rather than an annoyance — five concrete reasons, plus a rewritten Categories & Weights table with both modes side-by-side.
- **llms.txt and llms-full.txt updated** to surface both profiles, the new PDF/UA Compliance Signals category, and the full Strict/Practical weight split so LLMs and automated tools can cite either score correctly.
- New scoring-profile test covering the full per-profile `categories` override path (total suite: 474 tests, up from 473).

### Changed

- **Methodology summary card** under the score hero now states explicitly that Strict weighs nine core categories and Practical adds a dedicated PDF/UA Compliance Signals category (eleven scored categories total in Practical).
- **Technical Details "How Scores Are Calculated"** now reads "up to eleven" categories instead of "nine" and leads with the Strict vs Practical weights table before the per-category scoring logic cards.
- **Split `appendSupplementaryFindings` and `generateSummary` out of `scorer.ts`** into dedicated modules under `apps/api/src/services/scoring/`. `scorer.ts` is now ~390 lines shorter without changing any observable behavior.

### Fixed

- Stale "nine categories" wording in the public methodology summary and in llms.txt / llms-full.txt.

## [1.12.3] - 2026-04-19

### Added

- **Dual scoring profiles in the UI and exports** — reports now surface both a **Strict semantic score** and a **Practical readiness score**. Category tables follow the selected profile where alternate category scores are available, and exports/AI analysis include the practical-readiness label when present.
- **Prominent legal recommendation card** — the ScoreCard hero now shows a front-and-center Illinois agency guidance card explaining that **Strict** is the better primary mode for publication and ADA/WCAG/ITTAA-oriented legal accessibility review, while **Practical** is a secondary progress view.
- **Expanded methodology/legal guidance** — the Technical Details section now explains why accessibility is not always a simple binary, what each mode means, and how weight renormalization helps scoring without replacing strict semantic findings.
- **Scoring-profile utilities and tests** — added shared profile-selection helpers and dedicated tests covering category-profile switching, UI copy, and export output.
- **Dedicated Practical `pdf_ua_compliance` category** — the broader remediation-oriented profile now scores PDF/UA-oriented signals such as tagging/`StructTreeRoot`, `MarkInfo`, tab order, PDF/UA metadata, and list/table legality checks.

### Changed

- **Renamed the softer profile in user-facing copy** from "Remediation" / "Remediation-oriented" to **"Practical" / "Practical readiness"** to avoid implying that a file is already fully remediated.
- **Strict is now explicitly framed as the primary legal/compliance signal** throughout the app, shared report, and exports because it prioritizes programmatically determinable headings, table semantics, and logical structure.
- **Recommendation copy is mode-aware** — when Practical is selected, the UI now explains that the score may be higher because it rewards usable improvements even while semantic accessibility gaps remain.
- **PDF/UA guidance now cites IITAA 2.1 more precisely** — the docs and UI now explain that Illinois expressly references PDF/UA in IITAA 2.1 `504.2.2 PDF Export` for authoring-tool export capability, while `E205.4` frames non-web document accessibility through WCAG 2.1.
- **Matterhorn terminology is now explained more plainly** — README guidance now clarifies that Matterhorn is a technical PDF/UA testing protocol/checklist used by some tools, not a separate legal standard.
- **Strict vs Practical responsibilities are now more explicit** — Strict does not use PDF/UA conformance signals as the primary document-level publication/compliance score driver, while Practical does include them, to avoid overstating noncompliance or skewing remediation priorities by treating a helpful technical standard as though it were the governing rule for every final PDF.
- **Same-document lens guidance is now explicit** — the UI and docs now clarify that Strict and Practical are two valid accessibility lenses applied to the same document, not different document states; Strict is the semantics-first/publication lens, while Practical is the remediation/progress lens.
- **Extracted the Score-Profile recommendation banner into a dedicated component** (`apps/web/app/components/ScoreProfileBanner.vue`) so `ScoreCard.vue` is ~180 lines shorter and purely owns grade/verdict/summary presentation.
- **Consolidated duplicated Strict/Practical copy into shared constants** in `apps/web/app/utils/scoringProfiles.ts` (`MODE_RECOMMENDATION_TITLES`, `MODE_RECOMMENDATION_SUMMARIES`, `STRICT_MODE_RATIONALE_TEXT`, `PRACTICAL_FINDINGS_NOTE_*`, `CATEGORY_TABLE_*`). The category-table subtitle in `index.vue` now reads from the same constants instead of inlining near-duplicate paragraphs.
- **Centralized the IITAA link and mode-label lookups** (`IITAA_PDFUA_URL`, `MODE_BUTTON_LABELS`, `MODE_PROFILE_LABELS`, `MODE_PROFILE_DESCRIPTIONS`) so button labels, profile descriptions, and external links cannot drift across components.

### Fixed

- **API TypeScript build in `qpdfService`** — added a null-safety guard before recording language-span tags so `pnpm --filter api build` no longer fails when `mapToStandardTag(...)` returns `null`.
- **Duplicate `## [1.12.2]` CHANGELOG heading** — the 2026-04-19 release block is now correctly labelled `1.12.3`. Root, web, and API `package.json` versions are bumped in sync and tagged `v1.12.3`.

### Removed

- **Binary accessibility verdict banner** — removed the "This file is accessible" / "This file is not accessible" banner because the absolute phrasing overstated certainty in cases where practical improvement and stricter semantic accessibility diverge.

## [1.12.2] - 2026-04-17

### Changed

- **AI analysis prompt now instructs the LLM to verify the PDF is attached** — the prompt references the filename directly and tells the assistant to ask the user to upload the PDF if it wasn't attached to the conversation. Makes remediation guidance much more accurate by prompting the model to inspect the actual tag tree, reading order, alt text, and form fields rather than reasoning only from the audit summary.

## [1.12.1] - 2026-04-17

### Changed

- **AI analysis panel only renders when remediation is needed** — the "For Use with AI Assistants" card is hidden entirely on clean reports (no Critical or Moderate severity categories). Passing documents now go straight from Export & Share to the "Analyze More Files" button without AI copy clutter.
- **AI analysis output lists only failing items** — `buildAiAnalysis` no longer emits the "What's working" or "Not applicable" sections. When called on a clean document the function short-circuits to a compact "No remediation is needed" message. This keeps LLM context focused on what actually needs fixing.
- **Preview textarea is always visible and full-width** — removed the `<details>` collapsible wrapper and the narrow flex column that was clipping lines. The textarea now spans the full card width, uses `resize-y` so users can drag to expand, wraps long lines (no horizontal scrollbar), and is labeled "AI Analysis Preview".
- **Copy button moved beneath the preview** and centered; full-width on mobile.
- **Removed the "if I can only fix three things" remediation question** — the AI analysis now asks the LLM to help fix every failing category, not to triage.

## [1.12.0] - 2026-04-17

### Added

- **Prominent accessibility verdict banner** — ScoreCard now displays a large green "This file is accessible" or red "This file is not accessible" banner above the grade circle, with thumbs-up/thumbs-down icons, WCAG-AA-compliant contrast (`#15803d` / `#b91c1c` on white), and `role="status"` + `aria-live="polite"` for assistive technology. Grades A and B are considered accessible; C/D/F are not.
- **Verdict explanation sentence** — a new sentence under the grade label quantifies the remaining Critical and Moderate issues (e.g. "Resolving 2 critical issues and 1 moderate issue in the detailed findings below will move this document toward WCAG 2.1 AA and ADA Title II compliance"), with four wording variants covering accessible-with/without-remaining-issues and failing-with/without-counts.
- **AI-ready analysis panel** (`apps/web/app/pages/index.vue`) — new card after Export & Share with a "Copy Analysis for AI" button and a collapsible preview textarea. Clipboard payload includes verdict, grade, executive summary, passing categories, failing categories with findings and WCAG 2.1 references, N/A categories, and five remediation questions for an LLM to answer. Designed for pasting into ChatGPT, Claude, or any LLM to get plain-language explanations and step-by-step remediation guidance.
- **`buildAiAnalysis(result)` exported helper** (`apps/web/app/composables/useReportExport.ts`) — pure function that produces the AI-ready Markdown. Composable also exposes `copyAiAnalysis`, `aiCopied`, and `buildAiAnalysisText` for UI wiring.
- **Test coverage** — 15 new tests (5 verdict-explanation cases in `scoring-display.test.ts`, 10 cases in the new `ai-analysis.test.ts`). Suite is now 222 tests, all passing.

### Changed

- `ScoreCard.vue` `result` prop accepts an optional `categories` array; the verdict explanation is only rendered when categories are provided.
- `vitest.config.ts` registers `~` and `@` aliases so tests can import from `~/utils/*` the same way runtime code does.

## [1.11.0] - 2026-04-13

### Added

- **WCAG 2.1 References card in every scored category** — each basic/advanced card on the audit results page and shared report page now includes a dedicated "WCAG 2.1 References" sub-card listing the exact success criteria the score is tied to (id, name, and Level A/AA badge), with each row linking to the official W3C Understanding document. Makes the rubric externally anchored and auditable so reviewers can verify the grade against the source standard.
- **Shared WCAG utility** (`apps/web/app/utils/wcag.ts`) — single source of truth mapping each scoring category to structured `WcagCriterion` objects (`id`, `name`, `level`, W3C Understanding URL). Replaces the previous duplicate map that lived only inside the export composable.
- **JSON export enrichment** — exported reports now include `wcag.successCriteriaDetailed` (structured objects with URLs) alongside the existing `successCriteria` string array. Additive change; no breaking change to existing consumers.

### Changed

- `useReportExport.ts` now imports the WCAG map from the shared util instead of defining its own copy, keeping web UI citations and exported reports in lockstep.

## [1.10.1] - 2026-04-12

### Added

- **Responsive layout test suite** (`responsive.test.ts`) — 48 tests covering mobile navigation, responsive padding, ScoreCard/CategoryRow responsive classes, table overflow handling, CSS transitions, and scoring modal breakpoints

### Fixed

- Updated ScoreCard selectors in `scoring-display.test.ts` to match new responsive class names (`text-5xl`/`w-28` instead of `text-7xl`/`w-40`)

## [1.10.0] - 2026-04-12

### Added

- **Fully responsive layout** — mobile-first redesign across all pages and components
  - Hamburger menu with animated slide-down navigation drawer on screens below `md` breakpoint
  - CategoryRow stacks label and score bar vertically on mobile for readability
  - Grade circles scale down on small screens (`w-28`/`w-24` mobile, `w-40`/`w-32` desktop)
  - All data tables (`Category Scores`, `My History`, `Admin Logs`, `Scoring Rubric`, `QPDF`, `PDF.js`) scroll horizontally on narrow viewports with `min-width` constraints
  - Metadata rows stack vertically on mobile (`flex-col sm:flex-row`)
  - Grade scale grid adapts from 3 columns on mobile to 5 on desktop
  - Responsive padding throughout: `px-3 sm:px-6`, `p-3 sm:p-5`, `py-4 sm:py-8`
  - Heading sizes adapt: `text-xl sm:text-2xl`, `text-base sm:text-lg`
  - Info card text scales: `text-2xl sm:text-3xl`

## [1.9.1] - 2026-04-11

### Changed

- **Increased font sizes globally** — overrode Tailwind's default text size scale via `@theme` in `main.css` for improved readability across the entire UI (xs: 12→17px, sm: 14→19px, base: 16→21px, lg: 18→23px)
- Technical Details section uses `text-sm` container for balanced density in long-form content

## [1.9.0] - 2026-03-22

### Added

- **Publication batch audit CLI** (`pnpm a11y-audit`) — new `publist` subcommand that fetches all ICJIA publications via GraphQL, audits every PDF, and generates reports with grades, category scores, and remediation guidance
  - **SQLite cache** — results cached in `~/.a11y-audit/cache.db` so re-runs only audit new publications; `--force` and `--clear` flags for full re-scans
  - **CSV report** — grade distribution summary, temporal comparison (recent vs. legacy), per-file scores across all 10 categories
  - **HTML report** — interactive standalone page with:
    - Grade distribution bar chart and stacked visualization
    - Assessment summary with remediation recommendations
    - Sortable columns (instant client-side sort on all columns including grade, score, date, and category scores)
    - Pagination (150 rows per page) for fast rendering of 1,000+ publications
    - Expandable detail rows with per-category grade/score/severity cards, publication summary, tags, type, and critical findings
    - Horizontally scrollable title and critical issues columns
    - Embedded CSV download button (no server round-trip)
  - **Concurrent analysis** — configurable concurrency (1–10, default 3) with progress bar
  - **Publication metadata** — fetches summary, tags, and publication type from ICJIA API; backfills existing cached rows automatically
- **Manager report route** (`/publist`) — HTML report auto-deployed to `apps/web/public/publist.html` on each audit run, served via Nitro server route at `/publist` (no `.html` needed)
  - Blocked from search engines via `robots.txt` and `X-Robots-Tag: noindex, nofollow` header
  - Returns 404 with guidance if report hasn't been generated yet
- **Modular CLI architecture** — refactored CLI from 280-line monolith to subcommand router with extracted modules:
  - `commands/audit.ts` — original single-file audit
  - `commands/publist.ts` — batch publication audit orchestrator
  - `lib/graphql.ts` — GraphQL publication fetcher with pagination
  - `lib/cache.ts` — SQLite cache layer with migration support
  - `lib/csv.ts` — CSV generator with grade distribution and temporal comparison
  - `lib/html.ts` — client-side rendered HTML report generator
  - `lib/progress.ts` — terminal progress bar
  - `lib/colors.ts` — shared ANSI color utilities

### Changed

- CLI entry point (`src/index.ts`) reduced to 19-line subcommand router
- `better-sqlite3` added as CLI dependency; externalized in tsup build config

## [1.8.0] - 2026-03-12

### Added

- **Font embedding scoring** — non-embedded fonts now cap Text Extractability at 85 (Minor severity, never Pass), with per-font listing and Acrobat fix guidance
- **Multiple H1 detection** — documents with more than one H1 heading score 75 (Minor) for Heading Structure; combined with hierarchy gaps, score drops to 55
- **Acrobat remediation panel** — Adobe Acrobat fix instructions are now rendered in a distinct amber-bordered panel with numbered steps, separated from findings
- **Inline guidance styling** — "How to fix:", "Fix:", and "Tip:" lines now render with amber left border and background tint for visual distinction

### Changed

- Font embedding moved from informational supplementary finding to scored component of Text Extractability
- Acrobat remediation guide now always visible in Basic view (no Advanced toggle needed)

## [1.7.1] - 2026-03-12

### Added

- **Adobe Acrobat remediation guide** — every category that scores below "Pass" now includes a `--- Adobe Acrobat: How to Fix ---` section with:
  - The exact Acrobat Full Check rule name to look for (e.g., "Document → Tagged PDF", "Alternate Text → Figures alternate text")
  - Step-by-step menu paths (e.g., "File → Properties → Description tab → Title field")
  - Specific fix instructions for each issue type
  - Guidance is shown in Advanced view only (no score impact)

### Changed

- List structure analysis moved from Table Markup to Reading Order category — lists no longer appear orphaned under N/A when a document has no tables

## [1.7.0] - 2026-03-12

### Added

- **PDF/UA identifier detection** — checks XMP metadata for `pdfuaid:part` to report whether a document claims PDF/UA (ISO 14289) conformance (informational, no score impact)
- **Artifact tagging analysis** — counts `/Artifact` structure elements to verify decorative content (headers, footers, watermarks) is properly distinguished from real content (informational, no score impact)
- **ActualText & expansion text detection** — reports `/ActualText` (glyph/ligature overrides) and `/E` (abbreviation expansion) attributes that help screen readers pronounce content correctly (informational, no score impact)
- **QPDF binary string decoder** for `b:` prefixed hex strings — attempts UTF-16BE and UTF-8 decoding
- New QpdfResult fields: `hasPdfUaIdentifier`, `pdfUaPart`, `artifactCount`, `actualTextCount`, `expansionTextCount`
- 16 new tests (379 total): PDF/UA detection, artifact counting, ActualText/expansion text, scorer supplementary findings

### Changed

- Technical details section updated with 3 new QPDF extraction rows and 3 new supplementary analysis entries

## [1.6.0] - 2026-03-12

### Added

- **Per-card Basic/Advanced toggle** — each category card has its own sliding switch to show or hide detailed findings (per-table breakdowns, per-font listings, heading trees, link inventories, form field names)
- **Alt text quality heuristic** — non-scoring warning flags alt text that appears to be hex-encoded, machine-generated, a filename, or a generic placeholder (e.g., "image", "photo")
- **QPDF binary string decoding** — `b:` prefixed hex strings from QPDF are now decoded as UTF-16BE or UTF-8, producing human-readable alt text instead of raw hex
- **Detailed per-item findings** — scorer now produces per-table structure breakdowns, per-image alt text listings, per-link URL mappings, per-font embedding status, per-form-field label inventory, and compact heading hierarchy trees
- **Guidance line rendering** — "How to fix:", "Tip:", and "Fix:" lines no longer display failure icons; they render with a subtle `›` marker instead

### Changed

- Basic/Advanced toggle styling: Basic state uses emerald/green pill, Advanced uses blue pill — both visually distinct
- Supplementary findings (role mapping, tab order, language spans, font analysis) are now classified as "advanced" and hidden by default in Basic view
- Technical details section updated with alt text quality check documentation
- All `  `-prefixed detail lines in scorer output are consistently classified as advanced findings

## [1.5.0] - 2026-03-11

### Added

- **Comprehensive supplementary analysis** — 10 new detection checks appended as informational findings to existing scoring categories:
  - **List markup analysis** — detects `/L`, `/LI`, `/Lbl`, `/LBody` tags; reports well-formed vs malformed lists and nesting depth
  - **Marked content & artifact detection** — checks `/MarkInfo` dictionary for proper content/artifact distinction
  - **Font embedding analysis** — identifies embedded vs non-embedded fonts from `/FontDescriptor` objects
  - **Paragraph structure** — counts `/P` tags to assess body text tagging
  - **Role mapping** — detects `/RoleMap` on StructTreeRoot for custom-to-standard tag mappings
  - **Tab order** — checks `/Tabs /S` on page objects for keyboard navigation
  - **Natural language spans** — identifies structure elements with explicit `/Lang` attributes for multilingual content
  - **Empty page detection** — flags pages with < 10 characters of text content
- `ListAnalysis` interface with 5 fields for list structure data
- New QpdfResult fields: `lists`, `paragraphCount`, `hasMarkInfo`, `isMarkedContent`, `hasRoleMap`, `roleMapEntries`, `tabOrderPages`, `totalPageCount`, `langSpans`, `fonts`
- New PdfjsResult field: `emptyPages`
- 23 new tests (363 total): list detection, MarkInfo, RoleMap, tab order, font embedding, paragraph/language spans, and scorer supplementary findings

### Changed

- Supplementary findings appear as grouped sections (e.g., "--- Font Analysis ---") within existing scored categories, preserving scoring stability
- All new checks are **informational only** — no scoring weight changes, ensuring existing document grades remain consistent

## [1.4.0] - 2026-03-11

### Added

- **Enhanced table accessibility analysis** — six sub-checks replace the old binary header detection:
  - Header cells (TH tags) — 30 points
  - Scope attributes (/Column or /Row) — 20 points
  - Row structure (TR tags, handles THead/TBody/TFoot) — 15 points
  - Nested table detection — 10 points
  - Caption elements — 10 points
  - Column consistency across rows — 10 points
  - Header-data association bonus (/Headers attribute) — 5 points
- `TableAnalysis` interface with 12 fields for detailed table structure data
- 13 new QPDF parser tests and 7 new scorer tests (340 total)
- Changelog link and dynamic version display in footer
- `CHANGELOG.md` with historical entries for v1.0.0–v1.3.0

### Changed

- Table markup scoring now uses multi-factor weighted scoring instead of binary pass/fail
- Each table sub-check produces actionable findings with Adobe Acrobat fix instructions
- Technical details section updated with full table scoring methodology

## [1.3.0] - 2026-03-11

### Added

- **Batch PDF upload** — drop or select up to 5 PDFs at once with a staged file list and validation before analysis begins
- **Tab-based results** — grid layout shows all file tabs; click any tab to view its full report, export, or share
- **Cancel support** — AbortController-based cancel button stops remaining uploads mid-batch
- **Batch progress view** — per-file status (queued, processing, done, error, cancelled) with grade badges as they complete
- **Completion banner** — dismissible green notification when all files finish processing
- **Accessible tooltips** — custom WCAG 2.1 tooltip component (`AppTooltip.vue`) shows full filenames on hover/focus
- **Server semaphore timeout** — 60-second timeout prevents queue starvation under batch load (returns 503)
- **`BATCH.MAX_FILES`** constant in `audit.config.ts` (default 5)

### Fixed

- pdfjs document resource leak on error paths (try/finally destroy)
- File objects now nulled after upload to free browser memory
- Tab bar no longer disappears when clicking error/cancelled tabs

### Changed

- Rate limit increased from 30 to 35 analyses/hour to accommodate batch sessions with retries

## [1.2.0] - 2026-03-10

### Added

- **Document metadata section** in reports (creator, producer, dates, version, encryption status)
- **pdfjs image detection fallback** for untagged PDFs using operator list analysis
- **Expandable technical details** section explaining how the tool analyzes PDFs (QPDF + PDF.js methodology)
- **Idle-state hint** — "Analyze" nav link pulses when user is on the landing page
- Show all findings without truncation in detailed report

### Fixed

- TS2551: cast OPS to Record for pdfjs-dist type compatibility

## [1.1.0] - 2026-03-09

### Added

- **Light/dark mode toggle** with CSS variable theming and configurable default
- **a11y-audit CLI tool** for command-line PDF accessibility analysis
- **WCAG 2.1 AA compliance** — contrast fixes, accessibility tests, caveat text
- **Configurable branding** with rebrand script (`pnpm rebrand`)
- JSON download and CTA buttons on shared report page
- MIT license
- Clipboard fallback for older browsers
- `rebuild.sh` deployment script
- `datePublished`/`dateModified` in JSON-LD and OG meta tags
- Methodology card with severity highlights

### Fixed

- Scoring modal heading order a11y violation
- Robots warning for shared report pages
- Meta description length for SEO compliance
- Nitro esbuild target set to es2022 for BigInt support
- Deduplicated SEO config (removed @nuxtjs/seo, use Nuxt built-in head)

## [1.0.0] - 2026-03-07

### Added

- **Core PDF accessibility grader** — 9 categories scored against WCAG 2.1 and ADA Title II
- **Dual analysis engine** — QPDF (structure) + PDF.js (content) run in parallel
- **Report exports** — Word (.docx), HTML, Markdown, JSON
- **Shareable reports** — server-stored with 30-day expiry, public viewing without auth
- **OTP authentication** — passwordless email login via Mailgun
- **Rate limiting** — per-endpoint with IP and email keying
- **208 tests** across API and frontend
- OG image, meta tags, and structured data (JSON-LD)
- Environment-specific configuration with `.env` examples
- Deployment documentation for DigitalOcean/Forge/PM2/nginx

[1.8.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.7.1...v1.8.0
[1.7.1]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ICJIA/file-accessibility-audit/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ICJIA/file-accessibility-audit/releases/tag/v1.0.0
