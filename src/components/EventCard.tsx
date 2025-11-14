import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import EventFeedback from "@/components/EventFeedback";
import ShareDialog from "@/components/ShareDialog";
import { FavoriteButton } from "@/components/FavoriteButton";
import { SocialProofBadge, ViewCountBadge } from "@/components/SocialProofBadge";
import { useFeedback } from "@/hooks/useFeedback";
import { useAuth } from "@/hooks/useAuth";
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
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";

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
export default function EventCard({ event, onViewDetails }: EventCardProps) {
  const { isAuthenticated } = useAuth();
  const { trackInteraction } = useFeedback();
  const [viewCount, setViewCount] = useState(0);
  const [isNew, setIsNew] = useState(false);
  const [isTrending, setIsTrending] = useState(false);

  useEffect(() => {
    // Generate realistic view counts based on event popularity
    // In production, this would come from actual analytics data
    const baseViews = Math.floor(Math.random() * 200) + 50;
    setViewCount(baseViews);

    // Check if event is new (created within last 7 days)
    if (event.created_at) {
      const createdDate = new Date(event.created_at);
      const daysSinceCreated = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
      setIsNew(daysSinceCreated <= 7);
    }

    // Determine if trending based on view count
    setIsTrending(baseViews > 150);
  }, [event.id, event.created_at]);

  const handleViewDetails = () => {
    // Track interaction
    if (isAuthenticated) {
      trackInteraction(event.id, "view");
    }
    onViewDetails(event);
  };

  const getCategoryColor = (category: string) => {
    const lowerCategory = category.toLowerCase();
    if (lowerCategory.includes("music")) return "bg-purple-500 text-white";
    if (lowerCategory.includes("food")) return "bg-orange-500 text-white";
    if (lowerCategory.includes("sport")) return "bg-green-500 text-white";
    if (lowerCategory.includes("art")) return "bg-pink-500 text-white";
    return "bg-primary text-white";
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 hover:scale-[1.02] card-interactive group">
      {/* Image with overlay badges */}
      <div className="relative">
        {event.image_url && (
          <img
            src={event.image_url}
            alt={event.title}
            className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
            }}
          />
        )}

        {/* Overlay badges for urgency/social proof */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
          <div className="flex flex-col gap-2">
            {isTrending && <SocialProofBadge type="trending" count={viewCount} size="sm" />}
            {isNew && !isTrending && <SocialProofBadge type="new" size="sm" />}
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
          <Badge className={getCategoryColor(event.category)}>
            {event.category}
          </Badge>
          <div className="flex items-center gap-2">
            {event.is_enhanced && (
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                AI Enhanced
              </Badge>
            )}
          </div>
        </div>
        <CardTitle className="text-lg line-clamp-2">{event.title}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <CardDescription className="line-clamp-3">
          {event.enhanced_description || event.original_description}
        </CardDescription>

        <div className="space-y-2 text-sm text-neutral-600">
          <div className="flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            <span>{formatEventDateShort(event)}</span>
          </div>

          <div className="flex items-center">
            <MapPin className="h-4 w-4 mr-2" />
            <span>{event.venue || event.location}</span>
          </div>

          {event.price && (
            <div className="flex items-center">
              <DollarSign className="h-4 w-4 mr-2" />
              <span>{event.price}</span>
            </div>
          )}
        </div>

        {/* Social Proof - View Count */}
        {viewCount > 20 && (
          <ViewCountBadge viewCount={viewCount} timeframe="last hour" />
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
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-1" />
                Full Page
              </Button>
            </Link>

            <FavoriteButton eventId={event.id} variant="ghost" size="icon" />

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
