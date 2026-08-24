/**
 * EventCard — the denser/legacy event card.
 *
 * Primary event LIST pages standardized on SocialEventCard (WEB-UX-009) for a
 * consistent layout that always shows the event time. EventCard is retained
 * deliberately for denser, secondary contexts — the related-events rail on
 * EventDetails, featured/nearby rails, dashboards, and profile lists — where
 * the social-preview chrome of SocialEventCard would be too heavy. Do not use
 * it for the main browse/list grids.
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AIDisclosureBadge } from "@/components/AIDisclosureBadge";
import EventFeedback from "@/components/EventFeedback";
import ShareDialog from "@/components/ShareDialog";
import { FavoriteButton } from "@/components/FavoriteButton";
import { SocialProofBadge, ViewCountBadge } from "@/components/SocialProofBadge";
import { useFeedback } from "@/hooks/useFeedback";
import { useAuth } from "@/hooks/useAuth";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { useViewTracking } from "@/hooks/useViewTracking";
import { Event } from "@/lib/types";
import {
  createEventSlugWithCentralTime,
  formatEventDateShort,
} from "@/lib/timezone";
import {
  Calendar,
  MapPin,
  DollarSign,
  ExternalLink,
  Sparkles,
  ImageOff,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect, memo, useCallback } from "react";
import { OptimizedImage } from "@/components/OptimizedImage";
import { SponsoredBadge } from "@/components/SponsoredBadge";
import { isSponsoredActive } from "@/lib/sponsored";
import { getEventCategoryBadgeClass } from "@/lib/categoryStyles";

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

interface EventCardProps {
  event: Event;
  onViewDetails: (event: Event) => void;
}

function EventCardComponent({ event, onViewDetails }: EventCardProps) {
  const { isAuthenticated } = useAuth();
  const { trackInteraction } = useFeedback();
  const { addToRecentlyViewed } = useRecentlyViewed();
  const { viewData, trackView } = useViewTracking(event.id);
  const [isNew, setIsNew] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Check if event is new (created within last 7 days)
  useEffect(() => {
    if (event.created_at) {
      const createdDate = new Date(event.created_at);
      const daysSinceCreated = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
      setIsNew(daysSinceCreated <= 7);
    }
  }, [event.created_at]);

  // Determine if trending based on view data
  const isTrending = viewData.trending_score > 70 || viewData.recent_views > 100;

  const handleViewDetails = useCallback(() => {
    // Track interaction
    if (isAuthenticated) {
      trackInteraction(event.id, "view");
    }

    // Add to recently viewed
    addToRecentlyViewed(event);

    // Track view in analytics
    trackView();

    onViewDetails(event);
  }, [isAuthenticated, trackInteraction, event, addToRecentlyViewed, trackView, onViewDetails]);

  // EXPIRY IS PART OF BEING SPONSORED. This card read `event.is_sponsored`
  // directly in three places, so an event whose sponsored_until had already
  // passed kept the amber ring and the "Sponsored" label until somebody flipped
  // the boolean by hand. RestaurantCard has always gone through this helper
  // (RestaurantCard.tsx:105); EventCard was the one display path that did not.
  // isSponsoredActive treats a null sponsored_until as open-ended, so rows
  // without an end date behave exactly as before. (WEB-FEAT-005)
  const sponsoredActive = isSponsoredActive(event);

  return (
    <Card className={`overflow-hidden hover:shadow-lg transition-all duration-200 hover:scale-[1.02] card-interactive group focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 ${sponsoredActive ? 'ring-2 ring-amber-400/60' : ''}`}>
      {/* Image with overlay badges */}
      <div className="relative overflow-hidden">
        {event.image_url && !imageError ? (
          <OptimizedImage
            src={event.image_url}
            alt={event.title}
            width={640}
            height={192}
            className="transition-transform duration-200 group-hover:scale-105 object-cover"
            containerClassName="w-full h-48"
            aspectRatio="640/192"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-48 bg-gradient-to-br from-muted to-muted/50 flex flex-col items-center justify-center gap-2" role="img" aria-label={`No image available for ${event.title}`}>
            <ImageOff className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
            <span className="text-xs text-muted-foreground/70">No image available</span>
          </div>
        )}

        {/* Overlay badges for urgency/social proof */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
          <div className="flex flex-col gap-2">
            {sponsoredActive && <SponsoredBadge />}
            {!sponsoredActive && isTrending && <SocialProofBadge type="trending" count={viewData.recent_views} size="sm" />}
            {!sponsoredActive && isNew && !isTrending && <SocialProofBadge type="new" size="sm" />}
          </div>

          {/* Distance Badge (only shown in Near Me mode) */}
          {(event as any).distance_meters && (
            <Badge variant="secondary" className="text-xs bg-primary text-primary-foreground shadow-lg">
              <MapPin className="h-3 w-3 mr-1" />
              {((event as any).distance_meters * 0.000621371).toFixed(1)} mi
            </Badge>
          )}
        </div>
      </div>

      <CardHeader className="pb-2">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <Badge className={getEventCategoryBadgeClass(event.category)}>
            {event.category}
          </Badge>
          <div className="flex items-center gap-2">
            {event.is_enhanced && (
              <AIDisclosureBadge
                label="AI-enhanced"
                tooltip="The description for this event was rewritten or expanded with AI assistance. Original event details come from the venue or promoter. Please verify times, prices, and availability directly with the source."
              />
            )}
          </div>
        </div>
        <CardTitle className="text-lg line-clamp-2">{event.title}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <CardDescription className="line-clamp-3">
          {event.enhanced_description || event.original_description}
        </CardDescription>

        <div className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
          <div className="flex items-center">
            <Calendar className="h-4 w-4 mr-2" aria-hidden="true" />
            <span>{formatEventDateShort(event)}</span>
          </div>

          <div className="flex items-center">
            <MapPin className="h-4 w-4 mr-2" aria-hidden="true" />
            <span>{event.venue || event.location}</span>
          </div>

          {event.price && (
            <div className="flex items-center">
              <DollarSign className="h-4 w-4 mr-2" aria-hidden="true" />
              <span>{event.price}</span>
            </div>
          )}
        </div>

        {/* Social Proof - View Count */}
        {viewData.recent_views > 20 && (
          <ViewCountBadge viewCount={viewData.recent_views} timeframe="last hour" />
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleViewDetails}
              className="bg-primary hover:bg-blue-700 text-white"
            >
              View Details
            </Button>

            <Link
              to={`/events/${createEventSlugWithCentralTime(
                event.title,
                event
              )}`}
            >
              <Button variant="outline" size="sm" aria-label={`View full page for ${event.title}`}>
                <ExternalLink className="h-4 w-4 mr-1" aria-hidden="true" />
                Full Page
              </Button>
            </Link>

            <FavoriteButton eventId={event.id} itemName={event.title} variant="ghost" size="icon" />

            <ShareDialog
              title={event.title}
              description={event.enhanced_description || event.original_description || `Join us for ${event.title}`}
              url={`${window.location.origin}/events/${createEventSlugWithCentralTime(event.title, event)}`}
            />
          </div>

          {isAuthenticated && (
            <EventFeedback eventId={event.id} className="ml-2" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Memoize to prevent unnecessary re-renders when parent updates
const EventCard = memo(EventCardComponent);
export default EventCard;
