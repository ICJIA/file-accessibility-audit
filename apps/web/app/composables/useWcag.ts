// Version-aware WCAG helpers for the web UI. Reads the operative version from
// runtimeConfig.public (set in nuxt.config.ts from audit.config.ts WCAG block).
// FALLBACKS MIRROR audit.config.ts, which defaults to WCAG 2.1 since
// 2026-08-31. These were left at 2.2 in the version sweep, so any context
// where runtimeConfig has not been read would have served 2.2 links under a
// 2.1 label — the label/href mismatch this project treats as a defect.
export function useWcag() {
  const pub = useRuntimeConfig().public;
  const version = String(pub.wcagVersion ?? "2.1");
  const level = String(pub.wcagLevel ?? "AA");
  const base = String(pub.wcagUnderstandingBase ?? "https://www.w3.org/WAI/WCAG21/Understanding/");
  const quickref = String(pub.wcagQuickref ?? "https://www.w3.org/WAI/WCAG21/quickref/");
  return {
    version,
    level,
    quickref,
    /** "WCAG 2.2 Level AA" */
    label: `WCAG ${version} Level ${level}`,
    /** Full Understanding-page URL for a criterion slug. */
    understandingUrl: (slug: string) => `${base}${slug}.html`,
  };
}
