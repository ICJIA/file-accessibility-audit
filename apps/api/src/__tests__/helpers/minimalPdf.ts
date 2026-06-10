/**
 * Assemble a syntactically valid one-page PDF with a real xref table so
 * pdfjs parses it without recovery heuristics. Object numbers are contiguous
 * from 1; pass each object's body in order. An optional /Info dictionary
 * (e.g. a /Title) can be appended via `info` — it is added as the final
 * object and referenced from the trailer.
 */
export function buildPdf(objs: string[], info?: string): Buffer {
  const bodies = [...objs];
  let infoRef: number | null = null;
  if (info) {
    bodies.push(info);
    infoRef = bodies.length;
  }

  let out = "%PDF-1.7\n";
  const offsets: number[] = [];
  bodies.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(out, "latin1");
  const size = bodies.length + 1;
  out += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    out += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  const infoEntry = infoRef ? ` /Info ${infoRef} 0 R` : "";
  out += `trailer\n<< /Size ${size} /Root 1 0 R${infoEntry} >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** A minimal catalog + pages + one empty page, ready to extend. */
export const MINIMAL_DOC = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>",
];
