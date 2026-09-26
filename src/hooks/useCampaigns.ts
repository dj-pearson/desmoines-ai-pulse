import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { createLogger } from "@/lib/logger";

const logger = createLogger("useCampaigns");

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
  placement_type: 'top_banner' | 'featured_spot' | 'below_fold' | 'sponsored_listing';
  daily_cost: number;
  days_count: number;
  total_cost: number;
  created_at: string;
}

export interface CampaignCreative {
  id: string;
  campaign_id: string;
  placement_type: 'top_banner' | 'featured_spot' | 'below_fold' | 'sponsored_listing';
  title?: string;
  description?: string;
  image_url?: string;
  link_url?: string;
  cta_text?: string;
  is_approved: boolean;
  /** Object path in the private ad-creatives-review bucket while unapproved.
   *  image_url stays null until approval publishes the file (WEB-LEGAL-011). */
  review_path?: string | null;
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

export interface RateCardEntry {
  placement_type: string;
  base_daily_rate: number;
  cpm_rate: number;
  discount_7_day: number;
  discount_14_day: number;
  discount_30_day: number;
}

/**
 * Link the listing a sponsored_listing placement pays for (NON_CORE_REVIEW WP3).
 *
 * Goes through link_sponsored_listing (20261003000006), which refuses a
 * campaign that is not a draft, has no sponsored_listing placement or already
 * has its listing, and a listing that does not exist. The direct INSERT it
 * replaces checked only that the caller owned the campaign.
 *
 * PGRST202 means the RPC is not deployed yet. Only then does this fall back to
 * the old INSERT, so sponsored purchases keep working in the window between
 * this web release and the migration. Any other error is the RPC refusing,
 * and is returned as is.
 */
export async function linkSponsoredListing(
  campaignId: string,
  listingType: string,
  listingId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("link_sponsored_listing" as never, {
    p_campaign_id: campaignId,
    p_listing_type: listingType,
    p_listing_id: listingId,
  } as never);
  if (!error) return { error: null };
  if (error.code !== "PGRST202") return { error: new Error(error.message) };

  const { error: insertError } = await supabase.from("sponsored_listing_links").insert({
    campaign_id: campaignId,
    listing_type: listingType,
    listing_id: listingId,
  });
  return { error: insertError ? new Error(insertError.message) : null };
}

/** Fetch the ad rate card (including CPM rates) — callable without authentication. */
export async function fetchRateCard(): Promise<RateCardEntry[]> {
  const { data, error } = await supabase
    .from("ad_rate_card")
    .select("placement_type, base_daily_rate, cpm_rate, discount_7_day, discount_14_day, discount_30_day")
    .eq("is_active", true);

  if (error) return [];
  return (data || []) as RateCardEntry[];
}

/**
 * The lowest active daily rate on the rate card, or null when the card is
 * empty or could not be read. For "From $X/day" copy only: what anyone is
 * charged is decided by calculate_campaign_pricing() and
 * create-campaign-checkout on the server.
 */
export function lowestDailyRate(rates: RateCardEntry[]): number | null {
  const values = rates
    .map((rate) => Number(rate.base_daily_rate))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length > 0 ? Math.min(...values) : null;
}

/** The rate card, cached. An unreadable card is an empty one (fetchRateCard). */
export function useRateCard() {
  return useQuery({
    queryKey: ["ad-rate-card"],
    queryFn: fetchRateCard,
    staleTime: 60 * 60 * 1000,
  });
}

/** The campaign statuses that wait on the advertiser, not on us. */
export const CAMPAIGN_ACTION_STATUSES = ["pending_creative", "pending_payment"] as const;

/**
 * How many of the signed-in user's campaigns are waiting on them: creative to
 * upload or payment to finish. A HEAD count, so no rows cross the wire.
 */
export function useCampaignActionCount(): { count: number; isError: boolean } {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["campaigns", user?.id, "action-count"],
    queryFn: async (): Promise<number> => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", [...CAMPAIGN_ACTION_STATUSES]);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });
  return { count: query.data ?? 0, isError: query.isError };
}

export interface UseCampaignsOptions {
  /** False to hold the list read, e.g. until the Advertise tab is opened. */
  enabled?: boolean;
}

export function useCampaigns(options: UseCampaignsOptions = {}) {
  const { enabled = true } = options;
  const [mutationError, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const campaignsQuery = useQuery({
    queryKey: ["campaigns", user?.id],
    queryFn: async (): Promise<Campaign[]> => {
      if (!user) return [];
      // OWN CAMPAIGNS ONLY. RLS lets an admin read every campaign
      // (useAdminCampaigns relies on it), so without this filter an admin's
      // own Advertise tab listed every advertiser's spend as theirs.
      const { data, error: fetchError } = await supabase
        .from("campaigns")
        .select(`
          *,
          campaign_placements (*),
          campaign_creatives (*)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      return (data || []) as Campaign[];
    },
    enabled: enabled && !!user,
  });

  const campaigns = campaignsQuery.data ?? [];
  const isLoading = campaignsQuery.isLoading;
  const queryError = campaignsQuery.error;
  const error =
    mutationError ??
    (queryError ? (queryError instanceof Error ? queryError.message : "Failed to fetch campaigns") : null);

  /** Re-read the list and the action count. Resolves once the list is back. */
  const fetchCampaigns = async () => {
    await queryClient.invalidateQueries({ queryKey: ["campaigns", user?.id] });
  };

  /**
   * The rate card's price for a placement, from calculate_campaign_pricing.
   *
   * It used to fall back to hardcoded rates ($10/$5/$5/$15 a day, no volume
   * discount) on any error or empty answer. That number went into
   * campaigns.total_cost, which the pricing trigger and
   * create-campaign-checkout then disagreed with: a second formula for one
   * price (WEB-ADS-003's shape). An error is now an error, and the campaign is
   * not created on a guess.
   */
  const getCurrentPricing = async (
    placementType: 'top_banner' | 'featured_spot' | 'below_fold' | 'sponsored_listing',
    daysCount: number
  ): Promise<PricingInfo> => {
    const { data, error } = await supabase.rpc("calculate_campaign_pricing", {
      p_placement_type: placementType,
      p_days_count: daysCount,
    });

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(`No price on the rate card for ${placementType}`);
    }
    return data[0];
  };

  const createCampaign = async (campaignData: {
    name: string;
    placements: Array<{
      placement_type: 'top_banner' | 'featured_spot' | 'below_fold' | 'sponsored_listing';
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

      // WEB-ADS-003: these three columns are advisory. A BEFORE trigger on
      // campaign_placements recomputes daily_cost, total_cost and days_count
      // from the rate card and the campaign's dates for any client write, and
      // create-campaign-checkout prices the Stripe session the same way. They
      // are still sent so the row is never briefly null, and so an older
      // database without the trigger stores something sensible.
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

      if (placementError) {
        // WEB-ADS-007 AC4. THIS USED TO `throw` AND LEAVE THE CAMPAIGN BEHIND.
        //
        // The campaigns row is already written by the time we get here, so a
        // failed placement insert left a draft campaign with no placements: an
        // advertiser who saw an error, and a row that can never be checked out
        // because create-campaign-checkout builds its line items from the
        // placements. Buying the `sidebar` placement did exactly this on every
        // attempt, because the value was not in the placement_type enum.
        //
        // A compensating delete, not an RPC. A transactional
        // create_campaign_with_placements() would be stronger and is the right
        // eventual shape - but it does not exist yet, and a client that calls
        // an RPC before its migration is applied fails with PGRST202 on every
        // campaign rather than on the rare one. This is strictly better than
        // today with no deploy-order hazard.
        //
        // The cleanup is best-effort and its own failure is reported alongside
        // the real error rather than replacing it: the placement error is what
        // the advertiser needs to see, and swallowing it to report a failed
        // tidy-up would be the worse trade.
        const { error: cleanupError } = await supabase
          .from("campaigns")
          .delete()
          .eq("id", campaign.id);

        if (cleanupError) {
          logger.error("createCampaign", "Placement insert failed AND the draft campaign could not be removed", {
            campaignId: campaign.id,
            placementError,
            cleanupError,
          });
        }

        throw placementError;
      }

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

  /**
   * Self-service campaign actions (WEB-ADS-011 AC2).
   *
   * ALL THREE ARE RPCs AND NONE OF THEM IS AN UPDATE FROM HERE. Pausing moves
   * end_date, and end_date is how many days somebody paid for - a browser that
   * computed the new one could extend a campaign for free by changing a number
   * in a request, and RLS cannot tell an invented end_date from a legitimate
   * one, only whose row it is. CLAUDE.md: money is decided on the server.
   *
   * `as never` until the types are regenerated with 20260920000002/3 - the
   * house pattern here. Until they are APPLIED these return PGRST202, which
   * surfaces as a thrown error the caller reports, not as a silent no-op.
   */
  const callCampaignRpc = async <T,>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error: rpcError } = await supabase.rpc(fn as never, args as never);
    if (rpcError) throw new Error(rpcError.message);
    await fetchCampaigns();
    return data as T;
  };

  /** Only draft / pending_payment; the server enforces it, this is not a hint. */
  const cancelCampaign = (campaignId: string) =>
    callCampaignRpc<string>('cancel_campaign', { p_campaign_id: campaignId });

  const setCampaignPaused = (campaignId: string, paused: boolean) =>
    callCampaignRpc<string>('set_campaign_paused', {
      p_campaign_id: campaignId,
      p_paused: paused,
    });

  /**
   * Clone the campaign as an unpaid draft (WEB-ADS-011 AC3).
   *
   * Returns the new campaign's id. The clone carries placement TYPES only -
   * trg_campaign_placement_pricing prices it from the rate card for the new
   * dates, so a renewal is charged at today's rates and not at whatever the
   * original cost.
   */
  const renewCampaign = (campaignId: string) =>
    callCampaignRpc<string>('renew_campaign', { p_campaign_id: campaignId });

  /** Opens a support ticket. It does NOT refund - process-stripe-refund is admin-only. */
  const requestRefund = (campaignId: string, reason: string) =>
    callCampaignRpc<string>('request_campaign_refund', {
      p_campaign_id: campaignId,
      p_reason: reason,
    });

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
    cancelCampaign,
    setCampaignPaused,
    renewCampaign,
    requestRefund,
    refetch: fetchCampaigns,
  };
}