import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('useSceneUpdates');

export interface SceneUpdate {
  id: string;
  title: string;
  body: string;
  update_type: 'new_opening' | 'closing' | 'renovation' | 'expansion' | 'news';
  entity_type: string | null;
  entity_id: string | null;
  image_url: string | null;
  source_url: string | null;
  neighborhood: string | null;
  is_published: boolean;
  publish_date: string;
  author: string;
  created_at: string;
}

interface SceneUpdateFilters {
  type?: string;
  neighborhood?: string;
  limit?: number;
}

/**
 * Fetch scene updates (What's New feed).
 */
export function useSceneUpdates(filters?: SceneUpdateFilters) {
  return useQuery({
    queryKey: ['scene-updates', filters],
    queryFn: async (): Promise<SceneUpdate[]> => {
      let query = supabase
        .from('scene_updates')
        .select('*')
        .eq('is_published', true)
        .order('publish_date', { ascending: false });

      if (filters?.type) {
        query = query.eq('update_type', filters.type);
      }
      if (filters?.neighborhood) {
        query = query.eq('neighborhood', filters.neighborhood);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      } else {
        query = query.limit(50);
      }

      const { data, error } = await query;

      if (error) {
        log.warn('useSceneUpdates', 'Failed to fetch scene updates', { error: error.message });
        return [];
      }

      return (data || []) as unknown as SceneUpdate[];
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch recent scene updates for homepage widget (limit 4).
 */
export function useRecentSceneUpdates() {
  return useSceneUpdates({ limit: 4 });
}
