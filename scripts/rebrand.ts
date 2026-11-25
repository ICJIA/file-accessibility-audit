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

import { writeFileSync } from "fs";
import { resolve } from "path";
import sharp from "sharp";
import { BRANDING, DEPLOY } from "../audit.config.js";

const ROOT = resolve(import.meta.dirname, "..");
const PUBLIC = resolve(ROOT, "apps/web/public");

const { APP_NAME, APP_SHORT_NAME, ORG_NAME, ORG_URL, FAQS_URL, GITHUB_URL } = BRANDING;
const SITE_URL = DEPLOY.PRODUCTION_URL;

// Extract a short org abbreviation from APP_NAME (text before "File" or first word)
const orgAbbrev = APP_NAME.includes("File")
  ? APP_NAME.split("File")[0].trim()
  : APP_NAME.split(" ")[0];

// ── site.webmanifest ──────────────────────────────────────────────────────

function buildManifest(): string {
  return (
    JSON.stringify(
      {
        name: APP_NAME,
        short_name: APP_SHORT_NAME,
        description:
          "Automated PDF accessibility scoring across 9 WCAG 2.1 and ADA Title II categories",
        start_url: "/",
        display: "standalone",
        background_color: "#0a0a0a",
        theme_color: "#0a0a0a",
        icons: [
          { src: "/favicon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/favicon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      null,
      2,
    ) + "\n"
  );
}

// ── llms.txt ──────────────────────────────────────────────────────────────

// ⚠️ STALE TEMPLATES (known issue, registered 2026-08-09): the two llms
// builders below still describe a PDF-only, WCAG 2.1, auth-era tool and
// would CLOBBER the corrected apps/web/public/llms*.txt if this script is
// run. Update these templates from the live files before any rebrand run.
function buildLlmsTxt(): string {
  const lines = [
    `# ${APP_NAME}`,
    "",
    `> Automated PDF accessibility scoring tool built by ${ORG_NAME}.`,
    "",
    "This web application analyzes PDF documents for accessibility compliance and produces a detailed audit report scored against WCAG 2.1 Level AA and ADA Title II requirements.",
    "",
    "## What it does",
    "",
    "- Accepts a PDF file upload (up to 100 MB)",
    "- Analyzes the document across 9 accessibility categories",
    "- Returns an overall score (0-100), letter grade (A-F), and per-category findings",
    "- Provides remediation guidance with WCAG success criteria references",
    "- Exports reports in Word (.docx), HTML, Markdown, and JSON formats",
    "- JSON export includes machine-readable WCAG mappings, prioritized remediation plans, and LLM-ready context",
    "",
    "## Scoring categories (weighted)",
    "",
    "1. Text Extractability (20%) - WCAG 1.3.1, 1.4.5",
    "2. Document Title & Language (15%) - WCAG 2.4.2, 3.1.1",
    "3. Heading Structure (15%) - WCAG 1.3.1",
    "4. Alt Text on Images (15%) - WCAG 1.1.1",
    "5. Bookmarks / Navigation (10%) - no WCAG 2.1 criterion (never scored)",
    "6. Table Markup (10%) - WCAG 1.3.1",
    "7. Link & URL Quality (5%) - WCAG 1.3.1, 4.1.2; 2.4.4 reported, not scored",
    "8. Form Accessibility (5%) - WCAG 1.3.1, 4.1.2",
    "9. Reading Order (5%) - WCAG 1.3.2",
    "",
    "## Grade scale",
    "",
    "- A: 90-100 (Excellent)",
    "- B: 80-89 (Good)",
    "- C: 70-79 (Needs Improvement)",
    "- D: 60-69 (Poor)",
    "- F: 0-59 (Failing)",
    "",
    "## Standards alignment",
    "",
    "- WCAG 2.1 Level AA",
    "- ADA Title II (compliance due April 26, 2027 for entities of 50,000+; April 26, 2028 for smaller entities and special districts)",
    "- PDF/UA (ISO 14289-1)",
    "",
    "## API",
    "",
    "The application exposes a REST API:",
    "",
    '- POST /api/analyze - Upload a PDF for analysis (multipart/form-data, field: "file")',
    "- POST /api/reports - Create a shareable report link (JSON body: { report })",
    "- GET /api/reports/:id - Retrieve a shared report by ID",
    "- GET /api/health - Health check endpoint",
    "",
    "## Links",
    "",
    `- Website: ${SITE_URL}`,
  ];

  if (GITHUB_URL) lines.push(`- Source: ${GITHUB_URL}`);
  if (FAQS_URL) lines.push(`- FAQs: ${FAQS_URL}`);
  lines.push(`- Organization: ${ORG_URL}`);

  lines.push(
    "",
    "## Optional: llms-full.txt",
    "",
    "For complete documentation including the scoring rubric, category explanations, remediation guidance, and JSON export schema, see /llms-full.txt",
    "",
  );

  return lines.join("\n");
}

// ── llms-full.txt ─────────────────────────────────────────────────────────

function buildLlmsFullTxt(): string {
  return `# ${APP_NAME} — Full Documentation

> Comprehensive reference for LLMs, AI agents, and automated tools.

## Overview

The ${APP_NAME} is a web application that analyzes PDF documents for accessibility compliance. It extracts structural data from PDFs using two complementary parsers (QPDF for tag structure, PDF.js for content extraction), scores the document across 9 weighted categories aligned to WCAG 2.1 Level AA and ADA Title II, and produces a detailed report with findings, remediation guidance, and standards references.

Website: ${SITE_URL}${GITHUB_URL ? `\nSource: ${GITHUB_URL}` : ""}
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
WCAG: 1.3.1 Info and Relationships (Level A); 2.4.6 is a human judgment, listed as not assessed
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
WCAG: none asserted (2.4.5 Multiple Ways is scoped to a set of documents per WCAG2ICT; never scored)
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
    "standards": ["WCAG 2.1 Level AA", "ADA Title II", "Illinois IITAA 2.1", "PDF/UA"],
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
`;
}

// ── og-image.svg ──────────────────────────────────────────────────────────

function buildOgImageSvg(): string {
  // Plakat look (2026-11), matching the site: one cobalt block carrying the
  // headline, a solid grade block beside it, heavy grotesque type, square
  // corners. sharp renders the text with the build machine's fonts, so the
  // stack names faces that exist there (the site's Archivo is a web font).
  const font = `font-family="Helvetica Neue, Helvetica, Arial, sans-serif"`;
  const rest = orgAbbrev ? APP_NAME.replace(orgAbbrev, "").trim() : APP_NAME;
  const host = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const headline = [
    "Check your",
    "PDF, Word,",
    "PowerPoint,",
    "and Excel files",
    "for accessibility",
  ]
    .map(
      (line, i) =>
        `  <text x="56" y="${262 + i * 72}" ${font} font-size="70" font-weight="800" fill="#ffffff" letter-spacing="-3">${line}</text>`,
    )
    .join("\n");

  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <!-- Page -->
  <rect width="1200" height="630" fill="#0a0a0a"/>

  <!-- Brand block -->
  <rect x="0" y="0" width="720" height="630" fill="#3559e0"/>
  <text x="56" y="84" ${font} font-size="17" font-weight="700" fill="#ffffff" letter-spacing="2.5">DOCUMENT ACCESSIBILITY CHECK</text>
  <text x="664" y="84" text-anchor="end" ${font} font-size="17" font-weight="700" fill="#ffffff" letter-spacing="2.5">WCAG 2.1 A/AA</text>
${headline}

  <!-- Grade block: the letter knocked out of a solid block in the grade colour -->
  <rect x="776" y="56" width="200" height="200" fill="#22c55e"/>
  <text x="876" y="224" text-anchor="middle" ${font} font-size="190" font-weight="800" fill="#0a0a0a">A</text>
  <text x="1004" y="206" ${font} font-size="76" font-weight="800" fill="#ffffff" letter-spacing="-3">92</text>
  <text x="1006" y="248" ${font} font-size="26" font-weight="700" fill="#d4d4d4">/100</text>

  <!-- Name -->
  <rect x="776" y="318" width="368" height="5" fill="#ffffff"/>
  <text x="776" y="386" ${font} font-size="50" font-weight="800" fill="#ffffff" letter-spacing="-2">${escapeXml(orgAbbrev || APP_NAME)}</text>
  <text x="776" y="424" ${font} font-size="23" font-weight="800" fill="#ffffff" letter-spacing="0.5">${escapeXml(rest.toUpperCase())}</text>
  <text x="776" y="470" ${font} font-size="17" fill="#d4d4d4">PDF · Word · PowerPoint · Excel</text>
  <text x="776" y="496" ${font} font-size="17" fill="#d4d4d4">ADA Title II · Illinois IITAA 2.1</text>

  <!-- Foot -->
  <text x="776" y="560" ${font} font-size="15" font-weight="700" fill="#ffffff" letter-spacing="1.5">${escapeXml(host.toUpperCase())}</text>
  <text x="776" y="584" ${font} font-size="13" fill="#a3a3a3">${escapeXml(ORG_NAME)}</text>
</svg>
`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Rebranding to: ${APP_NAME}`);
  console.log(`Organization:  ${ORG_NAME}`);
  console.log(`Production URL: ${SITE_URL}`);
  console.log();

  // 1. site.webmanifest
  const manifestPath = resolve(PUBLIC, "site.webmanifest");
  writeFileSync(manifestPath, buildManifest());
  console.log(`  wrote ${manifestPath}`);

  // 2. llms.txt
  const llmsPath = resolve(PUBLIC, "llms.txt");
  writeFileSync(llmsPath, buildLlmsTxt());
  console.log(`  wrote ${llmsPath}`);

  // 3. llms-full.txt
  const llmsFullPath = resolve(PUBLIC, "llms-full.txt");
  writeFileSync(llmsFullPath, buildLlmsFullTxt());
  console.log(`  wrote ${llmsFullPath}`);

  // 4. og-image.svg
  const svgPath = resolve(ROOT, "og-image.svg");
  const svgContent = buildOgImageSvg();
  writeFileSync(svgPath, svgContent);
  console.log(`  wrote ${svgPath}`);

  // 5. og-image.png (from SVG via sharp)
  const pngPath = resolve(PUBLIC, "og-image.png");
  await sharp(Buffer.from(svgContent)).resize(1200, 630).png().toFile(pngPath);
  console.log(`  wrote ${pngPath}`);

  console.log();
  console.log("Done. All static branding files regenerated.");
}

main().catch((err) => {
  console.error("Rebrand failed:", err);
  process.exit(1);
});
