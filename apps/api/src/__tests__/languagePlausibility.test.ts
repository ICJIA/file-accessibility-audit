/**
 * The declared-language plausibility check (v1.128.0).
 *
 * A syllabus published as a "100% accessible" reference document declared
 * /Lang FR on unmistakably English text — its Word source was correct, and
 * the export promoted one French sentence's language to the whole file.
 * veraPDF passes such a document (it checks only that a tag exists and is
 * well-formed) and so did this checker.
 *
 * The detector makes a claim about a document's CONTENT, so these tests are
 * mostly about its silence: it must stay quiet on short text, on languages
 * it cannot read, on ambiguity, and above all on a correct document that
 * happens to quote a foreign passage.
 */
import { describe, it, expect } from "vitest";
import { detectLanguageMismatch, primarySubtag } from "@file-audit/analyzer/languagePlausibility";

const ENGLISH = `The department publishes this course syllabus for students who are enrolled in the
introductory physics sequence and for anyone who is considering the course. The text explains what
the class will cover, how the work is graded, and where to find help when a problem set is
difficult. Students should read it before the first meeting. The instructor holds office hours
twice a week and answers questions by email within two working days.`;

const FRENCH = `Ce document présente le programme du cours de physique pour les étudiants qui sont
inscrits cette année et pour toutes les personnes qui envisagent de suivre le cours. Le texte
explique ce que la classe va couvrir, comment le travail est évalué, et où trouver de l'aide quand
un exercice est difficile. Les étudiants doivent le lire avant la première séance de cours.`;

describe("primarySubtag", () => {
  it("takes the primary subtag, lowercased", () => {
    expect(primarySubtag("fr-FR")).toBe("fr");
    expect(primarySubtag("EN")).toBe("en");
    expect(primarySubtag("en_US")).toBe("en");
  });
  it("returns null for something unusable", () => {
    expect(primarySubtag("")).toBeNull();
    expect(primarySubtag(null)).toBeNull();
    // A language NAME is not a tag — no subtag, so no opinion (and
    // isPlausibleLanguageTag rejects it upstream anyway).
    expect(primarySubtag("english")).toBeNull();
  });
});

describe("detectLanguageMismatch — fires only on overwhelming evidence", () => {
  it("catches the real case: English prose declared French", () => {
    const m = detectLanguageMismatch(ENGLISH, "fr-FR");
    expect(m).not.toBeNull();
    expect(m!.declared).toBe("fr");
    expect(m!.detected).toBe("en");
    expect(m!.detectedHits).toBeGreaterThan(m!.declaredHits * 4);
  });

  it("catches it the other way round too: French prose declared English", () => {
    const m = detectLanguageMismatch(FRENCH, "en-US");
    expect(m?.detected).toBe("fr");
  });

  it("stays silent when the declaration is right", () => {
    expect(detectLanguageMismatch(ENGLISH, "en-US")).toBeNull();
    expect(detectLanguageMismatch(FRENCH, "fr-FR")).toBeNull();
  });
});

describe("the guards — silence in every case of doubt", () => {
  it("says nothing about text too short to judge", () => {
    expect(detectLanguageMismatch("The quick brown fox jumps over the lazy dog.", "fr")).toBeNull();
  });

  it("never accuses a language it cannot read", () => {
    // Swahili is not in the table: no stopwords, so no opinion.
    expect(detectLanguageMismatch(ENGLISH, "sw")).toBeNull();
    expect(detectLanguageMismatch(ENGLISH, "")).toBeNull();
  });

  it("does not accuse a document for quoting a foreign passage", () => {
    // The correctly authored shape: English document, one French sentence.
    const withQuote = ENGLISH + " Ce programme est également disponible en français sur demande.";
    expect(detectLanguageMismatch(withQuote, "en-US")).toBeNull();
  });

  it("stays silent on text with no strong signal either way", () => {
    const numbers = Array.from({ length: 80 }, (_, i) => `item${i} 12.${i}`).join(" ");
    expect(detectLanguageMismatch(numbers, "fr")).toBeNull();
  });
});
