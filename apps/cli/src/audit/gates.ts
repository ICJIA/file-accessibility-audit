/**
 * The pass/fail rules, and the baseline they can be measured against.
 *
 * WITHOUT a baseline, every gate that was asked for applies to every file.
 *
 * WITH a baseline, the question changes from "is this document good enough?"
 * to "did anyone make it worse?":
 *
 *  - a file the baseline knows fails ONLY when its score is lower than the
 *    recorded one — a repository's existing documents do not block a pull
 *    request that never touched them;
 *  - a file the baseline does not know is NEW, and has to clear the ordinary
 *    gates (--fail-under, --fail-on, --fail-on-conformance).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AnalysisResult } from "@file-audit/analyzer";
import {
  TOOL_NAME,
  UsageError,
  type AuditEntry,
  type AuditOptions,
  type GateFailure,
} from "./types.js";

export const BASELINE_SCHEMA_VERSION = 1;

const SEVERITY_RANK: Record<string, number> = { minor: 1, moderate: 2, critical: 3 };

/** A category's severity as a rank; 0 for Pass, unscored, or advisory-only. */
export function severityRank(severity: string | null | undefined): number {
  return SEVERITY_RANK[String(severity ?? "").toLowerCase()] ?? 0;
}

/** WCAG failures the engine CONFIRMED. A "likely — please verify" finding is
 *  a judgement from how the page looks, and does not trip the gate. */
export function confirmedFailureCount(analysis: AnalysisResult): number | null {
  const conformance = analysis.conformance;
  if (!conformance) return null;
  return (conformance.failures ?? []).filter((f) => !(f as { likely?: boolean }).likely).length;
}

export interface BaselineRecord {
  score: number;
  sha256?: string;
}

export interface Baseline {
  byPath: Map<string, BaselineRecord>;
  byHash: Map<string, BaselineRecord>;
}

const HASH_KEY = /^sha256:([0-9a-f]{64})$/i;

/**
 * Read a baseline. Two layouts are accepted:
 *
 *   { "schemaVersion": 1, "files": { "docs/a.pdf": { "score": 82, "sha256": "…" } } }
 *   { "docs/a.pdf": 82, "sha256:9f2c…": 71 }            (a plain map, by hand)
 *
 * A key is a path relative to the working directory, or `sha256:<hex>` to
 * pin a score to a file's contents wherever it lives.
 */
export function loadBaseline(file: string): Baseline {
  if (!existsSync(file)) {
    throw new UsageError(`Baseline file not found: ${file} (create it with --update-baseline)`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf-8"));
  } catch (err) {
    throw new UsageError(`Baseline file is not valid JSON: ${file} (${(err as Error).message})`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new UsageError(`Baseline file must contain a JSON object: ${file}`);
  }
  const obj = raw as Record<string, unknown>;
  const map =
    obj.files && typeof obj.files === "object" && !Array.isArray(obj.files)
      ? (obj.files as Record<string, unknown>)
      : obj;

  const baseline: Baseline = { byPath: new Map(), byHash: new Map() };
  for (const [key, value] of Object.entries(map)) {
    let record: BaselineRecord | null = null;
    if (typeof value === "number" && Number.isFinite(value)) {
      record = { score: value };
    } else if (value && typeof value === "object") {
      const v = value as { score?: unknown; sha256?: unknown };
      if (typeof v.score === "number" && Number.isFinite(v.score)) {
        record = { score: v.score, sha256: typeof v.sha256 === "string" ? v.sha256 : undefined };
      }
    }
    if (!record) {
      // Top-level bookkeeping keys of the plain layout are not entries.
      if (map === obj && (key === "schemaVersion" || key === "tool")) continue;
      throw new UsageError(`Baseline entry "${key}" in ${file} has no numeric score`);
    }
    const hashKey = HASH_KEY.exec(key);
    if (hashKey) {
      baseline.byHash.set(hashKey[1].toLowerCase(), record);
    } else {
      baseline.byPath.set(key, record);
      if (record.sha256) baseline.byHash.set(record.sha256.toLowerCase(), record);
    }
  }
  return baseline;
}

/** The baseline's record for a file: by path first, then by content — so a
 *  renamed or moved document is still recognised as the same one. */
export function baselineFor(
  baseline: Baseline | null,
  path: string,
  sha256: string | null,
): BaselineRecord | null {
  if (!baseline) return null;
  return baseline.byPath.get(path) ?? (sha256 ? baseline.byHash.get(sha256) : undefined) ?? null;
}

export function evaluateGates(
  analysis: AnalysisResult,
  options: Pick<AuditOptions, "failUnder" | "failOn" | "failOnConformance">,
  known: BaselineRecord | null,
): GateFailure[] {
  const score = analysis.overallScore;

  if (known) {
    return score < known.score
      ? [
          {
            gate: "baseline",
            message: `score fell from ${known.score} to ${score} since the baseline`,
          },
        ]
      : [];
  }

  const failures: GateFailure[] = [];
  if (options.failUnder !== null && score < options.failUnder) {
    failures.push({
      gate: "fail-under",
      message: `score ${score} is below the minimum of ${options.failUnder}`,
    });
  }
  if (options.failOn) {
    const limit = severityRank(options.failOn);
    const hit = analysis.categories.filter((c) => severityRank(c.severity) >= limit);
    if (hit.length > 0) {
      failures.push({
        gate: "fail-on",
        message: `${hit.length} categor${hit.length === 1 ? "y" : "ies"} at ${options.failOn} or worse: ${hit
          .map((c) => `${c.label} (${c.severity})`)
          .join(", ")}`,
      });
    }
  }
  if (options.failOnConformance) {
    const confirmed = confirmedFailureCount(analysis) ?? 0;
    if (confirmed > 0) {
      const criteria = (analysis.conformance?.failures ?? [])
        .filter((f) => !(f as { likely?: boolean }).likely)
        .map((f) => f.sc);
      failures.push({
        gate: "fail-on-conformance",
        message: `${confirmed} confirmed WCAG failure${confirmed === 1 ? "" : "s"}: ${[...new Set(criteria)].join(", ")}`,
      });
    }
  }
  return failures;
}

/**
 * Write the baseline from this run. Files audited now get their new score. A
 * file that could not be audited this time keeps the entry it had; so does a
 * file that was simply not part of this run, as long as it still exists —
 * updating from a sub-folder must not forget the rest of the repository.
 */
export function writeBaseline(
  file: string,
  entries: AuditEntry[],
  previous: Baseline | null,
  opts: { cwd: string; version: string },
): number {
  const files = new Map<string, BaselineRecord>();
  if (previous) {
    for (const [path, record] of previous.byPath) {
      if (existsSync(resolve(opts.cwd, path))) files.set(path, record);
    }
  }
  for (const entry of entries) {
    if (entry.status !== "ok" || entry.score === null) continue;
    files.set(entry.path, {
      score: entry.score,
      ...(entry.sha256 ? { sha256: entry.sha256 } : {}),
    });
  }
  const sorted = [...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const body = {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    tool: { name: TOOL_NAME, version: opts.version },
    files: Object.fromEntries(sorted),
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(body, null, 2) + "\n");
  return sorted.length;
}
