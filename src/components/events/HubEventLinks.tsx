import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { WeekendEventRow } from "@/lib/weekendArticle";
import { HUB_PICK_RULE } from "@/lib/eventHubSummary";
import { createEventSlugWithCentralTime, formatEventDateShort } from "@/lib/timezone";
import { cn } from "@/lib/utils";

/**
 * SEO-036. Two plain link lists the event hubs share: the top picks above the
 * cards, and the events past a day's card cap below them. A list item is a
 * link and one line of text (date, venue), about five DOM nodes against a
 * card's hundred, so every event the page counts can be in the HTML without
 * undoing the card cap (WEB-PERF-023).
 */

function eventLine(event: WeekendEventRow): string {
  return [formatEventDateShort(event), event.venue || event.location].filter(Boolean).join(" - ");
}

export interface EventLinkListProps {
  events: readonly WeekendEventRow[];
  className?: string;
  "aria-labelledby"?: string;
}

/** Title links with date and venue, one per line. */
export function EventLinkList({ events, className, ...rest }: EventLinkListProps) {
  if (events.length === 0) return null;
  return (
    <ul className={cn("divide-y rounded-xl border", className)} aria-labelledby={rest["aria-labelledby"]}>
      {events.map((event) => (
        <li key={event.id} className="px-4 py-3">
          <Link
            to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {event.title}
          </Link>
          <p className="text-sm text-muted-foreground">{eventLine(event)}</p>
        </li>
      ))}
    </ul>
  );
}

export interface HubTopPicksProps {
  /** Already chosen, by hubTopPicks. */
  picks: readonly WeekendEventRow[];
  heading: string;
  headingId: string;
  /** The newest weekly roundup (SEO-035); no link when there is none. */
  article?: { slug: string; title: string } | null;
  className?: string;
  children?: ReactNode;
}

/** The picks block: heading, the rule in words, the links, the weekly article. */
export function HubTopPicks({ picks, heading, headingId, article, className, children }: HubTopPicksProps) {
  if (picks.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className={cn("mb-8", className)}>
      <h2 id={headingId} className="text-2xl font-bold mb-2">
        {heading}
      </h2>
      <p className="mb-3 max-w-3xl text-sm text-muted-foreground">{HUB_PICK_RULE}</p>
      <EventLinkList events={picks} />
      {article && (
        <p className="mt-3 text-sm">
          The full weekly roundup:{" "}
          <Link
            to={`/articles/${article.slug}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {article.title}
          </Link>
        </p>
      )}
      {children}
    </section>
  );
}
