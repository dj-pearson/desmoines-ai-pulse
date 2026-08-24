/**
 * agent data-quality-sweeper (AOS-MAINT-004) — data-quality sweeper.
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
 *
 * Consolidated into `agent-runner` (was `agent-data-quality/index.ts`).
 */
import { createAgentTask } from "../agentTasks.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "data-quality-sweeper";
const TABLES = ["events", "restaurants", "attractions"] as const;
const MAX_ATTEMPTS = 3;
const DETECT_LIMIT = 300; // cap tracked rows per table per run
const IMAGE_BATCH = 5;
const SEO_BATCH = 8;

// deno-lint-ignore no-explicit-any
type Client = any;
type Table = (typeof TABLES)[number];

interface GapRow {
  id: string;
  missing: string[];
}

/**
 * null means "could not read". fill_rate is computed as 1 - missing/total and
 * published to data_quality_snapshots, which the ops digest reads back. With
 * `count ?? 0` a failed missing-count published a PERFECT fill rate and a
 * failed total published a division by zero - both from a query that never ran.
 */
async function countMissing(supabase: Client, table: Table, orFilter: string): Promise<number | null> {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).or(orFilter);
  if (error) {
    console.error(`[data-quality-sweeper] countMissing(${table}) failed:`, error.message);
    return null;
  }
  return count ?? 0;
}

// Rows with any content gap (bounded). Returns each row's missing-field list.
async function detectGaps(supabase: Client, table: Table): Promise<GapRow[]> {
  const { data } = await supabase
    .from(table)
    .select("id, image_url, latitude, longitude, seo_title, geo_summary")
    .or("image_url.is.null,latitude.is.null,longitude.is.null,seo_title.is.null,geo_summary.is.null")
    .limit(DETECT_LIMIT);
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

export const run: AgentRun = async (ctx, { supabase }) => {
  const nowIso = new Date().toISOString();
  let escalated = 0;
  let resolved = 0;
  const perTable: Record<string, unknown> = {};
  const fillErrors: string[] = [];
  const unmeasured: string[] = [];

  for (const table of TABLES) {
    // ── 1) Reconcile issue tracker against current gaps ──────────────────
    const gaps = await detectGaps(supabase, table);
    const gapById = new Map(gaps.map((g) => [g.id, g]));

    const { data: openIssues } = await supabase
      .from("data_quality_issues")
      .select("id, row_id, attempts, status")
      .eq("target_table", table)
      .in("status", ["open", "escalated"]);
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
        const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
        if (error) {
          console.error(`[data-quality-sweeper] total(${table}) failed:`, error.message);
          return null;
        }
        return count ?? 0;
      })(),
      countMissing(supabase, table, "image_url.is.null"),
      countMissing(supabase, table, "latitude.is.null,longitude.is.null"),
      countMissing(supabase, table, "seo_title.is.null"),
      countMissing(supabase, table, "geo_summary.is.null"),
    ]);
    const gappedNow = gaps.length; // rows with any gap (bounded to DETECT_LIMIT)

    // A SNAPSHOT NOBODY COULD MEASURE IS NOT WRITTEN. The old code took
    // `count ?? 0` for all five numbers and then computed
    //     total > 0 ? 1 - gapped/total : 1
    // so a failed total published fill_rate 1.000 - a PERFECT score - and a
    // failed missing-count published a perfect one too. data_quality_snapshots
    // feeds the ops digest's "fill rate" line, so a broken read became a
    // published claim that the data is complete. A gap in the series is
    // legible; a fabricated 100% is not.
    if (total === null || missImage === null || missCoords === null || missSeo === null || missGeo === null) {
      unmeasured.push(table);
      console.error(`[data-quality-sweeper] skipping ${table} snapshot - one or more counts unreadable`);
      continue;
    }

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
  ctx.summary(
    `data-quality sweep: ${resolved} resolved, ${escalated} escalated; ${fillErrors.length} fill error(s)` +
      (unmeasured.length ? `; ${unmeasured.length} table(s) UNMEASURED (${unmeasured.join(", ")})` : ""),
  );
  ctx.meta({ perTable, resolved, escalated, fillErrors, unmeasured });
  return { resolved, escalated, perTable, unmeasured };
};
