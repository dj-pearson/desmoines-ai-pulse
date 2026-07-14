/**
 * dedupe-content (WEB-AUTO-005)
 *
 * Weekly duplicate detection + merge for events and restaurants.
 *   1. find_duplicate_{events,restaurants} return near-duplicate pairs via trigram
 *      name similarity + coordinate proximity (events also gated to the same date).
 *   2. High-confidence pairs (name >= 0.9 with a proximity/date match) are
 *      auto-merged: child references are repointed, the richer row is kept, the
 *      loser is marked is_merged (retained, reversible 30 days), and the merge is
 *      audit-logged — all inside the merge_duplicate_content() RPC.
 *   3. Ambiguous pairs (0.7-0.9) are queued into content_merge_candidates for
 *      one-click admin review. Restaurants far apart with identical names
 *      (franchises) are never auto-merged and only queued when plausibly co-located.
 *
 * Counts flow through the WEB-AUTO-001 jobRunner. Admin-gated via requireAdminOrApiKey
 * (cron sends the service-role bearer; the admin "re-run" sends an admin JWT).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../../cors.ts';
import { requireAdminOrApiKey } from '../../apiKeyAuth.ts';
import { runJob } from '../../jobRunner.ts';

const AUTO_MERGE_MIN = 0.9;       // name similarity to auto-merge
const QUEUE_MIN = 0.7;            // name similarity to surface for review
const PROXIMITY_M = 150;          // auto-merge proximity gate
const QUEUE_MAX_DISTANCE_M = 400; // restaurants: don't even queue beyond this
const MAX_PAIRS = 200;            // per content type per run

interface Pair {
  a_id: string;
  b_id: string;
  name_sim: number;
  distance_m: number | null;
  same_date: boolean | null;
  a_richness: number;
  b_richness: number;
}

export default (async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get('origin') || undefined);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const job = await runJob('dedupe-content', async (ctx) => {
    const counts = {
      autoMerged: 0,
      queued: 0,
      skipped: 0,
      errors: 0,
      eventPairs: 0,
      restaurantPairs: 0,
    };
    // Rows merged this run — skip later pairs that touch them to avoid chaining
    // a merge onto an already-merged row mid-run.
    const merged = new Set<string>();

    for (const type of ['event', 'restaurant'] as const) {
      const rpc = type === 'event' ? 'find_duplicate_events' : 'find_duplicate_restaurants';
      const { data, error } = await supabase.rpc(rpc, { p_threshold: QUEUE_MIN, p_max: MAX_PAIRS });
      if (error) {
        counts.errors++;
        ctx.failed(1);
        continue;
      }
      const pairs = (data ?? []) as Pair[];
      if (type === 'event') counts.eventPairs = pairs.length;
      else counts.restaurantPairs = pairs.length;

      for (const p of pairs) {
        if (merged.has(p.a_id) || merged.has(p.b_id)) {
          counts.skipped++;
          continue;
        }

        // Keep the richer row; tie -> keep the lexicographically-smaller id (a).
        const survivor = p.a_richness >= p.b_richness ? p.a_id : p.b_id;
        const loser = survivor === p.a_id ? p.b_id : p.a_id;
        const near = p.distance_m == null ? null : p.distance_m <= PROXIMITY_M;

        const auto =
          p.name_sim >= AUTO_MERGE_MIN &&
          (type === 'event'
            ? p.same_date === true && (near === true || p.distance_m == null)
            : near === true); // restaurants always require proximity (franchise guard)

        if (auto) {
          const { error: mErr } = await supabase.rpc('merge_duplicate_content', {
            p_content_type: type,
            p_survivor: survivor,
            p_loser: loser,
            p_confidence: p.name_sim,
            p_decided_by: 'system',
          });
          if (mErr) {
            counts.errors++;
            ctx.failed(1);
          } else {
            counts.autoMerged++;
            merged.add(loser);
            ctx.processed(1);
          }
          continue;
        }

        // Queue for review. Skip far-apart same-name restaurants (likely franchises).
        if (type === 'restaurant' && p.distance_m != null && p.distance_m > QUEUE_MAX_DISTANCE_M) {
          counts.skipped++;
          continue;
        }

        const reasons = [
          `name similarity ${(p.name_sim * 100).toFixed(0)}%`,
          p.distance_m == null ? 'no coordinates' : `${Math.round(p.distance_m)}m apart`,
          ...(type === 'event' ? [p.same_date ? 'same date' : 'different date'] : []),
        ];

        const { error: qErr } = await supabase
          .from('content_merge_candidates' as never)
          .upsert(
            {
              content_type: type,
              survivor_id: survivor,
              loser_id: loser,
              confidence: p.name_sim,
              name_similarity: p.name_sim,
              distance_meters: p.distance_m,
              same_date: p.same_date,
              reasons,
              status: 'pending',
            } as never,
            { onConflict: 'content_type,survivor_id,loser_id', ignoreDuplicates: true },
          );
        if (qErr) {
          counts.errors++;
          ctx.failed(1);
        } else {
          counts.queued++;
          ctx.processed(1);
        }
      }
    }

    ctx.meta(counts);
    return counts;
  }, { maxAttempts: 1 });

  return new Response(JSON.stringify({ ok: job.ok, status: job.status, ...(job.result ?? {}) }), {
    status: job.ok ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
