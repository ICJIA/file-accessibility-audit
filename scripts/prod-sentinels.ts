/**
 * scripts/prod-sentinels.ts — ask the LIVE site three questions with known
 * answers, after every deploy.
 *
 *   pnpm prod-sentinels                      (against https://audit.icjia.app)
 *   SENTINEL_URL=http://localhost:5103 pnpm prod-sentinels
 *
 * WHY (2026-08-29): CI proves the CODE judges correctly; nothing proved the
 * DEPLOYED system still does — a deploy is code plus nginx plus PM2 plus
 * the box's qpdf and Chromium, and the v1.109 timeout bug lived entirely in
 * that gap. Three sentinel traps with designed answers, uploaded for real:
 *
 *   synthetic-02  the metadata-rich scan lie      -> must score exactly 0/F
 *   synthetic-03  hollow alt (the bug it caught)  -> census must read 1 of 3
 *   synthetic-100 the perfect hundredth           -> must score exactly 100/A
 *
 * Any other answer means the LIVE checker is not the one that passed CI.
 * Traps are regenerated locally first if absent (they are gitignored).
 * Three anonymous-tier uploads — well inside the rate limit.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTROLS = path.join(ROOT, "controls");
const BASE = (process.env.SENTINEL_URL || "https://audit.icjia.app").replace(/\/$/, "");

interface Sentinel {
  file: string;
  check: (r: any) => string | null; // null = pass
}

const SENTINELS: Sentinel[] = [
  {
    file: "synthetic-02-scanned-lie.pdf",
    check: (r) =>
      r.overallScore === 0 && r.grade === "F"
        ? null
        : `expected 0/F, got ${r.overallScore}/${r.grade}`,
  },
  {
    file: "synthetic-03-hollow-alt.pdf",
    check: (r) => {
      const text = (r.categories ?? []).flatMap((c: any) => c.findings ?? []).join("\n");
      const m = text.match(/(\d+) of (\d+) image\(s\) have alternative text/);
      if (!m) return "no image census line in the live report";
      return m[1] === "1" && m[2] === "3" ? null : `census says ${m[0]}, expected 1 of 3`;
    },
  },
  {
    file: "synthetic-100-the-hundredth.pdf",
    check: (r) =>
      r.overallScore === 100 && r.grade === "A"
        ? null
        : `expected 100/A, got ${r.overallScore}/${r.grade}`,
  },
];

async function main() {
  if (!fs.existsSync(path.join(CONTROLS, SENTINELS[0].file))) {
    console.log("sentinel traps absent — regenerating the corpus first…");
    execSync("pnpm synthetic-controls", { cwd: ROOT, stdio: "ignore" });
  }

  let failures = 0;
  for (const s of SENTINELS) {
    const buf = fs.readFileSync(path.join(CONTROLS, s.file));
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)], { type: "application/pdf" }), s.file);
    const started = Date.now();
    let verdict: string;
    try {
      const res = await fetch(`${BASE}/api/analyze`, { method: "POST", body: form });
      if (!res.ok) {
        verdict = `FAIL  HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`;
        failures++;
      } else {
        const r = await res.json();
        const problem = s.check(r);
        if (problem === null) {
          verdict = `PASS  ${String(r.overallScore).padStart(3)}/${r.grade}  (${((Date.now() - started) / 1000).toFixed(1)}s)`;
        } else {
          verdict = `FAIL  ${problem}`;
          failures++;
        }
      }
    } catch (e: any) {
      verdict = `FAIL  ${e?.message ?? e}`;
      failures++;
    }
    console.log(`${verdict.padEnd(48)} ${s.file}`);
  }
  console.log(
    failures === 0
      ? `\nTHE LIVE CHECKER AT ${BASE} STILL JUDGES CORRECTLY`
      : `\n${failures} SENTINEL(S) FAILED against ${BASE} — the deployed checker is not answering like the one that passed CI`,
  );
  process.exit(failures === 0 ? 0 : 1);
}
main();
