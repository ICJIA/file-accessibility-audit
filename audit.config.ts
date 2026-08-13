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
 * 3. Secrets (API_PRIVILEGED_TOKEN) stay in .env — this file is committed.
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
  {
    sc: "2.4.11",
    name: "Focus Not Obscured (Minimum)",
    level: "AA",
    slug: "focus-not-obscured-minimum",
    pdfFormRelevant: false,
  },
  {
    sc: "2.5.7",
    name: "Dragging Movements",
    level: "AA",
    slug: "dragging-movements",
    pdfFormRelevant: false,
  },
  {
    sc: "2.5.8",
    name: "Target Size (Minimum)",
    level: "AA",
    slug: "target-size-minimum",
    pdfFormRelevant: true,
  },
  {
    sc: "3.2.6",
    name: "Consistent Help",
    level: "A",
    slug: "consistent-help",
    pdfFormRelevant: false,
  },
  {
    sc: "3.3.7",
    name: "Redundant Entry",
    level: "A",
    slug: "redundant-entry",
    pdfFormRelevant: true,
  },
  {
    sc: "3.3.8",
    name: "Accessible Authentication (Minimum)",
    level: "AA",
    slug: "accessible-authentication-minimum",
    pdfFormRelevant: true,
  },
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
    id: "fix-steps-verified-2026-08-11",
    badge: "Improved",
    text: "Every fix step in every report has been re-checked, word for word, against the current versions of Microsoft Word and Adobe Acrobat (verified August 2026). Adobe redesigned Acrobat's entire menu system in 2023, so each Acrobat step now shows the current path first with the older “classic” path in parentheses — whichever version you're on, the step matches your screen. Each card of fix steps also names the exact app versions it was written for and tells you how to recognize which Acrobat you have. And if a menu item still doesn't match what you see, the card says who to contact — IDS at ICJIA — to get your software brought current.",
    linkText: "How the audit works",
    linkTo: "/technical-details",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 11, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    // `-r2` re-shows this announcement to anyone who dismissed the first
    // wording: it stated the sign-in system was removed without saying it had
    // never been switched on, which understates the guarantee.
    id: "no-accounts-no-identifiers-2026-08-09-r2",
    badge: "Privacy",
    text: "The sign-in system has been removed — and it was never actually in use: login was never switched on, so nobody ever needed an account and no audit was ever tied to one. With the tool now in wide use, that unused machinery was deleted outright rather than left sitting in the code — it stays free and open, with nothing to register for. The service also no longer stores who uses it: the database columns for email address, IP address, and browser identifier were deleted, along with the data they held. What an audit leaves behind is metadata about the file — its name, score, grade, and date — never the file, and now about nobody. The full accounting is in the data-retention policy, at v1.6.",
    linkText: "Read the data-retention policy",
    linkTo: "/data-retention",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 9, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "heading-outlines-2026-08-09",
    badge: "New",
    text: "Reports now show your document's full heading outline — every heading with its actual text, for both PDF and Word files. Word reports also list any paragraphs that only look like headings (bold, large text) so you can restyle them with real Heading styles. And the technical detail on each report card starts open in the detailed view, so the specifics — which image, which heading, which table — are visible without extra clicks. Each card's toggle still collapses the detail if you prefer the summary.",
    linkText: "How the audit works",
    linkTo: "/technical-details",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 9, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "scoring-calibration-2026-08-08",
    badge: "Improved",
    text: "Scores are now calibrated strictly to the accessibility standard: style-guide advice (like “use exactly one top-level heading”) still appears on your report, but no longer lowers your grade. If you re-audit a document, its score may be a little higher than an older shared link of the same file — nothing changed about what passes or fails the standard. Reports are also more upfront about limits: they now list more of what no automated tool can check, and they warn you when every image in a document is marked decorative, since screen readers skip those silently.",
    linkText: "How the audit works",
    linkTo: "/technical-details",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 8, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "printable-action-steps-2026-08-08",
    badge: "New",
    text: "Every report now has a big \u201cPrinter-friendly action steps\u201d button. It opens a clean page in a new tab with your fixes written out in full \u2014 each one showing both how to fix it in the original Word or PowerPoint file and how to fix it in Adobe Acrobat, so whoever ends up doing the work has what they need. Print it, or save it as a PDF, and work from it beside the document instead of keeping this page open. The same button appears after auto-remediation, where it lists what the automatic fixes could not repair. Reports also always open in the visual step-by-step view now, and the Visual/Detailed chooser above every report is much easier to find.",
    linkText: "How the audit works",
    linkTo: "/technical-details",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 8, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "manual-review-checklist-2026-08-07",
    badge: "New",
    text: "Every report now ends with a checklist of what a person still needs to check by hand — including reports that score 100. Automated checks can confirm that accessibility structure is present, but not that it is right: a picture described as \u201cimage\u201d passes the alt-text check and tells a screen reader nothing. So each check your document passed now comes with the one judgment the tool could not make. Nothing in that list is a failure — it is the difference between a document that is structured correctly and one that actually reads well.",
    linkText: "How the audit works",
    linkTo: "/technical-details",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 7, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "how-scores-are-calculated-2026-08-07",
    badge: "Important",
    text: "How scores and grades are calculated has changed, and many documents will score differently than before. A document is no longer punished for being simple: checks that do not apply to it — table markup in a document with no tables — now count as passing rather than being dropped. A document's score can no longer rise above what its worst unresolved problem allows: a minor item holds it at 89, a moderate problem at 79, a critical problem at 69. The letter still comes from the same scale it always has (90 an A, 80 a B, 70 a C, 60 a D), so the number and the letter always agree. Reports you shared before today show their corrected score when reopened.",
    linkText: "How scores are calculated",
    linkTo: "/technical-details",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 7, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "clearer-report-headline-2026-08-07",
    badge: "Improved",
    text: 'The report headline is clearer. Because the letter grade is a weighted average while the publish-or-not verdict counts blocking issues, a document could previously be described as "Excellent" and "not ready to publish" in the same sentence. Now, when something blocks publication, that leads: "Not ready to publish — 2 critical issues." The fix steps also read more plainly — jargon like "structure tags" and "OCR" is explained where it appears, and the Acrobat instructions now say plainly that they need Acrobat Pro, not the free Reader. Two categories that genuinely cannot be fixed inside a PDF now say so instead of pointing you back to a source file you may not have.',
    linkText: "See what the audit checks",
    linkTo: "/technical-details",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 7, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "visual-report-view-2026-08-07",
    badge: "New",
    text: "Audit reports now open in a visual, plain-language view: your grade front and center, a color-coded severity summary, and a numbered action plan that walks through fixes one step at a time — written for document authors, not developers, with instructions for Word, PowerPoint, Excel, and Acrobat. Nothing was removed: the Visual/Detailed toggle at the top right of any report switches to the complete technical report, and your choice sticks on your device. Downloaded HTML reports and printouts carry the same new layout with every detail expanded.",
    linkText: "How the audit works",
    linkTo: "/technical-details",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 7, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "shared-report-deletion-2026-08-05",
    badge: "Privacy",
    text: "Shared report links have always stopped working after one year. Starting today, the stored report itself is also deleted: the service's cleanup sweep now permanently removes a shared report's data about 30 days after its link expires, so nothing you shared outlives its usefulness by more than a month. The data-retention policy (v1.4) states the exact lifecycle, and its § 8a explains precisely what a shared report contains.",
    linkText: "Read the data-retention policy",
    linkTo: "/data-retention",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 5, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "storage-verification-and-backups-2026-08-05",
    badge: "Transparency",
    text: "The data-retention policy now includes a dated, line-by-line verification of what is and isn't stored — every database table and every write path checked against the public source code, with the evidence published as its own section (§ 8a). The verification also tightened one statement rather than quietly rewording it: a report you choose to share can quote short strings from your document (such as image alt text and link labels) inside its findings; a plain audit stores none of that. Separately, the service's usage records are now backed up nightly on the server, integrity-checked, keeping only the five newest snapshots — and the status page now shows when the last backup completed.",
    linkText: "Read the storage verification (§ 8a)",
    linkTo: "/data-retention",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 5, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "security-audit-2026-08-05",
    badge: "Security",
    text: "The whole tool has had a fresh independent security review — attack surface, sign-in, file handling, the checking engines, and what the service publishes about itself. Nothing critical or high-severity was found. Two low-severity issues were identified and fixed the same day, both about how an uploaded file's name is stored internally; neither exposed any document you have uploaded, and no report or stored data was affected. The full write-up, including what was checked and found sound, is in the project's public security log. The data-retention policy itself was reviewed end-to-end the same day and brought fully current (policy v1.2): it now states plainly what the usage log records and that entries are deleted after 365 days.",
    linkText: "Read the data-retention and security notes",
    linkTo: "/data-retention",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 5, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "status-format-split-and-clearer-labels-2026-08-05",
    badge: "Improved",
    text: "The status page now shows what kinds of file were audited — PDF, Word, PowerPoint and Excel — alongside the scores. It also clears up a genuinely confusing label: two different columns were both called “other” and meant opposite things. One now reads “Unrecognized extension”, meaning the document was checked normally and we simply could not tell its file type from its web address, and the other reads “Other file types”, meaning the upload was refused and could not be checked at all.",
    linkText: "View the status page",
    linkTo: "/status?html",
    /** REQUIRED: /status is a server route, not a Vue page. See the v1.39.1 note below. */
    linkExternal: true,
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 5, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "status-refused-uploads-2026-08-04",
    badge: "New",
    text: "The status page now also shows what people bring that the tool cannot check at all — the older Office formats and CSV data files — over the last 30 days and since the tool launched. It sits below the grade distribution and is counted entirely separately from it, because a file that was refused was never assessed: it has no score, so including it among the graded documents would misrepresent both numbers. One thing to read carefully: these are attempts rather than documents, so the same file uploaded twice counts twice.",
    linkText: "View the status page",
    linkTo: "/status?html",
    /** REQUIRED: /status is a server route, not a Vue page. See the v1.39.1 note below. */
    linkExternal: true,
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 4, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "legacy-office-and-csv-guidance-2026-08-04",
    badge: "Improved",
    text: "Uploading an older Office file — .doc, .xls, .ppt or .rtf — now gets you a real answer instead of a list of what the tool accepts. These formats cannot store the headings, alt text and table information an accessibility check looks for, which is why Word and Excel disable their own accessibility checkers for them too. The tool now names the format, gives the Save As steps, and is clear that converting brings your content across but not accessibility structure — so expect to still add headings and alt text afterwards. It also recognizes an old file that has simply been renamed with a newer extension. Spreadsheet exports (.csv and .tsv) get a different explanation on purpose: there is nothing in a CSV for this tool to check, and that is not a fault. For raw data CSV is often the right format, and its accessibility depends on the page that links it rather than on the file itself.",
    linkText: "",
    linkTo: "",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 4, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "status-grade-distribution-2026-08-04",
    badge: "New",
    text: "The status page now shows how documents checked here have actually scored — how many earned an A, a B, and so on — over the last 24 hours, the last 30 days, and since the tool launched. It is a quick way to see how common serious accessibility problems really are. One caveat matters enough that it is printed on the page itself: these are files visitors chose to upload, often because they already suspected something was wrong, and the same file may be uploaded more than once. So the figures describe what people bring here to check, not the overall state of any organization’s documents.",
    linkText: "View the status page",
    linkTo: "/status?html",
    /** REQUIRED: /status is a server route, not a Vue page. See the v1.39.1 note below. */
    linkExternal: true,
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 4, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "leave-warning-and-status-backlink-2026-08-04",
    badge: "Improved",
    text: "If you click a link while a document is still being checked, the page now asks first — leaving cancels the check and discards the report. You will only see this while a check is actually running; ordinary clicks are unaffected. The status page also has a link back to the audit tool now, so it is no longer a dead end, and the “Status” link in the header opens in this tab instead of a new one.",
    linkText: "",
    linkTo: "",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 4, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "status-page-readable-2026-08-03",
    badge: "Improved",
    text: "The status page at /status is now readable without any browser add-on. It shows the same information as before, laid out as a colour-coded, collapsible outline instead of a single block of unformatted text, with a link to view the raw data if you prefer it. Nothing about what is published has changed — still only totals and yes/no answers, with no file names, no email addresses, and nothing identifying anyone who has used the service.",
    linkText: "View the status page",
    linkTo: "/status?html",
    /** REQUIRED: /status is a server route, not a Vue page. See the v1.39.1 note below. */
    linkExternal: true,
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 3, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "navbar-status-and-reset-2026-08-03",
    badge: "Improved",
    text: "The top of the page is simpler. There is now a “Status” link showing whether the audit service and each of its checking engines are running, and the “Analyze” link has been removed — click the site title on the left to clear your results and start a new file. The title works with the keyboard as well as the mouse, which the old version did not.",
    linkText: "",
    linkTo: "",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 3, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    /**
     * id bumped from `public-status-page-2026-08-03` in v1.39.1. The original
     * shipped with a broken link (see linkExternal below), so everyone who
     * clicked it got a 404 — and anyone who dismissed the banner would never
     * have seen a corrected version. Changing the id re-shows it once.
     */
    id: "public-status-page-2026-08-03-r2",
    badge: "New",
    text: "There is now a status page at /status showing whether the audit service is running, whether each of its checking engines is working, and how many documents have been audited — broken down by PDF, Word, PowerPoint and Excel. It is plain data, updated continuously, for anyone who wants to confirm the tool is healthy or see how much it is being used. It contains only totals: no file names, no email addresses, and nothing identifying anyone who has used the service. Past updates like this one are now kept under “What’s New” in the header and footer, so dismissing this notice no longer loses them.",
    linkText: "View the status page",
    linkTo: "/status?html",
    /**
     * REQUIRED here. /status is a Nitro SERVER route, not a Vue page, so the
     * Vue router has no match for it: a normal NuxtLink navigates client-side
     * and renders the SPA "Page not found: /status" screen without ever
     * reaching the server. `external` forces a real document navigation.
     * Set this for any linkTo that is a server route.
     */
    linkExternal: true,
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "August 3, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "pdfua-not-a-wcag-pass-2026-07-26",
    badge: "Improved",
    text: "Both PDF/UA panels now sit below the issues you need to fix, and neither can be mistaken for a clean bill of health. The \u201cPDF/UA-1 signals\u201d card used to appear at the very top of your report, right under the score \u2014 above the critical issues. PDF/UA-1 essentials are structural markers (is the file tagged? are the fonts embedded?); they cannot tell whether your alt text is meaningful or your reading order makes sense, which is what the accessibility grade measures. So a document can meet every PDF/UA-1 essential and still have critical issues that block publishing \u2014 and when that is the case, the card now says so directly.",
    linkText: "",
    linkTo: "",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "July 26, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "report-order-criticals-first-2026-07-26",
    badge: "Improved",
    text: 'Your report now leads with what actually blocks publishing. The critical issues and their fix steps appear directly under your score, above the technical PDF/UA-1 (veraPDF) panel — which is informational. That panel can show a green "Pass" on a document that still has critical WCAG issues to fix, because the two checks answer different questions: PDF/UA-1 verifies the file\'s formal tagging, while your WCAG grade is what decides whether people can actually use the document. When both are true, the panel now says so in plain language instead of just showing a green tick.',
    linkText: "",
    linkTo: "",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "July 26, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "audit-integrity-2026-07-26",
    badge: "Improved",
    text: "Accuracy and integrity fixes to how documents are judged — every one of them catching a real barrier the audit used to miss. A PDF carrying an EMPTY set of accessibility tags (the structure was there, but nothing was inside it) was being reported as properly tagged with no detected failures; it is now treated exactly like an untagged file, because that is what it means for someone using a screen reader. Images that were never tagged at all — invisible to a screen reader, and worse than an image with a missing description — now count against the score instead of being skipped. Re-auditing a document may therefore give a different score than before: reports you saved earlier keep the score they were given at the time, and the fresh audit is the correct one.",
    linkText: "",
    linkTo: "",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "July 26, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "pdfua-verdict-2026-07-22",
    badge: "New",
    text: "Audit results now include a PDF/UA-1 (ISO 14289-1) machine-check verdict from veraPDF — a Pass/Fail badge with the exact technical checkpoints that failed, shown alongside your accessibility grade. It's the automatable equivalent of the checks in Adobe/PAC-style PDF/UA tools, covering the machine-verifiable requirements (full conformance still needs a human to confirm alt-text quality and reading order).",
    linkText: "",
    linkTo: "",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "July 22, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "phantom-tags-accuracy-2026-07-22",
    badge: "Improved",
    text: "PDF scoring accuracy fix: some PDFs — often those exported from design tools like Adobe InDesign — carry leftover 'phantom' tags (images, lists, and tables) that aren't part of the document a screen reader actually reads. The audit was counting those as real content — flagging images as missing descriptions, lists as 'incomplete structure', and tables as broken — and unfairly lowering the score. The tool now ignores tags that aren't connected to the live document structure, and recognizes when a page's images are deliberately marked as decorative (and need no description), so well-built documents are no longer penalized.",
    linkText: "",
    linkTo: "",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "July 22, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
  {
    id: "accuracy-fixes-2026-07-19",
    badge: "Improved",
    text: "Major accuracy upgrade across all four formats: the audit now catches PDFs whose security settings block screen readers outright (they used to pass), checks real background colors before judging contrast (no more false alarms on white-on-dark headers or designed slide layouts), reads Excel link text from the linked cells, recognizes custom Word heading styles and per-run slide languages, audits Word headers/footers/footnotes and Excel chart sheets, and reports 'needs manual review' instead of guessing whenever the evidence can't be resolved from the file.",
    linkText: "",
    linkTo: "",
    /** Shown under the text so visitors can see the tool is actively maintained. */
    date: "July 19, 2026",
    /** Only shown while the app is on this WCAG version (null = always). */
    requiresWcagVersion: null as "2.1" | "2.2" | null,
  },
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
// PUBLIST (CLI publication-list audit)
// ---------------------------------------------------------------------------
// Settings for `a11y-audit publist` (apps/cli/src/commands/publist.ts and
// apps/cli/src/lib/graphql.ts), which fetches ICJIA's publication list over
// GraphQL, audits each file, and copies the generated HTML report into the
// web app's public/ directory so it's servable at /publist.
//
// SAFE TO CHANGE: Yes for all three values — none are scoring- or security-
// sensitive. Update GRAPHQL_ENDPOINT if the agency API moves; update
// WEB_PUBLIC_DIR if apps/cli or apps/web ever change location relative to
// each other.
// ---------------------------------------------------------------------------

