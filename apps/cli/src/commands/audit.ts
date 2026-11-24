import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { analyzeDocument, type AnalysisResult } from "@file-audit/analyzer";
import {
  RESET,
  BOLD,
  DIM,
  RED,
  gradeColor,
  severityColor,
  gradeLabel,
  padRight,
  checkQpdf,
} from "../lib/colors.js";
import { VERSION } from "../version.js";
import { clampConcurrency, withBusyRetry } from "./publist.js";
import { collectInputs, type InputFile } from "../audit/inputs.js";
import { helpText, loadConfig, mergeOptions, parseFlags } from "../audit/options.js";
import {
  baselineFor,
  confirmedFailureCount,
  evaluateGates,
  loadBaseline,
  writeBaseline,
  type Baseline,
} from "../audit/gates.js";
import { toCsv, toJson, toJunit, toNdjson, toSarif } from "../audit/formats.js";
import {
  EXIT,
  REPORT_SCHEMA_VERSION,
  TOOL_NAME,
  UsageError,
  type AuditEntry,
  type AuditOptions,
  type AuditReport,
} from "../audit/types.js";

/** The human-readable report for one file, one string per printed line. */
export function resultLines(result: AnalysisResult): string[] {
  const out: string[] = [];
  const line = "\u2501";
  const thinLine = "\u2500";

  out.push("");
  out.push(
    `${BOLD}${line.repeat(3)} ${result.filename} ${line.repeat(Math.max(1, 55 - result.filename.length))}${RESET}`,
  );
  out.push("");

  const gc = gradeColor(result.grade);
  out.push(
    `  ${BOLD}Score:${RESET} ${gc}${result.overallScore}/100${RESET}  ${BOLD}Grade:${RESET} ${gc}${result.grade}${RESET} (${gradeLabel(result.grade)})`,
  );
  out.push(
    `  ${BOLD}Type:${RESET} ${result.fileType.toUpperCase()}   ${BOLD}Pages:${RESET} ${result.pageCount}`,
  );
  out.push("");

  const colLabel = 24;
  const colScore = 7;
  // No per-category letter (2026-09-01): a letter beside a category score
  // gets read as the DOCUMENT's grade. Score keeps the band colour; the
  // overall "Grade:" line above is the only letter printed.
  out.push(
    `  ${BOLD}${padRight("Category", colLabel)}${padRight("Score", colScore)}Severity${RESET}`,
  );
  out.push(`  ${DIM}${thinLine.repeat(colLabel + colScore + 10)}${RESET}`);

  for (const cat of result.categories) {
    const scoreStr = cat.score !== null ? String(cat.score) : "N/A";
    const sevStr = cat.severity ?? "\u2014";
    const sc = gradeColor(cat.grade);
    const sevc = severityColor(cat.severity);

    out.push(
      `  ${padRight(cat.label, colLabel)}` +
        `${sc}${padRight(scoreStr, colScore)}${RESET}` +
        `${sevc}${sevStr}${RESET}`,
    );
  }

  out.push("");
  out.push(`  ${DIM}${result.executiveSummary}${RESET}`);
  out.push("");
  out.push(`${BOLD}${line.repeat(58)}${RESET}`);
  return out;
}

export function printResult(result: AnalysisResult): void {
  for (const line of resultLines(result)) console.log(line);
}

