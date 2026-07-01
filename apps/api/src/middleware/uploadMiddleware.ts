import multer from 'multer'
import { ANALYSIS, DOCX } from '#config'

const storage = multer.memoryStorage()

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: ANALYSIS.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    // First-pass check by mimetype/extension. Authoritative content detection
    // (magic bytes + package inspection) happens in the route via analyzer's
    // detectFileType, so a renamed file is still rejected there.
    const name = file.originalname.toLowerCase()
    const isPdf = file.mimetype === 'application/pdf' || name.endsWith('.pdf')
    const isDocx =
      DOCX.ENABLED &&
      (file.mimetype === DOCX.MIME_TYPE || name.endsWith('.docx'))
    if (isPdf || isDocx) {
      cb(null, true)
    } else {
      cb(
        new Error(
          DOCX.ENABLED
            ? 'Only PDF and Word (.docx) files are accepted'
            : 'Only PDF files are accepted',
        ),
      )
    }
  },
})
