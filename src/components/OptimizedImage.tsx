import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ImageOff } from "lucide-react";
import {
  DEFAULT_IMAGE_WIDTHS,
  buildTransformedSrcSet,
} from "@/lib/imageTransform";

// Default responsive breakpoints for srcset generation
const DEFAULT_WIDTHS = [...DEFAULT_IMAGE_WIDTHS];

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
 * Generate srcset with transformed URLs (routes through the image-transform
 * edge function so the browser fetches an appropriately-sized image).
 */
function generateTransformedSrcSet(
  src: string,
  widths: number[],
  format?: string,
  quality?: number
): string | undefined {
  return buildTransformedSrcSet(src, widths, { format, quality });
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
  // When a transformed srcset candidate fails to load, drop the srcset and
  // retry the untouched original `src` before giving up to the placeholder —
  // a failed transform must degrade to the original URL, never a broken image.
  const [transformFailed, setTransformFailed] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect format support
  const webpSupported = useMemo(() => enableWebP && supportsWebP(), [enableWebP]);
  const avifSupported = useMemo(() => enableAVIF && supportsAVIF(), [enableAVIF]);

  // Generate srcset if not provided. Suppressed once a transform has failed so
  // the browser falls back to the plain original `src`.
  const computedSrcSet = useMemo(() => {
    if (transformFailed) return undefined;
    if (srcSet) return srcSet;
    if (!useTransformApi) return undefined;

    // Determine format based on browser support
    const format = avifSupported ? "avif" : webpSupported ? "webp" : undefined;
    return generateTransformedSrcSet(src, transformWidths, format, quality);
  }, [src, srcSet, useTransformApi, transformWidths, avifSupported, webpSupported, quality, transformFailed]);

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
    // First failure with an active transform: drop the srcset/picture sources
    // and retry the original URL. Only escalate to the error placeholder if the
    // untouched original also fails.
    if ((useTransformApi || srcSet) && !transformFailed) {
      setTransformFailed(true);
      setIsLoaded(false);
      return;
    }
    setError(true);
    setIsLoaded(false);
    onError?.();
  }, [onError, useTransformApi, srcSet, transformFailed]);

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
    if (!useTransformApi || error || transformFailed) return null;

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