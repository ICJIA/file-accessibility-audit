import { BRANDING, DEPLOY } from '../../audit.config'
import { version } from './package.json'

const isProd = process.env.NODE_ENV === 'production'
const siteUrl = isProd ? DEPLOY.PRODUCTION_URL : `http://localhost:${DEPLOY.WEB_PORT}`
const appName = BRANDING.APP_SHORT_NAME
const orgName = BRANDING.ORG_NAME
const orgUrl = BRANDING.ORG_URL
const appDesc = 'Upload a PDF and get an instant accessibility score across 9 WCAG 2.1 and ADA Title II categories with detailed findings and remediation guidance.'
const datePublished = '2025-03-06'
const dateModified = '2026-04-11'

export default defineNuxtConfig({
  modules: ['@nuxt/ui'],

  colorMode: {
    preference: BRANDING.DEFAULT_COLOR_MODE,
    fallback: BRANDING.DEFAULT_COLOR_MODE,
  },

  css: ['~/assets/css/main.css'],

  // JSON-LD structured data injected via app.vue useHead()
  appConfig: {
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: appName,
      url: siteUrl,
      description: appDesc,
      applicationCategory: 'UtilityApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires a modern web browser',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      author: {
        '@type': 'Organization',
        name: orgName,
        url: orgUrl,
      },
      featureList: [
        'PDF accessibility scoring across 9 WCAG 2.1 categories',
        'Instant A-F grading with severity levels',
        'Detailed findings with remediation guidance',
        'WCAG 2.1 and ADA Title II compliance checking',
        'Export reports as Word, HTML, Markdown, or JSON',
        'Shareable report links',
        'Machine-readable JSON with WCAG mappings for LLM consumption',
      ],
      screenshot: `${siteUrl}/og-image.png`,
      datePublished,
      dateModified,
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: appName,
      titleTemplate: '%s',
      meta: [
        { name: 'description', content: appDesc },
        // Open Graph
        { property: 'og:title', content: appName },
        { property: 'og:description', content: appDesc },
        { property: 'og:image', content: `${siteUrl}/og-image.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: appDesc },
        { property: 'og:url', content: siteUrl },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: appName },
        { property: 'og:locale', content: 'en_US' },
        { property: 'article:published_time', content: datePublished },
        { property: 'article:modified_time', content: dateModified },
        // Twitter
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: appName },
        { name: 'twitter:description', content: appDesc },
        { name: 'twitter:image', content: `${siteUrl}/og-image.png` },
        { name: 'twitter:image:alt', content: appDesc },
        // Misc
        { name: 'theme-color', content: '#0a0a0a' },
        { name: 'author', content: orgName },
        { name: 'keywords', content: 'PDF accessibility, WCAG 2.1, ADA Title II, Section 508, accessibility audit, PDF checker, screen reader, accessibility score, document remediation' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'canonical', href: siteUrl },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    },
  },

  runtimeConfig: {
    public: {
      appName,
      siteUrl,
      orgName,
      orgUrl,
      faqsUrl: BRANDING.FAQS_URL,
      githubUrl: BRANDING.GITHUB_URL,
      appVersion: version,
    },
  },

  // Proxy API requests to the local API server; in production nginx handles this
  routeRules: {
    '/api/**': {
      proxy: { to: `http://localhost:${DEPLOY.API_PORT}/api/**` },
    },
    '/publist': {
      headers: { 'X-Robots-Tag': 'noindex, nofollow' },
    },
  },

  nitro: {
    esbuild: {
      options: {
        target: 'es2022',
      },
    },
  },

  devtools: { enabled: false },
  compatibilityDate: '2025-03-06',
})
