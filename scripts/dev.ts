import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'

const API_PORT = 5103
const WEB_PORT = 5102

function killPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['kill-port', String(port)], {
      stdio: 'ignore',
      shell: true,
    })
    proc.on('close', () => resolve())
    proc.on('error', () => resolve())
  })
}

function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Port ${port} did not open within ${timeoutMs / 1000}s`))
        return
      }
      const sock = createConnection({ port, host: 'localhost' })
      sock.on('connect', () => { sock.destroy(); resolve() })
      sock.on('error', () => setTimeout(check, 500))
    }
    check()
  })
}

async function main() {
  console.log(`Killing ports ${API_PORT} and ${WEB_PORT}...`)
  await Promise.all([killPort(API_PORT), killPort(WEB_PORT)])

  console.log('Starting API and Web servers...\n')

  const api = spawn('pnpm', ['--filter', 'api', 'dev'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })

  const web = spawn('pnpm', ['--filter', 'web', 'dev'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })

  api.stdout!.on('data', (d) => process.stdout.write(`[api] ${d}`))
  api.stderr!.on('data', (d) => process.stderr.write(`[api] ${d}`))
  web.stdout!.on('data', (d) => process.stdout.write(`[web] ${d}`))
  web.stderr!.on('data', (d) => process.stderr.write(`[web] ${d}`))

  const cleanup = () => {
    api.kill('SIGTERM')
    web.kill('SIGTERM')
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  // Fail fast if either process exits unexpectedly
  const exitPromise = new Promise<never>((_, reject) => {
    api.on('close', (code) => {
      if (code !== null && code !== 0) {
        web.kill('SIGTERM')
        reject(new Error(`API exited with code ${code}`))
      }
    })
    web.on('close', (code) => {
      if (code !== null && code !== 0) {
        api.kill('SIGTERM')
        reject(new Error(`Web exited with code ${code}`))
      }
    })
  })

  try {
    await Promise.race([
      Promise.all([
        waitForPort(API_PORT),
        waitForPort(WEB_PORT),
      ]),
      exitPromise,
    ])
    console.log(`\n✔ API running on http://localhost:${API_PORT}`)
    console.log(`✔ Web running on http://localhost:${WEB_PORT}\n`)
  } catch (err: any) {
    console.error(`\n✖ ${err.message}`)
    cleanup()
    process.exit(1)
  }

  // Keep alive until killed or a child exits
  await exitPromise.catch(() => process.exit(1))
}

main()
