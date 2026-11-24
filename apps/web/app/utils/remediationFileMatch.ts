/**
 * Is the file a person just re-selected the SAME document the report on
 * screen describes?
 *
 * WHY THIS EXISTS. Automatic repair needs the original PDF, and the page does
 * not always still hold it: a batch frees each File as soon as it is audited
 * (25 files of up to 25 MB each do not belong in memory), and a report
 * restored after a reload never had one. The repair button then asks for the
 * file again — and used to accept whatever was picked. In a batch that meant
 * document A's title and language could be written into document B.
 *
 * WHAT IS COMPARED. The audit result carries no content hash, so the check
 * uses what the browser knows about the file that was audited: its name, and
 * its size in bytes when the page recorded one (it does for every upload in
 * this tab; a report restored from an earlier page load has only the name).
 * Same name and same size is not proof of identical bytes, and the message a
 * mismatch shows does not pretend otherwise — it is a guard against picking
 * the wrong file, which is the mistake that actually happens.
 */

export interface ExpectedFile {
  /** The audited document's filename, as the report shows it. */
  name: string;
  /** Its size in bytes, when the page still knows it. */
  size?: number | null;
}

export type FileMatch = { ok: true } | { ok: false; reason: "name" | "size"; message: string };

/** "1.2 MB", "340 KB", "512 bytes" — for the mismatch message only. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Filenames compare without regard to case or Unicode composition: macOS
 *  hands back NFD names and treats "Report.PDF" and "report.pdf" as one. */
function sameName(a: string, b: string): boolean {
  return a.normalize("NFC").toLowerCase() === b.normalize("NFC").toLowerCase();
}

export function matchReselectedFile(
  expected: ExpectedFile | null | undefined,
  picked: { name: string; size: number },
): FileMatch {
  // Nothing to compare against (a caller that knows no filename): accept, as
  // the button always did. Every caller in this app supplies one.
  if (!expected?.name) return { ok: true };

  if (!sameName(expected.name, picked.name)) {
    return {
      ok: false,
      reason: "name",
      message:
        `That is a different file. This report is for “${expected.name}”, and you chose ` +
        `“${picked.name}”. Nothing was sent. Choose “${expected.name}” to repair it.`,
    };
  }
  if (typeof expected.size === "number" && expected.size !== picked.size) {
    return {
      ok: false,
      reason: "size",
      message:
        `That file has the same name but is not the one that was checked: the checked file ` +
        `was ${formatBytes(expected.size)} and this one is ${formatBytes(picked.size)}. ` +
        `Nothing was sent. If you have changed the document, check the new version first.`,
    };
  }
  return { ok: true };
}
