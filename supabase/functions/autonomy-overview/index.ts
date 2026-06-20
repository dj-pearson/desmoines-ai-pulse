/**
 * autonomy-overview (WEB-AUTO-014)
 *
 * Single aggregate endpoint for the Admin Autonomy Dashboard: every "is anything
 * waiting on a human?" signal in one call instead of ~10 client queries. Every
 * metric is feature-tolerant (wrapped so a missing table/column yields null, not
 * a 500), so sections light up as their pipelines ship. Admin-gated.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts';

// deno-lint-ignore no-explicit-any
type AnyQuery = PromiseLike<{ count: number | null; error: any }>;

/** Count helper: returns the exact count, or null if the query/table fails. */
async function safeCount(query: AnyQuery): Promise<number | null> {
  try {
    const { count, error } = await query;
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // deno-lint-ignore no-explicit-any
  const supabase: any = createClient(url, serviceKey);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const COUNT = { count: 'exact', head: true } as const;

  // ---- Queues (feature-tolerant) -------------------------------------------
  const [eventSubmissions, pendingReviews, pendingContacts, mergeReview, creativeApprovals] =
    await Promise.all([
      safeCount(supabase.from('event_submissions').select('id', COUNT).eq('status', 'pending')),
      safeCount(supabase.from('user_ratings').select('id', COUNT).eq('moderation_status', 'pending')),
      safeCount(supabase.from('contact_submissions').select('id', COUNT).eq('moderation_status', 'pending')),
      safeCount(supabase.from('content_merge_candidates').select('id', COUNT).eq('status', 'pending')),
      safeCount(
        supabase.from('campaign_creatives').select('id', COUNT).is('is_approved', null).is('reviewed_at', null)
      ),
    ]);

  const moderation =
    pendingReviews === null && pendingContacts === null
      ? null
      : (pendingReviews ?? 0) + (pendingContacts ?? 0);

  // ---- Job health + recent alerts ------------------------------------------
  let jobFailures7d: number | null = null;
  let alerts: { job: string; error: string | null; at: string | null }[] = [];
  try {
    const { data } = await supabase
      .from('automation_job_runs' as never)
      .select('job_name, status, finished_at, error')
      .gte('started_at', since7d)
      .order('started_at', { ascending: false })
      .limit(300);
    const rows = (data || []) as { job_name: string; status: string; finished_at: string | null; error: string | null }[];
    const failed = rows.filter((r) => r.status === 'failed');
    jobFailures7d = failed.length;
    alerts = failed.slice(0, 10).map((r) => ({ job: r.job_name, error: r.error, at: r.finished_at }));
  } catch {
    jobFailures7d = null;
  }

  // ---- Auto-approval rates per pipeline (from job metadata, best-effort) ----
  const autoApprovalRates: Record<string, number> = {};
  try {
    const { data } = await supabase
      .from('automation_job_runs' as never)
      .select('job_name, metadata, started_at')
      .in('job_name', ['campaign-creative-review', 'moderate-content'])
      .order('started_at', { ascending: false })
      .limit(20);
    for (const row of (data || []) as { job_name: string; metadata: Record<string, unknown> | null }[]) {
      const rate = row.metadata?.autoApprovalRate ?? row.metadata?.autoApproveRate;
      if (typeof rate === 'number' && !(row.job_name in autoApprovalRates)) {
        autoApprovalRates[row.job_name] = rate;
      }
    }
  } catch {
    // ignore
  }

  // ---- Data-quality KPI (latest heal run metadata) -------------------------
  let dataQuality: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase
      .from('automation_job_runs' as never)
      .select('metadata')
      .eq('job_name', 'data-quality-heal')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    dataQuality = ((data as { metadata?: { kpi?: Record<string, unknown> } } | null)?.metadata?.kpi) ?? null;
  } catch {
    dataQuality = null;
  }

  const body = {
    queues: { eventSubmissions, moderation, mergeReview, creativeApprovals },
    jobFailures7d,
    autoApprovalRates,
    dataQuality,
    alerts,
    generatedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
