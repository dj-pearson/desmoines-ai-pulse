import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AdminTrail, TrailRow } from "@/lib/trailForm";

const ADMIN_TRAILS_KEY = ["admin", "trails"] as const;

const ADMIN_TRAIL_COLUMNS =
  "id, name, slug, description, length_miles, difficulty, surface_type, activities, highlights, trailhead_address, latitude, longitude, image_url, website, is_featured";

/** Every row of public.trails, the table behind /outdoors. */
export function useAdminTrails() {
  return useQuery({
    queryKey: ADMIN_TRAILS_KEY,
    queryFn: async (): Promise<AdminTrail[]> => {
      const { data, error } = await supabase.from("trails").select(ADMIN_TRAIL_COLUMNS).order("name");
      if (error) throw error;
      return (data ?? []) as unknown as AdminTrail[];
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Saves a trail. There is no delete: public.trails has no DELETE policy, and a
 * removed row would turn its page and every inbound link into a 404.
 */
export function useSaveTrail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, row }: { id?: string; row: TrailRow }) => {
      if (id) {
        // The slug is the public URL; an existing trail keeps the one it has.
        const { slug: _slug, ...rest } = row;
        const { data, error } = await supabase.from("trails").update(rest).eq("id", id).select("id");
        if (error) throw error;
        // RLS turns an update it refuses into zero rows, not an error.
        if (!data || data.length === 0) {
          throw new Error("The trail was not saved. Your role may not be allowed to edit trails.");
        }
        return;
      }
      const { error } = await supabase.from("trails").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_TRAILS_KEY });
      // useTrails is the /outdoors list, useTrail the single page.
      void queryClient.invalidateQueries({ queryKey: ["trails"] });
      void queryClient.invalidateQueries({ queryKey: ["trail"] });
    },
  });
}
