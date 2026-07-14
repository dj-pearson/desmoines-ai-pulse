/**
 * web-vitals-weekly (WEB-PERF-007)
 *
 * Weekly RUM rollup: computes p75 per metric per page-group for the last 7 days,
 * compares to the previous 7 days, and alerts (email via jobRunner.sendJobAlert)
 * when any metric degrades > 20% week-over-week OR breaches its budget
 * (LCP 2.5s, CLS 0.1, INP 200ms, TTFB 800ms). The aggregated snapshot is stored
 * in the run metadata so the Admin → Job Health panel can render the trend
 * without exposing the raw web_vitals rows.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../../cors.ts';
import { requireAdminOrApiKey } from '../../apiKeyAuth.ts';
import { runJob, sendJobAlert } from '../../jobRunner.ts';

// Core Web Vitals budgets (good thresholds). CLS is unitless; others are ms.
const BUDGETS: Record<string, number> = {
  LCP: 2500,
  CLS: 0.1,
  INP: 200,
  TTFB: 800,
};

const REGRESSION_PCT = 0.2; // 20% week-over-week degradation triggers an alert
const DAY_MS = 24 * 60 * 60 * 1000;

interface Row {
  metric: string;
  value: number;
  page_group: string;
}

function p75(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(0.75 * (sorted.length - 1)));
  return sorted[idx];
}

/** p75 per `${metric}|${page_group}`. */
function rollup(rows: Row[]): Record<string, number> {
  const buckets: Record<string, number[]> = {};
  for (const r of rows) {
    const key = `${r.metric}|${r.page_group}`;
    (buckets[key] ||= []).push(Number(r.value));
  }
  const out: Record<string, number> = {};
  for (const [key, vals] of Object.entries(buckets)) out[key] = p75(vals);
  return out;
}

export default (async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, serviceKey);

  const job = await runJob('web-vitals-weekly', async (ctx) => {
    const now = Date.now();
    const weekAgo = new Date(now - 7 * DAY_MS).toISOString();
    const twoWeeksAgo = new Date(now - 14 * DAY_MS).toISOString();

    // Pull the last 14 days, split into this-week / prior-week.
    const { data, error } = await supabase
      .from('web_vitals')
      .select('metric, value, page_group, created_at')
      .gte('created_at', twoWeeksAgo)
      .limit(50000);
    if (error) throw error;

    const rows = (data || []) as (Row & { created_at: string })[];
    const thisWeek = rows.filter((r) => r.created_at >= weekAgo);
    const priorWeek = rows.filter((r) => r.created_at < weekAgo);

    const current = rollup(thisWeek);
    const previous = rollup(priorWeek);

    const regressions: string[] = [];
    for (const [key, value] of Object.entries(current)) {
      const [metric, pageGroup] = key.split('|');
      const budget = BUDGETS[metric];
      if (budget !== undefined && value > budget) {
        regressions.push(`${metric} on ${pageGroup}: p75 ${value.toFixed(metric === 'CLS' ? 3 : 0)} exceeds budget ${budget}`);
      }
      const prev = previous[key];
      if (prev && prev > 0 && value > prev * (1 + REGRESSION_PCT)) {
        const pct = Math.round(((value - prev) / prev) * 100);
        regressions.push(`${metric} on ${pageGroup}: p75 up ${pct}% week-over-week (${prev.toFixed(metric === 'CLS' ? 3 : 0)} -> ${value.toFixed(metric === 'CLS' ? 3 : 0)})`);
      }
    }

    ctx.processed(thisWeek.length);
    ctx.meta({
      sampleSize: thisWeek.length,
      current,
      previous,
      regressions,
      budgets: BUDGETS,
      computedAt: new Date().toISOString(),
    });

    if (regressions.length > 0) {
      await sendJobAlert(
        'web-vitals-weekly',
        `Web-vitals regressions detected (${regressions.length}):\n- ${regressions.join('\n- ')}`,
      );
    }

    return { sampleSize: thisWeek.length, regressions };
  });

  return new Response(
    JSON.stringify({ success: job.ok, ...job.result }),
    { status: job.ok ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