export const PUBLIST = {
  /** ICJIA publications GraphQL API endpoint, queried by fetchPublications(). */
  GRAPHQL_ENDPOINT: "https://agency.icjia-api.cloud/graphql",

  /**
   * Publications fetched per GraphQL page. fetchPublications() pages through
   * the full result set, stopping once a page returns fewer than this many
   * rows.
   */
  PAGE_SIZE: 500,

  /**
   * Path to apps/web/public, relative to apps/cli/ (where publist's output
   * CSV/HTML files are written). Used to copy the generated publist.html
   * report so it's servable at /publist. Non-fatal if the path doesn't
   * resolve (e.g. a checkout without apps/web present).
   */
  WEB_PUBLIC_DIR: "../web/public",
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
  MIME_TYPE: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  /**
   * Max UNCOMPRESSED bytes for any single part read out of the .docx ZIP
   * (document.xml, styles.xml, etc.). The 25 MB upload cap only limits the
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
  MIME_TYPE: "application/vnd.openxmlformats-officedocument.presentationml.presentation",

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

  /** Max any-depth count of paragraphs (<a:p>) + text runs (<a:r>) across all
   *  slides; over the cap → rejected. A single shape can legally hold an
   *  unbounded txBody, and those text elements — not the shape containers —
   *  drive the per-run contrast walk and per-paragraph list walk, so
   *  MAX_SHAPES alone does not bound them. This is the MAX_PARAGRAPHS analogue
   *  for PowerPoint. SAFE TO CHANGE. */
  MAX_TEXT_ELEMENTS: 200_000,

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
  MIME_TYPE: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  /** Max UNCOMPRESSED bytes per ZIP part (zip-bomb guard) — same rationale as
   *  DOCX.MAX_UNCOMPRESSED_BYTES. SAFE TO CHANGE. */
  MAX_UNCOMPRESSED_BYTES: 30 * 1024 * 1024,

  /** Max worksheets analyzed; over the cap → rejected. SAFE TO CHANGE. */
  MAX_SHEETS: 200,

  /** Max total used-range cells (worksheet XML is the volume driver — this is
   *  the MAX_PARAGRAPHS analogue). Checked against the ACTUAL parsed `<c>`
   *  cells (any depth, accumulated across sheets) — never the self-reported
   *  `<dimension ref>`, which is attacker-controlled (see countCellsAnyDepth's
   *  doc comment in xlsxService.ts). Over the cap → rejected. SAFE TO CHANGE. */
  MAX_CELLS: 1_000_000,

  /** Max total drawing objects (pictures/charts) across all sheets; over the
   *  cap → rejected. Otherwise unbounded — limited only by
   *  MAX_UNCOMPRESSED_BYTES × MAX_SHEETS. Mirrors PPTX.MAX_SHAPES's DoS
   *  rationale. SAFE TO CHANGE. */
  MAX_DRAWING_OBJECTS: 100_000,

  /** Max total hyperlinks across all sheets; over the cap → rejected. Same
   *  unbounded-growth rationale as MAX_DRAWING_OBJECTS. SAFE TO CHANGE. */
  MAX_HYPERLINKS: 100_000,

  /** Max total defined tables across all sheets; over the cap → rejected.
   *  Worse than plain array growth: each <.../table> rel triggers a table-PART
   *  read + parse (a fan-out READ amplifier), bounded only by the 30 MB
   *  rels-part cap (~300k rels/sheet) × MAX_SHEETS. Pre-counted before any
   *  table part is read (see collectSheetContent). 10k far exceeds any
   *  legitimate workbook while bounding the fan-out. SAFE TO CHANGE. */
  MAX_TABLES: 10_000,

  /** Max total distinct drawing PARTS (relationships) across all sheets;
   *  over the cap → rejected. A legitimate sheet has ~1 drawing rel (Excel
   *  packs every drawing on a sheet into one drawingN.xml). Same fan-out
   *  READ-amplifier class as MAX_TABLES: each `/drawing` rel triggers a
   *  drawing-PART read + parse BEFORE MAX_DRAWING_OBJECTS can even be
   *  checked against that part's content, bounded only by the 30 MB
   *  rels-part cap (~300k rels/sheet) × MAX_SHEETS. Pre-counted before any
   *  drawing part is read (see collectSheetContent) — mirrors MAX_TABLES'S
   *  pre-count-before-read pattern exactly.
   *  RB3-3 [pre-merge re-audit]: tightened from 10,000 -> 1,000. The review
   *  benchmarked ~729ms/rel for a large, object-sparse drawing part, so only
   *  ~28 such rels reach the 20s ANALYSIS_TIMEOUT_MS — the 10,000 cap never
   *  engaged for that shape; it was a count-only bound, not a cost bound.
   *  1,000 still comfortably exceeds any legitimate workbook (~1 rel/sheet
   *  × MAX_SHEETS=200) while shrinking the window; MAX_AUX_PART_BYTES below
   *  closes the rest of the gap on the SIZE dimension. SAFE TO CHANGE. */
  MAX_DRAWING_RELS: 1_000,

  /** Cumulative UNCOMPRESSED bytes actually read across every drawing +
   *  defined-table PART in a workbook (all sheets combined) — tracked in
   *  collectSheetContent's `counts.auxPartBytes` accumulator, checked right
   *  after each part is read, over the cap → rejected.
   *  RB3-3 [pre-merge re-audit]: closes a gap MAX_DRAWING_RELS/MAX_TABLES
   *  leave open even after being count-tightened: a HANDFUL of near-max-size
   *  (MAX_UNCOMPRESSED_BYTES, 30 MB), object-/row-sparse parts each pass the
   *  per-part cap individually and never approach the rel-COUNT cap, yet
   *  parsing each ~30 MB part still costs real wall-clock time (benchmarked
   *  ~729ms for one such drawing part) — few enough parts that the count cap
   *  doesn't engage before the 20s ANALYSIS_TIMEOUT_MS eventually would. This
   *  budget fails fast on the SIZE dimension instead, independent of count:
   *  ~1.6x one MAX_UNCOMPRESSED_BYTES part — room for one legitimate
   *  full-sized part plus incidental small ones, but not a second full-sized
   *  one. A legitimate workbook's drawing/table XML is KB-scale — nowhere
   *  close. SAFE TO CHANGE. */
  MAX_AUX_PART_BYTES: 48 * 1024 * 1024,

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
// OOXML (DOCX/PPTX/XLSX) SHARED ZIP-PACKAGE LIMITS
// ---------------------------------------------------------------------------
// Aggregate limits enforced once per package, right after JSZip.loadAsync and
// before any part is read — shared by the docx/pptx/xlsx extractors via
// assertZipWithinLimits() in services/ooxml.ts. The per-format
// MAX_UNCOMPRESSED_BYTES constants above bound any ONE part; they say nothing
// about the SUM across every part a package can legally contain (styles,
// dozens of slides/sheets, media, drawings, tables, rels, theme, core/app
// props). A zip built from many separately-legal-sized parts can still cost
// gigabytes of cumulative decompression across a single analysis, and a zip
// with an enormous number of tiny entries costs real CPU/memory just parsing
// JSZip's central directory, before any part is ever read. These two checks
// close both gaps and apply to every OOXML format uniformly.
//
// SAFE TO CHANGE: Yes for both values — pick values comfortably above any
// real-world Word/PowerPoint/Excel document; see each constant's note.
// ---------------------------------------------------------------------------

export const OOXML = {
  /**
   * Maximum number of entries (files + directories) in the ZIP central
   * directory. Real documents rarely exceed a few hundred parts even with
   * many embedded images; 10,000 leaves generous headroom while bounding a
   * "many tiny files" package designed to cost CPU/memory in JSZip's own
   * central-directory parse before any content is even read.
   *
   * SAFE TO CHANGE: Yes.
   */
  MAX_ZIP_ENTRIES: 10_000,

  /**
   * Maximum SUM of every entry's declared uncompressed size (bytes) across
   * the whole package. Checked once, right after JSZip.loadAsync, against
   * the ZIP central directory's declared sizes (cheap — no decompression
   * happens yet). Each per-format MAX_UNCOMPRESSED_BYTES (30 MB) already
   * bounds any single part; this bounds the total across ALL parts, so a
   * package built from many separately-legal-sized parts can't add up to
   * an unbounded decompression bill. 512 MB is ~17x one full-sized part —
   * comfortably above any legitimate Word/PowerPoint/Excel file (whose real
   * total is normally single-digit MB to tens of MB even with heavy
   * embedded media) while still bounding the aggregate.
   *
   * Declared sizes are attacker-controlled metadata (same caveat as
   * readCapped's fast-reject check in ooxml.ts) — this is a cheap
   * fast-fail, not the only guard; readCapped's streaming per-part cap
   * remains the authoritative defense against a forged declared size.
   *
   * SAFE TO CHANGE: Yes.
   */
  MAX_TOTAL_UNCOMPRESSED_BYTES: 512 * 1024 * 1024,
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
   *
   * 2026-08-13: raised 15 -> 25. The first complete fleet audit since
   * 2026-07-02 graded 1,966 PDFs and hit this cap on six of them — legitimate
   * published agency documents (a 17.3 MB budget packet, a 20.9 MB HR
   * newsletter, two ILFVCC protocol documents) that the 15 MB cap refused with
   * HTTP 413. The measured boundary was exact: the largest successfully graded
   * file was 14.3 MB, the smallest rejection 17.3 MB.
   *
   * Why 25 and not 64: two of the six are 49.4 MB and 59.7 MB drone reports.
   * Admitting those means 2 x ~60 MB buffers under MAX_CONCURRENT_ANALYSES,
   * which is past the 50 MB this note already warns about on a 4 GB droplet.
   * 25 MB clears four of the six and keeps worst-case buffer memory at
   * 2 x 25 = 50 MB. The two outsized reports stay rejected on purpose — a
   * 60 MB PDF is its own accessibility problem, and raising a shared server
   * limit is the wrong lever for it.
   */
  MAX_FILE_SIZE_MB: 25,

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
// RATE LIMITS
// ---------------------------------------------------------------------------
// Per-endpoint rate limiting via express-rate-limit. Each limiter has a
// `max` (requests allowed) and `windowMs` (time window in milliseconds).
//
// Limiters key by IP (held in memory only, never stored — see
// rateLimiter.ts); the privileged tier shares one bucket.
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
// It is a SERVICE credential for the fleet integration — the tool has no
// user accounts or sign-in (v1.68.0). It grants ONLY those two things and
// never bypasses the private/reserved-IP SSRF block, the size caps, or the
// concurrency semaphores — a leaked token cannot reach internal services.
//
// Empty/unset → feature off → every request gets the strict tier (fail-safe).
// The match is a constant-time compare in rateLimiter.ts (isPrivilegedRequest),
// which reads process.env directly at request time.
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
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

  /**
   * GET /api/status — the public service-status document, exempt from
   * `global` (see above) and capped here per IP instead.
   *
   * Why it needs its own bucket: /status is served to the browser via the
   * Nitro tier, whose loopback proxy shares the API's single 127.0.0.1
   * rate bucket. Left under `global`, ordinary site traffic could exhaust
   * that bucket and make the status page — the thing you consult when the
   * site looks unwell — fail exactly when it matters.
   *
   * Sizing: responses are served from cache almost always (see STATUS
   * below), so the cost per request is a JSON serialization. 120/min/IP
   * leaves enormous headroom over any uptime monitor's poll rate while
   * still stopping a flood.
   *
   * SAFE TO CHANGE: Yes.
   */
  status: { max: 120, windowMs: 60 * 1000 }, // 120 / min / IP
} as const;

// ---------------------------------------------------------------------------
// SHARED REPORTS (Phase 2)
// ---------------------------------------------------------------------------

export const SHARED_REPORTS = {
  /**
   * Number of days before a shared report link expires.
   * After this, GET /api/reports/:id returns 410 ("link has expired") while
   * the row still exists, and 404 once the cleanup sweep has physically
   * deleted it (see PURGE_GRACE_DAYS below — v1.51.0; before that, expired
   * rows were never deleted and the table grew without bound).
   *
   * SAFE TO CHANGE: Yes. Longer = more useful for recipients but more
   * database storage. 365 days is sized for the auditor / fleet-inventory
   * use case: ICJIA's fleet audit lists every PDF across all sites, runs
   * on a multi-month cadence, and the resulting CSV / HTML report needs
   * to stay valid for at least a year so reviewers can click through to
   * the full audit details for any flagged file.
   */
  EXPIRY_DAYS: 365,

  /**
   * Days AFTER expiry before a shared report row is physically deleted by
   * the cleanup sweep (total lifetime = EXPIRY_DAYS + PURGE_GRACE_DAYS,
   * ~395 days by default).
   *
   * The grace window exists for the read gate's UX: while the row exists,
   * an expired link answers 410 "This report link has expired" — telling
   * the visitor their link was once real. Purging at the moment of expiry
   * would collapse every expired link straight to a bare 404. Thirty days
   * covers the realistic window in which someone clicks a just-expired
   * link; after that the distinction stops earning its storage.
   *
   * Rows can carry up to MAX_PAYLOAD_BYTES of report_json each (including
   * document-derived strings — see data-retention § 8a), so this purge is
   * both the growth bound and a privacy property; the public policy states
   * the two-stage lifecycle in § 7.
   *
   * SAFE TO CHANGE: Yes. 0 = delete at expiry (every expired link becomes
   * 404 immediately). Coordinate with the data-retention page § 7 row.
   */
  PURGE_GRACE_DAYS: 30,

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
   * Rows store only metadata (hash, score, grade,
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
// PUBLIC STATUS ENDPOINT
// ---------------------------------------------------------------------------
// Backing config for the public status document at https://audit.icjia.app/status
// (Nitro route -> GET /api/status on Express). Design:
// docs/superpowers/specs/2026-08-03-public-status-endpoint-design.md
//
// The endpoint is PUBLIC and unauthenticated. Everything it reports is either
// an aggregate COUNT(*) or a boolean about a local engine — never a filename,
// email, IP address, or filesystem path. See statusPrivacy.test.ts, which
// fails the build if identifying data reaches the payload.

export const STATUS = {
  /**
   * How long the database aggregates (document counts, last-audit time,
   * remediation job counts) stay cached, in ms.
   *
   * These are pure SQL — a COUNT(*) over a few thousand rows is sub-
   * millisecond — so this is NOT a cost control. It exists only to coalesce
   * a burst of simultaneous requests into one set of queries.
   *
   * Lowered from 60s in v1.39.3. At a minute, auditing a document and then
   * checking /status showed the count unchanged, which reads as the page
   * being broken rather than merely cached. The freshness is worth far more
   * than the handful of scans it saves, and a flood is already bounded by
   * this endpoint's own 120/min per-IP limiter (RATE_LIMITS.status).
   *
   * Kept SEPARATE from ENGINE_PROBE_TTL_MS below, which is the one that
   * genuinely matters: those probes spawn processes including a veraPDF JVM.
   * Do not conflate the two.
   *
   * SAFE TO CHANGE: Yes.
   */
  AGGREGATE_TTL_MS: 5 * 1000, // 5 seconds

  /**
   * How long engine probe results (qpdf / veraPDF / Chromium) stay cached,
   * in ms.
   *
   * DO NOT lower this to match an uptime monitor's poll interval. Each cache
   * miss spawns processes — including a veraPDF JVM, which costs seconds of
   * CPU and hundreds of MB of transient RSS. /status is the monitor target,
   * and UptimeRobot's default poll is 5 minutes: with a 1-minute TTL, every
   * single check would miss the cache and start a JVM, roughly 288 times a
   * day, purely to answer monitoring traffic.
   *
   * At 10 minutes, probe cost is bounded by the TTL rather than by how often
   * anyone asks — polling twice as fast costs nothing extra. The payload
   * reports engines.checked_at so a reader can see how stale a passing result
   * is.
   *
   * SAFE TO CHANGE: Yes, but raise rather than lower unless you have measured
   * the JVM cost on the target droplet.
   */
  ENGINE_PROBE_TTL_MS: 10 * 60 * 1000, // 10 minutes

  /**
   * Per-probe timeout in ms. A probe that exceeds it is reported as
   * { ok: false, reason: "timeout" } and never delays the response —
   * reporting a broken engine is the feature, not an error condition.
   *
   * veraPDF is a JVM: cold start on a small droplet can exceed 5s, so this
   * is deliberately more generous than a typical subprocess timeout.
   *
   * SAFE TO CHANGE: Yes.
   */
  PROBE_TIMEOUT_MS: 10 * 1000,

  /**
   * audit_log.event_type values that count as "a document was audited".
   *
   * DO NOT add 'audit-url-page' here. That event is a *web page* audit and
   * stores a URL in the filename column (audit-url-page.ts), so counting it
   * would both inflate the figure and corrupt the by-format split. Auth
   * events (login / logout / otp_request) are likewise excluded.
   *
   * SAFE TO CHANGE: Only when a genuinely new document-audit path is added.
   */
  DOCUMENT_EVENT_TYPES: ["analyze", "analyze-url", "audit-url", "bulk-from-inventory"],

  /**
   * audit_log.event_type values for web-page audits.
   *
   * Deliberately NOT surfaced in the payload: the document-versus-page
   * distinction is inscrutable to the non-technical reader this endpoint is
   * written for, and raises more questions than it answers. Defined here so
   * the counting helper stays symmetric and exposing it later is a one-line
   * change. statusPrivacy.test.ts asserts the key is currently absent.
   */
  PAGE_EVENT_TYPES: ["audit-url-page"],

  /**
   * audit_log.event_type values for an upload that was REFUSED — a legacy
   * Office binary, a CSV, or anything else the tool cannot audit.
   *
   * DO NOT add this to DOCUMENT_EVENT_TYPES. A refusal is not an audit: it has
   * no score and no grade, so counting it would both inflate
   * documents_audited and dump every refusal into the grade distribution's
   * 'ungraded' bucket, making that number meaningless. The separation is what
   * lets both figures stay honest.
   *
   * Rejection rows are written with content_hash NULL, deliberately. The
   * remediation audit-gate (hasRecentAudit in services/auditLog.ts) matches on
   * content_hash with NO event_type filter, so a hash on a refusal row
   * would make "this content was refused" satisfy a check that means "this
   * content was audited". NULL can never match, which closes that by
   * construction rather than by remembering to filter.
   *
   * SAFE TO CHANGE: Only alongside the counting helpers in services/status.ts.
   */
  REJECTION_EVENT_TYPES: ["rejected-upload"],

  /**
   * Hours after which the last successful backup is reported as "stale" on
   * /status. The backup job runs nightly, so a healthy reading is always
   * under 24; 30 gives a missed run several hours to be unambiguous (and
   * absorbs DST shifts) before the page says "older than expected".
   *
   * A stale backup joins the /status `degraded` list (v1.52.0), so the
   * uptime monitor's existing keyword alert fires when the nightly job
   * dies. A server where backups have NEVER run reports "unavailable"
   * instead — deliberately not "stale" and deliberately outside the
   * degraded list, so a fresh deployment cannot page anyone before its
   * first scheduled run has happened.
   *
   * SAFE TO CHANGE: Yes. Match it to the backup cadence: roughly
   * (interval between runs) + a few hours of slack.
   */
  BACKUP_STALE_AFTER_HOURS: 30,

  /**
   * Percentage of free disk space below which /status reports the service as
   * degraded.
   *
   * WHY THIS EXISTS: a full disk breaks uploads AND the nightly backup at the
   * same time, silently, while every other check on /status stays green — the
   * audit path holds files in memory and the backup writes elsewhere, so
   * neither reports a disk problem as its own failure. Without this probe the
   * first symptom is a failed restore months later.
   *
   * A DEGRADED reading is deliberately not a 503: the service can still audit
   * with a nearly-full disk, and paging someone about an outage that has not
   * happened yet is how alerts get ignored. It joins `degraded` exactly like a
   * stale backup does, which is what the existing UptimeRobot keyword alert
   * already watches.
   *
   * SAFE TO CHANGE: Yes. 10% of a 50 GB volume is 5 GB — comfortably more than
   * a snapshot plus a day of logs, which is the margin this needs to buy.
   * Raise it on a small volume, where 10% may be smaller than one backup.
   */
  DISK_LOW_FREE_PCT: 10,
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
   * Shorter wall-clock timeout for the veraPDF check on the synchronous AUDIT
   * path (runVeraPdfOnBuffer), so an interactive audit isn't stalled by a
   * pathological tagged PDF. The background remediation job keeps the longer
   * VERAPDF_TIMEOUT_MS. On timeout the verdict degrades to "could not validate".
   */
  VERAPDF_AUDIT_TIMEOUT_MS: 30_000,

  /**
   * Maximum veraPDF JVMs running at once across the whole process.
   *
   * WHY THIS EXISTS: routes/analyze.ts runs veraPDF via `Promise.all`
   * alongside analyzeDocument, and only analyzeDocument takes the analysis
   * semaphore — so before this cap existed, every in-flight upload spawned
   * its own JVM with no bound. ANALYSIS.MAX_CONCURRENT_ANALYSES is 2 because
   * a 4GB droplet can afford two ~50MB analyses; a JVM is several times that,
   * and the analyze rate limiter (500/hour/IP) bounds RATE, not CONCURRENCY.
   *
   * Defaults to the analysis cap so every ADMITTED analysis can still get a
   * verdict (no user-visible "panel appeared for them but not me"), while
   * requests queued behind the analysis semaphore can no longer spawn JVMs.
   *
   * SAFE TO CHANGE: Yes — lower to 1 to be more frugal on a small droplet;
   * raise only alongside MAX_CONCURRENT_ANALYSES and the RAM budget.
   */
  VERAPDF_MAX_CONCURRENT: 2,

  /**
   * How long a veraPDF check waits for a concurrency slot before giving up.
   * On expiry the verdict degrades to `available: false` (the PDF/UA panel is
   * simply hidden) rather than failing the audit — the check is supplementary,
   * so it must never take the whole upload down with it.
   *
   * SAFE TO CHANGE: Yes.
   */
  VERAPDF_QUEUE_TIMEOUT_MS: 60_000,

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
   * Maximum remediation jobs a single caller can start in a rolling
   * 24-hour window. Enforced at POST /api/remediate after the
   * audit-gate check (v1.20.1+). Since v1.68.0 the count lives in
   * process memory keyed by the caller's IP (used transiently, never
   * stored anywhere), so it resets on API restart — acceptable for an
   * abuse brake. Prevents the "thousands of automated remediations"
   * abuse case while leaving plenty of headroom for a legitimate
   * agency clearing a backlog of ~50 PDFs.
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
  MAX_JOBS_PER_DAY_PER_CALLER: 100,

  /**
   * The "you must audit this PDF before remediating it" window, in
   * milliseconds. Enforced at POST /api/remediate (v1.20.1+) by
   * looking for a recent audit_log row matching the same content_hash
   * regardless of caller (v1.68.0: the gate is content-bound; no caller
   * identity exists). Any audit path counts: browser upload via
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
