/**
 * Shared image fetch + Supabase Storage upload utility.
 * Used by ai-crawler (new crawls) and backfill-images (existing records).
 */

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export const CONTENT_TYPE_MAP: Record<string, string> = {
  events: "event",
  restaurants: "restaurant",
  restaurant_openings: "restaurant",
  attractions: "attraction",
  playgrounds: "playground",
};

/**
 * Extract the best image URL from raw HTML.
 * Priority: og:image → twitter:image → first prominent <img>
 */
export function extractImageFromHtml(html: string, pageUrl: string): string | null {
  // og:image
  const ogMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
  );
  if (ogMatch?.[1]) return resolveUrl(ogMatch[1], pageUrl);

  // twitter:image
  const twitterMatch = html.match(
    /<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i
  );
  if (twitterMatch?.[1]) return resolveUrl(twitterMatch[1], pageUrl);

  // First <img> with a decent src (skip data URIs, tracking pixels, tiny icons)
  const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
  for (const match of imgMatches) {
    const src = match[1];
    if (
      src.startsWith("data:") ||
      src.includes("pixel") ||
      src.includes("tracking") ||
      src.includes("icon") ||
      src.includes("logo") ||
      src.includes("avatar") ||
      src.includes("badge") ||
      src.includes("spinner")
    ) {
      continue;
    }
    // Skip tiny images indicated by width/height attributes
    const imgTag = match[0];
    const widthMatch = imgTag.match(/width=["']?(\d+)["']?/i);
    const heightMatch = imgTag.match(/height=["']?(\d+)["']?/i);
    if (widthMatch && parseInt(widthMatch[1]) < 100) continue;
    if (heightMatch && parseInt(heightMatch[1]) < 100) continue;

    const resolved = resolveUrl(src, pageUrl);
    if (resolved) return resolved;
  }

  return null;
}

function resolveUrl(src: string, pageUrl: string): string | null {
  try {
    if (src.startsWith("//")) return `https:${src}`;
    if (src.startsWith("http")) return src;
    if (src.startsWith("/")) return new URL(src, pageUrl).href;
    return new URL(src, pageUrl).href;
  } catch {
    return null;
  }
}

/**
 * Download an external image and upload it to Supabase Storage.
 * Returns the public CDN URL on success, or null on any failure.
 *
 * @param supabase  Supabase client (service role)
 * @param sourceImageUrl  External image URL to download
 * @param category  Content category (events, restaurants, etc.)
 * @param contentId  UUID of the content row (used as folder name and media_assets.content_id)
 */
export async function fetchAndStoreImage(
  supabase: any,
  sourceImageUrl: string,
  category: string,
  contentId: string
): Promise<string | null> {
  if (!sourceImageUrl) return null;

  try {
    // Validate URL scheme
    const parsed = new URL(sourceImageUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;

    const response = await fetch(sourceImageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ Image fetch failed (${response.status}): ${sourceImageUrl}`);
      return null;
    }

    const contentType =
      response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "";

    if (!ALLOWED_IMAGE_MIME.has(contentType)) {
      console.warn(`⚠️ Unsupported mime type "${contentType}": ${sourceImageUrl}`);
      return null;
    }

    // Enforce size cap before buffering
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > IMAGE_MAX_BYTES) {
      console.warn(`⚠️ Skipping oversized image (${contentLength} bytes): ${sourceImageUrl}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > IMAGE_MAX_BYTES) {
      console.warn(`⚠️ Skipping oversized image (${buffer.byteLength} bytes): ${sourceImageUrl}`);
      return null;
    }

    const ext = EXT_MAP[contentType] || "jpg";
    const mediaContentType = CONTENT_TYPE_MAP[category] || category;
    const filePath = `${mediaContentType}s/${contentId}/hero.${ext}`;

    // Check if this content already has an asset to avoid duplicate uploads on re-run
    const { data: existing } = await supabase
      .from("media_assets")
      .select("id")
      .eq("content_type", mediaContentType)
      .eq("content_id", contentId)
      .maybeSingle();

    if (existing) {
      // Asset already stored — re-derive CDN URL from file_path if possible
      const { data: asset } = await supabase
        .from("media_assets")
        .select("file_path")
        .eq("id", existing.id)
        .single();
      if (asset?.file_path) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        return `${supabaseUrl}/storage/v1/object/public/media/${asset.file_path}`;
      }
    }

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(filePath, buffer, { contentType, upsert: true });

    if (uploadError) {
      console.error(`❌ Storage upload failed for ${contentId}:`, uploadError.message);
      return null;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const cdnUrl = `${supabaseUrl}/storage/v1/object/public/media/${filePath}`;

    // Record in media_assets
    const { data: insertedAsset } = await supabase
      .from("media_assets")
      .insert({
        file_name: `hero.${ext}`,
        original_file_name: `hero.${ext}`,
        file_path: filePath,
        bucket_id: "media",
        mime_type: contentType,
        file_size: buffer.byteLength,
        content_type: mediaContentType,
        content_id: contentId,
        processing_status: "pending",
      })
      .select("id")
      .single();

    // Queue for WebP/thumbnail optimisation
    if (insertedAsset?.id) {
      await supabase.from("image_optimization_queue").insert({
        media_asset_id: insertedAsset.id,
        source_url: cdnUrl,
        status: "queued",
        priority: 5,
      });
    }

    console.log(`✅ Image stored: ${cdnUrl}`);
    return cdnUrl;
  } catch (error) {
    console.error(`❌ fetchAndStoreImage error for ${sourceImageUrl}:`, error.message);
    return null;
  }
}
