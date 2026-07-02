import { Router, Response, type IRouter } from 'express'
import path from 'node:path'
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware.js'
import { analyzeLimiter } from '../middleware/rateLimiter.js'
import { uploadMiddleware } from '../middleware/uploadMiddleware.js'
import { analyzeDocument } from '../services/analyzer.js'
import { gateIdentity, recordAudit, sha256Hex } from '../services/auditLog.js'
import { FILENAME } from '#config'

const router: IRouter = Router()

function sanitizeFilename(raw: string): string {
  let name = path.basename(raw)
  name = name.slice(0, FILENAME.MAX_LENGTH)
  name = name.replace(new RegExp(`[^${FILENAME.ALLOWED_CHARS.source.slice(1, -1)}]`, 'g'), '_')
  return name || 'unnamed.pdf'
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

      const filename = sanitizeFilename(file.originalname)
      const contentHash = sha256Hex(file.buffer)

      // Detect PDF vs DOCX vs PPTX from the file's content (not its extension)
      // and dispatch to the matching pipeline. Unsupported / renamed files and
      // — when the format's flag is off — Word/PowerPoint uploads throw
      // FileTypeError; a corrupt package throws DocxParseError/PptxParseError.
      // All are mapped in the catch below.
      const result = await analyzeDocument(file.buffer, filename)

      // Always record the audit — audit_log is the canonical "this
      // content has been audited" record consulted by /api/remediate's
      // audit-gate. Anonymous (no-auth) mode writes the row under the
      // 'anonymous' sentinel email so the gate still functions.
      recordAudit({
        eventType: 'analyze',
        // gateIdentity binds anonymous callers to their IP so the
        // remediation gate (v1.20.1+) can't be exploited across users
        // in shared-bucket dev/anonymous deployments.
        email: gateIdentity(req.user?.email ?? null, req.ip),
        filename,
        score: result.overallScore,
        grade: result.grade,
        contentHash,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      })

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

      // Unsupported file type (content matches no supported format)
      if (err.code === 'UNSUPPORTED_FILE_TYPE') {
        res.status(400).json({
          error: 'This file is not a supported document.',
          details: 'Upload a PDF, Word (.docx), or PowerPoint (.pptx) file. The file content matches none of these formats — check that you are not uploading a renamed file of another type (e.g., .xlsx, .jpg).',
        })
        return
      }

      // DOCX auditing disabled via DOCX_ENABLED=false
      if (err.code === 'DOCX_DISABLED') {
        res.status(415).json({
          error: 'Word (.docx) auditing is currently disabled.',
          details: 'This server is configured to audit PDF files only. Please upload a PDF, or contact the administrator to enable Word support.',
        })
        return
      }

      // DOCX could not be parsed (corrupt or not a real Word package)
      if (err.code === 'DOCX_PARSE_FAILED') {
        res.status(422).json({
          error: 'This Word document could not be read.',
          details: 'The .docx file appears to be corrupt or is not a valid Word document. Try re-saving it from Word (File → Save As → Word Document), then upload again.',
        })
        return
      }

      // PPTX auditing disabled via PPTX_ENABLED=false
      if (err.code === 'PPTX_DISABLED') {
        res.status(415).json({
          error: 'PowerPoint (.pptx) auditing is currently disabled.',
          details: 'This server is not configured to audit PowerPoint files. Contact the administrator to enable it.',
        })
        return
      }

      // PPTX could not be parsed (corrupt or not a real PowerPoint package)
      if (err.code === 'PPTX_PARSE_FAILED') {
        res.status(422).json({
          error: 'This PowerPoint file could not be read.',
          details: 'The .pptx file appears to be corrupt or is not a valid PowerPoint presentation. Re-save it in PowerPoint and upload again.',
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
