import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BackToTop } from "@/components/BackToTop";
import { EnhancedHero } from "@/components/EnhancedHero";
import { FAQSection } from "@/components/FAQSection";
import { ForYouRail } from "@/components/ForYouRail";
import Header from "@/components/Header";
import { LazySection } from "@/components/LazySection";
import { RecentlyViewedRail } from "@/components/RecentlyViewedRail";
import SEOHead from "@/components/SEOHead";
import SpeakableSchema from "@/components/schema/SpeakableSchema";
import { SocialProof } from "@/components/SocialProof";
import { TonightRail } from "@/components/TonightRail";
import { DashboardGridSkeleton } from "@/components/ui/loading-skeleton";
import { useHomeSnapshotAsOfDate } from "@/hooks/useHomeSnapshot";
import { useHomepageStats } from "@/hooks/useHomepageStats";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brandConfig";
import { ErrorSeverity, handleError } from "@/lib/errorHandler";
import { applyEventVisibility } from "@/lib/eventQuery";
import { isPrerender } from "@/lib/isPrerender";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import type { Event } from "@/lib/types";
import {
  HOME_ABOUT,
  HOME_FAQ_DESCRIPTION,
  HOME_FAQ_TITLE,
  HOME_FAQS,
  HOME_META_DESCRIPTION,
  HOME_PAGE_TITLE,
  HOME_SPEAKABLE,
  HOME_STRUCTURED_DATA,
} from "@/content/homeContent";

// Lazy chunks for everything below the rails. React.lazy defers the download
// only; LazySection (below) is what defers the MOUNT, and with it each
// section's queries, until the visitor is within 400px of it.
//
// AdBanner is lazy too (home-pass2 WP1 item 10): as a static import it pulled
// HouseAd and UpgradeModal into the first view for a slot below the rails.
const AdBanner = lazy(() => import("@/components/AdBanner").then(m => ({ default: m.AdBanner })));
const Footer = lazy(() => import("@/components/Footer"));
const AllInclusiveDashboard = lazy(() => import("@/components/AllInclusiveDashboard"));
const MostSearched = lazy(() => import("@/components/MostSearched"));
const GEOContent = lazy(() => import("@/components/GEOContent"));
const EventQuickView = lazy(() => import("@/components/EventQuickView").then(m => ({ default: m.EventQuickView })));

// A neutral fixed-height box for sections whose own skeleton lives elsewhere.
const SectionPlaceholder = ({ height }: { height: number }) => (
  <div className="w-full animate-pulse bg-muted/20" style={{ minHeight: height }} aria-hidden="true" />
);

// The page title and description (WEB-SEO-012, SEO-008) live in
// src/content/homeContent.ts as HOME_PAGE_TITLE and HOME_META_DESCRIPTION, so
// SEOHead, the Speakable node and the WebPage node share one string each.
// SEO-008's reasoning still holds: the homepage takes the brand and the city
// entity and leaves each hub its own head term.

/** The quick view's URL parameter: `/?event=<uuid>`. */
const EVENT_PARAM = "event";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The event a shared or reloaded `/?event=<id>` link names (home-pass2 WP1
 * item 11). One row, the list projection, the site's visibility predicate: a
 * hidden, merged or archived event does not open. Nothing fires without the
 * parameter, so the first view of `/` pays nothing for this.
 */
async function fetchEventForQuickView(id: string): Promise<Event | null> {
  const { data, error } = await applyEventVisibility(
    supabase.from("events").select(EVENT_LIST_COLUMNS),
  )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Event | null) ?? null;
}

/**
 * The quick view's open state lives in the URL, so Back closes the sheet on
 * Android and a copied link reopens it.
 *
 * Opening from a card pushes `?event=<id>`. Closing pops that entry when this
 * page pushed it, so the history holds no second copy of `/` to Back through;
 * a sheet opened from a pasted link has no entry of ours to pop, so closing
 * replaces the URL instead.
 */
function useQuickViewParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const pushedByUs = useRef(false);
  const [picked, setPicked] = useState<Event | null>(null);

  const rawId = searchParams.get(EVENT_PARAM);
  const eventId = rawId && UUID_RE.test(rawId) && !isPrerender() ? rawId : null;
  const needsFetch = eventId !== null && picked?.id !== eventId;

  const { data: linked, isFetched, error } = useQuery({
    queryKey: ["home-quick-view-event", eventId],
    queryFn: () => fetchEventForQuickView(eventId as string),
    enabled: needsFetch,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (error) handleError(error, { component: "Index", action: "fetchEventForQuickView" }, ErrorSeverity.WARNING);
  }, [error]);

  const dropParam = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(EVENT_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [setSearchParams]);

  // A malformed id, or one that names no visible event: take the parameter
  // off rather than leave a URL that promises a sheet and opens nothing.
  useEffect(() => {
    if (rawId && !eventId && !isPrerender()) dropParam();
  }, [rawId, eventId, dropParam]);
  useEffect(() => {
    if (needsFetch && isFetched && !error && linked === null) dropParam();
  }, [needsFetch, isFetched, error, linked, dropParam]);

  const open = useCallback(
    (event: Event) => {
      setPicked(event);
      pushedByUs.current = true;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(EVENT_PARAM, event.id);
          return next;
        },
        { preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) return;
      if (pushedByUs.current) {
        pushedByUs.current = false;
        navigate(-1);
      } else {
        dropParam();
      }
    },
    [navigate, dropParam],
  );

  // Back, or any navigation that drops the parameter, forgets the push.
  useEffect(() => {
    if (!eventId) pushedByUs.current = false;
  }, [eventId]);

  const event = eventId ? (picked?.id === eventId ? picked : linked ?? null) : picked;
  return { event, isOpen: eventId !== null && event !== null, open, onOpenChange };
}

