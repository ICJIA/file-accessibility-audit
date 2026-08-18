/**
 * The security-audit history shown in §10 of the data-retention page.
 *
 * WHY THIS IS DATA. These entries were hand-written markup: ~46 lines of
 * identical Tailwind boilerplate per release, 3,273 lines and 536 duplicated
 * class attributes in one component. The content is genuinely repetitive — the
 * same card, the same header, the same badge — so every release meant copying
 * a block and editing the words inside it, which is exactly the shape that
 * drifts. Adding a release is now a few lines here; the markup lives in one
 * place, in Section10SecurityAudits.vue.
 *
 * These are dated compliance records. Existing entries are append-only: an
 * external auditor may have read one. Add to the top; do not rewrite history.
 *
 * WHY HTML STRINGS. Entries use inline emphasis — <strong>, <em>, <code>,
 * <br>, the occasional <a> — mid-sentence, and a structured representation of
 * "bold this clause" would be a worse markup language than markup. The strings
 * carry NO classes: the renderer supplies every style, which is the point.
 * They are authored here, in the repository, by the maintainers; nothing
 * user-supplied or request-derived ever reaches this file. That is what makes
 * the single v-html in the renderer safe, and it is the only reason it is.
 */

/** Prefix on a finding. The colour is chosen by the renderer, not stored. */
export type AuditBadge =
  "P1" | "P2" | "P3" | "Fixed" | "Fix" | "Hardened" | "New" | "API" | "UX" | "OPS" | "Note";

export interface AuditFinding {
  badge?: AuditBadge;
  /** Inline HTML. Convention: <strong>Headline</strong> — explanation. */
  html: string;
  /** Smaller follow-up line under the finding. */
  note?: string;
}

export type AuditBlock =
  /** A paragraph of inline HTML. */
  | { kind: "p"; html: string }
  /** A sub-heading within an entry. */
  | { kind: "h"; text: string }
  /** The findings list: generously spaced, each item optionally badged. */
  | { kind: "findings"; items: AuditFinding[] }
  /** A tight bulleted list — used for follow-ups and known limitations. */
  | { kind: "bullets"; items: AuditFinding[] };

export interface SecurityAuditEntry {
  /** Display heading, e.g. "v1.63.1" or "v1.17.0 and earlier". */
  version: string;
  /** The line beside it: when it was reviewed and what the scope was. */
  meta: string;
  body: AuditBlock[];
}

