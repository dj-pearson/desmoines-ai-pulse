import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EventCard from "@/components/EventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MapPin, Clock } from "lucide-react";
import { format, isToday, parseISO } from "date-fns";

export default function EventsToday() {
  const { data: events, isLoading } = useQuery({
    queryKey: ["events-today"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .gte("date", today)
        .lte("date", today)
        .eq("status", "active")
        .order("date", { ascending: true })
        .order("time", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // Refetch every 5 minutes for fresh data
  });

  const todaysEvents =
    events?.filter((event) => {
      try {
        return isToday(parseISO(event.date));
      } catch {
        return false;
      }
    }) || [];

  const pageTitle = `Des Moines Events Today - ${format(
    new Date(),
    "EEEE, MMMM d, yyyy"
  )} | Des Moines Insider`;
  const pageDescription = `See what's happening in Des Moines today, ${format(
    new Date(),
    "EEEE, MMMM d"
  )}. Fresh list of events with dates, times, locations, and quick tips. Updated hourly.`;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: "Today", url: "/events/today" },
  ];

  const faqData = [
    {
      question: "What events are happening in Des Moines today?",
      answer: `We have ${
        todaysEvents.length
      } events happening in Des Moines today, ${format(
        new Date(),
        "EEEE, MMMM d"
      )}. See times, locations, and get directions below.`,
    },
    {
      question: "Are these events free?",
      answer:
        "We list both free and paid events. Check each event for pricing details and ticket information.",
    },
    {
      question: "How often is this list updated?",
      answer:
        "This page is updated every hour to show the most current events happening today in Des Moines.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl="https://desmoinesinsider.com/events/today"
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
            <h1 className="text-3xl font-bold">Events Today in Des Moines</h1>
          </div>

          <div className="flex items-center gap-4 text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{format(new Date(), "EEEE, MMMM d, yyyy")}</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>Des Moines Metro Area</span>
            </div>
          </div>

          <p className="text-lg text-muted-foreground max-w-3xl">
            See what's happening right now in Des Moines. Fresh list updated
            hourly with times, locations, and quick tips.
          </p>
        </div>

        {/* Quick Stats */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {todaysEvents.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Events Today
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {
                    todaysEvents.filter(
                      (e) => e.price === "Free" || e.price === "0"
                    ).length
                  }
                </div>
                <div className="text-sm text-muted-foreground">Free Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {
                    new Set(todaysEvents.map((e) => e.location?.split(",")[0]))
                      .size
                  }
                </div>
                <div className="text-sm text-muted-foreground">Locations</div>
              </div>
            </div>
          </CardContent>
        </Card>

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
        ) : todaysEvents.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {todaysEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>

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
              <h2 className="text-xl font-semibold mb-2">No Events Today</h2>
              <p className="text-muted-foreground mb-4">
                No events are scheduled for today in Des Moines. Check back
                tomorrow or browse upcoming events.
              </p>
              <div className="flex justify-center gap-4">
                <a
                  href="/events/this-weekend"
                  className="text-primary hover:underline"
                >
                  This Weekend's Events
                </a>
                <a href="/events" className="text-primary hover:underline">
                  All Upcoming Events
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
