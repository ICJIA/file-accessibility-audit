// Re-export shim. The audit engine was extracted into the
// @file-audit/analyzer workspace package; the implementation now lives at
// packages/analyzer/src/childSpawnEnv.ts. This thin file preserves the historical
// apps/api/src/services/childSpawnEnv.ts import path so api routes, jobs, and the
// existing test suite keep importing "../services/childSpawnEnv.js" (and the CLI keeps
// importing "../../../api/src/services/childSpawnEnv.js") unchanged.
export * from "@file-audit/analyzer/childSpawnEnv";
