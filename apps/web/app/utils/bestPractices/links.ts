/**
 * Where a reader goes to check the practice against the standard itself.
 *
 * Every URL leaves here through safeHttpUrl. On /report/[id] the surrounding
 * data is attacker-controlled stored JSON, and a link is the one thing on the
 * page a reader is invited to click.
 */
import { MATTERHORN_CHECKPOINTS, MATTERHORN_PROTOCOL_URL } from "~/data/matterhorn";
import { safeHttpUrl } from "@file-audit/shared";
import type { BestPractice, BestPracticeLink } from "./types";

/** W3C techniques are filed by their letter prefix: G=general, PDF=pdf,
 *  H=html, F=failures. Only G and PDF are cited by this catalog. */
const TECHNIQUE_DIR: Record<string, string> = {
  G: "general",
  PDF: "pdf",
  H: "html",
  F: "failures",
};

export function matterhornLink(id: string): BestPracticeLink | null {
  const cp = MATTERHORN_CHECKPOINTS.find((c) => c.id === id);
  if (!cp) return null;
  return { label: `Matterhorn ${cp.id} — ${cp.name}`, url: MATTERHORN_PROTOCOL_URL };
}

export function techniqueLink(code: string): BestPracticeLink {
  const prefix = /^[A-Z]+/.exec(code)?.[0] ?? "G";
  const dir = TECHNIQUE_DIR[prefix] ?? "general";
  return {
    label: `WCAG technique ${code}`,
    url: `https://www.w3.org/WAI/WCAG22/Techniques/${dir}/${code}`,
  };
}

export function understandingLink(
  slug: string,
  label: string,
  understandingUrl: (s: string) => string,
): BestPracticeLink | null {
  if (!slug) return null;
  return { label, url: understandingUrl(slug) };
}

/** Drop anything that is not a plain http(s) address. */
export function safeLinks(links: BestPracticeLink[]): BestPracticeLink[] {
  return links.map((l) => ({ ...l, url: safeHttpUrl(l.url) ?? "" })).filter((l) => l.url !== "");
}

/** Everything a row links to, resolved and guarded in ONE place.
 *
 *  Three sources (spec §4): the practice's own static links (Matterhorn,
 *  W3C techniques), its `wcagSlugs` — resolvable only by a caller who can
 *  reach useWcag(), which this module-scope catalog cannot — and the
 *  vendor documentation the report's own category already carries
 *  (`CategoryResult.helpLinks`, attached per row by evaluateBestPractices).
 *
 *  Both renderers call this. BestPracticesSection.vue and printablePlan.ts
 *  used to concatenate and guard independently; one drifted from the other
 *  (the category links never reached either). Now they cannot.
 *
 *  Every URL leaves through safeLinks — /report/[id]'s data is stored JSON,
 *  and helpLinks on a forged payload are attacker-controlled. Duplicates are
 *  collapsed by label+URL, not URL alone: every Matterhorn checkpoint shares
 *  MATTERHORN_PROTOCOL_URL, so two checkpoints on one practice are two links. */
export interface RowLinkSource {
  practice: Pick<BestPractice, "links" | "wcagSlugs">;
  categoryLinks?: BestPracticeLink[];
}

/** The Understanding base for the LEGAL standard. Deliberately fixed at 2.1
 *  rather than following WCAG.VERSION: see resolveRowLinks. */
const WCAG21_UNDERSTANDING = "https://www.w3.org/WAI/WCAG21/Understanding/";

export function resolveRowLinks(
  row: RowLinkSource,
  understandingUrl?: (slug: string) => string,
): BestPracticeLink[] {
  // Absent resolver (some tests) → the wcag half is skipped entirely rather
  // than rendering a broken href; nothing else is affected.
  // WCAG 2.1, NOT the runtime version. These rows argue about the LEGAL
  // standard — "Level A and AA are what ADA Title II and the IITAA name" —
  // and a label reading "WCAG 2.4.4 … Level A" that opens a /WCAG22/ page
  // invites the obvious question about which version the tool is actually
  // talking about. The runtime `understandingUrl` follows WCAG.VERSION (2.2,
  // the superset this tool tests against), which is right everywhere else and
  // wrong here. Standing rule, 2026-08-31: name a criterion, link the rule —
  // and link the version the copy names.
  const wcagLinks = (row.practice.wcagSlugs ?? []).map((s) => ({
    label: s.label,
    url: `${WCAG21_UNDERSTANDING}${s.slug}.html`,
  }));
  void understandingUrl;
  // Dedupe by CRITERION as well as by exact label+url: a category's own help
  // links often name the same criterion in different words ("WCAG 2.4.4: Link
  // Purpose (In Context)" beside "WCAG 2.4.4: Link Purpose (In Context) —
  // Level A"), which rendered the same rule twice in one Read more list.
  const seen = new Set<string>();
  const seenCriteria = new Set<string>();
  return safeLinks([...row.practice.links, ...wcagLinks, ...(row.categoryLinks ?? [])]).filter(
    (l) => {
      const key = `${l.label}|${l.url}`;
      if (seen.has(key)) return false;
      const sc = /\bWCAG (\d\.\d\.\d+)/.exec(l.label)?.[1];
      if (sc) {
        if (seenCriteria.has(sc)) return false;
        seenCriteria.add(sc);
      }
      seen.add(key);
      return true;
    },
  );
}
