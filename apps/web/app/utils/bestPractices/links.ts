/**
 * Where a reader goes to check the practice against the standard itself.
 *
 * Every URL leaves here through safeHttpUrl. On /report/[id] the surrounding
 * data is attacker-controlled stored JSON, and a link is the one thing on the
 * page a reader is invited to click.
 */
import { MATTERHORN_CHECKPOINTS, MATTERHORN_PROTOCOL_URL } from "~/data/matterhorn";
import { safeHttpUrl } from "@file-audit/shared";
import type { BestPracticeLink } from "./types";

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
