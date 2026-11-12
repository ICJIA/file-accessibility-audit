import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { analyzeDocument } from "@file-audit/analyzer";
import { ANALYSIS, PUBLIST } from "#config";
import { fetchPublications, loadPublicationsFromFile } from "../lib/graphql.js";
import {
  initCache,
  getCached,
  upsertResult,
  upsertError,
  getAllSuccessful,
  getStaleCount,
  clearCache,
  backfillMetadata,
} from "../lib/cache.js";
import { generateCsv } from "../lib/csv.js";
import { generateHtml } from "../lib/html.js";
import { showProgress, clearProgress } from "../lib/progress.js";
import {
  RESET,
  BOLD,
  DIM,
  RED,
  GREEN,
  YELLOW,
  CYAN,
  gradeColor,
  checkQpdf,
} from "../lib/colors.js";
import type { Publication } from "../lib/graphql.js";
import { VERSION } from "../version.js";

const MAX_FILE_SIZE = (ANALYSIS?.MAX_FILE_SIZE_MB ?? 50) * 1024 * 1024;
const DOWNLOAD_TIMEOUT = 60_000;

/**
 * The engine admits ANALYSIS.MAX_CONCURRENT_ANALYSES analyses at a time
 * (packages/analyzer pdfAnalyzer.ts — one process-wide semaphore shared by
 * every format). Asking for more does not make a run faster: the extra
 * workers download their files, then stand in the engine's line holding them
 * in memory, and anything still waiting after 60 seconds is rejected with
 * "Server busy". `--concurrency` used to accept up to 10; a long run at 10
 * lost documents that way, left them out of the CSV, and exited 0.
 */
export const ENGINE_CONCURRENCY_LIMIT = Math.max(1, ANALYSIS?.MAX_CONCURRENT_ANALYSES ?? 2);
const DEFAULT_CONCURRENCY = Math.min(3, ENGINE_CONCURRENCY_LIMIT);

/** Clamp a requested worker count to what the engine will actually admit. */
export function clampConcurrency(requested: number): number {
  return Math.min(Math.max(1, Math.floor(requested)), ENGINE_CONCURRENCY_LIMIT);
}

/** Waits between attempts when the engine reports it is busy. */
const BUSY_RETRY_DELAYS_MS = [2_000, 10_000, 30_000];

/** The engine's own "all slots taken" refusal (HTTP-style 503) — the one
 *  analysis error that says nothing about the document. */
export function isBusyError(err: unknown): boolean {
  const e = err as { status?: unknown; message?: unknown } | null;
  return e?.status === 503 || /server busy/i.test(String(e?.message ?? ""));
}

/**
 * Run `fn`, trying again after each delay while it fails with a busy error.
 * Any other error — and a busy error that outlasts every delay — propagates.
 */
export async function withBusyRetry<T>(
  fn: () => Promise<T>,
  delaysMs: readonly number[] = BUSY_RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isBusyError(err) || attempt >= delaysMs.length) throw err;
      await sleep(delaysMs[attempt]);
    }
  }
}

/** Seams for the test suite; a real run passes nothing. */
export interface PublistRuntime {
  /** Directory holding cache.db (default: ~/.a11y-audit). */
  cacheDir?: string;
  /** Waits between busy retries (default: BUSY_RETRY_DELAYS_MS). */
  busyRetryDelaysMs?: readonly number[];
}

interface PublistArgs {
  from?: string;
  output: string;
  force: boolean;
  concurrency: number;
  clear: boolean;
  help: boolean;
}

function parsePublistArgs(argv: string[]): PublistArgs {
  const result: PublistArgs = {
    output: "./publist-audit.csv",
    force: false,
    concurrency: DEFAULT_CONCURRENCY,
    clear: false,
    help: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--from") {
      i++;
      result.from = argv[i];
    } else if (arg === "--output" || arg === "-o") {
      i++;
      result.output = argv[i];
    } else if (arg === "--force") {
      result.force = true;
    } else if (arg === "--concurrency" || arg === "-c") {
      i++;
      const val = parseInt(argv[i], 10);
      if (isNaN(val) || val < 1) {
        console.error(
          `${RED}Error: --concurrency must be a whole number from 1 to ${ENGINE_CONCURRENCY_LIMIT}${RESET}`,
        );
        process.exit(2);
      }
      // Above the engine's limit is not an error — an existing `-c 5` in a
      // script keeps working — but it is not honoured either, and says so.
      result.concurrency = clampConcurrency(val);
      if (result.concurrency !== val) {
        console.error(
          `${YELLOW}Note: --concurrency ${val} lowered to ${result.concurrency} — the scoring engine runs at most ${ENGINE_CONCURRENCY_LIMIT} analyses at once.${RESET}`,
        );
      }
    } else if (arg === "--clear") {
      result.clear = true;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--") {
      // ignore -- separator from pnpm
    } else if (arg.startsWith("-")) {
      console.error(`${RED}Error: Unknown option: ${arg}${RESET}`);
      process.exit(2);
    }
    i++;
  }

  return result;
}

