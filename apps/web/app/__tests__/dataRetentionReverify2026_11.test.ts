/**
 * Data-retention policy v1.18 — the 2026-11-18 re-check against the code.
 *
 * The re-check found three places where the policy had fallen behind the
 * software: § 8a said reports record headings as levels only (they quote
 * heading text, and slide titles, sheet and table names, and samples of
 * heading-styled lines); § 8a's list of files the server writes predated the
 * error log, the activity file and the report-seal key; and § 3 never
 * mentioned the remediation queue (v1.168.0), during which an upload waits on
 * disk. These tests pin the corrections, and the last one makes the next
 * new file-writing module fail here until § 8a accounts for it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { REMEDIATION } from "../../../../audit.config";

const ROOT = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf-8");
const S8 = read("apps/web/app/components/dataRetention/Section08Stored.vue");
const S8A = read("apps/web/app/components/dataRetention/Section08aStorageVerification.vue");
const S3 = read("apps/web/app/components/dataRetention/Section03RemediationFlow.vue");
const flat = (s: string) => s.replace(/\s+/g, " ");

describe("§ 8 / § 8a name every kind of short string a saved report can quote", () => {
  it("§ 8a no longer says headings are recorded as levels only", () => {
    expect(flat(S8A)).not.toMatch(/Headings are recorded as levels \(H1/);
  });

  it.each([
    ["§ 8", S8],
    ["§ 8a", S8A],
  ])(
    "%s lists heading text, slide titles, worksheet and table names, heading-styled lines",
    (_, src) => {
      const t = flat(src);
      expect(t).toMatch(/heading text/);
      expect(t).toMatch(/slide titles/);
      expect(t).toMatch(/worksheet and table names/);
      expect(t).toMatch(/styled to look like headings/);
    },
  );
});

describe("§ 3 describes the remediation queue", () => {
  it("says a queued upload waits on disk at most 10 minutes and is deleted if it never starts", () => {
    const t = flat(S3);
    expect(t).toMatch(/queue/i);
    expect(t).toMatch(/10 minutes/);
    expect(REMEDIATION.MAX_QUEUE_WAIT_MS).toBe(10 * 60_000);
  });

  it("the queue wait, stuck-worker window and sweep interval stay inside the 30-minute limit § 3 states", () => {
    const stuckWorkerWindow = 10 * 60_000;
    expect(
      REMEDIATION.MAX_QUEUE_WAIT_MS + stuckWorkerWindow + REMEDIATION.CLEANUP_INTERVAL_MS,
    ).toBeLessThan(REMEDIATION.OUTPUT_TTL_MS);
    expect(REMEDIATION.OUTPUT_TTL_MS).toBe(30 * 60_000);
  });
});

describe("§ 8a accounts for every module that writes a file", () => {
  // Each module that writes to disk, and the words § 8a uses for it. A new
  // writer fails this test until § 8a (and § 7, if it keeps data) says so.
  const ACCOUNTED: Record<string, RegExp> = {
    "apps/api/src/db/sqlite.ts": /database directory/,
    "apps/api/src/routes/remediate.ts": /remediation pipeline's working files/,
    "apps/api/src/jobs/remediate.ts": /remediation pipeline's working files/,
    "apps/api/src/services/veraPdfBuffer.ts": /veraPdfBuffer\.ts/,
    "packages/analyzer/src/qpdfService.ts": /qpdfService\.ts/,
    "apps/api/src/services/activityExport.ts": /daily activity file/,
    "apps/api/src/services/errorLog.ts": /application error log/,
    "apps/api/src/services/reportSeal.ts": /seals shared reports/,
  };
  const WRITE = /\b(writeFile(Sync)?|appendFile(Sync)?|createWriteStream|rename(Sync)?)\s*\(/;

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name === "__tests__" || name === "node_modules") continue;
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
    }
    return out;
  }

  const writers = [
    ...walk(resolve(ROOT, "apps/api/src")),
    ...walk(resolve(ROOT, "packages/analyzer/src")),
  ]
    .filter((p) => WRITE.test(readFileSync(p, "utf-8")))
    .map((p) => relative(ROOT, p));

  it("finds the writers it expects (the scan works)", () => {
    expect(writers).toContain("packages/analyzer/src/qpdfService.ts");
    expect(writers.length).toBeGreaterThanOrEqual(6);
  });

  it("every file-writing module is named in § 8a", () => {
    const t = flat(S8A);
    for (const w of writers) {
      const words = ACCOUNTED[w];
      expect(words, `${w} writes files but § 8a does not account for it`).toBeDefined();
      expect(t).toMatch(words!);
    }
  });
});
