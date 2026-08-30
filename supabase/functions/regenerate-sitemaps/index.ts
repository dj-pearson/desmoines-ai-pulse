/**
 * regenerate-sitemaps (WEB-AUTO-011)
 *
 * Event-driven sitemap regeneration. Drains the sitemap_change_queue (populated
 * by triggers on events/restaurants/attractions/articles), regenerates the
 * per-table sitemap XML files, writes them to the public `sitemaps` storage
 * bucket, and submits the changed URLs to IndexNow. Wrapped in the
 * WEB-AUTO-001 jobRunner so runs are observable and failures alert.
 *
 * The XML structure mirrors scripts/generate-dynamic-sitemaps.ts (the build-time
 * generator) so the storage copies are drop-in consistent with the deployed
 * static fallback. Unlike the build script, hidden/expired events (WEB-AUTO-006)
 * are excluded here so they drop out of the sitemap on the same cycle.
 *
 * Auth: verify_jwt=false in config.toml; this function does its own auth via
 * requireAdminOrApiKey (cron service-role key or admin JWT).
 *
 * Trigger: pg_cron every 6h, or invoke manually from the admin tools.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob } from "../_shared/jobRunner.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { submitToIndexNow } from "../_shared/indexNow.ts";

const BASE_URL =
  Deno.env.get("SITE_URL") || Deno.env.get("VITE_SITE_URL") || "https://desmoinesinsider.com";
const BUCKET = "sitemaps";
const CENTRAL_TZ = "America/Chicago";

interface SitemapUrl {
  loc: string;
  lastmod: string;
  changefreq: string;
  priority: string;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

function slugify(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Event slug = title-slug + Central-Time date (matches the app + build script). */
function eventSlug(title: string, ev: { date?: string | null; event_start_utc?: string | null }): string {
  const titleSlug = slugify(title);
  const dateToUse = ev.event_start_utc || ev.date;
  if (!dateToUse) return titleSlug;
  try {
    // Format the UTC instant in Central Time as YYYY-MM-DD.
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: CENTRAL_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(dateToUse));
    return `${titleSlug}-${ymd}`;
  } catch {
    return titleSlug;
  }
}

const today = () => new Date().toISOString().split("T")[0];

