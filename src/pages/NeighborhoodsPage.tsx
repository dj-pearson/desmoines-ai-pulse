import { Link } from "react-router-dom";
import { MapPin, Users, Calendar, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LocalSEO from "@/components/LocalSEO";

export default function NeighborhoodsPage() {
  
  const neighborhoods = [
    {
      name: "East Village",
      slug: "east-village",
      description: "Hip downtown district with trendy restaurants, craft breweries, and nightlife",
      highlights: ["Court Avenue District", "Farmers Market", "Local breweries"],
      eventCount: 45,
      restaurantCount: 28,
      attractionCount: 12,
      image: "/neighborhood-east-village.jpg"
    },
    {
      name: "West Des Moines", 
      slug: "west-des-moines",
      description: "Premier shopping and dining destination with family-friendly attractions",
      highlights: ["Jordan Creek Town Center", "Valley Junction", "Raccoon River Park"],
      eventCount: 32,
      restaurantCount: 41,
      attractionCount: 15,
      image: "/neighborhood-west-des-moines.jpg"
    },
    {
      name: "Ankeny",
      slug: "ankeny", 
      description: "Fast-growing community with excellent family activities and events",
      highlights: ["Ankeny Market & Pavilion", "High Trestle Trail", "Prairie Trail"],
      eventCount: 28,
      restaurantCount: 22,
      attractionCount: 18,
      image: "/neighborhood-ankeny.jpg"
    },
    {
      name: "Urbandale",
      slug: "urbandale",
      description: "Suburban community known for parks, trails, and family events",
      highlights: ["Living History Farms", "Walker Johnston Park", "Community Center"],
      eventCount: 15,
      restaurantCount: 18,
      attractionCount: 10,
      image: "/neighborhood-urbandale.jpg"
    },
    {
      name: "Johnston", 
      slug: "johnston",
      description: "Growing suburb with excellent recreational facilities and community events",
      highlights: ["Terra Park", "Johnston Commons", "Saylorville Lake access"],
      eventCount: 12,
      restaurantCount: 14,
      attractionCount: 8,
      image: "/neighborhood-johnston.jpg"
    },
    {
      name: "Clive",
      slug: "clive",
      description: "Family-friendly community with top-rated parks and recreational facilities", 
      highlights: ["Clive Aquatic Center", "Campbell Recreation Area", "Greenbelt Trail"],
      eventCount: 18,
      restaurantCount: 16,
      attractionCount: 12,
      image: "/neighborhood-clive.jpg"
    },
    {
      name: "Waukee",
      slug: "waukee",
      description: "Rapidly growing community with new restaurants and family attractions",
      highlights: ["Waukee Family YMCA", "Centennial Park", "Sugar Creek Golf Course"],
      eventCount: 20,
      restaurantCount: 19,
      attractionCount: 11,
      image: "/neighborhood-waukee.jpg"
    },
    {
      name: "Altoona",
      slug: "altoona", 
      description: "Home to major entertainment venues and family attractions",
      highlights: ["Adventureland Park", "Prairie Meadows", "Bass Pro Shops"],
      eventCount: 25,
      restaurantCount: 12,
      attractionCount: 8,
      image: "/neighborhood-altoona.jpg"
    }
  ];

  const totalEvents = neighborhoods.reduce((sum, n) => sum + n.eventCount, 0);
  const totalRestaurants = neighborhoods.reduce((sum, n) => sum + n.restaurantCount, 0);
  const totalAttractions = neighborhoods.reduce((sum, n) => sum + n.attractionCount, 0);

  return (
    <div className="min-h-screen bg-background">
      <LocalSEO 
        pageTitle="Des Moines Neighborhoods Guide - Local Events & Dining"
        pageDescription="Explore Des Moines neighborhoods including East Village, West Des Moines, Ankeny, and more. Find local events, restaurants, and attractions in each Des Moines area community."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Neighborhoods", url: "/neighborhoods" }
        ]}
      />
      
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-8 rounded-lg mb-8">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Des Moines Neighborhoods</h1>
          </div>
          <p className="text-xl text-blue-100 mb-4">
            Explore the unique character of each Des Moines area community with local events, 
            dining, and attractions tailored to every neighborhood.
          </p>
          
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{totalEvents}</div>
              <div className="text-blue-200 text-sm">Total Events</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{totalRestaurants}</div>
              <div className="text-blue-200 text-sm">Local Restaurants</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{totalAttractions}</div>
              <div className="text-blue-200 text-sm">Attractions</div>
            </div>
          </div>
        </div>

        {/* Neighborhoods Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {neighborhoods.map((neighborhood) => (
            <Card key={neighborhood.slug} className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-xl">{neighborhood.name}</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {neighborhood.eventCount} events
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {neighborhood.description}
                </p>
                
                {/* Highlights */}
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Local Highlights:</h4>
                  <div className="flex flex-wrap gap-1">
                    {neighborhood.highlights.map((highlight, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {highlight}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <Calendar className="h-4 w-4 mx-auto mb-1 text-blue-600" />
                    <div className="font-medium">{neighborhood.eventCount}</div>
                    <div className="text-muted-foreground">Events</div>
                  </div>
                  <div>
                    <Users className="h-4 w-4 mx-auto mb-1 text-green-600" />
                    <div className="font-medium">{neighborhood.restaurantCount}</div>
                    <div className="text-muted-foreground">Dining</div>
                  </div>
                  <div>
                    <Star className="h-4 w-4 mx-auto mb-1 text-yellow-600" />
                    <div className="font-medium">{neighborhood.attractionCount}</div>
                    <div className="text-muted-foreground">Attractions</div>
                  </div>
                </div>

                {/* Action Button */}
                <Link to={`/neighborhoods/${neighborhood.slug}`}>
                  <Button className="w-full" size="sm">
                    Explore {neighborhood.name}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Local SEO Content */}
        <Card className="mt-12 bg-muted/30">
          <CardContent className="p-8">
            <h2 className="text-2xl font-semibold mb-6">
              Your Guide to Des Moines Area Communities
            </h2>
            <div className="prose prose-sm max-w-none text-muted-foreground space-y-4">
              <p>
                <strong>Des Moines</strong> and its surrounding communities offer distinct personalities and attractions. 
                From the vibrant <strong>East Village</strong> with its craft breweries and farmers market to the family-friendly 
                suburbs of <strong>Ankeny</strong> and <strong>West Des Moines</strong>, each neighborhood provides unique 
                local experiences.
              </p>
              <p>
                <strong>West Des Moines</strong> features premier shopping at Jordan Creek Town Center and historic charm 
                in Valley Junction. <strong>Ankeny</strong> offers excellent family amenities and the scenic High Trestle Trail. 
                <strong>Urbandale</strong> is home to Living History Farms, while <strong>Altoona</strong> provides major 
                entertainment at Adventureland and Prairie Meadows.
              </p>
              <p>
                Each Des Moines area community maintains its own calendar of events, local restaurants, and attractions. 
                Whether you're seeking urban amenities downtown or suburban family activities, the greater Des Moines 
                metropolitan area offers something for every lifestyle and interest.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
      
      <Footer />
    </div>
  );
}
