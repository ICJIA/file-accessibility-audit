import { WCAG } from "../../../../audit.config";
/**
 * Shared test helpers for Vue component tests in a Nuxt environment.
 * Stubs Nuxt auto-imports and UI components so we can mount components
 * without a full Nuxt runtime.
 */
import { config } from "@vue/test-utils";
import {
  ref,
  computed,
  inject,
  provide,
  reactive,
  watch,
  watchEffect,
  nextTick,
  onMounted,
  onUnmounted,
  onBeforeUnmount,
  useId,
  type Ref,
} from "vue";

// Stub Nuxt auto-imported composables on globalThis so <script setup> code
// that references them without explicit imports will still work.
const _global = globalThis as any;
_global.ref = ref;
_global.computed = computed;
_global.inject = inject;
_global.provide = provide;
_global.reactive = reactive;
_global.watch = watch;
_global.watchEffect = watchEffect;
_global.nextTick = nextTick;
_global.onMounted = onMounted;
_global.onUnmounted = onUnmounted;
_global.onBeforeUnmount = onBeforeUnmount;
// Vue 3.5's own useId — Nuxt auto-imports it (AppTooltip uses it for
// aria-describedby ids), so tests need it on the global like the rest.
_global.useId = useId;
_global.definePageMeta = () => {};
_global.navigateTo = () => {};
_global.$fetch = async () => ({});

// Nuxt's cross-component state. The real one keys into the payload; a plain
// per-key ref cache is behaviourally identical for a single mounted tree,
// which is all any test here has.
const _states = new Map<string, Ref<unknown>>();
_global.useState = <T>(key: string, init?: () => T): Ref<T> => {
  if (!_states.has(key)) _states.set(key, ref(init ? init() : undefined) as Ref<unknown>);
  return _states.get(key) as Ref<T>;
};
_global.useAuditInProgress = () => _global.useState("audit-in-progress", () => false);
// Mirror the full runtimeConfig.public surface exposed in nuxt.config.ts so any
// component mounted in tests gets defined values (not just the WCAG keys).
// The app is dark by default, so tests get the dark palette — which is what
// every existing colour assertion was written against. Light-mode values are
// asserted directly against the token tables in colorTokens.test.ts instead of
// by re-mounting everything in a second theme.
_global.useColorMode = () => ({ value: "dark", preference: "dark" });
_global.useRuntimeConfig = () => ({
  public: {
    appName: "ICJIA Accessibility Audit",
    siteUrl: "https://audit.example.test",
    orgName: "Test Org",
    orgUrl: "https://example.test",
    faqsUrl: "",
    githubUrl: "",
    appVersion: "0.0.0-test",
    remediationEnabled: false,
    docxEnabled: true,
    pptxEnabled: true,
    xlsxEnabled: true,
    iitaaUrl: "https://doit.illinois.gov/initiatives/accessibility/iitaa.html",
    verapdfUrl: "https://verapdf.org/",
    wcagVersion: WCAG.VERSION,
    wcagLevel: "AA",
    wcagQuickref: WCAG.QUICKREF[WCAG.VERSION],
    wcagUnderstandingBase: WCAG.UNDERSTANDING_BASE[WCAG.VERSION],
    announcements: [],
  },
});
// DERIVED FROM THE REAL CONFIG, never hardcoded (2026-08-31). This stub had
// its own literal "2.2" and its own /WCAG22/ URLs, so it silently overrode the
// runtime-config mock below and no component test could see a WCAG-version
// regression: chips resolved to 2.2 pages under test while production served
// 2.1. Reading audit.config means the stub follows the flag by construction.
_global.useWcag = () => {
  const version = WCAG.VERSION;
  const level = WCAG.LEVEL;
  return {
    version,
    level,
    quickref: WCAG.QUICKREF[version],
    label: `WCAG ${version} Level ${level}`,
    understandingUrl: (slug: string) => `${WCAG.UNDERSTANDING_BASE[version]}${slug}.html`,
  };
};

// Stub Nuxt/UI components globally so every mount picks them up.
config.global.stubs = {
  NuxtLink: { template: "<a><slot /></a>" },
  NuxtPage: { template: "<div />" },
  NuxtLoadingIndicator: { template: "<div />" },
  UButton: {
    template: '<button :disabled="loading" :type="type"><slot /></button>',
    props: ["variant", "color", "size", "loading", "block", "type"],
  },
  UBadge: {
    template: '<span class="u-badge" :data-color="color"><slot /></span>',
    props: ["variant", "color", "size"],
  },
  UInput: {
    template:
      '<input :value="modelValue" :placeholder="placeholder" :type="type" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: [
      "modelValue",
      "placeholder",
      "type",
      "size",
      "required",
      "disabled",
      "inputmode",
      "pattern",
      "maxlength",
    ],
    emits: ["update:modelValue"],
  },
  UCard: { template: '<div class="u-card"><slot /></div>' },
  UFormField: { template: '<div class="u-form-field"><slot /></div>', props: ["label"] },
};
