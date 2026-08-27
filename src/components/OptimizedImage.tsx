import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ImageOff } from "lucide-react";

// Default responsive breakpoints for srcset generation
const DEFAULT_WIDTHS = [320, 640, 768, 1024, 1280, 1536, 1920];

// Supabase storage URL pattern for transformation
const SUPABASE_STORAGE_PATTERN = /supabase\.co\/storage\/v1\/object\/public/;

// Supabase serves originals from /object/public/ and RESIZED renditions from
// /render/image/public/. The two are not interchangeable: sizing params on an
// /object/public/ URL are ignored, not honoured.
const STORAGE_OBJECT_PATH = "/storage/v1/object/public/";
const STORAGE_RENDER_PATH = "/storage/v1/render/image/public/";

export interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  quality?: number;
  sizes?: string;
  placeholder?: "blur" | "empty" | "color";
  blurDataURL?: string;
  placeholderColor?: string;
  fallbackSrc?: string;
  objectFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  objectPosition?: string;
  aspectRatio?: string;
  srcSet?: string;
  enableWebP?: boolean;
  enableAVIF?: boolean;
  useTransformApi?: boolean;
  /**
   * Emit a transform-based srcset + sizes so the browser fetches a right-sized
   * image (WEB-PERF-004). On by default; the plain <img src> stays the original
   * URL so a failed transform falls back safely. Set false to opt out.
   */
  responsive?: boolean;
  transformWidths?: number[];
  onLoad?: () => void;
  onError?: () => void;
  fetchPriority?: "high" | "low" | "auto";
}

/**
 * Check if browser supports WebP format
 */
