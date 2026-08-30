import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// uptime_probes lands in generated types after `supabase gen types` runs
// against the AOS migrations; narrow the client here (AOS-MAINT-001).
const db = supabase as unknown as {
  from: (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (cols?: string) => any;
  };
};

interface ProbeRow {
  target_key: string;
  target_kind: string;
  ok: boolean;
  status_code: number | null;
  latency_ms: number | null;
  checked_at: string;
}

export interface UptimeTarget {
  targetKey: string;
  targetKind: string;
  /** Most recent probe result. */
  up: boolean;
  lastStatus: number | null;
  lastCheckedAt: string;
  /** p95 latency (ms) over the window; null if no successful samples. */
  p95Ms: number | null;
  /** Uptime ratio over the window (0–1). */
  uptimeRatio: number;
  samples: number;
}

export interface UptimeSummary {
  targets: UptimeTarget[];
  upCount: number;
  downCount: number;
  worstP95Ms: number | null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/**
 * Current up/down + p95 latency per monitored target over the last `windowMin`
 * minutes, computed from uptime_probes (AOS-MAINT-001).
 */
export function useUptimeStatus(windowMin = 60) {
  return useQuery({
    queryKey: ["uptime-status", windowMin],
    queryFn: async (): Promise<UptimeSummary> => {
      const sinceIso = new Date(Date.now() - windowMin * 60 * 1000).toISOString();
      const { data, error } = await db
        .from("uptime_probes")
        .select("target_key, target_kind, ok, status_code, latency_ms, checked_at")
        .gte("checked_at", sinceIso)
        .order("checked_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const rows = (data ?? []) as ProbeRow[];

      const byTarget = new Map<string, ProbeRow[]>();
      for (const r of rows) {
        if (!byTarget.has(r.target_key)) byTarget.set(r.target_key, []);
        byTarget.get(r.target_key)!.push(r);
      }

      const targets: UptimeTarget[] = [];
      for (const [targetKey, probes] of byTarget) {
        // rows arrive newest-first, so [0] is the latest.
        const latest = probes[0];
        const okCount = probes.filter((p) => p.ok).length;
        const latencies = probes.filter((p) => p.ok && p.latency_ms != null).map((p) => p.latency_ms as number);
        targets.push({
          targetKey,
          targetKind: latest.target_kind,
          up: latest.ok,
          lastStatus: latest.status_code,
          lastCheckedAt: latest.checked_at,
          p95Ms: percentile(latencies, 95),
          uptimeRatio: probes.length ? okCount / probes.length : 1,
          samples: probes.length,
        });
      }
      targets.sort((a, b) => a.targetKey.localeCompare(b.targetKey));

      const upCount = targets.filter((t) => t.up).length;
      const p95s = targets.map((t) => t.p95Ms).filter((v): v is number => v != null);
      return {
        targets,
        upCount,
        downCount: targets.length - upCount,
        worstP95Ms: p95s.length ? Math.max(...p95s) : null,
      };
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}
