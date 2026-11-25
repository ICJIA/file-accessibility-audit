/**
 * Parsing IP addresses as NUMBERS. Split out of safeFetch.ts (2026-11-25) so
 * that the fetch limiter (urlAnyHostGate.ts) can group addresses without
 * importing the fetcher itself. No imports beyond node:net, no state.
 */
import { isIP } from "node:net";

/**
 * An IPv6 address as its eight 16-bit groups, or null. Handles "::"
 * compression and a trailing dotted IPv4 ("::ffff:1.2.3.4"), so every
 * spelling of one address classifies the same way — the string-prefix
 * checks this replaces missed the written-out mapped form
 * (0:0:0:0:0:ffff:a9fe:a9fe) and IPv4-compatible ::7f00:1 (review
 * 2026-11-18).
 */
export function ipv6Groups(addr: string): number[] | null {
  let s = addr;
  const tail: number[] = [];
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (isIP(dotted[2]!) !== 4) return null;
    const o = dotted[2]!.split(".").map(Number);
    tail.push((o[0]! << 8) | o[1]!, (o[2]! << 8) | o[3]!);
    s = dotted[1]!.endsWith("::") ? dotted[1]! : dotted[1]!.slice(0, -1);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":").map((h) => parseInt(h, 16)));
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  const total = head.length + rest.length + tail.length;
  if (halves.length === 1 && total !== 8) return null;
  if (total > 8) return null;
  const zeros = halves.length === 2 ? new Array(8 - total).fill(0) : [];
  const groups = [...head, ...zeros, ...rest, ...tail];
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) {
    return null;
  }
  return groups;
}

export function v4From(hi: number, lo: number): string {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
}

/**
 * The network block an address belongs to, for rate accounting: the IPv4 /24
 * ("v4:93.184.216") or the IPv6 /64 ("v6:2606:4700:4700:0").
 *
 * Works on the NUMBERS, not the text. An IPv6 address has many spellings
 * ("::" compression, leading zeros, a dotted tail), and reading the text put
 * one /64 in several buckets. And an address that only wraps an IPv4 one is
 * counted as that IPv4 address — IPv4-mapped (::ffff:a.b.c.d) and 6to4
 * (2002:AABB:CCDD::/48) both reach the IPv4 host they embed, so they must
 * share its budget rather than open a second one (commit security review,
 * 2026-11-25). Anything unparseable gets one shared bucket: the strictest
 * answer, never a fresh allowance.
 */
export function addressBlock(ip: string): string {
  const addr = ip.replace(/^\[/, "").replace(/\]$/, "").replace(/%.*$/, "").toLowerCase();
  const v4Block = (dotted: string) => `v4:${dotted.split(".").slice(0, 3).join(".")}`;
  if (isIP(addr) === 4) return v4Block(addr);
  if (isIP(addr) !== 6) return "unparsed";
  const g = ipv6Groups(addr);
  if (!g) return "unparsed";
  const first80Zero = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0;
  if (first80Zero && g[5] === 0xffff) return v4Block(v4From(g[6]!, g[7]!));
  if (g[0] === 0x2002) return v4Block(v4From(g[1]!, g[2]!));
  return `v6:${g
    .slice(0, 4)
    .map((n) => n.toString(16))
    .join(":")}`;
}
