import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { useAuth } from "./useAuth";
import { USER_SUBSCRIPTIONS_QUERY_KEY } from "./useSubscription";

// BILLING HISTORY IS STRIPE'S (docs/page-plans/pricing.md, WP3 item 8).
//
// This hook used to read `payments`, `invoices` and the
// get_user_payment_summary RPC. None of the three exists in production (both
// migrations sit in .github/migration-drift-baseline.json and the snapshot has
// no such relation), so two of the portal's three tabs could only ever show an
// error. It also rendered invoices from the generate-invoice-pdf function into
// blob: URLs and document.write, which interpolated profile fields unescaped.
// All of that is gone. Receipts and invoices live in the Stripe billing portal
// (openCustomerPortal) for web rows and in the store account for store rows,
// until pricing plan D4 lists Stripe's own invoices in the page.

export interface SubscriptionDetails {
  id: string;
  status: string;
  plan: {
    id: string;
    name: string;
    display_name: string;
    price_monthly: number;
    price_yearly: number;
    features: string[];
  } | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  /** Which billing relationship this row belongs to (WEB-FEAT-015). */
  platform?: SubscriptionPlatform;
}

/** Where a subscriber manages billing this site does not own. */
export type ManageAt = "appstore" | "play";

export type SubscriptionPlatform = "web" | "ios" | "android";

/** One entry per platform the user holds a subscription on (WEB-FEAT-015). */
export interface SubscriptionPlatformRow {
  platform: SubscriptionPlatform;
  tier: string;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  manageAt: ManageAt | null;
}

/**
 * What manage-subscription answers when the billing belongs to a store.
 *
 * It is a 200, not an error: the request is answerable, just not by Stripe.
 * supabase.functions.invoke drops the body of a non-2xx response, so a 4xx
 * would lose the deep link that is the whole point of the answer.
 */
export interface StoreManagedResult {
  managedExternally: true;
  manageAt: ManageAt;
  manageUrl: string;
  platform: SubscriptionPlatform;
  message: string;
}

export function isStoreManaged(value: unknown): value is StoreManagedResult {
  return !!value && (value as StoreManagedResult).managedExternally === true;
}

/** Stripe's next charge for the web row, in major units. */
export interface UpcomingInvoice {
  amount: number;
  currency: string;
  dueDate: string | null;
}

/** manage-subscription `details`. `payments` is still sent; nothing reads it. */
export interface SubscriptionDetailsResponse {
  subscription: SubscriptionDetails | null;
  tier: string;
  hasActiveSubscription: boolean;
  upcomingInvoice: UpcomingInvoice | null;
  // WEB-FEAT-015. Set only when the user has no web row -- a store-billed
  // subscriber used to be reported here as tier "free".
  manageAt: ManageAt | null;
  manageUrl: string | null;
  platforms: SubscriptionPlatformRow[];
}

/** What cancel and resume answer. `cancelAtPeriodEnd` arrives with WP5 item 8. */
interface CancelResumeResponse {
  success?: boolean;
  message?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string;
}

export const SUBSCRIPTION_DETAILS_QUERY_KEY = "subscription-details";

/**
 * The server's own message from a failed functions.invoke. A
 * FunctionsHttpError carries the Response in `context`; supabase-js's own
 * message is the generic "non-2xx status code", which tells a member nothing.
 */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = (await (ctx as Response).clone().json()) as { error?: unknown } | null;
      if (body && typeof body.error === "string" && body.error) return body.error;
    } catch {
      // Not JSON; fall through to the fallback.
    }
  }
  return fallback;
}

/** A mutation error that already carries the message to show. */
export class BillingActionError extends Error {}

