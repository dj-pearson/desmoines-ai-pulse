import { useContext, useLayoutEffect } from "react";
import { SiteFooterContext, type SiteFooterOptions } from "@/contexts/SiteFooterContext";

/**
 * Configure the site footer for as long as the calling component is mounted.
 * Call it at the top of the page component, before any early return, so the
 * loading and error states get the same footer as the loaded page.
 *
 * A layout effect, so the footer is corrected before the first paint rather
 * than flashing its default for a frame.
 */
export function useSiteFooter({
  preferredSource,
  clearanceClassName,
  className,
}: SiteFooterOptions): void {
  const setOptions = useContext(SiteFooterContext);
  useLayoutEffect(() => {
    setOptions({ preferredSource, clearanceClassName, className });
    return () => setOptions(null);
  }, [setOptions, preferredSource, clearanceClassName, className]);
}
