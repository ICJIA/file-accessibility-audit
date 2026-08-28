# Don't trust the person who built it. Check it.

**REPORT GENERATED: {{DATE_UPPER}} — every number below was pulled live from the running system on this date. Regenerated with fresh numbers at every release.**

**audit.icjia.app — built for Title II ADA · WCAG · Illinois IITAA compliance.** Every claim in this brief can be verified without taking anyone's word for it — including ours.

**{{AUDITS_TOTAL}}** check-ups run for Illinois agencies — and, as word has spread, outside clients too. {{AUDITS_30D}} in the last 30 days alone. · **{{TESTS}}** self-checks the software runs on itself before it goes live; one failure blocks any change. · **{{TRAPS}} / {{TRAPS}}** trap documents built to fool it, every one judged correctly. · **{{COMMITS}}** saved, dated, public changes over {{WEEKS}} weeks.

## What it does

Many people who are blind or can't see well use a **screen reader** — software that reads what's on the screen out loud. A document is **accessible** when a screen reader can read it correctly. Upload a PDF, Word, PowerPoint, or Excel file and in about a minute this tool reports everything that would trip a screen reader up — and exactly how to fix each one. **Title II of the ADA** and the **Illinois Information Technology Accessibility Act (IITAA)** require this of every public body — and both point to the same rulebook: **WCAG**.

## The law: Title II. IITAA. WCAG.

Three names, one idea — government information must work for everyone. **Title II of the ADA** (ada.gov/resources/2024-03-08-web-rule) is the federal rule for state and local government: it names **WCAG 2.1 Level AA** as the standard, and its compliance deadlines **began in April 2026**. **IITAA** (doit.illinois.gov/initiatives/accessibility.html) — the Illinois Information Technology Accessibility Act — is our state's own accessibility law, older than the federal rule, also built on WCAG 2.1 AA, and it applies to every Illinois public body. **WCAG** (w3.org/WAI/standards-guidelines/wcag) — the Web Content Accessibility Guidelines — is the rulebook both laws point to. This checker tests the newer **WCAG 2.2 AA, which contains everything in 2.1** plus the newest requirements: pass here, and you have passed the version the law names. Every finding on every report cites the WCAG rule behind it, so a reviewer can trace any grade straight back to the law's own standard.

## What every check-up looks at

Up to **nine graded areas per document**, matched against the PDF industry's official 31-point checklist — the same one professional human reviewers work from: real selectable text (words, not pictures of words) · title and language · true headings · image descriptions · table structure · reading order · links and navigation · labeled forms · plus separate check suites for Word, PowerPoint, and Excel. Every report also states plainly what automation **cannot** check — roughly 60–70% of accessibility is human judgment, and the report says so on every grade.

## It doesn't grade its own homework

**PDF/UA** is the international rulebook for PDFs a screen reader can use — an official standard, like a building code for documents. **veraPDF** is a separate referee program that checks files against that rulebook, built by the PDF industry's own association — not by us, and used by national libraries worldwide. It runs beside our checker **on every single report**, as an independent second opinion. If ours were wrong, theirs would say so — in public, on every audit. One precision the experts will appreciate: **Title II and IITAA require WCAG, not a PDF/UA badge** — the two overlap heavily by design, and this report checks both, saying plainly which rulebook each finding belongs to.

## We built {{TRAPS}} documents designed to fool it

Real documents can't prove a checker is right — nobody knows their ground truth. So we built trap PDFs where **the correct answer is known in advance**: a file with a perfect title that is secretly one big photograph (caught — scored 0); a picture "description" made only of blank spaces; whole paragraphs disguised as headings (caught); big bold text instead of real headings (caught); InDesign's custom naming with a one-letter typo (read correctly); a page built the way Canva sometimes builds them, unreadable inside (it said "can't judge" instead of guessing); a form with no labels beside an identical form with proper ones (flagged and cleared, respectively); hostile computer code hidden in the text (stayed harmless); internal structure that loops forever (no crash). **All {{TRAPS}} held** — and the battery caught **one real bug in the checker itself** (the blank-spaces description was being counted as real). Fixed the same day, documented publicly. A checker that only pretends to work doesn't catch itself. Anyone can re-run the whole battery; the traps are rebuilt from scratch every time. And it is not just spelling tests — it re-proves, on every run, the hard cases real documents taught this checker: Canva's phantom leftovers that once cost a clean report a grade, InDesign's custom naming soup, the rubble Acrobat's page-combining leaves behind, headings that exist but say nothing, tables whose headers point nowhere, forms with no labels — document structure errors, not typos.

## Honed with internal and external accessibility specialists

This is not an internal experiment. The checker is **used every day — by ICJIA and by outside agencies and document specialists** — and tuned in working sessions with accessibility specialists inside and outside the agency: real documents, real disputes, fixes shipped the same day. Don't take the "every day" on faith: the public stats page (audit.icjia.app/status) counts every check-up as it happens. Three grade challenges from document experts this week alone, each settled by **reading the file itself**, never by defending the tool:

- **A state accessibility team's form: 65 D → 100 A.** The expert was right; the checker mis-measured forms. Fixed same day.
- **A document-repair specialist's two "missing" images: 79 C → 100 A.** Right again — the "images" were leftovers from a rebuilt page, on no page at all. Fixed same day.
- **Table headers: the checker was right** — verified against the file's internals; the advice was made clearer instead.

Software that only pretends to work can't afford to lose an argument in public. This one has — twice — and got better both times. And the loop closes: **{{REAUDITED}} documents came back re-audited after repairs in the last 30 days; {{REACHED_A}} reached an A.**

## {{MONTHS_WORD}} months. {{COMMITS}} changes. {{VERSIONS}} versions.

Not a weekend project. Since March it has grown from a single PDF check into a checker for four kinds of files — {{COMMITS_30D}} saved changes in the last 30 days alone, its battery of self-checks grown from about 1,500 in June to {{TESTS}} today. Milestones, newest first: passes its own trap test {{TRAPS}}/{{TRAPS}} · fixed the outlier that wrongly refused a 246-page annual report — traced to the server, not the file, with proof · made its own grading **stricter** on itself · lost two public arguments and fixed both · covered all 31 industry checkpoints · removed all accounts and identity (nothing stored about who uses it) · adopted WCAG 2.2 AA — everything in the 2.1 version Title II and IITAA name, plus the newest requirements.

## "But one person built it."

Fair. So ignore the person entirely — every claim here is checkable by anyone:

- **The recipe is public.** Every line of code and every change is on GitHub — a kitchen that cooks with the door open.
- **Independent referee.** veraPDF co-signs or contradicts every report.
- **{{TESTS}} self-checks.** Before any change goes live, the software re-tests every promise it has ever made.
- **Public paper trail.** {{VERSIONS}} version notes plus a plain-language security log written for records auditors — mistakes included.

**Microsoft's checker won't show you its evidence. This one is made of it.**

Try it: audit.icjia.app · Read the code: github.com/ICJIA/file-accessibility-audit · Live status: audit.icjia.app/status
