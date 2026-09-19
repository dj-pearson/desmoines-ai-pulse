/**
 * The suburb inventory behind /events/<slug> (WEB-SEO-036 AC5).
 *
 * This lived inside EventsByLocation.tsx, where nothing else could read it -
 * and that is exactly the shape neighborhoods.ts was written to stop. Two
 * inventories described the same seven or eight places, neither knew the other
 * existed, and so /neighborhoods/ankeny and /events/ankeny never linked to each
 * other despite being the two pages about Ankeny on this site.
 *
 * THE TWO LISTS DO NOT MATCH, AND THAT IS NOT A BUG TO FIX HERE. Six slugs are
 * in both. `east-village` and `waukee` have a neighborhood guide and no events
 * page; `windsor-heights` has an events page and no guide. So a cross-link is
 * conditional on the other side existing, which is why hasSuburbPage() and
 * hasNeighborhoodGuide() exist rather than a hardcoded pair of link lists.
 * Linking to /events/waukee would 404 - App.tsx mounts these seven paths one by
 * one, and there is no catch-all behind them.
 *
 * scripts/check-neighborhood-inventory.mjs asserts this list and App.tsx's
 * routes stay in step.
 */

export const SUBURBS = {
  "west-des-moines": {
    name: "West Des Moines",
    searchTerms: ["West Des Moines", "WDM", "Valley Junction"],
    description:
      "West Des Moines offers family-friendly events, outdoor activities, and cultural attractions in the heart of Iowa.",
    neighborhoods: ["Valley Junction", "Jordan Creek", "Clive"],
  },
  ankeny: {
    name: "Ankeny",
    searchTerms: ["Ankeny"],
    description:
      "Ankeny is known for its community events, parks, and family activities just north of Des Moines.",
    neighborhoods: ["Downtown Ankeny", "Prairie Trail"],
  },
  urbandale: {
    name: "Urbandale",
    searchTerms: ["Urbandale"],
    description:
      "Urbandale hosts seasonal festivals, community gatherings, and outdoor recreation events.",
    neighborhoods: ["Downtown Urbandale", "Living History Farms"],
  },
  johnston: {
    name: "Johnston",
    searchTerms: ["Johnston"],
    description:
      "Johnston features community events, outdoor activities, and family-friendly attractions.",
    neighborhoods: ["Downtown Johnston", "Terra Park"],
  },
  altoona: {
    name: "Altoona",
    searchTerms: ["Altoona", "Adventureland"],
    description:
      "Altoona is home to Adventureland and hosts numerous family events and community celebrations.",
    neighborhoods: ["Downtown Altoona", "Adventureland Area"],
  },
  clive: {
    name: "Clive",
    searchTerms: ["Clive"],
    description:
      "Clive offers upscale events, outdoor activities, and community gatherings in west Des Moines metro.",
    neighborhoods: ["Clive Village", "Greenbelt Trail"],
  },
  "windsor-heights": {
    name: "Windsor Heights",
    searchTerms: ["Windsor Heights"],
    description:
      "Windsor Heights hosts intimate community events and local gatherings in a charming suburban setting.",
    neighborhoods: ["Downtown Windsor Heights"],
  },
};

export type SuburbSlug = keyof typeof SUBURBS;

/** Does /events/<slug> exist? Used to decide whether to render a cross-link. */
export function hasSuburbPage(slug: string): slug is SuburbSlug {
  return Object.prototype.hasOwnProperty.call(SUBURBS, slug);
}

export function findSuburb(slug: string | null | undefined) {
  if (!slug || !hasSuburbPage(slug)) return null;
  return SUBURBS[slug];
}
