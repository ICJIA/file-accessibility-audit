# Archived documentation

These documents are kept for historical reference but **no longer describe the current site**. They were moved here (not deleted) so the design history is preserved without cluttering the active `/docs` set.

| File | Why archived |
|------|--------------|
| `02-phase-2-enhanced-features.md` | Phase 2 roadmap. Only partially shipped — bulk/batch auditing exists (`bulk-from-inventory.ts`, `BatchProgress.vue`) — while the rest of the Phase 2 vision (e.g. CSV export) was not built. Archived as roadmap history; the live bulk feature is covered by `fleet-inventory-reporting.md` and the README. |
| `03-phase-3-admin-monitoring.md` | Phase 3 (admin dashboard, scheduled re-checks) was never built. Basic admin exists via `/api/logs` and `/history`, but the dashboard and `scheduled_checks` described here do not exist. |
| `05-use-cases.md` | Use-case narratives that mixed live scenarios with unbuilt Phase 2/3/4 features. Archived rather than maintained piecemeal. |
| `08-phase-4-docx-support.md` | Phase 4 (DOCX accessibility *analysis*) was never built. The app accepts PDF only and explicitly rejects `.docx` uploads. (Note: exporting a *report* as Word `.docx` is a separate, shipped feature.) |
| `spike-remediation-results.md` | Historical feasibility-spike benchmark that justified the OpenDataLoader choice for the auto-remediation engine. A decision record, not operational documentation. |
| `teams-message-adobe-parity.txt` | Informal chat note explaining the Adobe Acrobat parity card. That card was removed from the UI in v1.21.0 (the 32-rule mapping is still computed/persisted for backward compatibility but no longer surfaced). |

To restore any file, `git mv docs/archive/<file> docs/<file>`.
