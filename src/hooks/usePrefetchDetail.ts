import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
          queryKey: ['restaurant', slugOrId],
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
          staleTime: 2 * 60 * 1000,
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
          queryKey: ['attraction', slug],
          queryFn: async () => {
            const { data: attractions } = await supabase
              .from('attractions')
              .select('*');
            const createSlug = (name: string) =>
              name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            return attractions?.find((a) => createSlug(a.name) === slug) || null;
          },
          staleTime: 2 * 60 * 1000,
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
