import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// /status and /healthz are uptime-monitor targets, and several monitors —
// UptimeRobot among them — send HEAD rather than GET by default.
//
// As `status.get.ts` / `healthz.get.ts`, Nitro matched only GET and returned
// 404 to HEAD. A monitor configured that way would have reported the service
// down while it was perfectly healthy: the worst kind of monitoring failure,
// because it trains you to ignore the alert.
//
// The fix is the FILENAME — an unsuffixed Nitro route file matches any method
// — plus an explicit guard narrowing it back to GET and HEAD. Both halves
// matter, so both are asserted here. Source inspection rather than mounting,
// following the precedent in dataRetentionVersion.test.ts and
// announcementsArchive.test.ts.

const ROUTES_DIR = resolve(__dirname, "..", "..", "server", "routes");
const MONITOR_ROUTES = ["status", "healthz"];

function read(file: string): string {
  return readFileSync(resolve(ROUTES_DIR, file), "utf-8");
}

describe("uptime-monitor routes answer HEAD as well as GET", () => {
  for (const name of MONITOR_ROUTES) {
    describe(`/${name}`, () => {
      it("has no method suffix in its filename", () => {
        // A `.get.ts` suffix is exactly what caused the HEAD 404.
        expect(existsSync(resolve(ROUTES_DIR, `${name}.ts`))).toBe(true);
        expect(existsSync(resolve(ROUTES_DIR, `${name}.get.ts`))).toBe(false);
      });

      it("guards to GET and HEAD, rejecting anything else with 405", () => {
        const src = read(`${name}.ts`);
        expect(src).toContain('event.method !== "GET"');
        expect(src).toContain('event.method !== "HEAD"');
        expect(src).toContain("405");
        // An Allow header is what makes a 405 actionable rather than opaque.
        expect(src).toContain('"Allow", "GET, HEAD"');
      });

      it("still sets the noindex header before doing any work", () => {
        // robots.txt is advisory and currently 404s in production, so this
        // header is the only thing actually keeping these URLs out of search
        // results.
        const src = read(`${name}.ts`);
        expect(src).toContain('"X-Robots-Tag", "noindex, nofollow"');
      });

      it("runs the real probe on HEAD rather than short-circuiting", () => {
        // A HEAD that skipped the probe would return a status code that did
        // not reflect reality — worse than the 404 it replaced. The guard
        // must fall through to the same handler body, so there is exactly one
        // setResponseStatus driven by the probe result.
        const src = read(`${name}.ts`);
        expect(src).toContain("result.httpStatus");
        expect(src).not.toMatch(/method === "HEAD"[\s\S]{0,200}return\s*(null|undefined|"")/);
      });
    });
  }

  it("links /status from the navbar with a PLAIN <a>, never a NuxtLink", () => {
    // /status is a Nitro SERVER route with no Vue page behind it. A NuxtLink
    // navigates client-side, finds no matching route, and renders the SPA
    // "Page not found: /status" without ever contacting the server — the
    // exact bug that shipped in v1.39.0. Typing the URL directly still
    // worked, which is what disguised a link bug as a deploy failure.
    const layout = readFileSync(resolve(__dirname, "..", "layouts", "default.vue"), "utf-8");
    expect(layout).toMatch(/<a\s[^>]*href="\/status(\?html)?"/);
    expect(layout).not.toMatch(/<NuxtLink[^>]*to="\/status/);
    expect(layout).not.toMatch(/:to="'\/status/);
  });

  it("in-site links request the HTML view explicitly", () => {
    // Browsers already get HTML via Accept negotiation, so ?html is belt and
    // braces — but it makes the intent readable in the markup and survives any
    // future change to how negotiation works. It also mirrors ?json, which is
    // the monitor URL, so both audiences have an explicit address.
    const layout = readFileSync(resolve(__dirname, "..", "layouts", "default.vue"), "utf-8");
    const config = readFileSync(
      resolve(__dirname, "..", "..", "..", "..", "audit.config.ts"),
      "utf-8",
    );
    expect(layout).toContain('href="/status?html"');
    // Announcement entries linking to /status must do the same.
    expect(config).not.toMatch(/linkTo: "\/status"/);
  });

  it("leaves other server routes untouched", () => {
    // publist is not a monitor target; its .get.ts suffix is correct and this
    // change should not have swept it up.
    const files = readdirSync(ROUTES_DIR);
    expect(files).toContain("publist.get.ts");
  });
});
