/**
 * The `audit` command's own data shapes.
 *
 * AuditReport is the command's PUBLIC machine-readable contract (the `json`
 * and `ndjson` formats print it; every other format is derived from it).
 * Changing or removing a field is a breaking change: bump REPORT_SCHEMA_VERSION
 * and say so in the changelog. Adding an optional field is not.
 */
import type { AnalysisResult } from "@file-audit/analyzer";

export const REPORT_SCHEMA_VERSION = 1;
export const TOOL_NAME = "a11y-audit";

export const FORMATS = ["text", "json", "ndjson", "csv", "junit", "sarif"] as const;
export type OutputFormat = (typeof FORMATS)[number];

export const SEVERITY_LEVELS = ["critical", "moderate", "minor"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

/** What the process ends with. Documented in --help and the README. */
export const EXIT = {
  /** Every file was analysed and every gate passed. */
  OK: 0,
  /** At least one gate failed (this wins over ANALYSIS_ERROR). */
  GATE_FAILED: 1,
  /** Bad flag, bad config, missing path, nothing to audit, qpdf missing. */
  USAGE: 2,
  /** One or more files could not be analysed, and no gate failed. */
  ANALYSIS_ERROR: 3,
} as const;

/** Everything the command can be told, after config file + flags are merged. */
export interface AuditOptions {
  paths: string[];
  exclude: string[];
  concurrency: number;
  format: OutputFormat;
  output: string | null;
  failUnder: number | null;
  failOn: SeverityLevel | null;
  failOnConformance: boolean;
  baseline: string | null;
  updateBaseline: boolean;
  allowEmpty: boolean;
  quiet: boolean;
}

export type GateName = "fail-under" | "fail-on" | "fail-on-conformance" | "baseline";

export interface GateFailure {
  gate: GateName;
  message: string;
}

/** One audited file. Every key is always present; unknowns are null. */
export interface AuditEntry {
  /** Path relative to the working directory, forward slashes. */
  path: string;
  filename: string;
  /** SHA-256 of the file's bytes (hex), or null when it could not be read. */
  sha256: string | null;
  bytes: number | null;
  status: "ok" | "error";
  fileType: AnalysisResult["fileType"] | null;
  pageCount: number | null;
  score: number | null;
  grade: string | null;
  /** The WCAG verdict's status, or null (errors, or a result without one). */
  conformance: "fail" | "no-automated-failures" | "incomplete" | null;
  /** WCAG failures the engine confirmed (excludes "likely — please verify"). */
  confirmedFailures: number | null;
  /** Did every gate pass? null when the file could not be analysed. */
  passed: boolean | null;
  gateFailures: GateFailure[];
  /** The baseline's score for this file and the change since, when known. */
  baseline: { score: number; delta: number } | null;
  error: { code: string; message: string } | null;
  /** The engine's full result, verbatim. null when status is "error". */
  analysis: AnalysisResult | null;
}

export interface AuditSummary {
  files: number;
  analysed: number;
  errors: number;
  passed: number;
  failed: number;
  averageScore: number | null;
  lowestScore: number | null;
  grades: Record<string, number>;
  gates: {
    failUnder: number | null;
    failOn: SeverityLevel | null;
    failOnConformance: boolean;
    baseline: string | null;
  };
  exitCode: number;
}

export interface AuditReport {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  tool: { name: typeof TOOL_NAME; version: string };
  summary: AuditSummary;
  results: AuditEntry[];
}

/** A mistake in how the command was invoked — always exit status 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}
