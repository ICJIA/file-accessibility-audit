/**
 * Shortens a landing-page announcement to its opening sentences.
 *
 * Announcements are written once, at full length, and read in two places:
 * the /announcements archive shows every entry whole, and the home-page
 * banner shows only the newest one. Because the banner sits above the drop
 * zone, a 900-character entry pushed the tool itself off the first screen —
 * so the banner shows the opening of the entry and links through.
 *
 * The cut is always at a sentence boundary. A cut mid-sentence reads as a
 * rendering fault rather than an editorial choice, and there is nowhere to
 * put an ellipsis that doesn't collide with the entry's own punctuation.
 * The consequence is deliberate: a single 500-character sentence is shown
 * whole, because there is no earlier boundary to cut at. Fix that by writing
 * shorter opening sentences, not by cutting words.
 */

import { ANNOUNCEMENT_BANNER_SENTENCES } from "../../../../audit.config";

export interface AnnouncementSummary {
  /** The opening sentences, or the whole text when it is already short. */
  text: string;
  /** True when text was cut — the banner shows its "read the full update" link. */
  truncated: boolean;
}

/**
 * A sentence ends at `.`, `!` or `?` — plus any closing quotes or brackets
 * that belong to it — followed by whitespace and then something that can
 * START a sentence.
 *
 * Requiring the whitespace is what keeps version numbers intact: "WCAG 2.2"
 * and "PDF/UA-1 (ISO 14289-1)" have no space after the dot, so they are never
 * boundaries. Requiring a sentence-starting character on the other side is
 * what keeps "…the audit ran. it then…" from splitting on a lowercase
 * continuation, which in practice means an abbreviation was misread.
 */
const SENTENCE_END = /[.!?]["'”’)\]]*(?=\s)/g;
const SENTENCE_START = /[A-Z0-9“"‘(]/;

/** Splits text into sentences, preserving each one's own punctuation. */
export function splitSentences(text: string): string[] {
  const source = String(text ?? "");
  const sentences: string[] = [];
  let start = 0;

  SENTENCE_END.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_END.exec(source)) !== null) {
    const end = match.index + match[0].length;
    // What follows the whitespace decides whether this is really a boundary.
    const next = source.slice(end).match(/^\s+(\S)/);
    if (!next) break; // trailing whitespace only — the text ends here
    if (!SENTENCE_START.test(next[1]!)) continue; // lowercase: not a boundary

    const sentence = source.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
  }

  const tail = source.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

/**
 * Returns the opening `maxSentences` of an announcement, and whether anything
 * was left behind. Never returns an empty summary for non-empty input: below
 * one sentence there is nothing to show and the banner would look broken.
 */
export function summarizeAnnouncement(
  text: string,
  maxSentences: number = ANNOUNCEMENT_BANNER_SENTENCES,
): AnnouncementSummary {
  const source = String(text ?? "").trim();
  const limit = Math.max(1, Math.floor(maxSentences));
  const sentences = splitSentences(source);

  if (sentences.length <= limit) return { text: source, truncated: false };
  return { text: sentences.slice(0, limit).join(" "), truncated: true };
}
