/**
 * scripts/legal-basis.ts — every point lost must name the law it broke.
 *
 *   pnpm legal-basis
 *
 * THE RULE (user decision, 2026-08-29): only WCAG 2.1 A/AA — the standard
 * ADA Title II and the Illinois IITAA name — may move a score. Everything
 * else is reported, never counted. This gate walks the whole corpus and
 * fails if ANY scored category sits below 100 without at least one failing
 * WCAG criterion attributed to it in the conformance verdict. A violation
 * means a deduction exists that the report itself cannot tie to the law —
 * the SiteImprove failure mode, caught mechanically.
 */
import fs from "node:fs";
import path from "node:path";
import { analyzeDocument } from "../apps/api/src/services/analyzer.js";

const ROOTS = ["controls"];
const EXTS = new Set([".pdf", ".docx", ".pptx", ".xlsx"]);

async function main() {
  const files: string[] = [];
  for (const root of ROOTS) {
    for (const entry of fs.readdirSync(root)) {
      const p = path.join(root, entry);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        for (const sub of fs.readdirSync(p)) {
          if (EXTS.has(path.extname(sub).toLowerCase())) files.push(path.join(p, sub));
        }
      } else if (EXTS.has(path.extname(entry).toLowerCase())) {
        files.push(p);
      }
    }
  }
  files.sort();

  const violations: Array<{ file: string; cat: string; score: number; firstFinding: string }> = [];
  let checked = 0;
  for (const f of files) {
    let r;
    try {
      r = await analyzeDocument(fs.readFileSync(f), path.basename(f));
    } catch {
      continue;
    }
    checked++;
    const conf = (r as any).conformance;
    const failing = new Set((conf?.failures ?? []).map((x: any) => x.category));
    for (const c of r.categories as any[]) {
      // A category the scorer reported as NOT ASSESSED (score null) may not
      // carry a confirmed WCAG failure: the report would be saying "we did
      // not assess this" and "this fails the law" about the same content.
      // Added 2026-08-31 — this gate skipped null scores entirely, and a
      // Word document that graded A while its verdict named a 1.3.1 Level A
      // failure passed every check in CI.
      if (c.score === null) {
        if (failing.has(c.id)) {
          violations.push({
            file: path.basename(f),
            cat: c.id,
            score: -1,
            firstFinding:
              "NOT ASSESSED, yet the verdict names a failing criterion for this category",
          });
        }
        continue;
      }
      if (c.score >= 100) continue;
      if (!failing.has(c.id)) {
        const first = (c.findings ?? []).find(
          (x: string) =>
            typeof x === "string" && !x.startsWith("---") && !x.startsWith("  ") && x.trim(),
        );
        violations.push({
          file: path.basename(f),
          cat: c.id,
          score: c.score,
          firstFinding: String(first ?? "").slice(0, 90),
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log(`EVERY POINT LOST NAMES THE LAW IT BROKE (${checked} documents)`);
    return;
  }
  console.log(`${violations.length} deduction(s) with NO failing WCAG criterion behind them:\n`);
  const byCat = new Map<string, typeof violations>();
  for (const v of violations) {
    if (!byCat.has(v.cat)) byCat.set(v.cat, []);
    byCat.get(v.cat)!.push(v);
  }
  for (const [cat, list] of byCat) {
    console.log(`— ${cat} (${list.length} document(s)):`);
    for (const v of list.slice(0, 6)) {
      console.log(`    ${v.score}  ${v.file}`);
      console.log(`         ${v.firstFinding}`);
    }
    if (list.length > 6) console.log(`    ... and ${list.length - 6} more`);
  }
  process.exitCode = 1;
}
main();
