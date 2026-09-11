import multer from "multer";
import { unsupportedFormatHint } from "@file-audit/shared";
import { recordRejectedUpload } from "../services/auditLog.js";
import { isPrivilegedRequest } from "./rateLimiter.js";
import { ANALYSIS, DOCX, PPTX, XLSX } from "#config";

const storage = multer.memoryStorage();

/** multer's `limits`, plus the option @types/multer 2.2.0 predates. */
export type MultipartLimits = NonNullable<multer.Options["limits"]> & {
  /** Largest numeric index accepted in a field name (`a[3]` is index 3). */
  fieldArrayIndexLimit?: number;
};

/**
 * The largest array index any multipart field name may carry — on EVERY
 * multer instance in this API, which is why it is exported: /api/remediate
 * builds its own parser and must apply the same number.
 *
 * Zero, because no upload form here sends a text field at all: the web app
 * and the CLI append a single "file" part and nothing else, so no field name
 * needs an index and the tightest limit costs nothing.
 *
 * It closes GHSA-535w-7cp7-47q4. Without it, a field named items[4294967294]
 * makes append-field build a maximum-length sparse array, and a second field
 * on the same base walks all 4.29 billion slots synchronously — one anonymous
 * request freezes the process. multer 2.3.0 ships this limit OFF (Infinity),
 * so upgrading alone does not close the advisory; the number has to be set.
 */
export const FIELD_ARRAY_INDEX_LIMIT = 0;

/**
 * Builds the upload-rejection message from the enabled formats' labels with
 * correct one/two/many joining:
 *   ['PDF']                → 'Only PDF files are accepted'
 *   ['PDF', 'B']           → 'Only PDF and B files are accepted'
 *   ['PDF', 'B', 'C']      → 'Only PDF, B, and C files are accepted'
 * The label list is assembled from the feature flags at rejection time, so a
 * future format extends it with a single push.
 * Exported for unit tests.
 */
export function acceptedFormatsMessage(labels: string[]): string {
  const list =
    labels.length <= 1
      ? (labels[0] ?? "")
      : labels.length === 2
        ? `${labels[0]} and ${labels[1]}`
        : `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
  return `Only ${list} files are accepted`;
}

/**
 * Thrown by uploadFileFilter when the upload matches none of the enabled
 * formats. Carries `status = 400` (matching the PageAuditBusyError /
 * SafeFetchError convention of a status-bearing Error subclass) so the
 * app-level error handler (index.ts: `err.status || 500`) returns 400 with
 * this message instead of falling through to a generic 500 — a plain
 * `new Error(...)` here has no `.status`, and the multer error path skips
 * the route's own try/catch entirely, going straight to that handler.
 */
export class UnsupportedFileTypeError extends Error {
  readonly status = 400;
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
  const name = file.originalname.toLowerCase();
  const isPdf = file.mimetype === "application/pdf" || name.endsWith(".pdf");
  const isDocx = DOCX.ENABLED && (file.mimetype === DOCX.MIME_TYPE || name.endsWith(".docx"));
  const isPptx = PPTX.ENABLED && (file.mimetype === PPTX.MIME_TYPE || name.endsWith(".pptx"));
  const isXlsx = XLSX.ENABLED && (file.mimetype === XLSX.MIME_TYPE || name.endsWith(".xlsx"));
  if (isPdf || isDocx || isPptx || isXlsx) {
    cb(null, true);
    return;
  }

  // A legacy Office binary or a CSV gets specific, actionable copy rather than
  // the accepted-formats list, which tells someone holding a real Word
  // document nothing they can act on. Rejected here on the extension rather
  // than accepted-then-detected, so we do not spend the upload bandwidth on a
  // file that is certain to be refused; the content-based path in
  // routes/analyze.ts covers the renamed case the extension cannot see.
  const hint = unsupportedFormatHint(file.originalname);
  if (hint) {
    cb(new UnsupportedFileTypeError(hint));
    return;
  }

  const labels = ["PDF"];
  if (DOCX.ENABLED) labels.push("Word (.docx)");
  if (PPTX.ENABLED) labels.push("PowerPoint (.pptx)");
  if (XLSX.ENABLED) labels.push("Excel (.xlsx)");
  cb(new UnsupportedFileTypeError(acceptedFormatsMessage(labels)));
}

const uploadLimits: MultipartLimits = {
  fileSize: ANALYSIS.MAX_FILE_SIZE_MB * 1024 * 1024,
  files: 1,
  fieldArrayIndexLimit: FIELD_ARRAY_INDEX_LIMIT,
};

export const uploadMiddleware = multer({
  storage,
  limits: uploadLimits,
  // uploadFileFilter stays a PURE decision function — it is exported and
  // unit-tested as one. The side effect lives here in the wrapper instead, so
  // counting refusals cannot make the decision logic harder to test or reason
  // about. A logging failure is swallowed inside recordRejectedUpload, so it
  // can never turn a clean 400 into a 500.
  fileFilter: (req, file, cb) => {
    uploadFileFilter(req, file, (error, accept) => {
      // multer's callback is overloaded — (error) or (null, accept) — so the
      // branches cannot be collapsed into one cb(error, accept) call.
      if (error) {
        recordRejectedUpload({ filename: file.originalname, privileged: isPrivilegedRequest(req) });
        cb(error);
        return;
      }
      cb(null, accept ?? false);
    });
  },
});
