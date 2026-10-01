/**
 * Where a /search result goes (search plan WP2 item 1).
 *
 * /search used to link every card as `/${type}/${item.id}`. The event and
 * attraction detail pages resolve a SLUG - events a date-suffixed one, and
 * attractions by slug or createSlug(name), never by id (resolveBySlug.ts) - so
 * every event and attraction result opened Not Found. Each type now builds its
 * link the way its own list page does. Same rules as NLPSearchBar's private
 * resultHref, which Home WP1 switches to this module.
 */
import { createSlug } from "@/lib/slug";
import { createEventSlugWithCentralTime } from "@/lib/timezone";

export type SearchResultType = "events" | "restaurants" | "attractions" | "hotels";

/** The columns a link needs. Rows arrive raw (snake_case), so every one is optional. */
export interface SearchResultLinkable {
  id: string;
  title?: string | null;
  name?: string | null;
  slug?: string | null;
  date?: string | Date | null;
  event_start_utc?: string | null;
}

export function searchResultHref(item: SearchResultLinkable, type: SearchResultType): string {
  switch (type) {
    case "events":
      return `/events/${createEventSlugWithCentralTime(item.title ?? null, item)}`;
    case "attractions": {
      const slug = item.slug || createSlug(item.name ?? "");
      return slug ? `/attractions/${slug}` : "/attractions";
    }
    case "restaurants":
      return `/restaurants/${item.slug || item.id}`;
    case "hotels":
      // /stay/:slug resolves by slug only. A hotel row without one has no
      // detail page to open, so the hub is the honest destination.
      return item.slug ? `/stay/${item.slug}` : "/stay";
  }
}
