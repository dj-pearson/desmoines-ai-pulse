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
import { useFeedback } from "@/hooks/useFeedback";
import { useAuth } from "@/hooks/useAuth";
import { Event } from "@/lib/types";
import {
  Calendar,
  MapPin,
  DollarSign,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

const createEventSlug = (title: string, date?: string | Date): string => {
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (!date) {
    return titleSlug;
  }

  try {
    // Handle both string and Date inputs consistently
    let eventDate: Date;
    if (date instanceof Date) {
      eventDate = date;
    } else {
      eventDate = new Date(date);
    }
    
    const year = eventDate.getFullYear();
    const month = String(eventDate.getMonth() + 1).padStart(2, "0");
    const day = String(eventDate.getDate()).padStart(2, "0");

    return `${titleSlug}-${year}-${month}-${day}`;
  } catch (error) {
    console.error("Error creating event slug:", error);
    return titleSlug;
  }
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

  const formatEventDate = (date: string | Date) => {
    try {
      return format(new Date(date), "MMM d, yyyy 'at' h:mm a");
    } catch {
      return "Date TBA";
    }
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
      {event.imageUrl && (
        <img
          src={event.imageUrl}
          alt={event.title}
          className="w-full h-48 object-cover"
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
          {event.isEnhanced && (
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
          {event.enhancedDescription || event.originalDescription}
        </CardDescription>

        <div className="space-y-2 text-sm text-neutral-600">
          <div className="flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            <span>{formatEventDate(event.date)}</span>
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
              to={`/events/${createEventSlug(event.title, event.date)}`}
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-1" />
                Full Page
              </Button>
            </Link>
          </div>

          {isAuthenticated && (
            <EventFeedback eventId={event.id} className="ml-2" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
