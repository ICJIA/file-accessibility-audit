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

export interface BestPracticeResult {
  status: BestPracticeStatus;
  /** Plain sentences of document-specific evidence. */
  evidence: string[];
  block?: EvidenceBlock;
  /** Both routes, always — the person reading may not be the person who
   *  chose whether to fix the source file or the export. */
  fix?: { source: string; app: string };
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
  /** False when the report has no such category at all. */
  categoryPresent: boolean;
  pageCount: number;
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
  /** "PDF/UA (ISO 14289) clause 7.4 · Matterhorn 14-002" */
  standard?: string;
  links: BestPracticeLink[];
  /** WCAG Understanding pages this practice cites. Resolved at RENDER time,
   *  not here: the Understanding base URL is version-aware and lives in
   *  runtime config behind useWcag(), which a module-scope array cannot call.
   *  BestPracticesSection.vue turns these into links and concatenates them
   *  onto `links`. */
  wcagSlugs?: Array<{ slug: string; label: string }>;
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
): DetectContext {
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
    categoryPresent: cat !== null,
    pageCount: Number.isFinite(pageCount) ? pageCount : 0,
  };
}

/** The first not-scored line containing every needle, or null. Case-insensitive. */
export function matchNotScored(ctx: DetectContext, ...needles: string[]): string | null {
  return findIn(ctx.notScored, needles);
}

/** The first finding ANYWHERE containing every needle, or null. Use for the
 *  POSITIVE lines ("All fonts are embedded…"), which live in `main`. */
export function matchAny(ctx: DetectContext, ...needles: string[]): string | null {
  return findIn(ctx.findings, needles);
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
