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
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      {event.image_url && (
        <img
          src={event.image_url}
          alt={event.title}
          className="w-full h-48 object-cover"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
          }}
        />
      )}

      <CardHeader className="pb-2">
        <div className="flex items-center justify-between mb-2">
          <Badge className={getCategoryColor(event.category)}>
            {event.category}
          </Badge>
          {event.is_enhanced && (
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              Enhanced
            </Badge>
          )}
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

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
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
