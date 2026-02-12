import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";
import { Campaign, CampaignCreative } from "./useCampaigns";
import { createLogger } from '@/lib/logger';

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
      log.error('Error fetching admin campaigns', { action: 'fetchCampaigns', metadata: { error: err } });
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
      log.error('Error fetching campaign', { action: 'getCampaignById', metadata: { error: err } });
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

      // Check if all creatives for this campaign are approved
      const { data: allCreatives } = await supabase
        .from("campaign_creatives")
        .select("is_approved")
        .eq("campaign_id", campaignId);

      const allApproved = allCreatives?.every((c) => c.is_approved);

      // If all creatives are approved, update campaign status to active
      if (allApproved) {
        await supabase
          .from("campaigns")
          .update({ status: "active" })
          .eq("id", campaignId)
          .eq("status", "pending_creative");
      }

      toast({
        title: "Creative approved",
        description: "The creative has been approved and will go live on the scheduled date.",
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

      toast({
        title: "Creative rejected",
        description: "The advertiser will be notified of the rejection and can resubmit.",
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
      const updates: any = { status };

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
      const { data: { user } } = await supabase.auth.getUser();

      // Get campaign payment info
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("stripe_payment_intent_id, total_cost")
        .eq("id", campaignId)
        .single();

      if (!campaign) throw new Error("Campaign not found");
      if (!campaign.stripe_payment_intent_id) {
        throw new Error("No payment found for this campaign");
      }

      // Create refund record
      const { error } = await supabase
        .from("refunds")
        .insert({
          campaign_id: campaignId,
          admin_user_id: user?.id,
          amount,
          reason,
          policy_violation: policyViolation || null,
          status: "pending",
        });

      if (error) throw error;

      // Update campaign status
      await supabase
        .from("campaigns")
        .update({ status: "refunded" })
        .eq("id", campaignId);

      toast({
        title: "Refund initiated",
        description: "The refund has been initiated and will be processed through Stripe.",
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
