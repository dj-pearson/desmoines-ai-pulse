import type { ReactNode } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

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
 * Site header and footer around every business page (/advertise,
 * /campaigns/*, /business, /business-partnership, /submit-event), so a desktop
 * visitor keeps site navigation. BottomNav is lg:hidden; without this they
 * had nothing.
 *
 * Plain <div>, not <main id="main-content">: App.tsx already renders the
 * single top-level <main id="main-content"> around every route. A second one
 * nests landmarks and duplicates the skip-link target id (WCAG 1.3.1, 4.1.1),
 * the same call ThingsToDoHub and SearchResults made.
 */
export function BusinessLayout({ children, footerClearanceClassName }: BusinessLayoutProps) {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-background">{children}</div>
      <Footer />
      {footerClearanceClassName && <div aria-hidden="true" className={footerClearanceClassName} />}
    </>
  );
}
