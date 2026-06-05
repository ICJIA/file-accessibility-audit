import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { resolve, basename, join } from "node:path";
import { analyzePDF, type AnalysisResult } from "../services/pdfAnalyzer.js";
import { convert } from "@opendataloader/pdf";

const JDK_BIN = "/opt/homebrew/opt/openjdk@17/bin";
const JDK_HOME = "/opt/homebrew/opt/openjdk@17";
if (!process.env.PATH?.includes(JDK_BIN)) {
  process.env.PATH = `${JDK_BIN}:${process.env.PATH ?? ""}`;
}
process.env.JAVA_HOME = process.env.JAVA_HOME ?? JDK_HOME;

const REPO_ROOT = resolve(import.meta.dirname, "../../../..");
const SPIKE_OUT = resolve(REPO_ROOT, "spike-out");
const REPORT_PATH = resolve(REPO_ROOT, "docs/archive/spike-remediation-results.md");
const HYBRID_URL = process.env.ODL_HYBRID_URL ?? "http://localhost:5002";
const ENABLE_HYBRID = (process.env.ODL_ENABLE_HYBRID ?? "1") !== "0";

const TEST_PDFS: string[] = [
  resolve(REPO_ROOT, "controls/ILHEALSFallWinter2022FINAL.pdf"),
  resolve(REPO_ROOT, "controls/WomenInPolicing2021-210525T15080148.pdf"),
  resolve(REPO_ROOT, "controls/FY_22_ICJIA_Annual_Report_7c7ba4f4f0.pdf"),
  resolve(REPO_ROOT, "controls/2009 MV Annual Report.pdf"),
  resolve(REPO_ROOT, "controls/2022 SFS Process Evaluation Report-230622T16355531.pdf"),
  resolve(
    REPO_ROOT,
    "controls/DVFR_Biennial_Report_2024_FINAL_PUBLISHED_d01bf7bffd_b7889a939d.pdf",
  ),
  resolve(
    REPO_ROOT,
    "controls/Juvenile Justice System and Risk Factor Data 2007 Annual Report.pdf",
  ),
  resolve(REPO_ROOT, "controls/COVID arrests PDF to post on web-210305T17262965.pdf"),
  resolve(REPO_ROOT, "controls/FINAL REPORT PDF FOR POSTING-230207T16344430.pdf"),
  resolve(
    REPO_ROOT,
    "controls/Full_DJJ_Recidivism_Report_3-7-2019-191011T20092914.pdf",
  ),
  resolve(REPO_ROOT, "apps/api/src/__tests__/fixtures/inaccessible.pdf"),
  resolve(REPO_ROOT, "apps/api/src/__tests__/fixtures/accessible.pdf"),
];

const CONTROL_CEILINGS: Record<string, string> = {
  "ILHEALSFallWinter2022FINAL.pdf":
    "controls/ILHEALSFallWinter2022FINAL-remediated.pdf",
  "WomenInPolicing2021-210525T15080148.pdf":
    "controls/WomenInPolicing2021-210525T15080148-remediated.pdf",
  "FY_22_ICJIA_Annual_Report_7c7ba4f4f0.pdf":
    "controls/FY_22_ICJIA_Annual_Report_7c7ba4f4f0-remediated.pdf",
};

function isPdfTagged(path: string): boolean | null {
  try {
    const out = execSync(`pdfinfo ${JSON.stringify(path)}`, {
      encoding: "utf8",
    });
    const match = out.match(/^Tagged:\s+(yes|no)/m);
    if (!match) return null;
    return match[1] === "yes";
  } catch {
    return null;
  }
}

function pdfProducer(path: string): string {
  try {
    const out = execSync(`pdfinfo ${JSON.stringify(path)}`, {
      encoding: "utf8",
    });
    const c = out.match(/^Creator:\s+(.+)$/m)?.[1]?.trim() ?? "";
    const p = out.match(/^Producer:\s+(.+)$/m)?.[1]?.trim() ?? "";
    return [c, p].filter(Boolean).join(" / ");
  } catch {
    return "";
  }
}

function isPdfValid(path: string): { ok: boolean; reason: string } {
  try {
    const out = execSync(`qpdf --check ${JSON.stringify(path)} 2>&1`, {
      encoding: "utf8",
    });
    if (/operation succeeded with warnings/i.test(out)) {
      return { ok: false, reason: "qpdf warnings" };
    }
    return { ok: true, reason: "" };
  } catch {
    return { ok: false, reason: "qpdf check failed" };
  }
}

