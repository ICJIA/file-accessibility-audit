import fileSaver from "file-saver";
import { WCAG_MAP, getWcagCriteriaStrings } from "~/utils/wcag";
import { BANNER_EYEBROW, bannerMetaLine, fileTypeLabel, pageNoun } from "~/utils/reportBanner";
import { escapeHtml } from "~/utils/escapeHtml";
import { naReason } from "~/utils/modeDivergence";
import { gradeColor, severityColor, safeHttpUrl } from "@file-audit/shared";
const { saveAs } = fileSaver;

interface HelpLink {
  label: string;
  url: string;
}

interface Category {
  id: string;
  label: string;
  score: number | null;
  grade: string | null;
  severity: string | null;
  findings: string[];
  explanation?: string;
  helpLinks?: HelpLink[];
  // Disambiguates a null score: true = "not assessed" (tool couldn't
  // evaluate), false/undefined = "not applicable". Mirrors
  // CategoryResult['notAssessed'] in packages/shared/src/types.ts — the API
  // has always sent this field, this local type just hadn't declared it.
  notAssessed?: boolean;
}

interface ReportResult {
  filename: string;
  pageCount: number;
  overallScore: number;
  grade: string;
  isScanned: boolean;
  executiveSummary: string;
  categories: Category[];
  warnings?: string[];
  scoringMode?: ScoringMode;
  scoreProfiles?: Partial<Record<ScoringMode, ScoreProfile>>;
  conformance?: ConformanceVerdict;
  fileType?: "pdf" | "docx" | "pptx" | "xlsx";
}

type ScoringMode = "strict" | "remediation";

interface ScoreProfile {
  mode: ScoringMode;
  label: string;
  description: string;
  overallScore: number;
  grade: string;
  executiveSummary: string;
  categoryScores?: Record<string, number | null>;
  // Mirrors ScoreProfileResult in packages/shared/src/types.ts — the API
  // has always sent these fields (see that file's comment for the floor
  // semantics), this local type just hadn't declared them.
  rawOverallScore?: number;
  flooredToStrict?: boolean;
}

interface ConformanceFinding {
  sc: string;
  name: string;
  level: "A" | "AA";
  category: string;
  issue: string;
  url: string;
}

interface NotAssessedCriterion {
  sc: string;
  name: string;
  level: "A" | "AA";
  reason: string;
  url: string;
}

interface ConformanceVerdict {
  status: "fail" | "no-automated-failures" | "incomplete";
  failures: ConformanceFinding[];
  notAssessed: NotAssessedCriterion[];
  headline: string;
}

// Plain-language standards basis, shown in every export's conformance block.
// WCAG 2.2 is a superset of 2.1 AA; IITAA 2.1 still mandates WCAG 2.1 AA as the
// legal minimum for Illinois state/local government. ADA Title II (effective April
// 2026) requires WCAG 2.1 AA for state and local government digital content.
function standardsBasis(wcagVersion: string): string {
  const versionNote =
    wcagVersion === "2.2"
      ? ` (WCAG 2.2 is a superset of WCAG 2.1 AA, which remains the IITAA 2.1 legal minimum)`
      : "";
  return (
    `This audit checks documents against WCAG ${wcagVersion} Level AA — the accessibility standard adopted by the Illinois Information Technology Accessibility Act (IITAA 2.1) and the U.S. Department of Justice's ADA Title II rule for state and local government.` +
    versionNote
  );
}

function conformanceHeading(c: ConformanceVerdict, wcagVersion: string): string {
  if (c.status === "fail") return `Does not meet WCAG ${wcagVersion} Level AA`;
  if (c.status === "incomplete") return "WCAG verdict could not be determined";
  return "No automated WCAG failures detected";
}

