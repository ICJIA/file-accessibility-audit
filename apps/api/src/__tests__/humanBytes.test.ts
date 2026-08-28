/**
 * Byte counts get a human-readable twin.
 *
 * WHY (2026-08-28, user request): /status?format=json published raw counters —
 * `free_bytes: 58131922944`, `size_bytes: 89382608` — and nothing else. The
 * HTML page had been formatting those for display all along ("54.1 GB free of
 * 76.4 GB"), so anyone reading the JSON had to do the arithmetic the page
 * already did. The payload now carries the formatted value beside the raw one,
 * the way `finished_at` is already paired with `finished_at_chicago`.
 *
 * ONE formatter, in @file-audit/shared, used by BOTH the payload and the page.
 * Two implementations would eventually disagree, and a status page that says
 * "54.1 GB" beside a payload that says "54.2 GB" is worse than one that says
 * neither.
 */
import { describe, it, expect } from "vitest";
import { formatBytes } from "@file-audit/shared";

describe("formatBytes", () => {
  it("formats the real figures from the status payload", () => {
    // The exact values that prompted this, from production.
    expect(formatBytes(58_131_922_944)).toBe("54.1 GB");
    expect(formatBytes(82_086_711_296)).toBe("76.4 GB");
    expect(formatBytes(89_382_608)).toBe("85.2 MB");
  });

  it("climbs through the units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
    expect(formatBytes(2 * 1024 ** 4)).toBe("2.0 TB");
  });

  it("answers null for anything that is not a usable byte count", () => {
    // A null in the payload means "could not be read", and must not surface as
    // "0 B" — that reads as an empty disk rather than an unknown one.
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(undefined)).toBeNull();
    expect(formatBytes(Number.NaN)).toBeNull();
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatBytes(-1)).toBeNull();
    expect(formatBytes("58131922944" as unknown as number)).toBeNull();
  });

  it("treats zero as a real measurement, not a missing one", () => {
    expect(formatBytes(0)).toBe("0 B");
  });
});
