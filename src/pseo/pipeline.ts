/**
 * pSEO 2.0 — Phase 6: Generation Pipeline Specification
 *
 * 6A. Generation Sequence — step-by-step from taxonomy to published page
 * 6B. n8n Workflow Structure — automation layer description
 * 6C. Supabase Table Definition — complete SQL (migration already in place)
 * 6D. Quality Control Checklist — automated checks before publishing
 */

import type { PageTypeId } from './detailedSchemas';

// ============================================================================
// 6A. GENERATION SEQUENCE
// ============================================================================

/**
 * Step-by-step process from taxonomy to published page.
 *
 * Pipeline States:
 *   QUEUED → FETCHING_DATA → GENERATING → VALIDATING → REVIEW → PUBLISHED
 *   Any state can transition to FAILED with error details.
 */

export type PipelineState =
  | 'queued'
  | 'fetching_data'
  | 'generating'
  | 'validating'
  | 'review'
  | 'published'
  | 'failed';

export interface PipelineStep {
  order: number;
  name: string;
  state: PipelineState;
  description: string;
  /** Estimated duration in seconds */
  estimatedDuration: number;
  /** What triggers this step to start */
  trigger: string;
  /** What causes this step to fail */
  failureConditions: string[];
  /** What happens on failure */
  failureAction: string;
}

export const GENERATION_SEQUENCE: PipelineStep[] = [
  {
    order: 1,
    name: 'Queue Combination',
    state: 'queued',
    description: 'Select the next dimension combination based on tier priority. Tier 1 combinations are generated first, then Tier 2, then Tier 3. Within a tier, prioritize by estimated search volume (content-location > triple combos). SEO-025: within a page type, order LOCATIONS by locationGenerationOrder() from ./measuredDemand and skip isDeprioritised() slugs - that ordering is measured rather than estimated, and without it a capped run spends the same budget on a location with 60,550 monthly searches as on one with none.',
    estimatedDuration: 0,
    trigger: 'Scheduled batch job or manual admin trigger',
    failureConditions: ['Combination already exists and forceRegenerate is false', 'Combination is in an invalid state'],
    failureAction: 'Skip to next combination in queue',
  },
  {
    order: 2,
    name: 'Pre-flight Data Check',
    state: 'fetching_data',
    description: 'Query Supabase for relevant records matching this combination\'s dimensions. For content-location: fetch events/restaurants in that location. For content-category: fetch items matching that category. Minimum data threshold must be met before generation.',
    estimatedDuration: 2,
    trigger: 'Item dequeued from generation queue',
    failureConditions: [
      'Fewer than 3 matching records in database (page would be too thin)',
      'Supabase connection failure after 3 retries',
      'Location has no geocoded coordinates (for location pages)',
    ],
    failureAction: 'Mark as "insufficient_data" and defer. Retry when more data is ingested.',
  },
  {
    order: 3,
    name: 'Build Context + Prompt',
    state: 'fetching_data',
    description: 'Assemble the full prompt context: taxonomy dimension objects, database records (up to 20), existing page slugs for internal linking, current date/season. Select the correct prompt builder for this page type.',
    estimatedDuration: 1,
    trigger: 'Data check passed',
    failureConditions: ['Missing taxonomy dimension value', 'Prompt builder not found for page type'],
    failureAction: 'Log error, mark failed, alert admin.',
  },
  {
    order: 4,
    name: 'Call Claude API',
    state: 'generating',
    description: 'Send system + user prompt to Claude. Use default_model (Sonnet) for standard pages, or lightweight_model (Haiku) for bulk Tier 3 pages. Max tokens: 4000 for standard, 2000 for lightweight. Temperature: 0.3 (precise mode).',
    estimatedDuration: 15,
    trigger: 'Prompt assembled',
    failureConditions: [
      'Claude API rate limit (429) — retry with exponential backoff: 2s, 4s, 8s, 16s',
      'Claude API server error (500/503) — retry 3 times with 5s delay',
      'Response timeout (>60s)',
      'Response not valid JSON',
    ],
    failureAction: 'Retry up to 3 times. On final failure, mark as "generation_failed" with error details.',
  },
  {
    order: 5,
    name: 'Parse + Validate Response',
    state: 'validating',
    description: 'Extract JSON from Claude response (handle markdown code blocks). Validate against the page type schema: check all required fields present, array counts within min/max, string lengths within bounds.',
    estimatedDuration: 1,
    trigger: 'Claude response received',
    failureConditions: [
      'JSON parse failure',
      'Missing required fields (seo.title, hero.headline, curated_picks.items)',
      'Array counts outside bounds (e.g., <6 curated picks)',
      'Description exceeds 155 characters',
      'Duplicate content detected (>80% similarity with existing page)',
    ],
    failureAction: 'For parse failure: retry generation once with "output ONLY JSON" reinforcement. For validation: log specific failures and regenerate.',
  },
  {
    order: 6,
    name: 'Compute Deterministic Fields',
    state: 'validating',
    description: 'Fill in all DETERMINISTIC fields: seo.title (from template), seo.canonical_url, breadcrumbs, related_pages URLs, meta timestamps, quality_score (computed), word_count (computed).',
    estimatedDuration: 1,
    trigger: 'AI content validated',
    failureConditions: ['Template rendering failure'],
    failureAction: 'Log and skip — this should never fail.',
  },
  {
    order: 7,
    name: 'Quality Score Calculation',
    state: 'validating',
    description: 'Run the quality checklist (6D) and compute an overall score 0.0-1.0. Pages scoring below 0.6 are rejected. Pages scoring 0.6-0.8 are queued for manual review. Pages scoring >0.8 are auto-published.',
    estimatedDuration: 1,
    trigger: 'Deterministic fields computed',
    failureConditions: ['Quality score < 0.6'],
    failureAction: 'Mark as "low_quality" and queue for regeneration with adjusted prompt (add more specificity constraints).',
  },
  {
    order: 8,
    name: 'Upsert to Database',
    state: 'review',
    description: 'Write the complete page record to pseo_pages table via Supabase upsert. Set is_published based on quality score threshold. Set published_at trigger fires automatically.',
    estimatedDuration: 1,
    trigger: 'Quality check passed',
    failureConditions: ['Supabase upsert failure', 'Duplicate slug conflict'],
    failureAction: 'Retry upsert. On conflict, use the newer version if quality score is higher.',
  },
  {
    order: 9,
    name: 'Post-Publish Verification',
    state: 'published',
    description: 'Verify the page is accessible at its canonical URL. Add to sitemap queue. Trigger internal link recalculation for related pages. Log generation metrics (time, cost, quality).',
    estimatedDuration: 3,
    trigger: 'Database write confirmed',
    failureConditions: ['Page not accessible (rendering error)'],
    failureAction: 'Unpublish immediately. Log error for investigation.',
  },
];

