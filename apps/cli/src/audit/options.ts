/**
 * Flags, the config file, and how the two combine.
 *
 * Precedence, lowest to highest: built-in defaults → config file → flags.
 * Both sources go through the SAME validators, so a bad value is rejected
 * with the same message wherever it came from.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FORMATS,
  SEVERITY_LEVELS,
  UsageError,
  type AuditOptions,
  type OutputFormat,
  type SeverityLevel,
} from "./types.js";

/** Looked for in the working directory, in this order. */
export const CONFIG_FILENAMES = [".a11y-audit.json", "a11y-audit.config.json"] as const;
export const DEFAULT_BASELINE_FILE = ".a11y-audit-baseline.json";
export const DEFAULT_CONCURRENCY = 2;

export const DEFAULT_OPTIONS: AuditOptions = {
  paths: [],
  exclude: [],
  concurrency: DEFAULT_CONCURRENCY,
  format: "text",
  output: null,
  failUnder: null,
  failOn: null,
  failOnConformance: false,
  baseline: null,
  updateBaseline: false,
  allowEmpty: false,
  quiet: false,
};

export interface ParsedFlags {
  options: Partial<AuditOptions>;
  help: boolean;
  version: boolean;
  /** --config <file>; null = look for the default names. */
  configPath: string | null;
  noConfig: boolean;
}

function score(name: string, raw: unknown): number {
  const n = typeof raw === "number" ? raw : /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new UsageError(`${name} must be a number between 0 and 100`);
  }
  return n;
}

function concurrency(name: string, raw: unknown): number {
  const n = typeof raw === "number" ? raw : /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 1) {
    throw new UsageError(`${name} must be a whole number of 1 or more`);
  }
  return n;
}

function format(name: string, raw: unknown): OutputFormat {
  const v = String(raw).toLowerCase();
  if (!(FORMATS as readonly string[]).includes(v)) {
    throw new UsageError(`${name} must be one of: ${FORMATS.join(", ")}`);
  }
  return v as OutputFormat;
}

function severity(name: string, raw: unknown): SeverityLevel {
  const v = String(raw).toLowerCase();
  if (!(SEVERITY_LEVELS as readonly string[]).includes(v)) {
    throw new UsageError(`${name} must be one of: ${SEVERITY_LEVELS.join(", ")}`);
  }
  return v as SeverityLevel;
}

function text(name: string, raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new UsageError(`${name} needs a value`);
  }
  return raw;
}

function bool(name: string, raw: unknown): boolean {
  if (typeof raw !== "boolean") throw new UsageError(`${name} must be true or false`);
  return raw;
}

function stringList(name: string, raw: unknown): string[] {
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw) && raw.every((v) => typeof v === "string" && v.length > 0)) {
    return raw as string[];
  }
  throw new UsageError(`${name} must be a list of strings`);
}

/** Flags that take a value, mapped to how the value is stored. */
const VALUE_FLAGS: Record<string, (flag: string, v: string, o: Partial<AuditOptions>) => void> = {
  "--concurrency": (f, v, o) => void (o.concurrency = concurrency(f, v)),
  "-c": (f, v, o) => void (o.concurrency = concurrency("--concurrency", v)),
  "--format": (f, v, o) => void (o.format = format(f, v)),
  "-f": (f, v, o) => void (o.format = format("--format", v)),
  "--output": (f, v, o) => void (o.output = text(f, v)),
  "-o": (f, v, o) => void (o.output = text("--output", v)),
  "--fail-under": (f, v, o) => void (o.failUnder = score(f, v)),
  // The pre-gate name for --fail-under; kept so existing scripts still work.
  "--threshold": (f, v, o) => void (o.failUnder = score(f, v)),
  "--fail-on": (f, v, o) => void (o.failOn = severity(f, v)),
  "--baseline": (f, v, o) => void (o.baseline = text(f, v)),
  "--exclude": (f, v, o) => void (o.exclude = [...(o.exclude ?? []), text(f, v)]),
};

