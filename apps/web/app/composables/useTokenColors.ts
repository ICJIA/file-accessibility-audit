import { computed, getCurrentInstance, onMounted, ref } from "vue";
import { gradeColorFor, severityColorFor, withAlpha, type ColorScheme } from "@file-audit/shared";
import { BRANDING } from "../../../../audit.config";

/**
 * Which palette the FIRST render uses, pulled out so it can be tested.
 *
 * The server cannot know a visitor's saved theme: it always renders with the
 * site default. These colours are written as inline styles, and Vue does not
 * repair an inline style that differs at hydration — so a visitor whose saved
 * theme is not the default kept the server's palette on the other background
 * for as long as the page stayed open. Measured 2026-11-25 on a
 * server-rendered report: the light palette on the dark page, and (the case
 * production has, default dark) Moderate #eab308 on white at 1.9:1.
 *
 * So a hydrating render repeats what the server drew, and the real theme is
 * applied once the component has mounted, as an ordinary update Vue does
 * patch. A client-side navigation is not hydrating and uses the real theme
 * from its first frame.
 */
export function schemeFor(
  mode: string,
  hydrating: boolean,
  serverDefault: ColorScheme,
): ColorScheme {
  if (hydrating) return serverDefault;
  return mode === "light" ? "light" : "dark";
}

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
  const hydrating = ref(import.meta.client && !!useNuxtApp().isHydrating);
  if (hydrating.value && getCurrentInstance()) {
    onMounted(() => {
      hydrating.value = false;
    });
  } else {
    hydrating.value = false;
  }
  const scheme = computed<ColorScheme>(() =>
    schemeFor(mode.value, hydrating.value, BRANDING.DEFAULT_COLOR_MODE),
  );

  return {
    gradeColor: (grade: string | null | undefined) => gradeColorFor(grade, scheme.value),
    severityColor: (severity: string | null | undefined) =>
      severityColorFor(severity, scheme.value),
    withAlpha,
    scheme,
  };
}
