import { Helmet } from "react-helmet-async";
import { Event } from "@/lib/types";
import { buildEventItemList } from "@/lib/eventSchema";
import { toJsonLd } from "@/lib/jsonLd";

interface EventListJsonLdProps {
  events: Event[];
  listName: string;
  listDescription: string;
  listUrl: string;
  /** Max events to include in schema (default 50) */
  maxItems?: number;
}

/**
 * ItemList of Event nodes for a list or hub page.
 *
 * SEO-002: the node itself is built by src/lib/eventSchema.ts, not here. This
 * file used to carry its own copy of the builder, and EventsPage.tsx carried a
 * second one - which is how /events shipped 30 Event nodes with no endDate
 * while /events/this-weekend and /events/today shipped theirs with it, from the
 * same data on the same site. The omitted-field reasoning (organizer,
 * performer, offers, addressLocality) moved with the builder and is documented
 * at the top of that file.
 *
 * This component renders on the PRERENDERED hub pages (/events/today,
 * /events/this-weekend, /events/free, /events/kids, /events/date-night and the
 * monthly pages), which is exactly the HTML the JS-less crawlers read.
 *
 * toJsonLd, not JSON.stringify: names and descriptions are scraped, and a
 * description holding "</script>" ended the block and let the rest parse as
 * markup on every one of those prerendered pages (events-pass2 WP6 item 1).
 */
export function EventListJsonLd({
  events,
  listName,
  listDescription,
  listUrl,
  maxItems = 50,
}: EventListJsonLdProps) {
  if (!events || events.length === 0) return null;

  const itemListSchema = buildEventItemList(
    events,
    { name: listName, description: listDescription, url: listUrl },
    maxItems,
  );

  return (
    <Helmet>
      <script type="application/ld+json">{toJsonLd(itemListSchema)}</script>
    </Helmet>
  );
}

export default EventListJsonLd;
