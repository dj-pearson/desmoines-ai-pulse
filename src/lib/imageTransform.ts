/**
 * Centralized helpers for building right-sized image URLs and srcsets that route
 * through the `image-transform` edge function (?url=&width=&quality=&format=).
 *
 * Used by OptimizedImage and by the raw <img> hero/dialog surfaces so that list
 * cards and detail heroes fetch appropriately-sized images instead of the full
 * original. Every consumer keeps the ORIGINAL url as the plain `src`/fallback so
 * a failed transform degrades to the untouched image, never a broken one
 * (see WEB-PERF-004).
 */

// Default responsive breakpoints for srcset generation
export const DEFAULT_IMAGE_WIDTHS = [320, 640, 768, 1024, 1280, 1536, 1920] as const;

// Card-sized breakpoints: list cards render at most ~640 CSS px (1 col mobile,
// up to 3 cols desktop) — include 2x DPR variants, cap well below full size.
export const CARD_IMAGE_WIDTHS = [320, 480, 640, 960, 1280] as const;

// Hero/detail breakpoints: full-bleed up to viewport width, include 2x.
export const HERO_IMAGE_WIDTHS = [640, 960, 1280, 1600, 1920] as const;

export interface ImageTransformOptions {
  width?: number;
  quality?: number;
  format?: string;
}

/**
 * True when `src` is a remote http(s) URL we can safely route through the proxy.
 * Skips data:/blob: URIs and same-origin/relative local assets (already optimal).
 */
export function isTransformableImage(src?: string | null): boolean {
  if (!src) return false;
  if (/^(data:|blob:)/i.test(src)) return false;
  if (src.startsWith("/") || src.startsWith("#")) return false;
  return /^https?:\/\//i.test(src);
}

/**
 * Build a transformed image URL via the image-transform edge function.
 * Falls back to the original `src` when transformation isn't applicable or the
 * Supabase base URL is unavailable (e.g. SSR/test contexts).
 */
export function getTransformedImageUrl(
  src: string,
  options: ImageTransformOptions = {}
): string {
  if (!isTransformableImage(src)) return src;

  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return src;

  const { width, quality, format } = options;

  try {
    const proxy = new URL(`${base}/functions/v1/image-transform`);
    proxy.searchParams.set("url", src);
    if (width) proxy.searchParams.set("width", String(width));
    if (quality) proxy.searchParams.set("quality", String(quality));
    if (format) proxy.searchParams.set("format", format);
    return proxy.toString();
  } catch {
    return src;
  }
}

/**
 * Build a width-descriptor srcset string of transformed URLs.
 * Returns undefined when the source can't be transformed so the caller renders
 * the plain original `src` with no srcset.
 */
export function buildTransformedSrcSet(
  src: string,
  widths: readonly number[],
  options: Omit<ImageTransformOptions, "width"> = {}
): string | undefined {
  if (!isTransformableImage(src)) return undefined;
  return widths
    .map((w) => `${getTransformedImageUrl(src, { ...options, width: w })} ${w}w`)
    .join(", ");
}
