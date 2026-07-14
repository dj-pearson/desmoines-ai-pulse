/**
 * usePseoAdmin — Hook for the pSEO admin dashboard.
 *
 * Provides data fetching, mutations, and state management for:
 * - Page listing with filters
 * - Generation queue monitoring
 * - Single + batch page generation
 * - Publish/unpublish actions
 * - Generation logs
 * - Overview statistics
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { allPageTypes } from '../pageTypes';
import {
  allDimensions,
  getDimensionValues,
  type DimensionKey,
} from '../taxonomy';
import { GENERATION_PRIORITY } from '../pipeline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PseoPageSummary {
  id: string;
  slug: string;
  page_type_id: string;
  dimensions: Array<{ dimension: string; slug: string; name: string; tier: number }>;
  is_published: boolean;
  quality_score: number;
  view_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  seo: { title?: string; h1?: string } | null;
  generation_meta: { modelUsed?: string; generatedAt?: string; wordCount?: number } | null;
}

export interface PseoQueueItem {
  id: string;
  page_type_id: string;
  dimensions: unknown;
  tier: number;
  priority: number;
  status: string;
  error_message: string | null;
  attempts: number;
  created_at: string;
}

export interface PseoLogEntry {
  id: number;
  page_id: string;
  action: string;
  details: unknown;
  model_used: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  generation_time_ms: number | null;
  quality_score: number | null;
  created_at: string;
}

export interface PseoStats {
  totalPages: number;
  publishedPages: number;
  draftPages: number;
  averageQuality: number;
  totalViews: number;
  queuePending: number;
  queueFailed: number;
  pagesByType: Record<string, number>;
}

export interface PseoFilters {
  pageTypeId?: string;
  isPublished?: boolean;
  minQuality?: number;
  search?: string;
}

// ---------------------------------------------------------------------------
// Overview Stats
// ---------------------------------------------------------------------------

export function usePseoStats() {
  return useQuery({
    queryKey: ['pseo-admin-stats'],
    queryFn: async (): Promise<PseoStats> => {
      // Fetch page stats
      const { data: pages, error: pagesError } = await supabase
        .from('pseo_pages')
        .select('page_type_id, is_published, quality_score, view_count');

      if (pagesError) throw pagesError;

      // Fetch queue stats
      const { data: queue } = await supabase
        .from('pseo_generation_queue')
        .select('status');

      const allPages = pages ?? [];
      const published = allPages.filter((p) => p.is_published);
      const qualityScores = allPages
        .map((p) => p.quality_score)
        .filter((s): s is number => s != null && s > 0);

      const pagesByType: Record<string, number> = {};
      for (const p of allPages) {
        pagesByType[p.page_type_id] = (pagesByType[p.page_type_id] ?? 0) + 1;
      }

      return {
        totalPages: allPages.length,
        publishedPages: published.length,
        draftPages: allPages.length - published.length,
        averageQuality:
          qualityScores.length > 0
            ? Math.round((qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length) * 100) / 100
            : 0,
        totalViews: allPages.reduce((sum, p) => sum + (p.view_count ?? 0), 0),
        queuePending: (queue ?? []).filter((q) => q.status === 'pending').length,
        queueFailed: (queue ?? []).filter((q) => q.status === 'failed').length,
        pagesByType,
      };
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Page List
// ---------------------------------------------------------------------------

export function usePseoPages(filters: PseoFilters = {}) {
  return useQuery({
    queryKey: ['pseo-admin-pages', filters],
    queryFn: async (): Promise<PseoPageSummary[]> => {
      let query = supabase
        .from('pseo_pages')
        .select('id, slug, page_type_id, dimensions, is_published, quality_score, view_count, created_at, updated_at, published_at, seo, generation_meta')
        .order('updated_at', { ascending: false })
        .limit(100);

      if (filters.pageTypeId) {
        query = query.eq('page_type_id', filters.pageTypeId);
      }
      if (filters.isPublished !== undefined) {
        query = query.eq('is_published', filters.isPublished);
      }
      if (filters.minQuality !== undefined) {
        query = query.gte('quality_score', filters.minQuality);
      }

      const { data, error } = await query;
      if (error) throw error;

      let results = (data ?? []) as unknown as PseoPageSummary[];

      if (filters.search) {
        const term = filters.search.toLowerCase();
        results = results.filter(
          (p) =>
            p.slug.toLowerCase().includes(term) ||
            (p.seo as any)?.title?.toLowerCase().includes(term) ||
            (p.seo as any)?.h1?.toLowerCase().includes(term)
        );
      }

      return results;
    },
    staleTime: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Generation Queue
// ---------------------------------------------------------------------------

export function usePseoQueue() {
  return useQuery({
    queryKey: ['pseo-admin-queue'],
    queryFn: async (): Promise<PseoQueueItem[]> => {
      const { data, error } = await supabase
        .from('pseo_generation_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as unknown as PseoQueueItem[];
    },
    staleTime: 10_000,
    refetchInterval: 15_000, // Auto-refresh while viewing queue
  });
}

// ---------------------------------------------------------------------------
// Generation Logs
// ---------------------------------------------------------------------------

export function usePseoLogs(limit = 20) {
  return useQuery({
    queryKey: ['pseo-admin-logs', limit],
    queryFn: async (): Promise<PseoLogEntry[]> => {
      const { data, error } = await supabase
        .from('pseo_generation_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as unknown as PseoLogEntry[];
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations: Generate Page
// ---------------------------------------------------------------------------

export function useGeneratePage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      pageTypeId: string;
      dimensions: Array<{ dimension: string; slug: string; name: string; tier: number }>;
      forceRegenerate?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke('content/generate-pseo-page', {
        body: {
          pageTypeId: params.pageTypeId,
          dimensions: params.dimensions,
          forceRegenerate: params.forceRegenerate ?? false,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.skipped) {
        toast.info('Page already exists', { description: data.slug });
      } else {
        toast.success('Page generated', {
          description: `${data.slug} (${data.generationTimeMs}ms)`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['pseo-admin'] });
    },
    onError: (error) => {
      toast.error('Generation failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations: Batch Generate
// ---------------------------------------------------------------------------

export function useBatchGenerate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      pageTypeId: string;
      tier?: number;
      batchSize?: number;
    }) => {
      // Build dimension combinations for this page type
      const pageType = allPageTypes.find((pt) => pt.id === params.pageTypeId);
      if (!pageType) throw new Error(`Unknown page type: ${params.pageTypeId}`);

      const combinations = buildCombinationsForType(
        pageType.id,
        pageType.dimensions as DimensionKey[],
        params.tier ?? 1,
        params.batchSize ?? 5
      );

      // Generate each page sequentially
      const results = { generated: 0, skipped: 0, failed: 0, errors: [] as string[] };

      for (const combo of combinations) {
        try {
          const { data, error } = await supabase.functions.invoke('content/generate-pseo-page', {
            body: {
              pageTypeId: params.pageTypeId,
              dimensions: combo,
              forceRegenerate: false,
            },
          });

          if (error) {
            results.failed++;
            results.errors.push(String(error));
          } else if (data?.skipped) {
            results.skipped++;
          } else {
            results.generated++;
          }
        } catch (e) {
          results.failed++;
          results.errors.push(String(e));
        }

        // Rate limit: wait 2 seconds between requests
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      return results;
    },
    onSuccess: (data) => {
      toast.success('Batch complete', {
        description: `Generated: ${data.generated}, Skipped: ${data.skipped}, Failed: ${data.failed}`,
      });
      queryClient.invalidateQueries({ queryKey: ['pseo-admin'] });
    },
    onError: (error) => {
      toast.error('Batch generation failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations: Toggle Publish
// ---------------------------------------------------------------------------

export function useTogglePublish() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { pageId: string; publish: boolean }) => {
      const { error } = await supabase
        .from('pseo_pages')
        .update({ is_published: params.publish })
        .eq('id', params.pageId);

      if (error) throw error;
    },
    onSuccess: (_, params) => {
      toast.success(params.publish ? 'Page published' : 'Page unpublished');
      queryClient.invalidateQueries({ queryKey: ['pseo-admin'] });
    },
    onError: (error) => {
      toast.error('Failed to update page', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations: Delete Page
// ---------------------------------------------------------------------------

export function useDeletePage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pageId: string) => {
      const { error } = await supabase
        .from('pseo_pages')
        .delete()
        .eq('id', pageId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Page deleted');
      queryClient.invalidateQueries({ queryKey: ['pseo-admin'] });
    },
    onError: (error) => {
      toast.error('Failed to delete page', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCombinationsForType(
  pageTypeId: string,
  dimensionKeys: DimensionKey[],
  maxTier: number,
  limit: number
): Array<Array<{ dimension: string; slug: string; name: string; tier: number }>> {
  const slotValues = dimensionKeys.map((key) =>
    getDimensionValues(key).filter((v) => v.tier <= maxTier)
  );

  const combos: Array<Array<{ dimension: string; slug: string; name: string; tier: number }>> = [];

  function crossProduct(index: number, current: Array<{ dimension: string; slug: string; name: string; tier: number }>) {
    if (combos.length >= limit) return;
    if (index === slotValues.length) {
      combos.push([...current]);
      return;
    }
    for (const val of slotValues[index]) {
      if (combos.length >= limit) return;
      crossProduct(index + 1, [
        ...current,
        { dimension: val.dimension, slug: val.slug, name: val.name, tier: val.tier },
      ]);
    }
  }

  crossProduct(0, []);
  return combos;
}

/**
 * Get available page types for the generation dropdown.
 */
export function getPageTypeOptions() {
  return GENERATION_PRIORITY.map((p) => ({
    id: p.pageTypeId,
    name: allPageTypes.find((pt) => pt.id === p.pageTypeId)?.name ?? p.pageTypeId,
    estimatedPages: p.estimatedPages,
    priority: p.priority,
    reason: p.reason,
  }));
}
