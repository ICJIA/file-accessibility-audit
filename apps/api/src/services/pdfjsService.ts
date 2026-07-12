// Re-export shim. The audit engine was extracted into the
// @file-audit/analyzer workspace package; the implementation now lives at
// packages/analyzer/src/pdfjsService.ts. This thin file preserves the historical
// apps/api/src/services/pdfjsService.ts import path so api routes, jobs, and the
// existing test suite keep importing "../services/pdfjsService.js" (and the CLI keeps
// importing "../../../api/src/services/pdfjsService.js") unchanged.
export * from "@file-audit/analyzer/pdfjsService";