// ============================================================================
// PRIORITIZATION
// ============================================================================

/**
 * Page types ordered by generation priority.
 * Criteria: search volume potential × ease of quality generation × data availability.
 */
export const GENERATION_PRIORITY: Array<{
  pageTypeId: PageTypeId;
  priority: number;
  reason: string;
  estimatedPages: number;
  batchSize: number;
}> = [
  { pageTypeId: 'location-guide', priority: 1, reason: 'Hub pages must exist first for internal linking', estimatedPages: 17, batchSize: 5 },
  { pageTypeId: 'content-location', priority: 2, reason: 'Highest search volume: "restaurants in east village"', estimatedPages: 102, batchSize: 10 },
  { pageTypeId: 'content-category', priority: 3, reason: 'High volume: "best italian restaurants des moines"', estimatedPages: 96, batchSize: 10 },
  { pageTypeId: 'content-audience', priority: 4, reason: 'High intent: "date night restaurants des moines"', estimatedPages: 54, batchSize: 10 },
  { pageTypeId: 'content-temporal', priority: 5, reason: 'Time-sensitive: "events this weekend des moines"', estimatedPages: 132, batchSize: 10 },
  { pageTypeId: 'category-location', priority: 6, reason: 'Long-tail: "italian east village"', estimatedPages: 100, batchSize: 10 },
  { pageTypeId: 'audience-temporal', priority: 7, reason: 'Long-tail: "family things to do this weekend"', estimatedPages: 36, batchSize: 10 },
  { pageTypeId: 'category-temporal', priority: 8, reason: 'Long-tail: "live music summer des moines"', estimatedPages: 60, batchSize: 10 },
  { pageTypeId: 'content-location-audience', priority: 9, reason: 'Deep long-tail: "family restaurants downtown des moines"', estimatedPages: 160, batchSize: 5 },
  { pageTypeId: 'content-location-temporal', priority: 10, reason: 'Deep long-tail: "events downtown this weekend"', estimatedPages: 192, batchSize: 5 },
];

