/**
 * Serve stored images through Cloudflare instead of straight off Supabase.
 *
 * THE PROBLEM THIS IS FOR, and it is a bigger number than the ingest one.
 * imageStorage.ts's cdnUrlFor() returns
 *
 *     https://<project>.supabase.co/storage/v1/object/public/media/<path>
 *
 * and that URL is what lands in events.image_url, restaurants.image_url and the
 * rest. So every card image, on every page view, by every visitor and every
 * crawler, is billed as SUPABASE EGRESS. Ingest downloads an image once, ever;
 * serving downloads it once per viewer.
 *
 * public/_headers already sets `Cache-Control: immutable` for /*.jpg and
 * friends - but those rules apply to files CLOUDFLARE PAGES serves out of
 * dist/, and do nothing for a URL on the supabase.co origin. Nothing was
 * caching these.
 *
 * WHAT THIS DOES. /media/<path> fetches the object from Supabase once, puts it
 * in the Cloudflare edge cache, and serves every later request from there. The
 * first request per object still costs Supabase egress; nothing after it does,
 * until the cache evicts.
 *
 * IT IS INERT UNTIL SWITCHED ON. cdnUrlFor still emits the Supabase URL unless
 * MEDIA_CDN_BASE is set, so deploying this route changes nothing on its own -
 * it just starts working when something asks for it. Old rows keep resolving
 * either way, because the Supabase URLs they hold are still valid.
 *
 * PATHS ARE NOT CONTENT-HASHED. imageStorage writes
 * `<type>s/<content-id>/hero.<ext>`, which is stable per record, so replacing a
 * record's image reuses the path. `immutable` would then serve the old bytes
 * until the TTL expired. max-age is a year with must-revalidate off but the
 * response carries an ETag from Supabase, so a purge or a changed object is
 * picked up on revalidation rather than never. If image replacement becomes
 * common, hash the path at write time instead of shortening this TTL.
 */

interface Env {
  SUPABASE_URL?: string;
  /** Set to enable; also what cdnUrlFor reads to decide what to write. */
  MEDIA_CDN_BASE?: string;
}

interface Ctx {
  request: Request;
  env: Env;
  params: { path?: string | string[] };
  waitUntil(p: Promise<unknown>): void;
}

/** A year. The objects are immutable in practice; see the note above. */
const MAX_AGE = 31_536_000;

/**
 * A day, for Google Places photo copies (`.../places-photo-<ms>.<ext>`, written
 * by backfill-images for hotels). Maps Platform terms allow caching Place
 * content for 30 days and the job deletes each copy before then; a year of
 * edge and browser cache would keep serving the bytes long after the delete.
 * Mirrors PLACES_COPY_MAX_AGE_SECONDS in supabase/functions/_shared/placesPhoto.ts.
 */
const PLACES_COPY_MAX_AGE = 86_400;
const PLACES_COPY = /\/places-photo-\d+\.[A-Za-z0-9]{2,5}$/;

/** Cache lifetime, in seconds, for a storage key. */
export function maxAgeFor(path: string): number {
  return PLACES_COPY.test(path) ? PLACES_COPY_MAX_AGE : MAX_AGE;
}

/**
 * Storage keys this route will forward. imageStorage writes
 * `events/<uuid>/hero.jpg`; nothing else should reach here, and a path that
 * does not look like one is a probe rather than a miss.
 *
 * Deliberately an allowlist rather than a `..` denylist: a denylist has to
 * anticipate every encoding of traversal, and this only ever needs to pass
 * lowercase segments, digits, dashes, underscores and one dot in the filename.
 */
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9/_-]*\.[A-Za-z0-9]{2,5}$/;

export function isSafeMediaPath(path: string): boolean {
  if (!path || path.length > 512) return false;
  if (path.includes("..") || path.includes("//") || path.startsWith("/")) return false;
  return SAFE_PATH.test(path);
}

