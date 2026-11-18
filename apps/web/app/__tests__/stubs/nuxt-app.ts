// "#app" is Nuxt's virtual module; this suite's plain vitest config has no
// Nuxt, so components that import it explicitly resolve here. Each export
// forwards to the global stub test-helpers.ts installs, so a test can still
// replace it with vi.mock("#app", …).
/* eslint-disable @typescript-eslint/no-explicit-any */
export const navigateTo = (...args: unknown[]) => (globalThis as any).navigateTo?.(...args);
export const useRuntimeConfig = () => (globalThis as any).useRuntimeConfig?.();
