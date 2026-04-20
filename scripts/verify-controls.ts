/**
 * scripts/verify-controls.ts
 *
 * One-off verification harness. Runs the production PDF-analysis pipeline
 * against both fixtures in `controls/` and prints a structured report:
 *
 *   pnpm tsx scripts/verify-controls.ts
 *
 * Not wired into CI. Not a test. Deliberately standalone so it can be run
 * ad-hoc when someone wants to sanity-check the engine against the known
 * pre/post remediation pair.
 */

import fs from "node:fs";
import path from "node:path";
import { analyzePDF } from "../apps/api/src/services/pdfAnalyzer.js";
import type { AnalysisResult } from "../apps/api/src/services/pdfAnalyzer.js";
import type { CategoryResult } from "../apps/api/src/services/scorer.js";
import { SCORING_PROFILES } from "../audit.config.js";

const CONTROLS_DIR = path.resolve(import.meta.dirname, "..", "controls");
const BASELINE = "FY_22_ICJIA_Annual_Report_7c7ba4f4f0.pdf";
const REMEDIATED = "FY_22_ICJIA_Annual_Report_7c7ba4f4f0-remediated.pdf";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

interface InvariantResult {
  id: string;
  pass: boolean;
  reason: string;
}

function padRight(s: string, n: number): string {
  if (s.length >= n) return s;
  return s + " ".repeat(n - s.length);
}

function fmtScore(score: number | null): string {
  return score === null ? "N/A" : String(score);
}

function fmtDelta(a: number | null, b: number | null): string {
  if (a === null && b === null) return "—";
  if (a === null) return `N/A → ${b}`;
  if (b === null) return `${a} → N/A`;
  const d = b - a;
  const sign = d > 0 ? "+" : d < 0 ? "" : "±";
  return `${a} → ${b} (${sign}${d})`;
}

function categoryById(
  cats: CategoryResult[],
  id: string,
): CategoryResult | undefined {
  return cats.find((c) => c.id === id);
}

function printCategoryTable(title: string, cats: CategoryResult[]): void {
  console.log(`  ${BOLD}${title}${RESET}`);
  console.log(
    `  ${DIM}${padRight("id", 22)}${padRight("weight", 9)}${padRight(
      "score",
      7,
    )}${padRight("grade", 7)}severity${RESET}`,
  );
  for (const c of cats) {
    console.log(
      `  ${padRight(c.id, 22)}${padRight(
        (c.weight * 100).toFixed(1) + "%",
        9,
      )}${padRight(fmtScore(c.score), 7)}${padRight(
        c.grade ?? "—",
        7,
      )}${c.severity ?? "—"}`,
    );
  }
}

