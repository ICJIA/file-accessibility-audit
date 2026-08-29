# Security audit — the legal-only sweep and its follow-ups (v1.130.0 → v1.141.3)

**Date:** 2026-08-29 · **Auditor:** red/blue self-audit, requested by the maintainer · **Scope:** every change shipped 2026-08-29 — 30 releases' worth of commits (`2e8c2b5..4724f59`), **75 files, +4,369 / −881 lines**: the WCAG/PDF-UA scoring split and legal-only sweep, the conformance attributions, the two-standards strip and action-plan rework, the veraPDF detail + fix routes, the AI-analysis block changes, the remediation-page strips, the trust-page transparency work, and four new CI/build gates (`legal-basis`, encoding-invariance ×4, `TRAPS_BUGS` drift, banned staled phrasings).

## Method

**Red pass** — mechanical sweep of the full diff's added lines for dangerous-pattern classes: `v-html` / `innerHTML` / `eval` / `new Function` / `dangerously*` (0 hits), `document.cookie` (0), `process.env` (0 new reads), network calls (0 new), shell/exec (2 hits), file writes (1 hit), template-string-into-HTML (0 outside the escaped generator). Then targeted review of every seam where the day's changes touch attacker-influenceable data: uploaded-PDF-derived fields newly rendered in the browser, veraPDF output newly surfaced, the v-html'd trust body, and the new analyzer code paths that parse hostile documents.

**Blue pass** — verification of each red finding against the source and, where relevant, the running system.

## Findings

**No critical, high, or medium findings. No new attack surface**: zero new HTTP routes, zero storage/schema changes, zero new parsers of user input (the new conformance rules read census fields the analyzers already produced, with `??`-guarded access throughout), zero new outbound requests.

### Verified seams (red concern → blue verification)

1. **`execFileSync("qpdf", …)` + temp write in `scripts/encoding-invariance.ts`.** Dev/CI-only script, unreachable from any request path. Array-form arguments (no shell interpretation), inputs are the script's own hand-built buffers (never user data), `mkdtempSync` temp dirs removed in `finally`. **Not exploitable.**
2. **`pdfUaVerdict.error` newly rendered in the browser** (the plan's veraPDF panel). Every assignment in `apps/api/src/services/veraPdf.ts` is a fixed literal ("veraPDF exited with an error and produced no output", "could not parse veraPDF JSON output", "veraPDF output did not include a validationResult") — no attacker text, no stderr echo, no paths; execFile's detailed message goes to the server log only. Rendered through Vue text interpolation (escaped) regardless. **Defense in depth confirmed.**
3. **veraPDF `clause` / `description` / `profile` newly rendered per rule.** These come from veraPDF's own validation profile — static rule text, not document content — and render through escaped interpolation. **Not attacker-controllable.**
4. **The v-html'd trust body** (`trustBody.ts`). Generated exclusively from the repo-authored template plus machine statistics; the only data-driven strings (trap labels, chip text) pass through `escHtml` before entering the markup. *Observation:* `escHtml` escapes `&<>` but not quotes — acceptable because every escaped value lands in element content, never attributes; noted here so a future attribute-position use triggers a rethink.
5. **New client rendering of stored-report fields** (strip, chips, beyond group, fix routes, bridges, remediation strips). All through Vue `{{ }}` interpolation — no `v-html` was added anywhere today (red sweep: zero hits) — so document-derived strings (titles, findings, language names) render inert.
6. **Guard regexes** (build-brief banned patterns, announcement tests, trust pins). Run against repo files only, never user input; one backtracking flaw in a guard was found *by the guard's own first run* and fixed with a word boundary (v1.141.3).

### Accepted, pre-existing by design (documented, not changed)

- **The copy-for-AI block includes document-derived text** (headings, link text quoted inside findings) in a prompt the user pastes into an assistant — a document could try to prompt-inject the user's own AI session. Pre-existing since the feature shipped and inherent to its purpose; today's changes added only analyzer-authored lines, and the new standing instruction #5 narrows one concrete abuse (an injected claim that PDF/UA items are legally required now contradicts the prompt's own guardrail).
- **Remediation share links** remain capability URLs (unguessable id + token), unchanged today.

## Fixes shipped from this audit

None required for security. Two robustness items were already fixed in-flight when their classes surfaced: the guard-regex backtracking hole (v1.141.3) and the missing-`category` guard on the criteria bridge so legacy stored reports can never render a fabricated smaller count (v1.139.1).

## Attack-surface delta summary

| Surface | Delta today |
| --- | --- |
| HTTP routes | none |
| Request parsing | none |
| Storage / schema / retention | none |
| Outbound requests | none |
| Shell execution | +1, dev/CI-only, array-args, self-built input |
| Browser rendering of untrusted data | new fields, all Vue-escaped; zero `v-html` added |
