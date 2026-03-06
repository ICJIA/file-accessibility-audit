import { spawn } from 'node:child_process'

interface SuiteResult {
  name: string
  passed: number
  failed: number
  total: number
  files: number
  ok: boolean
}

function runSuite(name: string, filter: string): Promise<SuiteResult> {
  return new Promise((resolve) => {
    const result: SuiteResult = { name, passed: 0, failed: 0, total: 0, files: 0, ok: false }
    let output = ''

    const proc = spawn('pnpm', ['--filter', filter, 'test'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })

    proc.stdout!.on('data', (d) => {
      const text = d.toString()
      output += text
      process.stdout.write(text)
    })
    proc.stderr!.on('data', (d) => {
      const text = d.toString()
      output += text
      process.stderr.write(text)
    })

    proc.on('close', (code) => {
      // Parse vitest output for test counts
      const testsLine = output.match(/Tests\s+(\d+)\s+passed/)
      const failedMatch = output.match(/Tests\s+(\d+)\s+failed/)
      const filesLine = output.match(/Test Files\s+(\d+)\s+passed/)
      const filesFailedMatch = output.match(/Test Files\s+(\d+)\s+failed/)

      result.passed = testsLine ? parseInt(testsLine[1]) : 0
      result.failed = failedMatch ? parseInt(failedMatch[1]) : 0
      result.total = result.passed + result.failed
      result.files = (filesLine ? parseInt(filesLine[1]) : 0) + (filesFailedMatch ? parseInt(filesFailedMatch[1]) : 0)
      result.ok = code === 0

      resolve(result)
    })
  })
}

async function main() {
  console.log('\n')

  const results = await Promise.all([
    runSuite('API', 'api'),
    runSuite('Web', 'web'),
  ])

  const totalPassed = results.reduce((s, r) => s + r.passed, 0)
  const totalFailed = results.reduce((s, r) => s + r.failed, 0)
  const totalTests = totalPassed + totalFailed
  const totalFiles = results.reduce((s, r) => s + r.files, 0)
  const allOk = results.every((r) => r.ok)

  // Summary
  console.log('\n' + '═'.repeat(60))
  console.log('  TEST SUMMARY')
  console.log('═'.repeat(60))

  for (const r of results) {
    const icon = r.ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m'
    const counts = r.failed > 0
      ? `\x1b[32m${r.passed} passed\x1b[0m, \x1b[31m${r.failed} failed\x1b[0m`
      : `\x1b[32m${r.passed} passed\x1b[0m`
    console.log(`  ${icon} ${r.name.padEnd(8)} ${counts} (${r.files} files)`)
  }

  console.log('─'.repeat(60))

  if (allOk) {
    console.log(`  \x1b[32m✔ ${totalTests} tests passed\x1b[0m across ${totalFiles} files`)
  } else {
    console.log(`  \x1b[31m✖ ${totalFailed} failed\x1b[0m, \x1b[32m${totalPassed} passed\x1b[0m of ${totalTests} tests across ${totalFiles} files`)
  }

  console.log('═'.repeat(60) + '\n')

  process.exit(allOk ? 0 : 1)
}

main()
