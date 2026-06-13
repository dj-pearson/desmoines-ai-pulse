/**
 * ItineraryDays (WEB-FEAT-011) — day-by-day rendering of a trip itinerary.
 *
 * Shared by the editable Trip Planner and the read-only public /trips/shared
 * page. In `editable` mode each item gets up/down reorder controls; the parent
 * owns persistence (via onMoveItem) so it can apply an optimistic update. A lazy
 * Leaflet map of the stops renders above the days, deferred until it scrolls
 * into view.
 */
import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { addDays, format } from "date-fns";
import {
  Calendar,
  MapPin,
  Clock,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Lightbulb,
  Utensils,
  Music,
  Car,
  Coffee,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RevealOnVisible } from "@/components/RevealOnVisible";
import type { TripPlan, TripPlanItem } from "@/hooks/useTripPlanner";

const TripMapPreview = lazy(() =>
  import("@/components/trip/TripMapPreview").then((m) => ({ default: m.TripMapPreview })),
);

interface ItineraryDaysProps {
  trip: TripPlan;
  items: TripPlanItem[];
  /** Group items by day_number (passed in from the hook helper). */
  getItemsByDay: (items: TripPlanItem[]) => Record<number, TripPlanItem[]>;
  /** When true, renders reorder controls. */
  editable?: boolean;
  /** Move an item within its day; parent persists + optimistically updates. */
  onMoveItem?: (item: TripPlanItem, direction: "up" | "down") => void;
  /** Disables reorder buttons while a persist is in flight. */
  reordering?: boolean;
}

function getItemIcon(itemType: string) {
  switch (itemType) {
    case "event":
      return <Music className="h-4 w-4" />;
    case "restaurant":
      return <Utensils className="h-4 w-4" />;
    case "attraction":
      return <MapPin className="h-4 w-4" />;
    case "transport":
      return <Car className="h-4 w-4" />;
    case "break":
      return <Coffee className="h-4 w-4" />;
    default:
      return <Calendar className="h-4 w-4" />;
  }
}

function getItemTypeColor(itemType: string) {
  switch (itemType) {
    case "event":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "restaurant":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "attraction":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "transport":
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    case "break":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function ItineraryDays({
  trip,
  items,
  getItemsByDay,
  editable = false,
  onMoveItem,
  reordering = false,
}: ItineraryDaysProps) {
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({});
  const toggleDay = (day: number) => setExpandedDays((prev) => ({ ...prev, [day]: !prev[day] }));

  if (!items || items.length === 0) {
    return (
      <Alert>
        <AlertDescription>No itinerary items found for this trip.</AlertDescription>
      </Alert>
    );
  }

  const hasMappableStops = items.some((i) => i.content_details?.id);
  const mapPlaceholder = <div className="h-64 w-full rounded-lg bg-muted animate-pulse" aria-hidden="true" />;

  return (
    <div className="space-y-4">
      {/* Map preview of stops (lazy Leaflet, deferred until in view) */}
      {hasMappableStops && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Trip Map
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RevealOnVisible placeholder={mapPlaceholder}>
              <Suspense fallback={mapPlaceholder}>
                <TripMapPreview items={items} />
              </Suspense>
            </RevealOnVisible>
          </CardContent>
        </Card>
      )}

      {Object.entries(getItemsByDay(items)).map(([day, dayItems]) => {
        const dayNum = parseInt(day, 10);
        const dayDate = addDays(new Date(trip.start_date), dayNum - 1);
        const isExpanded = expandedDays[dayNum] !== false;
        const sorted = [...dayItems].sort((a, b) => a.order_index - b.order_index);

        return (
          <Card key={day}>
            <CardHeader className="cursor-pointer" onClick={() => toggleDay(dayNum)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                  Day {day}: {format(dayDate, "EEEE, MMMM d")}
                </CardTitle>
                <Badge variant="secondary">
                  {sorted.length} {sorted.length === 1 ? "activity" : "activities"}
                </Badge>
              </div>
            </CardHeader>
            {isExpanded && (
              <CardContent>
                <div className="space-y-4">
                  {sorted.map((item, idx) => (
                    <div key={item.item_id} className="flex gap-4 p-4 rounded-lg border bg-card">
                      <div className="flex flex-col items-center">
                        <div className={`p-2 rounded-full ${getItemTypeColor(item.item_type)}`}>
                          {getItemIcon(item.item_type)}
                        </div>
                        {idx < sorted.length - 1 && <div className="w-px h-full bg-border mt-2" />}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-medium">{item.title}</h4>
                            {item.start_time && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {item.start_time}
                                {item.end_time && ` - ${item.end_time}`}
                                {item.duration_minutes && (
                                  <span className="text-xs">({item.duration_minutes} min)</span>
                                )}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {item.estimated_cost && <Badge variant="outline">{item.estimated_cost}</Badge>}
                            {editable && onMoveItem && (
                              <div className="flex flex-col">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  aria-label={`Move ${item.title} earlier`}
                                  disabled={idx === 0 || reordering}
                                  onClick={() => onMoveItem(item, "up")}
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  aria-label={`Move ${item.title} later`}
                                  disabled={idx === sorted.length - 1 || reordering}
                                  onClick={() => onMoveItem(item, "down")}
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                        {item.location && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {item.location}
                          </p>
                        )}
                        {item.description && <p className="text-sm">{item.description}</p>}
                        {item.ai_reason && (
                          <p className="text-sm text-primary/80 italic flex items-start gap-1">
                            <Lightbulb className="h-3 w-3 mt-0.5 shrink-0" />
                            {item.ai_reason}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-sm text-muted-foreground bg-muted p-2 rounded">{item.notes}</p>
                        )}
                        {item.content_details && (
                          <Link
                            to={`/${item.content_details.type}s/${item.content_details.id}`}
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            View details
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export default ItineraryDays;
