/**
 * pSEO 2.0 — Phase 5: React Component Specifications
 *
 * Each page type has a complete component spec defining:
 *   - Component name, file path, data source
 *   - Layout sections in render order
 *   - Interactive features
 *   - Schema.org markup requirements
 *   - Internal linking rules
 *   - Performance requirements
 *   - Props interface reference
 *
 * All pSEO pages share these HARD performance requirements:
 *   - No Three.js, heavy 3D, or canvas libraries
 *   - Map component lazy-loaded behind Intersection Observer
 *   - Target LCP < 1.8s (critical for SEO pages)
 *   - Images: srcset with WebP, lazy-loaded below fold
 *   - Total JS for pSEO route < 80KB gzipped
 *   - CSS: Tailwind only, no runtime CSS-in-JS
 */

import type { PageTypeId, SectionType } from './detailedSchemas';

// ---------------------------------------------------------------------------
// Component Spec Interface
// ---------------------------------------------------------------------------

export interface ComponentSpec {
  /** React component name */
  componentName: string;
  /** File path relative to src/ */
  filePath: string;
  /** Page type ID this component renders */
  pageTypeId: PageTypeId;
  /** Supabase query to load data */
  dataSource: {
    table: 'pseo_pages';
    filter: string;
    /** Additional tables to join for live listings */
    liveDataTables: string[];
  };
  /** Layout sections in render order */
  sections: LayoutSection[];
  /** Interactive features and implementation notes */
  interactiveFeatures: InteractiveFeature[];
  /** Schema.org structured data requirements */
  schemaMarkup: SchemaMarkupSpec;
  /** Internal linking rules */
  internalLinking: InternalLinkingSpec;
  /** Performance budget */
  performance: PerformanceBudget;
  /** Breadcrumb pattern */
  breadcrumbPattern: string;
}

export interface LayoutSection {
  order: number;
  sectionType: SectionType | 'hero' | 'cta_block';
  component: string;
  /** Whether this section is above the fold (critical for LCP) */
  aboveFold: boolean;
  /** Whether this section should be lazy-loaded */
  lazyLoad: boolean;
  notes: string;
}

export interface InteractiveFeature {
  name: string;
  implementation: string;
  lazyLoad: boolean;
}

export interface SchemaMarkupSpec {
  /** Primary schema type in document head */
  primaryType: string;
  /** Additional schema types */
  additionalTypes: string[];
  /** Notes on implementation */
  notes: string;
}

export interface InternalLinkingSpec {
  /** Number of related page links */
  relatedPageCount: { min: number; max: number };
  /** Page types to link to */
  linkTargets: string[];
  /** Breadcrumb pattern */
  breadcrumbSegments: string[];
}

export interface PerformanceBudget {
  targetLCP: string;
  maxJSBundle: string;
  lazyLoadBelow: string;
  imageStrategy: string;
}

// ---------------------------------------------------------------------------
// Shared performance budget (all pSEO pages)
// ---------------------------------------------------------------------------

const SHARED_PERFORMANCE: PerformanceBudget = {
  targetLCP: '< 1.8s',
  maxJSBundle: '< 80KB gzipped for pSEO route chunk',
  lazyLoadBelow: 'Intersection Observer for map, live listings below fold',
  imageStrategy: 'srcset with WebP, width/height attributes, lazy loading below fold',
};

// ---------------------------------------------------------------------------
// 1. Content + Location Component Spec
// ---------------------------------------------------------------------------