function normalizeWithQpdf(input: string, output: string): boolean {
  try {
    execSync(
      `qpdf --object-streams=disable ${JSON.stringify(input)} ${JSON.stringify(output)}`,
      { stdio: "pipe" },
    );
    return existsSync(output);
  } catch {
    // qpdf returns non-zero on warnings; check if output exists anyway
    return existsSync(output);
  }
}

interface ModeResult {
  score: number;
  grade: string;
  outputValid: boolean;
  outputBytes: number;
  durationMs: number;
  delta: number;
  error?: string;
  categoryScores: Record<string, number | null>;
}

interface Row {
  pdf: string;
  inputTagged: boolean | null;
  producer: string;
  pageCount: number;
  inputBytes: number;
  inputScore: number;
  inputGrade: string;
  basic: ModeResult | null;
  hybrid: ModeResult | null;
  ceilingScore: number | null;
  ceilingGrade: string | null;
}

async function auditFile(path: string, label: string): Promise<AnalysisResult> {
  return analyzePDF(readFileSync(path), label);
}

async function remediate(
  inputPath: string,
  outDir: string,
  mode: "basic" | "hybrid",
): Promise<{
  outputPath: string | null;
  durationMs: number;
  error?: string;
}> {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const t0 = Date.now();
  try {
    if (mode === "hybrid") {
      await convert(inputPath, {
        outputDir: outDir,
        format: "tagged-pdf",
        quiet: true,
        hybrid: "docling-fast",
        hybridUrl: HYBRID_URL,
        hybridTimeout: "300000",
      });
    } else {
      await convert(inputPath, {
        outputDir: outDir,
        format: "tagged-pdf",
        quiet: true,
      });
    }
  } catch (e) {
    return { outputPath: null, durationMs: Date.now() - t0, error: (e as Error).message };
  }
  const durationMs = Date.now() - t0;
  const outFiles = readdirSync(outDir).filter((f) =>
    f.toLowerCase().endsWith(".pdf"),
  );
  if (outFiles.length === 0) {
    return { outputPath: null, durationMs, error: "no PDF produced" };
  }
  return { outputPath: join(outDir, outFiles[0]), durationMs };
}

async function runMode(
  normalizedInput: string,
  filename: string,
  inputScore: number,
  outDir: string,
  mode: "basic" | "hybrid",
): Promise<ModeResult> {
  console.log(`[${filename}]   running ${mode}…`);
  const { outputPath, durationMs, error } = await remediate(
    normalizedInput,
    outDir,
    mode,
  );

  if (error || !outputPath) {
    return {
      score: 0,
      grade: "-",
      outputValid: false,
      outputBytes: 0,
      durationMs,
      delta: 0,
      error,
      categoryScores: {},
    };
  }

  const outputBytes = readFileSync(outputPath).byteLength;
  const validity = isPdfValid(outputPath);
  const result = await auditFile(outputPath, `${filename} ${mode}`);
  const score = result.overallScore;
  const categoryScores: Record<string, number | null> = {};
  for (const c of result.categories) categoryScores[c.id] = c.score;
  console.log(
    `[${filename}]   ${mode}: ${score.toFixed(1)} ${result.grade} ${validity.ok ? "✓" : "✗"} ${(durationMs / 1000).toFixed(1)}s`,
  );

  return {
    score,
    grade: result.grade,
    outputValid: validity.ok,
    outputBytes,
    durationMs,
    delta: score - inputScore,
    error: validity.ok ? undefined : validity.reason,
    categoryScores,
  };
}

