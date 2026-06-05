# docs/archive

Documents relocated here to keep the active `docs/` folder lean. **Not all of these are obsolete** — the set is mixed:

- Some are **superseded or were never built** (old phase roadmaps, an informal note).
- Others are **still-accurate reference, design, or roadmap docs** that the app and code still point to (e.g. the master design and the remediation plan/spec). They live here for tidiness, not because they're wrong.

Links elsewhere in the repo (README, `AGENTS.md`, `audit.config.ts`, API code comments, and the data-retention page) point at these archived paths.

## Superseded / never built

| File | Note |
|------|------|
| `02-phase-2-enhanced-features.md` | Phase 2 roadmap; only partially shipped (bulk/batch exists via `bulk-from-inventory.ts` + `BatchProgress.vue`; the rest was not built). |
| `03-phase-3-admin-monitoring.md` | Phase 3 (admin dashboard, scheduled re-checks) was never built. Basic admin exists via `/api/logs` and `/history` only. |
| `05-use-cases.md` | Use-case narratives mixing live and unbuilt (Phase 2/3/4) scenarios. |
| `08-phase-4-docx-support.md` | DOCX *analysis* was never built — the app accepts PDF only and rejects `.docx`. (Word *report export* is a separate, shipped feature.) |
| `teams-message-adobe-parity.txt` | Informal chat note for the Adobe Acrobat parity card, which was removed from the UI in v1.21.0 (the 32-rule mapping is still computed/persisted, just not surfaced). |

## Reference / design / roadmap (still accurate; relocated for leanness)

| File | What it is |
|------|------------|
| `00-master-design.md` | Original architecture, scoring model, API, auth, and security design reference. |
| `01-phase-1-core-grader.md` | Phase 1 (core grader) deliverables and testing checklist. |
| `04-deployment-guide.md` | Infrastructure, env vars, nginx, firewall (DigitalOcean → Forge → PM2). |
| `06-smtp2go-integration.md` | SMTP2GO email setup (alternative provider). |
| `07-mailgun-integration.md` | Mailgun email setup (default provider). |
| `09-forge-deployment-cheatsheet.md` | Laravel Forge deploy cheat sheet. |
| `10-scoring-reconciliation.md` | Strict vs Practical scoring, PDF/UA rationale, WCAG/ADA interpretation. |
| `fleet-inventory-reporting.md` | The live `/api/audit-url` fleet endpoint. |
| `pdf-remediation-integration-plan.md` | Auto-remediation architecture, privacy, threat model, audit trail (active feature; referenced by code and the data-retention page). |
| `pdf-remediation-alt-text-walkthrough-spec.md` | Spec for the in-progress interactive alt-text walkthrough. |
| `spike-remediation-results.md` | Feasibility-spike benchmark that justified the OpenDataLoader remediation engine. |

To restore any file to the active set: `git mv docs/archive/<file> docs/<file>` (and repoint references back).
