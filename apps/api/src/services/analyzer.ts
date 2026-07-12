// Re-export shim. The audit engine was extracted into the
// @file-audit/analyzer workspace package; the implementation now lives at
// packages/analyzer/src/analyzer.ts. This thin file preserves the historical
// apps/api/src/services/analyzer.ts import path so api routes, jobs, and the
// existing test suite keep importing "../services/analyzer.js" unchanged (the CLI
// imports @file-audit/analyzer directly).
export * from "@file-audit/analyzer/analyzer";
