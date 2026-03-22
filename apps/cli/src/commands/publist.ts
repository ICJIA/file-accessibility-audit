import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { analyzePDF } from '../../../api/src/services/pdfAnalyzer.js'
import { ANALYSIS } from '#config'
import { fetchPublications, loadPublicationsFromFile } from '../lib/graphql.js'
import { initCache, getCached, upsertResult, upsertError, getAllSuccessful, getErrorCount, clearCache, backfillMetadata } from '../lib/cache.js'
import { generateCsv } from '../lib/csv.js'
import { generateHtml } from '../lib/html.js'
import { showProgress, clearProgress } from '../lib/progress.js'
import { RESET, BOLD, DIM, RED, GREEN, YELLOW, CYAN, GRAY, gradeColor, checkQpdf } from '../lib/colors.js'
import type { Publication } from '../lib/graphql.js'

const MAX_FILE_SIZE = (ANALYSIS?.MAX_FILE_SIZE_MB ?? 50) * 1024 * 1024
const DOWNLOAD_TIMEOUT = 60_000

interface PublistArgs {
  from?: string
  output: string
  force: boolean
  concurrency: number
  clear: boolean
  help: boolean
}

function parsePublistArgs(argv: string[]): PublistArgs {
  const result: PublistArgs = {
    output: './publist-audit.csv',
    force: false,
    concurrency: 3,
    clear: false,
    help: false,
  }

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--from') {
      i++
      result.from = argv[i]
    } else if (arg === '--output' || arg === '-o') {
      i++
      result.output = argv[i]
    } else if (arg === '--force') {
      result.force = true
    } else if (arg === '--concurrency' || arg === '-c') {
      i++
      const val = parseInt(argv[i], 10)
      if (isNaN(val) || val < 1 || val > 10) {
        console.error(`${RED}Error: --concurrency must be 1-10${RESET}`)
        process.exit(2)
      }
      result.concurrency = val
    } else if (arg === '--clear') {
      result.clear = true
    } else if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg === '--') {
      // ignore -- separator from pnpm
    } else if (arg.startsWith('-')) {
      console.error(`${RED}Error: Unknown option: ${arg}${RESET}`)
      process.exit(2)
    }
    i++
  }

  return result
}

function printPublistHelp(): void {
  console.log(`
${BOLD}a11y-audit publist${RESET} — Audit ICJIA publication PDFs

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
  --concurrency, -c    Number of concurrent analyses (default: 3, max: 10)
  --help, -h           Show this help

${BOLD}How it works:${RESET}
  1. Fetches publication list from ICJIA's API (or local file)
  2. Filters to PDF files only
  3. Downloads and audits each PDF using the accessibility scoring engine
  4. Caches results in ~/.a11y-audit/cache.db (re-runs skip already-audited files)
  5. Writes a detailed CSV with grades, scores, and category breakdowns
  6. Saves a dated copy in ./reports/ for audit trail

${BOLD}Examples:${RESET}
  a11y-audit publist                         # First run: audits everything
  a11y-audit publist                         # Re-run: only audits new additions
  a11y-audit publist --force                 # Full re-scan of all files
  a11y-audit publist --clear                 # Wipe cache (e.g. after remediation)
  a11y-audit publist -o ~/Desktop/audit.csv  # Custom output location
`)
}

async function downloadPdf(url: string): Promise<Buffer> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT) })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
  }

  const contentLength = parseInt(resp.headers.get('content-length') || '0', 10)
  if (contentLength > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(contentLength / 1024 / 1024).toFixed(1)} MB (max ${ANALYSIS?.MAX_FILE_SIZE_MB ?? 50} MB)`)
  }

  const arrayBuf = await resp.arrayBuffer()
  if (arrayBuf.byteLength > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(arrayBuf.byteLength / 1024 / 1024).toFixed(1)} MB`)
  }

  return Buffer.from(arrayBuf)
}

async function pool<T>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const i = nextIndex++
      await fn(items[i], i)
    }
  })
  await Promise.all(workers)
}

