/**
 * The one wording for "this audit ran out of time", shared by every surface
 * that can produce it: the upload route, the URL-audit route, the job store's
 * backstop, the browser's own poll backstop, and the fleet inventory runner.
 *
 * WHY IT READS THE WAY IT DOES (2026-08-28): the previous copy said "This file
 * is too complex to analyze within the time limit", and it was reached from a
 * catch-all on `err.killed` — any killed subprocess, whatever the reason. A
 * 246-page annual report hit it, and that document is not complex: qpdf parses
 * it in 1.7 seconds. The audit had starved its own qpdf pass by running it
 * beside pdfjs and two veraPDF JVMs on a two-core server, and then told the
 * author the fault was in their document. An author who believes that goes off
 * to split a perfectly good report into pieces.
 *
 * So: say what happened, say it is usually about timing, and ask for a retry
 * first. Splitting the document is the LAST suggestion, not the first.
 */

export interface AuditErrorBody {
  error: string;
  details?: string;
}

/** The visitor-facing card shown when an audit does not finish in time. */
export const AUDIT_TIMEOUT_MESSAGE: AuditErrorBody = {
  error: "This audit could not be finished in time.",
  details:
    "Long documents take the longest to check, and a busy server can push a large one past the time limit — this is usually about timing rather than a fault in your document. Please wait a moment and try again, which is enough on its own most of the time. If it keeps happening, try splitting the document into smaller sections and checking each one.",
};

/** The one-line form the fleet inventory runner records per document. */
export const AUDIT_TIMEOUT_SUMMARY =
  "analysis did not finish in time — the server may have been busy; try this document again";
