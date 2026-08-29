/**
 * scripts/resave-invariance.ts — byte layout must never change a grade.
 *
 *   pnpm resave-invariance
 *
 * WHY (2026-08-29): two PDFs with identical CONTENT can have wildly
 * different BYTES — object order, cross-reference style, stream packing all
 * vary by exporter. A checker whose grade depends on any of that is reading
 * the wrapping paper, not the document. This gate proves ours doesn't:
 *
 *   1. RE-SAVE — every synthetic trap is rewritten by qpdf (new object
 *      order, new xref), then audited beside the original. Score, grade,
 *      and every per-category verdict must match, digit for digit.
 *   2. DETERMINISM — three sentinel traps are audited repeatedly, twice in
 *      sequence and three times concurrently. Same file, same answer,
 *      every time — including under contention (the v1.109 timeout bug was
 *      exactly a contention artifact, and nothing tested it).
 *
 * Traps whose designed DEFECT is itself byte-level damage that a rewrite
 * repairs (dangling references qpdf nulls out, unreachable objects it
 * drops) are excluded with the reason stated — for those files, "the
 * rewrite changed the answer" means qpdf fixed the document, not that we
 * misread it. Exclusions are a visible, argued list, not an escape hatch.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { analyzeDocument } from "../apps/api/src/services/analyzer.js";
import type { AnalysisResult } from "../apps/api/src/services/pdfAnalyzer.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTROLS = path.join(ROOT, "controls");
const QPDF = process.env.QPDF_PATH || "qpdf";

/** file -> why a qpdf rewrite legitimately changes the analysis. */
const EXCLUDED: Record<string, string> = {
  "synthetic-61-canva-dangling-pg.pdf":
    "the designed defect IS a dangling reference — qpdf nulls it, repairing the document",
  "synthetic-79-indesign-dangling-bookmark.pdf":
    "the designed defect IS a dangling bookmark destination — qpdf nulls it, repairing the document",
};

const DETERMINISM_SENTINELS = [
  "synthetic-02-scanned-lie.pdf",
  "synthetic-49-three-failures-one-file.pdf",
  "synthetic-100-the-hundredth.pdf",
];

function summary(r: AnalysisResult): string {
  const cats = [...r.categories]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => `${c.id}=${c.score === null ? "null" : c.score}|${c.severity ?? "none"}`)
    .join(" ");
  return `${r.overallScore}/${r.grade} ${cats}`;
}

async function main() {
  const traps = fs
    .readdirSync(CONTROLS)
    .filter((f) => f.startsWith("synthetic-") && f.endsWith(".pdf"))
    .sort();
  if (traps.length === 0) {
    console.error("no synthetic traps in controls/ — run pnpm synthetic-controls first");
    process.exit(1);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "resave-"));
  const failures: string[] = [];
  let held = 0;
  let excluded = 0;

  for (const f of traps) {
    if (EXCLUDED[f]) {
      excluded++;
      continue;
    }
    const src = path.join(CONTROLS, f);
    const out = path.join(tmp, f);
    try {
      // exit 3 = "succeeded with warnings" — expected on adversarial files.
      execFileSync(QPDF, ["--linearize", src, out], { stdio: "pipe" });
    } catch (e: any) {
      if (e.status === 3 && fs.existsSync(out)) {
        /* warnings are fine */
      } else {
        failures.push(`  ${f}: qpdf refused the rewrite (exit ${e.status})`);
        continue;
      }
    }
    const a = await analyzeDocument(fs.readFileSync(src), f);
    const b = await analyzeDocument(fs.readFileSync(out), f);
    const sa = summary(a);
    const sb = summary(b);
    if (sa === sb) {
      held++;
      process.stdout.write(".");
    } else {
      failures.push(`  ${f}:\n    original: ${sa}\n    re-saved: ${sb}`);
      process.stdout.write("x");
    }
  }

  console.log(
    `\n\nre-save invariance: ${held} held, ${excluded} excluded (defect is the byte damage itself)`,
  );
  for (const [f, why] of Object.entries(EXCLUDED)) console.log(`  excluded ${f} — ${why}`);

  // ---- determinism under repetition and contention ----
  let deterministic = true;
  for (const f of DETERMINISM_SENTINELS) {
    const buf = fs.readFileSync(path.join(CONTROLS, f));
    const serial1 = summary(await analyzeDocument(buf, f));
    const serial2 = summary(await analyzeDocument(buf, f));
    const concurrent = await Promise.all([
      analyzeDocument(buf, f),
      analyzeDocument(buf, f),
      analyzeDocument(buf, f),
    ]);
    const all = [serial1, serial2, ...concurrent.map(summary)];
    if (new Set(all).size !== 1) {
      deterministic = false;
      failures.push(`  ${f}: five audits disagreed —\n    ${[...new Set(all)].join("\n    ")}`);
    }
  }
  console.log(
    `determinism: ${DETERMINISM_SENTINELS.length} sentinels x 5 audits (2 serial + 3 concurrent) — ${deterministic ? "identical every time" : "DISAGREED"}`,
  );

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    console.error(`\nINVARIANCE VIOLATED:\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log("BYTE LAYOUT NEVER CHANGED A GRADE");
}
main();