// ============================================================================
// RATE LIMITING
// ============================================================================

export const RATE_LIMITS = {
  /** Max API calls per minute to Claude */
  claudeApiCallsPerMinute: 10,
  /** Max pages generated per hour */
  pagesPerHour: 30,
  /** Max pages generated per day */
  pagesPerDay: 200,
  /** Delay between batches (ms) */
  batchDelayMs: 5000,
  /** Max concurrent generation requests */
  maxConcurrent: 3,
  /** Cost estimate per page (Claude Sonnet tokens) */
  estimatedCostPerPage: {
    inputTokens: 2000,
    outputTokens: 3000,
    estimatedCostUSD: 0.025,
  },
};

// ============================================================================
// 6B. N8N WORKFLOW STRUCTURE
// ============================================================================

/**
 * n8n Workflow: pSEO Page Generation Pipeline
 *
 * Trigger: Scheduled (daily at 2am CT) OR Manual via webhook
 *
 * WORKFLOW:
 *
 * [1. TRIGGER]
 *   ├── Schedule: Daily 2:00 AM Central Time
 *   └── Webhook: POST /webhook/pseo-generate (manual trigger from admin)
 *
 * [2. FETCH QUEUE]
 *   └── Supabase Node: Query pseo_generation_queue
 *       WHERE status = 'pending'
 *       ORDER BY tier ASC, priority ASC
 *       LIMIT 50
 *
 * [3. SPLIT INTO BATCHES]
 *   └── Split In Batches: batch_size = 5
 *       (process 5 pages at a time to stay within rate limits)
 *
 * [4. FOR EACH PAGE IN BATCH]
 *   │
 *   ├── [4a. FETCH DATABASE RECORDS]
 *   │   └── Supabase Node: Query events/restaurants/attractions
 *   │       matching this page's dimension filters
 *   │       LIMIT 20
 *   │
 *   ├── [4b. DATA SUFFICIENCY CHECK]
 *   │   └── IF Node: records.length >= 3?
 *   │       ├── YES → continue to 4c
 *   │       └── NO → Mark as "insufficient_data", skip
 *   │
 *   ├── [4c. CHECK FOR EXISTING PAGE]
 *   │   └── Supabase Node: SELECT id FROM pseo_pages WHERE id = :pageId
 *   │       ├── EXISTS + !forceRegenerate → Skip
 *   │       └── NOT EXISTS → Continue
 *   │
 *   ├── [4d. CALL CLAUDE API]
 *   │   └── HTTP Request Node: POST to Claude API
 *   │       Headers: x-api-key, anthropic-version
 *   │       Body: { model, system, messages, max_tokens, temperature }
 *   │       Retry: 3 times with exponential backoff
 *   │
 *   ├── [4e. PARSE + VALIDATE]
 *   │   └── Code Node (JavaScript):
 *   │       - Extract JSON from response
 *   │       - Validate required fields
 *   │       - Check array counts
 *   │       - Compute quality score
 *   │       ├── VALID → Continue
 *   │       └── INVALID → Retry once, then mark failed
 *   │
 *   ├── [4f. COMPUTE DETERMINISTIC FIELDS]
 *   │   └── Code Node: Fill seo.title, canonical_url, breadcrumbs,
 *   │       related_pages, meta timestamps, quality_score
 *   │
 *   └── [4g. UPSERT TO SUPABASE]
 *       └── Supabase Node: UPSERT into pseo_pages
 *           on_conflict: id
 *           Set is_published = true if quality_score > 0.8
 *
 * [5. BATCH DELAY]
 *   └── Wait Node: 5 seconds between batches
 *
 * [6. REPORTING]
 *   └── Code Node: Aggregate results
 *       → Slack/Email notification with:
 *         - Pages generated: X
 *         - Pages skipped: X
 *         - Pages failed: X
 *         - Total time: X minutes
 *         - Estimated cost: $X.XX
 *
 * [7. ERROR HANDLER]
 *   └── Error Trigger Node:
 *       → Slack alert with error details
 *       → Log to pseo_generation_log table
 */

