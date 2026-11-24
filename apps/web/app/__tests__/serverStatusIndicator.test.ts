import "./test-helpers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import ServerStatusIndicator from "../components/ServerStatusIndicator.vue";

// The header's status light, now a link to /status with a tooltip naming the
// systems its "online" is actually claiming.
//
// Two prior lessons are load-bearing here. The `title` attribute is not a
// tooltip anyone can rely on — it needs a ~1s mouse hover, never appears on
// touch, and is not announced to screen readers (the "Don't Panic" chip
// dropped it for exactly those reasons in v1.37.5) — so this is a real
// on-page tooltip: hover OR focus opens it, Escape dismisses it, and
// aria-describedby carries it to screen readers. And /status is a Nitro
// SERVER route: a <NuxtLink> would client-side-navigate into the SPA 404, so
// the link must stay a plain <a>, pointing at ?html like every other in-site
// status link (v1.42.1).

const SYSTEMS = [
  { id: "database", label: "Database", ok: true, state: "up" },
  { id: "qpdf", label: "Document audits (qpdf)", ok: true, state: "up" },
  { id: "verapdf", label: "PDF/UA checks (veraPDF)", ok: null, state: "not yet checked" },
  { id: "backup", label: "Nightly backup", ok: false, state: "stale" },
  { id: "disk", label: "Disk space", ok: true, state: "ok" },
];

function mockHealth(payload: unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => payload })),
  );
}

let wrapper: VueWrapper | null = null;

