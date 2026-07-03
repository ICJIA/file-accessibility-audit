/**
 * audit.config.ts — Single source of truth for ALL configurable constants.
 *
 * ============================================================================
 * EVERY magic number, threshold, weight, limit, and display constant in this
 * project lives here. The API imports this directly. The frontend references it
 * via shared types. The design documents (docs/archive/00-master-design.md) describe
 * the "why" — this file defines the "what".
 *
 * RULES:
 * 1. If you add a new constant anywhere in the codebase, put it here first.
 * 2. Never hardcode a configurable value in a service, route, or component.
 * 3. Secrets (JWT_SECRET, SMTP_PASS) stay in .env — this file is committed.
 * 4. After changing a value, run `pnpm --filter api test:scoring` to verify
 *    scoring still produces expected results against test fixtures.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// BRANDING
// ---------------------------------------------------------------------------
// All organization-specific branding lives here. Override these values to
// white-label the tool for a different organization. The defaults are ICJIA.
//
// SAFE TO CHANGE: Yes — all values are purely cosmetic or used in URLs.
// After changing, also update these static files manually:
//   - apps/web/public/site.webmanifest  (name, short_name)
//   - apps/web/public/llms.txt          (title, organization, URLs)
//   - apps/web/public/llms-full.txt     (title, organization, URLs)
//   - og-image.svg → regenerate og-image.png
//   - apps/cli/package.json             (package name, if forking)
// ---------------------------------------------------------------------------

export const BRANDING = {
  /** Application name displayed in headers, page titles, exports, and emails. */
  APP_NAME: "ICJIA File Accessibility Audit",

  /** Short app name (for PWA manifest, browser tabs when space is limited). */
  APP_SHORT_NAME: "Accessibility Audit",

  /** Organization name shown in Schema.org, meta tags, and export footers. */
  ORG_NAME: "Illinois Criminal Justice Information Authority",

  /** Organization website URL (used in Schema.org identity and JSON-LD author). */
  ORG_URL: "https://icjia.illinois.gov",

  /** FAQs / documentation URL shown in the navbar. Set to '' to hide the link. */
  FAQS_URL: "https://accessibility.icjia.app",

  /** GitHub repository URL shown in the footer. Set to '' to hide the link. */
  GITHUB_URL: "https://github.com/ICJIA/file-accessibility-audit",

  /**
   * URL for the Illinois Information Technology Accessibility Act
   * (IITAA) reference. Shown in the post-remediation compliance
   * disclaimer so users can read the standard our outputs aim to
   * support. Update if the State of Illinois reorganizes the canonical
   * page. Empty string hides the link.
   */
  IITAA_URL: "https://doit.illinois.gov/initiatives/accessibility/iitaa.html",

  /**
   * URL for the veraPDF homepage. Shown in the post-remediation
   * compliance disclaimer so users can learn what veraPDF is and why
   * we use it (open-source PDF/UA-1 / PDF/UA-2 validator backed by
   * the PDF Association and Dual Lab). Empty string hides the link.
   */
  VERAPDF_URL: "https://verapdf.org/",

  /** Default color mode for the UI. Users can toggle between light and dark via the nav.
   *  Set to 'dark' for a dark-first experience, or 'light' if your agency's branding
   *  requires a light default. Users can always switch modes via the toggle in the nav bar.
   *  SAFE TO CHANGE: 'light' | 'dark' */
  DEFAULT_COLOR_MODE: "dark" as "light" | "dark",
} as const;

// ---------------------------------------------------------------------------
// WCAG STANDARD VERSION
// ---------------------------------------------------------------------------
// The operative reference standard the whole app displays and links to.
//
// We audit against WCAG 2.2 Level AA — a SUPERSET of the WCAG 2.1 AA that
// IITAA 2.1 (§E205.4) and the ADA Title II rule actually require. Auditing to
// 2.2 is stricter than the Illinois legal minimum; 2.2 is optional/forward-
// looking under IITAA today. The automated checks are unchanged — every
// machine-checkable criterion carried forward from 2.1 into 2.2. The new 2.2
// criteria are interactive/manual and are surfaced as "not assessed", never as
// automated failures.
//
// REVERT PATH: set WCAG_VERSION=2.1 in the environment (PM2 env block or
// /etc/environment), then:
//   - API: restart only (tsx re-reads this file at startup — no rebuild). The
//     conformance verdict (labels, links, and the 2.2 "not assessed" additions)
//     reverts immediately.
//   - Web: rebuild + restart. Nuxt bakes runtimeConfig.public at `nuxt build`
//     time (same as REMEDIATION.ENABLED), so the front end picks up 2.1 only
//     after `pnpm build` and a restart — not on a bare env change.
// A normal redeploy (which rebuilds the web app) does both at once.
//
// SAFE TO CHANGE: VERSION via env only ("2.1" | "2.2"). Keep URLs accurate —
// a wrong citation is a credibility problem.
// ---------------------------------------------------------------------------

export const WCAG = {
  /** Operative version. Defaults to "2.2"; only "2.1" reverts. */
  VERSION: (process.env.WCAG_VERSION === "2.1" ? "2.1" : "2.2") as "2.1" | "2.2",
  LEVEL: "AA" as const,
  /** "Understanding" page base URL, version-keyed. Carried-forward criteria
   *  keep identical slugs across 2.1 and 2.2. */
  UNDERSTANDING_BASE: {
    "2.1": "https://www.w3.org/WAI/WCAG21/Understanding/",
    "2.2": "https://www.w3.org/WAI/WCAG22/Understanding/",
  },
  /** Quick-reference base, version-keyed. */
  QUICKREF: {
    "2.1": "https://www.w3.org/WAI/WCAG21/quickref/",
    "2.2": "https://www.w3.org/WAI/WCAG22/quickref/",
  },
} as const;

