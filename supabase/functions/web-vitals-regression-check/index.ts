/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

// WEB-PERF-007: weekly real-user web-vitals regression check.
// Computes p75 per metric per page-group for the last 7 days vs the previous 7,
// and alerts (email) if any metric degrades > 20% or breaches its budget.
// Wrapped in the WEB-AUTO-001 jobRunner so the run is recorded + monitored.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { runJob, sendJobAlert } from "../_shared/jobRunner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Core Web Vitals budgets.
const BUDGETS: Record<string, number> = { LCP: 2500, CLS: 0.1, INP: 200 };
const DEGRADE_RATIO = 1.2; // > 20% worse than last week

function p75(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(0.75 * sorted.length));
  return sorted[idx];
}

interface Row { metric: string; value: number; page_group: string }

function p75ByGroup(rows: Row[]): Map<string, number> {
  const buckets = new Map<string, number[]>();
  for (const r of rows) {
    const key = `${r.metric}|${r.page_group}`;
    const arr = buckets.get(key) ?? [];
    arr.push(r.value);
    buckets.set(key, arr);
  }
  const out = new Map<string, number>();
  for (const [key, vals] of buckets) {
    const v = p75(vals);
    if (v !== null) out.set(key, v);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const result = await runJob("web-vitals-regression-check", async (ctx) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const currStart = new Date(now - 7 * day).toISOString();
    const prevStart = new Date(now - 14 * day).toISOString();

    const [{ data: currRows }, { data: prevRows }] = await Promise.all([
      supabase.from("web_vitals").select("metric, value, page_group").gte("created_at", currStart),
      supabase.from("web_vitals").select("metric, value, page_group").gte("created_at", prevStart).lt("created_at", currStart),
    ]);

    const curr = p75ByGroup((currRows ?? []) as Row[]);
    const prev = p75ByGroup((prevRows ?? []) as Row[]);
    ctx.processed(curr.size);

    const regressions: string[] = [];
    for (const [key, current] of curr) {
      const [metric, group] = key.split("|");
      const budget = BUDGETS[metric];
      const previous = prev.get(key);
      const overBudget = budget !== undefined && current > budget;
      const degraded = previous !== undefined && current > previous * DEGRADE_RATIO;
      if (overBudget || degraded) {
        const unit = metric === "CLS" ? "" : "ms";
        const parts = [`${metric} on ${group}: p75 ${current.toFixed(metric === "CLS" ? 3 : 0)}${unit}`];
        if (previous !== undefined) parts.push(`(was ${previous.toFixed(metric === "CLS" ? 3 : 0)}${unit})`);
        if (overBudget) parts.push(`[over budget ${budget}${unit}]`);
        regressions.push(parts.join(" "));
      }
    }

    ctx.meta({ regressions: regressions.length });

    if (regressions.length > 0) {
      ctx.failed(regressions.length);
      await sendJobAlert(
        "web-vitals-regression-check",
        `Web-vitals regressions detected (week over week):\n\n- ${regressions.join("\n- ")}`,
      );
    }

    return { regressions, groupsChecked: curr.size };
  });

  return new Response(JSON.stringify(result), {
    status: result.status === "failed" ? 500 : 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
