// "#app" is Nuxt's virtual module; this suite's plain vitest config has no
// Nuxt, so components that import it explicitly resolve here. Each export
// forwards to the global stub test-helpers.ts installs, so a test can still
// replace it with vi.mock("#app", …).
export const navigateTo = (...args: unknown[]) => (globalThis as any).navigateTo?.(...args);
export const useRuntimeConfig = () => (globalThis as any).useRuntimeConfig?.();
// usePrefill removes ?prefill= with router.replace. A test that cares what
// was replaced installs its own `useRouter` on globalThis; everything else
// gets an inert router.
export const useRouter = () =>
  (globalThis as any).useRouter?.() ?? {
    push: () => Promise.resolve(),
    replace: () => Promise.resolve(),
  };
