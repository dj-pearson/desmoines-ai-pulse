import { EventContext } from "@cloudflare/workers-types";

/**
 * Cloudflare Pages Functions middleware.
 *
 * Two jobs:
 *  1. SPA routing — serve index.html for client-rendered routes.
 *  2. Social-crawler OG injection (WEB-FEAT-008) — detail pages are data-driven
 *     and rendered client-side, so a bot that doesn't run JS only ever sees the
 *     static shell's generic og:image. For known social crawlers hitting a
 *     detail route we resolve the entity and rewrite og/twitter title, image
 *     (pointing at the dynamic `og-image` edge function), description and url in
 *     the served HTML. Real users are untouched (no extra latency).
 *
 * SAFETY: the entire injection path is wrapped so ANY failure (missing env,
 * unresolved slug, fetch/parse error) falls through to the normal SPA response.
 * Worst case is "same as before" — the generic preview card.
 */

const OG_TYPE_BY_SEGMENT: Record<string, "event" | "restaurant" | "attraction" | "article"> = {
  events: "event",
  restaurants: "restaurant",
  attractions: "attraction",
  articles: "article",
};

// Month-year segments under /events resolve to a listing page, not a detail page.
const MONTH_YEAR = /^(january|february|march|april|may|june|july|august|september|october|november|december)-\d{4}$/i;

// User-agents of crawlers that scrape OG/Twitter meta for link previews.
const CRAWLER_UA =
  /facebookexternalhit|facebookcatalog|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|Pinterest|redditbot|Embedly|Iframely|vkShare|W3C_Validator|Google-InspectionTool|GoogleOther|Applebot|SkypeUriPreview|Bitrix/i;

function isCrawler(ua: string): boolean {
  return !!ua && CRAWLER_UA.test(ua);
}

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Central-time date suffix used by createEventSlugWithCentralTime (src/lib/timezone.ts). */
function eventSlug(title: string, when: string | null | undefined): string {
  const titleSlug = slugify(title);
  if (!when) return titleSlug;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(when));
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const y = get("year");
    const m = get("month");
    const d = get("day");
    if (!y || !m || !d) return titleSlug;
    return `${titleSlug}-${y}-${m}-${d}`;
  } catch {
    return titleSlug;
  }
}

