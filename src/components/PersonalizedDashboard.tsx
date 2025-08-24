import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useSmartRecommendations } from "@/hooks/useSmartRecommendations";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import EventCard from "@/components/EventCard";
import {
  Heart,
  TrendingUp,
  MapPin,
  Calendar,
  Brain,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { Event } from "@/lib/types";

interface PersonalizedDashboardProps {
  onViewEventDetails: (event: Event) => void;
}

export default function PersonalizedDashboard({
  onViewEventDetails,
}: PersonalizedDashboardProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const {
    recommendations,
    isLoading,
    confidence,
    error,
    refreshRecommendations,
  } = useSmartRecommendations();

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
      networking: "networking opportunities",
    };

    const mappedInterests = interests
      .slice(0, 2)
      .map((i) => interestMap[i])
      .filter(Boolean);
    return `Smart recommendations${
      mappedInterests.length > 0 ? ` for ${mappedInterests.join(" and ")}` : ""
    } just for you`;
  };

  const getRecommendationTypeColor = (type: string) => {
    switch (type) {
      case "collaborative":
        return "bg-blue-500";
      case "content_based":
        return "bg-green-500";
      case "trending":
        return "bg-orange-500";
      case "hybrid":
        return "bg-purple-500";
      default:
        return "bg-accent";
    }
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
            <Brain className="h-6 w-6 text-[#DC143C]" />
            <h3 className="text-3xl font-bold text-neutral-900">
              AI-Powered Recommendations
            </h3>
          </div>
          <p className="text-lg text-neutral-600 mb-4">
            {getPersonalizedGreeting()}
          </p>

          {confidence > 0 && (
            <div className="flex items-center justify-center gap-2 mb-6">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-sm text-neutral-500">
                {Math.round(confidence * 100)}% confidence • Hybrid AI
                recommendations
              </span>
            </div>
          )}

          {profile?.interests && profile.interests.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-8">
              <span className="text-sm text-neutral-500 mr-2">
                Your interests:
              </span>
              {profile.interests.map((interest) => (
                <Badge key={interest} variant="secondary" className="text-xs">
                  {interest.charAt(0).toUpperCase() + interest.slice(1)}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {error && (
          <Card className="text-center py-8 mb-8 border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive mb-4">
                Error loading recommendations: {error}
              </p>
              <Button variant="outline" onClick={refreshRecommendations}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {recommendations.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
              {recommendations.map((rec) => (
                <div key={rec.event.id} className="relative">
                  <div className="absolute -top-2 -right-2 z-10 flex flex-col gap-1">
                    <Badge
                      className={`${getRecommendationTypeColor(
                        rec.recommendationType
                      )} text-white text-xs`}
                    >
                      <Brain className="h-3 w-3 mr-1" />
                      {rec.recommendationType === "hybrid"
                        ? "Smart Pick"
                        : rec.recommendationType === "collaborative"
                        ? "Similar Users"
                        : rec.recommendationType === "content_based"
                        ? "Your Interests"
                        : "Trending"}
                    </Badge>
                    {rec.score > 0.8 && (
                      <Badge variant="secondary" className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        {Math.round(rec.score * 100)}% match
                      </Badge>
                    )}
                  </div>
                  <EventCard
                    event={rec.event}
                    onViewDetails={onViewEventDetails}
                  />
                  {rec.reasoning.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <p className="line-clamp-2">
                        {rec.reasoning.join(" • ")}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-center">
              <Button
                variant="outline"
                className="mr-4"
                onClick={refreshRecommendations}
                disabled={isLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
                />
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
              <CardTitle>Building Your Smart Profile</CardTitle>
              <CardDescription>
                Start rating events with thumbs up/down and star ratings to help
                our hybrid AI system learn your preferences. Our algorithm
                combines collaborative filtering, content analysis, and trending
                data for personalized recommendations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={refreshRecommendations}
                disabled={isLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
                />
                Generate Recommendations
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
