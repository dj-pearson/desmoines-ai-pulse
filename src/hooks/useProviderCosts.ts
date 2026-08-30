import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// provider_spend_mtd view lands in generated types after `supabase gen types`;
// narrow the client here (AOS-MAINT-006).
const db = supabase as unknown as {
  from: (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (cols?: string) => any;
  };
};

export interface ProviderCost {
  provider: string;
  monthlyBudgetUsd: number;
  spendMtd: number;
  softPct: number;
  hardPct: number;
  throttled: boolean;
  paused: boolean;
  /** spend / budget as a fraction; null when unmonitored (budget ≤ 0). */
  ratio: number | null;
}

interface Row {
  provider: string;
  monthly_budget_usd: number;
  spend_mtd: number;
  soft_pct: number;
  hard_pct: number;
  throttled: boolean;
  paused: boolean;
}

/** Per-provider month-to-date external-API spend vs budget (AOS-MAINT-006). */
export function useProviderCosts() {
  return useQuery({
    queryKey: ["provider-costs"],
    queryFn: async (): Promise<ProviderCost[]> => {
      const { data, error } = await db.from("provider_spend_mtd").select("*");
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      return rows
        .map((r) => {
          const budget = Number(r.monthly_budget_usd) || 0;
          const spend = Number(r.spend_mtd) || 0;
          return {
            provider: r.provider,
            monthlyBudgetUsd: budget,
            spendMtd: spend,
            softPct: Number(r.soft_pct),
            hardPct: Number(r.hard_pct),
            throttled: !!r.throttled,
            paused: !!r.paused,
            ratio: budget > 0 ? spend / budget : null,
          };
        })
        .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1));
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
