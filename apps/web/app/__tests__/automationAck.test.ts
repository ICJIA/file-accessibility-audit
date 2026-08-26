import "./test-helpers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import AutomationAckBanner from "../components/AutomationAckBanner.vue";
import {
  AUTOMATION_ACK_KEY,
  AUTOMATION_ACK_TTL_MS,
  needsAutomationAck,
  recordAutomationAck,
} from "../utils/automationAck";
import { AUTOMATION_ACK_HOURS } from "../../../../audit.config";

// The cookie-banner-style half of the automation-honesty pair (user request,
// 2026-08-26): every visitor proactively acknowledges — "I understand" —
// that automated checkers only test a subset of accessibility. The user's
// constraints, all pinned here:
//   - "not too invasive — but a user has to be proactive with it": a fixed
//     bottom bar, never a modal; nothing blocked, no focus stolen.
//   - "acknowledge at least once, but not keep getting hammered by it": the
//     click is remembered for a full week, client-side only, then the bar
//     returns.
//   - the message itself: this site checks a subset (~30–40%), the rest
//     needs a person, and that is true of every checker (Acrobat, PAC,
//     Word's) — same claim the AutomationLimitBand sources in full.

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the acknowledgment window — a full week, then the bar returns", () => {
  it("is one week, the user's pick — acknowledge at least once, never hammered", () => {
    expect(AUTOMATION_ACK_HOURS).toBe(168);
    expect(AUTOMATION_ACK_TTL_MS).toBe(168 * HOUR);
  });

  it("wants an acknowledgment from a browser that never gave one", () => {
    expect(needsAutomationAck()).toBe(true);
  });

  it("stays quiet inside the week and returns after it", () => {
    const now = 1_700_000_000_000;
    recordAutomationAck(now);
    expect(needsAutomationAck(now)).toBe(false);
    expect(needsAutomationAck(now + AUTOMATION_ACK_TTL_MS - 1)).toBe(false);
    expect(needsAutomationAck(now + AUTOMATION_ACK_TTL_MS + 1)).toBe(true);
  });

  it("treats a junk stored value as never acknowledged", () => {
    localStorage.setItem(AUTOMATION_ACK_KEY, "definitely-not-a-timestamp");
    expect(needsAutomationAck()).toBe(true);
  });

  it("treats a timestamp from the future as junk — a wrong clock must not silence the bar", () => {
    const now = 1_700_000_000_000;
    localStorage.setItem(AUTOMATION_ACK_KEY, String(now + 1_000_000_000));
    expect(needsAutomationAck(now)).toBe(true);
  });

  it("fails OPEN when storage throws, and recording the ack never throws either", () => {
    // Private mode / blocked site data: the one extra reminder is cheap; a
    // visitor never told the checker's limits is not.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(needsAutomationAck()).toBe(true);
    expect(() => recordAutomationAck()).not.toThrow();
  });
});

describe("AutomationAckBanner — proactive, not invasive", () => {
  it("shows for a browser that never acknowledged, with the subset message and the button", async () => {
    const w = mount(AutomationAckBanner);
    await nextTick();
    const bar = w.find('[data-testid="automation-ack"]');
    expect(bar.exists()).toBe(true);
    const text = bar.text();
    expect(text).toContain("30–40%");
    expect(text).toContain("Adobe Acrobat");
    expect(text).toContain("PAC");
    expect(text).toContain("Word");
    expect(text).toContain("needs a person");
    expect(text).toContain("Ask your agency accessibility coordinator");
    expect(w.find('[data-testid="automation-ack-btn"]').text()).toBe("I understand");
  });

  it("clicking 'I understand' hides the bar and stores the timestamp", async () => {
    const w = mount(AutomationAckBanner);
    await nextTick();
    await w.find('[data-testid="automation-ack-btn"]').trigger("click");
    expect(w.find('[data-testid="automation-ack"]').exists()).toBe(false);
    const stored = Number(localStorage.getItem(AUTOMATION_ACK_KEY));
    expect(Number.isFinite(stored)).toBe(true);
    expect(stored).toBeGreaterThan(0);
  });

  it("stays away for a browser that acknowledged within the week", async () => {
    localStorage.setItem(AUTOMATION_ACK_KEY, String(Date.now()));
    const w = mount(AutomationAckBanner);
    await nextTick();
    expect(w.find('[data-testid="automation-ack"]').exists()).toBe(false);
  });

  it("returns for a browser whose acknowledgment is older than the week", async () => {
    localStorage.setItem(AUTOMATION_ACK_KEY, String(Date.now() - AUTOMATION_ACK_TTL_MS - HOUR));
    const w = mount(AutomationAckBanner);
    await nextTick();
    expect(w.find('[data-testid="automation-ack"]').exists()).toBe(true);
  });

  it("is a bottom bar, never a modal — nothing blocked, no focus stolen", async () => {
    const w = mount(AutomationAckBanner);
    await nextTick();
    const html = w.html();
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("aria-modal");
    const bar = w.find('[data-testid="automation-ack"]');
    expect(bar.classes()).toContain("fixed");
    expect(bar.classes()).toContain("bottom-0");
    expect(bar.classes()).not.toContain("inset-0");
    // Real button, and the section is labelled by its own lead sentence.
    expect(w.find('button[type="button"][data-testid="automation-ack-btn"]').exists()).toBe(true);
    const labelledBy = bar.attributes("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(w.find(`#${labelledBy}`).exists()).toBe(true);
  });

  it("rides the app shell, so every page carries it", () => {
    const src = readFileSync(resolve(__dirname, "../app.vue"), "utf8");
    expect(src).toContain("<AutomationAckBanner />");
  });
});
