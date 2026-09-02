import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";
import { Campaign, CampaignCreative } from "./useCampaigns";
import { createLogger } from '@/lib/logger';
import { notifyAdvertiser } from "./useCampaignNotifications";
import { publishCreative, discardReviewCopy } from "@/lib/adCreativeStorage";

/** Shape returned by the approve_campaign_creative RPC (WEB-ADS-004). */
interface ApproveCreativeResult {
  creative_id?: string;
  campaign_id?: string;
  user_id?: string;
  name?: string;
  all_approved?: boolean;
  activated?: boolean;
  status?: string;
}


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

/**
 * Compose a display name from the profile's separate name columns.
 * Returns undefined rather than an empty string when neither is set, so
 * callers can fall back to the email instead of rendering a blank owner.
 */
function formatProfileName(
  profile: { first_name?: string | null; last_name?: string | null } | null | undefined
): string | undefined {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return name || undefined;
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
          // `profiles` has no `full_name`; it stores first_name/last_name.
          // Selecting it failed with 42703, so no campaign ever resolved an
          // owner email or name in the admin list.
          //
          // WEB-SEC-023: and the key was wrong too. profiles.user_id is the
          // auth user id — validate_profile_user_id() in migration
          // 20250905021821 compares NEW.user_id != auth.uid() — while
          // profiles.id is the table's own PK. Matching a user_id value against
          // id finds nothing, and .single() swallows that as undefined, so the
          // admin list rendered blank owner details either way.
          // Tolerant on purpose: one unreadable profile must not empty the
          // whole admin campaign list. But the failure is recorded rather than
          // rendered as "this advertiser has no email" - which is how the two
          // schema bugs described above survived for as long as they did.
          const { data: userData, error: profileError } = await supabase
            .from("profiles")
            .select("email, first_name, last_name")
            .eq("user_id", campaign.user_id)
            .single();

          if (profileError && profileError.code !== 'PGRST116') {
            log.error('fetchCampaigns', 'Could not resolve campaign owner', {
              campaignId: campaign.id,
              error: profileError,
            });
          }

          return {
            ...campaign,
            user_email: userData?.email,
            user_name: formatProfileName(userData),
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

      // Fetch user info. Keyed on user_id, not id — see the note above.
      const { data: userData, error: profileError } = await supabase
        .from("profiles")
        .select("email, first_name, last_name")
        .eq("user_id", data.user_id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        log.error('getCampaignById', 'Could not resolve campaign owner', {
          campaignId,
          error: profileError,
        });
      }

      return {
        ...data,
        user_email: userData?.email,
        user_name: formatProfileName(userData),
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
      // reviewed_by below is the audit trail for an admin action on someone's
      // paid campaign. The RPC refuses a caller who is not a signed-in admin,
      // so the record can never say an approval happened without saying who
      // made it.
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Not signed in - an admin action must be attributable");

      // WEB-LEGAL-011: the creative sits in the PRIVATE ad-creatives-review
      // bucket until this moment, with image_url null. Approving it publishes
      // the object into the public bucket and sets image_url.
      //
      // Publish BEFORE the approval, and let a failure abort the whole thing.
      // An approved row with a null image_url renders as a blank ad slot for
      // the entire campaign, and get_active_ads would happily serve it --
      // strictly worse than a failed approval the admin can retry.
      const { data: creative, error: readError } = await supabase
        .from("campaign_creatives")
        .select("review_path, image_url")
        .eq("id", creativeId)
        .single();

      if (readError) throw readError;

      let publishedUrl = creative?.image_url ?? null;
      if (creative?.review_path) {
        publishedUrl = await publishCreative(creative.review_path);
      }

      // WEB-ADS-004: approving the creative and moving the campaign are ONE
      // server transaction (approve_campaign_creative). This used to be three
      // client writes: is_approved = true, then read the campaign, then write
      // its status. The status write threw 22P02 (pending_review was not an
      // enum label) after the first write had committed, so the campaign sat
      // with every creative approved and a stale status. Now either all of it
      // lands or none of it does.
      //
      // When the start date has been reached the RPC activates through
      // activate_campaign (WEB-ADS-001), which also flags sponsored listings;
      // when it is ahead, the campaign parks in pending_review and the daily
      // lifecycle job activates it on the day.
      const { data: rpcResult, error: approveError } = await supabase.rpc(
        "approve_campaign_creative",
        { p_creative_id: creativeId, p_image_url: publishedUrl ?? undefined }
      );

      if (approveError) throw approveError;

      const outcome = (rpcResult ?? {}) as unknown as ApproveCreativeResult;

      // Only now that the row points at the public copy. Best effort: a leftover
      // private duplicate is untidy, not a leak, and must not fail an approval
      // that has already succeeded.
      if (creative?.review_path) {
        await discardReviewCopy(creative.review_path);
      }

      if (outcome.user_id && outcome.name) {
        notifyAdvertiser(campaignId, outcome.name, outcome.user_id, 'creative_approved');
        if (outcome.activated) {
          notifyAdvertiser(campaignId, outcome.name, outcome.user_id, 'campaign_activated');
        }
      }

      toast({
        title: "Creative approved",
        description: !outcome.all_approved
          ? "Creative approved. Remaining creatives still need review."
          : outcome.activated
            ? "All creatives approved. Campaign is live."
            : "All creatives approved. Campaign will go live on the scheduled start date.",
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
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Not signed in - an admin action must be attributable");

      // Notification lookup only - logged, not thrown. The rejection itself
      // is the next statement and is what the toast reports; failing the whole
      // action because the advertiser could not be looked up would leave the
      // creative un-rejected, which is worse than an un-notified rejection.
      const { data: creative, error: creativeError } = await supabase
        .from("campaign_creatives")
        .select("campaign_id")
        .eq("id", creativeId)
        .single();

      if (creativeError) {
        log.error('rejectCreative', 'Could not read creative for notification', {
          creativeId,
          error: creativeError,
        });
      }

      const { error } = await supabase
        .from("campaign_creatives")
        .update({
          is_approved: false,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq("id", creativeId);

      if (error) throw error;

      // Notify the advertiser about the rejection
      if (creative?.campaign_id) {
        const { data: campaign, error: campaignError } = await supabase
          .from("campaigns")
          .select("user_id, name")
          .eq("id", creative.campaign_id)
          .single();

        if (campaignError) {
          log.error('rejectCreative', 'Could not read campaign for notification', {
            campaignId: creative.campaign_id,
            error: campaignError,
          });
        }

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
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Not signed in - an admin action must be attributable");

      // Get original campaign price. The error is surfaced rather than
      // collapsed into "Campaign not found" - a permissions failure and a
      // missing row need different responses from the admin reading the toast.
      const { data: campaign, error: campaignError } = await supabase
        .from("campaigns")
        .select("total_cost")
        .eq("id", campaignId)
        .single();

      if (campaignError && campaignError.code !== 'PGRST116') throw campaignError;
      if (!campaign) throw new Error("Campaign not found");

      const { error } = await supabase
        .from("pricing_overrides")
        .insert({
          campaign_id: campaignId,
          admin_user_id: user.id,
          original_price: campaign.total_cost,
          override_price: overridePrice,
          reason,
          notes,
          expires_at: expiresAt || null,
        });

      if (error) throw error;

      // Update campaign total cost. THROWS: the pricing_overrides row is
      // already written, so discarding a failure here left the override
      // recorded and the campaign still billing at the old price, under a toast
      // reading "Campaign price updated to $X".
      const { error: costError } = await supabase
        .from("campaigns")
        .update({ total_cost: overridePrice })
        .eq("id", campaignId);

      if (costError) throw costError;

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

      // Notification lookup only, and deliberately NOT thrown: Stripe has
      // already refunded by this point. Turning a lookup failure into "Refund
      // failed" would tell an admin to retry a refund that succeeded.
      const { data: campaign, error: campaignError } = await supabase
        .from("campaigns")
        .select("user_id, name")
        .eq("id", campaignId)
        .single();

      if (campaignError) {
        log.error('processRefund', 'Refund succeeded but the advertiser could not be notified', {
          campaignId,
          error: campaignError,
        });
      }

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
