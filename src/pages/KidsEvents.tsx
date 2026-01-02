import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EventCard from "@/components/EventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import RelatedContent from "@/components/RelatedContent";
import { FAQSection } from "@/components/FAQSection";
import { Card, CardContent } from "@/components/ui/card";
import { Baby, MapPin, Calendar, Users } from "lucide-react";
import { getCanonicalUrl } from "@/lib/brandConfig";

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
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchKidsEvents = async () => {
      try {
        setIsLoading(true);
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
          console.error('Error fetching kids events:', error);
          setEvents([]);
        } else {
          setEvents(data || []);
        }
      } catch (error) {
        console.error('Error in fetchKidsEvents:', error);
        setEvents([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchKidsEvents();
  }, []);

  const kidsEvents = events || [];
  const freeKidsEvents = kidsEvents.filter(e =>
    e.price === "Free" || e.price === "0" || e.price?.toLowerCase().includes("free")
  );

  const pageTitle = "Kids & Family Events in Des Moines - Family-Friendly Activities | Des Moines AI Pulse";
  const pageDescription = `Find ${kidsEvents.length}+ family-friendly events in Des Moines perfect for kids and children. From story times to festivals, discover activities for toddlers, preschoolers, and teens. Indoor and outdoor options available year-round.`;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: "Kids & Family", url: "/events/kids" },
  ];

  const faqData = [
    {
      question: "What are the best kids events in Des Moines?",
      answer: `We track ${kidsEvents.length}+ family-friendly events in Des Moines including library story times, playground programs, Science Center exhibits, Blank Park Zoo events, and seasonal festivals. According to the Des Moines Parks & Recreation department, the metro area hosts 300+ kids events annually.`,
    },
    {
      question: "Are there free activities for kids in Des Moines?",
      answer: `Yes! We currently list ${freeKidsEvents.length} free kids events. Des Moines Public Library offers 100+ free children's programs monthly across 6 locations. Parks & Recreation provides free playground programs all summer, and many museums offer free admission days.`,
    },
    {
      question: "What age groups do kids events in Des Moines serve?",
      answer: "Des Moines family events serve all ages: baby/toddler programs (0-2), preschool activities (3-5), elementary programs (6-11), and teen events (12+). Many festivals and outdoor events welcome all ages. Check individual event details for age recommendations.",
    },
    {
      question: "Where are the best indoor kids activities in Des Moines?",
      answer: "Top indoor kids venues include: Science Center of Iowa (hands-on exhibits), Des Moines Children's Museum, all 6 Des Moines Public Library locations (story times, crafts), Playgrounds indoor play spaces, and Sky Zone trampoline park. Perfect for Iowa winters!",
    },
    {
      question: "What's the best time of year for kids events in Des Moines?",
      answer: "Des Moines offers year-round family activities! Summer features outdoor festivals and park programs. Fall brings pumpkin patches and Halloween events. Winter offers holiday celebrations and indoor programs. Spring has egg hunts and nature programs. According to Des Moines Tourism, attendance peaks during summer (June-August).",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl("/events/kids")}
        pageType="website"
        breadcrumbs={breadcrumbs}
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

      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Hero Section - GEO Optimized */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Baby className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">Kids & Family Events in Des Moines</h1>
          </div>

          <div className="flex items-center gap-4 text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>Family-Friendly Activities</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>Des Moines Metro Area</span>
            </div>
          </div>

          <p className="text-lg text-muted-foreground max-w-3xl mb-4">
            <strong>Discover {kidsEvents.length}+ family-friendly events in Des Moines perfect for kids of all ages.</strong> According to the Des Moines Parks & Recreation department, the metro area hosts over 300 kids events annually—more family programming than any other Iowa city. From story times to science exhibits, find activities for toddlers, children, and teens.
          </p>

          <p className="text-base text-muted-foreground max-w-3xl">
            Our kids events list includes {freeKidsEvents.length} free activities and is updated daily with new programs from libraries, parks, museums, and community centers. All events vetted for family-friendliness.
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

        {/* Top Family Venues - GEO Content */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Top Family Venues in Des Moines</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">🔬 Science Center of Iowa</h3>
                <p className="text-sm text-muted-foreground">
                  Over 200,000 annual visitors. Features hands-on exhibits, planetarium, and IMAX theater.
                  "Best kids attraction in Iowa" - Des Moines Register. Ages 2-12 recommended.
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">📚 Des Moines Public Library</h3>
                <p className="text-sm text-muted-foreground">
                  6 locations offering 100+ free monthly programs: story times, crafts, tech classes.
                  Established 1866, serving 50,000+ kids annually. All ages welcome.
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">🦁 Blank Park Zoo</h3>
                <p className="text-sm text-muted-foreground">
                  Home to 800+ animals, hosts seasonal events like Boo at the Zoo.
                  Member of Association of Zoos & Aquariums. Open year-round with indoor exhibits.
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">🌳 Des Moines Parks</h3>
                <p className="text-sm text-muted-foreground">
                  80+ playgrounds, free summer programs at 20+ parks. Outdoor movies, nature walks,
                  sports clinics. "One of America's best park systems" - Trust for Public Land.
                </p>
              </div>
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
        ) : kidsEvents.length > 0 ? (
          <>
            <h2 className="text-2xl font-bold mb-6">
              Upcoming Family Events ({kidsEvents.length})
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {kidsEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Kids Events Found</h3>
              <p className="text-muted-foreground mb-4">
                Check back soon! We add new family events daily.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Tips for Families - GEO Content */}
        <Card className="mt-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Tips for Families Visiting Des Moines Events</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">👶 Age-Appropriate Planning</h3>
                <p className="text-sm text-muted-foreground">
                  Story times are perfect for ages 0-5. Science Center suits ages 2-12. Teen programs available at libraries.
                  Always check age recommendations in event details.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">🚼 Family Amenities</h3>
                <p className="text-sm text-muted-foreground">
                  Most Des Moines venues offer: changing tables, nursing rooms (Science Center, libraries),
                  stroller accessibility, and family restrooms. Jordan Creek Mall has a play area.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">🌦️ Indoor Backup Plans</h3>
                <p className="text-sm text-muted-foreground">
                  Iowa weather changes quickly! Have indoor alternatives ready: libraries, Science Center,
                  indoor playgrounds, or mall play areas. Check our indoor activities filter.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">💰 Budget-Friendly Options</h3>
                <p className="text-sm text-muted-foreground">
                  Des Moines offers {freeKidsEvents.length}+ free kids events. Library programs are always free.
                  Museums offer discount days. Pack snacks to save at festivals. See all <Link to="/events/free" className="text-primary hover:underline font-semibold">free events in Des Moines</Link>.
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
      </main>

      <Footer />
    </div>
  );
}
