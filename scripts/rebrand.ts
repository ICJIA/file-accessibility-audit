#!/usr/bin/env npx tsx
/**
 * scripts/rebrand.ts — Regenerate all static branding files from audit.config.ts
 *
 * Usage:
 *   npx tsx scripts/rebrand.ts
 *   pnpm rebrand
 *
 * What it regenerates:
 *   1. apps/web/public/site.webmanifest
 *   2. apps/web/public/llms.txt
 *   3. apps/web/public/llms-full.txt
 *   4. og-image.svg (at project root)
 *   5. apps/web/public/og-image.png (converted from SVG via sharp)
 *
 * All values are pulled from BRANDING and DEPLOY in audit.config.ts.
 */

import { writeFileSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'
import { BRANDING, DEPLOY } from '../audit.config.js'

const ROOT = resolve(import.meta.dirname, '..')
const PUBLIC = resolve(ROOT, 'apps/web/public')

const { APP_NAME, APP_SHORT_NAME, ORG_NAME, ORG_URL, FAQS_URL, GITHUB_URL } = BRANDING
const SITE_URL = DEPLOY.PRODUCTION_URL

// Extract a short org abbreviation from APP_NAME (text before "File" or first word)
const orgAbbrev = APP_NAME.includes('File')
  ? APP_NAME.split('File')[0].trim()
  : APP_NAME.split(' ')[0]

// ── site.webmanifest ──────────────────────────────────────────────────────

function buildManifest(): string {
  return JSON.stringify({
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: 'Automated PDF accessibility scoring across 9 WCAG 2.1 and ADA Title II categories',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/favicon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }, null, 2) + '\n'
}

// ── llms.txt ──────────────────────────────────────────────────────────────

function buildLlmsTxt(): string {
  const lines = [
    `# ${APP_NAME}`,
    '',
    `> Automated PDF accessibility scoring tool built by ${ORG_NAME}.`,
    '',
    'This web application analyzes PDF documents for accessibility compliance and produces a detailed audit report scored against WCAG 2.1 Level AA and ADA Title II requirements.',
    '',
    '## What it does',
    '',
    '- Accepts a PDF file upload (up to 100 MB)',
    '- Analyzes the document across 9 accessibility categories',
    '- Returns an overall score (0-100), letter grade (A-F), and per-category findings',
    '- Provides remediation guidance with WCAG success criteria references',
    '- Exports reports in Word (.docx), HTML, Markdown, and JSON formats',
    '- JSON export includes machine-readable WCAG mappings, prioritized remediation plans, and LLM-ready context',
    '',
    '## Scoring categories (weighted)',
    '',
    '1. Text Extractability (20%) - WCAG 1.3.1, 1.4.5',
    '2. Document Title & Language (15%) - WCAG 2.4.2, 3.1.1',
    '3. Heading Structure (15%) - WCAG 1.3.1, 2.4.6',
    '4. Alt Text on Images (15%) - WCAG 1.1.1',
    '5. Bookmarks / Navigation (10%) - WCAG 2.4.5',
    '6. Table Markup (10%) - WCAG 1.3.1',
    '7. Link & URL Quality (5%) - WCAG 2.4.4',
    '8. Form Accessibility (5%) - WCAG 1.3.1, 4.1.2',
    '9. Reading Order (5%) - WCAG 1.3.2',
    '',
    '## Grade scale',
    '',
    '- A: 90-100 (Excellent)',
    '- B: 80-89 (Good)',
    '- C: 70-79 (Needs Improvement)',
    '- D: 60-69 (Poor)',
    '- F: 0-59 (Failing)',
    '',
    '## Standards alignment',
    '',
    '- WCAG 2.1 Level AA',
    '- ADA Title II (effective April 2026)',
    '- Section 508',
    '- PDF/UA (ISO 14289-1)',
    '',
    '## API',
    '',
    'The application exposes a REST API:',
    '',
    '- POST /api/analyze - Upload a PDF for analysis (multipart/form-data, field: "file")',
    '- POST /api/reports - Create a shareable report link (JSON body: { report })',
    '- GET /api/reports/:id - Retrieve a shared report by ID',
    '- GET /api/health - Health check endpoint',
    '',
    '## Links',
    '',
    `- Website: ${SITE_URL}`,
  ]

  if (GITHUB_URL) lines.push(`- Source: ${GITHUB_URL}`)
  if (FAQS_URL) lines.push(`- FAQs: ${FAQS_URL}`)
  lines.push(`- Organization: ${ORG_URL}`)

  lines.push(
    '',
    '## Optional: llms-full.txt',
    '',
    'For complete documentation including the scoring rubric, category explanations, remediation guidance, and JSON export schema, see /llms-full.txt',
    '',
  )

  return lines.join('\n')
}

// ── llms-full.txt ─────────────────────────────────────────────────────────

function buildLlmsFullTxt(): string {
  return `# ${APP_NAME} — Full Documentation

> Comprehensive reference for LLMs, AI agents, and automated tools.

## Overview

The ${APP_NAME} is a web application that analyzes PDF documents for accessibility compliance. It extracts structural data from PDFs using two complementary parsers (QPDF for tag structure, PDF.js for content extraction), scores the document across 9 weighted categories aligned to WCAG 2.1 Level AA and ADA Title II, and produces a detailed report with findings, remediation guidance, and standards references.

Website: ${SITE_URL}${GITHUB_URL ? `\nSource: ${GITHUB_URL}` : ''}
Organization: ${ORG_NAME} (${ORG_URL})

---

## Category Details

### 1. Text Extractability (20% weight)
WCAG: 1.3.1 Info and Relationships (Level A), 1.4.5 Images of Text (Level AA)
Principle: Perceivable

Checks whether the PDF contains real selectable text and a tag structure (StructTreeRoot). This is the most fundamental requirement — if a PDF is a scanned image with no real text, screen readers have nothing to read.

Scoring:
- 100: Has extractable text AND tag structure
- 50: Has extractable text but NO tags
- 25: No text but has tag structure (partially tagged scan)
- 0: No text and no tags (pure scanned image)

Remediation: Run OCR (Adobe Acrobat: Scan & OCR > Recognize Text), then add tags (Accessibility > Add Tags to Document).

### 2. Document Title & Language (15% weight)
WCAG: 2.4.2 Page Titled (Level A), 3.1.1 Language of Page (Level A)
Principle: Operable / Understandable

Checks for a document title in metadata and a language declaration. The title is the first thing a screen reader announces. The language tag controls pronunciation rules.

Scoring:
- 50 points for title present
- 50 points for language declared

Remediation: Set title in File > Properties > Description. Set language in File > Properties > Advanced > Language.

### 3. Heading Structure (15% weight)
WCAG: 1.3.1 Info and Relationships (Level A), 2.4.6 Headings and Labels (Level AA)
Principle: Perceivable / Operable

Checks for H1-H6 heading tags and validates the hierarchy (no skipped levels).

Scoring:
- 100: Has headings with logical hierarchy
- 60: Has headings but hierarchy has gaps
- 40: Only generic /H tags (no numbered levels)
- 0: No heading tags at all

Remediation: In the Tags panel, change text that serves as headings to H1-H6 tags in logical order.

### 4. Alt Text on Images (15% weight)
WCAG: 1.1.1 Non-text Content (Level A)
Principle: Perceivable

Checks whether Figure tags have alternative text descriptions. N/A if no images detected.

Scoring: Percentage of images with alt text (0-100)

Remediation: In Tags panel, find <Figure> tags, right-click > Properties > enter Alternate Text.

### 5. Bookmarks / Navigation (10% weight)
WCAG: 2.4.5 Multiple Ways (Level AA)
Principle: Operable

Checks for bookmarks/outlines in documents with 10+ pages. N/A for shorter documents.

Scoring:
- 100: Has bookmarks with entries
- 25: Outline structure present but empty
- 0: No bookmarks

Remediation: Open Bookmarks panel, create manually or auto-generate from heading tags.

### 6. Table Markup (10% weight)
WCAG: 1.3.1 Info and Relationships (Level A)
Principle: Perceivable

Checks whether tables have header cells tagged as TH. N/A if no tables detected.

Scoring:
- 100: All tables have header tags
- 40: Some or no tables have headers

Remediation: In Tags panel, change header cell tags from <TD> to <TH>.

### 7. Link & URL Quality (5% weight)
WCAG: 2.4.4 Link Purpose in Context (Level A)
Principle: Operable

Checks whether links use descriptive text instead of raw URLs. N/A if no links.

Scoring: Percentage of links with descriptive text (0-100)

Remediation: Replace raw URLs with descriptive link text in the source document.

### 8. Form Accessibility (5% weight)
WCAG: 1.3.1 Info and Relationships (Level A), 4.1.2 Name, Role, Value (Level A)
Principle: Perceivable / Robust

Checks whether form fields have tooltip labels (TU attribute). N/A if no forms.

Scoring: Percentage of fields with labels (0-100)

Remediation: Right-click each form field > Properties > General > enter a Tooltip.

### 9. Reading Order (5% weight)
WCAG: 1.3.2 Meaningful Sequence (Level A)
Principle: Perceivable

Checks tag structure depth and content ordering via MCID sequences.

Scoring:
- 100: Logical reading order with nested structure
- 50: Content order has significant deviations
- 30: Flat tag structure (no meaningful nesting)
- 0: No structure tree at all

Remediation: Use the Reading Order tool (Accessibility > Reading Order) to verify and reorder elements.

---

## JSON Export Schema (v2.0)

The JSON export includes machine-readable data designed for LLM consumption:

\`\`\`json
{
  "reportMeta": {
    "generatedAt": "ISO 8601 timestamp",
    "generatedAtFormatted": "human-readable date",
    "tool": "${APP_NAME}",
    "toolUrl": "${SITE_URL}",
    "schemaVersion": "2.0"
  },
  "file": {
    "name": "filename.pdf",
    "pages": 12,
    "isScanned": false
  },
  "score": {
    "overall": 85,
    "grade": "B",
    "gradeLabel": "Good"
  },
  "executiveSummary": "Human-readable summary of findings",
  "warnings": [],
  "categories": [
    {
      "id": "text_extractability",
      "label": "Text Extractability",
      "score": 100,
      "grade": "A",
      "severity": "Pass",
      "status": "pass | minor | moderate | fail | not-applicable",
      "findings": ["Human-readable finding strings"],
      "explanation": "What this category checks",
      "helpLinks": [{ "label": "...", "url": "..." }],
      "wcag": {
        "successCriteria": ["1.3.1 Info and Relationships (Level A)"],
        "principle": "Perceivable",
        "remediation": "Step-by-step fix instructions"
      }
    }
  ],
  "remediationPlan": {
    "summary": "N categories need remediation",
    "prioritizedSteps": [
      {
        "priority": 1,
        "category": "Category Name",
        "currentScore": 0,
        "severity": "Critical",
        "wcagCriteria": ["1.3.1 ..."],
        "action": "Specific remediation steps"
      }
    ]
  },
  "llmContext": {
    "description": "Structured context for LLMs",
    "prompt": "Pre-built prompt summarizing the audit",
    "standards": ["WCAG 2.1 Level AA", "ADA Title II", "Section 508", "PDF/UA"],
    "scoringScale": {
      "pass": "90-100",
      "minor": "70-89",
      "moderate": "40-69",
      "fail": "0-39"
    }
  }
}
\`\`\`

---

## API Reference

### POST /api/analyze
Upload a PDF for accessibility analysis.
- Content-Type: multipart/form-data
- Field: "file" (PDF, max 100 MB)
- Returns: Full analysis result JSON

### POST /api/reports
Create a shareable report link.
- Content-Type: application/json
- Body: { "report": <analysis result object> }
- Returns: { "id": "uuid" }

### GET /api/reports/:id
Retrieve a shared report.
- Returns: { "report": <analysis result>, "sharedBy": "email or anonymous", "createdAt": "ISO date", "expiresAt": "ISO date" }
- 404 if not found, 410 if expired

### GET /api/health
Health check.
- Returns: { "status": "ok", "version": "...", "uptime": ... }
`
}

// ── og-image.svg ──────────────────────────────────────────────────────────

function buildOgImageSvg(): string {
  // For the SVG bottom bar: use abbreviation if available, otherwise skip
  const abbrevLine = orgAbbrev
    ? `  <text x="640" y="575" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#555555" letter-spacing="3">${escapeXml(orgAbbrev)}</text>`
    : ''
  const orgLine = `  <text x="640" y="600" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#444444">${escapeXml(ORG_NAME)}</text>`

  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0a0a"/>
      <stop offset="100%" stop-color="#141414"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22c55e"/>
      <stop offset="100%" stop-color="#14b8a6"/>
    </linearGradient>
    <linearGradient id="accentFade" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#22c55e" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#14b8a6" stop-opacity="0.05"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="20" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="softGlow">
      <feGaussianBlur stdDeviation="40" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Subtle grid pattern -->
  <g opacity="0.03">
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(60,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(120,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(180,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(240,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(300,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(360,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(420,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(480,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(540,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(600,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(660,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(720,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(780,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(840,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(900,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(960,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(1020,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(1080,0)"/>
    <line x1="0" y1="0" x2="0" y2="630" stroke="#f5f5f5" stroke-width="1" transform="translate(1140,0)"/>
    <line x1="0" y1="0" x2="1200" y2="0" stroke="#f5f5f5" stroke-width="1" transform="translate(0,60)"/>
    <line x1="0" y1="0" x2="1200" y2="0" stroke="#f5f5f5" stroke-width="1" transform="translate(0,120)"/>
    <line x1="0" y1="0" x2="1200" y2="0" stroke="#f5f5f5" stroke-width="1" transform="translate(0,180)"/>
    <line x1="0" y1="0" x2="1200" y2="0" stroke="#f5f5f5" stroke-width="1" transform="translate(0,240)"/>
    <line x1="0" y1="0" x2="1200" y2="0" stroke="#f5f5f5" stroke-width="1" transform="translate(0,300)"/>
    <line x1="0" y1="0" x2="1200" y2="0" stroke="#f5f5f5" stroke-width="1" transform="translate(0,360)"/>
    <line x1="0" y1="0" x2="1200" y2="0" stroke="#f5f5f5" stroke-width="1" transform="translate(0,420)"/>
    <line x1="0" y1="0" x2="1200" y2="0" stroke="#f5f5f5" stroke-width="1" transform="translate(0,480)"/>
    <line x1="0" y1="0" x2="1200" y2="0" stroke="#f5f5f5" stroke-width="1" transform="translate(0,540)"/>
  </g>

  <!-- Ambient glow orbs -->
  <circle cx="900" cy="200" r="200" fill="#22c55e" opacity="0.04" filter="url(#softGlow)"/>
  <circle cx="300" cy="450" r="150" fill="#14b8a6" opacity="0.03" filter="url(#softGlow)"/>

  <!-- Top accent line -->
  <rect x="0" y="0" width="1200" height="3" fill="url(#accent)"/>

  <!-- Left content area -->

  <!-- Grade circle -->
  <g transform="translate(140, 260)">
    <circle cx="0" cy="0" r="80" fill="none" stroke="#222222" stroke-width="6"/>
    <circle cx="0" cy="0" r="80" fill="none" stroke="url(#accent)" stroke-width="6" stroke-dasharray="440" stroke-dashoffset="44" stroke-linecap="round" transform="rotate(-90)"/>
    <circle cx="0" cy="0" r="65" fill="#111111" opacity="0.8"/>
    <text x="0" y="8" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="700" fill="#22c55e">A</text>
    <text x="0" y="32" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#888888" letter-spacing="2">92/100</text>
  </g>

  <!-- Score bars (mini category preview) -->
  <g transform="translate(260, 195)">
    <rect x="0" y="0" width="200" height="6" rx="3" fill="#1a1a1a"/>
    <rect x="0" y="0" width="190" height="6" rx="3" fill="#22c55e" opacity="0.9"/>
    <text x="210" y="8" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#666666">Text</text>

    <rect x="0" y="22" width="200" height="6" rx="3" fill="#1a1a1a"/>
    <rect x="0" y="22" width="180" height="6" rx="3" fill="#22c55e" opacity="0.8"/>
    <text x="210" y="30" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#666666">Title</text>

    <rect x="0" y="44" width="200" height="6" rx="3" fill="#1a1a1a"/>
    <rect x="0" y="44" width="200" height="6" rx="3" fill="#22c55e" opacity="0.9"/>
    <text x="210" y="52" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#666666">Headings</text>

    <rect x="0" y="66" width="200" height="6" rx="3" fill="#1a1a1a"/>
    <rect x="0" y="66" width="170" height="6" rx="3" fill="#14b8a6" opacity="0.8"/>
    <text x="210" y="74" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#666666">Alt Text</text>

    <rect x="0" y="88" width="200" height="6" rx="3" fill="#1a1a1a"/>
    <rect x="0" y="88" width="200" height="6" rx="3" fill="#22c55e" opacity="0.9"/>
    <text x="210" y="96" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#666666">Tables</text>

    <rect x="0" y="110" width="200" height="6" rx="3" fill="#1a1a1a"/>
    <rect x="0" y="110" width="140" height="6" rx="3" fill="#eab308" opacity="0.7"/>
    <text x="210" y="118" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#666666">Links</text>

    <rect x="0" y="132" width="200" height="6" rx="3" fill="#1a1a1a"/>
    <rect x="0" y="132" width="190" height="6" rx="3" fill="#22c55e" opacity="0.85"/>
    <text x="210" y="140" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#666666">Order</text>
  </g>

  <!-- Right content area -->

  <!-- PDF icon -->
  <g transform="translate(640, 140)">
    <rect x="0" y="0" width="52" height="64" rx="4" fill="none" stroke="#333333" stroke-width="1.5"/>
    <path d="M34,0 L52,18" fill="none" stroke="#333333" stroke-width="1.5"/>
    <path d="M34,0 L34,18 L52,18" fill="#1a1a1a" stroke="#333333" stroke-width="1.5"/>
    <text x="26" y="46" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="#ef4444" opacity="0.8">PDF</text>
  </g>

  <!-- Title -->
  <text x="640" y="260" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="700" fill="#f5f5f5" letter-spacing="-1">File Accessibility</text>
  <text x="640" y="320" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="700" fill="url(#accent)" letter-spacing="-1">Audit</text>

  <!-- Tagline -->
  <text x="640" y="370" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#888888">Automated PDF accessibility scoring</text>
  <text x="640" y="396" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#888888">across 9 WCAG-aligned categories</text>

  <!-- Feature pills -->
  <g transform="translate(640, 430)">
    <rect x="0" y="0" width="90" height="30" rx="15" fill="#111111" stroke="#222222" stroke-width="1"/>
    <text x="45" y="20" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#22c55e">WCAG 2.1</text>

    <rect x="100" y="0" width="120" height="30" rx="15" fill="#111111" stroke="#222222" stroke-width="1"/>
    <text x="160" y="20" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#14b8a6">9 Categories</text>

    <rect x="230" y="0" width="110" height="30" rx="15" fill="#111111" stroke="#222222" stroke-width="1"/>
    <text x="285" y="20" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#888888">PDF Analysis</text>

    <rect x="350" y="0" width="130" height="30" rx="15" fill="#111111" stroke="#222222" stroke-width="1"/>
    <text x="415" y="20" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#888888">Instant Grading</text>
  </g>

  <!-- Bottom bar -->
  <rect x="0" y="530" width="1200" height="100" fill="#111111" opacity="0.6"/>
  <line x1="0" y1="530" x2="1200" y2="530" stroke="#222222" stroke-width="1"/>
${abbrevLine}
${orgLine}

  <!-- Divider between left preview and right content -->
  <line x1="600" y1="140" x2="600" y2="490" stroke="#222222" stroke-width="1" opacity="0.5"/>
</svg>
`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Rebranding to: ${APP_NAME}`)
  console.log(`Organization:  ${ORG_NAME}`)
  console.log(`Production URL: ${SITE_URL}`)
  console.log()

  // 1. site.webmanifest
  const manifestPath = resolve(PUBLIC, 'site.webmanifest')
  writeFileSync(manifestPath, buildManifest())
  console.log(`  wrote ${manifestPath}`)

  // 2. llms.txt
  const llmsPath = resolve(PUBLIC, 'llms.txt')
  writeFileSync(llmsPath, buildLlmsTxt())
  console.log(`  wrote ${llmsPath}`)

  // 3. llms-full.txt
  const llmsFullPath = resolve(PUBLIC, 'llms-full.txt')
  writeFileSync(llmsFullPath, buildLlmsFullTxt())
  console.log(`  wrote ${llmsFullPath}`)

  // 4. og-image.svg
  const svgPath = resolve(ROOT, 'og-image.svg')
  const svgContent = buildOgImageSvg()
  writeFileSync(svgPath, svgContent)
  console.log(`  wrote ${svgPath}`)

  // 5. og-image.png (from SVG via sharp)
  const pngPath = resolve(PUBLIC, 'og-image.png')
  await sharp(Buffer.from(svgContent))
    .resize(1200, 630)
    .png()
    .toFile(pngPath)
  console.log(`  wrote ${pngPath}`)

  console.log()
  console.log('Done. All static branding files regenerated.')
}

main().catch(err => {
  console.error('Rebrand failed:', err)
  process.exit(1)
})
