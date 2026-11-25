/**
 * Small PDFs built to be expensive to analyse (red-team review 2026-11-25).
 * Valid enough for qpdf and pdf.js to open: a real xref table, one page
 * object, one short content stream.
 */

/** A PDF whose page tree lists the SAME page `pages` times. ~6 bytes per
 *  page, so 200,000 pages is about 1.2 MB — and minutes of pdf.js work. */
export function repeatedPagePdf(pages: number): Buffer {
  const content = "BT /F1 12 Tf 72 720 Td (hello) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages} /Kids [${"3 0 R ".repeat(pages)}] >>`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
