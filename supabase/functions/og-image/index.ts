/**
 * og-image (WEB-FEAT-008)
 *
 * Renders a branded 1200x630 PNG social-share card for an event / restaurant /
 * attraction / article so shared links show a rich preview instead of the
 * generic site image. Self-running marketing infra — no admin touches.
 *
 *   GET /functions/v1/og-image/<type>/<id>
 *   GET /functions/v1/og-image?type=<type>&id=<id>
 *
 * Rendering is BEST-EFFORT (satori -> SVG, resvg-wasm -> PNG, fonts fetched from
 * a CDN). On ANY failure (font fetch, wasm init, missing row, unsupported
 * thumbnail) the function 302-redirects to a real fallback image — the content's
 * own image_url (right-sized via image-transform) or the static brand OG image —
 * so the social card is never broken. Public by design (verify_jwt=false): the
 * crawler that fetches og:image presents no JWT.
 *
 * BACKWARD COMPAT: new endpoint, additive only. Caching is aggressive (immutable
 * for past events, ~1h otherwise) + ETag/304 so crawlers and CDNs rarely
 * re-render. Per-IP persistent rate limit (fails open) bounds render cost.
 */
// @ts-nocheck — Deno edge runtime (remote ESM imports not resolvable by the web tsconfig)
import satori from "https://esm.sh/satori@0.10.13";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkRateLimitPersistent } from "../_shared/rateLimit.ts";

const WIDTH = 1200;
const HEIGHT = 630;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE_URL =
  Deno.env.get("SITE_URL") ??
  Deno.env.get("VITE_SITE_URL") ??
  "https://desmoinesinsider.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, if-none-match",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

// Brand palette (mirrors src/lib/brandConfig themeColor + a warm accent).
const BRAND_NAME = "Des Moines Insider";
const BRAND_DOMAIN = "desmoinesinsider.com";
const GRADIENT = "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 55%, #7c3aed 100%)";

interface ContentType {
  table: string;
  titleCol: string;
  imgCol: string;
  badgeCol?: string;
  ratingCol?: string;
  dateCol?: string;
  ogType: string;
  kicker: string;
}

const TYPES: Record<string, ContentType> = {
  event: {
    table: "events",
    titleCol: "title",
    imgCol: "image_url",
    badgeCol: "category",
    dateCol: "event_start_utc",
    ogType: "event",
    kicker: "EVENT",
  },
  restaurant: {
    table: "restaurants",
    titleCol: "name",
    imgCol: "image_url",
    badgeCol: "cuisine",
    ratingCol: "rating",
    ogType: "restaurant",
    kicker: "RESTAURANT",
  },
  attraction: {
    table: "attractions",
    titleCol: "name",
    imgCol: "image_url",
    badgeCol: "type",
    ratingCol: "rating",
    ogType: "attraction",
    kicker: "THINGS TO DO",
  },
  article: {
    table: "articles",
    titleCol: "title",
    imgCol: "featured_image_url",
    ogType: "article",
    kicker: "GUIDE",
  },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- Lazy, cached one-time setup (survives warm isolates) --------------------

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm(
      fetch("https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm"),
    );
  }
  return wasmReady;
}

let fontsPromise: Promise<unknown[]> | null = null;
function loadFonts(): Promise<unknown[]> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      // @fontsource ships satori-compatible .woff on a stable, versioned CDN.
      const base = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files";
      const [regular, bold] = await Promise.all([
        fetch(`${base}/inter-latin-400-normal.woff`).then((r) => r.arrayBuffer()),
        fetch(`${base}/inter-latin-700-normal.woff`).then((r) => r.arrayBuffer()),
      ]);
      return [
        { name: "Inter", data: regular, weight: 400, style: "normal" },
        { name: "Inter", data: bold, weight: 700, style: "normal" },
      ];
    })();
  }
  return fontsPromise;
}

// ---- Helpers -----------------------------------------------------------------

function el(type: string, props: Record<string, unknown>, children?: unknown) {
  return { type, props: { ...props, ...(children !== undefined ? { children } : {}) } };
}

function truncate(s: string, max: number): string {
  const t = (s || "").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function formatEventDate(value?: string | null): string | null {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return null;
  }
}

