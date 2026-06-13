/**
 * cleanup-old-events (WEB-AUTO-006)
 *
 * Two-phase stale-event lifecycle, replacing the old hard-delete-on-a-cron:
 *   Phase 1 (soft-hide):  events whose date is older than HIDE_AFTER_DAYS are
 *                         flagged is_hidden=true (recoverable -- just clear the
 *                         flag). Public list/detail queries exclude hidden rows.
 *   Phase 2 (archive + hard-delete): events older than the (much longer)
 *                         retention window get a lightweight snapshot written to
 *                         event_archive_snapshots FIRST, their Storage images +
 *                         media_assets removed, then the row + related data are
 *                         purged.
 *
 * Runs through the WEB-AUTO-001 jobRunner so hidden/archived/deleted counts land
 * in automation_job_runs and the admin Job Health panel; terminal failures alert.
 * Auth: requireAdminOrApiKey (cron service-role bearer + admin JWT pass; the
 * Job Health "Re-run" button sends an admin JWT + {manual:true}).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0'
import { handleCors, getCorsHeaders } from '../_shared/cors.ts'
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts'
import { runJob } from '../_shared/jobRunner.ts'

interface CleanupRequest {
  /** Days after an event's date before it is soft-hidden. Default 30. */
  hideAfterDays?: number;
  /** Months an event is retained before hard-delete (archived first). Default 6 (~180d). */
  retentionMonths?: number;
  dryRun?: boolean;
  /** Sent by the Job Health re-run button; ignored beyond running the lifecycle. */
  manual?: boolean;
}

// Delete all Supabase Storage files associated with the given event IDs,
// then remove the corresponding media_assets rows.
async function deleteEventImages(
  supabase: ReturnType<typeof createClient>,
  eventIds: string[]
): Promise<{ deletedFiles: number; errors: string[] }> {
  if (eventIds.length === 0) return { deletedFiles: 0, errors: [] };

  const errors: string[] = [];
  let deletedFiles = 0;

  const { data: assets, error: fetchError } = await supabase
    .from('media_assets')
    .select('id, file_path, bucket_id')
    .eq('content_type', 'event')
    .in('content_id', eventIds);

  if (fetchError) {
    console.error('❌ Failed to fetch media_assets for events:', fetchError.message);
    errors.push(fetchError.message);
    return { deletedFiles, errors };
  }

  if (!assets || assets.length === 0) {
    return { deletedFiles, errors };
  }

  // Group by bucket to batch Storage deletions
  const byBucket: Record<string, string[]> = {};
  for (const asset of assets) {
    const bucket = asset.bucket_id || 'media';
    if (!byBucket[bucket]) byBucket[bucket] = [];
    byBucket[bucket].push(asset.file_path);
  }

  for (const [bucket, filePaths] of Object.entries(byBucket)) {
    const chunkSize = 100;
    for (let i = 0; i < filePaths.length; i += chunkSize) {
      const chunk = filePaths.slice(i, i + chunkSize);
      const { error: storageError } = await supabase.storage.from(bucket).remove(chunk);
      if (storageError) {
        console.error(`❌ Storage delete error (bucket: ${bucket}):`, storageError.message);
        errors.push(storageError.message);
      } else {
        deletedFiles += chunk.length;
      }
    }
  }

  // Delete the media_assets rows (cascades to image_optimization_queue)
  const assetIds = assets.map((a) => a.id);
  const { error: deleteError } = await supabase.from('media_assets').delete().in('id', assetIds);
  if (deleteError) {
    console.error('❌ Failed to delete media_assets rows:', deleteError.message);
    errors.push(deleteError.message);
  }

  return { deletedFiles, errors };
}

