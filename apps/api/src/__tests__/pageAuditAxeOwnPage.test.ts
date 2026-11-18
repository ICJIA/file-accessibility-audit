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

describe("denyPopups exemption is by identity (unit)", () => {
  function setup() {
    let listener: ((t: any) => void) | undefined;
    const mkPage = (url = "about:blank"): any => ({ url: () => url, close: vi.fn(async () => {}) });
    const browser: any = {
      on: (_e: string, fn: (t: any) => void) => (listener = fn),
      newPage: vi.fn(async () => {
        const p = mkPage();
        listener!({ type: () => "page", page: async () => p });
        return p;
      }),
    };
    const audited: any = { close: vi.fn() };
    const policy = denyPopups(browser, audited, async () => {});
    const sitePopup = (url = "about:blank") => {
      const p = mkPage(url);
      listener!({ type: () => "page", page: async () => p });
      return p;
    };
    return { browser, policy, sitePopup };
  }
  const settle = () => new Promise((r) => setTimeout(r, 5));

  it("the page our own newPage call created stays open inside the window", async () => {
    const { browser, policy } = setup();
    const done = policy.allowOwnPage();
    const ours = await browser.newPage();
    await settle();
    expect(ours.close).not.toHaveBeenCalled();
    done();
  });

  it("a page the audited site opens is closed inside the window — even blank, even with no opener", async () => {
    const { browser, policy, sitePopup } = setup();
    const done = policy.allowOwnPage();
    const hostile = sitePopup(); // opened first, looks exactly like axe's page
    const ours = await browser.newPage();
    await settle();
    expect(hostile.close).toHaveBeenCalled();
    expect(ours.close).not.toHaveBeenCalled();
    done();
  });

  it("outside the window every new page is closed, and newPage is restored", async () => {
    const { browser, policy } = setup();
    const original = browser.newPage;
    policy.allowOwnPage()();
    expect(browser.newPage).toBe(original);
    const p = await browser.newPage();
    await settle();
    expect(p.close).toHaveBeenCalled();
  });
});
