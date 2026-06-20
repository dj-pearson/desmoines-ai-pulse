import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ImageOff } from "lucide-react";

// Default responsive breakpoints for srcset generation
const DEFAULT_WIDTHS = [320, 640, 768, 1024, 1280, 1536, 1920];

// Supabase storage URL pattern for transformation
const SUPABASE_STORAGE_PATTERN = /supabase\.co\/storage\/v1\/object\/public/;

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
 * Whether a URL can be server-side resized/format-converted.
 *
 * Only Supabase Storage URLs qualify: they go through the native
 * `/render/image/public/` transformation endpoint, which genuinely resizes and
 * re-encodes. The `image-transform` edge function does NOT resize (it proxies
 * the original bytes), so routing external URLs through it would add a network
 * hop for zero byte savings and risk mismatched `<picture>` source types.
 * External URLs therefore opt out of transforms and serve as-is.
 */
function canTransform(src: string): boolean {
  return SUPABASE_STORAGE_PATTERN.test(src);
}

/**
 * Get transformed image URL via Supabase's native image-transformation endpoint.
 * Callers must gate on canTransform(src); for non-transformable URLs this
 * returns the original src unchanged.
 *
 * Requires image transformation enabled on the Supabase project. If it isn't,
 * the request 400s and OptimizedImage's two-stage fallback re-loads the
 * original URL — so this is always safe to attempt.
 */
function getTransformedUrl(
  src: string,
  options: { width?: number; format?: string; quality?: number }
): string {
  if (!canTransform(src)) return src;

  const { width, format, quality } = options;
  const url = new URL(
    src.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/")
  );
  if (width) url.searchParams.set("width", String(width));
  if (format) url.searchParams.set("format", format);
  if (quality) url.searchParams.set("quality", String(quality));
  return url.toString();
}

/**
 * Generate srcset with transformed URLs
 */
function generateTransformedSrcSet(
  src: string,
  widths: number[],
  format?: string,
  quality?: number
): string {
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
  transformWidths = DEFAULT_WIDTHS,
  onLoad,
  onError,
  fetchPriority = "auto",
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);
  // Two-stage fallback: if a transformed source (srcset via the transform API)
  // fails to load, retry once with the original untransformed `src` (no srcset)
  // before giving up and showing the placeholder. This makes enabling
  // useTransformApi safe — a project without image transformation enabled
  // simply serves the original image instead of a broken one.
  const [transformFailed, setTransformFailed] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect format support
  const webpSupported = useMemo(() => enableWebP && supportsWebP(), [enableWebP]);
  const avifSupported = useMemo(() => enableAVIF && supportsAVIF(), [enableAVIF]);

  // Only storage-hosted images can be server-side resized; external URLs serve
  // as-is (see canTransform).
  const transformable = useTransformApi && canTransform(src);

  // Generate srcset if not provided. Once a transform has failed we drop the
  // transformed srcset entirely and let the bare `src` (original URL) load.
  const computedSrcSet = useMemo(() => {
    if (transformFailed) return srcSet ?? undefined;
    if (srcSet) return srcSet;
    if (!transformable) return undefined;

    // Determine format based on browser support
    const format = avifSupported ? "avif" : webpSupported ? "webp" : undefined;
    return generateTransformedSrcSet(src, transformWidths, format, quality);
  }, [src, srcSet, transformable, transformWidths, avifSupported, webpSupported, quality, transformFailed]);

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
    // Stage 1: a transformed source failed → retry with the original URL.
    if (transformable && !srcSet && !transformFailed) {
      setTransformFailed(true);
      return;
    }
    // Stage 2: the original URL also failed → surface the fallback/placeholder.
    setError(true);
    setIsLoaded(false);
    onError?.();
  }, [onError, transformable, srcSet, transformFailed]);

  // Determine the image source. On a transform failure we serve the original
  // `src`; only after that also fails do we fall back to the placeholder.
  const imageSrc = error && fallbackSrc ? fallbackSrc : src;

  // Calculate aspect ratio style
  const aspectRatioStyle = useMemo(() => {
    if (aspectRatio) return aspectRatio;
    if (width && height) return `${width}/${height}`;
    return undefined;
  }, [aspectRatio, width, height]);

  // Generate picture element sources for modern formats
  const renderPictureSources = () => {
    // Drop modern-format <source>s once a transform has failed so the browser
    // doesn't keep retrying the (broken) transform endpoint.
    if (!transformable || error || transformFailed) return null;

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

// Pure helpers exported for unit testing (WEB-PERF-004).
export { canTransform, getTransformedUrl };