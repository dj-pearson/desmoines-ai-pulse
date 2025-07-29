import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import EventCard from "@/components/EventCard";
import { Heart, TrendingUp, MapPin, Calendar, Brain, Sparkles } from "lucide-react";
import { Event } from "@/lib/types";

interface PersonalizedDashboardProps {
  onViewEventDetails: (event: Event) => void;
}

export default function PersonalizedDashboard({ onViewEventDetails }: PersonalizedDashboardProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [personalizedEvents, setPersonalizedEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confidence, setConfidence] = useState(0);
  const [reasoning, setReasoning] = useState("");

  // Fetch AI-powered personalized recommendations
  const fetchPersonalizedRecommendations = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.functions.invoke('personalized-recommendations', {
        body: { userId: user.id }
      });

      if (error) {
        console.error('Error fetching personalized recommendations:', error);
        return;
      }

      setPersonalizedEvents(data.recommendations || []);
      setConfidence(data.confidence || 0);
      setReasoning(data.reasoning || "");
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchPersonalizedRecommendations();
    }
  }, [user]);

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
    return `AI-curated ${mappedInterests.join(" and ")} just for you`;
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
            <Brain className="h-6 w-6 text-primary" />
            <h3 className="text-3xl font-bold text-neutral-900">AI-Powered Recommendations</h3>
          </div>
          <p className="text-lg text-neutral-600 mb-4">
            {getPersonalizedGreeting()}
          </p>
          
          {confidence > 0 && (
            <div className="flex items-center justify-center gap-2 mb-6">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-sm text-neutral-500">
                {Math.round(confidence * 100)}% confidence • {reasoning}
              </span>
            </div>
          )}
          
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
              <Button variant="outline" className="mr-4" onClick={fetchPersonalizedRecommendations}>
                <TrendingUp className="h-4 w-4 mr-2" />
                Refresh Recommendations
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
              <CardTitle>Building Your AI Profile</CardTitle>
              <CardDescription>
                Rate some events with thumbs up/down to help our AI learn your preferences.
                The more feedback you provide, the better our recommendations become!
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={fetchPersonalizedRecommendations}>
                <TrendingUp className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}