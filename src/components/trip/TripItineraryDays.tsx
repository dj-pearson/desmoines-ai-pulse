import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { addDays, format } from "date-fns";
import { ArrowDown, ArrowUp, CalendarPlus, Car, ChevronDown, ChevronRight, Coffee, Lightbulb, Music, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { clockMinutes, parseDateOnly } from "@/lib/dateOnly";
import { formatClockLabel } from "@/lib/restaurantHours";
import { googleCalendarUrl } from "@/lib/tripCalendar";
import type { TripPlan, TripPlanItem } from "@/hooks/useTripPlanner";

interface TripItineraryDaysProps {
  trip: TripPlan;
  items: TripPlanItem[];
  /**
   * Move a stop earlier (-1) or later (1) within its day. Omit for a
   * read-only view, such as the shared-trip page (plan-stay D10).
   */
  onMoveItem?: (dayItems: TripPlanItem[], idx: number, dir: -1 | 1) => void;
  /** Download one day as .ics. Omit to hide the per-day button. */
  onAddDayToCalendar?: (items: TripPlanItem[], dayNum: number) => void;
}

/** "6 PM", or null for a missing or unreadable time. */
function clockLabel(value: string | null): string | null {
  const minutes = clockMinutes(value);
  return minutes == null ? null : formatClockLabel(minutes);
}

function itemIcon(itemType: string): ReactNode {
  switch (itemType) {
    case "event": return <Music className="h-4 w-4" aria-hidden="true" />;
    case "restaurant": return <Utensils className="h-4 w-4" aria-hidden="true" />;
    case "attraction": return <SpriteIcon name="map-pin" className="h-4 w-4" />;
    case "transport": return <Car className="h-4 w-4" aria-hidden="true" />;
    case "break": return <Coffee className="h-4 w-4" aria-hidden="true" />;
    default: return <SpriteIcon name="calendar" className="h-4 w-4" />;
  }
}

/** Group by day number, days in order, stops in order within each day. */
function groupDays(items: TripPlanItem[]): Array<[number, TripPlanItem[]]> {
  const byDay = new Map<number, TripPlanItem[]>();
  for (const item of items) {
    const day = item.day_number || 1;
    const list = byDay.get(day) ?? [];
    list.push(item);
    byDay.set(day, list);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, list]) => [day, [...list].sort((a, b) => a.order_index - b.order_index)]);
}

/**
 * The day-by-day itinerary (plan-stay WP1 item 8), extracted from
 * TripPlanner so the shared-trip page can render the same list read-only.
 * Day dates come from `parseDateOnly`, so "2026-10-02" is Friday, October 2
 * in every zone, and times print as "6 PM" rather than "18:00:00".
 */
export function TripItineraryDays({ trip, items, onMoveItem, onAddDayToCalendar }: TripItineraryDaysProps) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const start = parseDateOnly(trip.start_date);

  return (
    <div className="space-y-4">
      {groupDays(items).map(([dayNum, dayItems]) => {
        const isExpanded = !collapsed[dayNum];
        const panelId = `trip-day-${dayNum}`;
        return (
          <section key={dayNum} className="rounded-xl border bg-card">
            <div className="flex items-center justify-between gap-2 p-2 sm:p-3">
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={panelId}
                onClick={() => setCollapsed((prev) => ({ ...prev, [dayNum]: isExpanded }))}
                className="flex min-h-11 flex-1 items-center gap-2 rounded-lg px-2 text-left text-lg font-semibold hover:bg-muted/50"
              >
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
                )}
                Day {dayNum}: {format(addDays(start, dayNum - 1), "EEEE, MMMM d")}
              </button>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {dayItems.length} {dayItems.length === 1 ? "stop" : "stops"}
                </Badge>
                {onAddDayToCalendar && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11"
                    aria-label={`Download Day ${dayNum} as a calendar file`}
                    title="Download this day (.ics)"
                    onClick={() => onAddDayToCalendar(dayItems, dayNum)}
                  >
                    <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
            {isExpanded && (
              <ol id={panelId} className="space-y-3 px-3 pb-4 sm:px-4">
                {dayItems.map((item, idx) => {
                  const startLabel = clockLabel(item.start_time);
                  const endLabel = clockLabel(item.end_time);
                  return (
                    <li key={item.item_id} className="flex gap-3 rounded-lg border p-3 sm:gap-4 sm:p-4">
                      <div className="mt-0.5 shrink-0 rounded-full bg-muted p-2 text-foreground">
                        {itemIcon(item.item_type)}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-medium">{item.title}</h4>
                            {startLabel && (
                              <p className="text-sm text-muted-foreground">
                                {startLabel}
                                {endLabel && ` - ${endLabel}`}
                                {item.duration_minutes ? ` (${item.duration_minutes} min)` : ""}
                              </p>
                            )}
                          </div>
                          {item.estimated_cost && <Badge variant="outline">{item.estimated_cost}</Badge>}
                        </div>
                        {item.location && (
                          <p className="flex items-center gap-1 text-sm text-muted-foreground">
                            <SpriteIcon name="map-pin" className="h-3 w-3" />
                            {item.location}
                          </p>
                        )}
                        {item.description && <p className="text-sm">{item.description}</p>}
                        {item.ai_reason && (
                          <p className="flex items-start gap-1 text-sm text-muted-foreground">
                            <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                            {item.ai_reason}
                          </p>
                        )}
                        {item.notes && <p className="rounded bg-muted p-2 text-sm text-muted-foreground">{item.notes}</p>}
                        {item.content_details && (
                          <Link
                            to={`/${item.content_details.type}s/${item.content_details.id}`}
                            className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline"
                          >
                            View details
                          </Link>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        {onMoveItem && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-11 min-w-11"
                              disabled={idx === 0}
                              onClick={() => onMoveItem(dayItems, idx, -1)}
                              aria-label={`Move ${item.title} earlier`}
                            >
                              <ArrowUp className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-11 min-w-11"
                              disabled={idx === dayItems.length - 1}
                              onClick={() => onMoveItem(dayItems, idx, 1)}
                              aria-label={`Move ${item.title} later`}
                            >
                              <ArrowDown className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </>
                        )}
                        <a
                          href={googleCalendarUrl(trip, item)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                          aria-label={`Add ${item.title} to Google Calendar (opens in a new tab)`}
                          title="Add to Google Calendar"
                        >
                          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
