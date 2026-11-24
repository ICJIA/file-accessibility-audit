# Contributing

This is the source of the document accessibility checker at
<https://audit.icjia.app>. It is free and open source, with one maintainer.
Issues and pull requests are welcome.

Before changing code, read [`AGENTS.md`](AGENTS.md). It is short, and it lists
the conventions that have each been learned the hard way.

## Set up

You need Node.js 22 or newer, pnpm 10, and qpdf 10 or newer. Java 17 and
veraPDF are optional: they are needed only for the PDF remediation feature and
the PDF/UA machine checks.

```bash
pnpm install
cp apps/api/.env.example.local apps/api/.env
cp apps/web/.env.example.local apps/web/.env
./start-dev-server.sh
```

Always start the app with `./start-dev-server.sh`, not `pnpm dev`. The web app
is at <http://localhost:5102> and the API at <http://localhost:5103>. There are
no accounts and nothing to sign in to.

## Before you push

Run all of these. CI runs the same ones.

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build          # run it directly — do not pipe its output
pnpm test           # API, web and CLI suites, with one summary
```

If you changed how a document is judged — anything in `packages/analyzer` or
the scoring — also run the accuracy gates:

```bash
pnpm synthetic-controls           # PDF trap battery
pnpm synthetic-office-controls    # Word, PowerPoint and Excel trap battery
pnpm score-ledger                 # no score moves without being re-blessed
pnpm legal-basis                  # every point lost names the criterion it broke
pnpm best-practice-basis          # nothing required is filed as optional
pnpm resave-invariance            # byte layout never changes a grade
pnpm encoding-invariance          # same meaning, every legal PDF encoding
pnpm office-encoding-invariance   # the same for Office formats
```

If you changed a page, also run the browser check against a build:

```bash
pnpm build && pnpm e2e            # uploads a file in headless Chromium, runs axe on every page
```

A change that makes the checker catch more will usually make some real
documents fail that passed before. Look at each newly failing document before
accepting the new scores.

## How changes are judged

- **The grade measures WCAG 2.1 A and AA only.** PDF/UA results and best
  practices are reported beside the grade and never move it.
- **A test comes with the change.** For a fix, the test should fail on the old
  code.
- **Tunables live in `audit.config.ts`.** Each one is marked SAFE TO CHANGE or
  DO NOT CHANGE, with the reason.
- **Database changes are numbered migrations** in
  `apps/api/src/db/migrations.ts`.
- **No new dependency without a reason** stated in the pull request.

## Writing for readers

The people who read this tool's reports are content managers and auditors, not
developers. The same rules apply to the interface, the reports, the
documentation and commit messages:

- Use plain language. Say what happened and what to do next.
- Describe a level as "high" or "low". Do not describe it in terms of
  strength.
- Do not state or imply anyone's gender, and do not identify a person — not a
  reporter, not a reviewer, not the author of a document.
- Records are metadata about an audit. Never write that the service stores "no
  personal data": a file name can itself name a person.
- When you name a WCAG success criterion, link to it.
- A security finding is always written together with its fix.

## Commits and pull requests

- Describe the change and why. No AI co-author or attribution lines.
- One topic per pull request.
- Do not bump the version. Releases are cut by the maintainer with
  `pnpm release` — see [`docs/releasing.md`](docs/releasing.md).
- Merging to `main` does not deploy. Deploys are made by hand —
  [`docs/deploys.md`](docs/deploys.md).

## Reporting problems

- **A wrong verdict** (the checker failed something that is fine, or passed
  something that is not): open an issue, with the document if it can be
  shared. These are treated as bugs in the checker.
- **A security problem:** report it privately. See [`SECURITY.md`](SECURITY.md).

## Where things are

- [`AGENTS.md`](AGENTS.md) — conventions, repository map, API surface
- [`docs/releasing.md`](docs/releasing.md) — cutting a release
- [`docs/deploys.md`](docs/deploys.md) — deploying and rolling back
- [`docs/runbook.md`](docs/runbook.md) — the server, and what to check when
  something breaks
- [`docs/database-backups.md`](docs/database-backups.md) — backups and restore
- [`CHANGELOG.md`](CHANGELOG.md) — what changed in each release
