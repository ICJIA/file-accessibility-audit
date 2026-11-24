/**
 * Finding codes — the machine-readable twin of every `findings` string.
 *
 * WHY: a category's findings are prose, and downstream code used to recover
 * meaning from the wording (regexes for counts, needle matching for which
 * rule fired). A copy edit could silently break a fix-time estimate, and
 * SARIF output or translation was impossible. Each finding now also carries a
 * stable `code`, a `kind`, and its numbers (`FindingDetail`, packages/shared).
 *
 * HOW, and why this way. The scorers build `findings` arrays with every
 * array operation there is — push, unshift, splice, spread, index assignment,
 * helper functions that return a string or null — so a second array kept in
 * step by hand beside each of ~500 sites would drift. Instead the STRING is
 * tagged where it is born:
 *
 *     findings.push(fd("xlsx.alt_text.images_missing_alt", { count: n })`${n} image(s) are missing alt text.`);
 *     findings.push(fd("docx.alt_text.drawn_shapes")(drawnShapes));
 *
 * `fd(code, meta)` returns a function usable as a template tag or as a plain
 * call. It returns the string it was given, UNCHANGED — byte for byte, the
 * interpolation is the language's own — and notes "this text is this code"
 * for the scoring run in progress. When the run ends, `withFindingDetails`
 * walks each category's finished `findings` and writes `findingDetails`
 * beside it by looking each string up. The strings themselves are never
 * touched, so no score, grade, wording or ordering can move.
 *
 * A string nobody tagged still gets a detail (kind read from its prefix) with
 * the code `<format>.<category>.uncoded`. That code is deliberately NOT in
 * the registry, so findingCodes.test.ts fails on it: an untagged finding is a
 * bug to fix at its push site, never a shipped code.
 *
 * Scoring is synchronous, so one module-level "current run" is safe; nested
 * runs are restored on exit.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RESULT_SCHEMA_VERSION,
  findingCodeInfo,
  findingKindFromPrefix,
  type CategoryResult,
  type FileType,
  type FindingCode,
  type FindingCodeInfo,
  type FindingDetail,
} from "@file-audit/shared";

/** The numbers and references a finding carries beside its code. */
export interface FindingMeta {
  /** How many things the finding is about. */
  count?: number;
  /** Out of how many, when the finding is a share. */
  total?: number;
  /** 1-based page numbers the finding names. */
  pages?: number[];
  /** WCAG criteria, when they differ from the registry's for this code. */
  sc?: string[];
}

type Run = Map<string, FindingDetail[]>;
let activeRun: Run | null = null;

function record(code: FindingCode, text: string, meta: FindingMeta | undefined): string {
  if (!activeRun || typeof text !== "string") return text;
  // The type guarantees `code` is registered; the lookup is still guarded so
  // tagging can never be the reason a document fails to score.
  const info: FindingCodeInfo | undefined = findingCodeInfo(code);
  const detail: FindingDetail = {
    code,
    kind: info?.kind ?? findingKindFromPrefix(text) ?? "info",
    text,
  };
  if (meta) {
    if (typeof meta.count === "number" && Number.isFinite(meta.count)) detail.count = meta.count;
    if (typeof meta.total === "number" && Number.isFinite(meta.total)) detail.total = meta.total;
    if (meta.pages && meta.pages.length > 0) detail.pages = [...meta.pages];
  }
  const sc = meta?.sc ?? info?.sc;
  if (sc && sc.length > 0) detail.sc = [...sc];
  const known = activeRun.get(text);
  if (known) known.push(detail);
  else activeRun.set(text, [detail]);
  return text;
}

/** What `fd(code)` returns: call it on a string, or use it as a template tag.
 *  Either way the result is exactly the string an untagged expression would
 *  have produced. */
export interface FindingTagger {
  (text: string): string;
  (strings: TemplateStringsArray, ...values: unknown[]): string;
}

/**
 * Tag a finding string with its code. See the file header.
 *
 *     fd("pdf.bookmarks.bookmarks_found", { count: n })`${n} bookmark(s) found`
 *     fd("docx.alt_text.placeholder_alt")(placeholders)
 */
