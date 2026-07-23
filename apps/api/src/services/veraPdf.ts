/**
 * Wrapper around the veraPDF CLI for PDF/UA-1 conformance validation.
 *
 * veraPDF (https://verapdf.org/) is the open-source validator maintained
 * by the PDF Association and Dual Lab. Used here to provide a technical
 * conformance check on the remediated output, surfaced in the UI as part
 * of the IITAA compliance disclaimer.
 *
 * Honest framing: veraPDF tells us the machine-checkable parts of
 * PDF/UA-1 conformance — tag presence, MarkInfo, structure tree depth,
 * etc. It cannot judge alt-text quality or whether the reading order
 * makes sense to a sighted reader. Those still require manual review.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { REMEDIATION } from "#config";

const execFileAsync = promisify(execFile);

export interface VeraPdfRuleFailure {
  ruleId: string;
  clause: string;
  description: string;
  count: number;
}

export interface VeraPdfVerdict {
  /** veraPDF binary was found and runnable */
  available: boolean;
  /** Output is PDF/UA-1 conformant per veraPDF (only meaningful when available=true) */
  passed: boolean;
  /** Conformance flavour checked, e.g. 'ua1' */
  profile: string;
  /** Failing rules with counts; truncated to top 20 for storage compactness */
  failures: VeraPdfRuleFailure[];
  /** Total failure count across all rules (before truncation) */
  totalFailureCount: number;
  /** Distinct failing rules before the 20-item truncation (optional for legacy/mocked verdicts). */
  distinctRuleCount?: number;
  /** Human-readable error if veraPDF itself errored out */
  error?: string;
}

/**
 * Run veraPDF against a PDF and return a structured verdict.
 * Never throws — returns `available: false` if veraPDF isn't installed
 * or any error happens. Callers should record the verdict regardless.
 */
export async function runVeraPdf(
  pdfPath: string,
  timeoutMs: number = REMEDIATION.VERAPDF_TIMEOUT_MS,
): Promise<VeraPdfVerdict> {
  const bin = REMEDIATION.VERAPDF_PATH;
  if (!bin) {
    return {
      available: false,
      passed: false,
      profile: "ua1",
      failures: [],
      totalFailureCount: 0,
      distinctRuleCount: 0,
    };
  }

  let stdout: string;
  let exitWasError = false;
  try {
    const result = await execFileAsync(
      bin,
      ["--flavour", "ua1", "--format", "json", pdfPath],
      // Bound the veraPDF JVM so a pathological tagged output can't hang the
      // remediation pipeline. A timeout surfaces as a non-zero exit handled
      // by the catch below (treated as "could not validate"), never blocking.
      { maxBuffer: 32 * 1024 * 1024, timeout: timeoutMs },
    );
    stdout = result.stdout;
  } catch (e) {
    // veraPDF exits non-zero on non-compliance — that's not an error,
    // just a failed validation. Parse stdout anyway if present.
    const err = e as { stdout?: string; stderr?: string; message?: string };
    stdout = err.stdout ?? "";
    if (!stdout) {
      return {
        available: true,
        passed: false,
        profile: "ua1",
        failures: [],
        totalFailureCount: 0,
        distinctRuleCount: 0,
        error: err.message ?? "veraPDF exited with error and no output",
      };
    }
    exitWasError = true;
  }

  // veraPDF JSON shape varies slightly between versions; we extract
  // conservatively. Both 1.x and 2.x have a top-level "report" or
  // "jobs" key with a validationResult.
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      available: true,
      passed: false,
      profile: "ua1",
      failures: [],
      totalFailureCount: 0,
      distinctRuleCount: 0,
      error: "could not parse veraPDF JSON output",
    };
  }

  return extractVerdict(parsed, exitWasError);
}