export const contentLocationSpec: ComponentSpec = {
  componentName: 'PseoContentLocation',
  filePath: 'pseo/components/pages/PseoContentLocation.tsx',
  pageTypeId: 'content-location',
  dataSource: {
    table: 'pseo_pages',
    filter: "page_type_id = 'content-location' AND slug = :slug AND is_published = true",
    liveDataTables: ['events', 'restaurants', 'attractions'],
  },
  sections: [
    { order: 1, sectionType: 'hero', component: 'PseoHero', aboveFold: true, lazyLoad: false, notes: 'H1 + headline + subheadline + intro. Critical path — no layout shift.' },
    { order: 2, sectionType: 'neighborhood_profile', component: 'PseoNeighborhoodProfile', aboveFold: true, lazyLoad: false, notes: 'Compact profile card: vibe, walkability, parking badges.' },
    { order: 3, sectionType: 'curated_picks', component: 'PseoCuratedPicks', aboveFold: true, lazyLoad: false, notes: '2-column grid on desktop, single column mobile. First 4 items above fold.' },
    { order: 4, sectionType: 'live_listings', component: 'PseoLiveListings', aboveFold: false, lazyLoad: true, notes: 'Fetched client-side from Supabase. 3-column grid. Skeleton loader.' },
    { order: 5, sectionType: 'local_tips', component: 'PseoLocalTips', aboveFold: false, lazyLoad: false, notes: '2-column grid of tip cards with lightbulb icons.' },
    { order: 6, sectionType: 'map_embed', component: 'PseoMapEmbed', aboveFold: false, lazyLoad: true, notes: 'Leaflet map lazy-loaded via Intersection Observer. Pins for curated picks.' },
    { order: 7, sectionType: 'faq', component: 'PseoFaq', aboveFold: false, lazyLoad: false, notes: 'Accordion component. Schema.org FAQPage markup in head.' },
    { order: 8, sectionType: 'related_pages', component: 'PseoRelatedPages', aboveFold: false, lazyLoad: false, notes: '3-column link grid. Critical for internal link equity.' },
    { order: 9, sectionType: 'cta_block', component: 'PseoCta', aboveFold: false, lazyLoad: false, notes: 'Full-width CTA with primary + optional secondary button.' },
  ],
  interactiveFeatures: [
    { name: 'Map pins', implementation: 'Leaflet markers for each curated pick location', lazyLoad: true },
    { name: 'FAQ accordion', implementation: 'Radix Accordion, single collapsible mode', lazyLoad: false },
    { name: 'Share button', implementation: 'Web Share API with clipboard fallback', lazyLoad: false },
  ],
  schemaMarkup: {
    primaryType: 'CollectionPage',
    additionalTypes: ['BreadcrumbList', 'FAQPage', 'ItemList'],
    notes: 'ItemList for curated_picks. FAQPage for faq section. Include GeoCoordinates if location has lat/lng.',
  },
  internalLinking: {
    relatedPageCount: { min: 4, max: 6 },
    linkTargets: ['content-audience', 'content-temporal', 'content-category', 'location-guide', 'category-location'],
    breadcrumbSegments: ['Home', 'ContentType', 'Location'],
  },
  performance: SHARED_PERFORMANCE,
  breadcrumbPattern: 'Home > {ContentType} > {Location}',
};

// ---------------------------------------------------------------------------
// 2. Content + Audience Component Spec
// ---------------------------------------------------------------------------

export const contentAudienceSpec: ComponentSpec = {
  componentName: 'PseoContentAudience',
  filePath: 'pseo/components/pages/PseoContentAudience.tsx',
  pageTypeId: 'content-audience',
  dataSource: {
    table: 'pseo_pages',
    filter: "page_type_id = 'content-audience' AND slug = :slug AND is_published = true",
    liveDataTables: ['events', 'restaurants', 'attractions'],
  },
  sections: [
    { order: 1, sectionType: 'hero', component: 'PseoHero', aboveFold: true, lazyLoad: false, notes: 'Audience-aware headline. Speaks to pain points in intro.' },
    { order: 2, sectionType: 'audience_callout', component: 'PseoAudienceCallout', aboveFold: true, lazyLoad: false, notes: 'Highlighted callout box with key_considerations as bullet list.' },
    { order: 3, sectionType: 'curated_picks', component: 'PseoCuratedPicks', aboveFold: true, lazyLoad: false, notes: 'Picks filtered for this audience. Tags indicate audience-relevance.' },
    { order: 4, sectionType: 'live_listings', component: 'PseoLiveListings', aboveFold: false, lazyLoad: true, notes: 'Client-side fetch with audience-relevant filtering.' },
    { order: 5, sectionType: 'local_tips', component: 'PseoLocalTips', aboveFold: false, lazyLoad: false, notes: 'Tips specific to this audience. E.g., stroller access for families.' },
    { order: 6, sectionType: 'faq', component: 'PseoFaq', aboveFold: false, lazyLoad: false, notes: 'Audience-specific questions. Schema.org FAQPage.' },
    { order: 7, sectionType: 'related_pages', component: 'PseoRelatedPages', aboveFold: false, lazyLoad: false, notes: 'Link to location-specific pages for same audience.' },
    { order: 8, sectionType: 'cta_block', component: 'PseoCta', aboveFold: false, lazyLoad: false, notes: 'CTA tailored to audience: "Plan Your Family Day" etc.' },
  ],
  interactiveFeatures: [
    { name: 'FAQ accordion', implementation: 'Radix Accordion', lazyLoad: false },
    { name: 'Share button', implementation: 'Web Share API', lazyLoad: false },
  ],
  schemaMarkup: {
    primaryType: 'CollectionPage',
    additionalTypes: ['BreadcrumbList', 'FAQPage', 'ItemList'],
    notes: 'Include audience as schema annotation in WebPage.about',
  },
  internalLinking: {
    relatedPageCount: { min: 4, max: 6 },
    linkTargets: ['content-location-audience', 'content-location', 'audience-temporal', 'content-temporal'],
    breadcrumbSegments: ['Home', 'ContentType', 'Audience'],
  },
  performance: SHARED_PERFORMANCE,
  breadcrumbPattern: 'Home > {ContentType} > {Audience}',
};

