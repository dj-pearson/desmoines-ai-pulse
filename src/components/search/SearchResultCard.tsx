import { Link } from "react-router-dom";
import { BedDouble, Utensils } from "lucide-react";
import { OptimizedImage } from "@/components/OptimizedImage";
import type { EventPairing } from "@/hooks/useSearchPairings";
import type { SearchRow } from "@/hooks/useSearchResults";
import { hotelRateLabel } from "@/lib/hotelBooking";
import { searchResultHref, type SearchResultType } from "@/lib/searchResultHref";
import { formatEventDateShort } from "@/lib/timezone";
import { formatCentralTime, formatMiles } from "@/lib/tonightPairings";

interface SearchResultCardProps {
  item: SearchRow;
  type: SearchResultType;
  /** Events only: the dinner and hotel lines. Absent means neither renders. */
  pairing?: EventPairing;
  onOpen?: (item: SearchRow, type: SearchResultType) => void;
}

const CLOSED_STATUSES: Record<string, string> = {
  closed: "Closed",
  permanently_closed: "Closed",
  temporarily_closed: "Temporarily closed",
};

/** "Opening soon", "Closed", or null. Read from the row's own status and opening date. */
function restaurantStatusLabel(row: SearchRow, now: Date = new Date()): string | null {
  const status = row.status ?? "";
  if (CLOSED_STATUSES[status]) return CLOSED_STATUSES[status];
  if (status === "opening_soon" || status === "announced") return "Opening soon";
  if (row.opening_date) {
    const opens = Date.parse(row.opening_date);
    if (Number.isFinite(opens) && opens > now.getTime()) return "Opening soon";
  }
  return null;
}

function rowTitle(item: SearchRow): string {
  return item.title || item.name || "Untitled";
}

function rowDescription(item: SearchRow, type: SearchResultType): string {
  if (type === "hotels") return item.short_description || item.description || "";
  return item.enhanced_description || item.original_description || item.description || "";
}

/** The facts line under the title, per type. Only columns the row carries; nothing derived. */
function metaParts(item: SearchRow, type: SearchResultType): string[] {
  const parts: Array<string | null | undefined> = [];
  switch (type) {
    case "events":
      parts.push(item.venue || item.location, item.price);
      break;
    case "restaurants":
      parts.push(item.cuisine, item.price_range, restaurantStatusLabel(item));
      break;
    case "attractions":
      parts.push(item.type, item.is_free ? "Free" : null);
      break;
    case "hotels":
      parts.push(item.area || item.city);
      break;
  }
  return parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
}

/**
 * One result. The title link is stretched over the card so the whole card is a
 * target; the pairing links sit above it (relative z-10) so they stay their own
 * targets instead of being links nested in a link.
 */
export function SearchResultCard({ item, type, pairing, onOpen }: SearchResultCardProps) {
  const href = searchResultHref(item, type);
  const title = rowTitle(item);
  const description = rowDescription(item, type);
  const meta = metaParts(item, type);
  const when = type === "events" ? formatEventDateShort(item) : null;
  const rate = type === "hotels" ? hotelRateLabel(item.avg_nightly_rate) : null;
  const dinner = pairing?.dinner ?? null;
  const stay = pairing?.stay ?? null;

  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground transition-colors hover:border-primary/60 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2"
      data-result-type={type}
    >
      {item.image_url && (
        <div className="relative h-36 overflow-hidden">
          <OptimizedImage
            src={item.image_url}
            alt=""
            className="object-cover"
            containerClassName="h-full w-full"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {when && (
          <p className="text-sm font-semibold text-primary">
            <time dateTime={item.event_start_utc || item.date || undefined}>{when}</time>
          </p>
        )}
        <h3 className="line-clamp-2 text-base font-semibold leading-snug">
          <Link
            to={href}
            onClick={() => onOpen?.(item, type)}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none group-hover:underline"
          >
            {title}
          </Link>
        </h3>
        {meta.length > 0 && <p className="text-sm text-muted-foreground">{meta.join(" \u00b7 ")}</p>}
        {rate && <p className="text-sm text-muted-foreground">{rate}</p>}
        {description && <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>}

        {(dinner || stay) && (
          <ul className="relative z-10 mt-auto space-y-1 border-t pt-3 text-sm">
            {dinner && (
              <li className="flex items-start gap-2">
                <Utensils className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>
                  Dinner nearby:{" "}
                  <Link
                    to={searchResultHref(
                      { id: dinner.restaurant.id, name: dinner.restaurant.name, slug: dinner.restaurant.slug },
                      "restaurants",
                    )}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {dinner.restaurant.name}
                  </Link>
                  , {formatMiles(dinner.distanceMiles)}, open at {formatCentralTime(dinner.dinnerAt)}
                </span>
              </li>
            )}
            {stay && (
              <li className="flex items-start gap-2">
                <BedDouble className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>
                  Stay:{" "}
                  <Link
                    to={searchResultHref({ id: stay.hotel.id, name: stay.hotel.name, slug: stay.hotel.slug }, "hotels")}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {stay.hotel.name}
                  </Link>
                  , {formatMiles(stay.distanceMiles)} (straight line)
                </span>
              </li>
            )}
          </ul>
        )}
      </div>
    </article>
  );
}
