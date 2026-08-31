// Guards a running audit against being thrown away by a stray click.
//
// NARROWED IN v1.147.0 — read this before using the flag. It no longer means
// "an audit is running". It means "an audit is running THAT LEAVING WOULD
// DESTROY", and those are no longer the same thing.
//
// A single-file upload now runs as a server-side job (POST /api/analyze-job)
// whose id and token the page stores in sessionStorage, so a real navigation
// and a return rejoin the same audit instead of losing it. Prompting in that
// case would warn about a consequence that does not happen — the worst kind
// of dialog, and the one people learn to click through.
//
// What leaving still destroys, and what this flag is therefore still true for:
//   · a BATCH — a client-side loop over the queue, holding File objects that
//     cannot be serialised and a report per file that was never persisted
//   · the SYNCHRONOUS fallback (an older API with no job endpoints) — one
//     in-flight fetch owned by the page, with no job to rejoin
//   · a single file whose job could NOT be stored — some privacy modes throw
//     on sessionStorage, and a full quota rejects the write. index.vue checks
//     the return value rather than assuming the write worked.
//
// The warning is strictly conditional: NOTHING is shown unless an audit is
// actually running. An always-on caution would be noise on every click for
// the overwhelming majority of visits, and the kind of notice people learn to
// dismiss without reading — which is worse than none at all.

/**
 * Shared "leaving would destroy a running audit" flag (see the note above:
 * a resumable single-file job deliberately does NOT set this).
 *
 * `useState` rather than provide/inject because the readers are not all
 * descendants of the page that owns the state: the navigation guard lives in
 * a plugin, and `goAnalyze` lives in app.vue — the page's *ancestor*, which
 * inject cannot reach.
 *
 * index.vue is the only writer. It must clear this on unmount, or a confirmed
 * departure would leave the flag stuck true and prompt on every later click.
 */
export function useAuditInProgress() {
  return useState<boolean>("audit-in-progress", () => false);
}

/**
 * Shown when leaving would destroy a running audit.
 *
 * Note: `beforeunload` cannot display this. Browsers deliberately ignore
 * custom text there and show their own generic "Leave site?" wording, so this
 * string is what the in-app paths (router guard, site-title reset) say.
 */
export const AUDIT_LEAVE_WARNING =
  "An audit is still running. If you leave this page now, it will be cancelled and its report discarded.";

/**
 * Should this navigation proceed?
 *
 * Pure and injectable so the one property that matters can be tested
 * directly: when no audit is running, `ask` is never called — no prompt, no
 * dialog, nothing between the visitor and the link they clicked.
 *
 * `ask` is `window.confirm` in production. A native dialog rather than a
 * bespoke modal on purpose: it is keyboard-operable, screen-reader announced,
 * and correctly modal for free. Hand-rolling that (focus trap, `aria-modal`,
 * Escape handling, focus restoration) is where accessibility bugs live, and
 * this app has no business shipping one.
 */
export function guardNavigation(auditRunning: boolean, ask: (message: string) => boolean): boolean {
  if (!auditRunning) return true;
  return ask(AUDIT_LEAVE_WARNING);
}
