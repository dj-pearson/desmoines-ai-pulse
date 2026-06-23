import { BRAND } from "@/lib/brandConfig";

/**
 * URL of the dynamic branded OG-image card for an entity (WEB-FEAT-008), served
 * by the `og-image` edge function. Falls back to the static default when the id
 * is missing. The function itself redirects to the default on any render error,
 * so this URL is always safe to use as og:image / twitter:image.
 */
export type OgEntityType = "event" | "restaurant" | "attraction" | "article";

export function ogImageUrl(type: OgEntityType, id?: string | null): string {
  const fallback = `${BRAND.baseUrl}${BRAND.ogImage}`;
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!id || !base) return fallback;
  return `${base}/functions/v1/og-image/${type}/${id}`;
}