function timestamp(): string {
  return new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// BUG-1: previously only stripped a trailing `.pdf`, so exporting a report
// for a Word/PowerPoint/Excel upload left the source extension dangling in
// the middle of the export filename (e.g. "report.docx-accessibility-
// report-2026-07-03.html"). Strip any of the four audited extensions.
// Exported for unit tests.
export function baseFilename(result: ReportResult): string {
  const name = result.filename.replace(/\.(pdf|docx|pptx|xlsx)$/i, "");
  const date = new Date().toISOString().slice(0, 10);
  return `${name}-accessibility-report-${date}`;
}

function gradeLabel(grade: string): string {
  const map: Record<string, string> = {
    A: "Excellent",
    B: "Good",
    C: "Needs Improvement",
    D: "Poor",
    F: "Failing",
  };
  return map[grade] || grade;
}

/** "- Pages: 12" / "- Slides: 9" / "- Sheets: 4" for the AI-analysis export. */
function pageCountLine(result: ReportResult): string {
  const noun = pageNoun(result.fileType);
  return `- ${noun.charAt(0).toUpperCase()}${noun.slice(1)}s: ${result.pageCount}`;
}

function profileLabel(_mode: ScoringMode): string {
  return "Strict semantic score (WCAG + IITAA §E205.4)";
}

function profileDescription(_mode: ScoringMode, wcagVersion?: string): string {
  const ver = wcagVersion ?? "2.2";
  return `WCAG-based scoring methodology. Anchored to WCAG ${ver} Level AA and Illinois IITAA 2.1 §E205.4 for non-web documents. Prioritizes programmatically determinable headings, table semantics, and logical structure.`;
}

function getScoreProfiles(result: ReportResult, wcagVersion?: string): ScoreProfile[] {
  // v1.21+ exports a single Strict profile. Historical shared reports
  // (stored before v1.21) may still carry a `scoreProfiles.remediation`
  // that differs from strict; we ignore it to keep the downloaded
  // document consistent with what the UI shows.
  const strictFallback: ScoreProfile = {
    mode: "strict",
    label: profileLabel("strict"),
    description: profileDescription("strict", wcagVersion),
    overallScore: result.overallScore,
    grade: result.grade,
    executiveSummary: result.executiveSummary,
  };

  const strict = result.scoreProfiles?.strict
    ? {
        ...result.scoreProfiles.strict,
        mode: "strict" as const,
        label: profileLabel("strict"),
        description: profileDescription("strict", wcagVersion),
      }
    : strictFallback;

  return [strict];
}

function severityEmoji(severity: string | null): string {
  if (!severity) return "";
  const map: Record<string, string> = {
    Pass: "✅",
    "No issues found": "✅",
    Minor: "ℹ️",
    Moderate: "⚠️",
    Critical: "🔴",
  };
  return map[severity] || "";
}

/**
 * Markdown `[label](url)` for any report link (conformance findings AND
 * category helpLinks), scheme-guarded like the buildHtml href sinks — both
 * `conformance.failures[]/notAssessed[].url` and `helpLinks[].url` are
 * attacker-controllable on a stored shared report (POST /api/reports stores
 * verbatim; GET returns it unsanitized, so pre-v1.32.0 rows can still carry a
 * javascript: url). An unsafe url falls back to the bare label (never emits
 * `](javascript:` into the markdown).
 */
function mdLink(label: string, url: string): string {
  const safe = safeHttpUrl(url);
  return safe ? `[${label}](${safe})` : label;
}

// ── Markdown ──────────────────────────────────────────────────────────────

interface BrandingInfo {
  appName: string;
  siteUrl: string;
  wcagVersion: string;
  wcagUnderstandingBase: string;
}

export function buildMarkdown(result: ReportResult, branding: BrandingInfo): string {
  const lines: string[] = [];
  const scoreProfiles = getScoreProfiles(result, branding.wcagVersion);

  // The filename leads as the H1 so the document a Markdown reader opens is
  // unmistakably tied to the audited file; the generic report label drops to a
  // subtitle alongside the page/type line.
  lines.push(`# ${result.filename}`);
  lines.push("");
  lines.push(`**Accessibility Report** · ${bannerMetaLine(result.pageCount, result.fileType)}`);
  lines.push("");
  lines.push(`**Date:** ${timestamp()}`);
  lines.push(`**Overall Score:** ${result.overallScore}/100`);
  lines.push(`**Grade:** ${result.grade} — ${gradeLabel(result.grade)}`);
  if (result.isScanned) lines.push(`**Status:** ⚠️ Scanned document detected`);
  lines.push("");

  if (result.conformance) {
    const c = result.conformance;
    lines.push(`## WCAG ${branding.wcagVersion} Conformance`);
    lines.push("");
    lines.push(`**${conformanceHeading(c, branding.wcagVersion)}**`);
    lines.push("");
    lines.push(c.headline);
    lines.push("");
    if (c.failures.length) {
      lines.push("| Success criterion | Level | Confirmed issue |");
      lines.push("|---|---|---|");
      for (const f of c.failures) {
        lines.push(`| ${mdLink(`${f.sc} ${f.name}`, f.url)} | ${f.level} | ${f.issue} |`);
      }
      lines.push("");
    }
    if (c.notAssessed.length) {
      const na = c.notAssessed.map((n) => mdLink(`${n.sc} ${n.name}`, n.url)).join(", ");
      lines.push(`_Not evaluated automatically: ${na}. These require manual review._`);
      lines.push("");
    }
    lines.push(`_${standardsBasis(branding.wcagVersion)}_`);
    lines.push("");
  }

  if (scoreProfiles.length > 1) {
    lines.push("## Score Profiles");
    lines.push("");
    lines.push(`Primary report view: **${profileLabel("strict")}**`);
    lines.push("");
    lines.push("| Profile | Score | Grade | Notes |");
    lines.push("|---------|-------|-------|-------|");
    for (const profile of scoreProfiles) {
      lines.push(
        `| ${profile.label} | ${profile.overallScore}/100 | ${profile.grade} — ${gradeLabel(profile.grade)} | ${profile.description} |`,
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(result.executiveSummary);
  lines.push("");

  if (result.warnings?.length) {
    lines.push("> **Warnings:**");
    for (const w of result.warnings) {
      lines.push(`> - ${w}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Category Scores");
  lines.push("");
  // Match the live/shared Score Table: scored categories in the table, N/A ones
  // in a separate "Not Included in Scoring" list ("Not assessed" vs "Not applicable").
  const mdScored = result.categories.filter((c) => c.score !== null);
  const mdNa = result.categories.filter((c) => c.score === null);
  lines.push("| Category | Score | Grade | Severity |");
  lines.push("|----------|-------|-------|----------|");
  for (const cat of mdScored) {
    const grade = cat.grade || "—";
    const sev = cat.severity ? `${severityEmoji(cat.severity)} ${cat.severity}` : "N/A";
    lines.push(`| ${cat.label} | ${cat.score}/100 | ${grade} | ${sev} |`);
  }
  lines.push("");
  if (mdNa.length) {
    lines.push("**Not Included in Scoring:**");
    lines.push("");
    for (const cat of mdNa) {
      const naLabel = cat.notAssessed ? "Not assessed" : "Not applicable";
      lines.push(`- **${cat.label}** — ${naLabel}: ${naReason(cat.id, cat.notAssessed)}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Detailed Findings");
  lines.push("");

  for (const cat of mdScored) {
    const scoreStr = `${cat.score}/100 (${cat.grade})`;
    lines.push(`### ${cat.label} — ${scoreStr}`);
    lines.push("");

    if (cat.severity) {
      lines.push(`**Severity:** ${severityEmoji(cat.severity)} ${cat.severity}`);
      lines.push("");
    }

    if (cat.explanation) {
      lines.push(`> ${cat.explanation}`);
      lines.push("");
    }

    lines.push("**Findings:**");
    lines.push("");
    for (const f of cat.findings) {
      lines.push(`- ${f}`);
    }
    lines.push("");

    if (cat.helpLinks?.length) {
      lines.push("**Resources:**");
      lines.push("");
      for (const link of cat.helpLinks) {
        // Scheme-guard like buildHtml's helpLinks + the conformance sinks:
        // GET /api/reports/:id returns stored JSON unsanitized, so a pre-v1.32.0
        // share row can still carry a javascript: helpLink url here.
        lines.push(`- ${mdLink(link.label, link.url)}`);
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(`*Report generated by [${branding.appName}](${branding.siteUrl}) — ${timestamp()}*`);

  return lines.join("\n");
}

// ── JSON ──────────────────────────────────────────────────────────────────

// Exported for unit tests (Fix 4: llmContext/remediationPlan format-neutral wording).
export function buildJSON(result: ReportResult, branding: BrandingInfo): string {
  const failingCategories = result.categories.filter((c) => c.score !== null && c.score < 90);
  const scoreProfiles = getScoreProfiles(result, branding.wcagVersion);

  const report = {
    reportMeta: {
      generatedAt: new Date().toISOString(),
      generatedAtFormatted: timestamp(),
      tool: branding.appName,
      toolUrl: branding.siteUrl,
      schemaVersion: "2.1",
    },
    file: {
      name: result.filename,
      pages: result.pageCount,
      isScanned: result.isScanned,
    },
    score: {
      overall: result.overallScore,
      grade: result.grade,
      gradeLabel: gradeLabel(result.grade),
      primaryMode: result.scoringMode || "strict",
    },
    scoreProfiles: Object.fromEntries(
      scoreProfiles.map((profile) => [
        profile.mode,
        {
          label: profile.label,
          description: profile.description,
          overall: profile.overallScore,
          grade: profile.grade,
          gradeLabel: gradeLabel(profile.grade),
          executiveSummary: profile.executiveSummary,
        },
      ]),
    ),
    executiveSummary: result.executiveSummary,
    warnings: result.warnings || [],
    conformance: result.conformance ?? null,
    categories: result.categories.map((cat) => {
      const wcag = WCAG_MAP[cat.id];
      return {
        id: cat.id,
        label: cat.label,
        score: cat.score,
        grade: cat.grade,
        severity: cat.severity,
        status:
          cat.score === null
            ? "not-applicable"
            : cat.score >= 90
              ? "pass"
              : cat.score >= 70
                ? "minor"
                : cat.score >= 40
                  ? "moderate"
                  : "fail",
        findings: cat.findings,
        explanation: cat.explanation || null,
        helpLinks: cat.helpLinks || [],
        wcag: wcag
          ? {
              successCriteria: getWcagCriteriaStrings(cat.id),
              successCriteriaDetailed: wcag.criteria.map((c) => ({
                ...c,
                url: `${branding.wcagUnderstandingBase}${c.slug}.html`,
              })),
              principle: wcag.principle,
              remediation: wcag.remediation,
            }
          : null,
      };
    }),
    remediationPlan: {
      summary:
        failingCategories.length === 0
          ? "No remediation needed — all scored categories pass."
          : `${failingCategories.length} categor${failingCategories.length === 1 ? "y needs" : "ies need"} remediation.`,
      prioritizedSteps: failingCategories
        .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
        .map((cat, i) => ({
          priority: i + 1,
          category: cat.label,
          currentScore: cat.score,
          severity: cat.severity,
          wcagCriteria: getWcagCriteriaStrings(cat.id),
          action:
            WCAG_MAP[cat.id]?.remediation ||
            "Review findings and remediate in the source application.",
        })),
    },
    llmContext: {
      description:
        "This section provides structured context for LLMs processing this accessibility report.",
      prompt:
        `You are reviewing a ${fileTypeLabel(result.fileType)} accessibility audit for "${result.filename}" (${result.pageCount} ${pageNoun(result.fileType)}${result.pageCount === 1 ? "" : "s"}). ` +
        `It scored ${result.overallScore}/100 (Grade ${result.grade}). ` +
        (failingCategories.length > 0
          ? `The following categories need remediation: ${failingCategories.map((c) => `${c.label} (${c.score}/100)`).join(", ")}. `
          : "All scored categories pass. ") +
        `Use the remediationPlan.prioritizedSteps array for ordered fix instructions. ` +
        `Each category includes WCAG ${branding.wcagVersion} success criteria references and tool-specific remediation steps for the source application.`,
      standards: [
        `WCAG ${branding.wcagVersion} Level AA`,
        "ADA Title II (effective April 2026)",
        "Illinois IITAA 2.1 (§E205.4)",
        "Section 508",
        // PDF/UA (ISO 14289-1) is a PDF-only ISO standard — the scorer never
        // computes PDF/UA signals for docx/pptx/xlsx ("pdfUa and adobeParity
        // are intentionally omitted — PDF-only signals", scorer.ts), so
        // listing it for an Office-format report would be a false claim.
        ...(!result.fileType || result.fileType === "pdf" ? ["PDF/UA (ISO 14289-1)"] : []),
      ],
      scoringScale: {
        pass: "90–100",
        minor: "70–89",
        moderate: "40–69",
        fail: "0–39",
      },
    },
  };
  return JSON.stringify(report, null, 2);
}

// ── TEXT ──────────────────────────────────────────────────────────────────
// Plain-text export. Replaces the former Word/.docx export (which pulled in
// the ~0.5 MB `docx` runtime for no real benefit over the existing
// Markdown/HTML/JSON formats). Same content, zero dependencies.

export function buildText(result: ReportResult, branding: BrandingInfo): string {
  const RULE = "=".repeat(72);
  const SUB = "-".repeat(72);
  const out: string[] = [];
  const scoreProfiles = getScoreProfiles(result, branding.wcagVersion);

  out.push(result.filename);
  out.push(`Accessibility Report \u00b7 ${bannerMetaLine(result.pageCount, result.fileType)}`);
  out.push(RULE);
  out.push(`Date:          ${timestamp()}`);
  out.push(`Overall score: ${result.overallScore}/100`);
  out.push(`Grade:         ${result.grade} \u2014 ${gradeLabel(result.grade)}`);
  if (result.isScanned) out.push("Status:        Scanned document detected");
  out.push("");

  if (result.conformance) {
    const cf = result.conformance;
    out.push(`WCAG ${branding.wcagVersion} CONFORMANCE`);
    out.push(SUB);
    out.push(conformanceHeading(cf, branding.wcagVersion));
    out.push("");
    out.push(cf.headline);
    out.push("");
    if (cf.failures.length) {
      out.push("Confirmed failures:");
      for (const f of cf.failures) {
        out.push(`  - ${f.sc} ${f.name} (Level ${f.level})`);
        out.push(`      ${f.issue}`);
        out.push(`      ${f.url}`);
      }
      out.push("");
    }
    if (cf.notAssessed.length) {
      out.push("Not evaluated automatically (manual review required):");
      for (const n of cf.notAssessed) out.push(`  - ${n.sc} ${n.name}`);
      out.push("");
    }
    out.push(standardsBasis(branding.wcagVersion));
    out.push("");
  }

  if (scoreProfiles.length > 1) {
    out.push("SCORE PROFILES");
    out.push(SUB);
    for (const pr of scoreProfiles) {
      out.push(`  ${pr.label}: ${pr.overallScore}/100 (${pr.grade})`);
      out.push(`      ${pr.description}`);
    }
    out.push("");
  }

  out.push("EXECUTIVE SUMMARY");
  out.push(SUB);
  out.push(result.executiveSummary);
  out.push("");

  if (result.warnings?.length) {
    out.push("Warnings:");
    for (const w of result.warnings) out.push(`  - ${w}`);
    out.push("");
  }

  out.push("CATEGORY SCORES");
  out.push(SUB);
  // Match the live/shared Score Table: scored categories, then a separate
  // "Not Included in Scoring" list ("Not assessed" vs "Not applicable").
  const txtScored = result.categories.filter((c) => c.score !== null);
  const txtNa = result.categories.filter((c) => c.score === null);
  for (const cat of txtScored) {
    const score = `${cat.score}/100`;
    const grade = cat.grade || "-";
    const sev = cat.severity || "N/A";
    out.push(`  ${cat.label.padEnd(26)} ${score.padStart(7)}  ${grade.padEnd(2)} ${sev}`);
  }
  out.push("");
  if (txtNa.length) {
    out.push("Not Included in Scoring:");
    for (const cat of txtNa) {
      const naLabel = cat.notAssessed ? "Not assessed" : "Not applicable";
      out.push(`  - ${cat.label} (${naLabel}): ${naReason(cat.id, cat.notAssessed)}`);
    }
    out.push("");
  }

  out.push("DETAILED FINDINGS");
  out.push(RULE);
  for (const cat of txtScored) {
    const scoreStr = `${cat.score}/100 (${cat.grade})`;
    out.push("");
    out.push(`${cat.label} \u2014 ${scoreStr}`);
    out.push(SUB);
    if (cat.severity) out.push(`Severity: ${cat.severity}`);
    if (cat.explanation) {
      out.push("");
      out.push(cat.explanation);
    }
    out.push("");
    out.push("Findings:");
    for (const f of cat.findings) out.push(`  - ${f}`);
    if (cat.helpLinks?.length) {
      out.push("");
      out.push("Resources:");
      for (const link of cat.helpLinks) out.push(`  - ${link.label}: ${link.url}`);
    }
    out.push("");
  }

  out.push(RULE);
  out.push(`Report generated by ${branding.appName} (${branding.siteUrl}) \u2014 ${timestamp()}`);

  return out.join("\n");
}

// ── HTML ──────────────────────────────────────────────────────────────────
// escapeHtml is imported from ~/utils/escapeHtml (shared, tested, covers the
// single quote) — see the import block at the top of this file.

// Renders the conformance verdict as a self-contained HTML block, mirroring
// the on-screen gate. Every WCAG criterion links to its W3C "Understanding"
// page.
function conformanceHtmlBlock(c: ConformanceVerdict, wcagVersion: string): string {
  const fail = c.status === "fail";
  const failuresHtml = c.failures.length
    ? `<ul style="font-size:13px;color:#ccc;margin:12px 0 0;padding-left:20px">${c.failures
        .map(
          (f) =>
            `<li style="margin-bottom:6px"><a href="${escapeHtml(safeHttpUrl(f.url) ?? "#")}" target="_blank" rel="noopener noreferrer" style="font-family:monospace;font-weight:700;color:#60a5fa">${escapeHtml(f.sc)} ${escapeHtml(f.name)}</a> <span style="color:#888">(Level ${escapeHtml(f.level)})</span> — ${escapeHtml(f.issue)}</li>`,
        )
        .join("")}</ul>`
    : "";
  const naHtml = c.notAssessed.length
    ? `<p style="font-size:13px;color:#888;margin:12px 0 0">Not evaluated automatically: ${c.notAssessed
        .map(
          (n) =>
            `<a href="${escapeHtml(safeHttpUrl(n.url) ?? "#")}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa">${escapeHtml(n.sc)} ${escapeHtml(n.name)}</a>`,
        )
        .join(", ")}. These still require manual review.</p>`
    : "";
  return `<div style="background:${fail ? "#ef444415" : "#1a1a1a"};border:1px solid ${fail ? "#ef4444" : "#333"};border-radius:12px;padding:16px 20px;margin-bottom:24px">
    <p style="font-size:15px;font-weight:700;color:${fail ? "#ef4444" : "#aaa"};margin:0 0 8px">${fail ? "⚠ " : ""}${escapeHtml(conformanceHeading(c, wcagVersion))}</p>
    <p style="font-size:13px;color:#ccc;margin:0">${escapeHtml(c.headline)}</p>
    ${failuresHtml}
    ${naHtml}
    <p style="font-size:12px;color:#777;margin:12px 0 0;padding-top:10px;border-top:1px solid #333">${escapeHtml(standardsBasis(wcagVersion))}</p>
  </div>`;
}

export function buildHtml(result: ReportResult, branding: BrandingInfo): string {
  const scoreProfiles = getScoreProfiles(result, branding.wcagVersion);
  // Shared grade/severity palette — same source the live pages use.
  const gc = (grade: string) => gradeColor(grade);
  const sc = (sev: string | null) => severityColor(sev);

  // Mirror the live/shared Score Table exactly: scored categories in the main
  // body, then a "Not Included in Scoring" section listing the N/A ones and
  // distinguishing "Not assessed" from "Not applicable" (as the NaCell does).
  const scoredCats = result.categories.filter((c) => c.score !== null);
  const naCats = result.categories.filter((c) => c.score === null);

  const catRows = scoredCats
    .map((cat) => {
      const score = escapeHtml(String(cat.score));
      const grade = escapeHtml(cat.grade || "—");
      const sev = cat.severity || "N/A";
      return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #222">${escapeHtml(cat.label)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #222;text-align:center;font-family:monospace;color:${gc(cat.grade || "")}">${score}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #222;text-align:center;font-weight:bold;color:${gc(cat.grade || "")}">${grade}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #222;text-align:center"><span style="color:${sc(cat.severity)};background:${sc(cat.severity)}15;padding:2px 8px;border-radius:12px;font-size:12px">${escapeHtml(sev)}</span></td>
    </tr>`;
    })
    .join("\n");

  const naRows = naCats.length
    ? `<tr><td colspan="4" style="padding:8px 12px;border-top:1px solid #333;background:#161616;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#888">Not Included in Scoring</td></tr>` +
      naCats
        .map((cat) => {
          const naLabel = cat.notAssessed ? "Not assessed" : "Not applicable";
          const reason = naReason(cat.id, cat.notAssessed);
          return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #222;color:#888">${escapeHtml(cat.label)}<div style="font-size:11px;color:#666;margin-top:2px">${escapeHtml(reason)}</div></td>
      <td style="padding:8px 12px;border-bottom:1px solid #222;text-align:center;color:#888;font-size:12px">${escapeHtml(naLabel)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #222;text-align:center;color:#666">—</td>
      <td style="padding:8px 12px;border-bottom:1px solid #222;text-align:center;color:#666">—</td>
    </tr>`;
        })
        .join("\n")
    : "";

  // Detailed findings only for scored categories — the live page shows fix
  // detail for scored categories, not the N/A ones (those carry their reason
  // inline in the table above).
  const detailSections = scoredCats
    .map((cat) => {
      const scoreStr = cat.score !== null ? escapeHtml(`${cat.score}/100 (${cat.grade})`) : "N/A";

      const findingsHtml = cat.findings
        .map((f) => {
          const isFail =
            cat.score !== null &&
            (f.toLowerCase().includes("not found") ||
              f.toLowerCase().includes("no ") ||
              f.toLowerCase().includes("missing") ||
              f.toLowerCase().includes("not tagged") ||
              f.toLowerCase().includes("unlabeled"));
          const isOk =
            f.toLowerCase().includes("found") ||
            f.toLowerCase().includes("present") ||
            f.toLowerCase().includes("all ") ||
            f.toLowerCase().includes("declared");
          const icon = isFail ? "✗" : isOk ? "✓" : cat.score === null ? "–" : "•";
          const color = isFail
            ? "#ef4444"
            : isOk
              ? "#22c55e"
              : cat.score === null
                ? "#eab308"
                : "#999";
          return `<div style="display:flex;gap:8px;margin-bottom:4px;font-size:14px;color:#ccc">
        <span style="color:${color};font-weight:bold;flex-shrink:0">${icon}</span>
        <span>${escapeHtml(f)}</span>
      </div>`;
        })
        .join("\n");

      const linksHtml = cat.helpLinks?.length
        ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid #1a1a1a">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Learn more</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${cat.helpLinks.map((l) => `<a href="${escapeHtml(safeHttpUrl(l.url) ?? "#")}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:#60a5fa;background:#3b82f610;padding:4px 10px;border-radius:6px;text-decoration:none">${escapeHtml(l.label)} ↗</a>`).join("\n")}
          </div>
        </div>`
        : "";

      const explanationHtml = cat.explanation
        ? `<div style="margin-bottom:12px;font-size:13px;color:#888;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;padding:10px 14px">
          <strong style="color:#aaa">What this checks:</strong> ${escapeHtml(cat.explanation)}
        </div>`
        : "";

      const sevBadge = cat.severity
        ? `<span style="color:${sc(cat.severity)};background:${sc(cat.severity)}15;padding:2px 10px;border-radius:12px;font-size:12px;margin-left:auto">${escapeHtml(cat.severity)}</span>`
        : "";

      return `<div style="background:#111;border:1px solid #222;border-radius:12px;padding:20px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <h3 style="margin:0;font-size:16px;color:#fff">${escapeHtml(cat.label)}</h3>
        <span style="font-family:monospace;font-size:14px;color:${gc(cat.grade || "")}">${scoreStr}</span>
        ${sevBadge}
      </div>
      ${explanationHtml}
      ${findingsHtml}
      ${linksHtml}
    </div>`;
    })
    .join("\n");

  const warningsHtml = result.warnings?.length
    ? `<div style="background:#854d0e15;border:1px solid #854d0e30;border-radius:12px;padding:14px;margin-bottom:20px">
        ${result.warnings.map((w) => `<p style="color:#fbbf24;font-size:14px;margin:0">${escapeHtml(w)}</p>`).join("\n")}
      </div>`
    : "";

  const scannedHtml = result.isScanned
    ? `<div style="background:#f9731615;border:1px solid #f9731630;border-radius:12px;padding:14px;margin-bottom:20px">
        <p style="color:#fdba74;font-size:14px;font-weight:500;margin:0">This document appears to be a scanned image. Screen readers cannot access its content. OCR and full remediation are required.</p>
      </div>`
    : "";

  const scoreProfilesHtml =
    scoreProfiles.length > 1
      ? `<div style="background:#111;border:1px solid #222;border-radius:12px;padding:16px 20px;margin-bottom:24px">
          <h2 style="font-size:14px;color:#aaa;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em">Score Profiles</h2>
          <p style="font-size:13px;color:#888;margin:0 0 12px">Primary report view: ${escapeHtml(profileLabel("strict"))}</p>
          ${scoreProfiles
            .map(
              (
                profile,
              ) => `<div style="margin-bottom:10px;padding:10px 12px;border:1px solid #222;border-radius:10px;background:#0d0d0d">
                <div style="font-size:14px;font-weight:700;color:#fff">${escapeHtml(profile.label)} — <span style="color:${gc(profile.grade)}">${escapeHtml(String(profile.overallScore))}/100 (${escapeHtml(profile.grade)})</span></div>
                <div style="font-size:12px;color:#888;margin-top:4px">${escapeHtml(profile.description)}</div>
              </div>`,
            )
            .join("")}
        </div>`
      : "";

  const conformanceHtml = result.conformance
    ? conformanceHtmlBlock(result.conformance, branding.wcagVersion)
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility Report — ${escapeHtml(result.filename)}</title>
<style>
  body { background:#0a0a0a; color:#f5f5f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; margin:0; padding:40px 20px; line-height:1.5 }
  .container { max-width:800px; margin:0 auto }
  a { color:#60a5fa }
  .file-banner { display:flex; align-items:flex-start; gap:14px; border:1px solid #333; border-radius:12px; padding:16px 20px; margin-bottom:28px }
  .file-banner .doc { font-size:28px; line-height:1.2 }
  .file-banner .eyebrow { font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#888; margin:0 }
  .file-banner .fname { font-size:20px; font-weight:700; color:#fff; margin:2px 0; word-break:break-word }
  .file-banner .meta { font-size:13px; color:#888; margin:0 }
  @media print { body { background:#fff; color:#000 } .container { max-width:100% }
    .file-banner { border-color:#bbb } .file-banner .fname { color:#000 } .file-banner .eyebrow, .file-banner .meta { color:#333 } }
</style>
</head>
<body>
<div class="container">

  <div class="file-banner">
    <span class="doc" aria-hidden="true">📄</span>
    <div>
      <p class="eyebrow">${BANNER_EYEBROW}</p>
      <p class="fname">${escapeHtml(result.filename)}</p>
      <p class="meta">${escapeHtml(bannerMetaLine(result.pageCount, result.fileType))}${result.isScanned ? " · Scanned" : ""}</p>
    </div>
  </div>

  <h1 style="text-align:center;font-size:24px;margin-bottom:4px">${fileTypeLabel(result.fileType)} Accessibility Report</h1>
  <p style="text-align:center;font-size:13px;color:#888;margin-top:0">${timestamp()}</p>

  <div style="text-align:center;margin:30px 0">
    <div style="width:120px;height:120px;border-radius:50%;border:4px solid ${gc(result.grade)};background:${gc(result.grade)}15;display:inline-flex;align-items:center;justify-content:center">
      <span style="font-size:56px;font-weight:900;color:${gc(result.grade)}">${escapeHtml(result.grade)}</span>
    </div>
    <p style="font-size:24px;font-weight:bold;margin:12px 0 4px">${escapeHtml(String(result.overallScore))}<span style="font-size:16px;color:#888">/100</span></p>
    <p style="font-size:14px;color:${gc(result.grade)};font-weight:500;margin:0">${escapeHtml(gradeLabel(result.grade))}</p>
  </div>

  ${conformanceHtml}
  ${scannedHtml}
  ${warningsHtml}
  ${scoreProfilesHtml}

  <div style="background:#111;border:1px solid #222;border-radius:12px;padding:16px 20px;margin-bottom:24px">
    <h2 style="font-size:14px;color:#aaa;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em">Executive Summary</h2>
    <p style="font-size:14px;color:#ccc;margin:0">${escapeHtml(result.executiveSummary)}</p>
  </div>

  <h2 style="font-size:18px;margin-bottom:12px">Category Scores</h2>
  <table style="width:100%;border-collapse:collapse;background:#111;border:1px solid #222;border-radius:12px;overflow:hidden;margin-bottom:30px">
    <thead>
      <tr style="background:#222">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#aaa;text-transform:uppercase">Category</th>
        <th style="padding:8px 12px;text-align:center;font-size:12px;color:#aaa;text-transform:uppercase">Score</th>
        <th style="padding:8px 12px;text-align:center;font-size:12px;color:#aaa;text-transform:uppercase">Grade</th>
        <th style="padding:8px 12px;text-align:center;font-size:12px;color:#aaa;text-transform:uppercase">Severity</th>
      </tr>
    </thead>
    <tbody>
      ${catRows}${naRows}
    </tbody>
  </table>

  <h2 style="font-size:18px;margin-bottom:12px">Detailed Findings</h2>
  ${detailSections}

  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #222;text-align:center">
    <p style="font-size:12px;color:#555">Report generated by <a href="${branding.siteUrl}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa">${branding.appName}</a> — ${timestamp()}</p>
  </div>

</div>
</body>
</html>`;
}

// ── AI-ready analysis ─────────────────────────────────────────────────────

export function buildAiAnalysis(
  result: ReportResult,
  branding?: Pick<BrandingInfo, "wcagVersion">,
): string {
  const wcagVersion = branding?.wcagVersion ?? "2.2";
  const lines: string[] = [];
  const scoreProfiles = getScoreProfiles(result, wcagVersion);
  const remediationProfile = scoreProfiles.find((profile) => profile.mode === "remediation");
  const isAccessible = result.grade === "A" || result.grade === "B";
  const verdict = isAccessible ? "Accessible" : "Not accessible";

  const scored = result.categories.filter((c) => c.score !== null);
  const failing = scored.filter((c) => c.severity === "Moderate" || c.severity === "Critical");
  const criticalCount = scored.filter((c) => c.severity === "Critical").length;
  const moderateCount = scored.filter((c) => c.severity === "Moderate").length;
  const passingCount = scored.length - failing.length;

  lines.push(`# ${fileTypeLabel(result.fileType)} Accessibility Audit — For AI Analysis`);
  lines.push("");

  if (failing.length === 0) {
    lines.push(
      `An automated ${fileTypeLabel(result.fileType)} accessibility audit completed with no failing categories. The document passed every applicable check against WCAG ${wcagVersion} Level AA and ADA Title II requirements. No remediation is needed at this time.`,
    );
    lines.push("");
    lines.push(`## File`);
    lines.push(`- Filename: ${result.filename}`);
    lines.push(pageCountLine(result));
    lines.push(
      `- Strict score (WCAG / IITAA §E205.4): ${result.overallScore}/100 (${result.grade})`,
    );
    if (remediationProfile) {
      const rawNote =
        remediationProfile.rawOverallScore !== undefined && remediationProfile.flooredToStrict
          ? ` (raw weighted-average: ${remediationProfile.rawOverallScore}/100; floored to Strict per the Strict ≤ Practical invariant)`
          : "";
      lines.push(
        `- Practical score (WCAG + PDF/UA): ${remediationProfile.overallScore}/100 (${remediationProfile.grade})${rawNote}`,
      );
      lines.push(
        `  (Strict is the canonical score and the floor for Practical. Practical adds PDF/UA Compliance Signals and partial-credit floors on heading and table structure; it can only lift the overall number, never lower it. IITAA §504.2.2 references PDF/UA for authoring-tool export capability; §E205.4 frames final-document accessibility through WCAG 2.1.)`,
      );
    }
    lines.push(`- Verdict: ${verdict}`);
    lines.push(`- Scored categories passed: ${passingCount}`);
    if (result.isScanned) {
      lines.push(`- Scanned document: yes`);
    }
    return lines.join("\n");
  }

  const formatLabel = fileTypeLabel(result.fileType);
  const isPdfResult = !result.fileType || result.fileType === "pdf";
  lines.push(
    `I ran an automated ${formatLabel} accessibility audit and I'd like your help remediating the failing items listed below. The audit checks WCAG ${wcagVersion} Level AA and ADA Title II digital accessibility requirements. Only failing categories (Critical or Moderate severity) are included — passing items are omitted to keep the context focused on what needs to be fixed.`,
  );
  lines.push("");
  lines.push(
    `**Please verify the ${formatLabel} file (\`${result.filename}\`) is attached to this conversation before you answer.** If it is not attached, ask me to upload it first — your remediation guidance will be far more accurate if you can inspect the ${
      isPdfResult
        ? "actual tag tree, reading order, alt text, and form fields"
        : "document's actual structure, alt text, and content"
    } directly rather than reasoning only from the summary below.`,
  );
  lines.push("");

  lines.push(`## File`);
  lines.push(`- Filename: ${result.filename}`);
  lines.push(pageCountLine(result));
  lines.push(`- Strict score (WCAG / IITAA §E205.4): ${result.overallScore}/100 (${result.grade})`);
  if (remediationProfile) {
    const rawNote =
      remediationProfile.rawOverallScore !== undefined && remediationProfile.flooredToStrict
        ? ` (raw weighted-average: ${remediationProfile.rawOverallScore}/100; floored to Strict)`
        : "";
    lines.push(
      `- Practical score (WCAG + PDF/UA): ${remediationProfile.overallScore}/100 (${remediationProfile.grade})${rawNote}`,
    );
  }
  lines.push(`- Verdict: ${verdict}`);
  lines.push(`- Critical issues: ${criticalCount}`);
  lines.push(`- Moderate issues: ${moderateCount}`);
  if (result.isScanned) {
    lines.push(
      `- Scanned document: yes (screen readers cannot access content until OCR + tagging is applied)`,
    );
  }
  lines.push("");

  lines.push(`## Executive summary (from the audit tool)`);
  lines.push("");
  lines.push(result.executiveSummary);
  lines.push("");

  if (result.warnings?.length) {
    lines.push(`## Warnings`);
    for (const w of result.warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push(`## Failing categories (${failing.length} to fix)`);
  lines.push("");
  for (const c of failing) {
    lines.push(`### ${c.label} — ${c.score}/100 (${c.severity})`);
    if (c.explanation) {
      lines.push("");
      lines.push(c.explanation);
    }
    const wcagRefs = getWcagCriteriaStrings(c.id);
    if (wcagRefs.length) {
      lines.push("");
      lines.push(`**WCAG ${wcagVersion} references:**`);
      for (const ref of wcagRefs) lines.push(`- ${ref}`);
    }
    if (c.findings?.length) {
      lines.push("");
      lines.push(`**Findings:**`);
      for (const f of c.findings) lines.push(`- ${f}`);
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push("");
  lines.push(`## What I'd like from you`);
  lines.push("");
  lines.push(
    `1. Explain in plain language what each failing category means for a real screen-reader or assistive-technology user.`,
  );
  lines.push(
    isPdfResult
      ? `2. For each failing category, give me 2–4 concrete remediation steps. Call out which steps belong in the source document (Word, InDesign) and which can be done in Adobe Acrobat Pro after export.`
      : `2. For each failing category, give me 2–4 concrete remediation steps in Microsoft ${formatLabel} itself (start from Review → Check Accessibility) — this ${formatLabel} file is the source document, so every fix belongs there.`,
  );
  lines.push(`3. Prioritize the Critical items — which fix should I tackle first, and why?`);
  lines.push(
    `4. Flag any findings that automated tools commonly mis-report, and tell me how to verify them manually.`,
  );

  return lines.join("\n");
}

// ── Public composable ─────────────────────────────────────────────────────

export function useReportExport() {
  const config = useRuntimeConfig();
  const branding: BrandingInfo = {
    appName: config.public.appName as string,
    siteUrl: config.public.siteUrl as string,
    wcagVersion: String(config.public.wcagVersion ?? "2.2"),
    wcagUnderstandingBase: String(
      config.public.wcagUnderstandingBase ?? "https://www.w3.org/WAI/WCAG22/Understanding/",
    ),
  };
  const exporting = ref(false);
  const sharing = ref(false);
  const shareUrl = ref<string | null>(null);
  const shareError = ref<string | null>(null);
  const aiCopied = ref(false);
  let aiCopyTimer: ReturnType<typeof setTimeout> | null = null;

  async function exportMarkdown(result: ReportResult) {
    const md = buildMarkdown(result, branding);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    saveAs(blob, `${baseFilename(result)}.md`);
  }

  async function exportJSON(result: ReportResult) {
    const json = buildJSON(result, branding);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    saveAs(blob, `${baseFilename(result)}.json`);
  }

  async function exportText(result: ReportResult) {
    const text = buildText(result, branding);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${baseFilename(result)}.txt`);
  }

  // Gather every same-origin stylesheet's rules so the exported file renders
  // standalone (the app's Tailwind build + theme variables). Cross-origin
  // sheets can't be read and are skipped — the app ships no consequential ones.
  function collectAppCss(): string {
    let out = "";
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) out += rule.cssText + "\n";
      } catch {
        /* cross-origin stylesheet — not readable; skip */
      }
    }
    return out;
  }

  /**
   * Snapshot the LIVE rendered report — the `[data-report-content]` subtree —
   * to a self-contained HTML file, so the download is identical to what's on
   * screen rather than a hand-built re-render that can drift. Everything is
   * expanded first (the file needs no interaction), interactive-only controls
   * (`[data-export-exclude]`) are dropped, and the app's stylesheet + color
   * mode are inlined so it renders anywhere. Returns false (→ buildHtml
   * fallback) when there is no live DOM (SSR / programmatic use).
   */
  async function snapshotReport(result: ReportResult): Promise<boolean> {
    if (typeof document === "undefined") return false;
    const el = document.querySelector<HTMLElement>("[data-report-content]");
    if (!el) return false;

    // Expand every collapsed section (IssuesSummary rows + the Basic/Advanced
    // signal toggles both expose state via aria-expanded="false").
    const toggles = Array.from(el.querySelectorAll<HTMLElement>('[aria-expanded="false"]'));
    toggles.forEach((t) => t.click());
    // Let Vue flush the resulting v-if renders before we clone.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-export-exclude]").forEach((n) => n.remove());
    clone.querySelectorAll("details").forEach((d) => (d.open = true));

    const css = collectAppCss();
    const doc = `<!DOCTYPE html>
<html lang="en" class="${escapeHtml(document.documentElement.className)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility Report — ${escapeHtml(result.filename)}</title>
<style>${css}</style>
<style>
  html { background: var(--surface-body, #0a0a0a); }
  body { margin: 0; padding: 32px 16px; background: var(--surface-body, #0a0a0a); color: var(--text-secondary, #e5e7eb); }
  .report-export { max-width: 900px; margin: 0 auto; }
  [data-export-exclude] { display: none !important; }
  /* The export is static (no JS): neutralize the now-inert click affordances
     while leaving pure-CSS hover tooltips (NaCell) and native <details> working. */
  .report-export button { cursor: default; }
</style>
</head>
<body>
<main class="report-export">${clone.outerHTML}</main>
</body>
</html>`;

    saveAs(new Blob([doc], { type: "text/html;charset=utf-8" }), `${baseFilename(result)}.html`);

    // Restore the live page's original collapse state.
    toggles.forEach((t) => t.click());
    return true;
  }

  async function exportHtml(result: ReportResult) {
    if (await snapshotReport(result)) return;
    // Fallback for SSR / no live DOM: the hand-built HTML report.
    const html = buildHtml(result, branding);
    saveAs(new Blob([html], { type: "text/html;charset=utf-8" }), `${baseFilename(result)}.html`);
  }

  /**
   * Trigger the browser's native print dialog so the user can save the
   * current report page as a PDF (Save as PDF is the default print
   * destination on macOS, Windows, and ChromeOS). The browser respects
   * the @media print rules in assets/css/main.css which hide site
   * chrome, switch to ink-on-paper colors, expand <details> sections,
   * scale mermaid SVGs, and avoid awkward page breaks. The user can
   * choose the filename in the print dialog.
   *
   * Browser print is the lightest possible PDF generator — it works
   * without adding puppeteer / playwright / pdfkit dependencies (~100 MB
   * combined) and produces output that's visually faithful to the
   * report page itself.
   */
  function exportPdfViaBrowserPrint(_result: ReportResult) {
    if (typeof window === "undefined") return;
    // Defer one frame so any UI close-handlers (e.g., dropdown closing
    // before print fires) settle before the modal blocks the page.
    requestAnimationFrame(() => {
      window.print();
    });
  }

  async function shareReport(result: ReportResult): Promise<string | null> {
    sharing.value = true;
    shareError.value = null;
    shareUrl.value = null;
    try {
      const response = await $fetch<{ id: string }>("/api/reports", {
        method: "POST",
        body: { report: result },
        credentials: "include",
      });
      const config = useRuntimeConfig();
      const url = `${config.public.siteUrl}/report/${response.id}`;
      shareUrl.value = url;
      return url;
    } catch (err: any) {
      shareError.value = err?.data?.error || "Failed to create share link";
      return null;
    } finally {
      sharing.value = false;
    }
  }

  function clearShare() {
    shareUrl.value = null;
    shareError.value = null;
  }

  function buildAiAnalysisText(result: ReportResult): string {
    return buildAiAnalysis(result, branding);
  }

  async function copyAiAnalysis(result: ReportResult): Promise<boolean> {
    const text = buildAiAnalysis(result, branding);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        return false;
      }
      aiCopied.value = true;
      if (aiCopyTimer) clearTimeout(aiCopyTimer);
      aiCopyTimer = setTimeout(() => {
        aiCopied.value = false;
      }, 2500);
      return true;
    } catch {
      return false;
    }
  }

  return {
    exportMarkdown,
    exportJSON,
    exportText,
    exportHtml,
    exportPdfViaBrowserPrint,
    shareReport,
    shareUrl,
    shareError,
    sharing,
    clearShare,
    exporting,
    copyAiAnalysis,
    aiCopied,
    buildAiAnalysisText,
  };
}
