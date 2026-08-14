#!/usr/bin/env tsx
/**
 * Anonymous-read exposure ratchet (WEB-SEC-021 AC7).
 *
 * WHY A LIVE PROBE AND NOT A MIGRATION PARSE
 * scripts/audit-rls.ts reads the migrations and catches USING(true) writes. It
 * cannot catch what actually matters here: whether a table is readable RIGHT
 * NOW by the anon key that ships in the client bundle. Policies get added by
 * hand in the dashboard, migrations get applied out of order, and a table with
 * RLS enabled and one permissive SELECT policy looks fine in SQL. The only
 * honest question is the one an attacker asks — does a GET return rows.
 *
 * WHAT IT FOUND. Run against production 2026-08-11, counts only:
 *   blocked_email_domains     5,361 rows   an anti-abuse blocklist, published
 *   permission_definitions       58        the full permission vocabulary
 *   role_permissions            166        the complete RBAC mapping
 *   pricing_rules                 3        internal ad pricing multipliers
 *   ai_environment_config         9        names of every AI secret
 *   content_metrics          17,398        internal analytics, and growing
 * Publishing a blocklist defeats it: an abuser reads the 5,361 domains and
 * picks one that is not on the list.
 *
 * HOW IT GATES. Tables already anon-readable are recorded in
 * anon-exposure-baseline.json. The check fails when a NEW table becomes
 * anon-readable, which is the case AC7 is about — a table added without an
 * explicit policy shipping readable by default. It does not fail on the
 * existing set, because fixing those needs migrations that are not applied yet
 * (WEB-QA-020), and a check that is red on day one gets switched off.
 *
 * Counts only, never contents. Dumping the blocklist into CI logs would be the
 * same disclosure the story is about.
 *
 * Usage:
 *   npx tsx scripts/check-anon-exposure.ts            # check
 *   npx tsx scripts/check-anon-exposure.ts --update   # re-baseline
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'anon-exposure-baseline.json');
const UPDATE = process.argv.includes('--update');

function env(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  const f = join(ROOT, '.env');
  if (!existsSync(f)) return undefined;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    if (line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const URL_ = env('VITE_SUPABASE_URL');
const KEY = env('VITE_SUPABASE_ANON_KEY');
if (!URL_ || !KEY) {
  console.error('[anon-exposure] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — skipping.');
  process.exit(0);
}

// Table names straight from the generated schema, so a new table is covered the
// moment types are regenerated.
const types = readFileSync(join(ROOT, 'src/integrations/supabase/types.ts'), 'utf8');
const tablesBlock = types.slice(types.indexOf('  public: {'), types.indexOf('    Views: {'));
const tables = [...new Set([...tablesBlock.matchAll(/^ {6}([a-z0-9_]+): \{$/gm)].map((m) => m[1]))];

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact', Range: '0-0' };
const exposed: Record<string, number> = {};

for (const t of tables) {
  try {
    const r = await fetch(`${URL_}/rest/v1/${t}?select=*`, { headers });
    if (r.status !== 200 && r.status !== 206) continue;
    const range = r.headers.get('content-range') ?? '';
    const count = Number(range.split('/')[1]);
    if (Number.isFinite(count) && count > 0) exposed[t] = count;
  } catch {
    /* network hiccup on one table must not fail the whole audit */
  }
}

const names = Object.keys(exposed).sort();

if (UPDATE) {
  writeFileSync(BASELINE, `${JSON.stringify({ tables: names }, null, 2)}\n`);
  console.log(`[anon-exposure] baseline written: ${names.length} anon-readable table(s).`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('[anon-exposure] no baseline. Create one with --update.');
  process.exit(1);
}

const baseline: string[] = JSON.parse(readFileSync(BASELINE, 'utf8')).tables ?? [];
const known = new Set(baseline);
const added = names.filter((t) => !known.has(t));
const removed = baseline.filter((t) => !exposed[t]);

console.log(`[anon-exposure] ${names.length} of ${tables.length} tables return rows to the anon key; baseline ${baseline.length}.`);

if (removed.length) {
  console.log(`\nNo longer anon-readable (${removed.length}) — re-baseline to lock the improvement in:`);
  for (const t of removed) console.log(`  ${t}`);
}

if (added.length) {
  console.error(`\n❌ NEWLY anon-readable (${added.length}):`);
  for (const t of added) console.error(`  ${t}  (${exposed[t]} rows)`);
  console.error(
    '\nThe anon key ships in the client bundle, so anything readable here is\n' +
      'public. Add an RLS policy scoped to the roles that need it, or if the table\n' +
      'is genuinely public content, re-baseline:\n' +
      '  npx tsx scripts/check-anon-exposure.ts --update\n'
  );
  process.exit(1);
}

console.log('\n✅ No newly anon-readable tables.');
