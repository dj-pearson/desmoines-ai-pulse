/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (fills content fields via existing bounded enrichment
 *   functions; opens data tasks — no destructive writes).
 *
 * agent-data-quality (AOS-MAINT-004) — data-quality sweeper.
 *
 * Daily, per content table (events / restaurants / attractions):
 *  1. Reconcile — currently-gapped rows (missing image_url, coordinates, or
 *     SEO/GEO fields) are tracked in `data_quality_issues` (idempotent by
 *     row). Rows that are no longer gapped resolve; rows still gapped after
 *     MAX_ATTEMPTS escalate to a tier-2 data task with the reason.
 *  2. Auto-fill (tier-1) — triggers the existing enrichment functions
 *     (backfill-all-coordinates, backfill-images, generate-seo-content) in
 *     bounded batches, so external APIs (Google/Nominatim, image, LLM) stay
 *     rate-limited and within the agent's cost budget.
 *  3. Snapshot fill-rate for the digest trend.
 *
 * Detect-then-fill ordering means each run measures the effect of the previous
 * run's fills — attempt counts are honest.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";

const AGENT_KEY = "data-quality-sweeper";
const TABLES = ["events", "restaurants", "attractions"] as const;
const MAX_ATTEMPTS = 3;
const DETECT_LIMIT = 300; // cap tracked rows per table per run
const IMAGE_BATCH = 5;
const SEO_BATCH = 8;

// deno-lint-ignore no-explicit-any
type Client = any;
type Table = (typeof TABLES)[number];

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

interface GapRow {
  id: string;
  missing: string[];
}

async function countMissing(supabase: Client, table: Table, orFilter: string): Promise<number> {
  const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).or(orFilter);
  return count ?? 0;
}

// Rows with any content gap (bounded). Returns each row's missing-field list.
async function detectGaps(supabase: Client, table: Table): Promise<GapRow[]> {
  const { data, error: gapsError } = await supabase
    .from(table)
    .select("id, image_url, latitude, longitude, seo_title, geo_summary")
    .or("image_url.is.null,latitude.is.null,longitude.is.null,seo_title.is.null,geo_summary.is.null")
    .limit(DETECT_LIMIT);
  // WEB-BE-032. THE work list: rows with a gap to repair. A dropped error
  // found no gaps and reported a clean sweep.
  if (gapsError) throw new Error(`data-quality: gap scan of ${table} failed: ${gapsError.message}`);
  const rows = (data ?? []) as {
    id: string;
    image_url: string | null;
    latitude: number | null;
    longitude: number | null;
    seo_title: string | null;
    geo_summary: string | null;
  }[];
  return rows.map((r) => {
    const missing: string[] = [];
    if (!r.image_url) missing.push("image_url");
    if (r.latitude == null || r.longitude == null) missing.push("coordinates");
    if (!r.seo_title) missing.push("seo");
    if (!r.geo_summary) missing.push("geo");
    return { id: r.id, missing };
  }).filter((r) => r.missing.length > 0);
}

