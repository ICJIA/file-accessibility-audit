import { createRequire } from "node:module";

// Single source of truth for the CLI's reported version — read directly from
// this package's own package.json instead of a hand-maintained literal
// (previously a stale '1.0.0' duplicated in both index.ts and
// commands/audit.ts, never matching the real published version).
//
// Uses createRequire + a JSON require (rather than an ESM `with { type:
// "json" }` import) so this resolves identically under `tsx src/index.ts`
// (dev / `pnpm a11y-audit`) and inside the tsup-bundled dist/index.js
// (`pnpm --filter @icjia/a11y-audit build` / `start`).
//
// The relative path below assumes this file lives directly in src/ (one
// level below apps/cli/) — the same depth tsup's single-file ESM bundle
// (dist/index.js) ends up at, since import.meta.url for every module
// inlined into that bundle resolves to the bundle's own file location, not
// this file's original source path. Moving this file into a subdirectory
// (e.g. src/lib/) would silently break the bundled build by changing that
// depth — keep it here, at the src/ root, next to index.ts.
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const VERSION: string = pkg.version;
