/**
 * SEO-039: the monthly "New restaurants in Des Moines: {Month YYYY}" article,
 * built only from restaurants rows through the same rule as /restaurants/new
 * (src/lib/newRestaurants.ts). Every sentence is a template over row fields:
 * name, slug, opening_date, cuisine, location, source_url. Descriptions and
 * AI write-ups are never read, so nothing here can repeat a claim we have not
 * stored as a field.
 *
 * Published by scripts/publish-new-restaurants-article.ts, which refuses when
 * fewer than MIN_ARTICLE_OPENINGS rows qualify: a "roundup" of one or two
 * places is thinner than the hub it links to.
 */
import { openingDay } from "@/lib/restaurantOpenings";
import {
  hasOpeningSource,
  isEvidencedOpeningSoon,
  longDay,
  monthLabel,
  openingsInMonth,
  type NewRestaurantRow,
} from "@/lib/newRestaurants";
import { wordCount } from "@/lib/weekendArticle";

export const MIN_ARTICLE_OPENINGS = 3;

export interface ArticleRestaurantRow extends NewRestaurantRow {
  slug?: string | null;
}

export interface NewRestaurantsArticle {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  seo_title: string;
  seo_description: string;
  seo_keywords: string[];
  word_count: number;
  counts: { opened: number; openingSoon: number };
}

function md(text: string): string {
  return text.replace(/\s+/g, " ").replace(/([\\`*_[\]<>|#])/g, "\\$1").trim();
}

function pathOf(r: ArticleRestaurantRow): string {
  return `/restaurants/${r.slug || r.id}`;
}

/** A cuisine worth printing: not empty, not a placeholder. */
function cuisineOf(r: ArticleRestaurantRow): string | null {
  const c = r.cuisine?.trim();
  return c && !/^(restaurant|other|unknown|n\/a)$/i.test(c) ? c : null;
}

/** "2026-10" -> "new-restaurants-in-des-moines-october-2026" */
export function newRestaurantsArticleSlug(month: string): string {
  return `new-restaurants-in-des-moines-${monthLabel(month).toLowerCase().replace(/\s+/g, "-")}`;
}

/** The month after "2026-10" is "2026-11"; after "2026-12", "2027-01". */
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function buildNewRestaurantsArticle(
  rows: readonly ArticleRestaurantRow[],
  month: string,
  publishedOn: string,
  now: Date = new Date(),
): NewRestaurantsArticle {
  const label = monthLabel(month);
  const opened = openingsInMonth(rows, month, now);
  const soon = rows
    .filter((r) => isEvidencedOpeningSoon(r, now))
    .sort((a, b) => ((openingDay(a.opening_date) ?? "") < (openingDay(b.opening_date) ?? "") ? -1 : 1));

  const n = opened.length;
  const title = `New restaurants in Des Moines: ${label}`;
  const out: string[] = [];
  out.push(
    `**Published ${longDay(publishedOn)}.** ${n === 1 ? "1 restaurant" : `${n} restaurants`} opened in the Des Moines area in ${label}, going by the opening date recorded on each Des Moines Insider listing. Each name links to the listing with its address and hours. For every opening in the past 12 months, see [new restaurants in Des Moines](/restaurants/new).`,
    "",
    `## Opened in ${label}`,
    "",
  );
  for (const r of opened) {
    out.push(`### [${md(r.name)}](${pathOf(r)})`, "");
    out.push(`- Opened ${longDay(openingDay(r.opening_date) as string)}`);
    const cuisine = cuisineOf(r);
    if (cuisine) out.push(`- Cuisine: ${md(cuisine)}`);
    if (r.location?.trim()) out.push(`- Address: ${md(r.location)}`);
    if (hasOpeningSource(r)) out.push(`- [Opening report](${r.source_url?.trim()})`);
    out.push("");
  }

  if (soon.length > 0) {
    out.push("## Opening soon", "");
    for (const r of soon) {
      out.push(
        `- [${md(r.name)}](${pathOf(r)}): opening date given as ${longDay(openingDay(r.opening_date) as string)} ([source](${r.source_url?.trim()}))`,
      );
    }
    out.push("");
  }

  out.push(
    "## How this list is made",
    "",
    "A restaurant is listed when the opening date on its Des Moines Insider listing falls in the month, it is not marked closed, and it is not still marked as opening soon. The date we added a place to the site is not used, because most listings were added long after the place opened. Places announced without a firm date and a source are left out until they have one. If you know of an opening we missed, or a date that is wrong, tell us through the [contact page](/contact).",
    "",
    "## More places to eat",
    "",
    "- [New restaurants in Des Moines](/restaurants/new) (past 12 months)",
    "- [Restaurants open now](/restaurants/open-now)",
    "- [All Des Moines restaurants](/restaurants)",
  );

  const content = out.join("\n");
  const names = opened.slice(0, 3).map((r) => r.name.replace(/\s+/g, " ").trim());
  const nameText =
    names.length === 0 ? "" : names.length === 1 ? `: ${names[0]}` : `, including ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const monthName = label.split(" ")[0];
  const year = month.slice(0, 4);

  return {
    title,
    slug: newRestaurantsArticleSlug(month),
    excerpt: `${n} ${n === 1 ? "restaurant" : "restaurants"} opened in the Des Moines area in ${label}${nameText}.`,
    content,
    category: "Food & Drink",
    tags: ["new restaurants", "restaurant openings", "des moines restaurants", label.toLowerCase()],
    seo_title: `New Restaurants in Des Moines: ${label}`,
    seo_description: `${n} ${n === 1 ? "restaurant" : "restaurants"} that opened in Des Moines and its suburbs in ${label}, with opening dates and addresses from Des Moines Insider listings.`,
    seo_keywords: [
      "new restaurants des moines",
      `new restaurants des moines ${year}`,
      `des moines restaurant openings ${monthName.toLowerCase()} ${year}`,
      "des moines restaurant openings",
    ],
    word_count: wordCount(content),
    counts: { opened: n, openingSoon: soon.length },
  };
}