// ---------------------------------------------------------------------------
// 3. Content + Temporal Component Spec
// ---------------------------------------------------------------------------

export const contentTemporalSpec: ComponentSpec = {
  componentName: 'PseoContentTemporal',
  filePath: 'pseo/components/pages/PseoContentTemporal.tsx',
  pageTypeId: 'content-temporal',
  dataSource: {
    table: 'pseo_pages',
    filter: "page_type_id = 'content-temporal' AND slug = :slug AND is_published = true",
    liveDataTables: ['events', 'restaurants', 'attractions'],
  },
  sections: [
    { order: 1, sectionType: 'hero', component: 'PseoHero', aboveFold: true, lazyLoad: false, notes: 'Time-aware headline with urgency for today/weekend.' },
    { order: 2, sectionType: 'seasonal_context', component: 'PseoSeasonalContext', aboveFold: true, lazyLoad: false, notes: 'Weather note + seasonal highlights. Gradient background card.' },
    { order: 3, sectionType: 'curated_picks', component: 'PseoCuratedPicks', aboveFold: true, lazyLoad: false, notes: 'Time-filtered picks. Date badges on event items.' },
    { order: 4, sectionType: 'live_listings', component: 'PseoLiveListings', aboveFold: false, lazyLoad: true, notes: 'Date-range filtered. Sorted by date ascending. "Happening now" badges.' },
    { order: 5, sectionType: 'local_tips', component: 'PseoLocalTips', aboveFold: false, lazyLoad: false, notes: 'Season/time-specific tips (weather, what to wear, parking at peak times).' },
    { order: 6, sectionType: 'faq', component: 'PseoFaq', aboveFold: false, lazyLoad: false, notes: 'Time-aware FAQ. Schema.org FAQPage.' },
    { order: 7, sectionType: 'related_pages', component: 'PseoRelatedPages', aboveFold: false, lazyLoad: false, notes: 'Link to location-filtered versions of this temporal page.' },
    { order: 8, sectionType: 'cta_block', component: 'PseoCta', aboveFold: false, lazyLoad: false, notes: 'Urgency CTA: "Don\'t miss out — explore events today"' },
  ],
  interactiveFeatures: [
    { name: 'FAQ accordion', implementation: 'Radix Accordion', lazyLoad: false },
    { name: 'Calendar export', implementation: 'Generate .ics download for featured events', lazyLoad: false },
    { name: 'Auto-refresh', implementation: 'Refetch live listings every 5 minutes for today/weekend pages', lazyLoad: false },
  ],
  schemaMarkup: {
    primaryType: 'CollectionPage',
    additionalTypes: ['BreadcrumbList', 'FAQPage', 'ItemList'],
    notes: 'For today/weekend: add datePublished and dateModified. Set expires header.',
  },
  internalLinking: {
    relatedPageCount: { min: 4, max: 6 },
    linkTargets: ['content-location-temporal', 'content-location', 'audience-temporal', 'category-temporal'],
    breadcrumbSegments: ['Home', 'ContentType', 'Temporal'],
  },
  performance: SHARED_PERFORMANCE,
  breadcrumbPattern: 'Home > {ContentType} > {Temporal}',
};

// ---------------------------------------------------------------------------
// 4. Content + Category
// ---------------------------------------------------------------------------

