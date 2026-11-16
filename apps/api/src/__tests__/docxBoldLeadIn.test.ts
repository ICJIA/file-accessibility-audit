/**
 * A sentence that STARTS in bold is not a heading (2026-11-16) — Word's half
 * of the rule PowerPoint got in v1.171.0.
 *
 * `isFakeHeading` accepted a short paragraph when ANY run in it was bold at
 * 14 point or more. "Deadline: applications close on March 3." with only
 * "Deadline:" in bold is a sentence with a bold lead-in, and it was counted
 * as a heading typed by hand — WCAG 1.3.1, scored. Every run that carries
 * text must be bold and large. A heading is styled as a whole.
 */
import { describe, it, expect } from "vitest";
import { buildDocx, paragraph } from "./helpers/minimalDocx.js";
import { analyzeDocx } from "../services/docxService.js";

const run = (text: string, opts: { bold?: boolean; sizeHalfPt?: number } = {}) =>
  `<w:r><w:rPr>${opts.bold ? "<w:b/>" : ""}${opts.sizeHalfPt ? `<w:sz w:val="${opts.sizeHalfPt}"/>` : ""}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (...runs: string[]) => `<w:p>${runs.join("")}</w:p>`;
const fakeHeadingsOf = async (body: string) =>
  (await analyzeDocx(await buildDocx({ body }))).fakeHeadings.map((f) => f.text);

describe("docx fake heading: a bold lead-in is emphasis, not a heading", () => {
  it("a sentence whose first words alone are bold is not a fake heading", async () => {
    const body = para(
      run("Deadline: ", { bold: true, sizeHalfPt: 28 }),
      run("applications close on March 3.", { sizeHalfPt: 28 }),
    );
    expect(await fakeHeadingsOf(body)).toEqual([]);
  });

  it("a line bold from end to end, in several runs, still is", async () => {
    const body = para(
      run("Executive ", { bold: true, sizeHalfPt: 32 }),
      run("Summary", { bold: true, sizeHalfPt: 32 }),
    );
    expect(await fakeHeadingsOf(body)).toEqual(["Executive Summary"]);
  });

  it("a space-only run that is not bold does not undo a heading", async () => {
    const body = para(
      run("Next", { bold: true, sizeHalfPt: 32 }),
      run(" "),
      run("Steps", { bold: true, sizeHalfPt: 32 }),
    );
    expect(await fakeHeadingsOf(body)).toEqual(["Next Steps"]);
  });

  it("one bold word in the middle of a sentence is not a fake heading", async () => {
    const body = para(
      run("Return the form ", { sizeHalfPt: 28 }),
      run("today", { bold: true, sizeHalfPt: 28 }),
      run(" please.", { sizeHalfPt: 28 }),
    );
    expect(await fakeHeadingsOf(body)).toEqual([]);
  });

  it("the single-run fake heading is unchanged", async () => {
    expect(
      await fakeHeadingsOf(paragraph("Executive Summary", { bold: true, sizeHalfPt: 32 })),
    ).toEqual(["Executive Summary"]);
  });
});
