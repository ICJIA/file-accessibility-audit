# Scoring Reconciliation: Strict vs. Practical-Readiness Profiles

## Purpose

This note explains why this audit tool can disagree with remediation vendors or Acrobat/PAC-style tools on the same PDF, especially when a file is "improved" but still lacks full semantic structure.

## The two score meanings

### 1. Strict semantic score (default)

- Standards-oriented internal QA signal
- Prioritizes **programmatically determinable** semantics
- Treats missing `H1–H6` tags and missing table header semantics (`TH`, `Scope`, `Headers`) as major issues
- Best used when the question is: "Does the PDF expose real structure to assistive technology?"

### 2. Practical-readiness score

- Softer readiness signal for comparing against practical improvement workflows
- Gives partial credit when a document has strong tagged body structure, bookmarks, or a well-formed table grid even if semantic headings/header cells are still incomplete
- Best used when the question is: "Did the file materially improve in practice, even if some semantics are still imperfect?"

## What this does **not** mean

- Neither profile is a legal compliance determination
- Neither profile alone proves WCAG 2.1 AA, ADA Title II, PDF/UA, PAC, or Matterhorn conformance
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

The practical-readiness profile added in this project does **not** implement the Matterhorn Protocol.

Future PDF/UA work may incorporate Matterhorn-inspired checks such as:

- orphan MCIDs
- annotation `StructParent` integrity
- structure-tree legality checks
- tag-role conformance rules

Those checks should be added as explicit structural audit logic, not hidden inside the practical-readiness score.

## Recommended usage

- Use **strict semantic score** for internal publication review and policy-sensitive triage
- Use **practical-readiness score** when comparing to external remediation vendors or measuring practical improvement over time
- When the two scores diverge, read the category findings before making a compliance decision
