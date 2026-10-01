/**
 * Area hubs: the one page the site links for each neighbourhood or suburb
 * (SEO-044). An article tagged "East Village" links to the East Village page
 * and that page lists the article back; a restaurant whose `neighborhood` is
 * east-village links there too.
 *
 * Built from the neighbourhood inventory (src/lib/neighborhoods.ts), so the
 * href is whatever neighborhoodHref says (SEO-040 moved East Village to
 * /things-to-do/east-village), plus Downtown, whose page is the pSEO area page
 * /things-to-do/downtown (SEO-040 301s /neighborhoods/downtown there).
 *
 * Matching is whole-word and case-insensitive over title, category and tags.
 * East Village's inventory terms include "Downtown Des Moines" for event
 * matching; that term is left out here so a downtown article is not also
 * filed under East Village.
 */
import { NEIGHBORHOODS, neighborhoodHref } from "./neighborhoods";

export interface AreaHub {
  /** neighbourhood slug, or "downtown" */
  key: string;
  name: string;
  href: string;
  terms: string[];
}

const SHARED_TERMS = new Set(["downtown des moines"]);

export const AREA_HUBS: readonly AreaHub[] = [
  {
    key: "downtown",
    name: "Downtown Des Moines",
    href: "/things-to-do/downtown",
    terms: ["Downtown", "Downtown Des Moines"],
  },
  ...NEIGHBORHOODS.map((n) => ({
    key: n.slug,
    name: n.name,
    href: neighborhoodHref(n),
    terms: [n.name, ...n.matchTerms].filter(
      (t, i, all) => !SHARED_TERMS.has(t.toLowerCase()) && all.indexOf(t) === i,
    ),
  })),
];

/**
 * restaurants.neighborhood values (SEO-060) that have no page of their own,
 * mapped to the page that covers them. Valley Junction is the historic
 * district of West Des Moines; SEO-060 sends its cuisine pages there too.
 */
const AREA_ALIASES: Record<string, string> = {
  "valley-junction": "west-des-moines",
};

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termPattern(terms: readonly string[]): RegExp {
  return new RegExp(`\\b(${terms.map(escape).join("|")})\\b`, "i");
}

const PATTERNS = new Map(AREA_HUBS.map((h) => [h.key, termPattern(h.terms)]));

export interface AreaTagged {
  title: string;
  category?: string | null;
  tags?: readonly string[] | null;
}

function haystack(a: AreaTagged): string {
  return [a.title, a.category ?? "", ...(a.tags ?? [])].join(" | ");
}

/** True when the article names this area in its title, category or tags. */
export function articleMatchesArea(article: AreaTagged, areaKey: string): boolean {
  return PATTERNS.get(areaKey)?.test(haystack(article)) ?? false;
}

/** The area hubs an article belongs to, in AREA_HUBS order. */
export function areaHubsForArticle(article: AreaTagged): Array<{ href: string; title: string }> {
  return AREA_HUBS.filter((h) => articleMatchesArea(article, h.key)).map((h) => ({
    href: h.href,
    title: h.name,
  }));
}

/**
 * The area hub for a slug or a name ("east-village", "Valley Junction",
 * "West Des Moines"), following AREA_ALIASES. Undefined when the area has no
 * page, so the caller links nowhere rather than to a 404.
 */
export function findAreaHub(value: string | null | undefined): AreaHub | undefined {
  if (!value) return undefined;
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const key = AREA_ALIASES[slug] ?? slug;
  return AREA_HUBS.find((h) => h.key === key);
}

/**
 * The area hub of a pSEO page about one place as a whole, or undefined.
 * /things-to-do/east-village is location + content_type "things-to-do" and
 * /guide/ankeny is location alone. A cuisine x area or season x area page
 * narrows the place further and is left out: its articles belong to the area
 * page above it.
 */
export function areaHubForPageDimensions(
  dimensions: ReadonlyArray<{ dimension: string; slug: string }>,
): AreaHub | undefined {
  const location = dimensions.filter((d) => d.dimension === "location");
  if (location.length !== 1) return undefined;
  const broad = dimensions.every(
    (d) => d.dimension === "location" || (d.dimension === "content_type" && d.slug === "things-to-do"),
  );
  return broad ? findAreaHub(location[0].slug) : undefined;
}
