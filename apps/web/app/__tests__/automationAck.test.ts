import "./test-helpers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import AutomationAckBanner from "../components/AutomationAckBanner.vue";
import DropZone from "../components/DropZone.vue";
import {
  AUTOMATION_ACK_KEY,
  AUTOMATION_ACK_TTL_MS,
  needsAutomationAck,
  recordAutomationAck,
} from "../utils/automationAck";
import { AUTOMATION_ACK_GATE_NOTE, useAutomationAck } from "../composables/useAutomationAck";
import { AUTOMATION_ACK_HOURS } from "../../../../audit.config";

// The acknowledgment gate (user request, 2026-08-26). It began as a
// cookie-banner-style notice and became a LEGAL-COMPLIANCE CONTROL: legal
// wants certainty that people understand this tool checks only part of
// accessibility, so the disclosure is required, not merely displayed —
// nothing can be checked or remediated until "I understand" is clicked.
//
// The constraints, all pinned here:
//   - REQUIRED: every route into work refuses while unacknowledged — the
//     drop zone (picker, drop, staged submit), the page's own analyzeFile /
//     analyzeBatch, and RemediateButton.
//   - FROZEN until acknowledged (v1.103.0, user request): the page does not
//     scroll. That REVERSES v1.102.0's "deliberately not a modal" — and the
//     reversal is the accessible choice, not a concession. A scroll lock
//     without dialog semantics would leave keyboard users tabbing into
//     content they can no longer scroll to, and screen-reader users with no
//     signal that the page behind is inert. So freezing brings role=dialog,
//     aria-modal, contained focus, and a visible backdrop with it. A dialog
//     released by its own button is not a WCAG 2.1.2 keyboard trap.
//   - the block must name its own remedy: a blocked attempt pulls focus to
//     the dialog, or a dead drop zone just reads as a broken tool.
//   - "acknowledge at least once, but not keep getting hammered by it": the
//     click is remembered for a full week, client-side only, then returns.
//   - FAILS CLOSED for the disclosure: absent, junk, future-dated, or
//     unreadable storage all leave the tool gated.
//   - the message, in PLAIN LANGUAGE (user request): this tool finds some
//     accessibility problems and not all of them (~30–40%), the same is true
//     of Acrobat's and Word's checkers, the rest needs a person to look, and
//     a good score does not mean the document is accessible. No jargon — a
//     guard below fails the suite if "alt text", "reading order", "WCAG",
//     "PDF/UA", or a tool acronym creeps back into this copy.
//
// MOUNT THROUGH `mountGate()`, never `mount()` directly. The gate freezes the
// real document and holds real focus, so a wrapper left mounted keeps doing
// both: a second instance then captures the frozen state as the state to
// "restore" to, and two instances' focus guards chase each other into a stack
// overflow. Exactly one exists in the app; the helper keeps that true here.

const HOUR = 60 * 60 * 1000;

const mountedGates: Array<ReturnType<typeof mount>> = [];

function mountGate(): ReturnType<typeof mount> {
  // attachTo: the focus and scroll-lock behaviour is only real in a document.
  const w = mount(AutomationAckBanner, { attachTo: document.body });
  mountedGates.push(w);
  return w;
}

beforeEach(() => {
  localStorage.clear();
  // The shared useState survives between mounts (as it does in the app), so
  // each test starts from "not resolved yet" the way a fresh page load does.
  const ack = useAutomationAck();
  ack.acknowledged.value = null;
  ack.nudge.value = 0;
  // The gate freezes the real document. A wrapper left mounted by an earlier
  // test would otherwise hand the next one a pre-frozen page to "restore" to,
  // making the suite order-dependent. One instance exists in the app; many
  // exist here.
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
});

