/**
 * Source-inspected guards for hardening the fresh-eyes audit (2026-09-02)
 * asked for — options a unit test cannot observe without spawning pdf.js or
 * writing to /tmp.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const analyzer = (f: string) =>
  readFileSync(
    resolve(__dirname, "..", "..", "..", "..", "packages", "analyzer", "src", f),
    "utf-8",
  );
const api = (f: string) => readFileSync(resolve(__dirname, "..", "services", f), "utf-8");

describe("pdf.js runs with eval disabled and a bounded image size", () => {
  const src = analyzer("pdfjsService.ts");
  it("passes isEvalSupported: false to getDocument (no new Function over attacker bytes)", () => {
    expect(src).toMatch(/getDocument\(\{[\s\S]{0,400}isEvalSupported:\s*false/);
  });
  it("caps maxImageSize so one giant image cannot balloon memory in-process", () => {
    expect(src).toMatch(/getDocument\(\{[\s\S]{0,900}maxImageSize:\s*[A-Z_0-9.]+/);
  });
});

describe("audit temp files are written owner-only (0600), like the remediation outputs", () => {
  it("qpdfService writes every temp PDF with mode 0o600", () => {
    const src = analyzer("qpdfService.ts");
    const writes = src.match(/fs\.writeFileSync\(tmpPath, buffer[^)]*\)/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w).toMatch(/mode:\s*0o600/);
  });
  it("veraPdfBuffer writes its temp PDF with mode 0o600", () => {
    const src = api("veraPdfBuffer.ts");
    const writes = src.match(/fs\.writeFileSync\(tmpPath, buffer[^)]*\)/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w).toMatch(/mode:\s*0o600/);
  });
});
