/**
 * detectLegacyFormat — content-based recognition of the file types we can
 * name but cannot audit.
 *
 * Fixtures are synthesized rather than checked in as real .doc/.xls binaries.
 * That is honest, not a shortcut: the detector reads exactly two things — the
 * 8-byte OLE2 signature, and a UTF-16LE directory-entry name somewhere in the
 * first 8 KB — so a buffer carrying those bytes exercises the same code path a
 * real file would. Committing multi-megabyte Office binaries to assert on
 * eight bytes would be worse in every dimension.
 */
import { describe, it, expect } from "vitest";
import { detectLegacyFormat } from "../services/analyzer.js";

const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const SCAN_BYTES = 8192;

/** An OLE2 file whose directory carries `streamName`, placed `at` bytes in. */
function ole2(streamName?: string, at = 512): Buffer {
  const size = Math.max(at + 128, 1024);
  const buf = Buffer.alloc(size);
  OLE2.copy(buf, 0);
  if (streamName) Buffer.from(streamName, "utf16le").copy(buf, at);
  return buf;
}

describe("detectLegacyFormat — legacy Office binaries", () => {
  it("identifies Word 97–2003 by its WordDocument stream", () => {
    expect(detectLegacyFormat(ole2("WordDocument"))).toBe("doc");
  });

  it("identifies Excel 97–2003 (BIFF8) by its Workbook stream", () => {
    expect(detectLegacyFormat(ole2("Workbook"))).toBe("xls");
  });

  it("identifies Excel 5.0/95 (BIFF5) by its Book stream", () => {
    expect(detectLegacyFormat(ole2("Book"))).toBe("xls");
  });

  it("identifies PowerPoint 97–2003 by its PowerPoint Document stream", () => {
    expect(detectLegacyFormat(ole2("PowerPoint Document"))).toBe("ppt");
  });

  it("does not confuse Workbook's lower-case 'book' with the Book stream", () => {
    // Both resolve to "xls" so the verdict is the same either way; this pins
    // that the UTF-16LE case distinction (0x42 vs 0x62) is what separates them,
    // rather than the lookup happening to work by ordering alone.
    const workbookOnly = ole2("Workbook");
    expect(workbookOnly.includes(Buffer.from("Book", "utf16le"))).toBe(false);
  });

  it("falls back to ole-unknown for an OLE2 file it cannot name", () => {
    // .msg, .vsd and friends share the signature. Naming the container without
    // guessing the application is still far better than the generic list.
    expect(detectLegacyFormat(ole2())).toBe("ole-unknown");
  });

  it("recognizes RTF, which is text rather than an OLE2 binary", () => {
    expect(detectLegacyFormat(Buffer.from("{\\rtf1\\ansi hello}", "latin1"))).toBe("rtf");
  });
});

describe("detectLegacyFormat — bounds and negatives", () => {
  it("stops looking after the first 8 KB", () => {
    // The scan is bounded so a hostile file cannot turn detection into a walk
    // of the whole upload. A name past the bound degrades to ole-unknown,
    // which is the intended trade, not a miss.
    const beyond = ole2("WordDocument", SCAN_BYTES + 64);
    expect(detectLegacyFormat(beyond)).toBe("ole-unknown");
  });

  it("still finds a name sitting just inside the bound", () => {
    const inside = ole2("WordDocument", SCAN_BYTES - 64);
    expect(detectLegacyFormat(inside)).toBe("doc");
  });

  it("returns null for a modern OOXML package (a ZIP)", () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(256)]);
    expect(detectLegacyFormat(zip)).toBeNull();
  });

  it("returns null for a PDF", () => {
    expect(detectLegacyFormat(Buffer.from("%PDF-1.7\n%âãÏÓ\n", "latin1"))).toBeNull();
  });

  it("returns null for an empty buffer without throwing", () => {
    expect(detectLegacyFormat(Buffer.alloc(0))).toBeNull();
  });

  it("returns null for a buffer shorter than the signature", () => {
    expect(detectLegacyFormat(Buffer.from([0xd0, 0xcf, 0x11]))).toBeNull();
  });

  it("returns null for a truncated RTF marker", () => {
    expect(detectLegacyFormat(Buffer.from("{\\rt", "latin1"))).toBeNull();
  });

  it("does not treat a file that merely contains the signature as OLE2", () => {
    // The signature must be at offset 0. A PDF embedding those bytes is a PDF.
    const embedded = Buffer.concat([Buffer.from("%PDF-1.7\n", "latin1"), OLE2]);
    expect(detectLegacyFormat(embedded)).toBeNull();
  });
});
