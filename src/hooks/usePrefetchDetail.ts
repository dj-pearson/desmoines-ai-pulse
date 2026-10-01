import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchBySlug } from '@/lib/resolveBySlug';
import { DETAIL_STALE_TIME, detailQueryKey } from '@/lib/detailQueryKeys';

/**
 * Hook to prefetch detail page data on card hover.
 * Uses requestIdleCallback to avoid blocking main thread,
 * and guards against repeated prefetches for the same item.
 */
export function usePrefetchRestaurant() {
  const queryClient = useQueryClient();
  const prefetchedRef = useRef<Set<string>>(new Set());

  return useCallback(
    (slugOrId: string) => {
      if (prefetchedRef.current.has(slugOrId)) return;
      prefetchedRef.current.add(slugOrId);

      const doFetch = () => {
        queryClient.prefetchQuery({
          queryKey: detailQueryKey('restaurant', slugOrId),
          queryFn: async () => {
            let { data } = await supabase
              .from('restaurants')
              .select('*')
              .eq('slug', slugOrId)
              .maybeSingle();
            if (!data) {
              const result = await supabase
                .from('restaurants')
                .select('*')
                .eq('id', slugOrId)
                .maybeSingle();
              data = result.data;
            }
            return data;
          },
          staleTime: DETAIL_STALE_TIME,
        });
      };

      if ('requestIdleCallback' in window) {
        (window as Window).requestIdleCallback(doFetch);
      } else {
        setTimeout(doFetch, 100);
      }
    },
    [queryClient]
  );
}

export function usePrefetchAttraction() {
  const queryClient = useQueryClient();
  const prefetchedRef = useRef<Set<string>>(new Set());

  return useCallback(
    (slug: string) => {
      if (prefetchedRef.current.has(slug)) return;
      prefetchedRef.current.add(slug);

      const doFetch = () => {
        queryClient.prefetchQuery({
          queryKey: detailQueryKey('attraction', slug),
          // THIS RAN ON HOVER AND DOWNLOADED THE WHOLE TABLE (WEB-PERF-031).
          // select('*') on attractions with no filter, once per card the
          // pointer crossed until prefetchedRef caught up - so the thing meant
          // to make the detail page feel instant was the most expensive request
          // on the listing page. It is now one row by slug, sharing
          // AttractionDetails' resolver so the prefetched entry is the one the
          // page reads rather than a differently-shaped near-miss.
          queryFn: () => fetchBySlug('attractions', slug),
          staleTime: DETAIL_STALE_TIME,
        });
      };

      if ('requestIdleCallback' in window) {
        (window as Window).requestIdleCallback(doFetch);
      } else {
        setTimeout(doFetch, 100);
      }
    },
    [queryClient]
  );
}
