/**
 * pSEO 2.0 Page Type Definitions
 *
 * Each page type defines:
 * - Which dimension combination it uses
 * - URL pattern
 * - Title/H1/meta description templates
 * - Content structure (sections)
 * - Data requirements
 * - Estimated page count
 *
 * Page types are ordered by priority (highest traffic potential first).
 */

import type { DimensionKey, DimensionValue, PageTypeConfig } from './taxonomy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dimName(
  dims: Partial<Record<DimensionKey, DimensionValue>>,
  key: DimensionKey
): string {
  return dims[key]?.name ?? '';
}

function dimSlug(
  dims: Partial<Record<DimensionKey, DimensionValue>>,
  key: DimensionKey
): string {
  return dims[key]?.slug ?? '';
}

// ---------------------------------------------------------------------------
// Page Type 1: Content + Location
// "Things to Do in East Village" / "Restaurants in Downtown"
// ---------------------------------------------------------------------------

export const contentLocationPageType: PageTypeConfig = {
  id: 'content-location',
  name: 'Content + Location',
  description: 'Core geo pages: combines content type with neighborhood/suburb',
  dimensions: ['content_type', 'location'],
  estimatedPages: 6 * 17, // 6 content types × 17 locations = 102

  buildSlug: (dims) =>
    `/${dimSlug(dims, 'content_type')}/${dimSlug(dims, 'location')}`,

  buildTitle: (dims) =>
    `${dimName(dims, 'content_type')} in ${dimName(dims, 'location')} | Des Moines Insider`,

  buildH1: (dims) =>
    `Best ${dimName(dims, 'content_type')} in ${dimName(dims, 'location')}`,

  buildMetaDescription: (dims) =>
    `Discover the best ${dimName(dims, 'content_type').toLowerCase()} in ${dimName(dims, 'location')}. Local insider picks, reviews, and tips updated for ${new Date().getFullYear()}.`,
};

// ---------------------------------------------------------------------------
// Page Type 2: Content + Audience
// "Family-Friendly Things to Do" / "Date Night Restaurants"
// ---------------------------------------------------------------------------

export const contentAudiencePageType: PageTypeConfig = {
  id: 'content-audience',
  name: 'Content + Audience',
  description: 'Intent pages: combines content type with audience/intent',
  dimensions: ['content_type', 'audience'],
  estimatedPages: 6 * 9, // 54

  buildSlug: (dims) =>
    `/${dimSlug(dims, 'content_type')}/${dimSlug(dims, 'audience')}`,

  buildTitle: (dims) =>
    `${dimName(dims, 'content_type')} ${dimName(dims, 'audience')} in Des Moines | Des Moines Insider`,

  buildH1: (dims) =>
    `${dimName(dims, 'audience')} ${dimName(dims, 'content_type')} in Des Moines`,

  buildMetaDescription: (dims) =>
    `${dimName(dims, 'audience')} guide to ${dimName(dims, 'content_type').toLowerCase()} in Des Moines, Iowa. Curated recommendations with insider tips.`,
};

// ---------------------------------------------------------------------------
// Page Type 3: Content + Temporal
// "Things to Do This Weekend" / "Events Today"
// ---------------------------------------------------------------------------

export const contentTemporalPageType: PageTypeConfig = {
  id: 'content-temporal',
  name: 'Content + Temporal',
  description: 'Time-sensitive pages: combines content type with time modifier',
  dimensions: ['content_type', 'temporal'],
  estimatedPages: 6 * 22, // 132

  buildSlug: (dims) =>
    `/${dimSlug(dims, 'content_type')}/${dimSlug(dims, 'temporal')}`,

  buildTitle: (dims) => {
    const temporal = dimName(dims, 'temporal');
    const content = dimName(dims, 'content_type');
    return `${content} ${temporal} in Des Moines | Des Moines Insider`;
  },

  buildH1: (dims) =>
    `Des Moines ${dimName(dims, 'content_type')} — ${dimName(dims, 'temporal')}`,

  buildMetaDescription: (dims) =>
    `Find ${dimName(dims, 'content_type').toLowerCase()} happening ${dimName(dims, 'temporal').toLowerCase()} in Des Moines. Updated in real-time.`,
};

