// Guards a running audit against being thrown away by a stray click.
//
// The audit runs in the page: a single file is an in-flight fetch owned by
// index.vue, and a batch is a client-side worker looping over the queue. Both
// die with the page. Leaving — the header "Status" link (a real document
// navigation), FAQs, an in-app link like "What's New", a reload, or closing
// the tab — discards the report with no way to get it back short of
// re-uploading and waiting again.
//
// The warning is strictly conditional: NOTHING is shown unless an audit is
// actually running. An always-on caution would be noise on every click for
// the overwhelming majority of visits, and the kind of notice people learn to
// dismiss without reading — which is worse than none at all.

/**
 * Shared "an audit is running right now" flag.
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
