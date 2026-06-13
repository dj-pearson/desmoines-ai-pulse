import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { format } from "date-fns";
import { Calendar, DollarSign, Sparkles, MapPin } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ItineraryDays } from "@/components/trip/ItineraryDays";
import { TripCalendarMenu } from "@/components/trip/TripCalendarMenu";
import { useTripPlanner } from "@/hooks/useTripPlanner";
import { STALE_TIME } from "@/lib/queryConfig";

/**
 * Public, read-only view of a shared itinerary (WEB-FEAT-011).
 * Resolves /trips/shared/:code via the same backend the Trip Planner shares to.
 */
export default function SharedTrip() {
  const { code } = useParams<{ code: string }>();
  const { fetchSharedTrip, getItemsByDay } = useTripPlanner();

  const {
    data: trip,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["shared-trip", code],
    enabled: !!code,
    staleTime: STALE_TIME.CONTENT,
    queryFn: async () => {
      if (!code) return null;
      return fetchSharedTrip(code);
    },
  });

  return (
    <>
      <SEOHead
        title={trip ? `${trip.title} — Shared Trip | Des Moines Insider` : "Shared Trip | Des Moines Insider"}
        description={
          trip?.description ||
          "A shared Des Moines itinerary built with the AI Trip Planner."
        }
      />
      {/* User-generated, per-link content — keep it out of the search index. */}
      <Helmet>
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-64 w-full rounded-lg" />
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={() => refetch()} resourceLabel="this trip" />
          ) : !trip ? (
            <EmptyState
              icon={MapPin}
              title="Trip not found"
              description="This shared trip link is invalid or the trip is no longer public."
            >
              <Button asChild className="mt-6">
                <Link to="/trip-planner">Plan your own trip</Link>
              </Button>
            </EmptyState>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                      <CardTitle className="text-2xl">{trip.title}</CardTitle>
                      {trip.description && <CardDescription className="mt-2">{trip.description}</CardDescription>}
                      <div className="flex flex-wrap gap-2 mt-4">
                        <Badge variant="outline">
                          <Calendar className="h-3 w-3 mr-1" />
                          {format(new Date(trip.start_date), "MMM d")} -{" "}
                          {format(new Date(trip.end_date), "MMM d, yyyy")}
                        </Badge>
                        {trip.total_estimated_cost && (
                          <Badge variant="outline">
                            <DollarSign className="h-3 w-3 mr-1" />
                            {trip.total_estimated_cost}
                          </Badge>
                        )}
                        {trip.ai_generated && (
                          <Badge className="bg-gradient-to-r from-purple-500 to-pink-500">
                            <Sparkles className="h-3 w-3 mr-1" />
                            AI Generated
                          </Badge>
                        )}
                      </div>
                    </div>
                    {trip.items && trip.items.length > 0 && (
                      <TripCalendarMenu trip={trip} items={trip.items} />
                    )}
                  </div>
                </CardHeader>
              </Card>

              <ItineraryDays trip={trip} items={trip.items || []} getItemsByDay={getItemsByDay} />

              <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/40">
                <CardContent className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground text-center sm:text-left">
                    Want a personalized itinerary like this? Build your own with the AI Trip Planner.
                  </p>
                  <Button asChild>
                    <Link to="/trip-planner">
                      <Sparkles className="h-4 w-4 mr-2" />
                      Plan a Trip
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
