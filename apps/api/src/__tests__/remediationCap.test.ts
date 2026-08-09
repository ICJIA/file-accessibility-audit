/**
 * In-memory per-caller daily remediation cap (v1.68.0).
 *
 * Replaces the identity-keyed SQL count (`remediation_jobs.email`) that died
 * with identity storage. The key is the caller's IP address used TRANSIENTLY
 * in RAM — never written to disk, a database row, or any log — and the whole
 * ledger vanishes on process restart. Single-threaded JS makes the
 * check-and-reserve atomic, which is what the old SQL transaction (P2.4)
 * existed to guarantee.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  reserveRemediationSlot,
  remediationSlotsUsed,
  _resetRemediationCap,
} from "../services/remediationCap.js";

const DAY = 24 * 60 * 60_000;

describe("reserveRemediationSlot", () => {
  beforeEach(() => _resetRemediationCap());

  it("allows up to the limit within the window, then refuses", () => {
    for (let i = 0; i < 3; i++) {
      expect(reserveRemediationSlot("203.0.113.7", 3, DAY, 1_000_000 + i)).toBe(true);
    }
    expect(reserveRemediationSlot("203.0.113.7", 3, DAY, 1_000_003)).toBe(false);
    expect(remediationSlotsUsed("203.0.113.7", DAY, 1_000_003)).toBe(3);
  });

  it("keys callers independently", () => {
    expect(reserveRemediationSlot("203.0.113.7", 1, DAY, 1_000)).toBe(true);
    expect(reserveRemediationSlot("203.0.113.8", 1, DAY, 1_000)).toBe(true);
    expect(reserveRemediationSlot("203.0.113.7", 1, DAY, 1_001)).toBe(false);
  });

  it("frees slots as reservations age out of the window", () => {
    expect(reserveRemediationSlot("k", 1, DAY, 0)).toBe(true);
    expect(reserveRemediationSlot("k", 1, DAY, DAY - 1)).toBe(false);
    expect(reserveRemediationSlot("k", 1, DAY, DAY + 1)).toBe(true);
  });

  it("a refused attempt does not consume a slot", () => {
    expect(reserveRemediationSlot("k", 1, DAY, 0)).toBe(true);
    expect(reserveRemediationSlot("k", 1, DAY, 1)).toBe(false);
    // Aging past the FIRST reservation frees the key even after refusals.
    expect(reserveRemediationSlot("k", 1, DAY, DAY + 1)).toBe(true);
  });
});
