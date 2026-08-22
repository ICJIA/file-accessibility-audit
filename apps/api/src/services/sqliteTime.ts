/** SQLite CURRENT_TIMESTAMP stores "YYYY-MM-DD HH:MM:SS" in UTC with no zone
 *  marker. Naively handing that to `new Date()` is parsed as LOCAL time by
 *  some engines, silently shifting every timestamp by the server's offset.
 *  Returns an ISO-8601 string with an explicit Z, or null for anything that
 *  is not a non-empty string. */
export function sqliteUtcToIso(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return normalized.endsWith("Z") ? normalized : `${normalized}Z`;
}
