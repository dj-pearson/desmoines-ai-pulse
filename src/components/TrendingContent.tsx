import React from 'react';
import { useTrending } from '@/hooks/useTrendingContent';
import { useSimplePersonalization } from '@/hooks/useSimplePersonalization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, Clock, Star, MapPin } from 'lucide-react';

interface TrendingContentProps {
  contentType?: 'event' | 'restaurant' | 'attraction' | 'playground';
  timeWindow?: '1h' | '6h' | '24h' | '7d';
  limit?: number;
  showPersonalized?: boolean;
  className?: string;
}

export function TrendingContent({ 
  contentType, 
  timeWindow = '24h', 
  limit = 6,
  showPersonalized = true,
  className = ''
}: TrendingContentProps) {
  const { 
    trendingItems, 
    isLoading: trendingLoading, 
    error: trendingError 
  } = useTrending({ contentType, timeWindow, limit: Math.ceil(limit / 2) });
  
  const { 
    recommendations, 
    isLoading: personalizedLoading,
    trackRecommendationClick 
  } = useSimplePersonalization({ contentType, limit: Math.ceil(limit / 2) });

  const isLoading = trendingLoading || (showPersonalized && personalizedLoading);
  
  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Loading trending content...</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: limit }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-40 bg-gray-200 rounded-t-lg"></div>
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (trendingError && (!showPersonalized || recommendations.length === 0)) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-gray-500">Unable to load trending content at this time.</p>
      </div>
    );
  }

  // Combine trending and personalized content
  const allContent = [
    ...trendingItems.map(item => ({ ...item, source: 'trending' as const })),
    ...(showPersonalized ? recommendations.map(rec => ({
      id: rec.id,
      contentType: rec.contentType,
      contentId: rec.content.id,
      content: rec.content,
      trendingScore: rec.score,
      timeWindow,
      reason: rec.reason,
      source: 'personalized' as const
    })) : [])
  ].slice(0, limit);

  if (allContent.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-gray-500">No trending content available.</p>
      </div>
    );
  }

  const getTimeWindowLabel = (window: string) => {
    switch (window) {
      case '1h': return 'Past Hour';
      case '6h': return 'Past 6 Hours';
      case '24h': return 'Past 24 Hours';
      case '7d': return 'Past Week';
      default: return 'Trending';
    }
  };

  const getContentTypeLabel = (type: string) => {
    switch (type) {
      case 'event': return 'Events';
      case 'restaurant': return 'Restaurants';
      case 'attraction': return 'Attractions';
      case 'playground': return 'Playgrounds';
      default: return 'Content';
    }
  };

  const handleContentClick = (item: any) => {
    if (item.source === 'personalized') {
      trackRecommendationClick({
        id: item.id,
        contentType: item.contentType,
        content: item.content,
        score: item.trendingScore,
        reason: item.reason
      });
    }
    
    // Navigate to content detail
    const path = `/${item.contentType === 'event' ? 'events' : 
                    item.contentType === 'restaurant' ? 'restaurants' :
                    item.contentType === 'attraction' ? 'attractions' : 'playgrounds'}/${item.contentId}`;
    window.location.href = path;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold">
            {contentType ? `Trending ${getContentTypeLabel(contentType)}` : 'Trending Now'}
          </h3>
          <Badge variant="outline" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {getTimeWindowLabel(timeWindow)}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allContent.map((item) => (
          <Card 
            key={item.id} 
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200"
            onClick={() => handleContentClick(item)}
          >
            {item.content?.image_url && (
              <div className="relative h-40 overflow-hidden rounded-t-lg">
                <img 
                  src={item.content.image_url} 
                  alt={item.content.name || item.content.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2">
                  <Badge 
                    variant={item.source === 'personalized' ? 'default' : 'secondary'}
                    className="flex items-center gap-1"
                  >
                    {item.source === 'personalized' ? (
                      <>
                        <Star className="h-3 w-3" />
                        For You
                      </>
                    ) : (
                      <>
                        <TrendingUp className="h-3 w-3" />
                        {item.reason}
                      </>
                    )}
                  </Badge>
                </div>
              </div>
            )}
            
            <CardHeader className="pb-2">
              <CardTitle className="text-base line-clamp-2">
                {item.content?.name || item.content?.title || 'Untitled'}
              </CardTitle>
              <CardDescription className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {item.content?.location || item.content?.city || 'Des Moines'}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="pt-0">
              <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                {item.content?.description || 'No description available'}
              </p>
              
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  {getContentTypeLabel(item.contentType)}
                </Badge>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <TrendingUp className="h-3 w-3" />
                  Score: {Math.round(item.trendingScore)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {allContent.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No trending content available for the selected criteria.</p>
        </div>
      )}
    </div>
  );
}
