import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./app", import.meta.url)),
      // vue-router is a Nuxt transitive pnpm doesn't expose here; pages that
      // import it explicitly resolve to an inert test stub instead.
      "vue-router": fileURLToPath(new URL("./app/__tests__/stubs/vue-router.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./app", import.meta.url)),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["app/__tests__/**/*.test.ts"],
  },
});
