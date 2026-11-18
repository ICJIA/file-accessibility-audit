/**
 * Security review 2026-11-18 (High): a ZIP's entry cap was checked only
 * AFTER JSZip.loadAsync had built an object per entry. A 25 MB zip64 file
 * with 290,000 empty entries made one parse peak at 676 MB in the API's main
 * process. The count is now taken from the raw bytes first
 * (countZipEntriesFromBytes) and the upload is refused before JSZip runs.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { countZipEntriesFromBytes, assertZipEntryCountBeforeParse } from "../services/ooxml.js";
import { detectFileType } from "../services/analyzer.js";

/** A hand-built archive: N empty stored entries, optional zip64 trailer, and
 *  an optional false count in the end record (to prove the walk follows
 *  signatures, as JSZip does, not the declared number). */
function buildZip(n: number, opts: { zip64?: boolean; declaredCount?: number } = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let off = 0;
  for (let i = 0; i < n; i++) {
    const name = Buffer.from(i.toString(16));
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(45, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(off, 42);
    centrals.push(ch, name);
    off += 30 + name.length;
  }
  const local = Buffer.concat(locals);
  const central = Buffer.concat(centrals);
  const cdOff = local.length;
  const cdSize = central.length;
  const count = opts.declaredCount ?? n;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  if (!opts.zip64) {
    eocd.writeUInt16LE(count, 8);
    eocd.writeUInt16LE(count, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdOff, 16);
    return Buffer.concat([local, central, eocd]);
  }
  const z64 = Buffer.alloc(56);
  z64.writeUInt32LE(0x06064b50, 0);
  z64.writeBigUInt64LE(44n, 4);
  z64.writeUInt16LE(45, 12);
  z64.writeUInt16LE(45, 14);
  z64.writeBigUInt64LE(BigInt(count), 24);
  z64.writeBigUInt64LE(BigInt(count), 32);
  z64.writeBigUInt64LE(BigInt(cdSize), 40);
  z64.writeBigUInt64LE(BigInt(cdOff), 48);
  const loc = Buffer.alloc(20);
  loc.writeUInt32LE(0x07064b50, 0);
  loc.writeBigUInt64LE(BigInt(cdOff + cdSize), 8);
  loc.writeUInt32LE(1, 16);
  eocd.writeUInt16LE(0xffff, 8);
  eocd.writeUInt16LE(0xffff, 10);
  eocd.writeUInt32LE(0xffffffff, 12);
  eocd.writeUInt32LE(0xffffffff, 16);
  return Buffer.concat([local, central, z64, loc, eocd]);
}

describe("countZipEntriesFromBytes", () => {
  it("counts a real JSZip-written archive exactly", async () => {
    const z = new JSZip();
    for (let i = 0; i < 7; i++) z.file(`f${i}.xml`, "<a/>");
    const buf = await z.generateAsync({ type: "nodebuffer" });
    expect(countZipEntriesFromBytes(buf, 10_000)).toBe(7);
  });

  it("agrees with JSZip on a hand-built archive (classic and zip64)", async () => {
    for (const zip64 of [false, true]) {
      const buf = buildZip(50, { zip64 });
      expect(countZipEntriesFromBytes(buf, 10_000)).toBe(50);
      const parsed = await JSZip.loadAsync(buf);
      expect(Object.keys(parsed.files)).toHaveLength(50);
    }
  });

  it("stops counting at max + 1 (never walks a huge directory to the end)", () => {
    expect(countZipEntriesFromBytes(buildZip(400, { zip64: true }), 100)).toBe(101);
  });

  it("follows the record signatures, not a false count in the header", () => {
    // The end record claims 1 entry; 300 are really there. JSZip walks
    // signatures too, so it would have parsed all 300.
    expect(countZipEntriesFromBytes(buildZip(300, { declaredCount: 1 }), 100)).toBe(101);
  });

  it("applies JSZip's prepended-data shift", async () => {
    const z = new JSZip();
    for (let i = 0; i < 3; i++) z.file(`f${i}`, "x");
    const inner = await z.generateAsync({ type: "nodebuffer" });
    const buf = Buffer.concat([Buffer.alloc(1000, 0x20), inner]);
    expect(countZipEntriesFromBytes(buf, 10_000)).toBe(3);
  });

  it("returns null for bytes that hold no central directory", () => {
    expect(countZipEntriesFromBytes(Buffer.from("PK\x03\x04 not really a zip"), 10)).toBeNull();
    expect(countZipEntriesFromBytes(Buffer.alloc(0), 10)).toBeNull();
  });
});

describe("the pre-parse refusal", () => {
  it("throws the caller's own error type above the cap, and stays quiet at it", () => {
    class MyErr extends Error {}
    expect(() => assertZipEntryCountBeforeParse(buildZip(11), 10, (m) => new MyErr(m))).toThrow(
      MyErr,
    );
    expect(() =>
      assertZipEntryCountBeforeParse(buildZip(10), 10, (m) => new MyErr(m)),
    ).not.toThrow();
  });

  it("detectFileType refuses a 20,000-entry zip64 package without parsing it", async () => {
    const bomb = buildZip(20_000, { zip64: true });
    const before = process.memoryUsage().heapUsed;
    const t0 = Date.now();
    expect(await detectFileType(bomb)).toBeNull();
    const ms = Date.now() - t0;
    const grewMb = (process.memoryUsage().heapUsed - before) / (1024 * 1024);
    // JSZip on this input allocates tens of MB; the byte walk allocates
    // nothing per entry and stops at 10,001 records.
    expect(ms).toBeLessThan(500);
    expect(grewMb).toBeLessThan(20);
  });
});

/**
 * Differential: the walk must see exactly what JSZip parses. The first
 * version searched only the last 64 KB for the end record, expected the zip64
 * locator at a fixed place, and measured the prepended-data shift from the
 * wrong record — and failed OPEN wherever it gave up (automated review,
 * 2026-11-18). Each shape below is checked both ways.
 */
describe("the walk agrees with JSZip on every shape", () => {
  async function jszipCount(buf: Buffer): Promise<number | null> {
    try {
      return Object.keys((await JSZip.loadAsync(buf)).files).length;
    } catch {
      return null;
    }
  }
  function withZip64LocatorMoved(n: number): Buffer {
    // Junk between the zip64 locator and the end record: the locator is not
    // 20 bytes before the end record, where the first walk looked for it.
    const z = buildZip(n, { zip64: true });
    const eocd = z.subarray(z.length - 22);
    return Buffer.concat([z.subarray(0, z.length - 22), Buffer.alloc(64, 0x20), eocd]);
  }
  function withWrongZip64Pointer(n: number): Buffer {
    const z = Buffer.from(buildZip(n, { zip64: true }));
    const loc = z.length - 22 - 20;
    z.writeBigUInt64LE(7n, loc + 8); // points at nothing; JSZip falls back
    return z;
  }
  const shapes: Array<[string, () => Buffer | Promise<Buffer>]> = [
    ["classic", () => buildZip(40)],
    ["zip64", () => buildZip(40, { zip64: true })],
    [
      "70 KB of trailing junk after the end record",
      () => Buffer.concat([buildZip(40), Buffer.alloc(70_000, 0x41)]),
    ],
    ["zip64 locator not where the first walk looked", () => withZip64LocatorMoved(40)],
    ["zip64 locator pointing at the wrong offset", () => withWrongZip64Pointer(40)],
    [
      "prepended data (a self-extracting stub)",
      async () => {
        const z = new JSZip();
        for (let i = 0; i < 40; i++) z.file(`f${i}`, "x");
        return Buffer.concat([
          Buffer.alloc(5000, 0x90),
          await z.generateAsync({ type: "nodebuffer" }),
        ]);
      },
    ],
    ["truncated end record", () => buildZip(40).subarray(0, -5)],
    ["no end record at all", () => Buffer.from("PK\x03\x04" + "x".repeat(200))],
  ];
  it.each(shapes)("%s", async (_, make) => {
    const buf = await make();
    const mine = countZipEntriesFromBytes(buf, 10_000);
    const theirs = await jszipCount(buf);
    if (mine === null) {
      // Fail closed is only safe if JSZip could not have parsed it either.
      expect(theirs).toBeNull();
    } else if (theirs !== null) {
      expect(mine).toBe(theirs);
    }
  });

  it("70 KB of trailing junk no longer hides a 20,000-entry package", () => {
    const buf = Buffer.concat([buildZip(20_000, { zip64: true }), Buffer.alloc(70_000, 0x41)]);
    expect(() => assertZipEntryCountBeforeParse(buf, 10_000, (m) => new Error(m))).toThrow(
      /too many entries/,
    );
  });

  it("a package the walk cannot read is refused, not waved through (fail closed)", () => {
    expect(() =>
      assertZipEntryCountBeforeParse(
        Buffer.from("PK\x03\x04 nothing else"),
        10,
        (m) => new Error(m),
      ),
    ).toThrow(/not a readable ZIP/);
  });
});
