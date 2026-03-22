import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export default defineEventHandler((event) => {
  const publicDir = join(process.cwd(), 'public')
  const filePath = join(publicDir, 'publist.html')

  try {
    const html = readFileSync(filePath, 'utf-8')
    setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
    setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
    return html
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Report not yet generated. Run: pnpm a11y-audit' })
  }
})