export function fd(code: FindingCode, meta?: FindingMeta): FindingTagger {
  return (strings: string | TemplateStringsArray, ...values: unknown[]): string => {
    if (typeof strings === "string") return record(code, strings, meta);
    // Exactly what an untagged template literal evaluates to: each cooked
    // string followed by the string conversion of its substitution.
    let text = strings[0];
    for (let i = 0; i < values.length; i++) text += `${values[i]}${strings[i + 1]}`;
    return record(code, text, meta);
  };
}

/** Tag every line of a list a helper built, choosing each line's code from
 *  the line (used for outlines: a divider, then indented signal lines). */
export function fdEach(lines: string[], codeFor: (line: string) => FindingCode): string[] {
  for (const line of lines) record(codeFor(line), line, undefined);
  return lines;
}

function resolve(
  run: Run,
  format: FileType,
  categoryId: string,
  text: string,
  nth: number,
): FindingDetail {
  const tagged = typeof text === "string" ? run.get(text) : undefined;
  if (tagged) {
    // The same words can be tagged in two categories, so only a code that
    // belongs here counts: this category's, or the format's `general` codes
    // (lines that can land in any category). Words tagged for a DIFFERENT
    // category are not this finding's code — fall through to `uncoded`.
    //
    // The same words can also be tagged twice in ONE category under two
    // codes (one link listed in two of the link lists). Tags are recorded in
    // the order the lines are written, so the nth occurrence of a text in a
    // category takes its nth tag; the last tag covers any further repeats.
    const here = tagged.filter((d) => d.code.startsWith(`${format}.${categoryId}.`));
    const own =
      here[Math.min(nth, here.length - 1)] ??
      tagged.find((d) => d.code.startsWith(`${format}.general.`));
    if (own) return { ...own };
  }
  const str = typeof text === "string" ? text : String(text);
  return {
    code: `${format}.${categoryId}.uncoded`,
    kind: findingKindFromPrefix(str) ?? "info",
    text,
  };
}

let cachedEngineVersion: string | null = null;

/** The analyzer package's version — "unknown" if its package.json cannot be
 *  read. Read once. */
export function analyzerEngineVersion(): string {
  if (cachedEngineVersion !== null) return cachedEngineVersion;
  let version = "unknown";
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(path.resolve(here, "../../package.json"), "utf8"));
    if (typeof pkg.version === "string" && pkg.version.length > 0) version = pkg.version;
  } catch {
    // keep "unknown"
  }
  cachedEngineVersion = version;
  return version;
}

interface Scored {
  categories: CategoryResult[];
  scoreProfiles?: Record<string, { categories?: CategoryResult[] } | undefined>;
  schemaVersion?: number;
  engineVersion?: string;
}

/**
 * Run one document's scoring with finding tagging on, then write
 * `findingDetails` beside every category's `findings` (the top-level
 * categories and each score profile's), and stamp the result with
 * `schemaVersion` and `engineVersion`. Changes nothing else.
 */
export function withFindingDetails<T extends Scored>(format: FileType, score: () => T): T {
  const outer = activeRun;
  const run: Run = new Map();
  activeRun = run;
  let result: T;
  try {
    result = score();
  } finally {
    activeRun = outer;
  }
  const seen = new Set<CategoryResult>();
  const lists = [result.categories];
  for (const profile of Object.values(result.scoreProfiles ?? {})) {
    if (profile?.categories) lists.push(profile.categories);
  }
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const category of list) {
      if (!category || seen.has(category) || !Array.isArray(category.findings)) continue;
      seen.add(category);
      const occurrences = new Map<string, number>();
      category.findingDetails = category.findings.map((text) => {
        const nth = occurrences.get(text) ?? 0;
        occurrences.set(text, nth + 1);
        return resolve(run, format, category.id, text, nth);
      });
    }
  }
  result.schemaVersion = RESULT_SCHEMA_VERSION;
  result.engineVersion = analyzerEngineVersion();
  return result;
}
