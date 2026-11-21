/**
 * WEB-BE-072: recompute restaurant_menu_items.dietary_tags under the
 * "marked on the dish" rule (supabase/functions/_shared/menu/menuNormalize.ts).
 *
 *   npx tsx scripts/recompute-menu-dietary-tags.ts           # dry run: before/after counts
 *   npx tsx scripts/recompute-menu-dietary-tags.ts --apply   # write the changed rows
 *
 * Needs SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in
 * the environment or in .env. The key is read, never printed. Reads every
 * menu item (the anon role would see only current menus under RLS, and the
 * write needs the service role anyway).
 *
 * --apply first writes every changed row's id and old tags to
 * scripts/content-backups/web-be-072/<timestamp>.json, then updates one tag
 * set at a time in chunks of 200 ids. Re-runnable: a second run finds
 * nothing to change. See scripts/lib/menuDietaryRecompute.ts for why this is
 * not a SQL migration and why JSON-LD menus are recomputed too.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { planRecompute, type StoredMenuItem, type TagCounts } from "./lib/menuDietaryRecompute.ts";

const PAGE = 1000;
const CHUNK = 200;
const apply = process.argv.slice(2).includes("--apply");

function envValue(...names: string[]): string {
  for (const name of names) {
    if (process.env[name]) return process.env[name] as string;
  }
  const file = resolve(process.cwd(), ".env");
  if (existsSync(file)) {
    const text = readFileSync(file, "utf8");
    for (const name of names) {
      const m = text.match(new RegExp(`^${name}=(.*)$`, "m"));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`${names.join(" or ")} is not set and .env does not carry it.`);
}

interface ItemRow {
  id: string;
  item_name: string;
  item_description: string | null;
  dietary_tags: string[] | null;
  restaurant_menus: { extraction_method: string | null } | null;
}

function formatCounts(label: string, c: TagCounts): string {
  const tags = Object.entries(c.by_tag)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, n]) => `${t}=${n}`)
    .join(", ");
  return `${label}: ${c.tagged_rows} tagged rows${tags ? ` (${tags})` : ""}`;
}

async function main(): Promise<void> {
  const supabase = createClient(
    envValue("SUPABASE_URL", "VITE_SUPABASE_URL"),
    envValue("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const items: StoredMenuItem[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("restaurant_menu_items")
      .select("id, item_name, item_description, dietary_tags, restaurant_menus(extraction_method)")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read failed at row ${from}: ${error.message}`);
    const rows = (data ?? []) as unknown as ItemRow[];
    for (const r of rows) {
      items.push({
        id: r.id,
        item_name: r.item_name,
        item_description: r.item_description,
        dietary_tags: r.dietary_tags,
        extraction_method: r.restaurant_menus?.extraction_method ?? null,
      });
    }
    if (rows.length < PAGE) break;
  }

  const plan = planRecompute(items);
  console.log(`menu items read: ${plan.rows}`);
  console.log(formatCounts("before", plan.before));
  console.log(formatCounts("after ", plan.after));
  console.log(`rows that change: ${plan.changed}`);
  for (const [method, n] of Object.entries(plan.changed_by_method)) {
    console.log(`  extraction_method ${method}: ${n}`);
  }

  if (!apply) {
    console.log("dry run: nothing written. Re-run with --apply to write.");
    return;
  }
  if (plan.changed === 0) {
    console.log("nothing to write.");
    return;
  }

  const byId = new Map(items.map((i) => [i.id, i.dietary_tags ?? []]));
  const backupDir = resolve(process.cwd(), "scripts/content-backups/web-be-072");
  mkdirSync(backupDir, { recursive: true });
  const backupFile = resolve(backupDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const backup = [...plan.updates.values()].flat().map((id) => ({ id, dietary_tags: byId.get(id) }));
  writeFileSync(backupFile, JSON.stringify(backup, null, 1));
  console.log(`backup of ${backup.length} rows: ${backupFile}`);

  let written = 0;
  for (const [key, ids] of plan.updates) {
    const tags = JSON.parse(key) as string[];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const { error } = await supabase.from("restaurant_menu_items").update({ dietary_tags: tags }).in("id", chunk);
      if (error) throw new Error(`update failed after ${written} rows: ${error.message}`);
      written += chunk.length;
    }
  }
  console.log(`updated ${written} of ${plan.changed} rows.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
