/**
 * The ONE per-caller bucket key used by every per-IP limiter
 * (middleware/rateLimiter.ts) and the in-memory remediation cap
 * (services/remediationCap.ts).
 *
 * WHY NOT THE BARE ADDRESS (review 2026-11-12): an IPv6 customer is handed a
 * whole /64 — 2^64 addresses — as a matter of course, and express-rate-limit
 * 7.x keys on the full address with no subnet masking. One caller could
 * therefore rotate source addresses inside their own /64 and never meet any
 * limit, including the daily remediation cap. So:
 *
 *   IPv4                      → the address, unchanged
 *   IPv4-mapped IPv6          → the embedded IPv4 address (::ffff:1.2.3.4 and
 *                               ::ffff:102:304 are the same caller as 1.2.3.4)
 *   any other IPv6            → its /64 network ("2001:db8:1:2::/64")
 *   missing / unparseable     → "unknown"
 *
 * PRIVACY: the key lives in process memory only, exactly as the bare address
 * did — it is never written to disk, a database row, or a log (v1.68.0).
 */
import { isIP } from "node:net";

/** Expand an IPv6 address (already validated by isIP) to its 8 hextets. */
function expandIPv6(addr: string): number[] | null {
  let text = addr;
  // A trailing dotted quad (::ffff:1.2.3.4, 64:ff9b::1.2.3.4) is two hextets.
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const parts = tail.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return null;
    }
    const hi = ((parts[0]! << 8) | parts[1]!).toString(16);
    const lo = ((parts[2]! << 8) | parts[3]!).toString(16);
    text = `${text.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const out = groups.map((g) => parseInt(g, 16));
  return out.length === 8 && out.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff)
    ? out
    : null;
}

export function clientKeyFromIp(ip: string | null | undefined): string {
  if (typeof ip !== "string" || ip.length === 0) return "unknown";
  // Strip brackets ("[::1]") and any zone identifier ("fe80::1%eth0").
  const bare =
    ip
      .trim()
      .replace(/^\[|\]$/g, "")
      .split("%")[0] ?? "";
  const family = isIP(bare);
  if (family === 4) return bare;
  if (family !== 6) return "unknown";

  const g = expandIPv6(bare.toLowerCase());
  if (!g) return "unknown";

  // IPv4-mapped (::ffff:0:0/96): the caller is an IPv4 host.
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    return `${g[6]! >> 8}.${g[6]! & 0xff}.${g[7]! >> 8}.${g[7]! & 0xff}`;
  }

  return `${g
    .slice(0, 4)
    .map((n) => n.toString(16))
    .join(":")}::/64`;
}
