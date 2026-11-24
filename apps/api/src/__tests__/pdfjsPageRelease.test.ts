/**
 * analyzeWithPdfjs lets go of each page once it has read it.
 *
 * pdf.js keeps a page's decoded images (`page.objs`) and its cached operator
 * list alive until `doc.destroy()`. The extraction walks every page twice and
 * never released any of them, so what it held grew with the page count: on
 * the largest control document (246 pages) about 148 MB of live heap at the
 * end of the second pass, against about 43 MB when each page is released as
 * it is finished.
 *
 * `PDFPageProxy.cleanup()` clears only that page's own `objs` and intent
 * states. Fonts live in the document-wide `commonObjs`, which it leaves
 * alone — the second half of this test is the proof that a later page's font
 * lookups still resolve after earlier pages were released.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyzeWithPdfjs } from "../services/pdfjsService.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "fixtures");
const CONTROLS = path.resolve(HERE, "../../../../controls");
const ANALYZER = path.resolve(HERE, "../../../../packages/analyzer");

async function pageProxyPrototype(buffer: Buffer): Promise<{ cleanup: () => boolean }> {
  // pdfjs-dist is the analyzer package's dependency, not the api's: resolve it
  // from there so this is the very module instance the engine loads.
  const require = createRequire(path.join(ANALYZER, "package.json"));
  const pdfjsLib = await import(
    pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href
  );
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
  try {
    return Object.getPrototypeOf(await doc.getPage(1));
  } finally {
    await doc.destroy();
  }
}

afterEach(() => vi.restoreAllMocks());

describe("analyzeWithPdfjs releases pages as it goes", () => {
  it("calls page.cleanup() once per page in each of the two passes, and each call succeeds", async () => {
    const buffer = readFileSync(path.join(FIXTURES, "accessible.pdf"));
    const proto = await pageProxyPrototype(buffer);
    const cleanup = vi.spyOn(proto, "cleanup");

    const result = await analyzeWithPdfjs(buffer);

    expect(result.error).toBeNull();
    expect(result.pageCount).toBeGreaterThan(0);
    expect(cleanup).toHaveBeenCalledTimes(result.pageCount * 2);
    // cleanup() returns false when it had to refuse (an operator list still
    // streaming). Every call here must have actually released the page.
    expect(cleanup.mock.results.every((r) => r.value === true)).toBe(true);
  });

  it("does not hand the caller back a detached buffer", async () => {
    // pdf.js TRANSFERS the bytes it is given to its worker, which detaches
    // them. analyzeWithPdfjs passes a copy for exactly that reason; the
    // caller's buffer is used again afterwards (hashing, remediation).
    const buffer = readFileSync(path.join(FIXTURES, "accessible.pdf"));
    const before = buffer.length;
    await analyzeWithPdfjs(buffer);
    expect(buffer.length).toBe(before);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("font names still resolve on later pages after earlier pages were released", async () => {
    // A multi-page control document whose text uses fonts on every page: if
    // releasing page N disturbed the shared font table, visible text on page
    // N+1 would fail to resolve and visibleTextFontNames would be withheld.
    const name = readdirSync(CONTROLS).find(
      (f) => f === "2026_dvfrc_biennial_report.pdf" && !f.startsWith("._"),
    );
    if (!name) return; // controls/ is not present in every checkout
    const result = await analyzeWithPdfjs(readFileSync(path.join(CONTROLS, name)));
    expect(result.error).toBeNull();
    expect(result.pageCount).toBeGreaterThan(1);
    expect(result.visibleTextFontNames).toBeDefined();
    expect(result.visibleTextFontNames!.length).toBeGreaterThan(0);
  }, 60_000);
});