// Exported for tests — pure mapping from veraPDF's JSON output (which
// varies by version) to the stable VeraPdfVerdict shape.
export function extractVerdict(parsed: unknown, fellbackToErrorStdout: boolean): VeraPdfVerdict {
  // Try several known shapes — be lenient about structure.
  const root = parsed as Record<string, unknown>;
  const report = (root.report ?? root) as Record<string, unknown>;
  const jobs = (report.jobs ?? root.jobs) as Array<Record<string, unknown>> | undefined;
  // veraPDF 1.30.x: validationResult is an array of per-profile results
  // (one entry per --flavour passed on the command line). Older releases
  // emit a single object. Normalize to the first element so downstream
  // extraction works against either shape.
  const validationRaw = jobs?.[0]?.validationResult;
  const validation = Array.isArray(validationRaw)
    ? (validationRaw[0] as Record<string, unknown> | undefined)
    : (validationRaw as Record<string, unknown> | undefined);

  if (!validation) {
    // Try alternate path: parsed.jobs[0].itemDetails.validationResult
    const alt = parsed as Record<string, unknown> as unknown;
    return {
      available: true,
      passed: false,
      profile: "ua1",
      failures: [],
      totalFailureCount: 0,
      distinctRuleCount: 0,
      error: "veraPDF output did not include a validationResult",
      ...(typeof alt === "object" && alt !== null ? {} : {}),
    };
  }

  const isCompliant =
    validation.isCompliant === true || validation.compliant === true || validation.passed === true;

  const profileName =
    (validation.profileName as string | undefined) ??
    ((validation.profile as Record<string, unknown> | undefined)?.id as string | undefined) ??
    "ua1";

  // Rule-summary location varies by veraPDF version:
  //   1.30.x: validation.details.ruleSummaries (array of per-rule objects).
  //           In this shape details.failedRules is a *count* (number), so
  //           never use it as an array fallback.
  //   1.26.x: validation.ruleSummaries (array) on the validation object.
  //   pre-1.20: validation.failedRules (array) on the validation object.
  // Try them in newest-first order.
  const details = validation.details as Record<string, unknown> | undefined;
  const ruleSummariesRaw =
    (details?.ruleSummaries as Array<Record<string, unknown>> | undefined) ??
    (validation.ruleSummaries as Array<Record<string, unknown>> | undefined) ??
    (validation.failedRules as Array<Record<string, unknown>> | undefined) ??
    [];

  const failures: VeraPdfRuleFailure[] = ruleSummariesRaw
    .map((r) => {
      // veraPDF identifies a rule by specification + clause + testNumber
      // (its GUI renders "7.1-1"). `ruleStatus` is the status string
      // ("FAILED"/"PASSED") — never use it as an identifier.
      const clause = typeof r.clause === "string" ? r.clause : "";
      const testNumber = r.testNumber;
      const composite =
        clause && testNumber !== undefined && testNumber !== null
          ? `${clause}-${testNumber}`
          : null;
      return {
        ruleId:
          composite ??
          (r.specification as string | undefined) ??
          (r.ruleId as string | undefined) ??
          (r.id as string | undefined) ??
          "unknown",
        clause,
        description:
          (r.description as string | undefined) ?? (r.message as string | undefined) ?? "",
        count: (r.failedChecks as number | undefined) ?? (r.count as number | undefined) ?? 1,
      };
    })
    .filter((f) => f.count > 0);

  // Sort by occurrence count desc BEFORE truncating, so the stored top-20 is
  // genuinely the 20 highest-count rules — the UI lists them "most frequent
  // first" and the Pareto rollup depends on it. Array.sort is stable on Node 22.
  failures.sort((a, b) => b.count - a.count);

  // True number of distinct failing rules, captured before the slice(0, 20).
  const distinctRuleCount = failures.length;

  // Prefer the authoritative server-reported count when veraPDF exposes
  // it (1.30.x details.failedChecks). Falls back to summing the
  // displayed rule list, which is post-truncation so it under-counts on
  // wildly non-compliant PDFs.
  const reportedFailedChecks = details?.failedChecks as number | undefined;
  const totalFailureCount =
    typeof reportedFailedChecks === "number"
      ? reportedFailedChecks
      : failures.reduce((s, f) => s + f.count, 0);

  return {
    available: true,
    passed: isCompliant && !fellbackToErrorStdout,
    profile: profileName,
    // Truncate to top 20 for storage compactness — DB payload stays
    // reasonable; the user can install veraPDF locally for the full
    // report if they need every rule.
    failures: failures.slice(0, 20),
    totalFailureCount,
    distinctRuleCount,
  };
}
