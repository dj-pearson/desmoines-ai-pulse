import { linkHost } from "@/lib/eventSchema";
import { centralDateLabel } from "@/lib/eventMeta";
import { hasSpecificTime } from "@/lib/timezone";

export interface EventProvenanceProps {
  event: {
    date: string | Date | null;
    event_start_utc?: string | null;
    event_start_local?: string | null;
    time_tbd?: boolean | null;
    source_url?: string | null;
    source_url_broken?: boolean | null;
    source_url_checked_at?: string | null;
  };
  className?: string;
}

/**
 * Where the time on this page came from (events-pass2 WP4 item 6, bet 3).
 *
 *   "Time from ticketmaster.com, link checked Sep 25, 2026"
 *   "The source didn't publish a start time"
 *
 * Nothing when the link checker flagged the source broken, since naming a
 * dead page as the authority would be worse than naming none. Every word is
 * absolute, so the prerendered HTML is still true when a crawler reads it a
 * week later: no "yesterday", no "2 days ago".
 */
export function EventProvenance({ event, className }: EventProvenanceProps) {
  if (event.source_url_broken) return null;

  const date = event.date instanceof Date ? event.date.toISOString() : event.date;
  if (!hasSpecificTime({ ...event, date })) {
    return (
      <span className={className ?? "block text-xs text-muted-foreground"}>
        The source didn't publish a start time
      </span>
    );
  }

  const host = linkHost(event.source_url);
  if (!host) return null;
  const checked = centralDateLabel(event.source_url_checked_at);
  return (
    <span className={className ?? "block text-xs text-muted-foreground"}>
      Time from {host}
      {checked ? `, link checked ${checked}` : ""}
    </span>
  );
}
