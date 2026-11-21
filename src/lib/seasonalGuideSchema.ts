import { BRAND } from "@/lib/brandConfig";
import { ABOUT_PATH, ORGANIZATION_ID, organizationNode } from "@/lib/articleSchema";

/**
 * Head metadata and Article JSON-LD for /guides/:slug (WEB-SEO-067).
 *
 * The page used to write its own <Helmet>: a title, a canonical, a description
 * and an Article node fed to a bare JSON.stringify. No og:* or twitter:* tags
 * at all, so index.html's shell values won and a shared guide previewed as the
 * home page ("Des Moines Insider - events, restaurants...") with no og:url.
 * The Article node had no image, no publisher, no dateModified and no
 * mainEntityOfPage, which are the fields Google's Article guidelines list, and
 * a "</script>" in an admin-typed title would have closed the tag early.
 *
 * Shapes follow buildArticleJsonLd (articleSchema.ts): the Organization is the
 * author, pointing at /about, because seasonal_guides has no author column.
 */

export interface SeasonalGuideSchemaInput {
  slug: string;
  title: string;
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  cover_image?: string | null;
  publish_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export function seasonalGuidePath(slug: string): string {
  return `/guides/${slug}`;
}

/** An absolute http(s) URL, else null: a relative or junk value is not an og:image. */
export function guideImageUrl(guide: Pick<SeasonalGuideSchemaInput, "cover_image">): string | null {
  const raw = guide.cover_image?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** publish_date, else created_at; null when neither is set. */
export function guidePublishedAt(guide: SeasonalGuideSchemaInput): string | null {
  return guide.publish_date || guide.created_at || null;
}

/**
 * The meta description. Never empty: the old page emitted content="" for a
 * guide with neither column, which is worse than a plain sentence that is true.
 */
export function guideMetaDescription(guide: SeasonalGuideSchemaInput): string {
  const own = (guide.seo_description || guide.description || "").trim();
  if (own) return own;
  return `${guide.title}: a Des Moines guide from ${BRAND.name}.`;
}

export function guideMetaTitle(guide: SeasonalGuideSchemaInput): string {
  return (guide.seo_title || guide.title).trim();
}

export function buildSeasonalGuideJsonLd(guide: SeasonalGuideSchemaInput) {
  const url = `${BRAND.baseUrl}${seasonalGuidePath(guide.slug)}`;
  const published = guidePublishedAt(guide);
  const modified = guide.updated_at || published;
  const description = (guide.description || guide.seo_description || "").trim();
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    ...(description ? { description } : {}),
    image: guideImageUrl(guide) || `${BRAND.baseUrl}${BRAND.ogImage}`,
    ...(published ? { datePublished: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    author: {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: BRAND.name,
      url: `${BRAND.baseUrl}${ABOUT_PATH}`,
    },
    publisher: organizationNode(),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    inLanguage: "en-US",
    about: { "@type": "Place", name: "Des Moines, Iowa" },
  };
}
