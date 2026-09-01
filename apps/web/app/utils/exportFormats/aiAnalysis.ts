/**
 * AI-ready analysis builder — moved verbatim out of
 * composables/useReportExport.ts (Task F5). Pure function: no DOM, no Vue,
 * no side effects.
 */
import { getWcagCriteriaStrings } from "~/utils/wcag";
import { partitionCardFindings } from "~/utils/findings";
import { evaluateBestPractices } from "~/utils/bestPractices";
import { fileTypeLabel, pageNoun } from "~/utils/reportBanner";
import { type ReportResult, type BrandingInfo, getScoreProfiles } from "./shared";

/** "- Pages: 12" / "- Slides: 9" / "- Sheets: 4" for the AI-analysis export. */
function pageCountLine(result: ReportResult): string {
  const noun = pageNoun(result.fileType);
  return `- ${noun.charAt(0).toUpperCase()}${noun.slice(1)}s: ${result.pageCount}`;
}

/**
 * The two sections below the legal one: what is worth doing that no law
 * requires. Both are fenced and labelled, because this file exists to be
 * pasted into an LLM and an LLM will happily fold "recommended" into
 * "required" over a long answer — the same conflation the v1.130-v1.133 split
 * and the v1.148 label withdrawals were about.
 *
 * NOT-MET rows only. A met row is noise in a remediation prompt, and the
 * filter has a second benefit: the best-practice era gate downgrades a
 * witness-based MET to "not-checked" on payloads older than the advisory, and
 * touches not-met rows not at all. So this export needs no `analyzedAt` to
 * stay honest on a stored report — there is no MET here to go stale.
 */
function appendExtraCredit(lines: string[], result: ReportResult): void {
  const notMet = evaluateBestPractices(result).filter((row) => row.status === "not-met");
  if (notMet.length) {
    lines.push(`## Also worth doing — best practice, NOT scored and NOT required by WCAG 2.1`);
    lines.push("");
    lines.push(
      `None of the following cost this document any points and none is required by the ADA Title II rule or the IITAA. They are listed because a person remediating the file usually wants to know about them.`,
    );
    lines.push("");
    for (const row of notMet) {
      lines.push(`- **${row.practice.label}** — ${row.practice.description}`);
      for (const e of row.evidence) lines.push(`  - ${e}`);
      if (row.practice.standard) lines.push(`  - Basis: ${row.practice.standard} (not WCAG)`);
    }
    lines.push("");
  }

  // veraPDF: printed only when it actually ran. `available:false` is attached
  // deliberately so a report can disclose the gap (v1.91.0) — saying nothing
  // is right here, but claiming a pass would not be.
  const v = result.pdfUaVerdict;
  if (v?.available) {
    lines.push(`## Independent PDF/UA check (veraPDF) — ISO 14289, NOT the legal standard`);
    lines.push("");
    lines.push(
      `veraPDF is the PDF Association's own validator, run beside this checker as a second opinion. PDF/UA is an industry standard; the law names WCAG. A PDF/UA failure is worth fixing but is not a legal finding, and none of it moved the score above.`,
    );
    lines.push("");
    lines.push(`- Profile: ${v.profile}`);
    lines.push(`- Verdict: ${v.passed ? "PASSED" : "FAILED"} the machine-checkable conditions`);
    if (!v.passed) {
      const kinds = v.distinctRuleCount ?? v.failures.length;
      lines.push(`- ${v.totalFailureCount} failure(s) across ${kinds} distinct rule(s)`);
      for (const f of v.failures) {
        lines.push(`  - Clause ${f.clause} (${f.ruleId}) ×${f.count} — ${f.description}`);
      }
    }
    lines.push("");
  }
}

