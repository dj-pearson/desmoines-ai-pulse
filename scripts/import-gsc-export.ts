#!/usr/bin/env tsx
/**
 * Load a manual Search Console export into public.gsc_export_performance (SEO-050).
 *
 *   npx tsx scripts/import-gsc-export.ts <export-folder> [--dry-run] [--replace]
 *                                        [--property sc-domain:desmoinesinsider.com]
 *
 * <export-folder> is the unzipped "Performance on Search" export, e.g.
 * Keyword/desmoinesinsider.com-Performance-on-Search-2026-09-30. Keyword/ is
 * gitignored, so it lives in the main checkout rather than in a worktree; a
 * bare folder name is looked up there.
 *
 * WHY A SEPARATE TABLE. Queries.csv and Pages.csv are aggregates over the whole
 * export range. gsc_keyword_performance and gsc_page_performance are daily, and
 * at least nine readers sum them across dates, so writing a 91-day aggregate
 * into them would inflate every reader and collide with the real daily row on
 * the unique key. The migration 20261018000050 records the detail.
 *
 * FALLBACK, NOT THE PRIMARY PATH. gsc-sync-data runs daily from pg_cron
 * (gsc-sync-daily). This exists for when the grant lapses: an export taken by
 * hand still gets into the database while someone redoes the OAuth consent.
 *
 * ADDITIVE AND IDEMPOTENT. Rows are keyed by (property_url, dimension,
 * search_type, range_start, range_end, key). A range that is already loaded is
 * skipped; --replace updates its values in place. Nothing is ever deleted.
 *
 * Writes through the Management API (SUPABASE_ACCESS_TOKEN from the
 * environment or .env), the same path generate-prerender-priority.mjs reads
 * through, because the table is admin-only under RLS and anon sees nothing.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  parseChartRange,
  parseDimensionCsv,
  parseFilters,
  totalsOf,
  type GscExportRow,
} from "../src/lib/gscExport";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "wtkhfqpmcegzcbngroui";
const BATCH = 500;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const DRY_RUN = process.argv.includes("--dry-run");
const REPLACE = process.argv.includes("--replace");
const PROPERTY_URL = arg("--property") || "sc-domain:desmoinesinsider.com";
const folderArg = process.argv
  .slice(2)
  .filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--property")[0];

/** Worktrees live at <main>/.claude/worktrees/<name>; Keyword/ is in <main>. */
function mainCheckout(): string {
  const marker = `${join(".claude", "worktrees")}`;
  const i = ROOT.indexOf(marker);
  return i >= 0 ? ROOT.slice(0, i - 1) : ROOT;
}

function resolveFolder(input: string): string {
  const candidates = isAbsolute(input)
    ? [input]
    : [resolve(input), join(ROOT, "Keyword", input), join(mainCheckout(), "Keyword", input), join(mainCheckout(), input)];
  const hit = candidates.find((c) => existsSync(join(c, "Queries.csv")));
  if (!hit) throw new Error(`No Queries.csv under any of:\n  ${candidates.join("\n  ")}`);
  return hit;
}

function readEnv(name: string): string | null {
  if (process.env[name]) return process.env[name] as string;
  for (const dir of [ROOT, mainCheckout()]) {
    const file = join(dir, ".env");
    if (!existsSync(file)) continue;
    const line = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return null;
}

async function sql<T = Record<string, unknown>>(token: string, query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text) as T[];
}

/** Dollar-quoted literal with a random tag, so no value in the data can close it. */
function dollarQuote(value: string): string {
  let tag: string;
  do tag = `$gsc_${randomBytes(6).toString("hex")}$`;
  while (value.includes(tag));
  return `${tag}${value}${tag}`;
}

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

interface Plan {
  dimension: "query" | "page";
  file: string;
  header: string;
  rows: GscExportRow[];
}

