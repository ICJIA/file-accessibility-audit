/**
 * The remediation page speaks.
 *
 * It used to be silent to a screen reader from start to finish: the steps
 * changed, the progress bar filled, the results replaced the progress view
 * and a polling failure appeared — none of it announced, none of it moving
 * focus. The wording is unit-tested through utils/remediationAnnouncements;
 * the page itself is source-scanned (a Nuxt page that cannot be mounted in
 * isolation), like its other tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { outcomeAnnouncement, stepAnnouncement } from "../utils/remediationAnnouncements";

const src = readFileSync(resolve(__dirname, "..", "pages", "remediate", "[jobId].vue"), "utf-8");
const template = src.slice(src.indexOf("<template>"));
const script = src.slice(0, src.indexOf("</script>"));

describe("remediation announcements (wording)", () => {
  const labels = [
    "Preparing file",
    "Adding structure tags",
    "Validating result",
    "Comparing scores",
  ];

  it("names the step and its place in the run", () => {
    expect(stepAnnouncement(0, labels)).toBe("Step 1 of 4: Preparing file.");
    expect(stepAnnouncement(3, labels)).toBe("Step 4 of 4: Comparing scores.");
  });

  it("says nothing for a step that does not exist", () => {
    expect(stepAnnouncement(-1, labels)).toBe("");
    expect(stepAnnouncement(9, labels)).toBe("");
  });

  it("states the outcome, with both scores when it has them", () => {
    expect(outcomeAnnouncement("complete", { before: 40.4, after: 90 })).toBe(
      "Auto-remediation complete. Score before: 40. Score after: 90. Results follow.",
    );
    expect(outcomeAnnouncement("complete", { before: null, after: 90 })).toBe(
      "Auto-remediation complete. Results follow.",
    );
    expect(outcomeAnnouncement("complete", { before: 0, after: 0 })).toMatch(/Score before: 0\./);
  });

  it("does not call a failed or expired job complete", () => {
    expect(outcomeAnnouncement("failed")).not.toMatch(/complete/i);
    expect(outcomeAnnouncement("failed")).toMatch(/next steps/);
    expect(outcomeAnnouncement("expired")).toMatch(/no longer available/);
  });
});

describe("remediate/[jobId].vue — live region, progress bar, focus, alert", () => {
  it("has exactly one polite status region, always rendered", () => {
    const regions = template.match(/<p[^>]*role="status"[^>]*>/g) ?? [];
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatch(/aria-live="polite"/);
    // Present before its text changes: never behind a v-if.
    expect(regions[0]).not.toMatch(/v-if|v-show/);
    expect(template).toMatch(/\{\{ liveMessage \}\}/);
  });

  it("announces a step when the STEP changes, not on every poll", () => {
    // Driven by the displayed step index, which only moves between steps —
    // never by `status`, which is replaced on every poll.
    expect(script).toMatch(/watch\(displayedStageIdx,/);
    expect(script).not.toMatch(/watch\(status,[^)]*liveMessage/s);
  });

  it("gives the progress bar a role, a name and its values", () => {
    const bar = template.match(/<div[^>]*role="progressbar"[^>]*>/s)?.[0] ?? "";
    expect(bar).toMatch(/aria-label="Remediation progress"/);
    expect(bar).toMatch(/aria-valuemin="0"/);
    expect(bar).toMatch(/aria-valuemax="100"/);
    expect(bar).toMatch(/:aria-valuenow="displayedProgressPct"/);
    expect(bar).toMatch(/:aria-valuetext="progressValueText"/);
  });

  it("says each step's state in words; the tick and dot are decoration", () => {
    expect(template).toMatch(/\(done\)/);
    expect(template).toMatch(/\(in progress\)/);
    expect(template).toMatch(/\(not started\)/);
  });

  it("every outcome heading can take focus, and focus is moved to it", () => {
    const headings = template.match(/<h2[^>]*data-outcome-heading[^>]*>/gs) ?? [];
    // complete, failed, expired (already downloaded), expired (retention)
    expect(headings).toHaveLength(4);
    for (const h of headings) expect(h).toMatch(/tabindex="-1"/);
    expect(script).toMatch(/querySelector<HTMLElement>\("\[data-outcome-heading\]"\)\?\.focus\(\)/);
    // Only for someone who watched the job run — not on opening an old link.
    expect(script).toMatch(/if \(!kind \|\| !sawRunning\) return;/);
  });

  it("the polling error is an alert, and lost contact offers a reload", () => {
    const box = template.match(/<section[^>]*data-testid="remediation-poll-error"[^>]*>/s)?.[0];
    expect(box).toBeTruthy();
    expect(box).toMatch(/role="alert"/);
    expect(template).toMatch(/v-if="lostContact"[\s\S]{0,400}Reload this page/);
    expect(script).toMatch(/lostContact\s*\}\s*=\s*useRemediationJob\(/);
  });

  it("the score table says what it holds (one score row, not three heuristics)", () => {
    expect(template).not.toMatch(/>Heuristic<|by heuristic|Three-heuristic/i);
    expect(template).toMatch(/Score before and after remediation/);
  });

  it("carries no no-op page middleware declaration", () => {
    expect(src).not.toMatch(/definePageMeta\(\{\s*middleware: \[\]\s*\}\)/);
  });
});
