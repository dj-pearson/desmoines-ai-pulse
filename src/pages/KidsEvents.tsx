import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createLogger } from '@/lib/logger';
import { supabase } from "@/integrations/supabase/client";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

const log = createLogger('KidsEvents');
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SocialEventCard } from "@/components/SocialEventCard";
import { useBatchEventSocial } from "@/hooks/useBatchEventSocial";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { EventListJsonLd } from "@/components/schema/EventListJsonLd";
import RelatedContent from "@/components/RelatedContent";
import { FAQSection } from "@/components/FAQSection";
import { Card, CardContent } from "@/components/ui/card";
import { Baby } from "lucide-react";
import { getCanonicalUrl } from "@/lib/brandConfig";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonGroup } from "@/components/ui/skeleton";
import { queryKeys } from "@/lib/queryKeys";

interface EventItem {
  id: string;
  title: string;
  date: string;
  location: string;
  venue: string;
  price: string;
  category: string;
  enhanced_description: string;
  original_description: string;
  image_url: string;
  event_start_utc: string;
}

export default function KidsEvents() {

  /**
   * WEB-SEO-031 AC5: converted from useState/useEffect for the reason
   * /events/today was. PrerenderSignal counts TanStack queries in flight, so a
   * hand-rolled fetch is invisible to it, the 1.5s grace fires, and the
   * prerenderer captures the skeleton.
   */
  const {
    data: events = [],
    isLoading,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.events.list({ audience: "kids" }),
    queryFn: async (): Promise<EventItem[]> => {
      const now = new Date().toISOString();

      // Search for kid-friendly keywords in title, description, or category
      const { data, error } = await supabase
        .from("events")
        .select("id, title, date, location, venue, price, category, enhanced_description, original_description, image_url, event_start_utc")
        .gte("date", now)
        .or("title.ilike.%kid%,title.ilike.%child%,title.ilike.%family%,category.ilike.%kid%,category.ilike.%family%,category.ilike.%child%,enhanced_description.ilike.%kid%,enhanced_description.ilike.%child%,enhanced_description.ilike.%family%")
        .order("date", { ascending: true })
        .limit(100);

      if (error) {
        log.error("fetchKidsEvents", "Error fetching kids events", { error });
        throw error;
      }
      return (data ?? []) as unknown as EventItem[];
    },
  });

  const kidsEvents = events || [];
  const freeKidsEvents = kidsEvents.filter(e =>
    e.price === "Free" || e.price === "0" || e.price?.toLowerCase().includes("free")
  );

  const pageTitle = "Kids & Family Events in Des Moines | Des Moines Insider";
  const pageDescription = `Find ${kidsEvents.length}+ family-friendly events in Des Moines for kids and teens: story times, festivals, and indoor and outdoor activities, updated daily.`;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: "Kids & Family", url: "/events/kids" },
  ];

  // SEO-014. These answers quoted "the Des Moines Parks & Recreation
  // department" and "Des Moines Tourism" for figures (300+ kids events a year,
  // 100+ library programs a month) that have no source in this repo - the
  // attributed-statistic pattern WEB-BE-053 removed from the writeup prompt.
  // FAQPage schema hands each answer to AI search as the site's own claim, so
  // they now describe the listings and link targets, nothing else.
  const faqData = [
    {
      question: "What are the best kids events in Des Moines?",
      answer: "This page lists upcoming family-friendly events across Des Moines and its suburbs - story times, festivals, science and nature programs and seasonal events - with the date, time, venue and price on every listing.",
    },
    {
      question: "Are there free activities for kids in Des Moines?",
      answer: "Yes. Free kids events are listed here alongside paid ones and are marked free on their cards. The Free Events page lists every free event on the calendar, and the playgrounds guide covers parks and play areas across the metro.",
    },
    {
      question: "What age groups do kids events in Des Moines serve?",
      answer: "It varies by event, from programs for babies and toddlers to teen events, and many festivals welcome all ages. Each listing links to the organizer's page, which is where age guidance is published.",
    },
    {
      question: "Where can kids play in Des Moines?",
      answer: "The playgrounds guide maps playgrounds across the Des Moines metro with their features, and each playground has its own page with directions.",
    },
    {
      question: "What's the best time of year for kids events in Des Moines?",
      answer: "There are family events all year. Summer brings outdoor festivals and park programs, fall brings pumpkin patches and Halloween events, and winter brings holiday events and indoor programs. The month pages show what is scheduled for each month.",
    },
  ];

  // WEB-PERF-030. SocialEventCard falls back to useEventSocial(event.id)
  // when no batch data is passed, and that fallback ran three queries and
  // opened three realtime channels PER CARD. This page renders up to
  // kidsEvents.length of them, so one anonymous visit could issue hundreds of
  // requests and sockets for a preview nobody can interact with. One batch
  // query per table replaces all of it.
  const batchSocialIds = useMemo(() => (kidsEvents ?? []).map((e) => e.id), [kidsEvents]);
  const { data: batchSocialData, isPending: batchSocialPending } =
    useBatchEventSocial(batchSocialIds);

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl("/events/kids")}
        pageType="website"
        breadcrumbs={breadcrumbs}
        // Withheld until the data lands (WEB-SEO-008). Every answer here
        // interpolates a live count, so the loading render and the loaded
        // render produce DIFFERENT FAQPage JSON - and react-helmet-async
        // appends script children that differ rather than replacing them, so
        // the prerender captured both. Production served two FAQPage blocks
        // on this page, one saying "0 events" and one saying "8 events".
        faqData={faqData}
        keywords={[
          "kids events Des Moines",
          "family friendly Des Moines",
          "children's activities Des Moines",
          "things to do with kids Des Moines",
          "family events Iowa",
          "toddler activities Des Moines",
          "kids birthday parties Des Moines",
          "indoor activities kids Des Moines",
        ]}
      />
      <EventListJsonLd
        events={kidsEvents}
        listName="Kids & Family Events in Des Moines, Iowa"
        listDescription={pageDescription}
        listUrl={getCanonicalUrl('/events/kids')}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Events", href: "/events" },
            { label: "Kids Events" },
          ]}
        />
        {/* Hero Section - GEO Optimized */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Baby className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">Kids & Family Events in Des Moines</h1>
          </div>

          <div className="flex items-center gap-4 text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <SpriteIcon name="users" className="h-4 w-4" />
              <span>Family-Friendly Activities</span>
            </div>
            <div className="flex items-center gap-1">
              <SpriteIcon name="map-pin" className="h-4 w-4" />
              <span>Des Moines Metro Area</span>
            </div>
          </div>

          <p className="text-lg text-muted-foreground max-w-3xl mb-4">
            <strong>Upcoming family-friendly events in Des Moines and its suburbs</strong>: story times, festivals, science and nature programs and seasonal events, with dates, times and prices on every listing.
          </p>

          <p className="text-base text-muted-foreground max-w-3xl">
            {freeKidsEvents.length} of the events below are listed as free. Looking for somewhere to play instead? See the <Link to="/playgrounds" className="text-primary hover:underline font-semibold">Des Moines playgrounds guide</Link>.
          </p>
        </div>

        {/* Quick Stats - GEO Optimized */}
        <Card className="mb-8 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {kidsEvents.length}+
                </div>
                <div className="text-sm text-muted-foreground">
                  Kids Events
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {freeKidsEvents.length}
                </div>
                <div className="text-sm text-muted-foreground">Free Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  All Ages
                </div>
                <div className="text-sm text-muted-foreground">0-18 Years</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  Daily
                </div>
                <div className="text-sm text-muted-foreground">New Events</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SEO-014. This card was "Top Family Venues" with visitor counts,
            founding years, animal counts and quotes credited to the Des Moines
            Register and the Trust for Public Land, none with a source, and an
            IMAX theater and a children's museum that may no longer operate.
            It now points at the pages on this site that answer the same
            question from data. */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">More for Families in Des Moines</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Link to="/playgrounds" className="p-4 bg-muted rounded-lg hover:bg-muted/70">
                <h3 className="font-semibold mb-1">Playgrounds guide</h3>
                <p className="text-sm text-muted-foreground">Playgrounds across the metro, each with its features and directions.</p>
              </Link>
              <Link to="/events/free" className="p-4 bg-muted rounded-lg hover:bg-muted/70">
                <h3 className="font-semibold mb-1">Free events</h3>
                <p className="text-sm text-muted-foreground">Every event on the calendar whose admission is listed as free.</p>
              </Link>
              <Link to="/attractions" className="p-4 bg-muted rounded-lg hover:bg-muted/70">
                <h3 className="font-semibold mb-1">Attractions</h3>
                <p className="text-sm text-muted-foreground">Museums, the zoo, gardens and landmarks, with hours and admission from each listing.</p>
              </Link>
              <Link to="/events/this-weekend" className="p-4 bg-muted rounded-lg hover:bg-muted/70">
                <h3 className="font-semibold mb-1">This weekend</h3>
                <p className="text-sm text-muted-foreground">Everything on the calendar from Friday through Sunday.</p>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Events List */}
        {!isLoading && loadError ? (
          <ErrorState error={loadError} onRetry={() => void refetch()} />
        ) : isLoading ? (
          /* WEB-SEO-031 AC5: no aria-busy, so the prerender strict gate had
             nothing to distinguish this from a rendered page. */
          <SkeletonGroup
            label="Loading family events..."
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-48 bg-muted rounded-lg mb-4"></div>
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </SkeletonGroup>
        ) : kidsEvents.length > 0 ? (
          <>
            <h2 className="text-2xl font-bold mb-6">
              Upcoming Family Events ({kidsEvents.length})
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {kidsEvents.map((event, index) => (
                <SocialEventCard
                  priority={index < 3}
                  key={event.id}
                  event={event}
                  socialData={batchSocialData?.[event.id]}
                  socialDataPending={batchSocialPending}
                  onViewDetails={() => {}}
                />
              ))}
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <SpriteIcon name="calendar" className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Kids Events Found</h3>
              <p className="text-muted-foreground mb-4">
                Check back soon! We add new family events daily.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Tips for Families. The old version asserted amenities at named
            places (nursing rooms, a mall play area, "library programs are
            always free") that nobody here checked. What is left is advice
            that holds whatever the venue. */}
        <Card className="mt-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Tips for Families at Des Moines Events</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Check the age range</h3>
                <p className="text-sm text-muted-foreground">
                  Organizers publish age guidance on their own pages. Each listing here links to it.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Have an indoor backup</h3>
                <p className="text-sm text-muted-foreground">
                  Iowa weather changes quickly. On a wet weekend, the <Link to="/events/this-weekend" className="text-primary hover:underline">this weekend</Link> list puts indoor events first.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Stay on budget</h3>
                <p className="text-sm text-muted-foreground">
                  {freeKidsEvents.length} of the events on this page are listed as free. See all <Link to="/events/free" className="text-primary hover:underline font-semibold">free events in Des Moines</Link>.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Get outside</h3>
                <p className="text-sm text-muted-foreground">
                  Between events, the <Link to="/playgrounds" className="text-primary hover:underline">playgrounds guide</Link> shows where to play near you.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* FAQ Section - Visible FAQs for SEO rich results */}
        <FAQSection
          faqs={faqData}
          title="Kids & Family Events FAQ"
          description="Common questions about family-friendly activities in the Des Moines metro area"
          showSchema={false}
        />

        {/* Related Content for Internal Linking */}
        <RelatedContent
          currentPath="/events/kids"
          title="More Des Moines Activities"
        />
      </div>

      <Footer />
    </div>
  );
}
