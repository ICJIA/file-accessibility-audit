/**
 * The remediation metadata step (user decision 2026-11-18): title, language
 * and DisplayDocTitle written with qpdf, checked by the REAL analyzer on a
 * tracked control — so the test proves the WCAG findings clear, not just
 * that bytes changed.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { applyPdfDocMetadata, parseDocMetadataRequest } from "../services/pdfDocMetadata.js";
import { analyzePDF } from "../services/pdfAnalyzer.js";

const CONTROL = resolve(
  __dirname,
  "../../../../controls/ILHEALSFallWinter2022FINAL-remediated.pdf",
);
let qpdfAvailable = true;
try {
  execFileSync("qpdf", ["--version"]);
} catch {
  qpdfAvailable = false;
}

function infoOf(path: string) {
  const out = execFileSync("qpdf", ["--json=2", "--json-key=qpdf", path], {
    maxBuffer: 256 * 1024 * 1024,
  }).toString();
  const o = JSON.parse(out).qpdf[1];
  const t = o.trailer.value;
  const catalog = o[`obj:${t["/Root"]}`].value;
  const vp = catalog["/ViewerPreferences"];
  return {
    catalog,
    viewerPrefs: typeof vp === "string" ? o[`obj:${vp}`].value : vp,
    info: t["/Info"] ? o[`obj:${t["/Info"]}`].value : null,
  };
}

describe("parseDocMetadataRequest", () => {
  it("cleans whitespace and accepts a language code", () => {
    expect(parseDocMetadataRequest("  Annual  report \n", "en-US")).toEqual({
      title: "Annual report",
      language: "en-US",
    });
  });
  it("empty fields mean keep the document's own", () => {
    expect(parseDocMetadataRequest("", undefined)).toEqual({ title: null, language: null });
  });
  it.each([
    ["x".repeat(201), "en", /longer than/],
    ["Title", "english please", /language code/],
    ["Bad\u0007title", "en", /control characters/],
  ])("refuses %#", (t, l, msg) => {
    const r = parseDocMetadataRequest(t, l);
    expect("error" in r && r.error).toMatch(msg);
  });
});

describe.skipIf(!qpdfAvailable)("applyPdfDocMetadata on a real control", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "docmeta-"));
    return () => rmSync(dir, { recursive: true, force: true });
  });

  it("writes title, language and DisplayDocTitle, keeping every other catalog key", async () => {
    const out = join(dir, "out.pdf");
    const before = infoOf(CONTROL);
    const r = await applyPdfDocMetadata(CONTROL, out, {
      title: "Illinois HEALS — Fall/Winter 2022",
      language: "en-US",
    });
    expect(r).toEqual({ titleSet: true, languageSet: true, displayDocTitleSet: true });
    const after = infoOf(out);
    expect(after.info["/Title"]).toBe("u:Illinois HEALS — Fall/Winter 2022");
    expect(after.catalog["/Lang"]).toBe("u:en-US");
    expect(after.viewerPrefs["/DisplayDocTitle"]).toBe(true);
    for (const k of Object.keys(before.catalog)) expect(after.catalog).toHaveProperty(k);
    execFileSync("qpdf", ["--check", out]); // throws on a broken file
  });

  it("the real analyzer's title/language findings clear and the score does not drop", async () => {
    const out = join(dir, "out2.pdf");
    await applyPdfDocMetadata(CONTROL, out, {
      title: "Illinois HEALS newsletter",
      language: "en-US",
    });
    const before = await analyzePDF(readFileSync(CONTROL), "before.pdf");
    const after = await analyzePDF(readFileSync(out), "after.pdf");
    const tl = (a: typeof before) => a.categories.find((c) => c.id === "title_language")!;
    expect(tl(after).score).toBe(100);
    expect(after.overallScore).toBeGreaterThanOrEqual(before.overallScore);
    const failing = (a: typeof before) =>
      (
        (a as { conformance?: { failures?: Array<{ sc: string }> } }).conformance?.failures ?? []
      ).map((f) => f.sc);
    for (const sc of ["2.4.2", "3.1.1"]) expect(failing(after)).not.toContain(sc);
  }, 60_000);

  it("with no title supplied, an existing title still gets DisplayDocTitle", async () => {
    const titled = join(dir, "titled.pdf");
    await applyPdfDocMetadata(CONTROL, titled, { title: "Has a title", language: null });
    const out = join(dir, "out3.pdf");
    const r = await applyPdfDocMetadata(titled, out, { title: null, language: null });
    expect(r).toEqual({ titleSet: false, languageSet: false, displayDocTitleSet: true });
    expect(infoOf(out).info["/Title"]).toBe("u:Has a title");
  });
});
