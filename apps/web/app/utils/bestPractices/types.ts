/**
 * The Best Practices catalog's foundation: its types, its context builder,
 * and the four matcher primitives every practice is written against.
 *
 * WHY THE CATALOG READS STRINGS. The evidence an author needs is already
 * computed and already in the payload — pdf.ts:808-809 emits the heading
 * tree, the link census names every link, the font census names every font.
 * Reading the findings the analyzer already writes means this feature works
 * on EVERY stored report ever created, with no new payload field and no
 * migration, and it moves no scoring gate.
 *
 * TWO RULES THAT MUST NOT REGRESS.
 *
 * 1. NOTHING HERE MAY THROW. /report/[id] renders stored JSON server-side.
 *    That JSON is attacker-controlled: a forged report whose `findings` is a
 *    string rather than an array 500'd the shared page for an hour in
 *    v1.68.0 while the suite stayed green. Every entry point takes `unknown`
 *    and narrows.
 *
 * 2. SILENCE IS NEVER A PASS. A matcher that finds nothing returns null, and
 *    the practice turns null into NOT CHECKED — never MET. Inferring a
 *    verdict the analyzer never gave is the exact failure that produced the
 *    DoIT dispute, where a correctly-built form was presented as broken.
 */
import { partitionCardFindings, type TechnicalGroup } from "~/utils/findings";
import type { FileType } from "@file-audit/shared";

export type BestPracticeStatus = "met" | "not-met" | "not-applicable" | "not-checked";

export interface BestPracticeLink {
  label: string;
  /** Rendered only after safeHttpUrl — see bestPractices/links.ts. */
  url: string;
}

/** A preformatted evidence block: the heading tree, a list of link texts. */
export interface EvidenceBlock {
  caption: string;
  lines: string[];
}

/**
 * The sentence a row uses when its defect is NOT optional — it already cost
 * the reader points and is waiting in the action plan.
 *
 * A CONSTANT, not prose repeated twelve times, because two things must agree
 * and neither can be allowed to drift: the words the reader sees, and the
 * chip above them. Until v1.148.0 the chip on these rows said NOT APPLICABLE
 * while the sentence beneath it said the opposite — a document with no
 * headings at all showed five amber "NOT APPLICABLE" chips over a heading
 * category scoring 0/Critical with WCAG 1.3.1 failing. The reader's
 * conclusion, entirely reasonably, was that headings did not apply to their
 * document. `evaluateBestPractices` reads this marker to tell the two kinds
 * of "not applicable" apart, and a guard test forbids the literal sentence
 * anywhere outside this constant.
 */
export const SCORED_IN_PLAN =
  "counted in your score — see the action plan above, not this section.";

/**
 * The other sentence, and the other case (v1.148.1, user's ruling).
 *
 * SCORED_IN_PLAN marks a row whose OWN subject is a scored failure — a
 * two-axis table with no /Scope, an empty bookmark outline. Those do not
 * belong in this section at all: "best practices should only be things above
 * and beyond WCAG 2.1; if it is already counted it does not need to be
 * labelled a best practice." evaluateBestPractices drops them, and the action
 * plan is where they live.
 *
 * BLOCKED_BY_PLAN marks the opposite: the practice IS above and beyond — the
 * analyzer says so in its own words about skipped heading levels, "a PDF/UA /
 * best-practice concern, not a WCAG 2.1 failure, so your grade is not
 * affected" — but it could not be judged, because a scored failure got there
 * first. A document with no heading tags has no level order to inspect. Those
 * rows stay, as NOT CHECKED, which is exactly what happened to them.
 */
export const BLOCKED_BY_PLAN =
  "so this could not be checked. That absence is in your action plan above, not this section.";

export interface BestPracticeResult {
  status: BestPracticeStatus;
  /** Plain sentences of document-specific evidence. */
  evidence: string[];
  block?: EvidenceBlock;
  /** Both routes, always — the person reading may not be the person who
   *  chose whether to fix the source file or the export. */
  fix?: { source: string; app: string };
  /** Only meaningful when status is "not-checked" — WHY there is nothing to
   *  report, so a reader is never told "silence is fine" when the check
   *  never ran at all. "silent" = the category was present and the check
   *  ran, but the analyzer had nothing to say (the common case — most
   *  detect()s emit no dedicated positive line, so absence of a finding is
   *  genuinely ambiguous, not evidence of a pass). "not-run" = the whole
   *  category is absent from this report, so the check itself never ran —
   *  there was no silence to interpret. Omitted (undefined) means "silent";
   *  only a categoryAbsent() branch sets "not-run" explicitly. */
  reason?: "silent" | "not-run" | "error" | "blocked";
  // "blocked": the check could not run because a SCORED failure in the same
  // category got in the way (no heading tags at all, so no level order to
  // read). Distinct from "silent" and "not-run" because the reassurance those
  // two carry — nothing is wrong with your document — would be false here.
  // "error": detect() threw and evaluateBestPractices caught it (spec §2:
  // one bad practice must never take down the page — /report/[id] renders
  // stored JSON through SSR). The row is NOT CHECKED; the component shows
  // NEITHER reassurance sentence for it, because neither would be true.
}

