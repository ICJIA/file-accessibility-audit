// Re-export shim. The audit engine was extracted into the
// @file-audit/analyzer workspace package; the implementation now lives at
// packages/analyzer/src/analyzer.ts. This thin file preserves the historical
// apps/api/src/services/analyzer.ts import path so api routes, jobs, and the
// existing test suite keep importing "../services/analyzer.js" (and the CLI keeps
// importing "../../../api/src/services/analyzer.js") unchanged.
export * from "@file-audit/analyzer/analyzer";
