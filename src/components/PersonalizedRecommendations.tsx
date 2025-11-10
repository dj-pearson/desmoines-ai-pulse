import React from 'react';
import { useEventRecommendations } from '@/hooks/useEventRecommendations';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FavoriteButton } from '@/components/FavoriteButton';
import { createEventSlugWithCentralTime, formatEventDateShort } from '@/lib/timezone';
import {
  Sparkles,
  TrendingUp,
  Calendar,
  MapPin,
  ChevronRight,
  Info,
} from 'lucide-react';

interface PersonalizedRecommendationsProps {
  userLocation?: { latitude: number; longitude: number } | null;
  limit?: number;
  showTitle?: boolean;
  className?: string;
}

export function PersonalizedRecommendations({
  userLocation = null,
  limit = 6,
  showTitle = true,
  className = '',
}: PersonalizedRecommendationsProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { recommendations, isLoading, isPersonalized } = useEventRecommendations({
    userLocation,
    limit,
  });

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        {showTitle && (
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-48" />
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      </div>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  const handleViewEvent = (event: any) => {
    navigate(`/events/${createEventSlugWithCentralTime(event.title, event)}`);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      {showTitle && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isPersonalized ? (
              <Sparkles className="h-6 w-6 text-primary" />
            ) : (
              <TrendingUp className="h-6 w-6 text-primary" />
            )}
            <div>
              <h2 className="text-2xl md:text-3xl font-bold">
                {isPersonalized ? 'Recommended for You' : 'Trending Events'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isPersonalized
                  ? 'Events picked based on your interests'
                  : 'Popular events in Des Moines'}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={() => navigate('/events')}
            className="hidden md:flex"
          >
            View All
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Recommendation Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {recommendations.map((event: any) => (
          <Card
            key={event.id}
            className="group cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02]"
            onClick={() => handleViewEvent(event)}
          >
            <CardContent className="p-0">
              {/* Event Image */}
              {event.image_url && (
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={event.image_url}
                    alt={event.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />

                  {/* Recommendation Badge */}
                  {event.recommendation_reason && isPersonalized && (
                    <div className="absolute top-3 left-3">
                      <Badge className="bg-primary/90 text-white backdrop-blur-sm">
                        <Info className="h-3 w-3 mr-1" />
                        {event.recommendation_reason}
                      </Badge>
                    </div>
                  )}

                  {/* Category Badge */}
                  <div className="absolute top-3 right-3">
                    <Badge variant="secondary" className="bg-black/50 text-white">
                      {event.category}
                    </Badge>
                  </div>

                  {/* Favorite Button Overlay */}
                  <div
                    className="absolute bottom-3 right-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="bg-white/90 backdrop-blur-sm rounded-full p-2">
                      <FavoriteButton
                        eventId={event.id}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Event Details */}
              <div className="p-4 space-y-3">
                <h3 className="font-bold text-lg line-clamp-2 group-hover:text-primary transition-colors">
                  {event.title}
                </h3>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="line-clamp-1">
                      {formatEventDateShort(event)}
                    </span>
                  </div>

                  {event.location && (
                    <div className="flex items-center">
                      <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="line-clamp-1">{event.location}</span>
                    </div>
                  )}

                  {event.price && (
                    <div className="flex items-center">
                      <span className="font-semibold text-primary">
                        {event.price}
                      </span>
                    </div>
                  )}
                </div>

                {/* Description Preview */}
                {event.enhanced_description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {event.enhanced_description}
                  </p>
                )}

                {/* Action Button */}
                <Button
                  className="w-full mt-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewEvent(event);
                  }}
                >
                  View Details
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Mobile View All Button */}
      <Button
        variant="outline"
        onClick={() => navigate('/events')}
        className="w-full md:hidden"
      >
        View All Events
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>

      {/* Info Banner for Personalized Recommendations */}
      {isPersonalized && showTitle && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">Smart Recommendations</h4>
              <p className="text-xs text-muted-foreground">
                We analyze your favorites, RSVPs, and browsing history to suggest events
                you'll love. The more you interact, the better our recommendations become!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
