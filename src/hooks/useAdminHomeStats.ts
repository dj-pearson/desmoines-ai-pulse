import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminKpiTile {
  key: string;
  label: string;
  total: number;
  deltaSevenDay: number;
  href: string;
}

export interface AdminActivityEntry {
  id: string;
  timestamp: string;
  event_type: string;
  action: string | null;
  resource: string | null;
  user_id: string | null;
  severity: string;
  details: Record<string, unknown> | null;
}

export interface AdminHomeStats {
  kpis: AdminKpiTile[];
  activity: AdminActivityEntry[];
  generatedAt: string;
}

async function fetchAdminHomeStats(): Promise<AdminHomeStats> {
  const { data, error } = await supabase.functions.invoke<AdminHomeStats>(
    "admin-home-stats",
    { body: {} },
  );

  if (error) {
    throw new Error(error.message || "Failed to load admin home stats");
  }
  if (!data) {
    throw new Error("Empty response from admin-home-stats");
  }
  return data;
}

/**
 * Loads KPI counts + 7-day deltas + recent activity feed for the unified
 * admin home dashboard. Cached client-side for 5 minutes to match the
 * server-side Cache-Control on the edge function.
 */
export function useAdminHomeStats() {
  return useQuery({
    queryKey: ["admin-home-stats"],
    queryFn: fetchAdminHomeStats,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
