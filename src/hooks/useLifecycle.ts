import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Views/tables land in generated types after `supabase gen types`; narrow here.
const db = supabase as unknown as {
  from: (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (cols?: string) => any;
  };
};

export interface StageCount {
  stage: string;
  users: number;
}

export interface LifecycleTransition {
  id: string;
  user_id: string;
  from_stage: string | null;
  to_stage: string;
  reason: string | null;
  created_at: string;
}

const STAGE_ORDER = ["new", "onboarding", "active", "reactivated", "at_risk", "dormant", "churned", "unclassified"];

/** User counts by lifecycle stage (AOS-NURTURE-001 admin view). */
export function useLifecycleSummary() {
  return useQuery({
    queryKey: ["lifecycle-summary"],
    queryFn: async (): Promise<StageCount[]> => {
      const { data, error } = await db.from("user_lifecycle_summary").select("*");
      if (error) throw error;
      const rows = (data ?? []) as StageCount[];
      return rows.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

/** Recent stage transitions (nurture agents react to these). */
export function useLifecycleTransitions(limit = 50) {
  return useQuery({
    queryKey: ["lifecycle-transitions", limit],
    queryFn: async (): Promise<LifecycleTransition[]> => {
      const { data, error } = await db
        .from("user_lifecycle_history")
        .select("id, user_id, from_stage, to_stage, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as LifecycleTransition[];
    },
    staleTime: 60 * 1000,
  });
}
