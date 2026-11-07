import { createContext } from "react";

/**
 * What a page may change about the site footer that SiteLayout renders after
 * <main>. Pages used to render <Footer /> themselves and pass these as props;
 * now that the footer sits outside the route (WEB-UX-041) they reach it here.
 */
export interface SiteFooterOptions {
  /**
   * Show the Google preferred-source button (SEO-037). Off on pages that place
   * one in their own body or are detail pages, so no page shows it twice.
   */
  preferredSource?: boolean;
  /**
   * Classes for a spacer after the footer, for a page with a fixed bar of its
   * own so the bar can't cover the footer's last lines.
   */
  clearanceClassName?: string;
  /** Classes for the footer's wrapper, e.g. "hidden md:block" on the map page. */
  className?: string;
}

/** Setter SiteLayout provides; null restores the defaults. */
export const SiteFooterContext = createContext<(options: SiteFooterOptions | null) => void>(
  () => {},
);