async function processPdf(pdfPath: string): Promise<Row | null> {
  if (!existsSync(pdfPath)) {
    console.warn(`SKIP (missing): ${pdfPath}`);
    return null;
  }
  const filename = basename(pdfPath);
  const inputBytes = readFileSync(pdfPath).byteLength;
  const inputTagged = isPdfTagged(pdfPath);
  const producer = pdfProducer(pdfPath);

  console.log(
    `\n[${filename}] ${(inputBytes / 1024).toFixed(0)}KB, tagged=${inputTagged}, ${producer}`,
  );
  const inputResult = await auditFile(pdfPath, filename);
  console.log(
    `[${filename}]   input: ${inputResult.overallScore.toFixed(1)} ${inputResult.grade} (${inputResult.pageCount}pp)`,
  );

  // Step 1: qpdf normalize
  const baseDir = join(SPIKE_OUT, filename.replace(/\.pdf$/i, ""));
  if (existsSync(baseDir)) rmSync(baseDir, { recursive: true });
  mkdirSync(baseDir, { recursive: true });
  const normalizedPath = join(baseDir, "normalized.pdf");
  const normalized = normalizeWithQpdf(pdfPath, normalizedPath);
  if (!normalized) {
    console.warn(`[${filename}]   qpdf normalize failed; using raw input`);
  }
  const odlInput = normalized ? normalizedPath : pdfPath;

  // Step 2: run basic + hybrid
  const basic = await runMode(
    odlInput,
    filename,
    inputResult.overallScore,
    join(baseDir, "basic"),
    "basic",
  );

  let hybrid: ModeResult | null = null;
  if (ENABLE_HYBRID) {
    try {
      hybrid = await runMode(
        odlInput,
        filename,
        inputResult.overallScore,
        join(baseDir, "hybrid"),
        "hybrid",
      );
    } catch (e) {
      console.error(`[${filename}]   hybrid threw:`, e);
      hybrid = {
        score: 0,
        grade: "-",
        outputValid: false,
        outputBytes: 0,
        durationMs: 0,
        delta: 0,
        error: (e as Error).message,
        categoryScores: {},
      };
    }
  }

  // Ceiling
  let ceilingScore: number | null = null;
  let ceilingGrade: string | null = null;
  const ceilingRel = CONTROL_CEILINGS[filename];
  if (ceilingRel) {
    const ceilingPath = resolve(REPO_ROOT, ceilingRel);
    if (existsSync(ceilingPath)) {
      const c = await auditFile(ceilingPath, `${filename} (ceiling)`);
      ceilingScore = c.overallScore;
      ceilingGrade = c.grade;
    }
  }

  return {
    pdf: filename,
    inputTagged,
    producer,
    pageCount: inputResult.pageCount,
    inputBytes,
    inputScore: inputResult.overallScore,
    inputGrade: inputResult.grade,
    basic,
    hybrid,
    ceilingScore,
    ceilingGrade,
  };
}

function fmtMode(r: ModeResult | null): string {
  if (!r) return "–";
  if (r.error && r.outputBytes === 0) return "**ERROR**";
  const validMark = r.outputValid ? "✓" : "✗ DAMAGED";
  const signed = r.delta >= 0 ? "+" : "";
  return `${r.score.toFixed(1)} ${r.grade} ${validMark} (${signed}${r.delta.toFixed(1)}, ${(r.durationMs / 1000).toFixed(1)}s)`;
}