const BOOLEAN_FLAGS: Record<string, (o: Partial<AuditOptions>) => void> = {
  // The pre-format name for --format json.
  "--json": (o) => void (o.format = "json"),
  "--fail-on-conformance": (o) => void (o.failOnConformance = true),
  "--no-fail-on-conformance": (o) => void (o.failOnConformance = false),
  "--update-baseline": (o) => void (o.updateBaseline = true),
  "--allow-empty": (o) => void (o.allowEmpty = true),
  "--quiet": (o) => void (o.quiet = true),
  "-q": (o) => void (o.quiet = true),
};

export function parseFlags(argv: string[]): ParsedFlags {
  const parsed: ParsedFlags = {
    options: {},
    help: false,
    version: false,
    configPath: null,
    noConfig: false,
  };
  const paths: string[] = [];
  let onlyPaths = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (onlyPaths) {
      paths.push(arg);
      continue;
    }
    if (arg === "--") {
      // Everything after a bare `--` is a path. pnpm also inserts one in front
      // of the arguments it forwards, so a LEADING `--` changes nothing.
      if (i > 0) onlyPaths = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--version" || arg === "-v") {
      parsed.version = true;
      continue;
    }
    if (arg === "--no-config") {
      parsed.noConfig = true;
      continue;
    }
    if (!arg.startsWith("-") || arg === "-") {
      paths.push(arg);
      continue;
    }

    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? null : arg.slice(eq + 1);

    if (flag === "--config") {
      const value = inline ?? argv[++i];
      parsed.configPath = text(flag, value);
      continue;
    }
    if (flag in VALUE_FLAGS) {
      const value = inline ?? argv[++i];
      if (value === undefined) throw new UsageError(`${flag} needs a value`);
      VALUE_FLAGS[flag](flag, value, parsed.options);
      continue;
    }
    if (flag in BOOLEAN_FLAGS && inline === null) {
      BOOLEAN_FLAGS[flag](parsed.options);
      continue;
    }
    throw new UsageError(`Unknown option: ${arg}`);
  }

  if (paths.length > 0) parsed.options.paths = paths;
  return parsed;
}

/** Config-file keys and their validators. An unknown key is an error — a
 *  misspelt gate that silently did nothing would be worse than a refusal. */
const CONFIG_KEYS: Record<string, (name: string, v: unknown, o: Partial<AuditOptions>) => void> = {
  paths: (n, v, o) => void (o.paths = stringList(n, v)),
  exclude: (n, v, o) => void (o.exclude = stringList(n, v)),
  concurrency: (n, v, o) => void (o.concurrency = concurrency(n, v)),
  format: (n, v, o) => void (o.format = format(n, v)),
  output: (n, v, o) => void (o.output = text(n, v)),
  failUnder: (n, v, o) => void (o.failUnder = score(n, v)),
  failOn: (n, v, o) => void (o.failOn = severity(n, v)),
  failOnConformance: (n, v, o) => void (o.failOnConformance = bool(n, v)),
  baseline: (n, v, o) => void (o.baseline = text(n, v)),
  allowEmpty: (n, v, o) => void (o.allowEmpty = bool(n, v)),
  quiet: (n, v, o) => void (o.quiet = bool(n, v)),
};

export interface LoadedConfig {
  /** Absolute path of the file that was read, or null when none was. */
  file: string | null;
  options: Partial<AuditOptions>;
}

export function loadConfig(cwd: string, explicitPath: string | null): LoadedConfig {
  let file: string | null = null;
  if (explicitPath) {
    file = resolve(cwd, explicitPath);
    if (!existsSync(file)) throw new UsageError(`Config file not found: ${file}`);
  } else {
    for (const name of CONFIG_FILENAMES) {
      const candidate = resolve(cwd, name);
      if (existsSync(candidate)) {
        file = candidate;
        break;
      }
    }
  }
  if (!file) return { file: null, options: {} };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf-8"));
  } catch (err) {
    throw new UsageError(`Config file is not valid JSON: ${file} (${(err as Error).message})`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new UsageError(`Config file must contain a JSON object: ${file}`);
  }

  const options: Partial<AuditOptions> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key === "$schema" || key.startsWith("//")) continue; // room for a comment
    const apply = CONFIG_KEYS[key];
    if (!apply) {
      throw new UsageError(
        `Unknown key "${key}" in ${file}. Known keys: ${Object.keys(CONFIG_KEYS).join(", ")}`,
      );
    }
    apply(`"${key}" in ${file}`, value, options);
  }
  return { file, options };
}

