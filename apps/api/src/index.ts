import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { globalLimiter } from './middleware/rateLimiter.js'
import authRoutes from './routes/auth.js'
import analyzeRoutes from './routes/analyze.js'
import logsRoutes from './routes/logs.js'

// Import db to trigger table creation on startup
import './db/sqlite.js'
import { validateMailConfig } from './mailer.js'

// Validate email config before starting — exits if misconfigured in production
validateMailConfig()

const app = express()
const PORT = Number(process.env.PORT) || 5103
const isProduction = process.env.NODE_ENV === 'production'

// Trust proxy when behind nginx
if (isProduction) {
  app.set('trust proxy', 1)
}

// Security headers
app.use(helmet())

// CORS
app.use(cors({
  origin: isProduction ? 'https://audit.icjia.app' : 'http://localhost:5102',
  credentials: true,
}))

// Body parsing
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

// Global rate limit
app.use(globalLimiter)

// Routes
app.use('/api/auth', authRoutes)
app.use('/api', analyzeRoutes)
app.use('/api', logsRoutes)

// Health check — also serves as the root API response
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', name: 'File Accessibility Audit API', env: process.env.NODE_ENV || 'development' })
})
app.get('/api', (_req, res) => {
  res.json({ status: 'ok', name: 'File Accessibility Audit API', env: process.env.NODE_ENV || 'development' })
})

// Global error handler — never leak internals
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      error: 'This file is too large. The maximum upload size is 100 MB.',
      details: 'Large PDFs are often inflated by uncompressed images. To reduce file size: (1) In Adobe Acrobat, use File → Save As Other → Reduced Size PDF; (2) Use File → Save As Other → Optimized PDF to downsample images; (3) Split the document into smaller sections (File → Organize Pages → Split) and analyze each part separately.',
    })
    return
  }

  const status = err.status || 500
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,
  })
})

app.listen(PORT, () => {
  console.log(`[API] Running on http://localhost:${PORT}`)
  console.log(`[API] Environment: ${process.env.NODE_ENV || 'development'}`)
})
