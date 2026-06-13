import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0'
import { runJob } from '../_shared/jobRunner.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CleanupRequest {
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

  // Fetch all media_assets for these events
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
    console.log('ℹ️ No media_assets found for events being deleted');
    return { deletedFiles, errors };
  }

  console.log(`🗑️ Found ${assets.length} media_assets to clean up`);

  // Group by bucket to batch Storage deletions
  const byBucket: Record<string, string[]> = {};
  for (const asset of assets) {
    const bucket = asset.bucket_id || 'media';
    if (!byBucket[bucket]) byBucket[bucket] = [];
    byBucket[bucket].push(asset.file_path);
  }

  for (const [bucket, filePaths] of Object.entries(byBucket)) {
    // Supabase Storage remove accepts up to 1000 paths at a time
    const chunkSize = 100;
    for (let i = 0; i < filePaths.length; i += chunkSize) {
      const chunk = filePaths.slice(i, i + chunkSize);
      const { error: storageError } = await supabase.storage
        .from(bucket)
        .remove(chunk);

      if (storageError) {
        console.error(`❌ Storage delete error (bucket: ${bucket}):`, storageError.message);
        errors.push(storageError.message);
      } else {
        deletedFiles += chunk.length;
        console.log(`✅ Deleted ${chunk.length} files from bucket "${bucket}"`);
      }
    }
  }

  // Delete the media_assets rows (cascades to image_optimization_queue)
  const assetIds = assets.map((a) => a.id);
  const { error: deleteError } = await supabase
    .from('media_assets')
    .delete()
    .in('id', assetIds);

  if (deleteError) {
    console.error('❌ Failed to delete media_assets rows:', deleteError.message);
    errors.push(deleteError.message);
  } else {
    console.log(`✅ Deleted ${assetIds.length} media_assets rows`);
  }

  return { deletedFiles, errors };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🧹 Event cleanup function called');

    let requestBody: CleanupRequest = {};
    
    if (req.method === 'POST') {
      try {
        requestBody = await req.json();
      } catch (_error) {
        console.log('No JSON body provided, using defaults');
      }
    }

    const { 
      retentionMonths = 6, 
      dryRun = false 
    } = requestBody;

    console.log(`🧹 Running event cleanup - Retention: ${retentionMonths} months, Dry run: ${dryRun}`);

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);

    if (dryRun) {
      // Calculate what would be deleted without making changes
      const { count: eventsToDelete } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .lt('date', cutoffDate.toISOString());

      const { count: imagesToDelete } = await supabase
        .from('media_assets')
        .select('id', { count: 'exact', head: true })
        .eq('content_type', 'event');

      console.log(`🧹 DRY RUN: Would delete ${eventsToDelete} events older than ${cutoffDate.toDateString()}`);

      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          retentionMonths,
          cutoffDate: cutoffDate.toISOString(),
          eventsToDelete: eventsToDelete || 0,
          estimatedImagesToDelete: imagesToDelete || 0,
          message: `Dry run complete. Would delete ${eventsToDelete || 0} events and their associated images.`
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Observed run: records to automation_job_runs, retries transient failures,
    // alerts on terminal failure (WEB-AUTO-001).
    const job = await runJob('cleanup-old-events', async (ctx) => {
      // Fetch IDs of events that will be purged before deleting them
      const { data: expiredEvents, error: fetchError } = await supabase
        .from('events')
        .select('id')
        .lt('date', cutoffDate.toISOString());
      if (fetchError) throw new Error(`fetch expired events: ${fetchError.message}`);

      const expiredIds = (expiredEvents || []).map((e) => e.id);
      console.log(`🧹 Found ${expiredIds.length} expired events to purge`);

      // Delete associated Storage files and media_assets rows first
      const { deletedFiles, errors: imageErrors } = await deleteEventImages(supabase, expiredIds);
      if (imageErrors.length > 0) {
        console.warn(`⚠️ ${imageErrors.length} image cleanup error(s) — proceeding with event purge`);
        ctx.failed(imageErrors.length);
      }

      // Execute the actual event cleanup using the database function
      const { data, error } = await supabase.rpc('purge_old_events', { retention_months: retentionMonths });
      if (error) throw new Error(`purge_old_events: ${error.message}`);

      ctx.processed(expiredIds.length);
      ctx.meta({ deletedFiles, retentionMonths, purgedEvents: expiredIds.length });
      return { result: data, deletedFiles, imageErrors, purgedEvents: expiredIds.length };
    });

    if (!job.ok) {
      return new Response(
        JSON.stringify({ success: false, error: job.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const { result, deletedFiles, imageErrors, purgedEvents } = job.result!;
    console.log('✅ Event cleanup completed:', result);

    return new Response(
      JSON.stringify({
        success: true,
        retentionMonths,
        result,
        deletedFiles,
        imageErrors: imageErrors.length > 0 ? imageErrors : undefined,
        message: `Event cleanup completed. Purged ${purgedEvents} events and ${deletedFiles} image files.`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('❌ Unexpected error in cleanup function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});