/**
 * Sizing params this route will forward, and the bounds it forwards them in.
 *
 * WHY THIS EXISTS AT ALL (WEB-PERF-004, round two). OptimizedImage resizes by
 * rewriting `/object/public/` to `/render/image/public/` and hanging width,
 * format and quality off it — and it only does that for a URL matching
 * `supabase.co/storage/v1/object/public`. The moment repoint-media-urls.ts
 * moved rows onto `/media/`, nothing matched, `canTransform` went false, and
 * every one of those images went back to serving its full-size original.
 * Measured on a real object the day it happened:
 *
 *   /object/public/…/hero.png                     200  image/png  1,011,030 B
 *   /render/image/public/…?width=640&quality=75   200  image/png    398,847 B
 *   /media/…/hero.png?width=640&quality=75        200  image/png  1,011,030 B  <- this route, before
 *
 * Same bytes as the bug that story was written to fix, reached by a different
 * road. So the route has to speak the transform contract too, or moving a row
 * onto it is a 2.5x regression dressed as a saving.
 *
 * BOUNDED, NOT ALLOWLISTED, and the two are different decisions here. The path
 * guard above is an allowlist because a path is a security surface: a false
 * negative there is an open proxy. A width is not — the worst an odd one does
 * is occupy a cache entry — so pinning the exact seven DEFAULT_WIDTHS would put
 * a copy of the component's taste in a second file and break the day somebody
 * adds a breakpoint. Bounds stop the abuse (an unbounded width is a CPU burn on
 * someone else's origin); the component's own list is what keeps the real cache
 * key count at seven.
 */
const MIN_WIDTH = 16;
const MAX_WIDTH = 3840;
const MIN_QUALITY = 20;
const MAX_QUALITY = 100;
const FORMATS = new Set(["origin", "webp", "avif", "jpeg", "jpg", "png"]);

export interface MediaTransform {
  width?: number;
  quality?: number;
  format?: string;
}

/**
 * Read the transform out of a request URL, or null when there is not one.
 *
 * NULL IS THE LOAD-BEARING RETURN. No params means fetch `/object/public/`
 * exactly as this route always has, so every URL already written, already
 * cached and already asserted by the test above behaves identically. A param
 * that is present but junk (`width=banana`, `width=99999`) is DROPPED rather
 * than refused: the caller asked for an image and there is a perfectly good one
 * to serve, and a 400 here would turn a typo in a srcset into a broken card.
 */
export function mediaTransformFrom(search: URLSearchParams): MediaTransform | null {
  const out: MediaTransform = {};

  const rawWidth = Number(search.get("width"));
  if (Number.isFinite(rawWidth) && rawWidth >= MIN_WIDTH && rawWidth <= MAX_WIDTH) {
    out.width = Math.trunc(rawWidth);
  }

  const rawQuality = Number(search.get("quality"));
  if (Number.isFinite(rawQuality) && rawQuality >= MIN_QUALITY && rawQuality <= MAX_QUALITY) {
    out.quality = Math.trunc(rawQuality);
  }

  const rawFormat = (search.get("format") ?? "").toLowerCase();
  if (FORMATS.has(rawFormat)) out.format = rawFormat;

  return Object.keys(out).length ? out : null;
}

export function upstreamUrlFor(
  supabaseUrl: string,
  path: string,
  transform: MediaTransform | null = null,
): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  if (!transform) return `${base}/storage/v1/object/public/media/${path}`;

  // Sizing params on /object/public/ are IGNORED, not honoured, so the endpoint
  // has to change with them. Getting this half right and the path wrong is the
  // exact shape of the original bug.
  const url = new URL(`${base}/storage/v1/render/image/public/media/${path}`);
  if (transform.width) url.searchParams.set("width", String(transform.width));
  if (transform.quality) url.searchParams.set("quality", String(transform.quality));
  if (transform.format) url.searchParams.set("format", transform.format);
  return url.toString();
}

/**
 * WHAT MAY BE SERVED FIRST-PARTY FROM HERE (stored XSS through /media/*.svg).
 *
 * This route answers under the site's own origin, and public/_headers - so the
 * site CSP - does not apply to a Pages Function response. The media bucket
 * accepts image/svg+xml and any signed-in user can upload to it, so an SVG
 * carrying <script>, opened directly at /media/..., ran as first-party script
 * and could read the Supabase session out of localStorage. The same goes for
 * anything else the origin labels as an active type (text/html, XML).
 *
 * So every response gets nosniff, an SVG gets a CSP that forbids script and
 * sandboxes the document (it still renders in an <img>, which never runs
 * script anyway), and a Content-Type outside the passive types below is served
 * as an opaque download instead of being rendered here. Raster images keep
 * their headers as they were, plus nosniff.
 */