/** Fetch the content image and inline it as a data URL satori can render. */
async function fetchThumbnail(url?: string | null): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    // satori/resvg reliably rasterize JPEG + PNG only; skip webp/avif/svg.
    if (!ct.includes("jpeg") && !ct.includes("jpg") && !ct.includes("png")) {
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 6 * 1024 * 1024) return null; // 6MB cap
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const mime = ct.includes("png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

function buildCard(opts: {
  kicker: string;
  badge?: string | null;
  title: string;
  meta?: string | null;
  thumb?: string | null;
}) {
  const { kicker, badge, title, meta, thumb } = opts;

  const leftChildren: unknown[] = [
    // Brand row
    el(
      "div",
      { style: { display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700, letterSpacing: "0.5px" } },
      BRAND_NAME,
    ),
    // Kicker / category badge
    el(
      "div",
      { style: { display: "flex", alignItems: "center", marginTop: 28 } },
      el(
        "div",
        {
          style: {
            display: "flex",
            backgroundColor: "rgba(255,255,255,0.18)",
            borderRadius: 999,
            padding: "10px 22px",
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "1px",
          },
        },
        truncate(badge ? `${kicker} · ${badge.toUpperCase()}` : kicker, 36),
      ),
    ),
    // Title
    el(
      "div",
      {
        style: {
          display: "flex",
          marginTop: 28,
          fontSize: title.length > 48 ? 58 : 72,
          fontWeight: 700,
          lineHeight: 1.08,
          maxWidth: thumb ? 700 : 1040,
        },
      },
      truncate(title, 92),
    ),
  ];

  if (meta) {
    leftChildren.push(
      el(
        "div",
        { style: { display: "flex", marginTop: 26, fontSize: 32, fontWeight: 400, opacity: 0.95 } },
        truncate(meta, 60),
      ),
    );
  }

  const topRow = el(
    "div",
    { style: { display: "flex", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", width: "100%" } },
    [
      el("div", { style: { display: "flex", flexDirection: "column", flex: 1 } }, leftChildren),
      ...(thumb
        ? [
            el("div", {
              style: {
                display: "flex",
                width: 320,
                height: 320,
                marginLeft: 40,
                borderRadius: 28,
                overflow: "hidden",
                border: "6px solid rgba(255,255,255,0.85)",
              },
              children: el("img", {
                src: thumb,
                width: 320,
                height: 320,
                style: { objectFit: "cover", width: 320, height: 320 },
              }),
            }),
          ]
        : []),
    ],
  );

  const footer = el(
    "div",
    { style: { display: "flex", alignItems: "center", fontSize: 28, fontWeight: 700, opacity: 0.92 } },
    BRAND_DOMAIN,
  );

  return el(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        padding: "64px",
        backgroundImage: GRADIENT,
        color: "#ffffff",
        fontFamily: "Inter",
      },
    },
    [topRow, footer],
  );
}

function fallback(imageUrl?: string | null): Response {
  let target: string;
  if (imageUrl && /^https?:\/\//i.test(imageUrl) && SUPABASE_URL) {
    const u = new URL(`${SUPABASE_URL}/functions/v1/image-transform`);
    u.searchParams.set("url", imageUrl);
    u.searchParams.set("width", String(WIDTH));
    u.searchParams.set("format", "jpeg");
    target = u.toString();
  } else {
    target = `${SITE_URL}/og-image.png`;
  }
  return new Response(null, {
    status: 302,
    headers: { ...CORS, Location: target, "Cache-Control": "public, max-age=600" },
  });
}

// ---- Handler -----------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  // Generous per-IP persistent limit; fails OPEN so previews never break.
  const rl = await checkRateLimitPersistent(req, {
    endpoint: "og-image",
    windowMs: 60 * 1000,
    max: 120,
    message: "OG image rate limit exceeded.",
  });
  if (!rl.success) {
    return new Response(
      JSON.stringify({ error: "OG image rate limit exceeded." }),
      { status: 429, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const url = new URL(req.url);
  const segs = url.pathname.split("/").filter(Boolean);
  const i = segs.indexOf("og-image");
  let rawType = (i >= 0 ? segs[i + 1] : undefined) ?? url.searchParams.get("type") ?? "";
  let id = (i >= 0 ? segs[i + 2] : undefined) ?? url.searchParams.get("id") ?? "";
  rawType = rawType.toLowerCase().replace(/s$/, "");
  id = decodeURIComponent(id);

  const cfg = TYPES[rawType];
  if (!cfg || !id) return fallback();
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return fallback();

  // Fetch the row.
  let row: Record<string, unknown> | null = null;
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const col = UUID_RE.test(id) ? "id" : "slug";
    const { data } = await supabase
      .from(cfg.table)
      .select("*")
      .eq(col, id)
      .maybeSingle();
    row = (data as Record<string, unknown>) ?? null;
  } catch {
    row = null;
  }
  if (!row) return fallback();

  const title = String(row[cfg.titleCol] ?? "").trim();
  const imageUrl = (row[cfg.imgCol] as string | null) ?? null;
  if (!title) return fallback(imageUrl);

  // Determine cache strategy + ETag.
  const dateVal = cfg.dateCol ? (row[cfg.dateCol] as string | null) : null;
  const eventDate = formatEventDate(dateVal) ?? formatEventDate(row.date as string | null);
  const isPastEvent =
    rawType === "event" && !!dateVal && new Date(dateVal).getTime() < Date.now();
  const cacheControl = isPastEvent
    ? "public, max-age=31536000, immutable"
    : "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";
  const stamp = String(row.updated_at ?? row.created_at ?? "");
  const etag = `"og-${rawType}-${id}-${stamp.slice(0, 24)}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { ...CORS, ETag: etag, "Cache-Control": cacheControl },
    });
  }

  // Build the meta line (date for events; rating for places).
  let meta: string | null = null;
  if (rawType === "event") {
    meta = eventDate;
  } else if (cfg.ratingCol && row[cfg.ratingCol] != null) {
    const r = Number(row[cfg.ratingCol]);
    if (!isNaN(r) && r > 0) meta = `Rated ${r.toFixed(1)} / 5`;
  }

  try {
    const [fonts] = await Promise.all([loadFonts(), ensureWasm()]);
    const thumb = await fetchThumbnail(imageUrl);
    const tree = buildCard({
      kicker: cfg.kicker,
      badge: cfg.badgeCol ? (row[cfg.badgeCol] as string | null) : null,
      title,
      meta,
      thumb,
    });
    const svg = await satori(tree as unknown, { width: WIDTH, height: HEIGHT, fonts });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } })
      .render()
      .asPng();

    if (req.method === "HEAD") {
      return new Response(null, {
        headers: { ...CORS, "Content-Type": "image/png", ETag: etag, "Cache-Control": cacheControl },
      });
    }
    return new Response(png, {
      headers: {
        ...CORS,
        "Content-Type": "image/png",
        "Cache-Control": cacheControl,
        ETag: etag,
      },
    });
  } catch (err) {
    console.error("og-image render failed:", err instanceof Error ? err.message : err);
    return fallback(imageUrl);
  }
});