// Snapshot rows just before hard-delete so a purged event is never lost without
// a record. Upsert on event_id keeps it idempotent across re-runs.
async function snapshotEvents(
  supabase: ReturnType<typeof createClient>,
  events: Array<Record<string, unknown>>
): Promise<{ archived: number; error?: string }> {
  if (events.length === 0) return { archived: 0 };
  const rows = events.map((e) => ({
    event_id: e.id,
    title: e.title ?? null,
    source_url: e.source_url ?? null,
    category: e.category ?? null,
    location: e.location ?? null,
    venue: e.venue ?? null,
    event_date: e.date ?? null,
    snapshot: e,
  }));
  const { error } = await supabase
    .from('event_archive_snapshots')
    .upsert(rows, { onConflict: 'event_id' });
  if (error) {
    console.error('❌ Failed to write archive snapshots:', error.message);
    return { archived: 0, error: error.message };
  }
  return { archived: rows.length };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let body: CleanupRequest = {};
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch (_error) {
      // No / invalid JSON body -> defaults.
    }
  }

  const hideAfterDays = body.hideAfterDays ?? 30;
  const retentionMonths = body.retentionMonths ?? 6;
  const dryRun = body.dryRun ?? false;

  // Phase 1 cutoff (soft-hide): today - hideAfterDays.
  const hideCutoff = new Date();
  hideCutoff.setDate(hideCutoff.getDate() - hideAfterDays);
  const hideCutoffDate = hideCutoff.toISOString().split('T')[0];

  // Phase 2 cutoff (archive + delete): today - retentionMonths. Matches the
  // cutoff purge_old_events computes internally so the snapshot set == delete set.
  const deleteCutoff = new Date();
  deleteCutoff.setMonth(deleteCutoff.getMonth() - retentionMonths);
  const deleteCutoffDate = deleteCutoff.toISOString().split('T')[0];

  if (dryRun) {
    const { count: wouldHide } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .lt('date', hideCutoffDate)
      .eq('is_hidden', false);
    const { count: wouldDelete } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .lt('date', deleteCutoffDate);

    return new Response(
      JSON.stringify({
        success: true,
        dryRun: true,
        hideAfterDays,
        retentionMonths,
        hideCutoff: hideCutoffDate,
        deleteCutoff: deleteCutoffDate,
        wouldHide: wouldHide || 0,
        wouldDelete: wouldDelete || 0,
        message: `Dry run: would hide ${wouldHide || 0} events and archive+delete ${wouldDelete || 0}.`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }

  const job = await runJob('cleanup-old-events', async (ctx) => {
    // ---- Phase 1: soft-hide stale events (recoverable) ----
    const { data: hiddenRows, error: hideError } = await supabase
      .from('events')
      .update({ is_hidden: true, hidden_at: new Date().toISOString() })
      .lt('date', hideCutoffDate)
      .eq('is_hidden', false)
      .select('id');
    if (hideError) throw new Error(`hide stale events: ${hideError.message}`);
    const hidden = hiddenRows?.length ?? 0;

    // ---- Phase 2: archive snapshot -> delete images -> hard-delete ----
    const { data: expiredEvents, error: fetchError } = await supabase
      .from('events')
      .select('*')
      .lt('date', deleteCutoffDate);
    if (fetchError) throw new Error(`fetch expired events: ${fetchError.message}`);

    const expired = (expiredEvents || []) as Array<Record<string, unknown>>;
    const expiredIds = expired.map((e) => e.id as string);

    // Snapshot BEFORE any destructive step.
    const { archived, error: archiveError } = await snapshotEvents(supabase, expired);
    if (archiveError) ctx.failed(1);

    const { deletedFiles, errors: imageErrors } = await deleteEventImages(supabase, expiredIds);
    if (imageErrors.length > 0) {
      console.warn(`⚠️ ${imageErrors.length} image cleanup error(s) — proceeding with purge`);
      ctx.failed(imageErrors.length);
    }

    let deleted = 0;
    if (expiredIds.length > 0) {
      const { data, error } = await supabase.rpc('purge_old_events', { retention_months: retentionMonths });
      if (error) throw new Error(`purge_old_events: ${error.message}`);
      deleted = (data as { events_deleted?: number } | null)?.events_deleted ?? expiredIds.length;
    }

    ctx.processed(hidden + deleted);
    ctx.meta({ hidden, archived, deleted, deletedFiles, hideAfterDays, retentionMonths });
    return { hidden, archived, deleted, deletedFiles, imageErrors };
  });

  if (!job.ok) {
    return new Response(
      JSON.stringify({ success: false, error: job.error }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }

  const { hidden, archived, deleted, deletedFiles, imageErrors } = job.result!;
  console.log(`✅ Lifecycle complete: hid ${hidden}, archived ${archived}, deleted ${deleted}.`);

  return new Response(
    JSON.stringify({
      success: true,
      hideAfterDays,
      retentionMonths,
      hidden,
      archived,
      deleted,
      deletedFiles,
      imageErrors: imageErrors.length > 0 ? imageErrors : undefined,
      message: `Lifecycle complete. Hid ${hidden} stale events; archived + deleted ${deleted} (and ${deletedFiles} image files).`,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
  );
});
