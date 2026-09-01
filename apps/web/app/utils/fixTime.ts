/**
 * Honest per-step fix-time estimates for the Action Plan.
 *
 * The point is to correct a costly misperception: authors assume accessibility
 * fixes take forever, when most are minutes of clicking. Three rules keep the
 * numbers honest rather than another claim to defend:
 *
 * 1. COUNT-DRIVEN — every per-item estimate multiplies a small per-item time
 *    by the count the analyzer reported for THIS document, parsed from the
 *    category's own findings text. No parseable count → no estimate (which
 *    also makes old stored payloads with different phrasing safe: they simply
 *    show no chip). Advisory/note/signal lines never feed a count — they are
 *    not scored work.
 * 2. FORMAT-AWARE — Office fixes are genuinely fast in the source app. PDF
 *    estimates are limited to mechanical Acrobat fixes (title/language,
 *    bookmarks, applying alt text); structural tag surgery gets no number,
 *    because "5 minutes" on an untagged PDF would be the estimate that
 *    destroys trust in all the others.
 * 3. NO NUMBERS ON JUDGMENT — writing good alt text is thinking time, so its
 *    estimate covers only the applying, is labeled that way, and can never
 *    enter a plan total (maxMinutes: null).
 *
 * Totals are upper bounds and round UP to the next 5 minutes (a 5-minute sum
 * says "under 10" — "under 5" would be the one direction an estimate must not
 * err). A plan gets a total only when EVERY step carries a summable estimate;
 * a partial sum presented as the total would overclaim.
 */

export interface FixTimeEstimate {
  /** Chip text, e.g. "~4 min". */
  label: string;
  /** Upper bound for the plan total; null = honest but unsummable (apply-only). */
  maxMinutes: number | null;
  /** Qualifier rendered beside the step body, e.g. the alt-text writing caveat. */
  note?: string;
}

const ALT_NOTE = "to apply the text — writing good alt text is the real work";

/** Lines that never feed a count: advisories/notes (not scored work) and
 *  indented evidence/signal lines (per-item detail under a counted line). */
function countableLines(findings: string[]): string[] {
  return findings.filter(
    (f) =>
      !f.startsWith("  ") &&
      !f.startsWith("Advisory —") &&
      !f.startsWith("Note —") &&
      !f.startsWith("PDF/UA only —"),
  );
}

function sumMatches(lines: string[], patterns: RegExp[]): number {
  let total = 0;
  for (const line of lines) {
    for (const re of patterns) {
      const m = re.exec(line);
      if (m) total += Number(m[1]);
    }
  }
  return total;
}

/** Missing alt count: prefer the explicit missing line; else derive it from
 *  the "X of Y image(s) have alt/alternative text" coverage line (PDF). */
function missingAltCount(lines: string[]): number {
  const explicit = sumMatches(lines, [/(\d+) image\(s\) are missing alt text/]);
  if (explicit > 0) return explicit;
  for (const line of lines) {
    const m = /(\d+) of (\d+) (?:meaningful )?image\(s\) have alt(?:ernative)? text/.exec(line);
    if (m) return Number(m[2]) - Number(m[1]);
  }
  return 0;
}

interface PerItemSpec {
  kind: "perItem";
  seconds: number;
  floorMinutes: number;
  count: (lines: string[]) => number;
  applyOnly?: boolean;
}
interface FlatSpec {
  kind: "flat";
  minutes: number;
}
type Spec = PerItemSpec | FlatSpec;

const SPECS: Record<string, Spec> = {
  title_language: { kind: "flat", minutes: 2 },
  bookmarks: { kind: "flat", minutes: 5 },
  heading_structure: {
    kind: "perItem",
    seconds: 30,
    floorMinutes: 2,
    count: (l) =>
      sumMatches(l, [
        /(\d+) paragraph\(s\) are formatted to look like headings/,
        /(\d+) Heading-styled paragraph\(s\) contain no text/,
      ]),
  },
  list_structure: {
    kind: "perItem",
    seconds: 20,
    floorMinutes: 2,
    count: (l) => sumMatches(l, [/(\d+) paragraph\(s\) use typed bullets or numbers/]),
  },
  color_contrast: {
    kind: "perItem",
    seconds: 60,
    floorMinutes: 2,
    count: (l) => sumMatches(l, [/(\d+) below the WCAG (?:contrast )?minimum/]),
  },
  table_markup: {
    kind: "perItem",
    seconds: 60,
    floorMinutes: 1,
    count: (l) => sumMatches(l, [/(\d+) (?:data )?table\(s\) have no header row/]),
  },
  link_quality: {
    kind: "perItem",
    seconds: 30,
    floorMinutes: 1,
    count: (l) => sumMatches(l, [/(\d+) link\(s\) have no link text/]),
  },
  alt_text: {
    kind: "perItem",
    seconds: 60,
    floorMinutes: 1,
    count: missingAltCount,
    applyOnly: true,
  },
};

/** PDF steps that are mechanical in Acrobat — everything else is tag surgery
 *  whose duration depends on the document's history, not its counts. */
const PDF_ESTIMABLE = new Set(["title_language", "bookmarks", "alt_text"]);

export function estimateFixTime(
  categoryId: string,
  findings: string[],
  fileType: string | null | undefined,
): FixTimeEstimate | null {
  const spec = SPECS[categoryId];
  if (!spec) return null;
  if (fileType === "pdf" && !PDF_ESTIMABLE.has(categoryId)) return null;

  if (spec.kind === "flat") return { label: `~${spec.minutes} min`, maxMinutes: spec.minutes };

  const count = spec.count(countableLines(findings));
  if (count <= 0) return null;
  const minutes = Math.max(spec.floorMinutes, Math.ceil((count * spec.seconds) / 60));
  if (spec.applyOnly) return { label: `~${minutes} min`, maxMinutes: null, note: ALT_NOTE };
  return { label: `~${minutes} min`, maxMinutes: minutes };
}

/** Plan-wide total — only when every step carries a summable estimate. */
export function planTimeTotal(
  steps: Array<{ estimate?: FixTimeEstimate | null }>,
): { label: string } | null {
  if (!steps.length) return null;
  let sum = 0;
  for (const s of steps) {
    if (!s.estimate || s.estimate.maxMinutes === null) return null;
    sum += s.estimate.maxMinutes;
  }
  const bound = (Math.floor(sum / 5) + 1) * 5;
  return { label: `typically under ${bound} minutes` };
}
