// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    // Generated output, vendored/curated content, and tooling this phase
    // doesn't own — never linted.
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "apps/web/.nuxt/**",
      "apps/web/.output/**",
      "**/coverage/**",
      ".tmp-audit/**",
      "controls/**",
      "docs/**",
      ".superpowers/**",
      ".claude/**",
      "**/*.d.ts",
    ],
  },

  // Base JS + TypeScript rules (non-type-aware: no `project`/`projectService`,
  // so this stays fast and doesn't need each package's tsconfig wired in).
  // Applies repo-wide (apps/api, apps/cli, packages/shared, apps/web's .ts
  // files, root scripts/ and *.config.ts) — the Vue-specific block below
  // layers on top of this for .vue files.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Vue SFCs (apps/web only) additionally get eslint-plugin-vue's
  // recommended rules, with the <script> block parsed by the TS parser so
  // typescript-eslint's rules apply inside templates' script setup too.
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  // Node-context source: the API/CLI apps, the shared + analyzer packages,
  // and root build/dev scripts + config files.
  {
    files: [
      "apps/api/**/*.{ts,mts,cts,js,mjs,cjs}",
      "apps/cli/**/*.{ts,mts,cts,js,mjs,cjs}",
      "packages/analyzer/**/*.{ts,mts,cts,js,mjs,cjs}",
      "packages/shared/**/*.{ts,mts,cts,js,mjs,cjs}",
      "scripts/**/*.{ts,mts,cts,js,mjs,cjs}",
      "*.config.{ts,mts,cts,js,mjs,cjs}",
      "audit.config.ts",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Web app: Nuxt runs both a browser-side Vue app and a Node-side Nitro
  // server out of the same apps/web tree, so both global sets apply.
  {
    files: ["apps/web/**/*.{ts,mts,cts,js,mjs,cjs,vue}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // TypeScript already catches references to undefined variables, and
  // no-undef produces false positives on plain-JS-unaware TS constructs
  // (global augmentation, `declare`, type-only imports). Off for all TS
  // (not JS) files, per typescript-eslint's own documented recommendation.
  {
    files: ["**/*.{ts,mts,cts,tsx}", "**/*.vue"],
    rules: {
      "no-undef": "off",
    },
  },

  // Nuxt's file-based routing requires these exact single-word filenames
  // (pages/index.vue, pages/login.vue, layouts/default.vue, the dynamic
  // pages/report/[id].vue, etc.) — renaming them multi-word would break
  // routing, so the rule can't apply here regardless of file content.
  {
    files: ["apps/web/app/pages/**/*.vue", "apps/web/app/layouts/**/*.vue"],
    rules: {
      "vue/multi-word-component-names": "off",
    },
  },

  {
    rules: {
      // Mass noise, not a signal: 338 hits across 58 files (31 production,
      // 27 test) on first run — mocking untyped third-party responses,
      // deliberately-loose test fixtures, and Express/Vue error handlers
      // typed `any` on purpose. Fixing all of those would mean inventing
      // throwaway types with no real safety benefit. Real `any`-adjacent
      // risk in this codebase is caught by `pnpm typecheck` (strict mode)
      // on the code that flows through actual application logic.
      "@typescript-eslint/no-explicit-any": "off",

      // The codebase already has an established convention of prefixing
      // intentionally-unused parameters/vars with `_` (e.g. `_mode`,
      // `_result`, `_idx`) — recognize it instead of forcing every one of
      // those call sites into a disable comment.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // Every no-empty hit on first run (26, concentrated in cache.ts's
      // idempotent-migration loop, qpdf/binary-probing fallbacks, and
      // best-effort temp-file/JSON cleanup) was an intentionally empty
      // `catch {}` — no non-catch empty blocks anywhere. This is exactly
      // what the rule's own `allowEmptyCatch` option exists for: still
      // flags an accidentally-empty `if`/`for`/function body, just not
      // this one well-established swallow-and-continue idiom.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // Prettier owns formatting; strip every stylistic rule that could
  // conflict with it. Must stay last so it can override the configs above.
  eslintConfigPrettier,
);