export default function Index() {
  const quickView = useQuickViewParam();
  const { eventsToday, mode: countMode, isLoading: statsLoading } = useHomepageStats();
  const snapshotAsOf = useHomeSnapshotAsOfDate();

  // No preferences modal on load (WP1 item 9). An effect here opened
  // PreferencesOnboarding one second after any signed-in visit that had not
  // finished onboarding. ForYouRail now carries an inline "Tune your picks"
  // prompt that opens it on request (WP2).

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* WEB-SEO-012: the homepage used to be titled "Conversational City Guide
          | AI-Powered Event & Restaurant Discovery" and described with
          BRAND.description. That sold the product to itself on our
          highest-authority page - nobody searches for how we are built.
          Title and description now lead with the query. BRAND.description is
          deliberately left alone: it is the Organization/LocalBusiness
          description in schema, where self-description is correct. */}
      {/* WEB-SEO-027 -- ONE HEAD MANAGER.
          This was <SEOEnhancedHead> followed by <SEOStructure>, and both set
          <title> and <meta name="description">. Helmet resolves last-mount-
          wins, so SEOStructure's DEFAULTS silently overrode whatever the first
          set. The fix is to have one. The two schema objects ride together in
          SEOHead's structuredData: one script tag, two nodes, each @type once
          on the page. Organization still ships: SEOHead emits its own, with a
          stable @id. */}
      <SEOHead
        title={HOME_PAGE_TITLE}
        description={HOME_META_DESCRIPTION}
        url="/"
        canonicalUrl={`${BRAND.baseUrl}/`}
        type="website"
        structuredData={HOME_STRUCTURED_DATA}
      />

      {/* Speakable Schema for GEO - enables AI search engine attribution */}
      {/* dateModified is the snapshot's as-of date, read from its cache entry
          without a fetch (home-pass2 WP4 items 5 and 6). Rendered once the
          snapshot has settled, so the node is written with its final props:
          see useHomeSnapshotAsOfDate for the Helmet orphan this avoids. On a
          failed snapshot it renders without dateModified. */}
      {snapshotAsOf.settled && (
        <SpeakableSchema
          {...HOME_SPEAKABLE}
          about={HOME_ABOUT}
          dateModified={snapshotAsOf.asOfDate ?? undefined}
        />
      )}

      {/* Page order (WP1 item 8): hero and search, Tonight, For You, recently
          viewed, neighbourhood strip, this week, most searched, snapshot and
          FAQ, footer. Each kind of content appears once. Removed from here:
          the AI City Companion grid (claims no code backs), RecentlyViewed
          (a second copy of the rail), PersonalizedRecommendations,
          PersonalizedDashboard (ranked sponsored events higher and badged them
          "NN% match"), SmartEventNavigation (a second 100-event list), the
          structured SearchSection (a second search), and <Newsletter/> (the
          footer form is the one signup). */}
      <div>
        <Header />

        {/* Hero: H1, a one-line live context, the page's one search box, and
            the quick-pick chips. */}
        <EnhancedHero
          eventsToday={eventsToday}
          countMode={countMode}
          isLoadingStats={statsLoading}
        />

        {/* Current conditions (WEB-FEAT-022) render in a rail header's
            fixed-height slot (RailWeatherLine), so a late forecast changes
            text there instead of inserting a block here. */}

        {/* Tonight: an event paired with a nearby restaurant open at dinner
            time. The page's primary content under the hero (WP10). */}
        <TonightRail />

        {/* For You / Trending rail - IOS-DISCOVER-2026-002 web parity */}
        <ForYouRail />

        {/* Recently viewed (WEB-FEAT-007). A static import: the rail reads
            safeStorage synchronously, so it renders in the first commit or not
            at all. It was React.lazy with a null fallback, which inserted it
            about 230px tall after first paint (home-pass2 WP1 item 10). */}
        <RecentlyViewedRail />

        {/* Everything from here down mounts near the viewport, except the
            neighbourhood strip. HomeInterestNav is gone: it repeated the
            header, the bottom nav and the hero chips, and wrote a cohort row
            nobody read. */}

        {/* AdBanner renders its own sized wrapper (WP4); no py band here. The
            below-the-fold slot is gone: on a day with no paid ad it showed a
            second trip-planner upsell. */}
        <LazySection minHeight={80} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Suspense fallback={<SectionPlaceholder height={80} />}>
            <AdBanner placement="top_banner" />
          </Suspense>
        </LazySection>

        {/* Neighbourhood strip. Static and outside LazySection: it renders
            from src/lib/neighborhoods.ts, and its links are crawl paths. */}
        <SocialProof />

        {/* This week in Des Moines (WP3) */}
        <LazySection minHeight={720} placeholder={<DashboardGridSkeleton />}>
          <div data-dashboard="all-inclusive">
            <Suspense fallback={<DashboardGridSkeleton />}>
              <AllInclusiveDashboard onViewEventDetails={quickView.open} />
            </Suspense>
          </div>
        </LazySection>

        <LazySection minHeight={480}>
          <Suspense fallback={<SectionPlaceholder height={480} />}>
            <MostSearched />
          </Suspense>
        </LazySection>

        {/* Dated snapshot (WP5), inside GEOContent */}
        <LazySection minHeight={240}>
          <Suspense fallback={<SectionPlaceholder height={240} />}>
            <section className="py-16 bg-muted/30">
              <GEOContent />
            </section>
          </Suspense>
        </LazySection>

        {/* FAQ - rendered directly, NOT in a LazySection: the answers must be
            in the initial DOM for indexing and the FAQPage schema. */}
        <section className="py-16 bg-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* WEB-SEO-012: the questions answer what visitors search for;
                see HOME_FAQS in src/content/homeContent.ts. */}
            <FAQSection
              title={HOME_FAQ_TITLE}
              description={HOME_FAQ_DESCRIPTION}
              faqs={HOME_FAQS}
              showSchema={true}
            />
          </div>
        </section>

        {/* The footer holds the page's one newsletter signup (WP7). Not in a
            LazySection: it makes no queries until submit, and its links are
            the site's crawl paths. */}
        <Suspense fallback={<SectionPlaceholder height={400} />}>
          <Footer />
        </Suspense>
      </div>

      {/* Event quick view - lazy, mounted only once an event is selected.
          Its open state is the ?event= parameter (useQuickViewParam). */}
      {quickView.event && (
        <Suspense fallback={null}>
          <EventQuickView
            event={quickView.event}
            open={quickView.isOpen}
            onOpenChange={quickView.onOpenChange}
          />
        </Suspense>
      )}

      {/* Back to Top Button */}
      <BackToTop />
    </div>
  );
}
