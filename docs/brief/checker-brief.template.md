# Built to be checked. So check it.

**REPORT GENERATED: {{DATE_UPPER}} — every number below was pulled live from the running system on this date. Regenerated with fresh numbers at every release.**

**audit.icjia.app — built for Title II ADA · WCAG · Illinois IITAA compliance.** Every claim in this brief can be verified without taking anyone's word for it — including ours.

**{{AUDITS_TOTAL}}** check-ups run for internal and external agencies — the quick per-file check-up that has caught on beyond ICJIA: easier than SiteImprove, clearer than PAC. {{AUDITS_30D}} in the last 30 days alone. · **{{TESTS}}** self-checks the software runs on itself before anything goes live — all must pass, or nothing ships. · **{{TRAPS}} / {{TRAPS}}** trap documents built to fool it, every one judged correctly. · **{{COMMITS}}** saved, dated, public changes over {{WEEKS}} weeks.

## What it does

Many people who are blind or can't see well use a **screen reader** — software that reads what's on the screen out loud. A document is **accessible** when a screen reader can read it correctly. Upload a PDF, Word, PowerPoint, or Excel file and in about a minute this tool reports everything that would trip a screen reader up — and exactly how to fix each one. **Title II of the ADA** and the **Illinois Information Technology Accessibility Act (IITAA)** require this of every public body — and both point to the same rulebook: **WCAG**.

## The law: Title II. IITAA. WCAG.

Three names, one idea — government information must work for everyone. **Title II of the ADA** (ada.gov/resources/2024-03-08-web-rule) is the federal rule for state and local government: it names **WCAG 2.1 Level AA** as the standard, and its compliance deadlines **began in April 2026**. **IITAA** (doit.illinois.gov/initiatives/accessibility.html) — the Illinois Information Technology Accessibility Act — is our state's own accessibility law, older than the federal rule, also built on WCAG 2.1 AA, and it applies to every Illinois public body. **WCAG** (w3.org/WAI/standards-guidelines/wcag) — the Web Content Accessibility Guidelines — is the rulebook both laws point to. This checker tests the newer **WCAG 2.2 AA, which contains everything in 2.1** plus the newest requirements: pass here, and you have passed the version the law names. Every finding on every report cites the WCAG rule behind it, so a reviewer can trace any grade straight back to the law's own standard.

## What every check-up looks at

Up to **nine graded areas per document**, matched against the PDF industry's official 31-point checklist — the same one professional human reviewers work from: real selectable text (words, not pictures of words) · title and language · true headings · image descriptions · table structure · reading order · links and navigation · labeled forms · plus separate check suites for Word, PowerPoint, and Excel. Every report also states plainly what automation **cannot** check — roughly 60–70% of accessibility is human judgment, and the report says so on every grade.

**The 31-point checklist has a name: the Matterhorn Protocol.** Published by the PDF Association — the same industry body that builds the veraPDF referee — it is the test model professional evaluators and tools like PAC work through. How the pieces fit: **Title II and IITAA** name the law's standard, **WCAG** — rules for what must be true of *any* content; **Matterhorn** translates those rules into 31 PDF-specific, testable checkpoints — where inside a PDF to look. The law, our checker, veraPDF, and a human evaluator's checklist all read from connected pages, and every report maps its findings onto all 31: 01 Real content tagged · 02 Role Mapping · 03 Flicker · 04 Color and Contrast · 05 Sound · 06 Metadata · 07 Dictionary · 08 OCR-generated content · 09 Appropriate Tags · 10 Character Mappings · 11 Declared Natural Language · 12 Stretchable Characters · 13 Graphics · 14 Headings · 15 Tables · 16 Lists · 17 Mathematical Expressions · 18 Page Headers and Footers · 19 Notes and References · 20 Optional Content · 21 Embedded Files · 22 Article Threads · 23 Digital Signatures · 24 Non-Interactive Forms · 25 XFA · 26 Security · 27 Navigation · 28 Annotations · 29 Actions · 30 XObjects · 31 Fonts.

## It doesn't grade its own homework

**PDF/UA** is the international rulebook for PDFs a screen reader can use — an official standard, like a building code for documents. **veraPDF** is a separate referee program that checks files against that rulebook, built by the PDF industry's own association — not by us, and used by national libraries worldwide. It runs beside our checker **on every single report**, as an independent second opinion — so every report carries two verdicts: ours (the 0–100 score, the letter grade, and the fix-it list) and theirs (veraPDF's independent pass/fail against the PDF/UA rulebook). If ours were wrong, theirs would say so — in public, on every audit. One precision the experts will appreciate: **Title II and IITAA require WCAG, not a PDF/UA badge** — the two overlap heavily by design, and this report checks both, saying plainly which rulebook each finding belongs to.

