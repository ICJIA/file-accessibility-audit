import multer from 'multer'
import { ANALYSIS } from '#config'

const storage = multer.memoryStorage()

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: ANALYSIS.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    // Accept only PDF files by mimetype as a first check
    // Magic bytes check happens after upload in the route handler
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are accepted'))
    }
  },
})
