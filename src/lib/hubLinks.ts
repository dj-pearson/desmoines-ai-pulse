/**
 * Where a /things-to-do hub card should point (SEO-012).
 *
 * The hub linked about forty /things-to-do/* paths and four of them were
 * published pSEO pages. The rest render a 404 in the browser and, at the
 * edge, the shell at 200 with a self-canonical - so the site's "things to do"
 * hub spent most of its links on pages that do not exist. A card now points at
 * its pSEO page when that page is published, at the real page that answers the
 * same intent when it is not, and is left out when neither exists.
 */
export interface HubFallback {
  href: string;
  /** Replaces the card's pSEO-flavoured blurb, which describes a page that is not there. */
  description?: string;
}

export interface ResolvedHubLink {
  href: string;
  description?: string;
  published: boolean;
}

export function resolveHubLink(
  pseoPath: string,
  published: ReadonlySet<string>,
  fallback?: HubFallback,
  description?: string,
): ResolvedHubLink | null {
  if (published.has(pseoPath)) return { href: pseoPath, description, published: true };
  if (fallback) return { href: fallback.href, description: fallback.description ?? description, published: false };
  return null;
}
