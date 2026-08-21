import { describe, it, expect } from "vitest";
import { splitSentences, summarizeAnnouncement } from "../utils/announcementSummary";
import { ANNOUNCEMENT_BANNER_SENTENCES, ANNOUNCEMENTS } from "../../../../audit.config";

describe("splitSentences", () => {
  it("splits on ordinary sentence terminators", () => {
    expect(splitSentences("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
  });

  it("keeps a final sentence that has no terminator", () => {
    expect(splitSentences("One. Two")).toEqual(["One.", "Two"]);
  });

  it("never splits a version number", () => {
    // The regression this guards: "WCAG 2.2 AA" and "PDF/UA-1 (ISO 14289-1)"
    // both appear in real announcements. A naive /\./ split turns the first
    // banner sentence into "The audit covers WCAG 2." — which reads as a
    // truncation bug, not an editorial cut.
    const text = "The audit covers WCAG 2.2 Level AA. It also reports PDF/UA-1 results.";
    expect(splitSentences(text)).toEqual([
      "The audit covers WCAG 2.2 Level AA.",
      "It also reports PDF/UA-1 results.",
    ]);
  });

  it("carries a closing curly quote with the sentence it ends", () => {
    // Announcements use typographic quotes heavily — “here”, “fonts not
    // embedded”. The quote must stay attached, or the next sentence starts
    // with an orphaned ” character.
    const text = "It flags a link such as “here”. The rest is unchanged.";
    expect(splitSentences(text)).toEqual([
      "It flags a link such as “here”.",
      "The rest is unchanged.",
    ]);
  });

  it("carries a closing parenthesis with the sentence it ends", () => {
    const text = "Five files at once (the limit was three.) Nothing else changed.";
    expect(splitSentences(text)).toEqual([
      "Five files at once (the limit was three.)",
      "Nothing else changed.",
    ]);
  });

  it("does not split before a lowercase continuation", () => {
    // A period followed by a lowercase word is an abbreviation, not a
    // boundary — splitting there would cut a sentence in half.
    expect(splitSentences("Ends in Inc. then keeps going. Next.")).toEqual([
      "Ends in Inc. then keeps going.",
      "Next.",
    ]);
  });

  it("returns one sentence when there is no terminator at all", () => {
    expect(splitSentences("A single long clause with no full stop")).toHaveLength(1);
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   \n  ")).toEqual([]);
  });

  it("leaves em dashes, semicolons and parentheses inside a sentence alone", () => {
    const text =
      "The comparison now judges only the order of the text, which is what a screen reader reads; out-of-order text (a caption, say) is still flagged — exactly as before.";
    expect(splitSentences(text)).toEqual([text]);
  });
});

describe("summarizeAnnouncement", () => {
  const SIX = "One. Two. Three. Four. Five. Six.";

  it("returns the whole text, untruncated, when it is already short enough", () => {
    const result = summarizeAnnouncement("One. Two.", 4);
    expect(result.text).toBe("One. Two.");
    expect(result.truncated).toBe(false);
  });

  it("returns the whole text when it has exactly the maximum sentences", () => {
    // Boundary case: at the limit nothing is cut, so no "read the full
    // update" link — the link must never promise text that does not exist.
    const result = summarizeAnnouncement("One. Two. Three. Four.", 4);
    expect(result.text).toBe("One. Two. Three. Four.");
    expect(result.truncated).toBe(false);
  });

  it("cuts to the opening sentences and reports that it did", () => {
    const result = summarizeAnnouncement(SIX, 4);
    expect(result.text).toBe("One. Two. Three. Four.");
    expect(result.truncated).toBe(true);
  });

  it("always ends on a complete sentence, never mid-word", () => {
    const result = summarizeAnnouncement(SIX, 2);
    expect(result.text).toBe("One. Two.");
    expect(result.text).toMatch(/[.!?]["'”’)\]]*$/);
  });

  it("shows a single long sentence whole rather than cutting inside it", () => {
    // Documented consequence of cutting only at boundaries: there is no
    // earlier place to stop. The fix is editorial, not mechanical.
    const oneLongSentence = `A ${"very ".repeat(80)}long sentence.`;
    const result = summarizeAnnouncement(oneLongSentence, 4);
    expect(result.text).toBe(oneLongSentence);
    expect(result.truncated).toBe(false);
  });

  it("never returns an empty summary for non-empty input", () => {
    // A zero or negative limit would otherwise render a banner with a badge,
    // a heading and no text at all.
    expect(summarizeAnnouncement(SIX, 0).text).toBe("One.");
    expect(summarizeAnnouncement(SIX, -3).text).toBe("One.");
  });

  it("handles empty input without throwing", () => {
    expect(summarizeAnnouncement("")).toEqual({ text: "", truncated: false });
  });

  it("defaults to the configured banner length", () => {
    const result = summarizeAnnouncement(SIX);
    expect(splitSentences(result.text)).toHaveLength(ANNOUNCEMENT_BANNER_SENTENCES);
  });
});

describe("the real announcements this runs against", () => {
  // Wiring, not literals: whatever text audit.config.ts actually ships must
  // survive the summarizer. A splitter that silently returned the whole entry
  // — or an empty string — would pass every synthetic test above.
  const entries = ANNOUNCEMENTS as ReadonlyArray<{ id: string; text: string }>;

  it("summarizes every shipped entry to a non-empty prefix of its own text", () => {
    for (const entry of entries) {
      const { text } = summarizeAnnouncement(entry.text);
      expect(text.length, entry.id).toBeGreaterThan(0);
      expect(entry.text.startsWith(text), entry.id).toBe(true);
    }
  });

  it("never shows more sentences than configured", () => {
    for (const entry of entries) {
      const { text } = summarizeAnnouncement(entry.text);
      expect(splitSentences(text).length, entry.id).toBeLessThanOrEqual(
        ANNOUNCEMENT_BANNER_SENTENCES,
      );
    }
  });

  it("actually shortens the long entries — the reason the summarizer exists", () => {
    // Deliberately NOT pinned to entries[0]. A release whose announcement is
    // naturally four sentences or fewer is a GOOD announcement, and pinning
    // the newest entry turns writing one into a failing build (it did, on
    // v1.85.0). The regression this guards is that real shipped copy gets
    // shortened at all — so assert it against the longest entry, whichever
    // that is, and require that some entry is long enough to exercise it.
    const longest = [...entries].sort((a, b) => b.text.length - a.text.length)[0]!;
    const { text, truncated } = summarizeAnnouncement(longest.text);
    expect(truncated, longest.id).toBe(true);
    expect(text.length).toBeLessThan(longest.text.length);
  });
});
