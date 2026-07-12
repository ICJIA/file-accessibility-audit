import { createRequire } from "node:module";

// Single source of truth for the CLI's reported version — read directly from
// this package's own package.json instead of a hand-maintained literal
// (previously a stale '1.0.0' duplicated in both index.ts and
// commands/audit.ts, never matching the real published version).
//
// Uses createRequire + a JSON require (rather than an ESM `with { type:
// "json" }` import) so the version resolves cleanly under `tsx src/index.ts`
// (dev / `pnpm a11y-audit`) — the CLI runs via tsx everywhere, with no
// compile or bundle step.
//
// The relative path below assumes this file lives directly in src/ (one
// level below apps/cli/), so `../package.json` is apps/cli/package.json.
// Moving this file into a subdirectory (e.g. src/lib/) would change that
// depth and read the wrong file — keep it here, at the src/ root, next to
// index.ts.
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const VERSION: string = pkg.version;
