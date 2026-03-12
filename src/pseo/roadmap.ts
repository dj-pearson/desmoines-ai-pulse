/**
 * pSEO 2.0 — Phase 7: Six-Week Progressive Launch Roadmap
 *
 * Strategy: Progressive rollout to monitor indexing quality before scaling.
 * Never publish all pages at once — Google treats sudden page count spikes
 * as suspicious.
 *
 * Total target: ~950 pages across 10 page types
 * Rollout rate: ~100-200 pages per week after Week 2
 */

// ============================================================================
// WEEK-BY-WEEK ROADMAP
// ============================================================================

export interface WeekPlan {
  week: number;
  dates: string;
  title: string;
  objectives: string[];
  pageTarget: number;
  cumulativePages: number;
  pageTypes: Array<{
    pageTypeId: string;
    count: number;
    tierFilter: string;
    notes: string;
  }>;
  gscSignals: string[];
  decisionPoints: string[];
  technicalTasks: string[];
}

export const LAUNCH_ROADMAP: WeekPlan[] = [
  // =========================================================================
  // WEEK 1: Foundation + Tier 1 Hub Pages
  // =========================================================================
  {
    week: 1,
    dates: 'Week of launch (Day 1-7)',
    title: 'Foundation — Hub Pages & Infrastructure',
    objectives: [
      'Deploy database migration (pseo_pages, queue, log tables)',
      'Deploy Edge Function (generate-pseo-page)',
      'Generate and publish all 17 Location Guide hub pages',
      'Generate Tier 1 content-location pages (top 4 content types × top 5 locations = 20)',
      'Submit sitemap to Google Search Console',
      'Verify structured data in Google Rich Results Test',
    ],
    pageTarget: 37,
    cumulativePages: 37,
    pageTypes: [
      { pageTypeId: 'location-guide', count: 17, tierFilter: 'All tiers', notes: 'Hub pages first — they are the internal linking backbone' },
      { pageTypeId: 'content-location', count: 20, tierFilter: 'Tier 1 only', notes: 'Top content types × top 5 locations' },
    ],
    gscSignals: [
      'Verify pages appear in Coverage report within 48 hours',
      'Check for crawl errors in URL Inspection tool',
      'Confirm structured data is valid (no errors in Enhancements)',
      'Monitor for "Discovered - not indexed" vs "Crawled - not indexed"',
    ],
    decisionPoints: [
      'PROCEED if: >80% of pages discovered within 48 hours',
      'PAUSE if: >20% crawl errors — investigate and fix before continuing',
      'ADJUST if: Structured data errors — fix schema before generating more',
    ],
    technicalTasks: [
      'Run supabase db push for migration',
      'Deploy generate-pseo-page Edge Function',
      'Add pseo_pages routes to sitemap generator',
      'Verify canonical URLs resolve correctly',
      'Test PseoRoutePage component renders all section types',
      'Validate Schema.org markup with Google Rich Results Test',
    ],
  },

  // =========================================================================
  // WEEK 2: Monitor Indexing + Category Pages
  // =========================================================================
  {
    week: 2,
    dates: 'Week of launch + 7 days',
    title: 'Monitor & Expand — Category Pages',
    objectives: [
      'Analyze Week 1 indexing signals in GSC',
      'Generate content-category pages (Tier 1 categories)',
      'Generate content-audience pages (Tier 1 audiences)',
      'Set up n8n workflow for automated generation',
      'Monitor Core Web Vitals for pSEO pages',
    ],
    pageTarget: 100,
    cumulativePages: 137,
    pageTypes: [
      { pageTypeId: 'content-category', count: 48, tierFilter: 'Tier 1 categories only', notes: 'Top 4 content types × top 12 Tier 1 categories' },
      { pageTypeId: 'content-audience', count: 30, tierFilter: 'Tier 1 audiences only', notes: 'Top 4 content types × top 5 Tier 1 audiences (excl. low-tier combos)' },
      { pageTypeId: 'content-location', count: 22, tierFilter: 'Tier 2 locations', notes: 'Expand to remaining locations' },
    ],
    gscSignals: [
      'Indexing rate: target >60% of Week 1 pages indexed',
      'Click-through rate on any indexed pages',
      'Average position for target keywords',
      'Any pages stuck in "Crawled - not indexed" (quality signal)',
    ],
    decisionPoints: [
      'PROCEED if: >60% of Week 1 pages indexed, no quality flags',
      'SLOW DOWN if: <40% indexed — Google may be throttling; reduce batch size',
      'ADJUST CONTENT if: "Crawled - not indexed" pages — content quality issue, review prompts',
      'STOP if: Manual action from Google — review for thin content violations',
    ],
    technicalTasks: [
      'Configure n8n workflow with Supabase + Claude integration',
      'Set up Slack notifications for generation pipeline',
      'Add PageSpeed monitoring for pSEO pages',
      'Implement view count tracking (increment_pseo_page_views)',
      'Add Google Analytics events for pSEO page interactions',
    ],
  },

  // =========================================================================
  // WEEK 3: Temporal Pages + Cross-Linking
  // =========================================================================
  {
    week: 3,
    dates: 'Week of launch + 14 days',
    title: 'Time-Sensitive Pages + Internal Linking',
    objectives: [
      'Generate content-temporal pages (seasons + this-weekend/today)',
      'Generate category-location cross pages (Tier 1)',
      'Implement internal link recalculation — update related_pages across all existing pages',
      'Set up daily refresh for today/weekend pages',
      'Run first quality audit on all published pages',
    ],
    pageTarget: 150,
    cumulativePages: 287,
    pageTypes: [
      { pageTypeId: 'content-temporal', count: 60, tierFilter: 'Seasons + high-intent temporal', notes: 'All 4 content types × (4 seasons + today + this-weekend + this-week + current month)' },
      { pageTypeId: 'category-location', count: 50, tierFilter: 'Tier 1 categories × Tier 1 locations', notes: 'Top category + location combos' },
      { pageTypeId: 'audience-temporal', count: 20, tierFilter: 'Tier 1 audiences × seasons', notes: 'High-intent combos like "family things this weekend"' },
      { pageTypeId: 'category-temporal', count: 20, tierFilter: 'Tier 1 categories × seasons', notes: 'Seasonal category pages' },
    ],
    gscSignals: [
      'Total indexed pages: target >150 (55%+ of cumulative)',
      'First clicks from organic search on pSEO pages',
      'Keyword rankings emerging for long-tail queries',
      'Internal links detected in GSC Links report',
      'Core Web Vitals: all pSEO pages in "Good" range',
    ],
    decisionPoints: [
      'PROCEED if: >50% cumulative pages indexed, some organic clicks appearing',
      'ADJUST TAXONOMY if: Certain categories have 0 clicks — may need to merge or rename dimensions',
      'OPTIMIZE if: CWV issues — reduce JS bundle, optimize images',
      'REGENERATE if: Quality audit finds pages scoring <0.6',
    ],
    technicalTasks: [
      'Implement daily cron job for today/weekend page refresh',
      'Build internal link recalculation script (runs after each batch)',
      'Create admin dashboard widget showing pSEO stats',
      'Quality audit: run QUALITY_CHECKLIST on all published pages',
      'Fix any pages that fail quality checks',
    ],
  },

  // =========================================================================
  // WEEK 4: Triple Combos + Scale Up
  // =========================================================================
  {
    week: 4,
    dates: 'Week of launch + 21 days',
    title: 'Long-Tail Expansion — Triple Combinations',
    objectives: [
      'Generate content-location-audience triple pages (Tier 1 only)',
      'Generate content-location-temporal triple pages (Tier 1 only)',
      'Expand remaining Tier 2 double combination pages',
      'Analyze first traffic data — which page types are performing?',
      'A/B test different hero headline styles on 2 page types',
    ],
    pageTarget: 200,
    cumulativePages: 487,
    pageTypes: [
      { pageTypeId: 'content-location-audience', count: 60, tierFilter: 'Tier 1 triples only', notes: 'Top 3 content × top 5 locations × top 4 audiences' },
      { pageTypeId: 'content-location-temporal', count: 60, tierFilter: 'Tier 1 triples only', notes: 'Top 3 content × top 5 locations × seasons' },
      { pageTypeId: 'content-category', count: 30, tierFilter: 'Remaining Tier 2', notes: 'Fill out remaining category pages' },
      { pageTypeId: 'category-location', count: 30, tierFilter: 'Remaining Tier 2', notes: 'Expand category-location combos' },
      { pageTypeId: 'category-temporal', count: 20, tierFilter: 'Remaining months', notes: 'Monthly category pages' },
    ],
    gscSignals: [
      'Total indexed pages: target >300 (60%+ of cumulative)',
      'Organic clicks: target >50 clicks/week from pSEO pages',
      'Average position: target <30 for at least 20 queries',
      'Impressions growing week-over-week',
      'No new quality issues in Coverage report',
    ],
    decisionPoints: [
      'PROCEED if: Indexed rate >55%, organic clicks growing, no quality flags',
      'DOUBLE DOWN if: Specific page types outperforming — generate more of that type',
      'PRUNE if: Specific combos have 0 impressions after 3 weeks — consider removing',
      'PAUSE TRIPLES if: Indexing rate drops below 40% — may be hitting quality threshold',
    ],
    technicalTasks: [
      'Implement A/B test framework for hero sections',
      'Build traffic reporting dashboard (pSEO pages vs rest of site)',
      'Optimize PseoLiveListings query performance',
      'Add "last updated" badge to temporal pages',
      'Implement content refresh for pages older than freshness_days',
    ],
  },

  // =========================================================================
  // WEEK 5: Optimization + Remaining Pages
  // =========================================================================
  {
    week: 5,
    dates: 'Week of launch + 28 days',
    title: 'Optimize Performers + Fill Gaps',
    objectives: [
      'Generate remaining Tier 2 and Tier 3 pages',
      'Optimize top-performing pages (enhance content, add more curated picks)',
      'Prune underperforming pages (noindex or merge)',
      'Implement content refresh pipeline for aging pages',
      'Begin monthly page generation for upcoming months',
    ],
    pageTarget: 250,
    cumulativePages: 737,
    pageTypes: [
      { pageTypeId: 'content-location-audience', count: 80, tierFilter: 'Tier 2 triples', notes: 'Expand to more location-audience combos' },
      { pageTypeId: 'content-location-temporal', count: 80, tierFilter: 'Tier 2 triples', notes: 'Expand to more location-temporal combos' },
      { pageTypeId: 'content-temporal', count: 50, tierFilter: 'Remaining months', notes: 'All monthly pages for all content types' },
      { pageTypeId: 'audience-temporal', count: 16, tierFilter: 'Remaining', notes: 'Fill out audience × temporal grid' },
      { pageTypeId: 'category-temporal', count: 24, tierFilter: 'Remaining', notes: 'Fill out category × temporal grid' },
    ],
    gscSignals: [
      'Total indexed pages: target >450 (60%+)',
      'Organic clicks: target >150 clicks/week',
      'Top performing page types identified',
      'Keyword cannibalization check (overlapping pages competing)',
      'Bounce rate for pSEO pages vs site average',
    ],
    decisionPoints: [
      'PROCEED if: Steady indexing growth, clicks growing, bounce rate <70%',
      'OPTIMIZE if: High bounce rate on specific page types — improve content quality',
      'MERGE if: Cannibalization detected between similar pages — 301 redirect weaker to stronger',
      'SCALE if: Clicks/page > site average — allocate more resources to pSEO',
    ],
    technicalTasks: [
      'Build content refresh cron (regenerate pages older than freshness_days)',
      'Implement 301 redirect system for merged/pruned pages',
      'Add noindex meta tag capability for low-quality pages',
      'Optimize database queries (add compound indexes if needed)',
      'Cache frequently-accessed pSEO pages at CDN level',
    ],
  },

  // =========================================================================
  // WEEK 6: Full Build-Out + Steady State
  // =========================================================================
  {
    week: 6,
    dates: 'Week of launch + 35 days',
    title: 'Full Scale + Steady State Operations',
    objectives: [
      'Generate remaining pages to reach ~950 total',
      'Full quality audit of all published pages',
      'Establish steady-state operations (daily refresh, monthly regeneration)',
      'Document operational playbook for ongoing management',
      'Set up automated monitoring and alerting',
    ],
    pageTarget: 213,
    cumulativePages: 950,
    pageTypes: [
      { pageTypeId: 'content-location-audience', count: 20, tierFilter: 'Tier 3 (selective)', notes: 'Only generate if data supports it' },
      { pageTypeId: 'content-location-temporal', count: 52, tierFilter: 'Tier 3 (selective)', notes: 'Remaining viable combos' },
      { pageTypeId: 'content-location', count: 60, tierFilter: 'All remaining', notes: 'Fill out content × location grid' },
      { pageTypeId: 'category-location', count: 20, tierFilter: 'Remaining viable', notes: 'Only where sufficient data exists' },
      { pageTypeId: 'content-audience', count: 24, tierFilter: 'Remaining', notes: 'Fill out audience grid' },
      { pageTypeId: 'content-category', count: 18, tierFilter: 'Remaining', notes: 'Fill out category grid' },
      { pageTypeId: 'content-temporal', count: 19, tierFilter: 'Remaining', notes: 'Complete temporal coverage' },
    ],
    gscSignals: [
      'Total indexed pages: target >550 (58%+ — normal for pSEO)',
      'Organic clicks: target >300 clicks/week',
      'Organic traffic from pSEO: target 15-25% of total site organic',
      'Featured snippets for FAQ sections',
      'Sitelinks appearing for hub pages',
    ],
    decisionPoints: [
      'SUCCESS if: >500 pages indexed, >250 clicks/week, growing trend',
      'ITERATE if: Some page types underperforming — A/B test new prompt variants',
      'EXPAND if: Strong performance — add new dimension values (more suburbs, more categories)',
      'STEADY STATE if: Metrics stable — switch to maintenance mode (refresh + monitor)',
    ],
    technicalTasks: [
      'Full quality audit: run checklist on all 950 pages',
      'Prune any pages scoring <0.6 quality',
      'Set up weekly automated GSC data export',
      'Create ops playbook document',
      'Configure alerting for indexing drops, quality degradation',
      'Plan next taxonomy expansion (new suburbs, new categories)',
    ],
  },
];

