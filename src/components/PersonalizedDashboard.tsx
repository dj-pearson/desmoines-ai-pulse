import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useEvents } from "@/hooks/useEvents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import EventCard from "@/components/EventCard";
import { Heart, TrendingUp, MapPin, Calendar } from "lucide-react";
import { Event } from "@/lib/types";

interface PersonalizedDashboardProps {
  onViewEventDetails: (event: Event) => void;
}

export default function PersonalizedDashboard({ onViewEventDetails }: PersonalizedDashboardProps) {
  const { profile } = useProfile();
  const { events, isLoading } = useEvents({ limit: 12 });
  const [personalizedEvents, setPersonalizedEvents] = useState<Event[]>([]);

  // Filter events based on user interests and location
  useEffect(() => {
    if (!profile || !events.length) return;

    const filtered = events.filter(event => {
      // Location-based filtering
      if (profile.location && event.location) {
        const userLocation = profile.location.toLowerCase();
        const eventLocation = event.location.toLowerCase();
        
        // Prioritize events in user's area
        if (userLocation.includes("downtown") && eventLocation.includes("downtown")) return true;
        if (userLocation.includes("west des moines") && eventLocation.includes("west")) return true;
        if (userLocation.includes(userLocation.split(" ")[0])) return true;
      }

      // Interest-based filtering
      if (profile.interests?.length) {
        const eventCategory = event.category.toLowerCase();
        const eventTitle = event.title.toLowerCase();
        const eventDescription = (event.enhanced_description || event.original_description || "").toLowerCase();
        
        return profile.interests.some(interest => {
          switch (interest) {
            case "food":
              return eventCategory.includes("food") || eventTitle.includes("food") || 
                     eventDescription.includes("restaurant") || eventDescription.includes("dining");
            case "music":
              return eventCategory.includes("music") || eventTitle.includes("music") || 
                     eventTitle.includes("concert") || eventDescription.includes("live music");
            case "sports":
              return eventCategory.includes("sport") || eventTitle.includes("game") || 
                     eventDescription.includes("athletic");
            case "arts":
              return eventCategory.includes("art") || eventTitle.includes("art") || 
                     eventDescription.includes("gallery") || eventDescription.includes("theater");
            case "family":
              return eventDescription.includes("family") || eventDescription.includes("kids") || 
                     eventDescription.includes("children");
            case "outdoor":
              return eventDescription.includes("outdoor") || eventDescription.includes("park") || 
                     eventDescription.includes("nature");
            default:
              return false;
          }
        });
      }

      return true; // Show all events if no specific preferences
    });

    // Sort by relevance (interested events first, then by date)
    const sorted = filtered.sort((a, b) => {
      const aDate = new Date(a.date);
      const bDate = new Date(b.date);
      return aDate.getTime() - bDate.getTime();
    });

    setPersonalizedEvents(sorted.slice(0, 6));
  }, [profile, events]);

  const getPersonalizedGreeting = () => {
    const interests = profile?.interests || [];
    if (interests.length === 0) return "Discover amazing events in Des Moines";
    
    const interestMap: { [key: string]: string } = {
      food: "culinary experiences",
      music: "live music events", 
      sports: "sporting events",
      arts: "cultural experiences",
      nightlife: "entertainment",
      outdoor: "outdoor adventures",
      family: "family-friendly activities",
      networking: "networking opportunities"
    };

    const mappedInterests = interests.slice(0, 2).map(i => interestMap[i]).filter(Boolean);
    return `Discover ${mappedInterests.join(" and ")} just for you`;
  };

  if (isLoading) {
    return (
      <section className="py-16 bg-gradient-to-br from-primary/5 to-accent/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Skeleton className="h-8 w-64 mx-auto mb-4" />
            <Skeleton className="h-4 w-96 mx-auto" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 bg-gradient-to-br from-primary/5 to-accent/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Heart className="h-6 w-6 text-primary" />
            <h3 className="text-3xl font-bold text-neutral-900">Just For You</h3>
          </div>
          <p className="text-lg text-neutral-600 mb-6">
            {getPersonalizedGreeting()}
          </p>
          
          {profile?.interests && profile.interests.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-8">
              <span className="text-sm text-neutral-500 mr-2">Your interests:</span>
              {profile.interests.map((interest) => (
                <Badge key={interest} variant="secondary" className="text-xs">
                  {interest.charAt(0).toUpperCase() + interest.slice(1)}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {personalizedEvents.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
              {personalizedEvents.map((event) => (
                <div key={event.id} className="relative">
                  <div className="absolute -top-2 -right-2 z-10">
                    <Badge className="bg-accent text-white">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Recommended
                    </Badge>
                  </div>
                  <EventCard 
                    event={event} 
                    onViewDetails={onViewEventDetails}
                  />
                </div>
              ))}
            </div>

            <div className="text-center">
              <Button variant="outline" className="mr-4">
                <Calendar className="h-4 w-4 mr-2" />
                View More Recommendations
              </Button>
              <Button variant="ghost">
                <MapPin className="h-4 w-4 mr-2" />
                Update Preferences
              </Button>
            </div>
          </>
        ) : (
          <Card className="text-center py-12">
            <CardHeader>
              <CardTitle>Building Your Recommendations</CardTitle>
              <CardDescription>
                We're learning your preferences to provide better event suggestions.
                Check back soon for personalized recommendations!
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline">
                Update Your Interests
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}