// ---------------------------------------------------------------------------
// WCAG 2.2 NEW A/AA SUCCESS CRITERIA
// ---------------------------------------------------------------------------
// The six new Level A/AA success criteria introduced in WCAG 2.2 (the three
// AAA additions are described in the /wcag-2-2 page copy but not used by the
// conformance gate). `pdfFormRelevant` marks the ones that can apply to an
// interactive PDF FORM; these are the ones the gate surfaces as "not assessed"
// when a document has form fields (balanced-strict).
//
// SAFE TO CHANGE: Criteria data is locked to the published WCAG 2.2 spec — only
// update if W3C errata change a criterion number, name, level, or slug. Do not
// remove an entry to silence a false positive (the gate already lists these as
// "not assessed", never as failures). Add a future "2.3" set as a new constant
// rather than mutating this one.
// ---------------------------------------------------------------------------
export const WCAG_22_NEW_AA = [
  { sc: "2.4.11", name: "Focus Not Obscured (Minimum)", level: "AA", slug: "focus-not-obscured-minimum", pdfFormRelevant: false },
  { sc: "2.5.7", name: "Dragging Movements", level: "AA", slug: "dragging-movements", pdfFormRelevant: false },
  { sc: "2.5.8", name: "Target Size (Minimum)", level: "AA", slug: "target-size-minimum", pdfFormRelevant: true },
  { sc: "3.2.6", name: "Consistent Help", level: "A", slug: "consistent-help", pdfFormRelevant: false },
  { sc: "3.3.7", name: "Redundant Entry", level: "A", slug: "redundant-entry", pdfFormRelevant: true },
  { sc: "3.3.8", name: "Accessible Authentication (Minimum)", level: "AA", slug: "accessible-authentication-minimum", pdfFormRelevant: true },
] as const;

// ---------------------------------------------------------------------------
// LANDING-PAGE ANNOUNCEMENTS
// ---------------------------------------------------------------------------
// A reusable slot for "what's new" on the landing page. To announce a future
// improvement, PREPEND a new entry (index 0 is rendered). Dismissal is
// permanent per `id` (stored client-side); bump the `id` to re-show.
// ---------------------------------------------------------------------------

