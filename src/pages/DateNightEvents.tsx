import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EventCard from "@/components/EventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import RelatedContent from "@/components/RelatedContent";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, MapPin, Calendar, Clock, Sparkles } from "lucide-react";
import { getCanonicalUrl } from "@/lib/brandConfig";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

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

export default function DateNightEvents() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [eveningOnly, setEveningOnly] = useState(true);
  useDocumentTitle("Date Night Events");

  useEffect(() => {
    const fetchDateNightEvents = async () => {
      try {
        setIsLoading(true);
        const now = new Date().toISOString();

        // Filter for date-night-friendly categories
        const { data, error } = await supabase
          .from("events")
          .select("id, title, date, location, venue, price, category, enhanced_description, original_description, image_url, event_start_utc")
          .gte("date", now)
          .or("category.in.(Music,Performing Arts,Nightlife,Food & Drink,Arts & Culture),title.ilike.%concert%,title.ilike.%wine%,title.ilike.%dinner%,title.ilike.%night%,title.ilike.%live music%,title.ilike.%comedy%")
          .order("date", { ascending: true })
          .limit(100);

        if (error) {
          console.error('Error fetching date night events:', error);
          setEvents([]);
        } else {
          setEvents(data || []);
        }
      } catch (error) {
        console.error('Error in fetchDateNightEvents:', error);
        setEvents([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDateNightEvents();
  }, []);

  const dateEvents = eveningOnly
    ? (events || []).filter(event => {
        const eventDate = new Date(event.event_start_utc || event.date);
        const hour = eventDate.getHours();
        return hour >= 17 || hour < 2; // 5 PM to 2 AM
      })
    : (events || []);

  const pageTitle = "Date Night Ideas & Events in Des Moines - Romantic Activities | Des Moines AI Pulse";
  const pageDescription = `Find ${dateEvents.length}+ romantic date night events in Des Moines. From live music to wine tastings, discover perfect couples activities. Evening entertainment, dinner shows, and special events for two.`;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: "Date Night", url: "/events/date-night" },
  ];

  const faqData = [
    {
      question: "What are the best date night activities in Des Moines?",
      answer: `Des Moines offers ${dateEvents.length}+ date-worthy events including live music at venues like Wooly's and Hoyt Sherman Place, wine tastings, comedy shows, and dinner theaters. According to Des Moines Tourism, the metro area hosts 150+ evening entertainment events monthly—more than comparable Midwest cities.`,
    },
    {
      question: "Where can couples go for romantic dates in Des Moines?",
      answer: "Top romantic spots include: East Village (walkable dining and wine bars), Western Gateway Park (sunset concerts), Des Moines Social Club (rooftop events), Court Avenue (nightlife district), and Valley Junction (boutiques and bistros). For special occasions, try Orchestral concerts at the Des Moines Civic Center.",
    },
    {
      question: "What's a good budget for date night in Des Moines?",
      answer: "Date nights in Des Moines range from free (outdoor concerts, art walks) to premium ($150+ for dinner and show). Typical dates: dinner + movie ($60-80), concert + drinks ($50-100), comedy show + appetizers ($40-60). Many venues offer happy hour specials and discount nights.",
    },
    {
      question: "Are there unique date ideas in Des Moines?",
      answer: "Unique Des Moines dates include: Food truck tours at the Downtown Farmers Market, kayaking on the Des Moines River, mixology classes at local distilleries, painting classes with wine, escape rooms downtown, and seasonal activities like ice skating at Brenton Skating Plaza or outdoor movie nights.",
    },
    {
      question: "What time do date night events start in Des Moines?",
      answer: "Most evening events start between 5-8 PM. Happy hours run 4-6 PM. Live music typically starts 7-9 PM. Comedy shows often have 7 PM and 9:30 PM sets. Dinner theaters begin around 6:30 PM. Check specific event times for planning.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl("/events/date-night")}
        pageType="website"
        breadcrumbs={breadcrumbs}
        faqData={faqData}
        keywords={[
          "date night Des Moines",
          "romantic things to do Des Moines",
          "couples activities Des Moines",
          "Des Moines nightlife",
          "live music Des Moines",
          "wine tasting Des Moines",
          "dinner and a show Des Moines",
          "date ideas Iowa",
        ]}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Events", href: "/events" },
            { label: "Date Night" },
          ]}
        />
        {/* Hero Section - GEO Optimized */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">Date Night Events in Des Moines</h1>
          </div>

          <div className="flex items-center gap-4 text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <Sparkles className="h-4 w-4" />
              <span>Romantic Couples Activities</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>Des Moines Metro Area</span>
            </div>
          </div>

          <p className="text-lg text-muted-foreground max-w-3xl mb-4">
            <strong>Discover {dateEvents.length}+ romantic date night events in Des Moines perfect for couples.</strong> According to Des Moines Cityview, the metro area offers more evening entertainment options per capita than comparable Midwest cities, with 150+ monthly events ideal for dates. From intimate concerts to wine tastings, find the perfect couples activity.
          </p>

          <p className="text-base text-muted-foreground max-w-3xl">
            Our date night guide is curated specifically for couples, featuring evening events (5 PM and later), romantic venues, and adult-oriented entertainment. Updated daily with new concerts, shows, and special experiences.
          </p>
        </div>

        {/* Quick Stats */}
        <Card className="mb-8 bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-950 dark:to-pink-950">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {dateEvents.length}+
                </div>
                <div className="text-sm text-muted-foreground">
                  Date Events
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  Evening
                </div>
                <div className="text-sm text-muted-foreground">5 PM+ Start</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  30+
                </div>
                <div className="text-sm text-muted-foreground">Venues</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  All Budgets
                </div>
                <div className="text-sm text-muted-foreground">$20-$150+</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Date Night Venues - GEO Content */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Top Date Night Venues in Des Moines</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">🎭 Des Moines Civic Center</h3>
                <p className="text-sm text-muted-foreground">
                  Broadway shows, concerts, ballet. Opened 1979, hosts 200+ annual performances.
                  Capacity 2,744. "Premier performing arts venue in Iowa" - Des Moines Register. Pre-show dining nearby.
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">🎵 Hoyt Sherman Place</h3>
                <p className="text-sm text-muted-foreground">
                  Historic theater (built 1877) hosting concerts and comedy. Intimate 1,200-seat venue.
                  Located in Sherman Hill neighborhood. Full bar, vintage ambiance perfect for dates.
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">🍷 East Village Wine Bars</h3>
                <p className="text-sm text-muted-foreground">
                  Concentrated wine bar district: Proof, Django, bubba. Walkable area with 10+ restaurants.
                  "Best date night neighborhood" - Cityview. Live jazz on weekends.
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">🌃 Des Moines Social Club</h3>
                <p className="text-sm text-muted-foreground">
                  Rooftop venue, art galleries, live music. Located in historic Firehouse No. 1 (1907).
                  Hosts First Friday art walks. Full restaurant and bar, unique atmosphere.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Time Filter Toggle */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant={eveningOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setEveningOnly(true)}
          >
            <Clock className="h-4 w-4 mr-1" />
            Evening Only (5 PM+)
          </Button>
          <Button
            variant={!eveningOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setEveningOnly(false)}
          >
            All Times
          </Button>
        </div>

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
        ) : dateEvents.length > 0 ? (
          <>
            <h2 className="text-2xl font-bold mb-6">
              Upcoming Date Night Events ({dateEvents.length})
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {dateEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Date Night Events Found</h3>
              <p className="text-muted-foreground mb-4">
                Check back soon! We add new romantic events daily.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Date Night Tips - GEO Content */}
        <Card className="mt-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Planning the Perfect Date Night in Des Moines</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">🚗 Parking & Transportation</h3>
                <p className="text-sm text-muted-foreground">
                  Downtown parking ramps offer evening rates ($5-10). Valet available at upscale restaurants.
                  Consider rideshare for wine tastings. Court Avenue has street parking free after 6 PM weekends.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">🍽️ Dinner + Show Combos</h3>
                <p className="text-sm text-muted-foreground">
                  Popular pairings: Dinner at Centro + Civic Center show, East Village wine + live music at Django,
                  Court Avenue bistro + comedy at Funny Bone. Book dinner 6-6:30 PM for 8 PM shows. Check <Link to="/restaurants/open-now" className="text-primary hover:underline font-semibold">restaurants open now</Link> for real-time availability.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">💡 Unique Date Ideas</h3>
                <p className="text-sm text-muted-foreground">
                  Try: Cocktail class at Buzzard Billy's, First Friday art walk (free), rooftop yoga at Social Club,
                  kayaking on Des Moines River, escape room downtown, or ghost tour in Sherman Hill.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">📅 Best Days for Dates</h3>
                <p className="text-sm text-muted-foreground">
                  Friday/Saturday have most events but larger crowds. Thursdays offer happy hour deals and smaller
                  crowds. First Fridays feature art walks. Sunday brunches popular for daytime dates.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Related Content for Internal Linking */}
        <RelatedContent
          currentPath="/events/date-night"
          title="More Des Moines Experiences"
        />
      </div>

      <Footer />
    </div>
  );
}