// ============================================================================
// TRAFFIC PROJECTIONS
// ============================================================================

export interface TrafficProjection {
  week: number;
  publishedPages: number;
  indexedPages: number;
  indexingRate: number;
  estimatedWeeklyClicks: number;
  estimatedWeeklyImpressions: number;
  notes: string;
}

/**
 * Conservative traffic projections based on:
 * - 40-60% indexing rate (normal for pSEO at scale)
 * - 0.5-2 clicks/week per indexed page (long-tail averages)
 * - Growth accelerates as internal linking strengthens
 */
export const TRAFFIC_PROJECTIONS: TrafficProjection[] = [
  { week: 1, publishedPages: 37, indexedPages: 10, indexingRate: 0.27, estimatedWeeklyClicks: 5, estimatedWeeklyImpressions: 200, notes: 'Initial crawl. Most pages discovered but not yet indexed.' },
  { week: 2, publishedPages: 137, indexedPages: 50, indexingRate: 0.36, estimatedWeeklyClicks: 25, estimatedWeeklyImpressions: 1000, notes: 'First batch indexing. Hub pages indexed first.' },
  { week: 3, publishedPages: 287, indexedPages: 130, indexingRate: 0.45, estimatedWeeklyClicks: 80, estimatedWeeklyImpressions: 3500, notes: 'Internal linking boosts crawl budget allocation.' },
  { week: 4, publishedPages: 487, indexedPages: 250, indexingRate: 0.51, estimatedWeeklyClicks: 180, estimatedWeeklyImpressions: 8000, notes: 'Long-tail queries starting to hit. Time-sensitive pages drive urgency clicks.' },
  { week: 5, publishedPages: 737, indexedPages: 400, indexingRate: 0.54, estimatedWeeklyClicks: 350, estimatedWeeklyImpressions: 15000, notes: 'Compound growth from cross-linking. FAQ snippets appearing.' },
  { week: 6, publishedPages: 950, indexedPages: 550, indexingRate: 0.58, estimatedWeeklyClicks: 500, estimatedWeeklyImpressions: 22000, notes: 'Approaching steady state. Expect continued growth for 2-3 months.' },
];

