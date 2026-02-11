import { Link } from "react-router-dom";
import { MapPin, Users, Calendar, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LocalSEO from "@/components/LocalSEO";
import { FAQSection } from "@/components/FAQSection";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function NeighborhoodsPage() {
  useDocumentTitle("Neighborhoods");

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
      
      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Neighborhoods" },
          ]}
        />

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
      </div>

      {/* FAQ Section for SEO and Featured Snippets */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <FAQSection
            title="Des Moines Neighborhoods - Frequently Asked Questions"
            description="Common questions about neighborhoods, communities, and areas in Des Moines, Iowa."
            faqs={[
              {
                question: "What are the best neighborhoods in Des Moines?",
                answer: "Des Moines features diverse neighborhoods each with unique character. Downtown and East Village offer urban living with trendy restaurants, nightlife, and cultural attractions. Sherman Hill showcases Victorian architecture and historic charm. West Des Moines provides premier shopping at Jordan Creek and the artsy Valley Junction district. Ankeny offers excellent schools and family amenities with the scenic High Trestle Trail. Beaverdale is known for its tight-knit community and local businesses. Urbandale features Living History Farms and extensive parks. The best neighborhood depends on your lifestyle preferences - urban vs. suburban, nightlife vs. family activities."
              },
              {
                question: "What is the East Village neighborhood like in Des Moines?",
                answer: "East Village is Des Moines' trendiest neighborhood located just east of downtown. This hip district features over 28 restaurants including farm-to-table dining and craft breweries, boutique shopping with local designers and vintage stores, vibrant nightlife with bars and live music venues, the Downtown Farmers Market (Iowa's largest), art galleries and creative spaces, and walkable streets with historic architecture. East Village attracts young professionals and creatives with its urban energy while maintaining Des Moines charm. The Court Avenue District within East Village is the epicenter of nightlife and entertainment."
              },
              {
                question: "Is West Des Moines a good place to live?",
                answer: "West Des Moines consistently ranks as one of Iowa's best places to live. Benefits include excellent schools (West Des Moines Community School District), premier shopping at Jordan Creek Town Center (Iowa's largest mall), diverse dining with 41+ restaurants from casual to upscale, Valley Junction's historic district with unique shops and antiques, extensive parks and trails including Raccoon River Park, family-friendly atmosphere with abundant activities, strong job market and economic growth, and safe neighborhoods with low crime rates. West Des Moines offers suburban comfort while being just minutes from downtown Des Moines amenities."
              },
              {
                question: "What makes Ankeny a popular Des Moines suburb?",
                answer: "Ankeny is one of Iowa's fastest-growing cities due to highly-rated schools (Ankeny Community School District), family-friendly environment with numerous parks and playgrounds, Ankeny Market & Pavilion for community events, High Trestle Trail (13.5-mile scenic trail with famous bridge), Prairie Trail neighborhood with modern amenities, strong business community and job opportunities, diverse dining options with 22+ restaurants, convenient location between Des Moines and Ames, and active community calendar with 28+ monthly events. Ankeny appeals particularly to families seeking excellent schools and suburban amenities with easy downtown access."
              },
              {
                question: "Where should I live in Des Moines for nightlife and entertainment?",
                answer: "For nightlife and entertainment, focus on Downtown Des Moines and East Village. The Court Avenue District in East Village is the nightlife hub with numerous bars, clubs, and late-night venues. East Village offers craft breweries like Exile Brewing Company, cocktail bars, live music venues including Wooly's and Gas Lamp, and trendy restaurants with evening scenes. Downtown features entertainment at Iowa Events Center, upscale hotel bars and restaurants, Wells Fargo Arena for concerts and sports, and Cowles Commons for outdoor events. These walkable urban neighborhoods provide the most concentrated nightlife and entertainment options in the metro area."
              },
              {
                question: "Which Des Moines neighborhoods are best for families?",
                answer: "Top family-friendly Des Moines neighborhoods include West Des Moines (excellent schools, Jordan Creek shopping, family restaurants, parks), Ankeny (highly-rated schools, modern neighborhoods, family activities, trails), Urbandale (Living History Farms, extensive park system, community center, safe neighborhoods), Beaverdale (tight-knit community, local schools, family events, affordable housing), and Clive (good schools, family amenities, Greenbelt Trail, low crime). These suburbs offer excellent public schools, abundant parks and playgrounds, family-oriented events, safe environments, and strong community connections while maintaining proximity to downtown Des Moines."
              },
              {
                question: "What is unique about Valley Junction in West Des Moines?",
                answer: "Valley Junction is West Des Moines' historic downtown district known for antique shopping with 30+ antique stores and vintage shops, unique local boutiques and galleries, farm-to-table restaurants and cafes, historic architecture dating to the 1890s, annual events including Valley Junction Market Days and Oktoberfest, walkable streets perfect for strolling, local artists and craftspeople, and small-town charm within a suburban setting. Valley Junction attracts visitors seeking unique shopping experiences, one-of-a-kind finds, and authentic local culture. The district hosts community events year-round making it a cultural hub for West Des Moines."
              },
              {
                question: "How do Des Moines neighborhoods differ from each other?",
                answer: "Des Moines neighborhoods vary significantly in character and offerings. Urban neighborhoods (Downtown, East Village, Sherman Hill) feature walkable streets, historic architecture, nightlife, apartments and condos, and cultural attractions. Suburban communities (West Des Moines, Ankeny, Urbandale) offer single-family homes, excellent schools, shopping centers, family activities, and newer developments. Each has distinct demographics - East Village attracts young professionals, Ankeny draws families, Beaverdale has longtime residents, and West Des Moines appeals to diverse ages. Price points, housing types, school districts, and community cultures differ substantially. Visit multiple neighborhoods to find your best fit."
              }
            ]}
            showSchema={true}
            className="border-0 shadow-lg"
          />
        </div>
      </section>

      <Footer />
    </div>
  );
}
