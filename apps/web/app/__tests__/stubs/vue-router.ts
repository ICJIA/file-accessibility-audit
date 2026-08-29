/**
 * Test stub for "vue-router" — the real package is a Nuxt transitive that
 * pnpm does not expose to this workspace's vitest resolver. Pages that
 * import it explicitly (useRouter/useRoute) get these inert fakes; NuxtLink
 * itself is stubbed separately by test-helpers.
 */
import { ref } from "vue";

const route = { path: "/", hash: "", query: {}, params: {}, fullPath: "/" };

export function useRouter() {
  return {
    push: () => Promise.resolve(),
    replace: () => Promise.resolve(),
    back: () => {},
    currentRoute: ref(route),
  };
}

export function useRoute() {
  return route;
}
