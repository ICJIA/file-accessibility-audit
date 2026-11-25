/**
 * The Word / PowerPoint / Excel analysis process has a MEMORY limit as well
 * as a time limit (red-team review 2026-11-25).
 *
 * A 45 KB .docx whose document part inflates to just under the 30 MB part cap
 * was measured at 1.0 to 1.6 GB in the worker. The worker was already killed
 * at 20 s, so one such file was contained — but nothing bounded how much
 * memory it took on the way, and two at once could exhaust the server first.
 * Real child process, real parser, real hostile file.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ANALYSIS, DOCX } from "#config";
import { runOoxmlInWorker } from "@file-audit/analyzer/ooxmlRunner";
import { buildDocx, wordDocument, paragraph } from "./helpers/minimalDocx.js";

/** One text node of `&#65;` repeated until the part is just under the cap.
 *  (The test helper stores parts uncompressed; deflated, this is ~45 KB.) */
async function entityBombDocx(): Promise<Buffer> {
  const room = DOCX.MAX_UNCOMPRESSED_BYTES - 4_096;
  const body = `<w:p><w:r><w:t>${"&#65;".repeat(Math.floor(room / 5))}</w:t></w:r></w:p>`;
  return buildDocx({ documentXml: wordDocument(body) });
}

describe("the Office analysis process is bounded in memory", () => {
  it("an ordinary document is analysed as before", async () => {
    const docx = await buildDocx({ documentXml: wordDocument(paragraph("Hello.")) });
    const out = await runOoxmlInWorker("docx", docx, DOCX.ANALYSIS_TIMEOUT_MS);
    expect(out.scoring.grade).toBeTruthy();
  }, 30_000);

  it("a process over its memory limit is stopped, and reported like a timeout, not a crash", async () => {
    const bomb = await entityBombDocx();
    // A low ceiling makes this deterministic on any machine: the parse of a
    // 30 MB part cannot fit in 150 MB.
    const outcome = await runOoxmlInWorker("docx", bomb, DOCX.ANALYSIS_TIMEOUT_MS, 150).then(
      () => "finished" as const,
      (err: { code?: string; killed?: boolean; message?: string }) => err,
    );
    expect(outcome).toMatchObject({ killed: true });
    expect(["OOXML_RESOURCE_LIMIT", "ETIMEDOUT"]).toContain((outcome as { code: string }).code);
    expect((outcome as { code: string }).code).toBe("OOXML_RESOURCE_LIMIT");
  }, 40_000);

  it("the limits are configured, passed to the child, and fit beside the API", () => {
    expect(ANALYSIS.OOXML_WORKER_MAX_OLD_SPACE_MB).toBeLessThan(ANALYSIS.OOXML_WORKER_MAX_RSS_MB);
    expect(ANALYSIS.MAX_CONCURRENT_ANALYSES * ANALYSIS.OOXML_WORKER_MAX_RSS_MB).toBeLessThanOrEqual(
      2_048,
    );
    const runner = readFileSync(
      resolve(__dirname, "../../../../packages/analyzer/src/ooxmlRunner.ts"),
      "utf8",
    );
    expect(runner).toContain("`--max-old-space-size=${ANALYSIS.OOXML_WORKER_MAX_OLD_SPACE_MB}`");
    expect(runner).toContain("ANALYSIS.OOXML_WORKER_MAX_RSS_MB");
    const worker = readFileSync(
      resolve(__dirname, "../../../../packages/analyzer/src/ooxmlWorker.ts"),
      "utf8",
    );
    expect(worker).toContain("if (msg.limits) startWatchdog(msg.limits);");
  });
});
