#!/usr/bin/env node
/**
 * restaurant_lockable_fields() is redefined by several migrations (WEB-BE-069,
 * WEB-BE-070, WEB-FEAT-103, WEB-ADS-048). Each was written on a different base,
 * and a later CREATE OR REPLACE that leaves out a field an earlier one added
 * silently unlocks it: enrichment then overwrites what a person set. This
 * fails when any definition, in migration order, drops a field.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'supabase/migrations';
const defs = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(dir, f), 'utf8');
  const m = sql.match(/FUNCTION public\.restaurant_lockable_fields\(\)[\s\S]*?SELECT ARRAY\[([\s\S]*?)\]::text\[\]/);
  if (m) defs.push({ f, fields: [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) });
}

let failed = 0;
if (defs.length < 2) {
  console.log(`FAIL expected several definitions, found ${defs.length}`);
  failed++;
}
const seen = new Set();
for (const { f, fields } of defs) {
  const missing = [...seen].filter((x) => !fields.includes(x));
  if (missing.length) {
    console.log(`FAIL ${f} drops ${missing.join(', ')}`);
    failed++;
  } else {
    console.log(`ok   ${f} (${fields.length} fields)`);
  }
  fields.forEach((x) => seen.add(x));
}
if (failed) process.exit(1);
