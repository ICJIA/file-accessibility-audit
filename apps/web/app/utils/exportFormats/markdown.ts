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
  exportPlan,
  criterionUrl,
  AUTOMATION_LIMIT_HEADING,
  AUTOMATION_LIMIT_TEXT,
} from "./shared";

/**
 * Escape a document-derived string for Markdown (2026-11-12).
 *
 * Findings quote the document: alt text, link labels, heading samples, the
 * filename itself. Interpolated raw, a filename of `a|b.pdf` broke the table
 * it sat in, `[click](javascript:…)` in a finding became a live link in the
 * downloaded report, and a newline ended the list item it belonged to.
 *
 * Backslash-escapes the characters that carry meaning mid-line (emphasis,
 * code, links, HTML, table pipes, strikethrough) plus a block marker at the
 * very start of the value, and folds line breaks to a space — every call
 * site places the value inside one line (a heading, a table cell, a list
 * item). Hyphens, full stops and parentheses inside a sentence are left
 * alone so the file still reads cleanly as plain text.
 */
export function escapeMarkdown(value: unknown, opts: { inline?: boolean } = {}): string {
  const escaped = String(value ?? "")
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[\\`*_[\]<>|~]/g, (ch) => `\\${ch}`);
  // Inside a link label nothing can start a block, so "1.4.3 Contrast" keeps
  // its plain number there.
  if (opts.inline) return escaped;
  return escaped.replace(/^(\s*)([#+=-]|\d+[.)])/, (_m, lead: string, marker: string) =>
    /^\d/.test(marker)
      ? `${lead}${marker.slice(0, -1)}\\${marker.slice(-1)}`
      : `${lead}\\${marker}`,
  );
}
const md = escapeMarkdown;

/** A number from the payload, as a number. A stored report is caller-
 *  controlled JSON: a string in a numeric field is escaped text at best,
 *  never raw Markdown. */
function num(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : md(value);
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
  const text = escapeMarkdown(label, { inline: true });
  return safe ? `[${text}](${safe})` : text;
}

export function buildMarkdown(result: ReportResult, branding: BrandingInfo): string {
  const lines: string[] = [];
  const scoreProfiles = getScoreProfiles(result, branding.wcagVersion);

  // The filename leads as the H1 so the document a Markdown reader opens is
  // unmistakably tied to the audited file; the generic report label drops to a
  // subtitle alongside the page/type line.
  lines.push(`# ${md(result.filename)}`);
  lines.push("");
  lines.push(`**Accessibility Report** · ${md(bannerMetaLine(result.pageCount, result.fileType))}`);
  lines.push("");
  lines.push(`**Date:** ${timestamp()}`);
  lines.push(`**Overall Score:** ${num(result.overallScore)}/100`);
  // Never a bare "A — Excellent": the adjective describes the score, and the
  // reader's question is whether the document can be published.
  const plan = exportPlan(result);
  lines.push(`**Grade:** ${md(result.grade)}`);
  lines.push(`**Verdict:** ${md(plan.verdictLabel)}`);
  if (result.isScanned) lines.push(`**Status:** ⚠️ Scanned document detected`);
  lines.push("");
  lines.push(`> **⚠ ${AUTOMATION_LIMIT_HEADING}**`);
  lines.push(">");
  lines.push(`> ${AUTOMATION_LIMIT_TEXT}`);
  lines.push("");

  if (plan.hasCategories) {
    lines.push("## Action Plan");
    lines.push("");
    if (!plan.steps.length) {
      lines.push(plan.emptySentence);
      lines.push("");
    } else {
      lines.push("Fix these in order, then re-upload to verify.");
      lines.push("");
      for (const step of plan.steps) {
        const required = plan.required(step);
        const tag =
          required === null ? "" : required ? " · **Required by WCAG 2.1**" : " · Recommended";
        lines.push(`${step.rank}. **${md(step.title)}** — ${md(step.severity)}${tag}`);
        lines.push(`   - Why: ${md(step.why)}`);
        if (step.estimate) lines.push(`   - Hands-on time: ${md(step.estimate.label)}`);
        for (const route of step.routes) {
          lines.push(`   - ${md(route.label)}:`);
          route.steps.forEach((s, i) => lines.push(`     ${i + 1}. ${md(s)}`));
        }
        if (step.wcagRefs.length) {
          const refs = step.wcagRefs
            .map((ref) => {
              const url = criterionUrl(ref.sc, branding);
              const label = `WCAG ${ref.sc} ${ref.name}`;
              return url ? mdLink(label, url) : md(label);
            })
            .join(", ");
          lines.push(`   - ${refs}`);
        }
      }
      lines.push("");
    }
  }

  if (result.conformance) {
    const c = result.conformance;
    lines.push(`## WCAG ${branding.wcagVersion} Conformance`);
    lines.push("");
    lines.push(`**${conformanceHeading(c, branding.wcagVersion)}**`);
    lines.push("");
    lines.push(md(c.headline));
    lines.push("");
    if (c.failures.length) {
      lines.push("| Success criterion | Level | Confirmed issue |");
      lines.push("|---|---|---|");
      for (const f of c.failures) {
        lines.push(`| ${mdLink(`${f.sc} ${f.name}`, f.url)} | ${md(f.level)} | ${md(f.issue)} |`);
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
        `| ${md(profile.label)} | ${num(profile.overallScore)}/100 | ${md(profile.grade)} — ${md(gradeLabel(profile.grade))} | ${md(profile.description)} |`,
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(md(result.executiveSummary));
  lines.push("");

  if (result.warnings?.length) {
    lines.push("> **Warnings:**");
    for (const w of result.warnings) {
      lines.push(`> - ${md(w)}`);
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
  // No per-category letter (2026-09-01): it gets read as the document's grade.
  lines.push("| Category | Score | Severity |");
  lines.push("|----------|-------|----------|");
  for (const cat of mdScored) {
    const sev = cat.severity ? `${severityEmoji(cat.severity)} ${md(cat.severity)}` : "N/A";
    lines.push(`| ${md(cat.label)} | ${num(cat.score)}/100 | ${sev} |`);
  }
  lines.push("");
  if (mdNa.length) {
    lines.push("**Not Included in Scoring:**");
    lines.push("");
    for (const cat of mdNa) {
      const naLabel = cat.notAssessed ? "Not assessed" : "Not applicable";
      lines.push(`- **${md(cat.label)}** — ${naLabel}: ${naReason(cat.id, cat.notAssessed)}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Detailed Findings");
  lines.push("");

  for (const cat of mdScored) {
    const scoreStr = `${num(cat.score)}/100`;
    lines.push(`### ${md(cat.label)} — ${scoreStr}`);
    lines.push("");

    if (cat.severity) {
      lines.push(`**Severity:** ${severityEmoji(cat.severity)} ${md(cat.severity)}`);
      lines.push("");
    }

    if (cat.explanation) {
      lines.push(`> ${md(cat.explanation)}`);
      lines.push("");
    }

    lines.push("**Findings:**");
    lines.push("");
    for (const f of cat.findings) {
      lines.push(`- ${md(f)}`);
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
