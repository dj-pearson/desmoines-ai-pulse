import { BRAND } from "@/lib/brandConfig";
import { WEEKEND_ARTICLE_SLUG_PREFIX } from "@/lib/weekendArticle";

/**
 * Article JSON-LD for /articles/:slug (SEO-037).
 *
 * TYPE RULE. The articles table has no column that says "timely", so the type
 * comes from the slug, which every generator controls:
 *
 *   NewsArticle  - the slug starts with "this-weekend-in-des-moines-"
 *                  (src/lib/weekendArticle.ts, one per weekend), OR
 *                - it names an opening: "new-opening(s)", "grand-opening",
 *                  "restaurant-opening(s)", "opening(s)-in|at|this|near",
 *                  "now-open" or "new-restaurant(s)", each hyphen-delimited.
 *                  A bare "opening" is not enough ("eye-opening-history"), OR
 *                - it names a specific month and year, "october-2026", which is
 *                  how a month guide is dated.
 *   BlogPosting  - everything else: evergreen guides ("corn-mazes-near-des-moines").
 *
 * Google treats both as Article subtypes, so a misclassification costs nothing
 * worse than the generic Article this replaced.
 *
 * AUTHOR. No named person exists in the data: every published article carries
 * the same author_id, there is no author_profiles table in production (42P01,
 * probed 2026-10-01) and profiles is not publicly readable. Inventing a byline
 * would be worse than none, so the author is the Organization, pointing at
 * /about. Swap in a Person here once the owner supplies a name and bio.
 */

export type ArticleSchemaType = "NewsArticle" | "BlogPosting";

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december";

const OPENING_RE =
  /(?:^|-)(?:(?:new|grand|restaurant|business)-openings?|openings?-(?:in|at|this|near)|now-open|new-restaurants?)(?:-|$)/;
const MONTH_YEAR_RE = new RegExp(`(?:^|-)(?:${MONTHS})-20\\d{2}(?:-|$)`);

export function articleSchemaType(slug: string): ArticleSchemaType {
  const s = (slug || "").toLowerCase();
  if (s.startsWith(WEEKEND_ARTICLE_SLUG_PREFIX)) return "NewsArticle";
  if (OPENING_RE.test(s)) return "NewsArticle";
  if (MONTH_YEAR_RE.test(s)) return "NewsArticle";
  return "BlogPosting";
}

export const ABOUT_PATH = "/about";

export const ORGANIZATION_ID = `${BRAND.baseUrl}/#organization`;

export function organizationNode() {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: BRAND.name,
    url: BRAND.baseUrl,
    logo: {
      "@type": "ImageObject",
      url: `${BRAND.baseUrl}${BRAND.logo}`,
      width: 800,
      height: 800,
    },
    email: BRAND.email,
  };
}

export interface ArticleSchemaInput {
  slug: string;
  title: string;
  excerpt?: string | null;
  seo_description?: string | null;
  featured_image_url?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  category?: string | null;
  tags?: string[] | string | null;
  content?: string | null;
}

export function buildArticleJsonLd(article: ArticleSchemaInput) {
  const url = `${BRAND.baseUrl}/articles/${article.slug}`;
  const published = article.published_at || article.created_at;
  return {
    "@context": "https://schema.org",
    "@type": articleSchemaType(article.slug),
    headline: article.title,
    description: article.excerpt || article.seo_description || "",
    image: article.featured_image_url || `${BRAND.baseUrl}${BRAND.logo}`,
    datePublished: published,
    dateModified: article.updated_at || published,
    author: {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: BRAND.name,
      url: `${BRAND.baseUrl}${ABOUT_PATH}`,
    },
    publisher: organizationNode(),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    articleSection: article.category || "Local News",
    keywords: Array.isArray(article.tags) ? article.tags.join(", ") : article.tags || "",
    wordCount: article.content ? article.content.split(/\s+/).length : 0,
    inLanguage: "en-US",
    about: { "@type": "Place", name: "Des Moines, Iowa" },
  };
}