export const contentCategorySpec: ComponentSpec = {
  componentName: 'PseoContentCategory',
  filePath: 'pseo/components/pages/PseoContentCategory.tsx',
  pageTypeId: 'content-category',
  dataSource: {
    table: 'pseo_pages',
    filter: "page_type_id = 'content-category' AND slug = :slug AND is_published = true",
    liveDataTables: ['events', 'restaurants', 'attractions'],
  },
  sections: [
    { order: 1, sectionType: 'hero', component: 'PseoHero', aboveFold: true, lazyLoad: false, notes: 'Category-expert headline. Establishes authority.' },
    { order: 2, sectionType: 'curated_picks', component: 'PseoCuratedPicks', aboveFold: true, lazyLoad: false, notes: '8-12 items (more than other types). Cuisine context paragraph above for food. Numbered ranking optional.' },
    { order: 3, sectionType: 'live_listings', component: 'PseoLiveListings', aboveFold: false, lazyLoad: true, notes: 'Category-filtered. For restaurants: include rating + price badges.' },
    { order: 4, sectionType: 'local_tips', component: 'PseoLocalTips', aboveFold: false, lazyLoad: false, notes: 'Category-expert tips. E.g., "best time to order omakase" for Japanese.' },
    { order: 5, sectionType: 'faq', component: 'PseoFaq', aboveFold: false, lazyLoad: false, notes: 'Category-specific questions. Schema.org FAQPage.' },
    { order: 6, sectionType: 'related_pages', component: 'PseoRelatedPages', aboveFold: false, lazyLoad: false, notes: 'Link to location-filtered category pages and sibling categories.' },
    { order: 7, sectionType: 'cta_block', component: 'PseoCta', aboveFold: false, lazyLoad: false, notes: 'Category CTA: "Explore all Italian restaurants" etc.' },
  ],
  interactiveFeatures: [
    { name: 'FAQ accordion', implementation: 'Radix Accordion', lazyLoad: false },
    { name: 'Share button', implementation: 'Web Share API', lazyLoad: false },
    { name: 'Sort toggle', implementation: 'Client-side sort of curated picks by rating/price', lazyLoad: false },
  ],
  schemaMarkup: {
    primaryType: 'ItemList',
    additionalTypes: ['BreadcrumbList', 'FAQPage'],
    notes: 'ItemList with numberOfItems. Each item as ListItem with position.',
  },
  internalLinking: {
    relatedPageCount: { min: 4, max: 6 },
    linkTargets: ['category-location', 'content-location', 'category-temporal', 'content-audience'],
    breadcrumbSegments: ['Home', 'ContentType', 'Category'],
  },
  performance: SHARED_PERFORMANCE,
  breadcrumbPattern: 'Home > {ContentType} > {Category}',
};

// ---------------------------------------------------------------------------
// 5. Content + Location + Audience (triple)
// ---------------------------------------------------------------------------

