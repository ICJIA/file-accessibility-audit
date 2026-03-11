import { Router, Response, type IRouter } from 'express'
import path from 'node:path'
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware.js'
import { analyzeLimiter } from '../middleware/rateLimiter.js'
import { uploadMiddleware } from '../middleware/uploadMiddleware.js'
import { analyzePDF } from '../services/pdfAnalyzer.js'
import { AUTH, FILENAME } from '#config'
import db from '../db/sqlite.js'

const router: IRouter = Router()

function sanitizeFilename(raw: string): string {
  let name = path.basename(raw)
  name = name.slice(0, FILENAME.MAX_LENGTH)
  name = name.replace(new RegExp(`[^${FILENAME.ALLOWED_CHARS.source.slice(1, -1)}]`, 'g'), '_')
  return name || 'unnamed.pdf'
}

function logAnalyze(email: string, filename: string, score: number | null, grade: string | null, req: AuthRequest) {
  db.prepare(
    'INSERT INTO audit_log (event_type, email, filename, score, grade, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('analyze', email, filename, score, grade, req.ip || null, req.get('user-agent') || null)
}

// POST /api/analyze
router.post(
  '/analyze',
  authMiddleware,
  analyzeLimiter,
  uploadMiddleware.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const file = req.file

      if (!file) {
        res.status(400).json({ error: 'No file uploaded' })
        return
      }

      // Magic bytes check: PDF must start with %PDF-
      const header = file.buffer.subarray(0, 5).toString('ascii')
      if (header !== '%PDF-') {
        res.status(400).json({
          error: 'This file does not appear to be a valid PDF.',
          details: 'The file header is missing or incorrect. Please verify you are uploading a .pdf file and not a renamed file of another type (e.g., .docx, .jpg).',
        })
        return
      }

      const filename = sanitizeFilename(file.originalname)

      const result = await analyzePDF(file.buffer, filename)

      // Log the analysis (skip when auth is off — no meaningful user to record)
      if (AUTH.REQUIRE_LOGIN) {
        logAnalyze(req.user!.email, filename, result.overallScore, result.grade, req)
      }

      res.json(result)
    } catch (err: any) {
      console.error('Analysis error:', err)

      // Server busy (semaphore timeout)
      if (err.status === 503) {
        res.status(503).json({
          error: 'The server is busy processing other files.',
          details: 'Please wait a moment and try again. The server can analyze two files at a time — your request will be processed as soon as a slot opens.',
        })
        return
      }

      // Password-protected PDF
      if (err.message?.includes('encrypted') || err.message?.includes('password')) {
        res.status(422).json({
          error: 'This PDF is password-protected.',
          details: 'Screen readers and accessibility tools also cannot access password-protected content. Please remove the password protection in Adobe Acrobat (File → Properties → Security → No Security) and re-upload.',
        })
        return
      }

      // Timeout
      if (err.code === 'ETIMEDOUT' || err.killed) {
        res.status(504).json({
          error: 'This PDF is too complex to analyze within the time limit.',
          details: 'This can happen with very large documents that contain many embedded images or complex structure trees. To work around this, try splitting the document into smaller sections using Adobe Acrobat (File → Organize Pages → Split) and analyzing each section separately.',
        })
        return
      }

      // Generic parse failure
      res.status(422).json({
        error: 'This PDF could not be analyzed. The file appears to be damaged or uses a PDF structure that cannot be parsed.',
        details: 'This sometimes happens with PDFs created by older or non-standard software, or files that were incompletely downloaded. To fix this: (1) Re-download the file from its original source; (2) Open the file in Adobe Acrobat and re-save it (File → Save As → PDF); (3) If the file opens in a browser, print it to a new PDF using Print → Save as PDF.',
      })
    }
  }
)

export default router