export interface N8nWorkflowNode {
  id: string;
  name: string;
  type: string;
  purpose: string;
  configuration: Record<string, unknown>;
}

export const N8N_WORKFLOW_NODES: N8nWorkflowNode[] = [
  {
    id: 'trigger',
    name: 'Schedule/Webhook Trigger',
    type: 'n8n-nodes-base.scheduleTrigger + n8n-nodes-base.webhook',
    purpose: 'Triggers daily at 2am CT or via manual webhook',
    configuration: {
      schedule: { cron: '0 2 * * *', timezone: 'America/Chicago' },
      webhook: { method: 'POST', path: '/pseo-generate' },
    },
  },
  {
    id: 'fetch_queue',
    name: 'Fetch Generation Queue',
    type: 'n8n-nodes-base.supabase',
    purpose: 'Get pending page combinations ordered by priority',
    configuration: {
      operation: 'getAll',
      table: 'pseo_generation_queue',
      filters: { status: 'pending' },
      sort: ['tier:asc', 'priority:asc'],
      limit: 50,
    },
  },
  {
    id: 'split_batches',
    name: 'Split Into Batches',
    type: 'n8n-nodes-base.splitInBatches',
    purpose: 'Process 5 pages at a time for rate limiting',
    configuration: { batchSize: 5 },
  },
  {
    id: 'fetch_db_records',
    name: 'Fetch Database Records',
    type: 'n8n-nodes-base.supabase',
    purpose: 'Get matching events/restaurants/attractions for this combination',
    configuration: {
      operation: 'getAll',
      tables: ['events', 'restaurants', 'attractions'],
      dynamicFilters: 'Based on dimension values',
      limit: 20,
    },
  },
  {
    id: 'data_check',
    name: 'Data Sufficiency Check',
    type: 'n8n-nodes-base.if',
    purpose: 'Ensure minimum 3 records exist before generating',
    configuration: { condition: 'records.length >= 3' },
  },
  {
    id: 'call_claude',
    name: 'Call Claude API',
    type: 'n8n-nodes-base.httpRequest',
    purpose: 'Send assembled prompt to Claude for content generation',
    configuration: {
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      retryOnFail: true,
      maxRetries: 3,
      retryDelay: 5000,
    },
  },
  {
    id: 'validate',
    name: 'Parse + Validate Response',
    type: 'n8n-nodes-base.code',
    purpose: 'Extract JSON, validate schema, compute quality score',
    configuration: { language: 'javascript' },
  },
  {
    id: 'upsert',
    name: 'Upsert to Supabase',
    type: 'n8n-nodes-base.supabase',
    purpose: 'Write validated page to pseo_pages table',
    configuration: {
      operation: 'upsert',
      table: 'pseo_pages',
      onConflict: 'id',
    },
  },
  {
    id: 'batch_delay',
    name: 'Batch Delay',
    type: 'n8n-nodes-base.wait',
    purpose: 'Wait 5s between batches to respect rate limits',
    configuration: { seconds: 5 },
  },
  {
    id: 'report',
    name: 'Generate Report',
    type: 'n8n-nodes-base.code',
    purpose: 'Aggregate results and send notification',
    configuration: { outputs: ['slack', 'email'] },
  },
];

// ============================================================================
// 6C. SUPABASE TABLE DEFINITION (supplementary tables)
// ============================================================================

/**
 * The primary pseo_pages table is already defined in:
 *   supabase/migrations/20260311000001_create_pseo_pages.sql
 *
 * Below are supplementary tables needed for the pipeline.
 */

