/**
 * SEO-030: rewrite restaurants.seo_title and, where it fails the check,
 * restaurants.seo_description, from facts on the row.
 *
 *   npx tsx scripts/backfill-restaurant-seo.ts            # dry run: counts and samples
 *   npx tsx scripts/backfill-restaurant-seo.ts --apply    # back up, then write
 *
 * Re-runnable: it writes only rows whose value would change, so a second run
 * after a clean first one updates nothing.
 *
 * seo_title becomes restaurantTemplateTitle: "{Name} {Suburb}: Menu, Hours,
 * Photos & Reviews", each facet only when the row backs it (menu URL or a
 * captured menu; hours_json; image_url), cut to 60 characters before
 * SEOHead's " | Des Moines Insider". seo_description is kept when
 * restaurantSeoDescriptionProblems passes it (names the suburb and the
 * cuisine, under 155, not stale pre-opening copy) and otherwise becomes
 * restaurantTemplateDescription, which says only what the row says.
 *
 * Before any write, --apply exports id, slug, seo_title and seo_description
 * of EVERY restaurant to scripts/backups/restaurants-seo-<date>.json. An
 * existing backup for the day is never overwritten: the first one is the one
 * that holds the values from before the change. Restore with --restore <file>.
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  restaurantTemplateTitle,
  restaurantTemplateDescription,
  restaurantSeoDescriptionProblems,
} from "../src/lib/restaurantMeta.ts";
import { fetchRestaurantSeoRows, metaInputOf, psql, type RestaurantSeoRow } from "./lib/restaurantSeoRows.ts";

interface Change {
  id: string;
  slug: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const restoreIdx = args.indexOf("--restore");

/** One UPDATE for every change, the payload dollar-quoted so no value needs escaping. */
function writeChanges(changes: Change[]): number {
  if (changes.length === 0) return 0;
  const payload = JSON.stringify(changes);
  let tag = "seo030";
  while (payload.includes(`$${tag}$`)) tag += "x";
  const out = psql(`
    with x as (
      select * from json_to_recordset($${tag}$${payload}$${tag}$::json)
        as x(id uuid, seo_title text, seo_description text)
    ), u as (
      update restaurants r
         set seo_title = x.seo_title, seo_description = x.seo_description
        from x
       where r.id = x.id
         and (r.seo_title is distinct from x.seo_title or r.seo_description is distinct from x.seo_description)
      returning r.id
    )
    select count(*) from u;
  `);
  return Number(out.trim());
}

function backup(rows: RestaurantSeoRow[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const file = resolve(process.cwd(), `scripts/backups/restaurants-seo-${day}.json`);
  mkdirSync(dirname(file), { recursive: true });
  const data = rows.map((r) => ({ id: r.id, slug: r.slug, seo_title: r.seo_title, seo_description: r.seo_description }));
  // "wx" creates the file or fails if it exists, in one call, so an existing
  // backup (the pre-change state) can never be overwritten by a later run.
  try {
    writeFileSync(file, `${JSON.stringify({ exportedAt: new Date().toISOString(), table: "restaurants", rows: data }, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    console.log(`backup exists, kept as is: ${file}`);
    return file;
  }
  console.log(`backed up ${data.length} rows to ${file}`);
  return file;
}

function main() {
  if (restoreIdx !== -1) {
    const file = args[restoreIdx + 1];
    if (!file) throw new Error("--restore needs a backup file");
    const { rows } = JSON.parse(readFileSync(file, "utf8")) as { rows: Change[] };
    console.log(`restored ${writeChanges(rows)} of ${rows.length} rows from ${file}`);
    return;
  }

  const rows = fetchRestaurantSeoRows();
  const changes: Change[] = [];
  let titles = 0;
  let descriptions = 0;
  for (const row of rows) {
    const input = metaInputOf(row);
    const title = restaurantTemplateTitle(input);
    const keepDescription = restaurantSeoDescriptionProblems(row.seo_description, input).length === 0;
    const description = keepDescription ? row.seo_description : restaurantTemplateDescription(input);
    const titleChanged = title !== row.seo_title;
    const descriptionChanged = description !== row.seo_description;
    if (!titleChanged && !descriptionChanged) continue;
    if (titleChanged) titles++;
    if (descriptionChanged) descriptions++;
    changes.push({ id: row.id, slug: row.slug, seo_title: title, seo_description: description });
  }

  console.log(`${rows.length} restaurants; ${changes.length} to change (${titles} titles, ${descriptions} descriptions)`);
  for (const c of changes.slice(0, 8)) {
    const before = rows.find((r) => r.id === c.id);
    console.log(`  ${c.slug}\n    title: ${before?.seo_title} -> ${c.seo_title}\n    desc:  ${c.seo_description}`);
  }

  if (!apply) {
    console.log("dry run; pass --apply to back up and write");
    return;
  }
  backup(rows);
  console.log(`updated ${writeChanges(changes)} rows`);
}

main();
