#!/usr/bin/env node
/**
 * No policy lets "any signed-in account" update or delete rows
 * (WEB-SEC-077).
 *
 *   node scripts/__tests__/authenticated-write-policies.test.mjs
 *
 * cron_logs carried "Admin access for cron_logs" FOR ALL USING
 * (auth.role() = 'authenticated' OR auth.role() = 'service_role') under a
 * comment saying "admin access only". auth.role() is 'authenticated' for every
 * account, so anyone who signed up could read the job errors, forge the rows
 * the admin health panels trust, and delete the real ones. Migration
 * 20261115000137 drops it. Reproduced on local Postgres 16 with Supabase-style
 * auth stubs: before, a non-admin read 1 row with its error_details, inserted
 * a forged "Bulk AI enhancement completed" row and deleted 1 row; after, 0
 * rows, the insert fails RLS, 0 deleted, while the admin still reads 1, the
 * service role still inserts and a SECURITY DEFINER logger still inserts.
 * This file executes no SQL.
 *
 * check-identity-reads looks at public READS of person-linked tables and
 * audit-rls.ts is not in CI, so nothing else catches the shape: a write or
 * read-write policy whose only condition is "has a session". A sweep on
 * 2026-11-15 found cron_logs and nothing else, so the allowed list is empty.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { computeExposure } from '../check-identity-read-policies.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

const ROLE = String.raw`auth\.role\(\)\s*=\s*'(authenticated|service_role)'(::text)?`;
const ANY_SESSION = [
  // auth.role() = 'authenticated' [OR auth.role() = 'service_role'], either order
  new RegExp(String.raw`^\(?\s*${ROLE}\s*\)?(\s+OR\s+\(?\s*${ROLE}\s*\)?)?$`, 'i'),
  /^\(?\s*auth\.uid\(\)\s+IS\s+NOT\s+NULL\s*\)?$/i,
];

/**
 * Policies that let any signed-in account UPDATE or DELETE (ALL included)
 * whatever rows exist. A service_role-only predicate is not one: the second
 * alternative must still include 'authenticated'.
 */
export function anySessionWrites(current) {
  const out = [];
  for (const p of current.values()) {
    if (!['ALL', 'UPDATE', 'DELETE'].includes(p.command)) continue;
    const using = (p.using ?? '').trim();
    const bySession = ANY_SESSION.some((re) => re.test(using)) && /'authenticated'|auth\.uid\(\)/i.test(using);
    const toAuthTrue = /\bauthenticated\b/i.test(p.roles) && /^true$/i.test(using);
    if (bySession || toAuthTrue) out.push(`${p.table}  "${p.name}"  ${p.command}  (${p.file})`);
  }
  return out;
}

const DIR = 'supabase/migrations';
const migrations = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((file) => ({ file, sql: readFileSync(join(DIR, file), 'utf8') }));
const { current } = computeExposure(migrations, new Set(), new Map());

check('parsed the migration policies', current.size > 100, `${current.size}`);

const found = anySessionWrites(current);
check('no policy lets any signed-in account update or delete rows', found.length === 0, found.join('; '));

const cron = [...current.values()].filter((p) => p.table === 'cron_logs');
check('cron_logs: "Admin access for cron_logs" is gone',
  !cron.some((p) => p.name === 'Admin access for cron_logs'));
check('cron_logs: the only policy is the admin read',
  cron.length === 1 && cron[0].command === 'SELECT' && /is_admin_or_root\(\)/.test(cron[0].using ?? ''),
  cron.map((p) => `${p.name}/${p.command}/${p.using}`).join('; '));
check('cron_logs: the admin read is TO authenticated', cron.length === 1 && /^authenticated$/i.test(cron[0].roles));

// Negative controls: the sweep must see the original shape and its variants.
const synth = (...sqls) =>
  anySessionWrites(
    computeExposure(sqls.map((sql, i) => ({ file: `${i}.sql`, sql })), new Set(), new Map()).current,
  );
check('control: the original cron_logs policy is flagged',
  synth(`CREATE POLICY "Admin access for cron_logs" ON public.cron_logs
FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');`).length === 1);
check('control: auth.uid() IS NOT NULL on UPDATE is flagged',
  synth(`CREATE POLICY p ON public.t FOR UPDATE USING (auth.uid() IS NOT NULL);`).length === 1);
check('control: TO authenticated USING (true) on DELETE is flagged',
  synth(`CREATE POLICY p ON public.t FOR DELETE TO authenticated USING (true);`).length === 1);
check('control: dropped by a later migration is not flagged',
  synth(`CREATE POLICY p ON public.t FOR ALL USING (auth.role() = 'authenticated');`,
    `DROP POLICY IF EXISTS p ON public.t;`).length === 0);
check('control: an admin predicate is not flagged',
  synth(`CREATE POLICY p ON public.t FOR ALL TO authenticated USING (public.is_admin_or_root());`).length === 0);
check('control: an owner predicate is not flagged',
  synth(`CREATE POLICY p ON public.t FOR UPDATE USING (auth.uid() = user_id);`).length === 0);
check('control: a service_role-only predicate is not flagged',
  synth(`CREATE POLICY p ON public.t FOR ALL USING (auth.role() = 'service_role');`).length === 0);
check('control: SELECT for any session is out of scope',
  synth(`CREATE POLICY p ON public.t FOR SELECT USING (auth.role() = 'authenticated');`).length === 0);

if (failures) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nauthenticated-write-policies: all checks passed.');
