/**
 * scripts/analyze-women-in-policing.ts
 *
 * One-shot analyzer for controls/WomenInPolicing2021-210525T15080148-remediated.pdf.
 * Run with: pnpm tsx scripts/analyze-women-in-policing.ts
 */

import fs from "node:fs";
import path from "node:path";
import { analyzePDF } from "../apps/api/src/services/pdfAnalyzer.js";

const CONTROLS_DIR = path.resolve(import.meta.dirname, "..", "controls");
const FILE = process.argv[2] ?? "WomenInPolicing2021-210525T15080148-remediated.pdf";

function line(): void {
  console.log("─".repeat(78));
}

async function main(): Promise<void> {
  const fullPath = path.join(CONTROLS_DIR, FILE);
  if (!fs.existsSync(fullPath)) {
    console.error(`missing fixture: ${fullPath}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(fullPath);
  console.log(`Analyzing ${FILE} (${(buf.length / 1024 / 1024).toFixed(2)} MB)\n`);

  const r = await analyzePDF(buf, FILE);

  console.log(`pages: ${r.pageCount}   isScanned: ${r.isScanned}`);
  console.log();

  console.log(
    `STRICT overall:    ${r.scoreProfiles.strict.overallScore}/100 (${r.scoreProfiles.strict.grade})   origin: ${(r.scoreProfiles.strict as any).origin ?? "—"}`,
  );
  console.log(
    `PRACTICAL overall: ${r.scoreProfiles.remediation.overallScore}/100 (${r.scoreProfiles.remediation.grade})   origin: ${(r.scoreProfiles.remediation as any).origin ?? "—"}`,
  );
  console.log();

  if (r.warnings.length > 0) {
    console.log("warnings:");
    for (const w of r.warnings) console.log(`  - ${w}`);
    console.log();
  }

  for (const [label, prof] of [
    ["STRICT", r.scoreProfiles.strict],
    ["PRACTICAL", r.scoreProfiles.remediation],
  ] as const) {
    line();
    console.log(`${label} categories`);
    line();
    console.log(
      "id".padEnd(24) +
        "weight".padEnd(10) +
        "score".padEnd(8) +
        "grade".padEnd(8) +
        "severity",
    );
    for (const c of prof.categories) {
      console.log(
        c.id.padEnd(24) +
          ((c.weight * 100).toFixed(1) + "%").padEnd(10) +
          String(c.score ?? "N/A").padEnd(8) +
          String(c.grade ?? "—").padEnd(8) +
          String(c.severity ?? "—"),
      );
    }
    console.log();
  }

  // Dump the category details — evidence & detected issues — for whichever
  // categories hurt the overall score. The category result shape is defined in
  // scorer.ts (CategoryResult) — we just serialize what exists.
  line();
  console.log("Per-category details (Strict)");
  line();
  for (const c of r.scoreProfiles.strict.categories) {
    console.log(`\n[${c.id}] score=${c.score} grade=${c.grade} severity=${c.severity}`);
    console.log(`  label: ${c.label}`);
    console.log(`  explanation: ${c.explanation}`);
    if (c.findings && c.findings.length) {
      console.log(`  findings:`);
      for (const f of c.findings) console.log(`    - ${f}`);
    }
  }

  console.log();
  line();
  console.log("Per-category details (Practical) — only where it differs from Strict");
  line();
  for (const c of r.scoreProfiles.remediation.categories) {
    const s = r.scoreProfiles.strict.categories.find((x) => x.id === c.id);
    const same =
      s !== undefined &&
      s.score === c.score &&
      JSON.stringify(s.findings) === JSON.stringify(c.findings);
    if (same) continue;
    console.log(`\n[${c.id}] score=${c.score} grade=${c.grade} severity=${c.severity}`);
    console.log(`  explanation: ${c.explanation}`);
    if (c.findings && c.findings.length) {
      console.log(`  findings:`);
      for (const f of c.findings) console.log(`    - ${f}`);
    }
  }

  // Adobe parity summary.
  line();
  console.log("Adobe Parity (32 rules)");
  line();
  const ap = (r as any).adobeParity as {
    summary: {
      passed: number;
      failed: number;
      manual: number;
      skipped: number;
      notComputed: number;
      vacuousPasses: number;
      total: number;
    };
    rules: Array<{
      id: string;
      category: string;
      name: string;
      status: string;
      vacuous: boolean;
      note: string;
    }>;
  };
  console.log(
    `summary: ${ap.summary.passed} passed (${ap.summary.vacuousPasses} vacuous) · ${ap.summary.failed} failed · ${ap.summary.manual} manual · ${ap.summary.skipped} skipped · ${ap.summary.notComputed} not_computed`,
  );
  for (const rule of ap.rules) {
    const badge = rule.vacuous ? "⚠ vacuous" : "";
    console.log(
      `  [${rule.status}] ${rule.category} · ${rule.name} ${badge}`,
    );
    console.log(`    ${rule.note}`);
  }

  line();
  console.log("Raw QPDF / pdfjs signals");
  line();
  // Re-import the services directly to re-run and peek at raw data.
  const { analyzeWithQpdfAsync } = await import(
    "../apps/api/src/services/qpdfService.js"
  );
  const { analyzeWithPdfjs } = await import(
    "../apps/api/src/services/pdfjsService.js"
  );
  const [qp, pj] = await Promise.all([
    analyzeWithQpdfAsync(buf),
    analyzeWithPdfjs(buf),
  ]);
  console.log("QPDF:");
  console.log(JSON.stringify(qp, null, 2));
  console.log("pdfjs metadata / hasText / pageCount:");
  console.log(
    JSON.stringify(
      {
        metadata: pj.metadata,
        hasText: pj.hasText,
        pageCount: pj.pageCount,
        error: pj.error,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("unhandled error:", err);
  process.exit(2);
});
