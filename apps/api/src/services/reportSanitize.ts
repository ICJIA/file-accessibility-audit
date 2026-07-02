/**
 * Store-boundary hardening for POST /api/reports. The report JSON is persisted
 * verbatim and rendered on the public /report/:id page, so it is
 * attacker-controlled once stored. Two guards:
 *
 *  - F1 (stored XSS): strip any help-link whose URL is not a safe absolute
 *    http(s) URL, ANYWHERE in the payload — including nested
 *    scoreProfiles.*.categories, which the frontend's categoriesForScoringMode
 *    can render from. A `javascript:`/`data:` href executes on click.
 *  - F2 (SSR crash): reject a structurally-invalid `categories` (present but
 *    not an array) so the render can't be 500'd with a non-iterable.
 *
 * The frontend also scheme-guards at the href sink (defense in depth), but
 * sanitizing here keeps the stored JSON — consumed by the report GET API and
 * any downstream tooling — clean at rest.
 */
import { isSafeHttpUrl } from '@file-audit/shared'

export interface SanitizeResult {
  ok: boolean
  report?: unknown
  error?: string
}

/** Recursively drop help-links with unsafe URLs from any `helpLinks` array. */
function stripUnsafeHelpLinks(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) stripUnsafeHelpLinks(item)
    return
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (Array.isArray(obj.helpLinks)) {
      obj.helpLinks = obj.helpLinks.filter(
        (l) =>
          l != null &&
          typeof l === 'object' &&
          isSafeHttpUrl((l as Record<string, unknown>).url),
      )
    }
    for (const key of Object.keys(obj)) {
      if (key !== 'helpLinks') stripUnsafeHelpLinks(obj[key])
    }
  }
}

export function sanitizeStoredReport(report: unknown): SanitizeResult {
  if (report == null || typeof report !== 'object') {
    return { ok: false, error: 'report must be an object' }
  }
  const r = report as Record<string, unknown>
  // F2: categories is optional, but if present it must be an array — a
  // non-array would throw during the shared-report render.
  if (
    'categories' in r &&
    r.categories != null &&
    !Array.isArray(r.categories)
  ) {
    return { ok: false, error: 'report.categories must be an array' }
  }

  // Work on a copy so the caller's object is never mutated. structuredClone
  // also rejects functions/circular refs — a malformed payload throws here
  // and is treated as invalid rather than stored.
  let cleaned: unknown
  try {
    cleaned = structuredClone(report)
  } catch {
    return { ok: false, error: 'report is not serializable' }
  }
  stripUnsafeHelpLinks(cleaned)
  return { ok: true, report: cleaned }
}