export const SUPPLEMENTARY_SQL = `
-- Generation queue table for pipeline orchestration
CREATE TABLE IF NOT EXISTS pseo_generation_queue (
  id TEXT PRIMARY KEY,
  page_type_id TEXT NOT NULL,
  dimensions JSONB NOT NULL,
  tier INTEGER NOT NULL DEFAULT 2,
  priority INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'insufficient_data', 'deferred')),
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduled_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pseo_queue_status ON pseo_generation_queue(status, tier, priority);
CREATE INDEX IF NOT EXISTS idx_pseo_queue_page_type ON pseo_generation_queue(page_type_id);

-- Generation log for audit trail
CREATE TABLE IF NOT EXISTS pseo_generation_log (
  id SERIAL PRIMARY KEY,
  page_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('generated', 'regenerated', 'published', 'unpublished', 'failed', 'quality_check')),
  details JSONB DEFAULT '{}',
  model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  generation_time_ms INTEGER,
  quality_score NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pseo_log_page ON pseo_generation_log(page_id);
CREATE INDEX IF NOT EXISTS idx_pseo_log_action ON pseo_generation_log(action);

-- RLS policies
ALTER TABLE pseo_generation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE pseo_generation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access for queue" ON pseo_generation_queue FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role access for log" ON pseo_generation_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin read access for queue" ON pseo_generation_queue FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin read access for log" ON pseo_generation_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
`;

// ============================================================================
// 6D. QUALITY CONTROL CHECKLIST
// ============================================================================

export interface QualityCheck {
  id: string;
  name: string;
  weight: number;
  description: string;
  check: string;
  passThreshold: string;
  autoFix: boolean;
}

export const QUALITY_CHECKLIST: QualityCheck[] = [
  {
    id: 'schema_completeness',
    name: 'Schema Completeness',
    weight: 0.20,
    description: 'All required fields present and non-empty',
    check: 'Iterate through PAGE_TYPE_REQUIRED_SECTIONS for this page type. Verify each section exists in the sections array.',
    passThreshold: '100% of required sections present',
    autoFix: false,
  },
  {
    id: 'word_count_hero',
    name: 'Hero Word Count',
    weight: 0.05,
    description: 'Hero intro within word count bounds',
    check: 'hero.intro.split(/\\s+/).length between 40 and 60',
    passThreshold: '40-60 words',
    autoFix: false,
  },
  {
    id: 'word_count_total',
    name: 'Total Word Count',
    weight: 0.10,
    description: 'Total AI-generated words across all sections',
    check: 'Sum words across all text fields. Exclude FROM-DB and DETERMINISTIC fields.',
    passThreshold: '>= 400 words for standard pages, >= 600 for hub pages',
    autoFix: false,
  },
  {
    id: 'curated_picks_count',
    name: 'Curated Picks Count',
    weight: 0.10,
    description: 'Number of curated items within bounds',
    check: 'curated_picks.items.length between SECTION_MIN_COUNTS and SECTION_MAX_COUNTS',
    passThreshold: '6-12 items depending on page type',
    autoFix: false,
  },
  {
    id: 'faq_count',
    name: 'FAQ Count',
    weight: 0.05,
    description: 'Number of FAQ items within bounds',
    check: 'faq.length between 4 and 7',
    passThreshold: '4-7 FAQ items',
    autoFix: false,
  },
  {
    id: 'seo_title_length',
    name: 'SEO Title Length',
    weight: 0.05,
    description: 'Title within 50-60 character optimal range',
    check: 'seo.title.length between 30 and 65',
    passThreshold: '30-65 characters',
    autoFix: true, // Can be truncated/padded deterministically
  },
  {
    id: 'seo_description_length',
    name: 'SEO Description Length',
    weight: 0.05,
    description: 'Meta description within 120-155 character range',
    check: 'seo.description.length between 120 and 160',
    passThreshold: '120-160 characters',
    autoFix: false,
  },
  {
    id: 'local_reference',
    name: 'Local Reference Check',
    weight: 0.15,
    description: 'Content mentions Des Moines or the specific location 2-4 times',
    check: 'Count occurrences of "Des Moines" OR location.name in all text fields',
    passThreshold: '2-6 mentions across all sections',
    autoFix: false,
  },
  {
    id: 'insider_tip_uniqueness',
    name: 'Insider Tip Uniqueness',
    weight: 0.10,
    description: 'Each curated pick has a unique insider tip (no duplicates)',
    check: 'All insider_tip strings are unique. No two tips share >50% of words.',
    passThreshold: '0 duplicate tips',
    autoFix: false,
  },
  {
    id: 'internal_link_count',
    name: 'Internal Link Count',
    weight: 0.05,
    description: 'Related pages within bounds',
    check: 'related_pages.length between 4 and 8',
    passThreshold: '4-8 internal links',
    autoFix: true, // Can auto-generate from dimension relationships
  },
  {
    id: 'internal_link_validity',
    name: 'Internal Link Validity',
    weight: 0.05,
    description: 'All internal links point to existing published pages',
    check: 'For each related_page.url, verify EXISTS in pseo_pages WHERE is_published = true',
    passThreshold: '100% valid links',
    autoFix: true, // Remove invalid links
  },
  {
    id: 'duplicate_content',
    name: 'Duplicate Content Detection',
    weight: 0.05,
    description: 'Content is not too similar to existing pages',
    check: 'Compare hero.intro + first 3 curated_pick descriptions against existing pages. Cosine similarity < 0.8.',
    passThreshold: '< 80% similarity to any existing page',
    autoFix: false,
  },
];

