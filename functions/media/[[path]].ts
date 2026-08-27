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

export function upstreamUrlFor(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/media/${path}`;
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
  const cacheKey = new Request(new URL(request.url).toString(), { method: "GET" });

  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const upstream = await fetch(upstreamUrlFor(supabaseUrl, path), {
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
  headers.set("Cache-Control", `public, max-age=${MAX_AGE}`);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.delete("set-cookie");
  // Names the hop, so "is this actually being cached" is answerable from curl.
  headers.set("X-Media-Origin", "supabase-storage");

  const response = new Response(upstream.body, { status: upstream.status, headers });

  if (cache && request.method === "GET" && upstream.ok) {
    context.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}
