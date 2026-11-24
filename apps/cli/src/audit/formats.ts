/**
 * The machine-readable report formats. Each takes the same AuditReport and
 * returns a string; none of them reads anything else, so what a format shows
 * can never disagree with what the gates decided.
 */
import { createHash } from "node:crypto";
import { CATEGORY_IDS } from "../lib/categories.js";
import { escapeCsvField } from "../lib/csv.js";
import { severityRank } from "./gates.js";
import type { AuditEntry, AuditReport, SeverityLevel } from "./types.js";

// ---------------------------------------------------------------- JSON family

export function toJson(report: AuditReport): string {
  return JSON.stringify(report, null, 2);
}

/** One line per file (`type: "result"`), then one `type: "summary"` line. */
export function toNdjson(report: AuditReport): string {
  const lines = report.results.map((entry) => JSON.stringify({ type: "result", ...entry }));
  lines.push(
    JSON.stringify({
      type: "summary",
      schemaVersion: report.schemaVersion,
      tool: report.tool,
      summary: report.summary,
    }),
  );
  return lines.join("\n");
}

// ------------------------------------------------------------------------ CSV

export const CSV_FIXED_COLUMNS = [
  "path",
  "status",
  "file_type",
  "pages",
  "score",
  "grade",
  "conformance",
  "confirmed_wcag_failures",
  "passed",
  "gate_failures",
  "baseline_score",
  "score_change",
] as const;
export const CSV_TRAILING_COLUMNS = ["sha256", "error"] as const;

/** One row per file. Category columns are the same for every format so the
 *  header never depends on which documents happened to be in the run; a
 *  category a format does not have, or did not score, is left empty. */
