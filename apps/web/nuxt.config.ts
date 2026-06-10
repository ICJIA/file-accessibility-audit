import { BRANDING, DEPLOY, REMEDIATION, WCAG, ANNOUNCEMENTS } from '../../audit.config'
import { version } from './package.json'

const isProd = process.env.NODE_ENV === 'production'
const siteUrl = isProd ? DEPLOY.PRODUCTION_URL : `http://localhost:${DEPLOY.WEB_PORT}`
const appName = BRANDING.APP_SHORT_NAME
const orgName = BRANDING.ORG_NAME
const orgUrl = BRANDING.ORG_URL
const appDesc = 'Upload a PDF and get an instant accessibility score across 9 WCAG 2.2 (and 2.1) Level AA, ADA Title II, and Illinois IITAA categories with detailed findings and remediation guidance.'
const datePublished = '2025-03-06'
const dateModified = '2026-06-10'

export default defineNuxtConfig({
  modules: ['@nuxt/ui'],

  // @nuxt/icon (bundled by @nuxt/ui) defaults its data endpoint to
  // /api/_nuxt_icon — which this app's `/api/**` proxy forwards to the
  // Express backend, so icon requests 404 (e.g. the Nuxt UI `:loading`
  // spinner, lucide:loader-circle). Move the endpoint off /api, bundle the
  // icons we use into the client so they need no runtime fetch, and disable
  // the external Iconify API fallback (the CSP's `connect-src 'self'` blocks
  // it anyway, and we ship the @iconify-json/lucide collection locally).
  icon: {
    localApiEndpoint: '/_nuxt_icon',
    fallbackToApi: false,
    clientBundle: {
      scan: true,
      // Nuxt UI sets these internally, so `scan` doesn't see them in templates.
      icons: ['lucide:loader-circle'],
      sizeLimitKb: 512,
    },
  },

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
        'PDF accessibility scoring across 9 WCAG 2.2 Level AA categories',
        'Instant A-F grading with severity levels',
        'Detailed findings with remediation guidance',
        'WCAG 2.2 / 2.1 AA, ADA Title II, and Illinois IITAA compliance checking',
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
        { name: 'keywords', content: 'PDF accessibility, WCAG 2.2, WCAG 2.1, ADA Title II, IITAA, Illinois Information Technology Accessibility Act, Section 508, accessibility audit, PDF checker, screen reader, accessibility score, document remediation' },
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
      remediationEnabled: REMEDIATION.ENABLED,
      iitaaUrl: BRANDING.IITAA_URL,
      verapdfUrl: BRANDING.VERAPDF_URL,
      wcagVersion: WCAG.VERSION,
      wcagLevel: WCAG.LEVEL,
      wcagUnderstandingBase: WCAG.UNDERSTANDING_BASE[WCAG.VERSION],
      wcagQuickref: WCAG.QUICKREF[WCAG.VERSION],
      announcements: ANNOUNCEMENTS,
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

  // Security headers on every frontend response. Production-only so the dev
  // server's HMR (inline eval + websockets) isn't broken; in production
  // nginx routes /api directly to the Express API (which sets its own
  // Helmet headers), so these apply to the Nuxt-served HTML/asset routes.
  //
  // The app is fully self-contained — no external scripts, analytics, fonts,
  // or cross-origin fetches — so the CSP is tight on the high-value
  // directives (object-src/base-uri/frame-ancestors 'none'). script-src and
  // style-src keep 'unsafe-inline' because Nuxt's hydration scripts, the
  // JSON-LD block, and Mermaid's inline SVG/styles require it; nonce-based
  // script-src is the documented follow-up hardening.
  $production: {
    routeRules: {
      '/**': {
        headers: {
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "frame-ancestors 'none'",
            "frame-src 'none'",
            "form-action 'self'",
            'upgrade-insecure-requests',
          ].join('; '),
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy':
            'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
        },
      },
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