async function mountIndicator(): Promise<VueWrapper> {
  wrapper = mount(ServerStatusIndicator, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

afterEach(() => {
  // Unmount clears the component's self-scheduling poll timer.
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe("the indicator is a link to the status page", () => {
  it("is a plain <a href='/status?html'>, never a NuxtLink", async () => {
    // /status is a Nitro server route; client-side navigation renders the SPA
    // 404. ?html matches every other in-site status link.
    mockHealth({ status: "ok", uptime: "2h 3m", systems: SYSTEMS });
    const w = await mountIndicator();
    const link = w.find('[data-testid="server-status-link"]');
    expect(link.element.tagName).toBe("A");
    expect(link.attributes("href")).toBe("/status?html");
    // Comments stripped first: the component's own comment names NuxtLink to
    // explain why it is NOT used.
    const source = readFileSync(
      resolve(__dirname, "../components/ServerStatusIndicator.vue"),
      "utf-8",
    ).replace(/<!--[\s\S]*?-->|\/\/[^\n]*/g, "");
    expect(source).not.toContain("NuxtLink");
    expect(source).not.toContain("router-link");
  });

  it("keeps the visible status text as the link's accessible name (WCAG 2.5.3)", async () => {
    // No aria-label overriding the visible words: a voice-control user says
    // what they see. On narrow screens sr-only keeps the same name.
    mockHealth({ status: "ok", uptime: "2h 3m", systems: SYSTEMS });
    const w = await mountIndicator();
    const link = w.find('[data-testid="server-status-link"]');
    expect(link.attributes("aria-label")).toBeUndefined();
    expect(link.text()).toContain("audit server online");
  });

  it("still announces state changes politely", async () => {
    mockHealth({ status: "ok", uptime: "2h 3m", systems: SYSTEMS });
    const w = await mountIndicator();
    expect(w.find('[role="status"]').text()).toContain("audit server online");
  });
});

describe("the tooltip names what 'online' is claiming", () => {
  it("is linked via aria-describedby and role=tooltip, and starts hidden", async () => {
    mockHealth({ status: "ok", uptime: "2h 3m", systems: SYSTEMS });
    const w = await mountIndicator();
    const tip = w.find('[data-testid="server-status-tooltip"]');
    expect(tip.attributes("role")).toBe("tooltip");
    expect(w.find('[data-testid="server-status-link"]').attributes("aria-describedby")).toBe(
      tip.attributes("id"),
    );
    expect(tip.classes()).toContain("hidden");
  });

  it("opens on keyboard focus, not only on hover (WCAG 1.4.13)", async () => {
    mockHealth({ status: "ok", uptime: "2h 3m", systems: SYSTEMS });
    const w = await mountIndicator();
    await w.find('[data-testid="server-status-link"]').trigger("focusin");
    expect(w.find('[data-testid="server-status-tooltip"]').classes()).not.toContain("hidden");
    await w.find('[data-testid="server-status-link"]').trigger("focusout");
    expect(w.find('[data-testid="server-status-tooltip"]').classes()).toContain("hidden");
  });

  it("opens on hover and is dismissed by Escape without losing it forever", async () => {
    mockHealth({ status: "ok", uptime: "2h 3m", systems: SYSTEMS });
    const w = await mountIndicator();
    const root = w.find("span.relative");
    await root.trigger("mouseenter");
    expect(w.find('[data-testid="server-status-tooltip"]').classes()).not.toContain("hidden");
    // Escape hides it in place (1.4.13 "dismissible") …
    await root.trigger("keydown", { key: "Escape" });
    expect(w.find('[data-testid="server-status-tooltip"]').classes()).toContain("hidden");
    // … and it stays hidden until the pointer leaves and returns.
    await root.trigger("mouseleave");
    await root.trigger("mouseenter");
    expect(w.find('[data-testid="server-status-tooltip"]').classes()).not.toContain("hidden");
  });

  it("lists each system with a word for its state, never colour or glyph alone", async () => {
    // WCAG 1.4.1: the ✓/✕ glyphs are decoration; the words carry the state.
    mockHealth({ status: "degraded", degraded: ["backup"], systems: SYSTEMS });
    const w = await mountIndicator();
    const tip = w.find('[data-testid="server-status-tooltip"]');
    expect(tip.text()).toContain("Database");
    expect(tip.text()).toContain("Document audits (qpdf)");
    expect(tip.text()).toContain("Nightly backup");
    expect(tip.text()).toContain("stale");
    expect(tip.text()).toContain("up");
  });

  it("colours each glyph as a second channel beside the word — never instead of it", async () => {
    // Green ✓ / red ✕ at a glance, requested after real use; the word stays,
    // so nothing rides on colour alone (WCAG 1.4.1). The classes are the same
    // status tokens the contrast group below measures on --surface-raised —
    // the tooltip's own background — so these exact pairs are already proven
    // ≥ 4.5:1 in both palettes. Unknown stays muted: it is not good news or
    // bad news, and painting it green would dress "not yet checked" up as up.
    mockHealth({ status: "degraded", degraded: ["backup"], systems: SYSTEMS });
    const w = await mountIndicator();
    const rows = w.findAll('[data-testid="server-status-tooltip"] .flex');
    const glyph = (label: string) =>
      rows.find((r) => r.text().includes(label))!.find('[aria-hidden="true"]');
    expect(glyph("Database").classes()).toContain("text-[var(--status-success)]");
    expect(glyph("Nightly backup").classes()).toContain("text-[var(--status-error)]");
    expect(glyph("veraPDF").classes()).toContain("text-[var(--text-muted)]");
    expect(glyph("veraPDF").classes().join(" ")).not.toMatch(/status-success|status-error/);
  });

  it("shows 'not established' as its own state, never dressed up as up or down", async () => {
    // An engine /status has never probed is unknown. Claiming "up" would be
    // an unverified claim on the one signal visible on every page.
    mockHealth({ status: "ok", systems: SYSTEMS });
    const w = await mountIndicator();
    const rows = w.findAll('[data-testid="server-status-tooltip"] .flex');
    const verapdf = rows.find((r) => r.text().includes("veraPDF"))!;
    expect(verapdf.text()).toContain("not yet checked");
    expect(verapdf.text()).not.toContain("✓");
    expect(verapdf.text()).not.toContain("✕");
  });

  it("stops asserting system states once the service stops answering", async () => {
    mockHealth({ status: "ok", uptime: "1m", systems: SYSTEMS });
    const w = await mountIndicator();
    expect(w.find('[data-testid="server-status-tooltip"]').text()).toContain("Database");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    // Re-probe on tab refocus is the cheapest path to a fresh poll.
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    const tip = w.find('[data-testid="server-status-tooltip"]');
    expect(w.text()).toContain("audit server offline");
    expect(tip.text()).toContain("not answering");
    expect(tip.text()).not.toContain("Database");
  });
});

describe("tooltip contrast, measured on both themes", () => {
  // "Verified visible on both light and dark" as arithmetic, not opinion. The
  // tooltip paints --text-heading and --text-secondary on --surface-raised;
  // both pairs must clear WCAG AA 4.5:1 in each theme's own palette. Inline
  // var() styles are invisible to this DOM (it drops them entirely), so the
  // check reads the stylesheet the way colorTokens.test.ts does.
  const css = readFileSync(resolve(__dirname, "../assets/css/main.css"), "utf-8");

  function tokens(block: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]!] = m[2]!;
    return out;
  }
  const dark = tokens(css.slice(css.indexOf(":root {"), css.indexOf("html.light {")));
  const light = tokens(css.slice(css.indexOf("html.light {")));

  function luminance(hex: string): number {
    const c = (i: number) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5);
  }
  function contrast(a: string, b: string): number {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  it.each([
    ["dark", dark],
    ["light", light],
  ])("clears WCAG AA 4.5:1 on the %s theme", (_name, palette) => {
    const surface = palette["--surface-raised"]!;
    expect(surface, "--surface-raised must be defined").toBeTruthy();
    for (const token of ["--text-heading", "--text-secondary"]) {
      const fg = palette[token]!;
      expect(fg, `${token} must be defined`).toBeTruthy();
      expect(
        contrast(fg, surface),
        `${token} ${fg} on --surface-raised ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the tooltip actually uses those tokens", () => {
    // The arithmetic above is only meaningful while the component paints with
    // the tokens it measures.
    const source = readFileSync(
      resolve(__dirname, "../components/ServerStatusIndicator.vue"),
      "utf-8",
    );
    const tip = source.slice(source.indexOf('role="tooltip"'));
    expect(tip).toContain("bg-[var(--surface-raised)]");
    expect(tip).toContain("text-[var(--text-heading)]");
    expect(tip).toContain("text-[var(--text-secondary)]");
  });

  it.each([
    ["dark", dark],
    ["light", light],
  ])("the status text clears 4.5:1 on its resting AND hover surfaces — %s", (_name, palette) => {
    // The link's visible name is coloured by state. Its resting background is
    // the header (--surface-body; the header paints none of its own) and its
    // hover background is --surface-raised — and the hover surface is the one
    // that caught real failures: on light, green-700 measured 4.46:1 and
    // red-600 4.3:1 there, which is why the light tokens are -800/-700 now.
    // Raw green-500/amber-500, which this replaced, measured ~2:1 on light.
    for (const token of ["--status-success", "--status-warning-yellow", "--status-error"]) {
      const fg = palette[token]!;
      expect(fg, `${token} must be defined`).toBeTruthy();
      for (const surface of ["--surface-body", "--surface-raised"]) {
        expect(
          contrast(fg, palette[surface]!),
          `${token} ${fg} on ${surface} ${palette[surface]}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("the status text actually uses those tokens", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/ServerStatusIndicator.vue"),
      "utf-8",
    );
    expect(source).toContain("text-[var(--status-success)]");
    expect(source).toContain("text-[var(--status-warning-yellow)]");
    expect(source).toContain("text-[var(--status-error)]");
    // The raw shades it replaced must not creep back for the text (the dot
    // keeps its Tailwind colours: it is decorative beside the word).
    expect(source).not.toContain("text-green-500");
    expect(source).not.toContain("text-amber-500");
    expect(source).not.toContain("text-red-500");
  });
});

// ---------------------------------------------------------------------------
// What a probe establishes — and when it is worth asking at all.
//
// The header said "audit server offline" for ANY non-200, a 429 included: the
// rate limiter answering this tab was reported as the service being down. And
// the probe ran every 20 s in tabs nobody was looking at.
// ---------------------------------------------------------------------------
describe("probe outcomes: offline only when that is what was established", () => {
  function mockResponse(status: number, payload: unknown = {}): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
      })),
    );
  }

  it("a 429 is 'still checking', never offline", async () => {
    mockResponse(429, { error: "Too many requests" });
    const w = await mountIndicator();
    expect(w.text()).not.toContain("offline");
    expect(w.text()).toContain("audit server…");
    expect(w.find('[data-testid="server-status-tooltip"]').text()).toContain("Still checking");
  });

  it.each([400, 403, 404])("a %i is not offline either", async (code) => {
    mockResponse(code);
    const w = await mountIndicator();
    expect(w.text()).not.toContain("offline");
    expect(w.text()).toContain("audit server…");
  });

  it("a 200 that is not the health payload asserts nothing", async () => {
    mockResponse(200, { hello: "proxy" });
    const w = await mountIndicator();
    expect(w.text()).not.toContain("offline");
    expect(w.text()).not.toContain("online");
  });

  it.each([500, 502, 503, 504])("a %i IS offline", async (code) => {
    mockResponse(code);
    const w = await mountIndicator();
    expect(w.text()).toContain("audit server offline");
  });

  it("no answer at all IS offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const w = await mountIndicator();
    expect(w.text()).toContain("audit server offline");
  });

  it("drops last-known system states when an answer is not a verdict", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ++n === 1
          ? { ok: true, status: 200, json: async () => ({ status: "ok", systems: SYSTEMS }) }
          : { ok: false, status: 429, json: async () => ({}) },
      ),
    );
    vi.useFakeTimers();
    try {
      wrapper = mount(ServerStatusIndicator, { attachTo: document.body });
      await vi.advanceTimersByTimeAsync(0);
      expect(wrapper.text()).toContain("Database");
      await vi.advanceTimersByTimeAsync(20_000);
      expect(wrapper.text()).not.toContain("Database");
      expect(wrapper.text()).not.toContain("offline");
    } finally {
      wrapper?.unmount();
      wrapper = null;
      vi.useRealTimers();
    }
  });
});

