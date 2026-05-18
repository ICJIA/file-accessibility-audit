import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzePDF } from "../services/pdfAnalyzer.js";

const path = resolve(process.argv[2]);
const buf = readFileSync(path);
const r = await analyzePDF(buf, path);
console.log(`${r.overallScore.toFixed(1)} ${r.grade}`);
for (const c of r.categories) {
  console.log(
    `  ${c.label}: ${c.score === null ? "N/A" : c.score.toFixed(1)}`,
  );
}