// ============================================================================
// COST PROJECTIONS
// ============================================================================

export const COST_PROJECTIONS = {
  totalPages: 950,
  costPerPage: 0.025, // USD (Claude Sonnet estimate)
  totalGenerationCost: 23.75, // USD
  monthlyRefreshCost: {
    dailyPages: 20,  // today/weekend pages
    weeklyPages: 50,  // seasonal pages
    monthlyPages: 200, // evergreen pages
    estimatedMonthlyCost: 8.50, // USD
  },
  infrastructure: {
    supabase: 'Within free tier for <10K rows',
    cloudflarePages: 'Free (static + serverless)',
    n8n: 'Self-hosted or $20/mo cloud',
  },
};

// ============================================================================
// DELIVERABLES CHECKLIST
// ============================================================================

export const DELIVERABLES_CHECKLIST = {
  taxonomy: {
    complete: true,
    file: 'src/pseo/taxonomy.ts',
    details: '5 dimensions, 70+ values, all with full context objects',
  },
  combinationMatrix: {
    complete: true,
    file: 'src/pseo/pageTypes.ts',
    details: '10 page types, ~950 estimated combinations with tier priorities',
  },
  pageTypeDefinitions: {
    complete: true,
    file: 'src/pseo/pageTypes.ts',
    details: '10 page types with slug/title/H1/description builders',
  },
  typescriptSchemas: {
    complete: true,
    file: 'src/pseo/detailedSchemas.ts',
    details: '10 typed schemas with AI-FILL/DETERMINISTIC/FROM-DB annotations',
  },
  generationPrompts: {
    complete: true,
    file: 'src/pseo/generationPrompts.ts',
    details: '10 per-page-type prompts with system + context + schema + quality constraints',
  },
  componentSpecs: {
    complete: true,
    file: 'src/pseo/componentSpecs.ts',
    details: '10 component specs with layout, schema markup, performance, linking rules',
  },
  supabaseSQL: {
    complete: true,
    files: [
      'supabase/migrations/20260311000001_create_pseo_pages.sql',
      'src/pseo/pipeline.ts (SUPPLEMENTARY_SQL)',
    ],
    details: 'pseo_pages + pseo_generation_queue + pseo_generation_log tables with RLS, indexes, triggers',
  },
  n8nWorkflow: {
    complete: true,
    file: 'src/pseo/pipeline.ts',
    details: '10-node workflow: trigger → queue → batch → fetch → validate → generate → upsert → report',
  },
  rolloutRoadmap: {
    complete: true,
    file: 'src/pseo/roadmap.ts',
    details: '6-week plan: 37 → 137 → 287 → 487 → 737 → 950 pages',
  },
  estimatedTotalPages: {
    complete: true,
    total: 950,
    breakdown: {
      'location-guide': 17,
      'content-location': 102,
      'content-audience': 54,
      'content-temporal': 132,
      'content-category': 96,
      'content-location-audience': 160,
      'content-location-temporal': 192,
      'category-location': 100,
      'audience-temporal': 36,
      'category-temporal': 60,
    },
  },
};
