import { Link } from "react-router-dom";
import { Clock, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  dealTodayStatus,
  formatDealSchedule,
  hasDealSchedule,
  isDealLiveAt,
  orderDealsForVenue,
  useRestaurantDeals,
  type Deal,
} from "@/hooks/useDeals";
import { useMinuteClock } from "@/hooks/useMinuteClock";

interface RestaurantDealsProps {
  restaurantId: string;
  restaurantName: string;
}

interface RestaurantDealsListProps {
  deals: Deal[];
  restaurantName: string;
  now: Date;
}

function DealRow({ deal, now }: { deal: Deal; now: Date }) {
  const schedule = formatDealSchedule(deal);
  const liveNow = hasDealSchedule(deal) && isDealLiveAt(deal, now);
  const today = dealTodayStatus(deal, now);
  return (
    <li className="py-4 first:pt-0 last:pb-0" data-restaurant-deal>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-foreground">{deal.title}</h3>
        {liveNow && (
          <Badge variant="default" className="bg-green-700 text-white hover:bg-green-700">
            Running now
          </Badge>
        )}
      </div>
      {deal.discount_value && <p className="mt-1 font-semibold text-primary">{deal.discount_value}</p>}
      {schedule && (
        <p className="mt-1 flex items-center gap-1.5 text-sm">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span>{schedule}</span>
          {today && today.kind !== "running" && <span className="text-muted-foreground">&middot; {today.text}</span>}
        </p>
      )}
      {deal.description && <p className="mt-1 text-sm text-muted-foreground">{deal.description}</p>}
      {deal.terms && <p className="mt-1 text-xs italic text-muted-foreground">{deal.terms}</p>}
      {deal.code && (
        <p className="mt-1 text-sm">
          <Link to="/deals?category=restaurant" className="underline underline-offset-2 hover:text-primary">
            Get the code on the Deals page
          </Link>
        </p>
      )}
    </li>
  );
}

/**
 * The list itself, with the clock passed in so tests can fix it. Renders
 * nothing when no deal is in date: an empty "Deals" heading on every
 * restaurant without one would read as "we checked and there are none",
 * which is a claim about the venue we can't back.
 */
export function RestaurantDealsList({ deals, restaurantName, now }: RestaurantDealsListProps) {
  const ordered = orderDealsForVenue(deals, now);
  if (ordered.length === 0) return null;
  // The separator lives here so a restaurant with no deals gets no stray rule.
  return (
    <>
      <Separator className="my-8" />
      <section id="deals" aria-labelledby="restaurant-deals-heading" className="scroll-mt-20">
        <h2 id="restaurant-deals-heading" className="mb-1 flex items-center gap-2 text-xl font-bold text-foreground">
          <Tag className="h-5 w-5 text-primary" aria-hidden="true" />
          Deals and happy hours
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Specials listed for {restaurantName}, with the days and times they run in Des Moines time.
        </p>
        <ul className="divide-y divide-border">
          {ordered.map((deal) => (
            <DealRow key={deal.id} deal={deal} now={now} />
          ))}
        </ul>
        <p className="mt-4 text-sm">
          <Link to="/deals?category=restaurant" className="font-medium text-primary hover:underline">
            More dining deals in Des Moines
          </Link>
        </p>
      </section>
    </>
  );
}

/** The restaurant's in-date deals and happy hours, re-evaluated each minute. */
export function RestaurantDeals({ restaurantId, restaurantName }: RestaurantDealsProps) {
  const now = useMinuteClock();
  const { data } = useRestaurantDeals(restaurantId);
  if (!data || data.length === 0) return null;
  return <RestaurantDealsList deals={data} restaurantName={restaurantName} now={now} />;
}
