/**
 * Parsing IP addresses as NUMBERS, for the private-address check in
 * safeFetch.ts. No imports beyond node:net, no state.
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
