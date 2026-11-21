/**
 * Open Graph `og:type` values (WEB-SEO-068).
 *
 * The protocol defines a fixed list (https://ogp.me/#types). Pages here used
 * to write their own words into og:type ("event", "restaurant", "business",
 * "local_business", "attraction", "place"), none of which is on it, so a
 * parser either falls back to "website" or flags the page. Components keep
 * their descriptive `type` props for other uses; whatever reaches the meta tag
 * goes through toOgType().
 */
export const OG_TYPES = [
  "website",
  "article",
  "profile",
  "book",
  "music.song",
  "music.album",
  "music.playlist",
  "music.radio_station",
  "video.movie",
  "video.episode",
  "video.tv_show",
  "video.other",
] as const;

export type OgType = (typeof OG_TYPES)[number];

const OG_TYPE_SET: ReadonlySet<string> = new Set(OG_TYPES);

export function isOgType(value: string): value is OgType {
  return OG_TYPE_SET.has(value);
}

/**
 * Map a page's descriptive type to a valid og:type. Values already on the
 * list pass through; everything else (event, restaurant, business, ...) is a
 * page about a thing, which Open Graph calls "website".
 */
export function toOgType(value: string | undefined | null): OgType {
  return value && isOgType(value) ? value : "website";
}
