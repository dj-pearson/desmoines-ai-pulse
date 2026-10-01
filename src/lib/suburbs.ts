import { findNeighborhood } from "@/lib/neighborhoods";

/**
 * The suburb inventory behind /events/<slug> (WEB-SEO-036 AC5).
 *
 * This lived inside EventsByLocation.tsx, where nothing else could read it -
 * and that is exactly the shape neighborhoods.ts was written to stop. Two
 * inventories described the same seven or eight places, neither knew the other
 * existed, and so /neighborhoods/ankeny and /events/ankeny never linked to each
 * other despite being the two pages about Ankeny on this site.
 *
 * THE TWO LISTS DO NOT MATCH, AND THAT IS NOT A BUG TO FIX HERE. Seven slugs
 * are in both. `east-village` has a neighborhood guide and no events page;
 * `windsor-heights` has an events page and no guide. So a cross-link is
 * conditional on the other side existing, which is why hasSuburbPage() and
 * hasNeighborhoodGuide() exist rather than a hardcoded pair of link lists.
 * App.tsx mounts each /events/<suburb> path one by one with no catch-all behind
 * them, so a slug added here without its route links to a 404.
 *
 * Waukee joined in the events plan (WP7): it already had a guide and was the
 * one western suburb with no events page.
 *
 * scripts/check-neighborhood-inventory.mjs asserts this list and App.tsx's
 * routes stay in step.
 */

/**
 * `nearby` names the suburb pages that share a border or a main road with
 * this one, for the "Events in nearby suburbs" links (events-pass2 WP5 item
 * 7). Every entry must be a SUBURBS key; src/lib/__tests__/eventAreas.test.ts
 * checks it.
 *
 * There is no search-term list any more. Matching is by place, through the
 * suburb's city area in src/lib/eventAreas.ts (events-pass2 WP5 item 6); the
 * old substring terms put "Urbandale Ave, Des Moines" on /events/urbandale.
 */
export const SUBURBS = {
  "west-des-moines": {
    name: "West Des Moines",
    description:
      "West Des Moines offers family-friendly events, outdoor activities, and cultural attractions in the heart of Iowa.",
    neighborhoods: ["Valley Junction", "Jordan Creek", "Clive"],
    nearby: ["clive", "windsor-heights", "waukee", "urbandale"],
  },
  ankeny: {
    name: "Ankeny",
    description:
      "Ankeny is known for its community events, parks, and family activities just north of Des Moines.",
    neighborhoods: ["Downtown Ankeny", "Prairie Trail"],
    nearby: ["johnston", "altoona"],
  },
  urbandale: {
    name: "Urbandale",
    description:
      "Urbandale hosts seasonal festivals, community gatherings, and outdoor recreation events.",
    neighborhoods: ["Downtown Urbandale", "Living History Farms"],
    nearby: ["johnston", "clive", "windsor-heights"],
  },
  johnston: {
    name: "Johnston",
    description:
      "Johnston features community events, outdoor activities, and family-friendly attractions.",
    neighborhoods: ["Downtown Johnston", "Terra Park"],
    nearby: ["urbandale", "ankeny"],
  },
  altoona: {
    name: "Altoona",
    description:
      "Altoona is home to Adventureland and hosts numerous family events and community celebrations.",
    neighborhoods: ["Downtown Altoona", "Adventureland Area"],
    nearby: ["ankeny"],
  },
  clive: {
    name: "Clive",
    description:
      "Clive offers upscale events, outdoor activities, and community gatherings in west Des Moines metro.",
    neighborhoods: ["Clive Village", "Greenbelt Trail"],
    nearby: ["west-des-moines", "urbandale", "windsor-heights", "waukee"],
  },
  "windsor-heights": {
    name: "Windsor Heights",
    description:
      "Windsor Heights hosts intimate community events and local gatherings in a charming suburban setting.",
    neighborhoods: ["Downtown Windsor Heights"],
    nearby: ["clive", "urbandale", "west-des-moines"],
  },
  waukee: {
    name: "Waukee",
    description:
      "Waukee's calendar runs through Centennial Park, Triumph Park and the Waukee Family YMCA, with youth sports and community festivals on the west edge of the metro.",
    neighborhoods: ["Downtown Waukee", "Centennial Park", "Triumph Park"],
    nearby: ["clive", "west-des-moines", "urbandale"],
  },
};

export type SuburbSlug = keyof typeof SUBURBS;

/** Does /events/<slug> exist? Used to decide whether to render a cross-link. */
export function hasSuburbPage(slug: string): slug is SuburbSlug {
  return Object.prototype.hasOwnProperty.call(SUBURBS, slug);
}

/** Does /neighborhoods/<slug> exist? Pairs a suburb events pill with its guide. */
export function hasNeighborhoodGuide(slug: string): boolean {
  return findNeighborhood(slug)?.prerender === true;
}

/** Suburb event pages in inventory order, for directories that list them all. */
export const SUBURB_EVENT_PAGES: Array<{ slug: SuburbSlug; name: string; href: string }> = (
  Object.keys(SUBURBS) as SuburbSlug[]
).map((slug) => ({ slug, name: SUBURBS[slug].name, href: `/events/${slug}` }));

export function findSuburb(slug: string | null | undefined) {
  if (!slug || !hasSuburbPage(slug)) return null;
  return SUBURBS[slug];
}
