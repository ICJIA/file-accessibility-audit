/**
 * PDF/UA identifier detection from XMP metadata (pdfjs path).
 *
 * XMP allows simple properties in two RDF encodings:
 *   element form   — <pdfuaid:part>1</pdfuaid:part>
 *   attribute form — <rdf:Description … pdfuaid:part="1"/>
 * pdfjs's MetadataParser only iterates child ELEMENTS of rdf:Description, so
 * the attribute form never reaches getAll(); detection must fall back to the
 * raw XMP packet. Both forms are legal and appear in real producers.
 */
import { describe, it, expect } from "vitest";
import { analyzeWithPdfjs } from "../services/pdfjsService.js";
import { buildPdf } from "./helpers/minimalPdf.js";

function pdfWithXmp(descriptionMarkup: string): Buffer {
  const xmp = [
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    descriptionMarkup,
    " </rdf:RDF>",
    "</x:xmpmeta>",
    '<?xpacket end="w"?>',
  ].join("\n");
  const len = Buffer.byteLength(xmp, "latin1");
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R /Metadata 4 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>",
    `<< /Type /Metadata /Subtype /XML /Length ${len} >>\nstream\n${xmp}\nendstream`,
  ]);
}

describe("PDF/UA identifier from XMP", () => {
  it("detects the element form (<pdfuaid:part>1</pdfuaid:part>)", async () => {
    const buf = pdfWithXmp(
      ' <rdf:Description rdf:about="" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/">\n' +
        "  <pdfuaid:part>1</pdfuaid:part>\n" +
        " </rdf:Description>",
    );
    const r = await analyzeWithPdfjs(buf);
    expect(r.error).toBeNull();
    expect(r.hasPdfUaIdentifier).toBe(true);
    expect(r.pdfUaPart).toBe("1");
  });

  it("detects the attribute form (pdfuaid:part=\"1\")", async () => {
    const buf = pdfWithXmp(
      ' <rdf:Description rdf:about="" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/" pdfuaid:part="1"/>',
    );
    const r = await analyzeWithPdfjs(buf);
    expect(r.error).toBeNull();
    expect(r.hasPdfUaIdentifier).toBe(true);
    expect(r.pdfUaPart).toBe("1");
  });

  it("does not claim PDF/UA when the XMP has no pdfuaid", async () => {
    const buf = pdfWithXmp(' <rdf:Description rdf:about=""/>');
    const r = await analyzeWithPdfjs(buf);
    expect(r.hasPdfUaIdentifier).toBe(false);
    expect(r.pdfUaPart).toBeNull();
  });
});