export const contentLocationAudienceSpec: ComponentSpec = {
  componentName: 'PseoContentLocationAudience',
  filePath: 'pseo/components/pages/PseoContentLocationAudience.tsx',
  pageTypeId: 'content-location-audience',
  dataSource: {
    table: 'pseo_pages',
    filter: "page_type_id = 'content-location-audience' AND slug = :slug AND is_published = true",
    liveDataTables: ['events', 'restaurants', 'attractions'],
  },
  sections: [
    { order: 1, sectionType: 'hero', component: 'PseoHero', aboveFold: true, lazyLoad: false, notes: 'Triple-specific headline addressing audience + location.' },
    { order: 2, sectionType: 'audience_callout', component: 'PseoAudienceCallout', aboveFold: true, lazyLoad: false, notes: 'Compact callout with location-specific audience advice.' },
    { order: 3, sectionType: 'neighborhood_profile', component: 'PseoNeighborhoodProfile', aboveFold: true, lazyLoad: false, notes: 'Compact (80-100 words). Audience-relevant details emphasized.' },
    { order: 4, sectionType: 'curated_picks', component: 'PseoCuratedPicks', aboveFold: false, lazyLoad: false, notes: '6-8 items filtered for BOTH audience AND location.' },
    { order: 5, sectionType: 'live_listings', component: 'PseoLiveListings', aboveFold: false, lazyLoad: true, notes: 'Dual-filtered: location + audience-relevant categories.' },
    { order: 6, sectionType: 'local_tips', component: 'PseoLocalTips', aboveFold: false, lazyLoad: false, notes: 'Hyper-specific tips for this audience in this location.' },
    { order: 7, sectionType: 'faq', component: 'PseoFaq', aboveFold: false, lazyLoad: false, notes: '4 items (shorter for triple combo). Schema.org FAQPage.' },
    { order: 8, sectionType: 'related_pages', component: 'PseoRelatedPages', aboveFold: false, lazyLoad: false, notes: 'Parent pages: content-location AND content-audience.' },
    { order: 9, sectionType: 'cta_block', component: 'PseoCta', aboveFold: false, lazyLoad: false, notes: 'Audience-specific CTA.' },
  ],
  interactiveFeatures: [
    { name: 'FAQ accordion', implementation: 'Radix Accordion', lazyLoad: false },
    { name: 'Map pins', implementation: 'Leaflet markers if location has coordinates', lazyLoad: true },
  ],
  schemaMarkup: {
    primaryType: 'CollectionPage',
    additionalTypes: ['BreadcrumbList', 'FAQPage', 'ItemList'],
    notes: 'Include GeoCoordinates for location. Audience as schema annotation.',
  },
  internalLinking: {
    relatedPageCount: { min: 4, max: 6 },
    linkTargets: ['content-location', 'content-audience', 'location-guide', 'content-location-temporal'],
    breadcrumbSegments: ['Home', 'ContentType', 'Location', 'Audience'],
  },
  performance: SHARED_PERFORMANCE,
  breadcrumbPattern: 'Home > {ContentType} > {Location} > {Audience}',
};

// ---------------------------------------------------------------------------
// 6. Content + Location + Temporal (triple)
// ---------------------------------------------------------------------------

export const contentLocationTemporalSpec: ComponentSpec = {
  componentName: 'PseoContentLocationTemporal',
  filePath: 'pseo/components/pages/PseoContentLocationTemporal.tsx',
  pageTypeId: 'content-location-temporal',
  dataSource: {
    table: 'pseo_pages',
    filter: "page_type_id = 'content-location-temporal' AND slug = :slug AND is_published = true",
    liveDataTables: ['events', 'restaurants', 'attractions'],
  },
  sections: [
    { order: 1, sectionType: 'hero', component: 'PseoHero', aboveFold: true, lazyLoad: false, notes: 'Time + location headline with urgency.' },
    { order: 2, sectionType: 'seasonal_context', component: 'PseoSeasonalContext', aboveFold: true, lazyLoad: false, notes: 'Compact seasonal note for this location.' },
    { order: 3, sectionType: 'neighborhood_profile', component: 'PseoNeighborhoodProfile', aboveFold: true, lazyLoad: false, notes: 'Compact (80-100 words). Seasonal angle on the neighborhood.' },
    { order: 4, sectionType: 'curated_picks', component: 'PseoCuratedPicks', aboveFold: false, lazyLoad: false, notes: '6-8 items filtered for time period AND location.' },
    { order: 5, sectionType: 'live_listings', component: 'PseoLiveListings', aboveFold: false, lazyLoad: true, notes: 'Date-range + location filtered. Sorted by date.' },
    { order: 6, sectionType: 'local_tips', component: 'PseoLocalTips', aboveFold: false, lazyLoad: false, notes: 'Time + location specific tips.' },
    { order: 7, sectionType: 'faq', component: 'PseoFaq', aboveFold: false, lazyLoad: false, notes: '4 items. Schema.org FAQPage.' },
    { order: 8, sectionType: 'related_pages', component: 'PseoRelatedPages', aboveFold: false, lazyLoad: false, notes: 'Parent: content-location and content-temporal pages.' },
    { order: 9, sectionType: 'cta_block', component: 'PseoCta', aboveFold: false, lazyLoad: false, notes: 'Urgency CTA for time-bound content.' },
  ],
  interactiveFeatures: [
    { name: 'FAQ accordion', implementation: 'Radix Accordion', lazyLoad: false },
    { name: 'Auto-refresh', implementation: 'Refetch listings every 5 minutes for today/weekend', lazyLoad: false },
    { name: 'Map pins', implementation: 'Leaflet markers for location', lazyLoad: true },
  ],
  schemaMarkup: {
    primaryType: 'CollectionPage',
    additionalTypes: ['BreadcrumbList', 'FAQPage', 'ItemList'],
    notes: 'Include datePublished/dateModified. Set short cache TTL for today pages.',
  },
  internalLinking: {
    relatedPageCount: { min: 4, max: 6 },
    linkTargets: ['content-location', 'content-temporal', 'location-guide', 'content-location-audience'],
    breadcrumbSegments: ['Home', 'ContentType', 'Location', 'Temporal'],
  },
  performance: SHARED_PERFORMANCE,
  breadcrumbPattern: 'Home > {ContentType} > {Location} > {Temporal}',
};

