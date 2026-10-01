/**
 * SEO-030 guard: list restaurants whose stored seo_title or seo_description
 * would be refused by the detail page, and say why.
 *
 *   npx tsx scripts/check-restaurant-seo-titles.ts          # report, exit 1 on any finding
 *   npx tsx scripts/check-restaurant-seo-titles.ts --warn   # report, exit 0
 *
 * The page already falls back to the template for any row listed here
 * (restaurantPageTitle / restaurantMetaDescription), so a finding is not a bad
 * <title> in production. It is a row whose own copy is being ignored - usually
 * one generate-seo-content filled after the SEO-030 backfill, which writes
 * AI titles that name neither the suburb nor "menu". Fix with
 * scripts/backfill-restaurant-seo.ts --apply.
 *
 * Needs SUPABASE_DB_URL (or a .env carrying it), so it is not part of
 * `npm run validate`.
 */
import {
  restaurantSeoTitleProblems,
  restaurantSeoDescriptionProblems,
  restaurantTemplateTitle,
  restaurantTemplateDescription,
} from "../src/lib/restaurantMeta.ts";
import { fetchRestaurantSeoRows, metaInputOf } from "./lib/restaurantSeoRows.ts";

const warnOnly = process.argv.includes("--warn");
const rows = fetchRestaurantSeoRows().filter((r) => !r.is_merged);
const findings: string[] = [];
for (const row of rows) {
  const input = metaInputOf(row);
  // The template is the fallback; a row already holding it has nothing to fix,
  // even where a long name left no room for the suburb.
  const t = row.seo_title === restaurantTemplateTitle(input) ? [] : restaurantSeoTitleProblems(row.seo_title, input);
  const d =
    row.seo_description === restaurantTemplateDescription(input)
      ? []
      : restaurantSeoDescriptionProblems(row.seo_description, input);
  if (t.length) findings.push(`${row.slug}  title [${t.join(", ")}]  ${JSON.stringify(row.seo_title)}`);
  if (d.length) findings.push(`${row.slug}  description [${d.join(", ")}]`);
}
console.log(`${rows.length} restaurants checked, ${findings.length} finding(s)`);
for (const f of findings) console.log(`  ${f}`);
process.exit(findings.length && !warnOnly ? 1 : 0);
