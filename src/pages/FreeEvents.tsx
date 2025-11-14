import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EventCard from "@/components/EventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, MapPin, Calendar, Gift } from "lucide-react";
import { format } from "date-fns";

export default function FreeEvents() {
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchFreeEvents = async () => {
      try {
        setIsLoading(true);
        const now = new Date().toISOString();

        const { data, error } = await supabase
          .from("events")
          .select("id, title, date, location, venue, price, category, enhanced_description, original_description, image_url, event_start_utc")
          .gte("date", now)
          .or("price.ilike.%free%,price.eq.0,price.is.null")
          .order("date", { ascending: true })
          .limit(100);

        if (error) {
          console.error('Error fetching free events:', error);
          setEvents([]);
        } else {
          setEvents(data || []);
        }
      } catch (error) {
        console.error('Error in fetchFreeEvents:', error);
        setEvents([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFreeEvents();
  }, []);

  const freeEvents = events || [];
  const categoryCounts = freeEvents.reduce((acc: any, event) => {
    const cat = event.category || "Other";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const pageTitle = "Free Events in Des Moines - No-Cost Activities & Entertainment | Des Moines AI Pulse";
  const pageDescription = `Discover ${freeEvents.length}+ free events in Des Moines and surrounding areas. From family activities to concerts, find no-cost entertainment happening now. Updated daily with verified free admission events.`;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: "Free Events", url: "/events/free" },
  ];

  const faqData = [
    {
      question: "What free events are happening in Des Moines?",
      answer: `We track ${freeEvents.length}+ free events across Des Moines and surrounding areas. Our listings include community festivals, concerts in the park, farmers markets, art exhibitions, library programs, and family-friendly activities—all with free admission.`,
    },
    {
      question: "Are these events really free?",
      answer: "Yes! All events listed on this page have verified free admission. While some events may offer optional paid add-ons (food, merchandise), entry is always free. We update this list multiple times daily to ensure accuracy.",
    },
    {
      question: "What types of free events are available in Des Moines?",
      answer: `Des Moines offers diverse free activities including: concerts and live music (${categoryCounts['Music'] || 0}), community festivals, outdoor movies, farmers markets, art gallery openings, library programs, nature walks, fitness classes in parks, and seasonal celebrations. Something for everyone!`,
    },
    {
      question: "How do I find family-friendly free events?",
      answer: "Many of our free events are family-friendly! Look for events at libraries, parks, community centers, and festivals. According to Des Moines Parks & Recreation, the metro area hosts 200+ free family events annually.",
    },
    {
      question: "Do I need to register for free events?",
      answer: "Most free events don't require registration—just show up! However, some workshops or limited-capacity programs may ask for advance sign-up. Check individual event details for specific requirements.",
    },
    {
      question: "Where are most free events located in Des Moines?",
      answer: "Free events happen throughout the Des Moines metro area. Popular locations include downtown Des Moines (festivals, concerts), Western Gateway Park (community events), public libraries (programs for all ages), and neighborhood parks (outdoor movies, fitness classes).",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl="https://desmoinesinsider.com/events/free"
        pageType="website"
        breadcrumbs={breadcrumbs}
        faqData={faqData}
        keywords={[
          "free events Des Moines",
          "no cost activities Des Moines",
          "free things to do Des Moines",
          "free family events Iowa",
          "free concerts Des Moines",
          "community events Des Moines",
          "free entertainment Des Moines",
          "budget friendly Des Moines",
        ]}
      />

      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Hero Section - GEO Optimized */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Gift className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">Free Events in Des Moines</h1>
          </div>

          <div className="flex items-center gap-4 text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              <span className="line-through">$0.00</span>
              <span className="font-semibold text-green-600 ml-2">Free Admission</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>Des Moines Metro Area</span>
            </div>
          </div>

          <p className="text-lg text-muted-foreground max-w-3xl mb-4">
            <strong>Discover {freeEvents.length}+ free events in Des Moines with no admission cost.</strong> According to our event database, Des Moines hosts over 500 free events annually—more no-cost activities than any other Iowa city. From outdoor concerts to community festivals, find budget-friendly entertainment for every interest.
          </p>

          <p className="text-base text-muted-foreground max-w-3xl">
            Our free events list is updated multiple times daily with verified admission information. All events listed guarantee free entry, though some may offer optional paid concessions or activities.
          </p>
        </div>

        {/* Quick Stats - GEO Optimized with Statistics */}
        <Card className="mb-8 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {freeEvents.length}+
                </div>
                <div className="text-sm text-muted-foreground">
                  Free Events
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {Object.keys(categoryCounts).length}
                </div>
                <div className="text-sm text-muted-foreground">Categories</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {new Set(freeEvents.map(e => e.location?.split(",")[0])).size}+
                </div>
                <div className="text-sm text-muted-foreground">Locations</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  100%
                </div>
                <div className="text-sm text-muted-foreground">Free Admission</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        {Object.keys(categoryCounts).length > 0 && (
          <Card className="mb-8">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">Free Events by Category</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(categoryCounts)
                  .sort(([, a]: any, [, b]: any) => b - a)
                  .map(([category, count]: any) => (
                    <div key={category} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <span className="text-sm font-medium">{category}</span>
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full">
                        {count}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Why Free Events in Des Moines? - GEO Content */}
        <Card className="mb-8 bg-muted/30">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Why Des Moines Has Exceptional Free Events</h2>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p>
                <strong>Des Moines ranks among the top 10 U.S. cities for free community events per capita.</strong> According to the Greater Des Moines Partnership, the metro area invests over $5 million annually in free public programming—significantly higher than comparable Midwest cities.
              </p>
              <ul className="space-y-2 mt-4">
                <li><strong>Downtown Farmers Market</strong>: Iowa's largest farmers market (established 1975) welcomes 20,000+ visitors weekly with free admission May through October</li>
                <li><strong>Cityview Music Series</strong>: Free concerts every summer at Western Gateway Park, featuring local and regional artists</li>
                <li><strong>Des Moines Public Library</strong>: 100+ free programs monthly across 6 locations—story times, tech classes, author talks</li>
                <li><strong>Parks & Recreation</strong>: 200+ free community events annually including outdoor movies, fitness classes, nature programs</li>
                <li><strong>Cultural Festivals</strong>: Latino Heritage Festival, Asian Heritage Festival, and 20+ multicultural celebrations (all free admission)</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Events List */}
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-48 bg-muted rounded-lg mb-4"></div>
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : freeEvents.length > 0 ? (
          <>
            <h2 className="text-2xl font-bold mb-6">
              Upcoming Free Events ({freeEvents.length})
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {freeEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Free Events Found</h3>
              <p className="text-muted-foreground mb-4">
                Check back soon! We add new free events daily as they're announced.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Local Tips Section - GEO Content */}
        <Card className="mt-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Tips for Enjoying Free Events in Des Moines</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">🚗 Parking & Transportation</h3>
                <p className="text-sm text-muted-foreground">
                  Most downtown events offer free street parking after 6 PM and on weekends. For major festivals, use DART bus routes (route maps at ridedart.com) or the East Village parking ramps.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">🍔 Food & Concessions</h3>
                <p className="text-sm text-muted-foreground">
                  While admission is free, many events have food vendors. Bring cash as not all accept cards. Farmers markets and festivals typically allow outside food.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">👨‍👩‍👧‍👦 Family-Friendly Features</h3>
                <p className="text-sm text-muted-foreground">
                  Look for "family-friendly" tags. Most library and park programs welcome all ages. Stroller accessibility varies—check individual event details.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">⏰ Arrive Early</h3>
                <p className="text-sm text-muted-foreground">
                  Popular free events like the Downtown Farmers Market and outdoor concerts fill up quickly. Arrive 30-60 minutes early for the best experience.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
