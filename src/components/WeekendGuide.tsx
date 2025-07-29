import { useState, useEffect } from "react";
import { Calendar, MapPin, Users, Sparkles, Clock, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LocalSEO from "./LocalSEO";

export default function WeekendGuide() {
  const [currentWeekend, setCurrentWeekend] = useState<string>("");
  
  useEffect(() => {
    const getWeekendDates = () => {
      const today = new Date();
      const friday = new Date(today);
      friday.setDate(today.getDate() + (5 - today.getDay() + 7) % 7);
      const sunday = new Date(friday);
      sunday.setDate(friday.getDate() + 2);
      
      return `${friday.toLocaleDateString()} - ${sunday.toLocaleDateString()}`;
    };
    
    setCurrentWeekend(getWeekendDates());
  }, []);

  // Sample weekend events data - this would come from your API
  const weekendEvents = [
    {
      title: "Des Moines Farmers Market",
      description: "Iowa's largest farmers market featuring local vendors, fresh produce, and live entertainment",
      venue: "Court Avenue District",
      time: "Saturday 7:00 AM - 12:00 PM",
      category: "Markets & Shopping",
      neighborhood: "East Village",
      isFree: true,
      familyFriendly: true
    },
    {
      title: "Science Center of Iowa Special Exhibits",
      description: "Interactive science exhibits and planetarium shows perfect for families",
      venue: "Science Center of Iowa",
      time: "Saturday & Sunday 10:00 AM - 5:00 PM",
      category: "Family Activities",
      neighborhood: "Downtown",
      isFree: false,
      familyFriendly: true
    },
    {
      title: "Live Music at Wooly's",
      description: "Local and touring bands perform in Des Moines' premier music venue",
      venue: "Wooly's",
      time: "Saturday 8:00 PM",
      category: "Music & Nightlife",
      neighborhood: "East Village",
      isFree: false,
      familyFriendly: false
    },
    {
      title: "Gray's Lake Trail Walking",
      description: "Scenic 2-mile walking trail around Gray's Lake with beautiful city views",
      venue: "Gray's Lake Park",
      time: "Anytime",
      category: "Outdoor Activities",
      neighborhood: "Gray's Lake",
      isFree: true,
      familyFriendly: true
    },
    {
      title: "Jordan Creek Town Center Shopping",
      description: "Iowa's premier shopping destination with 200+ stores and restaurants",
      venue: "Jordan Creek Town Center",
      time: "Saturday & Sunday 10:00 AM - 9:00 PM",
      category: "Shopping",
      neighborhood: "West Des Moines",
      isFree: true,
      familyFriendly: true
    },
    {
      title: "Ankeny Market & Pavilion Events",
      description: "Community events, concerts, and family activities in Ankeny's town center",
      venue: "Ankeny Market & Pavilion",
      time: "Various times",
      category: "Community Events",
      neighborhood: "Ankeny",
      isFree: true,
      familyFriendly: true
    }
  ];

  const categories = [...new Set(weekendEvents.map(event => event.category))];
  const neighborhoods = [...new Set(weekendEvents.map(event => event.neighborhood))];

  return (
    <div className="space-y-6">
      <LocalSEO 
        pageTitle="Things to Do This Weekend in Des Moines"
        pageDescription="Discover the best weekend events, activities, and attractions in Des Moines, Iowa. From farmers markets to family fun, find what's happening this weekend in Des Moines metro area."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Weekend Guide", url: "/weekend" }
        ]}
      />
      
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-8 rounded-lg">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">What's Happening This Weekend in Des Moines?</h1>
            <p className="text-blue-100 mt-2">
              {currentWeekend && `Weekend of ${currentWeekend}`}
            </p>
          </div>
        </div>
        <p className="text-lg text-blue-100 max-w-3xl">
          Discover the best events, activities, and things to do this weekend in Des Moines, Iowa. 
          From family-friendly activities to nightlife, we've got your weekend plans covered across 
          the entire Des Moines metro area.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="h-8 w-8 mx-auto mb-2 text-blue-600" />
            <div className="text-2xl font-bold">{weekendEvents.length}</div>
            <div className="text-sm text-muted-foreground">Weekend Events</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <Star className="h-8 w-8 mx-auto mb-2 text-green-600" />
            <div className="text-2xl font-bold">{weekendEvents.filter(e => e.isFree).length}</div>
            <div className="text-sm text-muted-foreground">Free Activities</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-8 w-8 mx-auto mb-2 text-purple-600" />
            <div className="text-2xl font-bold">{weekendEvents.filter(e => e.familyFriendly).length}</div>
            <div className="text-sm text-muted-foreground">Family Friendly</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <MapPin className="h-8 w-8 mx-auto mb-2 text-orange-600" />
            <div className="text-2xl font-bold">{neighborhoods.length}</div>
            <div className="text-sm text-muted-foreground">Neighborhoods</div>
          </CardContent>
        </Card>
      </div>

      {/* Featured Events */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-yellow-500" />
          <h2 className="text-2xl font-bold">Must-Do Weekend Activities in Des Moines</h2>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {weekendEvents.map((event, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg leading-tight">{event.title}</CardTitle>
                  {event.isFree && (
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      FREE
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mr-1" />
                    {event.venue} • {event.neighborhood}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 mr-1" />
                    {event.time}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">{event.description}</p>
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <Badge variant="outline">{event.category}</Badge>
                    {event.familyFriendly && (
                      <Badge variant="outline" className="text-blue-600 border-blue-200">
                        <Users className="h-3 w-3 mr-1" />
                        Family
                      </Badge>
                    )}
                  </div>
                  <Button size="sm" variant="outline">Learn More</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Neighborhood Spotlight */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-6 w-6" />
            Explore Des Moines Neighborhoods This Weekend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <h4 className="font-semibold text-blue-600 mb-2">Downtown & East Village</h4>
              <p className="text-sm text-muted-foreground">
                Heart of Des Moines nightlife, farmers market, and cultural attractions. 
                Perfect for food tours and downtown events.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-purple-600 mb-2">West Des Moines</h4>
              <p className="text-sm text-muted-foreground">
                Premier shopping at Jordan Creek, Valley Junction historic charm, 
                and excellent family dining options.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-green-600 mb-2">Ankeny & Suburbs</h4>
              <p className="text-sm text-muted-foreground">
                Family-friendly community events, parks, trails, and growing 
                restaurant scene in Des Moines suburbs.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Local SEO Content */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-xl font-semibold mb-4">
            Your Complete Guide to Des Moines Weekend Activities
          </h3>
          <div className="prose prose-sm max-w-none text-muted-foreground">
            <p className="mb-4">
              Looking for the best things to do this weekend in Des Moines, Iowa? From the bustling 
              Downtown Farmers Market to family fun at Science Center of Iowa, Des Moines offers 
              incredible weekend activities for every interest and age group.
            </p>
            <p className="mb-4">
              <strong>Free Weekend Activities in Des Moines:</strong> Enjoy Gray's Lake Trail, 
              browse the farmers market, explore Pappajohn Sculpture Park, or attend free community 
              events throughout the metro area.
            </p>
            <p className="mb-4">
              <strong>Family Weekend Fun:</strong> Science Center of Iowa, Blank Park Zoo, 
              adventure parks in Ankeny, and seasonal festivals provide endless entertainment 
              for Des Moines families.
            </p>
            <p>
              <strong>Des Moines Nightlife:</strong> From craft breweries in the East Village 
              to live music venues and rooftop bars, Des Moines weekend nightlife scene offers 
              something for every taste.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
