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

/**
 * The hub an article's live listings come from: the first match in
 * ARTICLE_HUBS order, or null when nothing matches (then no listings render).
 */
export function primaryHubForArticle(article: ArticleLike): HubKey | null {
  const keys = Object.keys(ARTICLE_HUBS) as HubKey[];
  return keys.find((k) => articleMatchesHub(article, k)) ?? null;
}

// ---------------------------------------------------------------------------
// How an article presents itself (Plan & Stay WP4 items 1 and 8). Pure, so the
// disclosure and date rules are unit tested without rendering the page.
// ---------------------------------------------------------------------------

export interface AiFlags {
  is_auto_published?: boolean | null;
  generated_from_suggestion_id?: string | null;
}

/**
 * Whether an article gets the AI badge. `ai-article-pipeline` publishes with
 * is_auto_published and no human step; `generate-article` is meant to set
 * generated_from_suggestion_id, though no writer does yet (D7 adds a real
 * column). Either one is enough.
 */
export function isAiArticle(article: AiFlags): boolean {
  return Boolean(article.is_auto_published || article.generated_from_suggestion_id);
}

export const AI_AUTO_PUBLISHED_NOTICE =
  "Written by AI and published automatically after quality checks; not reviewed by an editor. Treat factual claims as a starting point and check dates, prices and hours with the venue before you rely on them.";

export const AI_ASSISTED_NOTICE =
  "This article was drafted with the help of an AI model trained on public data and reviewed by a human editor before publishing. Treat factual claims as a starting point, not a final source. If you're making a decision (reservations, travel, purchases), verify with the venue or original source first.";

/** The disclosure body for an AI article, or null for one that is not. */
export function aiDisclosureText(article: AiFlags): string | null {
  if (article.is_auto_published) return AI_AUTO_PUBLISHED_NOTICE;
  if (article.generated_from_suggestion_id) return AI_ASSISTED_NOTICE;
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** True when updated_at is more than a day after the publish date. */
export function wasMeaningfullyUpdated(publishedAt: string | null | undefined, updatedAt: string | null | undefined): boolean {
  const p = toMs(publishedAt);
  const u = toMs(updatedAt);
  if (p === null || u === null) return false;
  return u - p > DAY_MS;
}

/** Days after which an article carries the "check current listings" note. */
export const STALE_ARTICLE_DAYS = 180;

export function isStaleArticle(publishedAt: string | null | undefined, now: Date = new Date()): boolean {
  const p = toMs(publishedAt);
  if (p === null) return false;
  return now.getTime() - p > STALE_ARTICLE_DAYS * DAY_MS;
}

/** "N min read" at 200 words a minute, never less than one. */
export function readTimeLabel(content: string | null | undefined): string {
  const words = (content ?? "").trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
}

export interface ScoredArticle {
  id: string;
  slug: string | null;
  title: string;
  category?: string | null;
  tags?: string[] | null;
}

/**
 * Related reading: two points per shared tag (case-insensitive), one for the
 * same category. The article itself and anything scoring zero are dropped;
 * ties keep the input order, which is newest first.
 */
export function relatedArticles<T extends ScoredArticle>(
  current: { id: string; category?: string | null; tags?: string[] | null },
  candidates: readonly T[],
  limit = 3,
): T[] {
  const tags = new Set((current.tags ?? []).map((t) => t.toLowerCase()));
  const category = (current.category ?? "").toLowerCase();
  return candidates
    .filter((c) => c.id !== current.id && c.slug)
    .map((c, index) => {
      const shared = (c.tags ?? []).filter((t) => tags.has(t.toLowerCase())).length;
      const sameCategory = category !== "" && (c.category ?? "").toLowerCase() === category ? 1 : 0;
      return { c, index, score: shared * 2 + sameCategory };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((s) => s.c);
}