// ---------------------------------------------------------------------------
// 7-10: Remaining page type specs (same structure, condensed)
// ---------------------------------------------------------------------------

export const categoryLocationSpec: ComponentSpec = {
  componentName: 'PseoCategoryLocation',
  filePath: 'pseo/components/pages/PseoCategoryLocation.tsx',
  pageTypeId: 'category-location',
  dataSource: { table: 'pseo_pages', filter: "page_type_id = 'category-location' AND slug = :slug AND is_published = true", liveDataTables: ['restaurants', 'events', 'attractions'] },
  sections: [
    { order: 1, sectionType: 'hero', component: 'PseoHero', aboveFold: true, lazyLoad: false, notes: 'Category + location authority headline.' },
    { order: 2, sectionType: 'neighborhood_profile', component: 'PseoNeighborhoodProfile', aboveFold: true, lazyLoad: false, notes: 'How location relates to this category scene.' },
    { order: 3, sectionType: 'curated_picks', component: 'PseoCuratedPicks', aboveFold: true, lazyLoad: false, notes: '6-10 items. Include cuisine_context for food categories.' },
    { order: 4, sectionType: 'live_listings', component: 'PseoLiveListings', aboveFold: false, lazyLoad: true, notes: 'Category + location filtered.' },
    { order: 5, sectionType: 'local_tips', component: 'PseoLocalTips', aboveFold: false, lazyLoad: false, notes: 'Category tips specific to this location.' },
    { order: 6, sectionType: 'map_embed', component: 'PseoMapEmbed', aboveFold: false, lazyLoad: true, notes: 'Map with category pins in this location.' },
    { order: 7, sectionType: 'faq', component: 'PseoFaq', aboveFold: false, lazyLoad: false, notes: '4-6 items. Schema.org FAQPage.' },
    { order: 8, sectionType: 'related_pages', component: 'PseoRelatedPages', aboveFold: false, lazyLoad: false, notes: 'Sibling categories in same location + same category in other locations.' },
    { order: 9, sectionType: 'cta_block', component: 'PseoCta', aboveFold: false, lazyLoad: false, notes: 'Category exploration CTA.' },
  ],
  interactiveFeatures: [
    { name: 'FAQ accordion', implementation: 'Radix Accordion', lazyLoad: false },
    { name: 'Map pins', implementation: 'Leaflet markers', lazyLoad: true },
  ],
  schemaMarkup: { primaryType: 'ItemList', additionalTypes: ['BreadcrumbList', 'FAQPage'], notes: 'ItemList for ranked picks. GeoCoordinates for location.' },
  internalLinking: { relatedPageCount: { min: 4, max: 6 }, linkTargets: ['content-category', 'content-location', 'location-guide', 'category-temporal'], breadcrumbSegments: ['Home', 'Category', 'Location'] },
  performance: SHARED_PERFORMANCE,
  breadcrumbPattern: 'Home > {Category} > {Location}',
};

