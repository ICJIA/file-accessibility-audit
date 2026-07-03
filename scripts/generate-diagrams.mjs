/**
 * One-time / on-change generator: renders the static Mermaid flowcharts to
 * dark-theme SVG files so the app can ship them as static assets instead of
 * loading the ~640 KB mermaid runtime in the browser.
 *
 * The diagram sources never change at runtime — they are constants in the
 * three pages. This script extracts them, renders each via mermaid in a
 * headless browser (reusing the puppeteer dep), and writes
 * apps/web/app/assets/diagrams/<name>.svg. Re-run if a diagram source changes
 * (mermaid must be installed):
 *
 *   node scripts/generate-diagrams.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

// puppeteer is an apps/api dependency (pageAuditor); resolve it from there
// since this root-level script isn't in that package's dependency tree.
const apiRequire = createRequire(resolve(ROOT, "apps/api/package.json"));
const puppeteer = apiRequire("puppeteer");
const OUT_DIR = resolve(ROOT, "apps/web/app/assets/diagrams");
const MERMAID_BUNDLE = resolve(
  ROOT,
  "node_modules/.pnpm/mermaid@11.15.0/node_modules/mermaid/dist/mermaid.min.js",
);

// const-name → output filename
const NAME_MAP = {
  auditFlowDiagram: "audit-flow",
  twoToolDiagram: "two-tool",
  remediationFlowDiagram: "remediation-flow",
  architectureDiagram: "architecture",
  auditPipelineDiagram: "audit-pipeline",
  remediationPipelineDiagram: "remediation-pipeline",
  noAiDiagram: "no-ai",
};

const PAGES = [
  "apps/web/app/pages/technical-details.vue",
  "apps/web/app/pages/data-retention.vue",
];

// The dark theme from MermaidDiagram.vue, so the static SVGs match the prior
// in-browser rendering exactly.
const THEME = {
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    darkMode: true,
    background: "#0a0a0a",
    primaryColor: "#1e293b",
    primaryTextColor: "#f5f5f5",
    primaryBorderColor: "#3b82f6",
    lineColor: "#9ca3af",
    secondaryColor: "#1e3a8a",
    tertiaryColor: "#374151",
    textColor: "#f5f5f5",
    mainBkg: "#1e293b",
    nodeBorder: "#3b82f6",
    edgeLabelBackground: "#0a0a0a",
  },
  securityLevel: "loose",
  flowchart: { useMaxWidth: true, htmlLabels: false },
};

function extractSources() {
  const re = /const (\w*[Dd]iagram\w*)\s*=\s*`(flowchart[\s\S]*?)`/g;
  const found = {};
  for (const rel of PAGES) {
    const src = readFileSync(resolve(ROOT, rel), "utf-8");
    let m;
    while ((m = re.exec(src))) {
      const name = NAME_MAP[m[1]];
      if (name && !found[name]) found[name] = m[2].trim();
    }
  }
  return found;
}

// Inline source of truth for diagrams whose page-embedded const was removed
// when the client mermaid runtime was dropped (v1.28.0). Entries here take
// precedence over page-extracted sources; add one to (re)generate that diagram.
const INLINE_SOURCES = {
  // Audit pipeline, PDF + Office (.docx/.pptx/.xlsx) branch. PDF fans out to
  // the two-tool (qpdf + pdfjs) path; the Office formats run fully in-process
  // (JSZip + fast-xml-parser).
  "audit-flow": `flowchart TD
  U[Browser uploads file] --> V[Validate magic bytes and size]
  V --> D{PDF or Office file?}
  D -->|PDF| T[Short-lived qpdf temp copy]
  T --> Q[qpdf analyzes structure]
  T --> J[pdfjs extracts content]
  D -->|Word .docx / PowerPoint .pptx / Excel .xlsx| Z[Unzip in memory with JSZip]
  Z --> X[Parse OOXML with fast-xml-parser]
  Q --> S[Scorer combines results]
  J --> S
  X --> S
  S --> G[Grade + WCAG verdict + findings]
  G --> B[Return to browser]
  B --> K[Discard memory buffer]`,
};

const sources = { ...extractSources(), ...INLINE_SOURCES };
const names = Object.keys(sources);
console.log(`Rendering ${names.length} diagrams: ${names.join(", ")}`);

const browser = await puppeteer.launch({
  headless: true,
  // Use the system-installed Google Chrome (portable; no `puppeteer install`
  // needed). Override with PUPPETEER_EXECUTABLE_PATH if Chrome lives elsewhere.
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  channel: process.env.PUPPETEER_EXECUTABLE_PATH ? undefined : "chrome",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ path: MERMAID_BUNDLE });

  mkdirSync(OUT_DIR, { recursive: true });
  for (const name of names) {
    const svg = await page.evaluate(
      async (source, theme, id) => {
        // eslint-disable-next-line no-undef
        const mermaid = window.mermaid;
        mermaid.initialize(theme);
        const { svg } = await mermaid.render(id, source);
        return svg;
      },
      sources[name],
      THEME,
      `gen-${name}`,
    );
    writeFileSync(resolve(OUT_DIR, `${name}.svg`), svg, "utf-8");
    console.log(`  ✓ ${name}.svg (${svg.length} bytes)`);
  }
} finally {
  await browser.close();
}
console.log("Done. SVGs written to apps/web/app/assets/diagrams/");
