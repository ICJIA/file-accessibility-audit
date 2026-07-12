/**
 * Markdown report builder — moved verbatim out of composables/useReportExport.ts
 * (Task F5). Pure function: no DOM, no Vue, no side effects.
 */
import { bannerMetaLine } from "~/utils/reportBanner";
import { naReason } from "~/utils/modeDivergence";
import { safeHttpUrl } from "@file-audit/shared";
import {
  type ReportResult,
  type BrandingInfo,
  gradeLabel,
  getScoreProfiles,
  standardsBasis,
  conformanceHeading,
  timestamp,
  profileLabel,
} from "./shared";

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
