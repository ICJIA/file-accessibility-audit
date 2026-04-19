# Scoring Reconciliation: Strict vs. Practical Profiles

## Purpose

This note explains why this audit tool can disagree with remediation vendors or Acrobat/PAC-style tools on the same PDF, especially when a file is "improved" but still lacks full semantic structure. It also clarifies exactly which profile speaks for ICJIA and which does not.

## Attribution — the most important thing on this page

- **Strict = ICJIA's rubric.** Anchored to WCAG 2.1 Level AA and Illinois IITAA §E205.4 for non-web documents. It is the Illinois agency publication and legal-accessibility-review lens. When anyone asks "what does ICJIA say about this PDF," the answer is the Strict score.
- **Practical = a developer-introduced extension.** A developer wanted to take ICJIA's rubric and add PDF/UA-oriented checks to it. Practical is therefore a superset of Strict's perspective that also scores PDF/UA signals. **It is not ICJIA's rubric and it is not an Illinois accessibility-law signal.** PDF/UA is a technical PDF standard, not an Illinois legal requirement for final documents. IITAA §504.2.2 references PDF/UA only for authoring-tool export capability.

The config tags each profile with a machine-readable `origin`:

- `strict.origin = "icjia.iitaa.wcag21"`
- `remediation.origin = "developer-extension.pdfua"`

This origin is carried through the JSON export so downstream consumers can filter on it.

## The two score meanings

### 1. Strict semantic score — ICJIA's rubric (default, primary)

- The Illinois agency publication and legal-review lens
- Anchored to **WCAG 2.1 Level AA** and **IITAA §E205.4** for non-web documents
- Prioritizes **programmatically determinable** semantics
- Treats missing `H1–H6` tags and missing table header semantics (`TH`, `Scope`, `Headers`) as major issues
- Deliberately does **not** treat PDF/UA conformance signals as the primary document-level score driver
- Best used when the question is: "Is this PDF semantically ready for publication under Illinois accessibility expectations?"

### 2. Practical readiness score — developer extension (supplementary)

- **Not ICJIA's rubric.** A developer-added lens that layers PDF/UA-oriented checks on top of ICJIA's Strict rubric.
- **Not required by Illinois accessibility law.** IITAA §E205.4 frames final-document accessibility through WCAG 2.1; IITAA §504.2.2 references PDF/UA only for authoring-tool export capability.
- Follows a broader vendor-style weighted schema and adds a dedicated `pdf_ua_compliance` category that scores StructTreeRoot/tagging, MarkInfo/Marked, PDF/UA identifiers, list legality, table legality, and tab order.
- Applies partial-credit floors — for example, 70 on `heading_structure` when the document has rich tagged body structure plus bookmarks or role-mapped heading-like tags, and 70 on `table_markup` when rows and columns are well-formed but `<TH>` is missing. These floors are the original developer's judgment calls, not published standards.
- The `color_contrast` category is surfaced transparently as `N/A` until rendered-PDF contrast analysis is implemented.
- Best used for progress tracking or reconciling against commercial PDF/UA-focused remediation tools. **Do not cite Practical as an Illinois accessibility-law signal.**

## What this does **not** mean

- Neither profile is a legal compliance determination
- Neither profile alone proves WCAG 2.1 AA, ADA Title II, ITTAA, PDF/UA, PAC, or Matterhorn conformance
- The practical-readiness profile is intentionally more forgiving and must **not** be treated as a substitute for semantic review

## Why the annual report files disagreed

In `FY_22_ICJIA_Annual_Report_7c7ba4f4f0.pdf` vs `...-remediated.pdf`, the remediated file genuinely improved in ways our parser detects:

- bookmarks were added
- figure alt text was added

But two structural issues remained:

- no real `H` / `H1–H6` tags were added
- the custom tags `Head`, `Subhead_1`, `Subhead_2`, etc. still role-map to `P`
- the table still uses `TD` cells without `TH`, `Scope`, or `Headers`

That means the file is **better**, but not fully semantically remediated.

## WCAG / ADA Title II interpretation

For the disputed issues in this project, the strict profile is closer to a conservative WCAG/ADA reading because it insists on programmatic structure:

- headings should be exposed as headings, not just visually styled paragraphs
- data tables should expose programmatic header relationships

However, the strict profile is **not complete** on its own. Other tools may check PDF/UA-style integrity rules that this app still only partially covers.

## Matterhorn / PDF-UA note

The Practical profile (developer extension) incorporates several **PDF/UA-oriented** signals, but it still does **not** implement the full Matterhorn Protocol or act as a PDF/UA conformance audit.

Illinois IITAA 2.1 references PDF/UA in a specifically narrow way. The standards page states that [`504.2.2 PDF Export`](https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html) requires authoring tools that can export PDF 1.7 to also be capable of exporting PDF/UA-1. That is a requirement about the authoring tool, not the final PDF. Separately, [`E205.4 Accessibility Standard`](https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html) frames electronic content accessibility through WCAG 2.1 A/AA for non-web documents — and that is the rule that applies to the finished PDF.

That is exactly why the two profiles are split the way they are:

- **Strict (ICJIA's rubric)** is the primary document-level publication/review lens because it emphasizes the WCAG 2.1 / IITAA §E205.4 semantic signals that actually govern the finished document.
- **Practical (developer extension)** includes additional PDF/UA-oriented checks because a developer who added this profile wanted to score the §504.2.2 family of signals alongside the §E205.4 ones. That mix is useful in remediation workflows but it does not translate into an Illinois accessibility-law determination for the final document.
- Neither profile alone should be read as a legal determination or a full PDF/UA / Matterhorn conformance audit.

Future PDF/UA work should be added as **explicit structural audit logic** (reported as findings, surfaced as their own categories if warranted), not absorbed silently into the Practical score where they could be mistaken for a conformance verdict. Candidate future checks:

- orphan MCIDs
- annotation `StructParent` integrity
- structure-tree legality checks
- tag-role conformance rules

## Why the annual report files disagreed (specific example)

In `FY_22_ICJIA_Annual_Report_7c7ba4f4f0.pdf` vs `...-remediated.pdf`, the remediated file genuinely improved in ways our parser detects — and Practical credited those improvements where Strict did not.

Practical rewarded:

- bookmarks that were added
- figure alt text that was added
- the 70-point floor on `heading_structure` because the remediated file now has enough tagged body structure and role-mapped heading-like tags to qualify

Strict held the line on semantic gaps:

- no real `H` / `H1–H6` tags were added
- the custom tags `Head`, `Subhead_1`, `Subhead_2`, etc. still role-map to `P`
- the table still uses `TD` cells without `TH`, `Scope`, or `Headers`

That means the file is **better under Practical's progress lens**, but **not fully remediated under ICJIA's Strict rubric**. Both signals are accurate; they answer different questions.

## Recommended usage

- Use **Strict** (ICJIA's rubric) for internal publication review, Illinois agency accessibility sign-off, and any policy-sensitive or legal-adjacent triage.
- Use **Practical** (developer extension) when reconciling against external PDF/UA-focused remediation vendors, tracking improvement over time, or surfacing PDF/UA-oriented audit signals in a single view.
- When the two profiles diverge, treat Strict as the authoritative signal. Read the Practical category findings to understand why the developer-extension schema scored differently, but do not cite Practical in an Illinois accessibility-law context.
- Do not use Practical to justify a publication-readiness decision. It is not ICJIA's rubric.
