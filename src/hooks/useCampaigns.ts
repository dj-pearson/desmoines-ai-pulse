import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Campaign {
  id: string;
  name: string;
  status: string;
  start_date?: string;
  end_date?: string;
  total_cost?: number;
  stripe_session_id?: string;
  stripe_payment_intent_id?: string;
  renewal_eligible?: boolean;
  auto_renew?: boolean;
  original_campaign_id?: string;
  traffic_tier?: 'low' | 'medium' | 'high' | 'peak';
  approval_notes?: string;
  rejected_reason?: string;
  created_at: string;
  updated_at: string;
  campaign_placements?: CampaignPlacement[];
  campaign_creatives?: CampaignCreative[];
}

export interface CampaignPlacement {
  id: string;
  campaign_id: string;
  placement_type: 'top_banner' | 'featured_spot' | 'below_fold';
  daily_cost: number;
  days_count: number;
  total_cost: number;
  created_at: string;
}

export interface CampaignCreative {
  id: string;
  campaign_id: string;
  placement_type: 'top_banner' | 'featured_spot' | 'below_fold';
  title?: string;
  description?: string;
  image_url?: string;
  link_url?: string;
  cta_text?: string;
  is_approved: boolean;
  file_size?: number;
  file_type?: string;
  dimensions_width?: number;
  dimensions_height?: number;
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface PricingInfo {
  daily_price: number;
  total_price: number;
  base_price: number;
  traffic_multiplier: number;
  demand_multiplier: number;
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchCampaigns();
    }
  }, [user]);

  const fetchCampaigns = async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("campaigns")
        .select(`
          *,
          campaign_placements (*),
          campaign_creatives (*)
        `)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setCampaigns(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch campaigns");
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentPricing = async (
    placementType: 'top_banner' | 'featured_spot' | 'below_fold',
    daysCount: number
  ): Promise<PricingInfo> => {
    try {
      const { data, error } = await supabase.rpc("calculate_campaign_pricing", {
        p_placement_type: placementType,
        p_days_count: daysCount,
      });

      if (error) throw error;
      if (!data || data.length === 0) {
        // Fallback to default pricing if function fails
        const defaultPrices = {
          top_banner: 10,
          featured_spot: 5,
          below_fold: 5,
        };
        const dailyPrice = defaultPrices[placementType];
        return {
          daily_price: dailyPrice,
          total_price: dailyPrice * daysCount,
          base_price: dailyPrice,
          traffic_multiplier: 1.0,
          demand_multiplier: 1.0,
        };
      }

      return data[0];
    } catch (err) {
      // Fallback pricing on error
      const defaultPrices = {
        top_banner: 10,
        featured_spot: 5,
        below_fold: 5,
      };
      const dailyPrice = defaultPrices[placementType];
      return {
        daily_price: dailyPrice,
        total_price: dailyPrice * daysCount,
        base_price: dailyPrice,
        traffic_multiplier: 1.0,
        demand_multiplier: 1.0,
      };
    }
  };

  const createCampaign = async (campaignData: {
    name: string;
    placements: Array<{
      placement_type: 'top_banner' | 'featured_spot' | 'below_fold';
      days_count: number;
    }>;
    start_date: string;
    end_date: string;
  }) => {
    try {
      if (!user) throw new Error("User not authenticated");

      // Get dynamic pricing for each placement
      const placementPricing = await Promise.all(
        campaignData.placements.map(async (placement) => {
          const pricing = await getCurrentPricing(placement.placement_type, placement.days_count);
          return {
            placement,
            pricing,
          };
        })
      );

      const totalCost = placementPricing.reduce(
        (sum, { pricing }) => sum + pricing.total_price,
        0
      );

      const { data: campaign, error: campaignError } = await supabase
        .from("campaigns")
        .insert({
          name: campaignData.name,
          start_date: campaignData.start_date,
          end_date: campaignData.end_date,
          total_cost: totalCost,
          status: "draft",
          user_id: user.id,
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      const placementInserts = placementPricing.map(({ placement, pricing }) => ({
        campaign_id: campaign.id,
        placement_type: placement.placement_type,
        daily_cost: pricing.daily_price,
        days_count: placement.days_count,
        total_cost: pricing.total_price,
      }));

      const { error: placementError } = await supabase
        .from("campaign_placements")
        .insert(placementInserts);

      if (placementError) throw placementError;

      await fetchCampaigns();
      return campaign;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
      throw err;
    }
  };

  const createCheckoutSession = async (campaignId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("create-campaign-checkout", {
        body: { campaignId },
      });

      if (error) throw error;
      return data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create checkout session");
      throw err;
    }
  };

  const verifyPayment = async (campaignId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("verify-campaign-payment", {
        body: { campaignId },
      });

      if (error) throw error;
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify payment");
      throw err;
    }
  };

  const updateCreative = async (creativeData: Partial<CampaignCreative> & { id: string }) => {
    try {
      const { error } = await supabase
        .from("campaign_creatives")
        .update(creativeData)
        .eq("id", creativeData.id);

      if (error) throw error;
      await fetchCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update creative");
      throw err;
    }
  };

  const createCreative = async (creativeData: Omit<CampaignCreative, "id" | "created_at" | "updated_at" | "is_approved">) => {
    try {
      const { error } = await supabase
        .from("campaign_creatives")
        .insert({ ...creativeData, is_approved: false });

      if (error) throw error;
      await fetchCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create creative");
      throw err;
    }
  };

  return {
    campaigns,
    isLoading,
    error,
    createCampaign,
    createCheckoutSession,
    verifyPayment,
    updateCreative,
    createCreative,
    getCurrentPricing,
    refetch: fetchCampaigns,
  };
}