/** Seams for the test suite; a real run passes nothing. */
export interface AuditRuntime {
  /** Stands in for the working directory: relative paths, the config file,
   *  and the paths printed in reports are all resolved against it. */
  cwd?: string;
  /** Waits between retries when the engine reports it is busy. */
  busyRetryDelaysMs?: readonly number[];
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

function usageExit(err: UsageError): never {
  console.error(`${RED}Error: ${err.message}${RESET}`);
  console.error(`Run ${BOLD}a11y-audit --help${RESET} for usage`);
  process.exit(EXIT.USAGE);
}

/** Run `fn` over `items`, `limit` at a time, keeping results in input order. */
async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function errorEntry(
  input: InputFile,
  partial: Pick<AuditEntry, "sha256" | "bytes">,
  err: unknown,
): AuditEntry {
  const e = err as { message?: unknown; code?: unknown } | null;
  const raw = String(e?.message ?? err);
  const encrypted = raw === "encrypted";
  return {
    path: input.path,
    filename: basename(input.absPath),
    ...partial,
    status: "error",
    fileType: null,
    pageCount: null,
    score: null,
    grade: null,
    conformance: null,
    confirmedFailures: null,
    passed: null,
    gateFailures: [],
    baseline: null,
    error: {
      code: encrypted ? "encrypted" : typeof e?.code === "string" ? e.code : "analysis_failed",
      message: encrypted ? "password-protected and cannot be analyzed" : raw,
    },
    analysis: null,
  };
}

async function auditOne(
  input: InputFile,
  options: AuditOptions,
  baseline: Baseline | null,
  runtime: AuditRuntime,
): Promise<AuditEntry> {
  const partial: Pick<AuditEntry, "sha256" | "bytes"> = { sha256: null, bytes: null };
  try {
    const buffer = readFileSync(input.absPath);
    partial.bytes = buffer.length;
    partial.sha256 = createHash("sha256").update(buffer).digest("hex");
    const filename = basename(input.absPath);
    // The engine admits a fixed number of analyses at once and refuses the
    // rest as "busy". The pool never asks for more than that, so the retry is
    // a seatbelt — but a document must never be lost to it.
    const analysis = await withBusyRetry(
      () => analyzeDocument(buffer, filename),
      runtime.busyRetryDelaysMs,
    );
    const known = options.updateBaseline ? null : baselineFor(baseline, input.path, partial.sha256);
    const gateFailures = options.updateBaseline ? [] : evaluateGates(analysis, options, known);
    return {
      path: input.path,
      filename,
      ...partial,
      status: "ok",
      fileType: analysis.fileType,
      pageCount: analysis.pageCount,
      score: analysis.overallScore,
      grade: analysis.grade,
      conformance: analysis.conformance?.status ?? null,
      confirmedFailures: confirmedFailureCount(analysis),
      passed: gateFailures.length === 0,
      gateFailures,
      baseline: known ? { score: known.score, delta: analysis.overallScore - known.score } : null,
      error: null,
      analysis,
    };
  } catch (err) {
    return errorEntry(input, partial, err);
  }
}

export function buildReport(entries: AuditEntry[], options: AuditOptions): AuditReport {
  const ok = entries.filter((e) => e.status === "ok");
  const scores = ok.map((e) => e.score).filter((s): s is number => s !== null);
  const failed = ok.filter((e) => e.passed === false).length;
  const errors = entries.length - ok.length;
  const grades: Record<string, number> = {};
  for (const e of ok) if (e.grade) grades[e.grade] = (grades[e.grade] ?? 0) + 1;
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    tool: { name: TOOL_NAME, version: VERSION },
    summary: {
      files: entries.length,
      analysed: ok.length,
      errors,
      passed: ok.length - failed,
      failed,
      averageScore: scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null,
      lowestScore: scores.length ? Math.min(...scores) : null,
      grades,
      gates: {
        failUnder: options.failUnder,
        failOn: options.failOn,
        failOnConformance: options.failOnConformance,
        baseline: options.baseline,
      },
      exitCode: failed > 0 ? EXIT.GATE_FAILED : errors > 0 ? EXIT.ANALYSIS_ERROR : EXIT.OK,
    },
    results: entries,
  };
}

/** The lines that say which files failed a gate, and why. */
function failureLines(report: AuditReport): string[] {
  const failed = report.results.filter((e) => e.passed === false);
  if (failed.length === 0) return [];
  const lines = [
    "",
    `${RED}${BOLD}FAILED:${RESET} ${failed.length} of ${report.summary.files} file(s) did not pass`,
  ];
  for (const e of failed) {
    for (const g of e.gateFailures) lines.push(`  ${RED}${e.path}: ${g.message}${RESET}`);
  }
  return lines;
}

function textReport(report: AuditReport): string[] {
  const lines: string[] = [];
  for (const e of report.results) {
    if (e.analysis) lines.push(...resultLines(e.analysis));
  }
  const s = report.summary;
  if (s.files > 1) {
    lines.push("");
    lines.push(
      `${BOLD}Summary:${RESET} ${s.files} files · ${s.passed} passed · ${s.failed} failed · ` +
        `${s.errors} could not be audited` +
        (s.averageScore !== null ? ` · average score ${s.averageScore}` : ""),
    );
  }
  lines.push(...failureLines(report));
  return lines;
}

