import { computed } from "vue";
import { gradeColorFor, severityColorFor, withAlpha, type ColorScheme } from "@file-audit/shared";

/**
 * Grade and severity colours bound to the active theme.
 *
 * WHY THIS EXISTS. The palette is tuned for the dark UI, where it runs
 * 5.3–10.3:1 against the background. On the light theme those same colours
 * measure 1.9–3.8:1 — every one of them below the 4.5:1 WCAG AA floor for
 * normal text, in a tool whose whole purpose is catching exactly that
 * (measured 2026-08-07; the worst was Moderate yellow at 1.92:1). One palette
 * cannot serve both: a colour dark enough to pass on white is too pale to
 * pass on near-black, so there are two and this picks between them.
 *
 * Returns functions with the SAME NAMES AND SHAPES as the shared hex helpers
 * they replace, so a component swaps its import line and nothing else. That
 * is deliberate: the alternative — threading a mode argument through every
 * call site — is the kind of change that gets half-applied, and a half-themed
 * palette is worse than an unthemed one.
 */
export function useTokenColors() {
  const mode = useColorMode();
  const scheme = computed<ColorScheme>(() => (mode.value === "light" ? "light" : "dark"));

  return {
    gradeColor: (grade: string | null | undefined) => gradeColorFor(grade, scheme.value),
    severityColor: (severity: string | null | undefined) =>
      severityColorFor(severity, scheme.value),
    withAlpha,
    scheme,
  };
}