// ---------------------------------------------------------------------------
// Page Type 4: Content + Category
// "Italian Restaurants" / "Live Music Events"
// ---------------------------------------------------------------------------

export const contentCategoryPageType: PageTypeConfig = {
  id: 'content-category',
  name: 'Content + Category',
  description: 'Category pages: combines content type with specific category',
  dimensions: ['content_type', 'category'],
  estimatedPages: 6 * 16, // 96

  buildSlug: (dims) =>
    `/${dimSlug(dims, 'content_type')}/${dimSlug(dims, 'category')}`,

  buildTitle: (dims) =>
    `Best ${dimName(dims, 'category')} ${dimName(dims, 'content_type')} in Des Moines | Des Moines Insider`,

  buildH1: (dims) =>
    `Best ${dimName(dims, 'category')} ${dimName(dims, 'content_type')} in Des Moines`,

  buildMetaDescription: (dims) =>
    `Discover the best ${dimName(dims, 'category').toLowerCase()} ${dimName(dims, 'content_type').toLowerCase()} in Des Moines. Expert picks, reviews, and local tips.`,
};

// ---------------------------------------------------------------------------
// Page Type 5: Content + Location + Audience (Triple combo)
// "Family Restaurants in East Village" / "Date Night in Downtown"
// ---------------------------------------------------------------------------

export const contentLocationAudiencePageType: PageTypeConfig = {
  id: 'content-location-audience',
  name: 'Content + Location + Audience',
  description: 'High-specificity triple combo for long-tail keywords',
  dimensions: ['content_type', 'location', 'audience'],
  estimatedPages: 4 * 8 * 5, // top content × top locations × top audiences = 160

  buildSlug: (dims) =>
    `/${dimSlug(dims, 'content_type')}/${dimSlug(dims, 'location')}/${dimSlug(dims, 'audience')}`,

  buildTitle: (dims) =>
    `${dimName(dims, 'audience')} ${dimName(dims, 'content_type')} in ${dimName(dims, 'location')} | Des Moines Insider`,

  buildH1: (dims) =>
    `${dimName(dims, 'audience')} ${dimName(dims, 'content_type')} in ${dimName(dims, 'location')}`,

  buildMetaDescription: (dims) =>
    `${dimName(dims, 'audience')} guide to ${dimName(dims, 'content_type').toLowerCase()} in ${dimName(dims, 'location')}. Curated by locals.`,
};

// ---------------------------------------------------------------------------
// Page Type 6: Content + Location + Temporal
// "Events in Downtown This Weekend" / "Restaurants in East Village Tonight"
// ---------------------------------------------------------------------------

export const contentLocationTemporalPageType: PageTypeConfig = {
  id: 'content-location-temporal',
  name: 'Content + Location + Temporal',
  description: 'Geo + time pages for high-intent local searches',
  dimensions: ['content_type', 'location', 'temporal'],
  estimatedPages: 4 * 8 * 6, // top content × top locations × seasons+today/weekend = 192

  buildSlug: (dims) =>
    `/${dimSlug(dims, 'content_type')}/${dimSlug(dims, 'location')}/${dimSlug(dims, 'temporal')}`,

  buildTitle: (dims) =>
    `${dimName(dims, 'content_type')} in ${dimName(dims, 'location')} — ${dimName(dims, 'temporal')} | Des Moines Insider`,

  buildH1: (dims) =>
    `${dimName(dims, 'content_type')} in ${dimName(dims, 'location')} ${dimName(dims, 'temporal')}`,

  buildMetaDescription: (dims) =>
    `Discover ${dimName(dims, 'content_type').toLowerCase()} in ${dimName(dims, 'location')} ${dimName(dims, 'temporal').toLowerCase()}. Updated in real-time with local insider picks.`,
};

// ---------------------------------------------------------------------------
// Page Type 7: Category + Location
// "Italian Restaurants in East Village" / "Live Music in Downtown"
// ---------------------------------------------------------------------------