export function toCsv(report: AuditReport): string {
  const header = [...CSV_FIXED_COLUMNS, ...CATEGORY_IDS, ...CSV_TRAILING_COLUMNS];
  const rows = report.results.map((e) => {
    const scores = new Map((e.analysis?.categories ?? []).map((c) => [c.id, c.score]));
    return [
      e.path,
      e.status,
      e.fileType,
      e.pageCount,
      e.score,
      e.grade,
      e.conformance,
      e.confirmedFailures,
      e.passed === null ? "" : e.passed ? "yes" : "no",
      e.gateFailures.map((g) => `${g.gate}: ${g.message}`).join("; "),
      e.baseline?.score,
      e.baseline?.delta,
      ...CATEGORY_IDS.map((id) => scores.get(id) ?? null),
      e.sha256,
      e.error ? `${e.error.code}: ${e.error.message}` : "",
    ]
      .map((v) => escapeCsvField(v as string | number | null | undefined))
      .join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

// ---------------------------------------------------------------------- JUnit

function xml(value: unknown): string {
  return (
    String(value ?? "")
      // Characters XML 1.0 cannot carry at all, even escaped.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  );
}

/**
 * One <testsuite> per file; one <testcase> per scoring category, plus one
 * named "gates" that carries the file-level verdict.
 *
 * A category testcase FAILS when its severity is at or above `failOn` — and
 * when no --fail-on was given, at "minor", i.e. whenever the category is not
 * a pass. (That default is for the report only; it never changes the exit
 * status.) A category that was not scored is <skipped/>. A file that could
 * not be audited is one testcase with an <error>.
 */
export function toJunit(report: AuditReport, failOn: SeverityLevel | null): string {
  const limit = severityRank(failOn ?? "minor");
  let tests = 0;
  let failures = 0;
  let errors = 0;
  let skipped = 0;
  const suites: string[] = [];

  for (const e of report.results) {
    const cases: string[] = [];
    let sTests = 0;
    let sFailures = 0;
    let sErrors = 0;
    let sSkipped = 0;

    if (e.status === "error" || !e.analysis) {
      sTests++;
      sErrors++;
      cases.push(
        `    <testcase classname="${xml(e.path)}" name="audit">\n` +
          `      <error type="${xml(e.error?.code ?? "error")}" message="${xml(e.error?.message ?? "")}"/>\n` +
          `    </testcase>`,
      );
    } else {
      for (const cat of e.analysis.categories) {
        sTests++;
        const open = `    <testcase classname="${xml(e.path)}" name="${xml(cat.label)}"`;
        if (cat.score === null) {
          sSkipped++;
          cases.push(`${open}>\n      <skipped message="not scored"/>\n    </testcase>`);
        } else if (severityRank(cat.severity) >= limit) {
          sFailures++;
          cases.push(
            `${open}>\n` +
              `      <failure type="${xml(cat.severity)}" message="${xml(`${cat.label}: ${cat.score}/100 (${cat.severity})`)}">` +
              `${xml(cat.findings.join("\n"))}</failure>\n` +
              `    </testcase>`,
          );
        } else {
          cases.push(`${open}/>`);
        }
      }
      sTests++;
      const gatesOpen = `    <testcase classname="${xml(e.path)}" name="gates"`;
      if (e.gateFailures.length > 0) {
        sFailures++;
        cases.push(
          `${gatesOpen}>\n` +
            `      <failure type="gate" message="${xml(e.gateFailures.map((g) => g.message).join("; "))}">` +
            `${xml(e.gateFailures.map((g) => `${g.gate}: ${g.message}`).join("\n"))}</failure>\n` +
            `    </testcase>`,
        );
      } else {
        cases.push(`${gatesOpen}/>`);
      }
    }

    tests += sTests;
    failures += sFailures;
    errors += sErrors;
    skipped += sSkipped;
    suites.push(
      `  <testsuite name="${xml(e.path)}" tests="${sTests}" failures="${sFailures}" errors="${sErrors}" skipped="${sSkipped}">\n` +
        (e.score !== null
          ? `    <properties>\n` +
            `      <property name="score" value="${xml(e.score)}"/>\n` +
            `      <property name="grade" value="${xml(e.grade)}"/>\n` +
            `    </properties>\n`
          : "") +
        cases.join("\n") +
        `\n  </testsuite>`,
    );
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites name="${xml(report.tool.name)}" tests="${tests}" failures="${failures}" errors="${errors}" skipped="${skipped}">\n` +
    suites.join("\n") +
    (suites.length ? "\n" : "") +
    `</testsuites>`
  );
}

// ---------------------------------------------------------------------- SARIF

const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";
const INFORMATION_URI = "https://github.com/ICJIA/file-accessibility-audit";

type SarifLevel = "error" | "warning" | "note";

function sarifLevel(severity: string | null | undefined): SarifLevel {
  const rank = severityRank(severity);
  return rank >= 3 ? "error" : rank === 2 ? "warning" : "note";
}

/** The structured twin of a finding string, when the engine provides one
 *  (CategoryResult.findingDetails — absent on results from older engines). */
interface FindingDetailLike {
  code?: unknown;
  kind?: unknown;
  text?: unknown;
  count?: unknown;
  total?: unknown;
  pages?: unknown;
  sc?: unknown;
}

function findingDetailsOf(category: unknown): FindingDetailLike[] | null {
  const details = (category as { findingDetails?: unknown }).findingDetails;
  return Array.isArray(details) ? (details as FindingDetailLike[]) : null;
}

/** Lines of a legacy findings list that state a problem — not the indented
 *  detail rows, section dividers, or how-to guidance around them. */
function isHeadlineFinding(line: string): boolean {
  if (!line.trim()) return false;
  if (line.startsWith("  ") || line.startsWith("---")) return false;
  return !/^(how to fix|fix|tip|note|advisory)\b/i.test(line);
}

function artifactLocation(path: string): { uri: string; uriBaseId?: string } {
  const encoded = path
    .split("/")
    .map((segment) => (segment === ".." ? segment : encodeURIComponent(segment)))
    .join("/");
  // A file outside the working directory has no place under %SRCROOT%.
  return path.startsWith("../") || path.startsWith("/")
    ? { uri: encoded }
    : { uri: encoded, uriBaseId: "%SRCROOT%" };
}

function fingerprint(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

/**
 * SARIF 2.1.0, one run.
 *
 * WITH structured findings (the engine's `findingDetails`): one result per
 * finding whose kind is "failure"; `ruleId` is the finding's stable code.
 *
 * WITHOUT them (an older engine) — or when a category that did not pass has
 * no finding marked as a failure: one result for that category; `ruleId` is
 * the category id and the message carries the category's headline findings.
 * Coarser, but never a guess about which line is which, and never silence
 * about a category that failed.
 *
 * `level` comes from the category's severity (Critical → error, Moderate →
 * warning, Minor → note). The location is the document itself: these are
 * binary files, so there is no line to point at; page numbers, when the
 * engine names them, are in `properties.pages`.
 */
export function toSarif(report: AuditReport): string {
  const rules = new Map<string, Record<string, unknown>>();
  const results: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];

  const rule = (
    id: string,
    category: { id: string; label: string; helpLinks?: Array<{ url?: string }> },
    sc: string[],
  ): void => {
    if (rules.has(id)) return;
    const helpUri = category.helpLinks?.find((l) => typeof l?.url === "string")?.url;
    rules.set(id, {
      id,
      name: id,
      shortDescription: { text: id === category.id ? category.label : `${category.label}: ${id}` },
      ...(helpUri ? { helpUri } : {}),
      properties: {
        category: category.id,
        tags: ["accessibility", ...sc.map((c) => `wcag-${c}`)],
      },
    });
  };

  for (const e of report.results) {
    const location = { physicalLocation: { artifactLocation: artifactLocation(e.path) } };

    if (e.status === "error" || !e.analysis) {
      notifications.push({
        level: "error",
        message: { text: `${e.path}: ${e.error?.message ?? "could not be audited"}` },
        descriptor: { id: e.error?.code ?? "error" },
        locations: [location],
      });
      continue;
    }

    for (const cat of e.analysis.categories) {
      const level = sarifLevel(cat.severity);
      const details = findingDetailsOf(cat);

      let structured = 0;
      if (details) {
        details.forEach((d, index) => {
          if (d.kind !== "failure" || typeof d.code !== "string") return;
          structured++;
          const sc = Array.isArray(d.sc) ? (d.sc as unknown[]).map(String) : [];
          rule(d.code, cat, sc);
          results.push({
            ruleId: d.code,
            level,
            message: { text: typeof d.text === "string" ? d.text : cat.findings[index] },
            locations: [location],
            partialFingerprints: { "a11yAudit/v1": fingerprint(e.path, d.code, String(index)) },
            properties: {
              category: cat.id,
              severity: cat.severity,
              categoryScore: cat.score,
              ...(typeof d.count === "number" ? { count: d.count } : {}),
              ...(typeof d.total === "number" ? { total: d.total } : {}),
              ...(Array.isArray(d.pages) ? { pages: d.pages } : {}),
              ...(sc.length ? { wcag: sc } : {}),
            },
          });
        });
      }

      // The category-level result: used when the engine gave no structured
      // findings — and ALSO when it gave some but marked none as a failure in
      // a category that did not pass, so a failing category is never silent.
      if (structured > 0) continue;
      if (cat.score === null || severityRank(cat.severity) === 0) continue;
      const headlines = cat.findings.filter(isHeadlineFinding);
      rule(cat.id, cat, []);
      results.push({
        ruleId: cat.id,
        level,
        message: {
          text: `${cat.label}: ${cat.score}/100 (${cat.severity}).${
            headlines.length ? " " + headlines.slice(0, 5).join(" ") : ""
          }`,
        },
        locations: [location],
        partialFingerprints: { "a11yAudit/v1": fingerprint(e.path, cat.id) },
        properties: { category: cat.id, severity: cat.severity, categoryScore: cat.score },
      });
    }
  }

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: report.tool.name,
            version: report.tool.version,
            informationUri: INFORMATION_URI,
            rules: [...rules.values()],
          },
        },
        invocations: [
          {
            executionSuccessful: report.summary.errors === 0,
            exitCode: report.summary.exitCode,
            ...(notifications.length ? { toolExecutionNotifications: notifications } : {}),
          },
        ],
        results,
        properties: { summary: report.summary },
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}

/** Entries that failed a gate, for the closing lines of a text report. */
export function failedEntries(report: AuditReport): AuditEntry[] {
  return report.results.filter((e) => e.passed === false);
}
