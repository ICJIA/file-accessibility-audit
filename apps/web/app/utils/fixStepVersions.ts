/**
 * The one place that says WHICH versions of Word, PowerPoint, Excel, Acrobat,
 * and InDesign the fix steps are written for, and who to call when the menus
 * don't match.
 *
 * WHY THIS EXISTS. A user followed a fix card and couldn't find the menu
 * items — they were on an older Acrobat, whose interface (the pre-2023
 * "classic" one, Tools → Accessibility → …) is organized completely
 * differently from the current design (hamburger ☰ Menu + an "All tools"
 * panel, Accessibility renamed "Prepare for accessibility"). Steps that are
 * right for one interface read as wrong on the other, and a reader has no
 * way to tell WHICH app the instructions assume. So every card that shows
 * fix steps also says what versions the steps are written for, and where to
 * turn when the menus on screen don't match (IDS handles version upgrades
 * at ICJIA).
 *
 * Lives in the web app, not the analyzer, for the same reason as
 * actionPlan.ts: stored reports carry findings text frozen at audit time,
 * while this note must always describe the CURRENT copy on the current
 * surfaces — old shared reports get today's note with no re-audit.
 *
 * Rendered on every surface that shows fix steps; each surface's test
 * asserts it (the wiring rule). Update FIX_STEPS_WRITTEN_FOR when Microsoft
 * or Adobe ship another UI reorganization, and the "as of" date whenever the
 * steps themselves are re-verified.
 */

/** When the steps were last checked against the vendors' documentation —
 *  the one place the date is written; the note and the report's folded
 *  "Fix steps last audited" row both read it. */
export const FIX_STEPS_VERIFIED_ON = "November 2026";

/** Which app versions the fix steps target. */
export const FIX_STEPS_WRITTEN_FOR =
  `Fix steps were verified in ${FIX_STEPS_VERIFIED_ON} against the current versions of these apps: ` +
  "Microsoft Word, PowerPoint, and Excel for Microsoft 365 (Windows Version 2611; Mac 16.115), " +
  "Adobe Acrobat Pro (version 26 — the redesigned interface with an “All tools” panel that Adobe " +
  "rolled out through 2023), and — for PDFs that were laid out in it — Adobe InDesign 2026–2027 " +
  "(versions 21–22). Office menu paths are written for Windows; where a Mac differs, the step says so " +
  "(the two that differ most: on a Mac the document title is under File → Properties, and the " +
  "language command is Review → Language). " +
  "Not sure which Acrobat you have? If it shows a ☰ menu button and an “All tools” panel on the left, " +
  "follow the main steps; if it has a Tools tab with an Accessibility toolset instead, you're on the " +
  "older “classic” design — use the classic paths given in parentheses.";

/** Who to contact when the menus on screen don't match the steps. */
export const FIX_STEPS_SUPPORT_LINE =
  "If you don't see these menu items — or can't find them — please contact IDS at ICJIA " +
  "to make sure you have the most recent versions of Microsoft 365 (Word, PowerPoint, Excel) " +
  "and Acrobat installed.";

/** The full note, as rendered on every fix-step card. */
export const FIX_STEPS_VERSION_NOTE = `${FIX_STEPS_WRITTEN_FOR} ${FIX_STEPS_SUPPORT_LINE}`;
