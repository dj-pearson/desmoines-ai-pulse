// Turn a staged agent batch (scripts/content-fill/<batch>.json, { rows: [...] })
// into one SQL transaction, plus a review list of what it deliberately does NOT apply.
//
//   node scripts/content-fill/apply.mjs <batch>             -> writes <batch>.sql and <batch>.review.md
//   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/content-fill/<batch>.sql
//
// Applied: a new current menu version for every row with menu_outcome=extracted and
// at least 3 items (the trigger unmarks any older version), and website/menu_url only
// for rows the agent verified as open,
// where the column is currently empty. Never applied: closures, FLAG rows, verdict
// unknown. Those go to the review list, because a wrong "closed" hides a live business.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const batch = process.argv[2];
if (!batch) { console.error('usage: apply.mjs <batch>'); process.exit(1); }
const { rows } = JSON.parse(readFileSync(join(here, `${batch}.json`), 'utf8'));

const q = (v) => (v === null || v === undefined || v === '') ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const arr = (a) => `ARRAY[${(a || []).map(q).join(',')}]::text[]`;
const priceNum = (p) => {
  const m = String(p || '').match(/\$?\s*(\d{1,4}(?:\.\d{1,2})?)/);
  return m ? m[1] : 'NULL';
};
const isUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

const sql = ['BEGIN;', `-- batch ${batch}`];
const review = [`# Review: ${batch}`, ''];
let menus = 0, items = 0, sites = 0;

for (const r of rows) {
  const flagged = /^FLAG:/i.test(r.notes || '');
  if (flagged || r.verdict !== 'open') {
    review.push(`- **${r.name}** (${r.id}): verdict ${r.verdict}${flagged ? ', FLAG' : ''}. ${r.verdict_evidence} ${r.notes || ''} ${r.evidence_urls.join(' ')}`.trim());
  }
  else if (/address|moved|formerly|renamed|official name|differs/i.test(r.notes || '')) {
    review.push(`- **${r.name}** (${r.id}): record correction suggested, not applied. ${r.notes}`);
  }
  if (r.menu_outcome === 'extracted' && /doordash|postmates|ubereats|grubhub|beyondmenu|restaurantguru/i.test(r.menu_source_url || '')) {
    review.push(`- **${r.name}**: menu from third party (${new URL(r.menu_source_url).hostname}); prices may be delivery-marked-up. Applied.`);
  }
  if (flagged || r.verdict !== 'open') continue;

  if (isUrl(r.website)) {
    sql.push(`UPDATE restaurants SET website=${q(r.website)} WHERE id=${q(r.id)} AND coalesce(website,'')='';`);
    sites++;
  }
  if (isUrl(r.menu_url)) {
    sql.push(`UPDATE restaurants SET menu_url=${q(r.menu_url)} WHERE id=${q(r.id)} AND coalesce(menu_url,'')='';`);
  }
  if (r.menu_outcome !== 'extracted' || r.menu_items.length < 3) continue;
  if (!isUrl(r.menu_source_url)) { review.push(`- **${r.name}**: extracted menu has no source URL, not applied`); continue; }

  const st = r.menu_source_type === 'none' ? 'scraped' : r.menu_source_type;
  sql.push(`WITH m AS (INSERT INTO restaurant_menus (restaurant_id, version, is_current, source_type, source_url, notes)
  VALUES (${q(r.id)}, 1, true, ${q(st)}, ${q(r.menu_source_url)}, ${q(`agent-fill ${batch}; ${r.notes || ''}`.slice(0, 500))}) RETURNING id)
INSERT INTO restaurant_menu_items (menu_id, section_name, section_sort_order, item_name, item_description, price, price_numeric, dietary_tags, sort_order) VALUES`);
  const sections = [...new Set(r.menu_items.map((i) => i.section_name || 'Main Menu'))];
  const vals = r.menu_items.map((i, n) =>
    `((SELECT id FROM m), ${q(i.section_name || 'Main Menu')}, ${sections.indexOf(i.section_name || 'Main Menu')}, ${q(i.item_name)}, ${q(i.item_description)}, ${q(i.price)}, ${priceNum(i.price)}, ${arr(i.dietary_tags)}, ${n})`);
  sql.push(vals.join(',\n') + ';');
  menus++; items += r.menu_items.length;
}
sql.push('COMMIT;');
writeFileSync(join(here, `${batch}.sql`), sql.join('\n') + '\n');
writeFileSync(join(here, `${batch}.review.md`), review.join('\n') + '\n');
console.log(`${batch}: ${rows.length} rows -> ${menus} menus (${items} items), ${sites} website fills, ${review.length - 2} for review`);
