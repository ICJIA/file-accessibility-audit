/**
 * The two check-up counts out of a /status?format=json body, or null when the
 * body is not what was expected. Pulled out of HomeLiveNumbers.vue so the
 * "never show a wrong or smaller number" rules are testable without a mount.
 */
export function liveCheckupCounts(body: unknown): { total: number; last30d: number } | null {
  const audited = (body as { documents_audited?: { total?: unknown; last_30d?: unknown } } | null)
    ?.documents_audited;
  const total = audited?.total;
  const last30d = audited?.last_30d;
  const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  if (!whole(total) || !whole(last30d)) return null;
  // A total of 0 is a fresh or unreadable database, not news worth replacing
  // the recorded figure with.
  if (total === 0) return null;
  return { total, last30d };
}
