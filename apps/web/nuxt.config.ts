import { BRANDING, DEPLOY } from '../../audit.config'

const isProd = process.env.NODE_ENV === 'production'
const siteUrl = isProd ? DEPLOY.PRODUCTION_URL : `http://localhost:${DEPLOY.WEB_PORT}`
const apiBase = isProd ? DEPLOY.PRODUCTION_URL : `http://localhost:${DEPLOY.API_PORT}`
const appName = BRANDING.APP_NAME
const orgName = BRANDING.ORG_NAME
const orgUrl = BRANDING.ORG_URL
const appDesc = 'Automated PDF accessibility scoring across 9 WCAG 2.1 and ADA Title II categories. Upload a PDF, get an instant A–F grade with detailed findings and remediation guidance.'
const appDescShort = 'Automated PDF accessibility scoring across 9 WCAG 2.1 and ADA Title II categories.'
const ogAlt = `${appName} — automated PDF scoring across 9 WCAG-aligned categories`

export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtjs/seo'],

  css: ['~/assets/css/main.css'],

  site: {
    url: siteUrl,
    name: appName,
    description: appDesc,
    defaultLocale: 'en',
  },

  ogImage: {
    enabled: false, // We use a static og-image.png
  },

  sitemap: {
    urls: ['/'],
    exclude: ['/login', '/my-history', '/history', '/report/**'],
  },

  robots: {
    groups: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/login', '/my-history', '/history'],
      },
    ],
  },

  schemaOrg: {
    identity: {
      type: 'Organization',
      name: orgName,
      url: orgUrl,
      logo: `${siteUrl}/og-image.png`,
    },
  },

  // Additional JSON-LD structured data injected via app head
  // WebApplication schema for rich search results
  appConfig: {
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: appName,
      url: siteUrl,
      description: appDesc.replace('–', '-'), // JSON-LD uses ASCII dash
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
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: appName,
      titleTemplate: `%s | ${appName}`,
      meta: [
        { name: 'description', content: appDesc },
        { property: 'og:title', content: appName },
        { property: 'og:description', content: appDescShort },
        { property: 'og:image', content: `${siteUrl}/og-image.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: ogAlt },
        { property: 'og:url', content: siteUrl },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: appName },
        { property: 'og:locale', content: 'en_US' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: appName },
        { name: 'twitter:description', content: appDescShort },
        { name: 'twitter:image', content: `${siteUrl}/og-image.png` },
        { name: 'twitter:image:alt', content: ogAlt },
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
    },
  },

  // Proxy API requests in development; in production nginx handles this
  routeRules: {
    '/api/**': {
      proxy: { to: `${apiBase}/api/**` },
    },
  },

  devtools: { enabled: false },
  compatibilityDate: '2025-03-06',
})
