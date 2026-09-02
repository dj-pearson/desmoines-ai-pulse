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

// WEB-SEO-020 AC5: playgrounds and /stay were handled by nothing at all, so
// their detail pages fell through with homepage meta and no entity JSON-LD.
const OG_TYPE_BY_SEGMENT: Record<
  string,
  "event" | "restaurant" | "attraction" | "article" | "playground" | "hotel"
> = {
  events: "event",
  restaurants: "restaurant",
  attractions: "attraction",
  articles: "article",
  playgrounds: "playground",
  stay: "hotel",
};

// Month-year segments under /events resolve to a listing page, not a detail page.
const MONTH_YEAR = /^(january|february|march|april|may|june|july|august|september|october|november|december)-\d{4}$/i;

// WEB-SEO-020: THERE IS NO CRAWLER USER-AGENT LIST ANY MORE, and its absence is
// the fix rather than a simplification.
//
// A user-agent regex used to select who got the rewritten shell. Alongside the
// link-preview bots it listed Google's own inspection tool and its secondary
// crawler, so URL Inspection was shown something no user ever saw -- which is
// what "cloaking" means, whatever the intent. It also could not win: the branch it guarded
// fetched "/" and stripped every ld+json block, so the better a page had been
// prerendered, the more that branch destroyed.
//
// Everyone now receives the same response, and it is the right one: a
// prerendered page passes through untouched, and a page that missed the
// prerender budget gets its own title, description, og:type and Event or
// Restaurant JSON-LD injected into the shell. Serving one answer to every
// requester removes the risk entirely and is less code.

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
  startDate?: string | null;
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
    return r
      ? {
          id: r.id,
          title: r.title,
          description: truncate(r.seo_description || r.geo_summary),
          startDate: r.event_start_utc || r.date || null,
        }
      : null;
  }
  if (type === "playground") {
    // Like attractions: no slug column, the app routes by createSlug(name).
    const rows = await sbGet(base, anon, `playgrounds?select=id,name,description&limit=1000`);
    const r = rows.find((a: any) => slugify(a.name) === slug);
    return r ? { id: r.id, title: r.name, description: truncate(r.description) } : null;
  }
  if (type === "hotel") {
    const rows = await sbGet(base, anon, `hotels?slug=eq.${encodeURIComponent(slug)}&select=id,name,description&limit=1`);
    const r = rows[0];
    return r ? { id: r.id, title: r.name, description: truncate(r.description) } : null;
  }
  return null;
}

/**
 * How to answer a detail URL whose asset turned out to be the SPA shell
 * (WEB-SEO-030).
 *
 * Every un-prerendered entity URL used to answer 200 with a self-canonical, so
 * a dead slug and a real page that missed the build budget were byte-identical
 * to a crawler: roughly 860 indexable duplicates of the homepage under
 * public/_routes.json's include ["/*"].
 *
 * Pure and exported so functions/__tests__ can assert the three cases without a
 * network or a Pages runtime.
 */
