import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, basename, join } from "node:path";
import { analyzePDF } from "../services/pdfAnalyzer.js";
import { convert } from "@opendataloader/pdf";

const JDK_BIN = "/opt/homebrew/opt/openjdk@17/bin";
const JDK_HOME = "/opt/homebrew/opt/openjdk@17";
if (!process.env.PATH?.includes(JDK_BIN)) {
  process.env.PATH = `${JDK_BIN}:${process.env.PATH ?? ""}`;
}
process.env.JAVA_HOME = process.env.JAVA_HOME ?? JDK_HOME;

const REPO_ROOT = resolve(import.meta.dirname, "../../../..");
const SPIKE_OUT = resolve(REPO_ROOT, "spike-out-smolvlm");
const REPORT_PATH = resolve(REPO_ROOT, "docs/archive/spike-remediation-results.md");
const HYBRID_URL = "http://localhost:5002";

// Pick PDFs with images that have room to improve on alt_text scoring.
const TEST_PDFS = [
  resolve(REPO_ROOT, "controls/ILHEALSFallWinter2022FINAL.pdf"),
  resolve(REPO_ROOT, "controls/FY_22_ICJIA_Annual_Report_7c7ba4f4f0.pdf"),
  resolve(
    REPO_ROOT,
    "controls/DVFR_Biennial_Report_2024_FINAL_PUBLISHED_d01bf7bffd_b7889a939d.pdf",
  ),
];

function normalizeWithQpdf(input: string, output: string): boolean {
  try {
    execSync(`qpdf --object-streams=disable ${JSON.stringify(input)} ${JSON.stringify(output)}`, { stdio: "pipe" });
  } catch {}
  return existsSync(output);
}

function isPdfValid(path: string): boolean {
  try {
    const out = execSync(`qpdf --check ${JSON.stringify(path)} 2>&1`, { encoding: "utf8" });
    return !/operation succeeded with warnings/i.test(out);
  } catch {
    return false;
  }
}

interface SmolRow {
  pdf: string;
  inputAltText: number | null;
  basicAltText: number | null;
  hybridAltText: number | null;
  smolvlmAltText: number | null;
  smolvlmScore: number;
  smolvlmGrade: string;
  smolvlmValid: boolean;
  smolvlmTimeMs: number;
  smolvlmCategories: Record<string, number | null>;
}

async function run(): Promise<void> {
  if (!existsSync(SPIKE_OUT)) mkdirSync(SPIKE_OUT, { recursive: true });

  const rows: SmolRow[] = [];
  for (const pdfPath of TEST_PDFS) {
    const filename = basename(pdfPath);
    console.log(`\n[${filename}]`);

    // Audit input
    const inputResult = await analyzePDF(readFileSync(pdfPath), filename);
    const inputAlt = inputResult.categories.find((c) => c.id === "alt_text")?.score ?? null;
    console.log(`  input: ${inputResult.overallScore.toFixed(1)} ${inputResult.grade}, alt_text=${inputAlt ?? "N/A"}`);

    // qpdf preprocess
    const dir = join(SPIKE_OUT, filename.replace(/\.pdf$/i, ""));
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
    const normalized = join(dir, "normalized.pdf");
    normalizeWithQpdf(pdfPath, normalized);
    const odlInput = existsSync(normalized) ? normalized : pdfPath;

    // Hybrid + SmolVLM
    const t0 = Date.now();
    console.log("  running SmolVLM (hybrid + picture-description, may be slow)…");
    try {
      await convert(odlInput, {
        outputDir: dir,
        format: "tagged-pdf",
        quiet: true,
        hybrid: "docling-fast",
        hybridMode: "full",
        hybridUrl: HYBRID_URL,
        hybridTimeout: "1800000",
      });
    } catch (e) {
      console.error(`  SmolVLM failed: ${(e as Error).message}`);
      continue;
    }
    const dt = Date.now() - t0;

    const outFiles = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf") && !f.startsWith("normalized"));
    if (outFiles.length === 0) {
      console.error("  no output PDF");
      continue;
    }
    const outputPath = join(dir, outFiles[0]);
    const valid = isPdfValid(outputPath);
    const smolResult = await analyzePDF(readFileSync(outputPath), `${filename} smolvlm`);
    const smolAlt = smolResult.categories.find((c) => c.id === "alt_text")?.score ?? null;
    const smolCats: Record<string, number | null> = {};
    for (const c of smolResult.categories) smolCats[c.id] = c.score;

    console.log(`  smolvlm: ${smolResult.overallScore.toFixed(1)} ${smolResult.grade}, alt_text=${smolAlt ?? "N/A"}, ${(dt / 1000).toFixed(1)}s, valid=${valid}`);

    rows.push({
      pdf: filename,
      inputAltText: inputAlt,
      basicAltText: null,
      hybridAltText: null,
      smolvlmAltText: smolAlt,
      smolvlmScore: smolResult.overallScore,
      smolvlmGrade: smolResult.grade,
      smolvlmValid: valid,
      smolvlmTimeMs: dt,
      smolvlmCategories: smolCats,
    });
  }

  // Append to existing report
  const lines: string[] = [];
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## SmolVLM (Tier 3) follow-up spike");
  lines.push("");
  lines.push(`_Run: ${new Date().toISOString()}_`);
  lines.push("");
  lines.push(
    "Tests ODL hybrid mode + `--enrich-picture-description` (SmolVLM-256M for AI-generated alt text on images/charts). 3 PDFs picked for room to improve on alt_text scoring.",
  );
  lines.push("");
  lines.push("| PDF | Input alt | SmolVLM alt | SmolVLM overall | Valid | Time |");
  lines.push("|-----|-----------|-------------|-----------------|-------|------|");
  for (const r of rows) {
    const inAlt = r.inputAltText === null ? "N/A" : r.inputAltText.toFixed(1);
    const smolAlt = r.smolvlmAltText === null ? "N/A" : r.smolvlmAltText.toFixed(1);
    const v = r.smolvlmValid ? "✓" : "✗";
    lines.push(`| ${r.pdf} | ${inAlt} | ${smolAlt} | ${r.smolvlmScore.toFixed(1)} ${r.smolvlmGrade} | ${v} | ${(r.smolvlmTimeMs / 1000).toFixed(1)}s |`);
  }
  lines.push("");
  for (const r of rows) {
    lines.push(`### ${r.pdf} (SmolVLM)`);
    lines.push("");
    lines.push("| Category | SmolVLM |");
    lines.push("|----------|---------|");
    for (const [id, score] of Object.entries(r.smolvlmCategories)) {
      lines.push(`| ${id} | ${score === null ? "N/A" : score.toFixed(1)} |`);
    }
    lines.push("");
  }

  appendFileSync(REPORT_PATH, lines.join("\n"));
  console.log(`\n✓ Appended SmolVLM section to ${REPORT_PATH}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
