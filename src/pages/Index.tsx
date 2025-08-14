import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  MapPin,
  Camera,
  Gamepad2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEvents } from "@/hooks/useEvents";
import { useRestaurants } from "@/hooks/useRestaurants";
import { useAttractions } from "@/hooks/useAttractions";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import OptimizedImage from "@/components/OptimizedImage";
import InteractiveDateSelector from "@/components/InteractiveDateSelector";
import { CardsGridSkeleton } from "@/components/ui/loading-skeleton";
import SEOHead from "@/components/SEOHead";

export default function Index() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCity, setSelectedCity] = useState("all");
  const [dateFilter, setDateFilter] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState("events");

  const { events = [], isLoading: eventsLoading } = useEvents();
  const { restaurants = [], isLoading: restaurantsLoading } = useRestaurants();
  const { attractions = [], isLoading: attractionsLoading } = useAttractions();
  const { playgrounds = [], isLoading: playgroundsLoading } = usePlaygrounds();

  // Simple filtering without complex type checking for now
  const filteredEvents = (events || []).slice(0, 6);
  const filteredRestaurants = (restaurants || []).slice(0, 6);
  const filteredAttractions = (attractions || []).slice(0, 6);
  const filteredPlaygrounds = (playgrounds || []).slice(0, 6);

  const cities = [
    "all",
    "Des Moines",
    "West Des Moines",
    "Ankeny",
    "Urbandale",
    "Johnston",
  ];

  return (
    <>
      <SEOHead
        title="Des Moines Insider - Your AI-Powered Guide to Des Moines"
        description="Discover the best events, restaurants, attractions, and playgrounds in Des Moines with AI-enhanced recommendations and local insights."
        keywords={[
          "Des Moines events",
          "restaurants",
          "attractions",
          "playgrounds",
          "Iowa",
          "local guide",
        ]}
        canonicalUrl="https://desmoinesinsider.com"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Des Moines Insider",
          description:
            "Your AI-powered guide to discovering the best events, dining, and attractions in Des Moines",
          url: "https://desmoinesinsider.com",
        }}
      />

      <div className="min-h-screen bg-background">
        <Header />

        {/* Hero section with structured data */}
        <section className="relative bg-gradient-to-br from-primary/10 to-secondary/10 py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
              Discover Des Moines Like Never Before
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              Your AI-powered guide to the best events, restaurants,
              attractions, and family activities in Des Moines, Iowa. Real-time
              updates, personalized recommendations, and comprehensive local
              insights.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12 text-center">
              <div className="space-y-2">
                <div className="text-3xl font-bold text-primary">500+</div>
                <p className="text-sm text-muted-foreground">Events Monthly</p>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-primary">200+</div>
                <p className="text-sm text-muted-foreground">Restaurants</p>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-primary">50+</div>
                <p className="text-sm text-muted-foreground">Attractions</p>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-primary">100+</div>
                <p className="text-sm text-muted-foreground">Playgrounds</p>
              </div>
            </div>
          </div>
        </section>

        {/* Search Section */}
        <section className="py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white/95 backdrop-blur rounded-2xl p-6 shadow-2xl max-w-3xl mx-auto">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search events, restaurants, attractions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-12 text-lg border-0 bg-white/50 backdrop-blur focus:bg-white transition-all"
                  />
                </div>
                <Select value={selectedCity} onValueChange={setSelectedCity}>
                  <SelectTrigger className="w-full md:w-48 h-12 bg-white/50 backdrop-blur border-0">
                    <SelectValue placeholder="Select city" />
                  </SelectTrigger>
                  <SelectContent>
                    {cities.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city === "all" ? "All Cities" : city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <InteractiveDateSelector
                  onDateChange={(dates) => setDateFilter(dates.start || null)}
                  className="w-full md:w-auto"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Content Tabs */}
        <section className="py-16">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-4 mb-8 h-14">
                <TabsTrigger
                  value="events"
                  className="flex items-center gap-2 text-sm md:text-base"
                >
                  <Calendar className="h-4 w-4" />
                  <span className="hidden sm:inline">Events</span>
                </TabsTrigger>
                <TabsTrigger
                  value="restaurants"
                  className="flex items-center gap-2 text-sm md:text-base"
                >
                  <MapPin className="h-4 w-4" />
                  <span className="hidden sm:inline">Dining</span>
                </TabsTrigger>
                <TabsTrigger
                  value="attractions"
                  className="flex items-center gap-2 text-sm md:text-base"
                >
                  <Camera className="h-4 w-4" />
                  <span className="hidden sm:inline">Attractions</span>
                </TabsTrigger>
                <TabsTrigger
                  value="playgrounds"
                  className="flex items-center gap-2 text-sm md:text-base"
                >
                  <Gamepad2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Family</span>
                </TabsTrigger>
              </TabsList>

              {/* Events Tab */}
              <TabsContent value="events" className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold">Upcoming Events</h2>
                  <Link to="/events">
                    <Button
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      View All <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>

                {eventsLoading ? (
                  <CardsGridSkeleton count={6} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredEvents.map((event) => (
                      <Card
                        key={event.id}
                        className="group hover:shadow-lg transition-all duration-300 overflow-hidden"
                      >
                        <div className="relative h-48 overflow-hidden">
                          <OptimizedImage
                            src={event.image_url || "/placeholder.svg"}
                            alt={event.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            fetchpriority="high"
                          />
                          <div className="absolute top-2 right-2">
                            <Badge
                              variant="secondary"
                              className="bg-white/90 text-black"
                            >
                              {event.category}
                            </Badge>
                          </div>
                        </div>
                        <CardContent className="p-4">
                          <h3 className="font-semibold text-lg mb-2 line-clamp-2">
                            {event.title}
                          </h3>
                          <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                            {event.enhanced_description ||
                              event.original_description}
                          </p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center text-sm text-muted-foreground">
                              <MapPin className="h-4 w-4 mr-1" />
                              {event.city}
                            </div>
                            <Link to={`/events/${event.id}`}>
                              <Button size="sm">Learn More</Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Restaurants Tab */}
              <TabsContent value="restaurants" className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold">Featured Restaurants</h2>
                  <Link to="/restaurants">
                    <Button
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      View All <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>

                {restaurantsLoading ? (
                  <CardsGridSkeleton count={6} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredRestaurants.map((restaurant) => (
                      <Card
                        key={restaurant.id}
                        className="group hover:shadow-lg transition-all duration-300 overflow-hidden"
                      >
                        <div className="relative h-48 overflow-hidden">
                          <OptimizedImage
                            src={restaurant.image_url || "/placeholder.svg"}
                            alt={restaurant.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-2 right-2">
                            <Badge
                              variant="secondary"
                              className="bg-white/90 text-black"
                            >
                              {restaurant.cuisine}
                            </Badge>
                          </div>
                        </div>
                        <CardContent className="p-4">
                          <h3 className="font-semibold text-lg mb-2">
                            {restaurant.name}
                          </h3>
                          <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                            {restaurant.description}
                          </p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="flex items-center">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <span
                                    key={star}
                                    className={`text-sm ${
                                      star <= (restaurant.rating || 0)
                                        ? "text-yellow-400"
                                        : "text-gray-300"
                                    }`}
                                  >
                                    ★
                                  </span>
                                ))}
                              </div>
                              <span className="text-sm text-muted-foreground">
                                ({restaurant.rating || 0})
                              </span>
                            </div>
                            <Link to={`/restaurants/${restaurant.id}`}>
                              <Button size="sm">View Details</Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Attractions Tab */}
              <TabsContent value="attractions" className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold">Top Attractions</h2>
                  <Link to="/attractions">
                    <Button
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      View All <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>

                {attractionsLoading ? (
                  <CardsGridSkeleton count={6} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAttractions.map((attraction) => (
                      <Card
                        key={attraction.id}
                        className="group hover:shadow-lg transition-all duration-300 overflow-hidden"
                      >
                        <div className="relative h-48 overflow-hidden">
                          <OptimizedImage
                            src={attraction.image_url || "/placeholder.svg"}
                            alt={attraction.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-2 right-2">
                            <Badge
                              variant="secondary"
                              className="bg-white/90 text-black"
                            >
                              {attraction.type}
                            </Badge>
                          </div>
                        </div>
                        <CardContent className="p-4">
                          <h3 className="font-semibold text-lg mb-2">
                            {attraction.name}
                          </h3>
                          <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                            {attraction.description}
                          </p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center text-sm text-muted-foreground">
                              <MapPin className="h-4 w-4 mr-1" />
                              {attraction.location}
                            </div>
                            <Link to={`/attractions/${attraction.id}`}>
                              <Button size="sm">Explore</Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Playgrounds Tab */}
              <TabsContent value="playgrounds" className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold">Family Fun</h2>
                  <Link to="/playgrounds">
                    <Button
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      View All <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>

                {playgroundsLoading ? (
                  <CardsGridSkeleton count={6} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPlaygrounds.map((playground) => (
                      <Card
                        key={playground.id}
                        className="group hover:shadow-lg transition-all duration-300 overflow-hidden"
                      >
                        <div className="relative h-48 overflow-hidden">
                          <OptimizedImage
                            src={playground.image_url || "/placeholder.svg"}
                            alt={playground.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                        <CardContent className="p-4">
                          <h3 className="font-semibold text-lg mb-2">
                            {playground.name}
                          </h3>
                          <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                            {playground.description}
                          </p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center text-sm text-muted-foreground">
                              <MapPin className="h-4 w-4 mr-1" />
                              {playground.location}
                            </div>
                            <Link to={`/playgrounds/${playground.id}`}>
                              <Button size="sm">Visit</Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
