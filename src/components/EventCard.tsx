import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar } from "lucide-react";
import { Event } from "@/lib/types";
import { format } from "date-fns";

interface EventCardProps {
  event: Event;
  onViewDetails?: (event: Event) => void;
}

export default function EventCard({ event, onViewDetails }: EventCardProps) {
  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails(event);
    }
  };

  const formatDate = (date: string | Date) => {
    try {
      return format(new Date(date), "MMM d, yyyy");
    } catch {
      return "Date TBA";
    }
  };

  const getCategoryColor = (category: string) => {
    const categoryLower = category.toLowerCase();
    if (categoryLower.includes('music')) return 'bg-accent text-white';
    if (categoryLower.includes('food')) return 'bg-accent text-white';
    if (categoryLower.includes('art')) return 'bg-secondary text-white';
    return 'bg-primary text-white';
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
      {event.imageUrl && (
        <img 
          src={event.imageUrl} 
          alt={event.title}
          className="w-full h-48 object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
          }}
        />
      )}
      <div className="p-6">
        <div className="flex items-center mb-2">
          <Badge className={getCategoryColor(event.category)}>
            {event.category}
          </Badge>
          <span className="ml-auto text-neutral-500 text-sm flex items-center">
            <Calendar className="h-4 w-4 mr-1" />
            {formatDate(event.date)}
          </span>
        </div>
        <h4 className="text-xl font-bold mb-2">{event.title}</h4>
        <p className="text-neutral-500 mb-4 line-clamp-3">
          {event.enhancedDescription || event.originalDescription}
        </p>
        <div className="flex items-center text-neutral-500 mb-4">
          <MapPin className="h-4 w-4 mr-2" />
          <span>{event.location}</span>
        </div>
        {event.price && (
          <div className="text-sm text-neutral-600 mb-4">
            Price: {event.price}
          </div>
        )}
        <Button 
          className="w-full bg-primary hover:bg-blue-700 text-white py-2 rounded-lg font-semibold transition-colors"
          onClick={handleViewDetails}
        >
          View Details
        </Button>
      </div>
    </div>
  );
}