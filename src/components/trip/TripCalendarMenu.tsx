/**
 * TripCalendarMenu (WEB-FEAT-011) — export an itinerary to a calendar.
 * Offers a whole-trip .ics, a per-day .ics for each day, and a Google Calendar
 * deep-link for the trip span.
 */
import { addDays, format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Calendar, Download, ChevronDown } from "lucide-react";
import { downloadTripIcs, getTripGoogleCalendarUrl } from "@/lib/tripCalendar";
import type { TripPlan, TripPlanItem } from "@/hooks/useTripPlanner";

interface TripCalendarMenuProps {
  trip: TripPlan;
  items: TripPlanItem[];
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function TripCalendarMenu({ trip, items, variant = "outline", size = "sm" }: TripCalendarMenuProps) {
  const days = Array.from(new Set(items.map((i) => i.day_number))).sort((a, b) => a - b);
  const hasItems = items.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={!hasItems}>
          <Calendar className="h-4 w-4 mr-1" />
          Add to Calendar
          <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Export itinerary</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => window.open(getTripGoogleCalendarUrl(trip, items), "_blank", "noopener,noreferrer")}
        >
          <Calendar className="h-4 w-4 mr-2" />
          Google Calendar (whole trip)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadTripIcs(trip, items)}>
          <Download className="h-4 w-4 mr-2" />
          Download whole trip (.ics)
        </DropdownMenuItem>
        {days.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">By day</DropdownMenuLabel>
            {days.map((day) => {
              const dayDate = addDays(new Date(trip.start_date), day - 1);
              return (
                <DropdownMenuItem key={day} onClick={() => downloadTripIcs(trip, items, day)}>
                  <Download className="h-4 w-4 mr-2" />
                  Day {day} · {format(dayDate, "MMM d")} (.ics)
                </DropdownMenuItem>
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default TripCalendarMenu;
