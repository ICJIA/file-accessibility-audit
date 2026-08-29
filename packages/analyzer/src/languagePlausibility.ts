/**
 * Does the declared language match the text actually in the document?
 *
 * WHY THIS EXISTS (2026-08-29): a syllabus published as a "100% accessible"
 * reference document declared `/Lang FR` on unmistakably English text. Its
 * Word source was correct — `en-US`, with one genuinely French sentence
 * marked `fr-FR` — and the PDF export promoted that one sentence's language
 * to the whole document. Nothing caught it: veraPDF checks only that a
 * language tag EXISTS and is well-formed, and this checker did the same. But
 * a screen reader with automatic language switching reads the entire English
 * document with French pronunciation, which is WCAG 3.1.1 (Language of Page)
 * failing in the most literal way — the language of the page is declared, and
 * declared wrongly.
 *
 * DESIGN: deliberately hard to trigger. This is a heuristic making a claim
 * about a document's content, so it must be silent whenever there is any
 * honest doubt — a false accusation here is far more damaging than a miss.
 * Four independent guards, all of which must pass:
 *
 *   1. enough words to judge at all (a caption or a cover page cannot be),
 *   2. the declared language must be one this table can actually recognise
 *      (never accuse a language we cannot read),
 *   3. the winning language must clear an absolute evidence floor, and
 *   4. it must beat BOTH the declared language and the runner-up by a wide
 *      margin — the runner-up test is what keeps Spanish/Portuguese/Italian,
 *      which share many function words, from accusing each other.
 */

/** Function words that are common in one language and rare in the others.
 *  Short, closed-class, and deliberately not exhaustive — this is a signal,
 *  not a language identifier. */
const STOPWORDS: Record<string, string[]> = {
  en: [
    "the",
    "and",
    "of",
    "to",
    "in",
    "is",
    "for",
    "with",
    "that",
    "this",
    "are",
    "be",
    "on",
    "by",
    "from",
    "as",
    "it",
    "not",
    "will",
    "have",
    "which",
    "or",
    "at",
    "an",
  ],
  fr: [
    "le",
    "la",
    "les",
    "de",
    "des",
    "du",
    "et",
    "est",
    "une",
    "un",
    "dans",
    "pour",
    "avec",
    "que",
    "qui",
    "sur",
    "ce",
    "cette",
    "sont",
    "par",
    "aux",
    "plus",
    "mais",
    "son",
  ],
  es: [
    "el",
    "la",
    "los",
    "las",
    "del",
    "y",
    "es",
    "en",
    "para",
    "con",
    "que",
    "por",
    "un",
    "una",
    "se",
    "su",
    "como",
    "más",
    "este",
    "pero",
    "son",
    "sus",
    "al",
    "lo",
  ],
  de: [
    "der",
    "die",
    "das",
    "und",
    "ist",
    "den",
    "von",
    "zu",
    "mit",
    "für",
    "im",
    "auf",
    "dem",
    "ein",
    "eine",
    "nicht",
    "sich",
    "des",
    "als",
    "auch",
    "werden",
    "bei",
    "oder",
    "aus",
  ],
  it: [
    "il",
    "la",
    "le",
    "di",
    "del",
    "della",
    "è",
    "un",
    "una",
    "per",
    "con",
    "che",
    "non",
    "sono",
    "nel",
    "alla",
    "dei",
    "questo",
    "come",
    "anche",
    "più",
    "gli",
    "nella",
    "da",
  ],
  pt: [
    "os",
    "as",
    "do",
    "da",
    "é",
    "um",
    "uma",
    "para",
    "com",
    "que",
    "não",
    "em",
    "no",
    "na",
    "dos",
    "como",
    "mais",
    "seu",
    "sua",
    "pelo",
    "pela",
    "das",
    "ao",
    "isso",
  ],
  nl: [
    "het",
    "een",
    "en",
    "van",
    "is",
    "in",
    "op",
    "met",
    "voor",
    "dat",
    "die",
    "te",
    "niet",
    "zijn",
    "aan",
    "door",
    "als",
    "ook",
    "worden",
    "bij",
    "naar",
    "om",
    "maar",
    "deze",
  ],
};

/** Below this many words the ratios are noise, whatever they say. */
const MIN_WORDS = 60;
/** The winner must clear this many hits outright. */
const MIN_WINNER_HITS = 10;
/** ...and beat the declared language by this factor. */
const MIN_MARGIN_OVER_DECLARED = 4;
/** ...and the runner-up by this factor (guards the Romance-language overlap). */
const MIN_MARGIN_OVER_RUNNER_UP = 1.6;

export interface LanguageMismatch {
  /** The primary subtag actually declared, lowercased ("fr" from "fr-FR"). */
  declared: string;
  /** The language the text looks like. */
  detected: string;
  declaredHits: number;
  detectedHits: number;
  wordCount: number;
}

/** The primary subtag of a BCP-47-ish tag, lowercased. `null` when unusable. */
export function primarySubtag(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const m = /^([A-Za-z]{2,3})(?:[-_]|$)/.exec(tag.trim());
  return m ? m[1]!.toLowerCase() : null;
}

/**
 * Returns a mismatch ONLY when the evidence is overwhelming; `null` in every
 * other case, including every case of doubt.
 */
export function detectLanguageMismatch(
  text: string,
  declaredTag: string | null | undefined,
): LanguageMismatch | null {
  const declared = primarySubtag(declaredTag);
  // Guard 2: never accuse a language this table cannot recognise.
  if (!declared || !STOPWORDS[declared]) return null;

  const words = text
    .toLowerCase()
    .split(/[^\p{L}']+/u)
    .filter((w) => w.length > 0);
  // Guard 1: enough text to judge.
  if (words.length < MIN_WORDS) return null;

  const counts: Record<string, number> = {};
  for (const [lang, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    counts[lang] = words.reduce((n, w) => (set.has(w) ? n + 1 : n), 0);
  }

  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [winner, winnerHits] = ranked[0]!;
  const runnerUpHits = ranked[1]?.[1] ?? 0;
  const declaredHits = counts[declared] ?? 0;

  if (winner === declared) return null;
  // Guard 3: absolute evidence floor.
  if (winnerHits < MIN_WINNER_HITS) return null;
  // Guard 4: wide margin over BOTH the declared language and the runner-up.
  if (winnerHits < declaredHits * MIN_MARGIN_OVER_DECLARED) return null;
  if (winnerHits < runnerUpHits * MIN_MARGIN_OVER_RUNNER_UP) return null;

  return {
    declared,
    detected: winner,
    declaredHits,
    detectedHits: winnerHits,
    wordCount: words.length,
  };
}

/** Human-readable names for the languages this check can recognise. */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
};