async function main(): Promise<void> {
  if (!existsSync(SPIKE_OUT)) mkdirSync(SPIKE_OUT, { recursive: true });
  if (!existsSync(resolve(REPO_ROOT, "docs")))
    mkdirSync(resolve(REPO_ROOT, "docs"), { recursive: true });

  console.log(`Hybrid: ${ENABLE_HYBRID ? `ON (${HYBRID_URL})` : "OFF"}`);

  const rows: Row[] = [];
  for (const pdf of TEST_PDFS) {
    try {
      const row = await processPdf(pdf);
      if (row) rows.push(row);
    } catch (e) {
      console.error(`UNCAUGHT ${pdf}:`, e);
    }
  }

  const lines: string[] = [];
  lines.push("# PDF Remediation Spike — OpenDataLoader (basic vs hybrid)");
  lines.push("");
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push("");
  lines.push(
    "Pipeline: qpdf preprocess (--object-streams=disable) → ODL basic OR ODL hybrid (docling-fast) → audit + validate.",
  );
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(
    "| PDF | Tagged | Pages | Input | Basic ODL | Hybrid ODL | Manual ceiling |",
  );
  lines.push(
    "|-----|--------|-------|-------|-----------|------------|----------------|",
  );
  for (const r of rows) {
    const tag = r.inputTagged === null ? "?" : r.inputTagged ? "yes" : "no";
    const ceil =
      r.ceilingScore !== null
        ? `${r.ceilingScore.toFixed(1)} ${r.ceilingGrade}`
        : "–";
    lines.push(
      `| ${r.pdf} | ${tag} | ${r.pageCount} | ${r.inputScore.toFixed(1)} ${r.inputGrade} | ${fmtMode(r.basic)} | ${fmtMode(r.hybrid)} | ${ceil} |`,
    );
  }
  lines.push("");

  // Aggregate stats
  const buckets = (filter: (r: Row) => boolean, get: (r: Row) => ModeResult | null) => {
    const subset = rows.filter(filter).map(get).filter((m): m is ModeResult => m !== null);
    if (subset.length === 0) return { n: 0, avgDelta: 0, damaged: 0, wins: 0 };
    const damaged = subset.filter((m) => !m.outputValid).length;
    const wins = subset.filter((m) => m.outputValid && m.delta >= 15).length;
    const avgDelta = subset.reduce((s, m) => s + m.delta, 0) / subset.length;
    return { n: subset.length, avgDelta, damaged, wins };
  };

  const taggedBasic = buckets((r) => r.inputTagged === true, (r) => r.basic);
  const taggedHybrid = buckets((r) => r.inputTagged === true, (r) => r.hybrid);
  const untaggedBasic = buckets((r) => r.inputTagged === false, (r) => r.basic);
  const untaggedHybrid = buckets((r) => r.inputTagged === false, (r) => r.hybrid);

  lines.push("## Aggregate: basic vs hybrid");
  lines.push("");
  lines.push("| Bucket | Mode | N | Avg Δ | Damaged | Wins (Δ≥+15) |");
  lines.push("|--------|------|---|-------|---------|--------------|");
  lines.push(
    `| Untagged input | basic | ${untaggedBasic.n} | ${untaggedBasic.avgDelta >= 0 ? "+" : ""}${untaggedBasic.avgDelta.toFixed(1)} | ${untaggedBasic.damaged} | ${untaggedBasic.wins} |`,
  );
  lines.push(
    `| Untagged input | hybrid | ${untaggedHybrid.n} | ${untaggedHybrid.avgDelta >= 0 ? "+" : ""}${untaggedHybrid.avgDelta.toFixed(1)} | ${untaggedHybrid.damaged} | ${untaggedHybrid.wins} |`,
  );
  lines.push(
    `| Tagged input | basic | ${taggedBasic.n} | ${taggedBasic.avgDelta >= 0 ? "+" : ""}${taggedBasic.avgDelta.toFixed(1)} | ${taggedBasic.damaged} | ${taggedBasic.wins} |`,
  );
  lines.push(
    `| Tagged input | hybrid | ${taggedHybrid.n} | ${taggedHybrid.avgDelta >= 0 ? "+" : ""}${taggedHybrid.avgDelta.toFixed(1)} | ${taggedHybrid.damaged} | ${taggedHybrid.wins} |`,
  );
  lines.push("");

  // Per-PDF detail
  for (const r of rows) {
    lines.push(`## ${r.pdf}`);
    lines.push("");
    lines.push(
      `- Producer: ${r.producer || "?"} · Pages: ${r.pageCount} · Tagged: **${r.inputTagged === null ? "?" : r.inputTagged ? "yes" : "no"}** · Size: ${(r.inputBytes / 1024).toFixed(0)} KB`,
    );
    lines.push(
      `- Input score: **${r.inputScore.toFixed(1)} (${r.inputGrade})**` +
        (r.ceilingScore !== null
          ? ` · Manual ceiling: ${r.ceilingScore.toFixed(1)} (${r.ceilingGrade})`
          : ""),
    );
    lines.push("");
    const cats = Array.from(
      new Set([
        ...Object.keys(r.basic?.categoryScores ?? {}),
        ...Object.keys(r.hybrid?.categoryScores ?? {}),
      ]),
    );
    if (cats.length > 0) {
      lines.push("| Category | Input | Basic | Hybrid |");
      lines.push("|----------|-------|-------|--------|");
      for (const cat of cats) {
        const b = r.basic?.categoryScores[cat];
        const h = r.hybrid?.categoryScores[cat];
        const fmt = (v: number | null | undefined) =>
          v === null || v === undefined ? "–" : v.toFixed(1);
        lines.push(`| ${cat} | – | ${fmt(b)} | ${fmt(h)} |`);
      }
      lines.push("");
    }
  }

  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- All ODL runs use input pre-normalized via `qpdf --object-streams=disable` (mitigation discovered in earlier spike pass).",
  );
  lines.push(
    "- Validity check: `qpdf --check` must report no warnings/errors. ✗ DAMAGED = output is corrupted.",
  );
  lines.push(
    "- Hybrid backend: `docling-fast` (default), no SmolVLM picture descriptions enabled in this run.",
  );

  writeFileSync(REPORT_PATH, lines.join("\n"));
  console.log(`\n✓ Report written: ${REPORT_PATH}`);
}

main().catch((e) => {
  console.error("Spike failed:", e);
  process.exit(1);
});