export function detailShellStatus(
  type: string,
  slug: string,
  resolved: boolean,
  now: Date = new Date(),
): { status: number; noindex: boolean; reason: string } {
  if (resolved) return { status: 200, noindex: false, reason: "resolved" };

  // An event slug carries its own date, which is the only date available when
  // the row itself cannot be found. A show that happened last year is GONE, not
  // merely missing, and 410 tells a crawler to stop asking.
  if (type === "event") {
    const m = slug.match(/-(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const when = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
      if (Number.isFinite(when) && now.getTime() - when > 30 * 24 * 60 * 60 * 1000) {
        return { status: 410, noindex: true, reason: "event-long-past" };
      }
    }
  }

  return { status: 404, noindex: true, reason: "unresolved" };
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
/**
 * resolveEntity, behind the edge cache (WEB-SEO-030 AC4).
 *
 * Every one of these is a PostgREST round trip, and the attraction and
 * playground branches pull up to 1,000 rows to match a slugified name. A
 * crawler working through a sitemap of ~860 un-prerendered URLs would otherwise
 * turn one crawl into ~860 of those. Five minutes is short enough that a newly
 * published page appears promptly and long enough to flatten a burst.
 *
 * Cache failures are swallowed: this is an optimisation, and a cache that is
 * unavailable must not turn into a 500 on a page request.
 */
async function resolveEntityCached(
  context: EventContext,
  base: string,
  anon: string,
  type: string,
  slug: string,
): Promise<Resolved | null> {
  const key = new Request(
    `https://slug-resolve.internal/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
  );
  // deno-lint-ignore no-explicit-any
  const cache: any = (globalThis as any).caches?.default;

  try {
    const hit = await cache?.match(key);
    if (hit) {
      const body = await hit.json();
      return body && body.id ? (body as Resolved) : null;
    }
  } catch {
    /* fall through to a live lookup */
  }

  const entity = await resolveEntity(base, anon, type, slug);

  try {
    // A miss is cached too, and for the same reason: a crawler hammering dead
    // slugs is exactly the traffic worth absorbing.
    const payload = new Response(JSON.stringify(entity ?? {}), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
    context.waitUntil?.(cache?.put(key, payload));
  } catch {
    /* the lookup already succeeded; caching it is best effort */
  }

  return entity;
}

/**
 * The shell, wearing the entity's identity (WEB-SEO-020 AC4, WEB-SEO-030 AC3).
 *
 * This is what a URL gets when it resolves but missed the prerender budget. The
 * branch this replaces set og:type to "website" for everything except articles
 * and removed every ld+json block, so an event page announced itself as a
 * generic website with no structured data. Here the og:type follows the segment
 * and a real Event or Restaurant node is injected.
 */
function entityShell(
  shell: Response,
  opts: { pageUrl: string; sbBase: string; type: string; entity: Resolved },
): Response {
  const { pageUrl, sbBase, type, entity } = opts;
  const ogImage = `${sbBase}/functions/v1/og-image/${type}/${entity.id}`;
  const title = escapeHtml(entity.title);
  const desc = escapeHtml(entity.description);

  const SCHEMA_TYPE: Record<string, string> = {
    event: "Event",
    restaurant: "Restaurant",
    attraction: "TouristAttraction",
    article: "Article",
    playground: "Place",
    hotel: "Hotel",
  };
  const OG_TYPE: Record<string, string> = { event: "article", article: "article" };

  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE[type] || "Thing",
    "@id": pageUrl,
    name: entity.title,
    url: pageUrl,
  };
  if (entity.description) node.description = entity.description;
  // Only what the row actually carries. An Event with a fabricated startDate is
  // worse than an Event without one.
  if (type === "event" && entity.startDate) node.startDate = entity.startDate;

  let rewriter = new HTMLRewriter()
    .on('link[rel="canonical"]', new AttrSetter("href", pageUrl))
    .on('meta[property="og:url"]', new AttrSetter("content", pageUrl))
    .on('meta[property="og:type"]', new AttrSetter("content", OG_TYPE[type] || "website"))
    .on('meta[property="og:image"]', new AttrSetter("content", ogImage))
    .on('meta[property="og:image:secure_url"]', new AttrSetter("content", ogImage))
    .on('meta[name="twitter:image"]', new AttrSetter("content", ogImage))
    // The entity's own node goes in the head. Nothing is REMOVED here: the
    // shell's blocks describe the site, and a page may carry both.
    .on("head", new JsonLdInjector(node));

  if (title) {
    rewriter = rewriter
      .on("title", new TextReplacer(title))
      .on('meta[property="og:title"]', new AttrSetter("content", title))
      .on('meta[name="twitter:title"]', new AttrSetter("content", title));
  }
  if (desc) {
    rewriter = rewriter
      .on('meta[name="description"]', new AttrSetter("content", desc))
      .on('meta[property="og:description"]', new AttrSetter("content", desc))
      .on('meta[name="twitter:description"]', new AttrSetter("content", desc));
  }

  return new Response(rewriter.transform(shell).body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}

class JsonLdInjector {
  constructor(private node: Record<string, unknown>) {}
  element(el: any) {
    el.append(
      `<script type="application/ld+json">${JSON.stringify(this.node).replace(/</g, "\\u003c")}</script>`,
      { html: true },
    );
  }
}

class TextReplacer {
  private done = false;
  constructor(private value: string) {}
  text(chunk: any) {
    chunk.replace(this.done ? "" : this.value);
    this.done = true;
  }
}

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

/**
 * SEO-004: the absolute URL a trailing-slash request should 301 to, or null if
 * the request is already canonical.
 *
 * Exported so it can be tested; the redirect itself is one line in onRequest.
 *
 * Returns null for "/" - the one trailing slash on the site that is not a
 * duplicate - and preserves the query string and fragment, because a 301 that
 * drops them loses the filter or the UTM tag that brought the visitor, which
 * would cost more traffic than the duplication it fixes.
 */
export function trailingSlashRedirect(url: URL): string | null {
  const pathname = url.pathname;
  if (pathname.length <= 1 || !pathname.endsWith("/")) return null;
  const target = new URL(url.toString());
  const stripped = pathname.replace(/\/+$/, "");
  // A path of only slashes strips to "", which serialises to a URL with no path
  // that a browser resolves straight back to "/" - a redirect loop. Treat it as
  // already canonical instead.
  if (stripped === "") return null;
  target.pathname = stripped;
  return target.toString();
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

  // SEO-004: one URL per page. A trailing slash 301s to the unslashed form.
  //
  // Measured 2026-08-28: /restaurants and /restaurants/ were BOTH indexed and
  // both returned 200 - 20,789 impressions at position 24.4 against 5,401 at
  // 25.1, which is the same page competing with itself. /events, /playgrounds,
  // /stay and /events/date-night had the same split.
  //
  // The canonical tag was already right (the slashed form points at the
  // unslashed one), and it was already working in the sense that Google will
  // consolidate eventually. Eventually is the problem: this is splitting
  // impressions across our WORST-performing pages, the hubs, right now.
  //
  // Unslashed is the convention because that is what every canonical on the
  // site already declares. Picking the other direction would have meant
  // rewriting every canonical instead of adding one redirect.
  //
  // THIS RUNS AFTER THE ASSET BYPASS ON PURPOSE. A blanket /*/ rule in
  // public/_redirects would also catch asset paths and directory-style requests
  // that Pages resolves itself, and _redirects cannot express "except assets".
  // Here the exclusion is already computed one block up.
  //
  // The root is excluded because "/" IS the canonical homepage - the one
  // trailing slash on the site that is not a duplicate. Query strings and
  // fragments are preserved, or a 301 would silently drop a filter or a UTM tag
  // and the redirect would lose the very traffic it is meant to consolidate.
  // DISABLED - this 301 took the whole site down. Do not re-enable it on its
  // own; it cannot work while prerender writes directory-style output.
  //
  // scripts/prerender.mjs:744 writes dist/<route>/index.html, so Cloudflare
  // Pages treats /events as a directory and issues its OWN 308 to /events/
  // before any of our code runs. This line then 301s the slash back off. The
  // two redirects point at each other:
  //
  //   GET /events   -> 308 Location: /events/                        (Pages)
  //   GET /events/  -> 301 Location: https://.../events              (here)
  //
  // Measured in production 2026-08-29: 50 redirects and ERR_TOO_MANY_REDIRECTS
  // on /events, /restaurants, /attractions, /events/today, /playgrounds,
  // /articles, /guides and entity pages, for Googlebot and for mobile Safari.
  // Only "/" survived, because trailingSlashRedirect returns null for it - the
  // same guard that made this look safe.
  //
  // The unit test could not catch it. It tests a pure function against URLs we
  // hand it, and Pages' normalization is not in the code at all; it is implied
  // by the SHAPE OF THE BUILD OUTPUT. Any future attempt needs an assertion
  // against a deployed URL, not another case in that file.
  //
  // SEO-021 did that: scripts/prerender.mjs now writes dist/<route>.html, so
  // Pages serves /events directly and 308s /events/ -> /events by itself. This
  // redirect is now REDUNDANT rather than merely disabled, and re-enabling it
  // would put our 301 in front of a Pages 308 that already points the same way.
  // Leave it off.
  //
  // trailingSlashRedirect stays exported because it still documents the mapping
  // the site follows, and functions/__tests__/middleware-trailing-slash.test.mjs
  // still asserts it. What that test CANNOT assert is the thing that decides:
  // Pages normalizes from the shape of the build output, which is not in this
  // file. scripts/check-canonical-url-shape.mjs is the check that can.
  void trailingSlashRedirect;

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
      const pageUrl = `${url.origin}${pathname}`;
      const passthrough = () =>
        new Response(html, { status: response.status, headers: response.headers });

      // WEB-SEO-020 AC2. A page that is not the homepage shell is a real
      // prerendered page: it already carries its own canonical, og:* and
      // JSON-LD. Return it untouched. The branch this replaces fetched "/" and
      // removed every ld+json block, so it destroyed exactly the markup the
      // prerender pass had just produced.
      if (!isHomepageShell(html, url.origin)) return passthrough();

      // From here the asset IS the homepage shell served at another path.
      const segments = pathname.split("/").filter(Boolean);
      const type = segments.length === 2 ? OG_TYPE_BY_SEGMENT[segments[0]] : undefined;
      const slug = segments[1];
      const isDetail = !!type && !!slug && !(type === "event" && MONTH_YEAR.test(slug));

      if (isDetail) {
        const env = context.env as Record<string, string | undefined>;
        const sbBase = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
        const sbAnon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

        if (sbBase && sbAnon) {
          const entity = await resolveEntityCached(context, sbBase, sbAnon, type!, slug);
          const verdict = detailShellStatus(type!, slug, !!entity);

          // WEB-SEO-030: a dead slug is a 404 and a long-finished event is a
          // 410. Both used to answer 200 with a self-canonical, which under
          // include ["/*"] made every one of them an indexable duplicate of the
          // homepage.
          if (!entity) {
            const rewritten = new HTMLRewriter()
              .on('link[rel="canonical"]', new AttrSetter("href", pageUrl))
              .on('meta[name="robots"]', new AttrSetter("content", "noindex, follow"))
              .transform(passthrough());
            return new Response(rewritten.body, {
              status: verdict.status,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "X-Robots-Tag": "noindex",
                "Cache-Control": "public, max-age=300",
              },
            });
          }

          // Resolved, but it missed the prerender budget. Keep the 200 and give
          // it its own identity instead of the homepage's (WEB-SEO-030 AC3).
          return entityShell(passthrough(), { pageUrl, sbBase, type: type!, entity });
        }
      }

      // Any other shell-at-a-non-root-path: unchanged behaviour.
      return withSelfCanonical(passthrough(), pageUrl);
    } catch {
      // Never fail the page for a meta rewrite. Worst case is the previous
      // behaviour, which is what shipped for months.
      return response;
    }
  }

  return response;
}