afterEach(() => {
  while (mountedGates.length) mountedGates.pop()?.unmount();
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

describe("AutomationAckBanner — the dialog that freezes the page until it is answered", () => {
  it("shows for a browser that never acknowledged, with the subset message and the button", async () => {
    const w = mountGate();
    await nextTick();
    const bar = w.find('[data-testid="automation-ack"]');
    expect(bar.exists()).toBe(true);
    const text = bar.text();
    // Plain language for a non-technical audience (user request): the claim
    // survives, the jargon does not. No "alt text", no "reading order", no
    // tool acronyms — a person who has never heard those terms still has to
    // understand what this tool did and did not do.
    expect(text).toContain("finds some accessibility problems — not all of them");
    expect(text).toContain("30–40%");
    expect(text).toContain("Adobe Acrobat");
    expect(text).toContain("Microsoft Word");
    expect(text).toContain("description of a photo actually describes it");
    expect(text).toContain("read aloud in an order that makes sense");
    // The sentence the whole gate exists for.
    expect(text).toContain("does not mean the document is accessible");
    expect(text).toContain("Ask your agency accessibility coordinator");
    expect(w.find('[data-testid="automation-ack-btn"]').text()).toBe("I understand");

    // Jargon guard — these read as English to the team that wrote them and
    // as noise to everyone else.
    for (const jargon of ["alt text", "reading order", "PAC", "WCAG", "PDF/UA", "remediat"]) {
      expect(text, `"${jargon}" is jargon for this audience`).not.toContain(jargon);
    }
  });

  it("clicking 'I understand' hides the bar and stores the timestamp", async () => {
    const w = mountGate();
    await nextTick();
    await w.find('[data-testid="automation-ack-btn"]').trigger("click");
    expect(w.find('[data-testid="automation-ack"]').exists()).toBe(false);
    const stored = Number(localStorage.getItem(AUTOMATION_ACK_KEY));
    expect(Number.isFinite(stored)).toBe(true);
    expect(stored).toBeGreaterThan(0);
  });

  it("stays away for a browser that acknowledged within the week", async () => {
    localStorage.setItem(AUTOMATION_ACK_KEY, String(Date.now()));
    const w = mountGate();
    await nextTick();
    expect(w.find('[data-testid="automation-ack"]').exists()).toBe(false);
  });

  it("returns for a browser whose acknowledgment is older than the week", async () => {
    localStorage.setItem(AUTOMATION_ACK_KEY, String(Date.now() - AUTOMATION_ACK_TTL_MS - HOUR));
    const w = mountGate();
    await nextTick();
    expect(w.find('[data-testid="automation-ack"]').exists()).toBe(true);
  });

  it("is a properly-announced dialog, since the page behind it is frozen", async () => {
    // If the page cannot scroll, assistive tech has to be told the rest is
    // inert and the dialog has to be labelled and described — otherwise the
    // freeze is just a broken page. Attributes, not w.html(): the
    // component's own comment discusses aria-modal, so a raw-string search
    // matches its own prose.
    const w = mountGate();
    await nextTick();
    const bar = w.find('[data-testid="automation-ack"]');
    expect(bar.attributes("role")).toBe("dialog");
    expect(bar.attributes("aria-modal")).toBe("true");

    const labelledBy = bar.attributes("aria-labelledby");
    const describedBy = bar.attributes("aria-describedby");
    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    expect(w.find(`#${labelledBy}`).text()).toContain("Before you check a file");
    expect(w.find(`#${describedBy}`).exists()).toBe(true);

    // A visible reason the page stopped responding.
    expect(w.find('[data-testid="automation-ack-backdrop"]').exists()).toBe(true);
    expect(w.find('button[type="button"][data-testid="automation-ack-btn"]').exists()).toBe(true);
  });

  it("focus starts on the button — the remedy is the first thing you land on", async () => {
    const w = mountGate();
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.find('[data-testid="automation-ack-btn"]').element);
  });

  it("holds focus inside the dialog while the page behind is frozen", async () => {
    // Without this, a keyboard user tabs into content they can no longer
    // scroll to — which is exactly the defect a bare scroll lock creates.
    const outside = document.createElement("button");
    outside.textContent = "somewhere behind the gate";
    document.body.appendChild(outside);

    const w = mountGate();
    await nextTick();
    outside.focus();
    outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await nextTick();

    expect(document.activeElement).toBe(w.find('[data-testid="automation-ack-btn"]').element);
    w.unmount();
    outside.remove();
  });

  it("does NOT close on Escape — the acknowledgment is required", async () => {
    const w = mountGate();
    await nextTick();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();
    expect(w.find('[data-testid="automation-ack"]').exists()).toBe(true);
    expect(localStorage.getItem(AUTOMATION_ACK_KEY)).toBeNull();
  });

  it("rides the app shell, so every page carries it", () => {
    const src = readFileSync(resolve(__dirname, "../app.vue"), "utf8");
    expect(src).toContain("<AutomationAckBanner />");
  });

  it("freezes the page while it is up, and thaws it on acknowledgment", async () => {
    // User request (v1.103.0). Both elements: browsers disagree about which
    // owns the document scroll.
    const w = mountGate();
    await nextTick();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    await w.find('[data-testid="automation-ack-btn"]').trigger("click");
    await nextTick();
    expect(document.documentElement.style.overflow).not.toBe("hidden");
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("never freezes the page for someone who already acknowledged", async () => {
    localStorage.setItem(AUTOMATION_ACK_KEY, String(Date.now()));
    const w = mountGate();
    await nextTick();
    expect(w.find('[data-testid="automation-ack"]').exists()).toBe(false);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("thaws the page on unmount — a frozen page must never outlive the gate", async () => {
    // A route change that unmounts the shell mid-gate would otherwise leave
    // the whole site unscrollable with nothing on screen to explain it.
    const w = mountGate();
    await nextTick();
    expect(document.body.style.overflow).toBe("hidden");
    w.unmount();
    await nextTick();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("takes focus and flashes when a gated surface reports a blocked attempt", async () => {
    // The block has to name its own remedy. Without this the drop zone just
    // stops working, which reads as a broken tool rather than a gate.
    const w = mountGate();
    await nextTick();
    const btn = w.find('[data-testid="automation-ack-btn"]');
    expect(w.find('[data-testid="automation-ack"]').classes()).toContain("border-amber-400");

    useAutomationAck().requestAck();
    await nextTick();

    expect(document.activeElement).toBe(btn.element);
    // Brightens while flashing, so the pull is visible as well as focused.
    expect(w.find('[data-testid="automation-ack"]').classes()).toContain("border-amber-300");
  });
});

describe("the gate — nothing is checked or remediated until it is acknowledged", () => {
  // Legal-compliance control (2026-08-26): the disclosure that this tool
  // checks only PART of accessibility is not merely displayed, it is
  // required. Every route into work refuses while it is unacknowledged.
  const pdf = () => new File(["%PDF-1.7"], "report.pdf", { type: "application/pdf" });

  async function selectFiles(wrapper: ReturnType<typeof mount>, files: File[]) {
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, "files", { value: files, configurable: true });
    await input.trigger("change");
  }

  it("DropZone says why it is closed instead of failing silently", () => {
    const w = mount(DropZone, { props: { blocked: true } });
    const panel = w.find('[data-testid="dropzone-blocked"]');
    expect(panel.exists()).toBe(true);
    expect(panel.text()).toContain("this tool checks only part of accessibility");
    expect(panel.text()).toContain(AUTOMATION_ACK_GATE_NOTE);
    // The invitation to drop files is gone while it cannot be honoured.
    expect(w.text()).not.toContain("or click to browse");
    expect(w.find('[aria-disabled="true"]').exists()).toBe(true);
  });

  it("DropZone refuses a file chosen through the picker and asks for the acknowledgment", async () => {
    const w = mount(DropZone, { props: { blocked: true } });
    await selectFiles(w, [pdf()]);
    expect(w.emitted("file-selected")).toBeUndefined();
    expect(w.emitted("files-selected")).toBeUndefined();
    expect(w.emitted("blocked-attempt")).toHaveLength(1);
  });

  it("DropZone refuses a dropped file too — the route that skips the picker", async () => {
    const w = mount(DropZone, { props: { blocked: true } });
    await w.find(".border-dashed").trigger("drop", { dataTransfer: { files: [pdf()] } });
    expect(w.emitted("file-selected")).toBeUndefined();
    expect(w.emitted("blocked-attempt")).toHaveLength(1);
  });

  it("DropZone never opens the file picker while blocked", async () => {
    const w = mount(DropZone, { props: { blocked: true } });
    const input = w.find('input[type="file"]').element as HTMLInputElement;
    let clicked = 0;
    input.click = () => {
      clicked++;
    };
    await w.find(".border-dashed").trigger("click");
    expect(clicked).toBe(0);
    expect(w.emitted("blocked-attempt")).toHaveLength(1);
  });

  it("DropZone behaves exactly as before once acknowledged", async () => {
    const w = mount(DropZone, { props: { blocked: false } });
    expect(w.find('[data-testid="dropzone-blocked"]').exists()).toBe(false);
    expect(w.text()).toContain("or click to browse");
    await selectFiles(w, [pdf()]);
    expect(w.emitted("file-selected")).toHaveLength(1);
    expect(w.emitted("blocked-attempt")).toBeUndefined();
  });

  it("the page gates its own analyze entry points, not just the drop zone", () => {
    // Defense in depth: DropZone's refusal is the visible half. If any other
    // path ever emits a file, analyzeFile/analyzeBatch still refuse.
    const src = readFileSync(resolve(__dirname, "../pages/index.vue"), "utf8");
    const single = src.slice(src.indexOf("async function analyzeFile"));
    expect(single.slice(0, single.indexOf("processing.value = true"))).toContain(
      "if (ackBlocked.value) return requestAck();",
    );
    const batch = src.slice(src.indexOf("async function analyzeBatch"));
    expect(batch.slice(0, batch.indexOf("singleResult.value = null"))).toContain(
      "if (ackBlocked.value) return requestAck();",
    );
    // And the drop zone is wired to the same state.
    const tag = src.slice(src.indexOf("<DropZone"));
    const attrs = tag.slice(0, tag.indexOf("/>"));
    expect(attrs).toContain(':blocked="ackBlocked"');
    expect(attrs).toContain('@blocked-attempt="requestAck"');
  });

  it("RemediateButton is gated on the same state — the other way a file gets worked on", () => {
    // Source scan, not a mount: RemediateButton imports from "#app", which
    // only resolves inside a real Nuxt runtime (no test mounts it).
    const src = readFileSync(resolve(__dirname, "../components/RemediateButton.vue"), "utf8");
    // Both entry points refuse: the button itself, and the fallback picker
    // it opens when the audited file is no longer in memory.
    expect(src.match(/if \(ackBlocked\.value\) return requestAck\(\);/g)).toHaveLength(2);
    // Disabled, not merely inert.
    expect(src).toContain("|| ackBlocked.value");
    // And it says why.
    expect(src).toContain('data-testid="remediate-blocked"');
    expect(src).toContain("AUTOMATION_ACK_GATE_NOTE");
  });
});
