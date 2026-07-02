import multer from 'multer'
import { ANALYSIS, DOCX, PPTX } from '#config'

const storage = multer.memoryStorage()

/**
 * Builds the upload-rejection message from the enabled formats' labels with
 * correct one/two/many joining:
 *   ['PDF']                → 'Only PDF files are accepted'
 *   ['PDF', 'B']           → 'Only PDF and B files are accepted'
 *   ['PDF', 'B', 'C']      → 'Only PDF, B, and C files are accepted'
 * The label list is assembled from the feature flags at rejection time, so a
 * future format (e.g. Excel in Phase 3) extends it with a single push.
 * Exported for unit tests.
 */
export function acceptedFormatsMessage(labels: string[]): string {
  const list =
    labels.length <= 1
      ? (labels[0] ?? '')
      : labels.length === 2
        ? `${labels[0]} and ${labels[1]}`
        : `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
  return `Only ${list} files are accepted`
}

/**
 * First-pass check by mimetype/extension. Authoritative content detection
 * (magic bytes + package inspection) happens in the route via analyzer's
 * detectFileType, so a renamed file is still rejected there.
 * Exported for unit tests — multer's fileFilter delegates here.
 */
export function uploadFileFilter(
  _req: unknown,
  file: { mimetype: string; originalname: string },
  cb: (error: Error | null, acceptFile?: boolean) => void,
): void {
  const name = file.originalname.toLowerCase()
  const isPdf = file.mimetype === 'application/pdf' || name.endsWith('.pdf')
  const isDocx =
    DOCX.ENABLED &&
    (file.mimetype === DOCX.MIME_TYPE || name.endsWith('.docx'))
  const isPptx =
    PPTX.ENABLED &&
    (file.mimetype === PPTX.MIME_TYPE || name.endsWith('.pptx'))
  if (isPdf || isDocx || isPptx) {
    cb(null, true)
  } else {
    const labels = ['PDF']
    if (DOCX.ENABLED) labels.push('Word (.docx)')
    if (PPTX.ENABLED) labels.push('PowerPoint (.pptx)')
    cb(new Error(acceptedFormatsMessage(labels)))
  }
}

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: ANALYSIS.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter: uploadFileFilter,
})
