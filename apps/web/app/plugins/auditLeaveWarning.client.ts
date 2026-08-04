// Warns before a click throws away a running audit. See
// composables/useAuditInProgress.ts for why this exists and what it protects.
//
// Client-only (`.client.ts`): there is no window, no router history and no
// running audit during SSR.
//
// Two listeners are needed because the two kinds of "leaving" are unrelated
// in the browser:
//
//   beforeunload  — real document navigations and the tab going away: the
//                   header "Status" link (a plain <a>, deliberately), FAQs,
//                   reload, back to another origin, closing the tab. The
//                   router never sees any of these.
//
//   router guard  — in-app navigation: "What's New", "My History", the
//                   footer's Scoring link. No document unload happens, so
//                   beforeunload never fires.
//
// Neither does anything while `busy` is false — no dialog, no prompt, no
// interception.
export default defineNuxtPlugin(() => {
  // Captured here, while the Nuxt instance is active. The listeners below run
  // outside that context, where calling useState() would throw.
  const busy = useAuditInProgress();
  const router = useRouter();

  window.addEventListener("beforeunload", (event) => {
    if (!busy.value) return;
    // The modern signal and the legacy one; browsers still disagree on which
    // they honour, and both are ignored unless the page has seen a user
    // gesture (uploading a file counts, so an audit always qualifies).
    event.preventDefault();
    event.returnValue = "";
  });

  router.beforeEach((to, from) => {
    // A reset that lands on the page it started from is not leaving.
    if (to.fullPath === from.fullPath) return true;
    return guardNavigation(busy.value, (message) => window.confirm(message));
  });
});