export const SVG_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";

const PASSIVE_TYPE =
  /^(image\/(?!svg\+xml$)[a-z0-9.+-]+|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|font\/[a-z0-9.+-]+|application\/pdf)$/;

function mediaTypeOf(contentType: string | null): string {
  return (contentType ?? "").split(";")[0].trim().toLowerCase();
}

/**
 * Apply the first-party safety headers in place. Exported for the offline test.
 * The route calls it on fresh responses AND on cache hits, because an entry
 * cached before this existed can live for a year.
 */
export function hardenMediaHeaders(headers: Headers, path: string, status = 200): void {
  headers.set("X-Content-Type-Options", "nosniff");

  const raw = headers.get("Content-Type");
  const type = mediaTypeOf(raw);
  const isSvg = /\.svg$/i.test(path) || type === "image/svg+xml";

  if (isSvg) {
    headers.set("Content-Security-Policy", SVG_CSP);
    if (type === "image/svg+xml") return;
    // An .svg path the origin labelled as something else is not trusted to be
    // an image; it falls through to the download branch below.
  }

  // A 304 with no Content-Type leaves the browser's stored (already hardened)
  // headers alone; there is nothing here to rewrite.
  if (status === 304 && !raw) return;

  if (!isSvg && PASSIVE_TYPE.test(type)) return;

  headers.set("Content-Type", "application/octet-stream");
  headers.set("Content-Disposition", "attachment");
  headers.set("Content-Security-Policy", SVG_CSP);
}

export async function onRequest(context: Ctx): Promise<Response> {
  const { request, env, params } = context;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const raw = params.path;
  const path = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
  if (!isSafeMediaPath(path)) {
    return new Response("Not found", { status: 404 });
  }

  const supabaseUrl = env.SUPABASE_URL;
  if (!supabaseUrl) {
    // Misconfiguration, not a missing image. 502 rather than 404 so it does not
    // read as "this image does not exist" in a log.
    return new Response("Media origin not configured", { status: 502 });
  }

  // deno-lint-ignore no-explicit-any
  const cache = (globalThis as any).caches?.default;
  const requestUrl = new URL(request.url);
  // The cache key keeps the query string, so /media/x.png and
  // /media/x.png?width=640 are two entries rather than one that serves whichever
  // size arrived first.
  const cacheKey = new Request(requestUrl.toString(), { method: "GET" });

  if (cache) {
    const hit: Response | undefined = await cache.match(cacheKey);
    if (hit) {
      const hitHeaders = new Headers(hit.headers);
      hardenMediaHeaders(hitHeaders, path, hit.status);
      return new Response(hit.body, { status: hit.status, headers: hitHeaders });
    }
  }

  const transform = mediaTransformFrom(requestUrl.searchParams);

  const upstream = await fetch(upstreamUrlFor(supabaseUrl, path, transform), {
    // Pass the conditional headers through so a revalidation stays a 304 rather
    // than re-downloading the object.
    headers: {
      "If-None-Match": request.headers.get("If-None-Match") ?? "",
      "If-Modified-Since": request.headers.get("If-Modified-Since") ?? "",
    },
  });

  if (!upstream.ok && upstream.status !== 304) {
    // Do NOT cache an upstream failure. A cached 404 or 502 outlives the outage
    // that caused it, which is the failure mode worth avoiding here.
    return new Response(upstream.status === 404 ? "Not found" : "Upstream error", {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  const headers = new Headers(upstream.headers);
  headers.set("Cache-Control", `public, max-age=${maxAgeFor(path)}`);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.delete("set-cookie");
  // Names the hop, so "is this actually being cached" is answerable from curl —
  // and now also WHICH origin answered, so "is this image actually being
  // resized" is answerable the same way. A transform that silently fell back to
  // the original is the failure this route exists to stop repeating, and it is
  // invisible in a status code.
  headers.set("X-Media-Origin", transform ? "supabase-render" : "supabase-storage");
  hardenMediaHeaders(headers, path, upstream.status);

  const response = new Response(upstream.body, { status: upstream.status, headers });

  if (cache && request.method === "GET" && upstream.ok) {
    context.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}