## We built {{TRAPS}} documents designed to fool it — PDFs modeled on Canva, InDesign, and Word, plus native Word, PowerPoint, and Excel traps

Real documents can't prove a checker is right — nobody knows their ground truth. So we built trap PDFs where **the correct answer is known in advance**: a file with a perfect title that is secretly one big photograph (caught — scored 0); a picture "description" made only of blank spaces; whole paragraphs disguised as headings (caught); big bold text instead of real headings (caught); InDesign's custom naming with a one-letter typo (read correctly); a page built the way Canva sometimes builds them, unreadable inside (it said "can't judge" instead of guessing); a form with no labels beside an identical form with proper ones (flagged and cleared, respectively); hostile computer code hidden in the text (stayed harmless); internal structure that loops forever (no crash). **All {{TRAPS}} held** — and the battery caught **one real bug in the checker itself** (the blank-spaces description was being counted as real). Fixed the same day, documented publicly. A checker that only pretends to work doesn't catch itself. Anyone can re-run the whole battery; the traps are rebuilt from scratch every time. And it is not just spelling tests — it re-proves, on every run, the hard cases real documents taught this checker: Canva's phantom leftovers that once cost a clean report a grade, InDesign's custom naming soup, the rubble Acrobat's page-combining leaves behind, headings that exist but say nothing, tables whose headers point nowhere, forms with no labels — document structure errors, not typos.


**The full inventory — {{TRAPS_CAUGHT}} designed defects caught, {{TRAPS_HELD}} correct or hostile documents passed clean, 1 real bug found in the checker and fixed** — is listed in the appendix at the end of this document. Half the battery is modeled on what Canva, InDesign, and Word actually export — flat untagged posters, decorative-shape swarms, custom naming soup, picture-of-words titles, "Print to PDF". The battery runs again before any change ships: a broken promise stops the release, so every failure is a defect to fix — in the document, or in the checker.

## Honed with internal and external accessibility specialists

This is not an internal experiment. The checker is **used every day — by ICJIA and by outside agencies and document specialists** — and tuned in working sessions with accessibility specialists inside and outside the agency: real documents, real disputes, fixes shipped the same day. Don't take the "every day" on faith: the public stats page (audit.icjia.app/status) counts every check-up as it happens. Four grade challenges from document experts and state reviewers, each settled by **reading the file itself**, never by defending the tool:

- **A state accessibility team's form: 65 D → 100 A.** The expert was right; the checker mis-measured forms. Fixed same day.
- **A document-repair specialist's two "missing" images: 79 C → 100 A.** Right again — the "images" were leftovers from a rebuilt page, on no page at all. Fixed same day.
- **Table headers: the checker was right** — verified against the file's internals; the advice was made clearer instead.
- **The state IT agency's reference document: 89 B → 100 A.** Their file was right and the checker was wrong — a table's corner header used the standard's third scope value, which this checker did not recognise. Fixed, with a trap document added so it can never come back.

Software that only pretends to work can't afford to lose an argument in public. This one has — three times — and got better every time. Two of the four it won on the evidence; every one was settled by reading the file, not by defending the tool.


## How this app is tested before anything ships

