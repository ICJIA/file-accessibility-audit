import { AUTOMATION_ACK_HOURS } from "../../../../audit.config";

/**
 * State for the site-wide automation acknowledgment bar
 * (AutomationAckBanner.vue): has this browser clicked "I understand" within
 * the last AUTOMATION_ACK_HOURS?
 *
 * Client-side only by construction — the stored value is an epoch-ms
 * timestamp in localStorage, never a cookie, so nothing about the
 * acknowledgment ever reaches the server. Both functions are called from
 * onMounted/click handlers only; localStorage does not exist during SSR.
 */

/** The key name matches the app's other client-side keys
 *  (`a11y-audit:dismissed-announcements`). */
export const AUTOMATION_ACK_KEY = "a11y-audit:automation-ack";

export const AUTOMATION_ACK_TTL_MS = AUTOMATION_ACK_HOURS * 60 * 60 * 1000;

/**
 * True when the bar should show. Fails OPEN — show the bar — on anything
 * unexpected: missing value, junk value, a timestamp from the future (a
 * wrong clock must not suppress the bar for years), or a storage layer that
 * throws (private mode). The cost of failing open is one extra reminder; the
 * cost of failing closed is a visitor never told the checker's limits.
 */
export function needsAutomationAck(now: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(AUTOMATION_ACK_KEY);
    if (!raw) return true;
    const at = Number(raw);
    if (!Number.isFinite(at) || at > now) return true;
    return now - at > AUTOMATION_ACK_TTL_MS;
  } catch {
    return true;
  }
}

export function recordAutomationAck(now: number = Date.now()): void {
  try {
    localStorage.setItem(AUTOMATION_ACK_KEY, String(now));
  } catch {
    // Blocked storage: the component still hides for this page view; the bar
    // simply returns on the next load.
  }
}
