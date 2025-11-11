import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";
import { Campaign } from "./useCampaigns";

export function useCampaignRenewal() {
  const [isRenewing, setIsRenewing] = useState(false);
  const { toast } = useToast();

  const renewCampaign = async (
    originalCampaign: Campaign,
    options: {
      startDate: string;
      endDate: string;
      copyCreatives?: boolean;
    }
  ): Promise<{ success: boolean; campaignId?: string }> => {
    try {
      setIsRenewing(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Calculate days count
      const start = new Date(options.startDate);
      const end = new Date(options.endDate);
      const daysCount = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // Get current pricing for placements
      const placements = originalCampaign.campaign_placements || [];
      const placementPricing = await Promise.all(
        placements.map(async (placement) => {
          const { data, error } = await supabase.rpc("calculate_campaign_pricing", {
            p_placement_type: placement.placement_type,
            p_days_count: daysCount,
          });

          if (error) throw error;

          return {
            placement_type: placement.placement_type,
            daily_cost: data[0]?.daily_price || placement.daily_cost,
            days_count: daysCount,
            total_cost: data[0]?.total_price || placement.total_cost,
          };
        })
      );

      const totalCost = placementPricing.reduce((sum, p) => sum + p.total_cost, 0);

      // Create new campaign
      const { data: newCampaign, error: campaignError } = await supabase
        .from("campaigns")
        .insert({
          user_id: user.id,
          name: `${originalCampaign.name} (Renewal)`,
          status: "draft",
          start_date: options.startDate,
          end_date: options.endDate,
          total_cost: totalCost,
          original_campaign_id: originalCampaign.id,
          renewal_eligible: true,
          auto_renew: false,
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Create placements
      const { error: placementsError } = await supabase
        .from("campaign_placements")
        .insert(
          placementPricing.map((p) => ({
            campaign_id: newCampaign.id,
            ...p,
          }))
        );

      if (placementsError) throw placementsError;

      // Copy creatives if requested
      if (options.copyCreatives) {
        const creatives = originalCampaign.campaign_creatives || [];
        const approvedCreatives = creatives.filter((c) => c.is_approved);

        if (approvedCreatives.length > 0) {
          const { error: creativesError } = await supabase
            .from("campaign_creatives")
            .insert(
              approvedCreatives.map((c) => ({
                campaign_id: newCampaign.id,
                placement_type: c.placement_type,
                title: c.title,
                description: c.description,
                image_url: c.image_url,
                link_url: c.link_url,
                cta_text: c.cta_text,
                file_size: c.file_size,
                file_type: c.file_type,
                dimensions_width: c.dimensions_width,
                dimensions_height: c.dimensions_height,
                is_approved: false, // Requires re-approval
              }))
            );

          if (creativesError) throw creativesError;
        }
      }

      toast({
        title: "Campaign renewed",
        description: "Your campaign has been renewed. Complete payment to activate.",
      });

      return { success: true, campaignId: newCampaign.id };
    } catch (err) {
      console.error("Error renewing campaign:", err);
      toast({
        variant: "destructive",
        title: "Renewal failed",
        description: err instanceof Error ? err.message : "Failed to renew campaign",
      });
      return { success: false };
    } finally {
      setIsRenewing(false);
    }
  };

  const enableAutoRenew = async (campaignId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("campaigns")
        .update({ auto_renew: true })
        .eq("id", campaignId);

      if (error) throw error;

      toast({
        title: "Auto-renewal enabled",
        description: "This campaign will automatically renew when it ends.",
      });

      return true;
    } catch (err) {
      console.error("Error enabling auto-renew:", err);
      toast({
        variant: "destructive",
        title: "Failed to enable auto-renewal",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      return false;
    }
  };

  const disableAutoRenew = async (campaignId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("campaigns")
        .update({ auto_renew: false })
        .eq("id", campaignId);

      if (error) throw error;

      toast({
        title: "Auto-renewal disabled",
        description: "This campaign will not automatically renew.",
      });

      return true;
    } catch (err) {
      console.error("Error disabling auto-renew:", err);
      toast({
        variant: "destructive",
        title: "Failed to disable auto-renewal",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      return false;
    }
  };

  return {
    renewCampaign,
    enableAutoRenew,
    disableAutoRenew,
    isRenewing,
  };
}
