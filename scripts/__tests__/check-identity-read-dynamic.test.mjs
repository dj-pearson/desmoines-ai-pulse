#!/usr/bin/env node
/**
 * check-identity-read-policies.mjs reading policies changed through dynamic
 * SQL (WEB-SEC-054).
 *
 *   node --test scripts/__tests__/check-identity-read-dynamic.test.mjs
 *
 * The real migrations are read from disk, so the test fails if either dynamic
 * idiom in the tree changes shape under the parser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandDynamicPolicies, computeExposure } from '../check-identity-read-policies.mjs';

const read = (f) => ({ file: f, sql: readFileSync(`supabase/migrations/${f}`, 'utf8') });
const STRIPE = read('20251225000000_stripe_payment_enhancements.sql');
const RLS_FIXES = read('20260612000001_rls_audit_fixes.sql');
const CRM = read('20260709000052_crm_pipeline.sql');
const IDENTITY = new Set(['user_subscriptions', 'crm_leads']);

test('the 20251225 grant alone leaves user_subscriptions readable by anyone (control)', () => {
  const { exposed, detail } = computeExposure([STRIPE], IDENTITY);
  assert.ok(exposed.has('user_subscriptions'), detail.join('\n'));
});

test('20260612000001 rescoping it to service_role inside a DO block is read', () => {
  const { exposed, current, unreadable } = computeExposure([STRIPE, RLS_FIXES], IDENTITY);
  assert.deepEqual(unreadable, []);
  assert.equal(exposed.has('user_subscriptions'), false);
  const p = current.get('user_subscriptions|Service role can manage all subscriptions');
  assert.equal(p.roles, 'service_role');
  assert.equal(p.file, RLS_FIXES.file);
});

test('all eight rescoped policies expand, one DROP and one CREATE each', () => {
  const { sql, unreadable } = expandDynamicPolicies(RLS_FIXES.sql);
  assert.deepEqual(unreadable, []);
  assert.equal(sql.match(/DROP POLICY IF EXISTS/g).length, 8);
  assert.equal(sql.match(/TO service_role USING \(true\)/g).length, 8);
  assert.ok(sql.includes('DROP POLICY IF EXISTS "Service role can manage all subscriptions" ON public."user_subscriptions"'));
  assert.ok(sql.includes('ON public."pseo_generation_log"'));
});

test('NEGATIVE CONTROL: a later public USING(true) on user_subscriptions still fails', () => {
  const leak = {
    file: '20991231000000_leak.sql',
    sql: 'CREATE POLICY "Anyone reads subscriptions" ON public.user_subscriptions FOR SELECT USING (true);',
  };
  const { exposed, detail } = computeExposure([STRIPE, RLS_FIXES, leak], IDENTITY);
  assert.ok(exposed.has('user_subscriptions'));
  assert.ok(detail.some((d) => d.includes('Anyone reads subscriptions')));
});

test('NEGATIVE CONTROL: the same loop going the other way (TO public) is caught', () => {
  const widened = {
    file: '20991231000001_widen.sql',
    sql: RLS_FIXES.sql.replace('FOR ALL TO service_role USING', 'FOR ALL TO public USING'),
  };
  assert.notEqual(widened.sql, RLS_FIXES.sql, 'fixture did not apply');
  const { exposed } = computeExposure([STRIPE, widened], IDENTITY);
  assert.ok(exposed.has('user_subscriptions'));
});

test('the crm_pipeline loop (positional %1$s, dollar-quoted template) expands per table', () => {
  const { sql, unreadable } = expandDynamicPolicies(CRM.sql);
  assert.deepEqual(unreadable, []);
  for (const t of ['crm_accounts', 'crm_leads', 'crm_opportunities']) {
    assert.ok(sql.includes(`CREATE POLICY "${t}_sales_read" ON public.${t} FOR SELECT TO authenticated`), t);
    assert.ok(sql.includes(`CREATE POLICY "${t}_sales_write" ON public.${t} FOR ALL TO authenticated`), t);
  }
  const { current, exposed } = computeExposure([CRM], IDENTITY);
  assert.equal(current.get('crm_leads|crm_leads_sales_read').roles, 'authenticated');
  assert.equal(exposed.has('crm_leads'), false);
});

test('a dynamic policy statement outside the idiom is reported, never guessed', () => {
  const opaque = `DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('CREATE POLICY "open" ON public.%I FOR SELECT USING (true)', r.tablename);
  END LOOP;
END $$;`;
  const { sql, unreadable } = expandDynamicPolicies(opaque);
  assert.equal(sql, '');
  assert.equal(unreadable.length, 1);
  assert.match(unreadable[0], /CREATE POLICY "open"/);

  const viaVariable = `DO $$ DECLARE stmt text := 'CREATE POLICY x ON t USING (true)';
BEGIN EXECUTE format(stmt); END $$;`;
  assert.equal(expandDynamicPolicies(viaVariable).unreadable.length, 1);
});

test('dynamic SQL that does not touch a policy is ignored', () => {
  const triggers = `DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['a', 'b'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s ON public.%1$s', t);
  END LOOP;
END $$;`;
  assert.deepEqual(expandDynamicPolicies(triggers), { sql: '', unreadable: [] });
});
