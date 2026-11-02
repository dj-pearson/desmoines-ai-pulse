import { lazy, Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import { RouteErrorBoundary } from "@/components/ui/route-error-boundary";
import { SiteFooterContext, type SiteFooterOptions } from "@/contexts/SiteFooterContext";
import { cn } from "@/lib/utils";

// Lazy, as the homepage already had it: the footer is below the fold on every
// page and its newsletter form and link columns have no business in the entry
// chunk. Fallback null: nothing above it moves when it arrives.
const Footer = lazy(() => import("@/components/Footer"));

// Lazy too, but started at module load so it downloads alongside the route's
// own chunk. Imported statically it put about 48 KB gz on the critical path of
// every page (check-bundle-budget: 183 -> 231 KB), where before WEB-UX-041 it
// rode in each page's lazy chunk.
const headerImport = import("@/components/Header");
const Header = lazy(() => headerImport);

/**
 * Holds the header's measured height (69px below md, 77.5px md, 86px lg and
 * up) until the chunk arrives, so nothing below it shifts. Not a <header>: a
 * second, empty banner would be worse than none for a moment.
 */
function HeaderPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 z-50 h-[69px] md:h-[77.5px] lg:h-[86px] border-b border-border bg-background safe-area-top print:hidden"
    />
  );
}

/**
 * Which parts of the site chrome a group of routes gets.
 *  - full:   header, main, footer (every public page)
 *  - header: header and main, no footer (/dashboard, /support, /csat)
 *  - none:   main only (admin, /auth, /auth/callback, the bare legal and
 *            newsletter pages): what those routes rendered before WEB-UX-041
 */
export type SiteChrome = "full" | "header" | "none";

interface SiteLayoutProps {
  chrome?: SiteChrome;
}

/** Shown in <main> while a route's chunk loads; the header stays put. */
function PageLoader() {
  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="animate-pulse space-y-4 text-center motion-reduce:animate-none">
        <div className="h-8 bg-muted rounded w-48 mx-auto" aria-hidden="true"></div>
        <div className="h-4 bg-muted rounded w-32 mx-auto" aria-hidden="true"></div>
        <span className="sr-only">Loading page content...</span>
      </div>
    </div>
  );
}

/**
 * The page shell: <header> before <main>, <footer> after it (WEB-UX-041).
 *
 * Pages used to render Header and Footer themselves, inside App's single
 * <main>. A <header> or <footer> nested in <main> is not a banner or
 * contentinfo landmark, so the site had neither. Rendering them here, as
 * siblings of <main>, gives each page exactly one of each.
 *
 * A page that needs a different footer calls useSiteFooter() rather than
 * passing props to a Footer it no longer renders.
 */
export function SiteLayout({ chrome = "full" }: SiteLayoutProps) {
  const [footerOptions, setFooterOptions] = useState<SiteFooterOptions | null>(null);

  return (
    <SiteFooterContext.Provider value={setFooterOptions}>
      {chrome !== "none" && (
        <Suspense fallback={<HeaderPlaceholder />}>
          <Header />
        </Suspense>
      )}
      {/* Room for the fixed BottomNav goes at the very end of the page: on
          <main> when nothing follows it, after the footer when one does.
          data-chrome: scripts/prerender.mjs waits for the lazy footer when it
          is "full". */}
      <main
        id="main-content"
        tabIndex={-1}
        data-chrome={chrome}
        className={chrome === "full" ? undefined : "pb-bottom-nav"}
      >
        {/* Inside <main>, so a page that throws leaves the header usable
            (the boundary's own promise; it used to wrap the header too). */}
        <RouteErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </RouteErrorBoundary>
      </main>
      {chrome === "full" && (
        <>
          {/* print:hidden replaces the wrapper ItineraryDetail put round its
              own footer for its printable view. */}
          <div className={cn("print:hidden", footerOptions?.className)}>
            <Suspense fallback={null}>
              <Footer preferredSource={footerOptions?.preferredSource ?? true} />
            </Suspense>
          </div>
          {footerOptions?.clearanceClassName && (
            <div aria-hidden="true" className={footerOptions.clearanceClassName} />
          )}
          <div aria-hidden="true" className="pb-bottom-nav" />
        </>
      )}
    </SiteFooterContext.Provider>
  );
}