function printPublistHelp(): void {
  console.log(`
${BOLD}a11y-audit publist${RESET} — Audit ICJIA publications

${BOLD}Usage:${RESET}
  a11y-audit publist                         Fetch & audit all ICJIA publications
  a11y-audit publist --force                 Re-audit everything (ignore cache)
  a11y-audit publist --from pubs.json        Use a local publication list
  a11y-audit publist --output results.csv    Custom CSV output path

${BOLD}Options:${RESET}
  --from <file>        Local JSON file with publication list (default: fetch from API)
  --output, -o <path>  CSV output path (default: ./publist-audit.csv)
  --force              Clear cache and re-audit all publications from scratch
  --clear              Clear cache only (no scan). Use when files have been remediated
  --concurrency, -c    Number of concurrent analyses (default: ${DEFAULT_CONCURRENCY}, max: ${ENGINE_CONCURRENCY_LIMIT} —
                       the scoring engine's own limit; higher values are lowered to it)
  --help, -h           Show this help

${BOLD}How it works:${RESET}
  1. Fetches publication list from ICJIA's API (or local file)
  2. Filters to supported document types: PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx)
  3. Downloads and audits each file using the accessibility scoring engine
  4. Caches results in ~/.a11y-audit/cache.db (re-runs skip already-audited files)
  5. Writes a detailed CSV with grades, scores, and category breakdowns
  6. Saves a dated copy in ./reports/ for audit trail

${BOLD}Cache and versions:${RESET}
  A cached result belongs to the version of the scoring engine that produced
  it (this is v${VERSION}). After an upgrade, a plain re-run audits every
  publication again, so one report never mixes scores from two versions.
  A file that could not be found (HTTP 403/404/410) stays cached until
  --clear or --force.

${BOLD}Exit codes:${RESET}
  0  every listed publication was audited (or was already cached)
  1  one or more publications could not be audited — they are listed at the
     end of the run, are NOT in the CSV, and are retried on the next run
  2  usage error

${BOLD}Examples:${RESET}
  a11y-audit publist                         # First run: audits everything
  a11y-audit publist                         # Re-run: only audits new additions
                                             # (everything again after an upgrade)
  a11y-audit publist --force                 # Full re-scan of all files
  a11y-audit publist --clear                 # Wipe cache (e.g. after remediation)
  a11y-audit publist -o ~/Desktop/audit.csv  # Custom output location
`);
}

