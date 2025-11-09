// @ts-nocheck - Temporarily disabled pending database migrations
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ActiveAd {
  campaign_id: string;
  creative_id: string;
  title?: string;
  description?: string;
  image_url?: string;
  link_url?: string;
  cta_text?: string;
}

export function useActiveAds(placementType: 'top_banner' | 'featured_spot' | 'below_fold') {
  const [ad, setAd] = useState<ActiveAd | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchActiveAd();
  }, [placementType]);

  const fetchActiveAd = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_active_ads', {
        p_placement_type: placementType
      });

      if (error) throw error;
      setAd(data?.[0] || null);
    } catch (error) {
      console.error('Error fetching active ad:', error);
      setAd(null);
    } finally {
      setIsLoading(false);
    }
  };

  return { ad, isLoading, refetch: fetchActiveAd };
}