async function invokeFn(name: string, body: unknown): Promise<string | null> {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
        "x-trigger-source": "data-quality-sweeper",
      },
      body: JSON.stringify(body ?? {}),
    });
    return res.ok ? null : `${name} ${res.status}`;
  } catch (err) {
    return `${name}: ${(err as Error)?.message ?? "invoke error"}`;
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  const supabase: Client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    const nowIso = new Date().toISOString();
    let escalated = 0;
    let resolved = 0;
    const perTable: Record<string, unknown> = {};
    const fillErrors: string[] = [];

    for (const table of TABLES) {
      // ── 1) Reconcile issue tracker against current gaps ──────────────────
      const gaps = await detectGaps(supabase, table);
      const gapById = new Map(gaps.map((g) => [g.id, g]));

      const { data: openIssues, error: openIssuesError } = await supabase
        .from("data_quality_issues")
        .select("id, row_id, attempts, status")
        .eq("target_table", table)
        .in("status", ["open", "escalated"]);
      // DEDUPE GUARD, so it fails CLOSED. openByRow is what stops a row that
      // already has an open issue getting another one, and what carries its
      // attempt count. A dropped error emptied the map, so every gap looked new:
      // duplicate data_quality_issues rows and an attempt counter reset to zero,
      // which is how a row retries forever. Skip the table this run instead.
      if (openIssuesError) {
        console.error(`data-quality: open-issue read failed for ${table}; skipping to avoid duplicates: ${openIssuesError.message}`);
        continue;
      }
      const open = (openIssues ?? []) as { id: string; row_id: string; attempts: number; status: string }[];
      const openByRow = new Map(open.map((i) => [i.row_id, i]));

      // Resolve issues whose rows are no longer gapped.
      for (const issue of open) {
        if (!gapById.has(issue.row_id)) {
          await supabase
            .from("data_quality_issues")
            .update({ status: "resolved", resolved_at: nowIso })
            .eq("id", issue.id);
          resolved++;
        }
      }

      // Upsert / advance issues for currently-gapped rows.
      for (const g of gaps) {
        const existing = openByRow.get(g.id);
        if (!existing) {
          await supabase.from("data_quality_issues").insert({
            target_table: table,
            row_id: g.id,
            missing_fields: g.missing,
            attempts: 1,
            last_attempt_at: nowIso,
          });
          continue;
        }
        const attempts = existing.attempts + 1;
        const shouldEscalate = attempts >= MAX_ATTEMPTS && existing.status !== "escalated";
        await supabase
          .from("data_quality_issues")
          .update({
            attempts,
            missing_fields: g.missing,
            last_attempt_at: nowIso,
            status: shouldEscalate ? "escalated" : existing.status,
          })
          .eq("id", existing.id);
        if (shouldEscalate) {
          const task = await createAgentTask(supabase, {
            agentKey: AGENT_KEY,
            category: "maintain",
            title: `Data gap unfixable: ${table} row missing ${g.missing.join(", ")} after ${attempts} attempts`,
            confidence: 0,
            forceTier: 2,
            dedupeKey: `dq:${table}:${g.id}`,
            payload: { table, rowId: g.id, missing: g.missing, attempts },
          });
          if (task.ok) {
            escalated++;
            ctx.escalated(1);
          }
        }
      }

      // ── 2) Auto-fill (tier-1) via existing enrichment fns, bounded ───────
      const needImage = gaps.some((g) => g.missing.includes("image_url"));
      const needSeoGeo = gaps.some((g) => g.missing.includes("seo") || g.missing.includes("geo"));
      if (needImage) {
        const e = await invokeFn("backfill-images", { table, limit: IMAGE_BATCH });
        if (e) fillErrors.push(e);
      }
      if (needSeoGeo) {
        const e = await invokeFn("generate-seo-content", { contentType: table, batchSize: SEO_BATCH });
        if (e) fillErrors.push(e);
      }

      // ── 3) Fill-rate snapshot ────────────────────────────────────────────
      const [total, missImage, missCoords, missSeo, missGeo] = await Promise.all([
        (async () => {
          const { count } = await supabase.from(table).select("id", { count: "exact", head: true });
          return count ?? 0;
        })(),
        countMissing(supabase, table, "image_url.is.null"),
        countMissing(supabase, table, "latitude.is.null,longitude.is.null"),
        countMissing(supabase, table, "seo_title.is.null"),
        countMissing(supabase, table, "geo_summary.is.null"),
      ]);
      const gappedNow = gaps.length; // rows with any gap (bounded to DETECT_LIMIT)
      const fillRate = total > 0 ? Math.max(0, 1 - Math.min(total, gappedNow) / total) : 1;
      await supabase.from("data_quality_snapshots").insert({
        table_name: table,
        total,
        missing_image: missImage,
        missing_coords: missCoords,
        missing_seo: missSeo,
        missing_geo: missGeo,
        fill_rate: Math.round(fillRate * 1000) / 1000,
      });
      perTable[table] = { total, missImage, missCoords, missSeo, missGeo, fillRate: Math.round(fillRate * 100) };
    }

    // Coordinates: one bounded pass across all tables (the fn iterates tables).
    const coordErr = await invokeFn("backfill-all-coordinates", {});
    if (coordErr) fillErrors.push(coordErr);

    ctx.processed(TABLES.length);
    ctx.summary(`data-quality sweep: ${resolved} resolved, ${escalated} escalated; ${fillErrors.length} fill error(s)`);
    ctx.meta({ perTable, resolved, escalated, fillErrors });
    return { resolved, escalated, perTable };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