// Format-agnostic: no PDF-specific behavior here (was named downloadPdf back
// when publist only ever fed it .pdf links; analyzeDocument dispatches by
// sniffing the downloaded buffer's content, not the URL's extension).
// Exported for direct unit testing (see __tests__/publist.test.ts).
//
// RB2-b [LOW] hardening: reads the body as a stream and enforces the size
// cap on cumulative bytes AS THEY ARRIVE, instead of buffering the full body
// via resp.arrayBuffer() and only checking afterward. A server that omits
// or lies about Content-Length could otherwise stream unbounded bytes into
// memory before the old post-hoc check ever fired. Mirrors the intent of
// the web API's safeFetch.ts maxBytes handling, kept CLI-local (no server
// import) via a small reader loop over resp.body's reader.
export async function downloadFile(url: string): Promise<Buffer> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT) });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  }

  const contentLength = parseInt(resp.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${(contentLength / 1024 / 1024).toFixed(1)} MB (max ${ANALYSIS?.MAX_FILE_SIZE_MB ?? 50} MB)`,
    );
  }

  if (!resp.body) {
    // No readable stream (e.g. an empty 204-style response) — nothing to
    // download.
    return Buffer.alloc(0);
  }

  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > MAX_FILE_SIZE) {
      // Stop pulling more bytes immediately rather than draining the rest
      // of a potentially-unbounded stream — this is the whole point of the
      // running cap.
      await reader.cancel().catch(() => {});
      throw new Error(`File too large: ${(total / 1024 / 1024).toFixed(1)} MB`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

async function pool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

export async function runPublist(argv: string[], runtime: PublistRuntime = {}): Promise<void> {
  const args = parsePublistArgs(argv);

  if (args.help) {
    printPublistHelp();
    process.exit(0);
  }

  if (!checkQpdf()) {
    console.error(`${RED}Error: qpdf is not installed or not found in PATH${RESET}`);
    console.error("");
    console.error("Install qpdf:");
    console.error(`  macOS:   ${BOLD}brew install qpdf${RESET}`);
    console.error(`  Ubuntu:  ${BOLD}sudo apt-get install qpdf${RESET}`);
    console.error(`  Fedora:  ${BOLD}sudo dnf install qpdf${RESET}`);
    process.exit(1);
  }

  // Step 1: Fetch publications
  console.log("");
  let publications: Publication[];

  if (args.from) {
    console.log(`${BOLD}Loading publications from:${RESET} ${args.from}`);
    try {
      publications = loadPublicationsFromFile(resolve(args.from));
    } catch (err: any) {
      console.error(`${RED}Error reading file: ${err.message}${RESET}`);
      process.exit(2);
    }
  } else {
    console.log(`${BOLD}Fetching publications from ICJIA API...${RESET}`);
    try {
      publications = await fetchPublications();
    } catch (err: any) {
      console.error(`${RED}Error fetching publications: ${err.message}${RESET}`);
      process.exit(1);
    }
  }

  if (publications.length === 0) {
    console.log(`${YELLOW}No publications found.${RESET}`);
    process.exit(0);
  }

  console.log(`  Found ${BOLD}${publications.length}${RESET} publications`);

  // Step 2: Open cache
  const db = initCache(runtime.cacheDir);

  if (args.clear) {
    clearCache(db);
    console.log(`${GREEN}Cache cleared.${RESET} All files will be re-audited on next run.`);
    db.close();
    process.exit(0);
  }

  if (args.force) {
    clearCache(db);
    console.log(`  ${DIM}Cache cleared — re-auditing all files${RESET}`);
  }

  // Backfill summary/tags metadata for existing cached rows
  const backfilled = backfillMetadata(db, publications);
  if (backfilled > 0) {
    console.log(`  ${DIM}Backfilled metadata for ${backfilled} cached entries${RESET}`);
  }

  const stale = getStaleCount(db);
  if (stale > 0) {
    console.log(
      `  ${DIM}${stale} cached result(s) were scored by a different engine version (this is v${VERSION}) — re-auditing them${RESET}`,
    );
  }

  // Publications this run could not audit. Transient ones (a timeout, a
  // busy engine, a network error) fail the run; permanent ones (the file is
  // gone) are reported but are not a failure of the run.
  const failed: Array<{ url: string; filename: string; message: string }> = [];
  const gone: Array<{ url: string; filename: string; message: string }> = [];

  // Step 3: Partition into cached vs pending
  const pending: Publication[] = [];
  let cachedCount = 0;

  for (const pub of publications) {
    if (!pub.fileURL) continue;
    const cached = getCached(db, pub.fileURL);
    if (cached) {
      cachedCount++;
    } else {
      pending.push(pub);
    }
  }

  console.log(
    `  ${GREEN}${cachedCount}${RESET} already cached, ${CYAN}${pending.length}${RESET} to analyze`,
  );
  console.log("");

  if (pending.length === 0) {
    console.log(`${DIM}No new publications to analyze.${RESET}`);
  } else {
    // Step 4: Download and analyze pending publications
    console.log(
      `${BOLD}Analyzing ${pending.length} publications (${args.concurrency} concurrent)...${RESET}`,
    );
    console.log("");

    let completed = 0;
    let errors = 0;

    await pool(pending, args.concurrency, async (pub, _idx) => {
      const filename = pub.fileURL!.split("/").pop() || "unknown-file";

      try {
        showProgress(completed + 1, pending.length, filename);

        // Download
        const buffer = await downloadFile(pub.fileURL!);

        // Analyze using existing pipeline (dispatches by content type). A
        // busy engine is not a verdict on the document: wait and ask again.
        const result = await withBusyRetry(
          () => analyzeDocument(buffer, filename),
          runtime.busyRetryDelaysMs,
        );

        // Cache result
        upsertResult(db, pub, result);
      } catch (err: any) {
        errors++;
        // Mark 404s and gone responses as permanent (won't retry)
        const isPermanent = /HTTP (404|410|403)/.test(err.message);
        upsertError(db, pub, err.message, isPermanent);
        (isPermanent ? gone : failed).push({
          url: pub.fileURL!,
          filename,
          message: String(err.message),
        });
        clearProgress();
        console.error(`  ${RED}✗${RESET} ${DIM}${filename}:${RESET} ${RED}${err.message}${RESET}`);
      }

      completed++;
    });

    clearProgress();
    console.log("");
    console.log(`  ${GREEN}✓${RESET} Analyzed ${BOLD}${completed - errors}${RESET} successfully`);
    if (errors > 0) {
      console.log(`  ${RED}✗${RESET} ${errors} could not be audited (listed below)`);
    }
  }

  // Said once, at the end, where it cannot scroll away — and reflected in the
  // exit code. A run that lost documents used to end with a CSV, a grade
  // chart and exit 0.
  const reportUnresolved = (): void => {
    if (gone.length > 0) {
      console.log("");
      console.log(
        `${YELLOW}${gone.length} publication(s) could not be downloaded (HTTP 403/404/410) and are not in the report:${RESET}`,
      );
      for (const g of gone) console.log(`  ${DIM}${g.url}${RESET} — ${g.message}`);
    }
    if (failed.length > 0) {
      console.error("");
      console.error(
        `${RED}${BOLD}INCOMPLETE:${RESET} ${RED}${failed.length} publication(s) could not be audited and are NOT in the report:${RESET}`,
      );
      for (const f of failed) console.error(`  ${RED}✗${RESET} ${f.url} — ${f.message}`);
      console.error(`  Run again to retry them; this run exits with status 1.`);
    }
  };

  // Step 5: Generate CSV from all cached results
  const allResults = getAllSuccessful(db);
  const outputPath = resolve(args.output);

  if (allResults.length === 0) {
    console.log(`${YELLOW}No successful results to write.${RESET}`);
    reportUnresolved();
    db.close();
    process.exit(failed.length > 0 ? 1 : 0);
  }

  const now = new Date();
  const csv = generateCsv(allResults);
  const html = generateHtml(allResults, now, csv);

  // Write latest CSV + HTML
  writeFileSync(outputPath, csv);
  const htmlOutputPath = outputPath.replace(/\.csv$/, ".html");
  writeFileSync(htmlOutputPath, html);

  // Save dated copies to reports directory
  const reportsDir = resolve(dirname(outputPath), "reports");
  mkdirSync(reportsDir, { recursive: true });
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "");
  const baseName = `publist-audit_${dateStr}_${timeStr}`;
  const reportCsvPath = join(reportsDir, `${baseName}.csv`);
  const reportHtmlPath = join(reportsDir, `${baseName}.html`);
  writeFileSync(reportCsvPath, csv);
  writeFileSync(reportHtmlPath, html);

  // Copy HTML report to web public directory for /publist access
  const publicDir = resolve(dirname(outputPath), PUBLIST.WEB_PUBLIC_DIR);
  const publicHtmlPath = join(publicDir, "publist.html");
  let publicCopied = false;
  try {
    writeFileSync(publicHtmlPath, html);
    publicCopied = true;
  } catch {
    // web/public may not exist in all environments — non-fatal
  }

  console.log("");
  console.log(`${BOLD}${GREEN}CSV written:${RESET}  ${outputPath}`);
  console.log(`${BOLD}${GREEN}HTML written:${RESET} ${htmlOutputPath}`);
  console.log(`${BOLD}${GREEN}Reports saved:${RESET} ${reportsDir}/`);
  if (publicCopied) {
    console.log(`${BOLD}${GREEN}Public report:${RESET} ${publicHtmlPath} → /publist.html`);
  }
  console.log(`  ${DIM}${baseName}.csv${RESET}`);
  console.log(`  ${DIM}${baseName}.html${RESET}`);
  console.log(`  ${allResults.length} publications`);

  // Print grade distribution
  const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const r of allResults) {
    if (r.grade && dist[r.grade] !== undefined) dist[r.grade]++;
  }
  console.log("");
  console.log(`${BOLD}Grade distribution:${RESET}`);
  for (const [grade, count] of Object.entries(dist)) {
    const gc = gradeColor(grade);
    const bar = "█".repeat(Math.max(1, Math.round((count / allResults.length) * 40)));
    console.log(`  ${gc}${grade}${RESET} ${bar} ${count}`);
  }
  console.log("");

  reportUnresolved();
  db.close();
  if (failed.length > 0) process.exit(1);
}
