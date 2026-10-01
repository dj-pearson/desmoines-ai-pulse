/**
 * Shared by scripts/backfill-restaurant-seo.ts and
 * scripts/check-restaurant-seo-titles.ts (SEO-030): read every restaurant row
 * through psql, and turn a row into the same RestaurantMetaInput the detail
 * page builds.
 *
 * psql rather than a Node driver because the repo carries no pg dependency.
 * The connection URL is split into PG* environment variables so it never
 * appears in argv, in an error message or in a log line.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { RestaurantMetaInput } from "../../src/lib/restaurantMeta.ts";

export interface RestaurantSeoRow {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  location: string | null;
  cuisine: string | null;
  price_range: string | null;
  phone: string | null;
  menu_url: string | null;
  image_url: string | null;
  hours_json: unknown;
  opening: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  is_merged: boolean | null;
  seo_title: string | null;
  seo_description: string | null;
  has_captured_menu: boolean;
}

function dbUrl(): string {
  const fromEnv = process.env.SUPABASE_DB_URL;
  if (fromEnv) return fromEnv;
  // A worktree has no .env of its own; the main checkout's sits three levels up.
  for (const p of [".env", "../../../.env"]) {
    const file = resolve(process.cwd(), p);
    if (!existsSync(file)) continue;
    const m = readFileSync(file, "utf8").match(/^SUPABASE_DB_URL=(.*)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("SUPABASE_DB_URL is not set and no .env carries it.");
}

function pgEnv(): NodeJS.ProcessEnv {
  const u = new URL(dbUrl());
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.slice(1) || "postgres",
    PGSSLMODE: process.env.PGSSLMODE || "require",
    PGCONNECT_TIMEOUT: "20",
  };
}

/** Run SQL from stdin with ON_ERROR_STOP, returning unaligned tuples-only stdout. */
export function psql(sql: string): string {
  const r = spawnSync("psql", ["-At", "-w", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 1 << 28,
    timeout: 120_000,
    env: pgEnv(),
  });
  if (r.error) throw new Error(`psql did not run: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`psql exited ${r.status}: ${(r.stderr || "").trim()}`);
  return r.stdout;
}

export function fetchRestaurantSeoRows(): RestaurantSeoRow[] {
  const out = psql(`
    select coalesce(json_agg(row_to_json(t) order by t.slug), '[]'::json) from (
      select r.id, r.slug, r.name, r.city, r.location, r.cuisine, r.price_range, r.phone,
             r.menu_url, r.image_url, r.hours_json, r.opening::text as opening,
             r.latitude, r.longitude, r.status, r.is_merged, r.seo_title, r.seo_description,
             exists (
               select 1 from restaurant_menus m
               join restaurant_menu_items i on i.menu_id = m.id
               where m.restaurant_id = r.id and m.is_current
             ) as has_captured_menu
      from restaurants r
    ) t;
  `);
  return JSON.parse(out.trim()) as RestaurantSeoRow[];
}

/** A link the page would render: http(s) only, as safeWebUrl allows. */
function webUrl(v: string | null): boolean {
  return /^https?:\/\/\S+$/i.test((v ?? "").trim());
}

/**
 * The flags RestaurantDetails.tsx passes, from the row alone. `opening` is a
 * date column in production, not hours text, so only hours_json counts.
 */
export function metaInputOf(row: RestaurantSeoRow): RestaurantMetaInput {
  const closed = row.status === "closed";
  return {
    ...row,
    opening: null,
    hasMenu: row.has_captured_menu || webUrl(row.menu_url),
    hasHours: !closed && row.hours_json != null && typeof row.hours_json === "object",
    hasPhone: !closed && !!(row.phone ?? "").trim(),
    hasPhotos: webUrl(row.image_url),
  };
}
