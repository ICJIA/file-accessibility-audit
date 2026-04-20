# Scoring Reconciliation: Strict vs. Practical Profiles

## Purpose

This note explains why this audit tool's two scoring methodologies can produce different scores for the same PDF, and when each view is most useful.

## Two methodologies, one document

- **Strict** is a WCAG-based methodology anchored to WCAG 2.1 Level AA and Illinois IITAA §E205.4 for non-web documents. Nine categories, no PDF/UA category. Emphasizes programmatically determinable headings, table semantics, and logical reading order.
- **Practical** is also WCAG-based, but uses different category weights than Strict and adds a PDF/UA Compliance Signals category (MarkInfo, tab order, PDF/UA identifiers, list/table legality). It also applies partial-credit floors on heading and table structure. PDF/UA is a technical PDF standard referenced in IITAA §504.2.2 for authoring-tool export capability; §E205.4 frames final-document accessibility through WCAG 2.1.

Both methodologies correctly evaluate the same document. They can produce different scores because they emphasize different signals. Neither is "right" — they are two evaluation options.

The config tags each profile with a machine-readable `origin`:

- `strict.origin = "wcag.iitaa.strict"`
- `remediation.origin = "wcag.pdfua.practical"`

This origin is carried through the JSON export so downstream consumers can filter on it.

## The two score meanings

### 1. Strict semantic score — WCAG + IITAA §E205.4

- WCAG-based methodology anchored to **WCAG 2.1 Level AA** and **IITAA §E205.4** for non-web documents
- Nine categories, no PDF/UA category
- Prioritizes **programmatically determinable** semantics
- Treats missing `H1–H6` tags and missing table header semantics (`TH`, `Scope`, `Headers`) as major issues
- Useful when the question centers on WCAG 2.1 AA and IITAA §E205.4 alignment

### 2. Practical readiness score — WCAG + PDF/UA

- WCAG-based methodology with **different category weights** than Strict and an added **PDF/UA Compliance Signals** category (StructTreeRoot/tagging, MarkInfo/Marked, PDF/UA identifiers, list legality, table legality, tab order).
- Applies partial-credit floors — for example, 70 on `heading_structure` when the document has rich tagged body structure plus bookmarks or role-mapped heading-like tags, and 70 on `table_markup` when rows and columns are well-formed but `<TH>` is missing. Weights and floors are judgment calls built into this tool, not published standards.
- Includes a 4.5% `color_contrast` weight (the category itself is surfaced transparently as `N/A` until rendered-PDF contrast analysis is implemented).
- Useful when the question involves PDF/UA-oriented signals or reconciling against commercial PDF/UA-focused remediation tools.

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

The Practical profile incorporates several **PDF/UA-oriented** signals, but it still does **not** implement the full Matterhorn Protocol or act as a PDF/UA conformance audit.

Illinois IITAA 2.1 references PDF/UA in a specifically narrow way. The standards page states that [`504.2.2 PDF Export`](https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html) requires authoring tools that can export PDF 1.7 to also be capable of exporting PDF/UA-1. That is a requirement about the authoring tool, not the final PDF. Separately, [`E205.4 Accessibility Standard`](https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html) frames electronic content accessibility through WCAG 2.1 A/AA for non-web documents — and that is the rule that applies to the finished PDF.

That is why the two profiles differ:

- **Strict** evaluates the document using the WCAG 2.1 / IITAA §E205.4 semantic signals and does not include a PDF/UA category.
- **Practical** adds the §504.2.2-style PDF/UA signals on top of the WCAG-based evaluation — useful for PDF/UA-focused remediation workflows and tooling reconciliation.
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

That means the file is **better under Practical's scoring methodology**, but **still has semantic gaps under Strict's methodology**. Both signals are accurate; they answer different questions.

## Why the two scores can differ

- **Practical can score higher than Strict** when a document has remediation scaffolding that Strict does not credit — for example, rich tagged body structure plus bookmarks instead of real H1–H6 tags (Practical gives a 70-point floor); valid table rows without `<TH>` (Practical gives a 70-point floor there too); strong PDF/UA signals like a PDF/UA identifier and complete tab order (scored in Practical's PDF/UA Compliance Signals category, not scored at all in Strict).
- **Practical can score lower than Strict** when a document has solid WCAG semantics (real H1–H6, real `<TH>`, bookmarks) but is missing PDF/UA-specific markers (no `MarkInfo /Marked true`, no PDF/UA identifier in metadata, incomplete tab order). The 9.5% PDF/UA Compliance Signals category can drag down Practical's weighted average, while Strict does not count that category at all.

## Recommended usage

- Use **Strict** when the question is about WCAG 2.1 AA and IITAA §E205.4 alignment — internal publication review, Illinois agency accessibility sign-off, or policy-adjacent triage where the semantic-structure view is what matters.
- Use **Practical** when reconciling against external PDF/UA-focused remediation tools, tracking improvement over time, or surfacing PDF/UA-oriented audit signals in a single view.
- When the two profiles diverge, read the per-category findings in both — the divergence itself is information about how the document scores under the two methodologies.
- Neither profile alone is a legal determination or a full PDF/UA / Matterhorn conformance audit.
