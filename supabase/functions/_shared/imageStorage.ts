/**
 * Shared image fetch + Supabase Storage upload utility.
 * Used by ai-crawler (new crawls) and backfill-images (existing records).
 */

import { validateURLForSSRF } from "./validation.ts";

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Minimum width/height (px) for a stored image. Below this a candidate is almost
 * certainly a tracking pixel, favicon, badge, or logo rather than real listing
 * art — storing it counts a record as "has image" while showing junk. The HTML
 * extractor already drops `<img>` smaller than this when the size is declared
 * inline, but most responsive images don't declare it, so we re-check the
 * decoded header bytes here (covers ai-crawler / Places / og:image too).
 */
export const MIN_IMAGE_DIMENSION = 100;

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
 * Best-effort image dimension reader from the decoded header bytes. Supports
 * JPEG, PNG, GIF, and WebP (VP8/VP8L/VP8X). Returns null when the format is
 * unknown or the header is incomplete — callers should treat null as "unknown"
 * and NOT reject, so we never drop a valid image we simply couldn't measure.
 */
export function imageDimensions(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A, then IHDR with 32-bit BE width/height.
  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52
  ) {
    const width = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
    const height = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  // GIF: "GIF8", then little-endian 16-bit width/height.
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    const width = b[6] | (b[7] << 8);
    const height = b[8] | (b[9] << 8);
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  // WebP: "RIFF"...."WEBP" + a VP8/VP8L/VP8X chunk.
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fourcc === "VP8X" && b.length >= 30) {
      const width = 1 + ((b[24]) | (b[25] << 8) | (b[26] << 16));
      const height = 1 + ((b[27]) | (b[28] << 8) | (b[29] << 16));
      return { width, height };
    }
    if (fourcc === "VP8 " && b.length >= 30) {
      // Lossy: 14-bit dimensions at offset 26/28.
      const width = ((b[26] | (b[27] << 8)) & 0x3fff);
      const height = ((b[28] | (b[29] << 8)) & 0x3fff);
      if (width > 0 && height > 0) return { width, height };
    }
    if (fourcc === "VP8L" && b.length >= 25 && b[20] === 0x2f) {
      // Lossless: 14-bit width-1 / height-1 packed after the 0x2f signature.
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return { width, height };
    }
    return null;
  }

  // JPEG: FF D8, then scan segments for a Start-Of-Frame marker.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      // SOF0..SOF15, excluding DHT(C4), JPG(C8), DAC(CC).
      if (
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      ) {
        const height = (b[i + 5] << 8) | b[i + 6];
        const width = (b[i + 7] << 8) | b[i + 8];
        if (width > 0 && height > 0) return { width, height };
        return null;
      }
      const len = (b[i + 2] << 8) | b[i + 3];
      if (len <= 0) return null;
      i += 2 + len;
    }
    return null;
  }

  return null;
}

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
/**
 * The public URL written into events.image_url and the other content tables.
 *
 * WEB-OPS-023. This used to return the supabase.co storage URL unconditionally,
 * which meant every card image on every page view was billed as SUPABASE
 * EGRESS - once per viewer, forever, for an object that was downloaded once.
 * public/_headers' immutable cache rules did not help: they apply to files
 * Cloudflare Pages serves out of dist/, not to a URL on another origin.
 *
 * With MEDIA_CDN_BASE set, this emits our own domain instead and
 * functions/media/[[path]].ts serves the bytes through the Cloudflare edge
 * cache. The first request per object still costs Supabase egress; nothing
 * after it does.
 *
 * UNSET IS THE OLD BEHAVIOUR, on purpose. This is a value that goes into a
 * column all three clients read, so the switch is an environment variable
 * somebody sets deliberately rather than a deploy that silently changes what
 * gets written. Rows written before the switch keep their supabase.co URLs and
 * keep resolving; scripts/repoint-media-urls.ts moves them when you are ready.
 */