/** defaults ← config ← flags. `exclude` is the one list that ADDS UP. */
export function mergeOptions(
  config: Partial<AuditOptions>,
  flags: Partial<AuditOptions>,
): AuditOptions {
  const merged: AuditOptions = { ...DEFAULT_OPTIONS, ...config, ...flags };
  merged.exclude = [...(config.exclude ?? []), ...(flags.exclude ?? [])];
  if (merged.updateBaseline && !merged.baseline) merged.baseline = DEFAULT_BASELINE_FILE;
  return merged;
}

export function helpText(c: { bold: string; dim: string; reset: string }): string {
  const { bold: B, dim: D, reset: R } = c;
  return `
${B}a11y-audit${R} — accessibility audit for PDF, Word, PowerPoint and Excel files

${B}Usage:${R}
  a11y-audit [audit] <path ...> [options]   Audit files, folders or globs
  a11y-audit publist [options]              Audit the ICJIA publication list
  a11y-audit --help | --version

${B}What you can pass as a path:${R}
  a file           report.pdf            (the type is read from the file's contents,
                                          so a PDF named report.bin still works)
  a folder         docs/                 every PDF, .docx, .pptx and .xlsx inside it,
                                          at any depth (node_modules, .git and
                                          dot-folders are skipped)
  a glob           "docs/**/*.pdf"       quote it so the shell leaves it alone
                                          (supports * ** ? [abc] {a,b})

${B}Output:${R}
  -f, --format <name>     text (default), json, ndjson, csv, junit, sarif
  -o, --output <file>     Write the report to a file instead of the screen
      --json              Same as --format json
  -q, --quiet             No progress lines on the error stream

${B}Gates${R} ${D}(each one can turn the exit status to 1)${R}${B}:${R}
      --fail-under <n>          Fail a file whose score is below n (0-100).
                                --threshold <n> is the older name for this.
      --fail-on <level>         Fail a file with any category at this severity
                                or worse: critical, moderate, or minor
      --fail-on-conformance     Fail a file with a confirmed WCAG failure
      --baseline <file>         Compare with scores saved earlier. A file that is
                                in the baseline fails ONLY if its score dropped;
                                the other gates then apply to new files only.
      --update-baseline         Save this run's scores as the baseline and stop
                                (default file: ${DEFAULT_BASELINE_FILE})

${B}Running:${R}
  -c, --concurrency <n>   Files audited at once (default ${DEFAULT_CONCURRENCY}; the engine's own limit caps it)
      --exclude <glob>    Leave out matching paths (repeatable)
      --allow-empty       Finding nothing to audit is a pass, not an error
      --config <file>     Read defaults from this file
      --no-config         Ignore any config file

${B}Config file:${R}
  ${CONFIG_FILENAMES.join(" or ")} in the working directory supplies defaults.
  Flags win. Keys: paths, exclude, concurrency, format, output, failUnder,
  failOn, failOnConformance, baseline, allowEmpty, quiet.

${B}Exit status:${R}
  0   every file was audited and every gate passed
  1   a gate failed
  2   the command could not start: bad flag or config, path not found,
      nothing to audit, or qpdf missing
  3   one or more files could not be audited (and no gate failed)

${B}Example — fail a pull request when a document gets worse:${R}
  ${D}# once, on the main branch: record where every document stands today${R}
  a11y-audit docs/ --update-baseline
  ${D}# in CI: old documents must not drop; new ones need 80 and no WCAG failure${R}
  a11y-audit docs/ --baseline ${DEFAULT_BASELINE_FILE} \\
    --fail-under 80 --fail-on-conformance --format sarif --output a11y.sarif

${B}Example — a one-off report on a folder, as a spreadsheet:${R}
  a11y-audit ~/Documents/reports --format csv --output reports-audit.csv

${D}Run "a11y-audit publist --help" for the publication-list command.${R}
`;
}