export interface DetectContext {
  /** Every finding, narrowed to strings. */
  findings: string[];
  /** The analyzer's not-scored lines (all three prefixes). */
  notScored: string[];
  /** The scored findings — where the POSITIVE evidence lives. */
  main: string[];
  /** The `--- Heading ---` technical-signal groups. */
  signals: TechnicalGroup[];
  fileType: FileType;
  /** The category's own notAssessed flag. */
  notAssessed: boolean;
  /** The category's score, when it has one. Added v1.148.0 for ONE job: a
   *  practice that cannot apply needs to know whether the reason it cannot
   *  apply already cost the reader points. "Your tables have no header cells,
   *  so there is no scope to check" is true either way, but it means
   *  "nothing to do here" on a document scoring 100 and "the missing headers
   *  are already in your plan" on one scoring 45 — and the second was
   *  rendering as a bare NOT APPLICABLE. Null when never assessed. */
  score: number | null;
  /** False when the report has no such category at all. */
  categoryPresent: boolean;
  pageCount: number;
  /** When this payload was analyzed, if known. Live analyses pass nothing
   *  (= now); /report/[id] passes the shared row's createdAt. Consulted by
   *  the era gate in evaluateBestPractices and by any practice whose
   *  evidence lines changed meaning at a known date. Null = unknown. */
  analyzedAt: Date | null;
}

export interface BestPractice {
  /** Stable slug — the test anchor and the DOM `data-practice` value. */
  id: string;
  formats: FileType[];
  /** The CategoryResult this practice reads from. */
  categoryId: string;
  label: string;
  /** What the practice is. */
  description: string;
  /** Who it helps and how, in plain language. */
  why: string;
  /** "PDF/UA (ISO 14289) clause 7.4 · Matterhorn 14-007" */
  standard?: string;
  links: BestPracticeLink[];
  /** WCAG Understanding pages this practice cites. Resolved at RENDER time,
   *  not here: the Understanding base URL is version-aware and lives in
   *  runtime config behind useWcag(), which a module-scope array cannot call.
   *  BestPracticesSection.vue turns these into links and concatenates them
   *  onto `links`. */
  wcagSlugs?: Array<{ slug: string; label: string }>;
  /** ISO date (YYYY-MM-DD) the analyzer began emitting this practice's
   *  advisory. A WITNESS-based MET (census line present, advisory absent) is
   *  only sound for payloads analyzed on or after this date — before it the
   *  analyzer could not have complained, so silence proves nothing. Stored
   *  reports live 365 days and their findings are never re-derived
   *  (regrade.ts), so evaluateBestPractices turns such a MET into NOT
   *  CHECKED. Omit for positive-line METs, which are emitted only on the
   *  clean path and are therefore era-proof. */
  advisorySince?: string;
  detect(ctx: DetectContext): BestPracticeResult;
}

/** Narrow anything to a string array. Never throws: a hostile entry whose
 *  own toString() throws is dropped rather than coerced. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export function buildContext(
  category: unknown,
  fileType: FileType,
  pageCount: number,
  analyzedAt: Date | string | null = null,
): DetectContext {
  const parsed =
    analyzedAt instanceof Date
      ? analyzedAt
      : typeof analyzedAt === "string"
        ? new Date(analyzedAt)
        : null;
  const cat =
    category && typeof category === "object" ? (category as Record<string, unknown>) : null;
  const findings = toStringArray(cat?.findings);
  const parts = partitionCardFindings(findings);
  return {
    findings,
    notScored: parts.notScored,
    main: parts.main,
    signals: parts.signals,
    fileType,
    notAssessed: cat?.notAssessed === true,
    score: typeof cat?.score === "number" ? cat.score : null,
    categoryPresent: cat !== null,
    pageCount: Number.isFinite(pageCount) ? pageCount : 0,
    analyzedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
  };
}

/** The first not-scored line containing every needle, or null. Case-insensitive.
 *
 *  VERSION-BLIND — do not use it to read an advisory. The not-scored
 *  partition is filled by PREFIX, and the prefixes changed under stored
 *  reports that outlive them. Use `matchAdvisory` below. */
