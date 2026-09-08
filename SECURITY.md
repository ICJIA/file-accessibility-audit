# Security policy

This repository is the source of the document accessibility checker at
https://audit.icjia.app, run by the Illinois Criminal Justice Information
Authority (ICJIA). The tool is free and open source, has no accounts, and
stores nothing about who uses it. Reports about the running site and about
the code are both welcome.

## Reporting a vulnerability

Please report privately, not in a public issue or pull request:

- **GitHub private vulnerability reporting:**
  https://github.com/ICJIA/file-accessibility-audit/security/advisories/new
  — this opens a private advisory that only the maintainers can see, and it
  works without any personal mailbox on either side.

Include what you found, how to reproduce it, and what it would let an
attacker do. A proof-of-concept file is helpful; a working exploit against
the live site is not needed.

Please do not:

- run denial-of-service, load, or volumetric tests against audit.icjia.app —
  the rate limits are documented in the README, and reaching them is not a
  finding;
- upload documents that belong to other people;
- read, change, or delete data that is not yours. There are no accounts;
  a shared report is reachable only by its link, and that link is the only
  thing that protects it, so treat any way of guessing or enumerating links
  as in scope and everything you find behind one as out of scope.

## What to expect

This is a one-maintainer project inside a state agency. Reports are read as
they arrive. Expect an acknowledgement within a few working days and a fix,
or a reasoned response, on a timeline that matches the severity. Confirmed
fixes ship as a numbered release and are described in two public places: the
Security section of the README and the site's security log at
https://audit.icjia.app/data-retention#security-audits. Reporters are not
named there.

## Supported versions

Only the current release on `main` is supported; it is what runs at
audit.icjia.app (the version is shown in the site footer and at
https://audit.icjia.app/api/status). Older tags receive no fixes.

## Scope notes

- Uploaded files are analyzed and then deleted. What the activity log keeps
  about each audit, and for how long, is listed at
  https://audit.icjia.app/data-retention.
- A wrong accessibility verdict (a false failure or a false pass) is a bug,
  not a vulnerability. Please open an ordinary issue for those; the README
  explains how the checker is tested and how to reproduce a verdict locally.
- Automated dependency alerts, CodeQL scanning, and secret scanning are
  enabled on this repository, and `pnpm audit --prod` is part of every
  security review.
- The machine-readable version of this policy is served at
  https://audit.icjia.app/.well-known/security.txt (RFC 9116).
