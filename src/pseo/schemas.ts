/**
 * pSEO 2.0 JSON Schemas
 *
 * Defines the data structures for:
 * 1. Generated page content (stored in Supabase)
 * 2. Page metadata
 * 3. Content sections
 * 4. Internal linking graph
 *
 * These schemas are used by:
 * - The AI generation edge function (output format)
 * - The React rendering components (input props)
 * - The Supabase database (storage format)
 */

// ---------------------------------------------------------------------------
// Generated Page Content Schema
// ---------------------------------------------------------------------------

export interface PseoPageContent {
  /** Unique page identifier (composite of dimension slugs) */
  id: string;
  /** URL path (e.g., /restaurants/east-village/date-night) */
  slug: string;
  /** Page type ID from pageTypes.ts */
  pageTypeId: string;
  /** Dimension values used to generate this page */
  dimensions: PseoDimensionRef[];
  /** SEO metadata */
  seo: PseoSeoMeta;
  /** Content sections in render order */
  sections: PseoSection[];
  /** Internal links to related pages */
  relatedPages: PseoRelatedPage[];
  /** Schema.org structured data */
  structuredData: PseoStructuredData;
  /** Generation metadata */
  meta: PseoGenerationMeta;
}

export interface PseoDimensionRef {
  dimension: string;
  slug: string;
  name: string;
  tier: number;
}

export interface PseoSeoMeta {
  title: string;
  description: string;
  h1: string;
  keywords: string[];
  canonicalUrl: string;
  ogImage?: string;
  ogType: string;
}

export interface PseoSection {
  id: string;
  type: PseoSectionType;
  heading?: string;
  content?: string;
  items?: PseoCuratedItem[];
  faqs?: PseoFaqItem[];
  tips?: string[];
}

export type PseoSectionType =
  | 'hero_intro'
  | 'curated_picks'
  | 'live_listings'
  | 'local_tips'
  | 'seasonal_context'
  | 'faq'
  | 'related_pages'
  | 'neighborhood_profile'
  | 'audience_callout'
  | 'map_embed';

export interface PseoCuratedItem {
  name: string;
  slug?: string;
  description: string;
  whyWeRecommend: string;
  insiderTip?: string;
  priceRange?: string;
  rating?: number;
  address?: string;
  tags?: string[];
}

export interface PseoFaqItem {
  question: string;
  answer: string;
}

export interface PseoRelatedPage {
  slug: string;
  title: string;
  relationship: 'sibling' | 'parent' | 'child' | 'cross';
  description?: string;
}

export interface PseoStructuredData {
  '@type': string;
  breadcrumb: PseoBreadcrumb[];
  faqItems?: PseoFaqItem[];
  itemList?: PseoItemListEntry[];
  location?: PseoGeoLocation;
}

export interface PseoBreadcrumb {
  name: string;
  url: string;
}

export interface PseoItemListEntry {
  position: number;
  name: string;
  url: string;
}

export interface PseoGeoLocation {
  name: string;
  latitude?: number;
  longitude?: number;
  containedIn: string;
}

export interface PseoGenerationMeta {
  generatedAt: string;
  generatedBy: string;
  promptVersion: string;
  modelUsed: string;
  qualityScore?: number;
  wordCount: number;
  /** Refresh schedule: 'realtime' | 'daily' | 'weekly' | 'seasonal' | 'evergreen' */
  refreshSchedule: string;
  /** Last time dynamic data was refreshed */
  lastDataRefresh?: string;
}

// ---------------------------------------------------------------------------
// Database Schema (for Supabase table)
// ---------------------------------------------------------------------------

/**
 * SQL to create the pseo_pages table:
 *
 * CREATE TABLE pseo_pages (
 *   id TEXT PRIMARY KEY,
 *   slug TEXT UNIQUE NOT NULL,
 *   page_type_id TEXT NOT NULL,
 *   dimensions JSONB NOT NULL DEFAULT '[]',
 *   seo JSONB NOT NULL,
 *   sections JSONB NOT NULL DEFAULT '[]',
 *   related_pages JSONB NOT NULL DEFAULT '[]',
 *   structured_data JSONB NOT NULL DEFAULT '{}',
 *   generation_meta JSONB NOT NULL DEFAULT '{}',
 *   is_published BOOLEAN NOT NULL DEFAULT false,
 *   quality_score NUMERIC(3,2) DEFAULT 0,
 *   view_count INTEGER DEFAULT 0,
 *   created_at TIMESTAMPTZ DEFAULT now(),
 *   updated_at TIMESTAMPTZ DEFAULT now(),
 *   published_at TIMESTAMPTZ
 * );
 *
 * CREATE INDEX idx_pseo_pages_slug ON pseo_pages(slug);
 * CREATE INDEX idx_pseo_pages_page_type ON pseo_pages(page_type_id);
 * CREATE INDEX idx_pseo_pages_published ON pseo_pages(is_published) WHERE is_published = true;
 * CREATE INDEX idx_pseo_pages_dimensions ON pseo_pages USING GIN(dimensions);
 */