export function matchNotScored(ctx: DetectContext, ...needles: string[]): string | null {
  return findIn(ctx.notScored, needles);
}

/** The first finding ANYWHERE containing every needle, or null.
 *
 *  DO NOT USE IN A PRACTICE. `ctx.findings` is the raw, unpartitioned array,
 *  so this also sees indented signal items that quote the DOCUMENT'S own
 *  text — a PDF containing a heading titled "Why documents with no heading
 *  tags fail" made four practices report not-applicable ("This document has
 *  no heading tags") while the Heading Tree three lines above showed
 *  H → H → H. Use `matchMain` for the analyzer's own voice, or
 *  `matchAdvisory` for an advisory. Retained only for the primitive's own
 *  unit tests. */
export function matchAny(ctx: DetectContext, ...needles: string[]): string | null {
  return findIn(ctx.findings, needles);
}

/** An advisory, found in EITHER partition.
 *
 *  WHY THIS EXISTS. `matchNotScored` searches only the not-scored partition,
 *  which `partitionCardFindings` fills by PREFIX. v1.136.0 (2026-08-29)
 *  re-prefixed ~18 advisory strings, and stored reports live 365 days
 *  (audit.config.ts SHARED_REPORTS.EXPIRY_DAYS) without their findings ever
 *  being re-derived — scoring/regrade.ts recomputes score/grade/summary only.
 *  So on an older payload the advisory sits un-prefixed in `main`,
 *  `matchNotScored` misses it, the witness still matches, and a
 *  witness-based MET fabricates a green for a document that plainly has the
 *  defect — with the stored finding rendered verbatim in the card below,
 *  contradicting it. `nested-structure-tree` even printed "nested 1 level
 *  deep", the number that disproves its own status.
 *
 *  Searches `notScored` ∪ `main`, and deliberately NOT `signals`: indented
 *  signal items quote the document's own text (common.ts:426-430 renders
 *  heading titles), which must never be able to forge an advisory.
 *
 *  USE THIS FOR EVERY ADVISORY/DEFECT LOOKUP. `matchNotScored` remains only
 *  for a caller that genuinely needs to know which partition a line landed
 *  in — no practice does. Witness, positive, and not-applicable lookups keep
 *  using `matchMain`: those lines were never prefixed in either era. */
export function matchAdvisory(ctx: DetectContext, ...needles: string[]): string | null {
  return findIn([...ctx.notScored, ...ctx.main], needles);
}

/** The lines `matchAdvisory` searches, for the two practices that need a
 *  REGEX over every advisory rather than one substring match (a per-sheet or
 *  per-duplicate-title line the analyzer pushes once per offender, where
 *  matching only the first would under-report). Same union, same reason,
 *  same deliberate exclusion of `signals`. */
export function advisoryLines(ctx: DetectContext): string[] {
  return [...ctx.notScored, ...ctx.main];
}

/** The first finding in `main` — the analyzer's OWN positive/informational
 *  voice — containing every needle, or null. Unlike `matchAny`, this never
 *  sees a document's own quoted text: `ctx.findings` is the raw,
 *  unpartitioned array, which can include an indented signal item that
 *  interpolates document content (a fake heading's own sample text, a
 *  bookmark title, …). Use this, not `matchAny`, for every
 *  positive/witness/not-applicable lookup — anywhere the caller is reading
 *  what the analyzer itself asserted, not quoting the document. */
export function matchMain(ctx: DetectContext, ...needles: string[]): string | null {
  return findIn(ctx.main, needles);
}

function findIn(haystack: string[], needles: string[]): string | null {
  if (needles.length === 0) return null;
  const lowered = needles.map((n) => n.toLowerCase());
  for (const line of haystack) {
    const l = line.toLowerCase();
    if (lowered.every((n) => l.includes(n))) return line;
  }
  return null;
}

/** A technical-signal group's items, by its `--- Heading ---`. Empty when absent. */
export function signalLines(ctx: DetectContext, headingNeedle: string): string[] {
  const needle = headingNeedle.toLowerCase();
  const group = ctx.signals.find((g) => (g.heading ?? "").toLowerCase().includes(needle));
  return group ? [...group.items] : [];
}

/** The first integer in a finding, thousands separators tolerated. Null
 *  rather than a guess — a count this cannot read must render countless. */
export function firstNumber(text: string | null): number | null {
  if (!text) return null;
  const m = /(\d[\d,]*)/.exec(text);
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
