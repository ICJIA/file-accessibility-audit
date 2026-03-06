export default defineNuxtConfig({
  modules: ['@nuxt/ui'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'File Accessibility Audit',
      meta: [
        { name: 'description', content: 'Automated PDF accessibility scoring across 9 WCAG-aligned categories. Upload a PDF, get an instant grade with remediation guidance.' },
        { property: 'og:title', content: 'File Accessibility Audit' },
        { property: 'og:description', content: 'Automated PDF accessibility scoring across 9 WCAG-aligned categories.' },
        { property: 'og:image', content: '/og-image.png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: '/og-image.png' },
      ],
    },
  },

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
