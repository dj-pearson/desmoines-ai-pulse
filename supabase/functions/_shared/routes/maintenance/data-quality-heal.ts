/**
 * data-quality-heal (WEB-AUTO-003)
 *
 * Nightly self-healing pipeline. For each content table it, in order:
 *   1. geocodes rows that have an address/location but no lat/lng,
 *   2. generates missing seo fields + geo_summary (via generate-seo-content),
 *   3. backfills missing image_url (delegates to backfill-images).
 * Each stage is batched (<= 25 rows/run/table) to stay inside the timeout.
 *
 * Idempotent + safe: only ever fills NULL/empty fields, never overwrites
 * human-entered data. A row that keeps failing geocoding is flagged
 * needs_manual_verification (after MAX_HEAL_ATTEMPTS) instead of retrying
 * forever. Runs + per-stage counts + a data-quality KPI snapshot are recorded
 * through the WEB-AUTO-001 jobRunner.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../../cors.ts';
import { requireAdminOrApiKey } from '../../apiKeyAuth.ts';
import { runJob } from '../../jobRunner.ts';

const TABLES = ['events', 'restaurants', 'attractions'] as const;
const BATCH = 25;
const MAX_HEAL_ATTEMPTS = 3;

// Column that carries the geocodable text differs per table.
const ADDR_COLS: Record<string, string[]> = {
  events: ['location', 'venue'],
  restaurants: ['address', 'location'],
  attractions: ['address', 'location'],
};

// SEO content-type slug expected by generate-seo-content.
const SEO_TYPE: Record<string, string> = {
  events: 'events',
  restaurants: 'restaurants',
  attractions: 'attractions',
};

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

  const job = await runJob('data-quality-heal', async (ctx) => {
    const kpi: Record<string, { missingCoords: number; missingSeo: number; missingImage: number }> = {};
    const stageCounts = { geocoded: 0, geocodeFailed: 0, flagged: 0, seoBatches: 0, imageBatches: 0 };

    for (const table of TABLES) {
      // ---- KPI snapshot (counts of rows missing each field class) ----
      const [coordsMissing, seoMissing, imageMissing] = await Promise.all([
        supabase.from(table).select('id', { count: 'exact', head: true }).is('latitude', null),
        supabase.from(table).select('id', { count: 'exact', head: true }).is('seo_title', null),
        supabase.from(table).select('id', { count: 'exact', head: true }).is('image_url', null),
      ]);
      kpi[table] = {
        missingCoords: coordsMissing.count ?? 0,
        missingSeo: seoMissing.count ?? 0,
        missingImage: imageMissing.count ?? 0,
      };

      // ---- Stage 1: geocode ----
      const addrCols = ADDR_COLS[table];
      const { data: rows } = await supabase
        .from(table)
        .select(`id, latitude, longitude, heal_attempts, ${addrCols.join(', ')}`)
        .is('latitude', null)
        .eq('needs_manual_verification', false)
        .limit(BATCH);

      for (const row of rows ?? []) {
        const r = row as Record<string, unknown>;
        const locationText = addrCols.map((c) => r[c]).find((v) => typeof v === 'string' && v.trim());
        if (!locationText) continue;

        try {
          const res = await fetch(`${url}/functions/v1/geocode-location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ location: locationText }),
          });
          const geo = res.ok ? await res.json() : null;
          if (geo?.latitude && geo?.longitude) {
            await supabase.from(table).update({ latitude: geo.latitude, longitude: geo.longitude }).eq('id', r.id as string);
            stageCounts.geocoded++;
            ctx.processed(1);
          } else {
            throw new Error('no coordinates returned');
          }
        } catch (_e) {
          const attempts = ((r.heal_attempts as number) ?? 0) + 1;
          const patch: Record<string, unknown> = { heal_attempts: attempts };
          if (attempts >= MAX_HEAL_ATTEMPTS) {
            patch.needs_manual_verification = true;
            stageCounts.flagged++;
          }
          await supabase.from(table).update(patch).eq('id', r.id as string);
          stageCounts.geocodeFailed++;
          ctx.failed(1);
        }
      }

      // ---- Stage 2: SEO/GEO (delegate to generate-seo-content) ----
      try {
        const res = await fetch(`${url}/functions/v1/generate-seo-content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ contentType: SEO_TYPE[table], batchSize: 20 }),
        });
        if (res.ok) stageCounts.seoBatches++;
      } catch (e) {
        console.error(`[data-quality-heal] SEO stage failed for ${table}:`, e);
      }

      // ---- Stage 3: image backfill (delegate to backfill-images) ----
      try {
        const res = await fetch(`${url}/functions/v1/backfill-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ contentType: table, limit: BATCH }),
        });
        if (res.ok) stageCounts.imageBatches++;
      } catch (e) {
        console.error(`[data-quality-heal] image stage failed for ${table}:`, e);
      }
    }

    ctx.meta({ kpi, stages: stageCounts });
    return { kpi, stages: stageCounts };
  });

  return new Response(
    JSON.stringify({ success: job.ok, ...job.result }),
    { status: job.ok ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
