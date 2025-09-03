import { useState } from "react";
import { MapPin, Calendar, Users, Star, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface NeighborhoodGuideProps {
  neighborhood: string;
  events?: any[];
  restaurants?: any[];
  attractions?: any[];
}

export default function NeighborhoodGuide({ 
  neighborhood, 
  events = [], 
  restaurants = [], 
  attractions = [] 
}: NeighborhoodGuideProps) {
  
  const [activeTab, setActiveTab] = useState<"events" | "dining" | "attractions">("events");

  // Neighborhood-specific content
  const neighborhoodData = {
    "West Des Moines": {
      description: "Discover what's happening in West Des Moines, Iowa's premier shopping and dining destination with 400+ monthly events and activities.",
      highlights: ["Jordan Creek Town Center", "Valley Junction Historic District", "Raccoon River Park"],
      zipCodes: ["50265", "50266", "50061"],
      keywords: "West Des Moines events, Jordan Creek shopping, Valley Junction historic district",
      detailedDescription: `West Des Moines stands as the Des Moines metro area's premier shopping, dining, and family entertainment destination. 
        Home to Jordan Creek Town Center - Iowa's largest shopping mall - and the historic Valley Junction district, 
        West Des Moines offers diverse activities from upscale shopping to historic walking tours. The community hosts 200+ 
        family-friendly events annually, featuring outdoor concerts, farmers markets, and seasonal festivals. Raccoon River Park 
        provides year-round recreation with trails, playgrounds, and natural areas perfect for family activities.`,
      demographics: "Population 68,723 | Median household income $82,492 | 23% families with children under 18",
      bestFor: "Shopping, family dining, suburban events, historic tours, upscale attractions"
    },
    "Ankeny": {
      description: "Find family-friendly events and activities in Ankeny, one of Iowa's fastest-growing communities with 300+ monthly activities.",
      highlights: ["Ankeny Market & Pavilion", "High Trestle Trail", "Ankeny Art Center"],
      zipCodes: ["50023", "50021"],
      keywords: "Ankeny family events, High Trestle Trail activities, Ankeny community center",
      detailedDescription: `Ankeny represents one of Iowa's most rapidly growing suburban communities, known for exceptional 
        family amenities and community engagement. The city features the High Trestle Trail bridge - a architectural marvel 
        and top cycling destination - plus comprehensive community programming through the Ankeny Market & Pavilion. 
        With 150+ family-focused events annually, Ankeny excels in youth sports, community festivals, and educational programming. 
        The area attracts families seeking small-town community feel with big-city amenities.`,
      demographics: "Population 67,887 | Median household income $89,234 | 28% families with children under 18",
      bestFor: "Family activities, cycling recreation, community events, youth sports, educational programs"
    },
    "East Village": {
      description: "Experience Des Moines' hip East Village district with trendy restaurants, breweries, and cultural events.",
      highlights: ["Court Avenue Entertainment District", "East Village breweries", "Farmer's Market"],
      zipCodes: ["50309", "50312"],
      keywords: "East Village Des Moines, Court Avenue nightlife, downtown Des Moines events"
    },
    "Urbandale": {
      description: "Explore Urbandale's community events, parks, and family-friendly activities in this Des Moines suburb.",
      highlights: ["Living History Farms", "Walker Johnston Park", "Urbandale Community Center"],
      zipCodes: ["50322", "50323"],
      keywords: "Urbandale family activities, Living History Farms events, Urbandale parks"
    },
    "Johnston": {
      description: "Discover Johnston's community events, trails, and local attractions in this thriving Des Moines suburb.",
      highlights: ["Terra Park", "Johnston Commons", "Saylorville Lake"],
      zipCodes: ["50131"],
      keywords: "Johnston Iowa events, Terra Park activities, Saylorville Lake recreation"
    },
    "Clive": {
      description: "Find events and activities in Clive, known for its excellent parks and family-friendly community.",
      highlights: ["Clive Aquatic Center", "Campbell Recreation Area", "Clive Community Center"],
      zipCodes: ["50325"],
      keywords: "Clive Iowa activities, Campbell Recreation Area, Clive family events"
    },
    "Waukee": {
      description: "Explore Waukee's rapidly growing community with new restaurants, events, and family activities.",
      highlights: ["Waukee Family YMCA", "Centennial Park", "Triumph Park"],
      zipCodes: ["50263"],
      keywords: "Waukee Iowa events, Centennial Park activities, Waukee family fun"
    }
  };

  const currentNeighborhood = neighborhoodData[neighborhood as keyof typeof neighborhoodData];

  return (
    <div className="space-y-6">
      {/* Neighborhood Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="h-6 w-6" />
          <h1 className="text-2xl font-bold">
            {neighborhood} Events & Activities
          </h1>
        </div>
        <p className="text-blue-100 mb-4">
          {currentNeighborhood?.description || `Discover the best events, restaurants, and activities in ${neighborhood}, Des Moines.`}
        </p>
        
        {/* Local Highlights */}
        {currentNeighborhood?.highlights && (
          <div className="flex flex-wrap gap-2">
            {currentNeighborhood.highlights.map((highlight, index) => (
              <Badge key={index} variant="secondary" className="bg-white/20 text-white border-white/30">
                {highlight}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 bg-muted p-1 rounded-lg">
        <Button
          variant={activeTab === "events" ? "default" : "ghost"}
          onClick={() => setActiveTab("events")}
          className="flex-1"
        >
          <Calendar className="h-4 w-4 mr-2" />
          Events ({events.length})
        </Button>
        <Button
          variant={activeTab === "dining" ? "default" : "ghost"}
          onClick={() => setActiveTab("dining")}
          className="flex-1"
        >
          <Users className="h-4 w-4 mr-2" />
          Dining ({restaurants.length})
        </Button>
        <Button
          variant={activeTab === "attractions" ? "default" : "ghost"}
          onClick={() => setActiveTab("attractions")}
          className="flex-1"
        >
          <Star className="h-4 w-4 mr-2" />
          Attractions ({attractions.length})
        </Button>
      </div>

      {/* Content Sections */}
      {activeTab === "events" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            Upcoming Events in {neighborhood}
          </h2>
          {events.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {events.slice(0, 6).map((event, index) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{event.title}</CardTitle>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4 mr-1" />
                      {new Date(event.start_date).toLocaleDateString()}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm mb-2">{event.description?.slice(0, 100)}...</p>
                    <div className="flex justify-between items-center">
                      <Badge variant="outline">{event.category}</Badge>
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center p-8">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No events currently listed for {neighborhood}. Check back soon or explore nearby areas!
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "dining" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            Best Restaurants in {neighborhood}
          </h2>
          {restaurants.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {restaurants.slice(0, 6).map((restaurant, index) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{restaurant.name}</CardTitle>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mr-1" />
                      {restaurant.location}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm mb-2">{restaurant.description?.slice(0, 100)}...</p>
                    <div className="flex justify-between items-center">
                      <Badge variant="outline">{restaurant.cuisine_type}</Badge>
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Visit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center p-8">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Restaurant listings for {neighborhood} coming soon!
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "attractions" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            Top Attractions in {neighborhood}
          </h2>
          {attractions.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {attractions.slice(0, 6).map((attraction, index) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{attraction.name}</CardTitle>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mr-1" />
                      {attraction.location}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm mb-2">{attraction.description?.slice(0, 100)}...</p>
                    <div className="flex justify-between items-center">
                      <Badge variant="outline">{attraction.category}</Badge>
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Learn More
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center p-8">
                <Star className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Attraction listings for {neighborhood} coming soon!
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Enhanced Local SEO Content */}
      <div className="space-y-6">
        {/* Neighborhood Overview */}
        <Card className="bg-muted/50">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-3">About {neighborhood}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {currentNeighborhood?.detailedDescription || 
                `${neighborhood} is a vibrant part of the greater Des Moines metropolitan area, offering residents and visitors 
                a unique blend of local events, dining options, and community attractions. Whether you're looking for 
                family-friendly activities, date night restaurants, or weekend events, ${neighborhood} has something for everyone.`
              }
            </p>
            
            {currentNeighborhood?.demographics && (
              <div className="mb-4 p-3 bg-white rounded-md">
                <h4 className="text-sm font-semibold mb-2">Community Profile</h4>
                <p className="text-xs text-muted-foreground">{currentNeighborhood.demographics}</p>
              </div>
            )}
            
            {currentNeighborhood?.bestFor && (
              <div className="mb-4 p-3 bg-blue-50 rounded-md">
                <h4 className="text-sm font-semibold mb-2">Best Known For</h4>
                <p className="text-xs text-blue-700">{currentNeighborhood.bestFor}</p>
              </div>
            )}
            
            {currentNeighborhood?.keywords && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Popular searches:</h4>
                <p className="text-xs text-muted-foreground">
                  {currentNeighborhood.keywords}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Neighborhood FAQ Section for AI Search Optimization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold mb-2">What are the best family activities in {neighborhood}?</h4>
                <p className="text-sm text-gray-700">
                  {neighborhood === "West Des Moines" 
                    ? "West Des Moines offers Jordan Creek Town Center for shopping and entertainment, Valley Junction for historic tours and antique shopping, plus Raccoon River Park with trails, playgrounds, and year-round outdoor activities perfect for families."
                    : neighborhood === "Ankeny"
                    ? "Ankeny features the High Trestle Trail for cycling and walking, Ankeny Market & Pavilion for community events, plus numerous parks, sports complexes, and family-friendly festivals throughout the year."
                    : `${neighborhood} offers various family-friendly activities including parks, community centers, local events, and seasonal festivals that cater to residents of all ages.`
                  }
                </p>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold mb-2">Where are the best restaurants in {neighborhood}?</h4>
                <p className="text-sm text-gray-700">
                  {neighborhood === "West Des Moines"
                    ? "West Des Moines dining centers around Jordan Creek area with chain restaurants and local favorites, plus Valley Junction's unique local eateries. The area excels in family-friendly dining with diverse cuisine options and competitive pricing."
                    : neighborhood === "Ankeny"
                    ? "Ankeny's restaurant scene focuses on family-friendly establishments with good value pricing. The community features both chain restaurants and local favorites, with new openings regularly added to serve the growing suburban population."
                    : `${neighborhood} offers a variety of dining options ranging from casual family restaurants to local specialty eateries, with new establishments regularly opening to serve the community.`
                  }
                </p>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold mb-2">What events happen regularly in {neighborhood}?</h4>
                <p className="text-sm text-gray-700">
                  {neighborhood === "West Des Moines"
                    ? "Regular events include Valley Junction festivals, Jordan Creek seasonal celebrations, farmers markets, outdoor concerts at Raccoon River Park, and community gatherings. Many events are family-oriented with activities for all ages."
                    : neighborhood === "Ankeny"
                    ? "Ankeny hosts regular community events at the Market & Pavilion, seasonal festivals, youth sports tournaments, cycling events on the High Trestle Trail, and educational programs throughout the year."
                    : `${neighborhood} hosts regular community events, seasonal festivals, recreational activities, and local gatherings that bring residents together throughout the year.`
                  }
                </p>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold mb-2">How do I get to {neighborhood} from downtown Des Moines?</h4>
                <p className="text-sm text-gray-700">
                  {neighborhood === "West Des Moines"
                    ? "West Des Moines is easily accessible via I-235 West to I-35 South, approximately 15-20 minutes from downtown Des Moines. DART bus routes serve major destinations like Jordan Creek Town Center with regular service."
                    : neighborhood === "Ankeny"
                    ? "Ankeny is located north of Des Moines, accessible via I-35 North or Highway 69. The drive takes approximately 20-25 minutes from downtown Des Moines, with DART bus service available on major routes."
                    : `${neighborhood} is accessible from downtown Des Moines via major highways and public transportation options, with typical driving times of 15-30 minutes depending on traffic and destination.`
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
