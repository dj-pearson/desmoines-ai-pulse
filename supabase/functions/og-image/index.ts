/**
 * og-image (WEB-FEAT-008)
 *
 * Renders a branded 1200×630 PNG social-share card for events / restaurants /
 * attractions / articles:  GET /og-image/:type/:id
 *
 * Design: a gradient brand background, an optional full-bleed thumbnail of the
 * item with a dark scrim, the (truncated) title, a date/rating badge, and the
 * "Des Moines Insider" wordmark. SVG is built by hand and rasterized with
 * @resvg/resvg-wasm.
 *
 * SAFETY: any failure (unknown id, fetch/render error, missing font) falls back
 * to a 302 redirect to the static default OG image, so pointing og:image at this
 * function can never produce a broken social preview.
 *
 * Caching: immutable + 1y for past events (content frozen); ~1h for everything
 * else. Public (verify_jwt=false) — crawlers call it with no auth. Rate-limited.
 *
 * Crawler-visible HTML: functions/_middleware.ts injects the per-entity og:image
 * (this function's URL) plus og/twitter title+description into the static SPA
 * shell for social crawlers, so bots that don't run JS still see the right card.
 *
 * POST-DEPLOY MANUAL CHECK (needs a deployed URL this sandbox lacks): validate a
 * live share with the Twitter Card validator + Facebook Sharing Debugger and
 * record screenshots in the PR/progress notes.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";
// resvg only emits PNG, which is the wrong container for a card that is mostly
// photograph. imagescript is pure TS (no wasm to initialise) and only has to
// re-encode an already-rasterised 1200x630 buffer, so it is cheap here.
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { validateURLForSSRF } from "../_shared/validation.ts";

const SITE_URL = Deno.env.get("SITE_URL") || Deno.env.get("VITE_SITE_URL") || "https://desmoinesinsider.com";
// /og-image.png does not exist - Cloudflare answers it with the SPA shell, so
// this fallback handed crawlers 200 text/html where an image belongs. Points at
// a file that is actually in public/ now.
const DEFAULT_OG = `${SITE_URL}/DMI-Logo.png`;
/**
 * JPEG quality for the rendered card.
 *
 * These cards are a photo behind a scrim behind text, so PNG stores them
 * losslessly and enormously. Measured on a real card, 2026-08-27:
 *
 *   PNG (what shipped)   749,160 B
 *   JPEG q90              91,757 B   -88%, 26 ms to encode
 *   JPEG q82              67,520 B   -91%
 *
 * That mattered because og:image points at supabase.co, which is outside the
 * Cloudflare zone: CF-Cache-Status is DYNAMIC, so every crawler re-scrape paid
 * full Supabase egress. At the observed 501 calls/day the PNG was ~11 GB/month
 * against a 5 GB free-plan cap. q90 brings it to ~1.4 GB and is visually
 * indistinguishable at card size.
 */
const JPEG_QUALITY = 90;

const WIDTH = 1200;
const HEIGHT = 630;
// A regular TTF (resvg needs TTF/OTF, not woff2). Inter via the Vercel demo CDN.
const FONT_URL = "https://raw.githubusercontent.com/vercel/satori/main/test/assets/Inter-Regular.ttf";

let wasmReady: Promise<void> | null = null;
let fontBuf: Uint8Array | null = null;
let fontTried = false;

function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm(fetch("https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm")).catch((e) => {
      wasmReady = null; // allow a later retry
      throw e;
    });
  }
  return wasmReady;
}

async function getFont(): Promise<Uint8Array | null> {
  if (fontBuf || fontTried) return fontBuf;
  fontTried = true;
  try {
    const res = await fetch(FONT_URL);
    if (res.ok) fontBuf = new Uint8Array(await res.arrayBuffer());
  } catch {
    fontBuf = null;
  }
  return fontBuf;
}

function escapeXml(s: string): string {
  return (s || "").replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;");
}