function supportsWebP(): boolean {
  if (typeof window === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

/**
 * Check if browser supports AVIF format
 */
function supportsAVIF(): boolean {
  if (typeof window === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/avif").startsWith("data:image/avif");
}

/**
 * Generate srcset for responsive images
 */
function generateSrcSet(src: string, widths: number[]): string {
  return widths.map((w) => `${src} ${w}w`).join(", ");
}

/**
 * Is this a URL on our OWN /media/ route (functions/media/[[path]].ts)?
 *
 * WHY THE ORIGIN CHECK IS NOT OPTIONAL. `/media/` is an ordinary path segment
 * and plenty of sites use it, so matching the path alone would call an external
 * `https://example.com/media/photo.jpg` transformable. That does not produce a
 * broken image — it produces a srcset of seven identical URLs under seven
 * different `w` descriptors, which the comment on generateTransformedSrcSet
 * below explains is WORSE than emitting none: the browser believes it has a
 * choice of sizes and confidently downloads the full-size original.
 *
 * A relative `/media/...` is unambiguously ours. An absolute one has to match
 * the origin we are being served from, which is exactly what MEDIA_CDN_BASE is
 * set to — so this needs no new env var and cannot drift away from one.
 */
function isOwnMediaRoute(src: string): boolean {
  if (src.startsWith("/media/")) return true;
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(src, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/media/");
  } catch {
    return false;
  }
}

/**
 * Can this URL be server-side resized? Two kinds can (WEB-PERF-004): a Supabase
 * Storage public object, and our own /media/ route, which forwards width,
 * quality and format on to Supabase's render endpoint for exactly this reason.
 * Everything else has to serve at its original size.
 *
 * THE SECOND CASE IS NOT COSMETIC. repoint-media-urls.ts moved 674 rows onto
 * /media/ URLs, and until this function recognised them every one of those
 * images served its full-size original again — the same bytes WEB-PERF-004 was
 * written to stop, reached by a different road. The route half and this half
 * only work together: teaching the route to resize while this still returns
 * false changes nothing, because nothing would ever ask it to.
 */
export function canTransform(src: string): boolean {
  if (typeof src !== "string") return false;
  return SUPABASE_STORAGE_PATTERN.test(src) || isOwnMediaRoute(src);
}

/**
 * Resized/reformatted URL for a Supabase Storage object; the input unchanged for
 * anything else.
 *
 * Both branches used to be wrong, and both were wrong in the same silent way —
 * they returned a URL that looked transformed and served the original bytes.
 * Measured against the live host on 2026-08-11 with a real object
 * (media/events/…/hero.png):
 *
 *   /object/public/…/hero.png                          200  image/png   1,011,030 B
 *   /object/public/…/hero.png?width=320                200  image/png   1,011,030 B  ← old storage branch
 *   /render/image/public/…?width=320&format=webp&q=80  200  image/webp     99,062 B  ← this
 *
 * Sizing params on /object/public/ are ignored, so every srcset candidate was
 * the same full-size PNG under a different `w` descriptor: the browser picked
 * the "smallest" one and downloaded a megabyte. 10.2x, on every storage image
 * on the site.
 *
 * External URLs used to be routed through /functions/v1/image-transform. That
 * function does not resize — its resize block is commented out at
 * image-transform/index.ts:219-222 — so the proxy added a hop and a cache tier
 * for zero bytes saved (WEB-PERF-021). They now pass through untouched.
 */
export function getTransformedUrl(
  src: string,
  options: { width?: number; format?: string; quality?: number }
): string {
  if (!canTransform(src)) return src;

  const { width, format, quality } = options;

  // Our own /media/ route needs no path surgery: it decides between
  // /object/public/ and /render/image/public/ from these very params, so all it
  // wants is the params. Doing the Supabase replace here as well would be a
  // no-op on the string and a lie in the reading.
  const ownRoute = isOwnMediaRoute(src);
  const base = ownRoute ? src : src.replace(STORAGE_OBJECT_PATH, STORAGE_RENDER_PATH);

  // A relative src has no origin to parse, and only our own route produces one.
  const url = new URL(base, typeof window === "undefined" ? "http://local" : window.location.origin);
  if (width) url.searchParams.set("width", String(width));
  if (format) url.searchParams.set("format", format);
  if (quality) url.searchParams.set("quality", String(quality));
  return src.startsWith("/") ? `${url.pathname}${url.search}` : url.toString();
}

/**
 * srcset of transformed URLs, or undefined when the source cannot be resized.
 *
 * Returning undefined matters. Emitting the same URL seven times under seven
 * different `w` descriptors is worse than emitting no srcset at all: it tells
 * the browser it has a choice of sizes, so it confidently picks a candidate and
 * downloads the full-size original, and any bandwidth heuristic it applies is
 * working from false widths.
 */
export function generateTransformedSrcSet(
  src: string,
  widths: number[],
  format?: string,
  quality?: number
): string | undefined {
  if (!canTransform(src)) return undefined;
  return widths
    .map((w) => `${getTransformedUrl(src, { width: w, format, quality })} ${w}w`)
    .join(", ");
}

/**
 * Enhanced OptimizedImage component with:
 * - Lazy loading via Intersection Observer
 * - Responsive srcset generation
 * - WebP/AVIF format support with picture element
 * - Blur/color placeholder support
 * - Error fallback handling
 * - Image transformation API integration
 */
export default function OptimizedImage({
  src,
  alt,
  className,
  containerClassName,
  width,
  height,
  priority = false,
  quality = 80,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  placeholder = "empty",
  blurDataURL,
  placeholderColor = "#e5e7eb",
  fallbackSrc = "/placeholder.svg",
  objectFit = "cover",
  objectPosition = "center",
  aspectRatio,
  srcSet,
  enableWebP = true,
  enableAVIF = false,
  useTransformApi = false,
  responsive = true,
  transformWidths = DEFAULT_WIDTHS,
  onLoad,
  onError,
  fetchPriority = "auto",
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect format support
  const webpSupported = useMemo(() => enableWebP && supportsWebP(), [enableWebP]);
  const avifSupported = useMemo(() => enableAVIF && supportsAVIF(), [enableAVIF]);

  // Generate srcset if not provided. Enabled by default (responsive) so cards
  // fetch card-sized images; the <img src> below stays the original URL, so if
  // the transform endpoint is unavailable the browser falls back to it
  // (WEB-PERF-004).
  const computedSrcSet = useMemo(() => {
    if (srcSet) return srcSet;
    if (!responsive && !useTransformApi) return undefined;

    // Determine format based on browser support
    const format = avifSupported ? "avif" : webpSupported ? "webp" : undefined;
    return generateTransformedSrcSet(src, transformWidths, format, quality);
  }, [src, srcSet, responsive, useTransformApi, transformWidths, avifSupported, webpSupported, quality]);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || isInView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "100px", // Load images 100px before they enter viewport
        threshold: 0.01,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [priority, isInView]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    setError(false);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setError(true);
    setIsLoaded(false);
    onError?.();
  }, [onError]);

  // Determine the image source (fallback to placeholder on error)
  const imageSrc = error && fallbackSrc ? fallbackSrc : src;

  // Calculate aspect ratio style
  const aspectRatioStyle = useMemo(() => {
    if (aspectRatio) return aspectRatio;
    if (width && height) return `${width}/${height}`;
    return undefined;
  }, [aspectRatio, width, height]);

  // Generate picture element sources for modern formats
  const renderPictureSources = () => {
    if (!useTransformApi || error) return null;
    // A <source> with no srcSet is inert at best; for a URL we cannot resize
    // there is nothing to offer, so let the <img> below serve the original.
    if (!canTransform(src)) return null;

    const sources = [];

    // AVIF source (highest priority - smallest file size)
    if (enableAVIF) {
      sources.push(
        <source
          key="avif"
          type="image/avif"
          srcSet={generateTransformedSrcSet(src, transformWidths, "avif", quality)}
          sizes={sizes}
        />
      );
    }

    // WebP source
    if (enableWebP) {
      sources.push(
        <source
          key="webp"
          type="image/webp"
          srcSet={generateTransformedSrcSet(src, transformWidths, "webp", quality)}
          sizes={sizes}
        />
      );
    }

    return sources;
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", containerClassName)}
      style={{ aspectRatio: aspectRatioStyle }}
    >
      {/* Placeholder */}
      {!isLoaded && !error && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-300",
            placeholder === "blur" && blurDataURL
              ? "bg-cover bg-center"
              : placeholder === "color"
              ? ""
              : "bg-muted animate-pulse"
          )}
          style={{
            backgroundImage:
              placeholder === "blur" && blurDataURL ? `url(${blurDataURL})` : undefined,
            backgroundColor: placeholder === "color" ? placeholderColor : undefined,
            filter: placeholder === "blur" ? "blur(20px)" : undefined,
            transform: placeholder === "blur" ? "scale(1.1)" : undefined,
          }}
          aria-hidden="true"
        />
      )}

      {/* Error fallback */}
      {error && !fallbackSrc && (
        <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center gap-2">
          <ImageOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground text-sm">Image unavailable</span>
        </div>
      )}

      {/* Actual image with picture element for format support */}
      {(isInView || priority) && (
        <picture>
          {renderPictureSources()}
          <img
            src={imageSrc}
            alt={alt}
            width={width}
            height={height}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : fetchPriority}
            onLoad={handleLoad}
            onError={handleError}
            srcSet={computedSrcSet}
            sizes={sizes}
            className={cn(
              "w-full h-full transition-opacity duration-300",
              isLoaded ? "opacity-100" : "opacity-0",
              className
            )}
            style={{
              objectFit,
              objectPosition,
            }}
          />
        </picture>
      )}
    </div>
  );
}

// Named export for consistency
export { OptimizedImage };