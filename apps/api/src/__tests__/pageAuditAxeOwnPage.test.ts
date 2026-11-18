/**
 * Regression (2026-11-18): from v1.168.0 the popup guard closed the blank
 * page axe-core/puppeteer opens to finish every scan, so every FRESH page
 * audit failed with "Target closed". The wiring test replaced axe with a
 * fake, which is how it shipped. These tests use a REAL Chromium and the
 * REAL AxePuppeteer — no network: the page is set with setContent.
 */
import { describe, it, expect, vi } from "vitest";
import puppeteer from "puppeteer";
import { AxePuppeteer } from "@axe-core/puppeteer";
import { denyPopups } from "../services/pageAuditor.js";

let chromiumAvailable = true;
try {
  const b = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  await b.close();
} catch {
  chromiumAvailable = false;
}

async function withPage<T>(fn: (b: any, p: any) => Promise<T>): Promise<T> {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(
      "<html lang='en'><head><title>t</title></head><body><main><h1>Hi</h1><img src='data:,' ></main></body></html>",
    );
    return await fn(browser, page);
  } finally {
    await browser.close();
  }
}

describe.skipIf(!chromiumAvailable)(
  "axe's own page survives the popup guard (real Chromium)",
  () => {
    it("WITH the allowance, a real axe scan completes and finds the missing alt", async () => {
      await withPage(async (browser, page) => {
        const popups = denyPopups(browser, page, async () => {});
        const done = popups.allowOwnPage();
        try {
          const r = await new AxePuppeteer(page).analyze();
          expect(r.violations.map((v) => v.id)).toContain("image-alt");
        } finally {
          done();
        }
      });
    }, 60_000);

    it("WITHOUT it, the guard kills axe's page — proves the test can see the bug", async () => {
      await withPage(async (browser, page) => {
        denyPopups(browser, page, async () => {});
        await expect(new AxePuppeteer(page).analyze()).rejects.toThrow(); // "Target closed" or "Page/Frame is not ready", by timing;
      });
    }, 60_000);
  },
);

describe("denyPopups allowance (unit)", () => {
  function setup() {
    let listener: ((t: any) => void) | undefined;
    const browser: any = { on: (_e: string, fn: (t: any) => void) => (listener = fn) };
    const audited: any = { close: vi.fn() };
    const policy = denyPopups(browser, audited, async () => {});
    const open = (opener: boolean) => {
      const p: any = { close: vi.fn(async () => {}) };
      listener!({
        type: () => "page",
        opener: () => (opener ? {} : undefined),
        page: async () => p,
      });
      return p;
    };
    return { policy, open };
  }
  const tick = () => new Promise((r) => setImmediate(r));

  it("leaves exactly one opener-less page open inside the window", async () => {
    const { policy, open } = setup();
    const done = policy.allowOwnPage();
    const ours = open(false);
    const second = open(false);
    await tick();
    expect(ours.close).not.toHaveBeenCalled();
    expect(second.close).toHaveBeenCalled();
    done();
  });

  it("a page the audited site opened (has an opener) is closed even inside the window", async () => {
    const { policy, open } = setup();
    const done = policy.allowOwnPage();
    const popup = open(true);
    await tick();
    expect(popup.close).toHaveBeenCalled();
    done();
  });

  it("outside the window every new page is closed", async () => {
    const { policy, open } = setup();
    policy.allowOwnPage()();
    const p = open(false);
    await tick();
    expect(p.close).toHaveBeenCalled();
  });
});
