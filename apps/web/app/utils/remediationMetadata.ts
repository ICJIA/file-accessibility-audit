/**
 * What to prefill in the remediation form's title and language fields
 * (user decision 2026-11-18): the PDF's own values, read from the audit's
 * title-and-language findings (scoring/pdf.ts writes `Document title: "…"`
 * and `Language declared: …`; the stored PdfMetadata carries neither).
 */
export interface CurrentDocMetadata {
  title: string | null;
  language: string | null;
}

export function currentDocMetadata(categories: unknown): CurrentDocMetadata {
  const out: CurrentDocMetadata = { title: null, language: null };
  if (!Array.isArray(categories)) return out;
  const cat = categories.find((c) => (c as { id?: string })?.id === "title_language") as
    { findings?: unknown } | undefined;
  const findings = Array.isArray(cat?.findings) ? (cat!.findings as unknown[]) : [];
  for (const f of findings) {
    if (typeof f !== "string") continue;
    const t = f.match(/^Document title: "(.*)"(?: \(|$)/);
    if (t && out.title === null && t[1]!.trim()) out.title = t[1]!.trim();
    const l = f.match(/^Language declared: ([A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*)\s*$/);
    if (l && out.language === null) out.language = l[1]!;
  }
  return out;
}

/** The languages offered in the form, most likely first for an Illinois
 *  state agency. The document's own language is added when it is not here. */
export const REMEDIATION_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: "en-US", name: "English (United States)" },
  { code: "es-US", name: "Spanish (United States)" },
  { code: "pl-PL", name: "Polish" },
  { code: "zh-CN", name: "Chinese (Simplified)" },
  { code: "ar", name: "Arabic" },
  { code: "ko-KR", name: "Korean" },
  { code: "tl", name: "Tagalog" },
  { code: "fr-FR", name: "French" },
];