async function main() {
  if (!folderArg) {
    console.error("usage: npx tsx scripts/import-gsc-export.ts <export-folder> [--dry-run] [--replace] [--property <url>]");
    process.exit(2);
  }
  const folder = resolveFolder(folderArg);
  const source = basename(folder);

  const read = (f: string) => readFileSync(join(folder, f), "utf8");
  const { searchType, dateLabel } = existsSync(join(folder, "Filters.csv"))
    ? parseFilters(read("Filters.csv"))
    : { searchType: "web", dateLabel: null };
  const range = parseChartRange(read("Chart.csv"));

  const plans: Plan[] = [
    { dimension: "query", file: "Queries.csv", header: "Top queries", rows: [] },
    { dimension: "page", file: "Pages.csv", header: "Top pages", rows: [] },
  ];
  for (const p of plans) p.rows = parseDimensionCsv(read(p.file), p.header);

  console.log(`[gsc-import] ${source}`);
  console.log(`  property ${PROPERTY_URL}, search type ${searchType}, range ${range.start}..${range.end} (${range.days} days${dateLabel ? `, "${dateLabel}"` : ""})`);
  for (const p of plans) {
    const t = totalsOf(p.rows);
    console.log(`  ${p.file}: ${t.rows} rows, ${t.clicks} clicks, ${t.impressions} impressions`);
  }
  if (DRY_RUN) {
    console.log("  --dry-run: nothing written");
    return;
  }

  const token = readEnv("SUPABASE_ACCESS_TOKEN");
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN not found in the environment or .env");

  const [{ present }] = await sql<{ present: boolean }>(
    token,
    "select to_regclass('public.gsc_export_performance') is not null as present",
  );
  if (!present) {
    throw new Error("public.gsc_export_performance does not exist. Apply supabase/migrations/20261018000050_gsc_export_performance.sql first.");
  }

  const rangeWhere = (dimension: string) =>
    `property_url = ${literal(PROPERTY_URL)} and dimension = ${literal(dimension)} and search_type = ${literal(searchType)} ` +
    `and range_start = ${literal(range.start)} and range_end = ${literal(range.end)}`;

  for (const p of plans) {
    const [{ n: before }] = await sql<{ n: number }>(
      token,
      `select count(*)::int as n from public.gsc_export_performance where ${rangeWhere(p.dimension)}`,
    );
    if (before > 0 && !REPLACE) {
      console.log(`  ${p.dimension}: ${before} rows already loaded for this range; skipped (use --replace to update values)`);
      continue;
    }

    for (let i = 0; i < p.rows.length; i += BATCH) {
      const chunk = p.rows.slice(i, i + BATCH);
      const json = JSON.stringify(chunk);
      await sql(
        token,
        `insert into public.gsc_export_performance
           (property_url, dimension, key, range_start, range_end, search_type, clicks, impressions, ctr, position, source)
         select ${literal(PROPERTY_URL)}, ${literal(p.dimension)}, r.key, ${literal(range.start)}::date, ${literal(range.end)}::date,
                ${literal(searchType)}, r.clicks, r.impressions, r.ctr, r.position, ${literal(source)}
           from jsonb_to_recordset(${dollarQuote(json)}::jsonb)
             as r(key text, clicks integer, impressions bigint, ctr numeric, position numeric)
         on conflict (property_url, dimension, search_type, range_start, range_end, key)
         ${REPLACE
           ? "do update set clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position, source = excluded.source, imported_at = now()"
           : "do nothing"}`,
      );
    }

    const [after] = await sql<{ n: number; clicks: number; impressions: number }>(
      token,
      `select count(*)::int as n, coalesce(sum(clicks),0)::int as clicks, coalesce(sum(impressions),0)::bigint as impressions
         from public.gsc_export_performance where ${rangeWhere(p.dimension)}`,
    );
    console.log(`  ${p.dimension}: ${before} -> ${after.n} rows in the database (${after.clicks} clicks, ${after.impressions} impressions)`);
    if (after.n !== p.rows.length) {
      throw new Error(`${p.dimension}: expected ${p.rows.length} rows for this range, found ${after.n}`);
    }
  }
}

main().catch((err) => {
  console.error(`[gsc-import] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
