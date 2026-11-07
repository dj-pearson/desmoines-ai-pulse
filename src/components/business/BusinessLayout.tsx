import type { ReactNode } from "react";
import { useSiteFooter } from "@/hooks/useSiteFooter";

export interface BusinessLayoutProps {
  children: ReactNode;
  /**
   * Classes for a spacer after the footer, for a page with a fixed bar of its
   * own (Advertise's summary bar) so the bar can't cover the footer's last
   * lines at the end of the page.
   */
  footerClearanceClassName?: string;
}

/**
 * Wrapper for every business page (/advertise, /campaigns/*, /business,
 * /business-partnership, /submit-event). The site header and footer that keep
 * a desktop visitor's navigation here come from SiteLayout now, outside
 * <main> (WEB-UX-041); this passes the footer clearance on to it.
 *
 * Plain <div>, not <main id="main-content">: SiteLayout already renders the
 * single <main id="main-content"> around every route. A second one nests
 * landmarks and duplicates the skip-link target id (WCAG 1.3.1, 4.1.1).
 */
export function BusinessLayout({ children, footerClearanceClassName }: BusinessLayoutProps) {
  useSiteFooter({ clearanceClassName: footerClearanceClassName });
  return <div className="min-h-screen bg-background">{children}</div>;
}
