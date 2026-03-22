export function showProgress(current: number, total: number, filename: string): void {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  const barLen = 30
  const filled = Math.floor((pct / 100) * barLen)
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled)
  const name = filename.length > 40 ? filename.slice(0, 37) + '...' : filename.padEnd(40)
  process.stderr.write(`\r  [${current}/${total}] ${bar} ${pct}% ${name}`)
}

export function clearProgress(): void {
  process.stderr.write('\r' + ' '.repeat(100) + '\r')
}
