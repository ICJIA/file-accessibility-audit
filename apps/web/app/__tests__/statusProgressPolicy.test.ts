import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Policy v1.13 (tool v1.89.0): the public status page publishes two new
 * aggregate families — distinct-document counts and a 30-day re-audit
 * summary. Nothing new is collected or stored, so § 6–§ 8 are untouched;
 * the change is documented as a § 14 entry, and this suite pins that entry
 * plus the copy rules the whole policy follows. The header constant is held
 * to the newest entry by dataRetentionVersion.test.ts, not here.
 */

function read(file: string): string {
  return readFileSync(resolve(__dirname, "..", file), "utf-8");
}

/** Strip tags so assertions read the rendered sentence, not the markup. */
function visible(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function between(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  expect(start, `marker "${from}" present`).toBeGreaterThan(-1);
  const end = text.indexOf(to, start);
  expect(end, `marker "${to}" after "${from}"`).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe("data-retention policy v1.13: aggregate status-page figures", () => {
  const s14 = read("components/dataRetention/Section14ChangeLog.vue");

  it("§ 14 has the v1.13 entry: aggregates only, nothing new collected", () => {
    expect(s14).toMatch(/<strong>v1\.13 · 2026-08-25<\/strong>/);
    const entry = visible(between(s14, "v1.13 · 2026-08-25", "</li>"));
    expect(entry).toMatch(/Nothing new is collected or stored/);
    expect(entry).toMatch(/no retention period changes/i);
    expect(entry).toMatch(/distinct documents/);
    expect(entry).toMatch(/re-audit summary/);
    // The two disclosure promises: what is grouped, and what is withheld.
    expect(entry).toMatch(/grouping records by file name inside the database/);
    expect(entry).toMatch(/no file name, fingerprint, or individual score is published/i);
    expect(entry).toMatch(/fewer than five documents/);
  });

  it("the new copy never overclaims — name the fields, never deny the data", () => {
    const entry = visible(between(s14, "v1.13 · 2026-08-25", "</li>"));
    expect(entry).not.toMatch(/no personal (data|information|details)/i);
    expect(entry).not.toMatch(/(contains|holds) no PII/i);
    expect(entry).not.toMatch(/anonymous|anonymi[sz]ed/i);
    expect(entry).not.toMatch(/\bstrong\b/i);
  });

  it("the status card's own caveat follows the same rules", () => {
    const html = read("../server/utils/statusHtml.ts");
    const caveat = between(html, "renderDocumentProgress", "renderPrivilegedAudits");
    expect(caveat).toContain("file name, score, and time of audit");
    expect(caveat).not.toMatch(/no personal (data|information|details)/i);
    expect(caveat).not.toMatch(/anonymous|anonymi[sz]ed/i);
  });
});
