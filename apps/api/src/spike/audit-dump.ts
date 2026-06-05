import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeWithQpdfAsync } from "../services/qpdfService.js";
import { analyzeWithPdfjs } from "../services/pdfjsService.js";
import { scoreDocument } from "../services/scorer.js";

const path = resolve(process.argv[2]);
const full = process.argv[3] === "full";
const buf = readFileSync(path);
const qpdf = await analyzeWithQpdfAsync(buf);
const pdfjs = await analyzeWithPdfjs(buf);
const r = scoreDocument(qpdf, pdfjs);

console.log("==== FILE:", path.split("/").pop());
console.log("OVERALL:", r.overallScore, r.grade);
console.log("[qpdf] hasPdfUaIdentifier:", qpdf.hasPdfUaIdentifier, "| pdfUaPart:", qpdf.pdfUaPart);
console.log("[qpdf] artifactCount(struct /S=/Artifact):", qpdf.artifactCount);
console.log("[qpdf] hasMarkInfo:", qpdf.hasMarkInfo, "| isMarkedContent:", qpdf.isMarkedContent);
console.log("[qpdf] fonts:", qpdf.fonts.length, "| embedded:", qpdf.fonts.filter((f) => f.embedded).length, "| NOT embedded:", qpdf.fonts.filter((f) => !f.embedded).length);
console.log("[qpdf] NOT-embedded names:", qpdf.fonts.filter((f) => !f.embedded).map((f) => f.name).join(", ") || "(none)");
console.log("[qpdf] structTreeMcidPages:", Object.keys(qpdf.structTreeMcidsByPage).length, "| [pdfjs] contentStreamMcidPages:", Object.keys(pdfjs.contentStreamMcidsByPage).length);
const ro = r.categories.find((c) => c.id === "reading_order");
console.log("[reading_order] score:", ro?.score, "severity:", ro?.severity);
console.log("[pdfUa]", JSON.stringify(r.pdfUa));

if (full) {
  for (const c of r.categories) {
    console.log(`\n### ${c.label}: ${c.score === null ? "N/A" : c.score} [${c.severity ?? "-"}]`);
    for (const f of c.findings) console.log("    " + f);
  }
  console.log("\n--- CONFORMANCE VERDICT ---");
  console.log(JSON.stringify(r.conformance, null, 2));
}
