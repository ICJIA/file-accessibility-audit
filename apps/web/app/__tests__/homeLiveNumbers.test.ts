import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { liveCheckupCounts } from "~/utils/liveNumbers";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("home page live numbers", () => {
  it("reads the two counts out of a /status body", () => {
    expect(liveCheckupCounts({ documents_audited: { total: 12948, last_30d: 255 } })).toEqual({
      total: 12948,
      last30d: 255,
    });
  });

  it("returns null — keep the recorded figure — for anything else", () => {
    for (const body of [
      null,
      "<html>",
      {},
      { documents_audited: {} },
      { documents_audited: { total: "12948", last_30d: 255 } },
      { documents_audited: { total: -1, last_30d: 0 } },
      { documents_audited: { total: 0, last_30d: 0 } },
      { documents_audited: { total: 1.5, last_30d: 1 } },
    ]) {
      expect(liveCheckupCounts(body), JSON.stringify(body)).toBeNull();
    }
  });

  it("the tiles sit in the home page's What This Tool Does grid, in its own type", () => {
    const index = read("pages/index.vue");
    const section = index.slice(index.indexOf("What This Tool Does"));
    expect(section).toContain("<HomeLiveNumbers />");
    const tiles = read("components/HomeLiveNumbers.vue");
    // Same classes as the six tiles already there — same colour, same font.
    const numeral = "pk-display font-black text-6xl sm:text-7xl text-[var(--text-heading)] mb-5";
    expect(index).toContain(numeral);
    expect(tiles.split(numeral).length - 1).toBe(3);
  });

  it("fetches the live count only in the browser, and formats in one fixed locale", () => {
    const tiles = read("components/HomeLiveNumbers.vue");
    expect(tiles).toMatch(/onMounted\(async \(\) => \{[\s\S]*\$fetch\("\/status\?format=json"\)/);
    expect(tiles).toContain('toLocaleString("en-US")');
    // /status is a server route, not a Vue page: a plain <a>, never NuxtLink.
    expect(tiles).toMatch(/<a href="\/status"/);
  });
});