describe("polling: paced by state, paused in hidden tabs, cleaned up on unmount", () => {
  let visibility: "visible" | "hidden" = "visible";
  function setVisibility(v: "visible" | "hidden") {
    visibility = v;
    document.dispatchEvent(new Event("visibilitychange"));
  }
  function fetchSpy(status: number, payload: unknown) {
    const spy = vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    }));
    vi.stubGlobal("fetch", spy);
    return spy;
  }
  async function mountWithTimers() {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    wrapper = mount(ServerStatusIndicator, { attachTo: document.body });
    await vi.advanceTimersByTimeAsync(0);
  }
  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    visibility = "visible";
    vi.useRealTimers();
  });

  it("checks every 20 s when healthy", async () => {
    const spy = fetchSpy(200, { status: "ok", systems: SYSTEMS });
    await mountWithTimers();
    expect(spy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(spy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not hurry after a 429 — that is what the limiter is asking for", async () => {
    const spy = fetchSpy(429, {});
    await mountWithTimers();
    await vi.advanceTimersByTimeAsync(19_999);
    expect(spy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("retries quickly only while the service is not answering, then settles", async () => {
    const spy = fetchSpy(503, {});
    await mountWithTimers();
    await vi.advanceTimersByTimeAsync(2_500 * 5);
    expect(spy).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(spy).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledTimes(7);
  });

  it("stops asking while the tab is hidden and probes once when it is shown", async () => {
    const spy = fetchSpy(200, { status: "ok", systems: SYSTEMS });
    await mountWithTimers();
    expect(spy).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(spy).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(spy).toHaveBeenCalledTimes(2);
    // …and the ordinary cadence resumes: one loop, not two.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("does not probe at all when mounted in a background tab", async () => {
    visibility = "hidden";
    const spy = fetchSpy(200, { status: "ok", systems: SYSTEMS });
    await mountWithTimers();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(spy).not.toHaveBeenCalled();
  });

  it("clears its timer and listener on unmount", async () => {
    const spy = fetchSpy(200, { status: "ok", systems: SYSTEMS });
    await mountWithTimers();
    wrapper!.unmount();
    wrapper = null;
    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
