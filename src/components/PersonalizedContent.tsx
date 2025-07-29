import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, TrendingUp, Clock, MapPin, Star, DollarSign } from 'lucide-react';
import { usePersonalizedRecommendations } from '@/hooks/usePersonalizedRecommendations';
import { Link } from 'react-router-dom';

interface PersonalizedContentProps {
  type?: 'events' | 'restaurants' | 'attractions' | 'trending' | 'all';
  limit?: number;
  showTitle?: boolean;
  showReasons?: boolean;
  className?: string;
}

export default function PersonalizedContent({ 
  type = 'all', 
  limit = 6, 
  showTitle = true, 
  showReasons = true,
  className = ''
}: PersonalizedContentProps) {
  const { recommendations, isLoading, trackRecommendationInteraction } = usePersonalizedRecommendations();

  // Handle click tracking
  const handleItemClick = (recommendationId: string) => {
    trackRecommendationInteraction(recommendationId, 'click');
  };

  // Format content based on type
  const formatContentUrl = (contentType: string, content: any) => {
    switch (contentType) {
      case 'event':
        return `/events/${content.id}`;
      case 'restaurant':
        return `/restaurants/${content.id}`;
      case 'attraction':
        return `/attractions/${content.id}`;
      case 'playground':
        return `/playgrounds/${content.id}`;
      default:
        return '#';
    }
  };

  // Get items to display based on type
  const getDisplayItems = () => {
    if (type === 'all') {
      // Mix all types
      const allItems = [
        ...recommendations.events.slice(0, 2),
        ...recommendations.restaurants.slice(0, 2),
        ...recommendations.attractions.slice(0, 1),
        ...recommendations.trending.slice(0, 1)
      ];
      return allItems.slice(0, limit);
    }
    
    return recommendations[type]?.slice(0, limit) || [];
  };

  const displayItems = getDisplayItems();

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        {showTitle && (
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Personalized for You</h3>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: limit }).map((_, index) => (
            <Card key={index} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (displayItems.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        {showTitle && (
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Personalized for You</h3>
          </div>
        )}
        <p className="text-muted-foreground">
          Explore our content to get personalized recommendations!
        </p>
      </div>
    );
  }

  const getTypeIcon = (contentType: string) => {
    switch (contentType) {
      case 'event':
        return <Clock className="h-4 w-4" />;
      case 'restaurant':
        return <DollarSign className="h-4 w-4" />;
      case 'attraction':
        return <MapPin className="h-4 w-4" />;
      default:
        return <TrendingUp className="h-4 w-4" />;
    }
  };

  const getTypeColor = (contentType: string) => {
    switch (contentType) {
      case 'event':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'restaurant':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'attraction':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      default:
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {showTitle && (
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">
            {type === 'all' ? 'Recommended for You' : 
             type === 'trending' ? 'Trending Now' :
             type === 'events' ? 'Events You Might Like' :
             type === 'restaurants' ? 'Restaurants for You' :
             'Attractions to Explore'}
          </h3>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {displayItems.map((item) => (
          <Card key={item.id} className="group hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={getTypeColor(item.contentType)}>
                    {getTypeIcon(item.contentType)}
                    {item.contentType}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {Math.round(item.confidence * 100)}% match
                  </Badge>
                </div>
              </div>
              
              <CardTitle className="text-base line-clamp-2">
                {item.content.title || item.content.name}
              </CardTitle>
              
              {showReasons && (
                <p className="text-sm text-muted-foreground italic">
                  {item.reason}
                </p>
              )}
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="space-y-2">
                {item.content.location && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{item.content.location}</span>
                  </div>
                )}
                
                {item.content.rating && (
                  <div className="flex items-center gap-1 text-sm">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span>{item.content.rating}</span>
                  </div>
                )}

                {item.content.price_range && (
                  <div className="flex items-center gap-1 text-sm">
                    <DollarSign className="h-3 w-3" />
                    <span>{item.content.price_range}</span>
                  </div>
                )}

                {item.content.date && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{new Date(item.content.date).toLocaleDateString()}</span>
                  </div>
                )}

                {item.content.cuisine && (
                  <Badge variant="outline" className="text-xs">
                    {item.content.cuisine}
                  </Badge>
                )}

                {item.content.category && (
                  <Badge variant="outline" className="text-xs">
                    {item.content.category}
                  </Badge>
                )}
              </div>

              <Button 
                asChild 
                size="sm" 
                className="w-full group-hover:bg-primary/90 transition-colors"
                onClick={() => handleItemClick(item.id)}
              >
                <Link to={formatContentUrl(item.contentType, item.content)}>
                  View Details
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {displayItems.length > 0 && type !== 'all' && (
        <div className="text-center">
          <Button variant="outline" asChild>
            <Link to={`/${type}`}>
              View All {type.charAt(0).toUpperCase() + type.slice(1)}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
