/**
 * pSEO 2.0 System — Barrel Export
 *
 * Central export for the programmatic SEO system.
 * Import from '@/pseo' to access taxonomy, schemas, prompts, and utilities.
 */

// Taxonomy
export {
  type DimensionKey,
  type DimensionValue,
  type DimensionContext,
  type Dimension,
  type PageCombination,
  type PageTypeConfig,
  contentTypeDimension,
  locationDimension,
  audienceDimension,
  temporalDimension,
  categoryDimension,
  allDimensions,
  generateCombinations,
  getDimensionValues,
  getDimensionValue,
  getTaxonomyStats,
} from './taxonomy';

// Page Types
export {
  allPageTypes,
  getEstimatedTotalPages,
  getPageType,
  getSectionsForPageType,
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
  type ContentSection,
} from './pageTypes';

// Schemas
export {
  type PseoPageContent,
  type PseoDimensionRef,
  type PseoSeoMeta,
  type PseoSection,
  type PseoCuratedItem,
  type PseoFaqItem,
  type PseoRelatedPage,
  type PseoStructuredData,
  type PseoGenerationMeta,
  type PseoPageRow,
  type PseoGenerationRequest,
  type PseoGenerationResponse,
  type PseoBatchRequest,
  type PseoBatchResponse,
  type PseoQualityCheck,
  validatePageQuality,
} from './schemas';

// Prompts
export {
  type PromptContext,
  type GenerationPrompt,
  buildFullPagePrompt,
  buildSeoOnlyPrompt,
  buildRelatedPagesPrompt,
  buildRefreshPrompt,
  getCurrentSeason,
  promptRegistry,
} from './prompts';

// Hooks
export { usePseoPage, usePseoPageSlugs } from './hooks/usePseoPage';
