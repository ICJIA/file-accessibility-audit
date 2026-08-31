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

export function resolveRowLinks(
  row: RowLinkSource,
  understandingUrl?: (slug: string) => string,
): BestPracticeLink[] {
  // Absent resolver (some tests) → the wcag half is skipped entirely rather
  // than rendering a broken href; nothing else is affected.
  const wcagLinks = understandingUrl
    ? (row.practice.wcagSlugs ?? []).map((s) => ({ label: s.label, url: understandingUrl(s.slug) }))
    : [];
  const seen = new Set<string>();
  return safeLinks([...row.practice.links, ...wcagLinks, ...(row.categoryLinks ?? [])]).filter(
    (l) => {
      const key = `${l.label}|${l.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  );
}
