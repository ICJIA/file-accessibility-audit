/**
 * AI-ready analysis builder — moved verbatim out of
 * composables/useReportExport.ts (Task F5). Pure function: no DOM, no Vue,
 * no side effects.
 */
import { getWcagCriteriaStrings } from "~/utils/wcag";
import { fileTypeLabel, pageNoun } from "~/utils/reportBanner";
import { type ReportResult, type BrandingInfo, getScoreProfiles } from "./shared";

/** "- Pages: 12" / "- Slides: 9" / "- Sheets: 4" for the AI-analysis export. */
function pageCountLine(result: ReportResult): string {
  const noun = pageNoun(result.fileType);
  return `- ${noun.charAt(0).toUpperCase()}${noun.slice(1)}s: ${result.pageCount}`;
}

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