async function main(): Promise<void> {
  console.log(
    `${BOLD}PDF Accessibility Engine — Controls Verification${RESET}\n`,
  );

  // --- Load fixtures ------------------------------------------------------
  const baselinePath = path.join(CONTROLS_DIR, BASELINE);
  const remediatedPath = path.join(CONTROLS_DIR, REMEDIATED);

  for (const p of [baselinePath, remediatedPath]) {
    if (!fs.existsSync(p)) {
      console.error(`${RED}FATAL:${RESET} fixture missing at ${p}`);
      process.exit(1);
    }
  }

  const baselineBuf = fs.readFileSync(baselinePath);
  const remediatedBuf = fs.readFileSync(remediatedPath);

  // --- Run engine ---------------------------------------------------------
  let baseline: AnalysisResult;
  let remediated: AnalysisResult;

  try {
    console.log(`${DIM}Analyzing baseline:    ${BASELINE}${RESET}`);
    baseline = await analyzePDF(baselineBuf, BASELINE);
    console.log(`${DIM}Analyzing remediated:  ${REMEDIATED}${RESET}\n`);
    remediated = await analyzePDF(remediatedBuf, REMEDIATED);
  } catch (err) {
    console.error(
      `${RED}FATAL:${RESET} analyzePDF threw — pipeline is broken.`,
    );
    console.error(err);
    process.exit(2);
  }

  // --- Per-fixture report -------------------------------------------------
  for (const [label, r] of [
    ["BASELINE", baseline],
    ["REMEDIATED", remediated],
  ] as const) {
    console.log(`${BOLD}── ${label}: ${r.filename}${RESET}`);
    console.log(
      `  ${DIM}pages:${RESET} ${r.pageCount}   ${DIM}isScanned:${RESET} ${r.isScanned}`,
    );
    console.log(
      `  ${DIM}Strict overall:${RESET}    ${r.scoreProfiles.strict.overallScore}/100 (${r.scoreProfiles.strict.grade})   ${DIM}origin:${RESET} ${(r.scoreProfiles.strict as any).origin ?? "—"}`,
    );
    console.log(
      `  ${DIM}Practical overall:${RESET} ${r.scoreProfiles.remediation.overallScore}/100 (${r.scoreProfiles.remediation.grade})   ${DIM}origin:${RESET} ${(r.scoreProfiles.remediation as any).origin ?? "—"}`,
    );
    if (r.warnings.length > 0) {
      console.log(`  ${YELLOW}warnings:${RESET}`);
      for (const w of r.warnings) console.log(`    - ${w}`);
    }
    console.log();
    printCategoryTable(
      "Strict categories",
      r.scoreProfiles.strict.categories,
    );
    console.log();
    printCategoryTable(
      "Practical categories",
      r.scoreProfiles.remediation.categories,
    );
    console.log();
  }

  // --- Comparative delta --------------------------------------------------
  console.log(`${BOLD}── Comparative Delta (baseline → remediated)${RESET}`);
  console.log(
    `  ${DIM}${padRight("category", 22)}${padRight("strict", 22)}practical${RESET}`,
  );
  const categoryIds = baseline.scoreProfiles.strict.categories.map((c) => c.id);
  for (const id of categoryIds) {
    const bStrict = categoryById(baseline.scoreProfiles.strict.categories, id);
    const rStrict = categoryById(
      remediated.scoreProfiles.strict.categories,
      id,
    );
    const bPrac = categoryById(
      baseline.scoreProfiles.remediation.categories,
      id,
    );
    const rPrac = categoryById(
      remediated.scoreProfiles.remediation.categories,
      id,
    );
    console.log(
      `  ${padRight(id, 22)}${padRight(
        fmtDelta(bStrict?.score ?? null, rStrict?.score ?? null),
        22,
      )}${fmtDelta(bPrac?.score ?? null, rPrac?.score ?? null)}`,
    );
  }
  console.log();

  // --- Invariants ---------------------------------------------------------
  const invariants: InvariantResult[] = [];

  const inv = (id: string, pass: boolean, reason: string): void => {
    invariants.push({ id, pass, reason });
  };

  // 1. pipeline-no-errors
  const allWarnings = [...baseline.warnings, ...remediated.warnings];
  inv(
    "pipeline-no-errors",
    allWarnings.length === 0,
    allWarnings.length === 0
      ? "no warnings on either fixture"
      : `warnings: ${allWarnings.join(" | ")}`,
  );

  // 2. origin-tags
  const bOriginStrict = (baseline.scoreProfiles.strict as any).origin;
  const bOriginPrac = (baseline.scoreProfiles.remediation as any).origin;
  const rOriginStrict = (remediated.scoreProfiles.strict as any).origin;
  const rOriginPrac = (remediated.scoreProfiles.remediation as any).origin;
  const expectedStrictOrigin = "icjia.iitaa.wcag21";
  const expectedPracOrigin = "developer-extension.pdfua";
  const originsOk =
    bOriginStrict === expectedStrictOrigin &&
    rOriginStrict === expectedStrictOrigin &&
    bOriginPrac === expectedPracOrigin &&
    rOriginPrac === expectedPracOrigin;
  inv(
    "origin-tags",
    originsOk,
    originsOk
      ? `strict=${expectedStrictOrigin}, remediation=${expectedPracOrigin}`
      : `got strict=${bOriginStrict}/${rOriginStrict}, remediation=${bOriginPrac}/${rOriginPrac}`,
  );

  // 3. scores-in-range
  const allScores: Array<{ file: string; profile: string; cat: string; score: number | null }> =
    [];
  for (const [file, r] of [
    ["baseline", baseline],
    ["remediated", remediated],
  ] as const) {
    for (const c of r.scoreProfiles.strict.categories) {
      allScores.push({ file, profile: "strict", cat: c.id, score: c.score });
    }
    for (const c of r.scoreProfiles.remediation.categories) {
      allScores.push({
        file,
        profile: "practical",
        cat: c.id,
        score: c.score,
      });
    }
  }
  const outOfRange = allScores.filter(
    (s) =>
      s.score !== null &&
      (!Number.isInteger(s.score) || s.score < 0 || s.score > 100),
  );
  inv(
    "scores-in-range",
    outOfRange.length === 0,
    outOfRange.length === 0
      ? `checked ${allScores.length} scores, all in [0..100] or null`
      : `out of range: ${outOfRange.map((s) => `${s.file}/${s.profile}/${s.cat}=${s.score}`).join(", ")}`,
  );

  // 4. weights-match-config
  const mismatches: string[] = [];
  for (const [file, r] of [
    ["baseline", baseline],
    ["remediated", remediated],
  ] as const) {
    for (const c of r.scoreProfiles.strict.categories) {
      const expected = (SCORING_PROFILES.strict.weights as Record<string, number>)[
        c.id
      ];
      if (expected === undefined || Math.abs(expected - c.weight) > 1e-9) {
        mismatches.push(
          `${file}/strict/${c.id}: got ${c.weight}, expected ${expected}`,
        );
      }
    }
    for (const c of r.scoreProfiles.remediation.categories) {
      const expected = (SCORING_PROFILES.remediation.weights as Record<string, number>)[
        c.id
      ];
      if (expected === undefined || Math.abs(expected - c.weight) > 1e-9) {
        mismatches.push(
          `${file}/practical/${c.id}: got ${c.weight}, expected ${expected}`,
        );
      }
    }
  }
  inv(
    "weights-match-config",
    mismatches.length === 0,
    mismatches.length === 0
      ? "every returned weight matches SCORING_PROFILES"
      : mismatches.join(" | "),
  );

  // Helper for per-category invariants.
  const bStrictCats = baseline.scoreProfiles.strict.categories;
  const rStrictCats = remediated.scoreProfiles.strict.categories;
  const bPracCats = baseline.scoreProfiles.remediation.categories;
  const rPracCats = remediated.scoreProfiles.remediation.categories;

  // 5. bookmarks-improved (practical is the meaningful comparison; in Strict,
  //    short docs may be N/A — these are 37-page docs so bookmarks apply).
  const bBookStrict = categoryById(bStrictCats, "bookmarks")?.score ?? null;
  const rBookStrict = categoryById(rStrictCats, "bookmarks")?.score ?? null;
  const bookImproved =
    (rBookStrict ?? -1) >= (bBookStrict ?? -1) &&
    ((bBookStrict === null && rBookStrict !== null) ||
      (bBookStrict !== null && rBookStrict !== null && rBookStrict >= bBookStrict));
  inv(
    "bookmarks-improved",
    bookImproved,
    `strict: ${fmtScore(bBookStrict)} → ${fmtScore(rBookStrict)}`,
  );

  // 6. alt-text-improved
  const bAltStrict = categoryById(bStrictCats, "alt_text")?.score ?? null;
  const rAltStrict = categoryById(rStrictCats, "alt_text")?.score ?? null;
  const altImproved =
    (bAltStrict === null && rAltStrict !== null) ||
    (bAltStrict !== null &&
      rAltStrict !== null &&
      rAltStrict >= bAltStrict);
  inv(
    "alt-text-improved",
    altImproved,
    `strict: ${fmtScore(bAltStrict)} → ${fmtScore(rAltStrict)}`,
  );

  // 7. heading-strict-still-failing (<50 on both)
  const bHeadStrict =
    categoryById(bStrictCats, "heading_structure")?.score ?? null;
  const rHeadStrict =
    categoryById(rStrictCats, "heading_structure")?.score ?? null;
  const headLow =
    bHeadStrict !== null &&
    rHeadStrict !== null &&
    bHeadStrict < 50 &&
    rHeadStrict < 50;
  inv(
    "heading-strict-still-failing",
    headLow,
    `strict: ${fmtScore(bHeadStrict)} → ${fmtScore(rHeadStrict)}  (expected < 50 on both)`,
  );

  // 8. table-strict-still-failing (<70 on both)
  const bTblStrict = categoryById(bStrictCats, "table_markup")?.score ?? null;
  const rTblStrict = categoryById(rStrictCats, "table_markup")?.score ?? null;
  const tblLow =
    bTblStrict !== null &&
    rTblStrict !== null &&
    bTblStrict < 70 &&
    rTblStrict < 70;
  inv(
    "table-strict-still-failing",
    tblLow,
    `strict: ${fmtScore(bTblStrict)} → ${fmtScore(rTblStrict)}  (expected < 70 on both)`,
  );

  // 9. pdf-ua-strict-na
  const bPuaStrict =
    categoryById(bStrictCats, "pdf_ua_compliance")?.score ?? null;
  const rPuaStrict =
    categoryById(rStrictCats, "pdf_ua_compliance")?.score ?? null;
  const puaStrictNa = bPuaStrict === null && rPuaStrict === null;
  inv(
    "pdf-ua-strict-na",
    puaStrictNa,
    `strict: ${fmtScore(bPuaStrict)} / ${fmtScore(rPuaStrict)} (expected null / null)`,
  );

  // 10. pdf-ua-practical-scored
  const bPuaPrac =
    categoryById(bPracCats, "pdf_ua_compliance")?.score ?? null;
  const rPuaPrac =
    categoryById(rPracCats, "pdf_ua_compliance")?.score ?? null;
  const puaPracScored = bPuaPrac !== null && rPuaPrac !== null;
  inv(
    "pdf-ua-practical-scored",
    puaPracScored,
    `practical: ${fmtScore(bPuaPrac)} / ${fmtScore(rPuaPrac)} (expected numbers)`,
  );

  // 11. categories-count
  const strictCount = bStrictCats.length;
  const pracCount = bPracCats.length;
  const countOk =
    strictCount === 11 &&
    pracCount === 11 &&
    rStrictCats.length === 11 &&
    rPracCats.length === 11;
  inv(
    "categories-count",
    countOk,
    `strict=${strictCount}/${rStrictCats.length}, practical=${pracCount}/${rPracCats.length} (expected 11/11/11/11)`,
  );

  // --- Print invariants ---------------------------------------------------
  console.log(`${BOLD}── Rule Validation${RESET}`);
  let passCount = 0;
  for (const i of invariants) {
    const tag = i.pass ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`  [${tag}] ${padRight(i.id, 30)} ${i.reason}`);
    if (i.pass) passCount++;
  }
  console.log();
  const verdict =
    passCount === invariants.length
      ? `${GREEN}${BOLD}engine produces valid scores${RESET}`
      : `${RED}${BOLD}engine has issues — see FAIL rows above${RESET}`;
  console.log(
    `${BOLD}Summary:${RESET} ${passCount}/${invariants.length} invariants passed — ${verdict}`,
  );

  if (passCount !== invariants.length) {
    process.exitCode = 3;
  }
}

main().catch((err) => {
  console.error(`${RED}Unhandled error:${RESET}`, err);
  process.exit(4);
});
