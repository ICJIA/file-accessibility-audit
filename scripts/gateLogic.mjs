/**
 * scripts/gateLogic.mjs — the pure decision logic of the accuracy gates,
 * extracted so it can be UNIT-TESTED (apps/api gateLogic.test.ts).
 *
 * WHY (2026-08-29): the gates are the accuracy story, and every run of them
 * so far has been a happy path. A gate that cannot fire is theater — these
 * functions exist so tests can feed them sabotage (a mutated ledger row, an
 * inverted twin pair, an unknown placeholder) and prove the alarm rings.
 *
 * Plain .mjs so both worlds can import it: node runs build-brief.mjs
 * directly, and the TS gate scripts + vitest load it through the
 * hand-written gateLogic.d.mts (the repo's established pattern for plain-JS
 * modules imported from TS).
 */

/** Fill {{PLACEHOLDER}}s from subs. Throws on a placeholder with no value —
 *  a template typo must fail the build, never ship "{{TRAPS}}" to a page. */
export function fill(s, subs) {
  const out = s.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in subs)) throw new Error(`template placeholder with no value: {{${k}}}`);
    return subs[k];
  });
  const leftover = out.match(/\{\{\w+\}\}/);
  if (leftover) throw new Error(`unfilled placeholder: ${leftover[0]}`);
  return out;
}

/** Compare one blessed ledger row against current behavior. Returns human-
 *  readable drift lines; empty array = no movement. Error-pinned rows (files
 *  the analyzer refuses) compare by error class and nothing else. */
export function diffRow(file, want, got) {
  const out = [];
  if (want.error !== undefined || got.error !== undefined) {
    if (want.error !== got.error)
      out.push(`  ${file}: error ${JSON.stringify(want.error)} -> ${JSON.stringify(got.error)}`);
    return out;
  }
  if (want.score !== got.score || want.grade !== got.grade)
    out.push(`  ${file}: ${want.score}/${want.grade} -> ${got.score}/${got.grade}`);
  const ids = new Set([
    ...Object.keys(want.categories ?? {}),
    ...Object.keys(got.categories ?? {}),
  ]);
  for (const id of [...ids].sort()) {
    const a = want.categories?.[id];
    const b = got.categories?.[id];
    if (a !== b) out.push(`  ${file}: ${id} ${a ?? "(absent)"} -> ${b ?? "(absent)"}`);
  }
  return out;
}

/** The twin rule: for a matched pair, the flawed twin may never outscore the
 *  correct one — overall, or in the defect's own category. Returns violation
 *  descriptions; empty array = ordering holds. Unscored (null) categories
 *  are not comparable and never violate. */
export function twinViolations(bad, good, category) {
  const problems = [];
  if (bad.overallScore > good.overallScore)
    problems.push(`overall ${bad.overallScore} > ${good.overallScore}`);
  const cb = bad.categories.find((c) => c.id === category);
  const cg = good.categories.find((c) => c.id === category);
  if (cb && cg && cb.score !== null && cg.score !== null && cb.score > cg.score)
    problems.push(`${category} ${cb.score} > ${cg.score}`);
  return problems;
}
