# Fix-step accuracy pass — Word and Acrobat menu paths (August 2026)

**Trigger:** a user followed the report's fix steps and could not find the menu items in
Word or Acrobat. Root cause: several fix strings — worst of all the remediation page's
per-category Acrobat hints — still described Adobe Acrobat's **pre-redesign "classic"
interface** (`Tools → Accessibility → …`), which no longer exists in the interface Adobe
has shipped to everyone since the 2023 rollout of the "new Acrobat experience" (hamburger
☰ menu + "All tools" panel). A user on current Acrobat literally has no `Tools →
Accessibility` menu to find.

## What the steps are verified against

Every menu path in the app's fix steps was re-verified on **2026-08-11** against the
current official vendor documentation (fetched from live pages; Adobe's helpx blocks
plain HTTP fetchers, so pages were loaded in a real browser):

| App | Version verified against | Notes |
| --- | --- | --- |
| Adobe Acrobat Pro (Continuous) | **26.001.21789** (Aug 11, 2026; planned release 26.001.21771, Aug 1, 2026) | The "new experience" UI — ☰ Menu + All tools panel. Rolled out progressively mid-2022 → 2023; Adobe's docs state "The new Acrobat is now available to all users." |
| Microsoft Word for Microsoft 365 (Windows) | **Version 2607, Build 20228.20158** (Aug 4, 2026, Current Channel) | |
| Microsoft Word for Microsoft 365 (Mac) | **16.111.3** (Aug 4, 2026) | |
| Adobe InDesign 2026 | **21.4.x** (21.4.1 shipped June 2026); paths verified 2026-08-16 | Added when the plan gained InDesign-aware source steps. Verified against Adobe's "Accessible PDFs" help page (helpx, last updated Jun 2, 2026) plus the linked per-task pages; the export dialogs are unchanged across recent majors, so the paths hold for CC 2019+ documents too. |

Perpetual-license context for IT:

- **Acrobat 2020** (last classic-only perpetual): support ended **Nov 30, 2025**
  (extended from June 1, 2025 — Adobe EOL matrix). Anyone still on it is unsupported.
- **Acrobat Pro 2024** (current perpetual, formerly "Acrobat Classic"): ships the **new**
  interface despite the old "Classic" branding, so the current steps apply to it.
- Continuous-track users can still revert via ☰ Menu → *Disable new Acrobat* (Adobe still
  documents the toggle), so a minority of machines may show the classic UI even on
  current versions — which is why classic paths stay in the steps as parentheticals.
