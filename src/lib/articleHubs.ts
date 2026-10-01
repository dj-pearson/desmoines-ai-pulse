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
  /**
   * Written only by `ai-article-pipeline` (it is in the 2026-08-24 snapshot).
   * A score means the pipeline drafted the piece, whether or not it went on
   * to publish it itself (Plan & Stay pass 2 WP4 item 4).
   */
  quality_score?: number | null;
}

/**
 * Whether an article gets the AI badge. `ai-article-pipeline` sets
 * quality_score on everything it drafts and is_auto_published on what it
 * publishes with no human step; `generate-article` is meant to set
 * generated_from_suggestion_id, though no writer does yet (D7 adds a real
 * column). Any one is enough.
 */
export function isAiArticle(article: AiFlags): boolean {
  return Boolean(
    article.is_auto_published ||
      article.generated_from_suggestion_id ||
      (article.quality_score !== null && article.quality_score !== undefined),
  );
}

/** The short visible label for an AI article's badge. */
export function aiBadgeLabel(article: AiFlags): "AI-written" | "AI-assisted" {
  return article.is_auto_published ? "AI-written" : "AI-assisted";
}

const CHECK_WITH_VENUE =
  "Treat factual claims as a starting point and check dates, prices and hours with the venue before you rely on them.";

export const AI_AUTO_PUBLISHED_NOTICE = `Written by AI and published automatically after quality checks; not reviewed by an editor. ${CHECK_WITH_VENUE}`;

/** A pipeline draft that a person published: the pipeline scored it, it did not publish it. */
export const AI_SCORED_NOTICE = `Drafted by AI, scored by automated checks, and published by a person on our team. ${CHECK_WITH_VENUE}`;

/**
 * Suggestion-generated drafts. The first pass said "trained on public data"
 * and "reviewed by a human editor"; nothing records either, so neither is
 * claimed.
 */
export const AI_ASSISTED_NOTICE = `Drafted with the help of an AI model. ${CHECK_WITH_VENUE}`;

/** The disclosure body for an AI article, or null for one that is not. */
export function aiDisclosureText(article: AiFlags): string | null {
  if (article.is_auto_published) return AI_AUTO_PUBLISHED_NOTICE;
  if (article.quality_score !== null && article.quality_score !== undefined) return AI_SCORED_NOTICE;
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

// ---------------------------------------------------------------------------
// "Places to try" from a food article (Plan & Stay pass 2 WP4 item 6).
// ---------------------------------------------------------------------------

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

/**
 * True when a restaurant's free-text cuisine shares a whole word with one of
 * the article's tags: tag "pizza" matches "Pizza, Italian", tag "bbq" matches
 * "BBQ", and "bar" does not match "Barbecue".
 */
export function cuisineMatchesTags(cuisine: string | null | undefined, tags: readonly string[] | null | undefined): boolean {
  if (!cuisine || !tags || tags.length === 0) return false;
  const cuisineWords = new Set(words(cuisine));
  return tags.some((tag) => {
    const tw = words(tag);
    return tw.length > 0 && tw.every((w) => cuisineWords.has(w));
  });
}

/**
 * Cuisine matches first, then the input order (which is popularity, best
 * first). Stable, so two matches keep their popularity order.
 */
export function preferCuisineMatches<T extends { cuisine?: string | null }>(
  rows: readonly T[],
  tags: readonly string[] | null | undefined,
): T[] {
  return rows
    .map((row, index) => ({ row, index, match: cuisineMatchesTags(row.cuisine, tags) ? 0 : 1 }))
    .sort((a, b) => a.match - b.match || a.index - b.index)
    .map((s) => s.row);
}

// ---------------------------------------------------------------------------
// Links inside an article body (Plan & Stay pass 2 WP4 item 12).
// ---------------------------------------------------------------------------

export type ArticleHref =
  | { kind: "internal"; path: string }
  | { kind: "external"; href: string }
  | { kind: "other"; href: string };

/**
 * How a markdown link renders. A site path, or an absolute URL on the site's
 * own host, is an in-app route. Another http(s) host is external and gets
 * rel="nofollow noopener". Anything else (mailto:, tel:, a fragment) is left
 * as a plain anchor.
 */
export function classifyArticleHref(href: string | null | undefined, siteOrigin: string): ArticleHref {
  const raw = (href ?? "").trim();
  if (raw.startsWith("/") && !raw.startsWith("//")) return { kind: "internal", path: raw };
  let url: URL;
  try {
    url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
  } catch {
    return { kind: "other", href: raw };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "other", href: raw };
  let siteHost = "";
  try {
    siteHost = new URL(siteOrigin).host.replace(/^www\./, "");
  } catch {
    siteHost = "";
  }
  if (siteHost && url.host.replace(/^www\./, "") === siteHost) {
    return { kind: "internal", path: `${url.pathname}${url.search}${url.hash}` || "/" };
  }
  return { kind: "external", href: url.toString() };
}