export const ANNOUNCEMENTS = [
  {
    id: "pptx-xlsx-support-2026-07",
    badge: "New",
    text: "Now supporting Microsoft PowerPoint (.pptx) and Excel (.xlsx) files — upload a presentation or workbook for the same WCAG 2.2 AA accessibility audit as PDFs and Word documents, with findings and fix guidance tailored to each app.",
    linkText: "",
    linkTo: "",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "July 2, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "docx-support-2026-07",
    badge: "New",
    text: "Now supporting Microsoft Word (.docx) files — upload a Word document for the same WCAG 2.2 AA accessibility audit as PDFs, with findings and fix guidance tailored to Word.",
    linkText: "",
    linkTo: "",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "July 1, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
] as const;

// ---------------------------------------------------------------------------
// DEPLOYMENT
// ---------------------------------------------------------------------------

export const DEPLOY = {
  /**
   * The canonical production URL for this application.
   *
   * Used in:
   * - Shared report URLs returned by POST /api/reports
   * - OTP email footer (optional "sent from" link)
   * - CORS origin validation (production mode)
   * - nginx server_name directive
   *
   * SAFE TO CHANGE: Yes — update when migrating to a new domain.
   * ALSO UPDATE: nginx config, DNS A record, Let's Encrypt cert.
   */
  PRODUCTION_URL: "https://audit.icjia.app",

  /**
   * Development frontend URL (Nuxt dev server).
   * Used for CORS origin in development mode.
   *
   * SAFE TO CHANGE: Yes — if you change the Nuxt dev port, update this.
   */
  DEV_FRONTEND_URL: "http://localhost:5102",

  /** API server port (development and production) */
  API_PORT: 5103,

  /** Frontend server port (Nuxt dev / production) */
  WEB_PORT: 5102,
} as const;

// ---------------------------------------------------------------------------
// EMAIL PROVIDER
// ---------------------------------------------------------------------------
// Controls which SMTP relay is used for OTP delivery. Credentials (user,
// pass) stay in .env — only non-secret connection details live here.
//
// To switch providers: change PROVIDER below. Both sets of SMTP settings
// are defined here; the mailer picks the active one automatically.
// Credentials for whichever provider you choose must be in .env as
// SMTP_USER and SMTP_PASS.
//
// SAFE TO CHANGE: Yes — swap PROVIDER any time. No code changes needed.
// ---------------------------------------------------------------------------

export const EMAIL = {
  /**
   * Active email provider. Determines which SMTP settings are used.
   *
   * SAFE TO CHANGE: Yes — set to 'mailgun' or 'smtp2go'.
   */
  PROVIDER: "mailgun" as "mailgun" | "smtp2go",

  /**
   * Default sender address for OTP emails.
   *
   * SAFE TO CHANGE: Yes — must match a verified sender on the active provider.   
   * Can be overridden in .env with SMTP_FROM.
   */
  DEFAULT_FROM: "admin@icjia.cloud",

  /** Mailgun SMTP connection details (no secrets). */
  mailgun: {
    host: "smtp.mailgun.org",
    port: 587,
  },

  /** SMTP2GO SMTP connection details (no secrets). */
  smtp2go: {
    host: "mail.smtp2go.com",
    port: 2525,
  },
} as const;

// ---------------------------------------------------------------------------
// SCORING WEIGHTS
// ---------------------------------------------------------------------------
// These weights control how much each accessibility category contributes to
// the overall score. They MUST sum to exactly 1.0.
//
// The weights reflect WCAG 2.1 priority: text extractability is the most
// fundamental requirement (a scanned PDF is completely inaccessible), followed
// by structural elements (title, headings, alt text) that affect the majority
// of assistive technology users.
//
// SAFE TO CHANGE: Yes — but with care. Changing weights changes every
// document's score. After changing, re-run `pnpm --filter api test:scoring`
// and update the .expected.json fixtures if the new weights are intentional.
//
// DO NOT CHANGE the keys — they are used as category IDs throughout the
// codebase and in stored audit log data. Renaming a key is a breaking change.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SCORING PROFILES / GRADE / SEVERITY / WCAG MAP — moved to packages/shared
// ---------------------------------------------------------------------------
// These are pure, browser-safe data consumed by the web UI as well as the
// API scorer, so they live in @file-audit/shared (packages/shared/src/
// scoring.ts). Re-exported here so every existing `#config` import keeps
// working unchanged. Edit them THERE.
// ---------------------------------------------------------------------------
export {
  SCORING_PROFILES,
  SCORING_WEIGHTS,
  GRADE_THRESHOLDS,
  SEVERITY_THRESHOLDS,
  WCAG_CATEGORY_MAP,
} from "@file-audit/shared";

// ---------------------------------------------------------------------------
// DOCX (WORD) ANALYSIS
// ---------------------------------------------------------------------------
// Config for the Microsoft Word (.docx) accessibility checker, which runs
// alongside the PDF pipeline. A .docx is a ZIP of OOXML XML parsed in pure JS
// (jszip + fast-xml-parser, no external binary), so once extracted it reuses
// the PDF pipeline's scoring aggregation, grade/severity thresholds, WCAG map,
// conformance-verdict shape, and the entire report UI.
// ---------------------------------------------------------------------------

export const DOCX = {
  /**
   * Feature flag. When false, the API rejects .docx uploads/URLs (cleanly
   * falling back to PDF-only) and the frontend drops .docx from the dropzone
   * and its copy. Lets you keep the rock-solid PDF path and turn Word auditing
   * off with no code change. Default is ENABLED (on). PDF auditing is entirely
   * unaffected either way.
   *
   * Reads from env: set DOCX_ENABLED=false to disable. Both API and web read
   * the same value at startup; the web app exposes it via
   * runtimeConfig.public.docxEnabled.
   *
   * SAFE TO CHANGE: Yes — flip via env var (shell, or PM2's ecosystem.config
   * env block). Don't hardcode `false` here unless you want it off everywhere.
   */
  ENABLED: process.env.DOCX_ENABLED !== "false",

  /** Canonical MIME type for .docx (WordprocessingML). */
  MIME_TYPE:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  /**
   * Max UNCOMPRESSED bytes for any single part read out of the .docx ZIP
   * (document.xml, styles.xml, etc.). The 15 MB upload cap only limits the
   * COMPRESSED size — a decompression ("zip") bomb can inflate a <1 MB upload
   * to multiple GB and OOM the process. The reader checks the ZIP's declared
   * uncompressed size AND streams with a hard byte cap (declared size can be
   * forged), aborting past this limit. 30 MB covers even very large real
   * documents; a part bigger than this is not a legitimate Word file.
   *
   * SAFE TO CHANGE: Yes — lower for tighter memory, raise only with headroom.
   * fast-xml-parser's object tree is ~20× the XML string, so 30 MB → ~660 MB
   * heap per analysis; keep MAX_CONCURRENT_ANALYSES × this within the RAM budget.
   */
  MAX_UNCOMPRESSED_BYTES: 30 * 1024 * 1024,

  /**
   * Max number of paragraphs (<w:p>) analyzed. A document that decompresses
   * within MAX_UNCOMPRESSED_BYTES but is millions of tiny elements still costs
   * CPU/heap in the extract passes; this bounds it. 100k paragraphs ≈ a
   * ~2000-page document — far beyond any real report. Over the cap → rejected.
   *
   * SAFE TO CHANGE: Yes.
   */
  MAX_PARAGRAPHS: 100_000,

  /**
   * Wall-clock timeout (ms) for a single DOCX analysis, mirroring the PDF
   * pipeline's PDFJS_TIMEOUT_MS. Backstops the async decompression phase; the
   * synchronous parse/extract is bounded by the size + paragraph caps above.
   * On timeout the route returns 504.
   *
   * SAFE TO CHANGE: Yes.
   */
  ANALYSIS_TIMEOUT_MS: 20_000,

  /**
   * DOCX category weights. Word maps onto the same category IDs as PDF, except:
   *   - reading_order / form_accessibility / bookmarks are N/A for Word,
   *   - color_contrast is machine-checkable for Word (explicit + theme colors),
   *   - list_structure is a Word-specific category (real lists vs manual bullets),
   *   - text_extractability auto-passes (Word is always text-based) so it carries
   *     only a small weight — it must not hand a structureless doc free points.
   *
   * Weights need not sum to 1 — the scorer renormalizes across the applicable
   * (non-null) categories, exactly as it does for PDF N/A categories.
   *
   * SAFE TO CHANGE: Yes — same rules as SCORING_PROFILES.strict.weights. Keys
   * MUST match category IDs. Run `pnpm --filter api test:scoring` afterwards.
   */
  SCORING_WEIGHTS: {
    text_extractability: 0.05,
    title_language: 0.18,
    heading_structure: 0.18,
    alt_text: 0.18,
    table_markup: 0.12,
    color_contrast: 0.12,
    list_structure: 0.09,
    link_quality: 0.08,
  },
} as const;

// ---------------------------------------------------------------------------
// PPTX (POWERPOINT) ANALYSIS
// ---------------------------------------------------------------------------
// Config for the PowerPoint (.pptx) accessibility checker (v1.33.0). Same
// posture as DOCX: a ZIP of OOXML parts parsed in pure JS on the shared
// services/ooxml.ts core; reuses the PDF pipeline's scoring aggregation,
// grade/severity thresholds, WCAG map, conformance-verdict shape, and the
// report UI.
// ---------------------------------------------------------------------------

export const PPTX = {
  /** Feature flag — set PPTX_ENABLED=false to reject .pptx and hide it in the
   *  web UI (runtimeConfig.public.pptxEnabled). SAFE TO CHANGE: via env var. */
  ENABLED: process.env.PPTX_ENABLED !== "false",

  /** Canonical MIME type for .pptx (PresentationML). */
  MIME_TYPE:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  /** Max UNCOMPRESSED bytes per ZIP part (zip-bomb guard) — same rationale
   *  and budget math as DOCX.MAX_UNCOMPRESSED_BYTES. SAFE TO CHANGE. */
  MAX_UNCOMPRESSED_BYTES: 30 * 1024 * 1024,

  /** Max slides analyzed; over the cap → rejected (CPU/heap bound, the
   *  MAX_PARAGRAPHS analogue). 2,000 slides is far beyond any real deck.
   *  SAFE TO CHANGE. */
  MAX_SLIDES: 2000,

  /** Max total shapes across all slides; over the cap → rejected.
   *  SAFE TO CHANGE. */
  MAX_SHAPES: 100_000,

  /** Wall-clock timeout (ms) per analysis; route maps timeout → 504.
   *  SAFE TO CHANGE. */
  ANALYSIS_TIMEOUT_MS: 20_000,

  /**
   * PPTX category weights. PowerPoint maps onto the shared category IDs,
   * except:
   *   - slide_titles is PowerPoint-specific (every slide needs a title);
   *   - reading_order is ACTIVE (title-first-in-shape-tree is machine-checkable)
   *     — it is permanently N/A for Word;
   *   - heading_structure / bookmarks are omitted (slide titles are the
   *     PowerPoint outline); form_accessibility is a not-assessed placeholder.
   * Weights renormalize across applicable categories, as for PDF/DOCX N/A.
   * SAFE TO CHANGE: same rules as DOCX.SCORING_WEIGHTS.
   */
  SCORING_WEIGHTS: {
    text_extractability: 0.05,
    title_language: 0.14,
    slide_titles: 0.18,
    alt_text: 0.18,
    reading_order: 0.1,
    table_markup: 0.1,
    color_contrast: 0.1,
    list_structure: 0.07,
    link_quality: 0.08,
  },
} as const;

// ---------------------------------------------------------------------------
// XLSX (EXCEL) ANALYSIS
// ---------------------------------------------------------------------------

export const XLSX = {
  /** Feature flag — set XLSX_ENABLED=false to reject .xlsx and hide it in the
   *  web UI (runtimeConfig.public.xlsxEnabled). SAFE TO CHANGE: via env var. */
  ENABLED: process.env.XLSX_ENABLED !== "false",

  /** Canonical MIME type for .xlsx (SpreadsheetML). */
  MIME_TYPE:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  /** Max UNCOMPRESSED bytes per ZIP part (zip-bomb guard) — same rationale as
   *  DOCX.MAX_UNCOMPRESSED_BYTES. SAFE TO CHANGE. */
  MAX_UNCOMPRESSED_BYTES: 30 * 1024 * 1024,

  /** Max worksheets analyzed; over the cap → rejected. SAFE TO CHANGE. */
  MAX_SHEETS: 200,

  /** Max total used-range cells (worksheet XML is the volume driver — this is
   *  the MAX_PARAGRAPHS analogue). Over the cap → rejected. SAFE TO CHANGE. */
  MAX_CELLS: 1_000_000,

  /** Wall-clock timeout (ms) per analysis; route maps timeout → 504.
   *  SAFE TO CHANGE. */
  ANALYSIS_TIMEOUT_MS: 20_000,

  /**
   * XLSX category weights. Excel maps onto the shared category IDs, except:
   *   - sheet_names is Excel-specific (no default "Sheet1" names);
   *   - title_language scores on the title alone (Excel stores no document
   *     language — the gate lists 3.1.1 as not assessed);
   *   - table_markup carries the most weight: data as real table objects with
   *     header rows is THE Excel accessibility fundamental;
   *   - heading_structure / reading_order / list_structure / bookmarks are
   *     omitted; form_accessibility is a not-assessed placeholder.
   * SAFE TO CHANGE: same rules as DOCX.SCORING_WEIGHTS.
   */
  SCORING_WEIGHTS: {
    text_extractability: 0.05,
    title_language: 0.12,
    sheet_names: 0.18,
    table_markup: 0.25,
    alt_text: 0.18,
    color_contrast: 0.12,
    link_quality: 0.1,
  },
} as const;

// ---------------------------------------------------------------------------
// PDF ANALYSIS LIMITS
// ---------------------------------------------------------------------------
// Operational limits for the PDF analysis pipeline. These protect the server
// from resource exhaustion and define category-specific behavior thresholds.
//
// SAFE TO CHANGE: Yes for all values, but read the notes on each.
// ---------------------------------------------------------------------------

export const ANALYSIS = {
  /**
   * Maximum file upload size in megabytes.
   *
   * Enforced in three places (all must agree):
   * 1. multer `limits.fileSize` in uploadMiddleware.ts
   * 2. nginx `client_max_body_size` (set to this + 10MB headroom for headers)
   * 3. Frontend file picker validation (immediate user feedback)
   *
   * SAFE TO CHANGE: Yes — but increasing above 50MB on a 4GB droplet risks
   * OOM kills during concurrent uploads. If you increase this, also increase
   * the nginx `client_max_body_size` in the Forge nginx config.
   */
  MAX_FILE_SIZE_MB: 15,

  /**
   * QPDF subprocess timeout in milliseconds.
   * If QPDF hasn't finished parsing within this window, the process is killed
   * and the API returns HTTP 504.
   *
   * SAFE TO CHANGE: Yes — increase if legitimate complex PDFs are timing out.
   * Decrease if you want faster failure on adversarial inputs. 30s is a
   * reasonable default; most PDFs finish in under 5s.
   */
  QPDF_TIMEOUT_MS: 30_000,

  /**
   * Maximum stdout buffer for QPDF JSON output, in bytes.
   * QPDF's `--json` output can be very large for PDFs with deep structure
   * trees or many objects. If the output exceeds this, execFileSync throws.
   *
   * SAFE TO CHANGE: Yes — increase if you see "maxBuffer exceeded" errors
   * on legitimate PDFs. 50MB handles most documents; very complex government
   * reports with thousands of tagged elements may need more.
   */
  QPDF_MAX_BUFFER: 50 * 1024 * 1024,

  /**
   * Wall-clock cap for the pdfjs extraction pass, in milliseconds.
   * Unlike QPDF (a subprocess with its own timeout), pdfjs runs in-process,
   * so a pathological PDF — millions of operators, a huge page count — can
   * otherwise pin one of the MAX_CONCURRENT_ANALYSES slots indefinitely. On
   * timeout the analysis is abandoned (HTTP 504) and the slot is freed so a
   * single adversarial upload can't starve the queue.
   *
   * SAFE TO CHANGE: Yes — raise if legitimate large documents time out;
   * lower for faster failure on adversarial inputs. 60s comfortably covers
   * real government reports while bounding abuse.
   */
  PDFJS_TIMEOUT_MS: 60_000,

  /**
   * Maximum number of PDFs being analyzed simultaneously.
   * Implemented as a semaphore in pdfAnalyzer.ts. Requests beyond this limit
   * wait in a queue (or return 503 if the queue is also full).
   *
   * SAFE TO CHANGE: Yes — but on a 4GB droplet, 2 is the safe maximum.
   * Each analysis can consume 50MB+ in memory (multer buffer + QPDF process).
   * Increase only if you upgrade the droplet's RAM.
   */
  MAX_CONCURRENT_ANALYSES: 2,

  /**
   * Minimum page count to require bookmarks/outlines.
   * Documents with fewer pages than this score N/A on the Bookmarks category
   * instead of being penalized for missing bookmarks.
   *
   * SAFE TO CHANGE: Yes — WCAG doesn't specify an exact threshold. 10 is
   * conservative. Some organizations use 4 or 5 pages.
   */
  BOOKMARKS_PAGE_THRESHOLD: 10,

  /**
   * Reading order: fraction of out-of-order MCIDs that triggers a score
   * reduction. If more than this fraction of content items are out of
   * sequence relative to the page content stream, the reading order score
   * drops from 100 to 50.
   *
   * SAFE TO CHANGE: Yes — increase to be more lenient (e.g., 0.30 = allow
   * 30% out-of-order before penalizing), decrease to be stricter.
   */
  READING_ORDER_DISORDER_THRESHOLD: 0.2,
} as const;

// ---------------------------------------------------------------------------
// AUTHENTICATION
// ---------------------------------------------------------------------------
// Controls for the OTP-based auth system. These values are also referenced
// in the auth flow description (doc 00, Section 3) and rate limiting.
//
// Note: JWT_SECRET is in .env (per-environment secret), not here.
// ---------------------------------------------------------------------------

export const AUTH = {
  /**
   * Master switch for OTP-based authentication.
   *
   * When false:
   * - No login page is required; users go straight to the upload page.
   * - The API accepts requests without a JWT (authMiddleware passes through).
   * - No audit history is recorded (no email to associate with analyses).
   * - Email configuration (SMTP_USER/SMTP_PASS) is not required at startup.
   *
   * When true:
   * - Full OTP auth flow is enforced (email → OTP → JWT session).
   * - All analyses are logged with the authenticated user's email.
   * - Valid email provider credentials must be configured.
   *
   * SAFE TO CHANGE: Yes — flip to true once email delivery is configured
   * and you want to gate access behind OTP authentication.
   */
  REQUIRE_LOGIN: false,

  /**
   * How long a JWT session lasts, in hours.
   * After this, the user must re-authenticate via OTP.
   *
   * SAFE TO CHANGE: Yes. Shorter = more secure but more OTP emails.
   * 72 hours means users authenticate roughly once every 3 days.
   * Do not exceed 168 (7 days) for an internal tool handling documents.
   */
  JWT_EXPIRY_HOURS: 72,

  /**
   * How long an OTP code remains valid, in minutes.
   * After this, the OTP is rejected and the user must request a new one.
   *
   * SAFE TO CHANGE: Yes. 15 minutes gives users time to check email and
   * switch tabs. Don't go below 5 (email delivery can be slow) or above
   * 30 (increases the brute-force window).
   */
  OTP_EXPIRY_MINUTES: 15,

  /**
   * Maximum wrong OTP attempts before the code is invalidated.
   * After this many failures, the user must request a new OTP.
   *
   * SAFE TO CHANGE: Yes. 5 is generous for typos but still makes brute-force
   * impractical (5 guesses out of 1,000,000 combinations). Don't go above 10.
   */
  OTP_MAX_ATTEMPTS: 5,

  /**
   * Number of digits in the OTP code.
   *
   * DO NOT CHANGE unless you also update the OTP generation logic
   * (crypto.randomInt range), the email template formatting, and the
   * frontend input field. 6 digits is the industry standard for email OTPs.
   */
  OTP_LENGTH: 6,

  /**
   * Regex pattern for allowed email domains.
   * Only users with email addresses matching this pattern can authenticate.
   *
   * SAFE TO CHANGE: Yes — e.g., to add additional state domains. The regex
   * must be case-insensitive and anchor both sides. The current pattern
   * allows any subdomain of illinois.gov (e.g., icjia.illinois.gov,
   * dhs.illinois.gov, etc.).
   *
   * ALSO UPDATE: the .env ALLOWED_DOMAINS variable for development overrides.
   */
  ALLOWED_EMAIL_REGEX: /^[^@]+@([a-z0-9-]+\.)*illinois\.gov$/i,
} as const;

// ---------------------------------------------------------------------------
// RATE LIMITS
// ---------------------------------------------------------------------------
// Per-endpoint rate limiting via express-rate-limit. Each limiter has a
// `max` (requests allowed) and `windowMs` (time window in milliseconds).
//
// The `key` for each limiter (email vs IP) is configured in rateLimiter.ts,
// not here — keys depend on request parsing logic, not just numbers.
//
// SAFE TO CHANGE: Yes for all values. Increase `max` if legitimate users
// are hitting limits; decrease if you see abuse. The in-memory store resets
// on server restart — this is fine for single-instance deployment.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// PRIVILEGED API TOKEN (rate-limit tier + allowlist bypass)
// ---------------------------------------------------------------------------
// A single static bearer token, supplied at runtime via the
// API_PRIVILEGED_TOKEN environment variable (PM2 env / Forge / /etc/environment
// — never committed). A request carrying `Authorization: Bearer <token>` that
// matches it is promoted from the strict anonymous tier to the privileged one:
//
//   1. Rate limits   — the generous `privileged` numbers below instead of the
//                      strict `anon` numbers.
//   2. URL allowlist — the caller may audit ANY public URL, not just the
//                      ICJIA / illinois.gov allowlist (applied in the route
//                      handlers — see apps/api/src/routes/analyze-url.ts,
//                      audit-url.ts, audit-url-page.ts).
//
// It is NOT the OTP/JWT/DB-PAT auth system (which stays off while
// AUTH.REQUIRE_LOGIN is false). It grants ONLY those two things and never
// bypasses the private/reserved-IP SSRF block, the size caps, or the
// concurrency semaphores — a leaked token cannot reach internal services.
//
// Empty/unset → feature off → every request is anonymous (fail-safe to strict).
// The match is a constant-time compare in rateLimiter.ts (isPrivilegedRequest),
// which reads process.env directly, mirroring authMiddleware's JWT_SECRET /
// ADMIN_EMAILS pattern.
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
  /** POST /api/auth/request — keyed by email address.
   *  Prevents an attacker from spamming OTP emails to a victim.
   *  (Moot while AUTH.REQUIRE_LOGIN is false, but kept wired.) */
  authRequest: { max: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour

  /** POST /api/auth/verify — keyed by IP address.
   *  Prevents brute-forcing OTP codes from a single source. */
  authVerify: { max: 10, windowMs: 15 * 60 * 1000 }, // 10 per 15 min

  /**
   * The four audit endpoints — /api/analyze, /api/analyze-url,
   * /api/audit-url, /api/audit-url-page. Two-tier (see the privileged-token
   * note above):
   *
   *   anon       — no/invalid token. Keyed by IP. The abuse ceiling for the
   *                public tool. Sized to admit one pass of a known automated
   *                client (icjia-drone-app, ~320 files from a single IP) with
   *                retry headroom, while blocking the "thousands of requests
   *                an hour" abuse case.
   *   privileged — valid Bearer token. Single shared 'privileged' bucket.
   *                Sized for the ICJIA fleet-audit pipeline (~5000 PDFs /
   *                ~657 pages re-audited across passes).
   *
   * The true resource ceiling is MAX_CONCURRENT_ANALYSES /
   * MAX_CONCURRENT_PAGE_AUDITS (= 2 each), so the privileged tier can be
   * generous without risking the droplet.
   *
   * SAFE TO CHANGE: Yes.
   */
  analyze: {
    windowMs: 60 * 60 * 1000, // 1 hour
    anon: 500, // 500 / hour / IP  (no token)
    privileged: 5000, // 5000 / hour      (with token)
  },

  /** POST /api/reports — keyed by IP (anonymous mode).
   *  Prevents a single source from filling the shared_reports table. */
  reports: { max: 10, windowMs: 60 * 60 * 1000 }, // 10 per hour

  /**
   * All routes — catch-all burst guard against request floods. Two-tier,
   * same token check as `analyze`:
   *   anon       — 100/min/IP  (reverted from the fleet campaign's 1000/min,
   *                which had been applied to everyone).
   *   privileged — 1000/min, so a token-authenticated fleet run isn't
   *                throttled per-minute before the hourly `analyze` tier
   *                matters (icjia.illinois.gov has ~657 pages; the page-audit
   *                burst previously hit 100/min → 499 HTTP 429s, which is why
   *                the privileged tier exists).
   *
   * EXEMPTION: GET /api/remediate/:jobId/status is skipped here (see
   * isRemediationStatusRequest in rateLimiter.ts) and governed by
   * `remediationStatus` below instead — the remediation progress page
   * polls it, and that polling must not drain the budget shared with
   * real endpoints (it did in v1.32.0: a >25 s job hit this cap and the
   * UI showed "Too many requests" mid-remediation).
   */
  global: {
    windowMs: 60 * 1000, // 1 minute
    anon: 100, // 100 / min / IP   (no token)
    privileged: 1000, // 1000 / min      (with token)
  },

  /**
   * GET /api/remediate/:jobId/status — the remediation progress poll,
   * exempt from `global` (see above) and capped here per IP instead.
   * The endpoint is a single prepared-statement SELECT by primary key,
   * so the guard only needs to stop request floods, not meter usage.
   *
   * Sizing: the client polls at 1 s (60/min/job, backing off on 429);
   * 600/min admits ~10 concurrent jobs/tabs from one office IP before
   * throttling. The client treats a 429 here as silent backoff, never
   * a job failure.
   *
   * SAFE TO CHANGE: Yes. Keep max ≥ 300 (asserted in rateLimiter.test.ts)
   * so a handful of parallel jobs can't reintroduce the v1.32.0 bug.
   */
  remediationStatus: { max: 600, windowMs: 60 * 1000 }, // 600 / min / IP
} as const;

// ---------------------------------------------------------------------------
// SHARED REPORTS (Phase 2)
// ---------------------------------------------------------------------------

export const SHARED_REPORTS = {
  /**
   * Number of days before a shared report link expires.
   * After this, GET /api/reports/:id returns 404 and the row is eligible
   * for cleanup.
   *
   * SAFE TO CHANGE: Yes. Longer = more useful for recipients but more
   * database storage. 365 days is sized for the auditor / fleet-inventory
   * use case: ICJIA's fleet audit lists every PDF across all sites, runs
   * on a multi-month cadence, and the resulting CSV / HTML report needs
   * to stay valid for at least a year so reviewers can click through to
   * the full audit details for any flagged file. The database growth cost
   * is real but accepted — see the v1.19.0 release notes.
   */
  EXPIRY_DAYS: 365,

  /**
   * Number of days before audit_log rows are eligible for cleanup.
   *
   * audit_log is the canonical "this content has been audited" record
   * (v1.20.1+). Every audit path writes a row. Without retention,
   * audit_log grows unbounded — a slow-burn DoS vector that the
   * v1.20.1 red/blue review flagged as P2.3. 365 days matches the
   * shared-report retention so audit-related records age out
   * together.
   *
   * Rows store only metadata (hash, score, grade, IP, user-agent,
   * timestamp) — no PDF content — so retention is cheap. A 100-PDF
   * fleet at ~200 bytes per row adds ~7 MB per year of audits.
   *
   * SAFE TO CHANGE: Yes. Longer = better forensic trail; shorter =
   * less DB storage. Coordinate with managers if you alter this.
   */
  AUDIT_LOG_RETENTION_DAYS: 365,

  /**
   * Maximum size of the report JSON payload in bytes.
   * Enforced via express.json({ limit: ... }) on the reports route.
   * Prevents oversized payloads from inflating the SQLite database.
   *
   * SAFE TO CHANGE: Yes — 1MB accommodates reports with many findings.
   * Increase only if legitimate reports are being rejected (unlikely).
   */
  MAX_PAYLOAD_BYTES: 1 * 1024 * 1024, // 1MB
} as const;

// ---------------------------------------------------------------------------
// BATCH UPLOAD (Phase 2)
// ---------------------------------------------------------------------------

export const BATCH = {
  /**
   * Maximum number of files in a single batch upload.
   * Files are processed sequentially server-side to avoid memory spikes.
   *
   * SAFE TO CHANGE: Yes — but more files = longer processing time.
   * At ~5–10 seconds per PDF, 3 files means up to ~30 seconds of
   * sequential processing. Don't exceed 20 without also implementing
   * a background job queue.
   */
  MAX_FILES: 3,
} as const;

// ---------------------------------------------------------------------------
// SCHEDULED CHECKS (Phase 3)
// ---------------------------------------------------------------------------

export const SCHEDULED_CHECKS = {
  /**
   * Maximum number of active scheduled checks across the entire instance.
   * Prevents runaway resource usage from the cron job that fetches URLs.
   *
   * SAFE TO CHANGE: Yes — increase if the tool needs to monitor more URLs.
   * Each check fetches a PDF and runs the full analysis pipeline, so the
   * cron job's runtime scales linearly with this number.
   */
  MAX_ACTIVE: 50,

  /**
   * How many consecutive HTTP failures (404, 410, timeout) before a
   * scheduled check is automatically marked inactive.
   *
   * SAFE TO CHANGE: Yes. Higher = more tolerant of temporary outages.
   * 3 means a URL must fail 3 weeks in a row (for weekly checks) before
   * being deactivated.
   */
  FAILURE_THRESHOLD: 3,

  /**
   * HTTP fetch timeout for downloading remote PDFs, in milliseconds.
   * Prevents slow-loris or unresponsive servers from tying up resources.
   *
   * SAFE TO CHANGE: Yes. 30 seconds is generous for most PDF downloads.
   */
  FETCH_TIMEOUT_MS: 30_000,
} as const;

// ---------------------------------------------------------------------------
// FILENAME SANITIZATION
// ---------------------------------------------------------------------------

export const FILENAME = {
  /**
   * Maximum length for stored filenames (in the audit log and reports).
   * Longer filenames are truncated.
   *
   * SAFE TO CHANGE: Yes — 255 matches most filesystem limits.
   */
  MAX_LENGTH: 255,

  /**
   * Regex for allowed characters in stored filenames.
   * Characters NOT matching this pattern are replaced with underscores.
   * This prevents stored XSS when filenames are rendered in the admin UI.
   *
   * DO NOT CHANGE to allow angle brackets (< >), quotes, or ampersands
   * without also implementing HTML entity encoding in all UI templates
   * that render filenames.
   */
  ALLOWED_CHARS: /[a-zA-Z0-9._\-\s]/g,
} as const;

// ---------------------------------------------------------------------------
// UI CONSTANTS
// ---------------------------------------------------------------------------
// Display values used by the Nuxt frontend. The API does not use these
// directly, but they are defined here so there is one place to update
// the app name or color palette.
// ---------------------------------------------------------------------------

export const UI = {
  /**
   * Dark mode color palette (used as CSS variable defaults in :root).
   * Light mode overrides are defined in apps/web/app/assets/css/main.css
   * under the html.light selector. The default mode is set by
   * BRANDING.DEFAULT_COLOR_MODE above.
   *
   * SAFE TO CHANGE: Yes — these are CSS hex colors. Update to match
   * your agency's brand guidelines if needed.
   */
  COLORS: {
    background: "#0a0a0a",
    surface: "#111111",
    border: "#222222",
    text: "#f5f5f5",
  },

  /**
   * Number of items per page in paginated views (audit log, my-history).
   *
   * SAFE TO CHANGE: Yes — purely a UX preference.
   */
  DEFAULT_PAGE_SIZE: 20,

  /**
   * Maximum page size a client can request via ?limit= query parameter.
   * Prevents clients from requesting the entire table in one query.
   *
   * SAFE TO CHANGE: Yes — but keep it reasonable (100–200 max).
   */
  MAX_PAGE_SIZE: 100,
} as const;

// ---------------------------------------------------------------------------
// PDF AUTO-REMEDIATION (v1 — basic OpenDataLoader + qpdf preprocessing)
// ---------------------------------------------------------------------------
// Tunables for the "Remediate this PDF" feature. v1 ships basic ODL only;
// hybrid mode and AI alt text are on the roadmap (see
// docs/archive/pdf-remediation-integration-plan.md).
//
// The privacy posture is the load-bearing decision here: PDFs are NOT cached
// between audit and remediation. The user re-uploads to remediate. Inputs are
// deleted between pipeline stages; outputs are deleted on first download or
// after OUTPUT_TTL_MS, whichever comes first.

export const REMEDIATION = {
  /**
   * Feature flag. When false, the API endpoints return 404 and the
   * frontend hides the Remediate button. Lets us merge plumbing without
   * exposing the feature until it's ready.
   *
   * Reads from env: set REMEDIATION_ENABLED=true to enable. Default is
   * disabled. Both API and web pick up the same value at startup; the
   * web app exposes it via runtimeConfig.public.remediationEnabled.
   *
   * SAFE TO CHANGE: Yes — flip via env var in your shell or in PM2's
   * ecosystem.config.cjs env block. Don't hardcode `true` here unless
   * you want it always-on in every environment.
   */
  ENABLED: process.env.REMEDIATION_ENABLED === "true",

  /**
   * Maximum file size for PDFs submitted to remediation, in megabytes.
   * Larger than ANALYSIS.MAX_FILE_SIZE_MB because remediation handles
   * documents the audit may have flagged as needing structure work
   * (annual reports, multi-section dossiers). The Juvenile fixture in the
   * spike was 7MB / 246 pages.
   *
   * SAFE TO CHANGE: Yes — keep ≤ nginx client_max_body_size minus headroom.
   * Increasing past 100MB risks JVM OOM on a 4GB droplet.
   */
  MAX_FILE_SIZE_MB: 50,

  /**
   * Maximum page count accepted for remediation. Pathological PDFs with
   * thousands of pages are rejected pre-pipeline (not the audit pipeline's
   * concern; this is specifically for the remediation worker).
   *
   * SAFE TO CHANGE: Yes — 500 covers all realistic ICJIA reports including
   * the 246-page Juvenile fixture. Lower if you want faster failure.
   */
  MAX_PAGE_COUNT: 500,

  /**
   * Wall-clock timeout for the remediation worker, in milliseconds.
   * The JVM child is killed if the whole pipeline takes longer than this.
   * Typical reports finish in 0.4–2s; the 246-page Juvenile took 37s in
   * basic mode. 5 minutes is generous and catches runaway/stuck cases.
   *
   * SAFE TO CHANGE: Yes — lower for stricter resource use, higher only
   * if you regularly hit the cap on legitimate documents.
   *
   * Enforced (v1.27.0) as: (1) a `timeout` on every pipeline subprocess
   * (qpdf normalize, qpdf --check, veraPDF), and (2) a master self-timer in
   * the worker that SIGKILLs its entire process group — worker + the
   * OpenDataLoader JVM + any qpdf child — when this budget elapses.
   */
  WORKER_TIMEOUT_MS: 300_000,

  /**
   * Wall-clock timeout for the optional veraPDF conformance check, in ms.
   * Separate from WORKER_TIMEOUT_MS so the (informational, non-blocking)
   * veraPDF JVM can be bounded more tightly than the whole pipeline. On
   * timeout the check is recorded as unavailable and remediation proceeds.
   *
   * SAFE TO CHANGE: Yes — raise if legitimate large outputs time out.
   */
  VERAPDF_TIMEOUT_MS: 120_000,

  /**
   * JVM max heap size for the OpenDataLoader child process.
   * Passed via JAVA_TOOL_OPTIONS=-Xmx<value>m. Caps memory a single
   * remediation can consume regardless of input pathology.
   *
   * SAFE TO CHANGE: Yes — raise if you see "OutOfMemoryError" in worker
   * logs on legitimate documents. Lower to be more frugal. 768MB handled
   * every spike fixture comfortably; 512MB is the safe lower bound.
   */
  JVM_HEAP_MB: 768,

  /**
   * Maximum concurrent remediation jobs per user.
   * Enforced at POST /api/remediate. Prevents one user from queueing
   * dozens of jobs and saturating disk/CPU.
   *
   * SAFE TO CHANGE: Yes — keep at 1 for v1; revisit if user volume grows.
   */
  MAX_CONCURRENT_JOBS_PER_USER: 1,

  /**
   * Maximum remediation jobs a single caller can start in a rolling
   * 24-hour window. Enforced at POST /api/remediate after the
   * audit-gate check (v1.20.1+). Prevents the "thousands of automated
   * remediations" abuse case while leaving plenty of headroom for a
   * legitimate agency clearing a backlog of ~50 PDFs.
   *
   * Sizing rationale: ICJIA's typical agency fleet runs into the
   * tens of PDFs; an unusually large day is ~50. 100 covers a 2×
   * burst without forcing legit users to coordinate. 3000 attempted
   * by an attacker would take 30 days at the cap — meaningful
   * friction without breaking real workflows.
   *
   * SAFE TO CHANGE: Yes — raise if a real fleet workload trips it,
   * lower if abuse surfaces.
   */
  MAX_JOBS_PER_DAY_PER_USER: 100,

  /**
   * The "you must audit this PDF before remediating it" window, in
   * milliseconds. Enforced at POST /api/remediate (v1.20.1+) by
   * looking for a recent audit_log row matching the same content_hash
   * for the same caller. Any audit path counts: browser upload via
   * /api/analyze, URL audit via /api/analyze-url or /api/audit-url,
   * fleet bulk via /api/bulk-from-inventory. 60 minutes is the
   * sweet spot — long enough for a slow user to read results before
   * clicking remediate; short enough that direct curl-bypass
   * attempts need to re-audit each time.
   *
   * SAFE TO CHANGE: Yes — longer is friendlier to natural workflow;
   * shorter is tighter against abuse. 60 min is conservative.
   */
  AUDIT_REQUIRED_WINDOW_MS: 60 * 60_000,

  /**
   * How long the remediated output PDF lives on disk after the job
   * completes successfully, in milliseconds. Cleanup deletes the file
   * when this TTL expires, even if the user never downloads. First
   * successful download also deletes the file regardless of TTL.
   *
   * SAFE TO CHANGE: Yes — shorter is better for privacy; longer if users
   * complain about lost downloads. 30 minutes is the privacy-vs-UX
   * default.
   */
  OUTPUT_TTL_MS: 30 * 60_000,

  /**
   * How long the `remediation_jobs` row is kept after job completion,
   * in days. The row never contains PDF content — only metadata — so
   * retention is cheap. Used for short-term operational visibility
   * ("my recent remediations").
   *
   * SAFE TO CHANGE: Yes — independent of EVENT_LOG_RETENTION_DAYS below.
   */
  JOB_ROW_RETENTION_DAYS: 30,

  /**
   * How long lifecycle audit events are kept, in days. These rows are
   * the auditor-facing record: timestamps for every step of the
   * pipeline including post-deletion fs.stat verification. They contain
   * no PDF content, so long retention is safe.
   *
   * SAFE TO CHANGE: Yes — matches your agency's records-retention
   * policy. 7 years (~2555 days) is a common default for state-agency
   * compliance.
   */
  EVENT_LOG_RETENTION_DAYS: 7 * 365,

  /**
   * How often the cleanup sweep runs, in milliseconds. The sweep:
   *  1. Deletes output files past OUTPUT_TTL_MS.
   *  2. Marks jobs stuck in `running` >10 min as failed.
   *  3. Removes orphan files (no matching DB row).
   *  4. Purges `remediation_jobs` rows past JOB_ROW_RETENTION_DAYS.
   *  5. Purges `remediation_events` rows past EVENT_LOG_RETENTION_DAYS.
   *
   * SAFE TO CHANGE: Yes — shorter means more frequent disk hygiene at
   * the cost of CPU. 5 minutes is a reasonable default.
   */
  CLEANUP_INTERVAL_MS: 5 * 60_000,

  /**
   * Storage location for output PDFs (resolved relative to apps/api/).
   * Each job's output lives at `${OUTPUT_DIR}/<jobId>.pdf`; the worker's
   * scratch dir is `${OUTPUT_DIR}/<jobId>/work/` and is removed at the
   * end of the job.
   *
   * SAFE TO CHANGE: Yes — but make sure the path is gitignored, has 0700
   * mode in production, and has enough free disk for your throughput.
   */
  OUTPUT_DIR: "./data/remediation",

  /**
   * Optional explicit path to the Java binary. If null, the worker uses
   * `java` from PATH. Set this on macOS dev boxes where brew's openjdk
   * isn't symlinked into /usr/bin (e.g., "/opt/homebrew/opt/openjdk@17/bin/java").
   * On Ubuntu/DigitalOcean with `apt install openjdk-17-jre-headless`,
   * leave null — `java` is already on PATH.
   *
   * Reads from env: REMEDIATION_JAVA_PATH overrides this. For macOS
   * local dev:
   *   REMEDIATION_JAVA_PATH=/opt/homebrew/opt/openjdk@17/bin/java
   *
   * SAFE TO CHANGE: Yes.
   */
  JAVA_PATH: (process.env.REMEDIATION_JAVA_PATH || null) as string | null,

  /**
   * Optional path to the veraPDF CLI binary. veraPDF
   * (https://verapdf.org/) is the open-source PDF/UA-1 / PDF/UA-2
   * validator maintained by the PDF Association + Dual Lab. When set,
   * the worker runs `verapdf --flavour ua1 --format json <output>` on
   * the remediated PDF and records the verdict in remediation_jobs +
   * remediation_events. The UI surfaces the result in the
   * compliance-disclaimer card on the result page.
   *
   * On Ubuntu/DigitalOcean: install from
   *   https://software.verapdf.org/rel/verapdf-installer.zip
   * (Unzip, run ./verapdf-install verapdf-auto-install.xml,
   *  set VERAPDF_PATH to the installed `verapdf` shell script.)
   *
   * On macOS: brew has no veraPDF formula; download the same installer
   * and run it. Typical path:
   *   /Applications/verapdf/verapdf
   *
   * Reads from env: REMEDIATION_VERAPDF_PATH. If null/missing, the
   * worker skips veraPDF (event recorded as 'verapdf_unavailable')
   * and the UI shows a "veraPDF not run" notice.
   *
   * SAFE TO CHANGE: Yes.
   */
  VERAPDF_PATH: (process.env.REMEDIATION_VERAPDF_PATH || null) as string | null,
} as const;
