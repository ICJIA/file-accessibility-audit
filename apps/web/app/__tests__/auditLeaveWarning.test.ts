import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { guardNavigation, AUDIT_LEAVE_WARNING } from "../composables/useAuditInProgress";

// An audit lives entirely in the page: a single file is an in-flight fetch, a
// batch is a client-side loop over the queue. Leaving discards it. The header
// "Status" link is a real document navigation (deliberately — /status is a
// server route), so it takes the whole page with it.
//
// The requirement has two halves and the second is the easy one to break:
// warn when an audit is running, and say NOTHING at all when one is not.

const APP_DIR = resolve(__dirname, "..");

function read(...parts: string[]): string {
  return readFileSync(resolve(APP_DIR, ...parts), "utf-8");
}

describe("guardNavigation", () => {
  it("never prompts when no audit is running", () => {
    // The half that matters most. An unconditional caution would fire on
    // every click for almost every visit — the kind of notice people learn to
    // dismiss unread, which is worse than no notice at all.
    const ask = vi.fn(() => true);
    expect(guardNavigation(false, ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks before discarding a running audit", () => {
    const ask = vi.fn(() => true);
    expect(guardNavigation(true, ask)).toBe(true);
    expect(ask).toHaveBeenCalledWith(AUDIT_LEAVE_WARNING);
  });

  it("blocks the navigation when the answer is no", () => {
    const ask = vi.fn(() => false);
    expect(guardNavigation(true, ask)).toBe(false);
  });

  it("warns about what is actually lost", () => {
    // Vague wording ("are you sure?") gives no basis for a decision.
    expect(AUDIT_LEAVE_WARNING).toMatch(/audit/i);
    expect(AUDIT_LEAVE_WARNING).toMatch(/cancel|discard/i);
  });
});

describe("the guard is installed on every path out", () => {
  const plugin = read("plugins", "auditLeaveWarning.client.ts");

  it("covers document navigations — the Status link among them", () => {
    // The router never sees a plain <a href> to a server route, a reload, or
    // a tab closing. Only beforeunload does.
    expect(plugin).toContain('addEventListener("beforeunload"');
    expect(plugin).toContain("event.preventDefault()");
  });

  it("covers in-app navigations, which never unload the document", () => {
    expect(plugin).toContain("router.beforeEach");
    expect(plugin).toContain("guardNavigation");
  });

  it("returns early from beforeunload when nothing is running", () => {
    // Registering the listener is unconditional; *acting* on it must not be.
    expect(plugin).toMatch(/if \(!busy\.value\) return;/);
  });

  it("is client-only", () => {
    // No window, no router history and no running audit during SSR.
    expect(plugin.length).toBeGreaterThan(0); // the .client.ts path resolved
  });

  it("guards the site-title reset, which no navigation hook can see", () => {
    // goAnalyze navigates to the route it is already on, so beforeunload
    // never fires and the router guard short-circuits — yet mid-batch it
    // abandons the queue.
    const app = read("app.vue");
    expect(app).toContain("guardNavigation(auditInProgress.value");
    expect(app).toMatch(/if \(!guardNavigation[\s\S]{0,80}\) return;/);
  });
});

describe("the flag tracks reality", () => {
  const index = read("pages", "index.vue");

  it("is true for a batch, and for a single audit only when it cannot be rejoined", () => {
    // NARROWED 2026-08-31 (was: `processing.value || batchProcessing.value`).
    // A single-file upload now runs as a server-side job the page can rejoin
    // after a real navigation, so warning about it would describe a loss that
    // does not occur. A batch has no job to rejoin and still counts.
    expect(index).toContain(
      "auditInProgress.value =\n    (processing.value && !singleAuditResumable.value) || batchProcessing.value",
    );
  });

  it("is cleared when the page unmounts", () => {
    // Without this, a confirmed departure leaves the flag stuck true and
    // every later click on any link prompts — exactly the always-on nagging
    // this design exists to avoid.
    expect(index).toMatch(/onBeforeUnmount\(\(\) => \{\s*auditInProgress\.value = false;/);
  });
});

describe("the flag narrowed to 'leaving would DESTROY this audit' (v1.147.0)", () => {
  // Since single-file uploads run as a server-side job whose id and token the
  // page stores, leaving and coming back rejoins the same audit. Warning in
  // that case describes a consequence that does not happen — and a dialog
  // that cries wolf is worse than no dialog.
  it("index.vue excludes a resumable single-file audit from the flag", () => {
    const page = readFileSync(resolve(__dirname, "../pages/index.vue"), "utf8");
    expect(page).toMatch(
      /auditInProgress\.value =\s*\(processing\.value && !singleAuditResumable\.value\) \|\| batchProcessing\.value/,
    );
  });

  it("a batch still sets the flag — its queue really does die with the page", () => {
    const page = readFileSync(resolve(__dirname, "../pages/index.vue"), "utf8");
    const m = page.match(/auditInProgress\.value =[^;]+;/);
    expect(m?.[0]).toContain("batchProcessing.value");
    // and nothing may make the batch conditional on the single-file flag
    expect(m?.[0]).toMatch(/\|\| batchProcessing\.value/);
  });

  it("the resumable flag is only ever set from a SUCCESSFUL store", () => {
    // Assuming the write worked would silence the warning in exactly the tabs
    // that still need it (blocked site data, full quota).
    const page = readFileSync(resolve(__dirname, "../pages/index.vue"), "utf8");
    expect(page).toMatch(/singleAuditResumable\.value = saveRunningAudit\(/);
    // the synchronous fallback has no job to rejoin, so it must clear it
    expect(page).toMatch(/jobUnsupported[\s\S]{0,400}singleAuditResumable\.value = false/);
  });
});

describe("the Status link opens a new tab only when leaving would cost something", () => {
  // It opened one unconditionally once, and was changed back because it "left
  // a stray tab behind on every visit". Conditional pays that cost only when
  // it buys something.
  const files = [
    ["../layouts/default.vue", "the header nav"],
    ["../components/ServerStatusIndicator.vue", "the status dot"],
  ] as const;

  for (const [rel, what] of files) {
    it(`${what}: target is bound to the flag, never hardcoded`, () => {
      const src = readFileSync(resolve(__dirname, rel), "utf8");
      expect(src).toContain(`:target="auditInProgress ? '_blank' : undefined"`);
      expect(src).toContain(`:rel="auditInProgress ? 'noopener noreferrer' : undefined"`);
      // A hardcoded target would bring the stray tab back on every visit.
      expect(src).not.toMatch(/href="\/status\?html"[\s\S]{0,200}\btarget="_blank"/);
    });
  }

  it("the header announces the new tab to screen readers", () => {
    // An accessibility checker that opens unannounced tabs is exactly the one
    // finding a reviewer would lead with.
    const src = readFileSync(resolve(__dirname, "../layouts/default.vue"), "utf8");
    expect(src).toMatch(/v-if="auditInProgress" class="sr-only"[\s\S]{0,80}opens in a new tab/);
  });
});
