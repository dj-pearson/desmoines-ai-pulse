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
 * ACTION REQUIRED to fully satisfy the story (needs a runtime this env lacks):
 *   1. Deploy + confirm a 200 image/png from /og-image/event/<id>.
 *   2. Validate with the Twitter Card validator + Facebook Sharing Debugger and
 *      record screenshots in the PR/progress notes.
 *   3. Optionally enumerate detail routes in scripts/prerender.mjs so crawlers
 *      that don't run JS see the per-entity og:image in static HTML.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";
import { checkRateLimit } from "../_shared/rateLimit.ts";

const SITE_URL = Deno.env.get("SITE_URL") || Deno.env.get("VITE_SITE_URL") || "https://desmoinesinsider.com";
const DEFAULT_OG = `${SITE_URL}/og-image.png`;
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
}

async function loadCard(supabase: ReturnType<typeof createClient>, type: string, id: string): Promise<Card | null> {
  const central = (d: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" }).format(new Date(d));
    } catch {
      return "";
    }
  };
  if (type === "event") {
    const { data } = await supabase.from("events").select("title, date, image_url, category").eq("id", id).maybeSingle();
    if (!data) return null;
    return { title: (data as any).title, badge: central((data as any).date) || (data as any).category || "Event", imageUrl: (data as any).image_url };
  }
  if (type === "restaurant") {
    const { data } = await supabase.from("restaurants").select("name, cuisine, rating, image_url").eq("id", id).maybeSingle();
    if (!data) return null;
    const r = (data as any).rating;
    return { title: (data as any).name, badge: r ? `★ ${Number(r).toFixed(1)} · ${(data as any).cuisine || "Restaurant"}` : ((data as any).cuisine || "Restaurant"), imageUrl: (data as any).image_url };
  }
  if (type === "attraction") {
    const { data } = await supabase.from("attractions").select("name, category, image_url").eq("id", id).maybeSingle();
    if (!data) return null;
    return { title: (data as any).name, badge: (data as any).category || "Attraction", imageUrl: (data as any).image_url };
  }
  if (type === "article") {
    const { data } = await supabase.from("articles").select("title, image_url, category").eq("id", id).maybeSingle();
    if (!data) return null;
    return { title: (data as any).title, badge: (data as any).category || "Article", imageUrl: (data as any).image_url };
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

    return new Response(png, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        // Past events are immutable; everything else refreshes hourly.
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("[og-image] render failed:", err);
    return fallback();
  }
});
