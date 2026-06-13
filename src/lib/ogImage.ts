/**
 * Builds the URL of the dynamic OG-image edge function (WEB-FEAT-008) that
 * renders a branded 1200x630 social-share card for a content item.
 *
 * Detail pages point their og:image / twitter:image meta at this URL. The edge
 * function falls back internally (to the item's own image, then the static brand
 * image) on any failure, so pointing meta at it is always safe.
 */

export type OgImageType = "event" | "restaurant" | "attraction" | "article";

/**
 * Returns the dynamic OG-image URL for a content item, or `undefined` when it
 * can't be built (no id, or the Supabase base URL is unavailable in this
 * context — e.g. SSR/test) so callers fall back to their existing static image.
 */
export function getOgImageUrl(
  type: OgImageType,
  id?: string | null,
): string | undefined {
  if (!id) return undefined;
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return undefined;
  try {
    const u = new URL(
      `${base}/functions/v1/og-image/${type}/${encodeURIComponent(id)}`,
    );
    return u.toString();
  } catch {
    return undefined;
  }
}
