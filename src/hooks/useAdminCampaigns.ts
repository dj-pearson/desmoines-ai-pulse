import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";
import { Campaign, CampaignCreative } from "./useCampaigns";
import { createLogger } from '@/lib/logger';
import { notifyAdmins, notifyAdvertiser } from "./useCampaignNotifications";

const log = createLogger('useAdminCampaigns');

export interface AdminCampaignFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  searchQuery?: string;
}

export interface CampaignWithUser extends Campaign {
  user_email?: string;
  user_name?: string;
}

export function useAdminCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchCampaigns = async (filters?: AdminCampaignFilters) => {
    try {
      setIsLoading(true);
      setError(null);

      let query = supabase
        .from("campaigns")
        .select(`
          *,
          campaign_placements (*),
          campaign_creatives (*)
        `)
        .order("created_at", { ascending: false });

      // Apply filters
      if (filters?.status && filters.status !== 'all') {
        query = query.eq("status", filters.status);
      }

      if (filters?.dateFrom) {
        query = query.gte("created_at", filters.dateFrom);
      }

      if (filters?.dateTo) {
        query = query.lte("created_at", filters.dateTo);
      }

      if (filters?.searchQuery) {
        query = query.or(
          `name.ilike.%${filters.searchQuery}%,id.ilike.%${filters.searchQuery}%`
        );
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Fetch user emails for each campaign
      const campaignsWithUsers = await Promise.all(
        (data || []).map(async (campaign) => {
          const { data: userData } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("id", campaign.user_id)
            .single();

          return {
            ...campaign,
            user_email: userData?.email,
            user_name: userData?.full_name,
          };
        })
      );

      setCampaigns(campaignsWithUsers);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch campaigns";
      setError(message);
      log.error('fetchCampaigns', 'Error fetching admin campaigns', { error: err });
    } finally {
      setIsLoading(false);
    }
  };

  const getCampaignById = async (campaignId: string): Promise<CampaignWithUser | null> => {
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select(`
          *,
          campaign_placements (*),
          campaign_creatives (*)
        `)
        .eq("id", campaignId)
        .single();

      if (error) throw error;

      // Fetch user info
      const { data: userData } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", data.user_id)
        .single();

      return {
        ...data,
        user_email: userData?.email,
        user_name: userData?.full_name,
      };
    } catch (err) {
      log.error('getCampaignById', 'Error fetching campaign', { error: err });
      return null;
    }
  };

  const approveCreative = async (
    creativeId: string,
    campaignId: string
  ): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("campaign_creatives")
        .update({
          is_approved: true,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq("id", creativeId);

      if (error) throw error;

      // Fetch the campaign to get owner info and dates
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("user_id, name, start_date, status")
        .eq("id", campaignId)
        .single();

      // Notify the advertiser their creative was approved
      if (campaign) {
        notifyAdvertiser(campaignId, campaign.name, campaign.user_id, 'creative_approved');
      }

      // Check if all creatives for this campaign are approved
      const { data: allCreatives } = await supabase
        .from("campaign_creatives")
        .select("is_approved")
        .eq("campaign_id", campaignId);

      const allApproved = allCreatives?.every((c) => c.is_approved);

      // If all creatives are approved, determine the next status
      if (allApproved && campaign) {
        const startDate = campaign.start_date ? new Date(campaign.start_date) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (startDate && startDate <= today) {
          // Start date is today or in the past → activate immediately
          await supabase
            .from("campaigns")
            .update({ status: "active" })
            .eq("id", campaignId)
            .in("status", ["pending_creative", "pending_review"]);

          notifyAdvertiser(campaignId, campaign.name, campaign.user_id, 'campaign_activated');
        } else {
          // Start date is in the future → mark as pending_review (approved, waiting for start date)
          await supabase
            .from("campaigns")
            .update({ status: "pending_review" })
            .eq("id", campaignId)
            .in("status", ["pending_creative", "pending_review"]);
        }
      }

      toast({
        title: "Creative approved",
        description: allApproved
          ? "All creatives approved. Campaign will go live on the scheduled start date."
          : "Creative approved. Remaining creatives still need review.",
      });

      await fetchCampaigns();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to approve creative";
      toast({
        variant: "destructive",
        title: "Approval failed",
        description: message,
      });
      return false;
    }
  };

  const rejectCreative = async (
    creativeId: string,
    reason: string
  ): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Get the creative's campaign info for notification
      const { data: creative } = await supabase
        .from("campaign_creatives")
        .select("campaign_id")
        .eq("id", creativeId)
        .single();

      const { error } = await supabase
        .from("campaign_creatives")
        .update({
          is_approved: false,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq("id", creativeId);

      if (error) throw error;

      // Notify the advertiser about the rejection
      if (creative?.campaign_id) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("user_id, name")
          .eq("id", creative.campaign_id)
          .single();

        if (campaign) {
          notifyAdvertiser(
            creative.campaign_id,
            campaign.name,
            campaign.user_id,
            'creative_rejected',
            { reason }
          );
        }
      }

      toast({
        title: "Creative rejected",
        description: "The advertiser has been notified of the rejection and can resubmit.",
      });

      await fetchCampaigns();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reject creative";
      toast({
        variant: "destructive",
        title: "Rejection failed",
        description: message,
      });
      return false;
    }
  };

  const updateCampaignStatus = async (
    campaignId: string,
    status: string,
    notes?: string
  ): Promise<boolean> => {
    try {
      const updates: Record<string, string> = { status };

      if (notes) {
        updates.approval_notes = notes;
      }

      if (status === "rejected" && notes) {
        updates.rejected_reason = notes;
      }

      const { error } = await supabase
        .from("campaigns")
        .update(updates)
        .eq("id", campaignId);

      if (error) throw error;

      toast({
        title: "Campaign updated",
        description: `Campaign status updated to ${status}.`,
      });

      await fetchCampaigns();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update campaign";
      toast({
        variant: "destructive",
        title: "Update failed",
        description: message,
      });
      return false;
    }
  };

  const createPricingOverride = async (
    campaignId: string,
    overridePrice: number,
    reason: string,
    notes?: string,
    expiresAt?: string
  ): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Get original campaign price
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("total_cost")
        .eq("id", campaignId)
        .single();

      if (!campaign) throw new Error("Campaign not found");

      const { error } = await supabase
        .from("pricing_overrides")
        .insert({
          campaign_id: campaignId,
          admin_user_id: user?.id,
          original_price: campaign.total_cost,
          override_price: overridePrice,
          reason,
          notes,
          expires_at: expiresAt || null,
        });

      if (error) throw error;

      // Update campaign total cost
      await supabase
        .from("campaigns")
        .update({ total_cost: overridePrice })
        .eq("id", campaignId);

      toast({
        title: "Pricing override applied",
        description: `Campaign price updated to $${overridePrice.toFixed(2)}.`,
      });

      await fetchCampaigns();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply pricing override";
      toast({
        variant: "destructive",
        title: "Override failed",
        description: message,
      });
      return false;
    }
  };

  const processRefund = async (
    campaignId: string,
    amount: number,
    reason: string,
    policyViolation?: string
  ): Promise<boolean> => {
    try {
      // Call the process-stripe-refund edge function which handles
      // Stripe refund creation, DB record, and campaign status update
      const { data, error: refundError } = await supabase.functions.invoke(
        "process-stripe-refund",
        {
          body: {
            campaignId,
            amount,
            reason,
            policyViolation: policyViolation || null,
          },
        }
      );

      if (refundError) throw refundError;

      if (!data?.success) {
        throw new Error(data?.error || "Refund processing failed");
      }

      // Notify the advertiser about the refund
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("user_id, name")
        .eq("id", campaignId)
        .single();

      if (campaign) {
        notifyAdvertiser(
          campaignId,
          campaign.name,
          campaign.user_id,
          'campaign_refunded',
          { amount, reason }
        );
      }

      toast({
        title: "Refund processed",
        description: `Refund of $${amount.toFixed(2)} has been processed through Stripe. ID: ${data.refundId}`,
      });

      await fetchCampaigns();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to process refund";
      toast({
        variant: "destructive",
        title: "Refund failed",
        description: message,
      });
      return false;
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  return {
    campaigns,
    isLoading,
    error,
    fetchCampaigns,
    getCampaignById,
    approveCreative,
    rejectCreative,
    updateCampaignStatus,
    createPricingOverride,
    processRefund,
  };
}
