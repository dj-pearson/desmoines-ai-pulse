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
 * Priority: schema.org JSON-LD → og:image → twitter:image → link rel="image_src" → first prominent <img>
 */
export function extractImageFromHtml(html: string, pageUrl: string): string | null {
  // schema.org JSON-LD (Event/Restaurant/Place often have reliable image fields
  // even when meta tags are missing or generic)
  const jsonLdImage = extractJsonLdImage(html);
  if (jsonLdImage) {
    const resolved = resolveUrl(jsonLdImage, pageUrl);
    if (resolved) return resolved;
  }

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

  // <link rel="image_src" href="...">
  const linkMatch = html.match(
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i
  ) || html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i
  );
  if (linkMatch?.[1]) return resolveUrl(linkMatch[1], pageUrl);

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

/**
 * Pull an image URL out of any schema.org JSON-LD block in the HTML.
 * Handles the common shapes:
 *   "image": "https://..."
 *   "image": ["https://...", "https://..."]
 *   "image": { "@type": "ImageObject", "url": "https://..." }
 *   "image": { "@type": "ImageObject", "contentUrl": "https://..." }
 *   wrapped in @graph arrays
 * Prefers Event > Restaurant > Place > LocalBusiness > anything else.
 */
function extractJsonLdImage(html: string): string | null {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  const candidates: Array<{ priority: number; url: string }> = [];
  const PREF: Record<string, number> = {
    Event: 0,
    MusicEvent: 0,
    SportsEvent: 0,
    BusinessEvent: 0,
    SocialEvent: 0,
    TheaterEvent: 0,
    Festival: 0,
    Restaurant: 1,
    FoodEstablishment: 1,
    LocalBusiness: 2,
    Place: 3,
    TouristAttraction: 3,
  };

  for (const block of blocks) {
    const raw = block[1]?.trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Some sites embed multiple objects or trailing commas — give up on this block
      continue;
    }
    walkForImages(parsed, candidates, PREF);
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0].url;
}

function walkForImages(
  node: unknown,
  out: Array<{ priority: number; url: string }>,
  pref: Record<string, number>,
  inheritedPriority = 999,
): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) walkForImages(item, out, pref, inheritedPriority);
    return;
  }
  if (typeof node !== 'object') return;

  const obj = node as Record<string, unknown>;
  const type = typeof obj['@type'] === 'string' ? (obj['@type'] as string) : '';
  const priority = type in pref ? pref[type] : inheritedPriority;

  const img = obj['image'];
  if (typeof img === 'string') {
    out.push({ priority, url: img });
  } else if (Array.isArray(img)) {
    for (const entry of img) {
      if (typeof entry === 'string') out.push({ priority, url: entry });
      else if (entry && typeof entry === 'object') {
        const url = (entry as Record<string, unknown>).url ?? (entry as Record<string, unknown>).contentUrl;
        if (typeof url === 'string') out.push({ priority, url });
      }
    }
  } else if (img && typeof img === 'object') {
    const url = (img as Record<string, unknown>).url ?? (img as Record<string, unknown>).contentUrl;
    if (typeof url === 'string') out.push({ priority, url });
  }

  // Recurse into common nested fields where Events list location/organizer/photo
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'location', 'organizer', 'photo', 'subEvent', 'subEvents', 'workExample', 'itemListElement']) {
    if (key in obj) walkForImages(obj[key], out, pref, priority);
  }
}

/**
 * Tag describing where a candidate image was found. Used by the picker UI
 * so admins can see which extraction method produced each option.
 */
export type ImageCandidateSource =
  | "og"
  | "twitter"
  | "jsonld"
  | "image_src"
  | "img"
  | "venue"
  | "places";

export interface ImageCandidate {
  url: string;
  source: ImageCandidateSource;
  width?: number;
  height?: number;
}

/**
 * Like extractImageFromHtml but returns ALL plausible candidates instead of
 * picking one. Used by find-image-candidates so admins can choose if the
 * automatic pick was wrong.
 */
