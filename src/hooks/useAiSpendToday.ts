import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromUnknownTable } from "@/integrations/supabase/unknownTable";
import {
  summarizeAiSpend,
  type AiBudgetRow,
  type AiSpendSummary,
  type AiUsageRow,
  type ProviderPauseRow,
} from "@/lib/aiSpend";
import { centralDateOf } from "@/lib/timezone";

/**
 * Today's AI spend by feature and provider, against the daily ceiling
 * (WP1 of docs/plans/NON_CORE_REVIEW_2026-09.md).
 *
 * ai_usage_daily and ai_global_budget come from migration 20261001000001 and
 * are not in the generated types until it is applied and types are
 * regenerated; move these reads to supabase.from() then. Both are admin read
 * under RLS, and this hook is only mounted on an admin page.
 *
 * Throws on a failed read rather than answering an empty summary: "no AI spend
 * today" and "the table is not there yet" must not look the same.
 */
export function useAiSpendToday() {
  return useQuery({
    queryKey: ["ai-spend-today"],
    queryFn: async (): Promise<AiSpendSummary> => {
      const today = centralDateOf();
      const [usage, budgets, pauses] = await Promise.all([
        fromUnknownTable("ai_usage_daily")
          .select("subject, feature, calls, cost_usd")
          .eq("usage_date", today)
          .like("subject", "global:%"),
        fromUnknownTable("ai_global_budget").select("provider, daily_usd, kill_switch"),
        supabase.from("provider_budgets").select("provider, paused"),
      ]);
      if (usage.error) throw usage.error;
      if (budgets.error) throw budgets.error;
      // provider_budgets predates this tile; a failed read only loses the
      // "paused" badge, so it does not fail the tile.
      return summarizeAiSpend(
        (usage.data ?? []) as AiUsageRow[],
        (budgets.data ?? []) as AiBudgetRow[],
        pauses.error ? [] : ((pauses.data ?? []) as ProviderPauseRow[]),
      );
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
