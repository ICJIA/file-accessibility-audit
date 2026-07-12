/**
 * Self-contained HTML report builder — moved verbatim out of
 * composables/useReportExport.ts (Task F5). Pure function: no DOM, no Vue,
 * no side effects (this is the SSR / no-live-DOM fallback; the live-DOM
 * snapshot path — snapshotReport() — stays in the composable since it reads
 * `document`).
 */
import { escapeHtml } from "~/utils/escapeHtml";
import { naReason } from "~/utils/modeDivergence";
import { BANNER_EYEBROW, bannerMetaLine, fileTypeLabel } from "~/utils/reportBanner";
import { gradeColor, severityColor, safeHttpUrl } from "@file-audit/shared";
import {
  type ReportResult,
  type BrandingInfo,
  type ConformanceVerdict,
  gradeLabel,
  getScoreProfiles,
  standardsBasis,
  conformanceHeading,
  timestamp,
  profileLabel,
} from "./shared";

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
