/**
 * SECURITY: verify_jwt = false
 * Reason: Public image proxy that must serve transformed images to all visitors including unauthenticated users
 * Alternative measures: SSRF protection via URL validation, output format restricted to whitelist, dimension limits enforced
 * Risk level: MEDIUM
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateURLForSSRF } from "../_shared/validation.ts";

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Supported output formats
const SUPPORTED_FORMATS = ["jpeg", "jpg", "png", "webp", "avif"];

// Default quality settings per format
const DEFAULT_QUALITY: Record<string, number> = {
  jpeg: 85,
  jpg: 85,
  png: 100, // PNG is lossless
  webp: 80,
  avif: 70,
};

// Maximum dimensions to prevent abuse
const MAX_WIDTH = 3840;
const MAX_HEIGHT = 2160;

// Cache duration in seconds (1 week)
const CACHE_DURATION = 604800;

interface TransformOptions {
  url: string;
  width?: number;
  height?: number;
  quality?: number;
  format?: string;
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  position?: string;
  blur?: number;
  sharpen?: boolean;
  grayscale?: boolean;
}

/**
 * Parse transformation options from URL query parameters
 */
function parseOptions(searchParams: URLSearchParams): TransformOptions {
  const url = searchParams.get("url");

  if (!url) {
    throw new Error("Missing required 'url' parameter");
  }

  // SSRF Protection: Validate URL before processing
  const validation = validateURLForSSRF(url, {
    allowedProtocols: ['https:', 'http:'],
    blockPrivateIPs: true,
  });

  if (!validation.valid) {
    throw new Error(validation.error || "URL validation failed");
  }

  const width = searchParams.get("width")
    ? Math.min(parseInt(searchParams.get("width")!, 10), MAX_WIDTH)
    : undefined;

  const height = searchParams.get("height")
    ? Math.min(parseInt(searchParams.get("height")!, 10), MAX_HEIGHT)
    : undefined;

  const format = searchParams.get("format")?.toLowerCase();
  if (format && !SUPPORTED_FORMATS.includes(format)) {
    throw new Error(
      `Unsupported format: ${format}. Supported formats: ${SUPPORTED_FORMATS.join(", ")}`
    );
  }

  const quality = searchParams.get("quality")
    ? Math.min(Math.max(parseInt(searchParams.get("quality")!, 10), 1), 100)
    : undefined;

  const fit = searchParams.get("fit") as TransformOptions["fit"];
  const position = searchParams.get("position") || undefined;

  const blur = searchParams.get("blur")
    ? Math.min(Math.max(parseInt(searchParams.get("blur")!, 10), 0), 100)
    : undefined;

  const sharpen = searchParams.get("sharpen") === "true";
  const grayscale = searchParams.get("grayscale") === "true";

  return {
    url,
    width,
    height,
    quality,
    format,
    fit,
    position,
    blur,
    sharpen,
    grayscale,
  };
}

/**
 * Generate a cache key for the transformation
 */
function generateCacheKey(options: TransformOptions): string {
  const parts = [
    options.url,
    options.width ? `w${options.width}` : "",
    options.height ? `h${options.height}` : "",
    options.format ? `f${options.format}` : "",
    options.quality ? `q${options.quality}` : "",
    options.fit ? `fit${options.fit}` : "",
    options.blur ? `blur${options.blur}` : "",
    options.sharpen ? "sharpen" : "",
    options.grayscale ? "gray" : "",
  ].filter(Boolean);

  return parts.join("_");
}

/**
 * Determine content type for the output format
 */
function getContentType(format: string): string {
  const contentTypes: Record<string, string> = {
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
  };
  return contentTypes[format] || "image/jpeg";
}

/**
 * Fetch and transform the image
 * Note: In a production environment, you would use a proper image processing
 * library like Sharp (in Node.js) or an image CDN service.
 *
 * This basic implementation proxies images and adds caching headers.
 * For full transformation support, consider:
 * - Cloudflare Image Resizing
 * - Imgix
 * - Cloudinary
 * - Using a separate worker with image processing capabilities
 */
async function fetchAndTransformImage(
  options: TransformOptions
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const { url, format, width, height } = options;

  // Fetch the original image
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "image/*",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  const originalContentType = response.headers.get("content-type") || "image/jpeg";
  const buffer = await response.arrayBuffer();

  // Determine output format
  let outputFormat = format;
  if (!outputFormat) {
    // Infer from original content type
    if (originalContentType.includes("png")) {
      outputFormat = "png";
    } else if (originalContentType.includes("webp")) {
      outputFormat = "webp";
    } else if (originalContentType.includes("avif")) {
      outputFormat = "avif";
    } else {
      outputFormat = "jpeg";
    }
  }

  // For now, return the original image with appropriate headers
  // In production, you would process the image here using Sharp or similar
  //
  // Example with Sharp (if available):
  // const sharp = await import('sharp');
  // let image = sharp(buffer);
  // if (width || height) {
  //   image = image.resize(width, height, { fit: options.fit || 'cover' });
  // }
  // if (options.blur) {
  //   image = image.blur(options.blur);
  // }
  // if (options.grayscale) {
  //   image = image.grayscale();
  // }
  // const output = await image.toFormat(outputFormat, { quality: options.quality }).toBuffer();

  return {
    buffer,
    contentType: getContentType(outputFormat),
  };
}

/**
 * Main handler for image transformation requests
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow GET requests
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const options = parseOptions(url.searchParams);
    const cacheKey = generateCacheKey(options);

    // Check for conditional requests (ETag/If-None-Match)
    const ifNoneMatch = req.headers.get("If-None-Match");
    const etag = `"${cacheKey}"`;

    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: corsHeaders,
      });
    }

    // Fetch and transform the image
    const { buffer, contentType } = await fetchAndTransformImage(options);

    // Return the transformed image with appropriate caching headers
    return new Response(buffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": `public, max-age=${CACHE_DURATION}, immutable`,
        ETag: etag,
        "X-Cache-Key": cacheKey,
        "Vary": "Accept",
      },
    });
  } catch (error) {
    console.error("Image transform error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: error instanceof Error && error.message.includes("Missing")
        ? 400
        : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