/** Wrap a title into <= maxLines lines of <= perLine chars (rough, monospace-ish). */
function wrapTitle(title: string, perLine = 26, maxLines = 3): string[] {
  const words = (title || "").split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > perLine) {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (last.length > perLine - 1) lines[maxLines - 1] = last.slice(0, perLine - 1) + "…";
  }
  return lines.length ? lines : ["Des Moines Insider"];
}

async function fetchImageDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  // SSRF guard, matching image-proxy and image-transform. This fetches a URL
  // read out of the database, and image_url is not always something this
  // project chose: a public event submission carries one, and every ingest path
  // takes it from a third-party page. A raw fetch() here would reach whatever
  // that string names, including an address inside Supabase's own network.
  //
  // og-image was the only image-fetching function without this check - ten
  // others already use validateURLForSSRF, two of them for exactly this job.
  //
  // Failure returns null rather than throwing: the caller falls back to the
  // default card, which is what it already does for a dead or non-image URL.
  const check = validateURLForSSRF(url, { allowedProtocols: ["https:", "http:"], blockPrivateIPs: true });
  if (!check.valid) {
    console.warn(`[og-image] refused image URL: ${check.error}`);
    return null;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 5_000_000) return null; // guard giant images
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return `data:${ct};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

interface Card {
  title: string;
  badge: string;
  imageUrl: string | null;
  /** Past events are content-frozen → cache immutably; everything else refreshes hourly. */
  immutable?: boolean;
}

async function loadCard(supabase: ReturnType<typeof createClient>, type: string, id: string): Promise<Card | null> {
  const central = (d: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" }).format(new Date(d));
    } catch {
      return "";
    }
  };
  // BEST-EFFORT BY DESIGN (WEB-BE-032 AC3). Every branch below returns null on a
  // miss OR a read failure, and the caller renders the generic card - which is
  // the correct outcome for a social preview: a wrong card is worse than a
  // generic one, and there is nothing a share sheet can do with an error.
  //
  // THE OUTCOME IS UNCHANGED; THE SILENCE IS NOT. The errors used to be left
  // undestructured entirely, which conflated two decisions: what to RENDER on
  // failure, and whether to RECORD it. The first is settled - generic card. The
  // second was never argued for, and it costs nothing to get right: a renamed
  // column here degrades every shared link to a generic card, forever, with no
  // signal anywhere. moderate-content's isPaused makes exactly this split -
  // permissive return value, captured error - and it is the right shape.
  if (type === "event") {
    // event_start_utc is the timezone-correct source; `date` is the legacy fallback.
    const { data, error } = await supabase.from("events").select("title, date, event_start_utc, image_url, category").eq("id", id).maybeSingle();
    if (error) console.error(`[og-image] events read failed for ${id}; falling back to the generic card:`, error.message);
    if (!data) return null;
    const when = (data as any).event_start_utc || (data as any).date;
    let immutable = false;
    if (when) {
      const t = Date.parse(when);
      // Frozen once a day past the start (no further edits expected on old events).
      immutable = Number.isFinite(t) && t < Date.now() - 24 * 60 * 60 * 1000;
    }
    return { title: (data as any).title, badge: (when && central(when)) || (data as any).category || "Event", imageUrl: (data as any).image_url, immutable };
  }
  if (type === "restaurant") {
    const { data, error } = await supabase.from("restaurants").select("name, cuisine, rating, image_url").eq("id", id).maybeSingle();
    if (error) console.error(`[og-image] restaurants read failed for ${id}; falling back to the generic card:`, error.message);
    if (!data) return null;
    const r = (data as any).rating;
    return { title: (data as any).name, badge: r ? `★ ${Number(r).toFixed(1)} · ${(data as any).cuisine || "Restaurant"}` : ((data as any).cuisine || "Restaurant"), imageUrl: (data as any).image_url };
  }
  if (type === "attraction") {
    // attractions store the kind in `type` (not `category`); image in `image_url`.
    const { data, error } = await supabase.from("attractions").select("name, type, rating, image_url").eq("id", id).maybeSingle();
    if (error) console.error(`[og-image] attractions read failed for ${id}; falling back to the generic card:`, error.message);
    if (!data) return null;
    const r = (data as any).rating;
    const kind = (data as any).type || "Attraction";
    return { title: (data as any).name, badge: r ? `★ ${Number(r).toFixed(1)} · ${kind}` : kind, imageUrl: (data as any).image_url };
  }
  if (type === "article") {
    // articles store the hero image in `featured_image_url` (not `image_url`).
    const { data, error } = await supabase.from("articles").select("title, featured_image_url, category").eq("id", id).maybeSingle();
    if (error) console.error(`[og-image] articles read failed for ${id}; falling back to the generic card:`, error.message);
    if (!data) return null;
    return { title: (data as any).title, badge: (data as any).category || "Article", imageUrl: (data as any).featured_image_url };
  }
  return null;
}

function buildSvg(card: Card, imgDataUri: string | null, hasFont: boolean): string {
  const lines = wrapTitle(card.title);
  const titleSvg = hasFont
    ? lines
        .map((ln, i) => `<text x="72" y="${300 + i * 76}" font-family="Inter" font-size="64" font-weight="700" fill="#ffffff">${escapeXml(ln)}</text>`)
        .join("")
    : "";
  const badgeSvg = hasFont
    ? `<rect x="72" y="120" rx="24" ry="24" width="${Math.min(560, 60 + card.badge.length * 18)}" height="56" fill="rgba(255,255,255,0.18)"/>
       <text x="100" y="158" font-family="Inter" font-size="30" fill="#ffffff">${escapeXml(card.badge)}</text>`
    : "";
  const wordmark = hasFont
    ? `<text x="72" y="560" font-family="Inter" font-size="32" font-weight="700" fill="rgba(255,255,255,0.92)">Des Moines Insider</text>`
    : "";
  const photo = imgDataUri
    ? `<image href="${imgDataUri}" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="xMidYMid slice"/>
       <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#scrim)"/>`
    : "";
  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#db2777"/>
    </linearGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(15,15,30,0.25)"/>
      <stop offset="100%" stop-color="rgba(15,15,30,0.85)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  ${photo}
  ${badgeSvg}
  ${titleSvg}
  ${wordmark}
