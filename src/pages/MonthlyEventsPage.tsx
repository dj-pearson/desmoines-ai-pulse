import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EventCard from "@/components/EventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { EventListJsonLd } from "@/components/schema/EventListJsonLd";
import { FAQSection } from "@/components/FAQSection";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, parseISO, isValid } from "date-fns";
import { useState, useEffect, useMemo } from "react";
import { BRAND } from "@/lib/brandConfig";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { formatCount } from "@/lib/pluralize";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

/**
 * WEB-PERF-023. The grid rendered every event in the month, which measured
 * 14,857 DOM elements on /events/august-2026 (268 events) - the worst route on
 * the site against a 1,189 median and a ~1,500 Lighthouse flag. The cost is
 * about 53 elements per EventCard on top of ~460 of page chrome, derived from
 * the four month pages: 268 events -> 14,857, 153 -> 8,438, 122 -> 6,806,
 * 75 -> 4,489.
 *
 * 36 is twelve full rows of the lg:grid-cols-3 grid and puts August at roughly
 * 2,400, in line with /restaurants (2,875) and / (2,314) rather than ten times
 * worse than either. Matches VISIBLE_RESTAURANTS in DietaryRestaurants.tsx.
 *
 * THE TRADE-OFF IS REAL AND IS NOT MINE TO SETTLE ALONE: these are SEO landing
 * pages that SEO-016 has only just started linking to, and a month page now
 * lists 36 of 268 events. Every event remains reachable through /events, the
 * month navigation and its own detail page, and 14,857 elements is itself a
 * Core Web Vitals problem - but if the whole month must render, the fix is a
 * cheaper card, not a bigger cap.
 */
const VISIBLE_EVENTS = 36;

