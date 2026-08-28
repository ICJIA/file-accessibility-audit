/**
 * Human-readable byte sizes. One decimal, binary units.
 *
 * WHY IT LIVES IN SHARED (2026-08-28): the status page had been formatting
 * these for display all along — "54.1 GB free of 76.4 GB" — while
 * /status?format=json published `free_bytes: 58131922944` and left the reader
 * to do the arithmetic the page had already done. The payload now carries the
 * formatted value beside the raw one, and BOTH surfaces read it from here. Two
 * implementations would eventually disagree, and a page reading "54.1 GB"
 * beside a payload reading "54.2 GB" is worse than one that says neither.
 *
 * The unit ladder is inherited from the page's formatter, including the bug it
 * learned from: capped at MB originally, it rendered a 76 GB volume as
 * "78284.0 MB free" — technically correct and unreadable, on a page written
 * for people who do not think in megabytes. Caught in production, not by test.
 */

const TB = 1_099_511_627_776;
const GB = 1_073_741_824;
const MB = 1_048_576;
const KB = 1024;

/**
 * `null` for anything that is not a usable byte count — a missing, unreadable
 * or nonsensical value. Deliberately NOT "0 B": a disk whose free space could
 * not be read must never render as an empty one, and the payload's `null`
 * means exactly "could not be read". Zero itself is a real measurement and
 * formats normally.
 */
export function formatBytes(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (value >= TB) return `${(value / TB).toFixed(1)} TB`;
  if (value >= GB) return `${(value / GB).toFixed(1)} GB`;
  if (value >= MB) return `${(value / MB).toFixed(1)} MB`;
  if (value >= KB) return `${(value / KB).toFixed(1)} KB`;
  return `${value} B`;
}
