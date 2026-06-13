import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single aggregate feed for the Admin Autonomy Dashboard (WEB-AUTO-014).
 * One edge-function call backs the whole page so the client never fans out
 * into ~10 separate queries.
 */

export interface AutonomyQueueTile {
  key: string;
  label: string;
  count: number;
  needsHuman: boolean;
  href: string;
  sample?: Array<{ id?: string; title?: string; quality_score?: number | null }>;
}

export interface AutonomyJobHealthTile {
  job_name: string;
  last_status: string | null;
  last_run_at: string | null;
  runs_7d: number;
  successes_7d: number;
}

export interface AutonomyRateTile {
  key: string;
  label: string;
  approved: number;
  total: number;
  ratePercent: number | null;
}

export interface AutonomyAlert {
  job_name: string;
  error: string | null;
  finished_at: string | null;
}

export interface AutonomyOverview {
  queues: AutonomyQueueTile[];
  needsHumanTotal: number;
  jobHealth: {
    total: number;
    healthy: number;
    failing: number;
    jobs: AutonomyJobHealthTile[];
  };
  dataQuality:
    | Record<string, { missingCoords: number; missingSeo: number; missingImage: number }>
    | null;
  autoApprovalRates: AutonomyRateTile[];
  alerts: AutonomyAlert[];
  generatedAt: string;
}

export function useAutonomyOverview() {
  return useQuery({
    queryKey: ["admin-autonomy-overview"],
    queryFn: async (): Promise<AutonomyOverview> => {
      const { data, error } = await supabase.functions.invoke("admin-autonomy-overview", {
        body: {},
      });
      if (error) throw error;
      return data as AutonomyOverview;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
