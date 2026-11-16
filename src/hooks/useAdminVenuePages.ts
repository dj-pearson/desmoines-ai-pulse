import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AdminVenuePage, VenuePageRow } from "@/lib/venuePageForm";

const ADMIN_VENUE_PAGES_KEY = ["admin", "venue-pages"] as const;

const ADMIN_VENUE_PAGE_COLUMNS =
  "id, name, slug, description, address, capacity, venue_type, image_url, website, latitude, longitude, updated_at";

/** Every row of public.venues, the table behind /music/venues/:slug. */
export function useAdminVenuePages() {
  return useQuery({
    queryKey: ADMIN_VENUE_PAGES_KEY,
    queryFn: async (): Promise<AdminVenuePage[]> => {
      const { data, error } = await supabase
        .from("venues")
        .select(ADMIN_VENUE_PAGE_COLUMNS)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as AdminVenuePage[];
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Saves a venue. There is no delete: public.venues has no DELETE policy, and a
 * removed row would turn its public page and every inbound link into a 404.
 */
export function useSaveVenuePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, row }: { id?: string; row: VenuePageRow }) => {
      if (id) {
        // The slug is the public URL; an existing venue keeps the one it has.
        const { slug: _slug, ...rest } = row;
        const { data, error } = await supabase
          .from("venues")
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("id");
        if (error) throw error;
        // RLS turns an update it refuses into zero rows, not an error.
        if (!data || data.length === 0) {
          throw new Error("The venue was not saved. Your role may not be allowed to edit venue pages.");
        }
        return;
      }
      const { error } = await supabase.from("venues").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_VENUE_PAGES_KEY });
      // useVenues, useVenueLinks and useVenueMatchRows share the "venues"
      // prefix; useVenue is the single page.
      void queryClient.invalidateQueries({ queryKey: ["venues"] });
      void queryClient.invalidateQueries({ queryKey: ["venue"] });
    },
  });
}