function truncate(s: string | null | undefined, n = 200): string {
  const t = (s || "").trim().replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

interface Resolved {
  id: string;
  title: string;
  description: string;
}

async function sbGet(base: string, anon: string, pathAndQuery: string): Promise<any[]> {
  const res = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

async function resolveEntity(
  base: string,
  anon: string,
  type: string,
  slug: string,
): Promise<Resolved | null> {
  if (type === "restaurant") {
    const rows = await sbGet(base, anon, `restaurants?slug=eq.${encodeURIComponent(slug)}&select=id,name,seo_description,description&limit=1`);
    const r = rows[0];
    return r ? { id: r.id, title: r.name, description: truncate(r.seo_description || r.description) } : null;
  }
  if (type === "article") {
    const rows = await sbGet(base, anon, `articles?slug=eq.${encodeURIComponent(slug)}&select=id,title,seo_description,excerpt&limit=1`);
    const r = rows[0];
    return r ? { id: r.id, title: r.title, description: truncate(r.seo_description || r.excerpt) } : null;
  }
  if (type === "attraction") {
    // No slug column — the app routes by slugify(name). Match over the (small) active set.
    const rows = await sbGet(base, anon, `attractions?is_active=eq.true&select=id,name,seo_description,description&limit=1000`);
    const r = rows.find((a: any) => slugify(a.name) === slug);
    return r ? { id: r.id, title: r.name, description: truncate(r.seo_description || r.description) } : null;
  }
  if (type === "event") {
    // Slug embeds a central-time YYYY-MM-DD suffix; match within a small date window.
    const m = slug.match(/-(\d{4})-(\d{2})-(\d{2})$/);
    let rows: any[] = [];
    if (m) {
      const day = `${m[1]}-${m[2]}-${m[3]}`;
      const start = new Date(`${day}T00:00:00Z`);
      const from = new Date(start.getTime() - 36 * 60 * 60 * 1000).toISOString();
      const to = new Date(start.getTime() + 60 * 60 * 60 * 1000).toISOString();
      const sel = "id,title,date,event_start_utc,seo_description,geo_summary";
      const [a, b] = await Promise.all([
        sbGet(base, anon, `events?event_start_utc=gte.${from}&event_start_utc=lt.${to}&select=${sel}&limit=200`),
        sbGet(base, anon, `events?date=gte.${from}&date=lt.${to}&select=${sel}&limit=200`),
      ]);
      const seen = new Set<string>();
      rows = [...a, ...b].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
    }
    const r = rows.find((e: any) => eventSlug(e.title, e.event_start_utc || e.date) === slug);
    return r ? { id: r.id, title: r.title, description: truncate(r.seo_description || r.geo_summary) } : null;
  }
  return null;
}

class AttrSetter {
  constructor(private attr: string, private value: string) {}
  element(el: any) {
    el.setAttribute(this.attr, this.value);
  }
}

class TextSetter {
  constructor(private value: string) {}
  element(el: any) {
    el.setInnerContent(this.value);
  }
}

class Remover {
  element(el: any) {
    el.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Stop the SPA fallback from claiming to BE the homepage (WEB-SEO-006).
 *
 * The fallback below serves `/` for every unmatched route, and `/` is
 * prerendered - so an event, restaurant or attraction URL returns the
 * homepage's HTML verbatim, including:
 *
 *   <link rel="canonical" href="https://desmoinesinsider.com/">
 *   <meta property="og:url" content="https://desmoinesinsider.com/">
 *   7 ld+json blocks describing the homepage (LocalBusiness, FAQPage, ...)
 *
 * Measured in production 2026-08-22: 884 sitemapped URLs each returning a
 * byte-identical copy of the homepage. That is not "invisible to crawlers",
 * which is how the story was originally framed - it is an explicit
 * consolidation directive telling every crawler to treat 884 distinct URLs as
 * one page, plus structured data asserting the wrong facts about each.
 *
 * Three rewrites, all of them removing a wrong assertion rather than inventing
 * a right one:
 *   - canonical and og:url point at the requested URL, so the page claims
 *     itself. Helmet replaces both after hydration for anyone running JS.
 *   - the homepage's JSON-LD is REMOVED rather than corrected. There is no
 *     per-entity data at this layer to build the right blocks from, and no
 *     structured data is strictly better than structured data that says an
 *     event page is a FAQ about Des Moines Insider.
 *
 * This does NOT make entity pages readable without JS - that needs
 * PRERENDER_ENTITIES on the Pages build, which is the rest of WEB-SEO-006. It
 * removes the part that is actively harmful while that is pending, and it also
 * covers the soft-404 surface, where an unknown slug will keep falling through
 * here even after the flag is on.
 */
/**
 * True when this HTML is the prerendered homepage being served as the SPA
 * fallback for some other URL.
 *
 * The homepage declares itself canonical, so a root canonical on a non-root
 * path is exactly the fallback case and nothing else. Matching on the tag
 * rather than on the status keeps this correct under Pages' SPA mode, which
 * answers 200, and makes it inert for genuinely prerendered pages.
 */
export function isHomepageShell(html: string, origin: string): boolean {
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0];
  if (!canonical) return false;
  const href = canonical.match(/href=["']([^"']+)["']/i)?.[1];
  return href === `${origin}/` || href === origin;
}

function withSelfCanonical(shell: Response, pageUrl: string): Response {
  const rewritten = new HTMLRewriter()
    .on('link[rel="canonical"]', new AttrSetter("href", pageUrl))
    .on('meta[property="og:url"]', new AttrSetter("content", pageUrl))
    .on('script[type="application/ld+json"]', new Remover())
    .transform(shell);

  return new Response(rewritten.body, {
    status: shell.status,
    headers: shell.headers,
  });
}

export async function onRequest(context: EventContext) {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // Serve static assets directly.
  if (
    pathname.startsWith("/assets/") ||
    pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|json|xml|txt)$/)
  ) {
    return context.next();
  }

  // --- WEB-FEAT-008: per-entity OG meta for social crawlers on detail routes ---
  try {
    const ua = context.request.headers.get("user-agent") || "";
    const segments = pathname.split("/").filter(Boolean);
    const type = segments.length === 2 ? OG_TYPE_BY_SEGMENT[segments[0]] : undefined;
    const slug = segments[1];
    const isDetail = !!type && !!slug && !(type === "event" && MONTH_YEAR.test(slug));

    if (isDetail && isCrawler(ua)) {
      const env = context.env as Record<string, string | undefined>;
      const sbBase = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
      const sbAnon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
      if (sbBase && sbAnon) {
        const entity = await resolveEntity(sbBase, sbAnon, type!, slug);
        if (entity) {
          const ogImage = `${sbBase}/functions/v1/og-image/${type}/${entity.id}`;
          const pageUrl = `${url.origin}${pathname}`;
          const title = escapeHtml(entity.title);
          const desc = escapeHtml(entity.description);

          // Fetch the SPA shell and rewrite its social meta in place.
          const shell = await context.env.ASSETS.fetch(new URL("/", context.request.url));
          let rewriter = new HTMLRewriter()
            .on('meta[property="og:image"]', new AttrSetter("content", ogImage))
            .on('meta[property="og:image:secure_url"]', new AttrSetter("content", ogImage))
            .on('meta[name="twitter:image"]', new AttrSetter("content", ogImage))
            .on('meta[property="og:url"]', new AttrSetter("content", pageUrl))
            .on('meta[property="og:type"]', new AttrSetter("content", type === "article" ? "article" : "website"))
            // Same two corrections withSelfCanonical makes on the plain
            // fallback. This path already rewrote og:url and left the canonical
            // pointing at "/" beside it, so the card said one thing and the
            // canonical said another (WEB-SEO-006).
            .on('link[rel="canonical"]', new AttrSetter("href", pageUrl))
            .on('script[type="application/ld+json"]', new Remover());

          if (title) {
            rewriter = rewriter
              .on('meta[property="og:title"]', new AttrSetter("content", title))
              .on('meta[name="twitter:title"]', new AttrSetter("content", title))
              .on("title", new TextSetter(title));
          }
          if (desc) {
            rewriter = rewriter
              .on('meta[property="og:description"]', new AttrSetter("content", desc))
              .on('meta[name="twitter:description"]', new AttrSetter("content", desc))
              .on('meta[name="description"]', new AttrSetter("content", desc));
          }

          const rewritten = rewriter.transform(shell);
          return new Response(rewritten.body, {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              // Crawlers re-scrape periodically; a short cache keeps cards fresh.
              "Cache-Control": "public, max-age=600",
            },
          });
        }
      }
    }
  } catch {
    /* fall through to normal SPA handling — never worse than the generic card */
  }

  // For all other routes, return index.html (SPA routing).
  const response = await context.next();

  // WEB-SEO-006, second half. withSelfCanonical was gated on a 404 and so has
  // never run: this project ships public/_routes.json with include ["/*"] and
  // Pages is in single-page-app mode, which serves the fallback at 200. Every
  // unmatched route therefore returned the homepage with status 200, the 404
  // branch was dead code, and the 884 URLs the comment above describes kept
  // claiming to be the homepage. Verified against production 2026-08-27:
  // /events/rodney-carrington-2026-11-05 returns 200, canonical
  // "https://desmoinesinsider.com/", and six homepage ld+json blocks.
  //
  // Status is the wrong thing to key on. The defect is "homepage HTML served at
  // a URL that is not the homepage", so test for that instead. It is exact, and
  // it stops applying by itself once PRERENDER_ENTITIES puts a real page at the
  // path: a prerendered entity page carries its own canonical, fails the check
  // and passes through untouched with its JSON-LD intact.
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html") && pathname !== "/" && !pathname.includes(".")) {
    try {
      const html = await response.text();
      const passthrough = new Response(html, { status: response.status, headers: response.headers });
      if (isHomepageShell(html, url.origin)) {
        return withSelfCanonical(passthrough, `${url.origin}${pathname}`);
      }
      return passthrough;
    } catch {
      // Never fail the page for a meta rewrite. Worst case is the previous
      // behaviour, which is what shipped for months.
      return response;
    }
  }

  return response;
}
