import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import type { Database } from "@/integrations/supabase/types";

type Program = Database["public"]["Tables"]["hotel_affiliate_programs"]["Row"];
type ProgramUpdate =
  Database["public"]["Tables"]["hotel_affiliate_programs"]["Update"];

export interface BrandCoverage {
  /** brand_parent value as stored on hotels */
  brand: string;
  /** How many active hotels carry this brand */
  hotelCount: number;
  /** How many of those currently have an affiliate_url */
  withAffiliateUrl: number;
}

interface State {
  programs: Program[];
  coverage: BrandCoverage[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Loads the per-brand affiliate program config alongside how many hotels each
 * brand actually covers, so the admin screen can show the payoff of filling in
 * a given brand's credentials.
 */
export function useHotelAffiliatePrograms() {
  const [state, setState] = useState<State>({
    programs: [],
    coverage: [],
    isLoading: true,
    error: null,
  });

  const fetch = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const [programsRes, hotelsRes] = await Promise.all([
        supabase
          .from("hotel_affiliate_programs")
          .select("*")
          .order("brand_parent"),
        supabase
          .from("hotels")
          .select("brand_parent, affiliate_url")
          .eq("is_active", true),
      ]);

      if (programsRes.error) throw programsRes.error;
      if (hotelsRes.error) throw hotelsRes.error;

      const counts = new Map<string, BrandCoverage>();
      for (const hotel of hotelsRes.data ?? []) {
        const brand = hotel.brand_parent ?? "Unassigned";
        const entry = counts.get(brand) ?? {
          brand,
          hotelCount: 0,
          withAffiliateUrl: 0,
        };
        entry.hotelCount += 1;
        if (hotel.affiliate_url) entry.withAffiliateUrl += 1;
        counts.set(brand, entry);
      }

      setState({
        programs: programsRes.data ?? [],
        coverage: Array.from(counts.values()).sort(
          (a, b) => b.hotelCount - a.hotelCount,
        ),
        isLoading: false,
        error: null,
      });
    } catch (error) {
      handleError(error, {
        component: "useHotelAffiliatePrograms",
        action: "fetch",
      });
      setState((s) => ({
        ...s,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load",
      }));
    }
  }, []);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  /**
   * Saves a program row. The database trigger re-applies the link to every
   * hotel of that brand, so no separate regen call is needed.
   */
  const saveProgram = useCallback(
    async (id: string, patch: ProgramUpdate) => {
      const { error } = await supabase
        .from("hotel_affiliate_programs")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
      await fetch();
    },
    [fetch],
  );

  return { ...state, refetch: fetch, saveProgram };
}
