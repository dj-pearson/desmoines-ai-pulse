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

// Phase 3: Detailed Schemas (per page type, with AI-FILL/DETERMINISTIC/FROM-DB annotations)
export {
  type PageTypeId,
  type ContentTypeSlug,
  type LocationSlug,
  type AudienceSlug,
  type TemporalSlug,
  type CategorySlug,
  type RefreshSchedule,
  type SectionType,
  type SchemaOrgType,
  type PageMeta,
  type PageSeo,
  type HeroSection,
  type CuratedItem,
  type FaqItem,
  type RelatedPage,
  type CtaBlock,
  type ContentLocationSchema,
  type ContentAudienceSchema,
  type ContentTemporalSchema,
  type ContentCategorySchema,
  type ContentLocationAudienceSchema,
  type ContentLocationTemporalSchema,
  type CategoryLocationSchema,
  type AudienceTemporalSchema,
  type CategoryTemporalSchema,
  type LocationGuideSchema,
  type AnyPseoSchema,
  PAGE_TYPE_REQUIRED_SECTIONS,
  SECTION_MIN_COUNTS,
  SECTION_MAX_COUNTS,
} from './detailedSchemas';

// Phase 4: Enhanced Generation Prompts (per page type)
export {
  type EnhancedPromptContext,
  type DbRecord,
  type StructuredPrompt,
  buildPromptForPageType,
} from './generationPrompts';

// Phase 5: Component Specs
export {
  type ComponentSpec,
  allComponentSpecs,
  getComponentSpec,
} from './componentSpecs';

// Phase 6: Pipeline
export {
  type PipelineState,
  type PipelineStep,
  type QualityCheck,
  GENERATION_SEQUENCE,
  GENERATION_PRIORITY,
  RATE_LIMITS,
  N8N_WORKFLOW_NODES,
  QUALITY_CHECKLIST,
  QUALITY_THRESHOLDS,
  REFRESH_STRATEGY,
  computeQualityScore,
  estimateGenerationCost,
} from './pipeline';

// Phase 7: Roadmap
export {
  type WeekPlan,
  type TrafficProjection,
  LAUNCH_ROADMAP,
  TRAFFIC_PROJECTIONS,
  COST_PROJECTIONS,
  DELIVERABLES_CHECKLIST,
} from './roadmap';