export function buildAiAnalysis(
  result: ReportResult,
  branding?: Pick<BrandingInfo, "wcagVersion">,
): string {
  const wcagVersion = branding?.wcagVersion ?? "2.1";
  const lines: string[] = [];
  const scoreProfiles = getScoreProfiles(result, wcagVersion);
  const remediationProfile = scoreProfiles.find((profile) => profile.mode === "remediation");
  // A confirmed WCAG 2.1 failure outranks the grade band (2026-09-01). Every
  // Office missing-alt case caps its category at 85 = Minor while carrying a
  // 1.1.1 Level A failure — and this export used to tell the LLM "No WCAG
  // 2.1 remediation is needed … Verdict: Accessible" about exactly those
  // documents, because its filter looked only at Moderate/Critical severity.
  const conformanceFailures = Array.isArray(result.conformance?.failures)
    ? result.conformance.failures
    : [];
  const conformanceFails = result.conformance?.status === "fail" && conformanceFailures.length > 0;
  const isAccessible = (result.grade === "A" || result.grade === "B") && !conformanceFails;
  const verdict = isAccessible ? "Accessible" : "Not accessible";

  const scored = result.categories.filter((c) => c.score !== null);
  const failingCategoryIds = new Set(
    conformanceFailures.map((f) => f?.category).filter((x): x is string => typeof x === "string"),
  );
  const failing = scored.filter(
    (c) =>
      c.severity === "Moderate" ||
      c.severity === "Critical" ||
      (conformanceFails && failingCategoryIds.has(c.id)),
  );
  const criticalCount = scored.filter((c) => c.severity === "Critical").length;
  const moderateCount = scored.filter((c) => c.severity === "Moderate").length;
  const passingCount = scored.length - failing.length;

  lines.push(`# ${fileTypeLabel(result.fileType)} Accessibility Audit — For AI Analysis`);
  lines.push("");

  if (!conformanceFails && failing.length === 0) {
    lines.push(
      `An automated ${fileTypeLabel(result.fileType)} accessibility audit completed with no failing categories. The document passed every applicable check; the score counts only WCAG 2.1 A/AA criteria — the standard the ADA Title II rule and the Illinois IITAA require (the audit's checklist basis is WCAG ${wcagVersion} Level AA). No WCAG 2.1 remediation is needed.`,
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
        `- Practical score (remediation tracking — adds PDF/UA best-practice signals; informational, never the compliance verdict): ${remediationProfile.overallScore}/100 (${remediationProfile.grade})${rawNote}`,
      );
      lines.push(
        `  (Strict is the canonical, compliance-answering score and the floor for Practical. PDF/UA is the PDF industry's best practice — ISO 14289 — not a legal requirement: IITAA §504.2.2 references PDF/UA only for authoring-tool export capability, while §E205.4 frames final-document accessibility through WCAG 2.1. Practical can only lift the number, never lower it.)`,
      );
    }
    lines.push(`- Verdict: ${verdict}`);
    lines.push(`- Scored categories passed: ${passingCount}`);
    if (result.isScanned) {
      lines.push(`- Scanned document: yes`);
    }
    // A clean WCAG verdict is not the same as "nothing left to do". This is
    // the case synthetic-125 was built for — passes 2.1 outright and still has
    // real best-practice debt — and until now this branch told the reader
    // there was nothing to act on while the on-screen report listed items.
    lines.push("");
    appendExtraCredit(lines, result);
    return lines.join("\n").trimEnd();
  }

  const formatLabel = fileTypeLabel(result.fileType);
  const isPdfResult = !result.fileType || result.fileType === "pdf";
  lines.push(
    `I ran an automated ${formatLabel} accessibility audit and I'd like your help remediating the failing items listed below. The audit checks documents against WCAG ${wcagVersion} Level AA, but the score counts only WCAG 2.1 A/AA criteria — the standard the ADA Title II rule and the Illinois IITAA require. Only categories with a confirmed WCAG 2.1 criterion failure, or Critical/Moderate severity, are included — passing items are omitted to keep the context focused on what needs to be fixed.`,
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
      `- Practical score (remediation tracking — adds PDF/UA best-practice signals; informational, never the compliance verdict): ${remediationProfile.overallScore}/100 (${remediationProfile.grade})${rawNote}`,
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
    // WHICH criteria failed, not which criteria this category COULD fail.
    // `getWcagCriteriaStrings` returns the whole static map for a category, and
    // several categories cover more than one criterion: title_language maps to
    // BOTH 2.4.2 (title) and 3.1.1 (language). A Word file with no title but a
    // correctly declared `w:lang` fails only 2.4.2 — yet listing the map under
    // a heading inside "Failing categories" told the reader that a language
    // that is perfectly fine is a Level A failure. On the one export designed
    // to be pasted into an LLM, that is an instruction to "fix" correct markup.
    // The conformance verdict already knows the answer, so ask it.
    const attributed = (result.conformance?.failures ?? []).filter((f) => f.category === c.id);
    if (attributed.length) {
      lines.push("");
      // The referenced criteria are 2.1-pure (wcag21Purity-enforced) — label
      // them as what they are, whatever checklist basis the audit ran with.
      lines.push(`**WCAG 2.1 criteria this category fails:**`);
      for (const f of attributed) {
        lines.push(`- ${f.sc} ${f.name} (Level ${f.level}) — ${f.issue}`);
      }
    } else {
      // No verdict to consult (an older stored payload predates it). Fall back
      // to the map, but say plainly that it is a list of what the category can
      // fail — never that these are the failures.
      const wcagRefs = getWcagCriteriaStrings(c.id);
      if (wcagRefs.length) {
        lines.push("");
        lines.push(
          `**WCAG 2.1 criteria this category covers** (this report predates per-criterion attribution, so not every one below is necessarily failing):`,
        );
        for (const ref of wcagRefs) lines.push(`- ${ref}`);
      }
    }
    if (c.findings?.length) {
      // The analyzer labels reported-but-unscored items with a prefix
      // contract ("PDF/UA only — not scored:" / "Advisory — not scored:").
      // An AI reading them inline under a FAILING category would fold best
      // practice into the legal failure — split them out explicitly.
      const parts = partitionCardFindings(c.findings);
      const legal = [
        ...parts.main,
        ...parts.signals.flatMap((g) => (g.heading ? [`${g.heading}:`, ...g.items] : g.items)),
        ...parts.acrobat,
      ];
      if (legal.length) {
        lines.push("");
        // NOT "these are what fails". A category's finding list mixes the
        // defect with census and evidence lines the analyzer emits
        // unconditionally — "Document language: en-US" is a PASS, and it sat
        // under the old heading claiming to be a WCAG failure. The criteria
        // block above is the authoritative list of what fails.
        lines.push(
          `**What the checker reported in this category** (evidence as well as defects — the criteria above are the confirmed failures):`,
        );
        for (const f of legal) lines.push(`- ${f}`);
      }
      if (parts.notScored.length) {
        lines.push("");
        lines.push(`**Also reported — best practice, NOT scored and NOT required by WCAG 2.1:**`);
        for (const f of parts.notScored) lines.push(`- ${f}`);
      }
    }
    lines.push("");
  }

  appendExtraCredit(lines, result);

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
    `5. Do NOT put anything from the "Also worth doing" or "Independent PDF/UA check" sections into the prioritised remediation list. List those separately, last, and label them optional — they are not required by the ADA Title II rule or the IITAA and they did not affect the score.`,
  );
  lines.push(
    `6. Keep the two standards straight in your answer: WCAG 2.1 A/AA is what the law (ADA Title II, Illinois IITAA) requires and is all the score measures. Anything labelled "not scored" or PDF/UA is the PDF industry's best practice (ISO 14289) — worth recommending, but never present it as legally required or as part of the score.`,
  );

  return lines.join("\n");
}
