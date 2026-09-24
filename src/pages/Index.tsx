import { useState, lazy, Suspense } from "react";
import { AdBanner } from "@/components/AdBanner";
import { BackToTop } from "@/components/BackToTop";
import { EnhancedHero } from "@/components/EnhancedHero";
import { FAQSection } from "@/components/FAQSection";
import { ForYouRail } from "@/components/ForYouRail";
import Header from "@/components/Header";
import { LazySection } from "@/components/LazySection";
import SEOHead from "@/components/SEOHead";
import SpeakableSchema from "@/components/schema/SpeakableSchema";
import { TonightRail } from "@/components/TonightRail";
import { DashboardGridSkeleton } from "@/components/ui/loading-skeleton";
import { useHomepageStats } from "@/hooks/useHomepageStats";
import { BRAND } from "@/lib/brandConfig";
import type { Event } from "@/lib/types";
import {
  HOME_FAQ_DESCRIPTION,
  HOME_FAQ_TITLE,
  HOME_FAQS,
  HOME_PAGE_TITLE,
  HOME_SPEAKABLE,
  HOME_STRUCTURED_DATA,
} from "@/content/homeContent";

// Lazy chunks for everything below the rails. React.lazy defers the download
// only; LazySection (below) is what defers the MOUNT, and with it each
// section's queries, until the visitor is within 400px of it (WP1 item 10).
const Footer = lazy(() => import("@/components/Footer"));
const AllInclusiveDashboard = lazy(() => import("@/components/AllInclusiveDashboard"));
const MostSearched = lazy(() => import("@/components/MostSearched"));
const GEOContent = lazy(() => import("@/components/GEOContent"));
const EventQuickView = lazy(() => import("@/components/EventQuickView").then(m => ({ default: m.EventQuickView })));
const RecentlyViewedRail = lazy(() => import("@/components/RecentlyViewedRail").then(m => ({ default: m.RecentlyViewedRail })));
const HomeInterestNav = lazy(() => import("@/components/HomeInterestNav").then(m => ({ default: m.HomeInterestNav })));
const SocialProof = lazy(() => import("@/components/SocialProof").then(m => ({ default: m.SocialProof })));

// A neutral fixed-height box for sections whose own skeleton lives elsewhere.
const SectionPlaceholder = ({ height }: { height: number }) => (
  <div className="w-full animate-pulse bg-muted/20" style={{ minHeight: height }} aria-hidden="true" />
);

// WEB-SEO-012: the page title and description. WEB-SEO-027 collapsed the two
// head managers that used to share these into one, so there is no longer a
// second component to keep in step - SEOHead owns the head.
//
// SEO-008: RE-TARGETED. This was "Things to Do in Des Moines This Weekend",
// which put the homepage in direct competition with two of its own pages:
// /things-to-do owns "things to do in des moines" and /events/this-weekend
// owns the weekend phrase (with /weekend 301'd onto it). Measured 2026-08-28,
// the homepage sat at position 30.03 with 12 clicks in sixteen months while
// /things-to-do sat at 39.8 and /events/this-weekend at 37.2, so all three were
// losing the same query rather than covering three different ones.
//
// The homepage takes the brand and the city entity, and names the categories
// without claiming any hub's exact head term. The hubs keep theirs.
// 60 chars is where Google truncates; this was 69 (WEB-SEO-043).
// The title string is HOME_PAGE_TITLE in src/content/homeContent.ts, so SEOHead
// and the Speakable node share one constant.
const HOME_DESCRIPTION =
  "What's on in Des Moines, Iowa right now: live events and festivals, restaurants open tonight, and family plans for the weekend. Updated daily across the metro.";

export default function Index() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const { eventsToday, restaurantsCount, newThisWeek, isLoading: statsLoading } = useHomepageStats();

  // No preferences modal on load (WP1 item 9). An effect here opened
  // PreferencesOnboarding one second after any signed-in visit that had not
  // finished onboarding. ForYouRail now carries an inline "Tune your picks"
  // prompt that opens it on request (WP2).

  const handleViewEventDetails = (event: Event) => {
    setSelectedEvent(event);
    setShowEventDetails(true);
  };

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
        description={HOME_DESCRIPTION}
        url="/"
        canonicalUrl={`${BRAND.baseUrl}/`}
        type="website"
        structuredData={HOME_STRUCTURED_DATA}
      />

      {/* Speakable Schema for GEO - enables AI search engine attribution */}
      <SpeakableSchema {...HOME_SPEAKABLE} />

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
          restaurantsCount={restaurantsCount}
          newThisWeek={newThisWeek}
          isLoadingStats={statsLoading}
        />

        {/* Current conditions (WEB-FEAT-022) now render in ForYouRail's
            fixed-height header slot (RailWeatherLine, WP2 item 6), so a late
            forecast changes text there instead of inserting a block here. */}

        {/* Tonight: an event paired with a nearby restaurant open at dinner
            time. The page's primary content under the hero (WP10). */}
        <TonightRail />

        {/* For You / Trending rail - IOS-DISCOVER-2026-002 web parity */}
        <ForYouRail />

        {/* Recently viewed (WEB-FEAT-007). Computes synchronously from the
            local store, so no layout shift. */}
        <Suspense fallback={null}>
          <RecentlyViewedRail />
        </Suspense>

        {/* Everything from here down mounts near the viewport. */}
        <LazySection minHeight={44}>
          <Suspense fallback={<SectionPlaceholder height={44} />}>
            <HomeInterestNav />
          </Suspense>
        </LazySection>

        {/* AdBanner renders its own sized wrapper (WP4); no py band here. */}
        <LazySection minHeight={80} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AdBanner placement="top_banner" />
        </LazySection>

        {/* Neighbourhood strip (WP5) */}
        <LazySection minHeight={160}>
          <Suspense fallback={<SectionPlaceholder height={160} />}>
            <SocialProof />
          </Suspense>
        </LazySection>

        {/* This week in Des Moines (WP3) */}
        <LazySection minHeight={720} placeholder={<DashboardGridSkeleton />}>
          <div data-dashboard="all-inclusive">
            <Suspense fallback={<DashboardGridSkeleton />}>
              <AllInclusiveDashboard onViewEventDetails={handleViewEventDetails} />
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

        <LazySection minHeight={80} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AdBanner placement="below_fold" />
        </LazySection>

        {/* The footer holds the page's one newsletter signup (WP7). Not in a
            LazySection: it makes no queries until submit, and its links are
            the site's crawl paths. */}
        <Suspense fallback={<SectionPlaceholder height={400} />}>
          <Footer />
        </Suspense>
      </div>

      {/* Event quick view - lazy, mounted only once a card has been selected */}
      {selectedEvent && (
        <Suspense fallback={null}>
          <EventQuickView
            event={selectedEvent}
            open={showEventDetails}
            onOpenChange={setShowEventDetails}
          />
        </Suspense>
      )}

      {/* Back to Top Button */}
      <BackToTop />
    </div>
  );
}