/**
 * Compute quality score from checklist results.
 */
export function computeQualityScore(
  results: Array<{ checkId: string; passed: boolean; score: number }>
): number {
  const checkMap = new Map(QUALITY_CHECKLIST.map(c => [c.id, c]));
  let weightedSum = 0;
  let totalWeight = 0;

  for (const result of results) {
    const check = checkMap.get(result.checkId);
    if (!check) continue;
    weightedSum += result.score * check.weight;
    totalWeight += check.weight;
  }

  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
}

/**
 * Quality score thresholds for publish decisions.
 */
export const QUALITY_THRESHOLDS = {
  /** Auto-publish: no manual review needed */
  autoPublish: 0.80,
  /** Manual review: queued for human check */
  manualReview: 0.60,
  /** Reject: regenerate with adjusted prompt */
  reject: 0.60,
};

// ============================================================================
// REFRESH STRATEGY
// ============================================================================

/**
 * Content refresh schedule by page type and temporal dimension.
 */
export const REFRESH_STRATEGY: Record<string, { schedule: string; notes: string }> = {
  // Time-sensitive pages
  'today': { schedule: 'Every 6 hours', notes: 'Live listings auto-refresh client-side. Static content regenerated 4x/day.' },
  'this-weekend': { schedule: 'Daily at midnight CT', notes: 'Regenerate Wednesday-Friday for weekend preview.' },
  'this-week': { schedule: 'Daily at midnight CT', notes: 'Regenerate Sunday night for the upcoming week.' },

  // Seasonal pages
  'spring': { schedule: 'Weekly on Monday', notes: 'Refresh March 1 through May 31.' },
  'summer': { schedule: 'Weekly on Monday', notes: 'Refresh June 1 through August 31.' },
  'fall': { schedule: 'Weekly on Monday', notes: 'Refresh September 1 through November 30.' },
  'winter': { schedule: 'Weekly on Monday', notes: 'Refresh December 1 through February 28.' },

  // Monthly pages
  'monthly': { schedule: 'First of each month', notes: 'Regenerate on the 1st with fresh content.' },

  // Evergreen pages
  'evergreen': { schedule: 'Monthly on the 15th', notes: 'Check for data freshness. Regenerate if >30 days old.' },
};

// ============================================================================
// COST ESTIMATION
// ============================================================================

export function estimateGenerationCost(pageCount: number): {
  totalPages: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUSD: number;
  estimatedTimeHours: number;
} {
  const { inputTokens, outputTokens, estimatedCostUSD } = RATE_LIMITS.estimatedCostPerPage;
  return {
    totalPages: pageCount,
    inputTokens: pageCount * inputTokens,
    outputTokens: pageCount * outputTokens,
    estimatedCostUSD: Math.round(pageCount * estimatedCostUSD * 100) / 100,
    estimatedTimeHours: Math.round((pageCount / RATE_LIMITS.pagesPerHour) * 10) / 10,
  };
}
