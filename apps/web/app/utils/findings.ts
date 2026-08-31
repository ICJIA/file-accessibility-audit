/**
 * Is this finding a NEUTRAL statement rather than a fault?
 *
 * The report card used to pick one icon from the CATEGORY's score and stamp
 * it on every line, so a card scoring 65 marked all of its findings with a
 * red ✗ — including plain measurements ("Structure tree depth: 7 level(s)",
 * "Pages: 1 | Paragraphs: 26 | Headings: 3"), the methodology paragraph, and
 * the card's OWN caveat saying the signal is not conclusive. A reader saw a
 * document with four correctly-tagged form captions presented as
 * comprehensively broken (DoIT XFA example, 2026-08-27, reported by the
 * document's author disputing the grade — correctly).
 *
 * Deliberately conservative: only lines that clearly state a measurement,
 * a method, or an explicit "this is not necessarily wrong" caveat are
 * neutralised. Anything this cannot recognise keeps the category icon, so a
 * real fault can never be softened into a bullet by accident.
 */
export function isNeutralFinding(finding: string): boolean {
  if (!finding) return false;
  const f = finding.trim();
  if (!f) return false;
  // Bare measurements: "Label: value" where the value carries no verdict.
  // The optional `[^:]{0,20}` allows a parenthetical before the colon —
  // "Content items (MCIDs): 66".
  if (/^(structure tree depth|content items|pages|reading-order fidelity)\b[^:]{0,20}:/i.test(f)) {
    return true;
  }
  // Census lines that count what exists rather than what is wrong.
  if (/^(language declared|author):/i.test(f)) return true;
  if (/^extracted [\d,]+ characters/i.test(f)) return true;
  // Methodology and self-caveat prose — the card explaining how it measured,
  // or explicitly saying the measurement is not a verdict.
  if (/^compared the /i.test(f)) return true;
  // The keyword test judges OUR wording, never the document's: findings quote
  // document text verbatim inside double quotes (heading samples, alt text,
  // link text), and a heading that happens to contain "advisory" must not
  // turn its own failure line into a neutral bullet. Balanced quoted spans
  // are removed before matching; the quoting side keeps them balanced by
  // stripping embedded quotes from samples at the source (censusHeadingContent).
  const ownWords = f.replace(/"[^"]*"/g, '""');
  if (
    /is not automatically wrong|does not affect the score|advisory|not required by/i.test(ownWords)
  ) {
    return true;
  }
  return false;
}

/** A finding the analyzer marked as reported-but-unscored. The analyzer owns
 *  the wording; these three prefixes are its contract with the UI.
 *
 *  "Note — not scored" was missing until 2026-08-30, so six Word/Excel lines
 *  (merged cells, empty table rows, out-of-table ranges, pivot tables,
 *  far-from-A1 starts, merged cells) fell through to `main` and rendered
 *  under the Tier-1 heading "Required by WCAG 2.1 — this is what your score
 *  measures". Unscored advice must never be presented as legally required. */
export function isNotScoredFinding(finding: string): boolean {
  if (!finding) return false;
  const f = finding.trim().toLowerCase();
  return (
    f.startsWith("pdf/ua only — not scored") ||
    f.startsWith("advisory — not scored") ||
    f.startsWith("note — not scored")
  );
}

export function isGuidanceFinding(finding: string): boolean {
  if (!finding) return false;
  const f = finding.toLowerCase();
  return (
    f.startsWith("how to fix:") ||
    f.startsWith("tip:") ||
    f.startsWith("fix:") ||
    f.startsWith("note:") ||
    f.startsWith("review these")
  );
}

export function firstActionableFinding(findings: string[] | undefined | null): string {
  if (!Array.isArray(findings) || findings.length === 0) return "";
  // Narrow to strings: a forged/corrupted stored report can smuggle
  // non-string entries (number/object/null) into `findings`, which would
  // throw on `.startsWith` below and 500 the shared-report page during SSR.
  const strs = findings.filter((f): f is string => typeof f === "string");
  const found = strs.find(
    (f) => f && !f.startsWith("---") && !f.startsWith("  ") && !isGuidanceFinding(f),
  );
  return found || strs[0] || "";
}

export interface TechnicalGroup {
  heading: string;
  items: string[];
}

export interface CardFindings {
  main: string[];
  signals: TechnicalGroup[];
  signalCount: number;
  acrobat: string[];
  /** Items the report shows but deliberately does NOT score: PDF/UA readiness
   *  work that the law (WCAG 2.2 AA / ADA Title II / IITAA) does not require.
   *  Split out so a reader can see at a glance which findings moved the grade
   *  and which are optional — and so an agency can say truthfully "this file
   *  meets the legal standard" while still being shown the extra work. */
  notScored: string[];
}

export function partitionCardFindings(findings: string[] | undefined | null): CardFindings {
  // Array.isArray guards against a malformed (attacker-controlled) stored
  // report whose `findings` is a non-array truthy — `.findIndex` on a string
  // would throw and 500 the shared-report page during SSR.
  if (!Array.isArray(findings) || findings.length === 0) {
    return { main: [], signals: [], signalCount: 0, acrobat: [], notScored: [] };
  }

  // Narrow to strings: a forged/corrupted stored report can smuggle
  // non-string entries (number/object/null) into `findings`, which would
  // throw on `.startsWith` below and 500 the shared-report page during SSR.
  const strs = findings.filter((f): f is string => typeof f === "string");

  const acrobatIdx = strs.findIndex(
    (f) => f && f.startsWith("---") && f.toLowerCase().includes("adobe acrobat"),
  );
  const pre = acrobatIdx === -1 ? strs : strs.slice(0, acrobatIdx);
  const acrobat = acrobatIdx === -1 ? [] : strs.slice(acrobatIdx + 1);

  const main: string[] = [];
  const notScored: string[] = [];
  const signals: TechnicalGroup[] = [];
  let current: TechnicalGroup | null = null;
  let signalCount = 0;

  for (const f of pre) {
    if (!f) continue;
    if (f.startsWith("---")) {
      const heading = f
        .replace(/^-{3}\s*/, "")
        .replace(/\s*-{3}$/, "")
        .trim();
      current = { heading, items: [] };
      signals.push(current);
    } else if (f.startsWith("  ")) {
      const item = f.replace(/^\s+/, "");
      if (!current) {
        current = { heading: "", items: [] };
        signals.push(current);
      }
      current.items.push(item);
      signalCount++;
    } else if (isNotScoredFinding(f)) {
      notScored.push(f);
      // Its "How to fix (optional)" line belongs with it, not with the
      // scored findings — captured by the guidance check on the next pass.
    } else if (notScored.length > 0 && /^how to fix \(optional\)/i.test(f)) {
      notScored.push(f);
    } else {
      main.push(f);
    }
  }

  return { main, signals, signalCount, acrobat, notScored };
}
