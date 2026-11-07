import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";

/** PostgREST / Postgres codes for "the Business Pro migration isn't applied". */
const TABLE_MISSING_CODES = new Set(["42P01", "PGRST205"]);

const FALLBACK_MESSAGE = "That didn't go through. Try again in a minute.";

export interface BusinessProPlan {
  priceMonthlyCents: number;
}

/**
 * The Business Pro price, read from business_plans (20261102000006) so the
 * page never carries a number of its own. `null` while the migration is not
 * applied or the plan is switched off: the panel then shows no offer at all.
 */
export function useBusinessProPlan(enabled: boolean) {
  return useQuery({
    queryKey: ["business-plan", "business_pro"],
    enabled,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<BusinessProPlan | null> => {
      const { data, error } = await supabase
        .from("business_plans")
        .select("price_monthly_cents")
        .eq("slug", "business_pro")
        .eq("is_active", true)
        .maybeSingle();
      if (error) {
        if (typeof error.code === "string" && TABLE_MISSING_CODES.has(error.code)) return null;
        throw error;
      }
      if (!data || typeof data.price_monthly_cents !== "number") return null;
      return { priceMonthlyCents: data.price_monthly_cents };
    },
  });
}

export interface BusinessProFailure {
  code: string | null;
  message: string;
}

/**
 * What create-business-pro-checkout refused, in its own words. supabase-js
 * hands back a FunctionsHttpError whose `context` is the Response; its body is
 * `{ error, code }`.
 */
export async function readBusinessProFailure(err: unknown): Promise<BusinessProFailure> {
  const ctx = (err as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const res = ctx as Response;
      const body: unknown = await (typeof res.clone === "function" ? res.clone() : res).json();
      if (body && typeof body === "object") {
        const b = body as { error?: unknown; code?: unknown };
        if (typeof b.error === "string" && b.error) {
          return { code: typeof b.code === "string" ? b.code : null, message: b.error };
        }
      }
    } catch {
      // Not JSON: fall through to the generic message.
    }
  }
  handleError(err, { component: "useBusinessPro", action: "invoke" });
  return { code: null, message: FALLBACK_MESSAGE };
}

/**
 * Start Business Pro checkout, or open the billing portal, for one listing.
 * The request names the listing and the action only; the server decides the
 * price (CLAUDE.md, "Money is decided on the server").
 */
export function useBusinessProCheckout(listingType: "restaurant" | "attraction", listingId: string) {
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);
  const [failure, setFailure] = useState<BusinessProFailure | null>(null);

  const go = async (action: "checkout" | "portal") => {
    setPending(action);
    setFailure(null);
    try {
      const { data, error } = await supabase.functions.invoke("create-business-pro-checkout", {
        body: { action, listingType, listingId },
      });
      if (error) {
        setFailure(await readBusinessProFailure(error));
        return;
      }
      const url = (data as { url?: unknown } | null)?.url;
      if (typeof url !== "string" || !url) {
        handleError(new Error("create-business-pro-checkout returned no url"), {
          component: "useBusinessPro",
          action,
        });
        setFailure({ code: null, message: FALLBACK_MESSAGE });
        return;
      }
      window.location.assign(url);
    } catch (err) {
      handleError(err, { component: "useBusinessPro", action });
      setFailure({ code: null, message: FALLBACK_MESSAGE });
    } finally {
      setPending(null);
    }
  };

  return { pending, failure, startCheckout: () => go("checkout"), openPortal: () => go("portal") };
}
