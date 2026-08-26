import { computed } from "vue";
import { needsAutomationAck, recordAutomationAck } from "~/utils/automationAck";

/**
 * The one source of truth for "has this visitor acknowledged what automated
 * checking can and cannot cover?" — shared by the bar that asks
 * (AutomationAckBanner) and every surface that refuses to work until it is
 * answered (DropZone, index.vue's analyze entry points, RemediateButton).
 *
 * `useState` rather than provide/inject for the same reason
 * [[useAuditInProgress]] uses it: the readers are not all descendants of one
 * page — the bar lives in app.vue, the gate lives inside the page.
 *
 * THREE states, not two, and the third one matters:
 *   null  — not resolved yet (SSR, and the tick before onMounted). The answer
 *           lives in localStorage, which does not exist on the server.
 *   true  — acknowledged within AUTOMATION_ACK_HOURS.
 *   false — needs an acknowledgment; work is blocked.
 *
 * `blocked` is deliberately FALSE while the state is null. Gating on "not yet
 * known" would make every returning visitor — the overwhelming majority —
 * load a locked drop zone that unlocks a moment later, which reads as a
 * broken tool. The unresolved window costs nothing: the drop zone's click and
 * drop handlers are Vue listeners, so before hydration they are not attached
 * and no file can be chosen anyway. Once mounted, the state is known and the
 * gate is exact.
 */
export function useAutomationAck() {
  const acknowledged = useState<boolean | null>("automation-ack", () => null);

  /** Bumped whenever someone tries to start work while blocked. The bar
   *  watches it to pull focus to itself — the block has to say where to go,
   *  or it is just a dead drop zone. */
  const nudge = useState<number>("automation-ack-nudge", () => 0);

  /** Client-only: reads localStorage. Safe to call more than once — the
   *  answer is resolved once and then owned by acknowledge(). */
  function resolve(): void {
    if (acknowledged.value === null) acknowledged.value = !needsAutomationAck();
  }

  function acknowledge(): void {
    recordAutomationAck();
    acknowledged.value = true;
  }

  /** Called by a gated surface when work was attempted anyway. */
  function requestAck(): void {
    nudge.value++;
  }

  const blocked = computed(() => acknowledged.value === false);

  return { acknowledged, blocked, nudge, resolve, acknowledge, requestAck };
}

/** The one sentence every gated surface shows. Kept here so the drop zone,
 *  the remediation button, and the tests cannot drift apart. Names the
 *  control rather than describing it ("select I understand"), and stays
 *  action-neutral so it reads correctly above both a check and a
 *  remediation. */
export const AUTOMATION_ACK_GATE_NOTE =
  'Select "I understand" in the notice at the bottom of the page to continue.';