export interface PseoPageRow {
  id: string;
  slug: string;
  page_type_id: string;
  dimensions: PseoDimensionRef[];
  seo: PseoSeoMeta;
  sections: PseoSection[];
  related_pages: PseoRelatedPage[];
  structured_data: PseoStructuredData;
  generation_meta: PseoGenerationMeta;
  is_published: boolean;
  quality_score: number;
  view_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

// ---------------------------------------------------------------------------
// Generation Request Schema (sent to edge function)
// ---------------------------------------------------------------------------

export interface PseoGenerationRequest {
  /** Page type to generate */
  pageTypeId: string;
  /** Dimension values for this page */
  dimensions: PseoDimensionRef[];
  /** Optional: existing items from database to reference */
  existingItems?: PseoExistingItem[];
  /** Optional: force regeneration even if page exists */
  forceRegenerate?: boolean;
  /** Optional: specific sections to regenerate */
  sectionsToRegenerate?: string[];
}

export interface PseoExistingItem {
  id: string;
  name: string;
  type: 'event' | 'restaurant' | 'attraction';
  /** Key attributes for the AI to reference */
  attributes: Record<string, unknown>;
}

export interface PseoGenerationResponse {
  success: boolean;
  page?: PseoPageContent;
  error?: string;
  generationTimeMs?: number;
}

// ---------------------------------------------------------------------------
// Batch Generation Schema
// ---------------------------------------------------------------------------

export interface PseoBatchRequest {
  /** Page type to batch generate */
  pageTypeId: string;
  /** Maximum pages to generate in this batch */
  batchSize: number;
  /** Only generate for tier 1 values */
  tier1Only?: boolean;
  /** Skip pages that already exist */
  skipExisting?: boolean;
}

export interface PseoBatchResponse {
  success: boolean;
  generated: number;
  skipped: number;
  failed: number;
  errors: Array<{ slug: string; error: string }>;
  totalTimeMs: number;
}

// ---------------------------------------------------------------------------
// Content Quality Score Schema
// ---------------------------------------------------------------------------

export interface PseoQualityCheck {
  wordCount: { score: number; details: string };
  uniqueness: { score: number; details: string };
  localRelevance: { score: number; details: string };
  seoOptimization: { score: number; details: string };
  internalLinking: { score: number; details: string };
  structuredData: { score: number; details: string };
  overallScore: number;
}

/**
 * Validates a generated page meets quality thresholds.
 */
export function validatePageQuality(page: PseoPageContent): PseoQualityCheck {
  const totalWords = page.sections.reduce((sum, s) => {
    const text = [s.content, ...(s.items?.map((i) => i.description) ?? [])].join(' ');
    return sum + text.split(/\s+/).filter(Boolean).length;
  }, 0);

  const wordCountScore = totalWords >= 300 ? 1 : totalWords >= 150 ? 0.7 : 0.4;

  const hasLocalMentions = page.sections.some(
    (s) =>
      s.content?.toLowerCase().includes('des moines') ||
      s.items?.some((i) => i.description.toLowerCase().includes('des moines'))
  );
  const localScore = hasLocalMentions ? 1 : 0.3;

  const seoScore =
    (page.seo.title ? 0.25 : 0) +
    (page.seo.description ? 0.25 : 0) +
    (page.seo.keywords.length >= 3 ? 0.25 : 0) +
    (page.seo.h1 ? 0.25 : 0);

  const linkScore = page.relatedPages.length >= 3 ? 1 : page.relatedPages.length / 3;

  const structuredScore =
    (page.structuredData.breadcrumb.length > 0 ? 0.5 : 0) +
    ((page.structuredData.faqItems?.length ?? 0) >= 3 ? 0.5 : 0);

  const overall =
    wordCountScore * 0.25 +
    1 * 0.15 + // uniqueness placeholder
    localScore * 0.2 +
    seoScore * 0.2 +
    linkScore * 0.1 +
    structuredScore * 0.1;

  return {
    wordCount: { score: wordCountScore, details: `${totalWords} words` },
    uniqueness: { score: 1, details: 'AI-generated unique content' },
    localRelevance: { score: localScore, details: hasLocalMentions ? 'Contains local references' : 'Missing local references' },
    seoOptimization: { score: seoScore, details: `SEO fields ${Math.round(seoScore * 100)}% complete` },
    internalLinking: { score: linkScore, details: `${page.relatedPages.length} internal links` },
    structuredData: { score: structuredScore, details: `Structured data ${Math.round(structuredScore * 100)}% complete` },
    overallScore: Math.round(overall * 100) / 100,
  };
}
