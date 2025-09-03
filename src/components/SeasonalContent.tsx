import React from "react";
import { Calendar, MapPin, Star, Clock, Users, Utensils } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SeasonalEvent {
  title: string;
  description: string;
  dates: string;
  location: string;
  category: string;
  searchVolume: string;
  highlights: string[];
  businessOpportunities: string[];
}

export default function SeasonalContent() {
  const currentMonth = new Date().getMonth(); // 0 = January, 7 = August
  
  const seasonalEvents: { [key: number]: SeasonalEvent } = {
    // July - Iowa State Fair preparation
    6: {
      title: "Iowa State Fair Business Guide",
      description: "Complete guide to cyclist-friendly services and businesses during Iowa's premier event",
      dates: "August 8-18, 2024",
      location: "Iowa State Fairgrounds, Des Moines",
      category: "Major Events",
      searchVolume: "10,000+ monthly searches",
      highlights: [
        "11 days of Iowa's largest event",
        "1+ million visitors expected",
        "250+ food vendors and exhibits",
        "Agricultural competitions and shows"
      ],
      businessOpportunities: [
        "Restaurants near Iowa State Fair",
        "Iowa State Fair parking services",
        "Iowa State Fair dining guide beyond food stands",
        "Hotels and lodging during State Fair"
      ]
    },
    // July - RAGBRAI
    6: {
      title: "RAGBRAI Cyclist Services Guide",
      description: "Comprehensive business directory for Iowa's famous cycling event",
      dates: "July 21-27, 2024",
      location: "Across Iowa - ending in Des Moines area",
      category: "Cycling Events",
      searchVolume: "800+ monthly searches",
      highlights: [
        "30,000+ cyclists participating",
        "Route includes Des Moines metro area",
        "Week-long cycling celebration",
        "Local business opportunities"
      ],
      businessOpportunities: [
        "Bike repair shops Des Moines",
        "Cyclist-friendly restaurants",
        "RAGBRAI lodging and camping",
        "Sports medicine and recovery services"
      ]
    },
    // April - Drake Relays
    3: {
      title: "Drake Relays Weekend Guide",
      description: "Complete guide to Des Moines' premier track and field event",
      dates: "April 25-27, 2024",
      location: "Drake University, Des Moines",
      category: "Sports Events",
      searchVolume: "1,000+ monthly searches",
      highlights: [
        "World-class track and field competition",
        "International athletes and teams",
        "3-day event weekend",
        "Historic Drake Stadium venue"
      ],
      businessOpportunities: [
        "Restaurants near Drake University",
        "Drake Relays weekend dining",
        "Sports bars for Drake Relays viewing",
        "Hotels near Drake Stadium"
      ]
    },
    // Spring/Summer - Farmers Markets
    4: {
      title: "Des Moines Farmers Markets Guide",
      description: "Complete directory of farmers markets across the metro area",
      dates: "May through October",
      location: "Multiple locations across Des Moines metro",
      category: "Community Markets",
      searchVolume: "800+ monthly searches",
      highlights: [
        "Downtown Saturday Market - largest in Iowa",
        "15+ suburban farmers markets",
        "Local produce and artisan goods",
        "Family-friendly weekend activities"
      ],
      businessOpportunities: [
        "Farmers market Des Moines Saturday",
        "West Des Moines farmers market",
        "Ankeny farmers market schedule",
        "Local vendors and artisan directory"
      ]
    }
  };

  // Determine which seasonal content to show
  const getSeasonalContent = (): SeasonalEvent => {
    // Show Iowa State Fair content in July/August
    if (currentMonth === 6 || currentMonth === 7) {
      return seasonalEvents[6];
    }
    // Show Drake Relays in March/April
    if (currentMonth === 2 || currentMonth === 3) {
      return seasonalEvents[3];
    }
    // Show Farmers Market content May-September
    if (currentMonth >= 4 && currentMonth <= 8) {
      return seasonalEvents[4];
    }
    // Default to current season's content
    return seasonalEvents[6]; // Iowa State Fair as fallback
  };

  const currentSeason = getSeasonalContent();

  return (
    <div className="space-y-6">
      {/* Seasonal Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-6 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="h-6 w-6" />
          <Badge className="bg-white/20 text-white">
            {currentSeason.searchVolume}
          </Badge>
        </div>
        <h2 className="text-2xl font-bold mb-2">{currentSeason.title}</h2>
        <p className="text-orange-100 mb-4">{currentSeason.description}</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>{currentSeason.dates}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span className="truncate">{currentSeason.location}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>{currentSeason.category}</span>
          </div>
        </div>
      </div>

      {/* Event Highlights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Event Highlights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentSeason.highlights.map((highlight, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                <span className="text-sm">{highlight}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Business Directory Opportunities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Utensils className="h-5 w-5 text-blue-500" />
            Local Business Opportunities
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            High-value searches driving business discovery during {currentSeason.title.toLowerCase()}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {currentSeason.businessOpportunities.map((opportunity, index) => (
              <div key={index} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium capitalize">{opportunity}</h4>
                  <Button variant="outline" size="sm">
                    View Listings
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Find local businesses specializing in {opportunity.toLowerCase()}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SEO Content Section */}
      <Card className="bg-blue-50">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-3">About {currentSeason.title}</h3>
          <div className="prose prose-sm max-w-none">
            <p className="mb-4">
              {currentSeason.title} represents one of Iowa's most significant annual events, 
              attracting visitors from across the Midwest and creating substantial opportunities 
              for local Des Moines area businesses. Our comprehensive guide helps you discover 
              the best local services, dining options, and accommodations during this premier event.
            </p>
            
            <h4 className="font-semibold mb-2">Local Business Impact</h4>
            <p className="mb-4">
              During major seasonal events, Des Moines area businesses experience significant 
              increased demand for services. Our directory helps connect visitors with local 
              restaurants, hotels, services, and attractions that can accommodate the unique 
              needs of event attendees while supporting the local economy.
            </p>
            
            <h4 className="font-semibold mb-2">Year-Round Planning</h4>
            <p>
              Des Moines Insider tracks seasonal events throughout the year, helping residents 
              and visitors plan ahead for Iowa's major celebrations. From the Iowa State Fair 
              to RAGBRAI, Drake Relays to farmers markets, we provide comprehensive coverage 
              of events that define the Des Moines experience.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}