/**
 * Reduced-motion helpers for programmatic scrolling.
 *
 * main.css neutralises CSS animations, transitions and `scroll-behavior`
 * under `prefers-reduced-motion: reduce`, but a script that passes
 * `behavior: "smooth"` to scrollTo / scrollIntoView overrides the stylesheet.
 * Every programmatic scroll therefore asks here:
 *
 *   el.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
 */

/** True when the visitor has asked the system for reduced motion. False on
 *  the server and wherever matchMedia is unavailable. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** "auto" (an instant jump) under reduced motion, otherwise "smooth". */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
