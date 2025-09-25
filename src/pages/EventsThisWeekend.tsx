import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EventCard from "@/components/EventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
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

export default function EventsThisWeekend() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedLocation, setSelectedLocation] = useState<string>("all");

  const { data: events, isLoading } = useQuery({
    queryKey: ["events-weekend"],
    queryFn: async () => {
      const now = new Date();
      const weekStart = startOfWeek(now);
      const weekEnd = endOfWeek(now);

      const { data, error } = await supabase
        .from("events")
        .select("*")
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .eq("status", "active")
        .order("date", { ascending: true })
        .order("time", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000, // Refetch every 10 minutes
  });

  const weekendEvents =
    events?.filter((event) => {
      try {
        const eventDate = parseISO(event.date);
        const now = new Date();
        const currentWeekend = {
          start: startOfWeek(now),
          end: endOfWeek(now),
        };

        return (
          isWeekend(eventDate) && isWithinInterval(eventDate, currentWeekend)
        );
      } catch {
        return false;
      }
    }) || [];

  // Filter events based on selected filters
  const filteredEvents = weekendEvents.filter((event) => {
    const categoryMatch =
      selectedCategory === "all" ||
      event.category?.toLowerCase().includes(selectedCategory.toLowerCase()) ||
      event.subcategory?.toLowerCase().includes(selectedCategory.toLowerCase());

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
  )} | Des Moines Insider`;
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
      answer: `We have ${weekendEvents.length} events happening this weekend in Des Moines and surrounding areas. See our complete list with dates, times, and maps on one page.`,
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
        canonicalUrl="https://desmoinesinsider.com/events/this-weekend"
        pageType="website"
        breadcrumbs={breadcrumbs}
        faqData={faqData}
        isTimeSensitive={true}
      />

      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">This Weekend in Des Moines</h1>
          </div>

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
                        e.subcategory?.toLowerCase().includes("family") ||
                        e.description?.toLowerCase().includes("kid")
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
                      {categories.slice(0, 6).map((category) => (
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
                      {locations.slice(0, 6).map((location) => (
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
                <EventCard key={event.id} event={event} />
              ))}
            </div>

            {/* Related Links */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>More Weekend Ideas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <a
                    href="/restaurants"
                    className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <h3 className="font-semibold mb-2">Weekend Dining</h3>
                    <p className="text-sm text-muted-foreground">
                      Best restaurants for weekend brunch, dinner, and late
                      night eats
                    </p>
                  </a>
                  <a
                    href="/attractions"
                    className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <h3 className="font-semibold mb-2">Places to Visit</h3>
                    <p className="text-sm text-muted-foreground">
                      Parks, museums, and attractions perfect for weekend
                      exploring
                    </p>
                  </a>
                  <a
                    href="/playgrounds"
                    className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <h3 className="font-semibold mb-2">Family Fun</h3>
                    <p className="text-sm text-muted-foreground">
                      Playgrounds and family activities for weekend adventures
                    </p>
                  </a>
                </div>
              </CardContent>
            </Card>

            {/* FAQ Section */}
            <Card>
              <CardHeader>
                <CardTitle>Frequently Asked Questions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {faqData.map((faq, index) => (
                  <div key={index} className="border-b pb-4 last:border-b-0">
                    <h3 className="font-semibold mb-2">{faq.question}</h3>
                    <p className="text-muted-foreground">{faq.answer}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
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
                <a href="/events" className="text-primary hover:underline">
                  Browse All Events
                </a>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <Footer />
    </div>
  );
}