export const audienceTemporalSpec: ComponentSpec = {
  componentName: 'PseoAudienceTemporal',
  filePath: 'pseo/components/pages/PseoAudienceTemporal.tsx',
  pageTypeId: 'audience-temporal',
  dataSource: { table: 'pseo_pages', filter: "page_type_id = 'audience-temporal' AND slug = :slug AND is_published = true", liveDataTables: ['events', 'restaurants', 'attractions'] },
  sections: [
    { order: 1, sectionType: 'hero', component: 'PseoHero', aboveFold: true, lazyLoad: false, notes: 'Audience + time headline. "Family Things to Do This Weekend"' },
    { order: 2, sectionType: 'audience_callout', component: 'PseoAudienceCallout', aboveFold: true, lazyLoad: false, notes: 'Time-aware audience callout.' },
    { order: 3, sectionType: 'seasonal_context', component: 'PseoSeasonalContext', aboveFold: true, lazyLoad: false, notes: 'Seasonal info relevant to this audience.' },
    { order: 4, sectionType: 'curated_picks', component: 'PseoCuratedPicks', aboveFold: false, lazyLoad: false, notes: '6-8 cross-entity picks (events + restaurants + attractions).' },
    { order: 5, sectionType: 'live_listings', component: 'PseoLiveListings', aboveFold: false, lazyLoad: true, notes: 'Date-filtered events relevant to this audience.' },
    { order: 6, sectionType: 'local_tips', component: 'PseoLocalTips', aboveFold: false, lazyLoad: false, notes: 'Audience + time specific tips.' },
    { order: 7, sectionType: 'faq', component: 'PseoFaq', aboveFold: false, lazyLoad: false, notes: '4-6 items. Schema.org FAQPage.' },
    { order: 8, sectionType: 'related_pages', component: 'PseoRelatedPages', aboveFold: false, lazyLoad: false, notes: 'Link to content-location-audience pages and content-temporal pages.' },
    { order: 9, sectionType: 'cta_block', component: 'PseoCta', aboveFold: false, lazyLoad: false, notes: 'Audience CTA with time urgency.' },
  ],
  interactiveFeatures: [
    { name: 'FAQ accordion', implementation: 'Radix Accordion', lazyLoad: false },
    { name: 'Calendar export', implementation: '.ics download for events', lazyLoad: false },
  ],
  schemaMarkup: { primaryType: 'CollectionPage', additionalTypes: ['BreadcrumbList', 'FAQPage', 'ItemList'], notes: 'datePublished for time pages.' },
  internalLinking: { relatedPageCount: { min: 4, max: 6 }, linkTargets: ['content-audience', 'content-temporal', 'content-location-audience', 'content-location-temporal'], breadcrumbSegments: ['Home', 'Things to Do', 'Audience', 'Temporal'] },
  performance: SHARED_PERFORMANCE,
  breadcrumbPattern: 'Home > Things to Do > {Audience} > {Temporal}',
};

export const categoryTemporalSpec: ComponentSpec = {
  componentName: 'PseoCategoryTemporal',
  filePath: 'pseo/components/pages/PseoCategoryTemporal.tsx',
  pageTypeId: 'category-temporal',
  dataSource: { table: 'pseo_pages', filter: "page_type_id = 'category-temporal' AND slug = :slug AND is_published = true", liveDataTables: ['events', 'restaurants'] },
  sections: [
    { order: 1, sectionType: 'hero', component: 'PseoHero', aboveFold: true, lazyLoad: false, notes: 'Category + season headline.' },
    { order: 2, sectionType: 'seasonal_context', component: 'PseoSeasonalContext', aboveFold: true, lazyLoad: false, notes: 'How this category changes by season. seasonal_highlights included.' },
    { order: 3, sectionType: 'curated_picks', component: 'PseoCuratedPicks', aboveFold: true, lazyLoad: false, notes: '6-8 seasonally-relevant picks for this category.' },
    { order: 4, sectionType: 'live_listings', component: 'PseoLiveListings', aboveFold: false, lazyLoad: true, notes: 'Category + date-range filtered.' },
    { order: 5, sectionType: 'local_tips', component: 'PseoLocalTips', aboveFold: false, lazyLoad: false, notes: 'Seasonal tips for this category.' },
    { order: 6, sectionType: 'faq', component: 'PseoFaq', aboveFold: false, lazyLoad: false, notes: '4-6 items. Schema.org FAQPage.' },
    { order: 7, sectionType: 'related_pages', component: 'PseoRelatedPages', aboveFold: false, lazyLoad: false, notes: 'Category in other seasons + location-filtered versions.' },
    { order: 8, sectionType: 'cta_block', component: 'PseoCta', aboveFold: false, lazyLoad: false, notes: 'Category exploration CTA.' },
  ],
  interactiveFeatures: [
    { name: 'FAQ accordion', implementation: 'Radix Accordion', lazyLoad: false },
  ],
  schemaMarkup: { primaryType: 'CollectionPage', additionalTypes: ['BreadcrumbList', 'FAQPage', 'ItemList'], notes: 'Season annotation on WebPage.' },
  internalLinking: { relatedPageCount: { min: 4, max: 6 }, linkTargets: ['content-category', 'category-location', 'content-temporal', 'audience-temporal'], breadcrumbSegments: ['Home', 'Category', 'Temporal'] },
  performance: SHARED_PERFORMANCE,
  breadcrumbPattern: 'Home > {Category} > {Temporal}',
};

