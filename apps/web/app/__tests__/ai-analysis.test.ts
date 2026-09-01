import "./test-helpers";
import { describe, it, expect } from "vitest";
import { buildAiAnalysis } from "../composables/useReportExport";

function baseResult(overrides: any = {}) {
  return {
    filename: "sample.pdf",
    pageCount: 12,
    overallScore: 58,
    grade: "F",
    isScanned: false,
    executiveSummary: "Document has several accessibility gaps.",
    categories: [
      {
        id: "text_extractability",
        label: "Text Extractability",
        score: 90,
        grade: "A",
        severity: "Pass",
        findings: ["Text is selectable on all pages."],
        explanation: "Checks whether the PDF exposes real text.",
      },
      {
        id: "alt_text",
        label: "Alt Text",
        score: 20,
        grade: "F",
        severity: "Critical",
        findings: ["3 images missing alt text", "1 decorative image not marked as artifact"],
        explanation: "Ensures non-decorative images have alt text.",
      },
      {
        id: "heading_structure",
        label: "Heading Structure",
        score: 55,
        grade: "D",
        severity: "Moderate",
        findings: ["No H1 tag found"],
        explanation: "Checks heading hierarchy.",
      },
      {
        id: "form_accessibility",
        label: "Form Accessibility",
        score: null,
        grade: null,
        severity: null,
        findings: ["No form fields detected"],
        explanation: "Checks form field labels.",
      },
    ],
    warnings: [],
    ...overrides,
  };
}

