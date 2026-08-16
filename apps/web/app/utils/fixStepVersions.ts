/**
 * The one place that says WHICH versions of Word, Acrobat, and InDesign the
 * fix steps are written for, and who to call when the menus don't match.
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

/** Which app versions the fix steps target. */
export const FIX_STEPS_WRITTEN_FOR =
  "Fix steps were verified in August 2026 against the current versions of these apps: " +
  "Microsoft Word for Microsoft 365 (Windows Version 2607; Mac 16.111), Adobe Acrobat Pro " +
  "(version 26 — the redesigned interface with an “All tools” panel that Adobe rolled out through 2023), " +
  "and — for PDFs that were laid out in it — Adobe InDesign 2026 (version 21). " +
  "Not sure which Acrobat you have? If it shows a ☰ menu button and an “All tools” panel on the left, " +
  "follow the main steps; if it has a Tools tab with an Accessibility toolset instead, you're on the " +
  "older “classic” design — use the classic paths given in parentheses.";

/** Who to contact when the menus on screen don't match the steps. */
export const FIX_STEPS_SUPPORT_LINE =
  "If you don't see these menu items — or can't find them — please contact IDS at ICJIA " +
  "to make sure you have the most recent versions of Word and Acrobat installed.";

/** The full note, as rendered on every fix-step card. */
export const FIX_STEPS_VERSION_NOTE = `${FIX_STEPS_WRITTEN_FOR} ${FIX_STEPS_SUPPORT_LINE}`;
