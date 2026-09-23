/**
 * Which hubs an article belongs to, and which articles a hub shows (SEO-015
 * AC4, SEO-019 AC2: "every article links into its relevant hub and the hub
 * links back").
 *
 * Articles carry a free-text category and tags, so the match is by keyword
 * over category, tags and title. It only ever produces links between pages
 * that exist; a miss costs a link, never a wrong claim.
 */
export type HubKey = "events" | "restaurants" | "family" | "attractions" | "outdoors";

export const ARTICLE_HUBS: Record<HubKey, { href: string; title: string; pattern: RegExp }> = {
  events: {
    href: "/events",
    title: "Des Moines events",
    pattern: /\b(events?|festivals?|fest|concerts?|music|shows?|holiday|halloween|christmas|fair|parade|market)\b/i,
  },
  restaurants: {
    href: "/restaurants",
    title: "Des Moines restaurants",
    pattern: /\b(restaurants?|food|dining|eat|eats|brunch|breakfast|coffee|patio|soups?|pizza|burgers?|bars?|drinks?|brewer(y|ies)|tacos?|bbq)\b/i,
  },
  family: {
    href: "/events/kids",
    title: "Kids and family events",
    pattern: /\b(kids?|family|families|children|playgrounds?|pumpkin|patch(es)?|toddlers?)\b/i,
  },
  attractions: {
    href: "/attractions",
    title: "Des Moines attractions",
    pattern: /\b(attractions?|museums?|zoo|gardens?|capitol|sculpture|landmarks?|visitors?|tourists?)\b/i,
  },
  outdoors: {
    href: "/outdoors",
    title: "Outdoors and trails",
    pattern: /\b(outdoors?|trails?|parks?|hik(e|es|ing)|bik(e|es|ing)|lakes?|orchards?|apple|foliage)\b/i,
  },
};

export interface ArticleLike {
  title: string;
  category?: string | null;
  tags?: string[] | null;
}

function haystack(a: ArticleLike): string {
  return [a.title, a.category ?? "", ...(a.tags ?? [])].join(" ");
}

export function articleMatchesHub(article: ArticleLike, hub: HubKey): boolean {
  return ARTICLE_HUBS[hub].pattern.test(haystack(article));
}

/** The hubs an article links into, in a fixed order, plus /things-to-do always. */
export function hubsForArticle(article: ArticleLike): Array<{ href: string; title: string }> {
  const out = (Object.keys(ARTICLE_HUBS) as HubKey[])
    .filter((k) => articleMatchesHub(article, k))
    .map((k) => ({ href: ARTICLE_HUBS[k].href, title: ARTICLE_HUBS[k].title }));
  return [...out, { href: "/things-to-do", title: "Things to do in Des Moines" }];
}