export const categoryLocationPageType: PageTypeConfig = {
  id: 'category-location',
  name: 'Category + Location',
  description: 'Highly specific category + geo combination',
  dimensions: ['category', 'location'],
  estimatedPages: 10 * 10, // top categories × top locations = 100

  buildSlug: (dims) =>
    `/${dimSlug(dims, 'category')}/${dimSlug(dims, 'location')}`,

  buildTitle: (dims) =>
    `Best ${dimName(dims, 'category')} in ${dimName(dims, 'location')} | Des Moines Insider`,

  buildH1: (dims) =>
    `Best ${dimName(dims, 'category')} in ${dimName(dims, 'location')}`,

  buildMetaDescription: (dims) =>
    `Find the best ${dimName(dims, 'category').toLowerCase()} in ${dimName(dims, 'location')}. Local reviews, prices, and insider tips.`,
};

// ---------------------------------------------------------------------------
// Page Type 8: Audience + Temporal
// "Family Things to Do This Weekend" / "Date Night Ideas Tonight"
// ---------------------------------------------------------------------------

export const audienceTemporalPageType: PageTypeConfig = {
  id: 'audience-temporal',
  name: 'Audience + Temporal',
  description: 'High-intent audience + time combination',
  dimensions: ['audience', 'temporal'],
  estimatedPages: 6 * 6, // top audiences × key temporal = 36

  buildSlug: (dims) =>
    `/things-to-do/${dimSlug(dims, 'audience')}/${dimSlug(dims, 'temporal')}`,

  buildTitle: (dims) =>
    `${dimName(dims, 'audience')} Things to Do ${dimName(dims, 'temporal')} in Des Moines | Des Moines Insider`,

  buildH1: (dims) =>
    `${dimName(dims, 'audience')} Things to Do ${dimName(dims, 'temporal')} in Des Moines`,

  buildMetaDescription: (dims) =>
    `${dimName(dims, 'audience')} activities and events ${dimName(dims, 'temporal').toLowerCase()} in Des Moines. Curated recommendations updated in real-time.`,
};

// ---------------------------------------------------------------------------
// Page Type 9: Category + Temporal
// "Live Music This Weekend" / "Festivals This Summer"
// ---------------------------------------------------------------------------

export const categoryTemporalPageType: PageTypeConfig = {
  id: 'category-temporal',
  name: 'Category + Temporal',
  description: 'Category + time for seasonal/event searches',
  dimensions: ['category', 'temporal'],
  estimatedPages: 10 * 6, // 60

  buildSlug: (dims) =>
    `/${dimSlug(dims, 'category')}/${dimSlug(dims, 'temporal')}`,

  buildTitle: (dims) =>
    `${dimName(dims, 'category')} ${dimName(dims, 'temporal')} in Des Moines | Des Moines Insider`,

  buildH1: (dims) =>
    `Des Moines ${dimName(dims, 'category')} — ${dimName(dims, 'temporal')}`,

  buildMetaDescription: (dims) =>
    `Find the best ${dimName(dims, 'category').toLowerCase()} ${dimName(dims, 'temporal').toLowerCase()} in Des Moines. Updated guide with local picks.`,
};

// ---------------------------------------------------------------------------
// Page Type 10: Location Guide (single dimension hub)
// "Guide to East Village" / "Guide to Ankeny"
// ---------------------------------------------------------------------------

export const locationGuidePageType: PageTypeConfig = {
  id: 'location-guide',
  name: 'Location Guide',
  description: 'Comprehensive neighborhood/suburb guide — hub page for internal linking',
  dimensions: ['location'],
  estimatedPages: 17,

  buildSlug: (dims) =>
    `/guide/${dimSlug(dims, 'location')}`,

  buildTitle: (dims) =>
    `${dimName(dims, 'location')} Guide — Things to Do, Eat & Explore | Des Moines Insider`,

  buildH1: (dims) =>
    `Your Complete Guide to ${dimName(dims, 'location')}`,

  buildMetaDescription: (dims) =>
    `Everything you need to know about ${dimName(dims, 'location')}. Restaurants, events, attractions, and insider tips from locals.`,
};

// ---------------------------------------------------------------------------
// All Page Types
// ---------------------------------------------------------------------------

export const allPageTypes: PageTypeConfig[] = [
  contentLocationPageType,
  contentAudiencePageType,
  contentTemporalPageType,
  contentCategoryPageType,
  contentLocationAudiencePageType,
  contentLocationTemporalPageType,
  categoryLocationPageType,
  audienceTemporalPageType,
  categoryTemporalPageType,
  locationGuidePageType,
];

