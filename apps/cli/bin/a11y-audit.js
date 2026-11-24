#!/usr/bin/env node
/**
 * a11y-audit — executable entry point.
 *
 * This repository runs TypeScript directly through tsx; there is no compiled
 * output. This shim is the one plain-JavaScript file: it turns tsx on for the
 * current process and then loads the real entry point, src/index.ts.
 *
 * Two things here are what make the command work FROM ANY DIRECTORY:
 *
 *  - tsx is imported from this file, so Node finds it in this package's own
 *    node_modules — not relative to wherever the command was typed.
 *  - TSX_TSCONFIG_PATH names this package's tsconfig. The engine's `#config`
 *    alias is a tsconfig path, and tsx otherwise looks for a tsconfig from the
 *    working directory. The Office worker (a child process) inherits it.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tsconfig = path.join(here, "..", "tsconfig.json");
process.env.TSX_TSCONFIG_PATH ||= tsconfig;

let register;
try {
  ({ register } = await import("tsx/esm/api"));
} catch {
  console.error(
    "a11y-audit: the 'tsx' package is not installed. Run `pnpm install` in the repository checkout first.",
  );
  process.exit(2);
}
register({ tsconfig: process.env.TSX_TSCONFIG_PATH });

await import("../src/index.ts");
