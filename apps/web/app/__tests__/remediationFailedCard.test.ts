/**
 * The failed-remediation card: source-first, accurate about why.
 *
 * User direction (2026-08-15): when auto-remediation fails, remind the
 * reader that remediating a PDF is a LAST RESORT — the easiest path to an
 * accessible document is fixing the source file (Word, etc.), re-exporting
 * to PDF, and re-checking. The card therefore leads with the source route
 * and keeps the Acrobat route as the no-source fallback, and the failed
 * state also renders the SourceDocumentNotice card (previously shown only
 * on success), whose per-app steps are the already-verified copy.
 *
 * Accuracy: "Scanned / image-based content" was listed as a common cause
 * of FAILURE, but a scanned PDF scores 0 before AND after tagging — a 0→0
 * delta passes the net-gains-only regression guard, so scanned files
 * normally COMPLETE (with a low score) rather than fail. The reasons list
 * now names the real failure paths: regression on already-tagged files,
 * layouts the tagger would mis-read, files the prepare/validate steps
 * can't safely process, and the processing time limit.
 *
 * Source-scanned like the page's other tests (a Nuxt page that can't be
 * mounted in isolation).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(__dirname, "..", "pages", "remediate", "[jobId].vue"), "utf-8");

// The failed section: from its v-if to the Expired section that follows it.
const failedStart = src.indexOf("Auto-remediation didn't help this time");
const failedEnd = src.indexOf("This job has expired");
const failed = src.slice(failedStart, failedEnd);

describe("remediate/[jobId].vue — failed card is source-first", () => {
  it("slice anchors hold", () => {
    expect(failedStart).toBeGreaterThan(-1);
    expect(failedEnd).toBeGreaterThan(failedStart);
  });

  it("says PDF remediation is a last resort and leads with the source-document route", () => {
    expect(failed).toMatch(/last resort/i);
    expect(failed).toMatch(/source document/i);
    // Source route renders BEFORE the Acrobat route.
    const sourceIdx = failed.search(/source document/i);
    const acrobatIdx = failed.indexOf("Automatically tag PDF");
    expect(sourceIdx).toBeGreaterThan(-1);
    expect(acrobatIdx).toBeGreaterThan(sourceIdx);
  });

  it("describes the source route accurately: fix, re-export to PDF, re-check here", () => {
    expect(failed).toMatch(/re-export/i);
    expect(failed).toMatch(/audit|re-?check/i);
  });

  it("keeps the Acrobat route as the no-source fallback, current path first", () => {
    expect(failed).toMatch(/No source file\?/);
    expect(failed).toContain("All tools → Prepare for accessibility → Automatically tag PDF");
    expect(failed).toContain("classic UI: Tools → Accessibility → Autotag Document");
  });

  it("no longer claims scanned content is a common failure cause (0→0 passes the guard)", () => {
    expect(failed).not.toContain("Scanned / image-based content");
  });

  it("names the real failure modes", () => {
    expect(failed).toMatch(/already has structure tags/i);
    expect(failed).toMatch(/worse/i); // the regression guard, in plain words
    expect(failed).toMatch(/time limit/i);
  });

  it("carries the fix-step version note (the card shows Acrobat menu paths)", () => {
    expect(failed).toContain("{{ FIX_STEPS_VERSION_NOTE }}");
  });

  it("renders the SourceDocumentNotice on the failed state, not only on success", () => {
    // A failed-gated section containing the notice component.
    const failedNotice = src.match(/status\.status === 'failed'[\s\S]{0,400}<SourceDocumentNotice/);
    expect(failedNotice).not.toBeNull();
  });
});

describe("the remediation page opens each report with the two-standards strip (v1.140.2)", () => {
  it("renders TwoStandardsStrip directly above BOTH ScoreCards", () => {
    const src = readFileSync(resolve(__dirname, "../pages/remediate/[jobId].vue"), "utf8");
    const after = src.indexOf('<ScoreCard :result="receipt.outputAudit"');
    const before = src.indexOf('<ScoreCard :result="receipt.inputAudit"');
    expect(after).toBeGreaterThan(-1);
    expect(before).toBeGreaterThan(-1);
    // A strip precedes each card within the preceding few hundred chars.
    expect(src.lastIndexOf("<TwoStandardsStrip", after)).toBeGreaterThan(after - 900);
    expect(src.lastIndexOf("<TwoStandardsStrip", before)).toBeGreaterThan(before - 900);
  });
});
