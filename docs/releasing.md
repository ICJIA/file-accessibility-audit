# Releasing

A release is a version number written in ten places, three hand-written
records, and a tag. `pnpm release` does the mechanical part and marks what a
person still has to write.

It **never pushes**, and it does not deploy. Pushing to `main` does not deploy
either: the server is updated by hand (`docs/deploys.md`).

## The short version

```bash
# 1. See what would change. Writes nothing.
pnpm release patch --title "Deploys roll back by themselves" --dry-run

# 2. Prepare the files (clean working tree required).
pnpm release patch \
  --title "Deploys roll back by themselves" \
  --summary "A deploy that fails its health check now puts the previous version back." \
  --security-note "No new attack surface: deploy tooling only; no route, input, storage or scoring changed." \
  --scope "the deploy script" \
  --counts

# 3. Fill in every TODO(release) the script lists, then:
pnpm lint && pnpm format:check && pnpm typecheck && pnpm build
pnpm release --verify

# 4. Commit, tag and push with the commands the script printed.
```

## What it writes

| File | Change |
| --- | --- |
| `package.json`, `apps/web`, `apps/api`, `apps/cli`, `packages/shared`, `packages/analyzer` | `version` |
| `README.md` | version badge; a new entry at the top of § Security → Review history; with `--counts`, the tests badge and the first line of § Tests |
| `CHANGELOG.md` | a new `## [x.y.z] - date` section above the newest one |
| `apps/web/app/data/securityAudits.ts` | a new object at the top of `SECURITY_AUDIT_ENTRIES` |
| `scripts/brief-stats.json` | with `--counts`: `tests` from the run, `traps` from the two trap manifests |
| `docs/brief/*`, `apps/web/app/data/trustBody.ts`, `apps/web/public/sitemap.xml` | with `--counts`: rewritten by `pnpm build-brief` |

All changes are worked out in memory first. If any file is missing the place
the script expects to write to, it stops and nothing is written.

## Arguments

| Argument | Meaning |
| --- | --- |
| `patch` \| `minor` \| `major` \| `x.y.z` | The new version. An explicit version must be newer than the current one. |
| `--title "…"` | Required. Short name of the release; used in all three records, the commit subject and the tag message. |
| `--summary "…"` | What changed, for the CHANGELOG. |
| `--security-note "…"` | What the security review of this release found. Goes in the README entry and, unless a plain-language version is given, in the public security log. |
| `--scope "…"` | What the review looked at, in a few plain words. |
| `--notes-file f.json` | The same as JSON: `title`, `summary`, `securityNote`, `securityNotePlain`, `scope`, `section` (`Added`, `Changed`, `Fixed`, `Security`, `Removed`). Flags given as well win. |
| `--counts` | Run the whole test suite (`scripts/test.ts`), write the real counts, then run `pnpm build-brief`. Stops if a test fails or the summary cannot be read. |
| `--dry-run` | Print a unified diff of every change. Writes nothing; does not run the suite or `build-brief`. Works on a dirty tree. |
| `--allow-dirty` | Run although the tree has other changes. They are left alone and not committed. |
| `--commit` | Commit the release files as `release: vX.Y.Z — <title>`. **Refused while any `TODO(release)` remains.** |
| `--tag` | With `--commit`: also create the annotated tag `vX.Y.Z`. |
| `--verify` | Change nothing. Check that all ten version records agree and no `TODO(release)` is left. |

## Placeholders

Where the script cannot know what to say, it writes `TODO(release): …` and
lists every one when it finishes. Typical ones:

- the CHANGELOG summary, if `--summary` was not given;
- the test counts, if `--counts` was not given;
- the README entry's scope tag and finding, if not given;
- **always**: "confirm lint, format, typecheck and build are green, then say so
  here". The script does not run those four, so it does not claim them.

`--commit` fails loudly, before writing anything, if a placeholder would be
committed. `pnpm release --verify` checks the same thing after hand edits.

## The dependency scan

Every run executes `pnpm audit --prod` and writes **that run's result** into
both security entries. The project rule is that a security record never states
a scan result that was not produced for this release.

- Clean: "no known advisories in production dependencies."
- Findings: the counts by severity, plus a `TODO(release)` asking what each
  advisory is and what was done about it.
- Could not run (offline, registry error): a `TODO(release)` in place of a
  result. It is never written as "unchanged".

## Steps the script does not do

- **Prose.** Rewrite the scaffolded entries so they say what a reader needs.
  The public security log (`securityAudits.ts`) is plain language for auditors:
  only inline formatting (`<strong>`, `<em>`, `<code>`, `<br>`, `<a>`), no
  backticks, no `${`. The script turns backticked words into `<code>` for you.
- **Formatting.** Run `pnpm format:check`; the security-log entry is written in
  the project's layout, but a long hand edit may need `pnpm format`.
- **`pnpm build-brief`**, when `--counts` was not used — run it after the counts
  are in `brief-stats.json`, before the commit.
- **Trap descriptions.** New trap files mean updating the trap numbers and
  describing the new traps on the trust page template and in the README.
- **The announcement banner** in `audit.config.ts`, if visitors should hear
  about this release.
- **Republishing the trust brief** from `docs/brief/checker-brief.html`.
- **Pushing, deploying, and `pnpm prod-sentinels` after the deploy.**

## What stops a half-made release

- `apps/api/src/__tests__/versionSync.test.ts` fails unless the six
  `package.json` versions, the README badge, the newest CHANGELOG heading, the
  newest README § Security entry and the newest security-log entry all name
  the same version.
- `apps/web/app/__tests__/securityAudits.test.ts` fails unless the shipping
  version has a security-log entry and a README entry.
- `apps/api/src/__tests__/releaseScript.test.ts` tests each step of the script
  against fixture copies of the three records.

## By hand, if the script cannot be used

1. `CHANGELOG.md`: new section under a new version heading.
2. The six `package.json` versions and the README badge.
3. `README.md` § Security: a new review-history entry.
4. `apps/web/app/data/securityAudits.ts`: prepend an entry.
5. `scripts/brief-stats.json` counts, then `pnpm build-brief`.
6. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test`.
7. Commit `release: vX.Y.Z — <title>`; `git tag -a vX.Y.Z -m "vX.Y.Z — <title>"`.
