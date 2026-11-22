import { useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isRpcMissing, ownerRefusalMessage, useUpdateClaimedListing } from "@/hooks/useMyBusinessClaims";
import { handleError } from "@/lib/errorHandler";
import {
  MAX_RANGES_PER_DAY,
  WEEKDAY_NAMES,
  WEEK_ORDER,
  isOwnerHours,
  weekFromStoredHours,
  weekToPeriods,
  type Weekday,
  type WeekHours,
} from "@/lib/ownerHours";

export interface OwnerHoursFormProps {
  listingId: string;
  listingName: string;
  /** restaurants.hours_json as loaded: Google's, the owner's, or null. */
  hoursJson: unknown;
}

const NEW_RANGE = { open: "11:00", close: "21:00" };

/**
 * Weekly hours for a verified restaurant owner (WEB-ADS-048). Saved through
 * update_claimed_listing as hours_json periods; the database rebuilds and
 * locks them, so the nightly Google refresh leaves them alone until the
 * owner hands the hours back to Google here.
 */
export function OwnerHoursForm({ listingId, listingName, hoursJson }: OwnerHoursFormProps) {
  const [week, setWeek] = useState<WeekHours>(() => weekFromStoredHours(hoursJson));
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateClaimedListing();
  const ownerSet = isOwnerHours(hoursJson);
  const idFor = (day: Weekday, part: string) => `hours-${listingId}-${day}-${part}`;

  const setDay = (day: Weekday, next: WeekHours[Weekday]) => setWeek((w) => ({ ...w, [day]: next }));

  const save = async (patch: Parameters<typeof update.mutateAsync>[0]["patch"], done: string) => {
    setError(null);
    try {
      await update.mutateAsync({ listingType: "restaurant", listingId, patch });
      toast.success(done);
    } catch (e) {
      if (isRpcMissing(e)) {
        setError("Hours can't be saved yet. Try again later.");
        return;
      }
      handleError(e, { component: "OwnerHoursForm", action: "update_claimed_listing hours" });
      const message = ownerRefusalMessage(e);
      setError(message ? `Those hours didn't save: ${message}.` : "Those hours didn't save. Try again.");
    }
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = weekToPeriods(week);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    void save({ hours_json: { periods: result.periods } }, `Hours for ${listingName} are updated.`);
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-label={`Hours for ${listingName}`} className="space-y-4">
      <div>
        <h4 className="text-base font-semibold">Opening hours</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          {ownerSet
            ? "These are the hours you set. Google's daily check won't change them."
            : "These are the hours Google has for you. Once you save, yours replace them and Google's daily check won't change them."}{" "}
          A closing time earlier than the opening time means you close after midnight.
        </p>
      </div>

      <ul className="space-y-3">
        {WEEK_ORDER.map((day) => {
          const hours = week[day];
          const name = WEEKDAY_NAMES[day];
          return (
            <li key={day} className="space-y-2">
              <div className="flex min-h-11 items-center gap-3">
                <Checkbox
                  id={idFor(day, "open")}
                  checked={!hours.closed}
                  onCheckedChange={(checked) =>
                    setDay(day, {
                      closed: checked !== true,
                      ranges: checked === true && hours.ranges.length === 0 ? [{ ...NEW_RANGE }] : hours.ranges,
                    })
                  }
                />
                <Label htmlFor={idFor(day, "open")} className="w-28 font-medium">
                  {name}
                </Label>
                {hours.closed && <span className="text-sm text-muted-foreground">Closed</span>}
              </div>
              {!hours.closed && (
                <div className="space-y-2 pl-7">
                  {hours.ranges.map((range, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label htmlFor={idFor(day, `o${i}`)} className="text-xs">
                          {name} opens
                        </Label>
                        <Input
                          id={idFor(day, `o${i}`)}
                          type="time"
                          className="min-h-11 w-36"
                          value={range.open}
                          onChange={(e) =>
                            setDay(day, {
                              ...hours,
                              ranges: hours.ranges.map((r, j) => (j === i ? { ...r, open: e.target.value } : r)),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={idFor(day, `c${i}`)} className="text-xs">
                          {name} closes
                        </Label>
                        <Input
                          id={idFor(day, `c${i}`)}
                          type="time"
                          className="min-h-11 w-36"
                          value={range.close}
                          onChange={(e) =>
                            setDay(day, {
                              ...hours,
                              ranges: hours.ranges.map((r, j) => (j === i ? { ...r, close: e.target.value } : r)),
                            })
                          }
                        />
                      </div>
                      {i > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-11"
                          onClick={() => setDay(day, { ...hours, ranges: hours.ranges.filter((_, j) => j !== i) })}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  {hours.ranges.length < MAX_RANGES_PER_DAY && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => setDay(day, { ...hours, ranges: [...hours.ranges, { open: "17:00", close: "21:00" }] })}
                    >
                      Add a second time on {name}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="min-h-11" disabled={update.isPending} aria-busy={update.isPending}>
          {update.isPending ? "Saving..." : "Save hours"}
        </Button>
        {ownerSet && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={update.isPending}
            onClick={() => void save({ hours_json: null }, "Google's hours will come back on its next check.")}
          >
            Use Google's hours instead
          </Button>
        )}
      </div>
    </form>
  );
}
