/**
 * scripts/score-ledger.ts — the golden score ledger.
 *
 *   pnpm score-ledger            verify every control against the ledger
 *   pnpm score-ledger --bless    re-record the ledger from current behavior
 *
 * WHY (2026-08-29): the invariant suite proves a grade can never disagree
 * with its score; the trap battery proves 100 designed answers. Neither
 * pins the ACTUAL scores of the corpus — a scoring change that silently
 * moved twenty real documents from B to C would fail nothing. This ledger
 * does: every control document's exact score, grade, and per-category
 * verdict is committed in scripts/score-ledger.json, and any drift fails
 * the gate until a human re-blesses the ledger IN THE SAME COMMIT — so
 * every score movement is a visible, deliberate decision in review, never
 * an accident.
 *
 * Two tiers, one file:
 *   - the 100 synthetic traps regenerate deterministically, so their rows
 *     are enforceable ANYWHERE, including CI (which runs this right after
 *     `pnpm synthetic-controls` rebuilds them);
 *   - the real corpus lives only on dev machines (controls/ is gitignored),
 *     so its rows are verified wherever the files exist and skipped -- with
 *     an honest count -- where they don't.
 *
 * veraPDF never runs here (analyzeDocument only), so results are identical
 * on machines with and without it. Files the analyzer refuses are pinned
 * too, by error class -- "this file must keep failing the same way" is also
 * a promise.
 */
import fs from "node:fs";
import path from "node:path";
import { analyzeDocument } from "../apps/api/src/services/analyzer.js";
import { diffRow } from "./gateLogic.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTROLS = path.join(ROOT, "controls");
const LEDGER_PATH = path.join(import.meta.dirname, "score-ledger.json");
const BLESS = process.argv.includes("--bless");

interface LedgerRow {
  score?: number;
  grade?: string;
  categories?: Record<string, string>; // id -> "score|severity" ("null|severity" when unscored)
  error?: string; // first line of the analyzer's refusal, for files that must keep failing
}
interface Ledger {
  blessed: string;
  note: string;
  entries: Record<string, LedgerRow>;
}

/** Floor for how many control files must actually be compared with their
 *  ledger row. Overridable only so the floor itself can be sabotage-tested
 *  (SCORE_LEDGER_MIN_COMPARED=100000 must turn the gate red). */
const MIN_COMPARED = Number(process.env.SCORE_LEDGER_MIN_COMPARED ?? 200);

const SUPPORTED = new Set([".pdf", ".docx", ".pptx", ".xlsx", ".xls"]);

async function summarize(file: string): Promise<LedgerRow> {
  const buf = fs.readFileSync(path.join(CONTROLS, file));
  try {
    const r = await analyzeDocument(buf, file);
    const categories: Record<string, string> = {};
    for (const c of r.categories)
      categories[c.id] = `${c.score === null ? "null" : c.score}|${c.severity ?? "none"}`;
    return { score: r.overallScore, grade: r.grade, categories };
  } catch (e: any) {
    return {
      error: String(e?.message ?? e)
        .split("\n")[0]
        .slice(0, 160),
    };
  }
}

async function main() {
  // One level deep: controls/*.ext plus controls/<subdir>/*.ext. The
  // subdirectories hold provenance-tagged sets — controls/doit/ is the state
  // IT agency's own reference documents, whose grades are now argued ground
  // truth (2026-08-29) and must never move silently either.
  //
  // Dotfiles are never documents (2026-11-12). macOS writes an AppleDouble
  // stub (`._name.pdf`) beside every file on a non-HFS volume; they carry a
  // document extension and no document. Fourteen of them were blessed into
  // the ledger as "not a supported document" rows — pinned noise that only
  // one developer's disk could ever reproduce.
  const listDir = (dir: string, prefix = ""): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith("."))
      .flatMap((e) =>
        e.isDirectory() && prefix === ""
          ? listDir(path.join(dir, e.name), e.name + "/")
          : SUPPORTED.has(path.extname(e.name).toLowerCase())
            ? [prefix + e.name]
            : [],
      );
  const files = listDir(CONTROLS).sort();

  if (BLESS) {
    const entries: Record<string, LedgerRow> = {};
    for (const f of files) {
      entries[f] = await summarize(f);
      process.stdout.write(".");
    }
    const ledger: Ledger = {
      blessed: new Date().toISOString().slice(0, 10),
      note: "Golden scores for the control corpus. Regenerate ONLY deliberately, in the same commit as the scoring change that moves them: pnpm score-ledger --bless",
      entries,
    };
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n");
    console.log(`\nledger blessed: ${files.length} entries -> scripts/score-ledger.json`);
    return;
  }

  const ledger: Ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
  const problems: string[] = [];
  let verified = 0;
  let compared = 0;
  let skipped = 0;

  for (const f of files) {
    const want = ledger.entries[f];
    if (!want) {
      problems.push(
        `  ${f}: present in controls/ but not in the ledger — bless it (pnpm score-ledger --bless)`,
      );
      continue;
    }
    const got = await summarize(f);
    compared++;
    const d = diffRow(f, want, got);
    if (d.length) problems.push(...d);
    else verified++;
    process.stdout.write(d.length ? "x" : ".");
  }
  for (const f of Object.keys(ledger.entries)) {
    if (!files.includes(f)) skipped++;
  }

  console.log(
    `\n\nscore ledger (blessed ${ledger.blessed}): ${verified} verified, ${skipped} not present here (skipped)`,
  );
  // A FLOOR, not a formality (2026-11-12; the same rule legal-basis.ts has
  // carried since 2026-08-31). With controls/ empty or unbuilt the loop above
  // walks zero files, finds zero differences, and "NO SCORE MOVED" would be
  // printed about nothing. The trap batteries alone regenerate more rows
  // than this anywhere the gate legitimately runs. Checked BEFORE the drift
  // report, and independently of it, so neither failure can hide the other.
  if (compared < MIN_COMPARED) {
    console.error(
      `\nonly ${compared} control(s) could be compared with the ledger, below the floor of ${MIN_COMPARED} — controls/ is missing or unbuilt, so this gate proves nothing\n    (regenerate with: pnpm synthetic-controls && pnpm synthetic-office-controls)`,
    );
    process.exitCode = 1;
  }
  if (problems.length) {
    console.error(
      `\nSCORE DRIFT — ${problems.length} difference(s) from the blessed ledger:\n${problems.join("\n")}`,
    );
    console.error(
      "\nIf this movement is intended, re-bless in the SAME commit: pnpm score-ledger --bless",
    );
    process.exit(1);
  }
  if (process.exitCode) return;
  console.log("NO SCORE MOVED");
}
main();