export async function runAudit(argv: string[], runtime: AuditRuntime = {}): Promise<void> {
  const cwd = runtime.cwd ?? process.cwd();
  let options: AuditOptions;
  let inputs: InputFile[];
  let baseline: Baseline | null = null;
  let baselineFile: string | null = null;

  try {
    const flags = parseFlags(argv);
    if (flags.help) {
      console.log(helpText({ bold: BOLD, dim: DIM, reset: RESET }));
      process.exit(EXIT.OK);
    }
    if (flags.version) {
      console.log(`a11y-audit v${VERSION}`);
      process.exit(EXIT.OK);
    }
    const config = flags.noConfig ? { file: null, options: {} } : loadConfig(cwd, flags.configPath);
    options = mergeOptions(config.options, flags.options);
    if (options.paths.length === 0) throw new UsageError("No files specified");

    inputs = await collectInputs(options.paths, { cwd, exclude: options.exclude });
    if (inputs.length === 0 && !options.allowEmpty) {
      throw new UsageError(
        `No PDF, Word, PowerPoint or Excel files found in: ${options.paths.join(", ")} ` +
          `(pass --allow-empty if that is expected)`,
      );
    }

    if (options.baseline) {
      baselineFile = resolve(cwd, options.baseline);
      // --update-baseline may be creating the file for the first time.
      if (!options.updateBaseline || existsSync(baselineFile)) {
        baseline = loadBaseline(baselineFile);
      }
    }
  } catch (err) {
    if (err instanceof UsageError) usageExit(err);
    throw err;
  }

  // qpdf is only needed for PDFs; an Office-only run does not require it.
  if (inputs.some((f) => f.looksLikePdf) && !checkQpdf()) {
    console.error(`${RED}Error: qpdf is not installed or not found in PATH${RESET}`);
    console.error("");
    console.error("Install qpdf:");
    console.error(`  macOS:   ${BOLD}brew install qpdf${RESET}`);
    console.error(`  Ubuntu:  ${BOLD}sudo apt-get install qpdf${RESET}`);
    console.error(`  Fedora:  ${BOLD}sudo dnf install qpdf${RESET}`);
    console.error("");
    console.error(`Or set the QPDF_PATH environment variable to the qpdf binary location.`);
    process.exit(EXIT.USAGE);
  }

  const concurrency = clampConcurrency(options.concurrency);
  if (concurrency < options.concurrency && !options.quiet) {
    console.error(
      `${DIM}--concurrency ${options.concurrency} is more than the engine runs at once; using ${concurrency}.${RESET}`,
    );
  }

  const showProgress = !options.quiet && inputs.length > 1 && process.stderr.isTTY === true;
  let done = 0;
  const entries = await mapPool(inputs, concurrency, async (input) => {
    const entry = await auditOne(input, options, baseline, runtime);
    done++;
    if (entry.error) {
      console.error(
        entry.error.code === "encrypted"
          ? `${RED}Error: ${entry.path} is password-protected and cannot be analyzed${RESET}`
          : `${RED}Error analyzing ${entry.path}: ${entry.error.message}${RESET}`,
      );
    } else if (showProgress) {
      console.error(
        `${DIM}[${done}/${inputs.length}] ${entry.path}  ${entry.score} ${entry.grade}${RESET}`,
      );
    }
    return entry;
  });

  const report = buildReport(entries, options);

  if (options.updateBaseline && baselineFile) {
    const count = writeBaseline(baselineFile, entries, baseline, { cwd, version: VERSION });
    if (!options.quiet) console.error(`Baseline written: ${count} file(s) → ${baselineFile}`);
  }

  let content: string;
  switch (options.format) {
    case "json":
      content = toJson(report);
      break;
    case "ndjson":
      content = toNdjson(report);
      break;
    case "csv":
      content = toCsv(report);
      break;
    case "junit":
      content = toJunit(report, options.failOn);
      break;
    case "sarif":
      content = toSarif(report);
      break;
    default:
      content = textReport(report).join("\n");
  }

  if (options.output) {
    const file = resolve(cwd, options.output);
    mkdirSync(dirname(file), { recursive: true });
    const body = options.format === "text" ? content.replace(ANSI, "") : content;
    writeFileSync(file, body.endsWith("\n") ? body : body + "\n");
    if (!options.quiet) console.error(`Report written: ${file}`);
  } else if (content.length > 0) {
    console.log(content);
  }

  // A machine-readable report (or one written to a file) leaves nothing on
  // the screen to say WHY the run failed — say it on the error stream.
  if ((options.format !== "text" || options.output) && !options.quiet) {
    for (const line of failureLines(report)) if (line) console.error(line);
  }

  if (report.summary.exitCode !== EXIT.OK) process.exit(report.summary.exitCode);
}
