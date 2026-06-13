/**
 * dedupe-content (WEB-AUTO-005)
 *
 * Weekly duplicate detection + merge. For events and restaurants it pulls
 * trigram-candidate pairs from the detection RPCs (find_duplicate_*), then:
 *   • auto-merges high-confidence pairs (name_sim >= 0.9 with matching
 *     date/proximity) via merge_duplicate_content — keeping the richer row,
 *     repointing all child FKs, marking the loser is_merged (reversible 30d);
 *   • queues the ambiguous middle (0.7–0.9) into content_merge_candidates for
 *     a one-click admin decision;
 *   • skips same-name-far-apart restaurants (franchises) entirely.
 *
 * Runs through the WEB-AUTO-001 jobRunner so counts land in the Job Health
 * panel. Re-runnable from the admin UI ({ manual: true } just re-scans).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts';
import { runJob } from '../_shared/jobRunner.ts';

const THRESHOLD = 0.7;       // candidate floor (matches the RPC default)
const AUTO_SIM = 0.9;        // auto-merge name-similarity gate
const PROXIMITY_M = 150;     // auto-merge max distance
const QUEUE_MAX_M = 400;     // restaurants farther than this are NOT queued (franchises)
const PAIR_LIMIT = 200;      // bound the per-type scan

interface Pair {
  a_id: string;
  b_id: string;
  name_sim: number;
  distance_m: number | null;
  same_date: boolean | null;
  richness_a: number;
  richness_b: number;
  title_a: string;
  title_b: string;
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
  const supabase = createClient(url, serviceKey);

  const job = await runJob('dedupe-content', async (ctx) => {
    const counts = { pairs: 0, autoMerged: 0, queued: 0, skipped: 0, errors: 0 };
    // Rows already folded away this run — skip any later pair that touches them.
    const merged = new Set<string>();

    const detectors: Array<{ type: 'event' | 'restaurant'; rpc: string }> = [
      { type: 'event', rpc: 'find_duplicate_events' },
      { type: 'restaurant', rpc: 'find_duplicate_restaurants' },
    ];

    for (const { type, rpc } of detectors) {
      const { data, error } = await supabase.rpc(rpc as never, {
        p_threshold: THRESHOLD,
        p_limit: PAIR_LIMIT,
      } as never);
      if (error) {
        console.error(`[dedupe-content] ${rpc} failed:`, error.message);
        counts.errors++;
        continue;
      }

      const pairs = (data ?? []) as unknown as Pair[];
      counts.pairs += pairs.length;

      for (const p of pairs) {
        if (merged.has(p.a_id) || merged.has(p.b_id)) {
          counts.skipped++;
          continue;
        }

        // Richer row survives; ties keep the lexicographically-smaller id (a_id).
        const survivor = p.richness_a >= p.richness_b ? p.a_id : p.b_id;
        const loser = survivor === p.a_id ? p.b_id : p.a_id;

        const closeEnough = p.distance_m != null && p.distance_m <= PROXIMITY_M;
        const isAuto =
          type === 'event'
            ? p.name_sim >= AUTO_SIM && p.same_date === true && (p.distance_m == null || closeEnough)
            : p.name_sim >= AUTO_SIM && closeEnough;

        if (isAuto) {
          const reason =
            type === 'event'
              ? `name ${(p.name_sim * 100).toFixed(0)}%, same date${closeEnough ? `, ${Math.round(p.distance_m!)}m` : ''}`
              : `name ${(p.name_sim * 100).toFixed(0)}%, ${Math.round(p.distance_m!)}m`;
          const { error: mergeErr } = await supabase.rpc('merge_duplicate_content' as never, {
            p_type: type,
            p_survivor: survivor,
            p_loser: loser,
            p_confidence: p.name_sim,
            p_reason: reason,
            p_auto: true,
          } as never);
          if (mergeErr) {
            console.error(`[dedupe-content] auto-merge ${type} ${loser}→${survivor} failed:`, mergeErr.message);
            counts.errors++;
          } else {
            merged.add(loser);
            counts.autoMerged++;
            ctx.processed(1);
          }
          continue;
        }

        // Franchise guard: same-name restaurants with no/large distance never queue.
        if (type === 'restaurant' && (p.distance_m == null || p.distance_m > QUEUE_MAX_M)) {
          counts.skipped++;
          continue;
        }

        const reason =
          type === 'event'
            ? `name ${(p.name_sim * 100).toFixed(0)}%, same date${p.distance_m != null ? `, ${Math.round(p.distance_m)}m` : ''}`
            : `name ${(p.name_sim * 100).toFixed(0)}%${p.distance_m != null ? `, ${Math.round(p.distance_m)}m` : ''}`;

        const { error: queueErr } = await supabase
          .from('content_merge_candidates' as never)
          .upsert(
            {
              content_type: type,
              a_id: p.a_id,
              b_id: p.b_id,
              suggested_survivor: survivor,
              name_sim: p.name_sim,
              distance_m: p.distance_m,
              reason,
            } as never,
            { onConflict: 'content_type,a_id,b_id', ignoreDuplicates: true } as never,
          );
        if (queueErr) {
          console.error(`[dedupe-content] queue ${type} pair failed:`, queueErr.message);
          counts.errors++;
        } else {
          counts.queued++;
        }
      }
    }

    if (counts.errors > 0) ctx.failed(counts.errors);
    ctx.meta(counts);
    return counts;
  });

  return new Response(
    JSON.stringify({ success: job.ok, ...job.result }),
    { status: job.ok ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
