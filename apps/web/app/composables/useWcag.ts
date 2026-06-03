// Version-aware WCAG helpers for the web UI. Reads the operative version from
// runtimeConfig.public (set in nuxt.config.ts from audit.config.ts WCAG block).
export function useWcag() {
  const pub = useRuntimeConfig().public;
  const version = String(pub.wcagVersion ?? "2.2");
  const level = String(pub.wcagLevel ?? "AA");
  const base = String(
    pub.wcagUnderstandingBase ?? "https://www.w3.org/WAI/WCAG22/Understanding/",
  );
  const quickref = String(
    pub.wcagQuickref ?? "https://www.w3.org/WAI/WCAG22/quickref/",
  );
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
