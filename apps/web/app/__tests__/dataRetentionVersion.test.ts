import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// A1: TOOL_VERSION used to be a hardcoded literal ('1.18.0') that silently
// drifted from the real app version every release. It now reads live from
// the same runtimeConfig.public.appVersion the footer already uses
// (apps/web/app/layouts/default.vue, sourced from apps/web/package.json).
//
// data-retention.vue explicitly imports `useRouter` from the bare
// 'vue-router' package specifier (for the "Back" button). Nuxt aliases that
// specifier at build/dev time, but this suite's plain vitest + @vitejs/
// plugin-vue config (apps/web/vitest.config.ts) does not, so mounting the
// page directly throws "Failed to resolve import vue-router" (verified
// empirically while writing this test). Every other test in this suite that
// covers a full page rather than an isolated component — accessibility.
// test.ts, responsive.test.ts, color-mode.test.ts, scoring-display.test.ts —
// reads the raw source text instead of mounting, for pages of this size/
// complexity. This test follows that established precedent rather than
// mounting.
function readSource(file: string): string {
  return readFileSync(resolve(__dirname, "..", file), "utf-8");
}

describe("data-retention page: real app version (not hardcoded 1.18.0)", () => {
  const source = readSource("pages/data-retention.vue");

  it("no longer hardcodes the stale 1.18.0 literal", () => {
    expect(source).not.toMatch(/TOOL_VERSION\s*=\s*['"]1\.18\.0['"]/);
  });

  it("derives TOOL_VERSION from runtimeConfig.public.appVersion, the same key the footer uses", () => {
    expect(source).toMatch(/const runtimeConfig\s*=\s*useRuntimeConfig\(\)/);
    expect(source).toMatch(/TOOL_VERSION\s*=\s*runtimeConfig\.public\.appVersion/);
  });
});

describe("data-retention page: POLICY_VERSION matches its own § 14 change log", () => {
  // v1.68.0 shipped with the header still reading "Policy · v1.4" while § 14's
  // newest entry said v1.6 — the constant had been forgotten on two releases
  // in a row. The header's claim and the change log's newest entry must agree.
  it("the header constant equals the newest change-log entry's version", () => {
    const page = readFileSync(resolve(__dirname, "../pages/data-retention.vue"), "utf8");
    const changeLog = readFileSync(
      resolve(__dirname, "../components/dataRetention/Section14ChangeLog.vue"),
      "utf8",
    );
    const header = page.match(/const POLICY_VERSION = "([\d.]+)"/)?.[1];
    const newest = changeLog.match(/<strong>v([\d.]+) · /)?.[1];
    expect(header).toBeTruthy();
    expect(newest).toBeTruthy();
    expect(header).toBe(newest);
  });

  it("the header's Last-updated date equals the newest change-log entry's date (v1.96.0)", () => {
    const page = readFileSync(resolve(__dirname, "../pages/data-retention.vue"), "utf8");
    const changeLog = readFileSync(
      resolve(__dirname, "../components/dataRetention/Section14ChangeLog.vue"),
      "utf8",
    );
    const updated = page.match(/const POLICY_UPDATED = "(\d{4}-\d{2}-\d{2})"/)?.[1];
    const newestDate = changeLog.match(/<strong>v[\d.]+ · (\d{4}-\d{2}-\d{2})<\/strong>/)?.[1];
    expect(updated).toBeTruthy();
    expect(newestDate).toBeTruthy();
    expect(updated).toBe(newestDate);
    // And the header actually renders it — a constant nothing displays is
    // not a date at the top of the page.
    expect(page).toMatch(/Last updated[\s\S]{0,120}POLICY_UPDATED/);
  });
});
