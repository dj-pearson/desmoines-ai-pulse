import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ListFreshness } from "@/components/ListFreshness";
import { MonthLinks } from "@/components/seo/MonthLinks";
import { FAQSection } from "@/components/FAQSection";
import { SocialEventCard } from "@/components/SocialEventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { EventListJsonLd } from "@/components/schema/EventListJsonLd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MapPin, Clock, Filter } from "lucide-react";
import {
  format,
  isWeekend,
  parseISO,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
} from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { formatCount } from "@/lib/pluralize";

export default function EventsThisWeekend() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  useDocumentTitle("Events This Weekend");

  const { data: events, isLoading } = useQuery({
    queryKey: ["events-weekend"],
    queryFn: async () => {
      const tz = "America/Chicago";
      const now = new Date();
      const nowLocal = toZonedTime(now, tz);
      const day = nowLocal.getDay(); // 0 Sun - 6 Sat
      const offsetToFriday = day === 0 ? -2 : day >= 5 ? 5 - day : 5 - day;
      const fridayStartLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 0, 0, 0, 0);
      fridayStartLocal.setDate(fridayStartLocal.getDate() + offsetToFriday);
      const sundayEndLocal = new Date(fridayStartLocal);
      sundayEndLocal.setDate(fridayStartLocal.getDate() + 2);
      sundayEndLocal.setHours(23, 59, 59, 999);

      const startUtc = fromZonedTime(fridayStartLocal, tz).toISOString();
      const endUtc = fromZonedTime(sundayEndLocal, tz).toISOString();

      const { data, error } = await supabase
        .from("events")
        .select(EVENT_LIST_COLUMNS)
        .gte("date", startUtc)
        .lte("date", endUtc)
        .order("event_start_utc", { ascending: true, nullsFirst: false })
        .order("date", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000, // Refetch every 10 minutes
  });

  const weekendEvents = events || [];

  // Filter events based on selected filters
  const filteredEvents = weekendEvents.filter((event) => {
    const categoryMatch =
      selectedCategory === "all" ||
      event.category?.toLowerCase().includes(selectedCategory.toLowerCase()) ||
      event.category?.toLowerCase().includes(selectedCategory.toLowerCase());

    const locationMatch =
      selectedLocation === "all" ||
      event.location?.toLowerCase().includes(selectedLocation.toLowerCase()) ||
      event.venue?.toLowerCase().includes(selectedLocation.toLowerCase());

    return categoryMatch && locationMatch;
  });

  // Get unique categories and locations for filters
  const categories = [
    ...new Set(weekendEvents.map((e) => e.category).filter(Boolean)),
  ];
  const locations = [
    ...new Set(
      weekendEvents
        .map((e) => {
          const location = e.location || e.venue || "";
          return location.split(",")[0].trim();
        })
        .filter(Boolean)
    ),
  ];

  const pageTitle = `Des Moines Events This Weekend - ${format(
    new Date(),
    "MMMM d"
  )} | ${BRAND.name}`;
  const pageDescription = `Find the best events happening this weekend in Des Moines and suburbs. See dates, times, maps, and tips for ${format(
    new Date(),
    "MMMM d"
  )} weekend activities. Updated daily.`;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: "This Weekend", url: "/events/this-weekend" },
  ];

  const faqData = [
    {
      question: "What's happening this weekend in Des Moines?",
      answer: `See everything happening this weekend in Des Moines and surrounding areas, with dates, times and maps on one page. The list is rebuilt daily as events are announced.`,
    },
    {
      question: "Are there kid-friendly events this weekend?",
      answer:
        "Yes! We mark family-friendly events and include details about parking, bathrooms, and play areas when available.",
    },
    {
      question: "How do I find free events?",
      answer:
        "Use our filters to show only free events, or look for the 'Free' tag on event cards. We list both free and paid activities.",
    },
    {
      question: "When is this list updated?",
      answer:
        "This weekend events list is updated daily, typically on Thursday and Friday, to include the latest additions and changes.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl('/events/this-weekend')}
        pageType="website"
        breadcrumbs={breadcrumbs}
        // SEO-003: this prop no longer emits anything. EnhancedLocalSEO stopped
        // emitting FAQPage - <FAQSection> below is the single emitter, and it
        // renders the questions too, so the schema cannot describe content that
        // is not on the page. Kept as a signal that this page has an FAQ.
        //
        // The WEB-SEO-008 hazard this comment used to describe is still real and
        // is worth keeping written down: react-helmet-async APPENDS script
        // children that differ rather than replacing them, so an FAQ answer
        // interpolating a live count produces different JSON on the loading
        // render and the loaded render, and the prerender captures BOTH.
        // Production once served two FAQPage blocks here, one saying "0 events"
        // and one saying "8 events". The answers below are static for that
        // reason. Do not interpolate a count into them.
        faqData={faqData}
        isTimeSensitive={true}
      />
      <EventListJsonLd
        events={filteredEvents}
        listName="Des Moines Weekend Events"
        listDescription={pageDescription}
        listUrl={getCanonicalUrl('/events/this-weekend')}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Events", href: "/events" },
            { label: "This Weekend" },
          ]}
        />
        {/* Hero Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">This Weekend in Des Moines</h1>
          </div>

          {/* SEO-009: a visible, absolute freshness date. These are the pages
              somebody checks again next Friday, and the only freshness claim on
              them lived in the meta description ("Updated daily"), where the
              reader it is aimed at cannot check it. Absolute rather than
              relative on purpose - these pages are prerendered, so a relative
              string is computed once at build time and frozen, and would still
              read "2 hours ago" days later. Renders nothing when no row carries
              a usable date. */}
          <ListFreshness rows={weekendEvents} className="mb-4" />

          {/* SEO-016: the month index pages existed, worked, and were linked
              from nowhere on the whole site. Crawlers follow links; a URL that
              appears only in a sitemap is a weak signal. */}
          <MonthLinks className="mb-6" />

          <div className="flex items-center gap-4 text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>Weekend of {format(new Date(), "MMMM d, yyyy")}</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>Des Moines Metro Area</span>
            </div>
          </div>

          <p className="text-lg text-muted-foreground max-w-3xl">
            See events in Des Moines and suburbs for this weekend. Dates, times,
            maps, and quick tips all in one place.
          </p>
        </div>

        {/* Quick Stats */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {weekendEvents.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Weekend Events
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {
                    weekendEvents.filter(
                      (e) => e.price === "Free" || e.price === "0"
                    ).length
                  }
                </div>
                <div className="text-sm text-muted-foreground">Free Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {
                    weekendEvents.filter(
                      (e) =>
                        e.category?.toLowerCase().includes("family") ||
                        e.category?.toLowerCase().includes("family") ||
                        e.enhanced_description?.toLowerCase().includes("kid")
                    ).length
                  }
                </div>
                <div className="text-sm text-muted-foreground">
                  Family Events
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {
                    new Set(weekendEvents.map((e) => e.location?.split(",")[0]))
                      .size
                  }
                </div>
                <div className="text-sm text-muted-foreground">Locations</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        {(categories.length > 0 || locations.length > 0) && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filter Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {/* Category Filter */}
                {categories.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Category
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={
                          selectedCategory === "all" ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setSelectedCategory("all")}
                      >
                        All
                      </Button>
                      {categories.map((category) => (
                        <Button
                          key={category}
                          variant={
                            selectedCategory === category
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() => setSelectedCategory(category)}
                        >
                          {category}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Location Filter */}
                {locations.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Location
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={
                          selectedLocation === "all" ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setSelectedLocation("all")}
                      >
                        All Areas
                      </Button>
                      {locations.map((location) => (
                        <Button
                          key={location}
                          variant={
                            selectedLocation === location
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() => setSelectedLocation(location)}
                        >
                          {location}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Events List */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-muted rounded mb-2"></div>
                  <div className="h-4 bg-muted rounded mb-4 w-3/4"></div>
                  <div className="h-20 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredEvents.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {filteredEvents.map((event) => (
                <SocialEventCard key={event.id} event={event} onViewDetails={() => {}} />
              ))}
            </div>

            {/* Related Links */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>More Weekend Ideas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Link
                    to="/restaurants"
                    className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <h3 className="font-semibold mb-2">Weekend Dining</h3>
                    <p className="text-sm text-muted-foreground">
                      Best restaurants for weekend brunch, dinner, and late
                      night eats
                    </p>
                  </Link>
                  <Link
                    to="/attractions"
                    className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <h3 className="font-semibold mb-2">Places to Visit</h3>
                    <p className="text-sm text-muted-foreground">
                      Parks, museums, and attractions perfect for weekend
                      exploring
                    </p>
                  </Link>
                  <Link
                    to="/playgrounds"
                    className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <h3 className="font-semibold mb-2">Family Fun</h3>
                    <p className="text-sm text-muted-foreground">
                      Playgrounds and family activities for weekend adventures
                    </p>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* SEO-003: FAQSection renders the questions AND emits the single
                FAQPage block. It used to be hand-rolled markup here with the
                schema emitted separately by EnhancedLocalSEO, which is how the
                two could disagree — and on this page the markup sits inside a
                conditional, so there were states that shipped FAQ schema for an
                FAQ nobody could see. One component owning both makes "schema
                only when the content is visible" true by construction. */}
            <FAQSection faqs={faqData} />
          </>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">
                No Weekend Events Found
              </h2>
              <p className="text-muted-foreground mb-4">
                {selectedCategory !== "all" || selectedLocation !== "all"
                  ? "Try adjusting your filters to see more events."
                  : "No events are scheduled for this weekend. Check back later or browse upcoming events."}
              </p>
              <div className="flex justify-center gap-4">
                {(selectedCategory !== "all" || selectedLocation !== "all") && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedCategory("all");
                      setSelectedLocation("all");
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
                <Link to="/events" className="text-primary hover:underline">
                  Browse All Events
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Footer />
    </div>
  );
}