</svg>`;
}

function fallback(): Response {
  return new Response(null, { status: 302, headers: { Location: DEFAULT_OG, "Cache-Control": "public, max-age=300" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const rl = checkRateLimit(req, { max: 120, message: "og-image rate limit exceeded" });
  if (!rl.success) return rl.response!;

  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("og-image");
    const type = idx >= 0 ? parts[idx + 1] : undefined;
    const id = idx >= 0 ? parts[idx + 2] : undefined;
    if (!type || !id) return fallback();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const card = await loadCard(supabase, type, id);
    if (!card) return fallback();

    await ensureWasm();
    const [font, imgDataUri] = await Promise.all([getFont(), fetchImageDataUri(card.imageUrl)]);
    const svg = buildSvg(card, imgDataUri, !!font);

    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: WIDTH },
      font: font ? { fontBuffers: [font], loadSystemFonts: false, defaultFontFamily: "Inter" } : { loadSystemFonts: false },
    });
    const png = resvg.render().asPng();

    // Fall back to the PNG rather than the default card if re-encoding fails:
    // an oversized correct card beats a generic one.
    let body: Uint8Array = png;
    let contentType = "image/png";
    try {
      body = await (await Image.decode(png)).encodeJPEG(JPEG_QUALITY);
      contentType = "image/jpeg";
    } catch (e) {
      console.error("[og-image] jpeg re-encode failed, serving png:", e);
    }

    // Past events are content-frozen → cache for a year and mark immutable so CDNs
    // and clients never re-fetch; everything else refreshes hourly.
    const cacheControl = card.immutable
      ? "public, max-age=31536000, s-maxage=31536000, immutable"
      : "public, max-age=3600, s-maxage=3600";

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  } catch (err) {
    console.error("[og-image] render failed:", err);
    return fallback();
  }
});
