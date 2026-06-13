import { EventContext } from "@cloudflare/workers-types";

// WEB-AUTO-011: sitemap files that the generate-sitemaps job regenerates into
// the public Supabase `sitemaps` Storage bucket. For these paths we serve the
// FRESH copy from Storage (no deploy needed); any failure falls through to the
// build-time static file in dist (the fallback). All other .xml files
// (sitemap-static / -playgrounds / -guides, rss, etc.) are served statically.
const FRESH_SITEMAPS = new Set([
  "/sitemap.xml",
  "/sitemap-events.xml",
  "/sitemap-restaurants.xml",
  "/sitemap-attractions.xml",
  "/sitemap-articles.xml",
]);

// Cloudflare Pages Functions middleware for SPA routing
export async function onRequest(context: EventContext) {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // Serve the freshest sitemap from Storage when available; on ANY problem,
  // fall back to the static dist file (context.next()). Fail-safe by design —
  // this must never break sitemap serving or SPA routing.
  if (context.request.method === "GET" && FRESH_SITEMAPS.has(pathname)) {
    try {
      const env = (context.env ?? {}) as Record<string, string | undefined>;
      const supabaseBase = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
      if (supabaseBase) {
        const storageUrl = `${supabaseBase.replace(/\/$/, "")}/storage/v1/object/public/sitemaps${pathname}`;
        const fresh = await fetch(storageUrl, { method: "GET" });
        if (fresh.ok) {
          return new Response(fresh.body, {
            status: 200,
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=600, s-maxage=600",
              "X-Sitemap-Source": "storage",
            },
          });
        }
      }
    } catch {
      // Fall through to the static asset below.
    }
    return context.next();
  }

  // Serve static assets directly
  if (
    pathname.startsWith("/assets/") ||
    pathname.match(
      /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|json|xml|txt)$/
    )
  ) {
    return context.next();
  }

  // For all other routes, return index.html (SPA routing)
  const response = await context.next();

  // If it's a 404, serve index.html instead
  if (response.status === 404 && !pathname.includes(".")) {
    return context.env.ASSETS.fetch(new URL("/", context.request.url));
  }

  return response;
}
