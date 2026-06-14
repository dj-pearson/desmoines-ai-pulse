/**
 * usePseoPage — Hook for fetching and rendering pSEO pages.
 *
 * Fetches the page content from Supabase based on the current URL slug,
 * with caching via TanStack Query.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PseoPageContent, PseoPageRow } from '../schemas';

export function usePseoPage(slug: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['pseo-page', slug],
    queryFn: () => fetchPseoPage(slug),
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    enabled: options?.enabled ?? true,
  });
}

async function fetchPseoPage(slug: string): Promise<PseoPageContent | null> {
  // Normalize slug: ensure leading slash
  const normalizedSlug = slug.startsWith('/') ? slug : `/${slug}`;

  const { data, error } = await supabase
    .from('pseo_pages')
    .select('*')
    .eq('slug', normalizedSlug)
    .eq('is_published', true)
    .single();

  if (error || !data) return null;

  // Transform database row to PseoPageContent
  const row = data as unknown as PseoPageRow;
  return {
    id: row.id,
    slug: row.slug,
    pageTypeId: row.page_type_id,
    dimensions: row.dimensions,
    seo: row.seo,
    sections: row.sections,
    relatedPages: row.related_pages,
    structuredData: row.structured_data,
    meta: row.generation_meta,
  };
}

/**
 * Hook to fetch all published pSEO page slugs (for sitemap generation).
 */
export function usePseoPageSlugs() {
  return useQuery({
    queryKey: ['pseo-page-slugs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pseo_pages')
        .select('slug, updated_at')
        .eq('is_published', true)
        .order('slug');

      return data ?? [];
    },
    staleTime: 30 * 60 * 1000,
  });
}
