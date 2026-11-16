import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AdminSeasonalGuide, GuideRow } from "@/lib/seasonalGuideForm";

const ADMIN_GUIDES_KEY = ["admin", "seasonal-guides"] as const;

const ADMIN_GUIDE_COLUMNS =
  "id, title, slug, season, description, cover_image, content, is_published, publish_date, seo_title, seo_description, updated_at";

/** Postgres unique_violation: seasonal_guides.slug is UNIQUE. */
export function isDuplicateSlugError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * Every guide, drafts included. The "Admin full access" policy on
 * seasonal_guides is what lets an admin read unpublished rows; anyone else
 * gets the published ones only.
 */
export function useAdminSeasonalGuides() {
  return useQuery({
    queryKey: ADMIN_GUIDES_KEY,
    queryFn: async (): Promise<AdminSeasonalGuide[]> => {
      const { data, error } = await supabase
        .from("seasonal_guides")
        .select(ADMIN_GUIDE_COLUMNS)
        .order("publish_date", { ascending: false, nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as unknown as AdminSeasonalGuide[];
    },
    staleTime: 30 * 1000,
  });
}

function useInvalidateGuides() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_GUIDES_KEY });
    // The public /guides list, the hub's season links and each guide page.
    void queryClient.invalidateQueries({ queryKey: ["seasonal-guides"] });
    void queryClient.invalidateQueries({ queryKey: ["seasonal-guide"] });
  };
}

export function useSaveSeasonalGuide() {
  const invalidate = useInvalidateGuides();
  return useMutation({
    mutationFn: async ({ id, row }: { id?: string; row: GuideRow }) => {
      if (id) {
        const { data, error } = await supabase
          .from("seasonal_guides")
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("id");
        if (error) throw error;
        // RLS turns a write it refuses into zero rows, not an error.
        if (!data || data.length === 0) {
          throw new Error("The guide was not saved. It may have been deleted, or your role cannot edit guides.");
        }
        return;
      }
      const { error } = await supabase.from("seasonal_guides").insert(row);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSeasonalGuide() {
  const invalidate = useInvalidateGuides();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("seasonal_guides")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("The guide was not deleted. Your role may not be allowed to delete guides.");
      }
    },
    onSuccess: invalidate,
  });
}
