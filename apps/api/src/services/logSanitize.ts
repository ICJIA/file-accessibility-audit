/**
 * Attacker-influenced strings (a fetched URL, a Chromium console message)
 * are teed into the error log files verbatim by util.format. A newline in
 * one forges a log line; an ANSI sequence drives the terminal of whoever
 * tails the file. Strip both, and cap the length, before logging
 * (2026-09-02).
 */
const MAX_LOG_CHARS = 1024;

export function forLog(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : String(value);
  return (
    text
      // eslint-disable-next-line no-control-regex -- stripping ANSI is the point
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
      // eslint-disable-next-line no-control-regex -- stripping control characters is the point
      .replace(/[\x00-\x1f\x7f]+/g, " ")
      .slice(0, MAX_LOG_CHARS)
  );
}