- **Word 2019–2024 perpetual** vs Microsoft 365: functionally the same for our steps,
  with one naming difference — the right-click alt-text command is **"View Alt Text"** in
  Microsoft 365 but **"Edit Alt Text"** in perpetual Word 2019–2024 (both wordings are on
  Microsoft's own alt-text article, per-version tabs). Word/Office LTSC 2024 released
  Sep 16 (volume) / Oct 1 (consumer), 2024.

## The three product changes

1. **Every fix-step card now carries a version note** (`apps/web/app/utils/fixStepVersions.ts`,
   rendered on all six surfaces: Visual-view plan cards, Detailed-view "How to Fix in
   Adobe Acrobat" blocks, Issues-to-fix rows, the printable plan, the HTML export, and
   the remediation page). It states the versions the steps were verified against, gives a
   one-line "which Acrobat am I looking at?" test (☰ + All tools = current; Tools tab
   with Accessibility toolset = classic → use the parenthesized paths), and ends with the
   agency support line: *contact IDS at ICJIA to make sure you have the most recent
   versions installed.* Each surface has a wiring test asserting the note renders.

2. **Every Acrobat path was rewritten to the current interface, with the classic path in
   parentheses wherever the two differ sharply.** A deliberate decision was made **not**
   to add a current/classic toggle: the Detailed view renders Acrobat steps frozen into
   stored reports at audit time (a toggle cannot rewrite them), the printable plan cannot
   toggle at all, and a reader who would need the toggle generally cannot answer "which
   Acrobat do I have?" — the note's self-identification line plus inline parentheticals
   serve both populations at once.

3. **Word steps were corrected where Microsoft's current docs disagree with our copy**
   (details below).

## Verified canonical paths now used throughout

| Task | Current Acrobat (26.x, new UI) | Classic UI |
| --- | --- | --- |
| Run checker | All tools → Prepare for accessibility → Check for accessibility | Tools → Accessibility → Full Check (renamed "Accessibility Check" May 2020) |
| Auto-tag | All tools → Prepare for accessibility → Automatically tag PDF | Tools → Accessibility → Autotag Document |
| Reading order | All tools → Prepare for accessibility → Fix reading order (tool is named "Reading Order tool") | Tools → Accessibility → Reading Order |
| Alt text (bulk) | All tools → Prepare for accessibility → Add alternate text | Tools → Accessibility → Set Alternate Text |
| Alt text (single) | Fix reading order → right-click figure → Edit Alternate Text | same via Reading Order tool |
| Tags panel | ☰ Menu (Win) / View menu (Mac) → Show/Hide → Side panels → Accessibility tags | View → Show/Hide → Navigation Panes → Tags |
| Order panel | from the Reading Order dialog → Show Order Panel | same |
| Bookmarks panel | bookmark icon, right-side panel; Options → New Bookmarks From Structure | View → Show/Hide → Navigation Panes → Bookmarks |
| OCR | All tools → Scan & OCR → Recognize Text → In this file | Tools → Scan & OCR → Recognize Text → In This File |
| Forms | All tools → Prepare a form | Tools → Prepare Form |
| Document properties | ☰ Menu (Win) / File menu (Mac) → Document properties | File → Properties |
| Preflight | All tools → Use print production → Preflight | Tools → Print Production → Preflight |
| Edit text | All tools → Edit a PDF | Tools → Edit PDF |

Word paths verified verbatim against Microsoft's current articles: Review → Check
Accessibility (pane is "Accessibility Assistant" in Word for Microsoft 365 on Windows);
File → Info → Properties → Title; Review → Language → Set Proofing Language; **Table
Layout → Repeat Header Rows** (Microsoft's own wording) plus Table Design → Header Row;
Home → Styles / Bullets / Numbering; right-click a link → **Edit Hyperlink** (one of our
strings previously said "Edit Link"); Save As → PDF → Options → "Document structure tags
for accessibility" and "Create bookmarks using: Headings".

## InDesign paths (added 2026-08-16)

The action plan's source route swaps to these when the report's stored PDF Creator
metadata matches `/indesign/i` (`buildActionPlan`'s `creator` argument; anything else —
Word, a scanner, missing metadata, old reports — keeps the Word-centric copy unchanged).
Verified against Adobe's current InDesign help ("Accessible PDFs", updated Jun 2, 2026,
and its linked task pages), cross-checked against state-government InDesign guides
(Illinois DoIT, Oregon Health Authority):

| Task | InDesign 2026 (21.x) path |
| --- | --- |
| Tagged export | File → Export → Adobe PDF (Print) → General tab → check "Create Tagged PDF" |
| Headings | Paragraph Styles panel menu → Edit All Export Tags → Show: PDF → map styles to H1–H6 (per style: Paragraph Style Options → Export Tagging) |
| Alt text | select image → Object → Object Export Options → Alt Text tab → Alt Text Source: Custom |
| Reading order | Window → Articles → drag content in → panel menu → "Use for Reading Order in Tagged PDF"; anchor images into the text flow |
| Title | File → File Info → Document Title |
| Language + shown title | Export Adobe PDF (Print) → Advanced tab → Language dropdown + Display Title: "Document Title" |
| Table headers | click in header row → Table → Convert Rows → To Header |
| Bookmarks | Layout → Table of Contents → check "Create PDF Bookmarks" (or Window → Interactive → Bookmarks); export with Include → Bookmarks |
| Lists | real Bullets and Numbering (paragraph style / Paragraph panel) — auto-tagged as `<L>` on tagged export |
| Form fields | Window → Interactive → Buttons and Forms → Description (exports as the tooltip); File → Export → Adobe PDF (Interactive) keeps fields live |
| Fonts | embedding is automatic on PDF export; a font that stays unembedded has a license forbidding it — replace the font |
| Security | Export Adobe PDF dialog → Security panel → clear permissions restrictions |

## Known vendor-doc ambiguities (recorded so the next pass doesn't re-litigate)

- Adobe's own pages name the Tags panel three ways in the new UI ("Side panels →
  Accessibility tags", "Side Panels → Tags", "Navigation Panels → Tags"). We standardized
  on the accessibility article's wording (Accessibility tags).
- The Table Editor's "Table Cell Properties → Scope" step no longer appears on any live
  Adobe page (the old KB pages 404), but the control still exists in the product; Adobe's
  live guidance routes header fixes through the Tags panel. We kept the Table Editor
  steps and the Tags-panel route side by side.
- Microsoft's Word pages disagree on "View Alt Text" (M365 tab) vs "Edit Alt Text"
  (perpetual tab, and one older Word accessibility article) — our copy names both.
- Word for Mac tagged-PDF export: the current Mac article says Save As → PDF produces a
  tagged PDF, while the accessible-PDFs article still shows the older "Best for
  electronic distribution and accessibility (uses Microsoft online service)" radio
  button. Copy mentions both; nothing asserts which build changed the dialog.

## Where the strings live (for the next accuracy pass)

- `apps/web/app/utils/actionPlan.ts` — Visual-view PLAN_COPY dictionary (also feeds the
  printable plan and HTML export); each PDF entry's `sourceInDesign` carries the
  InDesign steps, chosen by the stored Creator metadata
- `apps/web/app/utils/wcag.ts` — per-category remediation guidance
- `apps/web/app/utils/fixStepVersions.ts` — the version note (update its "verified" date
  and versions on each re-verification)
- `apps/web/app/components/pdfUaFixHint.ts` — veraPDF failure → fix hints
- `apps/web/app/pages/remediate/[jobId].vue` — `acrobatStepsByCategory`
- `packages/analyzer/src/scoring/{pdf,supplementary,docx,pptx,xlsx,conformance}.ts` —
  Detailed-view findings strings (frozen into stored reports at audit time; old reports
  keep old strings, which is why the version note lives in the web layer)
