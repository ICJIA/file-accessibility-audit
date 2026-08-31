/**
 * scripts/best-practice-basis.ts — nothing the law requires may be filed under
 * "not scored".
 *
 *   pnpm best-practice-basis            verify (CI)
 *   pnpm best-practice-basis --bless    re-record the reviewed pairs
 *
 * THE CONVERSE OF `legal-basis.ts`. That gate walks the corpus and fails when
 * a category scores below 100 with no failing WCAG criterion behind it — the
 * over-scoring direction, "we took points for something we cannot tie to the
 * law." It is one-directional, and the 2026-08-31 WCAG audit of the Best
 * practices catalog showed why that matters: nothing in CI could catch the
 * opposite mistake, a genuine WCAG 2.1 A/AA failure presented to a public body
 * as an optional nicety. That is the more damaging error of the two. A report
 * that under-scores tells an agency it is compliant when it is not.
 *
 * WHAT IT CHECKS. For every control document, every Best-practice row that
 * reads NOT MET is paired against the WCAG criteria the conformance verdict
 * attributes to that row's own category. A pairing is not automatically wrong
 * — a category can fail 1.3.1 for a headerless table while a genuinely
 * optional practice about NESTED tables sits in the same card — so the gate
 * does not guess. It requires that every such pairing has been looked at by a
 * person and recorded here. Anything new fails the build until someone answers
 * the question:
 *
 *     Is this row about a DIFFERENT defect than the one that cost points?
 *     If it is the same defect, it must be scored, not called optional.
 *
 * WHAT IT CANNOT DO. It cannot decide whether an unscored practice ought to be
 * a WCAG failure — that is a reading of the standard, and the audit that did it
 * is written up in the memory file for 2026-08-31. This gate makes that audit
 * durable rather than repeating it: the catalog can no longer drift into a new
 * co-occurrence silently. The declaration half of the audit (every practice
 * states its legal basis) is pinned in bestPracticesCore.test.ts instead, where
 * it runs in milliseconds rather than needing the corpus.
 */
import fs from "node:fs";
import path from "node:path";
import { analyzeDocument } from "../apps/api/src/services/analyzer.js";
import { evaluateBestPractices } from "~/utils/bestPractices";

const ROOTS = ["controls"];
/** Floor for how many documents must actually analyse: every read is wrapped
 *  in `catch { continue }`, so an empty or unbuilt corpus would otherwise
 *  report success over zero documents. */
const MIN_DOCUMENTS = 120;
/** The placeholder --bless writes. Leaving it in the ledger means the pairing
 *  was recorded but never actually reviewed, which is the whole point of the
 *  gate — so it must fail the build exactly like an unblessed pair. */
const PLACEHOLDER = /^REVIEW ME/;
const EXTS = new Set([".pdf", ".docx", ".pptx", ".xlsx"]);
const LEDGER = path.join(import.meta.dirname, "best-practice-basis.json");
const BLESS = process.argv.includes("--bless");

interface Pair {
  /** Best-practice row reading NOT MET. */
  practice: string;
  /** Scoring category both it and the WCAG failure belong to. */
  category: string;
  /** The success criterion the report attributes to that category. */
  sc: string;
  level: string;
  /** Why a person decided the two are about different defects. */
  reviewed?: string;
}

const key = (p: Pick<Pair, "practice" | "sc">) => `${p.practice}|${p.sc}`;

async function collect(): Promise<{
  pairs: Map<string, Pair>;
  examples: Map<string, string[]>;
  checked: number;
}> {
  const files: string[] = [];
  for (const root of ROOTS) {
    for (const entry of fs.readdirSync(root)) {
      const p = path.join(root, entry);
      if (fs.statSync(p).isDirectory()) {
        for (const sub of fs.readdirSync(p)) {
          if (EXTS.has(path.extname(sub).toLowerCase())) files.push(path.join(p, sub));
        }
      } else if (EXTS.has(path.extname(entry).toLowerCase())) {
        files.push(p);
      }
    }
  }
  files.sort();

  const pairs = new Map<string, Pair>();
  const examples = new Map<string, string[]>();
  let checked = 0;

  for (const f of files) {
    let r: Awaited<ReturnType<typeof analyzeDocument>>;
    try {
      r = await analyzeDocument(fs.readFileSync(f), path.basename(f));
    } catch {
      continue; // a document the pipeline cannot read is legal-basis's problem, not this gate's
    }
    checked++;

    const failing = new Map<string, Array<{ sc: string; level: string }>>();
    const conf = (r as unknown as { conformance?: { failures?: Array<Record<string, unknown>> } })
      .conformance;
    for (const x of conf?.failures ?? []) {
      const cat = String(x.category ?? "");
      if (!failing.has(cat)) failing.set(cat, []);
      failing.get(cat)!.push({ sc: String(x.sc ?? ""), level: String(x.level ?? "") });
    }

    for (const row of evaluateBestPractices(r)) {
      // Only NOT MET matters. A MET row makes no claim about a defect, and a
      // NOT APPLICABLE row is where the catalog deliberately routes scored
      // defects ("counted in your score — see the action plan above").
      if (row.status !== "not-met") continue;
      const crits = failing.get(row.practice.categoryId);
      if (!crits) continue;
      for (const c of crits) {
        const pair: Pair = {
          practice: row.practice.id,
          category: row.practice.categoryId,
          sc: c.sc,
          level: c.level,
        };
        pairs.set(key(pair), pair);
        const k = key(pair);
        if (!examples.has(k)) examples.set(k, []);
        if (examples.get(k)!.length < 3) examples.get(k)!.push(path.basename(f));
      }
    }
  }
  return { pairs, examples, checked };
}