/**
 * Get total estimated pages across all page types.
 */
export function getEstimatedTotalPages(): number {
  return allPageTypes.reduce((sum, pt) => sum + pt.estimatedPages, 0);
}

/**
 * Get page type by ID.
 */
export function getPageType(id: string): PageTypeConfig | undefined {
  return allPageTypes.find((pt) => pt.id === id);
}

// ---------------------------------------------------------------------------
// Content Section Definitions
// ---------------------------------------------------------------------------

export interface ContentSection {
  id: string;
  name: string;
  description: string;
  required: boolean;
  /** Which page types include this section */
  pageTypes: string[];
  /** Approximate word count target */
  wordCount: { min: number; max: number };
}

export const contentSections: ContentSection[] = [
  {
    id: 'hero_intro',
    name: 'Hero Introduction',
    description: 'Opening paragraph that hooks the reader and establishes local authority. Must include primary keyword and location naturally.',
    required: true,
    pageTypes: ['*'],
    wordCount: { min: 50, max: 100 },
  },
  {
    id: 'curated_picks',
    name: 'Curated Picks',
    description: 'Top 5-10 recommendations with specific details: names, addresses, what to order/do, insider tips.',
    required: true,
    pageTypes: ['content-location', 'content-audience', 'content-category', 'category-location'],
    wordCount: { min: 300, max: 600 },
  },
  {
    id: 'live_listings',
    name: 'Live Listings',
    description: 'Dynamic data-driven listing cards pulled from the database. Filtered by page dimensions.',
    required: true,
    pageTypes: ['*'],
    wordCount: { min: 0, max: 0 }, // Dynamic component, no static word count
  },
  {
    id: 'local_tips',
    name: 'Local Tips',
    description: 'Insider knowledge section: parking, best times, what to avoid, secret menu items, etc.',
    required: true,
    pageTypes: ['content-location', 'content-location-audience', 'location-guide'],
    wordCount: { min: 100, max: 200 },
  },
  {
    id: 'seasonal_context',
    name: 'Seasonal Context',
    description: 'What changes seasonally: outdoor seating availability, seasonal menus, weather considerations.',
    required: false,
    pageTypes: ['content-temporal', 'content-location-temporal', 'category-temporal'],
    wordCount: { min: 100, max: 200 },
  },
  {
    id: 'faq',
    name: 'FAQ',
    description: 'Frequently asked questions derived from search queries. Schema.org FAQPage markup required.',
    required: true,
    pageTypes: ['*'],
    wordCount: { min: 200, max: 400 },
  },
  {
    id: 'related_pages',
    name: 'Related Pages',
    description: 'Internal links to related pSEO pages. Critical for crawlability and link equity distribution.',
    required: true,
    pageTypes: ['*'],
    wordCount: { min: 0, max: 0 }, // Link component
  },
  {
    id: 'neighborhood_profile',
    name: 'Neighborhood Profile',
    description: 'Brief neighborhood character description — vibe, walkability, parking, demographics.',
    required: true,
    pageTypes: ['location-guide', 'content-location', 'content-location-audience', 'content-location-temporal'],
    wordCount: { min: 100, max: 200 },
  },
  {
    id: 'audience_callout',
    name: 'Audience-Specific Callout',
    description: 'Speaks directly to the audience: "Traveling with kids? Here is what you need to know..."',
    required: true,
    pageTypes: ['content-audience', 'content-location-audience', 'audience-temporal'],
    wordCount: { min: 80, max: 150 },
  },
  {
    id: 'map_embed',
    name: 'Interactive Map',
    description: 'Leaflet map showing pins for all listed items. Clusters for dense areas.',
    required: false,
    pageTypes: ['content-location', 'category-location', 'location-guide'],
    wordCount: { min: 0, max: 0 },
  },
];

/**
 * Get sections applicable to a page type.
 */
export function getSectionsForPageType(pageTypeId: string): ContentSection[] {
  return contentSections.filter(
    (s) => s.pageTypes.includes('*') || s.pageTypes.includes(pageTypeId)
  );
}