/** Reverse-chronological: newest first. Add new releases at the TOP. */
export const SECURITY_AUDIT_ENTRIES: SecurityAuditEntry[] = [
  {
    version: "v1.82.1",
    meta: "Reviewed <strong>2026-08-18</strong> · scope: an analytics privacy correction. Less now leaves the browser; nothing new is collected.",
    body: [
      {
        kind: "p",
        html: "Since 2026-08-15 this site's analytics deliberately count <em>pages, not files</em>: visiting an individual repair job or shared report is reported to ICJIA's self-hosted analytics server as the base page address only. The report page for web-page audits, added in v1.82.0, was left out of that rule — for part of one day, each visit reported the report's individual address, and the analytics dashboard showed one-visit rows per report.",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "Fixed",
            html: "<strong>Web-page audit reports now count only as <code>/page-report</code>.</strong> The address generalization covers the new page type, so a report's individual address no longer leaves the visitor's browser. What briefly leaked was the report's random identifier — the same one that appears in the shareable link; it names a stored report, not the person viewing it — and it was recorded only on ICJIA's own analytics server.",
          },
          {
            badge: "Hardened",
            html: "<strong>The gap cannot quietly reopen.</strong> An automated test now discovers every per-file page type in the site's own source and fails the build unless the analytics generalization covers it, so a future page type added without the rule is caught before release rather than noticed on the dashboard.",
          },
          {
            badge: "Note",
            html: "<strong>Rows already recorded.</strong> Analytics history is never rewritten, so the few individual addresses recorded during the gap remain in past date ranges of ICJIA's own dashboard; every visit after this release counts as the base route. Data-retention policy v1.8 → v1.9 (§ 8a and § 9 name the third generalized route; § 14 discloses the gap).",
          },
        ],
      },
    ],
  },
  {
    version: "v1.82.0",
    meta: "Reviewed <strong>2026-08-18</strong> · scope: a new report page for web-page audits. Nothing new is collected or sent.",
    body: [
      {
        kind: "p",
        html: "Reports about web pages (produced for the fleet accessibility service, which checks both documents and the web pages that link to them) are stored with a shareable link. Those links pointed at a page of this site that had never been built, so every one of them showed &ldquo;Page not found&rdquo; while the report itself sat safely in storage. The page now exists, and because the link format did not change, every previously shared link began working the moment this release deployed.",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "Fix",
            html: "<strong>Old links work retroactively.</strong> Nothing needed regenerating: the stored reports and their addresses were always valid — only the page that displays them was missing. Links keep their original 365-day expiry, and an expired link says so rather than pretending the report never existed.",
          },
          {
            badge: "Hardened",
            html: "<strong>Displayed content is treated as untrusted.</strong> A page audit records the audited page's address, title, and the locations of problem elements — text that originates in someone else's website. The new report page renders all of it as inert text, and only ever turns an address into a clickable link when it is a plain http(s) URL. An automated test also fails the build if the link format and the page ever go out of step again.",
          },
          {
            badge: "Note",
            html: "<strong>Read-only addition.</strong> The page displays reports through the same public report-lookup endpoint that document reports already use. Nothing new is collected, stored, or transmitted, and no server route, parameter, or dependency was added.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.81.0",
    meta: "Reviewed <strong>2026-08-17</strong> · scope: a scoring-accuracy fix inside the document analyzer. Nothing new is collected or sent.",
    body: [
      {
        kind: "p",
        html: "A document could lose reading-order points for something no reader ever experiences: where in the drawing sequence its images were painted. Programs like Excel paint images last no matter where they belong on the page, so a correctly organized document with a logo at the top was marked down. The reading-order comparison now ignores images' paint position and judges only the order of the text — which is what a screen reader actually follows.",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "Fix",
            html: "<strong>Same detection for real problems.</strong> Text that is genuinely tagged out of order is flagged exactly as before; only the meaningless image-paint signal was removed. The same reported document's other finding — table header cells missing their scope — was verified genuine and still stands.",
          },
          {
            badge: "Note",
            html: "<strong>Analysis-time change only.</strong> The fix lives in the read-only parser that examines an uploaded document. Nothing new is collected, stored, or transmitted; no route, parameter, or dependency was added. Previously saved reports keep their stored evaluation — a fresh audit of the same file picks up the corrected scoring.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.80.0",
    meta: "Reviewed <strong>2026-08-17</strong> · scope: making multi-file results visible, in the browser only. Nothing new is collected or sent.",
    body: [
      {
        kind: "p",
        html: "When several files were checked at once, each file's report was there — but the row for switching between them was so faint that a person who uploaded two files reported seeing only the first. The switcher is now a row of clearly visible report cards, one per file, each showing the file's grade and score. The upload area also now accepts the five files its label has always promised (the enforced limit was three).",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "UX",
            html: "<strong>Same results, actually findable.</strong> Nothing about the analysis changed — each file is still checked by the same server endpoint under the same limits; only the way finished reports are presented in the browser changed.",
          },
          {
            badge: "Note",
            html: "<strong>No new information is collected, stored, or transmitted.</strong> The change is entirely in the page's own display code. No route, parameter, or dependency was added, and rate limits and file-size caps are unchanged.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.79.0",
    meta: "Reviewed <strong>2026-08-17</strong> · scope: a scoring-accuracy fix inside the document analyzers. Nothing new is collected or sent.",
    body: [
      {
        kind: "p",
        html: "Two documents that Adobe's own preflight tools pass were being marked down here for “fonts not embedded.” Both flags were false alarms: in one file the un-embedded font is only ever used to draw single space characters (a space paints nothing and cannot be garbled); in the other, the flagged fonts are leftover bookkeeping from Acrobat's own repair process — no page actually uses them. The check now looks at what the document really displays: a font is only flagged when it is both un-embedded <em>and</em> used to show visible text, which is how Adobe's tools evaluate it.",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "Fix",
            html: "<strong>Fewer false alarms, same protection.</strong> A font that genuinely displays text without being embedded is still flagged exactly as before. When the tool cannot tell how a font is used — including on reports saved before this release — it keeps the cautious old behavior and flags it.",
          },
          {
            badge: "Note",
            html: "<strong>Analysis-time change only.</strong> The fix lives in the two read-only parsers that examine an uploaded document. Nothing new is collected, stored, or transmitted; no route, parameter, or dependency was added. Previously saved reports keep their stored contents unchanged — a fresh audit of the same file is what picks up the corrected evaluation.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.78.1",
    meta: "Reviewed <strong>2026-08-16</strong> · scope: making saved audit answers agree with their report pages. Nothing new is collected or sent.",
    body: [
      {
        kind: "p",
        html: "When the same document is checked again — typically by an agency's automated document inventory — the tool answers from its saved copy instead of re-auditing. Those saved answers carried the score computed on the day the document was first audited, even though the scoring rules have been refined since, while the report link in the very same answer already showed the up-to-date number. An inventory could therefore print one score beside a report page saying another.",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "Fix",
            html: "<strong>Saved answers are re-scored under the current rules before they are returned</strong> — the same re-scoring report pages have applied on read since v1.58.4 — so an inventory cell and the report it links to can no longer disagree.",
          },
          {
            badge: "Note",
            html: "<strong>Stored records are not rewritten.</strong> The saved report stays exactly as computed on its audit date; the corrected score is derived at answer time. Nothing new is collected, stored, or transmitted, and no route or parameter was added.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.78.0",
    meta: "Reviewed <strong>2026-08-16</strong> · scope: showing already-recorded document information beside the fix steps. Nothing new is collected or sent.",
    body: [
      {
        kind: "p",
        html: "Readers of an audit report may not know what program made the document or when it was created — information the audit has always recorded and shown in its technical section. The report's plain-language view now shows it up front: an “About this document” card lists everything the file records about itself (the program that made it, author, created and last-modified dates, page count, and so on), says <em>Not set</em> where the file is silent, and closes with a sentence naming which program the fix steps are written for and why. The detailed view's existing metadata panel carries the same closing sentence.",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "UX",
            html: "<strong>Same information, more visible.</strong> Every field shown was already extracted, stored, and displayed by the audit; the new card re-presents it where the fix steps are read, so the steps' choice of program is explained rather than implied.",
          },
          {
            badge: "Note",
            html: "<strong>No new information is collected, stored, or transmitted.</strong> The card renders in the reader's own browser from the stored report. Records keep the same fields as before; nothing about retention changes.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.77.0",
    meta: "Reviewed <strong>2026-08-16</strong> · scope: fix-step instructions that adapt to the program a PDF was made with. Nothing new is collected or sent.",
    body: [
      {
        kind: "p",
        html: "The audit report's step-by-step fix instructions were written for Microsoft Word, but many agency documents — annual reports especially — are laid out in Adobe InDesign, whose menus are entirely different. The report now checks a piece of information the audit has always recorded and shown (the “Source Application” stored inside the PDF by the program that made it) and, when it names InDesign, shows InDesign instructions instead.",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "New",
            html: "<strong>Instructions for InDesign-made PDFs.</strong> Each fix now carries the InDesign menu path, verified against Adobe's current documentation on 2026-08-16. If the stored information is missing or names any other program, the report shows exactly what it showed before.",
          },
          {
            badge: "Note",
            html: "<strong>No new information is collected, stored, or transmitted.</strong> The choice of instructions happens in the reader's own browser, using a field the audit already stored and already displayed. Records keep the same fields as before; nothing about retention changes.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.76.0",
    meta: "Reviewed <strong>2026-08-15</strong> · scope: what the page-view counter is told. Less is now sent; nothing new is collected anywhere.",
    body: [
      {
        kind: "p",
        html: "The self-hosted page-view counter added in v1.72.0 was being told more than it needs. Two reductions, both applied before anything leaves the visitor's browser:",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "Hardened",
            html: "<strong>Web addresses are generalized before they are counted.</strong> Every repair job and every shared report has its own web address containing a long per-file code; the counter now records only the base page — <code>/remediate</code>, <code>/report</code> — so per-file addresses never reach the analytics server, and the dashboard counts how much each <em>feature</em> is used rather than accumulating one-visit rows per file.",
          },
          {
            badge: "Fixed",
            html: "<strong>Query strings are no longer sent at all.</strong> The stock counting script includes the page's full address in its report — on a repair-result page that full address contains the one-time download code for the repaired file. Both servers involved belong to ICJIA, but the analytics server has no business holding download codes; the reported address is now built from the page path alone, so no query string of any page can leave with the count.",
          },
        ],
      },
      {
        kind: "p",
        html: "The data-retention policy moved to <strong>v1.8</strong> to record this: § 14 has the dated entry, and §§ 8a and 9 now describe the generalized address. What is recorded per page view is otherwise unchanged, and audits themselves still do not pass through analytics at all.",
      },
    ],
  },
  {
    version: "v1.75.4",
    meta: "Reviewed <strong>2026-08-15</strong> · scope: the wording of the source-document advice. Nothing about what the tool does, collects, or stores changed.",
    body: [
      {
        kind: "p",
        html: "The card that recommends fixing the original document made a few promises stronger than the truth, and they were softened to match it. “The PDF inherits that structure automatically and no remediation is needed” now says a PDF <em>exported with tagging turned on</em> carries the structure with it, and that <strong>in most cases</strong> no further remediation is needed — with a reminder to re-check the exported PDF here to confirm. The tips about Microsoft Office's built-in accessibility checker no longer say it “finds and fixes most issues” (it finds many common ones and offers fixes — no automated checker covers most of the job, which is this tool's own standing caveat about itself). And a line claiming the “#1 cause” of PDFs needing repair, a statistic this tool does not measure, now calls it the classic cause instead.",
      },
    ],
  },
  {
    version: "v1.75.3",
    meta: "Reviewed <strong>2026-08-15</strong> · scope: the advice shown when an automatic repair fails. Nothing about what the tool does, collects, or stores changed.",
    body: [
      {
        kind: "p",
        html: "When the automatic repair can't improve a PDF, the page now says what accessibility practitioners consider the honest first answer: go back to the <strong>source document</strong> if it still exists — fix accessibility in Word (or PowerPoint, InDesign, Google Docs), re-export to PDF with tagging turned on, and re-check here. Repairing a finished PDF, with this tool or any other, is the last resort, and the page now says so in those words, with the step-by-step source-document guidance shown on this failure page too (it previously appeared only after a successful repair). One inaccuracy was corrected in the same pass: scanned documents were listed as a common reason repairs fail, but in fact they normally complete with a very low score rather than fail — the list now names the real reasons, including the safeguard that discards a repair attempt entirely rather than hand back a file that scored worse.",
      },
    ],
  },
  {
    version: "v1.75.2",
    meta: "Reviewed <strong>2026-08-15</strong> · scope: one word in the score notice. Nothing about what the tool does, collects, or stores changed.",
    body: [
      {
        kind: "p",
        html: "The amber notice under good-looking scores said “Even a <em>perfect</em> score is not a guarantee.” It appears for A and B grades alike, so “perfect” overstated its own trigger; it now says “Even a <strong>high</strong> score is not a guarantee” everywhere it appears — the report, the downloaded copy, the printout, and the landing-page announcement, which was corrected in place rather than re-shown to people who had already dismissed it. This entry is the on-the-record note of that in-place correction; dated entries below keep their original wording.",
      },
    ],
  },
  {
    version: "v1.75.1",
    meta: "Reviewed <strong>2026-08-15</strong> · scope: a display fix on two pages. Nothing about what the tool does, collects, or stores changed.",
    body: [
      {
        kind: "p",
        html: "On this page and the technical-details page, the “← Back” button was drawn on top of the small heading line beneath it — a layout slip introduced by a styling-framework upgrade earlier this year, reported by a reader with a screenshot. The spacing is now stated explicitly, the same gap is verified by an automated test on both pages so the upgrade path can't re-break it silently, and a sweep confirmed no other page uses the pattern that broke.",
      },
    ],
  },
  {
    version: "v1.75.0",
    meta: "Reviewed <strong>2026-08-15</strong> · scope: the fix steps and the repair results were made to tell the same story as the audit. Wording and reporting only — scoring, storage, and retention are unchanged.",
    body: [
      {
        kind: "p",
        html: "A user's fact sheet surfaced two honesty gaps. Its text was perfectly readable by screen readers — the only text-layer flag was three fonts not packed into the file, a minor finish item — yet the fix list showed the step written for scanned documents (“…a picture of text”), advice that was both alarming and wrong to follow. One check covers several different text problems, and the fix step now describes the one the audit actually found: embed the fonts, add the missing hidden tags, change the security setting that locks screen readers out, or run text recognition on a scan — whichever it saw.",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "Fixed",
            html: "<strong>Repair results now account for every finding.</strong> After an automatic repair, each issue the audit flagged is listed with exactly one outcome — fixed, improved but not fully fixed, <strong>no change</strong>, got worse, or newly visible — with its before-and-after score. A finding the repair could not touch now says so in plain words instead of sitting silently in a list; previously the same item could even appear as both “fully fixed” and “still outstanding” at once.",
          },
          {
            badge: "Note",
            html: "Nothing about scoring changed. A document whose text genuinely cannot be read still receives the lowest possible score — the change is that a small finish item is no longer described as that catastrophe, and the audit report and the repair results now use the same plain-language names for each finding.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.74.1",
    meta: "Reviewed <strong>2026-08-14</strong> · scope: the not-a-guarantee notice was made more prominent. Presentation only — its words, and everything else, are unchanged.",
    body: [
      {
        kind: "p",
        html: "Feedback from use: readers were stopping at the green “ready to publish” line and missing the notice below it — and that notice carries the single most important caveat on the page: a high automated score is not the end of the accessibility work. So the notice now leads with a solid amber banner (dark text on amber, readable in both themes) and sits directly under the verdict line, <em>above</em> the progress meter, on both report views, the before/after cards, and the downloadable report — the reassuring parts of the page can no longer be reached without passing it. Not a word of it changed, and nothing about what the tool does, collects, or stores changed either.",
      },
    ],
  },
  {
    version: "v1.74.0",
    meta: "Reviewed <strong>2026-08-14</strong> · scope: links added to the printer-friendly action plan. No storage, retention, or behavior change beyond the printed page itself.",
    body: [
      {
        kind: "p",
        html: "The printer-friendly action plan now links every accessibility rule it cites to the exact page of the W3C standard that explains it — and because a link on paper can't be clicked, printing writes each web address out in full next to the rule, so a reader can type it in. The list of rules the tool never machine-checks links out the same way, and the page's footer names the address of the full standard.",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "Hardened",
            html: "<strong>Addresses from stored reports are checked before they print</strong> — on a shared report page, the rule addresses arrive from stored data, so each one is verified to be an ordinary web address before it is rendered; anything else is dropped rather than linked or printed. An automated test pins this.",
          },
          {
            badge: "Note",
            html: "The printed page stays completely self-contained: it runs no scripts and loads nothing from the network — a link on it is text until a reader chooses to follow it from their browser.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.73.2",
    meta: "Reviewed <strong>2026-08-14</strong> · scope: a truth pass over the pages that explain scoring. Wording only — the scoring itself did not change today.",
    body: [
      {
        kind: "p",
        html: "A reader asked whether the front page's claims were still accurate, and the check widened into every page that explains how scores work. The scoring engine was improved in early August so that a category that doesn't apply to a document (no tables, no images) counts in the document's favor instead of being dropped — but four explanatory pages still described the old dropped-and-rebalanced arithmetic. Those pages (the technical explainer, the scoring-rubric panel, the methodology note on every report, and the machine-readable summaries) now describe the arithmetic the engine actually performs, and say plainly that the old method was removed because it made simple documents look worse than they were.",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "Fixed",
            html: "<strong>The explanation now matches the engine</strong> — every page that describes scoring states the current rule: a check that doesn't apply counts as passing; only checks the tool genuinely could not run sit outside the score; and the score is capped by the worst open finding, with the letter grade following the score.",
          },
          {
            badge: "Note",
            html: "<strong>The front page's operational claims were verified against the code, and held</strong> — the repair pipeline and its no-lower-score guarantee, uploads processed in memory, repaired files deleted on first download or after 30 minutes with the deletion then verified, and a usage history that names no person. One tile was extended rather than corrected: the no-AI tile now also mentions the self-hosted page-view counter added in v1.72.0, so it cannot be read as denying it.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.73.1",
    meta: "Reviewed <strong>2026-08-14</strong> · scope: a follow-up to the notice below, plus a small wording pass. No storage or security control changed.",
    body: [
      {
        kind: "p",
        html: "A follow-up to the v1.73.0 notice described just below. That notice appears with high grades (A or B) — the reports most likely to be read as finished. This release completes the rule for every other grade: reports graded C, D, or F now carry a compact one-line reminder in the same place — <em>whatever the grade, automated checks are only part of the job; a person still has to review the document</em>. So no report, at any grade, is silent about the human half of accessibility. The same reminder rides the downloadable report file, and the share-by-email text now includes its one-line caveat at every grade rather than only high ones.",
      },
      {
        kind: "p",
        html: "Also on the record for completeness: a few phrases across the site and reports that described a good result as “strong” now say “high” (a high score, a high grade, a high mark). That rewording also reached the v1.73.0 entry just below — it was corrected before that version ever went live, so no visitor or auditor saw the earlier phrasing; this entry is the disclosure of that correction. Earlier dated entries in this history keep their original wording, as always. Nothing about what the tool does, collects, or stores changed in any way.",
      },
    ],
  },
  {
    version: "v1.73.0",
    meta: "Reviewed <strong>2026-08-14</strong> · scope: a new warning shown beside high scores. Nothing about audits, uploads, storage, or the database changed.",
    body: [
      {
        kind: "p",
        html: "Reports with a high grade (A or B) now show a prominent amber notice directly under the score: <strong>even a perfect score is not a guarantee</strong>. Automated checking can verify that accessibility structure is <em>present</em> — a title, a document language, tags, text descriptions on images, table headers — but it cannot judge whether any of it is right, and it cannot tell you the document actually works with a screen reader. Only a person can. The notice splits the work into the half software finished (which is what the score measures) and the half a person still has to do, says how many accessibility criteria were never machine-checked at all for that document, and points to the report's “Still worth checking by hand” checklist.",
      },
      {
        kind: "findings",
        items: [
          {
            badge: "New",
            html: "<strong>The warning follows the score wherever the score goes</strong> — both report views, the before/after cards on the automatic-fix page, the printer-friendly action plan, the downloadable report file, and the share-by-email text all carry it, and one shared rule decides when it appears, so the surfaces cannot fall out of step.",
          },
          {
            badge: "Note",
            html: "<strong>Deliberately no percentage</strong> — the notice never says “automated tools catch a third of issues”. A figure beside a letter grade tends to be read as the grade (a lesson this tool has already paid for), and a borrowed statistic would be someone else's number about someone else's tool. The only number shown is this audit's own count of criteria it never machine-checked, and an automated test keeps any percentage from appearing there.",
          },
          {
            badge: "Note",
            html: "No new information is collected and nothing new is stored — the notice is assembled entirely from the audit result the report already contains, and its text is written in this repository, never taken from the document or from any visitor.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.72.0",
    meta: "Reviewed <strong>2026-08-14</strong> · scope: the addition of page-view analytics — what the counter can see, where it reports, and what the browser is now allowed to talk to. Nothing about audits, uploads, or the database changed.",
    body: [
      {
        kind: "p",
        html: 'The site now counts page views with <a href="https://plausible.io/privacy-focused-web-analytics" target="_blank" rel="noopener noreferrer">Plausible</a>, an open-source, cookie-free analytics tool — self-hosted by ICJIA on its own server (<code>plausible.icjia.cloud</code>), so no commercial analytics provider, ad network, or tracker receives anything. This review covers the two things that change: what is recorded about a visit, and the one new network destination the browser is permitted.',
      },
      {
        kind: "findings",
        items: [
          {
            badge: "New",
            html: "<strong>What the counter records — and what it cannot do</strong> — per page view: the page address, where the visitor came from, browser and operating-system family, device type, and country/region. No cookie is set and no IP address or browser signature is stored; views within one day are linked by a code that is scrambled afresh every 24 hours, so the counter cannot recognize a returning visitor tomorrow and cannot follow anyone to another website. Nothing about an uploaded document is ever included — audits do not pass through analytics at all.",
          },
          {
            badge: "Hardened",
            html: "<strong>The browser's allow-list grew by exactly one name, and a test holds it there</strong> — the Content-Security-Policy, which previously let the site talk only to itself, now additionally allows the analytics server, in the two narrow permissions the counter needs (loading the script, and reporting a view). An automated test asserts this is the <em>only</em> outside address in the entire policy, so a second one cannot appear without a test failing. The protection against injected scripts is unchanged.",
          },
          {
            badge: "Note",
            html: 'The audit application never touches the data — the visitor\'s browser reports straight to the analytics server; nothing is routed through, stored on, or forwarded by this tool\'s own server. The <a href="/data-retention">data-retention policy</a> moves to v1.7 and documents the new store in §§ 7, 8, 8a and 9 — including re-marking § 8a\'s "no analytics" verification row as qualified rather than leaving it to overclaim.',
          },
        ],
      },
    ],
  },
  {
    version: "v1.71.0",
    meta: "Reviewed <strong>2026-08-13</strong> · scope: record-keeping about the service's own behaviour, after a false alarm. No new findings; nothing about what is stored, how it is used, or how long it is kept changed.",
    body: [
      {
        kind: "p",
        html: "<strong>The service was reported as being offline on August 12. It was not, and the reason it took so long to establish that has now been fixed.</strong> The tool had been running continuously for days, nothing had crashed, and it answered a real document check three minutes before anyone looked into it. What had actually happened is that a large automated run — the periodic check of documents across agency websites — was making requests far faster than the tool allows unidentified callers to, so the tool slowed it down, exactly as designed. From the other end that looks the same as a server that has stopped answering. The awkward part was that the tool kept no record of having slowed anything down, so the one fact that would have answered the question in seconds had to be pieced together from indirect evidence.",
      },
      {
        kind: "p",
        html: "<strong>The tool now writes a note to its own log whenever it slows a caller down, and says plainly when a caller's access key was not recognised.</strong> That second point is the one that mattered: a run using a wrong key and a run using no key at all behaved identically — both were quietly treated as anonymous and slowed — and now they are told apart and named. <strong>These notes deliberately record no information about who was calling.</strong> No network address, no access key, no browser identifier. This service keeps no record of the people who use it, and its speed limits are tracked only in memory and forgotten when it restarts; writing that information into a log file would put it on disk and contradict the retention rules described on this page. What gets written is the kind of request, the limit that applied, and whether a key was recognised — enough to explain a slowdown, and nothing about the person who experienced it.",
      },
      {
        kind: "p",
        html: "<strong>The service-status page now also reports whether the access key for trusted automated systems is in place.</strong> If that key is ever lost — a server restart in the wrong conditions is enough to lose it — every caller, including the agency's own document sweep, is silently limited to the slow lane, while every other indicator on the status page continues to look perfectly healthy. That state now shows on the status page and triggers the same automatic alert already used for other problems, so it is noticed rather than discovered weeks later. The page reports only whether the key is present or absent — never the key itself, nor any part of it. <strong>Nothing about what is stored, how it is used, or how long it is kept changed in this release</strong>, and no part of the service gained new exposure: no new address to visit, no new information to submit, and no change to the speed limits themselves.",
      },
    ],
  },
  {
    version: "v1.70.0",
    meta: "Reviewed <strong>2026-08-13</strong> · scope: one numeric raise to the file-size limit. No new findings; nothing about what is stored, how it is used, or how long it is kept changed.",
    body: [
      {
        kind: "p",
        html: "<strong>The largest file the tool will accept goes from 15 MB to 25 MB.</strong> A large audit of agency documents ran on August 12–13 and checked 1,966 PDFs. Six were turned away for being too big — and all six were ordinary published documents, including a budget-committee packet and an HR newsletter. The limit exists to protect the server's memory, not to judge documents, so it has been raised to let those through. Two very large reports (roughly 50 MB and 60 MB) are still refused on purpose: accepting files that size would risk the server running out of memory when two people upload at once, and a 60 MB document has an accessibility problem of its own worth fixing at the source.",
      },
      {
        kind: "p",
        html: "<strong>Nothing else about the service changed, and no part of it gained new exposure.</strong> The number of documents checked at the same time is unchanged (two), so the most memory the tool can use for uploads is still bounded — now 50 MB instead of 30 MB. Every other protection is exactly as it was: the checks on where a file may be fetched from, the limits on how many requests one caller may make, the guards against oversized or malformed documents, and the scheduled deletion of stored data. The same audit run also produced two findings that were referred elsewhere rather than changed here: eight files on an agency website are web pages saved with a <code>.pdf</code> name, which this tool correctly refuses to grade, and a slow run was traced to a missing access token rather than to any fault in the service.",
      },
    ],
  },
  {
    version: "v1.69.0",
    meta: "Reviewed <strong>2026-08-11</strong> · scope: the accuracy of the fix instructions shown on reports — a guidance-copy release, not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>A user followed a report's fix steps and couldn't find the menu items in Adobe Acrobat — because Adobe redesigned Acrobat's entire menu system in 2023, and parts of this tool still described the old one.</strong> Every Word and Acrobat instruction in every report was re-checked, word for word, against the vendors' current official documentation on 2026-08-11. Acrobat steps now show the current menu path first with the older “classic” path in parentheses wherever the two differ, so the instructions match the screen whichever version a reader has — important here, since machines across the agency run a mix of both.",
      },
      {
        kind: "p",
        html: "<strong>Every card of fix steps now also says what it was written for and who to call.</strong> Each card names the exact versions the steps were verified against (Microsoft 365 Word and Adobe Acrobat Pro version 26, August 2026), explains how to recognize which Acrobat interface you are looking at, and — when the menus still don't match — says to contact IDS at ICJIA to have the software brought current. <strong>Nothing about what is stored, how it is used, or how long it is kept changed in this release</strong>, and no part of the service gained new exposure: instruction text and one small note on the report pages are the whole of it.",
      },
    ],
  },
  {
    version: "v1.68.3",
    meta: "Reviewed <strong>2026-08-10</strong> · scope: the wording of the home-page announcement about sign-in — a copy change, not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>The home-page announcement said the sign-in system had been removed. It now also says the thing that matters more: it was never switched on.</strong> Sign-in code existed from the tool's first release, but the setting that would have required anyone to log in was off in every version ever published — the server treated every visitor as anonymous before it even looked for a login, and the space where an account holder's email address would have gone held a placeholder for everyone. Nobody ever needed an account here, and no audit was ever tied to one. That was checked release by release, against every published version, before the sentence was written.",
      },
      {
        kind: "p",
        html: "<strong>The wording is deliberately careful.</strong> The sign-in feature <em>was</em> built and shipped, so this record does not claim it was never written — only that it was never turned on, which is what the code history shows for every released version. It was deleted outright in v1.68.0 rather than left sitting unused in a tool this widely used, along with the columns that could have held an email address, IP address, or browser identifier. <strong>Nothing about what is stored, how it is used, or how long it is kept changed in this release</strong>, and no part of the service gained new exposure: one sentence of text on the home page is the whole of it.",
      },
    ],
  },
  {
    version: "v1.68.2",
    meta: "Reviewed <strong>2026-08-09</strong> · scope: every claim on this page, the README, and the technical pages re-checked against the code after the identifier removal — not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>After removing sign-in and identifier storage, we re-verified this page line by line against the code — and fixed what the check found.</strong> The most visible correction: the header above said <em>Policy v1.4</em> while this very change log said v1.6; the header had simply not been updated, twice in a row. It now reads from the same version as § 14's newest entry, and an automated test keeps the two in agreement from now on.",
      },
      {
        kind: "p",
        html: "<strong>Other corrections, all wording:</strong> § 9 no longer lists sign-in cookies (there is no sign-in) and now describes the real remediation brake — a daily per-caller cap counted in server memory; § 11's example link now shows the access token a receipt requires; § 7 gains a row for the web server's own access log, the one identifier-bearing store whose retention (about 52 days, managed by the host) was not listed anywhere; and several technical descriptions were tightened to match the code exactly, down to which checks run in a separate helper process. One small code change accompanied the words: remediated files are now explicitly restricted to owner-only permissions, so a promise § 9 was already making is enforced rather than assumed. <strong>Nothing about what is stored, how it is used, or how long it is kept changed.</strong>",
      },
    ],
  },
  {
    version: "v1.68.1",
    meta: "Reviewed <strong>2026-08-09</strong> · scope: an emergency fix, found by our own verification pass within the hour.",
    body: [
      {
        kind: "p",
        html: "<strong>Shared-report links stopped working for about an hour after the v1.68.0 release, and this fix restored them.</strong> One database query still asked for the deleted email column; the database rightly refused, and every shared-report link answered with an error instead of the report. No data was lost and nothing was exposed — the links simply failed until this release.",
      },
      {
        kind: "p",
        html: "<strong>How it was caught matters:</strong> not by a visitor report, but by the verification pass this project runs on its own documentation — checking §&nbsp;8a's claim that every database statement had been enumerated turned up the one that hadn't. A new automated test now loads a shared report against the real, migrated database shape on every future change, so this exact failure cannot ship silently again.",
      },
    ],
  },
  {
    version: "v1.68.0",
    meta: "Reviewed <strong>2026-08-09</strong> · scope: the sign-in system removed, and identifier storage removed at the database level — the largest data-minimization change in the tool's history.",
    body: [
      {
        kind: "p",
        html: "<strong>The tool no longer has accounts, sign-in, or any way to know who you are.</strong> The optional email sign-in — login codes, sessions, the My History page — is gone entirely, and with it the only email the service could ever send. The tool is free and open: upload a document, read the report, leave. Nothing to register for, nothing to remember, nothing to be locked out of.",
      },
      {
        kind: "p",
        html: "<strong>And the database physically cannot store identifiers any more.</strong> This release did not just stop writing the email, IP-address, and browser columns — it <em>deleted the columns themselves</em>, along with every value they already held, and removed the sign-in tables outright. What each audit leaves behind is metadata — the file's name, its score and grade, the date, and a fingerprint of its bytes. Data <em>about</em> the file, never the file — and now, about nobody. An automated test asserts the columns are absent from the schema, so they cannot quietly return.",
      },
      {
        kind: "p",
        html: "<strong>What this deliberately does not claim:</strong> that the records hold nothing personal. A file <em>named after a person</em> stores that person's name, and a report someone chooses to share quotes short labels from inside the document. The caller's network address is still used for a moment, in server memory only, to limit request rates — written nowhere. The hosting layer's ordinary web-server logs exist outside the application, as on effectively every website (§&nbsp;8a). Backups made before this release keep the old shape for about five days until rotation replaces them. <strong>Recorded as v1.6 in the policy's own change log.</strong>",
      },
    ],
  },
  {
    version: "v1.67.1",
    meta: "Reviewed <strong>2026-08-09</strong> · scope: precise wording about what the retained records are, for federal and state auditors — not a security release, and nothing stored changed.",
    body: [
      {
        kind: "p",
        html: "<strong>The records this service keeps are now described as exactly what they are: metadata about the audit.</strong> A retained row says that a file with this name was checked on this date and received this grade. It is a record <em>about</em> the document, never a copy of any part of it — it says the file was checked, not what the file said. The status page's backup explanation and §&nbsp;7a of this policy now both use those words.",
      },
      {
        kind: "p",
        html: "<strong>And the policy is deliberately precise about personal detail, because auditors test claims.</strong> It would be shorter to say the records contain nothing personal — and it would be wrong: a sign-in email is personal, the routine connection log (IP address, browser) is personal, and a file name as uploaded can itself name a person. So the policy names those fields and their deletion schedule instead of waving them away, and this project's automated tests fail any page that claims the records are free of personal detail. What the records never hold is the document, or anything read from inside it. <strong>Nothing about what is stored, how it is used, or how long it is kept changed in this release — wording only</strong>, recorded as v1.5 in the policy's own change log.",
      },
    ],
  },
  {
    version: "v1.67.0",
    meta: "Reviewed <strong>2026-08-09</strong> · scope: reports now name every heading, so people can see exactly what to fix — not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>Reports now show your document's heading outline with its actual text.</strong> Where a report used to say a Word document had “3 real heading(s)”, it now lists them — <em>Heading 1 “Annual Report”, Heading 2 “Introduction”</em>, and so on — and PDF reports, which showed only the pattern of heading levels, now show each heading's text beside its level. This exists for the person who has to do the fixing: “a heading level is skipped” is only actionable when you can see <em>which</em> heading it is.",
      },
      {
        kind: "p",
        html: "<strong>Word reports also list paragraphs that only look like headings.</strong> Text made bold and large reads as a heading to the eye but is invisible as one to a screen reader. Each such paragraph is now quoted on the report, so an author can go straight to it and apply a real Heading style rather than hunting through the document.",
      },
      {
        kind: "p",
        html: "<strong>The technical detail on each report card now starts open instead of hidden behind a toggle.</strong> Someone who chose the detailed view has already asked for depth, and the specifics — which image, which heading, which table — are the point of it. Each card's toggle still collapses the detail for anyone who prefers the summary. The new outline text is read from the document you upload and shown back to you on your own report, exactly like every other finding; <strong>no change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.66.0",
    meta: "Reviewed <strong>2026-08-08</strong> · scope: an adversarial audit of the scoring itself, and the corrections it produced — not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>The scoring was audited against a set of real documents whose faults we know, and the verdict was that it tells the truth.</strong> Every failure it reported and every clean result it gave was checked by hand against what is actually inside the files, and all of them held up. Two kinds of correction came out of the review, and both are about honesty rather than about catching more or fewer problems.",
      },
      {
        kind: "p",
        html: "<strong>First: style preferences no longer lower a document's grade.</strong> A few rules the tool scored — such as “a document should have exactly one top-level heading” — are style-guide advice, not requirements of the accessibility standard. A document meeting the standard could still lose its A to one of them. Those rules are now stated as advice on the report without affecting the score. Because of this, <strong>a document audited again today may score somewhat higher than an older shared report of the same file</strong> — the old link keeps the number it always had, and the difference is the removed style rules, not a change in what passes or fails the standard.",
      },
      {
        kind: "p",
        html: "<strong>Second: the report is more explicit about what automation cannot see.</strong> The list of things this tool never checks now includes five more parts of the standard (among them whether colours alone carry meaning, and whether passages in another language are marked for screen readers). And when every image in a document has been marked “decorative” — which hides them from screen readers entirely — the report now says so prominently and asks a person to confirm none of them actually carries information, instead of staying silent. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.65.1",
    meta: "Reviewed <strong>2026-08-08</strong> · scope: colour added to the header status panel's marks — not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>The header status panel's marks are now coloured</strong> — a green check for a part of the service that is up, a red cross for one that is down, grey for one that has not been checked yet. The colour is an addition, not a replacement: every state is still written out as a word, so the panel reads the same for anyone who cannot distinguish the colours. The colours used are the same ones already verified against the contrast standard in both the dark and light themes, and an unverified state deliberately stays grey rather than green — the panel never presents something unchecked as something known to be fine. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.65.0",
    meta: "Reviewed <strong>2026-08-08</strong> · scope: the status light in the page header becomes a link with an accessible detail panel — not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>The status light in the page header is now a button to the status page, and it can tell you what it knows.</strong> Hovering over it — or reaching it with the keyboard — shows a small panel naming each part of the service behind that light: the database, the three checking engines, the nightly backup, and disk space, each marked up or down in words, not colour alone. Clicking it goes to the full status page. The panel is honest about uncertainty: a part of the service that has not been checked yet says <em>not yet checked</em> rather than being presented as fine, because the one indicator visible on every page should never claim more than the service has actually verified.",
      },
      {
        kind: "p",
        html: "<strong>Checking the panel in both colour themes caught a real accessibility fault, which was fixed.</strong> The status wording in the header — the green “audit server online” itself — measured well below the required contrast against a light background. In a tool whose job is catching exactly this in other people's documents, that is not acceptable in its own header. The colours now meet the standard in both themes, verified by an automated check that measures them against every background they actually appear on, including while hovered. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.64.0",
    meta: "Reviewed <strong>2026-08-08</strong> · scope: completing this section's own record — no change to the tool itself, and not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>This history is now complete.</strong> Twenty-seven releases had no entry here — almost all of them small follow-up corrections rather than significant changes — while the project's own change log carried every one. Each has now been written up in the same plain language as the rest of this section, from that release's change log. Nothing that was already published has been altered.",
      },
      {
        kind: "p",
        html: '<strong>Those entries say so.</strong> Every one of them is marked <em>"entry recorded 2026-08-08"</em>, and the note above this list explains why. The releases were reviewed at the time; this write-up of them was not, and a record that presents a reconstruction as though it had been written on the day is worth less to the auditor reading it than one that is honest about which of its entries came later.',
      },
      {
        kind: "p",
        html: "<strong>One of the new entries records something that did not work</strong> — a first attempt, on 7 August, at resolving a report that showed a letter grade and a number contradicting each other. It was replaced the same day. It is included because how a mistake in the scoring was found and corrected is part of the record, and leaving out the unsuccessful step would make that history read more smoothly than it deserves. An automated check now confirms that every release since v1.18.0 has an entry both here and in the project's technical documentation, so this section cannot fall behind again. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.63.2",
    meta: "Reviewed <strong>2026-08-08</strong> · scope: how this page's own history is stored and rendered — no change to any record, and not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>This history is now stored as records rather than as hand-written page markup.</strong> Every entry below used to be its own block of layout code — the same card, the same heading, the same coloured label, copied and re-edited for each release, in a single file of more than three thousand lines. The wording of each entry is unchanged; only the way it is stored and displayed has changed. It was verified by rendering the page both the old way and the new way and comparing the text of all sixty-five entries character for character: identical.",
      },
      {
        kind: "p",
        html: "<strong>Why an auditor should care at all:</strong> a record that is expensive to add is a record that eventually gets skipped, and this section is the evidence of due diligence for every release. Adding an entry now takes a few lines instead of fifty. An automated check also now refuses to let a release ship unless this section has an entry for it, so the gap cannot be left open by oversight — and separate checks confirm these records contain only text and formatting, never anything that could run in your browser. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.63.1",
    meta: "Reviewed <strong>2026-08-08</strong> · scope: the status light in the page header, and one dead link on a printout — not a security release.",
    body: [
      {
        kind: "p",
        html: '<strong>The status light in the header now tells you the same thing the status page does.</strong> It was only checking whether the service was running at all, so it could show a confident green "online" while the status page was reporting a real problem — an overdue backup, a checking engine that had stopped answering. It now turns amber and says <em>degraded — see status</em>, and naming what is wrong is a click away. It deliberately does not ask the status page itself: that page is deliberately cheap to check and rate-limited so the external uptime monitor is never crowded out, and a light on every page in every open tab would have crowded it out.',
      },
      {
        kind: "p",
        html: "<strong>The printer-friendly steps for an auto-remediated file no longer print a link that goes nowhere.</strong> The printout carried the address of the remediation job it came from — but that page expires, and by then the file has already been fixed, so the link led nowhere useful. It has been removed from that printout. Reports, which stay available for a year, still print their address. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.63.0",
    meta: "Reviewed <strong>2026-08-08</strong> · scope: a printable fix plan, and one contradiction about whether a file could be published — not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>Every report now has a printer-friendly version of its fix steps.</strong> The button opens a clean page in a new tab, listing each fix in full — both how to correct it in the original Word or PowerPoint file and how to correct it in Adobe Acrobat — so it can be printed, saved as a PDF, or handed to whoever actually edits the document. That page is built entirely inside your own browser from the report already on screen: nothing is sent anywhere to produce it, and the page itself loads nothing from the internet.",
      },
      {
        kind: "p",
        html: "<strong>The audit report and the auto-remediation result no longer disagree</strong> about whether a file is ready to publish. They were using two different rules, so one file could be called ready on one page and not ready on the other. Both now use the same rule, and when a file's results cannot be re-read the tool says so rather than assuming the file is fine. Reports also always open in the visual, step-by-step view, and the control for switching to the detailed view is far easier to find. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.62.0",
    meta: "Reviewed <strong>2026-08-08</strong> · entry recorded 2026-08-08 · scope: two controls that were being missed on screen — not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>The control for choosing how to read a report is now unmistakably a control.</strong> It had been two small labels in a strip above the report, and it was missed — including by the person who asked for it. Someone looking for the plain-language, step-by-step plan could not find the button that shows it, and reported the plan as having been removed. It had not been. The chooser now runs the full width of the page, asks its question out loud, and says in a sentence what each option actually gives you. The option you are currently reading is marked with the word <em>Showing</em> rather than by colour alone, because colour is not available to every reader — a requirement this tool checks other people's documents against, and should not fail itself.",
      },
      {
        kind: "p",
        html: "<strong>After an automatic repair, whatever is still outstanding is now shown by default.</strong> It used to sit behind a closed panel, so the only thing visible after a successful repair was a green result and a one-line count. That is exactly the moment someone is most likely to decide a file is finished, and a count reads as a footnote beside a success message. The detail is still collapsible; it simply starts open whenever anything remains. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.61.1",
    meta: "Reviewed <strong>2026-08-08</strong> · scope: one fewer thing stored on your device — not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>Every report now opens in the visual, step-by-step view</strong>, for everyone, every time. The choice between the visual and detailed views used to be remembered on your device, which meant anyone who looked at the detailed view once saw it for every report afterwards — and because the step-by-step fix list only appears in the visual view, people reported that the plan had vanished. That preference is no longer stored anywhere, and the old value is deleted from your browser the next time you open a report. The toggle still works; it simply applies to the report in front of you rather than to every report you will ever open. <strong>No change to what data is collected, how it is used, or how long it is kept — this removes one of the few things the tool kept on your device.</strong>",
      },
    ],
  },
  {
    version: "v1.61.0",
    meta: "Reviewed <strong>2026-08-08</strong> · entry recorded 2026-08-08 · scope: the home page settling as it loads, and the length and colour of the announcement — not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>The home page no longer jumps as it finishes loading.</strong> The announcement at the top used to appear only after the page had already drawn, pushing the heading and the upload area down. It is now sent complete by the server. One consequence is worth stating plainly here, of all places — the alternative fix would have required storing a small marker in your browser so the server could know you had already dismissed an announcement. That was rejected. This tool lists every piece of information it keeps on your device, and adding another one to remove a flicker is not a trade worth making.",
      },
      {
        kind: "p",
        html: "<strong>Announcements are now capped at four or five sentences.</strong> Two had grown to the length of a memo and dominated the page they sit above. Shorter is also less disruptive for anyone who has already dismissed them. The announcement was also given its own background shade so it reads as distinct from the page without competing with the report below it; the text contrast was measured at 11.9:1 in the dark theme and 9.2:1 in the light one, well above the 4.5:1 standard. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.60.1",
    meta: "Reviewed <strong>2026-08-08</strong> · entry recorded 2026-08-08 · scope: one number on the public status page shown in the wrong unit — not a security release.",
    body: [
      {
        kind: "p",
        html: '<strong>The status page reported free disk space in five-digit megabytes</strong> — <em>"61112.6 MB free of 78284.0 MB"</em> for what is really a 76 GB volume. Accurate, unreadable, and on the one page written specifically for people who do not think in megabytes. It now reads <em>"78% (59.7 GB free of 76.4 GB)"</em>. As before, the page reports a percentage and a size and never a location on disk. Found by looking at the live page rather than by an automated check, because nothing had ever fed that formatter a number that large; three checks now cover it. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.60.0",
    meta: "Reviewed <strong>2026-08-07</strong> · entry recorded 2026-08-08 · scope: three items carried over from the 2026-08-05 operational review, including one accessibility failure in this tool itself.",
    body: [
      {
        kind: "p",
        html: "<strong>The service now watches its own free disk space.</strong> A full disk would break uploads and the nightly backup at the same time, silently, while every other check on the status page stayed green — the first symptom would otherwise be a failed restore months later. Free space is now reported on the status page and the service flags itself as needing attention below 10%, where the external monitoring already watches. It is deliberately a warning and never an outage: the tool can still check documents on a nearly-full disk, and raising an alarm about an outage that has not happened is how alarms come to be ignored. <strong>No location on disk is ever published</strong> — an automated check asserts the published figures contain no file path at all.",
      },
      {
        kind: "p",
        html: '<strong>The server now gives up restarting a process that cannot stay running.</strong> Previously a failed deployment would have been restarted for ever: a silent loop burning processor time and filling the log disk, while the monitoring showed the service as "online" in the gaps between crashes. A process that cannot stay up for twenty seconds, ten times in a row, is now marked as failed and left down — visible failure being far better than invisible failure. A written procedure for rotating the server\'s log files was added at the same time.',
      },
      {
        kind: "p",
        html: "<strong>An accessibility failure in this tool was found and fixed.</strong> The colours used for grades and severity ratings are tuned for the dark theme, where they are comfortably readable. On the light theme the same colours measured between 1.9:1 and 3.8:1 against their backgrounds — <em>every one of them below the 4.5:1 minimum this tool checks other people's documents against</em>. There are now two sets of colours, one per theme, each verified against all three background shades it is actually painted on. A separate re-check also found a link whose spoken name did not match its visible words, which would have prevented someone using voice control from activating it. It was the site's only remaining accessibility failure; an independent audit of the site now scores 100 for accessibility. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.59.2",
    meta: "Reviewed <strong>2026-08-07</strong> · entry recorded 2026-08-08 · scope: making the human-review statement unconditional, and rewriting the status page for the people who actually open it.",
    body: [
      {
        kind: "p",
        html: '<strong>Every report now carries the human-review statement, whatever the score.</strong> It had appeared only when there was something to list — which meant a badly failing document, the case that most needs a person to look at it, could receive no such statement at all. Every report now opens that section with a standing line: <em>no automated audit, this one included, can tell you a document is accessible; it can only tell you where it definitely is not.</em> A document that still has problems is additionally told that working through the list is not the finish line, because a completed list is a stronger pull toward "done" than a perfect score ever is.',
      },
      {
        kind: "p",
        html: "<strong>The status page now describes each of its checking programs in plain language.</strong> The people who open a status page are rarely engineers; they are usually managers arriving sceptical — <em>what is this thing, and is it really doing what you say it is?</em> Each entry now says what the program is, who maintains it, what it does here specifically, and what its running does and does not prove. In particular veraPDF is maintained by an independent organisation, which is what stops this tool marking its own homework. The page also states the moment it was generated, and the one genuinely cached figure on it now says when its reading was taken rather than implying it is live. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.59.1",
    meta: "Reviewed <strong>2026-08-07</strong> · entry recorded 2026-08-08 · scope: a checklist added the day before reached only one of the two ways of reading a report.",
    body: [
      {
        kind: "p",
        html: '<strong>The "still worth checking by hand" list now appears however you read a report.</strong> It had been added to the step-by-step view only, while the wording elsewhere on the page had already been changed to point at it — so in the detailed view it pointed at something that was not there. On a document with no problems that view showed nothing at all beneath the score, and a reader\'s honest reaction was to ask where the findings had gone. The list now appears on all three surfaces that display a report, and an automated check pins each one, because this is the second time in two releases that something shipped into one view and not the other. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.59.0",
    meta: "Reviewed <strong>2026-08-07</strong> · entry recorded 2026-08-08 · scope: what a person still has to check when the automated result is perfect.",
    body: [
      {
        kind: "p",
        html: '<strong>Every report now lists what still needs a human eye — including reports that scored 100.</strong> A perfect document previously produced an empty list of fixes and a short green panel, which left its author with the obvious question: <em>so what should I still look at?</em> The honest answer is that these checks confirm accessibility structure <em>exists</em>; almost none of them can judge whether it is <em>correct</em>. A picture described as "image" passes. A heading that describes the wrong section passes. That gap is invisible on a clean report unless the report names it.',
      },
      {
        kind: "p",
        html: "Every check that <strong>passed</strong> now contributes an entry saying what was actually established and what judgment only a person can make — phrased as something to go and do, not as a restatement of the check. Checks that failed are deliberately absent, since those are already the list of fixes. Below that, the accessibility criteria this tool does not evaluate at all are listed by name with links to the published standard, described plainly as unexamined rather than as passed. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.58.4",
    meta: "Reviewed <strong>2026-08-07</strong> · entry recorded 2026-08-08 · scope: an older shared link disagreeing with a fresh check of the same file — the last correction in that day's scoring work.",
    body: [
      {
        kind: "p",
        html: "<strong>A report shared earlier now shows the same score as checking the file again today.</strong> Found by testing the previous release on the live service: a shared link to a Word file showed 71 while re-uploading the identical document gave 79 — precisely the disagreement that recalculating on open exists to prevent. The recalculation had only been able to move a score <em>down</em>, so it could pick up the corrections that lowered scores but was structurally unable to pick up the one that <em>raised</em> simple documents. Saved reports keep everything the calculation needs, so the score is now fully re-derived when a stored report is opened.",
      },
      {
        kind: "p",
        html: "The stored records themselves are still never rewritten — they are an agency's evidence of what was computed on the day. The recalculation happens when a report is displayed. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.58.3",
    meta: "Reviewed <strong>2026-08-07</strong> · entry recorded 2026-08-08 · scope: documents being marked down for being simple.",
    body: [
      {
        kind: "p",
        html: "<strong>A document is no longer penalised for being short.</strong> Checks that do not apply now count as passing and stay in the calculation, instead of being removed from it — a document with no tables does not have a table problem, it has no tables. Reported from real use: a one-page public notice and a longer meeting agenda, both missing a document title and nothing else in common, scored 71 and 79 — <em>the notice worse, despite having fewer problems</em>, because only three of its ten checks applied at all and its single fault therefore counted for more than half its score. Both now score 79.",
      },
      {
        kind: "p",
        html: 'Two limits were kept deliberately, and both were confirmed by test rather than by argument. A check the tool could not evaluate is still left out rather than assumed to have passed — "no tables were found" and "contrast could not be determined" mean different things, and scoring the second as a pass would be an unverified claim. And a scanned document still scores zero, because its checks come back empty for the opposite reason: a screen reader gets nothing from it at all. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.58.2",
    meta: "Reviewed <strong>2026-08-07</strong> · entry recorded 2026-08-08 · scope: the score and the letter grade contradicting each other on the page.",
    body: [
      {
        kind: "p",
        html: "<strong>The score and the letter grade agree again.</strong> The previous day's change had capped the <em>letter</em> at a document's worst problem while leaving the number alone, so a report could show a <strong>D</strong> directly above <strong>80 out of 100</strong> — wrong on its face against the scale this tool publishes, where 90 and above is an A, 80 a B, 70 a C, 60 a D and anything lower an F. It was reported twice, in the plainest possible terms: <em>\"a 'D' is not 80\"</em>, then <em>\"80 and above is a B. Not a C, and certainly not a D.\"</em>",
      },
      {
        kind: "p",
        html: "The intermediate attempt (v1.58.1) tried to solve this by relabelling the number rather than changing it; a reader read the relabelled figure as a percentage grade within minutes. <strong>Any figure out of 100 beside a letter grade is read as the grade</strong>, whatever it is called. So the number itself now carries the limit — a minor problem holds a document at 89, a moderate one at 79, a critical one at 69 — and the letter is worked out from that number exactly as it always was. Those ceilings are derived from the published bands rather than written down separately, so they cannot drift apart from them. Every contradiction the first attempt fixed stays fixed: across the 31-document reference set the distribution of letters is identical. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.58.1",
    meta: "Reviewed <strong>2026-08-07</strong> · entry recorded 2026-08-08 · scope: a first, unsuccessful attempt at the contradiction corrected later the same day by v1.58.2.",
    body: [
      {
        kind: "p",
        html: '<strong>This release tried to resolve a report showing a D above 80 out of 100 by relabelling the number rather than changing it.</strong> The letter was the verdict; the number was moved into a panel called "Fix progress" with a sentence reconciling the two. It did not work — a reader read "81 of 100" as a percentage grade within minutes of it going out — and it was replaced the same day by v1.58.2, which changed the number itself.',
      },
      {
        kind: "p",
        html: "It is recorded here rather than omitted because an unsuccessful attempt is part of the honest history of how the scoring was corrected, and because the lesson it produced is the one that finally settled the design: a figure out of 100 sitting beside a letter grade will be read as the grade no matter what it is labelled. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.58.0",
    meta: "Reviewed <strong>2026-08-07</strong> · scope: two places where the tool contradicted itself in front of the people it is written for — not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>Documents are no longer penalized for being simple.</strong> A check that does not apply to a document — table markup in a document with no tables, alt text in one with no images — now counts as passing, rather than being removed from the calculation. Removing them meant a short, simple document had almost nothing to average against, so a single problem counted for far more: a one-page public notice and a longer meeting agenda with the identical missing-title problem scored 71 and 79, the notice worse even though it had fewer problems. Both now score 79. Two things deliberately did not change: a check the tool could not evaluate is still left out rather than assumed to have passed, and a scanned document still scores zero, because a screen reader can read nothing from it at all.",
      },
      {
        kind: "p",
        html: "<strong>Scores are now capped by the worst problem found in a document.</strong> A reader noticed that two reports with the same missing-title problem carried different grades, and they were right. The score had been an average across the checks that applied, so the same single fault counted for more in a short document with little to check and less in a longer one with more — and a few perfect checks could outweigh one serious failure. Two files missing both a title and a language declaration were scored better than a file missing only the title. A document's score can no longer rise above what its worst unresolved problem allows: a minor item holds it at 89, a moderate problem at 79, a critical problem at 69. The letter still comes from the same scale it always has — 90 and above is an A, 80 a B, 70 a C, 60 a D, below that an F — so the number and the letter always agree. Scores can only move down under this rule, never up, and a document with a critical problem can no longer read as close to publishable. Where a score is being held at its ceiling, the report names the problem holding it there, and reports shared before this change show the corrected score when reopened, so an older link and a fresh audit of the same file no longer disagree.",
      },
      {
        kind: "p",
        html: "<strong>The status page now explains why anything is backed up</strong> when the tool promises your file is never stored — a fair question someone asked out loud. Your document is never saved; the service's own record that a document was checked is, and that record is what the nightly backup copies. Section 7a of this policy draws the same distinction, and both places state plainly what personal detail those records do contain — a sign-in email address, the routine connection log every web server keeps, and the file name as uploaded — rather than claiming there is none. Three pieces of stale or wrong wording were also corrected, including a severity level advertised on the home page that this tool has never actually used. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.57.0",
    meta: "Reviewed <strong>2026-08-07</strong> · scope: follow-through on the same day's whole-application review — not a security release.",
    body: [
      {
        kind: "p",
        html: 'Three gaps in the project\'s own safety net were closed: automated checks now verify that the report pages are wired to their data correctly, that the display code still matches what the audit engine actually produces, and that the "Evidence &amp; technical detail" link moves keyboard focus to the section it scrolls to — a real accessibility fix in the report itself. The public status page also now states plainly when the tool cannot audit at all, rather than showing the same wording it uses when one optional feature is unavailable. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.56.0",
    meta: "Reviewed <strong>2026-08-07</strong> · scope: whole-application adversarial review — UX, security, documentation, operations, code health, and test coverage.",
    body: [
      {
        kind: "p",
        html: 'Six independent reviews examined the whole tool with deliberately hostile eyes. Two robustness defects were found and fixed: a deliberately malformed shared report could make its own report page fail to load (only that one link was ever affected — no other report, and no stored data, could be reached or altered this way), and a section of the remediation results page filtered for an issue level that does not exist, so lower-priority findings were never listed. The report\'s headline was also corrected: because the letter grade is a weighted average while the publish-or-not verdict counts blocking issues, a document could be described as "Excellent" and "not ready to publish" in the same sentence; the blocking issue now leads. Wording throughout the fix steps was made plainer, and the guidance no longer implies the free Adobe Reader can perform fixes that require Acrobat Pro. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.55.0",
    meta: "Reviewed <strong>2026-08-07</strong> · scope: the public status page's presentation — not a security release.",
    body: [
      {
        kind: "p",
        html: "The status page's browser view now presents its sections as collapsible cards with an always-visible health summary on top, so a first-time visitor sees the essentials at a glance rather than a wall of tables. Presentation only: the page publishes exactly the same aggregate operational numbers as before (service health, engine availability, anonymous document counts and grades, backup recency), still contains no names, no filenames, and no content from anyone's documents, and still runs no scripts in your browser. What monitoring services read is byte-for-byte unchanged. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.54.1",
    meta: "Reviewed <strong>2026-08-07</strong> · scope: the remediation results page — not a security release.",
    body: [
      {
        kind: "p",
        html: 'The download for an auto-remediated file now appears inside the "After Remediation" card, beneath the grade and its explanation, and carries a plain-language readiness banner: unless the remediated file grades an A, the banner states that issues remain and should be fixed before publishing. Presentation only — the remediation pipeline, the one-time download token, and the file-retention windows are all unchanged. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.54.0",
    meta: "Reviewed <strong>2026-08-07</strong> · scope: the redesigned report presentation — not a security release.",
    body: [
      {
        kind: "p",
        html: "Audit reports now open in a visual, plain-language layout, with the complete technical report available through a Visual/Detailed toggle on every report. This is a presentation change only: the audit itself, what it examines, and what the service stores are all unchanged, and previously shared reports simply display in the new layout. The view preference was kept on your own device (in your browser's local storage), never sent to the server — as of v1.61.1 it is not stored at all, and every report opens in the visual view (see that entry above). Every fact shown in the classic report remains visible in the new one, and the redesigned interface itself was contrast-checked against WCAG AA during development. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.53.0",
    meta: "Reviewed <strong>2026-08-05</strong> · scope: readability of the technical material on this page and the technical-details page — not a security release.",
    body: [
      {
        kind: "p",
        html: "Several technical blocks on this page — the database schemas in § 6, the pipeline flows in §§ 2–3, the auditor queries in § 11, and their counterparts on the technical pages — had been reduced to single horizontally-scrolling lines by an interaction between the project's code formatter and the markup that displayed them. All now render as proper multi-line, color-coded code blocks, keyboard-scrollable for assistive-technology users. While restoring the § 6 schema it was also re-checked against the actual database definition and brought back in sync (the displayed copy had drifted: it omitted the <code>original_filename</code> column added in v1.48.0). The technical-details page additionally gained four new detailed blocks, including a worked example of how category weights are redistributed when a category doesn't apply. Display only — no query, retention period, or behavior changed. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.52.0",
    meta: "Reviewed <strong>2026-08-05</strong> · scope: the service now flags an overdue nightly backup — a monitoring improvement.",
    body: [
      {
        kind: "p",
        html: 'The status page has shown the last successful backup since v1.50.0; as of this release the service also <strong>raises its own attention flag when that backup becomes overdue</strong> for a nightly schedule (about thirty hours old) — the same "degraded" marker used when an optional checking engine is down, which the external uptime monitoring already watches. In plain terms: if the nightly backup silently stops, a person now gets told, instead of discovering it on the day a restore is needed. Two boundaries were kept deliberately: a server where backups have <em>never</em> run still does not raise the flag (a brand-new deployment must not alarm before its first scheduled run), and an overdue backup can never make the service report itself as fully down — audits continue working regardless. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.51.1",
    meta: "Reviewed <strong>2026-08-05</strong> · scope: documentation wording about backups — not a security release.",
    body: [
      {
        kind: "p",
        html: "The standing documentation — the project README and this page — now states the backup arrangement plainly and in general terms: the database is backed up nightly, only the five newest snapshots are kept, and they live on this server in a dedicated directory beside — but outside — the application, unreachable from the web. The one place that previously printed the exact directory location on this page now describes it generally instead; the precise paths remain in the operator runbook in the repository, where the person restoring a backup needs them. No behavior changed: the backups themselves, their schedule, their rotation, and everything § 7 and § 8a state about them are exactly as in v1.49.0–v1.51.0. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.51.0",
    meta: "Reviewed <strong>2026-08-05</strong> · scope: shared reports are now deleted after their link expires — a data-retention improvement.",
    body: [
      {
        kind: "p",
        html: "A shared report's link has always stopped working 365 days after it was created — but the stored report itself was kept indefinitely, which this policy disclosed (§ 7). The cleanup sweep now <strong>permanently deletes the stored report roughly 30 days after its link expires</strong>, so nothing shared outlives its usefulness by more than a month. The 30-day gap is deliberate: while the record still exists, a visitor clicking an expired link is told plainly that it expired; after deletion, the address behaves as if it never existed. Since a saved report is the one place that can quote short strings from inside a document (§ 8a), this is a privacy improvement, not only housekeeping.",
      },
      {
        kind: "p",
        html: "The same release fixes a latent coupling: the sweep that enforces every retention period on this page used to pause entirely if the optional remediation feature was switched off — a configuration that never occurred in production, but under which deletion schedules would have silently stopped. The sweep now runs unconditionally, and an automated test holds it to that with the feature disabled. <strong>This release only deletes data sooner — nothing new is collected, and every other retention period is unchanged.</strong>",
      },
    ],
  },
  {
    version: "v1.50.0",
    meta: "Reviewed <strong>2026-08-05</strong> · scope: the public status page now shows the last successful backup — reviewed for what it discloses.",
    body: [
      {
        kind: "p",
        html: "The status page gains one row: when the nightly database backup last completed, how old that is, its size, and how many usage-log records it contains. The row appears only for a backup that passed its integrity check, and it discloses nothing else — in particular, never a server file location, which the same automated privacy checks that guard the rest of the page now also enforce for this row. A server where backups have not yet run says so in plain words rather than raising the service's alarm state, so turning the feature on cannot cause a false outage alert. The backups themselves now live beside the application's code folder on the server — easier to find, still outside the code checkout and unreachable from the web. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.49.0",
    meta: "Audited <strong>2026-08-05</strong> · scope: nightly database backups, plus an independent line-by-line verification of § 8's storage claims, published as § 8a.",
    body: [
      {
        kind: "p",
        html: "<strong>The database is now backed up nightly.</strong> The backup uses SQLite's own online-backup mechanism — safe to run while the service is writing, where a naive file copy could produce a silently incomplete snapshot. Every snapshot is integrity-checked before it is kept, refused outright if the source is missing or is not this application's database, and stored in a directory outside the application on the same server. Only the <strong>five newest snapshots are retained</strong>; older ones are deleted automatically. The restore procedure is scripted, verifies the snapshot before touching anything, sets the current database aside rather than deleting it — and was rehearsed end-to-end the day it was written. The hosting provider's own whole-server backups run separately, covering loss of the server itself.",
      },
      {
        kind: "p",
        html: "<strong>Section 8's claims were verified line by line</strong> against the source code: every database table, every statement that writes to one, every file the server can create, and everything its logs and email can contain. The evidence — with the code quoted — is published as § 8a, so the claims no longer rest on trust. The verification found one statement that claimed too much, and it has been corrected rather than quietly reworded: a report you choose to <em>share</em> quotes short strings from inside your document (image alt text, link labels and destinations, bookmark titles, the document's own metadata fields) in its findings, because naming a problem requires showing it. A plain audit — upload, read, close — stores none of those strings, and page text, images, form values, and file bytes are never stored anywhere.",
      },
      {
        kind: "p",
        html: "<strong>The backup adds no new kind of data — it is a copy of exactly the database documented in §§ 7–8a, kept on the same server, with a shorter life than anything inside it.</strong>",
      },
    ],
  },
  {
    version: "v1.48.1",
    meta: "Reviewed <strong>2026-08-05</strong> · scope: corrections to this policy and the explanatory pages — not a security release.",
    body: [
      {
        kind: "p",
        html: "Every explanatory page — this policy, the technical and scoring explanations, and the project documentation — was checked line by line against the source code, and everything found inaccurate was corrected. The corrections that matter for a reader of this policy: it now states plainly that the usage log records the caller's IP address and browser identification with each entry (it always has; § 8 previously implied otherwise), that usage-log entries are deleted after 365 days rather than kept indefinitely (§ 7 — the automatic deletion has existed since tool v1.20.1), and that refused uploads are recorded (§§ 2, 7, 8). The audit entries above for v1.43.0 through v1.48.0 were added in the same pass; this register had fallen six releases behind. The full list of corrections is in this policy's own change log (§ 14, policy v1.2).",
      },
      {
        kind: "p",
        html: "One correction was visible on reports: the legend explaining severity colors described a score of 90–99 as meeting accessibility standards, while the scoring itself reserves that description for a perfect 100. The legend now matches the scorer. <strong>No change to what data is collected, how it is used, or how long it is kept — only to how accurately these pages describe it.</strong>",
      },
    ],
  },
  {
    version: "v1.48.0",
    meta: "Audited <strong>2026-08-05</strong> · scope: a full red/blue team audit of the entire application, plus a live check of the production web server — a standalone comprehensive review, not a per-release one.",
    body: [
      {
        kind: "p",
        html: "The whole tool was re-examined end to end: how files are received and refused, sign-in, the checking engines, the database, rate limits, what the service publishes about itself, and the web-server configuration in front of the application. The attack half of the review — poisoned archives, oversized files, forged web addresses, a dozen ways of trying to make the server fetch its own internal resources — was run against an isolated copy of the service, so no production data or statistics were touched; the live site received only read-only checks. Every attack was turned away. <strong>Nothing critical or serious was found. Two low-severity issues were identified and fixed the same day.</strong>",
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "Fixed",
            html: "<strong> Refused uploads no longer store the file name exactly as sent</strong> — When the tool refuses a file it keeps a note of the attempt, including the file name it was offered under. That name was being stored exactly as the sender supplied it — any length, any characters. Only an administrator can see those notes, and the screens that display them already refuse to treat stored text as anything but text, so this was not exploitable — but it left a single safeguard doing all the work. File names are now cleaned and length-limited <em>before</em> they are stored, on every path that writes them, so no future change can quietly reopen the gap.",
          },
          {
            badge: "Fixed",
            html: "<strong> Line breaks can no longer hide inside stored file names</strong> — The cleaning rule that strips unusual characters from file names treated line breaks as ordinary spacing, so a name containing them passed through — and this affected normal, accepted uploads too, not just refused ones. A file name is a single line by definition, and anything that later prints these records one per line would have inherited the break. All spacing characters are now collapsed to a plain space before the rule runs.",
          },
          {
            badge: "Hardened",
            html: "<strong> The production web server's protective headers were tightened</strong> — Three gaps were found in the web server that sits in front of the application (not in the application itself), and all three were fixed and verified on the live site the same day: browsers are now told to always use the encrypted connection on every page, not only on API responses; a duplicated, conflicting anti-embedding header was reduced to one clean value; and the protective headers now appear on error pages as well as successful ones.",
          },
        ],
      },
      {
        kind: "p",
        html: "<strong>No change to what data is collected, how it is used, or how long it is kept</strong> — file names are simply cleaned more strictly before storage. Everything else examined — sign-in and its fail-safe behavior, the randomness behind codes and links, database query construction, how helper programs are launched, the guard against fetching internal addresses, and the encryption settings — was confirmed sound with no change needed. The full technical write-up, including the complete list of what was checked and found sound, is in the project's README security section.",
      },
    ],
  },
  {
    version: "v1.47.0",
    meta: "Reviewed <strong>2026-08-05</strong> · scope: clearer labels on the public status page — not a security release.",
    body: [
      {
        kind: "p",
        html: 'Two different columns on the public status page were both labeled "other" and meant opposite things — one counted documents that were audited normally but whose file type could not be told from their web address, the other counted uploads that were refused outright. A reader pointed out that the page appeared to contradict itself. The first is now labeled "Unrecognized extension", the second "Other file types", and a short section explains the difference. The counts themselves are unchanged, and the page still publishes only totals — no file names, no email addresses, nothing identifying anyone. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.46.0",
    meta: "Reviewed <strong>2026-08-04</strong> · scope: the public status page now counts refused uploads — this adds one new kind of record to the usage log.",
    body: [
      {
        kind: "p",
        html: "When someone offers the tool a file it cannot check — an old-format Word document, an image, a spreadsheet export — the tool previously kept no record of the attempt at all. It now records that a refusal happened, the file name the upload was offered under, and when. The file itself is never accepted, so <strong>no file content is ever stored</strong> — and, deliberately, no content fingerprint is recorded either, so a refused file can never be mistaken for an audited one by the safeguard that gates the remediation feature. The status page publishes only the resulting totals, grouped by file type.",
      },
      {
        kind: "p",
        html: "<strong>This adds one item to what is collected: the name and time of a refused upload.</strong> These records are kept for the same 365-day period as the rest of the usage log and are visible only to an administrator; how data is used, and every other retention period, is unchanged.",
      },
    ],
  },
  {
    version: "v1.45.0",
    meta: "Reviewed <strong>2026-08-04</strong> · scope: clearer refusal messages for old Office formats and CSV files — not a security release.",
    body: [
      {
        kind: "p",
        html: "Old-format Office files (.doc, .xls, .ppt, .rtf) are now refused with an explanation of why they cannot be checked and how to convert them, instead of a generic list of accepted formats; CSV files are told there is nothing to check and that this is not a fault. To give the right message even when a file has been renamed, the tool now recognizes these formats by their content — reading only a small, fixed-size portion of the file's beginning, deliberately without parsing the file itself, so a hostile file gains nothing. No new format is accepted, refused files are still never stored, and no response the server gives changed shape — only the wording. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.44.0",
    meta: "Reviewed <strong>2026-08-04</strong> · scope: letter-grade totals on the public status page — not a security release.",
    body: [
      {
        kind: "p",
        html: 'The public status page now shows how audited documents have scored, as counts of letter grades over three time windows. These are the same kind of anonymous totals the page already published: no file names, email addresses, or anything identifying a person or document participates — only counts. Because a figure like "62% scored F" invites being quoted as a statistic about all government documents, which it is not — people tend to check documents they already suspect have problems — the page prints that caveat <em>above</em> the numbers, and an automated test keeps it there. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.43.0",
    meta: "Reviewed <strong>2026-08-04</strong> · scope: two browser conveniences — not a security release.",
    body: [
      {
        kind: "p",
        html: "The status page gained a link back to the audit tool, and the tool now asks for confirmation before you leave the page while an audit is still running, so work in progress is not lost to a stray click. The confirmation uses the browser's own built-in dialog — no custom pop-up to get wrong for screen-reader users. Both changes live entirely in the visitor's browser; nothing new is sent to or stored on the server. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.42.1",
    meta: "Reviewed <strong>2026-08-03</strong> · entry recorded 2026-08-08 · scope: the wording of in-site links to the status page — not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>Links to the status page now state which version of it they want</strong> — the readable page for people, the raw data for monitoring systems. Nothing a visitor sees has changed; browsers were already being given the readable page automatically. The point is that the intent is now written down in the link itself rather than inferred, so a future change to how that choice is made cannot silently hand an automated monitor a human-readable page and blind its alerting. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.42.0",
    meta: "Reviewed <strong>2026-08-03</strong> · scope: presentation of the public status page — not a security release.",
    body: [
      {
        kind: "p",
        html: "The public status page is now legible in an ordinary browser: the same information, laid out as a colour-coded outline rather than one unbroken block of text. <strong>What it publishes has not changed</strong> — still only totals and yes/no answers, with no file names, no email addresses, and nothing identifying anyone who has used the service. The checks that enforce that were left in place and still pass. Two details of note: the page runs no scripts at all, so there is nothing on it that could execute in a visitor's browser; and everything it displays is escaped before rendering, so no value drawn from the system can be interpreted as page markup. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.41.2",
    meta: "Reviewed <strong>2026-08-03</strong> · scope: an internal deployment script — not a security release.",
    body: [
      {
        kind: "p",
        html: "The deployment script updates itself as part of each deployment, but continued running the previous version of its own later steps — so a correction made to it did not take effect until the following deployment. It now restarts itself after updating, ensuring each deployment runs the code it just retrieved. This concerns only the deployment process; the application and its data are unaffected. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.41.1",
    meta: "Reviewed <strong>2026-08-03</strong> · scope: an internal deployment script — not a security release.",
    body: [
      {
        kind: "p",
        html: "The automatic checks introduced in the previous release ran a moment too early and reported the service as unavailable when it was in fact starting normally. They now wait for the service to respond before checking. This affected only the report printed during deployment; the service itself was healthy throughout, which was confirmed independently at the time. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.41.0",
    meta: "Reviewed <strong>2026-08-03</strong> · scope: navigation and an accessibility fix — not a security release.",
    body: [
      {
        kind: "p",
        html: 'The header now carries a "Status" link and no longer carries an "Analyze" link — clicking the site title clears your results and starts a new file, which it already did. Because that title is now the only way to start over, it was also fixed to work with a keyboard: previously it responded only to a mouse click, which made it unusable for anyone navigating by keyboard or screen reader. On a tool that audits other people\'s documents for exactly this kind of problem, that was worth correcting promptly.',
      },
      {
        kind: "p",
        html: "This release also adds automatic checks that run after each deployment, confirming the service answers correctly and that its search-engine instructions file is being served. That file is currently <em>not</em> being served in production due to a web-server configuration issue unrelated to this application's code; the pages that most need to stay out of search results carry a separate instruction in their response headers, which is working. The configuration fix is queued. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.40.3",
    meta: "Reviewed <strong>2026-08-03</strong> · scope: uptime-monitoring reliability — not a security release.",
    body: [
      {
        kind: "p",
        html: 'The two addresses an external monitoring service uses to confirm this site is running did not respond to one of the two standard ways of asking. A monitor set up that way would have reported the service as down while it was working normally — a false alarm that, if repeated, teaches people to ignore real ones. Both addresses now answer either form of request, and they report the true result rather than a canned "everything is fine". These addresses return only whether the service is up; they are the same ones described in the entries below. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.40.2",
    meta: "Reviewed <strong>2026-08-03</strong> · scope: where one link appears — not a security release.",
    body: [
      {
        kind: "p",
        html: 'The "Scoring" link, which opens an explanation of how documents are graded, moved from the top of the page to the footer alongside the other reference links. The explanation itself is unchanged. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.40.1",
    meta: "Reviewed <strong>2026-08-03</strong> · scope: one remaining third-party update — <strong>a security release</strong>.",
    body: [
      {
        kind: "p",
        html: "Applies the last outstanding fix left over from the previous release, in a tool used only while developing the application — never on the live server. One advisory remains open and cannot be acted on yet: it concerns a form component in the interface library this site uses, and its authors have not published a fix. It does not affect this application, which does not use the component in question. It will be applied as soon as a fix exists. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.40.0",
    meta: "Reviewed <strong>2026-08-03</strong> · scope: third-party software updates — <strong>a security release</strong>.",
    body: [
      {
        kind: "p",
        html: "Like all modern software, this application is built on top of open-source components maintained by others. When a flaw is found in one of those components, a security advisory is published and the component's authors release a fix. This release applies every outstanding fix — around 25 advisories in total, several rated high severity.",
      },
      {
        kind: "p",
        html: "Every one of these was in a supporting component used to build and package the application rather than in the code that reads your documents, and we have no indication any was ever exploited here. They are applied because keeping dependencies current is basic maintenance, not because a problem was observed.",
      },
      {
        kind: "p",
        html: "One component that <em>is</em> used to read your documents was updated: the XML reader behind Word, PowerPoint and Excel checks. Because a subtle change there could shift scores without producing any visible error, four sample documents were audited on both the old and new versions and the results compared — they were identical. The status page also gained a Chicago-local timestamp alongside the existing UTC one. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.39.3",
    meta: "Reviewed <strong>2026-08-03</strong> · scope: how often one number on the status page refreshes — not a security release.",
    body: [
      {
        kind: "p",
        html: "The counts on the public status page are now recalculated every few seconds rather than once a minute, so a document that has just been audited appears in the totals almost immediately. This changes only how current those totals are. It does not change what is counted, and the page still publishes nothing beyond totals — no file names, no email addresses, and nothing identifying anyone who has used the service. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.39.2",
    meta: "Reviewed <strong>2026-08-03</strong> · scope: navigation links only — not a security release.",
    body: [
      {
        kind: "p",
        html: 'Adds a "What\'s New" link to the site header and footer, pointing at the archive of past announcements introduced in the previous release. That archive was previously reachable only from the notice banner on the home page, which can be dismissed permanently — so the list of past updates vanished exactly when someone would want it. These are ordinary navigation links to a page showing notices already published on the home page. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.39.1",
    meta: "Reviewed <strong>2026-08-03</strong> · scope: a broken link and a new archive page — not a security release.",
    body: [
      {
        kind: "p",
        html: 'The link to the new status page, added in the previous release, produced a "page not found" error when clicked from the home-page banner, though the page itself worked normally when its address was typed directly. That is fixed. This release also adds a page listing every past announcement, since the banner shows only the most recent one and can be dismissed. That archive displays the same notices already shown on the home page and reads nothing from your documents. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.39.0",
    meta: "Reviewed <strong>2026-08-03</strong> · scope: a new public status page — reviewed specifically for what it discloses.",
    body: [
      {
        kind: "p",
        html: "This release adds a status page at <code>/status</code> that anyone can visit without logging in. Because it is public, the central question for this review was what it reveals. As first shipped it published only <strong>totals and yes/no answers</strong>: whether the service is running, whether each checking engine is working, how long the server has been up, and how many documents have been audited in the last day, the last month, and in total — split by file type. Later releases added further anonymous totals: letter-grade counts (v1.44.0) and refused-upload counts (v1.46.0) — see those entries. Then as now, the page publishes no file name, email address, IP address, browser identifier, or document fingerprint, and nothing that identifies who used the service or what they checked.",
      },
      {
        kind: "p",
        html: "That guarantee is enforced by an automated test rather than by review alone. The test loads the database with a deliberately distinctive file name, email address and IP address, builds the real status page, and fails the build if any of them — or any server file path, or any email address at all — appears anywhere in the output. The file-type breakdown is counted inside the database itself, so file names are never handed to the code that builds the page. A related check pins the list of published fields, so a future change cannot add a new one without a deliberate decision.",
      },
      {
        kind: "p",
        html: 'Two figures were considered and deliberately left out. <strong>Report-sharing counts</strong> were rejected because sharing cannot actually be observed: the system records that a report was created, never whether its link was sent to anyone, so any number published under the word "shared" would claim more than the software can know. <strong>Web-page audit counts</strong> were left out because the distinction between a document and a web page raises more questions than it answers for a general reader. Two further points of note: the page is excluded from search engines by two independent mechanisms, and when a checking engine fails, the page reports a fixed short label rather than the underlying error message, because those messages routinely contain server file paths. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.38.2",
    meta: "Reviewed <strong>2026-07-26</strong> · scope: completes the v1.38.1 report-ordering fix for a second technical panel — not a security release.",
    body: [
      {
        kind: "p",
        html: 'The previous release moved one technical panel below the list of issues that must be fixed, but there are two, and the other one was missed: a "PDF/UA-1 signals" card that appeared at the very top of the report, immediately under the score and above the critical issues. Both now sit below the issues. The distinction matters because these signals are easy to mistake for a passing grade: they report structural facts about the file — whether it carries accessibility tags, whether its fonts are embedded — and cannot judge whether an image description is meaningful or whether the document reads in a sensible order, which is what the accessibility grade measures. A document can therefore satisfy every one of these structural markers and still be unusable for someone with a disability. When critical issues remain, the card now says that plainly instead of leaving the reader to infer it. This is a presentation change only — no scores, grades, or verdicts changed, and no new information is read from your documents. <strong>No change to what data is collected or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.38.1",
    meta: "Reviewed <strong>2026-07-26</strong> · scope: the order in which report sections are presented — not a security release.",
    body: [
      {
        kind: "p",
        html: 'A report can carry two different verdicts that mean different things, and they were shown in a misleading order. The technical PDF/UA-1 check (which examines whether a PDF\'s tagging is formally well-formed) was displayed above the list of accessibility issues that actually have to be fixed before publishing — and that technical check can report "Pass" on a document that still has critical problems, because it answers a narrower question than the accessibility grade does. Someone reading their report could see a green result first and reasonably conclude they were finished. The critical issues and their fix steps now appear directly beneath the score, above the technical panel; and when the technical check passes while critical issues remain, it now says so in plain language rather than showing a bare green tick. This is a presentation change only — no scores, grades, or verdicts changed, and no new information is read from your documents. <strong>No change to what data is collected or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.38.0",
    meta: "Audited <strong>2026-07-26</strong> · scope: a fresh-eyes review of the audit algorithms themselves, plus the security posture of the PDF/UA checker added in v1.37.0 — <strong>this one is a security release</strong>.",
    body: [
      {
        kind: "p",
        html: 'This review looked at the audit engine with fresh eyes and found three ways a document could be judged wrongly — all of them in the direction of being too generous, which is the more damaging direction for a compliance tool. The most serious: a PDF could carry an <em>empty</em> set of accessibility tags — the shelf was there, but nothing was on it — and the tool would report it as a properly tagged document with no detected WCAG failures. The identical file with the empty shelf removed was correctly failed. In other words, a document could be made to "pass" by adding tagging that did nothing. Empty tagging is now treated exactly like no tagging, because that is what it means for someone using a screen reader.',
      },
      {
        kind: "p",
        html: 'The second: images that were never tagged at all used to be skipped rather than counted against a document, even though they are <em>worse</em> for a screen-reader user than a tagged image with a missing description — an untagged image is invisible to the reader entirely. A document with ten such images could score 100 while a document with a single missing description scored 98 and was marked as failing. Untagged images now count. The third was narrower: a particular way of storing the tag structure made a real, complete set of tags look empty to part of the tool, which then reported a false "flat structure" problem.',
      },
      {
        kind: "p",
        html: "On the security side, three findings were fixed. A specially crafted PDF — only a few hundred bytes — could send the analyzer into a loop that consumed the server's attention entirely, making the site unresponsive for everyone until it was restarted; the file-size limit was no protection, because the file did not need to be large. The PDF/UA checker introduced in v1.37.0 was also being given a copy of the server's own passwords and keys, which it has no need for and which every other external tool the site uses had already been shielded from; and it could be started an unlimited number of times at once, so a burst of uploads could exhaust the server's memory. It is now limited to two at a time. Finally, when that checker failed it was reporting the server's own internal file paths back to the browser; it now reports a plain message and keeps the detail in the server log.",
      },
      {
        kind: "p",
        html: "<strong>What this means for you:</strong> re-auditing a document may now give a different score than it did before this release — in every case that changed, because the tool now catches a real barrier it used to miss. Reports you saved earlier keep the score they were given at the time, so an old saved report and a fresh audit of the same file can disagree; the fresh one is correct. Of the 23 reference documents used to check the engine, 19 were completely unaffected. <strong>No change to what data is collected or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.37.5",
    meta: "Reviewed <strong>2026-07-23</strong> · entry recorded 2026-08-08 · scope: attribution and reachability of one label on the PDF conformance panel — no change to scoring.",
    body: [
      {
        kind: "p",
        html: "<strong>A borrowed phrase on the conformance panel now credits its author, and can be read by everyone.</strong> The reference had been placed in a hover tooltip, which requires holding a mouse still for about a second, never appears on a touchscreen, and is not announced to screen readers — so for most people it simply did not exist, and a borrowed phrase read as an uncredited one. It is now a proper button that reveals a footnote on the page crediting Douglas Adams and <em>The Hitchhiker's Guide to the Galaxy</em> (1979). <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.37.4",
    meta: "Reviewed <strong>2026-07-23</strong> · entry recorded 2026-08-08 · scope: the wording of the PDF conformance verdict — no change to scoring.",
    body: [
      {
        kind: "p",
        html: '<strong>The PDF conformance panel no longer leads with the word "Fail."</strong> A document that does not meet the formal PDF/UA-1 file standard now reads <em>"Additional checks could be addressed"</em>. This is not softening a real result: the accessibility grade is the measure that reflects what a person using the document actually experiences, and a formal file-format gap is a punch list rather than an alarm. The specific rules that did not pass remain one click away, unchanged. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.37.3",
    meta: "Reviewed <strong>2026-07-23</strong> · entry recorded 2026-08-08 · scope: explaining how a strong accessibility grade can sit beside a formal conformance failure — no change to scoring.",
    body: [
      {
        kind: "p",
        html: '<strong>The conformance panel now explains why a good grade and a formal "fail" can appear on the same report.</strong> They answer different questions: the grade measures human impact and is graded, while PDF/UA-1 is a binary check of formal file conformance — which is why Adobe Acrobat, PAC and veraPDF can each disagree with the grade and with one another. The panel now says so, in place, rather than leaving a reader to reconcile two apparently contradictory verdicts on their own.',
      },
      {
        kind: "p",
        html: "<strong>One piece of repair advice was also withdrawn as actively harmful.</strong> A hint about embedded fonts had suggested re-creating the PDF through a print-to-PDF route, which flattens a tagged document and destroys the accessibility structure inside it — trading a cosmetic conformance point for a real accessibility loss. It now points to repairs that preserve the structure, and warns against the other route explicitly. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.37.2",
    meta: "Reviewed <strong>2026-07-23</strong> · entry recorded 2026-08-08 · scope: a count on the PDF conformance panel that overstated the work — no change to scoring.",
    body: [
      {
        kind: "p",
        html: '<strong>The conformance panel no longer headlines a number that reads as thousands of separate problems.</strong> The underlying validator reports one failure for every <em>occurrence</em>, so a document could be described as having "6,941 rule failures" when it really had a handful of distinct issues repeated across many objects. The panel now leads with the number of distinct issues to fix, keeps the occurrence total as quiet context, and explains the difference in one line. Where a small number of issues genuinely accounts for most of the occurrences, it says so — and where the spread is flat, it does not pretend otherwise. A related fault was fixed at the same time: the stored list of failures was being shortened before it was sorted, so the most frequent issues could be the ones omitted. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.37.1",
    meta: "Reviewed <strong>2026-07-22</strong> · entry recorded 2026-08-08 · scope: making the PDF conformance verdict actionable — no change to scoring.",
    body: [
      {
        kind: "p",
        html: "<strong>Each failed conformance checkpoint now carries a short repair instruction</strong> rather than only a diagnosis, so the panel tells a document author what to do about it. A summary line was also added covering the six structural essentials of PDF/UA-1 — tagging, marked content, embedded fonts, language, title and the format identifier — which are determined from the document itself and are therefore shown on every PDF report regardless of which optional checking programs are available. It is presented as separate from the accessibility grade, because it is a structural checklist rather than a measure of human impact. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.37.0",
    meta: "Reviewed <strong>2026-07-22</strong> · scope: a new PDF/UA-1 conformance verdict shown on audit results — not a security release.",
    body: [
      {
        kind: "p",
        html: 'Audit results now show a PDF/UA-1 (ISO 14289-1) machine-check verdict from veraPDF — the open-source validator — alongside the accessibility grade. It was reviewed before shipping: veraPDF reads a short-lived temporary copy of your PDF (its own copy, created and deleted within the same request, exactly like the existing qpdf copy — nothing new is retained), it cannot stall the page (a 30-second cap; if it can\'t finish it simply reports "could not validate"), and the verdict is shown for information only — it does not change your accessibility grade. No user data is stored beyond what a saved report already keeps. <strong>No change to what data is collected or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.36.3",
    meta: "Reviewed <strong>2026-07-22</strong> · scope: extends the v1.36.2 PDF image fix to lists and tables, from the same reported document — not a security release.",
    body: [
      {
        kind: "p",
        html: 'The same "phantom tag" problem fixed for images in v1.36.2 also affected lists and tables: a design tool had left behind dozens of empty list and table tags that are not part of the document a screen reader reads, and the audit was reporting them as broken ("incomplete") structure and lowering the score. The tool now ignores these disconnected tags for lists and tables as well, so the reported document is scored on its real content only. This changes only how existing information in the file is interpreted — no new information is read from your documents. <strong>No change to what data is collected or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.36.2",
    meta: "Reviewed <strong>2026-07-22</strong> · scope: a single accuracy fix to PDF image detection, prompted by a document a user reported — not a security release.",
    body: [
      {
        kind: "p",
        html: 'Some PDFs — often those exported from design tools like Adobe InDesign — carry leftover "phantom" image tags that are not part of the document a screen reader actually reads. The audit was counting those phantom tags as real images and reporting them as missing a description, which unfairly lowered the score of otherwise well-built documents. The tool now ignores image tags that are not connected to the live document structure, and correctly recognizes when every image on a page is deliberately marked as decorative and therefore needs no description. This changes only how existing information in the file is interpreted — no new information is read from your documents. <strong>No change to what data is collected or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.36.1",
    meta: "Reviewed <strong>2026-07-19</strong> · entry recorded 2026-08-08 · scope: four accuracy corrections found by checking a real accessible form.",
    body: [
      {
        kind: "p",
        html: "<strong>Four scoring inaccuracies were corrected, all found by auditing a genuinely accessible form that this tool was marking down unfairly.</strong> A category of form built with Adobe's designer tools was being refused a verdict altogether, even though it ships a complete conventional version that is exactly what a reader sees; those are now checked normally. A related fault meant the document's declared language and title settings were being read as internal reference codes rather than as their values, producing a false penalty. A structural measure about reading order was scoring routine, correct forms as though they had a critical fault, and has been reduced to a moderate one — the measure genuinely cannot tell which of two orderings is the correct one. And tables that associate their headings using one of the two methods the standard permits were losing points for not using the other; both are now accepted, as the formal conformance check and independent tools already did.",
      },
      {
        kind: "p",
        html: "The reference set of documents was re-run in full: all 22 previously checked documents produced identical results, and the form that prompted the work went from a withheld verdict to a clean one. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.36.0",
    meta: "Audited <strong>2026-07-19</strong> · scope: a dedicated accuracy review of the audit algorithms themselves — how the tool judges PDF, Word, PowerPoint, and Excel files — followed by fixes for every issue it confirmed.",
    body: [
      {
        kind: "p",
        html: 'v1.36.0 makes the audit\'s judgments more trustworthy in both directions. The review found places where the tool accused documents of accessibility failures they did not have — for example, white text on dark table headers (a correct, accessible design) was being reported as an extreme color-contrast violation because the tool didn\'t look up the header\'s background color, and slide decks that record their language on every line of text were told they had "no language declared". Those false alarms are fixed: the tool now only asserts a confirmed WCAG failure when it actually resolved the evidence from the file, and says "not assessed — review manually" when it could not.',
      },
      {
        kind: "p",
        html: "The review also closed the reverse problem — a serious barrier that used to pass silently: a PDF whose (older-style) security settings forbid screen readers from reading it at all could previously receive a perfect score. Such files are now failed with a clear explanation and fix. The tool additionally reads more of each document than before (Word headers, footers and footnotes, legacy link and image formats, Excel chart sheets), so fewer barriers can hide in unread corners. <strong>No change to what data is collected or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.35.0",
    meta: "Audited <strong>2026-07-19</strong> · scope: a new automated status-check address used for uptime monitoring — not a security release.",
    body: [
      {
        kind: "p",
        html: 'v1.35.0 adds a single public status-check address that reports whether both halves of the service — the website itself and the analysis engine behind it — are running, so an external monitoring service can alert the team the moment either goes down. The check was reviewed before shipping: it reveals only "running or not" for each half and how long the analysis engine has been up — no user data, no file names, and nothing about any audit anyone has run. It was also designed so that deliberately overloading the status check cannot trick the monitoring service into reporting a false outage. <strong>No change to what data is collected or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.34.0",
    meta: "Audited <strong>2026-07-12</strong> · scope: five preventive hardening measures covering file uploads, sign-out, and auto-remediation status pages, alongside an internal code reorganization and a new automated test/quality pipeline.",
    body: [
      {
        kind: "p",
        html: "This release adds five defensive improvements identified during a routine internal review of the whole application. <strong>None of them close a hole that was ever actually used against the tool — think of it as adding a second lock to a door that already had one, not replacing a broken lock.</strong> The same review also reorganized how the audit engine's code is packaged internally (no change to what it checks, how it scores, or what data it collects) and added an automated pipeline that runs the full test suite, a code-style check, and a type-correctness check on every change pushed to the repository — so future changes are checked automatically going forward, not only when someone remembers to run the tests by hand.",
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "Hardened",
            html: "<strong> Stricter limits on compressed Word, PowerPoint, and Excel files</strong> — These files are compressed bundles of smaller pieces. The tool now checks, before it opens any of those pieces, how many there are and how large they would add up to be once uncompressed, and refuses a bundle that crosses a safe ceiling. This closes a gap the per-piece checks already in place (added when Word, PowerPoint, and Excel auditing first shipped) didn't cover on their own: a bundle made of an extreme number of small pieces, or one whose pieces add up to an extreme total.",
          },
          {
            badge: "Hardened",
            html: "<strong> Refusal of a risky, never-legitimately-used document feature</strong> — Word, PowerPoint, and Excel files are built internally from a markup language that has a handful of advanced features no ordinary document ever needs, but that a booby-trapped file could misuse to make the reading process balloon in memory or reach outside the file. The tool now recognizes this specific feature on sight and treats that piece of the file as empty rather than processing it. Genuine Word, PowerPoint, and Excel exports never use it, so no ordinary file is affected.",
          },
          {
            badge: "Hardened",
            html: "<strong> Signing out now fully ends your session on the server, not just in your browser</strong> — Previously, clicking sign-out cleared your browser's copy of your sign-in credential, but if a copy of that credential had ever been captured some other way, it would technically have remained usable until it expired on its own. The server now keeps a short record of every sign-out and immediately rejects that exact credential if it is ever presented again, so sign-out is final the moment you click it. (Sessions that began before this change shipped aren't covered by this new check, but they still expire on their own normal schedule, same as always.)",
          },
          {
            badge: "Hardened",
            html: "<strong> Auto-remediation status pages now require your job's private link</strong> — When you start an auto-remediation job without signing in, checking that job's progress or its completion receipt now requires the same private, single-use address you were given when the job started. Anyone without it is told the job doesn't exist, rather than being able to check on it by guessing or reusing an identifier.",
          },
          {
            badge: "Hardened",
            html: "<strong> Safer, more reliable database upgrades</strong> — Every update to the tool that changes the internal database's structure is now numbered and recorded, so the server always knows exactly which structural updates a given installation has already received and applies only the ones it's missing, in order, automatically — including on the existing production database. This replaces a less formal check-before-change approach and removes a way a future update could have been skipped or mistakenly reapplied.",
          },
        ],
      },
      {
        kind: "p",
        html: "<strong>No change to what data is collected or how long it is kept.</strong> Files are still processed in memory and discarded in seconds, exactly as before. The full technical write-up is in the project's README security section.",
      },
    ],
  },
  {
    version: "v1.33.0",
    meta: "Audited <strong>2026-07-03</strong> · scope: the new PowerPoint (.pptx) and Excel (.xlsx) audit features — a fresh, independent three-team red/blue review of everything a malicious Office file could try to do to the server.",
    body: [
      {
        kind: "p",
        html: "v1.33.0 extends the tool to audit PowerPoint and Excel files, not just PDF and Word. Because these are also user-supplied files the server has to open and parse, this release got the same treatment as the earlier Word rollout: three independent reviews — covering server overload, hidden malicious content, and ways the scoring or access rules could be tricked — deliberately tried to break it with poisoned, oversized, and malformed files. <strong>Everything the reviews found was fixed and covered by a new automated test before this release shipped.</strong>",
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "Fixed",
            html: "<strong> Tighter limits on how much work a booby-trapped slide deck or spreadsheet can force</strong> — A PowerPoint or Excel file can bury thousands of objects several layers deep, or pair a small file with a few oversized embedded pictures, to make the server do far more work than the file's size suggests. The tool now counts that work — shapes, text, and cells at every nesting depth, and the running byte size of embedded pictures — and stops as soon as a safe limit is crossed, instead of after the damage is already done.",
          },
          {
            badge: "Hardened",
            html: "<strong> PowerPoint and Excel files are now analyzed in a separate, cancellable process</strong> — Previously, a pathological file could tie up the same in-process worker used for everything else; if analysis ran past its time limit, the work kept running in the background instead of truly stopping. Word, PowerPoint, and Excel files are now analyzed in their own short-lived process that the server can immediately and completely cancel the moment the time limit is reached.",
          },
          {
            badge: "Fixed",
            html: "<strong> Uploaded-file processing can no longer see the server's own passwords and keys</strong> — Every helper program the server hands an uploaded file to (for PowerPoint/Excel/Word analysis, for PDF repair, and for auto-remediation) now runs with the server's login secrets, API keys, and mail credentials stripped from its environment — so even a fully compromised helper process has nothing worth stealing.",
          },
        ],
      },
      {
        kind: "p",
        html: "<strong>No change to what data is collected or how long it is kept.</strong> PowerPoint and Excel files are processed in memory and discarded in seconds, exactly like PDF and Word; nothing new is stored or transmitted. The full technical write-up is in the project's README security section.",
      },
    ],
  },
  {
    version: "v1.32.1",
    meta: "Reviewed <strong>2026-07-02</strong> · entry recorded 2026-08-08 · scope: the automatic repair page interfering with its own progress reporting.",
    body: [
      {
        kind: "p",
        html: '<strong>The automatic repair page no longer blocks itself on longer jobs.</strong> While a repair was running, the page asked the service for progress four times a second. On any job longer than about twenty-five seconds that was enough to exhaust the ordinary limit on how often one visitor may contact the service, so the page reported "too many requests" even though the repair itself was completing normally on the server. Progress checks are now counted against their own separate, much higher allowance — that particular request is a single quick lookup — and the page asks once a second, backs off if anything goes wrong, and clears its own error message as soon as it recovers. The general limit protecting the rest of the service is unchanged, and was confirmed by live test to still apply exactly as before. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.32.0",
    meta: "Audited <strong>2026-07-02</strong> · scope: a follow-up red/blue team review of a round of internal code-quality changes, plus a hardening of the website's defenses against malicious scripts.",
    body: [
      {
        kind: "p",
        html: "This release reorganized how the tool is built internally (no change to what it checks or how it scores). Because that touched the pages that display a saved, shareable report, an independent review went back over them. It found — and this release <strong>fixes</strong> — a way that someone could craft a booby-trapped shareable report link so that a \"helpful link\" on it ran a hidden script in the viewer's browser. That has been closed at three levels: the link address is now checked when the report is saved and again when it is shown, and — the bigger, permanent safety net — the website now tells the browser to <strong>refuse any script that wasn't part of the original page</strong>, so this whole category of attack is blocked even if a new bug were introduced later.",
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "Fixed",
            html: '<strong> Malicious "helpful links" on shared reports</strong> — A shareable report link could be hand-crafted so that a link on it, once clicked, ran a hidden script instead of opening a web page. Link addresses on saved reports are now verified to be ordinary web (http/https) addresses both when the report is saved and when it is displayed, so a disguised script address is dropped.',
          },
          {
            badge: "Fixed",
            html: "<strong> Deliberately broken report links no longer knock out the page</strong> — A hand-crafted, malformed report link could make the shared-report page fail to load. The page now handles missing or malformed pieces gracefully instead of erroring.",
          },
          {
            badge: "Hardened",
            html: "<strong> The browser now blocks any un-approved script</strong> — The website's Content-Security-Policy was tightened so the browser will only run the scripts that are genuinely part of each page (each one carries a fresh, one-time stamp). Any injected or inline script — the main tool of this kind of attack — is refused outright, regardless of any future bug.",
          },
        ],
      },
      {
        kind: "p",
        html: "<strong>No change to what data is collected or how long it is kept.</strong> These are display-and-safety changes only; uploaded files are still processed in memory and discarded in seconds. The full technical write-up is in the project's README security section.",
      },
    ],
  },
  {
    version: "v1.31.1",
    meta: "Reviewed <strong>2026-07-01</strong> · entry recorded 2026-08-08 · scope: controls left behind in a downloaded report that could not do anything.",
    body: [
      {
        kind: "p",
        html: '<strong>A downloaded report no longer shows buttons that do nothing.</strong> The download is a fixed snapshot with every section already opened, so the controls it had captured — show/hide switches, an expand chevron, a "click a row" hint — were visible but inert. They are now removed from the download while everything they would have revealed stays fully visible. The live page keeps them. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.31.0",
    meta: "Reviewed <strong>2026-07-01</strong> · entry recorded 2026-08-08 · scope: making the downloadable report identical to the one on screen.",
    body: [
      {
        kind: "p",
        html: "<strong>The downloadable report is now exactly what you saw on screen.</strong> It had been separately assembled, and had drifted: different wording, and missing the method notes, the disclaimer, and the per-category detail. It is now taken directly from the report in front of you, with every collapsed section opened first and the page's styling included so the file stands alone. This matters because these downloads are what gets sent back to a document's author when a file fails — a download that disagrees with the page it came from is worse than no download. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.30.3",
    meta: "Reviewed <strong>2026-07-01</strong> · entry recorded 2026-08-08 · scope: the same correction applied to the two remaining download formats.",
    body: [
      {
        kind: "p",
        html: '<strong>The plain-text and Markdown downloads now separate scored checks from those that did not apply</strong>, exactly as the web page, the shared report and the HTML download already did — with the reason given, and the distinction between "not applicable" and "not assessed" preserved. All four ways of reading a result now present it identically. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>',
      },
    ],
  },
  {
    version: "v1.30.2",
    meta: "Reviewed <strong>2026-07-01</strong> · entry recorded 2026-08-08 · scope: a downloadable report that disagreed with the page it came from.",
    body: [
      {
        kind: "p",
        html: "<strong>The downloadable report listed checks that did not apply as though they were results.</strong> The web page and the shared report separated the checks that were scored from those that did not apply — showing the reason for each — while the download put everything in one table and showed detailed findings for all of it. On a Word document, which commonly has several inapplicable checks, a result showing five scored checks on screen could show ten rows in the download. The download now mirrors the page. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.30.1",
    meta: "Reviewed <strong>2026-07-01</strong> · entry recorded 2026-08-08 · scope: documentation catching up with Word support — no code paths changed.",
    body: [
      {
        kind: "p",
        html: "<strong>The explanatory pages and diagrams now describe Word as well as PDF.</strong> Word checking had shipped in the previous release while the technical explanation, the description on the home page and the scoring guide still described a PDF-only tool — including how the two formats are examined by different means, and which checks apply to Word and which do not. The processing diagram was redrawn to show both paths. No checking behaviour changed. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.30.0",
    meta: "Audited <strong>2026-07-01</strong> · scope: the new Microsoft Word (.docx) audit feature — a fresh, independent red/blue team review of everything a malicious Word file could try to do to the server.",
    body: [
      {
        kind: "p",
        html: "This release adds the ability to audit Word (.docx) files, not just PDFs. Because a Word file is really a compressed bundle the server has to open and read, three independent reviews deliberately tried to break it — by feeding it poisoned, oversized, or malformed files. The good news up front: <strong>the most serious risk (tricking the tool into showing malicious content to another person) was already fully blocked</strong>, because the tool escapes every piece of text taken from an uploaded document before it is ever displayed. Everything the review found was a way to overload the server, and <strong>all of it was fixed before this release</strong>.",
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "Fixed",
            html: '<strong> Protection against "zip-bomb" Word files</strong> — A tiny Word file can be crafted to expand into gigabytes when opened, to exhaust the server\'s memory. The tool now measures each part as it opens it and stops immediately if it grows past a safe limit, so a booby-trapped file is rejected instead of crashing the service.',
          },
          {
            badge: "Fixed",
            html: '<strong> Word files now share the same workload limits as PDFs</strong> — Word audits run through the same "two at a time" queue and the same hard time limit that PDF audits already used, so no single upload (or flood of uploads) can starve the server of resources.',
          },
          {
            badge: "Fixed",
            html: "<strong> Stricter handling of downloaded reports and error messages</strong> — The downloadable HTML report now escapes every value it shows (including scores and grades), and the audit-by-web-address feature no longer includes raw internal error text in its response.",
          },
        ],
      },
      {
        kind: "p",
        html: "<strong>No change to what data is collected or how long it is kept.</strong> Word files are processed in memory and discarded in seconds, exactly like PDFs; nothing new is stored or transmitted. The full technical write-up is in the project's README security section.",
      },
    ],
  },
  {
    version: "v1.29.0",
    meta: "<strong>2026-06-27</strong> · scope: how often the tool will accept automated audit requests, and an optional access key for a trusted partner system. Reviewed for security; no change to what data is collected or how long it is kept.",
    body: [
      {
        kind: "p",
        html: "v1.29.0 tightens the limit on how many audits an anonymous visitor can request per hour — back down from a temporary increase used during a large internal audit campaign — so the public tool can't be hammered with thousands of automated requests an hour. A trusted ICJIA system can present a secret access key to get a higher limit and to check ICJIA pages that live on non-Illinois web addresses.",
      },
      {
        kind: "p",
        html: "<strong>No data is collected, stored, transmitted, or retained any differently</strong>; no retention window changed. The access key only raises rate limits and widens which web addresses can be checked — it never lets anyone reach internal or private systems (those stay blocked for everyone), and it is held only as a server environment secret, never in the database or in any report.",
      },
    ],
  },
  {
    version: "v1.28.1",
    meta: "<strong>2026-06-10</strong> · scope: a small fix to make a loading spinner icon appear. No security review was required — nothing about data handling changed.",
    body: [
      {
        kind: "p",
        html: "v1.28.1 restores a loading-spinner icon that was failing to load on the auto-remediation screen. <strong>No data is collected, stored, transmitted, or retained any differently</strong>; no retention window, endpoint, or permission changed.",
      },
    ],
  },
  {
    version: "v1.28.0",
    meta: "<strong>2026-06-10</strong> · scope: front-end performance and a change to one export format. No security review was required — nothing about data handling changed.",
    body: [
      {
        kind: "p",
        html: "v1.28.0 replaces the Microsoft Word download with a plain-text download and makes the explanatory diagrams load faster, by removing two large code libraries from the website. <strong>No data is collected, stored, transmitted, or retained any differently</strong>; no retention window, endpoint, or permission changed. Your audited files are still held in memory only and discarded in seconds.",
      },
    ],
  },
  {
    version: "v1.27.0",
    meta: "Audited <strong>2026-06-10</strong> · scope: a full, independent red-team security review of the entire application — the website, the server, the audit pipeline, and the optional auto-remediation pipeline.",
    body: [
      {
        kind: "p",
        html: "A comprehensive adversarial security audit was performed across the whole application. It found <strong>no critical issue and no way for one user to reach another user's data</strong>: the high-impact vulnerability classes (database injection, command injection, file-path escape, cross-site scripting, and login bypass) were each tested and verified clean. The items found were hardening against denial-of-service and against future misconfiguration, and <strong>all of them were fixed in this release</strong>.",
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "Fixed",
            html: "<strong> Stronger protection against server-side request abuse</strong> — The feature that checks a web page's accessibility now strictly confirms, on every request the page makes, that it is only reaching approved public addresses — never an internal or cloud-metadata address. Verified to still load legitimate state-government pages normally.",
          },
          {
            badge: "Fixed",
            html: "<strong> Hard time limits on document processing</strong> — The audit and remediation steps now have enforced time limits and will cleanly stop a document that is deliberately crafted to run forever, so one upload can't degrade the service for everyone.",
          },
          {
            badge: "API",
            html: "<strong> Additional safe-by-default protections</strong> — Stricter browser security headers on the website, a fail-safe refusal to start if the login secret is ever misconfigured, removal of the sharer's email from public share links, and several smaller defensive fixes. No code path that stores, transmits, or retains your data changed; no retention window, endpoint, or permission changed.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.26.1",
    meta: "Audited <strong>2026-06-10</strong> · scope: follow-up fixes to v1.26.0 — the auto-remediation intake, one title-quality check, and a missing interface icon. No security review was required — nothing about data handling changed.",
    body: [
      {
        kind: "p",
        html: "v1.26.1 lets auto-remediation accept documents with minor, repairable file defects (previously these failed immediately, even though they are exactly the files remediation is for), flags machine-generated download filenames used as document titles so they are not mistaken for real titles, and restores the loading spinner icon. No security-relevant behavior changed.",
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "Note",
            html: "<strong> Remediation accepts repairable files</strong> — A document with a small file defect is repaired during intake instead of being rejected, matching how the audit itself reads such files since v1.26.0.",
          },
          {
            badge: "Note",
            html: '<strong> Filename titles are called out</strong> — A title like "Report-210525T15080148" (a download filename) now earns partial credit with a note to write a real title; short legitimate titles like "COVID-19" are unaffected. Some documents\' Title &amp; Language score may move slightly.',
          },
          {
            badge: "API",
            html: "<strong> No new data and no new attack surface</strong> — The remediation change reads a status code and a file the tool already wrote inside the job's own working folder; the icon fix bundles an image set at build time. No endpoint, retention window, or permission changed.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.26.0",
    meta: "Audited <strong>2026-06-10</strong> · scope: accuracy fixes across the PDF analysis engine — how the document file is read, how tables, forms, lists, and titles are judged, and when the report may claim a confirmed WCAG failure. No security review was required — nothing about data handling changed.",
    body: [
      {
        kind: "p",
        html: 'v1.26.0 corrects cases where the audit reported things that were not true about a document. The most important: a PDF with a minor, repairable file defect (common in older or re-saved documents) was scored as if it had no accessibility tagging at all — the identical document could score 100 or 42 depending on that one defect. The release also stops several false alarms, closes a detection gap, and re-verifies every "How to fix" instruction against Adobe\'s current documentation. An independent code review was completed before release.',
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "Note",
            html: "<strong> Slightly damaged files are now read correctly</strong> — A document with a small, automatically repairable file defect is no longer falsely reported as untagged. Some previously low scores on tagged documents will rise to reflect their real structure.",
          },
          {
            badge: "Note",
            html: '<strong> False alarms removed</strong> — A multiple-choice (radio button) question no longer counts as several unlabeled form fields; tables with merged cells are no longer flagged as irregular; one-word document titles ("Budget2024") are no longer treated as missing; lists without a separate bullet label are no longer failed; and a table nested inside another is no longer counted twice.',
          },
          {
            badge: "Note",
            html: '<strong> "Confirmed failure" now means measured, not guessed</strong> — The conformance verdict only claims a reading-order failure when the tool actually measured the tag order against the visual order, and only claims a missing title when the document truly has none.',
          },
          {
            badge: "API",
            html: "<strong> No new data and no new attack surface</strong> — Every fix reads output the analysis tools already produced for the same document. No code path that stores, transmits, or retains data changed; no endpoint, retention window, or permission changed.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.25.0",
    meta: "Audited <strong>2026-06-05</strong> · scope: PDF/UA + artifact + font detection fixes, link and reading-order scoring calibration, and a new PDF/UA-1 conformance-signals panel. No security review was required — nothing about data handling changed.",
    body: [
      {
        kind: "p",
        html: "v1.25.0 corrects how the audit reads three signals it had been reporting incorrectly (the PDF/UA identifier, artifact tagging, and embedded Type3 fonts), softens two score rules to match WCAG and PAC (a visible web address used as link text is no longer treated as a failure; an essentially-correct reading order is no longer docked for a tiny measurement difference), and adds a panel summarizing the document's PDF/UA-1 signals. No security-relevant behavior changed.",
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "Note",
            html: '<strong> More accurate findings</strong> — The report no longer claims a PDF/UA-tagged file "has no PDF/UA identifier" or "no artifact tags," and it no longer flags embedded Type3 fonts as missing. These were wording/display errors; document scores were not affected by them.',
          },
          {
            badge: "Note",
            html: "<strong> Two score rules relaxed</strong> — A link whose visible text is a full web address now counts as acceptable (it tells the reader where it goes), and a document whose reading order is essentially correct is no longer docked for a 1–2% measurement difference. Some documents score slightly higher.",
          },
          {
            badge: "API",
            html: "<strong> No new data and no new attack surface</strong> — The fixes read data the analyzers already produced; the new PDF/UA-1 panel displays values already computed during the audit. No code path, endpoint, retention window, or data-handling behavior changed.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.24.2",
    meta: "Reviewed <strong>2026-06-05</strong> · entry recorded 2026-08-08 · scope: a table scoring rule that penalised documents for something the standard does not require.",
    body: [
      {
        kind: "p",
        html: "<strong>A table without a caption is no longer marked down.</strong> A caption is good practice, but no accessibility success criterion requires one — and a fully conformant simple table without one was being capped at 95. Those points are now awarded unconditionally and a missing caption is raised as an optional suggestion. Combined with the header correction in the previous release, a simple table built correctly now scores 100. Scores can move slightly upward on documents containing uncaptioned tables. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.24.1",
    meta: "Reviewed <strong>2026-06-05</strong> · entry recorded 2026-08-08 · scope: three reporting and scoring inaccuracies reported by a user.",
    body: [
      {
        kind: "p",
        html: '<strong>Three inaccuracies in what reports said about tables and headings were corrected, all reported by someone using the tool.</strong> A table nested inside another table\'s cell was being counted as a separate table, so reports showed more tables and more rows than the document actually had. Headings were being listed in the order they happened to be stored rather than in reading order, so a heading added later could appear at the end of the outline — which also carried a hidden scoring fault, since an out-of-order list could trigger a false "heading levels skipped" penalty.',
      },
      {
        kind: "p",
        html: "<strong>And a table could score below 100 while passing every check.</strong> The standard permits two methods of associating a table's headings with its data, and only one of them was being credited; a table built correctly using the other was losing points it had earned. Both are now accepted, which is what the formal conformance check and independent tools already did. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.24.0",
    meta: "Audited <strong>2026-06-03</strong> · scope: WCAG 2.2 re-anchor, IITAA 2.1 citations, announcement banner, and a new /wcag-2-2 page. No security review was required — nothing about data handling changed.",
    body: [
      {
        kind: "p",
        html: 'v1.24.0 re-anchors the displayed standard to WCAG 2.2 Level AA, a superset of the WCAG 2.1 AA that IITAA 2.1 (§E205.4) and ADA Title II require. No automated check changed and no score weight changed; the new 2.2 criteria are interactive/manual and are shown as "not assessed — manual review" (only for documents with interactive form fields). The audit can be reverted to WCAG 2.1 by an administrator via the WCAG_VERSION environment setting. No security-relevant behavior changed.',
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "Note",
            html: '<strong> WCAG 2.2 Level AA is now the displayed standard</strong> — The audit labels, conformance verdict, exports, and UI copy all reference WCAG 2.2 AA (a strict superset of WCAG 2.1 AA). New 2.2 criteria are shown as "not assessed — manual review" rather than pass or fail. WCAG 2.1 AA remains the legal minimum under IITAA 2.1 §E205.4 and ADA Title II; WCAG 2.2 is the newer, stricter version.',
          },
          {
            badge: "Note",
            html: '<strong> IITAA 2.1 cited throughout</strong> — Illinois IITAA 2.1 is now cited alongside WCAG and ADA Title II across the homepage, footer, conformance box, exports, and meta. This page\'s §1 description and the compliance-explainer in §10 have been updated to include "IITAA 2.1".',
          },
          {
            badge: "API",
            html: "<strong> No new data and no new attack surface</strong> — All changes are presentational. No code path, endpoint, or data-handling behavior changed; every defensive control from prior releases remains in force. The WCAG_VERSION env flag controls text and criteria display only.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.23.0",
    meta: "Reviewed <strong>2026-06-03</strong> · entry recorded 2026-08-08 · scope: making every report state which document it describes — not a security release.",
    body: [
      {
        kind: "p",
        html: "<strong>Every report now names the file it describes, in full, across the top.</strong> A report that is saved, printed or forwarded on could previously be mistaken for one about a different document — the filename appeared only in smaller text beside the score. It now leads the page as a banner, wrapping rather than being cut short, and carries the same prominence into every downloadable form: the web page, the printable version, the Word version and the plain-text version all lead with the file's name. This is a provenance improvement rather than a security one: an accessibility report is a record about a specific document, and a record that cannot be tied confidently to its subject is of limited use to whoever receives it. <strong>No change to what data is collected, how it is used, or how long it is kept.</strong>",
      },
    ],
  },
  {
    version: "v1.22.3",
    meta: "Audited <strong>2026-05-22</strong> · scope: a scoring-engine cleanup — a more honest summary, a rounding fix, and removal of dead code. No security review was required; nothing about data handling changed.",
    body: [
      {
        kind: "p",
        html: "v1.22.3 refines how the audit is scored and explained. It does not change what the audit collects, where it is stored, or how long it is kept. No new endpoints, no authentication change, no retention change, no new attack surface.",
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "Note",
            html: '<strong> A more honest plain-language summary</strong> — The summary shown with the score now takes the WCAG conformance verdict into account. Previously a document could be summarised as "strong" while the verdict box separately reported a failure; a confirmed failure is now reflected in the summary as well.',
          },
          {
            badge: "Note",
            html: "<strong> A category one item short can no longer look perfect</strong> — Category scores for alt text, links, and form fields are now rounded down. A document missing one item out of many — for example one image without alternative text — can no longer round up to a flawless score; it now scores just below 100, so the report never implies a category is issue-free when it is not.",
          },
          {
            badge: "API",
            html: "<strong> Dead code removed; no new attack surface</strong> — About 170 lines of unreachable scoring code were deleted. This release is internal computation only — no code path, endpoint, or data-handling behaviour changed, and every defensive control from prior releases remains in force.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.22.2",
    meta: "Audited <strong>2026-05-22</strong> · scope: one verdict-box heading string and a documentation correction. No security review was required — nothing about data handling changed.",
    body: [
      {
        kind: "p",
        html: "v1.22.2 reworks the wording shown in the conformance verdict box when a document does not pass, and corrects stale test counts in the project README. It does not change what the audit checks, what data is collected, where it is stored, or how long it is kept. No new endpoints, no authentication change, no retention change, no new attack surface.",
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "Note",
            html: '<strong> Clearer next-step wording on a failing document</strong> — When a document does not pass, the verdict box heading now says it needs "additional manual remediation" — a plain signal that automated tooling has done what it can and the remaining fixes are hands-on (Adobe Acrobat\'s Accessibility Checker, or correcting the source document and re-exporting).',
          },
          {
            badge: "API",
            html: "<strong> No new data and no new attack surface</strong> — This release is a copy and documentation change only. No code path, endpoint, or data-handling behavior changed; every defensive control from prior releases remains in force.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.22.1",
    meta: "Audited <strong>2026-05-22</strong> · scope: a wording and presentation change to the conformance verdict box. No security review was required — nothing about data handling changed.",
    body: [
      {
        kind: "p",
        html: "v1.22.1 changes how the v1.22.0 <strong>WCAG conformance verdict</strong> is <em>displayed</em>. It does not change what the audit checks, what data is collected, where it is stored, or how long it is kept. No new endpoints, no authentication change, no retention change.",
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "Note",
            html: "<strong> Clearer, less alarming verdict wording</strong> — When a document scores well (an A or B grade) but still has a flagged accessibility issue, the verdict box now explains plainly that WCAG is judged one criterion at a time — a single gap is still worth fixing, but a strong grade still means the document is in good shape. The box is shown in green for strong documents and red for weak ones; every flagged issue is still listed in full, whatever the color.",
          },
          {
            badge: "New",
            html: "<strong> Links to the official standards</strong> — The verdict box now links directly to the published WCAG 2.1, Illinois IITAA, and ADA Title II standards, so a reader can check the rules the audit measures against at their source.",
          },
          {
            badge: "API",
            html: "<strong> No new data and no new attack surface</strong> — This release is presentation only. The verdict is still computed from information the audit already produced, the downloadable reports are unchanged, and no new information is sent or stored anywhere. Every defensive control from prior releases remains in force.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.22.0",
    meta: "Audited <strong>2026-05-21</strong> · scope: a scoring-methodology release — a new WCAG conformance verdict, recalibrated category weights, and clearer labels. Reviewed with an adversarial scoring audit, not a red/blue-team security review.",
    body: [
      {
        kind: "p",
        html: "v1.22.0 changes how the audit is <em>scored and explained</em> — it does not change what data is collected, where it is stored, or how long it is kept. No new endpoints, no authentication change, no retention change. The headline addition is a plain pass/fail <strong>WCAG 2.1 conformance verdict</strong> shown alongside the 0–100 score, because a high score is not the same thing as passing WCAG. One correctness bug found during the review was fixed before this release was tagged.",
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "New",
            html: '<strong> WCAG conformance verdict</strong> — Every audit now states plainly whether the document has confirmed failures against <strong>WCAG 2.1 Level AA</strong> — the standard the Illinois IITAA and the federal ADA Title II rule require. The verdict is separate from the 0–100 score and never claims a document is "conformant"; when the automated checks find nothing it says so, and still asks for manual review. Each cited rule links to the official W3C explanation.',
          },
          {
            badge: "Fix",
            html: '<strong> No false verdicts on unreadable files</strong> — The review found that a damaged or password-protected PDF could be handed a fabricated "fails WCAG" verdict because the analyzer had not actually been able to read it. That is now fixed: an unreadable file honestly reports that no verdict could be determined.',
            note: "This was a correctness defect in brand-new code, caught and fixed before tagging — no released version ever shipped it.",
          },
          {
            badge: "Note",
            html: "<strong> Scores shifted — by design</strong> — Category weights and some labels were recalibrated to match WCAG conformance levels more honestly. As a result, a score produced by v1.22.0 is not directly comparable to a score from an earlier version. An audit campaign that spans this upgrade will see numbers move; that movement reflects the improved methodology, not a change in the documents.",
          },
          {
            badge: "API",
            html: "<strong> No security regressions</strong> — Every defensive control from prior releases remains in force. No schema migration. The conformance verdict is computed from data the audit already produced; the report exports gained a verdict section but send no new data anywhere.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.21.1",
    meta: "Audited <strong>2026-05-19</strong> · scope: shared-report UI parity with the real-time audit page, plus an elevated analyze rate limit for the duration of the in-flight ICJIA fleet audit campaign.",
    body: [
      {
        kind: "p",
        html: "This is a small <strong>follow-up release</strong> to v1.21.0, not a security change. v1.21.0 simplified the live audit page by removing the Adobe Acrobat parity panel, but the same panel was left in place on the shared-report page (<code>/report/:id</code>) — so two auditors looking at the same content via different URLs ended up seeing two different summaries. This release fixes that inconsistency. It also bumps the per-caller hourly analyze rate limit to support an in-flight fleet audit pass.",
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "UX",
            html: "<strong> Consistency</strong> — Shared and saved report pages now show exactly what the live audit page shows. No more Acrobat parity panel on <code>/report/:id</code>.",
            note: "<strong>What was wrong:</strong> v1.21.0 removed the 32-rule Adobe Acrobat parity card from the live audit page in favor of a single WCAG-anchored Strict score, but the same card kept rendering on the shared-report page. Auditors comparing notes off a shared link saw a presentation that didn't match the live audit, which could read as a deliberate difference in scoring. <br /> <strong>What this release does:</strong> the parity-card block was removed from the shared-report template. The underlying <em>data</em> is still saved in the database (so historic API consumers that already parse it keep working), but it's no longer rendered on the page. No schema change. The per-finding \"How to Fix in Adobe Acrobat\" remediation guidance inside each category card is kept — that's per-finding remediation advice, not a separate scoring profile, and it appears on the live audit page too.",
          },
          {
            badge: "OPS",
            html: "<strong> Elevated analyze rate limit for the audit campaign</strong> — The per-caller hourly analyze rate limit was raised from <strong>35/hour</strong> to <strong>5000/hour</strong> for the duration of the in-flight ICJIA fleet audit campaign. The ~5000-PDF inventory is being re-audited across multiple passes over several days as content is remediated and re-checked, not a single one-shot pass. The elevated limit will stay in place for the duration of the campaign and revert to a tighter number once it concludes.",
            note: "<strong>Why this is OK:</strong> the per-caller analyze limit is a fair-use throttle. The actual abuse mitigations live on the remediation side — the 100/day remediation cap per caller, the 60-minute audit-gate <code>sha256(bytes)</code> hash check, the SSRF allowlist, the upload size cap, and the auth gate are all unchanged. The audit pipeline does not write user-supplied content to durable storage beyond the lightweight <code>audit_log</code> row (no PDF bytes; just metadata).",
          },
          {
            badge: "API",
            html: "<strong> No security regressions</strong> — Every other defensive control from v1.20.1 and v1.21.0 remains in force. No schema migration. No change to the authentication layer, the SSRF allowlist, the audit-gate hash check, the daily remediation cap, the retention windows, or the URL-fetch posture.",
            note: "The two changes in this release are a 5-line UI deletion on the shared-report template and a single numeric raise on one rate-limit constant. No other code paths were touched.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.21.0",
    meta: "Audited <strong>2026-05-19</strong> · scope: simplification release. Retired the dual Strict/Practical scoring toggle in favor of a single canonical Strict score; promoted veraPDF PDF/UA-1 verdict on the remediation result page.",
    body: [
      {
        kind: "p",
        html: 'This release is a <strong>UI simplification</strong>, not a security change. Auditors and agency staff consistently reported that the audit page was hard to read because it showed two scoring profiles at once — "Strict" and "Practical" — and asked users to choose between them. That cognitive load got in the way of the actual accessibility findings. After review, the team retired Practical and kept Strict, which is the WCAG 2.1 AA + IITAA §E205.4-anchored score that maps directly to Illinois accessibility law. The PDF/UA technical conformance signal that Practical tried to summarize is now surfaced more authoritatively on the remediation page via a dedicated <em>veraPDF</em> Pass/Fail check.',
      },
      { kind: "h", text: "What changed for an auditor reading this page" },
      {
        kind: "findings",
        items: [
          {
            badge: "UX",
            html: '<strong> Simplified</strong> — The audit results page shows one score, anchored to WCAG and IITAA. No more "view by Strict / view by Practical" toggle. The grade you see is the legally-relevant grade.',
            note: '<strong>What was wrong:</strong> showing two profiles created an implicit "which one is correct?" question for the reader. The Strict view is what Illinois IITAA and the ADA point to; the Practical view layered a separate PDF/UA-flavored weighting on top, which was useful for tool reconciliation but not for publication decisions. <br /> <strong>What this release does:</strong> the audit page now shows only the Strict / WCAG-anchored score. The underlying scoring engine is unchanged — same nine categories, same weights, same WCAG-anchored thresholds. Just less noise on the page.',
          },
          {
            badge: "UX",
            html: "<strong> Promoted</strong> — The remediation result page now surfaces a clear <em>PDF/UA-1: Pass / Fail / Not run</em> badge right next to the post-remediation score.",
            note: '<strong>What was wrong:</strong> the veraPDF conformance verdict (an open-source check against the published PDF/UA-1 / ISO 14289-1 standard) was already running as part of every remediation, but it was buried in a section labeled "Compliance disclaimer" further down the result page. Auditors needing the PDF/UA verdict had to scroll. <br /> <strong>What this release does:</strong> a compact Pass/Fail badge appears immediately below the score; the detailed section below was renamed to "PDF/UA-1 conformance check" so its purpose is obvious; the badge jumps to that section for the full rule failure list when failures exist. When veraPDF isn\'t installed on the server, the badge clearly reads <em>"check not run"</em> rather than pretending the check ran successfully.',
          },
          {
            badge: "API",
            html: "<strong> Compatibility</strong> — Historical reports and external automation keep working without changes.",
            note: "<strong>What was wrong:</strong> a hard removal of the Practical profile would have broken the fleet-CSV integration shipped in v1.20.0, which lists both Strict and Practical columns per audited PDF. <br /> <strong>What this release does:</strong> the <code>scoreProfiles.remediation</code> field and the <code>practical</code> key in the <code>/api/audit-url</code> response are kept as <strong>aliases of Strict</strong> — same number, same grade. External CSV consumers see both columns populated with the Strict score and don't need updates. The alias will be removed in a future release once we've confirmed no consumer depends on the values differing.",
          },
          {
            badge: "API",
            html: "<strong> No security regressions</strong> — All SSRF, rate-limit, audit-gate, daily-cap, and retention controls from v1.20.1 remain in force. The cleanup pass still purges remediation files, jobs, and audit-log rows on schedule.",
            note: "The simplification is a UI and scoring-presentation change. It does not modify the upload pipeline, the authentication layer, the rate limiters, the audit-gate hash check, the daily cap, the SSRF protections, or the retention windows.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.20.1",
    meta: "Audited <strong>2026-05-18</strong> · scope: post-feature red/blue team review of the v1.20.0 fleet-integration surface",
    body: [
      {
        kind: "p",
        html: "This is a dedicated security release that follows the team's standing practice: <strong>every feature ships through a fresh red/blue team review before tagging</strong>. The v1.20.0 release introduced the fleet-audit-by-URL endpoint; this review examined that new surface plus the related existing endpoints, found seven issues worth flagging, and fixed all of them before this release was tagged. The purpose of this entry is to document those findings so an auditor can see (a) what was looked at, (b) what was discovered, (c) what was done about it, and (d) how the team's iterative-review pattern works.",
      },
      { kind: "h", text: "Findings & what was done" },
      {
        kind: "findings",
        items: [
          {
            badge: "P1",
            html: "<strong> Fixed</strong> — A DNS-based trick could have let an attacker reach the server's own internal network through our URL audit endpoint.",
            note: "<strong>What was wrong:</strong> when someone submitted a URL for audit, the tool checked whether the <em>hostname</em> matched the allowlist of approved ICJIA domains before fetching it. If an attacker could control DNS for any subdomain of an approved domain — for example, by compromising a partner agency that operates a subdomain — they could point that hostname at the server's loopback address (127.0.0.1) and trick us into fetching our own internal services on their behalf.<br /> <strong>How it was fixed:</strong> the tool now resolves the hostname's IP address itself, before fetching, and refuses to connect to any IP in private, loopback, link-local, or multicast ranges. The check repeats on every redirect hop so a redirector planted on an approved host can't chain us into a private address either. The fix covers both IPv4 and IPv6.",
          },
          {
            badge: "P1",
            html: "<strong> Fixed</strong> — Redirects from approved hosts to private addresses were silently followed.",
            note: "<strong>What was wrong:</strong> when the URL audit endpoint encountered an HTTP redirect, it followed the chain up to 20 hops without re-checking each hop against the allowlist. An attacker who could place content on an approved host could redirect us through to an internal address.<br /> <strong>How it was fixed:</strong> redirects are now handled manually with the full allowlist and DNS-IP check on every hop, capped at three redirects total.",
          },
          {
            badge: "P1",
            html: "<strong> Fixed</strong> — The bulk-inventory endpoint had no allowlist check at all.",
            note: "<strong>What was wrong:</strong> caught during the security review while migrating the other URL-fetch endpoints. The bulk-inventory endpoint accepts a list of PDF URLs and fetches each one. It had its own private fetcher with no allowlist — an authorized user could submit a list containing internal addresses and the tool would fetch them. Latent since the endpoint shipped, not previously discovered.<br /> <strong>How it was fixed:</strong> the bulk endpoint now uses the same allowlist-plus-private-IP-block plumbing as the other URL endpoints.",
          },
          {
            badge: "P2",
            html: "<strong> Fixed</strong> — In no-login deployments, one user could unlock remediation for content audited by a different user.",
            note: '<strong>What was wrong:</strong> when the tool is run without requiring login, every user is treated as the same "anonymous" identity. The new <em>audit-before-remediation</em> check (added in this release — see "Added" below) would have matched any anonymous user\'s audit against any other anonymous user\'s remediation attempt.<br /> <strong>How it was fixed:</strong> in no-login mode, the identity now includes the user\'s IP address. The production deployment requires login, so this issue never affected real users.',
          },
          {
            badge: "P2",
            html: "<strong> Fixed</strong> — The audit-history table grew without limit.",
            note: "<strong>What was wrong:</strong> the canonical audit-history table had no retention policy. An attacker repeatedly auditing unique files could slowly fill the database.<br /> <strong>How it was fixed:</strong> records older than 365 days are now purged by the periodic cleanup sweep, matching the share-link retention window.",
          },
          {
            badge: "P2",
            html: "<strong> Fixed</strong> — A narrow race window let two simultaneous remediation requests both pass the daily limit.",
            note: '<strong>What was wrong:</strong> the daily-limit check and the actual job-creation were two separate steps. Two perfectly-simultaneous requests at the cap boundary could both see "you\'re under the limit" and both proceed.<br /> <strong>How it was fixed:</strong> the limit check is now repeated as part of the same atomic database transaction that creates the job, so the cap can no longer be exceeded by even one.',
          },
          {
            badge: "P3",
            html: "<strong> Verified clean</strong> — Browser cookie security flags.",
            note: "<strong>What was checked:</strong> the login session cookie is set with the protective flags (HttpOnly, Secure, SameSite-Strict) that prevent it from being read by client-side scripts, transmitted over plain HTTP, or sent with cross-site requests.<br /> <strong>Result:</strong> all three flags are correctly set in production. No change needed; recorded in this audit trail for completeness.",
          },
        ],
      },
      { kind: "h", text: "Also added in this release — driven by the same security thinking" },
      {
        kind: "bullets",
        items: [
          {
            html: "<strong>Audit required before remediation.</strong> Every request to remediate a PDF must be preceded by an audit of the same content within the previous 60 minutes. Any audit path counts — direct upload, URL audit, or fleet bulk. This prevents automated abuse where someone bypasses the audit pipeline and floods the remediation worker directly.",
          },
          {
            html: "<strong>Daily remediation cap.</strong> Up to 100 remediations per caller per 24 hours. Sized so a normal agency workflow (~50 PDFs in a busy day) is unaffected, but a flood of thousands is blocked.",
          },
          {
            html: "<strong>Unified audit record.</strong> Every audit endpoint now writes a row to the canonical audit-history table with the content fingerprint (SHA-256 hash of the file's bytes). Required so the audit-before-remediation gate works uniformly across all audit paths. The hash is just a fingerprint — it doesn't expose the PDF's contents and can't be reversed back into the document.",
          },
        ],
      },
      { kind: "h", text: "Methodology — for the auditor record" },
      {
        kind: "p",
        html: "The team follows a deliberate practice: <strong>every feature ships through a fresh red/blue team review before tagging</strong>. The review examines the newly-introduced surface from a sophisticated-adversary perspective, looks for attack patterns like DNS rebinding, race conditions, identity collapse, and slow-burn denial-of-service, and either fixes findings in the same release window or documents them for future work. This release (v1.20.1) is the security-followup to v1.20.0, which added the fleet-audit-by-URL feature. The pattern repeats with every feature release — earlier entries in this audit history list the findings from prior reviews.",
      },
      {
        kind: "p",
        html: "For a manager reading this page: the intent here is transparency. The tool is built and reviewed iteratively, and this page is the auditor-readable trail of what was reviewed, what was found, what was fixed, and what was deliberately accepted with mitigation. The technical equivalent (with full code references) lives in <code>README.md § Security</code> for engineers and security reviewers who need that level of detail.",
      },
    ],
  },
  {
    version: "v1.20.0",
    meta: "Audited <strong>2026-05-18</strong> · scope: download filename dialog, PDF export, accessibility polish",
    body: [
      {
        kind: "p",
        html: "A feature release with two material auditor-facing changes: remediated PDFs can now be downloaded under the <em>exact</em> original filename (critical for CMS file replacement, where existing links resolve by name), and the audit report can be saved as a PDF using the browser's own print dialog. No new data is collected, retained, or transmitted. The retention policy described elsewhere on this page is unchanged.",
      },
      { kind: "h", text: "Findings & changes" },
      {
        kind: "findings",
        items: [
          {
            badge: "P3",
            html: "<strong> Changed</strong> — Remediated PDF download now defaults to the user's exact original filename.",
            note: '<strong>What changed:</strong> when a user remediates a PDF and clicks Download, the file is now saved under the same filename they uploaded — including any spaces, unicode, or punctuation. The download dialog presents three options with "Keep original filename" pre-selected and badged Recommended. The other two ("Add a _remediated suffix" or "Use a different filename") are opt-in.<br /> <strong>Why:</strong> the most common workflow for remediating an agency PDF is to replace the file in the CMS in place — every existing link on the website, in old emails, in shared documents, keeps working as long as the filename matches. The previous behavior automatically appended <em>_remediated</em> to the filename, which broke this workflow.<br /> <strong>Safeguards:</strong> the "use a different filename" path explicitly warns the user that the change will break existing links and requires a second click of the Download button to confirm. There is no path traversal risk — the custom filename is treated only as a display name for the browser\'s save dialog and is capped, encoded, and forced to <code>.pdf</code> before being sent in the response header. The actual file on disk is always located by job ID, never by user-supplied filename.',
          },
          {
            badge: "P3",
            html: "<strong> Added</strong> — Audit reports can now be saved as PDF via the browser's print dialog.",
            note: "<strong>What changed:</strong> the audit report page and the shared-report page each gained a \"PDF (browser print)\" button. Clicking it opens the browser's own print dialog, where the user picks \"Save as PDF\" as the destination. The page applies a print stylesheet that hides interactive controls, switches to black-on-white text, expands collapsed technical sections, and arranges page breaks cleanly.<br /> <strong>What this does <em>not</em> change:</strong> no new server-side rendering happens — the PDF is created entirely by the user's own browser, on the user's own machine. No PDF content is transmitted to or stored on our server as part of this feature. The chosen filename is whatever the user types in the browser's save dialog and is not visible to us.",
          },
          {
            badge: "P3",
            html: "<strong> Fixed</strong> — Accessibility polish on the remediation result page.",
            note: "<strong>What changed:</strong> the result page was showing layout shift after content loaded (a known accessibility annoyance for users on slow connections or with reduced-motion preferences), and result sections were appearing partway through the progress animation rather than after it. Both fixed.<br /> <strong>Visible improvement:</strong> Lighthouse performance score on the result page rose from 84 to 96 on desktop. No retention or privacy implications.",
          },
        ],
      },
      { kind: "h", text: "Operational improvements" },
      {
        kind: "bullets",
        items: [
          {
            html: "New <code>AGENTS.md</code> at the repository root documents the load-bearing conventions for AI coding agents (Claude Code, Codex, Cursor, etc.) so engineers using those tools to extend the code base get oriented in one read. Not user-facing; reduces the chance of a misconfigured agent committing the wrong thing.",
          },
          {
            html: 'The "Technical Details" expandable on the main results page now includes the same four pipeline diagrams already on the standalone <a href="/technical-details">Technical Details</a> page.',
          },
        ],
      },
    ],
  },
  {
    version: "v1.19.0",
    meta: "Audited <strong>2026-05-18</strong> · scope: fleet integration + accessibility polish + retention-policy change",
    body: [
      {
        kind: "p",
        html: "This release adds the fleet inventory integration (one HTTP call per PDF returns strict + practical grades plus a year-long shareable report link), expands the URL allowlist to cover all <code>*.illinois.gov</code> state-agency subdomains, bumps the shared-report retention window from 15 days to 365 days, and fixes seven accessibility rule violations across the public policy + technical-details pages. The most material policy change for an auditor reading this page is the retention bump — see the first finding below.",
      },
      { kind: "h", text: "Findings & changes" },
      {
        kind: "findings",
        items: [
          {
            badge: "P2",
            html: "<strong> Accepted</strong> — Shared-report retention window extended from 15 days to 365 days.",
            note: "<strong>What changed:</strong> when someone creates a shareable audit-report link (either from the web UI's \"Create Shareable Link\" button or via the new fleet audit-by-URL automation), the resulting link now stays valid for one year instead of 15 days. This applies to the metadata record only — no PDF content is stored alongside it. After 365 days the row becomes eligible for the periodic cleanup sweep and the URL stops working.<br /> <strong>Why:</strong> auditors and managers reviewing fleet-inventory reports (which list every PDF across ICJIA's sites) need report links that survive between quarterly review cycles. A 15-day TTL caused most links to break before the next review even happened.<br /> <strong>Storage cost:</strong> the row holds scores, category findings, and timestamps — no PDF bytes. A 100-PDF fleet at roughly 50 KB per record grows the database by about 5 MB per year. The tradeoff was evaluated and accepted in favor of usability.",
          },
          {
            badge: "P2",
            html: "<strong> Accepted</strong> — URL allowlist expanded so the fleet automation can audit PDFs across the full Illinois state-agency footprint.",
            note: "<strong>What changed:</strong> the audit-by-URL endpoint previously accepted only a handful of explicit ICJIA subdomains. It now also accepts: <code>illinois.gov</code> (every state-agency subdomain), <code>icjia.cloud</code>, <code>icjia.app</code>, and <code>ilheals.com</code> (each including all subdomains).<br /> <strong>Why:</strong> the ICJIA fleet audit lists PDFs across every site the agency operates and every partner agency. The previous narrow allowlist couldn't cover that fleet.<br /> <strong>What it doesn't change:</strong> all of the existing protections still apply — the server still blocks private / local / loopback addresses (no SSRF into internal networks), still rejects oversized files (100 MB cap), still requires the fetched bytes to begin with the <code>%PDF-</code> header, and still rejects look-alike domains (a URL like <code>illinois.gov.evil.com</code> does <em>not</em> match the allowlist). The threat profile is the same as a person pasting any one of these URLs into the web interface.",
          },
          {
            badge: "P3",
            html: "<strong> Fixed</strong> — Seven accessibility rule violations on the public policy and technical-details pages.",
            note: "<strong>What was wrong:</strong> a full axe + Lighthouse audit found that the diagram boxes on these pages couldn't be reached via keyboard, that an inline link in this audit history section was distinguishable only by color (a barrier for colorblind readers), and that several scrollable code blocks couldn't be scrolled without a mouse.<br /> <strong>How it was fixed:</strong> each scrollable region is now keyboard-focusable, the inline link is now underlined, and the diagram boxes' redundant ARIA labels were replaced with proper structural markup. Both pages now score a perfect 100 / 100 on both axe (no violations) and Lighthouse's accessibility audit.",
          },
          {
            badge: "P3",
            html: "<strong> Fixed</strong> — The new fleet endpoint reported the strict score in both the strict and practical slots of its response.",
            note: '<strong>What was wrong:</strong> the new <code>/api/audit-url</code> endpoint had a key-name mismatch with the underlying scoring engine — what the engine internally calls "remediation" the user interface labels "practical." The endpoint looked for the wrong name, found nothing, and fell back to the strict score, so the practical column in the fleet output would have shown the strict number instead of the practical one.<br /> <strong>How it was fixed:</strong> caught in the local smoke-test step before any caller integrated against the endpoint, so no production fleet report ever published the wrong number. The name mapping is now correct (verified against three test PDFs whose strict and practical scores genuinely differ).',
          },
        ],
      },
    ],
  },
  {
    version: "v1.18.1",
    meta: "Audited <strong>2026-05-18</strong> · scope: veraPDF integration correctness + remediation result-page UX",
    body: [
      {
        kind: "p",
        html: "A patch release with four operational fixes against the v1.18.0 remediation feature. None of these findings expose private data or change the file-retention guarantees described elsewhere on this page. One finding is security-adjacent: an auditor who consulted the PDF/UA-1 compliance card on the remediation result page would have seen a silently wrong verdict in any deployment running a recent veraPDF version. Note: at the time of the fix, this feature flag was still off in production, so no real audit was shown the wrong verdict.",
      },
      { kind: "h", text: "Findings" },
      {
        kind: "findings",
        items: [
          {
            badge: "P1",
            html: '<strong> Fixed</strong> — PDF/UA-1 compliance verdict was always shown as "not compliant," regardless of the actual PDF.',
            note: '<strong>What was wrong:</strong> the tool calls a third-party validator (veraPDF) to report whether the remediated PDF technically conforms to the PDF/UA-1 accessibility standard. The newest version of that validator changed the shape of its result data slightly (it now returns a list of profile results rather than a single one). The tool was reading the result in the old shape, so the verdict was always missing, and the missing verdict was treated as "not compliant." Any auditor looking at the compliance card on the result page would have been shown an incorrect technical verdict.<br /> <strong>How it was fixed:</strong> the tool now handles both the new and old result shapes correctly. Verified against a live install of the latest veraPDF version. No production deployment had this feature enabled yet at the time of the fix, so no real audit was actually shown the wrong verdict.',
          },
          {
            badge: "P2",
            html: "<strong> Fixed</strong> — A second veraPDF shape change could have caused a crash inside the validation routine.",
            note: '<strong>What was wrong:</strong> in the same shape change that broke the verdict, veraPDF also moved its rule-by-rule detail list. A defensive fallback in the tool would have tried to read the new "count of failed rules" as if it were a list, which would have crashed the validation routine on certain inputs.<br /> <strong>How it was fixed:</strong> the unsafe fallback was removed and the read order was updated to prefer the new location first. No crashes were observed in production — this was caught during the same review as the P1 above.',
          },
          {
            badge: "P3",
            html: "<strong> Fixed</strong> — Failure count under-reported on heavily-non-compliant PDFs.",
            note: "<strong>What was wrong:</strong> the tool reported a compliance-failure total based on the top 20 issues it displayed, rather than veraPDF's own total. On a deeply non-compliant PDF the displayed total would have been lower than reality.<br /> <strong>How it was fixed:</strong> the tool now uses veraPDF's own total when available. Older veraPDF versions still use the \"sum the displayed list\" fallback.",
          },
          {
            badge: "P3",
            html: '<strong> Fixed</strong> — The "Fix steps" links on the remediation result page were dead.',
            note: '<strong>What was wrong:</strong> clicking "Fix steps" next to an outstanding issue on the result page did nothing. The link tried to jump to a card that exists on the audit page but not the result page.<br /> <strong>How it was fixed:</strong> each issue row now opens an inline accordion showing the detailed findings and numbered Adobe Acrobat fix steps right there on the result page — no navigation needed. Same content as the audit-page cards. Not a privacy or security issue, but a real usability problem for an auditor following up on outstanding items.',
          },
        ],
      },
      { kind: "h", text: "Operational improvements" },
      {
        kind: "bullets",
        items: [
          {
            html: "The Ubuntu deploy script (<code>rebuild.sh</code>) now auto-detects an installed veraPDF and, when it isn't installed, prints copy-paste install instructions including the persistence command so the path survives a server reboot. Reduces drift between development and production installs.",
          },
        ],
      },
    ],
  },
  {
    version: "v1.18.0",
    meta: "Audited <strong>2026-05-18</strong> · scope: PDF auto-remediation feature (entire new surface)",
    body: [
      {
        kind: "p",
        html: "The remediation pipeline was the first major surface added to this tool. The pre-release red/blue team review covered the public API endpoints, the worker, the frontend, the cleanup sweep, the database schema, and the file lifecycle. The 15-row threat-model checklist documented in <code>docs/archive/pdf-remediation-integration-plan.md</code> (§ Security) was the basis of the review.",
      },
      { kind: "h", text: "Findings" },
      {
        kind: "findings",
        items: [
          {
            badge: "P1",
            html: "<strong> Fixed</strong> — Memory exhaustion via large output downloads.",
            note: "<strong>What was wrong:</strong> the download endpoint loaded the entire remediated PDF (up to 50 MB) into the API process's memory before sending it to the user's browser. Under several simultaneous downloads, this could exceed the API process's 512 MB memory cap and crash it. <br /> <strong>How it was fixed:</strong> switched to streaming the file in small chunks (<code>createReadStream + stream.pipe(res)</code>). Memory usage is now constant regardless of output size.",
          },
          {
            badge: "P1",
            html: "<strong> Fixed</strong> — Race condition allowed concurrent double-download.",
            note: '<strong>What was wrong:</strong> the download token was supposed to be single-use, but two near-simultaneous requests with the same token could both pass the validation check and both retrieve the file before either completed. This violated the "single-use" privacy guarantee.<br /> <strong>How it was fixed:</strong> the job is marked <code>status=\'expired\'</code> <em>before</em> the file is sent, so any concurrent second request immediately sees the expired status and receives a "410 Gone" response.',
          },
          {
            badge: "P2",
            html: "<strong> Mitigated</strong> — Auth-bypass when login is not required (dev/internal mode).",
            note: '<strong>What was found:</strong> when the tool runs with the "require login" flag turned off (typical for internal development), the per-job email check on the status, download, and receipt endpoints is bypassed. Anyone who knows a job\'s UUID could read its data.<br /> <strong>How it was handled:</strong> job UUIDs use 122 bits of cryptographic randomness — guessing one is computationally impractical. Production deployments run with login required, which closes the gap entirely. This limitation is documented in the integration plan as the known posture; it does not affect the production deployment.',
          },
          {
            badge: "P2",
            html: "<strong> Accepted</strong> — Legacy scoring data computed but unused.",
            note: "<strong>What was found:</strong> the Adobe Acrobat parity score (a 32-rule check) is still calculated on the server even though the user interface no longer displays it. Costs about 50 milliseconds per audit.<br /> <strong>How it was handled:</strong> intentionally kept for data-shape stability so existing tests and audit-log entries continue to work. May be removed in a future release if the cost ever matters. Not a privacy or security issue — just dead code.",
          },
          {
            badge: "P3",
            html: "<strong> Accepted</strong> — Conservative PDF validation rejects borderline files.",
            note: "<strong>What was found:</strong> the <code>qpdf --check</code> validator flags some technically-valid PDF outputs as \"warnings,\" which the tool treats as failures.<br /> <strong>How it was handled:</strong> accepted by design. Better to reject a borderline file (the user is told the remediation didn't work, can try a different path) than to serve a file that <em>might</em> be damaged and contaminate the user's records. Privacy and integrity over feature completion.",
          },
        ],
      },
      { kind: "h", text: "Pre-launch items still open" },
      {
        kind: "bullets",
        items: [
          {
            html: "External penetration test on the remediation surface (planned before public-announce; budget tracked in Phase 4 roadmap).",
          },
          {
            html: "Full automated test coverage for the remediation pipeline (<code>remediation.test.ts</code>, <code>remediation-privacy.test.ts</code>, <code>remediation-receipt.test.ts</code>). Tracked in Phase 4.",
          },
          {
            html: "File the upstream OpenDataLoader object-streams bug with reproducer PDFs (the qpdf preprocessing workaround is in place in the meantime).",
          },
        ],
      },
    ],
  },
  {
    version: "v1.17.0 and earlier",
    meta: "Pre-formatted-audit era",
    body: [
      {
        kind: "p",
        html: 'Security reviews for releases prior to v1.18.0 were not yet captured in this format. Earlier releases focused on the synchronous audit pipeline (added in v1.0) and authentication flow (Personal Access Tokens added in v1.16, analyze-by-URL added in v1.17). Review history for those releases is available via the <a href="https://github.com/ICJIA/file-accessibility-audit/commits/main" target="_blank" rel="noopener noreferrer">commit history on GitHub</a>. Going forward — beginning with v1.18.0 — every release will have a corresponding entry in this section before tagging.',
      },
    ],
  },
];
