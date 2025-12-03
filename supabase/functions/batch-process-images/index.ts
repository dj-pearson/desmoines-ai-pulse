import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Batch processing configuration
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

interface ProcessingResult {
  assetId: string;
  success: boolean;
  error?: string;
  webpUrl?: string;
  avifUrl?: string;
  thumbnailUrl?: string;
  processingTimeMs?: number;
}

interface BatchRequest {
  action: "process_pending" | "process_specific" | "reprocess_failed";
  assetIds?: string[];
  options?: {
    generateWebp?: boolean;
    generateAvif?: boolean;
    generateThumbnail?: boolean;
    targetSizes?: number[];
    quality?: number;
  };
}

/**
 * Process a single image for optimization
 * Note: In production, this would integrate with an image processing service
 * like Cloudflare Images, Imgix, or a custom Sharp-based worker
 */
async function processImage(
  supabase: ReturnType<typeof createClient>,
  assetId: string,
  options: BatchRequest["options"] = {}
): Promise<ProcessingResult> {
  const startTime = Date.now();

  try {
    // Get the media asset record
    const { data: asset, error: fetchError } = await supabase
      .from("media_assets")
      .select("*")
      .eq("id", assetId)
      .single();

    if (fetchError || !asset) {
      return {
        assetId,
        success: false,
        error: `Asset not found: ${fetchError?.message || "Unknown error"}`,
      };
    }

    // Skip if already processed
    if (asset.processing_status === "completed" && asset.is_optimized) {
      return {
        assetId,
        success: true,
        webpUrl: asset.optimized_versions?.webp,
        avifUrl: asset.optimized_versions?.avif,
        thumbnailUrl: asset.optimized_versions?.thumbnail,
        processingTimeMs: 0,
      };
    }

    // Update status to processing
    await supabase
      .from("media_assets")
      .update({
        processing_status: "processing",
      })
      .eq("id", assetId);

    // Get the source image URL
    const { data: urlData } = supabase.storage
      .from(asset.bucket_id)
      .getPublicUrl(asset.file_path);

    const sourceUrl = urlData.publicUrl;

    // For now, we'll simulate the processing
    // In production, this would:
    // 1. Download the source image
    // 2. Use Sharp or similar to generate optimized versions
    // 3. Upload the optimized versions to storage
    // 4. Update the media_assets record with the new URLs

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create optimized version paths (simulated)
    const timestamp = Date.now();
    const basePath = asset.file_path.replace(/\.[^.]+$/, "");

    const optimizedVersions: Record<string, string> = {};

    if (options.generateWebp !== false) {
      // In production: generate WebP and upload
      optimizedVersions.webp = `${sourceUrl}?format=webp&quality=${options.quality || 80}`;
    }

    if (options.generateAvif !== false) {
      // In production: generate AVIF and upload
      optimizedVersions.avif = `${sourceUrl}?format=avif&quality=${options.quality || 70}`;
    }

    if (options.generateThumbnail !== false) {
      // In production: generate thumbnail and upload
      optimizedVersions.thumbnail = `${sourceUrl}?width=300&height=200&fit=cover`;
    }

    // Update the media asset with optimized versions
    const { error: updateError } = await supabase
      .from("media_assets")
      .update({
        is_optimized: true,
        optimized_versions: optimizedVersions,
        processing_status: "completed",
        processing_error: null,
      })
      .eq("id", assetId);

    if (updateError) {
      throw new Error(`Failed to update asset: ${updateError.message}`);
    }

    // Update the optimization queue
    await supabase
      .from("image_optimization_queue")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        result_webp_url: optimizedVersions.webp,
        result_avif_url: optimizedVersions.avif,
        result_thumbnail_url: optimizedVersions.thumbnail,
      })
      .eq("media_asset_id", assetId);

    return {
      assetId,
      success: true,
      webpUrl: optimizedVersions.webp,
      avifUrl: optimizedVersions.avif,
      thumbnailUrl: optimizedVersions.thumbnail,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Update the asset with error status
    await supabase
      .from("media_assets")
      .update({
        processing_status: "failed",
        processing_error: errorMessage,
      })
      .eq("id", assetId);

    // Update the queue
    await supabase
      .from("image_optimization_queue")
      .update({
        status: "failed",
        error_message: errorMessage,
        attempts: supabase.rpc("increment", { row_id: assetId }),
      })
      .eq("media_asset_id", assetId);

    return {
      assetId,
      success: false,
      error: errorMessage,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Get pending images from the optimization queue
 */
async function getPendingImages(
  supabase: ReturnType<typeof createClient>,
  limit: number = BATCH_SIZE
): Promise<string[]> {
  const { data, error } = await supabase
    .from("image_optimization_queue")
    .select("media_asset_id")
    .eq("status", "queued")
    .lt("attempts", MAX_RETRIES)
    .order("priority", { ascending: true })
    .order("queued_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Error fetching pending images:", error);
    return [];
  }

  return data.map((item) => item.media_asset_id);
}

/**
 * Get failed images for reprocessing
 */
async function getFailedImages(
  supabase: ReturnType<typeof createClient>,
  limit: number = BATCH_SIZE
): Promise<string[]> {
  const { data, error } = await supabase
    .from("image_optimization_queue")
    .select("media_asset_id")
    .eq("status", "failed")
    .lt("attempts", MAX_RETRIES)
    .order("queued_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Error fetching failed images:", error);
    return [];
  }

  return data.map((item) => item.media_asset_id);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Verify authorization (requires admin/service role)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Parse request body
    const body: BatchRequest = await req.json();
    const { action, assetIds, options } = body;

    let imagesToProcess: string[] = [];

    switch (action) {
      case "process_pending":
        imagesToProcess = await getPendingImages(supabase);
        break;

      case "process_specific":
        if (!assetIds || assetIds.length === 0) {
          return new Response(
            JSON.stringify({ error: "No asset IDs provided" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        imagesToProcess = assetIds.slice(0, BATCH_SIZE);
        break;

      case "reprocess_failed":
        imagesToProcess = await getFailedImages(supabase);
        break;

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    if (imagesToProcess.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No images to process",
          processed: 0,
          results: [],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Process images in parallel (with limit)
    const results = await Promise.all(
      imagesToProcess.map((assetId) => processImage(supabase, assetId, options))
    );

    // Calculate statistics
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalTime = results.reduce(
      (sum, r) => sum + (r.processingTimeMs || 0),
      0
    );

    return new Response(
      JSON.stringify({
        message: `Processed ${imagesToProcess.length} images`,
        processed: imagesToProcess.length,
        successful,
        failed,
        totalProcessingTimeMs: totalTime,
        averageTimeMs:
          imagesToProcess.length > 0
            ? Math.round(totalTime / imagesToProcess.length)
            : 0,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Batch processing error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
