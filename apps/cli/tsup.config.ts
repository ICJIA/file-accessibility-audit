import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  external: ["better-sqlite3"],
  // @file-audit/shared ships plain .ts source with no compiled output (see
  // its package.json `exports` — apps/web handles this the same way via
  // nuxt.config.ts's `build.transpile`). Left to esbuild's default, a
  // workspace package resolved through node_modules is auto-externalized —
  // fine for a real npm dependency with compiled JS, but here it leaves a
  // runtime `import` in dist/index.js pointing at TypeScript source that
  // plain `node dist/index.js` cannot load (no .ts support). noExternal
  // forces esbuild to actually inline it at build time instead.
  noExternal: ["@file-audit/shared"],
});
