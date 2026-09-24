import {
  desMoinesNow,
  formatClockLabel,
  resolveOpeningHoursSpecification,
  type RestaurantOpenResult,
  type StoredOpeningHours,
} from "@/lib/restaurantHours";
import { cn } from "@/lib/utils";

interface RestaurantStatusProps {
  /** The free-text `opening` column. */
  hours?: string | null;
  /** restaurants.hours_json when the row carries it (select("*") does once the column exists). */
  hoursJson?: StoredOpeningHours | null;
  /**
   * From the page's useRestaurantOpenStatus, so this block and the hero badge
   * read one evaluation. Null when the place is closed for good or not open
   * yet: the page shows a notice instead and no open/closed claim is made.
   */
  openStatus: RestaurantOpenResult | null;
  /** The minute clock the status was evaluated at, for "today". */
  now: Date;
}

/** Display order, Monday first. Values are getDay() numbers. */
const WEEK: Array<{ day: number; label: string; schema: string }> = [
  { day: 1, label: "Monday", schema: "Monday" },
  { day: 2, label: "Tuesday", schema: "Tuesday" },
  { day: 3, label: "Wednesday", schema: "Wednesday" },
  { day: 4, label: "Thursday", schema: "Thursday" },
  { day: 5, label: "Friday", schema: "Friday" },
  { day: 6, label: "Saturday", schema: "Saturday" },
  { day: 0, label: "Sunday", schema: "Sunday" },
];

function clockMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  // The schema builders clamp a midnight close to 23:59; print it as midnight.
  return minutes === 23 * 60 + 59 ? 24 * 60 : minutes;
}

function rangeLabel(opens: string, closes: string): string | null {
  const o = clockMinutes(opens);
  const c = clockMinutes(closes);
  if (o === null || c === null) return null;
  if (o === 0 && c === 24 * 60) return "Open 24 hours";
  return `${formatClockLabel(o)} - ${formatClockLabel(c)}`;
}

/**
 * One row per weekday from the same parsed hours the schema publishes, or null
 * when nothing parses. A day with no range reads "Closed", which is what the
 * open/closed evaluator says for that day too.
 */
function weekRows(
  hoursJson: StoredOpeningHours | null | undefined,
  hours: string | null | undefined,
): Array<{ day: number; label: string; text: string }> | null {
  const specs = resolveOpeningHoursSpecification(hoursJson, hours);
  if (!specs) return null;
  return WEEK.map(({ day, label, schema }) => {
    const ranges = specs
      .filter((s) => s.dayOfWeek.includes(schema))
      .map((s) => ({ key: clockMinutes(s.opens) ?? 0, text: rangeLabel(s.opens, s.closes) }))
      .filter((r): r is { key: number; text: string } => r.text !== null)
      .sort((a, b) => a.key - b.key)
      .map((r) => r.text);
    return { day, label, text: ranges.length > 0 ? ranges.join(", ") : "Closed" };
  });
}

/** "Open until 10 PM CT", "Opens tomorrow 11 AM CT", or null when unknown. */
function statusSentence(result: RestaurantOpenResult | null): string | null {
  if (!result) return null;
  switch (result.status) {
    case "open":
      return result.closesAt ? `Open until ${result.closesAt} CT` : "Open 24 hours";
    case "closing-soon":
      return result.closesAt ? `Closing soon, at ${result.closesAt} CT` : "Closing soon";
    case "closed":
      return result.nextOpensAt ? `Closed now. Opens ${result.nextOpensAt} CT` : "Closed now";
    default:
      return null;
  }
}

const TONE: Record<string, string> = {
  open: "text-emerald-700 dark:text-emerald-400",
  "closing-soon": "text-amber-700 dark:text-amber-400",
  closed: "text-red-700 dark:text-red-400",
};

/**
 * Hours for the detail page: today's status in Des Moines time, then the
 * week, with today marked. The one hours block on the page; the page used to
 * print the raw text twice and add a second Call/Website pair and a
 * "Last updated" clock here (restaurants plan WP8 item 9).
 */
export function RestaurantStatus({ hours, hoursJson, openStatus, now }: RestaurantStatusProps) {
  const rows = weekRows(hoursJson, hours);
  const today = desMoinesNow(now).getDay();
  const sentence = statusSentence(openStatus);
  const rawText = typeof hours === "string" && hours.trim() ? hours.trim() : null;

  if (!rows && !rawText) {
    return (
      <section aria-labelledby="hours-heading" id="hours">
        <h2 id="hours-heading" className="text-xl font-bold text-foreground">
          Hours
        </h2>
        <p className="mt-2 text-muted-foreground">
          We don't have hours for this place yet. Call ahead before you go.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="hours-heading" id="hours">
      <h2 id="hours-heading" className="text-xl font-bold text-foreground">
        Hours
      </h2>
      {sentence && openStatus && (
        <p className={cn("mt-2 text-lg font-semibold", TONE[openStatus.status] ?? "text-foreground")}>
          {sentence}
        </p>
      )}

      {rows ? (
        <table className="mt-4 w-full max-w-md text-sm">
          <caption className="sr-only">Opening hours by day, Central time</caption>
          <tbody>
            {rows.map((row) => {
              const isToday = row.day === today;
              return (
                <tr
                  key={row.day}
                  className={cn("border-b last:border-0", isToday && "bg-muted font-semibold")}
                  aria-current={isToday ? "date" : undefined}
                >
                  <th scope="row" className="py-2 pl-2 pr-4 text-left font-medium text-foreground">
                    {row.label}
                    {isToday && <span className="ml-2 text-xs font-normal text-muted-foreground">today</span>}
                  </th>
                  <td className="py-2 pr-2 text-right tabular-nums text-foreground">{row.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-foreground">{rawText}</p>
      )}

      {rows && rawText && (
        <p className="mt-3 text-xs text-muted-foreground">Listed as: {rawText}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Holiday hours can differ. Call ahead if it matters.
      </p>
    </section>
  );
}

export default RestaurantStatus;