export async function runPublist(argv: string[]): Promise<void> {
  const args = parsePublistArgs(argv)

  if (args.help) {
    printPublistHelp()
    process.exit(0)
  }

  if (!checkQpdf()) {
    console.error(`${RED}Error: qpdf is not installed or not found in PATH${RESET}`)
    console.error('')
    console.error('Install qpdf:')
    console.error(`  macOS:   ${BOLD}brew install qpdf${RESET}`)
    console.error(`  Ubuntu:  ${BOLD}sudo apt-get install qpdf${RESET}`)
    console.error(`  Fedora:  ${BOLD}sudo dnf install qpdf${RESET}`)
    process.exit(1)
  }

  // Step 1: Fetch publications
  console.log('')
  let publications: Publication[]

  if (args.from) {
    console.log(`${BOLD}Loading publications from:${RESET} ${args.from}`)
    try {
      publications = loadPublicationsFromFile(resolve(args.from))
    } catch (err: any) {
      console.error(`${RED}Error reading file: ${err.message}${RESET}`)
      process.exit(2)
    }
  } else {
    console.log(`${BOLD}Fetching publications from ICJIA API...${RESET}`)
    try {
      publications = await fetchPublications()
    } catch (err: any) {
      console.error(`${RED}Error fetching publications: ${err.message}${RESET}`)
      process.exit(1)
    }
  }

  if (publications.length === 0) {
    console.log(`${YELLOW}No PDF publications found.${RESET}`)
    process.exit(0)
  }

  console.log(`  Found ${BOLD}${publications.length}${RESET} PDF publications`)

  // Step 2: Open cache
  const db = initCache()

  if (args.clear) {
    clearCache(db)
    console.log(`${GREEN}Cache cleared.${RESET} All files will be re-audited on next run.`)
    db.close()
    process.exit(0)
  }

  if (args.force) {
    clearCache(db)
    console.log(`  ${DIM}Cache cleared — re-auditing all files${RESET}`)
  }

  // Backfill summary/tags metadata for existing cached rows
  const backfilled = backfillMetadata(db, publications)
  if (backfilled > 0) {
    console.log(`  ${DIM}Backfilled metadata for ${backfilled} cached entries${RESET}`)
  }

  // Step 3: Partition into cached vs pending
  const pending: Publication[] = []
  let cachedCount = 0

  for (const pub of publications) {
    if (!pub.fileURL) continue
    const cached = getCached(db, pub.fileURL)
    if (cached) {
      cachedCount++
    } else {
      pending.push(pub)
    }
  }

  console.log(`  ${GREEN}${cachedCount}${RESET} already cached, ${CYAN}${pending.length}${RESET} to analyze`)
  console.log('')

  if (pending.length === 0) {
    console.log(`${DIM}No new publications to analyze.${RESET}`)
  } else {
    // Step 4: Download and analyze pending publications
    console.log(`${BOLD}Analyzing ${pending.length} publications (${args.concurrency} concurrent)...${RESET}`)
    console.log('')

    let completed = 0
    let errors = 0

    await pool(pending, args.concurrency, async (pub, _idx) => {
      const filename = pub.fileURL!.split('/').pop() || 'unknown.pdf'

      try {
        showProgress(completed + 1, pending.length, filename)

        // Download
        const buffer = await downloadPdf(pub.fileURL!)

        // Analyze using existing pipeline
        const result = await analyzePDF(buffer, filename)

        // Cache result
        upsertResult(db, pub, result)
      } catch (err: any) {
        errors++
        // Mark 404s and gone responses as permanent (won't retry)
        const isPermanent = /HTTP (404|410|403)/.test(err.message)
        upsertError(db, pub, err.message, isPermanent)
        clearProgress()
        console.error(`  ${RED}✗${RESET} ${DIM}${filename}:${RESET} ${RED}${err.message}${RESET}`)
      }

      completed++
    })

    clearProgress()
    console.log('')
    console.log(`  ${GREEN}✓${RESET} Analyzed ${BOLD}${completed - errors}${RESET} successfully`)
    if (errors > 0) {
      console.log(`  ${RED}✗${RESET} ${errors} errors (will retry on next run)`)
    }
  }

  // Step 5: Generate CSV from all cached results
  const allResults = getAllSuccessful(db)
  const totalErrors = getErrorCount(db)
  const outputPath = resolve(args.output)

  if (allResults.length === 0) {
    console.log(`${YELLOW}No successful results to write.${RESET}`)
    db.close()
    process.exit(0)
  }

  const now = new Date()
  const csv = generateCsv(allResults)
  const html = generateHtml(allResults, now, csv)

  // Write latest CSV + HTML
  writeFileSync(outputPath, csv)
  const htmlOutputPath = outputPath.replace(/\.csv$/, '.html')
  writeFileSync(htmlOutputPath, html)

  // Save dated copies to reports directory
  const reportsDir = resolve(dirname(outputPath), 'reports')
  mkdirSync(reportsDir, { recursive: true })
  const dateStr = now.toISOString().slice(0, 10)
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '')
  const baseName = `publist-audit_${dateStr}_${timeStr}`
  const reportCsvPath = join(reportsDir, `${baseName}.csv`)
  const reportHtmlPath = join(reportsDir, `${baseName}.html`)
  writeFileSync(reportCsvPath, csv)
  writeFileSync(reportHtmlPath, html)

  // Copy HTML report to web public directory for /publist access
  const publicDir = resolve(dirname(outputPath), '..', 'web', 'public')
  const publicHtmlPath = join(publicDir, 'publist.html')
  let publicCopied = false
  try {
    writeFileSync(publicHtmlPath, html)
    publicCopied = true
  } catch {
    // web/public may not exist in all environments — non-fatal
  }

  console.log('')
  console.log(`${BOLD}${GREEN}CSV written:${RESET}  ${outputPath}`)
  console.log(`${BOLD}${GREEN}HTML written:${RESET} ${htmlOutputPath}`)
  console.log(`${BOLD}${GREEN}Reports saved:${RESET} ${reportsDir}/`)
  if (publicCopied) {
    console.log(`${BOLD}${GREEN}Public report:${RESET} ${publicHtmlPath} → /publist.html`)
  }
  console.log(`  ${DIM}${baseName}.csv${RESET}`)
  console.log(`  ${DIM}${baseName}.html${RESET}`)
  console.log(`  ${allResults.length} publications`)
  if (totalErrors > 0) {
    console.log(`  ${YELLOW}${totalErrors} errors cached (will retry on next run)${RESET}`)
  }

  // Print grade distribution
  const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const r of allResults) {
    if (r.grade && dist[r.grade] !== undefined) dist[r.grade]++
  }
  console.log('')
  console.log(`${BOLD}Grade distribution:${RESET}`)
  for (const [grade, count] of Object.entries(dist)) {
    const gc = gradeColor(grade)
    const bar = '█'.repeat(Math.max(1, Math.round((count / allResults.length) * 40)))
    console.log(`  ${gc}${grade}${RESET} ${bar} ${count}`)
  }
  console.log('')

  db.close()
}
