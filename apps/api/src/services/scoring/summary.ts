// Re-export shim. The audit engine was extracted into the
// @file-audit/analyzer workspace package; the implementation now lives at
// packages/analyzer/src/scoring/summary.ts. This thin file preserves the historical
// apps/api/src/services/scoring/summary.ts import path so api routes, jobs, and the
// existing test suite keep importing "../services/scoring/summary.js" (and the CLI keeps
// importing "../../../api/src/services/scoring/summary.js") unchanged.
export * from "@file-audit/analyzer/scoring/summary";
