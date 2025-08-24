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
  created_at: string;
  updated_at: string;
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
      const placementCosts = {
        top_banner: 10,
        featured_spot: 5,
        below_fold: 5,
      };

      const totalCost = campaignData.placements.reduce(
        (sum, placement) => sum + (placementCosts[placement.placement_type] * placement.days_count),
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

      const placementInserts = campaignData.placements.map(placement => ({
        campaign_id: campaign.id,
        placement_type: placement.placement_type,
        daily_cost: placementCosts[placement.placement_type],
        days_count: placement.days_count,
        total_cost: placementCosts[placement.placement_type] * placement.days_count,
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
    refetch: fetchCampaigns,
  };
}