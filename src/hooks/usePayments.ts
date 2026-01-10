import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useState } from "react";

export interface Payment {
  id: string;
  user_id: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
  amount: number;
  currency: string;
  payment_type: "subscription" | "campaign" | "one_time";
  status: "pending" | "succeeded" | "failed" | "refunded" | "partially_refunded";
  subscription_id: string | null;
  campaign_id: string | null;
  refunded_amount: number;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
}

export interface Invoice {
  id: string;
  user_id: string;
  payment_id: string | null;
  invoice_number: string;
  stripe_invoice_id: string | null;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  billing_address: Record<string, unknown> | null;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }>;
  description: string | null;
  notes: string | null;
  pdf_url: string | null;
  pdf_generated_at: string | null;
  invoice_date: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentSummary {
  total_spent: number;
  payment_count: number;
  subscription_payments: number;
  campaign_payments: number;
  last_payment_date: string | null;
}

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
  };
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
}

export interface UpcomingInvoice {
  amount: number;
  currency: string;
  dueDate: string | null;
}

export function usePayments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [portalLoading, setPortalLoading] = useState(false);

  // Fetch payment history
  const {
    data: payments = [],
    isLoading: paymentsLoading,
    error: paymentsError,
  } = useQuery({
    queryKey: ["payments", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Payment[];
    },
    enabled: !!user,
  });

  // Fetch invoices
  const {
    data: invoices = [],
    isLoading: invoicesLoading,
    error: invoicesError,
  } = useQuery({
    queryKey: ["invoices", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_id", user.id)
        .order("invoice_date", { ascending: false });

      if (error) throw error;
      return data as Invoice[];
    },
    enabled: !!user,
  });

  // Fetch payment summary
  const { data: paymentSummary } = useQuery({
    queryKey: ["payment-summary", user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase.rpc("get_user_payment_summary", {
        p_user_id: user.id,
      });

      if (error) throw error;
      return data?.[0] as PaymentSummary | null;
    },
    enabled: !!user,
  });

  // Fetch detailed subscription info
  const {
    data: subscriptionDetails,
    isLoading: subscriptionLoading,
    refetch: refetchSubscription,
  } = useQuery({
    queryKey: ["subscription-details", user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase.functions.invoke(
        "manage-subscription",
        {
          body: { action: "details" },
        }
      );

      if (error) throw error;
      return data as {
        subscription: SubscriptionDetails | null;
        tier: string;
        hasActiveSubscription: boolean;
        payments: Payment[];
        upcomingInvoice: UpcomingInvoice | null;
      };
    },
    enabled: !!user,
  });

  // Open Stripe Customer Portal
  const openCustomerPortal = async (returnUrl?: string): Promise<string | null> => {
    if (!user) return null;

    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "manage-subscription",
        {
          body: {
            action: "portal",
            returnUrl: returnUrl || window.location.href,
          },
        }
      );

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
        return data.url;
      }
      return null;
    } catch (err) {
      console.error("Failed to open customer portal:", err);
      return null;
    } finally {
      setPortalLoading(false);
    }
  };

  // Cancel subscription
  const cancelSubscription = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "manage-subscription",
        {
          body: { action: "cancel" },
        }
      );

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-details"] });
      queryClient.invalidateQueries({ queryKey: ["user-subscription"] });
    },
  });

  // Resume subscription
  const resumeSubscription = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "manage-subscription",
        {
          body: { action: "resume" },
        }
      );

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-details"] });
      queryClient.invalidateQueries({ queryKey: ["user-subscription"] });
    },
  });

  // Generate/get invoice
  const getInvoice = async (
    paymentId: string,
    format: "html" | "json" = "json"
  ) => {
    const { data, error } = await supabase.functions.invoke(
      "generate-invoice-pdf",
      {
        body: { paymentId, format },
      }
    );

    if (error) throw error;
    return data;
  };

  // Open invoice in new tab
  const viewInvoice = async (paymentId: string) => {
    try {
      const { data } = await supabase.functions.invoke("generate-invoice-pdf", {
        body: { paymentId, format: "html" },
      });

      if (typeof data === "string") {
        const blob = new Blob([data], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      }
    } catch (err) {
      console.error("Failed to view invoice:", err);
      throw err;
    }
  };

  // Print invoice
  const printInvoice = async (paymentId: string) => {
    try {
      const { data } = await supabase.functions.invoke("generate-invoice-pdf", {
        body: { paymentId, format: "html" },
      });

      if (typeof data === "string") {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(data);
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
        }
      }
    } catch (err) {
      console.error("Failed to print invoice:", err);
      throw err;
    }
  };

  return {
    // Data
    payments,
    invoices,
    paymentSummary,
    subscriptionDetails: subscriptionDetails?.subscription,
    upcomingInvoice: subscriptionDetails?.upcomingInvoice,
    tier: subscriptionDetails?.tier || "free",
    hasActiveSubscription: subscriptionDetails?.hasActiveSubscription || false,

    // Loading states
    isLoading: paymentsLoading || invoicesLoading || subscriptionLoading,
    paymentsLoading,
    invoicesLoading,
    subscriptionLoading,
    portalLoading,

    // Errors
    paymentsError,
    invoicesError,

    // Actions
    openCustomerPortal,
    cancelSubscription: cancelSubscription.mutateAsync,
    resumeSubscription: resumeSubscription.mutateAsync,
    getInvoice,
    viewInvoice,
    printInvoice,
    refetchSubscription,

    // Mutation states
    isCanceling: cancelSubscription.isPending,
    isResuming: resumeSubscription.isPending,
  };
}
