import { Link } from "react-router-dom";
import { formatInTimeZone } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { PlanRow } from "@/components/account/PlanRow";
import { useMyPlans, WEEK_DAYS } from "@/hooks/useMyPlans";
import { addCentralDays, centralDateOf, type CentralDate } from "@/lib/timezone";

/** A Central calendar date as words. Noon UTC is the same date in every US zone. */
function formatDay(day: CentralDate, pattern: string): string {
  return formatInTimeZone(new Date(`${day}T12:00:00Z`), "UTC", pattern);
}

function dayHeading(day: CentralDate, today: CentralDate): string {
  if (day === today) return "Today";
  if (day === addCentralDays(today, 1)) return "Tomorrow";
  return formatDay(day, "EEEE, MMM d");
}

const SOURCE_NAME = {
  upcoming: "your RSVPs",
  saved: "your saved events",
  reminders: "your reminders",
} as const;

/**
 * The top of the Account home (account plan WP3 item 3, bet 1): the next seven
 * Central days of what this person said they'd do - going, interested, saved
 * events and pending reminders - as one agenda grouped by day, each row a link.
 *
 * Self-contained so the dashboard only has to place it. When a source fails
 * the rows that did load still show, with a line naming what is missing; the
 * empty state is reserved for "every source answered and there is nothing".
 */
export function YourWeek() {
  const { week, weekLoading, weekErrors, refetchWeek, sources } = useMyPlans();
  const today = centralDateOf();
  const lastDay = addCentralDays(today, WEEK_DAYS - 1);

  const failed = (Object.keys(weekErrors) as Array<keyof typeof weekErrors>).filter((key) => weekErrors[key]);
  const allFailed = failed.length === Object.keys(weekErrors).length;

  return (
    <section aria-labelledby="your-week-heading" className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 id="your-week-heading" className="text-lg font-semibold">
            Your week
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatDay(today, "MMM d")} to {formatDay(lastDay, "MMM d")}
          </p>
        </div>
        <Link
          to="/my-events"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary hover:underline"
        >
          See all
        </Link>
      </div>

      {weekLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading your week">
          <Skeleton className="h-12 w-full bg-muted" />
          <Skeleton className="h-12 w-full bg-muted" />
          <Skeleton className="h-12 w-4/5 bg-muted" />
        </div>
      ) : allFailed ? (
        <ErrorState
          compact
          error={sources.upcoming.error}
          title="We couldn't load your week"
          onRetry={refetchWeek}
        />
      ) : (
        <>
          {week.length > 0 ? (
            <ol className="space-y-4">
              {week.map(({ day, items }) => (
                <li key={day}>
                  <h3 className="mb-1 text-sm font-semibold text-muted-foreground">{dayHeading(day, today)}</h3>
                  <ul className="-mx-3">
                    {items.map((item) => (
                      <li key={item.event.id}>
                        <PlanRow event={item.event} reasons={item.reasons} reminderTypes={item.reminderTypes} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : failed.length === 0 ? (
            <div className="py-2">
              <p className="font-medium">Nothing planned this week</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Mark an event as going or save it, and it shows up here by day.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3 min-h-[44px]">
                <Link to="/events/this-weekend">See what's on this weekend</Link>
              </Button>
            </div>
          ) : null}

          {failed.length > 0 && (
            <div role="status" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>We couldn't load {failed.map((key) => SOURCE_NAME[key]).join(" or ")}.</span>
              <Button variant="link" size="sm" className="h-auto min-h-[44px] px-0" onClick={refetchWeek}>
                Retry
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