export default function MonthlyEventsPage() {
  const { slug } = useParams<{ slug: string }>();
  const monthYear = slug;
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Parse month-year from URL (e.g., "march-2024")
  const parseMonthYear = (monthYearStr: string) => {
    const [monthName, yearStr] = monthYearStr.split("-");
    const year = parseInt(yearStr);
    const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
    return new Date(year, monthIndex, 1);
  };

  const targetDate = monthYear ? parseMonthYear(monthYear) : new Date();
  const isValidDate = isValid(targetDate);
  
  const monthStart = startOfMonth(targetDate);
  const monthEnd = endOfMonth(targetDate);
  
  // Fetch the full month once; category filtering + category list are derived
  // in memory to avoid a second full-range query (WEB-PERF-011).
  const { data: allEvents, isLoading } = useQuery({
    queryKey: ["monthly-events", monthYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select(EVENT_LIST_COLUMNS)
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"))
        .order("date", { ascending: true })
        // `time` is not a column on public.events; ordering by it made PostgREST
        // reject the query with 42703 and the month grid rendered empty.
        // event_start_local is the intended intra-day ordering key.
        .order("event_start_local", { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data || [];
    },
    enabled: isValidDate, // Only run query if date is valid
  });

  // Category filter applied in memory (preserves the previous grid behavior).
  const events = useMemo(() => {
    if (!allEvents) return allEvents;
    if (selectedCategory === "all") return allEvents;
    return allEvents.filter((event) => event.category === selectedCategory);
  }, [allEvents, selectedCategory]);

  // Distinct category list derived from the already-fetched rows.
  const categories = useMemo(
    () =>
      [...new Set((allEvents || []).map((event) => event.category))]
        .filter(Boolean)
        .sort(),
    [allEvents]
  );

  useDocumentTitle(isValidDate ? `${format(targetDate, "MMMM yyyy")} Events` : "Monthly Events");

  // Check validity AFTER hooks
  if (!isValidDate) {
    return <div>Invalid date format</div>;
  }

  // Navigation helpers
  const getNextMonth = () => {
    const next = new Date(targetDate);
    next.setMonth(next.getMonth() + 1);
    return format(next, "MMMM-yyyy").toLowerCase();
  };

  const getPrevMonth = () => {
    const prev = new Date(targetDate);
    prev.setMonth(prev.getMonth() - 1);
    return format(prev, "MMMM-yyyy").toLowerCase();
  };

  const monthDisplayName = format(targetDate, "MMMM yyyy");
  const pageTitle = `${monthDisplayName} Events in Des Moines - Complete Calendar`;
  const pageDescription = `Complete list of events happening in ${monthDisplayName} in Des Moines and suburbs. Concerts, festivals, community events, and entertainment activities with dates, times, and details.`;
  
  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: monthDisplayName, url: `/events/${monthYear}` },
  ];

  const faqData = [
    {
      question: `What events are happening in ${monthDisplayName} in Des Moines?`,
      answer: `We have ${formatCount(events?.length || 0, 'event')} scheduled for ${monthDisplayName} in Des Moines and surrounding areas. Browse our complete calendar with dates, times, locations, and ticket information.`,
    },
    {
      question: "How often is the monthly calendar updated?",
      answer: "Our monthly event calendar is updated daily as new events are added and details change. We recommend checking back regularly for the most current information.",
    },
    {
      question: "Do you include events in Des Moines suburbs?",
      answer: "Yes! Our monthly calendar includes events throughout the greater Des Moines metro area including West Des Moines, Ankeny, Urbandale, Johnston, and other nearby communities.",
    },
    {
      question: "Can I filter events by category or type?",
      answer: "Absolutely! Use our category filters to narrow down events by type such as music, family, sports, arts, or community events to find exactly what interests you.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={`${BRAND.baseUrl}/events/${monthYear}`}
        pageType="website"
        breadcrumbs={breadcrumbs}
        isTimeSensitive={true}
      />
      {/* The schema must describe what the page SHOWS. The grid is capped at
          VISIBLE_EVENTS, and EventListJsonLd defaults maxItems to 50, so
          passing the full month here would advertise events a reader cannot
          see - the same defect already fixed on /restaurants, which declared
          numberOfItems 478 against a 20-item list. */}
      <EventListJsonLd
        events={(events || []).slice(0, VISIBLE_EVENTS)}
        maxItems={VISIBLE_EVENTS}
        listName={pageTitle}
        listDescription={pageDescription}
        listUrl={`${BRAND.baseUrl}/events/${monthYear}`}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Events", href: "/events" },
            { label: monthDisplayName },
          ]}
        />
        {/* Header with Navigation */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/events/${getPrevMonth()}`)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous Month
            </Button>
            
            <div className="text-center">
              <div className="flex items-center gap-2 mb-2">
                <SpriteIcon name="calendar" className="h-6 w-6 text-primary" />
                <h1 className="text-3xl font-bold">{monthDisplayName} Events</h1>
              </div>
              <div className="flex items-center gap-4 text-muted-foreground">
                <div className="flex items-center gap-1">
                  <SpriteIcon name="map-pin" className="h-4 w-4" />
                  <span>Des Moines Metro Area</span>
                </div>
                <div className="flex items-center gap-1">
                  <SpriteIcon name="clock" className="h-4 w-4" />
                  <span>{events?.length || 0} Events This Month</span>
                </div>
              </div>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/events/${getNextMonth()}`)}
            >
              Next Month
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <p className="text-lg text-muted-foreground mb-8 text-center max-w-3xl mx-auto">
          Complete calendar of events happening in {monthDisplayName} throughout Des Moines and suburbs. 
          Find concerts, festivals, community gatherings, and entertainment activities with all the details you need.
        </p>

        {/* Quick Stats */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {events?.length || 0}
                </div>
                <div className="text-sm text-muted-foreground">
                  Total Events
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {events?.filter(e => e.price === "Free" || e.price === "0").length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Free Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {categories?.length || 0}
                </div>
                <div className="text-sm text-muted-foreground">
                  Event Categories
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {new Set(events?.map(e => e.location?.split(",")[0])).size || 0}
                </div>
                <div className="text-sm text-muted-foreground">Locations</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category Filters */}
        {categories && categories.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Filter by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={selectedCategory === "all" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setSelectedCategory("all")}
                >
                  All Events
                </Badge>
                {categories.map((category) => (
                  <Badge
                    key={category}
                    variant={selectedCategory === category ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Events Grid */}
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
        ) : events && events.length > 0 ? (
          <>
            {/* WEB-PERF-023: this rendered every event in the month, and
                /events/august-2026 measured 14,857 DOM elements inside #root —
                the worst route on the site, ten times the ~1,500 Lighthouse
                flag and twelve times the 1,189 median across all 1,171
                prerendered routes. The four month pages were the four worst.
                Only the grid is capped; the heading and the month-navigation
                count below still read events.length, so no displayed number
                changes. */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {events.slice(0, VISIBLE_EVENTS).map((event) => (
                <EventCard key={event.id} event={event} onViewDetails={() => {}} />
              ))}
            </div>

            {events.length > VISIBLE_EVENTS && (
              <div className="mb-12 text-center">
                <p className="text-muted-foreground mb-3">
                  Showing {VISIBLE_EVENTS} of {formatCount(events.length, 'event')} in{" "}
                  {monthDisplayName}.
                </p>
                <Button asChild variant="outline">
                  <Link to="/events">Browse all events</Link>
                </Button>
              </div>
            )}

            {/* Monthly Navigation */}
            <Card className="mb-8">
              <CardContent className="pt-6">
                <div className="flex justify-between items-center">
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/events/${getPrevMonth()}`)}
                    className="flex items-center gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {format(new Date(targetDate.getFullYear(), targetDate.getMonth() - 1), "MMMM yyyy")}
                  </Button>
                  
                  <div className="text-center">
                    <div className="text-lg font-semibold">{monthDisplayName}</div>
                    <div className="text-sm text-muted-foreground">{formatCount(events.length, 'event')}</div>
                  </div>
                  
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/events/${getNextMonth()}`)}
                    className="flex items-center gap-2"
                  >
                    {format(new Date(targetDate.getFullYear(), targetDate.getMonth() + 1), "MMMM yyyy")}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="text-center py-12">
            <CardContent>
              <SpriteIcon name="calendar" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">
                No Events Found for {monthDisplayName}
              </h2>
              <p className="text-muted-foreground mb-4">
                {selectedCategory !== "all"
                  ? `No ${selectedCategory.toLowerCase()} events found for this month. Try viewing all categories.`
                  : "No events are currently scheduled for this month. Check back later or browse other months."}
              </p>
              <div className="flex justify-center gap-4">
                {selectedCategory !== "all" && (
                  <Button
                    variant="outline"
                    onClick={() => setSelectedCategory("all")}
                  >
                    Show All Categories
                  </Button>
                )}
                <Button onClick={() => navigate("/events")}>
                  Browse All Events
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* FAQ Section */}
        <FAQSection 
          faqs={faqData}
          title="Monthly Events Questions"
          description={`Common questions about ${monthDisplayName} events in Des Moines`}
        />
      </div>

      <Footer />
    </div>
  );
}