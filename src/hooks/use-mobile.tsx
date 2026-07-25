import * as React from "react";

const MOBILE_BREAKPOINT = 768;

const canUseDOM =
  typeof window !== "undefined" && typeof window.matchMedia === "function";

const getIsMobile = () => {
  if (!canUseDOM) return false;
  try {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
  } catch {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }
};

/**
 * Robust mobile detection.
 * - Returns a correct boolean on the very first render (no `undefined` flash),
 *   so consumers like the sidebar never crash or render an invalid state.
 * - Safe when `window` / `matchMedia` are unavailable.
 * - Supports both modern and legacy MediaQueryList listener APIs.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState<boolean>(getIsMobile);

  React.useEffect(() => {
    if (!canUseDOM) return;

    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    } catch {
      return;
    }

    const onChange = () => setIsMobile(getIsMobile());
    onChange();

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }

    // Legacy Safari / older browsers
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return isMobile;
}
