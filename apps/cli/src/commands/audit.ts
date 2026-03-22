import { readFileSync, existsSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { analyzePDF } from '../../../api/src/services/pdfAnalyzer.js'
import type { AnalysisResult } from '../../../api/src/services/pdfAnalyzer.js'
import type { CategoryResult } from '../../../api/src/services/scorer.js'
import {
  RESET, BOLD, DIM, RED,
  gradeColor, severityColor, gradeLabel, padRight, checkQpdf,
} from '../lib/colors.js'

const VERSION = '1.0.0'

function printResult(result: AnalysisResult): void {
  const line = '\u2501'
  const thinLine = '\u2500'

  console.log('')
  console.log(`${BOLD}${line.repeat(3)} ${result.filename} ${line.repeat(Math.max(1, 55 - result.filename.length))}${RESET}`)
  console.log('')

  const gc = gradeColor(result.grade)
  console.log(`  ${BOLD}Score:${RESET} ${gc}${result.overallScore}/100${RESET}  ${BOLD}Grade:${RESET} ${gc}${result.grade}${RESET} (${gradeLabel(result.grade)})`)
  console.log(`  ${BOLD}Pages:${RESET} ${result.pageCount}`)
  console.log('')

  const colLabel = 24
  const colScore = 7
  const colGrade = 7
  console.log(`  ${BOLD}${padRight('Category', colLabel)}${padRight('Score', colScore)}${padRight('Grade', colGrade)}Severity${RESET}`)
  console.log(`  ${DIM}${thinLine.repeat(colLabel + colScore + colGrade + 10)}${RESET}`)

  for (const cat of result.categories) {
    const scoreStr = cat.score !== null ? String(cat.score) : 'N/A'
    const gradeStr = cat.grade ?? '\u2014'
    const sevStr = cat.severity ?? '\u2014'
    const sc = gradeColor(cat.grade)
    const sevc = severityColor(cat.severity)

    console.log(
      `  ${padRight(cat.label, colLabel)}` +
      `${sc}${padRight(scoreStr, colScore)}${RESET}` +
      `${sc}${padRight(gradeStr, colGrade)}${RESET}` +
      `${sevc}${sevStr}${RESET}`
    )
  }

  console.log('')
  console.log(`  ${DIM}${result.executiveSummary}${RESET}`)
  console.log('')
  console.log(`${BOLD}${line.repeat(58)}${RESET}`)
}

function printJsonResults(results: AnalysisResult[]): void {
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2))
}

function printHelp(): void {
  console.log(`
${BOLD}a11y-audit${RESET} — PDF accessibility analyzer

${BOLD}Usage:${RESET}
  a11y-audit <file.pdf> [file2.pdf ...]   Analyze PDF files
  a11y-audit report.pdf --json             Output raw JSON
  a11y-audit report.pdf --threshold 80     Exit 1 if score < 80
  a11y-audit publist                       Audit ICJIA publication list
  a11y-audit --help                        Show this help
  a11y-audit --version                     Show version

${BOLD}Options:${RESET}
  --json            Output results as JSON
  --threshold <n>   Minimum passing score (0-100, default: 0)
  --help, -h        Show help
  --version, -v     Show version

${BOLD}Examples:${RESET}
  a11y-audit report.pdf
  a11y-audit docs/*.pdf --threshold 80
  a11y-audit report.pdf --json | jq '.overallScore'
  a11y-audit publist
  a11y-audit publist --output results.csv
`)
}

interface ParsedArgs {
  files: string[]
  json: boolean
  threshold: number
  help: boolean
  version: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { files: [], json: false, threshold: 0, help: false, version: false }
  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--json') {
      result.json = true
    } else if (arg === '--threshold') {
      i++
      const val = parseInt(argv[i], 10)
      if (isNaN(val) || val < 0 || val > 100) {
        console.error(`${RED}Error: --threshold must be a number between 0 and 100${RESET}`)
        process.exit(2)
      }
      result.threshold = val
    } else if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg === '--version' || arg === '-v') {
      result.version = true
    } else if (arg === '--') {
      // ignore -- separator from pnpm
    } else if (arg.startsWith('-')) {
      console.error(`${RED}Error: Unknown option: ${arg}${RESET}`)
      process.exit(2)
    } else {
      result.files.push(arg)
    }
    i++
  }
  return result
}

export async function runAudit(argv: string[]): Promise<void> {
  const args = parseArgs(argv)

  if (args.help) {
    printHelp()
    process.exit(0)
  }

  if (args.version) {
    console.log(`a11y-audit v${VERSION}`)
    process.exit(0)
  }

  if (args.files.length === 0) {
    console.error(`${RED}Error: No PDF files specified${RESET}`)
    console.error(`Run ${BOLD}a11y-audit --help${RESET} for usage`)
    process.exit(2)
  }

  if (!checkQpdf()) {
    console.error(`${RED}Error: qpdf is not installed or not found in PATH${RESET}`)
    console.error('')
    console.error('Install qpdf:')
    console.error(`  macOS:   ${BOLD}brew install qpdf${RESET}`)
    console.error(`  Ubuntu:  ${BOLD}sudo apt-get install qpdf${RESET}`)
    console.error(`  Fedora:  ${BOLD}sudo dnf install qpdf${RESET}`)
    console.error('')
    console.error(`Or set the QPDF_PATH environment variable to the qpdf binary location.`)
    process.exit(1)
  }

  // Validate all files exist before starting analysis
  for (const file of args.files) {
    const filePath = resolve(file)
    if (!existsSync(filePath)) {
      console.error(`${RED}Error: File not found: ${filePath}${RESET}`)
      process.exit(2)
    }
    if (!statSync(filePath).isFile()) {
      console.error(`${RED}Error: Not a file: ${filePath}${RESET}`)
      process.exit(2)
    }
    if (!file.toLowerCase().endsWith('.pdf')) {
      console.error(`${RED}Error: Not a PDF file: ${file}${RESET}`)
      process.exit(2)
    }
  }

  const results: AnalysisResult[] = []
  let hasError = false

  for (const file of args.files) {
    const filePath = resolve(file)
    const filename = basename(file)

    try {
      const buffer = readFileSync(filePath)
      const result = await analyzePDF(buffer, filename)
      results.push(result)
    } catch (err: any) {
      hasError = true
      if (err.message === 'encrypted') {
        console.error(`${RED}Error: ${filename} is password-protected and cannot be analyzed${RESET}`)
      } else {
        console.error(`${RED}Error analyzing ${filename}: ${err.message}${RESET}`)
      }
    }
  }

  if (results.length === 0) {
    process.exit(1)
  }

  if (args.json) {
    printJsonResults(results)
  } else {
    for (const result of results) {
      printResult(result)
    }
  }

  if (hasError) {
    process.exit(1)
  }

  if (args.threshold > 0) {
    const failing = results.filter(r => r.overallScore < args.threshold)
    if (failing.length > 0) {
      if (!args.json) {
        console.log('')
        console.log(`${RED}${BOLD}FAILED:${RESET} ${failing.length} file(s) scored below threshold of ${args.threshold}:`)
        for (const f of failing) {
          console.log(`  ${RED}${f.filename}: ${f.overallScore}${RESET}`)
        }
      }
      process.exit(1)
    }
  }
}
