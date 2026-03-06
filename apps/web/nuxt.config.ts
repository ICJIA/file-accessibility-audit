export default defineNuxtConfig({
  modules: ['@nuxt/ui'],

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      appName: process.env.NUXT_PUBLIC_APP_NAME || 'File Accessibility Audit',
    },
  },

  // Proxy API requests in development
  routeRules: {
    '/api/**': {
      proxy: process.env.NUXT_API_BASE
        ? `${process.env.NUXT_API_BASE}/**`
        : 'http://localhost:5103/**',
    },
  },

  devtools: { enabled: false },
  compatibilityDate: '2025-03-06',
})
