/**
 * Shared test helpers for Vue component tests in a Nuxt environment.
 * Stubs Nuxt auto-imports and UI components so we can mount components
 * without a full Nuxt runtime.
 */
import { config } from '@vue/test-utils'
import { ref, computed, inject, provide, reactive, watch, watchEffect, nextTick, onMounted, onUnmounted } from 'vue'

// Stub Nuxt auto-imported composables on globalThis so <script setup> code
// that references them without explicit imports will still work.
const _global = globalThis as any
_global.ref = ref
_global.computed = computed
_global.inject = inject
_global.provide = provide
_global.reactive = reactive
_global.watch = watch
_global.watchEffect = watchEffect
_global.nextTick = nextTick
_global.onMounted = onMounted
_global.onUnmounted = onUnmounted
_global.definePageMeta = () => {}
_global.navigateTo = () => {}
_global.$fetch = async () => ({})
// Mirror the full runtimeConfig.public surface exposed in nuxt.config.ts so any
// component mounted in tests gets defined values (not just the WCAG keys).
_global.useRuntimeConfig = () => ({
  public: {
    appName: 'Accessibility Audit',
    siteUrl: 'https://audit.example.test',
    orgName: 'Test Org',
    orgUrl: 'https://example.test',
    faqsUrl: '',
    githubUrl: '',
    appVersion: '0.0.0-test',
    remediationEnabled: false,
    iitaaUrl: 'https://doit.illinois.gov/initiatives/accessibility/iitaa.html',
    verapdfUrl: 'https://verapdf.org/',
    wcagVersion: '2.2',
    wcagLevel: 'AA',
    wcagQuickref: 'https://www.w3.org/WAI/WCAG22/quickref/',
    wcagUnderstandingBase: 'https://www.w3.org/WAI/WCAG22/Understanding/',
    announcements: [],
  },
})
_global.useWcag = () => {
  const version = '2.2'
  const level = 'AA'
  return {
    version,
    level,
    quickref: 'https://www.w3.org/WAI/WCAG22/quickref/',
    label: `WCAG ${version} Level ${level}`,
    understandingUrl: (slug: string) => `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`,
  }
}

// Stub Nuxt/UI components globally so every mount picks them up.
config.global.stubs = {
  NuxtLink: { template: '<a><slot /></a>' },
  NuxtPage: { template: '<div />' },
  NuxtLoadingIndicator: { template: '<div />' },
  UButton: {
    template: '<button :disabled="loading" :type="type"><slot /></button>',
    props: ['variant', 'color', 'size', 'loading', 'block', 'type'],
  },
  UBadge: {
    template: '<span class="u-badge" :data-color="color"><slot /></span>',
    props: ['variant', 'color', 'size'],
  },
  UInput: {
    template: '<input :value="modelValue" :placeholder="placeholder" :type="type" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'placeholder', 'type', 'size', 'required', 'disabled', 'inputmode', 'pattern', 'maxlength'],
    emits: ['update:modelValue'],
  },
  UCard: { template: '<div class="u-card"><slot /></div>' },
  UFormField: { template: '<div class="u-form-field"><slot /></div>', props: ['label'] },
}
