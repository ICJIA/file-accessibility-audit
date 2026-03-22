import { runAudit } from './commands/audit.js'
import { runPublist } from './commands/publist.js'
import { RESET, BOLD, DIM, RED } from './lib/colors.js'

const VERSION = '1.0.0'

function printHelp(): void {
  console.log(`
${BOLD}a11y-audit${RESET} — PDF accessibility analyzer

${BOLD}Commands:${RESET}
  a11y-audit <file.pdf> [file2.pdf ...]   Analyze local PDF files
  a11y-audit publist                       Audit ICJIA publication list

${BOLD}File analysis options:${RESET}
  --json            Output results as JSON
  --threshold <n>   Minimum passing score (0-100, exit 1 if below)

${BOLD}Publist options:${RESET}
  --force              Clear cache and re-audit all publications from scratch
  --clear              Clear cache only (use after files have been remediated)
  --from <file>        Use a local JSON publication list instead of API
  --output, -o <path>  CSV output path (default: ./publist-audit.csv)
  --concurrency, -c    Parallel analyses (default: 3, max: 10)

${BOLD}General:${RESET}
  --help, -h        Show this help
  --version, -v     Show version

${BOLD}Quick start:${RESET}
  ${DIM}# Audit a single PDF${RESET}
  a11y-audit report.pdf

  ${DIM}# Run a full ICJIA publication audit (first time)${RESET}
  a11y-audit publist

  ${DIM}# Re-run — only audits new publications added since last run${RESET}
  a11y-audit publist

  ${DIM}# Files were remediated — clear cache and re-audit everything${RESET}
  a11y-audit publist --force

${BOLD}Reports:${RESET}
  Each publist run saves a dated CSV to ./reports/ for audit trail.
  The latest results are always at ./publist-audit.csv (or --output path).
`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const sub = args[0]

  if (sub === '--help' || sub === '-h') {
    printHelp()
    process.exit(0)
  }

  if (sub === '--version' || sub === '-v') {
    console.log(`a11y-audit v${VERSION}`)
    process.exit(0)
  }

  if (sub === 'publist') {
    await runPublist(args.slice(1))
  } else {
    await runAudit(args)
  }
}

main().catch(err => {
  console.error(`${RED}Fatal error: ${err.message}${RESET}`)
  process.exit(1)
})