function cdnUrlFor(filePath: string): string {
  const cdnBase = Deno.env.get("MEDIA_CDN_BASE");
  if (cdnBase) return `${cdnBase.replace(/\/+$/, "")}/media/${filePath}`;
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
    // SSRF guard: image URLs come from scraped pages / DB rows (attacker-
    // influenceable), so block private/internal addresses and non-web schemes
    // before we ever fetch them.
    const ssrf = validateURLForSSRF(sourceImageUrl, {
      allowedProtocols: ["http:", "https:"],
      blockPrivateIPs: true,
    });
    if (!ssrf.valid) {
      console.warn(`⚠️ Refusing unsafe image URL (${ssrf.error}): ${sourceImageUrl}`);
      return null;
    }

    const mediaContentType = CONTENT_TYPE_MAP[category] || category;

    // Guard against re-running on the same record.
    //
    // This and the two dedup passes below are IDEMPOTENCY reads: a dropped
    // error reads as "not stored yet" and the image is downloaded and written
    // again. The cost is duplicate bytes and a duplicate media_assets row, not
    // a wrong result, so they stay best-effort - but they are logged, because a
    // media_assets table that has gone unreadable turns every hero image into a
    // fresh download and nothing would have said so (WEB-BE-032 AC3).
    const { data: existing, error: existingError } = await supabase
      .from("media_assets")
      .select("file_path")
      .eq("content_type", mediaContentType)
      .eq("content_id", contentId)
      .maybeSingle();
    if (existingError) {
      console.warn(`[imageStorage] re-run guard read failed for ${contentId}: ${existingError.message}`);
    }
    if (existing?.file_path) {
      return cdnUrlFor(existing.file_path);
    }

    // ── Dedup pass 1: same source URL already downloaded for someone else? ──
    const { data: bySource, error: bySourceError } = await supabase
      .from("media_assets")
      .select("file_path, mime_type, file_size, content_hash")
      .eq("source_url", sourceImageUrl)
      .limit(1)
      .maybeSingle();
    if (bySourceError) {
      console.warn(`[imageStorage] source-url dedup read failed: ${bySourceError.message}`);
    }

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

    // ── Reject tiny images (tracking pixels / icons / logos) ──────────────────
    // Only reject when dimensions parse with confidence; unknown formats pass.
    const dims = imageDimensions(new Uint8Array(buffer));
    if (dims && (dims.width < MIN_IMAGE_DIMENSION || dims.height < MIN_IMAGE_DIMENSION)) {
      console.warn(
        `⚠️ Skipping tiny image (${dims.width}x${dims.height}, likely pixel/icon/logo): ${sourceImageUrl}`,
      );
      return null;
    }

    // ── Dedup pass 2: same byte content already stored under a different URL? ──
    const contentHash = await sha256Hex(buffer);
    const { data: byHash, error: byHashError } = await supabase
      .from("media_assets")
      .select("file_path, mime_type, file_size")
      .eq("content_hash", contentHash)
      .limit(1)
      .maybeSingle();
    if (byHashError) {
      console.warn(`[imageStorage] content-hash dedup read failed: ${byHashError.message}`);
    }

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

    const { data: insertedAsset, error: insertedAssetError } = await supabase
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
    // WEB-BE-032, and this one LEAKS STORAGE. The bytes are already uploaded by
    // the time this runs. A dropped error left the file in the bucket with no
    // media_assets row pointing at it: invisible to every consumer, and invisible
    // to scripts/reclaim-venue-images.ts too, which finds files THROUGH
    // media_assets and so can never reclaim an orphan. Logged with the path,
    // because that log is the only record anyone would have of it.
    if (insertedAssetError) {
      console.error(
        `[imageStorage] ORPHANED FILE: uploaded ${filePath} but the media_assets ` +
          `insert failed, so nothing references it: ${insertedAssetError.message}`,
      );
    }

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
