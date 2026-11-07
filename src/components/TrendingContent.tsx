import { Link } from 'react-router-dom';
import { useTrending } from '@/hooks/useTrendingContent';
import { useSimplePersonalization } from '@/hooks/useSimplePersonalization';
import { contentHref, isTrendingContentType } from '@/lib/trendingContent';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { Star } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { OptimizedImage } from "@/components/OptimizedImage";

/** A content field as display text. Rows come from four tables, so fields are unknown. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

interface TrendingContentProps {
  contentType?: 'event' | 'restaurant' | 'attraction' | 'playground';
  timeWindow?: '1h' | '6h' | '24h' | '7d';
  limit?: number;
  showPersonalized?: boolean;
  className?: string;
}

export default function TrendingContent({ 
  contentType, 
  timeWindow = '24h', 
  limit = 6,
  showPersonalized = true,
  className = ''
}: TrendingContentProps) {
  const {
    trendingItems,
    isLoading: trendingLoading,
    error: trendingError,
    refreshTrending,
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
          <SpriteIcon name="trending-up" className="h-5 w-5" />
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
      <ErrorState
        error={trendingError}
        onRetry={() => void refreshTrending()}
        title="Couldn't load trending content"
        compact
        className={className}
      />
    );
  }

  // Combine trending and personalized content
  const allContent = [
    ...trendingItems.map(item => ({ ...item, source: 'trending' as const })),
    ...(showPersonalized ? recommendations.map(rec => ({
      id: rec.id,
      contentType: rec.contentType,
      contentId: rec.content.id as string,
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

  type ContentItem = (typeof allContent)[number];

  // The canonical URL. This was /<type>/<uuid>, a 404 for attractions and
  // playgrounds (they resolve by slug or name, never by id).
  const hrefFor = (item: ContentItem) =>
    isTrendingContentType(item.contentType)
      ? contentHref(item.contentType, item.content, item.contentId)
      : '/';

  const handleContentClick = (item: ContentItem) => {
    if (item.source === 'personalized') {
      trackRecommendationClick({
        id: item.id,
        contentType: item.contentType,
        content: item.content,
        score: item.trendingScore,
        reason: item.reason
      });
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SpriteIcon name="trending-up" className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold">
            {contentType ? `Trending ${getContentTypeLabel(contentType)}` : 'Trending Now'}
          </h3>
          <Badge variant="outline" className="flex items-center gap-1">
            <SpriteIcon name="clock" className="h-3 w-3" />
            {getTimeWindowLabel(timeWindow)}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allContent.map((item) => (
          // The title is a real link stretched over the card, so the card is
          // reachable by Tab and opens with Enter. It was a clickable Card
          // with no role, no tabindex and no key handler.
          <Card
            key={item.id}
            className="relative hover:shadow-lg transition-shadow duration-200"
          >
            {text(item.content?.image_url) && (
              <div className="relative h-40 overflow-hidden rounded-t-lg">
                <OptimizedImage
                  src={text(item.content.image_url)!}
                  alt=""
                  containerClassName="w-full h-full"
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
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
                        <SpriteIcon name="trending-up" className="h-3 w-3" />
                        {item.reason}
                      </>
                    )}
                  </Badge>
                </div>
              </div>
            )}
            
            <CardHeader className="pb-2">
              <CardTitle className="text-base line-clamp-2">
                <Link
                  to={hrefFor(item)}
                  onClick={() => handleContentClick(item)}
                  className="rounded-sm after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2"
                >
                  {text(item.content?.name) ?? text(item.content?.title) ?? 'Untitled'}
                </Link>
              </CardTitle>
              <CardDescription className="flex items-center gap-1">
                <SpriteIcon name="map-pin" className="h-3 w-3" />
                {text(item.content?.location) ?? text(item.content?.city) ?? 'Des Moines'}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="pt-0">
              <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                {/* events carry enhanced_description, not description */}
                {text(item.content?.description) ??
                  text(item.content?.enhanced_description) ??
                  'No description available'}
              </p>
              
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  {getContentTypeLabel(item.contentType)}
                </Badge>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <SpriteIcon name="trending-up" className="h-3 w-3" />
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
