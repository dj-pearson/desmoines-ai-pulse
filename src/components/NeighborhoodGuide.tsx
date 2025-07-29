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
      description: "Discover what's happening in West Des Moines, Iowa's premier shopping and dining destination.",
      highlights: ["Jordan Creek Town Center", "Valley Junction", "Raccoon River Park"],
      zipCodes: ["50265", "50266", "50061"],
      keywords: "West Des Moines events, Jordan Creek shopping, Valley Junction historic district"
    },
    "Ankeny": {
      description: "Find family-friendly events and activities in Ankeny, one of Iowa's fastest-growing communities.",
      highlights: ["Ankeny Market & Pavilion", "High Trestle Trail", "Ankeny Art Center"],
      zipCodes: ["50023", "50021"],
      keywords: "Ankeny family events, High Trestle Trail activities, Ankeny community center"
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

      {/* Local SEO Content */}
      <Card className="bg-muted/50">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-3">About {neighborhood}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {neighborhood} is a vibrant part of the greater Des Moines metropolitan area, offering residents and visitors 
            a unique blend of local events, dining options, and community attractions. Whether you're looking for 
            family-friendly activities, date night restaurants, or weekend events, {neighborhood} has something for everyone. 
            Stay updated with the latest happenings, new restaurant openings, and seasonal events in {neighborhood} 
            through Des Moines Insider.
          </p>
          
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
    </div>
  );
}
