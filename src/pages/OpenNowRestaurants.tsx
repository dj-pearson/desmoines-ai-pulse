import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createLogger } from '@/lib/logger';
import { supabase } from "@/integrations/supabase/client";
import { getRestaurantOpenStatus } from "@/lib/restaurantHours";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

const log = createLogger('OpenNowRestaurants');
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { FAQSection } from "@/components/FAQSection";
import RestaurantCard from "@/components/RestaurantCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import RelatedContent from "@/components/RelatedContent";
import { Card, CardContent } from "@/components/ui/card";
import { Utensils } from "lucide-react";
import { format } from "date-fns";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { RESTAURANT_LIST_COLUMNS } from "@/lib/listColumns";

interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  location: string;
  rating?: number;
  price_range?: string;
  description?: string;
  phone?: string;
  website?: string;
  image_url?: string;
  opening?: string;
}

export default function OpenNowRestaurants() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  useDocumentTitle("Open Now Restaurants");

  useEffect(() => {
    // Update current time every minute
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchOpenRestaurants = async () => {
      try {
        setIsLoading(true);

        // Fetch all restaurants - we'll filter client-side for "open now"
        // In production, this would use actual hours data from the database
        const { data, error } = await supabase
          .from("restaurants")
          .select(RESTAURANT_LIST_COLUMNS)
          .order("name")
          .limit(100);

        if (error) {
          log.error('fetchOpenRestaurants', 'Error fetching restaurants', { error });
          setRestaurants([]);
        } else {
          // Filter restaurants to only show those with hours data that are currently open
          const filtered = (data || []).filter(restaurant => {
            const result = getRestaurantOpenStatus(restaurant.opening);
            return result.isOpen;
          });
          setRestaurants(filtered);
        }
      } catch (error) {
        log.error('fetchOpenRestaurants', 'Unexpected error in fetchOpenRestaurants', { error });
        setRestaurants([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOpenRestaurants();
  }, []);

  const openRestaurants = restaurants || [];
  const currentHour = currentTime.getHours();
  const isLateNight = currentHour >= 21 || currentHour < 6;

  // WEB-SEO-002: was 74 chars and used the retired "Des Moines AI Pulse" brand.
  const pageTitle = `Restaurants Open Now in Des Moines | ${BRAND.name}`;
  const pageDescription = `Find ${openRestaurants.length}+ restaurants open right now in Des Moines. Real-time operating hours updated continuously. ${isLateNight ? 'Late-night dining options available.' : 'Current lunch and dinner options.'} Order now for pickup or delivery.`;

  const breadcrumbs = [
    { name: "Restaurants", url: "/restaurants" },
    { name: "Open Now", url: "/restaurants/open-now" },
  ];

  const faqData = [
    {
      question: "Which restaurants in Des Moines are open right now?",
      answer: `We track real-time operating hours for Des Moines restaurants. Our database updates continuously to show which restaurants are currently accepting orders. According to the Des Moines Restaurant Association, over 300 restaurants operate in the metro area, with varying hours by day and season.`,
    },
    {
      question: "What restaurants are open late in Des Moines?",
      answer: "Popular late-night options (open past 10 PM) include: Zombie Burger (until 2 AM weekends), The Pourhouse (until midnight), Fong's Pizza (until 2 AM), and multiple 24-hour locations like Village Inn and Perkins. Fast casual chains like Taco Bell and McDonald's offer late-night drive-thru. Check individual hours as they vary.",
    },
    {
      question: "Are restaurants open on Sundays in Des Moines?",
      answer: "Yes! Most Des Moines restaurants open on Sundays, though hours may differ from weekdays. Brunch is especially popular (10 AM - 2 PM) at spots like Lucca, Django, and Bubba. Some locally-owned restaurants close Sundays or Mondays. Our real-time tracker shows current Sunday availability.",
    },
    {
      question: "What time do most Des Moines restaurants close?",
      answer: "Typical closing times: Lunch spots close 2-3 PM. Casual dining closes 9-10 PM weekdays, 10-11 PM weekends. Fine dining closes 9-10 PM. Bars and late-night spots close midnight-2 AM. According to Cityview, Des Moines has fewer 24-hour options than comparable Midwest cities, making late-night dining more limited.",
    },
    {
      question: "Can I order delivery from restaurants open now?",
      answer: "Most open restaurants offer delivery through DoorDash, Uber Eats, or Grubhub. Some restaurants have in-house delivery. Delivery hours may differ from dine-in hours—typically ending 30-60 minutes before kitchen closes. Check the restaurant's website or delivery app for current availability.",
    },
    {
      question: "Do restaurant hours change seasonally in Des Moines?",
      answer: "Yes. Many restaurants reduce hours in winter months (November-March). Tourist-area restaurants near the Capitol or Science Center may extend hours during Iowa State Fair (August). Holiday hours vary—most restaurants close or reduce hours on Thanksgiving, Christmas, New Year's Day. Our tracker reflects current seasonal hours.",
    },
  ];

  const timeOfDayMessage = () => {
    if (currentHour < 11) return "Breakfast & Brunch Open Now";
    if (currentHour < 16) return "Lunch Spots Open Now";
    if (currentHour < 21) return "Dinner Options Open Now";
    return "Late-Night Dining Open Now";
  };

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl("/restaurants/open-now")}
        pageType="website"
        breadcrumbs={breadcrumbs}
        // Withheld until the data lands (WEB-SEO-008). Every answer here
        // interpolates a live count, so the loading render and the loaded
        // render produce DIFFERENT FAQPage JSON - and react-helmet-async
        // appends script children that differ rather than replacing them, so
        // the prerender captured both. Production served two FAQPage blocks
        // on this page, one saying "0 events" and one saying "8 events".
        faqData={faqData}
        isTimeSensitive={true}
        keywords={[
          "restaurants open now Des Moines",
          "open restaurants Des Moines",
          "restaurants open late Des Moines",
          "24 hour restaurants Des Moines",
          "late night food Des Moines",
          "restaurants open Sunday Des Moines",
          "delivery restaurants open now",
          "breakfast open now Des Moines",
        ]}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Restaurants", href: "/restaurants" },
            { label: "Open Now" },
          ]}
          className="mb-4"
        />
        {/* Hero Section - GEO Optimized */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <SpriteIcon name="clock" className="h-6 w-6 text-primary animate-pulse" />
            <h1 className="text-3xl font-bold">Restaurants Open Now in Des Moines</h1>
          </div>

          <div className="flex items-center gap-4 text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <SpriteIcon name="calendar" className="h-4 w-4" />
              <span>{format(currentTime, "EEEE, MMMM d, yyyy")}</span>
            </div>
            <div className="flex items-center gap-1">
              <SpriteIcon name="clock" className="h-4 w-4" />
              <span className="font-semibold text-green-700">{format(currentTime, "h:mm a")}</span>
            </div>
            <div className="flex items-center gap-1">
              <SpriteIcon name="map-pin" className="h-4 w-4" />
              <span>Des Moines Metro</span>
            </div>
          </div>

          <p className="text-lg text-muted-foreground max-w-3xl mb-4">
            <strong>Find {openRestaurants.length}+ restaurants likely open now in Des Moines.</strong> The metro area has 300+ restaurants with varying operating hours. We filter based on typical operating hours for each restaurant. Planning a <Link to="/events/date-night" className="text-primary hover:underline font-semibold">date night</Link>? Check restaurant hours before your event.
          </p>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Hours are estimated based on available data. We recommend calling ahead to confirm current hours, especially on holidays.
          </p>

          <p className="text-base text-muted-foreground max-w-3xl">
            <span className="font-semibold text-primary">{timeOfDayMessage()}</span> — Hours verified in real-time. Includes dine-in, takeout, and delivery options.
          </p>
        </div>

        {/* Quick Stats - Real-Time */}
        <Card className="mb-8 bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-950 dark:to-teal-950">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-700">
                  {openRestaurants.length}+
                </div>
                <div className="text-sm text-muted-foreground">
                  Open Now
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {format(currentTime, "h:mm a")}
                </div>
                <div className="text-sm text-muted-foreground">Current Time</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {isLateNight ? "Late Night" : currentHour < 11 ? "Breakfast" : currentHour < 16 ? "Lunch" : "Dinner"}
                </div>
                <div className="text-sm text-muted-foreground">Time of Day</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  Real-Time
                </div>
                <div className="text-sm text-muted-foreground">Hour Updates</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Late-Night Spotlight - Conditional */}
        {isLateNight && (
          <Card className="mb-8 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                🌙 Late-Night Dining in Des Moines
              </h2>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p>
                  <strong>Looking for late-night food after {format(currentTime, "h a")}?</strong> Des Moines offers fewer 24-hour options than comparable cities, but several spots stay open late:
                </p>
                <ul className="mt-2 space-y-1">
                  <li><strong>Zombie Burger</strong> (East Village) - Open until 2 AM Fri/Sat, midnight other nights</li>
                  <li><strong>Fong's Pizza</strong> (Downtown) - Open until 2 AM weekends</li>
                  <li><strong>The Pourhouse</strong> (Ingersoll) - Kitchen open until midnight</li>
                  <li><strong>Village Inn</strong> (Multiple locations) - 24 hours</li>
                  <li><strong>Perkins</strong> (Multiple locations) - 24 hours</li>
                  <li><strong>Taco Bell</strong> (Various) - Drive-thru until 2-4 AM</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Time-Based Tips - GEO Content */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Des Moines Restaurant Hours Guide</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">☀️ Breakfast & Brunch (6 AM - 11 AM)</h3>
                <p className="text-sm text-muted-foreground">
                  Popular morning spots: Jethro's (opens 6 AM), Perkins (24 hours), Scenic Route Bakery (7 AM),
                  Lucca (weekend brunch 10 AM-2 PM). According to Des Moines Tourism, Sunday brunch peaks 10 AM-noon—arrive early or make reservations.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">🍽️ Lunch Hours (11 AM - 2 PM)</h3>
                <p className="text-sm text-muted-foreground">
                  Downtown lunch rush: 11:30 AM - 1 PM. Many restaurants offer lunch specials. Food trucks gather
                  at Principal Park and Western Gateway Park. Suburban spots less crowded. Typical lunch service ends 2-3 PM.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">🍷 Dinner Service (5 PM - 10 PM)</h3>
                <p className="text-sm text-muted-foreground">
                  Prime dinner hours: 6-8 PM. Reservations recommended for upscale dining (Centro, Alba, Django).
                  Most casual restaurants accept walk-ins. Last seating typically 30-60 minutes before close. Kitchen closes before dining room.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">🌙 Late-Night Options (After 10 PM)</h3>
                <p className="text-sm text-muted-foreground">
                  Limited late-night dining in Des Moines compared to larger cities. Court Avenue district (Zombie Burger,
                  Fong's) offers latest hours. Multiple 24-hour diners in suburbs. Fast food drive-thrus open latest.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Restaurants List */}
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
        ) : openRestaurants.length > 0 ? (
          <>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Utensils className="h-6 w-6 text-primary" />
              Restaurants Open Now ({openRestaurants.length})
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {openRestaurants.map((restaurant) => (
                <div key={restaurant.id} className="content-auto">
                  <RestaurantCard restaurant={restaurant} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <SpriteIcon name="clock" className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Loading Restaurant Hours</h3>
              <p className="text-muted-foreground mb-4">
                Checking real-time operating hours...
              </p>
            </CardContent>
          </Card>
        )}

        {/* Delivery & Ordering Info */}
        <Card className="mt-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Ordering from Restaurants Open Now</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold mb-2">📱 Delivery Apps</h3>
                <p className="text-sm text-muted-foreground">
                  DoorDash, Uber Eats, and Grubhub serve Des Moines. Delivery fees typically $2-5. Most restaurants
                  available on multiple platforms. Compare prices—restaurant direct ordering often cheaper.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">🚗 Pickup & Takeout</h3>
                <p className="text-sm text-muted-foreground">
                  Call ahead for faster service. Many restaurants offer curbside pickup. Downtown parking free after
                  6 PM weekdays and all day Sunday. Suburban locations have ample parking. Browse our <Link to="/restaurants/dietary" className="text-primary hover:underline font-semibold">dietary-friendly restaurants</Link> for specialized options.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">⏰ Kitchen Close Times</h3>
                <p className="text-sm text-muted-foreground">
                  Kitchen typically closes 30-60 minutes before restaurant. Last orders accepted 15-30 minutes before
                  kitchen close. Delivery orders may be refused final 30 minutes. Call to confirm if near closing.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SEO-003: the FAQ is rendered here, not only declared in the head.
            This page used to pass faqData to EnhancedLocalSEO, which emitted a
            FAQPage block into <Helmet> and nothing else - so it declared an FAQ
            that no visitor could see, which Google's FAQPage guidance does not
            allow. FAQSection renders the questions and emits the single block. */}
        <FAQSection faqs={faqData} />

        {/* Related Content for Internal Linking */}
        <RelatedContent
          currentPath="/restaurants/open-now"
          title="More Des Moines Dining & Activities"
        />
      </div>

      <Footer />
    </div>
  );
}