function buildXml(urls: SitemapUrl[]): string {
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

type Supa = ReturnType<typeof createClient>;

/** Builds the per-table URL set + the canonical URLs for each row (for pinging). */
async function buildSitemaps(supabase: Supa) {
  const now = today();
  const sitemaps: Record<string, string> = {};
  const urlIndex = new Map<string, Map<string, string>>(); // type -> (id -> loc)

  // Events (exclude hidden/stale — WEB-AUTO-006)
  const evIndex = new Map<string, string>();
  {
    const { data, error } = await supabase
      .from("events")
      .select("id, title, date, event_start_utc, updated_at")
      .neq("is_hidden", true)
      .order("date", { ascending: false })
      .limit(5000);
    // THROW, do not fall back to an empty list. Every read in this builder
    // feeds a file that is then WRITTEN over the live sitemap, so a dropped
    // error publishes a sitemap with zero events in it and delists the whole
    // section from every crawler. Failing the job leaves the previous sitemap
    // in place, which is the correct outcome of a failed regeneration
    // (WEB-BE-032 AC2).
    if (error) throw new Error(`events read failed: ${error.message}`);
    const urls: SitemapUrl[] = (data ?? []).map((e: any) => {
      const loc = `${BASE_URL}/events/${eventSlug(e.title, e)}`;
      evIndex.set(e.id, loc);
      return {
        loc,
        lastmod: (e.updated_at || now).split("T")[0],
        changefreq: "weekly",
        priority: "0.7",
      };
    });
    if (urls.length === 0) urls.push({ loc: `${BASE_URL}/events`, lastmod: now, changefreq: "daily", priority: "0.9" });
    sitemaps["sitemap-events.xml"] = buildXml(urls);
  }
  urlIndex.set("event", evIndex);

  // Restaurants
  const rIndex = new Map<string, string>();
  {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, name, slug, is_featured, updated_at")
      .order("name")
      .limit(5000);
    if (error) throw new Error(`restaurants read failed: ${error.message}`);
    const urls: SitemapUrl[] = (data ?? []).map((r: any) => {
      const loc = `${BASE_URL}/restaurants/${r.slug || slugify(r.name)}`;
      rIndex.set(r.id, loc);
      return {
        loc,
        lastmod: (r.updated_at || now).split("T")[0],
        changefreq: "monthly",
        priority: r.is_featured ? "0.8" : "0.6",
      };
    });
    if (urls.length === 0) urls.push({ loc: `${BASE_URL}/restaurants`, lastmod: now, changefreq: "weekly", priority: "0.8" });
    sitemaps["sitemap-restaurants.xml"] = buildXml(urls);
  }
  urlIndex.set("restaurant", rIndex);

  // Attractions
  const aIndex = new Map<string, string>();
  {
    const { data, error } = await supabase
      .from("attractions")
      .select("id, name, updated_at")
      .order("name");
    if (error) throw new Error(`attractions read failed: ${error.message}`);
    const urls: SitemapUrl[] = (data ?? []).map((a: any) => {
      const loc = `${BASE_URL}/attractions/${slugify(a.name)}`;
      aIndex.set(a.id, loc);
      return {
        loc,
        lastmod: (a.updated_at || now).split("T")[0],
        changefreq: "monthly",
        priority: "0.7",
      };
    });
    if (urls.length === 0) urls.push({ loc: `${BASE_URL}/attractions`, lastmod: now, changefreq: "monthly", priority: "0.7" });
    sitemaps["sitemap-attractions.xml"] = buildXml(urls);
  }
  urlIndex.set("attraction", aIndex);

  // Articles (published)
  const artIndex = new Map<string, string>();
  {
    const { data, error } = await supabase
      .from("articles")
      .select("id, slug, status, updated_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`articles read failed: ${error.message}`);
    const urls: SitemapUrl[] = (data ?? [])
      .filter((a: any) => !a.status || a.status === "published")
      .map((a: any) => {
        const loc = `${BASE_URL}/articles/${a.slug || a.id}`;
        artIndex.set(a.id, loc);
        return {
          loc,
          lastmod: (a.updated_at || a.created_at || now).split("T")[0],
          changefreq: "weekly",
          priority: "0.8",
        };
      });
    if (urls.length === 0) urls.push({ loc: `${BASE_URL}/articles`, lastmod: now, changefreq: "weekly", priority: "0.8" });
    sitemaps["sitemap-articles.xml"] = buildXml(urls);
  }
  urlIndex.set("article", artIndex);

  // Index referencing the regenerated children + the committed static sitemap.
  sitemaps["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${BASE_URL}/sitemap-static.xml</loc><lastmod>${now}</lastmod></sitemap>
  <sitemap><loc>${BASE_URL}/sitemap-events.xml</loc><lastmod>${now}</lastmod></sitemap>
  <sitemap><loc>${BASE_URL}/sitemap-restaurants.xml</loc><lastmod>${now}</lastmod></sitemap>
  <sitemap><loc>${BASE_URL}/sitemap-attractions.xml</loc><lastmod>${now}</lastmod></sitemap>
  <sitemap><loc>${BASE_URL}/sitemap-articles.xml</loc><lastmod>${now}</lastmod></sitemap>
</sitemapindex>`;

  return { sitemaps, urlIndex };
}

/**
 * Best-effort submit of changed URLs to the Google Indexing API. Only runs when
 * GOOGLE_SERVICE_ACCOUNT_JSON is configured; otherwise returns skipped. Never throws.
 */
async function submitToIndexingApi(urls: string[]): Promise<Record<string, unknown>> {
  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!saJson || urls.length === 0) return { skipped: true, reason: !saJson ? "no_service_account" : "no_urls" };
  try {
    const sa = JSON.parse(saJson);
    const now = Math.floor(Date.now() / 1000);
    const enc = (data: Uint8Array | string) => {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    const header = enc(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = enc(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/indexing",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }));
    const signingInput = `${header}.${payload}`;
    const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
    const keyBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
    const jwt = `${signingInput}.${enc(new Uint8Array(sig))}`;
    const tokenRes = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    });
    if (!tokenRes.ok) return { skipped: false, error: `token ${tokenRes.status}` };
    const { access_token } = await tokenRes.json();
    // Google Indexing API quota is 200/day — cap and submit.
    const capped = urls.slice(0, 200);
    let ok = 0;
    for (const url of capped) {
      try {
        const r = await fetchWithTimeout("https://indexing.googleapis.com/v3/urlNotifications:publish", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` },
          body: JSON.stringify({ url, type: "URL_UPDATED" }),
        });
        if (r.ok) ok++;
      } catch { /* per-url best-effort */ }
    }
    return { submitted: capped.length, success: ok };
  } catch (err) {
    return { skipped: false, error: err instanceof Error ? err.message : String(err) };
  }
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const job = await runJob("regenerate-sitemaps", async (ctx) => {
    // 1. Claim the unprocessed change queue (best-effort; queue is an optimization
    //    signal — we always do a full regen so a missed row never stales the map).
    const { data: pending, error: pendingError } = await supabase
      .from("sitemap_change_queue")
      .select("id, content_type, content_id, action")
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(2000);
    // Genuinely best-effort, unlike the reads in buildSitemaps: the queue is an
    // optimisation signal and a full regen happens either way, so an empty
    // queue costs nothing (WEB-BE-032 AC3). Logged so a queue table that has
    // gone unreadable does not stay invisible forever.
    if (pendingError) {
      console.warn(`[regenerate-sitemaps] change queue unreadable: ${pendingError.message}`);
    }
    const queue = pending ?? [];

    // 2. Regenerate every sitemap file and capture per-row canonical URLs.
    const { sitemaps, urlIndex } = await buildSitemaps(supabase);

    // 3. Write the files to the public storage bucket.
    let written = 0;
    for (const [name, xml] of Object.entries(sitemaps)) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(name, new Blob([xml], { type: "application/xml" }), {
          upsert: true,
          contentType: "application/xml",
          cacheControl: "300",
        });
      if (error) throw new Error(`upload ${name} failed: ${error.message}`);
      written++;
    }
    ctx.processed(written);

    // 4. Resolve canonical URLs for the changed (upsert) rows for indexing.
    const changedUrls = new Set<string>();
    for (const row of queue) {
      if (row.action === "delete") continue; // deletions just drop from the regen
      const loc = urlIndex.get(row.content_type)?.get(row.content_id);
      if (loc) changedUrls.add(loc);
    }

    // 5. Notify search engines about the URLs that actually changed.
    //
    // This used to GET the Google and Bing sitemap-ping endpoints. Both are
    // dead — 404 "Sitemaps ping is deprecated" and 410 Gone respectively — so
    // the job was reporting two failed calls as its notification step. See
    // _shared/indexNow.ts. IndexNow covers Bing/Yandex/Naver/Seznam with the
    // specific changed URLs; Google is covered by the `lastmod` values in the
    // sitemaps written in step 3, plus the Indexing API below where a service
    // account is configured.
    const indexnow = await submitToIndexNow(BASE_URL, [...changedUrls]);
    const indexing = await submitToIndexingApi([...changedUrls]);

    // 6. Drain the queue.
    if (queue.length > 0) {
      const ids = queue.map((q: any) => q.id);
      await supabase
        .from("sitemap_change_queue")
        .update({ processed_at: new Date().toISOString() })
        .in("id", ids);
    }

    ctx.meta({
      files_written: written,
      queue_drained: queue.length,
      changed_urls: changedUrls.size,
      indexnow,
      indexing,
      base_url: BASE_URL,
    });

    return { written, queueDrained: queue.length, changedUrls: changedUrls.size, indexnow, indexing };
  });

  return new Response(JSON.stringify({ ok: job.ok, status: job.status, runId: job.runId, result: job.result, error: job.error }), {
    status: job.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