Twelve gates stand between a code change and the live site, run automatically on every change; one failure stops the release cold. On every change: the {{TESTS}} self-checks (every promise ever made, re-tested); the {{TRAPS}} trap documents rebuilt and re-judged; the scoring invariant (the grade shown must always match the score computed); the **golden score ledger** (every control document's exact score and per-category verdict pinned — no grade can move unless a person approves the movement in review); the **re-save test** (every trap rewritten by a different tool must grade identically, digit for digit — byte layout can never change a grade); **same file, same answer** (sentinel documents audited five times, three at once — identical results even under load); real-pipeline integration on actual PDFs; the wiring checks (pages must render what the data claims); and the type, lint, and build guards. Before each release: the 136-document corpus sweep (36 real + 100 traps). After each deploy: **live-site sentinels** — known traps uploaded to the real site, where the scan lie must still score 0 and the perfect document must still score 100. And on every report, in production: the independent veraPDF referee.

## Does it actually work? Fail. Fix. Re-check. Pass.

The strongest evidence is not a promise — it is the same document graded twice. A grade here is a **to-do list, not a verdict**: the first check-up fails the file and names every problem with exact fix-it steps; the author repairs it; the re-check runs the same rules with no memory of the first attempt. In the last 30 days alone, **{{REAUDITED}} documents came back for a re-check after repairs — and {{REACHED_A}} of them climbed all the way to an A**: failed, fixed, and passed under the same rules. This is the question behind every other question, and the answer no sales pitch can fake: the same file, failed and then passed.

## Different tools, different jobs: SiteImprove and this checker

Many agencies already have SiteImprove, and being honest about both is the fastest way to trust either. **SiteImprove does well:** it watches an entire *website* — crawling every page on a schedule, tracking trends over months, with dashboards and governance for a whole organization. **What it isn't built for:** the document in your hand right now (single-file answers wait on crawl cycles); its scores mix the legal AA requirements with stricter AAA and best-practice items the law does not name, so a sub-100 is not necessarily a legal problem; and it is a paid enterprise subscription. **This checker does well:** one file, answered in about a minute — free, no account, nothing stored; scored against the legal standard with every finding labeled by its rulebook; fix-by-fix instructions and two independent verdicts. **What it isn't built for:** crawling websites, watching trends, or dashboards; and like every automated checker — SiteImprove and Acrobat included — it sees only the 30–40% a machine can judge. **Use SiteImprove to watch the whole site. Use this when a document is in your hand and you need an answer now.** The advantage here is simple: it is faster, and it is free.

## {{MONTHS_WORD}} months. {{COMMITS}} changes. {{VERSIONS}} versions.

Not a weekend project. Since March it has grown from a single PDF check into a checker for four kinds of files — {{COMMITS_30D}} saved changes in the last 30 days alone, its battery of self-checks grown from about 1,500 in June to {{TESTS}} today. All of it is public, on GitHub: [the full change log](https://github.com/ICJIA/file-accessibility-audit/blob/main/CHANGELOG.md) and [every numbered version](https://github.com/ICJIA/file-accessibility-audit/tags), open for anyone to read. Milestones, newest first: passes its own trap test {{TRAPS}}/{{TRAPS}} · fixed the outlier that wrongly refused a 246-page annual report — traced to the server, not the file, with proof · made its own grading **stricter** on itself · lost three public arguments and fixed all three · covered all 31 industry checkpoints · removed all accounts and identity (nothing stored about who uses it) · adopted WCAG 2.2 AA — everything in the 2.1 version Title II and IITAA name, plus the newest requirements.

## "But... but one person built this. It's not Google or Microsoft or Adobe."

**True — and it doesn't need to be.** This is real software, battle-tested: {{AUDITS_TOTAL}} check-ups for internal and external agencies, {{TRAPS}} trap documents designed to fool it, an independent referee co-signing every report, and a public record of every change — and it is free. Nothing here asks for trust; every claim here is checkable by anyone:

- **The recipe is public.** Every line of code and every change is on GitHub — a kitchen that cooks with the door open.
- **Independent referee.** veraPDF co-signs or contradicts every report.
- **{{TESTS}} self-checks.** Before anything new goes live, the software re-runs every promise it has ever made — all {{TESTS}} must pass. A single failure stops the release cold: fix it, then run the full battery again from the top. A few of those promises, in plain words: a scanned page with no readable text must score zero (no partial credit for a picture of words); a file with no tables must never be graded on tables; the grade on screen and the grade in the downloaded report must match, digit for digit; an image description made of nothing but blank spaces must be caught as empty; a re-saved copy of a document must receive the identical grade, digit for digit; and all {{TRAPS}} trap documents must still be judged correctly, every release.
- **Public paper trail.** {{VERSIONS}} version notes plus a plain-language security log written for records auditors — mistakes included.
- **The best analysis tools.** Inside it runs qpdf and veraPDF — the accessibility field's own best-of-breed analysis tools, used every day by professional remediators and certified specialists worldwide — and it checks all 31 points of the Matterhorn Protocol, the PDF industry's official test model. One person assembled them; the world builds and checks them.
- **Free & open source.** No license, no subscription, no per-seat fee — run as many check-ups as you like, from any agency. The whole thing is open source: the code can be read, copied, run on your own servers, and checked line by line. There is nothing to buy, and nothing hidden to sell.

To be precise about the rivals: "Microsoft's checker" is the Accessibility Checker built into Word, PowerPoint and Excel; Adobe Acrobat Pro has one too — 32 pass/fail rules. Both are respectable, and both are closed: you cannot read their code, their tests, or their history of mistakes. This document *is* that reading, for this tool. And rather than asking you to choose, every PDF report here includes an Acrobat-parity panel — the same 32 rules Acrobat runs, shown beside our verdict, so you can compare checkers without leaving the page.

**The built-in checkers ask for your trust. This one hands you its evidence.**

Try it: audit.icjia.app · Read the code: github.com/ICJIA/file-accessibility-audit · Live status: audit.icjia.app/status

## Appendix: the {{TRAPS}} trap documents

{{TRAP_LIST_MD}}