export function extractAllImagesFromHtml(html: string, pageUrl: string): ImageCandidate[] {
  const out: ImageCandidate[] = [];

  // og:image (multiple possible — og:image, og:image:url, og:image:secure_url)
  for (const m of html.matchAll(
    /<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/gi,
  )) {
    const u = resolveUrl(m[1], pageUrl);
    if (u) out.push({ url: u, source: "og" });
  }

  // twitter:image
  for (const m of html.matchAll(
    /<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi,
  )) {
    const u = resolveUrl(m[1], pageUrl);
    if (u) out.push({ url: u, source: "twitter" });
  }

  // <link rel="image_src">
  for (const m of html.matchAll(
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/gi,
  )) {
    const u = resolveUrl(m[1], pageUrl);
    if (u) out.push({ url: u, source: "image_src" });
  }

  // schema.org JSON-LD — collect every image found in any block
  const jsonLdCollector: Array<{ priority: number; url: string }> = [];
  const PREF: Record<string, number> = {
    Event: 0,
    MusicEvent: 0,
    SportsEvent: 0,
    BusinessEvent: 0,
    SocialEvent: 0,
    TheaterEvent: 0,
    Festival: 0,
    Restaurant: 1,
    FoodEstablishment: 1,
    LocalBusiness: 2,
    Place: 3,
    TouristAttraction: 3,
  };
  for (const block of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const raw = block[1]?.trim();
    if (!raw) continue;
    try {
      walkForImages(JSON.parse(raw), jsonLdCollector, PREF);
    } catch {
      /* ignore malformed blocks */
    }
  }
  jsonLdCollector.sort((a, b) => a.priority - b.priority);
  for (const c of jsonLdCollector) {
    const u = resolveUrl(c.url, pageUrl);
    if (u) out.push({ url: u, source: "jsonld" });
  }

  // <img> tags — keep ones that look big enough; skip obvious chrome/tracking
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    const src = m[1];
    if (
      src.startsWith("data:") ||
      /pixel|tracking|icon|logo|avatar|badge|spinner/i.test(src)
    ) {
      continue;
    }
    const wMatch = m[0].match(/width=["']?(\d+)["']?/i);
    const hMatch = m[0].match(/height=["']?(\d+)["']?/i);
    const width = wMatch ? parseInt(wMatch[1]) : undefined;
    const height = hMatch ? parseInt(hMatch[1]) : undefined;
    if (width && width < 100) continue;
    if (height && height < 100) continue;
    const u = resolveUrl(src, pageUrl);
    if (u) out.push({ url: u, source: "img", width, height });
  }

  // Dedupe by URL while preserving order
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
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
 * SHA-256 of an ArrayBuffer as a lowercase hex string.
 * Used to detect identical image bytes across different source URLs.
 */
async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build the public CDN URL for a stored file_path.
 */
function cdnUrlFor(filePath: string): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/storage/v1/object/public/media/${filePath}`;
}

/**
 * Insert a media_assets row that points at an existing storage object.
 * Used when we've detected this content_id's image is byte-identical to
 * one we've already uploaded for a different content_id.
 */
async function insertSharedAssetRow(
  supabase: any,
  args: {
    filePath: string;
    mimeType: string;
    fileSize: number;
    contentType: string;
    contentId: string;
    contentHash: string | null;
    sourceUrl: string;
  },
): Promise<void> {
  const fileName = args.filePath.split("/").pop() || "hero";
  await supabase.from("media_assets").insert({
    file_name: fileName,
    original_file_name: fileName,
    file_path: args.filePath,
    bucket_id: "media",
    mime_type: args.mimeType,
    file_size: args.fileSize,
    content_type: args.contentType,
    content_id: args.contentId,
    content_hash: args.contentHash,
    source_url: args.sourceUrl,
    // Shared assets piggy-back on the original's optimisation, so mark complete
    // to keep them out of the optimisation queue.
    processing_status: "completed",
  });
}

/**
 * Download an external image and upload it to Supabase Storage.
 * Returns the public CDN URL on success, or null on any failure.
 *
 * Dedup behavior:
 *  - If a media_assets row already exists with the same source_url, skip the
 *    download entirely and reuse that storage object.
 *  - After download, hash the bytes; if a media_assets row exists with the same
 *    content_hash, skip the upload and reuse that storage object.
 *  - Otherwise upload as a new file and record content_hash + source_url.
 */
export async function fetchAndStoreImage(
  supabase: any,
  sourceImageUrl: string,
  category: string,
  contentId: string
): Promise<string | null> {
  if (!sourceImageUrl) return null;

  try {
    const parsed = new URL(sourceImageUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;

    const mediaContentType = CONTENT_TYPE_MAP[category] || category;

    // Guard against re-running on the same record.
    const { data: existing } = await supabase
      .from("media_assets")
      .select("file_path")
      .eq("content_type", mediaContentType)
      .eq("content_id", contentId)
      .maybeSingle();
    if (existing?.file_path) {
      return cdnUrlFor(existing.file_path);
    }

    // ── Dedup pass 1: same source URL already downloaded for someone else? ──
    const { data: bySource } = await supabase
      .from("media_assets")
      .select("file_path, mime_type, file_size, content_hash")
      .eq("source_url", sourceImageUrl)
      .limit(1)
      .maybeSingle();

    if (bySource?.file_path) {
      await insertSharedAssetRow(supabase, {
        filePath: bySource.file_path,
        mimeType: bySource.mime_type,
        fileSize: bySource.file_size,
        contentType: mediaContentType,
        contentId,
        contentHash: bySource.content_hash ?? null,
        sourceUrl: sourceImageUrl,
      });
      console.log(`♻️  Reused storage (URL match) for ${contentId}: ${bySource.file_path}`);
      return cdnUrlFor(bySource.file_path);
    }

    // ── Otherwise download ───────────────────────────────────────────────────
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

    // ── Dedup pass 2: same byte content already stored under a different URL? ──
    const contentHash = await sha256Hex(buffer);
    const { data: byHash } = await supabase
      .from("media_assets")
      .select("file_path, mime_type, file_size")
      .eq("content_hash", contentHash)
      .limit(1)
      .maybeSingle();

    if (byHash?.file_path) {
      await insertSharedAssetRow(supabase, {
        filePath: byHash.file_path,
        mimeType: byHash.mime_type,
        fileSize: byHash.file_size,
        contentType: mediaContentType,
        contentId,
        contentHash,
        sourceUrl: sourceImageUrl,
      });
      console.log(`♻️  Reused storage (hash match) for ${contentId}: ${byHash.file_path}`);
      return cdnUrlFor(byHash.file_path);
    }

    // ── New upload ───────────────────────────────────────────────────────────
    const ext = EXT_MAP[contentType] || "jpg";
    const filePath = `${mediaContentType}s/${contentId}/hero.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(filePath, buffer, { contentType, upsert: true });

    if (uploadError) {
      console.error(`❌ Storage upload failed for ${contentId}:`, uploadError.message);
      return null;
    }

    const cdnUrl = cdnUrlFor(filePath);

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
        content_hash: contentHash,
        source_url: sourceImageUrl,
        processing_status: "pending",
      })
      .select("id")
      .single();

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
