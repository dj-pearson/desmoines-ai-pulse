import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Utensils, MapPin, Baby, Star, TrendingUp, Search, Clock } from "lucide-react";
import { useTrending } from "@/hooks/useTrending";
import { useSearchInsights } from "@/hooks/useSearchInsights";
import { useAnalytics } from "@/hooks/useAnalytics";

export default function MostSearched() {
  const { trending, isLoading: trendingLoading, hasRealData: hasRealTrendingData } = useTrending();
  const { insights, isLoading: insightsLoading, hasRealData: hasRealSearchData } = useSearchInsights();
  const { trackEvent } = useAnalytics();

  const isLoading = trendingLoading || insightsLoading;

  const handleItemClick = (contentType: string, contentId: string) => {
    trackEvent({
      eventType: 'click',
      contentType: contentType as any,
      contentId: contentId
    });
  };

  if (isLoading) {
    return (
      <section className="py-16 bg-muted/50" id="most-searched">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Skeleton className="h-8 w-64 mx-auto mb-4" />
            <Skeleton className="h-4 w-96 mx-auto" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-6 w-32" />
                {[...Array(3)].map((_, j) => (
                  <Skeleton key={j} className="h-24 w-full" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 bg-muted/50" id="most-searched">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-4">
            <TrendingUp className="h-6 w-6 text-primary" />
            <h3 className="text-3xl font-bold text-foreground">
              {hasRealTrendingData || hasRealSearchData ? 'Trending Now' : 'Popular Discoveries'}
            </h3>
          </div>
          <p className="text-lg text-muted-foreground">
            {hasRealTrendingData 
              ? 'Real-time trending based on user activity' 
              : hasRealSearchData 
                ? 'Popular searches and featured content' 
                : 'Curated highlights for Des Moines explorers'
            }
          </p>
          {!hasRealTrendingData && (
            <Badge variant="secondary" className="mt-2">
              <Search className="h-3 w-3 mr-1" />
              Featured Content
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Popular Searches */}
          <div>
            <div className="flex items-center mb-6">
              <Search className="h-6 w-6 text-primary mr-2" />
              <h4 className="text-xl font-semibold">
                {hasRealSearchData ? 'Top Searches' : 'Popular Searches'}
              </h4>
            </div>
            <div className="space-y-3">
              {insights.popularSearches.slice(0, 6).map((search, index) => (
                <Card key={search.query} className="hover:shadow-md transition-shadow cursor-pointer p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{search.query}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {search.category && (
                          <Badge variant="outline" className="text-xs">
                            {search.category}
                          </Badge>
                        )}
                        {hasRealSearchData && (
                          <span className="text-xs text-muted-foreground">
                            {search.count} searches
                          </span>
                        )}
                        {search.trending && (
                          <TrendingUp className="h-3 w-3 text-green-500" />
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Top Restaurants */}
          <div>
            <div className="flex items-center mb-6">
              <Utensils className="h-6 w-6 text-primary mr-2" />
              <h4 className="text-xl font-semibold">
                {hasRealTrendingData ? 'Trending Restaurants' : 'Top Restaurants'}
              </h4>
            </div>
            <div className="space-y-4">
              {(trending.restaurants.length > 0 ? trending.restaurants : []).slice(0, 3).map((item) => {
                const restaurant = item.content;
                return (
                  <Card 
                    key={restaurant.id} 
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => handleItemClick('restaurant', restaurant.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg">{restaurant.name}</CardTitle>
                        <div className="flex items-center gap-1">
                          {hasRealTrendingData && (
                            <Badge variant="secondary" className="text-xs">
                              #{item.rank}
                            </Badge>
                          )}
                          {restaurant.rating && (
                            <div className="flex items-center">
                              <Star className="h-4 w-4 text-yellow-500 mr-1" />
                              <span className="text-sm font-medium">{restaurant.rating}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center text-sm text-muted-foreground gap-2">
                        {restaurant.cuisine && (
                          <Badge variant="secondary">
                            {restaurant.cuisine}
                          </Badge>
                        )}
                        {restaurant.price_range && (
                          <span className="text-green-600 font-medium">
                            {restaurant.price_range}
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    {restaurant.location && (
                      <CardContent className="pt-0">
                        <div className="flex items-center text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 mr-1" />
                          <span>{restaurant.location}</span>
                        </div>
                        {hasRealTrendingData && (
                          <div className="flex items-center text-xs text-muted-foreground mt-2">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            <span>{item.views24h} views today</span>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Top Attractions */}
          <div>
            <div className="flex items-center mb-6">
              <MapPin className="h-6 w-6 text-primary mr-2" />
              <h4 className="text-xl font-semibold">
                {hasRealTrendingData ? 'Trending Attractions' : 'Top Attractions'}
              </h4>
            </div>
            <div className="space-y-4">
              {(trending.attractions.length > 0 ? trending.attractions : []).slice(0, 3).map((item) => {
                const attraction = item.content;
                return (
                  <Card 
                    key={attraction.id} 
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => handleItemClick('attraction', attraction.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg">{attraction.name}</CardTitle>
                        <div className="flex items-center gap-1">
                          {hasRealTrendingData && (
                            <Badge variant="secondary" className="text-xs">
                              #{item.rank}
                            </Badge>
                          )}
                          {attraction.rating && (
                            <div className="flex items-center">
                              <Star className="h-4 w-4 text-yellow-500 mr-1" />
                              <span className="text-sm font-medium">{attraction.rating}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="w-fit">
                        {attraction.type}
                      </Badge>
                    </CardHeader>
                    {attraction.location && (
                      <CardContent className="pt-0">
                        <div className="flex items-center text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 mr-1" />
                          <span>{attraction.location}</span>
                        </div>
                        {hasRealTrendingData && (
                          <div className="flex items-center text-xs text-muted-foreground mt-2">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            <span>{item.views24h} views today</span>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Top Playgrounds */}
          <div>
            <div className="flex items-center mb-6">
              <Baby className="h-6 w-6 text-primary mr-2" />
              <h4 className="text-xl font-semibold">
                {hasRealTrendingData ? 'Trending Playgrounds' : 'Top Playgrounds'}
              </h4>
            </div>
            <div className="space-y-4">
              {(trending.playgrounds.length > 0 ? trending.playgrounds : []).slice(0, 3).map((item) => {
                const playground = item.content;
                return (
                  <Card 
                    key={playground.id} 
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => handleItemClick('playground', playground.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg">{playground.name}</CardTitle>
                        <div className="flex items-center gap-1">
                          {hasRealTrendingData && (
                            <Badge variant="secondary" className="text-xs">
                              #{item.rank}
                            </Badge>
                          )}
                          {playground.rating && (
                            <div className="flex items-center">
                              <Star className="h-4 w-4 text-yellow-500 mr-1" />
                              <span className="text-sm font-medium">{playground.rating}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {playground.age_range && (
                        <Badge variant="secondary">
                          Ages: {playground.age_range}
                        </Badge>
                      )}
                    </CardHeader>
                    {playground.location && (
                      <CardContent className="pt-0">
                        <div className="flex items-center text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 mr-1" />
                          <span>{playground.location}</span>
                        </div>
                        {hasRealTrendingData && (
                          <div className="flex items-center text-xs text-muted-foreground mt-2">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            <span>{item.views24h} views today</span>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}