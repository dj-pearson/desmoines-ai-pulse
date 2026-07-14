/**
 * cleanup-old-events (WEB-AUTO-006: stale-event lifecycle)
 *
 * Two-phase, observable, recoverable cleanup — replaces the old single-phase
 * hard delete:
 *   Phase 1 (hide):  soft-hide events HIDE_AFTER_DAYS past their date
 *                    (is_hidden = true). Public surfaces already exclude them.
 *   Phase 2 (purge): events DELETE_AFTER_DAYS past their date are snapshotted
 *                    into event_archive, their Storage images removed, then
 *                    child rows + the event are hard-deleted.
 *
 * Runs through the WEB-AUTO-001 jobRunner so hidden/archived/deleted counts land
 * in automation_job_runs and the admin Job Health panel. Recovery: an admin can
 * restore a hidden row via unhide_stale_event() (see docs/AUTOMATION_JOBS.md).
 *
 * AuthZ: requireAdminOrApiKey — accepts the cron service-role bearer, an
 * X-API-Key, or an admin JWT (so the panel "Re-run" works). This gate is
 * authoritative regardless of the platform verify_jwt setting (it rejects
 * authenticated non-admins that verify_jwt alone would let through).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0'
import { handleCors, getCorsHeaders } from '../../cors.ts'
import { requireAdminOrApiKey } from '../../apiKeyAuth.ts'
import { runJob } from '../../jobRunner.ts'

const DEFAULT_HIDE_AFTER_DAYS = 30;
const DEFAULT_DELETE_AFTER_DAYS = 180;

interface CleanupRequest {
  hideAfterDays?: number;
  deleteAfterDays?: number;
  // Back-compat: callers used to pass retentionMonths (default 6 = ~180 days).
  retentionMonths?: number;
  dryRun?: boolean;
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
    const bucket = (asset.bucket_id as string) || 'media';
    if (!byBucket[bucket]) byBucket[bucket] = [];
    byBucket[bucket].push(asset.file_path as string);
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

  const assetIds = assets.map((a) => a.id);
  const { error: deleteError } = await supabase.from('media_assets').delete().in('id', assetIds);
  if (deleteError) {
    console.error('❌ Failed to delete media_assets rows:', deleteError.message);
    errors.push(deleteError.message);
  }

  return { deletedFiles, errors };
}

export default (async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let requestBody: CleanupRequest = {};
    if (req.method === 'POST') {
      try {
        requestBody = await req.json();
      } catch (_error) {
        // No / invalid body — use defaults.
      }
    }

    const hideAfterDays = requestBody.hideAfterDays ?? DEFAULT_HIDE_AFTER_DAYS;
    const deleteAfterDays =
      requestBody.deleteAfterDays ??
      (requestBody.retentionMonths ? requestBody.retentionMonths * 30 : DEFAULT_DELETE_AFTER_DAYS);
    const dryRun = requestBody.dryRun ?? false;

    const hideCutoff = new Date();
    hideCutoff.setDate(hideCutoff.getDate() - hideAfterDays);
    const deleteCutoff = new Date();
    deleteCutoff.setDate(deleteCutoff.getDate() - deleteAfterDays);
    const hideCutoffStr = hideCutoff.toISOString().split('T')[0];
    const deleteCutoffStr = deleteCutoff.toISOString().split('T')[0];

    if (dryRun) {
      const { count: toHide } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .lt('date', hideCutoffStr)
        .eq('is_hidden', false)
        .is('hidden_at', null);
      const { count: toDelete } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .lt('date', deleteCutoffStr);

      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          hideAfterDays,
          deleteAfterDays,
          hideCutoff: hideCutoffStr,
          deleteCutoff: deleteCutoffStr,
          eventsToHide: toHide || 0,
          eventsToDelete: toDelete || 0,
          message: `Dry run: would hide ${toHide || 0} and archive+delete ${toDelete || 0} events.`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Observed run: records to automation_job_runs, retries transient failures,
    // alerts on terminal failure (WEB-AUTO-001).
    const job = await runJob('cleanup-old-events', async (ctx) => {
      // --- Phase 1: soft-hide stale events ---
      const { data: hideResult, error: hideError } = await supabase.rpc('hide_stale_events', {
        hide_after_days: hideAfterDays,
      });
      if (hideError) throw new Error(`hide_stale_events: ${hideError.message}`);
      const eventsHidden = (hideResult as { events_hidden?: number } | null)?.events_hidden ?? 0;

      // --- Phase 2: archive snapshot + hard delete (storage cleaned first) ---
      const { data: expiredEvents, error: fetchError } = await supabase
        .from('events')
        .select('id')
        .lt('date', deleteCutoffStr);
      if (fetchError) throw new Error(`fetch expired events: ${fetchError.message}`);
      const expiredIds = (expiredEvents || []).map((e) => e.id as string);

      const { deletedFiles, errors: imageErrors } = await deleteEventImages(supabase, expiredIds);
      if (imageErrors.length > 0) {
        console.warn(`⚠️ ${imageErrors.length} image cleanup error(s) — proceeding with purge`);
        ctx.failed(imageErrors.length);
      }

      const { data: purgeResult, error: purgeError } = await supabase.rpc('archive_and_purge_events', {
        delete_after_days: deleteAfterDays,
      });
      if (purgeError) throw new Error(`archive_and_purge_events: ${purgeError.message}`);
      const eventsArchived = (purgeResult as { events_archived?: number } | null)?.events_archived ?? 0;
      const eventsDeleted = (purgeResult as { events_deleted?: number } | null)?.events_deleted ?? expiredIds.length;

      ctx.processed(eventsHidden + eventsDeleted);
      ctx.meta({
        hidden: eventsHidden,
        deleted: eventsDeleted,
        archived: eventsArchived,
        deletedFiles,
        hideAfterDays,
        deleteAfterDays,
      });
      return { eventsHidden, eventsDeleted, eventsArchived, deletedFiles, imageErrors };
    });

    if (!job.ok) {
      return new Response(
        JSON.stringify({ success: false, error: job.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const { eventsHidden, eventsDeleted, eventsArchived, deletedFiles, imageErrors } = job.result!;
    return new Response(
      JSON.stringify({
        success: true,
        hideAfterDays,
        deleteAfterDays,
        eventsHidden,
        eventsArchived,
        eventsDeleted,
        deletedFiles,
        imageErrors: imageErrors.length > 0 ? imageErrors : undefined,
        message: `Lifecycle cleanup complete. Hid ${eventsHidden}, archived ${eventsArchived}, deleted ${eventsDeleted} events and ${deletedFiles} image files.`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('❌ Unexpected error in cleanup function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
