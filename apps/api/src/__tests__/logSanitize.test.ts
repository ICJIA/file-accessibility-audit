/**
 * Attacker-influenced strings (a fetched URL, a Chromium console message)
 * are teed into the error log files verbatim. Newlines forge log lines and
 * ANSI sequences drive a terminal; both are stripped before logging
 * (fresh-eyes audit, 2026-09-02).
 */
import { describe, it, expect } from "vitest";
import { forLog } from "../services/logSanitize.js";

describe("forLog", () => {
  it("collapses newlines and control characters to single spaces", () => {
    expect(forLog("a\nb\r\nc\td\x00e")).toBe("a b c d e");
  });
  it("strips ANSI escape sequences", () => {
    expect(forLog("ok \x1b[31mFAKE ERROR\x1b[0m done")).toBe("ok FAKE ERROR done");
  });
  it("truncates very long strings so one entry cannot flood the log", () => {
    expect(forLog("x".repeat(5000)).length).toBeLessThanOrEqual(1024);
  });
  it("tolerates non-strings", () => {
    expect(forLog(undefined)).toBe("");
    expect(forLog(42 as unknown as string)).toBe("42");
  });
});
