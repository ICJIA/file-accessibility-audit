/**
 * resolvePublicIp must judge EVERY address a name resolves to. It checked
 * only the first A/AAAA record, so a host publishing [public, 127.0.0.1]
 * passed the guard while Chromium — which resolves on its own — could connect
 * to the private one (fresh-eyes audit, 2026-09-02).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const lookup = vi.fn();
vi.mock("node:dns/promises", () => ({ default: { lookup }, lookup }));
vi.mock("node:dns", () => ({ default: { promises: { lookup } }, promises: { lookup } }));

describe("resolvePublicIp — all records, not the first", () => {
  beforeEach(() => {
    lookup.mockReset();
  });

  it("rejects a host whose SECOND record is private, even though the first is public", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    const { resolvePublicIp } = await import("../services/safeFetch.js");
    await expect(resolvePublicIp("multi.example.test")).rejects.toMatchObject({
      code: "private_ip",
    });
  });

  it("rejects a public IPv4 paired with a link-local IPv6", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "fe80::1", family: 6 },
    ]);
    const { resolvePublicIp } = await import("../services/safeFetch.js");
    await expect(resolvePublicIp("dual.example.test")).rejects.toMatchObject({
      code: "private_ip",
    });
  });

  it("returns the first address when every record is public", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    const { resolvePublicIp } = await import("../services/safeFetch.js");
    await expect(resolvePublicIp("ok.example.test")).resolves.toBe("93.184.216.34");
  });

  it("still rejects a name with no records at all as a DNS failure", async () => {
    lookup.mockResolvedValue([]);
    const { resolvePublicIp } = await import("../services/safeFetch.js");
    await expect(resolvePublicIp("empty.example.test")).rejects.toMatchObject({
      code: "dns_failed",
    });
  });
});