export function usePayments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [portalLoading, setPortalLoading] = useState(false);
  const userId = user?.id;
  const detailsKey = [SUBSCRIPTION_DETAILS_QUERY_KEY, userId] as const;

  // The web row (or, for a store-only subscriber, their store row), Stripe's
  // upcoming invoice, and where to manage store billing.
  const {
    data: subscriptionDetails,
    isLoading: subscriptionLoading,
    error: subscriptionDetailsError,
    refetch: refetchSubscription,
  } = useQuery({
    queryKey: detailsKey,
    queryFn: async (): Promise<SubscriptionDetailsResponse | null> => {
      if (!userId) return null;

      const { data, error } = await supabase.functions.invoke("manage-subscription", {
        body: { action: "details" },
      });

      if (error) {
        throw new Error(
          await functionErrorMessage(error, "We couldn't load your billing details."),
        );
      }
      return data as SubscriptionDetailsResponse;
    },
    enabled: !!userId,
  });

  // Open the Stripe customer portal (payment method, receipts, invoices).
  const openCustomerPortal = async (returnUrl?: string): Promise<string | null> => {
    if (!userId) return null;

    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-subscription", {
        body: {
          action: "portal",
          returnUrl: returnUrl || window.location.href,
        },
      });

      if (error) throw error;

      // WEB-FEAT-015: an iOS/Android subscriber has no Stripe customer, so the
      // portal answers with the store that does bill them. Open it in a new tab
      // rather than navigating away -- unlike the Stripe portal, the store page
      // never comes back here.
      if (isStoreManaged(data)) {
        window.open(data.manageUrl, "_blank", "noopener,noreferrer");
        return data.manageUrl;
      }

      if (data?.url) {
        window.location.href = data.url;
        return data.url;
      }
      return null;
    } catch (err) {
      handleError(err, { component: "usePayments", action: "openCustomerPortal" });
      return null;
    } finally {
      setPortalLoading(false);
    }
  };

  /**
   * After cancel or resume: write the new flag into the details cache so the
   * badge and button change at once, then re-read both the details and the
   * per-platform rows. The rows live under [USER_SUBSCRIPTIONS_QUERY_KEY, id];
   * this used to invalidate ["user-subscription"], which matched nothing, and
   * refetchOnWindowFocus is off, so the page kept the old state until reload.
   */
  const applyCancelFlag = (response: unknown, fallback: boolean) => {
    if (isStoreManaged(response)) return;
    const body = (response ?? {}) as CancelResumeResponse;
    const cancelAtPeriodEnd =
      typeof body.cancelAtPeriodEnd === "boolean" ? body.cancelAtPeriodEnd : fallback;

    queryClient.setQueryData<SubscriptionDetailsResponse | null>(detailsKey, (prev) => {
      if (!prev?.subscription) return prev;
      return {
        ...prev,
        subscription: {
          ...prev.subscription,
          cancelAtPeriodEnd,
          ...(typeof body.currentPeriodEnd === "string"
            ? { currentPeriodEnd: body.currentPeriodEnd }
            : {}),
        },
      };
    });
    void queryClient.invalidateQueries({ queryKey: [SUBSCRIPTION_DETAILS_QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: [USER_SUBSCRIPTIONS_QUERY_KEY] });
  };

  const runAction = async (action: "cancel" | "resume", fallback: string) => {
    const { data, error } = await supabase.functions.invoke("manage-subscription", {
      body: { action },
    });
    if (error) {
      handleError(error, { component: "usePayments", action });
      throw new BillingActionError(await functionErrorMessage(error, fallback));
    }
    return data as CancelResumeResponse | StoreManagedResult;
  };

  const cancelSubscription = useMutation({
    mutationFn: () => runAction("cancel", "We couldn't cancel your subscription. Please try again."),
    onSuccess: (data) => applyCancelFlag(data, true),
  });

  const resumeSubscription = useMutation({
    mutationFn: () => runAction("resume", "We couldn't resume your subscription. Please try again."),
    onSuccess: (data) => applyCancelFlag(data, false),
  });

  return {
    // Data
    subscriptionDetails: subscriptionDetails?.subscription ?? null,
    upcomingInvoice: subscriptionDetails?.upcomingInvoice ?? null,
    tier: subscriptionDetails?.tier || "free",
    hasActiveSubscription: subscriptionDetails?.hasActiveSubscription || false,
    // WEB-FEAT-015: non-null means this site cannot manage the billing and the
    // UI must deep-link to the store instead of offering Stripe actions.
    manageAt: subscriptionDetails?.manageAt ?? null,
    manageUrl: subscriptionDetails?.manageUrl ?? null,
    subscriptionPlatforms: subscriptionDetails?.platforms ?? [],

    // Loading and errors
    isLoading: subscriptionLoading,
    subscriptionLoading,
    subscriptionDetailsError,
    portalLoading,

    // Actions
    openCustomerPortal,
    cancelSubscription: cancelSubscription.mutateAsync,
    resumeSubscription: resumeSubscription.mutateAsync,
    refetchSubscription,

    // Mutation states
    isCanceling: cancelSubscription.isPending,
    isResuming: resumeSubscription.isPending,
  };
}