export const locationGuideSpec: ComponentSpec = {
  componentName: 'PseoLocationGuide',
  filePath: 'pseo/components/pages/PseoLocationGuide.tsx',
  pageTypeId: 'location-guide',
  dataSource: { table: 'pseo_pages', filter: "page_type_id = 'location-guide' AND slug = :slug AND is_published = true", liveDataTables: ['events', 'restaurants', 'attractions'] },
  sections: [
    { order: 1, sectionType: 'hero', component: 'PseoHero', aboveFold: true, lazyLoad: false, notes: 'Comprehensive guide headline for this location.' },
    { order: 2, sectionType: 'neighborhood_profile', component: 'PseoNeighborhoodProfile', aboveFold: true, lazyLoad: false, notes: 'EXTENDED 150-200 words. Includes best_for and getting_there.' },
    { order: 3, sectionType: 'curated_picks', component: 'PseoCuratedPicks', aboveFold: true, lazyLoad: false, notes: '8-12 items mixing restaurants, attractions, activities. Hub page = more items.' },
    { order: 4, sectionType: 'live_listings', component: 'PseoLiveListings', aboveFold: false, lazyLoad: true, notes: 'Upcoming events in this location. Limited to 8.' },
    { order: 5, sectionType: 'local_tips', component: 'PseoLocalTips', aboveFold: false, lazyLoad: false, notes: '6-8 tips (more for hub pages). Comprehensive local knowledge.' },
    { order: 6, sectionType: 'map_embed', component: 'PseoMapEmbed', aboveFold: false, lazyLoad: true, notes: 'Full map with all curated pick pins. Required for guide pages.' },
    { order: 7, sectionType: 'faq', component: 'PseoFaq', aboveFold: false, lazyLoad: false, notes: '5-7 items (most of any type). Schema.org FAQPage.' },
    { order: 8, sectionType: 'related_pages', component: 'PseoRelatedPages', aboveFold: false, lazyLoad: false, notes: '6-8 links (most of any type). This is the internal linking HUB.' },
    { order: 9, sectionType: 'cta_block', component: 'PseoCta', aboveFold: false, lazyLoad: false, notes: 'Explore more of Des Moines CTA.' },
  ],
  interactiveFeatures: [
    { name: 'FAQ accordion', implementation: 'Radix Accordion', lazyLoad: false },
    { name: 'Map with all pins', implementation: 'Leaflet with clustered markers', lazyLoad: true },
    { name: 'Table of contents', implementation: 'Sticky TOC sidebar on desktop for hub page sections', lazyLoad: false },
    { name: 'Share button', implementation: 'Web Share API', lazyLoad: false },
  ],
  schemaMarkup: { primaryType: 'TouristDestination', additionalTypes: ['BreadcrumbList', 'FAQPage', 'ItemList'], notes: 'TouristDestination with GeoCoordinates. Contains references to local businesses.' },
  internalLinking: { relatedPageCount: { min: 6, max: 8 }, linkTargets: ['content-location', 'content-location-audience', 'content-location-temporal', 'category-location'], breadcrumbSegments: ['Home', 'Guide', 'Location'] },
  performance: SHARED_PERFORMANCE,
  breadcrumbPattern: 'Home > Guide > {Location}',
};

// ---------------------------------------------------------------------------
// All Component Specs
// ---------------------------------------------------------------------------

export const allComponentSpecs: ComponentSpec[] = [
  contentLocationSpec,
  contentAudienceSpec,
  contentTemporalSpec,
  contentCategorySpec,
  contentLocationAudienceSpec,
  contentLocationTemporalSpec,
  categoryLocationSpec,
  audienceTemporalSpec,
  categoryTemporalSpec,
  locationGuideSpec,
];

export function getComponentSpec(pageTypeId: PageTypeId): ComponentSpec | undefined {
  return allComponentSpecs.find(s => s.pageTypeId === pageTypeId);
}
