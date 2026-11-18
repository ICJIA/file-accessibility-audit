# Fix-step accuracy pass — November 2026 (v1.173.3)

**Trigger:** a scheduled re-check. The previous pass ([August 2026](fix-step-accuracy-2026-08.md))
was three months old and had verified **Word and Acrobat only**. PowerPoint and Excel steps
(added Sep–Nov 2026, v1.157–v1.173) had never been checked against Microsoft's docs.

Every Microsoft and Adobe menu path in the app was re-checked on **2026-11-18** against the
vendors' live help pages (Adobe helpx loaded in a real browser — it blocks plain fetchers).

## Versions verified against

| App | Version on 2026-11-18 | Source |
| --- | --- | --- |
| Microsoft 365, Windows (Current Channel) | **Version 2611, Build 20625.20108** (Nov 17, 2026) | learn.microsoft.com/officeupdates/update-history-microsoft365-apps-by-date |
| Microsoft 365, Mac | **16.115.1** (Nov 17, 2026) | learn.microsoft.com/officeupdates/update-history-office-for-mac |
| Adobe Acrobat Pro (Continuous) | **26.003.22110** (Nov 16, 2026) | adobe.com/devnet-docs/acrobatetk/tools/ReleaseNotesDC |
| Acrobat 2024 (perpetual) | 24.001.30429; supported to Jul 15, 2029 | Adobe EOL matrix |
| Adobe InDesign | **2027 (v22.0)**, Nov 2026 | helpx InDesign release notes (dated Nov 10, 2026) |

Lifecycle: **Office LTSC 2021 support ended 2026-10-13**, so Office 2024 / LTSC 2024 is the only
supported perpetual Office — the only one still saying "Edit Alt Text" and "Decorative".
Acrobat 2020 ended 2025-11-30 (unchanged).

## What the vendors changed since August

- **Microsoft:** Current Channel 2608–2611 release notes list fixes only. The Accessibility
  Assistant reached PowerPoint and Excel on Windows earlier in 2026 (Insider posts, Mar/Apr 2026);
  it still opens from Review → Check Accessibility, so our checker steps hold. PowerPoint's
  "Title a slide" article now leads with the Accessibility ribbon's **Slide Title ▾ → Set as
  Slide Title**.
- **Acrobat:** releases since Aug 11 are bug fixes only. The "Create and verify PDF
  accessibility" and Reading Order tool pages are still dated Feb 26, 2026; every path in the
  August canonical table re-confirmed word for word.
- **InDesign:** 21.5 (Jul 2026) added **Table → Convert Rows → Convert to Header Columns**;
  22.0 added a **Check Document** panel (not yet referenced) and fixed alt text sometimes being
  dropped from tagged PDF export. Community reports flag 22.0 performance problems — relevant
  to the "install the latest version" support line.

## What was wrong in our copy (all fixed in v1.173.3)

| Where | Was | Now |
| --- | --- | --- |
| actionPlan `title_language` / language-only, xlsx | Review → Language → Set Proofing Language | Excel has no such command and stores no language: title only; a PDF from Excel with only a language problem gets the Acrobat route alone (empty source list = no source route) |
| pptx.ts all-hidden finding | right-click → Hide Slide | → **Unhide Slide** |
| pptx.ts title-order advisory, wcag.ts reading_order, SourceDocumentNotice | reorder in the Selection Pane "so the title reads first" | the Selection Pane lists in **reverse** — drag the title to the **bottom**; Windows Reading Order pane (top-down) via Check Accessibility → Check reading order → Verify object order |
| pptx.ts tables | "and mark the top row's cells as headers" | no such control; Table Design → Table Style Options → Header Row is the whole fix |
| wcag.ts title_language | "PowerPoint uses its presentation-wide default language setting" | Outline View + Set Proofing Language; Mac: Review → Language |
| errorHandler.ts (too-large) | File → Organize Pages → Split; File → Save As Other | All tools → Organize pages → Split; ☰ Menu (Win) / File (Mac) → Save as Other |
| RemediateButton.vue | Accessibility → Accessibility Checker | All tools → Prepare for accessibility → Check for accessibility |
| pdfUaFixHint ×7, adobeParity, analyzeCore | File → Properties (classic only) | Document properties (☰ Menu on Windows, File on Mac; classic: File → Properties) |
| pdfUaFixHint ×6 | Print Production → Preflight | All tools → Use print production → Preflight |
| pdfUaFixHint tab order | "the Make accessible workflow" (undocumented) | checker → Tab order → Fix; or Page Properties → Tab Order → Use Document Structure |
| fonts (actionPlan, supplementary, remediate page vs bestPractices/pdf) | "Preflight → Fix → Embed missing fonts" vs "cannot be embedded after the fact" | one rule: Preflight's "Embed missing fonts" fixup works only if the font is installed on the computer; otherwise re-export |
| remediate page / supplementary Table Editor | "Tags panel … right-click → Properties → Tag"; "right-click a table in the document → Table Editor" | Table Editor reached through the Reading Order tool, as Adobe documents |
| supplementary Page Thumbnails path | View → … → Side panels → Page | ☰ Menu (Win) / View (Mac) → Show/Hide → Side panels → Page Thumbnails |
| PowerPoint "View → Outline" (×3) | View → Outline | View → **Outline View** |
| xlsx alt text | no decorative option | "(or mark it decorative)" |
| wcag.ts link_quality | Edit Hyperlink for all three | Edit Hyperlink (Word); Edit Link (PowerPoint, Excel) |
| InDesign table steps | header rows only | + Convert to Header Columns (21.5+) |
| fixStepVersions.ts | August; Word/Acrobat/InDesign 2026; "Word and Acrobat" | November; Word, PowerPoint, Excel (2611 / 16.115), Acrobat 26, InDesign 2026–2027; Office paths are Windows-first with the Mac differences; support line names Microsoft 365 |

Pinned by `apps/web/app/__tests__/fixStepAccuracy2026_11.test.ts` (every test fails on v1.173.2).

## Not verified (record for the next pass)

- Exact contents of PowerPoint/Excel 2611's Check Accessibility dropdown, and the pane title now
  that the Assistant covers them — needs a real install. Our copy uses only Microsoft's
  documented route (Check reading order → Verify object order).
- Mac title path (File → Properties → Summary) is from long-standing UI, not a live page.
- Preflight profile/fixup names ("Embed missing fonts", "Verify compliance with PDF/UA-1"):
  no live Adobe page lists them.
- "Page Thumbnails" label under the new UI's Side panels; Table Cell Properties → Scope
  (still on no live Adobe page — August ambiguity, unchanged).
- InDesign 22 help pages for export, Articles, Object Export Options were not rewritten for 22;
  paths assumed to carry over from the Jun 2, 2026 pages.
- Adobe help moved to `/desktop/…` URLs; old `/using/` links redirect. Stored help links not
  re-checked.

## Limits

Analyzer finding sentences are frozen into stored reports at audit time: a report saved before
v1.173.3 keeps the old wording until the file is audited again. The web-layer copy
(action plan, version note, PDF/UA hints, remediation page) updates everywhere at once.
