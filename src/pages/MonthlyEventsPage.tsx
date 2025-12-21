import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EventCard from "@/components/EventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { FAQSection } from "@/components/FAQSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { format, startOfMonth, endOfMonth, parseISO, isValid } from "date-fns";
import { useState, useEffect } from "react";

export default function MonthlyEventsPage() {
  const { monthYear } = useParams<{ monthYear: string }>();
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
  
  const { data: events, isLoading } = useQuery({
    queryKey: ["monthly-events", monthYear, selectedCategory],
    queryFn: async () => {
      let query = supabase
        .from("events")
        .select("*")
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"))
        .order("date", { ascending: true })
        .order("time", { ascending: true });

      if (selectedCategory !== "all") {
        query = query.eq("category", selectedCategory);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: isValidDate, // Only run query if date is valid
  });

  const { data: categories } = useQuery({
    queryKey: ["monthly-event-categories", monthYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("category")
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));

      if (error) throw error;
      const uniqueCategories = [
        ...new Set(data.map((event) => event.category)),
      ].filter(Boolean);
      return uniqueCategories.sort();
    },
    enabled: isValidDate, // Only run query if date is valid
  });
  
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
      answer: `We have ${events?.length || 0} events scheduled for ${monthDisplayName} in Des Moines and surrounding areas. Browse our complete calendar with dates, times, locations, and ticket information.`,
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
        canonicalUrl={`https://desmoinesinsider.com/events/${monthYear}`}
        pageType="website"
        breadcrumbs={breadcrumbs}
        faqData={faqData}
        isTimeSensitive={true}
      />

      <Header />

      <main className="container mx-auto px-4 py-8">
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
                <Calendar className="h-6 w-6 text-primary" />
                <h1 className="text-3xl font-bold">{monthDisplayName} Events</h1>
              </div>
              <div className="flex items-center gap-4 text-muted-foreground">
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  <span>Des Moines Metro Area</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {events.map((event) => (
                <EventCard key={event.id} event={event} onViewDetails={() => {}} />
              ))}
            </div>

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
                    <div className="text-sm text-muted-foreground">{events.length} events</div>
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
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
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
      </main>

      <Footer />
    </div>
  );
}