describe("buildAiAnalysis", () => {
  it("includes filename, page count, score, grade, and verdict", () => {
    const out = buildAiAnalysis(baseResult());
    expect(out).toContain("sample.pdf");
    expect(out).toContain("Pages: 12");
    expect(out).toContain("Strict score (WCAG / IITAA §E205.4): 58/100 (F)");
    expect(out).toContain("Verdict: Not accessible");
  });

  it("asks the LLM to verify the PDF is attached and request it if missing", () => {
    const out = buildAiAnalysis(baseResult());
    expect(out).toContain("attached to this conversation");
    expect(out).toContain("ask me to upload it");
    expect(out).toContain("sample.pdf");
  });

  it("reports Accessible verdict for grade A and B", () => {
    const outA = buildAiAnalysis(baseResult({ grade: "A", overallScore: 95 }));
    expect(outA).toContain("Verdict: Accessible");
    const outB = buildAiAnalysis(baseResult({ grade: "B", overallScore: 82 }));
    expect(outB).toContain("Verdict: Accessible");
  });

  it("emits only the Strict score header (v1.21+: Practical retired)", () => {
    const out = buildAiAnalysis(
      baseResult({
        scoreProfiles: {
          strict: {
            label: "Strict semantic score",
            overallScore: 66,
            grade: "D",
            executiveSummary: "Strict summary",
          },
          remediation: {
            label: "Practical readiness score (alias)",
            overallScore: 66,
            grade: "D",
            executiveSummary: "Strict summary",
          },
        },
      }),
    );

    expect(out).not.toContain("Practical score (WCAG + PDF/UA)");
    expect(out).toContain("Strict");
  });

  it("counts critical and moderate categories", () => {
    const out = buildAiAnalysis(baseResult());
    expect(out).toContain("Critical issues: 1");
    expect(out).toContain("Moderate issues: 1");
  });

  it("lists only failing categories (omits passing and N/A)", () => {
    const out = buildAiAnalysis(baseResult());
    expect(out).toContain("## Failing categories (2 to fix)");
    expect(out).toContain("Alt Text");
    expect(out).toContain("Heading Structure");
    // Passing and N/A categories must not appear as headings or category entries
    expect(out).not.toContain("## What's working");
    expect(out).not.toContain("## What's not working");
    expect(out).not.toContain("Text Extractability");
    expect(out).not.toContain("Not applicable");
    expect(out).not.toContain("Form Accessibility");
  });

  it("includes findings for failing categories", () => {
    const out = buildAiAnalysis(baseResult());
    expect(out).toContain("3 images missing alt text");
    expect(out).toContain("No H1 tag found");
  });

  it("includes WCAG references for failing categories", () => {
    const out = buildAiAnalysis(baseResult());
    // alt_text maps to WCAG 1.1.1; default version is 2.1 (since 2026-08-31).
    // This fixture carries no conformance verdict, so it takes the FALLBACK
    // branch — which must never claim the listed criteria are the failures.
    expect(out).toContain("WCAG 2.1 criteria this category covers"); // the cited criteria are 2.1-pure
    expect(out).toMatch(/1\.1\.1/);
    expect(out).not.toContain("criteria this category fails");
  });

  it("short-circuits to a compact message when nothing fails", () => {
    const out = buildAiAnalysis(
      baseResult({
        grade: "A",
        overallScore: 96,
        categories: [
          {
            id: "text_extractability",
            label: "Text Extractability",
            score: 98,
            grade: "A",
            severity: "Pass",
            findings: [],
            explanation: "",
          },
          {
            id: "alt_text",
            label: "Alt Text",
            score: 92,
            grade: "A",
            severity: "Pass",
            findings: [],
            explanation: "",
          },
          {
            id: "form_accessibility",
            label: "Form Accessibility",
            score: null,
            grade: null,
            severity: null,
            findings: ["No forms"],
            explanation: "",
          },
        ],
      }),
    );
    expect(out).toContain("No WCAG 2.1 remediation is needed");
    expect(out).toContain("Scored categories passed: 2");
    // No detailed sections for a clean document
    expect(out).not.toContain("## Failing categories");
    expect(out).not.toContain("## What I'd like from you");
    expect(out).not.toContain("Findings");
    expect(out).not.toContain("WCAG 2.1 references");
  });

  it("includes the six remediation questions, ending with the standards guardrail", () => {
    const out = buildAiAnalysis(baseResult());
    expect(out).toContain("## What I'd like from you");
    expect(out).toMatch(/1\. .+/);
    // #5 states the separation STRUCTURALLY (keep optional work out of the
    // prioritised list); #6 states the principle behind it. Both are needed:
    // an LLM given only the principle still tends to merge the two over a
    // long answer, which is the whole risk of carrying best practice here.
    expect(out).toMatch(/5\. Do NOT put anything from the "Also worth doing"/);
    expect(out).toMatch(/6\. Keep the two standards straight/);
    expect(out).toMatch(/never present it as legally required/);
  });

  describe("extra credit — best practice and PDF/UA, fenced off from the legal section", () => {
    const withRawUrls = (extra: any = {}) =>
      baseResult({
        fileType: "pdf",
        categories: [
          ...baseResult().categories,
          {
            id: "link_quality",
            label: "Link Quality",
            score: 100,
            grade: "A",
            severity: "No issues found",
            findings: ["4 links use the raw URL as their visible text."],
            explanation: "Checks link text.",
          },
        ],
        ...extra,
      });

    it("lists a not-met best practice, labelled as neither scored nor required", () => {
      const out = buildAiAnalysis(withRawUrls());
      expect(out).toContain(
        "Also worth doing — best practice, NOT scored and NOT required by WCAG 2.1",
      );
      expect(out).toContain("Link text is not a raw URL");
      expect(out).toMatch(/4 links in this document use the raw web address/);
      // It must never be presented as a failure or as law.
      const legalBlock = out.split("## Also worth doing")[0]!;
      expect(legalBlock).not.toContain("Link text is not a raw URL");
    });

    it("omits MET rows — a remediation prompt only wants what is left to do", () => {
      // The fixture must actually PRODUCE a met row, or this proves nothing:
      // "all fonts are embedded" on text_extractability is font-embedding's
      // MET witness. Sabotage check: widen the filter to include "met" and
      // the "Fonts are embedded" assertion below fails.
      const out = buildAiAnalysis(
        withRawUrls({
          categories: [
            {
              id: "text_extractability",
              label: "Text Extractability",
              score: 90,
              grade: "A",
              severity: "Pass",
              findings: ["Text is selectable on all pages.", "All fonts are embedded."],
              explanation: "Checks whether the PDF exposes real text.",
            },
            {
              id: "alt_text",
              label: "Alt Text",
              score: 20,
              grade: "F",
              severity: "Critical",
              findings: ["3 images missing alt text"],
              explanation: "Ensures non-decorative images have alt text.",
            },
            {
              id: "link_quality",
              label: "Link Quality",
              score: 100,
              grade: "A",
              severity: "No issues found",
              findings: ["4 links use the raw URL as their visible text."],
              explanation: "Checks link text.",
            },
          ],
        }),
      );
      // The not-met row is there...
      expect(out).toContain("Link text is not a raw URL");
      // ...and the met one is not.
      expect(out).not.toContain("Fonts are embedded");
    });

    it("prints the veraPDF verdict only when veraPDF actually ran", () => {
      const ran = buildAiAnalysis(
        withRawUrls({
          pdfUaVerdict: {
            available: true,
            passed: false,
            profile: "PDF/UA-1",
            totalFailureCount: 7,
            distinctRuleCount: 2,
            failures: [
              { ruleId: "7.1-1", clause: "7.1", description: "Content not tagged.", count: 5 },
              { ruleId: "7.2-1", clause: "7.2", description: "Heading nesting.", count: 2 },
            ],
          },
        }),
      );
      expect(ran).toContain(
        "Independent PDF/UA check (veraPDF) — ISO 14289, NOT the legal standard",
      );
      expect(ran).toMatch(/Clause 7\.1 \(7\.1-1\) ×5/);
      expect(ran).toMatch(/7 failure\(s\) across 2 distinct rule\(s\)/);

      // available:false is attached DELIBERATELY (v1.91.0) so a report can
      // disclose the gap. Saying nothing is right; implying a pass is not.
      const didNotRun = buildAiAnalysis(
        withRawUrls({
          pdfUaVerdict: {
            available: false,
            passed: false,
            profile: "PDF/UA-1",
            totalFailureCount: 0,
            failures: [],
          },
        }),
      );
      // Assert on the SECTION HEADING. Instruction #5 quotes this phrase
      // verbatim, so a bare substring check matches the instruction instead
      // of the section and passes no matter what the guard does.
      expect(didNotRun).not.toContain("## Independent PDF/UA check");
      // "Verdict:" is NOT a usable signal here — the File block already
      // carries "- Verdict: Not accessible" for every report.
      expect(didNotRun).not.toContain("machine-checkable conditions");
      expect(didNotRun).not.toContain("PASSED");
    });

    it("still lists optional work when nothing fails WCAG — the synthetic-125 case", () => {
      // A document can pass 2.1 outright and still have real best-practice
      // debt. This branch used to short-circuit to "no remediation needed"
      // while the on-screen report listed items.
      const clean = withRawUrls({
        grade: "A",
        overallScore: 100,
        categories: [
          {
            id: "text_extractability",
            label: "Text Extractability",
            score: 100,
            grade: "A",
            severity: "Pass",
            findings: ["Text is selectable on all pages."],
            explanation: "Checks whether the PDF exposes real text.",
          },
          {
            id: "link_quality",
            label: "Link Quality",
            score: 100,
            grade: "A",
            severity: "No issues found",
            findings: ["4 links use the raw URL as their visible text."],
            explanation: "Checks link text.",
          },
        ],
      });
      const out = buildAiAnalysis(clean);
      expect(out).toContain("No WCAG 2.1 remediation is needed");
      expect(out).toContain("Also worth doing");
      expect(out).toContain("Link text is not a raw URL");
    });

    it("instructs the AI to keep optional work out of the prioritised list", () => {
      const out = buildAiAnalysis(withRawUrls());
      expect(out).toMatch(/Do NOT put anything from the "Also worth doing"/);
      expect(out).toMatch(/label them optional/);
    });
  });

  it("names only the criteria the verdict attributes, not every criterion the category covers", () => {
    // THE BUG (2026-08-31, found on a real Word bio): title_language maps to
    // BOTH 2.4.2 (title) and 3.1.1 (language). A document with no title but a
    // correctly declared `w:lang` fails ONLY 2.4.2 — yet the export printed the
    // whole map under a heading inside "Failing categories", telling the reader
    // a perfectly good language declaration was a Level A failure. This export
    // exists to be pasted into an LLM, so that was an instruction to "fix"
    // correct markup. Sabotage check: restore `getWcagCriteriaStrings(c.id)` as
    // the primary source and the 3.1.1 assertion below fails.
    const r = baseResult({
      categories: [
        {
          id: "title_language",
          label: "Title & Language",
          score: 50,
          severity: "Moderate",
          explanation: "A meaningful title and a declared language are announced on open.",
          findings: ["No document title is set.", "Document language: en-US"],
        },
      ],
      conformance: {
        status: "fail",
        failures: [
          {
            sc: "2.4.2",
            name: "Page Titled",
            level: "A",
            category: "title_language",
            issue: "The document has no title in its properties.",
          },
        ],
        notAssessed: [],
        headline: "1 confirmed failure.",
      },
    } as Parameters<typeof baseResult>[0]);
    const out = buildAiAnalysis(r);

    expect(out).toContain("WCAG 2.1 criteria this category fails");
    expect(out).toMatch(/2\.4\.2 Page Titled \(Level A\)/);
    // The language is DECLARED. It must not be named as a failing criterion.
    expect(out).not.toMatch(/3\.1\.1/);
    expect(out).not.toContain("Language of Page");
    // And the evidence line must not sit under a claim that it is a failure.
    expect(out).not.toMatch(/these are what fails/);
    expect(out).toContain("Document language: en-US");
  });

  it("splits not-scored best-practice lines out of a failing category's findings", () => {
    const r = baseResult({
      categories: [
        {
          id: "alt_text",
          label: "Alt Text on Images",
          score: 0,
          severity: "Critical",
          explanation: "Images need text alternatives.",
          findings: [
            "0 of 3 images have alternative text",
            "PDF/UA only — not scored: 1 non-embedded font(s) may cause garbled text.",
          ],
        },
      ],
    });
    const out = buildAiAnalysis(r);
    expect(out).toMatch(/What the checker reported in this category/);
    expect(out).toMatch(/best practice, NOT scored and NOT required by WCAG 2\.1:/);
    // The not-scored line must appear ONLY under the best-practice header.
    const legalBlock = out.split("Also reported")[0]!;
    expect(legalBlock).not.toContain("non-embedded font");
  });

  it("notes scanned documents", () => {
    const out = buildAiAnalysis(baseResult({ isScanned: true }));
    expect(out).toContain("Scanned document: yes");
  });

  it("includes warnings when present", () => {
    const out = buildAiAnalysis(baseResult({ warnings: ["Metadata missing creation date"] }));
    expect(out).toContain("## Warnings");
    expect(out).toContain("Metadata missing creation date");
  });

  it("titles the analysis by file type and counts slides for pptx", () => {
    const out = buildAiAnalysis(
      baseResult({ filename: "deck.pptx", pageCount: 9, fileType: "pptx" }),
    );
    expect(out).toContain("# PowerPoint Accessibility Audit — For AI Analysis");
    expect(out).toContain("Slides: 9");
    expect(out).toContain("I ran an automated PowerPoint accessibility audit");
    expect(out).toContain("Please verify the PowerPoint file");
    expect(out).toContain("Microsoft PowerPoint itself");
    expect(out).not.toContain("Adobe Acrobat Pro");
  });

  it("counts sheets and uses the Excel fix framing for xlsx", () => {
    const out = buildAiAnalysis(
      baseResult({ filename: "budget.xlsx", pageCount: 4, fileType: "xlsx" }),
    );
    expect(out).toContain("# Excel Accessibility Audit — For AI Analysis");
    expect(out).toContain("Sheets: 4");
    expect(out).toContain("Microsoft Excel itself");
  });

  it("keeps the PDF wording, Pages label, and Acrobat step for pdf", () => {
    const out = buildAiAnalysis(baseResult({ fileType: "pdf" }));
    expect(out).toContain("# PDF Accessibility Audit — For AI Analysis");
    expect(out).toContain("Pages: 12");
    expect(out).toContain("Adobe Acrobat Pro");
  });
});