const { pairs, examples, checked } = await collect();

if (BLESS) {
  const existing: Pair[] = fs.existsSync(LEDGER)
    ? (JSON.parse(fs.readFileSync(LEDGER, "utf8")).pairs ?? [])
    : [];
  const notes = new Map(existing.map((p) => [key(p), p.reviewed]));
  const out = [...pairs.values()]
    .sort((a, b) => key(a).localeCompare(key(b)))
    .map((p) => ({
      ...p,
      reviewed:
        notes.get(key(p)) ?? "REVIEW ME — why is this row not the same defect that cost points?",
    }));
  fs.writeFileSync(
    LEDGER,
    `${JSON.stringify(
      {
        "//": "Reviewed co-occurrences: a Best-practice row reading NOT MET on a document whose SAME category carries a failing WCAG criterion. Each entry means a person confirmed the row is about a different defect than the failure. Regenerate with `pnpm best-practice-basis --bless` and fill in `reviewed` in the same commit.",
        blessed: new Date().toISOString().slice(0, 10),
        pairs: out,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `best-practice basis: recorded ${out.length} reviewed pair(s) from ${checked} documents`,
  );
} else {
  if (!fs.existsSync(LEDGER)) {
    console.log(
      `no ${path.basename(LEDGER)} — run \`pnpm best-practice-basis --bless\` and review each pair`,
    );
    process.exitCode = 1;
  } else {
    const blessed = new Map<string, Pair>(
      ((JSON.parse(fs.readFileSync(LEDGER, "utf8")).pairs ?? []) as Pair[]).map((p) => [key(p), p]),
    );
    const unblessed = [...pairs.values()].filter((p) => !blessed.has(key(p)));
    const stale = [...blessed.keys()].filter((k) => !pairs.has(k));

    const unreviewed = [...blessed.values()].filter((p) => PLACEHOLDER.test(p.reviewed ?? ""));
    if (checked < MIN_DOCUMENTS) {
      console.log(
        `only ${checked} document(s) could be analysed, below the floor of ${MIN_DOCUMENTS} — the corpus is missing or the pipeline is broken, so this gate proves nothing\n    (regenerate with: pnpm synthetic-controls && pnpm synthetic-office-controls)`,
      );
      process.exitCode = 1;
    } else if (unreviewed.length > 0) {
      console.log(
        `${unreviewed.length} pair(s) were recorded but never reviewed — the "reviewed" note is still the placeholder --bless wrote:\n`,
      );
      for (const p of unreviewed) console.log(`— ${p.practice}  (WCAG ${p.sc}, ${p.category})`);
      console.log(
        `\nAnswer the question for each, in "reviewed": is the row about a DIFFERENT defect than the one that cost points?`,
      );
      process.exitCode = 1;
    } else if (unblessed.length === 0) {
      console.log(
        `NOTHING THE LAW REQUIRES IS FILED UNDER "NOT SCORED" (${checked} documents, ${pairs.size} reviewed pair(s))`,
      );
      if (stale.length > 0) {
        console.log(
          `note: ${stale.length} recorded pair(s) no longer occur — harmless, clear them with --bless:\n    ${stale.join("\n    ")}`,
        );
      }
    } else {
      console.log(
        `${unblessed.length} best-practice row(s) report "not scored" beside a failing WCAG criterion in the SAME category, and no one has reviewed the pairing:\n`,
      );
      for (const p of unblessed) {
        console.log(`— ${p.practice}  (category: ${p.category})`);
        console.log(
          `    the report attributes WCAG ${p.sc} (Level ${p.level}) to that same category`,
        );
        console.log(`    e.g. ${(examples.get(key(p)) ?? []).join(", ")}`);
      }
      console.log(
        `\nDecide, for each: is the row about a DIFFERENT defect than the one that cost points?` +
          `\n  yes — record it: pnpm best-practice-basis --bless, then write the reason into "reviewed"` +
          `\n  no  — it is the same defect, so it must be SCORED, not reported as optional.`,
      );
      process.exitCode = 1;
    }
  }
}
